/* =============================================================================
   LIKEMM — validations cote client
   =============================================================================
   IMPORTANT : ces controles servent uniquement a donner un retour IMMEDIAT a
   l'utilisateur. Ils ne garantissent rien. Les memes regles — et elles seules —
   font autorite cote base : contrainte UNIQUE sur le username, contrainte CHECK
   sur son format, verification de l'age dans le trigger d'inscription, quotas
   dans les fonctions RPC (§5 / §19 / §27 / §44).
   ========================================================================== */

import { MIN_AGE } from "./config.js";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const BIO_MAX = 160;

/** Meme normalisation que public.normalize_username() cote base. */
export function normalizeUsername(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
}

/** Renvoie null si le format est acceptable, sinon le motif du refus. */
export function usernameFormatError(username) {
  const u = String(username || "");
  if (!u) return "Choisissez un nom d'utilisateur.";
  if (u.length < USERNAME_MIN) return `${USERNAME_MIN} caracteres minimum.`;
  if (u.length > USERNAME_MAX) return `${USERNAME_MAX} caracteres maximum.`;
  if (!/^[a-z0-9_]+$/.test(u)) return "Lettres minuscules, chiffres et _ uniquement.";
  if (u.startsWith("_") || u.endsWith("_")) return "Ne peut pas commencer ni finir par _.";
  if (u.includes("__")) return "Deux _ consecutifs ne sont pas autorises.";
  if (/^[0-9]+$/.test(u)) return "Ne peut pas etre compose uniquement de chiffres.";
  return null;
}

export function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

/**
 * Force du mot de passe, sur 4 niveaux. Sert a INFORMER, pas a juger :
 * le libelle reste neutre et ne culpabilise pas.
 */
export function passwordStrength(password) {
  const p = String(password || "");
  if (!p) return { score: 0, label: "" };
  let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (p.length >= 14) score = Math.min(4, score + 1);
  return { score, label: ["Trop court", "Faible", "Moyen", "Bon", "Excellent"][score] };
}

export function passwordError(password) {
  const p = String(password || "");
  if (p.length < 8) return "8 caracteres minimum.";
  if (passwordStrength(p).score < 2) {
    return "Ajoutez une majuscule, un chiffre ou un caractere special.";
  }
  return null;
}

/** Age revolu a partir d'une date ISO (YYYY-MM-DD). */
export function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

/** Controle d'age. Le refus definitif reste celui de la base (§19). */
export function birthDateError(birthDate) {
  if (!birthDate) return "Indiquez votre date de naissance.";
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return "Date invalide.";
  if (d > new Date()) return "Cette date est dans le futur.";
  const age = ageFromBirthDate(birthDate);
  if (age === null) return "Date invalide.";
  if (age > 120) return "Cette date ne semble pas correcte.";
  if (age < MIN_AGE) return `Likemm est accessible a partir de ${MIN_AGE} ans.`;
  return null;
}

/** Tranche d'age, alignee sur app.compute_age_band() cote base. */
export function ageBand(birthDate) {
  const age = ageFromBirthDate(birthDate);
  if (age === null) return null;
  if (age < 15) return "minor_13_14";
  if (age < 18) return "minor_15_17";
  return "adult";
}

export function isMinor(birthDate) {
  const band = ageBand(birthDate);
  return band === null ? null : band !== "adult";
}

/** Lien externe : https obligatoire, comme le trigger de validation en base. */
export function externalLinkError(url) {
  const u = String(url || "").trim();
  if (!u) return "Entrez une adresse.";
  if (u.length > 300) return "Adresse trop longue.";
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(u)) {
    return "L'adresse doit commencer par https:// et pointer vers un site valide.";
  }
  return null;
}

export function bioError(bio) {
  if (String(bio || "").length > BIO_MAX) return `${BIO_MAX} caracteres maximum.`;
  return null;
}
