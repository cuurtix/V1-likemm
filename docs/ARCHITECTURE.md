# Décisions d'architecture

Ce document explique les choix structurants et, surtout, **pourquoi** ils ont été
faits. Il est utile le jour où quelqu'un — vous compris — se demandera « pourquoi
est-ce fait comme ça ? ».

---

## Le classement

### Comment il est calculé

L'ensemble classé est composé des profils **actifs, publics, non masqués par la
modération et complètement constitués**.

- **Classement général** : compteur `profile_stats.likes_total`, maintenu par un
  trigger sur `likes`, entièrement recalculable par `recompute_like_counts()`.
  La source de vérité reste la table `likes`.
- **Classement 24 h** : agrégation directe sur les vrais horodatages
  (`created_at > now() - interval '24 hours'`). Aucun compteur approximatif :
  un like reçu il y a 25 heures sort du classement, automatiquement.

### Égalités

`rank()` porte sur le seul nombre de likes : deux personnes à égalité partagent
la même position, et la suivante saute — `#1, #2, #2, #4`. L'ordre d'affichage
entre égaux est départagé par `created_at` puis `id` : il est **déterministe**,
identique d'un rafraîchissement à l'autre.

D'où deux colonnes dans le cache : `rank` (ce qui est affiché, avec égalités) et
`board_position` (position unique et sans trou, utilisée pour la pagination).

### Montée en charge

Deux régimes, avec une bascule automatique à 20 000 profils listables
(`app.live_ranking_threshold()`) :

- **En dessous** : calcul en direct à chaque requête. Le classement est exact à
  la seconde.
- **Au-dessus** : lecture paginée dans `leaderboard_cache`, rafraîchi toutes les
  5 minutes par pg_cron.

Dans les deux cas, le **rang personnel** est calculé exactement à la demande, par
comptage indexé (`app.exact_rank`) et non par un tri complet. Il n'est jamais lu
dans le cache : votre propre numéro est toujours juste.

### Profils privés

Un profil privé **n'apparaît pas** au classement et ne s'y voit pas attribuer un
rang fantôme. `get_my_rank()` renvoie alors `reason: 'profile_private'`, et
l'interface affiche cette raison telle quelle, avec un lien vers les paramètres.

L'alternative — afficher une ligne « Profil privé » avec son nombre de likes —
aurait publié les compteurs de comptes qui ont justement demandé à ne pas être
visibles, dont la majorité des comptes mineurs (privés par défaut). Le choix
actuel est plus protecteur, et cohérent : ce qui n'est pas visible n'est pas
classé.

Le **blocage** obéit à une logique différente : il empêche les interactions entre
deux comptes, mais ne retire personne du classement public, qui doit rester le
même pour tous.

---

## Séparation des données personnelles

La Row Level Security de PostgreSQL filtre des lignes, pas des colonnes. Mettre
la date de naissance dans `profiles` reviendrait à l'exposer avec le profil
public.

D'où trois tables :

| Table | Contenu | Lisible par |
|---|---|---|
| `profiles` | pseudo, avatar, bio, liens, visibilité | tout le monde (selon la RLS) |
| `profile_private` | date de naissance, tranche d'âge, provenance, préférences | le propriétaire uniquement |
| `user_roles` | rôle | le propriétaire et l'administration |

Corollaire : ajouter une colonne à `profiles` la rend publique. Toute donnée
sensible va dans `profile_private`.

---

## Deux drapeaux d'état de compte

- **`setup_complete`** — le compte est réellement constitué : pseudo définitif
  **et** date de naissance. Tant qu'il est faux, le compte n'apparaît nulle part
  et ne peut rien faire. Ce drapeau existe pour les connexions Google et Apple,
  qui ne fournissent ni l'un ni l'autre : le compte reçoit alors un pseudo
  provisoire non devinable (`new_<10 caractères aléatoires>`) et l'utilisateur est
  amené sur `/complete-signup`.
- **`profile_completed`** — l'onboarding produit a été parcouru. Purement
  informatif, il sert à ne pas le proposer deux fois.

---

## Analytics et consentement

Distinction volontaire, et c'est ce qui rend le système honnête :

- **Les métriques structurelles** — nombre de comptes, de likes, d'inscriptions,
  provenance, activation, rétention D1/D7/D30 — sont calculées directement à
  partir des tables déjà nécessaires au service (`profiles.created_at`,
  `likes.created_at`, `auth.users.last_sign_in_at`). Elles ne dépendent d'aucun
  consentement, puisqu'aucune donnée supplémentaire n'est collectée pour les
  produire. Elles sont donc **exactes**.
- **Les événements comportementaux** — pages consultées, recherches, partages —
  passent par `track_event()` et sont soumis au consentement analytics. Sans
  consentement, rien n'est envoyé : pas même un appel réseau.

Trois garde-fous sur `track_event()` :

1. le nom de l'événement doit exister dans `analytics_event_types` — un nom
   inconnu est ignoré, ce qui rend impossible l'invention d'événements ;
2. les métadonnées passent par une liste blanche de clés avec des valeurs
   bornées, appliquée **côté serveur** : une adresse email glissée par erreur est
   retirée avant enregistrement (c'est testé) ;
3. le consentement est vérifié en base, pas seulement dans le navigateur.

Conséquence pour le pilotage : le taux d'activation est renvoyé avec une note
expliquant que son critère « classement consulté » ne couvre que les
utilisateurs consentants. Les autres critères viennent des tables réelles.

---

## Notifications

Chaque notification correspond à un événement réel :

- **like reçu** — trigger sur l'insertion du like. Pas de notification pour un
  self-like : il n'y a personne à prévenir. L'identité de l'auteur est masquée
  s'il a activé « masquer mes likes ».
- **progression, dépassement, palier** — générés par `snapshot_ranks()`, qui
  compare la mesure du jour à la **dernière mesure réellement enregistrée**. Au
  premier instantané, il n'y a rien à comparer : aucune notification n'est créée.

L'instantané tourne une fois par jour, volontairement. Une notification à chaque
micro-mouvement serait une mécanique d'engagement inutilement insistante — ce que
le cahier des charges écarte explicitement.

---

## Partage

Le partage est traité comme une fonctionnalité centrale : il est mis en avant
sur le profil, à la fin de l'onboarding, et depuis la carte de position au
classement.

Honnêteté technique assumée :

- TikTok, Instagram et Snapchat **n'offrent pas** d'API web permettant de publier
  depuis un site. Le seul chemin réel est le partage natif du téléphone (Web
  Share API), qui propose ces applications si elles sont installées. C'est ce que
  fait le bouton « Partager depuis mon téléphone », et la feuille de partage le
  dit en toutes lettres.
- X, WhatsApp, Telegram, Facebook et l'email acceptent un lien pré-rempli : ces
  boutons-là ouvrent bien la plateforme.
- Ouvrir une plateforme enregistre `share_clicked`, **jamais** `share_completed` :
  on ne sait pas si la personne a réellement publié. Fermer la feuille de partage
  native sans partager n'enregistre rien non plus.

Le paramètre de suivi (`?ref=alex`) ne contient que le pseudo de la personne qui
partage — une donnée déjà publique.

---

## Erreurs et états

Convention appliquée partout : les fonctions SQL lèvent leurs exceptions avec un
`HINT` machine stable (`ALREADY_LIKED`, `RATE_LIMITED`, `ACCOUNT_SUSPENDED`…),
que `src/lib/errors.js` traduit en message lisible. L'utilisateur ne voit jamais
« duplicate key value violates unique constraint ».

Côté interface, l'état affiché ne devance jamais la base. Un like se met à jour
de façon optimiste pour rester réactif, mais il est **remis dans son état
précédent** dès que la base refuse, et le compteur affiché ensuite est celui
renvoyé par le serveur — jamais un `+1` calculé localement.

---

## Ce qui n'a pas été fait, et pourquoi

- **Messagerie, publications, commentaires, stories, followers.** Explicitement
  exclus du périmètre V1. Le cœur est : profil, like, classement, partage.
- **Stripe et monétisation.** Le cahier des charges demande de ne pas
  l'implémenter tant que le système n'est pas prêt. L'architecture ne l'empêche
  pas : un futur boost de visibilité n'aurait aucun moyen d'écrire dans `likes`.
- **Previews de partage par profil.** Impossible sans rendu serveur. Deux voies
  documentées dans `DEPLOY.md`, et rien n'est promis en attendant.
- **CAPTCHA.** Les quotas serveur et la détection de signaux couvrent l'usage
  normal. Un mécanisme de type Turnstile à l'inscription reste à ajouter si une
  campagne de création de comptes se produit.
- **Dashboard analytics complet.** Le cahier des charges indique qu'il n'est pas
  nécessaire en V1. `mod_stats()` fournit déjà les chiffres, et `/admin` en
  affiche l'essentiel.
