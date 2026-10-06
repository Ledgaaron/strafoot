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
session/[id].tsx détail/édition d'une séance
lib/
supabase.ts client unique
db/ une fonction par requête, typée (sessions.ts, questions.ts, tests.ts…)
streak.ts calcul pur, testable, sans dépendance
types.ts types générés depuis Supabase (npx supabase gen types)
components/ composants réutilisés par ≥ 2 écrans uniquement
supabase/
migrations/NNN_description.sql
seed.sql


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
- Après chaque migration, régénérer `lib/types.ts`.

### Tables v1

- `profiles` : main_position, secondary_position, club, birth_date
- `sessions` : date, type (`collectif` | `solo` | `match` | `recup` | `test`), name,
  duration_min, difficulty (1-5), comment, sheet_id → training_sheets nullable
- `training_sheets` : title, positions text[], skill, duration_min, exercises jsonb, is_public
- `tests` : name, protocol, unit
- `test_results` : test_id, date, value numeric, comment
- `questions` : situation, options jsonb (4 × { text, score 0-3, explanation }), theme,
  positions text[], level, source, is_public
- `answers` : question_id, chosen_index, score, answered_at
- `self_assessments` : date, grid jsonb

La streak est calculée côté app depuis `sessions` + `answers` (un jour compte si ≥ 1 séance
ou ≥ 1 réponse), jamais stockée.

## Écrans v1 (figés)

1. **Accueil** : streak, séances ce mois / all-time, calendrier du mois avec jours actifs,
   tap sur un jour → séances du jour (édition du commentaire), bouton « Séance libre »
   accessible en un tap → formulaire 4 champs (type, durée, difficulté, commentaire optionnel).
2. **Quizz** : filtre thème / poste, question QCM 4 options ; après réponse, affichage du
   score de l'option choisie et des 4 explications ; réponse enregistrée dans `answers`.
3. **Entraînement** : liste des fiches (poste, compétence, 45 min, 4 exercices) ;
   « Faire cette fiche » crée une séance liée. Section tests : protocole, saisie du résultat,
   historique.
4. **Profil** : données de profil, historique des résultats par test (liste + courbe simple),
   auto-évaluations (grille 64 compétences en jsonb, à migrer depuis l'outil existant).

## Hors périmètre v1 — ne pas proposer, ne pas préparer

API FFF, Elo, génération d'exercices paramétrable, plans d'entraînement, notifications,
écrans multi-utilisateurs, partage, mode hors-ligne, travail esthétique (thème, animations,
icônes custom, lib UI). Si une demande relève de cette liste, le signaler et ne pas coder.

Priorité absolue : fonctionnel > beau. Composants natifs par défaut, style minimal
(lisibilité, zones tactiles ≥ 44 px), rien de plus.

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
- Git : un commit par chantier, message en français à l'impératif
  (« Ajoute le formulaire de séance libre »). Pas de push automatique.

## Commandes

- `npx expo start` puis `w` / `a`
- `npx tsc --noEmit` avant chaque fin de chantier, zéro erreur exigée
- `npx supabase gen types typescript --project-id <id> > lib/types.ts`