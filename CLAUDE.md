# Strafoot

Outil personnel de suivi d'entraînement football. Un seul utilisateur en v1 (moi).
Le schéma est multi-utilisateurs (user_id + RLS), les écrans ne le sont pas.

Objectif produit : logger une séance en moins de 15 secondes, répondre à un quizz
par jour, suivre ma progression (séances, tests physiques/techniques, auto-évaluations).

## Stack

- Expo SDK (dernier stable) + React Native + TypeScript strict
- Expo Router (navigation par fichiers, `app/`)
- @supabase/supabase-js appelé directement depuis le client, aucun backend
- Supabase Auth email/password ; session persistée via AsyncStorage
- Postgres via Supabase, RLS activée sur toutes les tables, policies sur `auth.uid() = user_id`
- Pas de lib UI, pas de state manager, pas d'ORM, pas de lib de formulaires en v1
- react-native-svg (version du SDK, installée par `npx expo install`) : seule lib de dessin,
  importée uniquement dans app/measure/ (courbe d'une mesure) et
  components/pitch-placeholder.tsx (terrain par défaut) ; pas de lib de charts
- @expo/vector-icons (version du SDK, installée par `npx expo install` : le SDK 57 ne
  l'embarque plus) : Ionicons seulement (onglets, chevrons, coche de confirmation, ▶ de
  démarrage, boutons icône) ; aucune autre lib d'icônes
- expo-haptics (version du SDK, installée par `npx expo install`) : importée seulement par
  lib/haptics.ts : `hapticSuccess` (ligne de mesure validée) et `hapticMedium` (tout
  enregistrement : séance libre, séance déjà faite, « Séance faite », fin de séance
  chronométrée via `vibrateOnSave`, test, profil) ; rien sur le web, jamais d'erreur

## Environnement de dev

- Windows + PowerShell. Pas de `grep`, `find`, `cat`, `touch` : utiliser `Select-String`,
  `Get-ChildItem`, `Get-Content`, `New-Item`.
- Expo Go fonctionne dans l'émulateur Android (Pixel via Android Studio), pas sur mon
  téléphone physique. Test : `npx expo start` puis `a` (émulateur) ou `w` (web). Tout
  code doit fonctionner sur web ET natif : pas d'API native sans fallback web.
- iPhone : la version web déployée sur Vercel, installée sur l'écran d'accueil (voir
  Déploiement). Pas de Mac, donc pas d'inspecteur web Safari : tout se constate à l'écran.
- `.env` existe déjà avec `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  Ne jamais le lire, l'afficher, le modifier ou le committer. `.env.example` est versionné.

## Structure

app/ routes Expo Router
(auth)/login.tsx
(tabs)/_layout.tsx, index.tsx (Accueil), quiz.tsx, training.tsx, profile.tsx
calendar.tsx calendrier mensuel (hors onglets, garde d'auth dans l'écran) : un jour touché → Accueil, ce jour choisi
session/_layout.tsx garde d'auth + pile des écrans de séance (hors onglets)
session/new.tsx création d'une séance, pré-remplie depuis une fiche (« Séance déjà faite » : sheetId, module, nom, durée)
session/[id].tsx détail/édition/suppression d'une séance
session/finish.tsx fin d'une fiche chronométrée : durée réelle (±5 ou saisie), difficulté, commentaire, ou abandon ;
au-delà de 3 h de chrono, « séance oubliée ? » : durée de la fiche ou du chrono
quiz/_layout.tsx garde d'auth + pile de la série ; quiz/run.tsx série de 5 questions puis récap
training/_layout.tsx garde d'auth ; training/[theme].tsx fiches d'un thème (tests, spécifiques, récupération) et ▶
sheet/_layout.tsx garde d'auth ; sheet/[id].tsx lecture d'une fiche ou d'un test, saisie des mesures, test enregistré
profile/_layout.tsx garde d'auth ; profile/edit.tsx édition du profil
measure/_layout.tsx garde d'auth ; measure/[testId].tsx courbe, historique et suppression des résultats
(dossier sans index à côté d'un onglet du même nom : /quiz, /training et /profile restent les onglets)
lib/
supabase.ts client unique
auth-context.tsx session, connexion, déconnexion : seul accès à supabase.auth
active-session.ts séance en cours sur l'appareil (clé strafoot.activeSession) : get / start /
setIndex / clear sans exception ; formatElapsed et elapsedMinutes purs, testés par
active-session.test.ts ; seul fichier avec lib/supabase.ts à importer AsyncStorage
active-session-context.tsx séance en cours partagée (provider monté dans app/_layout.tsx,
useActiveSession), navigation vers elle (reprendre, terminer), Alert « séance déjà en cours »,
confirmation d'abandon, vibration d'enregistrement (vibrateOnSave, via haptics.ts)
haptics.ts hapticSuccess et hapticMedium : seul import d'expo-haptics, rien sur le web
theme.ts tokens du design system (couleurs, tailles, interlignes, espacements, rayons,
dimensions, styles de texte et de champ, animations « motion », thème de navigation) : seule source
de style avec components/
dates.ts jours locaux YYYY-MM-DD et libellés, dont relativeDay (« auj. », « hier », « il y a 3 j »,
puis absolu), semaine (startOfWeek, weekDays, formatWeekRange) et daysBetween (« J-42 ») : seul
endroit où un jour est calculé ; ces quatre-là testés par dates.test.ts
modules.ts liste fermée des modules de séance (MODULE_KEYS)
training-themes.ts thèmes fermés de l'onglet Entraînement (tests, specifique, recuperation) et thème d'une fiche
quiz-taxonomy.ts listes fermées du quizz : thèmes, postes, barème
profile-taxonomy.ts postes du profil (ceux du quizz sans 'tous') et pieds forts
quiz-select.ts choix des questions d'une série (pur, testé)
measure-delta.ts évolution d'une mesure et format des valeurs (pur, testé)
sheet-types.ts format des fiches (exercises, intro, mesures), validation partagée app / script
json-types.ts contenu des autres colonnes jsonb (questions.options)
diagrams.ts URL publique d'un schéma du bucket diagrams, dimensions des schémas (722 × 646)
db/ une fonction par requête, typée (sessions.ts, answers.ts, questions.ts, training.ts,
test-results.ts, profiles.ts) ; result.ts : contrat { data, error }
streak.ts calcul pur, testable, sans dépendance
types.ts types générés depuis Supabase (npx supabase gen types)
components/ design system et composants réutilisés par ≥ 2 écrans uniquement
screen.tsx cadre d'écran : fond, marges, zones sûres (sur le web, sans doubler celles de l'en-tête et de la
barre d'onglets), clavier, titre 28, pied fixe de l'action principale, confirmation flottante (prop toast)
card.tsx carte (surface), tappable avec onPress (0,97 à l'appui), mise en évidence par bordure accent
chip.tsx puce de choix, la seule de l'app (44 px, zone tactile 48 px)
button.tsx bouton primary / secondary / danger / text, icône après le libellé, états pressé (0,97),
désactivé, loading
press-scale.ts usePressScale : micro-interaction a, partagée par Card et Button
icon-button.tsx bouton icône carré de 48 px (flèches, en-tête du profil, ✓ d'une mesure)
save-toast.tsx confirmation d'enregistrement qui glisse du bas, 2 s (micro-interaction c)
pitch-placeholder.tsx demi-terrain SVG affiché quand un exercice n'a pas de schéma
stat.tsx chiffre dominant 44 px, libellé et unité en secondaire
empty-state.tsx état vide : ce qui manque, quoi faire, le bouton pour le faire
field-error.tsx erreur sous un champ ou au-dessus de l'action qui a échoué
session-form.tsx formulaire de séance partagé par session/new et session/[id] ; exporte
DurationField (±5 ou saisie de 1 à 600 min), DifficultyField, CommentField, repris par session/finish
active-session-bar.tsx bandeau « En cours · titre · 12:34 » au-dessus de la barre d'onglets
(prop tabBar de (tabs)/_layout.tsx), et l'échec éventuel de mémorisation de la séance ; exporte
useElapsedLabel, chrono repris par l'en-tête de la fiche en cours
scripts/ générateurs des seeds, lancés avec npx tsx (build-seed-questions.ts, build-seed-sheets.ts)
supabase/
migrations/NNN_description.sql
seed.sql données de démonstration
seed_questions_NNN.sql, seed_sheets_NNN.sql générés par scripts/ : ne pas modifier à la main
content/ JSON sources des seeds (questions, fiches, tests) et PNG des schémas (diagrams/)
public/ fichiers servis à la racine du site web, copiés dans dist/ par l'export
index.html HTML racine du web, gabarit SPA d'Expo (pas d'app/+html.tsx : lu seulement en sortie static)
manifest.webmanifest nom, couleurs et icônes de l'app installée sur l'écran d'accueil
apple-touch-icon.png (180 px), icon-192.png, icon-512.png, icon-1024.png (expo.icon), favicon.png (expo.web.favicon)
vercel.json déploiement Vercel : build, réécriture SPA, en-têtes de cache


Toute lecture/écriture Supabase passe par `lib/db/`. Aucun appel `supabase.from()` dans
un écran. Les fonctions de `lib/db/` retournent `{ data, error }` et ne lancent pas
d'exception.

## Conventions

- TypeScript strict, pas de `any`, pas de `// @ts-ignore`.
- Nommage : fichiers en kebab-case, composants en PascalCase, fonctions/variables en
  camelCase, tables et colonnes SQL en snake_case.
- Dates stockées en `date` (séances) ou `timestamptz` (réponses). Jamais de string libre.
  Le jour courant est calculé en heure locale, pas en UTC (sinon une séance à 23h30
  compte pour le lendemain).
- Chaque écran gère explicitement ses états : chargement, vide, erreur, données.
  Une erreur Supabase s'affiche à l'utilisateur en texte brut, jamais avalée.
- Pas d'optimisation prématurée : pas de cache, pas de pagination tant que ce n'est
  pas un problème constaté.

## Base de données

- Toute modification de schéma = un fichier `supabase/migrations/NNN_description.sql`,
  numéroté, idempotent quand c'est possible (`create table if not exists`, `create policy`
  précédé de `drop policy if exists`). Je l'exécute à la main dans le SQL Editor.
  Ne jamais supposer qu'une migration a été appliquée : le dire explicitement à la fin.
- Jamais de `drop table`, `drop column`, `alter column ... type`, `rename` sur une table
  existante. Additif uniquement. Si un changement destructif semble nécessaire,
  s'arrêter et le proposer avec le SQL complet.
- Toute table : `id uuid primary key default gen_random_uuid()`, `user_id uuid not null
  references auth.users(id) on delete cascade`, `created_at timestamptz not null default now()`,
  RLS activée, 4 policies (select/insert/update/delete) sur `auth.uid() = user_id`.
- Depuis 002, `user_id` a le défaut `auth.uid()` sur les 8 tables, en plus du trigger
  `set_user_id` (001) qui l'impose à chaque insert : le client n'envoie jamais `user_id`.
- Après chaque migration, régénérer `lib/types.ts`.

### Tables v1

- `profiles` : main_position, secondary_position (8 postes de `lib/profile-taxonomy.ts`,
  CHECK, null permis), strong_foot (`droit` | `gauche` | `ambidextre`, CHECK, null permis),
  club, club_level (niveau, texte libre court), birth_date ; un profil par utilisateur
  (index unique sur user_id depuis 005) ; depuis 006 : goal (objectif, 140 caractères au
  plus, limite posée par l'écran d'édition) et goal_deadline (date, échéance de l'objectif)
- `sessions` : date, type (`collectif` | `solo` | `match` | `recup` | `test`),
  module text not null default 'seance_libre' (liste fermée = `MODULE_KEYS` de
  `lib/modules.ts`, contrainte `sessions_module_check_v2` depuis 004 ; `test` est réservé à
  l'enregistrement d'un test et absent du formulaire), name text, duration_min,
  difficulty (1-5), comment, sheet_id → training_sheets nullable
- `training_sheets` : title, positions text[] (postes de `lib/quiz-taxonomy.ts`, CHECK),
  skill, duration_min, exercises jsonb, is_public ; depuis 004 : slug (clé du contenu
  versionné, unique par utilisateur), kind (`training` : fiche de lecture | `test` : test
  mesuré, CHECK), subtitle, intro jsonb, pdf_url. Format d'exercises et d'intro :
  `lib/sheet-types.ts` ; les mesures d'un test sont dans exercises[].measures
- `tests` : catalogue des mesures : name, protocol (« titre du test — titre du bloc »), unit ;
  depuis 004 : key (identifiant stable, unique par utilisateur, null pour les 2 tests de
  démonstration), higher_is_better (false pour les chronos)
- `test_results` : test_id, date, value numeric, comment ; depuis 004 : session_id → sessions
  (séance de type test qui a produit le résultat, on delete set null)
- `questions` : situation, options jsonb (4 × { text, score 0-3, explanation }), theme,
  positions text[] (listes fermées de `lib/quiz-taxonomy.ts`, CHECK depuis 003 ; `tous` =
  valable pour tous les postes), level, source, is_public
- `answers` : question_id, chosen_index, score, answered_at ; depuis 003 : quiz_run_id (uuid
  client de la série), flagged (réponse signalée contestable)
- `self_assessments` : date, grid jsonb

Storage : bucket public `diagrams` (004), lecture publique, aucune policy d'écriture. Les PNG
de `supabase/content/diagrams/` y sont déposés à la main, sous le nom exact du champ diagram.

Ne plus ré-exécuter 002 après 004 : elle recréerait `sessions_module_check`, sans `test`.

Deux streaks calculées côté app, jamais stockées : entraînement (jour avec ≥ 1 séance, tout
module) et quizz (jour avec ≥ 1 réponse). Courante = jours consécutifs jusqu'à aujourd'hui,
ou jusqu'à hier si aujourd'hui est vide ; on affiche aussi la meilleure. Logique dans
`lib/streak.ts`, tests dans `lib/streak.test.ts`.

## Écrans v1 (figés)

1. **Accueil** : 2 streaks (entraînement, quizz : courante + meilleure ; le chiffre compte
   jusqu'à sa nouvelle valeur quand il augmente), séances ce mois / total, bouton « Nouvelle
   séance » → formulaire (date auj. → J-13, module, durée ±5 ou saisie de 1 à 600 min,
   difficulté optionnelle = 3 si vide, nom auto modifiable, commentaire optionnel) ;
   bande de la semaine, lundi → dimanche (points entraînement / quizz, aujourd'hui encadré,
   ‹ › pour changer de semaine) et « Voir le mois » → calendrier mensuel (app/calendar.tsx),
   dont un jour touché revient à l'Accueil ; tap sur un jour → séances du jour → édition /
   suppression.
2. **Quizz** : filtre thème / poste (replié par défaut, mémorisé tant que l'app tourne), stats (total, moyenne
   sur 7 jours, streak) ; séries de 5 questions QCM 4 options (jamais vues, puis dernier
   score ≤ 1, puis les plus anciennes) ; après réponse, affichage du score de l'option
   choisie et des 4 explications, jamais « la bonne réponse » ; réponse enregistrée dans
   `answers`, signalement d'une réponse contestable, récap de la série.
3. **Entraînement** (libellé d'onglet « Tests » depuis 8b ; titre d'écran inchangé) : trois
   blocs (« Tests », « Entraînements spécifiques », « Récupération » = skill `recuperation`,
   vide pour l'instant : « Bientôt : étirements, massages, mental »),
   chacun avec son nombre de fiches et sa dernière fois ; tap → liste du thème (titre, durée,
   compétence, dernière fois, ▶). Une fiche se lit écran par écran (présentation, puis un
   exercice par écran : schéma ou terrain par défaut, titre, durée, Objectif, But, Consignes ;
   « Plus de tips » déplie critères, points techniques, variables, surface / séquence /
   effectif, état gardé pendant la lecture) et finit sur « Séance faite », qui crée une séance
   `entrainement_specifique` liée. « Séance déjà faite » sur la présentation → formulaire
   de séance pré-rempli (fiche, module, nom, durée ; date auj. modifiable). Un test se lit
   bloc par bloc et finit sur la saisie des mesures façon Strong : dernière valeur en gris,
   ✓ par ligne (la valeur grise devient la valeur saisie), « Enregistrer le test » actif
   quand toutes les lignes sont validées ; séance module `test` liée, puis ses
   `test_results` en un seul insert ; écran « Test enregistré » : « Voir ma progression »
   (Profil, carte du test mise en vue) ou « Retour à l'entraînement ». L'historique des
   résultats est dans le Profil.
   **Séance en cours** (une seule) : ▶ à droite de chaque fiche / test, ou « Démarrer » sur
   la présentation, démarre le chrono et ouvre le 1er exercice ; une autre en cours → Alert
   « Reprendre / Terminer l'autre d'abord / Annuler ». Bandeau « En cours · titre · 12:34 »
   sur les 4 onglets, tap → la fiche à sa dernière étape ; le même chrono dans l'en-tête de
   la fiche en cours. Pendant la séance : « Terminer »
   (secondaire) à chaque écran sauf le dernier, dont l'action principale termine déjà. Fiche :
   Terminer / « Séance faite » → écran de fin (durée réelle arrondie, ±5 ou saisie de 1 à
   600 min ; au-delà de 3 h de chrono, « séance oubliée ? » avec « Durée de la fiche »
   présélectionnée ou « Durée du chrono » ; difficulté ; commentaire) → séance
   `entrainement_specifique` liée, vibration, confirmation sur l'onglet ;
   « Abandonner la séance » → rien créé. Test : Terminer → saisie des mesures, séance à la
   durée réelle ; abandon possible sur la saisie. Date d'une séance chronométrée : jour local
   du démarrage.
4. **Profil** : en-tête avec l'email et deux boutons icône (Modifier ; Déconnexion, avec
   confirmation) ; sections « Identité » (postes, pied fort, club, niveau, date de naissance,
   puis l'objectif avec « J-42 » si échéance, ou « Aucun objectif — en définir un »),
   « Évaluations » (les mesures groupées par test : dernière valeur, date, évolution
   « ↑ mieux » / « ↓ moins bien » / « = » selon higher_is_better ; tap sur une mesure →
   courbe, historique, suppression d'un résultat ; carte d'un test mise en vue au retour de
   « Voir ma progression ») et « Volumes » (par module, 30 jours / total). Édition : objectif
   (140 caractères) et échéance (JJ/MM/AAAA, jour à venir).
   Auto-évaluations (grille 64 compétences en jsonb, à migrer depuis l'outil existant) :
   chantier 5b.

Séance en cours : chrono = horodatage (startedAt), jamais de timer d'arrière-plan. La durée
est maintenant − startedAt, recalculée à l'affichage ; le bandeau et l'en-tête de la fiche
en cours (même hook `useElapsedLabel`) ne la rafraîchissent chaque seconde que visibles
(écran au premier plan, app active). Pas de notification, pas de chrono par exercice, pas de
lib de timer.

## Hors périmètre v1 — ne pas proposer, ne pas préparer

API FFF, Elo, génération d'exercices paramétrable, plans d'entraînement, notifications,
écrans multi-utilisateurs, partage, mode hors-ligne. Si une demande relève de cette liste,
le signaler et ne pas coder.

## Design system et règles UX

Design system : lib/theme.ts et components/ sont la seule source de style. Aucune couleur,
taille ou espacement en dur dans un écran. Aucune lib UI, aucune police custom. Les 14
règles UX ci-dessous s'appliquent à tout nouvel écran.

Animations : uniquement la liste fermée a–e, avec l'API Animated ou LayoutAnimation de
React Native, jamais Reanimated ni Moti (Reanimated reste installé pour expo-router, jamais
importé). Valeurs dans `motion` de lib/theme.ts ; tout scrollTo en `animated: false`.
a. Pression : Card tappable et Button à 0,97 pendant l'appui, retour en moins de 150 ms
   (components/press-scale.ts).
b. Ligne de mesure validée (saisie d'un test) : fond successSoft, 1 → 1,04 → 1 en 400 ms,
   hapticSuccess.
c. Enregistrement (séance libre, séance déjà faite, « Séance faite », fin de séance, test,
   profil) : hapticMedium et SaveToast, qui glisse de 24 px depuis le bas en 200 ms et
   disparaît après 2 s.
d. Streak de l'Accueil : si elle augmente depuis le dernier affichage, le chiffre compte de
   l'ancienne à la nouvelle valeur en 500 ms.
e. Quizz : explications déroulées par LayoutAnimation.easeInEaseOut.

Règles UX (figées : tout écran nouveau ou modifié est relu contre cette liste) :

1. Une action principale par écran, en bas, zone du pouce ; le reste visuellement secondaire.
2. Logger une séance : 2 taps avec les défauts ; champs supplémentaires optionnels.
3. Cibles tactiles ≥ 48 px, ≥ 8 px entre deux cibles.
4. Corps ≥ 16 px, secondaire ≥ 14 px, interligne 1,4, contraste ≥ 4,5:1 partout.
5. Un chiffre dominant par carte ; unité et date en secondaire ; 3 niveaux de hiérarchie max.
6. Retour visible < 400 ms : état pressé sur tout élément tappable, confirmation visible.
7. Zéro code : libellés en français, unité collée à la valeur, dates relatives < 7 jours
   (« auj. », « hier », « il y a 3 j »), absolues ensuite.
8. Un même objet = un même composant partout.
9. Un état vide dit quoi faire et porte le bouton pour le faire.
10. Erreur en français, à côté du champ, saisie conservée.
11. Profondeur de navigation ≤ 2 depuis un onglet ; retour toujours visible.
12. Filtres repliés par défaut, dernier choix mémorisé.
13. Sombre par défaut, pas de mode clair.
14. Nombres grands, alignés, scannables verticalement.

Valeurs des tokens qui s'écartent de la demande du chantier 6, pour respecter la règle 4 :
`fontSize.meta` = 14 (13 demandé), `colors.danger` = #E85052 (#E5383B demandé : 4,34:1 sur
surface). Depuis le chantier 7, `colors.quiz` = #A78BFA, violet clair distinct de l'orange
de l'entraînement (7,23:1 sur bg, 6,76:1 sur surface, 6,10:1 sur surface2). Les messages
bruts de Supabase restent en anglais (erreur jamais avalée).

## Méthode de travail

- Une session = un chantier défini. Avant de coder : résumer la compréhension en
  3-5 lignes, poser les questions bloquantes, attendre validation si une décision
  d'architecture est ambiguë.
- Ne pas modifier des fichiers hors du chantier sans le dire.
- Fin de chantier, dans cet ordre :
  1. Résumé de ce qui a été fait
  2. Fichiers créés / modifiés
  3. SQL à exécuter à la main, dans l'ordre
  4. Commandes PowerShell à lancer
  5. Checklist de test manuel (web ou émulateur), étape par étape
  6. Dette ou points d'attention laissés volontairement
  7. CLAUDE.md mis à jour par moi dans ce chantier (sections Structure, Base de données,
     Écrans, Commandes, Méthode si besoin) : diff inclus ici. Jamais une proposition en
     attente : CLAUDE.md reflète l'état du code à la fin de chaque chantier.
- Git : un commit par chantier, message en français à l'impératif
  (« Ajoute le formulaire de séance libre »). Pas de push automatique.

## Déploiement

- Web : export SPA (`expo.web.output = "single"`, metro) déployé par Vercel à chaque push sur
  main (intégration Git). Jamais `vercel deploy` depuis le poste : le CLI enverrait `.env`.
- vercel.json : build `npx expo export -p web`, sortie `dist`, framework null. Toute route hors
  `/_expo/` et `/assets/` est réécrite vers `/index.html` (un fichier existant passe avant) ;
  `/_expo/static/*` (noms hachés) en cache immuable d'un an, tout le reste en `no-cache`.
- HTML racine : `public/index.html`, gabarit de l'export SPA. Y garder `%WEB_TITLE%` (remplacé
  par `expo.name`), `</head>`, `</body>` et `<div id="root">` : l'export y insère favicon
  (`favicon.ico` tiré d'`expo.web.favicon`), CSS et scripts. `app/+html.tsx` n'est lu qu'en
  sortie static ou server : ne pas le créer.
- App installée sur iOS 26 (barre d'état `black-translucent`) : iOS dessine la page sous la
  barre d'état mais calcule 100 % (comme dvh, svh, innerHeight) sans elle, d'où une bande vide
  en bas, sous la barre d'onglets. Correctif dans public/index.html, sous
  `@media (display-mode: standalone)` seulement :
  `html { height: min(100lvh, calc(100% + env(safe-area-inset-top, 0px))) }`, body et #root
  suivent à 100 %. 100lvh vaut tout l'écran ; le min() ne le dépasse jamais et retombe sur
  100 % quand l'inset haut est nul (barre opaque, ordinateur, Android). Pas de boîte
  `position: fixed` (rognée au bord court), pas de dvh ni svh (courts eux aussi).
- Repli si la bande persiste : ligne 15 de public/index.html, `content="black-translucent"` →
  `content="black"` (barre opaque, page posée dessous, inset haut nul : le bloc standalone
  se neutralise et peut rester), puis supprimer l'icône et la rajouter. Apple tient
  `black-translucent` pour dépréciée (bug WebKit 317153) : c'est la voie durable.
- `colors.bg` est recopiée en dur dans public/index.html et public/manifest.webmanifest : les
  modifier en même temps que lib/theme.ts.
- `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` sont inlinées dans le bundle au
  build : à déclarer dans Vercel (Settings → Environment Variables, Production et Preview).
  Absentes, le build passe mais l'app reste vide (lib/supabase.ts lève). Après un changement,
  redéployer.
- Inscriptions Supabase fermées (Authentication → Sign In / Providers → « Allow new users to
  sign up » désactivé) : l'URL est publique, seul mon compte se connecte.
- iPhone : Safari → Partager → « Sur l'écran d'accueil ». L'app installée a son propre stockage
  (s'y reconnecter une fois). iOS fige icône, nom et barre d'état à l'ajout : après un
  changement de public/, supprimer l'icône puis la rajouter.

## Commandes

- `npx expo start` puis `w` / `a` (`npx expo start --clear` après l'ajout d'une dépendance)
- `npx tsc --noEmit` avant chaque fin de chantier, zéro erreur exigée
- `npx tsx lib/streak.test.ts`, `npx tsx lib/quiz-select.test.ts`,
  `npx tsx lib/measure-delta.test.ts`, `npx tsx lib/dates.test.ts`,
  `npx tsx lib/active-session.test.ts` (tests purs, sans framework)
- Stockage de l'appareil (seulement lib/supabase.ts et lib/active-session.ts attendus) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'async-storage'`
- Contrôle du design system (aucune ligne attendue) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx -Exclude theme.ts | Select-String -Pattern '#[0-9A-Fa-f]{3,8}\b'`
- Vibrations (seulement lib/haptics.ts attendu) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'expo-haptics'`
- Animations hors liste (aucune ligne attendue ; `\b` : le token `motion` contient « moti ») :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern '\bmoti\b|react-native-reanimated'`
- `npx tsx scripts/build-seed-questions.ts`, `npx tsx scripts/build-seed-sheets.ts`
  (régénèrent les seeds depuis supabase/content/)
- `npx supabase gen types typescript --project-id <id> | Out-File -Encoding utf8 lib/types.ts`
- Export web, comme sur Vercel : `npx expo export -p web` (dans dist/, variables lues dans .env)
- Servir dist en local : `npx expo serve --port 8090` (sans repli SPA : une route profonde y
  répond 404) ou `npx --yes serve -s dist` (repli SPA comme Vercel, port 3000 ; serve n'est
  pas une dépendance, npx le télécharge)
- Après un déploiement : `curl.exe -I https://<app>.vercel.app/sheet/xyz` (200, text/html)