#!/usr/bin/env node
/* =============================================================================
   LIKEMM — test de fumee de l'interface
   =============================================================================
   Verifie, dans un vrai navigateur, que :

     * chaque route se charge sans erreur JavaScript ;
     * aucune page ne deborde horizontalement, en mobile (390 px) comme en
       desktop (1280 px) — exigence §41 « responsive » ;
     * la banniere de consentement s'affiche ;
     * « Tout refuser » et « Tout accepter » ont EXACTEMENT la meme taille
       (§46 : pas de dark pattern) ;
     * le theme sombre s'applique.

   Prerequis :  npm i -D playwright && npx playwright install chromium
   Utilisation :
       npm run build && npx vite preview --port 4173 &
       node scripts/smoke-test.mjs

   Les erreurs reseau sont attendues si aucun projet Supabase n'est configure :
   le test verifie justement que l'application reste utilisable dans ce cas.
   ========================================================================== */

import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4173";
const ROUTES = [
  ["/", "Classement"],
  ["/explorer", "Explorer"],
  ["/login", "Se connecter"],
  ["/signup", "Créer"],
  ["/legal", "Informations légales"],
  ["/mentions-legales", "Mentions légales"],
  ["/terms", "Conditions"],
  ["/privacy", "confidentialité"],
  ["/cookies", "Cookies"],
  ["/community-guidelines", "Règles communautaires"],
  ["/moderation", "Modération"],
  ["/contact", "Contact"],
  ["/report", "Signaler"],
  ["/appeal", "Contester"],
  ["/data-rights", "données"],
  ["/account-deletion", "Supprimer"],
  ["/@alex", null],
  ["/route-qui-nexiste-pas", "existe pas"],
];

// Chemin du navigateur : Playwright le trouve seul dans la plupart des cas.
// PLAYWRIGHT_CHROMIUM_PATH permet de le forcer sur une machine ou il est
// installe ailleurs.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failures = 0;

for (const viewport of [{ width: 390, height: 844, name: "mobile" }, { width: 1280, height: 900, name: "desktop" }]) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Les échecs réseau vers le faux projet Supabase sont attendus.
      if (/ERR_NAME_NOT_RESOLVED|Failed to load resource|net::/i.test(t)) return;
      errors.push(`console: ${t}`);
    }
  });

  for (const [route, expect] of ROUTES) {
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(400);

    const text = await page.evaluate(() => document.body.innerText);
    const rootHtml = await page.evaluate(() => document.getElementById("root")?.innerHTML?.length || 0);
    const hOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

    const problems = [];
    if (rootHtml < 200) problems.push("page vide");
    if (expect && !text.toLowerCase().includes(expect.toLowerCase())) problems.push(`texte attendu absent : « ${expect} »`);
    if (hOverflow) problems.push("débordement horizontal");
    if (errors.length) problems.push(...errors);

    if (problems.length) {
      failures++;
      console.log(`  ECHEC [${viewport.name}] ${route}`);
      problems.forEach((p) => console.log(`         - ${p}`));
    } else {
      console.log(`  ok    [${viewport.name}] ${route}`);
    }
  }
  await ctx.close();
}

// Vérifie que la bannière de consentement apparaît et que "Tout refuser" existe
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(500);
  const hasBanner = await page.getByText("Cookies et traceurs", { exact: false }).first().isVisible().catch(() => false);
  const refuse = await page.getByRole("button", { name: "Tout refuser" }).boundingBox().catch(() => null);
  const accept = await page.getByRole("button", { name: "Tout accepter" }).boundingBox().catch(() => null);
  if (!hasBanner) { failures++; console.log("  ECHEC bannière de consentement absente"); }
  else console.log("  ok    bannière de consentement affichée");
  if (refuse && accept && Math.abs(refuse.width - accept.width) < 2 && Math.abs(refuse.height - accept.height) < 2) {
    console.log(`  ok    « Tout refuser » et « Tout accepter » ont la même taille (${Math.round(refuse.width)}x${Math.round(refuse.height)})`);
  } else {
    failures++;
    console.log("  ECHEC les boutons refuser/accepter n'ont pas la même taille (dark pattern)");
  }
  await ctx.close();
}

// Vérifie le thème sombre
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => window.localStorage.setItem("likemm_theme", "dark"));
  await page.goto(BASE + "/legal", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(300);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bg === "rgb(0, 0, 0)") console.log("  ok    thème sombre appliqué");
  else { failures++; console.log(`  ECHEC thème sombre non appliqué (${bg})`); }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nTOUS LES TESTS DE FUMEE SONT PASSES\n" : `\n${failures} ECHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
