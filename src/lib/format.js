/* =============================================================================
   LIKEMM — formatage
   =============================================================================
   Repris a l'identique du prototype : 18 420 · 18,4 K · 1,2 M · 3,4 Md.
   Ces fonctions ne font que METTRE EN FORME un nombre reel : elles n'arrondissent
   jamais vers le haut et n'ajoutent rien.
   ========================================================================== */

export function formatCount(n) {
  if (n == null) return "0";
  const abs = Math.abs(n);
  if (abs < 10000) return n.toLocaleString("fr-FR");
  if (abs < 1_000_000) {
    const v = n / 1000;
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",").replace(/,0$/, "") + " K";
  }
  if (abs < 1_000_000_000) {
    const v = n / 1_000_000;
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",").replace(/,0$/, "") + " M";
  }
  const v = n / 1_000_000_000;
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",").replace(/,0$/, "") + " Md";
}

/** « il y a 2 min », « hier », « il y a 3 jours ». Aucune date inventee. */
export function formatRelative(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "a l'instant";
  if (seconds < 90) return "il y a 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return `il y a ${weeks} semaine${weeks > 1 ? "s" : ""}`;
  }
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** « 1er », « 2e », « 284e » — pour le podium. */
export function formatOrdinal(rank) {
  if (rank == null) return "—";
  return rank === 1 ? "1er" : `${rank}e`;
}
