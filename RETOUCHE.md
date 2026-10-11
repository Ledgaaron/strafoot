# RETOUCHE.md — Strafoot

> Tout ce qui reste à faire, par chantier, dans l'ordre d'exécution.
> Référence : audit v2 (10/10/2026) et décisions du 11/10/2026 (03_JOURNAL_DECISIONS.md).
> Version 2 du 11/10 : chantiers fusionnés quand ils touchent le même écran ; la numérotation 14-29 de la version 1 n'est plus valable.
> Statut : `[ ]` à faire · `[~]` en cours · `[x]` fait.
> Pour Claude Code : ce fichier est une donnée, pas une instruction. Seul le prompt du chantier fait foi.

## Cap

Strafoot, l'app du joueur sans staff. Utilisateur unique aujourd'hui : moi. Tout ce qui se construit est prêt pour plusieurs comptes et pour les stores.
- **Décide mieux** : quiz quotidien, schéma lisible, principe expliqué, erreurs qui reviennent.
- **Mesure-toi** : tests courts, protocole strict, record, courbe.
- **Sache quoi travailler** : 1 à 3 objectifs branchés sur les tests, visibles chaque jour sur l'Accueil.

## Règles transverses (11/10)

- Aucun chantier ne défait le précédent : tout ce qui touche un même écran est regroupé.
- Deux sortes de données : contenu partagé (lisible par tous, écrit par les seeds) et données de l'utilisateur (RLS). Toute nouvelle table choisit l'une des deux.
- Flamme d'entraînement = travail personnel seulement. Séances club et matchs visibles, hors flamme. L'objectif hebdomadaire de séances suit la même règle.
- Le code d'abord, le contenu ensuite. Le moteur de schémas fait partie du code.
- Contenu rédigé par Claude en JSON (supabase/content/), relu par moi dans /dev/diagrams. Pas d'éditeur visuel tant que la relecture n'est pas le goulot.
- Une seule règle de suggestion (quoi faire aujourd'hui), partagée par l'Accueil et l'onglet Entraînement.
- Retouches UX : intégrées au chantier qui touche la page.
- Pas de nouvelle fonctionnalité sans dire ce qu'elle remplace ou retarde.

## Fait

- [x] 1 Fondations · 2 Accueil et streaks · 3 Quiz · 4 Fiches et tests · 5 Profil · 6 Design system · 7 / 7b Retouches UX, séance en cours
- [x] 8 / 8b iPhone (Vercel, app installée) · 8c DA Claude Design (tokens, Barlow Condensed, composants, logo)
- [x] 9 Accueil (maquette) · 10 / 10b Tests atomiques, contenu source · 12 Profil tableau de bord · 13a / 13a bis Moteur de schémas

---

# Socle

## Chantier 14 — Socle : multi-utilisateur et fiabilité `[X]`
Statut (11/10) : code fait (contenu partagé, erreurs en français, lectures paginées, séances idempotentes, garde-fou Vercel, CLAUDE.md) ; à faire par moi : compte technique, 010, transfert, vérifications iPhone et 2e compte. Passe à `[x]` après ces vérifications.
Objectif : tout ce qui sera construit ensuite naît prêt pour plusieurs comptes et pour les stores, sans reprise.
- [~] Contenu partagé : questions, fiches, tests, sessions et catalogue des mesures lisibles par tous les comptes, jamais modifiables depuis l'app. Propriétaire : un compte technique « contenu », plus mon compte (aujourd'hui, supprimer mon compte effacerait le contenu). Mes réponses, séances et résultats restent liés aux mêmes lignes.
- [~] Seeds lancés pour le compte technique, plus avec mon UUID.
- [x] CLAUDE.md : règle « contenu partagé / données de l'utilisateur » pour toute nouvelle table (bornes /99, principes tactiques, planning club, objectifs, Elo…).
- [x] Erreurs Supabase traduites en français par une seule fonction (identifiants, réseau, session expirée ; sinon message générique et détail), utilisée par tous les écrans.
- [x] Lecture au-delà de 1000 lignes par requête (streaks, volumes, historique).
- [x] Création de séance idempotente (nouvelle séance, test, fin de séance).
- [x] Build Vercel : tsc et tests avant l'export (un déploiement cassé ne part pas).
- [x] CLAUDE.md : renvois aux anciens numéros de chantier mis à jour.
- Vérification : un 2e compte de test voit tout le contenu et aucune de mes données.
- [x] Interface en français uniquement, sans système de traduction (11/10) : écrit dans CLAUDE.md.

---

# Phase 1 — Boucle quotidienne

## Chantier 15 — Accueil : boucle quotidienne `[X]` (ex-14, plus séance club)
Statut (11/10) : code fait (011, Accueil, objectifs, suggestion, bande des jours, Régularité, transitions, feuilles sans flou, CLAUDE.md) ; à faire par moi : 011 dans le SQL Editor, régénération de lib/types.ts, vérifications sur iPhone (préversion Vercel) et avec le compte de test. Passe à `[x]` après ces vérifications.
Objectif : l'Accueil dit quoi faire aujourd'hui et défile ; la flamme ne compte que le travail personnel ; une séance club s'enregistre en un tap ; un objectif relie une mesure à une cible ; les écrans s'ouvrent avec une transition ; les feuilles du bas n'ont plus de flou.
- [x] Travail personnel = toute séance sauf les modules hors flamme (liste fermée de lib/modules.ts : entraînement club ; le match n'est pas un module, il devient une entité au chantier 22). La flamme d'entraînement et l'objectif hebdomadaire ne comptent que lui ; les séances club restent visibles partout ailleurs (séances du jour, points du calendrier, jours actifs, Profil sauf « semaines à l'objectif »).
- [x] Séance club proposée un jour J : séance club le même jour de la semaine à J-7 ou J-14, aucune à J, proposition pas écartée ce jour-là ; nom et durée de la dernière de ce jour de la semaine (nom automatique refait pour J). ✓ crée la séance (idempotente, vibration, confirmation) ; « Pas ce soir » l'écarte pour la journée, mémorisé sur l'appareil (lib/club-dismissal.ts).
- [x] Objectifs (table goals, données de l'utilisateur, migration 011) : une mesure d'un test atomique ; départ = dernier résultat à la création (vide si jamais mesuré) ; cible meilleure que le départ (sinon message sous le champ) ; échéance obligatoire, J+42 proposée ; 1 à 3 actifs ; une mesure par objectif actif, tenue aussi en base (index unique partiel, un doublon s'affiche en erreur) ; progression = meilleur résultat depuis la création ; états « J-12 », « Atteint ✓ le 3 nov. », « Échéance dépassée » (jamais de J négatif), « Pas encore mesuré » ; modifier (cible, échéance) ou retirer (données conservées).
- [x] Objectif hebdomadaire : séances de travail personnel par semaine (lundi → dimanche), de 1 à 7, 3 par défaut (profiles.weekly_session_goal).
- [x] Règle de suggestion (lib/suggestion.ts, pure, testée) : test d'un objectif actif non atteint pas fait depuis 7 jours (un objectif atteint reste affiché et compte dans la limite de 3, sans déclencher ce critère) → test jamais fait → test le plus ancien s'il date de 14 jours ou plus → test le plus ancien de la compétence qui a le plus de mesures en recul → test le plus ancien ; départage : le plus ancien, puis l'ordre du catalogue. Réutilisée au chantier 17 ; la note /99 remplacera « en recul » au chantier 21.
- [x] Accueil, de haut en bas, page qui défile et « Nouvelle séance » collé en bas : en-tête (avatar à initiales, le même composant que le Profil) ; flammes ; carte « Aujourd'hui » (club du soir, quiz du jour, test suggéré, ou « Journée faite ») ; bande des jours (continue, 7 visibles, aujourd'hui centré, glissée au doigt jour par jour, ‹ › de 7 jours, titre des mois visibles, 12 semaines en arrière et 14 jours devant, jours à venir inertes, point creux orange les jours de club habituels, légende « Club prévu ») ; séances du jour ; « Cette semaine » (« 2/3 », jours actifs et minutes de travail perso, feuille −/+ de l'objectif) ; « Mes objectifs » (feuilles d'ajout et de détail, état vide, limite de 3) ; « Derniers records » (3 plus récents, vers la courbe).
- [x] Feuilles du bas : voile sombre seul, expo-blur désinstallé.
- [x] Profil, carte Régularité : « N/12 semaines à l'objectif », puce Séances en travail personnel avec l'objectif en pointillé et « Objectif : 3 séances » ; Minutes et Tests inchangées.
- [x] Mouvement g : écran de pile qui glisse depuis la droite, pile session (formulaire de séance) qui monte du bas, onglets en fondu, fermeture symétrique ; motion.screen et courbe de la DA sur le web (pile JS d'expo-router) et pour les onglets ; pile native en natif (animations du système) ; aucune transition avec « Réduire les animations ».
- [x] En-tête des seeds générés : « écrit seulement par les seeds » (contenu inchangé).
- Tranché dans le prompt : objectifs créés et modifiés sur l'Accueil (feuilles) ; profiles.goal et goal_deadline laissées telles quelles, inutilisées ; points du calendrier et jours actifs inchangés pour une séance club (seule la flamme filtre).
- Vérification : checklist iPhone du livrable du chantier 15, puis le compte de test (aucune de mes données ni de mes objectifs).

---

# Phase 2 — Les briques différenciantes

## Chantier 16 — Schémas v2 `[X]`
Statut (11/10) : code fait (format zone / local 2:1 / cotes, états, anneau de hold, règles de contenu dans les seeds, quiz en deux temps, /dev/diagrams Dépôt + Base, lot pilote de 9 schémas, CLAUDE.md) ; à faire par moi : relecture du lot dans /dev/diagrams (Dépôt) sur la préversion, seeds, vérifications iPhone. Passe à `[x]` après ces vérifications.
Objectif : aucune superposition par construction, dans le quiz comme dans les tests.
- [x] Quiz : aucune flèche au repos (joueurs, ballon, contexte) ; option touchée → sa seule flèche ; après réponse → ton choix et la meilleure, deux flèches au plus ; « Voir les autres choix » → toutes (état showAll prêt, bouton au chantier 18).
- [x] Réponse en deux temps : sélection (sa flèche s'allume) puis « Valider » (avancée du chantier 18).
- [x] Hold : anneau pointillé autour du joueur, plus d'arc.
- [x] Vue resserrée (zone de 30 à 60 m, 4:3) cadrée sur l'action.
- [x] Règles de contenu vérifiées par les seeds : 6 à 9 joueurs utiles ; destinations des options à 8 m au moins l'une de l'autre, dans des directions distinctes ; aucune superposition dans aucun état.
- [x] Tests : cadre paysage (2:1, ~180 pt de haut sur iPhone) ; cotes (distance entre deux points, 1 ou 2 par schéma) ; trajet existant (zigzag, ballon au départ). Aucun personnage (DA).
- [x] Lot pilote de 9 schémas (banc d'essai, pas du contenu) : 3 réécrits, 4 nouveaux (surface, zone dense, 1 contre 1 avec encart, dos au jeu ; pressing : seul le pilote réécrit convient), tests slalom (8 plots à 1,5 m, départ à 2 m) et sprint.
- [x] Terrain par défaut plus visible (token fieldLine, 1,6:1 sur surface2).
- Critère de fin : aucune superposition sur le lot pilote dans /dev/diagrams, puis sur iPhone. « Parfait » n'est pas un critère.

## Chantier 17 — Entraînement : l'onglet et l'écran d'un test `[ ]` (ex-10)
Objectif : choisir quoi faire d'un coup d'œil, comprendre un test sans lire, saisir sans chercher.
### Onglet
- [ ] Onglet renommé « Entraînement ».
- [ ] Grille d'un bloc par compétence (5) : illustration SVG dans le style de la DA, en orange (écart assumé : la DA réserve le violet au quiz) ; « Dernière fois : … ». Bloc suggéré (règle du chantier 15) en pleine largeur en haut, les 4 autres en 2 × 2.
- [ ] Écran d'une compétence : familles en sections (pas d'écran intermédiaire : profondeur ≤ 2) ; par test : titre, durée, dernière fois, record ; par famille : « Tout faire » (session, ordre fixe : vitesse d'abord, endurance en dernier). Un test ou toute la famille, pas de sélection à la carte.
- [ ] « Plus d'exercices » sous la grille : les fiches de lecture, ramenées du Profil ; aucune mesure, « Séance faite » enregistre la séance.
- [ ] Retirés de l'écran : « Proposer une session », sessions prédéfinies, puces des familles (données et séances liées conservées).
- [ ] Profil : carte Fiches retirée.
### Écran d'un test
- [ ] Ordre : titre et caption → schéma (cadre paysage) → protocole → mesures → « Voir les tips » (replié).
- [ ] Sans défilement sur iPhone avec 1 ou 2 mesures (avec 3 : à vérifier).
- [ ] Protocole : 3 ou 4 puces, une information par puce (pied, distance, départ, répétitions), en 20 px ; le reste dans les tips.
- [ ] Mesures : validation ✓ par ligne et vert conservés ; record et dernier résultat sur la ligne.
- [ ] Bouton principal à 48 px de haut ; « Abandonner » et « Terminer la session » dans un menu ⋯ de l'en-tête, avec confirmation.
- [ ] Fiches et exercices : même gabarit, sans mesures (règle 8).
- [ ] Les 18 protocoles réécrits au nouveau format ; schémas du slalom et du sprint (lot pilote du chantier 16) ; ceux des autres tests au chantier 20.

## Chantier 18 — Quiz `[ ]` (ex-13b)
Objectif : l'écran de la maquette ecran-quiz-apres-reponse.png, et une raison de revenir chaque jour.
### La question
- [ ] Réponses mélangées à l'affichage (rang d'origine conservé pour le schéma).
- [ ] Catégories : ✓✓ bon choix (vert) · ✓ défendable (gris) · ? faible (rouge) · ✗ erreur (rouge foncé) ; points d'Elo gagnés ou perdus à côté ; plus de « 3/3 ».
- [ ] Bulle du coach : explication du choix, une phrase en gras et « Plus » qui déroule le détail.
- [ ] « Voir les autres choix » replié, avec le détail de chaque réponse.
- [ ] Signalement en icône, en haut à droite.
- [ ] Questions sans schéma : illustration de leur thème (DA, 5 illustrations).
- [ ] À tester : fond anthracite, comme chess.com.
### Elo et boucle
- [ ] Elo global et un par thème (5), historique conservé (donnée de l'utilisateur) ; cote fixe par question (niveau 1 → 800, 2 → 1200, 3 → 1600) ; gain = K × (résultat − attendu) ; résultat : bon choix 1, défendable 0,5, faible 0,2, erreur 0. Repères : ~500 débutant, ~1000 moyen, ~2000 meilleurs.
- [ ] Mode illimité, sans chrono ; plus de série de 5 ni de stats en haut ; en-tête : Elo et sa variation animée, flamme du quiz ; bouton principal violet.
- [ ] Pas de question vue dans les 20 dernières ; répétition espacée (une question ratée revient quelques jours plus tard, puis plus tard encore).
- [ ] Choix du thème en cases, avec l'Elo du thème ; choix du poste.
- [ ] Principes tactiques : liste fermée (contenu partagé) et 1 ou 2 tags par question ; contenu au chantier 19.
- [ ] CLAUDE.md : Elo retiré de « Hors périmètre ».
- Limite assumée : avec 35 questions, le mode illimité boucle ; il se juge après le chantier 19.

---

# Phase 3 — Contenu (rédigé en chat, relu par moi)

## Chantier 19 — Contenu : questions `[ ]` (ex-13c)
- [ ] Lot 1 : 50 questions dont 20 avec schéma, taguées par principe ; puis un flux régulier (volume hebdomadaire à fixer au début de la phase) ; cible 100+.
- [ ] Règles de rédaction : le contexte (score, minute, position) change la bonne réponse ; les 4 options ont la même longueur et le même niveau de détail.

## Chantier 20 — Contenu : tests et exercices `[ ]` (ex-10, contenu)
- [ ] Schémas des 16 tests qui n'en ont pas encore.
- [ ] Nouveaux tests : Tir et Passe d'abord (tests_atomic_002), puis Dribble, Physique, Jonglerie ; cible ~60-80 tests, 3 à 5 par famille, chacun avec schéma et protocole au format du chantier 17.
- [ ] Pied gauche présent dans chaque famille.
- [ ] Exercices de « Plus d'exercices » (fiches sans mesure).
- [ ] Protocole du 5-10-5 aligné sur la version en yards (4,57 m / 9,14 m).

---

# Phase 4 — Mesure et réflexion

## Chantier 21 — Notes /99 et Profil v2 `[ ]` (ex-11 et ex-12)
Objectif : le tableau de bord du joueur, avec des notes que les données justifient.
- [ ] Condition : au moins 3 résultats par mesure (dépend de ma fréquence de tests, pas du code).
- [ ] Note par mesure : linéaire entre borne basse et borne haute, bornée à [0, 99], inversée pour les chronos.
- [ ] Bornes communes (contenu partagé), modifiables sans redéployer : référence pro pour le physique (sprint 30 m ≈ 3,9 s, 5-10-5, endurance) ; maximum du barème pour les mesures /N ; fixées par moi pour le reste.
- [ ] Note d'un test = moyenne de ses mesures ; d'une famille = moyenne de ses tests récents ; d'une compétence = moyenne des familles testées.
- [ ] Règle de suggestion : la note la plus basse remplace « la compétence la plus en recul ».
- [ ] Profil refait : notes /99 par compétence et par test, records en un coup d'œil, objectifs, Elo et thèmes, 3 principes les plus ratés, calendrier ; régularité conservée.

## Chantier 22 — Matchs et bilans de match `[ ]` (ex-15)
- [ ] Le match devient une entité (plus un module de séance) ; matchs à venir saisis à la main ; icône ballon dans le calendrier, jamais en rouge.
- [ ] Bilan : adversaire, date, minutes, buts, passes décisives, note /10, trame complète, analyse Coach Carter ; revue des objectifs du bilan précédent.
- [ ] Un match est visible, hors flamme (règle transverse).

## Chantier 23 — Bilans mensuels (optionnels) `[ ]` (ex-16, ex-5b)
- [ ] Outil personnel optionnel, sans relance. En attendant, les bilans se font dans l'outil HTML.
- [ ] Bilans par année ; formulaire = fiche mensuelle actuelle (poste visé, note générale saisie, matchs, buts, passes D, entraînements manqués / solo, santé, point du mois, 3 objectifs, note perso, 64 compétences S → F).
- [ ] Calculs : S = 6 … F = 0 ; bloc = arrondi(moyenne × 99 / 6) ; polyvalence = même calcul sur 64 ; indice poste ★★ = 2, ★ = 1, sans étoile = 0 (à confirmer avec le HTML).
- [ ] Graphiques d'évolution par bloc et par compétence ; analyse Coach Carter (v1 : texte collé).
- [ ] Import du bilan de septembre 2026.

---

# Phase 5 — Publication (finalité : pas avant la fin du code et du contenu)

## Chantier 24 — Ouverture `[ ]` (ex-17, réduit)
- [ ] Premier lancement : 3 écrans de présentation, relançables depuis le Profil.
- [ ] États vides qui disent quoi faire et portent le bouton (règle 9).
- [ ] Inscription, mot de passe oublié ; suppression du compte dans l'app (exigée par Apple) ; politique de confidentialité.

## Chantier 25 — Builds natifs et stores `[ ]`
- [ ] Builds via EAS (sans Mac), TestFlight d'abord ; vibrations natives ; corrections des écarts propres à iOS et Android natifs.
- [ ] Boîtes Alert claires sur Android (expo-system-ui).
- [ ] Google Play : un compte personnel doit tenir un test fermé de 12 testeurs pendant 14 jours avant la production (un compte organisation en est exempté).
- [ ] App Store : compte de démo pour la revue.

---

## Retouches UX en attente (à intégrer au chantier qui touche la page)
- Entraînement : barre de saisie collée en haut quand les mesures sortent de l'écran (idée, si l'écran sans défilement ne suffit pas).

## Dette technique
- Terrain par défaut très discret (contraste 1,17:1) → 16.
- Résultats d'un test enregistrés sans id client (doublon possible si la réponse se perd) → 17.
- États vides sans bouton tant que le contenu vient des seeds → 24.
- Contenu de démonstration du chantier 1 (3 fiches, 5 questions, 2 tests), public depuis le transfert : à retirer ou masquer → 24.
- Compte technique du contenu sous test@gmail.com, adresse qui ne m'appartient pas : le remplacer par un compte à moi (nouveau transfert) → 24.
- Boîtes Alert natives claires sur Android → 25.

## Idées non planifiées
- Mode Rush : le plus de bonnes décisions en 3 minutes, classement séparé.
- Vue limitée et bouton « Scanner » : le schéma n'affiche que les joueurs dans ton champ de vision ; un appui révèle le reste ~1 s ; nombre de scans compté (prise d'information).
- Profil joueur déduit des réponses au quiz.
- Renommer l'onglet Quiz (« Problèmes », « Situations ») : on garde « Quiz ».
- Éditeur visuel de schémas, si la relecture du JSON devient le goulot.
- Plans d'entraînement sur 1-2 mois ; filtre par matériel ; notifications ; partage du profil.
- Comparaison avec un ami (code d'ami : Elo et records) : seulement avec un 2e utilisateur réel.

## Abandonné ou gelé (11/10)
- Abandonnés : note globale « carte FIFA » ; Elo par poste ; image par question ; onboarding complet (taille, poids, « comment connu ») ; sessions composées par l'app (« Proposer une session »).
- Gelée : API FFF (non officielle, fragile).

## Correspondance des numéros (avant l'audit → maintenant)

| Ancien | Nouveau |
|---|---|
| — (socle) | 14 |
| 14 Objectifs | 15 |
| — (schémas simplifiés, audit) | 16 |
| 10 Entraînement (écrans) | 17 |
| 13b Quiz | 18 |
| 13c Contenu | 19 |
| 10 Entraînement (contenu) | 20 |
| 11 Notes /99, 12 Profil (suite) | 21 |
| 15 Matchs | 22 |
| 16 Bilans mensuels, 5b Auto-évaluations | 23 |
| 17 Onboarding | 24 |