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
  importée uniquement dans app/measure/ pour la courbe d'une mesure ; pas de lib de charts
- @expo/vector-icons (version du SDK, installée par `npx expo install` : le SDK 57 ne
  l'embarque plus) : Ionicons seulement (onglets, chevrons, coche de confirmation) ;
  aucune autre lib d'icônes

## Environnement de dev

- Windows + PowerShell. Pas de `grep`, `find`, `cat`, `touch` : utiliser `Select-String`,
  `Get-ChildItem`, `Get-Content`, `New-Item`.
- Expo Go fonctionne dans l'émulateur Android (Pixel via Android Studio), pas sur mon
  téléphone physique. Test : `npx expo start` puis `a` (émulateur) ou `w` (web). Tout
  code doit fonctionner sur web ET natif : pas d'API native sans fallback web.
- `.env` existe déjà avec `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  Ne jamais le lire, l'afficher, le modifier ou le committer. `.env.example` est versionné.

## Structure

app/ routes Expo Router
(auth)/login.tsx
(tabs)/_layout.tsx, index.tsx (Accueil), quiz.tsx, training.tsx, profile.tsx
session/_layout.tsx garde d'auth + pile des écrans de séance (hors onglets)
session/new.tsx création d'une séance
session/[id].tsx détail/édition/suppression d'une séance
quiz/_layout.tsx garde d'auth + pile de la série ; quiz/run.tsx série de 5 questions puis récap
sheet/_layout.tsx garde d'auth ; sheet/[id].tsx lecture d'une fiche ou d'un test, saisie des mesures
profile/_layout.tsx garde d'auth ; profile/edit.tsx édition du profil
measure/_layout.tsx garde d'auth ; measure/[testId].tsx courbe, historique et suppression des résultats
(dossier sans index à côté d'un onglet du même nom : /quiz et /profile restent les onglets)
lib/
supabase.ts client unique
auth-context.tsx session, connexion, déconnexion : seul accès à supabase.auth
theme.ts tokens du design system (couleurs, tailles, interlignes, espacements, rayons,
dimensions, styles de texte et de champ, thème de navigation) : seule source de style avec components/
dates.ts jours locaux YYYY-MM-DD et libellés, dont relativeDay (« auj. », « hier », « il y a 3 j »,
puis absolu) : seul endroit où un jour est calculé ; relativeDay testé par dates.test.ts
modules.ts liste fermée des modules de séance (MODULE_KEYS)
quiz-taxonomy.ts listes fermées du quizz : thèmes, postes, barème
profile-taxonomy.ts postes du profil (ceux du quizz sans 'tous') et pieds forts
quiz-select.ts choix des questions d'une série (pur, testé)
measure-delta.ts évolution d'une mesure et format des valeurs (pur, testé)
sheet-types.ts format des fiches (exercises, intro, mesures), validation partagée app / script
json-types.ts contenu des autres colonnes jsonb (questions.options)
diagrams.ts URL publique d'un schéma du bucket diagrams
db/ une fonction par requête, typée (sessions.ts, answers.ts, questions.ts, training.ts,
test-results.ts, profiles.ts) ; result.ts : contrat { data, error }
streak.ts calcul pur, testable, sans dépendance
types.ts types générés depuis Supabase (npx supabase gen types)
components/ design system et composants réutilisés par ≥ 2 écrans uniquement
screen.tsx cadre d'écran : fond, marges, zones sûres, clavier, titre 28, pied fixe de l'action principale
card.tsx carte (surface), tappable avec onPress, mise en évidence par bordure accent
chip.tsx puce de choix, la seule de l'app (44 px, zone tactile 48 px)
button.tsx bouton primary / secondary / danger, états pressé, désactivé, loading
stat.tsx chiffre dominant 44 px, libellé et unité en secondaire
empty-state.tsx état vide : ce qui manque, quoi faire, le bouton pour le faire
field-error.tsx erreur sous un champ ou au-dessus de l'action qui a échoué
session-form.tsx formulaire de séance partagé par session/new et session/[id]
scripts/ générateurs des seeds, lancés avec npx tsx (build-seed-questions.ts, build-seed-sheets.ts)
supabase/
migrations/NNN_description.sql
seed.sql données de démonstration
seed_questions_NNN.sql, seed_sheets_NNN.sql générés par scripts/ : ne pas modifier à la main
content/ JSON sources des seeds (questions, fiches, tests) et PNG des schémas (diagrams/)


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
  (index unique sur user_id depuis 005)
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

1. **Accueil** : 2 streaks (entraînement, quizz : courante + meilleure), séances ce mois /
   total, bouton « Nouvelle séance » → formulaire (date auj. → J-13, module, durée ±5,
   difficulté optionnelle = 3 si vide, nom auto modifiable, commentaire optionnel) ;
   calendrier du mois (points entraînement / quizz) ; tap sur un jour → séances du jour →
   édition / suppression.
2. **Quizz** : filtre thème / poste (replié par défaut, mémorisé tant que l'app tourne), stats (total, moyenne
   sur 7 jours, streak) ; séries de 5 questions QCM 4 options (jamais vues, puis dernier
   score ≤ 1, puis les plus anciennes) ; après réponse, affichage du score de l'option
   choisie et des 4 explications, jamais « la bonne réponse » ; réponse enregistrée dans
   `answers`, signalement d'une réponse contestable, récap de la série.
3. **Entraînement** : liste des fiches de lecture et des tests. Une fiche se lit écran par
   écran (présentation, puis un exercice par écran avec son schéma) et finit sur « Séance
   faite », qui crée une séance `entrainement_specifique` liée. Un test se lit bloc par bloc
   et finit sur la saisie d'une valeur par mesure : séance module `test` liée, puis ses
   `test_results` en un seul insert. L'historique des résultats est dans le Profil.
4. **Profil** : identité (email, postes, pied fort, club, niveau, date de naissance) et
   « Modifier » ; les mesures groupées par test : dernière valeur, date, évolution
   « ↑ mieux » / « ↓ moins bien » / « = » selon higher_is_better ; tap sur une mesure →
   courbe, historique, suppression d'un résultat ; volumes par module (30 jours / total).
   Auto-évaluations (grille 64 compétences en jsonb, à migrer depuis l'outil existant) :
   chantier 5b.

## Hors périmètre v1 — ne pas proposer, ne pas préparer

API FFF, Elo, génération d'exercices paramétrable, plans d'entraînement, notifications,
écrans multi-utilisateurs, partage, mode hors-ligne. Si une demande relève de cette liste,
le signaler et ne pas coder.

## Design system et règles UX

Design system : lib/theme.ts et components/ sont la seule source de style. Aucune couleur,
taille ou espacement en dur dans un écran. Aucune lib UI, aucune police custom, aucune
animation hors état pressé. Les 14 règles UX ci-dessous s'appliquent à tout nouvel écran.

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
surface). Les messages bruts de Supabase restent en anglais (erreur jamais avalée).

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

## Commandes

- `npx expo start` puis `w` / `a` (`npx expo start --clear` après l'ajout d'une dépendance)
- `npx tsc --noEmit` avant chaque fin de chantier, zéro erreur exigée
- `npx tsx lib/streak.test.ts`, `npx tsx lib/quiz-select.test.ts`,
  `npx tsx lib/measure-delta.test.ts`, `npx tsx lib/dates.test.ts` (tests purs, sans framework)
- Contrôle du design system (aucune ligne attendue) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx -Exclude theme.ts | Select-String -Pattern '#[0-9A-Fa-f]{3,8}\b'`
- `npx tsx scripts/build-seed-questions.ts`, `npx tsx scripts/build-seed-sheets.ts`
  (régénèrent les seeds depuis supabase/content/)
- `npx supabase gen types typescript --project-id <id> | Out-File -Encoding utf8 lib/types.ts`