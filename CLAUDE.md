# Strafoot

Outil de suivi d'entraînement football. Un seul utilisateur aujourd'hui (moi), mais tout est
prêt pour plusieurs comptes : données de l'utilisateur isolées par la RLS (user_id), contenu
partagé lisible par tout compte connecté et détenu par un compte technique (voir Base de
données). Inscription et écrans propres à plusieurs comptes : pas encore.

Objectif produit : logger une séance en moins de 15 secondes, répondre à un quiz
par jour, suivre ma progression (séances, tests physiques/techniques, auto-évaluations).

## Stack

- Expo SDK (dernier stable) + React Native + TypeScript strict
- Expo Router (navigation par fichiers, `app/`)
- @supabase/supabase-js appelé directement depuis le client, aucun backend
- Supabase Auth email/password ; session persistée via AsyncStorage
- Postgres via Supabase, RLS activée sur toutes les tables, policies sur `auth.uid() = user_id`
  (contenu partagé : lecture seule, select `or is_public`, voir Base de données)
- Pas de lib UI, pas de state manager, pas d'ORM, pas de lib de formulaires en v1
- react-native-svg (version du SDK, installée par `npx expo install`) : seule lib de dessin,
  importée uniquement dans app/measure/ (courbe d'une mesure), components/pitch-placeholder.tsx
  (terrain par défaut), components/flame.tsx (flamme de série) et components/diagram.tsx (schémas,
  voir Schémas) ; pas de lib de charts
- @expo/vector-icons (version du SDK, installée par `npx expo install` : le SDK 57 ne
  l'embarque plus) : Ionicons seulement (onglets, chevrons, coche de confirmation, coche d'une
  puce choisie, ▶ de démarrage, boutons icône, avatar de l'Accueil et du Profil, tuile d'un module,
  calendrier et chevron des lignes de choix, fermeture et retour d'une feuille, compétence de l'onglet
  Tests et de la carte Tests du Profil, tuiles de la carte Aujourd'hui, trophée des derniers records) ;
  aucune autre lib d'icônes
- expo-font (version du SDK) et @expo-google-fonts/barlow-condensed, installés par
  `npx expo install` (plugin expo-font ajouté dans app.json) : Barlow Condensed 600 et 700,
  seule police custom, chargée par app/_layout.tsx depuis les dossiers par graisse du paquet
  (`/600SemiBold`, `/700Bold` : son index embarquerait les 18 fichiers) ; voir Design system
- expo-haptics (version du SDK, installée par `npx expo install`) : importée seulement par
  lib/haptics.ts : `hapticSuccess` (ligne de mesure validée) et `hapticMedium` (tout
  enregistrement : séance libre, séance déjà faite, « Séance faite », fin de séance
  chronométrée via `vibrateOnSave`, test seul ou test d'une session, profil, séance club de la
  carte Aujourd'hui, objectif hebdomadaire, objectif créé, modifié ou retiré) ; rien sur le web,
  jamais d'erreur
- Pas de flou : expo-blur désinstallé au chantier 15 ; une feuille du bas pose un voile sombre seul
  (`colors.scrim`)
- Navigation : piles d'expo-router enveloppées par components/app-stack.tsx (pile native) et
  components/app-stack.web.tsx (pile JS embarquée, `expo-router/js-stack`, choisie par Metro sur le
  web : la pile native n'y anime rien) ; onglets `expo-router/js-tabs`. Pas de pile JS en natif :
  elle importerait react-native-gesture-handler (3.3.0 en transitif, SDK 57 = ~2.32.0)

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
_layout.tsx racine : providers, police d'affichage (useFonts) chargée derrière l'écran de chargement,
veille « Réduire les animations » (watchReduceMotion), pile racine animée (AppStack : un écran glisse de
droite, la pile session monte du bas)
(auth)/login.tsx
(tabs)/_layout.tsx (onglets en fondu), index.tsx (Accueil : en-tête et avatar, flammes, carte Aujourd'hui, bande
des jours, séances du jour, Cette semaine, Mes objectifs, Derniers records ; feuilles du mois, de l'objectif
hebdomadaire, d'ajout et de détail d'un objectif), quiz.tsx, training.tsx (Tests), profile.tsx (Profil : en-tête,
feuille Réglages, cartes Régularité, Tests, Quiz, Fiches, Volume)
session/_layout.tsx garde d'auth + pile des écrans de séance (hors onglets), qui monte du bas
session/new.tsx création d'une séance : derniers réglages lus à l'ouverture (getSessionDefaults : dernier module,
dernières durées ; en échec, valeurs par défaut et message), pré-remplie depuis une fiche (« Séance déjà faite » :
sheetId, module, nom, durée)
session/[id].tsx détail/édition/suppression d'une séance
session/finish.tsx fin d'une fiche ou d'une session de tests chronométrée : durée réelle (±5 ou saisie), difficulté,
commentaire, ou abandon tant que rien n'est enregistré ; session : séance de module test déjà créée par son 1er test,
mise à jour (updateSession), « N tests enregistrés sur M » ; au-delà de 3 h de chrono, « séance oubliée ? » : durée
de la fiche (durée prévue d'une session) ou du chrono
quiz/_layout.tsx garde d'auth + pile de la série ; quiz/run.tsx série de 5 questions puis récap ; réponse en deux
temps (sélection d'une option, puis « Valider » en pied, chantier 16) ; schéma de la question s'il en a un, entre
la situation et les options (lettres A-D, comme ses pastilles), au repos sans option, puis la sélection seule,
puis ton choix et la meilleure option
training/_layout.tsx garde d'auth ; training/[theme].tsx liste des fiches de lecture, ouverte par la carte Fiches du
Profil : une section par thème, celui de l'URL d'abord (Entraînements spécifiques, puis Récupération, vide), cartes
et ▶
sheet/_layout.tsx garde d'auth ; sheet/[id].tsx lecture d'une fiche (kind training seulement) écran par écran
test/_layout.tsx garde d'auth ; test/[slug].tsx un test atomique sur un écran : protocole, schéma, « Plus de tips »,
saisie des mesures (✓ par ligne, record et dernier), enregistrement seul ou dans une session, confirmation et records
profile/_layout.tsx garde d'auth ; profile/edit.tsx édition du profil (nom affiché, postes, pied fort, club, niveau,
date de naissance)
stats/_layout.tsx garde d'auth ; stats/[skill].tsx statistiques d'une compétence : familles → tests faits → une carte
par mesure (dernier résultat, date, record, évolution) → courbe ; stats/volume.tsx durée, séances et tests sur
30 jours et au total, puis par module
measure/_layout.tsx garde d'auth ; measure/[testId].tsx courbe, historique et suppression des résultats
(dossier sans index à côté d'un onglet du même nom : /quiz, /training et /profile restent les onglets ; /training
est l'onglet Tests)
dev/_layout.tsx garde d'auth ; dev/diagrams.tsx prévisualisation des schémas, ouverte seulement par l'URL
/dev/diagrams, liée nulle part : deux sources, « Dépôt » d'abord (les JSON de supabase/content/ importés dans le
bundle, liste REPOSITORY du fichier : un fichier numéroté nouveau s'y ajoute à la main ; de quoi relire un lot sur
la préversion avant tout seed), puis « Base » ; chaque schéma (questions avec les scores de leurs options,
diagram_data des exercices) dans ses états : repos, sélection de B, réponse pour chaque choix, réponse A avec tout
affiché (un seul état pour un test), puis les superpositions calculées par components/diagram-layout.ts (celles que
les seeds refusent) ; deux démonstrations du format en code
lib/
supabase.ts client unique
auth-context.tsx session, connexion, déconnexion : seul accès à supabase.auth ; un échec rend l'AuthError
entière (AuthFailure), que l'écran affiche par FieldError (code lu par describeError)
errors.ts describeError : toute erreur (message brut de lib/db, AuthError, exception, valeur quelconque) →
famille (identifiants, email non confirmé, réseau, session expirée, accès refusé, doublon, trop de tentatives,
inconnue), message français et texte d'origine en détail ; seule traduction des erreurs techniques ;
appMessage marque un message écrit par l'app (lib/db), affiché tel quel en message principal (pur, testé)
uuid.ts randomUuid (crypto.randomUUID, sinon repli Math.random sous Hermes) : id client d'une série du quiz,
d'une réponse, d'une séance (pur, testé)
active-session.ts séance en cours sur l'appareil (clé strafoot.activeSession), union par kind :
training (fiche, sheetId), test (test seul, sheetId + slug), session (sheetId ou null pour une session
proposée, slugs des tests, durée prévue, sessionId de la séance créée au 1er test) ; get / start / save /
clear sans exception ; formatElapsed et elapsedMinutes purs, testés par active-session.test.ts ; avec
lib/supabase.ts et lib/club-dismissal.ts, seuls fichiers à importer AsyncStorage
club-dismissal.ts « Pas ce soir » de l'entraînement club proposé (clé strafoot.clubDismissedDay : jour local
écarté) ; get / save sans exception
active-session-context.tsx séance en cours partagée (provider monté dans app/_layout.tsx,
useActiveSession : start, setIndex, updateRun pour une session), navigation vers elle (reprendre :
fiche, test, test en cours d'une session ; terminer), Alert « séance déjà en cours », confirmation
d'abandon, vibration d'enregistrement (vibrateOnSave, via haptics.ts)
haptics.ts hapticSuccess et hapticMedium : seul import d'expo-haptics, rien sur le web
reduce-motion.ts « Réduire les animations » (AccessibilityInfo ; prefers-reduced-motion sur le web) :
watchReduceMotion (démarré par app/_layout.tsx), useReduceMotion, isReduceMotionEnabled
theme.ts tokens du design system (couleurs, tailles et interlignes, police d'affichage, espacements,
rayons, dimensions, styles de texte et de champ, mouvement « motion », thème de navigation) : seule
source de style avec components/
dates.ts jours locaux YYYY-MM-DD et libellés, dont relativeDay (« auj. », « hier », « il y a 3 j »,
puis absolu), semaine (startOfWeek, weekDays, formatWeekRange, weekdayOf 0 = dimanche),
daysBetween (« J-42 »), formatLongDay (« Vendredi 9 octobre »), formatRecentDay (« aujourd’hui »,
« hier », « mar. 6 oct. »), formatDateLine (« Aujourd’hui · 09/10/2026 »), formatShortMonth (« Juil. », axe
de la régularité du Profil), formatMonthSpan (« Octobre », « Sept. – oct. » : titre de la bande des jours) et
timestampMs (instant d'un timestamptz) : seul endroit où un jour est calculé ; testés par dates.test.ts
modules.ts liste fermée des modules de séance (MODULE_KEYS), icône Ionicons de chaque module (moduleIcon),
modules hors flamme (NON_PERSONAL_MODULE_KEYS : entraînement club) et isPersonalWork
personal-work.ts travail personnel : jours de la flamme (activityDays), séances et minutes de la semaine
(weekWork), objectif hebdomadaire (3 par défaut, de 1 à 7) (pur, testé)
club.ts entraînement club proposé (J-7 ou J-14, aucun club aujourd'hui, pas écarté ; nom et durée du dernier) et
jours de club habituels (club des 14 derniers jours, point creux des jours à venir) (pur, testé)
goals.ts objectifs : progression (meilleur résultat depuis la création), états (J-12, atteint, échéance dépassée,
pas encore mesuré), cible saisie (meilleure que le départ, barème), échéance J+42 (pur, testé)
suggestion.ts test suggéré du jour et sa raison (objectif actif non atteint, jamais fait, ancien, en recul, le plus
ancien ; un objectif atteint reste affiché et compte dans la limite de 3, sans déclencher le premier critère) ;
partagé avec le chantier 17 (pur, testé)
day-strip.ts bande des jours de l'Accueil : 12 semaines en arrière, 14 jours devant, centrage (pur, testé)
training-themes.ts thèmes fermés des fiches de lecture (specifique, recuperation) et thème d'une fiche
test-families.ts compétences (tir, passe, dribble, jonglerie, physique ; libellé, icône Ionicons) et familles de
tests (liste fermée FAMILY_KEYS, libellé, compétence), rang d'une famille dans une session (sessionRank)
test-plan.ts proposeSession (famille la moins testée) et composeSession (famille choisie) : session de l'onglet
Tests, complétée par la compétence sans jamais reprendre une famille écartée (pur, testé)
records.ts record d'une mesure selon higher_is_better, isNewRecord, latestByKey (dernier résultat de chaque mesure
et valeur du précédent), recordHistory (records battus, les plus récents d'abord : Derniers records) (pur, testé)
profile-stats.ts calculs du Profil et de ses statistiques : 12 semaines de régularité (minutes, séances, séances de
travail personnel, tests ; semaines à l'objectif), volume du mois, tendance par compétence (mesures en progrès / en
recul), détail d'une compétence, durées (« 6 h 40 »), ligne d'en-tête, initiales de l'avatar (pur, testé)
quiz-taxonomy.ts listes fermées du quiz : thèmes, postes, barème
profile-taxonomy.ts postes du profil (ceux du quiz sans 'tous') et pieds forts
quiz-select.ts choix des questions d'une série (pur, testé)
measure-delta.ts évolution d'une mesure et format des valeurs (pur, testé)
sheet-types.ts format des fiches, tests et sessions (kind, exercises, intro, mesures, blocks ; test atomique =
un exercice ; diagram_data facultatif d'un exercice : schéma au format de diagram-types.ts), validation partagée
app / script
diagram-types.ts format des schémas (vues, dont zone (center, width_m) et local 2:1, joueurs, ballon, objets,
options 1-4, trajet, cotes, encart ; voir Schémas), validateDiagram / parseDiagram partagés app / scripts,
viewRegion, viewFrame (cadre d'une vue : 722 × 646, 722 × 542 ou 722 × 361), optionIdOfIndex (option affichée →
id du schéma), optionLetter (id 1-4 → lettre affichée A-D), bestOptionId (meilleure option d'une question),
formatMeters / formatDistance (« 1,5 m ») (pur, testé par diagram-types.test.ts)
json-types.ts contenu des autres colonnes jsonb (questions.options)
diagrams.ts URL publique d'un schéma du bucket diagrams, dimensions des PNG et du terrain par défaut (722 × 646 ;
les cadres des vues dessinées : viewFrame de diagram-types.ts)
db/ une fonction par requête, typée (sessions.ts, dont createSession idempotente (id client, on conflict (id)
do nothing, puis relecture), getSessionDefaults : dernier module et dernière durée par module, et
listSessionActivity : jour, module, durée, nom et instant de chaque séance ; answers.ts, dont createAnswer,
idempotente de même ; questions.ts : listEligibleQuestions (schéma validé), listQuestionDiagrams
(/dev/diagrams) ; profiles.ts (dont l'objectif hebdomadaire, par upsertMyProfile) ; goals.ts : objectifs actifs,
createGoal idempotente de même, updateGoal (cible, échéance), retireGoal (retired_at, ligne conservée) ;
training.ts : fiches, countSheets, listTests (tests atomiques avec dernière fois, records et dernier résultat de
chaque mesure, deux lectures), listSessions, getTestBySlug ; test-results.ts, dont listTestCatalog,
listCatalogByKeys, listResultValues et listResultHistory : tous mes résultats horodatés, records et objectifs de
l'Accueil) ; activity.ts : listActivityHistory, séances et réponses de tout l'historique en deux lectures (jours
actifs, jours de travail personnel de la flamme, séances pour le club et la semaine : Accueil, feuille du mois) ;
fetch-all.ts : fetchAllRows, toute lecture de liste page par page (range de 1000 lignes, tri total terminé par
id, arrêt à la première page incomplète, garde-fou de 100 pages ; testé par fetch-all.test.ts) ; result.ts :
contrat { data, error }, error = message brut, ou message de l'app marqué par appMessage
streak.ts calcul pur, testable, sans dépendance
types.ts types générés depuis Supabase (npx supabase gen types)
components/ design system et composants réutilisés par ≥ 2 écrans uniquement
screen.tsx cadre d'écran : fond, marges, zones sûres (sur le web, sans doubler celles de l'en-tête et de la
barre d'onglets), clavier, titre 28, pied fixe de l'action principale, confirmation flottante (prop toast)
card.tsx carte (surface, rayon 16, marge 16, sans ombre), tappable avec onPress (0,98 et fond
surfacePressed à l'appui), mise en évidence par bordure et teinte accent ou quiz (prop tone)
chip.tsx puce de choix, la seule de l'app (48 px ; choisie : teinte 14 %, contour 1,5 px et coche ;
tone quiz en contexte quiz)
button.tsx bouton primary / quiz / secondary / danger / text, 56 px, libellé 16/20 700, icône après
le libellé, états pressé (0,98 et un cran plus sombre), désactivé, loading
press-scale.ts usePressScale : micro-interaction a, partagée par Card et Button
icon-button.tsx bouton icône carré de 48 px (flèches, ✓ d'une mesure, ✓ de l'entraînement club, − / + de l'objectif
hebdomadaire) ; subtle (sans fond, icône textMuted : ‹ › des feuilles, retour et Fermer d'une feuille, engrenage du
Profil) et compact (32 px visibles, 48 par hitSlop : ‹ › de la bande des jours)
module-icon.tsx tuile d'un module : carré de 48 px surface2, icône Ionicons de lib/modules.ts (carte d'une séance,
ligne et feuille de choix du module, entraînement club proposé)
avatar.tsx avatar rond surface2 : initiales du nom affiché, sinon l'icône personne ; le même sur l'Accueil (48 px,
tappable, vers le Profil) et le Profil (56 px, décoratif)
day-cell.tsx case d'un jour (numéro, aujourd'hui encadré accent, jour choisi surface2, points entraînement / quiz,
point creux orange d'un club prévu, jour à venir en secondaire, inerte, estompé ou non) et ActivityLegend (« Club
prévu » en option) : les mêmes dans la bande des jours et la grille du mois
bottom-sheet.tsx feuille du bas : Modal transparente, voile sombre (scrim, sans flou), feuille surface aux coins xl
qui glisse en motion.screen (micro-interaction f), ‹ de retour (onBack, feuille à plusieurs vues), titre et
Fermer, fermeture au tap sur le voile ; porte la feuille du mois, le choix du module, la session proposée (une
feuille, trois vues : proposition, choix d'une famille, session prédéfinie) de l'onglet Tests, les Réglages du
Profil, l'objectif hebdomadaire et les objectifs de l'Accueil
month-sheet.tsx MonthCalendar (mois ‹ ›, grille de DayCell, légende ; mode browse : jours à venir inertes et clubs
prévus, pick : date d'une séance, jours à venir inertes, mois suivant bloqué, deadline : échéance d'un objectif,
jours à venir seulement, sans points) et MonthSheet, le calendrier en BottomSheet (browse ou pick, historique relu
à chaque ouverture)
app-stack.tsx / app-stack.web.tsx pile d'écrans animée (micro-interaction g) : pile native d'expo-router en natif
(animations du système), pile JS (expo-router/js-stack) sur le web (Metro prend le .web.tsx) ; prop rising : routes
qui montent du bas
save-toast.tsx confirmation d'enregistrement qui glisse du bas en 240 ms, 2 s (micro-interaction c)
pitch-placeholder.tsx demi-terrain SVG (lignes fieldLine) affiché quand un exercice n'a pas de schéma
diagram.tsx schéma dessiné depuis ses données (react-native-svg, cadre de sa vue, sans animation) : terrain
(lignes fieldLine), joueurs, flèches de vitesse, ballon, objets, trajet d'un test, cotes, options A-D (trait ; un
hold : sa seule pastille) et leurs pastilles, encart score · minute ; états repos / selected / result (prop
showAll), voir Schémas ; exporte OptionBadge, la pastille (lettre) d'une option dans les réponses du quiz
diagram-layout.ts géométrie des schémas, sans react-native ni dessin : cadre par vue, terrain, flèches, traits des
options, places des pastilles (celle d'un hold accolée au halo), cotes
et étiquettes (règles : voir Schémas) ; états (DiagramState, visibleOptionIds, allStates, describeState) et
détection des superpositions (findOverlaps, marge CLEARANCE) ; pur, testé par diagram-layout.test.ts sur les
schémas pilotes de supabase/content/diagrams_001.json (scores lus dans questions_001.json), dans tous leurs états
stat.tsx chiffre dominant 44 px en police d'affichage, libellé, dénominateur à 40 % et unité en
secondaire, élément de tête optionnel (flamme)
duration-value.tsx durée en chiffre dominant (text.number) : « 6 h 40 », « 45 min », unité en secondaire dans le
chiffre (carte Volume du Profil, écran des volumes)
flame.tsx flamme de série (SVG, silhouette de l'icône « flame » d'Ionicons : base arrondie, cran à gauche,
pointe effilée un peu courbée, langue intérieure évidée) : faite (pleine), à faire (contour), perdue (grise,
jamais rouge), orange ou violet ; ne s'anime qu'en se remplissant (micro-interaction d)
empty-state.tsx état vide : ce qui manque, quoi faire, le bouton pour le faire
field-error.tsx erreur sous un champ ou au-dessus de l'action qui a échoué : prop message (texte de l'app,
déjà en français, tel quel) et prop error (erreur reçue, brute : message de describeError, puis texte
d'origine en secondaire, sélectionnable) ; seul affichage d'une erreur reçue
session-form.tsx formulaire de séance partagé par session/new et session/[id] : module en une ligne
(tuile, libellé, tap → feuille des modules), date en une ligne (« Aujourd’hui · 09/10/2026 », tap →
MonthSheet en mode pick), durée automatique du module (durationDefaults : dernière durée, sinon celle du
module, tant qu'elle n'est pas modifiée à la main), difficulté, nom, commentaire ; exporte DurationField
(chiffre dominant text.number saisissable de 1 à 600 min, −5 / +5 en boutons compacts), DifficultyField,
CommentField, repris par session/finish, et automaticDuration / newSessionFormValues
active-session-bar.tsx bandeau « En cours · titre · 12:34 » au-dessus de la barre d'onglets
(prop tabBar de (tabs)/_layout.tsx), et l'échec éventuel de mémorisation de la séance ; exporte
useElapsedLabel et HeaderClock, le même chrono dans l'en-tête de la fiche ou du test en cours
start-row.tsx carte d'une fiche, d'un test ou d'une session et ▶ à sa droite (deux cibles voisines)
exercise-content.tsx morceaux d'un exercice partagés par fiche et test : schéma dessiné (diagram_data), sinon
PNG du bucket, sinon terrain par défaut ; intertitre, liste (numéros en orange), contenu de « Plus de tips »
scripts/ générateurs des seeds, lancés avec npx tsx (build-seed-questions.ts : questions depuis questions_NNN.json,
et leurs schémas depuis diagrams_NNN.json du même numéro ; build-seed-sheets.ts : fiches,
tests atomiques et sessions depuis sheets_NNN.json, tests_atomic_NNN.json et sessions_NNN.json, validés sans être
réécrits) ; diagram-rules.ts : règles de contenu des schémas (chantier 16, voir Schémas), module pur partagé par
les deux seeds, jamais embarqué dans l'app, testé par diagram-rules.test.ts sur tout supabase/content/ ;
run-tests.ts : lance chaque *.test.ts de lib/, components/ et scripts/ dans son processus (npm run test)
supabase/
migrations/NNN_description.sql
seed.sql données de démonstration du chantier 1 (UUID en dur) : ne plus relancer, il recréerait du contenu
privé (3 fiches, 2 tests, 5 questions) sous le compte donné
seed_questions_NNN.sql, seed_sheets_NNN.sql générés par scripts/ : ne pas modifier à la main ; lancés pour le
compte technique (voir Base de données)
transfer_content_owner.sql transfert unique du contenu de mon compte au compte technique (chantier 14) :
deux marqueurs d'UUID remplacés dans le SQL Editor, idempotent, requêtes de contrôle en fin de fichier
content/ JSON sources des seeds, édités à la main (questions ; diagrams_NNN.json : schémas des questions de
questions_NNN.json, { situation, diagram } ; sheets_NNN.json : fiches de lecture ;
tests_atomic_NNN.json : tests atomiques ; sessions_NNN.json : sessions prédéfinies ; pour ces trois sortes,
plusieurs fichiers numérotés permis, NNN sur 3 chiffres) et PNG des schémas (diagrams/) ; archive/ : tests_001.json
(batteries d'avant le chantier 10, source des tests atomiques jusqu'au 10b), à ne plus éditer, jamais lu
public/ fichiers servis à la racine du site web, copiés dans dist/ par l'export
index.html HTML racine du web, gabarit SPA d'Expo (pas d'app/+html.tsx : lu seulement en sortie static)
manifest.webmanifest nom, couleurs et icônes de l'app installée sur l'écran d'accueil
apple-touch-icon.png (180 px), icon-192.png, icon-512.png, icon-1024.png (expo.icon), favicon.png (expo.web.favicon)
vercel.json déploiement Vercel : build, réécriture SPA, en-têtes de cache


Toute lecture/écriture Supabase passe par `lib/db/`. Aucun appel `supabase.from()` dans
un écran. Les fonctions de `lib/db/` retournent `{ data, error }` et ne lancent pas
d'exception ; error est le message brut (traduit à l'affichage, voir Conventions) ou un message
écrit par lib/db, marqué par `appMessage` (affiché tel quel). Aucun filtre
explicite par user_id : la RLS choisit les lignes (les miennes, et le contenu public).

## Conventions

- TypeScript strict, pas de `any`, pas de `// @ts-ignore`.
- Nommage : fichiers en kebab-case, composants en PascalCase, fonctions/variables en
  camelCase, tables et colonnes SQL en snake_case.
- Dates stockées en `date` (séances) ou `timestamptz` (réponses). Jamais de string libre.
  Le jour courant est calculé en heure locale, pas en UTC (sinon une séance à 23h30
  compte pour le lendemain).
- Interface en français uniquement, sans système de traduction (pas d'i18n).
- Chaque écran gère explicitement ses états : chargement, vide, erreur, données.
  Toute erreur reçue (Supabase, Auth, réseau, appareil, exception) s'affiche par
  `<FieldError error={…} />`, donc traduite par `describeError` (lib/errors.ts) : message
  français (identifiants invalides, réseau indisponible, session expirée, accès refusé,
  doublon… ; sinon message générique), texte d'origine en détail, en secondaire : jamais
  avalée. Le texte écrit par l'app (validation d'un champ, consigne) passe par la prop
  `message` ; avec les deux, le message de l'app vient d'abord. Un message que lib/db
  écrit lui-même (« Séance introuvable : rien n'a été supprimé. ») passe par
  `appMessage` (lib/errors.ts) : affiché tel quel, en message principal, sans message
  générique ni détail ; une cause technique reconnue l'emporte toujours.
- Pas d'optimisation prématurée : pas de cache, pas de pagination à l'écran.
- Lectures complètes : toute lecture de liste de lib/db passe par `fetchAllRows`
  (lib/db/fetch-all.ts : pages de 1000 lignes par range, tri total terminé par id),
  jamais plafonnée en silence au « Max rows » de Supabase (1000, à ne jamais baisser) ;
  seules les lectures bornées (une ligne, `.limit`, quelques keys) s'en passent.
- Idempotence : toute création (séance, réponse) porte un id tiré côté client
  (lib/uuid.ts) une fois par enregistrement, avant le premier envoi, puis renvoyé tel quel
  à chaque réessai : insert … on conflict (id) do nothing, puis relecture ; un second envoi
  ne crée rien et compte comme un succès. L'écran qui crée garde aussi une garde
  synchrone (`pendingRef`) contre le double tap.

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
  RLS activée, 4 policies (select/insert/update/delete) sur `auth.uid() = user_id` (contenu
  partagé : une seule, select `or is_public`, ci-dessous).
- Deux sortes de données (depuis 010, chantier 14) ; toute nouvelle table choisit l'une des
  deux et le dit dans sa migration :
  - **contenu partagé** : `questions`, `training_sheets` (fiches de lecture, tests atomiques,
    sessions prédéfinies), `tests` (catalogue des mesures) ; demain bornes /99, principes
    tactiques… Colonne `is_public` ; une seule policy, en lecture : `auth.uid() = user_id or
    is_public` (tout compte connecté) ; aucune policy insert, update ni delete : l'app n'écrit
    jamais le contenu, seuls les seeds et le transfert l'écrivent, en rôle postgres (SQL
    Editor), que la RLS ne concerne pas ;
  - **données de l'utilisateur** : toutes les autres tables (profils, séances, résultats,
    réponses, auto-évaluations, objectifs depuis 011 ; demain Elo, planning club…) : 4 policies sur
    `auth.uid() = user_id`.
- Compte technique « contenu » : compte Supabase Auth créé à la main dans le tableau de bord
  (Add user, « Auto Confirm User »), jamais connecté à l'app, propriétaire de tout le contenu
  depuis le transfert (supabase/transfer_content_owner.sql : mêmes lignes, mêmes id,
  is_public = true ; mes réponses, résultats et séances restent liés). Mon compte ne possède
  plus aucun contenu. Ne jamais supprimer le compte technique : la cascade effacerait le
  contenu, et avec lui les réponses et résultats de tous les comptes.
- Seeds (seed_questions_NNN.sql, seed_sheets_NNN.sql) : lancés avec l'UUID du compte technique
  (marqueur `<REMPLACER_PAR_CONTENU_UUID>`, remplacé dans le SQL Editor, jamais commité), après
  010 et le transfert ; ils posent `is_public = true` et refusent un compte qui a des séances,
  réponses ou résultats (le mien, par erreur).
- Depuis 002, `user_id` a le défaut `auth.uid()` sur les 8 tables de 001 (et sur goals depuis
  011), en plus du trigger `set_user_id` (001, posé aussi sur goals) qui l'impose à chaque
  insert : le client n'envoie jamais `user_id`.
- Après chaque migration, régénérer `lib/types.ts`.

### Tables v1

- `profiles` : main_position, secondary_position (8 postes de `lib/profile-taxonomy.ts`,
  CHECK, null permis), strong_foot (`droit` | `gauche` | `ambidextre`, CHECK, null permis),
  club, club_level (niveau, texte libre court), birth_date ; un profil par utilisateur
  (index unique sur user_id depuis 005) ; depuis 006 : goal (objectif, 140 caractères au
  plus) et goal_deadline (date, échéance de l'objectif), ni affichés ni modifiés par l'app depuis
  le chantier 12 (données conservées ; les objectifs vivent dans goals depuis 011) ; depuis 008 :
  display_name (nom affiché, 40 caractères au plus, limite posée par l'écran d'édition ; initiales de
  l'avatar de l'Accueil et du Profil) ; depuis 011 : weekly_session_goal (smallint, CHECK de 1 à 7,
  null = pas encore réglé, 3 dans l'app : séances de travail personnel visées par semaine)
- `goals` (011, données de l'utilisateur) : sheet_id → training_sheets (test atomique), test_id →
  tests (mesure : résultats, courbe), start_value numeric null (dernier résultat à la création, null si
  jamais mesurée), target_value numeric, deadline date, retired_at timestamptz null (null = actif ; retiré :
  ligne conservée). Progression, atteint et échéance dépassée calculés par lib/goals.ts ; 1 à 3 objectifs
  actifs (un objectif atteint en fait partie tant qu'il n'est pas retiré) : règle de l'app ; une mesure par
  objectif actif : index unique partiel `goals_one_active_per_test` (user_id, test_id) where retired_at is
  null, en plus de l'app (une mesure qui porte un objectif actif n'est pas proposée) ; un second objectif
  actif sur la même mesure est refusé par Postgres (23505) et s'affiche par FieldError comme un doublon
- `sessions` : date, type (`collectif` | `solo` | `match` | `recup` | `test`),
  module text not null default 'seance_libre' (liste fermée = `MODULE_KEYS` de
  `lib/modules.ts`, contrainte `sessions_module_check_v2` depuis 004 ; `test` est réservé à
  l'enregistrement d'un test et absent du formulaire), name text, duration_min,
  difficulty (1-5), comment, sheet_id → training_sheets nullable
- `training_sheets` : title, positions text[] (postes de `lib/quiz-taxonomy.ts`, CHECK),
  skill, duration_min, exercises jsonb, is_public ; depuis 004 : slug (clé du contenu
  versionné, unique par utilisateur), kind (`training` : fiche de lecture | `test` : test
  atomique | `session` : suite de tests, CHECK `training_sheets_kind_check_v2` depuis 007),
  subtitle, intro jsonb, pdf_url ; depuis 007 : family (famille d'un test, CHECK sur
  `FAMILY_KEYS` de `lib/test-families.ts`, null sinon), blocks text[] (slugs ordonnés des tests
  d'une session, null sinon), index (user_id, kind). Format d'exercises, d'intro et de blocks :
  `lib/sheet-types.ts` ; les mesures d'un test sont dans exercises[0].measures
- `tests` : catalogue des mesures : name, protocol (« Test <Compétence> — <titre du test> », écrit par le
  seed : même valeur qu'avant le découpage, « titre de la batterie — titre du bloc »), unit ;
  depuis 004 : key (identifiant stable, unique par utilisateur, null pour les 2 tests de
  démonstration, lus par aucun écran), higher_is_better (false pour les chronos) ; depuis 010 :
  is_public (contenu partagé)
- `test_results` : test_id, date, value numeric, comment ; depuis 004 : session_id → sessions
  (séance de type test qui a produit le résultat, on delete set null)
- `questions` : situation, options jsonb (4 × { text, score 0-3, explanation }), theme,
  positions text[] (listes fermées de `lib/quiz-taxonomy.ts`, CHECK depuis 003 ; `tous` =
  valable pour tous les postes), level, source, is_public ; depuis 009 : diagram jsonb (schéma au
  format de `lib/diagram-types.ts`, null permis, CHECK null ou objet ; voir Schémas)
- `answers` : question_id, chosen_index, score, answered_at ; depuis 003 : quiz_run_id (uuid
  client de la série), flagged (réponse signalée contestable)
- `self_assessments` : date, grid jsonb

Storage : bucket public `diagrams` (004), lecture publique, aucune policy d'écriture. Les PNG
de `supabase/content/diagrams/` y sont déposés à la main, sous le nom exact du champ diagram.

Ne plus ré-exécuter 002 après 004 : elle recréerait `sessions_module_check`, sans `test`.

Modèle des tests (007, chantier 10) :
- **Test atomique** = `training_sheets` kind `test`, exactement un exercice (10-15 min, 1 à 3
  mesures, saisies sur l'écran du test) et une `family`.
- **Famille** = sous-type d'une compétence, liste fermée dans `lib/test-families.ts` (clé, libellé,
  compétence) ; une famille sans test en base n'est pas affichée.
- **Session** = kind `session` : skill (compétence), blocks (slugs des tests, dans l'ordre de
  passage), duration_min = somme de ses tests. Les 5 batteries d'avant 007 sont les 5 sessions
  prédéfinies (mêmes id et slugs, séances liées conservées) ; leurs exercises restent stockés
  sans être lus. Une session proposée par l'app n'a pas de ligne.
- Un résultat (`test_results`) garde test_id (ligne du catalogue `tests`, par key, inchangé) et
  session_id (séance module `test`) ; un test fait seul a sa séance (sheet_id = le test), une
  session une seule séance pour tous ses tests (sheet_id = la session prédéfinie, ou null).
- Contenu (depuis 10b) : `tests_atomic_NNN.json` et `sessions_NNN.json` sont la source, éditée à la main ;
  les 18 premiers tests sont les 18 blocs des batteries de `tests_001.json`, archivé (slug
  `<slug-batterie>-<n>`, intro = celle de la batterie, montrée en « Règles communes »). Un test ou une
  session retiré des JSON reste en base : le seed ne supprime rien.

Deux streaks calculées côté app, jamais stockées : entraînement (jour avec ≥ 1 séance de
travail personnel : tout module sauf la liste fermée `NON_PERSONAL_MODULE_KEYS` de
lib/modules.ts, aujourd'hui l'entraînement club ; le match n'est pas un module, il deviendra
une entité au chantier 22) et quiz (jour avec ≥ 1 réponse). Les séances club restent visibles
partout ailleurs (séances du jour, points du calendrier, jours actifs, Profil sauf la
Régularité à l'objectif). Courante = jours consécutifs jusqu'à aujourd'hui, ou jusqu'à hier si
aujourd'hui est vide ; on affiche aussi la meilleure. Logique dans `lib/streak.ts` (sur
l'ensemble de jours reçu), tests dans `lib/streak.test.ts` ; jours de travail personnel :
`lib/personal-work.ts`.

## Écrans v1 (figés)

Onglets, dans l'ordre : Accueil · Tests · Quiz · Profil.

1. **Accueil** (chantier 15, maquette design/maquettes/ecran-accueil.png pour le haut) : la page
   défile, « Nouvelle séance » reste collé en bas. De haut en bas :
   - en-tête : date du jour en secondaire (« Vendredi 9 octobre »), « Aujourd’hui » en headline,
     avatar de 48 px (components/avatar.tsx, le même que le Profil, surface2 : initiales du nom
     affiché, sinon icône personne) → onglet Profil ;
   - deux cartes de streak tappables (Entraînement → Profil, Quiz → Quiz) : flamme et chiffre
     courant (text.number), libellé en title, ligne d'état « À faire aujourd’hui » (couleur de la
     série) tant que rien n'est fait et que la série tient, « ✓ Fait aujourd’hui » (secondaire)
     sinon, « Série perdue » (secondaire) à 0 ; la flamme est pleine, contour ou grise selon le
     même état ; après une action qui augmente la série, la flamme se remplit puis le chiffre passe
     à sa nouvelle valeur. La flamme d'entraînement ne compte que le travail personnel : une séance
     club ne la remplit pas ;
   - carte « Aujourd’hui » (lignes lancées en un tap) : « Entraînement club ce soir ? » (lib/club.ts :
     séance club à J-7 ou J-14, aucune aujourd'hui, pas écartée ; nom et durée de la dernière de ce
     jour de la semaine, nom automatique refait pour aujourd'hui), ✓ crée la séance du jour
     (idempotente, vibration, confirmation), « Pas ce soir » l'écarte pour la journée (sur
     l'appareil, lib/club-dismissal.ts) ; « Quiz du jour » → onglet Quiz, « ✓ Fait » dès une réponse
     du jour ; « Test suggéré : titre » et sa raison (lib/suggestion.ts) → écran du test, masquée si
     un test a été fait aujourd'hui ; rien à proposer : « Journée faite » seule ;
   - bande des jours (titre : mois visibles, « Octobre », « Sept. – oct. ») : continue, 7 jours
     visibles, aujourd'hui centré à l'ouverture, glissée au doigt avec aimantation jour par jour
     (accrochage CSS sur le web, snapToInterval en natif), ‹ › compacts décalent de 7 jours sans
     animation ; de 12 semaines en arrière à 14 jours devant (plus loin en arrière si un jour plus
     ancien est choisi dans le mois, pour le centrer) ; DayCell (numéro en police système, aujourd'hui
     encadré accent, jour choisi surface2, points entraînement / quiz de toute séance), jours à venir
     inertes avec un point creux orange les jours de club habituels (jours de la semaine ayant une
     séance club de J-14 à aujourd'hui, jusqu'à J+14) ; légende Entraînement · Quiz · Club prévu et
     « Voir le mois » → feuille du mois (MonthSheet, voile sombre) : mois ‹ ›, jours à venir inertes,
     un jour touché ferme la feuille, le choisit et centre la bande sur lui ;
   - « Séances du jour » (« Séances · hier », « Séances · mar. 6 oct. ») : une carte par séance
     (tuile du module, nom, « module · durée · difficulté », chevron) → édition / suppression ; état
     vide en texte secondaire ;
   - « Cette semaine » (lundi → dimanche) : séances de travail personnel sur l'objectif hebdomadaire
     en chiffre dominant (« 2/3 »), puis « 4 jours actifs · 1 h 35 de travail perso » (jours avec
     séance ou réponse, tout module) ; tap → feuille de l'objectif hebdomadaire (− / +, de 1 à 7,
     3 par défaut, Enregistrer : profiles.weekly_session_goal) ;
   - « Mes objectifs » : un objectif actif par carte (nom de la mesure et état : « J-12 », « Jour J »,
     « Atteint ✓ hier » ou « le 3 nov. » en vert, « Échéance dépassée », « Pas encore mesuré » ;
     « 8 → 20 touches » ou « Cible : 20 touches » sans départ ; barre de progression orange, verte une
     fois atteint) ; tap → feuille de l'objectif (cible et échéance modifiables, la cible toujours
     meilleure que le départ, Enregistrer, « Voir la courbe » → app/measure/[testId], « Retirer
     l’objectif » avec confirmation) ; « Ajouter un objectif » → feuille en étapes : test (par
     compétence), mesure (dernier résultat, date et record ; étape sautée pour un test à une seule
     mesure ; une mesure qui porte déjà un objectif actif est inerte), cible (message sous le champ
     si elle ne bat pas le départ ou dépasse le barème), échéance (J+42 proposée, calendrier des jours
     à venir), « Créer l’objectif » ; aucun objectif : état vide avec le bouton ; 3 objectifs actifs :
     le bouton est remplacé par un texte ;
   - « Derniers records » : les 3 records les plus récents (résultat strictement meilleur que tous
     les précédents de sa mesure ; le premier n'en est pas un) : nom, date relative, valeur ; tap →
     courbe de la mesure ; section masquée s'il n'y en a aucun.
   Bouton « Nouvelle séance » → formulaire : module = dernier utilisé (hors test, sinon séance
   libre) en une ligne, tap → feuille des modules ; date « Aujourd’hui · 09/10/2026 » en une ligne,
   tap → feuille du mois en mode sélection (jours à venir inertes) ; durée = dernière durée du module
   choisi, sinon celle du module, suit le module tant qu'elle n'est pas modifiée à la main, chiffre
   dominant avec −5 / +5 compacts ou saisie de 1 à 600 min ; difficulté optionnelle = 3 si vide, nom
   auto modifiable, commentaire optionnel. Les derniers réglages sont lus à l'ouverture ; en échec,
   le formulaire s'ouvre avec les valeurs par défaut et le dit.
2. **Quiz** (violet : bouton principal, puces, option choisie) : filtre thème / poste (replié par
   défaut, mémorisé tant que l'app tourne), stats (total, moyenne
   sur 7 jours, streak) ; séries de 5 questions QCM 4 options (jamais vues, puis dernier
   score ≤ 1, puis les plus anciennes) ; après réponse, affichage du score de l'option
   choisie et des 4 explications, jamais « la bonne réponse » ; réponse enregistrée dans
   `answers`, signalement d'une réponse contestable, récap de la série. Réponse en deux temps
   (chantier 16, avancée du chantier 18) : toucher une option la sélectionne (carte en tone quiz ;
   toucher une autre change la sélection), « Valider » (bouton principal, variante quiz, inactif sans
   sélection, en cours pendant l'enregistrement) enregistre la réponse (id client, pendingRef), puis
   la suite inchangée ; même flux sans schéma. Question à schéma : le schéma entre la situation et
   les options, chaque option précédée de la pastille de sa lettre (A-D) ; au repos le schéma ne
   dessine aucune option, la sélection dessine la seule option sélectionnée (violet, avec sa
   pastille), puis la réponse confirmée montre ton choix et la meilleure option, chacune dans la
   couleur de sa catégorie (result) ; les pastilles des réponses prennent les mêmes couleurs.
3. **Tests** (onglet ; titre d'écran « Tests » depuis le chantier 10), de haut en bas : bouton
   « Proposer une session » → feuille du bas : la session de `proposeSession` (lib/test-plan.ts :
   famille la moins testée sur 28 jours, jamais testée d'abord, puis la plus anciennement testée ;
   ses tests jamais faits ou les plus anciens, complétés par les autres familles de la compétence
   jusqu'à 3 ; 4 tests et 60 min au plus ; vitesse et agilité d'abord, endurance en dernier), sa
   famille et sa dernière fois, ses tests et sa durée, « Démarrer », « Changer de famille » (la
   famille écartée ne revient plus, pas même pour compléter) ou « Choisir une famille » (même
   feuille : puces des familles ayant au moins un test, par compétence ; session composée par
   `composeSession` à partir de la famille touchée, complétée par sa compétence) ;
   « Sessions » : une carte par session prédéfinie (titre, nombre de tests, durée, dernière fois ;
   tap → feuille de ses tests et « Démarrer ») et ▶ ; « Tests par famille » : une section par
   compétence (icône, libellé), puces de ses familles repliées (une dépliée par compétence,
   mémorisée tant que l'app tourne), lignes de test (titre, durée, dernière fois, record de la
   1re mesure) et ▶. Les fiches de lecture s'ouvrent depuis la carte Fiches du Profil. États vides
   sans bouton : le contenu vient des seeds.
   **Écran d'un test** (app/test/[slug].tsx, maquette ecran-test.png) : titre, « Compétence ·
   Famille · durée » en caption, carte « PROTOCOLE » (consignes numérotées en orange), schéma
   (dessiné depuis diagram_data, sinon PNG, sinon terrain par défaut), « Plus de tips » (objectif,
   but, critères, points techniques, variables,
   surface / séquence / effectif, règles communes), « MESURES » : une ligne par mesure (libellé et
   unité, champ pré-rempli en gris de la dernière valeur, ✓ par ligne qui en fait la valeur saisie,
   « Record : … · Dernier : …, il y a 3 j » ou « Jamais mesuré »), commentaire facultatif hors
   session ; « Enregistrer » actif quand toutes les lignes sont validées. Les mesures d'un test ne
   se saisissent que là ; une valeur par mesure (pas de « meilleur essai »). Hors session : séance
   module `test` liée au test (durée du test, ou durée réelle si ▶ l'a démarré ; jour de
   l'ouverture ou du démarrage), puis ses `test_results` en un seul insert ; la confirmation
   remplace la saisie : chaque valeur, « Nouveau record · avant : … » (success, sans rebond) sur
   chaque mesure strictement améliorée (premier résultat : rien), « Faire un autre test » (onglet)
   ou « Voir ma progression » (Profil, carte Tests mise en vue). En session : en-tête « Test
   2 / 4 » et chrono ; le 1er test enregistré crée la séance de la session (module `test`, nom de
   la session, liée à la session prédéfinie ou sans fiche, jour du démarrage), mémorisée dans la
   séance en cours ; chaque test y rattache ses résultats (un envoi déjà arrivé n'est jamais
   doublé) ; « Enregistrer » enchaîne sur le test suivant, où sa confirmation glisse ; tant
   qu'aucun résultat n'est enregistré, « Abandonner la session » (confirmation, rien créé) à la
   place de « Terminer » ; dès le premier, « Terminer » (secondaire) à chaque test sauf le
   dernier, dont l'action principale « Terminer la session » enregistre puis ouvre l'écran de fin.
   Fiches de lecture (app/sheet/[id].tsx) : présentation, puis un exercice par écran
   (schéma dessiné, PNG ou terrain par défaut, titre, durée, Objectif, But, Consignes ; « Plus de tips » déplie
   critères, points techniques, variables, surface / séquence / effectif, état gardé pendant la
   lecture), « Séance faite » (séance `entrainement_specifique` liée) ; « Séance déjà faite » sur
   la présentation → formulaire de séance pré-rempli (fiche, module, nom, durée ; date auj.
   modifiable). Les statistiques des tests (records, tendances, courbes) sont dans le Profil.
   **Séance en cours** (une seule) : ▶ d'une fiche, d'un test ou d'une session, « Démarrer » sur
   la présentation d'une fiche ou dans la feuille d'une session ; une autre en cours → Alert
   « Reprendre / Terminer l'autre d'abord / Annuler ». Bandeau « En cours · titre · 12:34 » sur
   les 4 onglets, tap → la fiche à sa dernière étape, le test, ou le test en cours de la session
   (sa fin si tous sont passés) ; le même chrono dans l'en-tête de la fiche ou du test en cours.
   Fiche : « Terminer » (secondaire) à chaque écran sauf le dernier ; Terminer / « Séance faite »
   → écran de fin (durée réelle arrondie, ±5 ou saisie de 1 à 600 min ; au-delà de 3 h de chrono,
   « séance oubliée ? » avec « Durée de la fiche » (« Durée prévue » d'une session) présélectionnée
   ou « Durée du chrono » ; difficulté ; commentaire) → séance liée, vibration, confirmation sur
   l'onglet ; « Abandonner la séance » → rien créé. Test seul : il se termine sur son écran
   (Enregistrer, à la durée réelle) ; abandon possible avant. Session : l'écran de fin complète
   la séance déjà créée (ou la crée si aucun test n'a été enregistré, « Abandonner la session »
   restant alors possible). Date d'une séance chronométrée : jour local du démarrage.
4. **Profil** (tableau de bord, maquette design/maquettes/ecran-profil.png ; un seul titre :
   l'en-tête) : avatar de 56 px (components/avatar.tsx, le même que l'Accueil : initiales du nom
   affiché, sinon icône personne), nom affiché (sinon l'email), « poste · club · niveau » en
   caption (parties absentes omises), engrenage → feuille « Réglages » (« Modifier le profil » ;
   « Déconnexion », avec confirmation). Cartes, à 12 px l'une de l'autre : **Régularité** (12
   dernières semaines en barres, la courante à droite, une semaine à 0 en trait gris ; puces
   Minutes · Séances · Tests, choix mémorisé tant que l'app tourne ; « N/12 semaines à
   l’objectif » (séances de travail personnel ≥ objectif hebdomadaire) en chiffre dominant ; mois
   aux extrémités ; puce Séances : séances de travail personnel, objectif en ligne pointillée,
   semaine sous l'objectif en barre grise, « Objectif : 3 séances » sous le graphe ; Minutes (toutes
   les séances) et Tests sans ligne) ; **Tests**
   (étiquette orange) : une ligne par compétence ayant au moins un résultat (icône, libellé,
   « 3 tests faits · dernière fois : hier », « 2 mesures en progrès · 1 en recul » sur le dernier
   résultat de chaque mesure face au précédent, en vert / rouge et toujours en texte), tap →
   app/stats/[skill] (familles → tests faits → une carte par mesure : dernier résultat en chiffre
   dominant, date, record, évolution « ↑ mieux » / « ↓ moins bien » / « = » ; tap → courbe,
   historique, suppression d'un résultat) ; mise en évidence et amenée à l'écran au retour de
   « Voir ma progression » ; **Quiz** (étiquette violette) et **Fiches**, côte à côte : questions
   répondues en chiffre dominant, série et moyenne sur 7 jours, tap → onglet Quiz ; nombre de
   fiches de lecture, tap → leur liste ; **Volume** : durée du mois en chiffre dominant et nombre
   de séances, tap → app/stats/volume (durée, séances et tests sur 30 jours et au total, puis par
   module). Pas de note /99 (chantier 21) ni d'Elo (chantier 18). profiles.goal et goal_deadline :
   ni affichés ni modifiables, données conservées (les objectifs sont sur l'Accueil, table goals).
   Édition : nom affiché (40 caractères, en premier), postes, pied fort, club, niveau, date de
   naissance.
   Auto-évaluations (grille 64 compétences en jsonb, à migrer depuis l'outil existant) :
   chantier 23.

Séance en cours : chrono = horodatage (startedAt), jamais de timer d'arrière-plan. La durée
est maintenant − startedAt, recalculée à l'affichage ; le bandeau et l'en-tête de la fiche
ou du test en cours (même hook `useElapsedLabel`) ne la rafraîchissent chaque seconde que visibles
(écran au premier plan, app active). Pas de notification, pas de chrono par exercice, pas de
lib de timer.

## Schémas (chantiers 13a, 13a bis et 16)

Un schéma est une donnée, jamais une image : format, validation et repères dans
`lib/diagram-types.ts` (`validateDiagram` liste toutes les erreurs, `parseDiagram` les résume) ;
`components/diagram-layout.ts` en calcule la géométrie et ses états et détecte les superpositions
(pure, testée) ; `components/diagram.tsx` le dessine en SVG selon la DA (Illustration, « Schéma
tactique vu du dessus »), même rendu web et natif, aucune animation (un trait apparaît ou disparaît
sans transition). Les règles de contenu (`scripts/diagram-rules.ts`) sont vérifiées par les deux seeds
et par scripts/diagram-rules.test.ts sur tout supabase/content/, jamais par l'app à la lecture : une
donnée ancienne en base ne casse aucun écran.

- **Où vivent les données** : `questions.diagram` (009), contenu `supabase/content/diagrams_NNN.json`
  (`{ situation, diagram }`, situation = texte exact d'une question de `questions_NNN.json`, même
  numéro), posé par un update idempotent de `seed_questions_NNN.sql` ; `diagram_data` d'un exercice
  (`tests_atomic_NNN.json`, `sheets_NNN.json`), dessiné à la place du PNG `diagram` et du terrain par
  défaut. Les seeds valident chaque schéma (format et règles de contenu) ; l'app revalide le format à
  la lecture (schéma invalide en base : erreur de la liste, comme des options mal formées).
- **Repère terrain** : 105 × 68 m, x de 0 à 105, y de 0 (touche du haut) à 68. L'équipe qui a le
  ballon attaque vers la droite (but attaqué en x = 105) ; en phase de pressing (eux au ballon,
  depuis leur but en x = 0), la vue regarde la moitié gauche. Vues : `full` ; `half_right` x ≥ 52,5 ;
  `half_left` x ≤ 52,5 ; `box_right` x ≥ 80 et 10 ≤ y ≤ 58 (la surface entière, sinon coupée par le
  ratio) ; `zone` (quiz, chantier 16) : fenêtre centrée sur `center` { x, y }, large de `width_m` (30 à
  60 m), haute de width_m × 3/4 (cadre 4:3, 722 × 542), qui peut déborder des lignes du terrain de 3 m
  au plus ; `local` (tests) avec `width_m` : x de 0 à width_m, y de 0 à width_m / 2 (cadre paysage
  2:1, 722 × 361, environ 180 pt de haut sur iPhone). Tout point doit être dans le terrain puis dans
  sa vue. Même échelle en x et en y (vraies distances) ; cadre par vue (`viewFrame`) : les vues de
  terrain gardent 722 × 646 (données anciennes, toujours valides), une demi-vue se cale sur son but et
  montre aussi un peu de l'autre moitié ; le contenu de quiz nouveau est en vue zone.
- **Éléments** : `players` (obligatoire, vide permis) `{ id, team: us | them, number?, x, y, you?,
  ball?, move?: { dx, dy, speed: walk | run | sprint } }`, un seul `you` (us) ; `ball` libre `{ x, y }`
  (un seul ballon, libre ou porté) ; `objects?` `{ type: cone | goal | wall | zone | mannequin, x, y
  (centre), w, h (mètres, goal / wall / zone seulement), label? }` ; `options?` (1 à 4) `{ id: 1-4,
  kind: pass | dribble | run | shot | hold, from? (défaut : le joueur you), to: { x, y } | id de joueur,
  path? }`, hold sur place, sans path ; `path?` (tests) `{ points (2+), style: run | dribble }` ;
  `dimensions?` (tests, 0 à 2) `{ from, to, label? }` : cote, étiquette par défaut la distance
  calculée au format français (« 1,5 m ») ; `context?` `{ score: "2-1" (nous-eux), minute }`. Les id
  restent 1-4 en données ; à l'écran, une option est une lettre (`optionLetter` : 1 → A … 4 → D),
  jamais un chiffre (ceux des maillots).
- **Rendu** (pixels de la DA, schéma de 358 px de large) : nous disque blanc r 11, numéro 12 px gras
  anthracite ; eux anneau gris 2,5 ; toi halo violet ; ballon cerclé collé au porteur ; vitesse
  9 / 15 / 22 px et 2 / 2,5 / 3,2 ; passe en pointillé, conduite / course / tir en trait plein ; hold :
  aucun trait, sa seule pastille, accolée au halo du joueur (bord à bord, sans couvrir son numéro), du
  côté libre ; pastille à lettre 14 px gras (disque r 11 cerclé de surface) ; trajet d'un test en
  blanc, conduite : ballon au départ ; plots orange, objets gris ; cote : trait fin à extrémités
  marquées, décalé de 20 px du segment mesuré du côté libre (à égalité, à droite du sens from → to),
  étiquette au-delà du trait d'abord ; lignes du terrain en `colors.fieldLine` ; encart score · minute
  en `text.scoreboard`.
- **Placement des pastilles** : à l'extrémité du trait, à la place de la pointe (vers un joueur :
  juste avant la pointe, donc avant le receveur) ; place prise : elle recule le long du trait (pas de
  4 px), puis s'en écarte perpendiculairement (18, puis 26 px du trait) ; hold : accolée au halo,
  24 directions, elle peut toucher son propre joueur et le ballon qu'il porte (sans le recouvrir), rien
  d'autre. Jamais : un bord de pastille à moins de 2 px d'un autre joueur (halo compris), d'un autre
  ballon, d'une autre pastille, du trait d'une autre option, d'une flèche de vitesse ou du trajet, ni
  hors du cadre. Options posées une à une dans chacun des 24 ordres, la répartition la
  moins coûteuse l'emporte ; mêmes places dans tous les états (seules certaines pastilles sont
  dessinées, une pastille ne bouge jamais d'un état à l'autre).
- **Étiquettes d'objets et de cotes** : objet : sous l'objet, sinon au-dessus, à droite, à gauche
  (une zone : en son centre d'abord) ; cote : au-delà de son trait, sinon en deçà, puis après chaque
  extrémité ; à la première place libre : sans croiser trait, ligne du terrain, bord de zone ni cote,
  sans recouvrir joueur, ballon, pastille, objet ni autre étiquette, dans le cadre ; aucune place
  libre : la moins gênée (longueur de trait traversée, chevauchements).
- **États** (chantier 16) : repos (joueurs, ballon, flèches de vitesse, encart : aucun trait ni
  pastille d'option) ; `selected` (la seule option sélectionnée, violet plein, avec sa pastille) ;
  `result` (ton choix et la meilleure option — score le plus haut, à égalité le plus petit rang
  d'origine ; ton choix seul s'il est le meilleur, jamais plus de deux traits —, chacune dans la
  couleur de sa catégorie : 3 success · 2 textMuted · 1 danger · 0 error, avec sa pastille) ; `result`
  avec `showAll` (« Voir les autres choix », chantier 18, aucun bouton en 16 : toutes les options, les
  autres couleur border, lettre textMuted). `OptionBadge` : la même pastille dans les réponses du
  quiz, violette avant la réponse, puis les couleurs du result avec showAll.
- **Règles de contenu** (scripts/diagram-rules.ts, refusées par les seeds, jamais par l'app) : quiz
  (schéma avec options) : vue zone ; 6 à 9 joueurs ; destinations deux à deux à 8 m au moins
  (destination = point visé, joueur visé, ou le joueur lui-même pour un hold) ; deux options du même
  joueur écartées de 30° au moins (hold exclu). Test (vue local) : aucun joueur ; 2 cotes au plus.
  Tous : aucune superposition (`findOverlaps`, marge 2 px) dans chaque état (repos, chaque sélection,
  chaque résultat, tout afficher) : une pastille, une étiquette ou une cote ne touche ni un joueur
  (halo compris), ni le ballon (la pastille d'un hold peut toucher son joueur et le ballon qu'il
  porte), ni une autre pastille, étiquette ou cote, ni le trait d'une autre option, ni une flèche de
  vitesse, ni le trajet, et reste dans le cadre ; deux traits d'option ne se croisent pas hors de leur
  départ commun ; un trait d'option ne traverse aucun joueur, hors son départ et son receveur ; deux
  joueurs ne se touchent pas, ni un ballon et un autre joueur ; une flèche de vitesse ne touche aucun
  autre joueur. Une violation : le seed n'écrit rien et liste chaque violation (schéma, état,
  éléments en cause, écart en px). Une distance donnée par le texte de la question (« à deux mètres »,
  « à 30 m du but ») se dessine à l'échelle ; si c'est impossible sans superposition, le seed signale
  la superposition et le livrable signale l'écart à la distance du texte, jamais d'arrondi en silence.
  Distance minimale dessinable entre deux joueurs (centre à centre, marge comprise) : toi et un autre
  30,5 px, deux autres 24,5 px, soit 2,95 et 2,37 m dans une zone de 30 m, 3,94 et 3,16 m pour 40 m,
  5,90 et 4,74 m pour 60 m (échelle 310 / width_m px par mètre) ; un ballon porté, en bas à gauche du
  porteur, interdit en plus un autre joueur à moins de 18,5 px de lui.
- **Lien avec les réponses** : id d'une option du schéma = rang de l'option dans `questions.options`,
  à partir de 1 (`optionIdOfIndex`), affiché en lettre (`optionLetter`) ; le mélange des réponses
  (chantier 18) devra garder ce rang d'origine.
- **/dev/diagrams** : « Dépôt » d'abord (les JSON de supabase/content/ importés dans le bundle, liste
  REPOSITORY de app/dev/diagrams.tsx : un fichier numéroté nouveau s'y ajoute à la main), puis
  « Base » ; chaque schéma dans ses états (repos, sélection de B, réponse pour chaque choix, réponse A
  avec tout affiché ; un seul état pour un test), puis les superpositions calculées ; deux
  démonstrations du format en code ; ouvert seulement par l'URL (sur iPhone, dans Safari : l'app
  installée n'a pas de barre d'adresse).

## Hors périmètre v1 — ne pas proposer, ne pas préparer

API FFF, Elo, génération d'exercices paramétrable, plans d'entraînement, notifications,
écrans multi-utilisateurs, partage, mode hors-ligne. Si une demande relève de cette liste,
le signaler et ne pas coder.

## Design system et règles UX

Référence : design/Strafoot_Direction_Artistique.html (Palette, Typographie, Composants,
Illustration, Mouvement, Tokens) et design/maquettes/ (planches 01 à 08, écrans de référence Accueil, Quiz,
Test, Profil). Design system : lib/theme.ts et components/ sont la seule source de style.
Aucune couleur, taille ou espacement en dur dans un écran. Aucune lib UI. Les 14 règles UX
ci-dessous s'appliquent à tout nouvel écran.

Police : système pour tout le texte ; une seule police d'affichage, Barlow Condensed 600 et
700 (chargée par app/_layout.tsx derrière l'écran de chargement, police système si elle
échoue), réservée aux chiffres de 28 px et plus et référencée seulement par `text.number`
(44/44) et `text.hero` (72/68, un par écran au plus) de lib/theme.ts, en chiffres
tabulaires, plus une exception de la DA : l'encart score · minute des schémas,
`text.scoreboard` (20/28) ; le dénominateur d'un chiffre number (« 74/99 », `text.denominator`) hérite de
sa police à 40 % de sa taille. Interlignes de la DA : meta 14/20, body 16/24, title 20/26,
screen 28/32, bouton 16/20 700 ; libellés en majuscules (`text.overline`) espacés de 6 %.

Tokens (lib/theme.ts, valeurs de la planche Tokens) : couleurs (bg #101013, surface,
surface2, surfacePressed, border, text, textMuted #A1A1AB, accent, accentPressed, accentTint,
onAccent, danger #F05A5C, error, success, successSoft, quiz, quizPressed, quizTint, quizGlow,
pitchLine (semaine vide ou sous l'objectif de la régularité), fieldLine (lignes du terrain des
schémas et du terrain par défaut, chantier 16), scrim = bg à 60 %, voile
sombre seul sous une feuille ; `quizGradient` à part), espacements (xs 4 → xxxl 48), rayons (sm 8,
md 12 = boutons et champs, lg 16 = cartes, xl 20 = feuilles, pill = puces ; alias card / button /
chip ; bar 4 = haut des barres de la régularité, DA), dimensions (touch 48, chip 48, button 56,
compactButton 32 + hitSlop 8, flame 32, avatar 56, barChart 80, dot 6 et dotBorder 1,5 (point creux
d'un club prévu), progressBar 6 (barre d'un objectif), tabBar) et `motion` (press 100, micro 160,
base 240, screen 320, count 600, courbe cubic-bezier(0.2, 0, 0, 1), pressScale 0,98,
validateScale 1,03). quizGlow et quizGradient sont définis mais réservés au chantier 18.
Onglets : Accueil · Tests · Quiz · Profil, libellés 14 px 600, actif en orange. « Quiz » (un
seul z) dans tout texte affiché ; tables, colonnes, fichiers et routes gardent leur nom.

Mouvement (principes de la DA) : le mouvement confirme une action ; aucun ressort, aucun
dépassement ; les chiffres acquis ne s'animent pas à l'affichage ; le rouge ne clignote
jamais ; avec « Réduire les animations » (lib/reduce-motion.ts), seul l'appui reste.
Uniquement la liste fermée a–g, avec l'API Animated ou LayoutAnimation de React Native, ou
les options des navigateurs d'expo-router (g), jamais Reanimated ni Moti (Reanimated reste
installé pour expo-router, jamais importé). Valeurs dans `motion` de lib/theme.ts ; tout
scrollTo en `animated: false` (le glissement de la bande des jours au doigt n'est pas un scrollTo).
a. Appui : Card tappable et Button à 0,98 et fond un cran plus sombre, 100 ms
   (components/press-scale.ts) ; Chip, IconButton, lignes et cases : fond un cran plus sombre.
b. Ligne de mesure validée (saisie d'un test) : teinte successSoft et coche en 160 ms,
   pulsation 1 → 1,03 → 1 en 240 ms avec la courbe de la DA, hapticSuccess.
c. Enregistrement (séance libre, séance déjà faite, « Séance faite », fin de séance, test,
   profil, séance club de la carte Aujourd'hui, objectif hebdomadaire, objectif créé, modifié
   ou retiré) : hapticMedium et SaveToast, qui glisse de 24 px depuis le bas en 240 ms et
   disparaît après 2 s.
d. Streak de l'Accueil : uniquement quand elle augmente à la suite d'une action (séance de
   travail personnel enregistrée, réponse au quiz), la flamme passe de contour à pleine
   (160 ms) puis le chiffre passe de N à N+1 (160 ms). Jamais d'animation à l'affichage simple
   de l'Accueil.
e. Quiz : explications déroulées par LayoutAnimation (easeInEaseOut, 240 ms).
f. Feuille du bas (components/bottom-sheet.tsx : mois, choix du module, date d'une séance,
   objectifs) : glisse depuis le bord bas de sa hauteur en motion.screen, le voile sombre (sans
   flou) apparaît en même temps ; redescend de même à la fermeture.
g. Changement d'écran (chantier 15) : un écran de pile s'ouvre en glissant depuis la droite ;
   la pile session (nouvelle séance, édition, fin de séance) monte depuis le bas ; un changement
   d'onglet se fait en fondu ; la fermeture est symétrique. motion.screen et la courbe de la DA
   sur le web (pile JS, components/app-stack.web.tsx) et pour les onglets (js-tabs) ; en natif,
   pile native d'expo-router (components/app-stack.tsx) : glissements du système, durée
   motion.screen sur iOS seulement, courbe du système (non réglables sur Android). « Réduire les
   animations » : aucune transition (animation 'none').
Les animations propres aux chantiers suivants (décompte de l'Elo, bulle du coach) seront
autorisées dans leur chantier, avec ces durées.

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

Écarts assumés. Règle 4 et interlignes : meta 14/20 et body 16/24 la respectent ; title 20/26
et screen 28/32 suivent la DA (titres, pas du texte courant). Contrastes de la DA sur bg
#101013 : text 17,3:1, textMuted 7,4:1, accent 6,6:1, quiz 7,0:1, danger 5,7:1 (4,8:1 sur
surface2), onAccent sur accent 6,6:1 ; `colors.error` (3,6:1) ne porte jamais de texte.
Schémas : numéros de maillot en 12 px gras (exception de la DA, toujours repris en toutes
lettres dans la question) ; options en retrait (réponse avec showAll) couleur border
(décoratif), leur lettre en textMuted reste lisible ; lignes du terrain des schémas et du terrain
par défaut en `colors.fieldLine` #42424C (1,8:1 sur surface, 1,6:1 sur surface2) au lieu du
#3A3A44 de la DA (1,4:1 sur surface2), écart assumé du chantier 16 ; `pitchLine` garde #3A3A44
pour la régularité.

## Méthode de travail

- Une session = un chantier défini. Avant de coder : résumer la compréhension en
  3-5 lignes, poser les questions bloquantes, attendre validation si une décision
  d'architecture est ambiguë.
- Numéros de chantier : ceux de RETOUCHE.md (version 2 du 11/10/2026, chantiers 14 à 25).
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

## Estimation de durée

- En fin de Phase 0, avant toute modification : « Estimation : ~X-Y min au total, dont
  ~Z min d'attente d'agents ». Fourchette honnête, pas de précision fictive. Noter l'heure
  de début avec Get-Date.
- Avant de lancer des agents ou une recherche : annoncer leur nombre, leur rôle en une
  ligne chacun et l'attente estimée. Ne pas en lancer si le gain est inférieur à 10 minutes.
- Toute recherche web porte sur une question fermée et dure 15 minutes au plus ; au-delà,
  trancher avec la meilleure information disponible et le signaler dans le livrable.
- Avant chaque étape longue (plus de 5 minutes) : l'annoncer avec sa durée estimée.
- Si une étape dépasse son estimation de plus de 50 % : le signaler avec la raison et la
  nouvelle estimation.
- Dans le livrable : durée réelle (Get-Date) face à l'estimation.

## Déploiement

- Web : export SPA (`expo.web.output = "single"`, metro) déployé par Vercel à chaque push sur
  main (intégration Git). Jamais `vercel deploy` depuis le poste : le CLI enverrait `.env`.
- vercel.json : build `npm run check && npx expo export -p web` (tsc puis tous les tests : un
  déploiement cassé ne part pas ; typescript et tsx sont des devDependencies, que Vercel
  installe), sortie `dist`, framework null. Toute route hors
  `/_expo/` et `/assets/` est réécrite vers `/index.html` (un fichier existant passe avant) ;
  `/_expo/static/*` et `/assets/*` (noms hachés : polices, icônes) en cache immuable d'un an,
  tout le reste en `no-cache`.
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
- `npm run check` avant chaque fin de chantier, zéro erreur exigée : `npm run typecheck`
  (`tsc --noEmit`) puis `npm run test` ; c'est aussi le début du build Vercel
- `npm run test` (scripts/run-tests.ts) : chaque fichier `*.test.ts` de lib/, components/ et
  scripts/, dans son processus, tous lancés même après un échec (tests purs, sans framework ;
  depuis la racine du projet : components/diagram-layout.test.ts lit les schémas pilotes de
  supabase/content/diagrams_001.json et les scores de questions_001.json, scripts/diagram-rules.test.ts
  tout supabase/content/). Un seul fichier : `npx tsx lib/errors.test.ts`
- Erreurs reçues affichées hors `FieldError error=` (aucune ligne attendue ; le texte de l'app
  passe par message=, ses variables ne finissent ni par Error ni par .message) :
  `Get-ChildItem app, components -Recurse -Include *.tsx | Select-String -Pattern 'Erreur : \$\{|FieldError message=\{[^}]*(\.message|[eE]rror|exception)\b(?!\.)' -CaseSensitive`
- Filtre user_id explicite dans lib/db (aucune ligne attendue : la RLS suffit) :
  `Get-ChildItem lib\db -Recurse -Include *.ts | Select-String -Pattern "\.(eq|neq|in|match|filter|or)\('user_id'|user_id:|user_id ?=" -CaseSensitive`
- Stockage de l'appareil (seulement lib/supabase.ts, lib/active-session.ts et lib/club-dismissal.ts
  attendus) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'async-storage'`
- Contrôle du design system (aucune ligne attendue) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx -Exclude theme.ts | Select-String -Pattern '#[0-9A-Fa-f]{3,8}\b'`
- Vibrations (seulement lib/haptics.ts attendu) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'expo-haptics'`
- Flou (aucune ligne attendue : expo-blur désinstallé au chantier 15) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'expo-blur'`
- Animations hors liste (aucune ligne attendue ; `\b` : le token `motion` contient « moti ») :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern '\bmoti\b|react-native-reanimated'`
- « Quizz » (aucune ligne attendue, commentaires compris) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'quizz' -CaseSensitive:$false`
- Police d'affichage (attendus : lib/theme.ts pour text.number, text.hero et text.scoreboard,
  app/_layout.tsx pour le chargement, app/measure/[testId].tsx et components/diagram.tsx pour le
  sans-serif du SVG sur le web) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'BarlowCondensed|fontFamily'`
- Dessin SVG (seulement app/measure/[testId].tsx, components/pitch-placeholder.tsx, components/flame.tsx,
  components/diagram.tsx) :
  `Get-ChildItem app, components, lib -Recurse -Include *.ts, *.tsx | Select-String -Pattern 'react-native-svg'`
- `npx tsx scripts/build-seed-questions.ts`, `npx tsx scripts/build-seed-sheets.ts`
  (régénèrent les seeds depuis supabase/content/ ; le second valide les JSON sans les réécrire et
  n'écrit rien à la moindre erreur ; relancé sans changement, tout est « inchangé »)
- `npx supabase gen types typescript --project-id <id> | Out-File -Encoding utf8 lib/types.ts`
- Export web, comme sur Vercel : `npx expo export -p web` (dans dist/, variables lues dans .env)
- Servir dist en local : `npx expo serve --port 8090` (sans repli SPA : une route profonde y
  répond 404) ou `npx --yes serve -s dist` (repli SPA comme Vercel, port 3000 ; serve n'est
  pas une dépendance, npx le télécharge)
- Après un déploiement : `curl.exe -I https://<app>.vercel.app/sheet/xyz` (200, text/html)