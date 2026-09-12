-- =============================================================================
-- LIKEMM — tests de securite et de comportement
-- =============================================================================
-- A executer sur la base de test locale, APRES 00_local_stubs.sql et les
-- migrations. Chaque test leve une exception en cas d'echec : avec
-- ON_ERROR_STOP=1, le script s'arrete au premier probleme.
--
-- Ce que ces tests verifient concretement :
--   * la base vide se comporte proprement (aucune donnee inventee) ;
--   * un utilisateur ne peut pas lire ni modifier les donnees d'un autre ;
--   * un utilisateur ne peut pas se donner un role, changer son statut,
--     ni ecrire directement dans `likes` ;
--   * le like, l'unlike, l'unicite, les compteurs et les notifications sont
--     reels et coherents ;
--   * le classement et « il te manque N likes » sortent les bons chiffres ;
--   * un profil prive n'est accessible qu'avec un token valide ;
--   * un blocage empeche reellement l'interaction ;
--   * l'age minimum, les usernames reserves et les quotas sont appliques ;
--   * la moderation est refusee aux non-moderateurs et journalisee ;
--   * la suppression de compte supprime vraiment, et recalcule les classements.
-- =============================================================================

grant execute on function public.test_login(uuid) to anon, authenticated;
grant execute on function public.test_logout()   to anon, authenticated;
grant execute on function public.test_admin()    to anon, authenticated;

create or replace function public.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ECHEC : %', p_label;
  end if;
  raise notice 'ok   %', p_label;
end $$;
grant execute on function public.assert(boolean, text) to anon, authenticated;

create or replace function public.assert_raises(p_sql text, p_hint text, p_label text)
returns void language plpgsql as $$
declare v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if p_hint is null or v_hint = p_hint or position(p_hint in coalesce(v_hint, '')) > 0 then
      raise notice 'ok   % (refuse : %)', p_label, coalesce(nullif(v_hint, ''), sqlstate);
      return;
    end if;
    raise exception 'ECHEC : % — refuse mais pour une autre raison (attendu %, obtenu %)',
      p_label, p_hint, coalesce(nullif(v_hint, ''), sqlstate);
  end;
  raise exception 'ECHEC : % — l''operation a REUSSI alors qu''elle devait etre refusee', p_label;
end $$;
grant execute on function public.assert_raises(text, text, text) to anon, authenticated;

\echo ''
\echo '### 1. BASE VIDE (§56 : aucun faux utilisateur, aucun faux classement)'
select public.assert((select count(*) from public.get_leaderboard('general', 20, 0)) = 0,
  'classement general vide sur une base vide');
select public.assert((select count(*) from public.get_leaderboard('h24', 20, 0)) = 0,
  'classement 24H vide sur une base vide');
select public.assert((select count(*) from public.search_profiles('alex', 20, 0)) = 0,
  'recherche vide sur une base vide');
select public.assert((select (public.get_public_profile('alex') ->> 'found'))::boolean = false,
  'profil inexistant : found = false, aucune donnee inventee');
select public.assert(public.get_me() is null, 'get_me() sans session renvoie null');

\echo ''
\echo '### 2. INSCRIPTION (§19 age minimum, §5 usernames)'
-- Trois comptes reels, crees comme le fait Supabase Auth : insertion dans
-- auth.users avec les metadonnees du formulaire.
insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test',
   '{"username":"alice","birth_date":"1996-04-02","policy_version":"2026-09-12","acquisition_channel":"direct"}',
   now()),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test',
   '{"username":"bob","birth_date":"1999-11-20","policy_version":"2026-09-12","acquisition_channel":"share","acquisition_ref":"alice"}',
   now()),
  ('33333333-3333-3333-3333-333333333333', 'chloe@example.test',
   '{"username":"chloe","birth_date":"2012-01-15","policy_version":"2026-09-12","acquisition_channel":"social"}',
   now());

select public.assert((select count(*) from public.profiles) = 3, 'trois profils crees par le trigger');
select public.assert((select setup_complete from public.profiles where username = 'alice'),
  'alice : compte finalise (username + age fournis)');
select public.assert((select is_private from public.profiles where username = 'chloe'),
  'chloe (14 ans) : profil PRIVE par defaut (§19 / §43)');
select public.assert((select not is_private from public.profiles where username = 'alice'),
  'alice (adulte) : profil public par defaut');
select public.assert((select age_band from public.profile_private
                       where user_id = '33333333-3333-3333-3333-333333333333') = 'minor_13_14',
  'chloe : tranche d''age 13-14 calculee');
select public.assert((select parental_consent_required from public.profile_private
                       where user_id = '33333333-3333-3333-3333-333333333333'),
  'chloe : consentement parental marque comme requis (§43)');
select public.assert(
  (select count(*) from public.consents
    where user_id = '11111111-1111-1111-1111-111111111111' and status = 'granted') = 0,
  'aucun consentement facultatif accorde par defaut (§17)');
select public.assert(
  (select count(*) from public.legal_acceptances
    where user_id = '11111111-1111-1111-1111-111111111111') = 2,
  'version des CGU et de la politique enregistree a l''acceptation (§39)');
select public.assert((select coalesce(role::text, 'user') from public.user_roles
                       where user_id = '11111111-1111-1111-1111-111111111111') = 'user',
  'role par defaut : user (aucun privilege implicite)');

-- Age minimum : refus net, pas de compte cree.
select public.assert_raises($$
  insert into auth.users (id, email, raw_user_meta_data)
  values ('44444444-4444-4444-4444-444444444444', 'trop.jeune@example.test',
          '{"username":"tropjeune","birth_date":"2018-06-01"}')
$$, 'AGE_TOO_YOUNG', 'inscription refusee en dessous de 13 ans (§19)');

-- Username reserve.
select public.assert_raises($$
  insert into auth.users (id, email, raw_user_meta_data)
  values ('55555555-5555-5555-5555-555555555555', 'admin@example.test',
          '{"username":"admin","birth_date":"1990-01-01"}')
$$, 'USERNAME_INVALID', 'username reserve refuse (§5)');

-- Unicite garantie par la BASE, pas par le JavaScript.
select public.assert_raises($$
  insert into auth.users (id, email, raw_user_meta_data)
  values ('66666666-6666-6666-6666-666666666666', 'alice2@example.test',
          '{"username":"ALICE","birth_date":"1990-01-01"}')
$$, 'USERNAME_TAKEN', 'username deja pris refuse par la contrainte UNIQUE (§5)');

select public.assert((public.check_username('alice') ->> 'available')::boolean = false,
  'check_username : alice indisponible');
select public.assert((public.check_username('nouveau_pseudo') ->> 'available')::boolean = true,
  'check_username : pseudo libre disponible');
select public.assert((public.check_username('a') ->> 'reason') is not null,
  'check_username : trop court refuse avec un motif lisible');

\echo ''
\echo '### 3. CLOISONNEMENT DES DONNEES (§44 : RLS)'
select public.test_login('22222222-2222-2222-2222-222222222222');  -- bob

select public.assert((select count(*) from public.profile_private) = 1,
  'bob ne voit QUE ses propres donnees personnelles (1 ligne sur 3)');
select public.assert((select count(*) from public.profile_private
                       where user_id = '11111111-1111-1111-1111-111111111111') = 0,
  'bob ne voit pas la date de naissance d''alice');
select public.assert((select count(*) from public.profiles where username = 'chloe') = 0,
  'bob ne voit pas le profil prive de chloe dans la table profiles');
select public.assert((select count(*) from public.profiles where username = 'alice') = 1,
  'bob voit le profil public d''alice');

-- Modification du profil d'autrui : aucune ligne affectee.
update public.profiles set bio = 'pirate' where username = 'alice';
select public.test_admin();
select public.assert((select bio is null from public.profiles where username = 'alice'),
  'bob n''a pas pu modifier la bio d''alice (§44)');

select public.test_login('22222222-2222-2222-2222-222222222222');
-- Colonnes protegees par GRANT : ni statut, ni username, ni compteur.
select public.assert_raises(
  $$update public.profiles set status = 'active' where id = auth.uid()$$,
  null, 'impossible de modifier son propre statut de compte');
select public.assert_raises(
  $$update public.profiles set username = 'bob2' where id = auth.uid()$$,
  null, 'impossible de changer son username en SQL direct (passe par une RPC)');
select public.assert_raises(
  $$update public.profile_stats set likes_total = 99999 where user_id = auth.uid()$$,
  null, 'impossible de gonfler son compteur de likes (§10)');
select public.assert_raises(
  $$insert into public.user_roles (user_id, role) values (auth.uid(), 'owner')$$,
  null, 'impossible de s''attribuer un role (§34)');
select public.assert_raises(
  $$insert into public.likes (from_user_id, to_user_id)
    values (auth.uid(), '11111111-1111-1111-1111-111111111111')$$,
  null, 'impossible d''inserer un like directement : la RPC est obligatoire');
-- La lecture n'est pas une erreur : la RLS renvoie simplement zero ligne.
-- C'est verifie plus loin (section 9) une fois de vrais evenements enregistres.
select public.assert((select count(*) from public.fraud_signals) = 0,
  'un utilisateur ne voit aucun signal anti-fraude (§34)');
select public.assert((select count(*) from public.admin_actions) = 0,
  'un utilisateur ne voit aucune action administrative (§34)');

-- Modifications legitimes : elles doivent fonctionner.
update public.profiles set bio = 'Je grimpe le classement', hide_likes = false where id = auth.uid();
select public.assert((select bio from public.profiles where id = auth.uid()) = 'Je grimpe le classement',
  'bob modifie bien sa propre bio');
update public.profile_private set notify_likes = false where user_id = auth.uid();
select public.assert((select not notify_likes from public.profile_private where user_id = auth.uid()),
  'bob modifie bien ses preferences de notification');
update public.profile_private set notify_likes = true where user_id = auth.uid();

-- Liens externes : https obligatoire, 5 maximum.
select public.assert_raises(
  $$update public.profiles set external_links = '[{"label":"x","url":"javascript:alert(1)"}]'::jsonb
     where id = auth.uid()$$,
  null, 'lien externe non https refuse (aucune injection d''URL)');
update public.profiles
   set external_links = '[{"label":"tiktok","url":"https://www.tiktok.com/@bob"}]'::jsonb
 where id = auth.uid();
select public.assert((select jsonb_array_length(external_links) from public.profiles where id = auth.uid()) = 1,
  'lien externe https accepte');

\echo ''
\echo '### 4. LIKES (§9 : unicite, compteurs, notifications reelles)'
select public.test_login('22222222-2222-2222-2222-222222222222');  -- bob like alice
select public.assert((public.like_user('11111111-1111-1111-1111-111111111111') ->> 'ok')::boolean,
  'bob like alice');
select public.assert((select likes_total from public.profile_stats
                       where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'compteur d''alice : 1 — issu du vrai like');

select public.assert_raises(
  $$select public.like_user('11111111-1111-1111-1111-111111111111')$$,
  'ALREADY_LIKED', 'un deuxieme like de la meme personne est refuse (§9)');

select public.test_login('11111111-1111-1111-1111-111111111111');  -- alice
select public.assert((select count(*) from public.get_notifications(10, 0, true)) = 1,
  'alice a exactement 1 notification non lue, creee par le vrai like');
select public.assert((select actor_username from public.get_notifications(10, 0, true) limit 1) = 'bob',
  'la notification nomme bob (qui n''a pas masque ses likes)');
select public.assert((select count(*) from public.get_my_likers(10, 0)) = 1,
  'alice voit 1 personne l''ayant likee');

-- Self-like : autorise par le produit (§9), et il ne cree pas de notification.
select public.assert((public.like_user('11111111-1111-1111-1111-111111111111') ->> 'ok')::boolean,
  'alice peut liker son propre profil (regle produit §9)');
select public.assert((select count(*) from public.get_notifications(10, 0, true)) = 1,
  'un self-like ne genere aucune notification (il n''y a personne a prevenir)');

-- « Masquer mes likes » : le like compte, l'identite non (§21).
update public.profiles set hide_likes = true where id = auth.uid();
select public.test_login('33333333-3333-3333-3333-333333333333');
select public.test_admin();
update public.profiles set setup_complete = true, is_private = false where username = 'chloe';
select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert((public.like_user('33333333-3333-3333-3333-333333333333') ->> 'ok')::boolean,
  'alice (likes masques) like chloe');
select public.test_login('33333333-3333-3333-3333-333333333333');
select public.assert((select likes_total from public.profile_stats where user_id = auth.uid()) = 1,
  'le like d''alice compte normalement pour chloe (§21)');
select public.assert((select username from public.get_my_likers(10, 0) limit 1) is null,
  'mais chloe ne voit pas QUI l''a likee (identite masquee)');
select public.assert((select hidden from public.get_my_likers(10, 0) limit 1),
  'et l''interface sait que l''auteur est masque, sans inventer de nom');
select public.assert((select count(*) from public.likes where to_user_id = auth.uid()) = 0,
  'la RLS masque aussi la ligne brute du like d''un auteur masque (§10)');

select public.test_login('11111111-1111-1111-1111-111111111111');
update public.profiles set hide_likes = false where id = auth.uid();

\echo ''
\echo '### 5. CLASSEMENT (§11 / §12 / §13 : vrais chiffres, egalites stables)'
select public.test_admin();
-- alice : 2 likes recus (bob + self), chloe : 1, bob : 0
select public.assert((select count(*) from public.get_leaderboard('general', 20, 0)) = 3,
  'le classement liste exactement les 3 profils reels');
select public.assert((select username from public.get_leaderboard('general', 1, 0)) = 'alice',
  'alice est premiere avec 2 likes reels');
select public.assert((select likes_count from public.get_leaderboard('general', 1, 0)) = 2,
  'le nombre affiche est le vrai nombre de likes');
select public.assert((select rank from public.get_leaderboard('general', 20, 0)
                       where username = 'bob') = 3,
  'bob, sans aucun like, est 3e avec 0 like — et non masque');

select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((public.get_my_rank('general') ->> 'rank')::integer = 3, 'bob : rang exact 3');
select public.assert((public.get_rank_context('general') ->> 'likes_to_pass')::integer = 2,
  'bob doit 2 likes pour depasser chloe (1 like) : 1 - 0 + 1 = 2');
select public.assert((public.get_rank_context('general') -> 'above' ->> 'username') = 'chloe',
  'la personne a depasser est correctement identifiee');
select public.assert((select count(*) from public.get_rank_neighbors('general', 1)) = 2,
  'les voisins immediats de bob (3e sur 3) : chloe et lui-meme');

-- Egalites : deux comptes a 0 like doivent partager le meme rang (§13).
select public.test_admin();
insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
values ('77777777-7777-7777-7777-777777777777', 'dan@example.test',
        '{"username":"dan","birth_date":"1995-05-05","policy_version":"2026-09-12"}', now());
select public.assert(
  (select count(distinct rank) from public.get_leaderboard('general', 20, 0)
    where likes_count = 0) = 1,
  'bob et dan, tous deux a 0 like, partagent le meme rang (#1 #2 #2 #4)');
select public.assert(
  (select array_agg(username order by board_position)
     from public.get_leaderboard('general', 20, 0))
  = (select array_agg(username order by board_position)
       from public.get_leaderboard('general', 20, 0)),
  'l''ordre d''affichage est deterministe entre deux lectures');

-- Classement 24H : calcule sur les vrais timestamps.
select public.assert((select count(*) from public.get_leaderboard('h24', 20, 0)) = 2,
  'classement 24H : seuls les 2 profils ayant recu un like y figurent');
update public.likes set created_at = now() - interval '30 hours'
 where to_user_id = '11111111-1111-1111-1111-111111111111';
select public.assert((select count(*) from public.get_leaderboard('h24', 20, 0)) = 1,
  'un like de plus de 24 h sort du classement 24H (§12)');
select public.assert((select likes_total from public.profile_stats
                       where user_id = '11111111-1111-1111-1111-111111111111') = 2,
  'mais il reste compte dans le classement general');

\echo ''
\echo '### 6. UNLIKE'
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((public.unlike_user('11111111-1111-1111-1111-111111111111') ->> 'ok')::boolean,
  'bob retire son like');
select public.assert_raises(
  $$select public.unlike_user('11111111-1111-1111-1111-111111111111')$$,
  'NOT_LIKED', 'retirer un like inexistant est refuse, sans faux succes (§26)');
select public.test_admin();
select public.assert((select likes_total from public.profile_stats
                       where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'le compteur reflete immediatement le retrait (2 -> 1)');

\echo ''
\echo '### 7. PROFIL PRIVE ET LIEN D''INVITATION (§32)'
select public.test_login('33333333-3333-3333-3333-333333333333');  -- chloe
update public.profiles set is_private = true where id = auth.uid();
\set QUIET on
select public.create_private_link('Lien pour mes amis') ->> 'token' as tok \gset
\set QUIET off

select public.test_logout();
select public.assert((public.get_public_profile('chloe') ->> 'private')::boolean = true,
  'visiteur sans token : le profil prive n''est pas expose');
select public.assert((public.get_public_profile('chloe') -> 'bio') is null,
  'aucune donnee du profil prive ne fuit (pas un simple masquage CSS)');
select public.assert((public.get_public_profile('chloe', :'tok') ->> 'found')::boolean = true,
  'avec un token valide, le profil prive est accessible');
select public.assert((public.get_public_profile('chloe', 'mauvais-token') ->> 'private')::boolean = true,
  'un token invalide ne donne aucun acces');
select public.assert((public.get_public_profile('chloe', :'tok') ->> 'username') = 'chloe',
  'le contenu renvoye avec un token valide est bien celui du profil');

select public.test_login('33333333-3333-3333-3333-333333333333');
select public.assert(public.revoke_private_links() = 1, 'chloe revoque tous ses liens prives');
select public.test_logout();
select public.assert((public.get_public_profile('chloe', :'tok') ->> 'private')::boolean = true,
  'apres revocation, l''ancien lien ne fonctionne plus');

select public.test_admin();
select public.assert((select count(*) from public.private_profile_links where token_hash = :'tok') = 0,
  'le token en clair n''est jamais stocke en base (seule son empreinte l''est)');

-- Un profil prive sort du classement, et on le DIT au lieu d''inventer un rang.
select public.test_login('33333333-3333-3333-3333-333333333333');
select public.assert((public.get_my_rank('general') ->> 'rank') is null,
  'un profil prive n''a pas de rang public');
select public.assert((public.get_my_rank('general') ->> 'reason') = 'profile_private',
  'et la raison est explicite : profile_private (aucun rang fantome)');

\echo ''
\echo '### 8. BLOCAGE (§22 : effet reel, pas un masquage)'
select public.test_login('11111111-1111-1111-1111-111111111111');  -- alice bloque bob
select public.assert((public.block_user('bob') ->> 'ok')::boolean, 'alice bloque bob');
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert_raises(
  $$select public.like_user('11111111-1111-1111-1111-111111111111')$$,
  'BLOCKED', 'bob ne peut plus liker alice');
select public.assert((public.get_public_profile('alice') ->> 'reason') = 'blocked',
  'bob n''accede plus au profil d''alice');
select public.assert((select count(*) from public.search_profiles('alice', 10, 0)) = 0,
  'alice n''apparait plus dans les recherches de bob (§15)');
select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert((public.unblock_user('bob') ->> 'ok')::boolean, 'alice debloque bob');

\echo ''
\echo '### 9. CONSENTEMENT ET ANALYTICS (§17 / §18 / §36 / §37)'
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert(public.track_event('leaderboard_viewed', '{"mode":"general"}') = false,
  'sans consentement analytics, aucun evenement n''est enregistre');
select public.assert((public.set_consent('analytics', true, '2026-09-12') ->> 'status') = 'granted',
  'bob accorde le consentement analytics');
select public.assert(public.track_event('leaderboard_viewed', '{"mode":"general"}') = true,
  'avec consentement, l''evenement est enregistre');
select public.assert(public.track_event('evenement_invente', '{}') = false,
  'un nom d''evenement hors liste blanche est ignore (§36)');
select public.assert(public.track_event('search_performed', '{"email":"bob@example.test","query_length":5}') = true,
  'evenement accepte');
select public.test_admin();
select public.assert((select metadata from public.analytics_events
                       where event_name = 'search_performed' limit 1) = '{"query_length": 5}'::jsonb,
  'les metadonnees hors liste blanche (ici un email) sont retirees (§13)');
select public.assert((select count(*) from public.analytics_events
                       where metadata::text like '%@%') = 0,
  'aucune adresse email ne subsiste dans les evenements');
select public.assert((select count(*) from public.analytics_events) >= 2,
  'les evenements existent bien en base (vus ici en tant qu''administrateur)');
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((select count(*) from public.analytics_events) = 0,
  'mais bob ne lit AUCUN evenement brut, pas meme les siens (§34)');
select public.test_admin();

-- Mineurs : pas de profilage publicitaire (§18 / §43).
select public.test_login('33333333-3333-3333-3333-333333333333');
select public.assert((public.set_consent('advertising', true, '2026-09-12') ->> 'status') = 'denied',
  'un compte mineur ne peut pas accorder le consentement publicitaire (§18)');
select public.assert((public.set_consent('advertising', true, '2026-09-12') ->> 'forced_denied_minor')::boolean,
  'et le refus est annonce explicitement, pas simule');

-- Retrait du consentement (§14).
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((public.withdraw_consent('analytics', '2026-09-12') ->> 'status') = 'withdrawn',
  'bob retire son consentement analytics');
select public.assert(public.track_event('leaderboard_viewed', '{}') = false,
  'apres retrait, la collecte s''arrete reellement');
select public.assert((select count(*) from public.consent_log where user_id = auth.uid()) >= 2,
  'la preuve du consentement est conservee en journal (§17)');

\echo ''
\echo '### 10. SIGNALEMENT ET MODERATION (§21 / §31 / §32 / §45)'
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((public.create_report('alice', 'spam', 'Comportement suspect') ->> 'ok')::boolean,
  'bob signale alice');
select public.assert_raises(
  $$select public.create_report('alice', 'spam', 'encore')$$,
  'REPORT_DUPLICATE', 'un signalement identique en attente est refuse (anti-spam)');
select public.assert_raises(
  $$select public.create_report('bob', 'spam', 'moi-meme')$$,
  'TARGET_SELF', 'on ne peut pas se signaler soi-meme');

-- Un utilisateur ordinaire ne modere pas, meme en appelant la RPC directement.
select public.assert_raises(
  $$select public.mod_sanction_user('alice', 'warning', 'parce que')$$,
  'FORBIDDEN', 'la moderation est refusee cote BASE a un utilisateur ordinaire (§34)');
select public.assert_raises(
  $$select public.mod_list_reports()$$,
  'FORBIDDEN', 'la liste des signalements est inaccessible a un utilisateur ordinaire');
select public.assert_raises(
  $$select public.mod_stats()$$,
  'FORBIDDEN', 'les statistiques administratives sont inaccessibles');

-- On donne le role owner a alice, comme le ferait le SQL editor au demarrage.
select public.test_admin();
insert into public.user_roles (user_id, role, granted_at)
values ('11111111-1111-1111-1111-111111111111', 'owner', now())
on conflict (user_id) do update set role = 'owner';

select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert((select count(*) from public.mod_list_reports()) = 1,
  'alice (owner) voit le signalement');
select public.assert((select target_username from public.mod_list_reports() limit 1) = 'alice',
  'le signalement porte bien sur la bonne cible');
select public.assert((public.mod_sanction_user('bob', 'suspension', 'Test de suspension',
                                               'Regles communautaires 3.1', 7) ->> 'ok')::boolean,
  'alice suspend bob pour 7 jours');
select public.test_admin();
select public.assert((select status from public.profiles where username = 'bob') = 'suspended',
  'le compte de bob est REELLEMENT suspendu');
select public.assert((select count(*) from public.admin_actions where action = 'sanction_suspension') = 1,
  'l''action de moderation est journalisee (§23)');
select public.assert((select rule_violated from public.sanctions where type = 'suspension')
                     = 'Regles communautaires 3.1',
  'la regle violee, la duree et l''auteur sont conserves (§45)');

-- Un compte suspendu ne peut plus agir, mais PEUT contester (§24).
select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert_raises(
  $$select public.like_user('33333333-3333-3333-3333-333333333333')$$,
  'ACCOUNT_SUSPENDED', 'un compte suspendu ne peut plus liker');
select public.assert((select count(*) from public.sanctions where user_id = auth.uid()) = 1,
  'bob voit la sanction qui le concerne et sa motivation (§45)');
\set QUIET on
select id::text as sid from public.sanctions where user_id = '22222222-2222-2222-2222-222222222222' limit 1 \gset
\set QUIET off
select public.assert((public.create_appeal(:'sid', 'Je conteste, je n''ai rien fait de tel.') ->> 'ok')::boolean,
  'un compte suspendu peut deposer une contestation reelle (§33)');
select public.assert_raises(
  'select public.create_appeal(' || quote_literal(:'sid')
    || ', ''Je reessaie encore une fois'')',
  'APPEAL_EXISTS', 'une seule contestation par sanction');

\set QUIET on
select public.test_login('11111111-1111-1111-1111-111111111111');
select id::text as aid from public.appeals limit 1 \gset
\set QUIET off
select public.assert((public.mod_decide_appeal(:'aid', 'accepted', 'Apres verification, sanction levee.') ->> 'ok')::boolean,
  'alice accepte la contestation');
select public.test_admin();
select public.assert((select status from public.profiles where username = 'bob') = 'active',
  'une contestation acceptee leve reellement la sanction et reactive le compte');

-- Un moderateur ne peut pas sanctionner un compte de rang superieur ou egal.
insert into public.user_roles (user_id, role) values
  ('77777777-7777-7777-7777-777777777777', 'moderator')
on conflict (user_id) do update set role = 'moderator';
select public.test_login('77777777-7777-7777-7777-777777777777');
select public.assert_raises(
  $$select public.mod_sanction_user('alice', 'warning', 'abus de pouvoir')$$,
  'TARGET_PRIVILEGED', 'un moderateur ne peut pas sanctionner le proprietaire');
select public.assert_raises(
  $$select public.mod_sanction_user('bob', 'ban', 'test')$$,
  'FORBIDDEN', 'le bannissement definitif est reserve aux administrateurs');
select public.assert_raises(
  $$select public.mod_set_role('bob', 'admin', 'test')$$,
  'FORBIDDEN', 'seul le proprietaire attribue les roles');

\echo ''
\echo '### 11. LIKES FRAUDULEUX ET RECALCUL (§22 / §30)'
select public.test_admin();
select public.assert((select likes_total from public.profile_stats
                       where user_id = '33333333-3333-3333-3333-333333333333') = 1,
  'chloe a 1 like avant intervention');
select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert((public.mod_remove_fraudulent_likes('chloe', 'received', interval '30 days',
                      'Likes issus d''un echange artificiel') ->> 'removed_received')::integer = 1,
  'alice (owner) retire 1 like frauduleux recu par chloe');
select public.test_admin();
select public.assert((select likes_total from public.profile_stats
                       where user_id = '33333333-3333-3333-3333-333333333333') = 0,
  'le compteur est recalcule immediatement apres retrait');
select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert(public.recompute_like_counts() >= 4,
  'la reconciliation recalcule tous les compteurs a partir des vrais likes');
select public.test_admin();
select public.assert((select count(*) from public.profile_stats s
                       where s.likes_total <> (select count(*) from public.likes l
                                                where l.to_user_id = s.user_id)) = 0,
  'apres reconciliation, AUCUN compteur ne diverge des vrais likes');

\echo ''
\echo '### 12. EXPORT ET SUPPRESSION (§31 / §34 / §35)'
select public.test_login('22222222-2222-2222-2222-222222222222');
\set QUIET on
select public.export_my_data() as exp \gset
\set QUIET off
select public.assert((:'exp'::jsonb -> 'account' ->> 'username') = 'bob',
  'l''export contient bien le compte de bob');
select public.assert((:'exp'::jsonb -> 'personal_data' ->> 'birth_date') is not null,
  'l''export inclut les donnees personnelles de bob');
select public.assert(jsonb_array_length(:'exp'::jsonb -> 'not_included') = 5,
  'l''export liste explicitement ce qu''il ne contient pas');
select public.assert(:'exp'::jsonb ? 'consents' and :'exp'::jsonb ? 'sanctions_applied_to_me',
  'consentements et sanctions figurent dans l''export');
select public.assert(not (:'exp'::jsonb ? 'fraud_signals'),
  'l''export n''expose aucune donnee de securite (§31)');

select public.assert_raises(
  $$select public.delete_my_account('oui')$$,
  'CONFIRMATION_INVALID', 'la suppression exige une confirmation exacte');

select public.test_login('11111111-1111-1111-1111-111111111111');
select public.assert((public.like_user('22222222-2222-2222-2222-222222222222') ->> 'ok')::boolean,
  'alice like bob juste avant sa suppression de compte');

select public.test_login('22222222-2222-2222-2222-222222222222');
select public.assert((public.delete_my_account('SUPPRIMER') ->> 'ok')::boolean,
  'bob supprime son compte');

select public.test_admin();
select public.assert((select count(*) from auth.users where email = 'bob@example.test') = 0,
  'la suppression est REELLE : la ligne auth.users a disparu');
select public.assert((select count(*) from public.profiles where username = 'bob') = 0,
  'le profil a disparu');
select public.assert((select count(*) from public.profile_private
                       where user_id = '22222222-2222-2222-2222-222222222222') = 0,
  'les donnees personnelles ont disparu');
select public.assert((select count(*) from public.likes
                       where from_user_id = '22222222-2222-2222-2222-222222222222'
                          or to_user_id = '22222222-2222-2222-2222-222222222222') = 0,
  'les likes donnes ET recus ont disparu');
select public.assert((select count(*) from public.account_deletions) = 1,
  'une reference pseudonymisee est conservee pour l''anti-fraude');
select public.assert((select pseudonymous_ref from public.account_deletions)
                     not like '%2222%',
  'cette reference ne contient pas l''identifiant du compte (HMAC non reversible)');
select public.assert((select count(*) from public.get_leaderboard('general', 20, 0)
                       where username = 'bob') = 0,
  'le compte supprime est retire du classement (§13)');
select public.assert((select count(*) from public.profile_stats s
                       where s.likes_total <> (select count(*) from public.likes l
                                                where l.to_user_id = s.user_id)) = 0,
  'les compteurs restent exacts apres la suppression');

\echo ''
\echo '### 13. QUOTAS SERVEUR (§27)'
select public.test_login('11111111-1111-1111-1111-111111111111');
-- 11 categories differentes pour ne pas declencher l'anti-doublon : c'est
-- bien le QUOTA (10 signalements par jour) qui doit arreter la boucle.
do $quota$
declare
  v_cat  public.report_category;
  v_done integer := 0;
  v_hint text;
begin
  for v_cat in select unnest(enum_range(null::public.report_category)) loop
    begin
      perform public.create_report('chloe', v_cat, 'Test de quota');
      v_done := v_done + 1;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      if v_hint = 'RATE_LIMITED' then
        raise notice 'ok   le quota serveur a stoppe la boucle apres % signalements (§27)', v_done;
        return;
      end if;
      raise exception 'ECHEC : arret pour une autre raison (%) apres % signalements',
        coalesce(v_hint, sqlstate), v_done;
    end;
  end loop;
  raise exception 'ECHEC : % signalements acceptes, aucun quota applique', v_done;
end $quota$;

\echo ''
\echo '### 14. MAINTENANCE ET CACHE DE CLASSEMENT (§49)'
select public.test_admin();
select public.assert((public.refresh_leaderboards() ->> 'general')::integer >= 1,
  'le cache de classement se rafraichit');
select public.assert((public.snapshot_ranks() ->> 'snapshots')::integer >= 1,
  'l''instantane des rangs enregistre de vraies positions (§14)');
select public.assert((select count(*) from public.rank_history) >= 1,
  'l''historique de classement provient de mesures reellement enregistrees');
select public.assert((select count(*) from public.notifications where type in ('rank_up', 'overtaken')) = 0,
  'aucune notification de rang au premier instantane : il n''y a rien a comparer');
select public.assert((public.snapshot_ranks() ->> 'snapshots')::integer >= 1,
  'un deuxieme instantane fonctionne');
select public.assert((public.run_fraud_detection() ->> 'new_signals')::integer >= 0,
  'la detection de fraude tourne sans rien inventer sur des donnees normales');
select public.assert((select count(*) from public.fraud_signals) = 0,
  'aucun signal de fraude sur une activite normale (§11 : pas de fausse detection)');
select public.assert(public.expire_sanctions() >= 0, 'l''expiration des sanctions tourne');

\echo ''
\echo '### 15. SURFACE D''API'
select public.assert(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and table_name in ('likes', 'profile_stats', 'user_roles', 'sanctions',
                         'admin_actions', 'fraud_signals', 'analytics_events',
                         'leaderboard_cache', 'rate_limit_hits', 'account_deletions')) = 0,
  'aucune ecriture directe possible sur les tables sensibles');
select public.assert(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
  'la Row Level Security est active sur TOUTES les tables du schema public');
select public.assert(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name = 'leaderboard_cache') = 0,
  'le cache de classement n''est jamais lu directement par le client');

\echo ''
\echo '###############################################'
\echo '###   TOUS LES TESTS SONT PASSES            ###'
\echo '###############################################'
