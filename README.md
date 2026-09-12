# Likemm — V1

Application web de classement de popularité fondée sur des likes réels.
Frontend React (Vite) + backend Supabase (PostgreSQL, Auth, Storage).

**Cette version ne contient aucune donnée fictive.** Pas de faux utilisateurs,
pas de faux likes, pas de faux classement, pas de fausses notifications. Une
base vide affiche un site vide et parfaitement fonctionnel.

---

## Démarrage rapide

```bash
npm install
cp .env.example .env        # puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

La base doit être créée avant : voir **[docs/DEPLOY.md](docs/DEPLOY.md)**.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualisation du build |
| `npm run audit:mock` | **Échoue** s'il reste une donnée fictive ou un secret |

---

## Structure

```
likemm/
├─ index.html                  Page unique, métadonnées SEO et Open Graph
├─ public/
│  ├─ .htaccess                Routing SPA, HTTPS, en-têtes de sécurité, CSP
│  ├─ robots.txt · sitemap.xml
│  └─ og-default.png           Image de partage générique
├─ src/
│  ├─ lib/                     config, client Supabase, erreurs, validation,
│  │                           provenance, métadonnées de page, formatage
│  ├─ services/                TOUS les appels backend (aucun dans les composants)
│  ├─ context/                 thème, session, consentement, messages
│  ├─ components/              atomes, formulaires, molécules, dialogues
│  ├─ pages/                   écrans, dont pages/legal/ pour les documents
│  └─ hooks/
├─ supabase/
│  ├─ migrations/              12 fichiers SQL, à appliquer dans l'ordre
│  └─ tests/                   harnais local + 148 tests de sécurité
├─ scripts/
│  ├─ audit-no-mock.mjs        audit « aucune fausse donnée, aucun secret »
│  └─ smoke-test.mjs           test de fumée navigateur (responsive, dark pattern)
└─ docs/
   ├─ DEPLOY.md                mise en place Supabase, LWS, OAuth, previews
   ├─ SECURITY.md              modèle de sécurité, ce qui protège quoi
   ├─ ARCHITECTURE.md          décisions structurantes et leurs raisons
   └─ CHECKLIST.md             checklist avant mise en production
```

---

## Principes tenus dans tout le code

**1. Aucune donnée inventée.** Si la base ne contient rien, l'écran le dit :
« Aucun profil au classement pour le moment ». Si un rang n'existe pas, la
raison est affichée (« Votre profil est privé »), jamais un numéro inventé.

**2. La sécurité est dans la base, pas dans l'interface.** Le rôle
`authenticated` n'a même pas le droit d'écrire dans `likes`, `profile_stats` ou
`user_roles`. Toute opération sensible passe par une fonction SQL qui revérifie
l'authentification, l'état du compte, les blocages et les quotas. Masquer un
bouton n'a jamais protégé quoi que ce soit.

**3. Aucune fausse réussite.** Un like n'apparaît validé que lorsque la base l'a
enregistré. Un changement d'email affiche « confirmation requise », pas
« modifié », tant que le lien n'est pas ouvert. Une feuille de partage fermée
sans partager n'enregistre aucun partage.

**4. Aucune information juridique inventée.** Adresse, hébergeur, durées de
conservation, mécanismes de transfert : tout ce qui n'est pas connu apparaît en
surbrillance comme `[À COMPLÉTER]`. Aucune page n'affirme une conformité RGPD ou
DSA garantie.

**5. Pas de dark patterns.** « Tout refuser » a exactement la même taille, la
même position et le même poids visuel que « Tout accepter » — c'est vérifié
automatiquement par `scripts/smoke-test.mjs`. La suppression de compte est
accessible en deux clics depuis les paramètres.

---

## État de la vérification

| Vérification | Résultat |
|---|---|
| 12 migrations SQL sur PostgreSQL 16 | appliquées sans erreur |
| 148 tests de sécurité et de comportement | tous passés |
| `npm run build` | réussi |
| `npm run audit:mock` | aucun problème |
| Test de fumée : 36 chargements de page, mobile et desktop | aucune erreur, aucun débordement |

Un bug de sécurité réel a été trouvé par les tests pendant le développement et
corrigé : une comparaison `<> auth.uid()` valait `NULL` pour un visiteur non
connecté, ce qui neutralisait la protection des profils privés. Le test
correspondant est conservé (`### 7` dans `supabase/tests/10_security_tests.sql`).

---

## Avant la mise en production

Voir **[docs/CHECKLIST.md](docs/CHECKLIST.md)**. Les points bloquants :

- compléter les `[À COMPLÉTER]` des pages légales (éditeur, hébergeur, durées
  de conservation, mécanismes de transfert hors UE) ;
- attribuer le rôle `owner` à votre compte (voir la migration `..._bootstrap_owner.sql`) ;
- remplacer `https://VOTRE-PROJET.supabase.co` par l'URL réelle dans
  `public/.htaccess` (règle CSP).
