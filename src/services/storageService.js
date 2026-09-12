/* =============================================================================
   LIKEMM — storageService (§8 : photo de profil et couverture)
   =============================================================================
   Chaque fichier est ecrit dans `<bucket>/<mon_uuid>/<nom>` : la politique de
   stockage compare ce dossier a auth.uid(), il est donc impossible d'ecrire
   dans l'espace de quelqu'un d'autre. Le type et la taille sont egalement
   limites au niveau du bucket, donc cote serveur.

   L'image est redimensionnee et compressee AVANT l'envoi : moins de donnees
   transferees, moins de stockage, affichage plus rapide (§43).
   ========================================================================== */

import { supabase } from "../lib/supabase.js";
import { IMAGE_LIMITS } from "../lib/config.js";

const BUCKETS = { avatar: "avatars", cover: "covers" };

/** Verifications immediates, avant meme de toucher au reseau. */
function validateFile(file, kind) {
  if (!file) return "Aucun fichier selectionne.";
  if (!IMAGE_LIMITS.acceptedTypes.includes(file.type)) {
    return "Format non accepte. Utilisez une image JPEG, PNG ou WebP.";
  }
  const limit = IMAGE_LIMITS[kind].maxBytes;
  if (file.size > limit) {
    return `Cette image fait ${(file.size / 1024 / 1024).toFixed(1)} Mo, la limite est de ${(limit / 1024 / 1024).toFixed(0)} Mo.`;
  }
  return null;
}

/**
 * Redimensionne et compresse en WebP via un canvas.
 * En cas d'echec (navigateur ancien, image exotique), on renvoie le fichier
 * d'origine plutot que d'echouer : la limite de taille du bucket protege
 * toujours cote serveur.
 */
async function compressImage(file, maxDimension) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob || blob.size >= file.size) return { blob: file, ext: file.name.split(".").pop() || "jpg", type: file.type };
    return { blob, ext: "webp", type: "image/webp" };
  } catch {
    return { blob: file, ext: file.name.split(".").pop() || "jpg", type: file.type };
  }
}

export const storageService = {
  validateFile,

  /**
   * Envoie une image et renvoie son URL publique.
   * @param {File} file
   * @param {'avatar'|'cover'} kind
   * @param {string} userId
   */
  async uploadImage(file, kind, userId) {
    const problem = validateFile(file, kind);
    if (problem) throw Object.assign(new Error(problem), { hint: "FILE_INVALID" });
    if (!userId) throw Object.assign(new Error("Non connecte"), { hint: "AUTH_REQUIRED" });

    const bucket = BUCKETS[kind];
    const { blob, ext, type } = await compressImage(file, IMAGE_LIMITS[kind].maxDimension);

    // Nom neutre : ni le nom du fichier d'origine, ni le username, ni aucune
    // donnee personnelle ne se retrouvent dans l'URL publique.
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  /** Supprime les anciennes images de l'utilisateur pour ne pas les accumuler. */
  async removeOldImages(kind, userId, keepPath = null) {
    if (!userId) return;
    const bucket = BUCKETS[kind];
    const { data, error } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
    if (error || !data) return;

    const toDelete = data
      .map((f) => `${userId}/${f.name}`)
      .filter((p) => p !== keepPath);
    if (toDelete.length) {
      await supabase.storage.from(bucket).remove(toDelete);
    }
  },

  /** Suppression de toutes les images, appelee avant la suppression du compte. */
  async removeAllImages(userId) {
    if (!userId) return;
    for (const bucket of Object.values(BUCKETS)) {
      try {
        const { data } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (data?.length) {
          await supabase.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
        }
      } catch {
        /* le compte doit pouvoir etre supprime meme si le stockage repond mal */
      }
    }
  },
};
