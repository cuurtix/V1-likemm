-- =============================================================================
-- LIKEMM — 12 · Attribution du role « owner »
-- =============================================================================
-- AUCUN compte n'est cree ici, et aucun role eleve n'est attribue
-- automatiquement : ce serait une porte ouverte laissee dans le code.
--
-- Marche a suivre, une seule fois, apres la mise en place de la base :
--
--   1. Creer votre compte normalement depuis le site (inscription classique).
--   2. Ouvrir le SQL editor du projet Supabase.
--   3. Executer la requete ci-dessous en remplacant le nom d'utilisateur.
--
--      insert into public.user_roles (user_id, role, granted_at)
--      select id, 'owner', now() from public.profiles
--       where username = 'VOTRE_USERNAME'
--      on conflict (user_id) do update set role = 'owner', granted_at = now();
--
--   4. Verifier :
--
--      select p.username, r.role
--        from public.user_roles r
--        join public.profiles p on p.id = r.user_id
--       where r.role <> 'user';
--
-- Ensuite, tous les autres roles (moderator, admin) s'attribuent depuis
-- l'application avec public.mod_set_role(), qui journalise chaque changement
-- dans admin_actions (§23). Seul le role « owner » peut attribuer des roles.
-- =============================================================================

-- Garde-fou : signale au deploiement s'il n'existe aucun proprietaire, sans
-- jamais en creer un.
do $$
begin
  if not exists (select 1 from public.user_roles where role = 'owner') then
    raise notice
      'Aucun compte « owner » defini. La moderation est inaccessible jusqu''a '
      'ce qu''un role owner soit attribue manuellement '
      '(voir supabase/migrations/20260912001200_bootstrap_owner.sql).';
  end if;
end $$;
