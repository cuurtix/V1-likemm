-- =============================================================================
-- LIKEMM — 09 · Supabase Storage (§8 : photo de profil et couverture)
-- =============================================================================
-- Regle centrale : « Ne jamais permettre a un utilisateur d'ecrire dans le
-- stockage d'un autre utilisateur. » Elle est appliquee par le CHEMIN du
-- fichier : chaque objet doit se trouver dans un dossier nomme avec l'UUID de
-- son proprietaire, et les politiques comparent ce dossier a auth.uid().
--
--   avatars/<auth.uid()>/avatar-<timestamp>.webp
--   covers/<auth.uid()>/cover-<timestamp>.webp
--
-- Le type MIME et la taille sont limites au niveau du BUCKET, donc cote
-- serveur : un client modifie ne peut pas envoyer un exécutable de 50 Mo.
-- Le redimensionnement et la compression se font cote client avant l'envoi
-- (voir src/services/storageService.js), ce qui reduit la charge et le cout.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 3145728,  array['image/jpeg', 'image/png', 'image/webp']),
  ('covers',  'covers',  true, 6291456,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Lecture publique
-- -----------------------------------------------------------------------------
-- Les images de profil sont publiques par nature : elles s'affichent dans le
-- classement et dans les previews de partage. En revanche le NOM du fichier ne
-- doit contenir aucune donnee personnelle (voir storageService).
drop policy if exists "likemm_images_public_read" on storage.objects;
create policy "likemm_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'covers'));

-- -----------------------------------------------------------------------------
-- Ecriture : uniquement dans SON dossier
-- -----------------------------------------------------------------------------
drop policy if exists "likemm_images_insert_own_folder" on storage.objects;
create policy "likemm_images_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    -- Un compte suspendu, banni ou non finalise n'envoie rien.
    and app.current_profile_status() = 'active'
  );

drop policy if exists "likemm_images_update_own_folder" on storage.objects;
create policy "likemm_images_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "likemm_images_delete_own_folder" on storage.objects;
create policy "likemm_images_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- La moderation ne supprime pas les fichiers directement : elle passe par
-- public.mod_remove_profile_image(), qui journalise l'action (§22 / §23).
