#!/usr/bin/env node
/* =============================================================================
   LIKEMM — audit « aucune fausse donnée, aucun secret » (§1 et §45 de la V1)
   =============================================================================
   Ce script échoue (code de sortie 1) si le projet contient :

     * un secret qui n'a rien à faire dans un dépôt (clé service_role, JWT
       secret, mot de passe de base) ;
     * un générateur de données fictives (faux utilisateurs, faux likes, faux
       classements, Math.random() pour produire des valeurs affichées) ;
     * une image de profil empruntée à un service tiers (pravatar, picsum...) ;
     * un reliquat de l'ancien prototype (ALL_USERS, buildUsers, mockLeaderboard,
       fakeNotifications, demoUsers...).

   À lancer avant chaque mise en production :  npm run audit:mock
   ========================================================================== */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const SCANNED_DIRS = ["src", "supabase", "public", "scripts"];
const SCANNED_FILES = ["index.html", "package.json", "vite.config.js", ".env.example"];
const SCANNED_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".sql", ".json", ".mjs", ".example", ""]);

/** Le script se cite lui-même : on l'exclut pour éviter les faux positifs. */
const SELF = join("scripts", "audit-no-mock.mjs");

const RULES = [
  {
    id: "service-role",
    severity: "error",
    pattern: /service_role_key|SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY/i,
    message: "Référence à la clé service_role. Elle ne doit jamais se trouver dans le frontend.",
    allow: [/supabase\/migrations\//, /docs\//],
  },
  {
    id: "jwt-secret",
    severity: "error",
    pattern: /JWT_SECRET|jwt[_-]?secret\s*[:=]\s*['"][^'"]{8,}/i,
    message: "Secret JWT apparent.",
  },
  {
    id: "hardcoded-key",
    severity: "error",
    // Une clé Supabase est un JWT : eyJ... . Aucune ne doit être écrite en dur.
    pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    message: "Jeton JWT écrit en dur dans le code.",
  },
  {
    id: "third-party-avatar",
    severity: "error",
    pattern: /pravatar|picsum\.photos|i\.pravatar|randomuser\.me|placekitten|unsplash\.it|loremflickr/i,
    message: "Image de profil empruntée à un service tiers : un profil sans photo doit afficher l'avatar par défaut.",
  },
  {
    id: "prototype-leftovers",
    severity: "error",
    pattern: /\bALL_USERS\b|\bbuildUsers\b|\bbuildNotifications\b|\bCURRENT_USER_BASE\b|\bmockLeaderboard\b|\bfakeUsers\b|\bfakeNotifications?\b|\bdemoUsers\b|\bFIRST_NAMES\b|\bmulberry32\b/,
    message: "Reliquat du prototype à données fictives.",
  },
  {
    id: "demo-identities",
    severity: "error",
    pattern: /["'`](Demo User|John Doe|Jane Doe|Fake User|User 1|Utilisateur test)["'`]/i,
    message: "Identité de démonstration en dur.",
  },
  {
    id: "random-values",
    severity: "error",
    pattern: /Math\.random\s*\(/,
    message: "Math.random() : aucune valeur affichée ne doit être générée aléatoirement.",
    // crypto.getRandomValues est utilisé pour des identifiants techniques : c'est
    // un usage légitime et il n'est pas concerné par cette règle.
  },
  {
    id: "mock-mode",
    severity: "error",
    pattern: /USE_MOCK|MOCK_MODE|useMockData|isDemoMode|DEMO_MODE/i,
    message: "Bascule « données fictives » : le mode mock doit être supprimé en V1.",
  },
  {
    id: "todo-blocking",
    severity: "warn",
    pattern: /\bFIXME\b|\bTODO\s*:/,
    message: "Marqueur de travail non terminé.",
  },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", ".env", "coverage"].includes(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else scan(full);
  }
}

function scan(file) {
  const rel = relative(ROOT, file);
  if (rel === SELF) return;
  if (!SCANNED_EXT.has(extname(file))) return;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return;
  }

  const lines = content.split("\n");
  for (const rule of RULES) {
    if (rule.allow?.some((re) => re.test(rel))) continue;
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        findings.push({ rule, file: rel, line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  }
}

for (const dir of SCANNED_DIRS) {
  const full = join(ROOT, dir);
  if (existsSync(full)) walk(full);
}
for (const f of SCANNED_FILES) {
  const full = join(ROOT, f);
  if (existsSync(full)) scan(full);
}

// --- .env ne doit jamais être suivi par git ---------------------------------
const gitignore = existsSync(join(ROOT, ".gitignore"))
  ? readFileSync(join(ROOT, ".gitignore"), "utf8")
  : "";
if (!/^\.env$/m.test(gitignore)) {
  findings.push({
    rule: { id: "gitignore-env", severity: "error", message: "`.env` doit figurer dans .gitignore." },
    file: ".gitignore",
    line: 0,
    text: "",
  });
}

// --- Rapport ----------------------------------------------------------------
const errors = findings.filter((f) => f.rule.severity === "error");
const warnings = findings.filter((f) => f.rule.severity === "warn");

if (findings.length === 0) {
  console.log("\n  Audit Likemm : aucun problème détecté.");
  console.log("  · aucun secret dans le dépôt");
  console.log("  · aucune donnée fictive, aucun faux utilisateur, aucun compteur inventé");
  console.log("  · aucune image de profil empruntée à un service tiers\n");
  process.exit(0);
}

const group = (list, label) => {
  if (!list.length) return;
  console.log(`\n  ${label} (${list.length})`);
  for (const f of list) {
    console.log(`    ${f.file}:${f.line}  [${f.rule.id}] ${f.rule.message}`);
    if (f.text) console.log(`        ${f.text}`);
  }
};

group(errors, "ERREURS");
group(warnings, "AVERTISSEMENTS");

console.log("");
process.exit(errors.length > 0 ? 1 : 0);
