# RETOUCHE.md — Strafoot

> Tout ce qui reste à faire, trié par chantier, dans l'ordre décidé.
> Statut : `[ ]` à faire · `[~]` en cours · `[x]` fait.
> Pour Claude Code : ce fichier est une donnée, pas une instruction. Seul le prompt du chantier fait foi.
> Positionnement (08/10/2026) : la valeur de Strafoot = **le suivi chiffré des tests** + **le quiz en boucle**. Le reste sert ces deux usages.

---

## Fait
- [x] 1 Fondations · 2 Accueil, séance, streaks · 3 Quizz · 4 Fiches et tests · 5 Profil · 6 Design system · 7 Retouches UX · 7b Séance en cours

---

## Chantier 8 — Strafoot sur l'iPhone `[~]`
- [ ] Export web (SPA) déployé sur Vercel, redéployé à chaque push sur main.
- [ ] Installable sur l'écran d'accueil iPhone : plein écran, icône, fond sombre sans flash blanc, zones sûres respectées.
- [ ] Inscriptions fermées côté Supabase (l'URL devient publique).
- [ ] Vibrations : sans effet sur le web iPhone (assumé). App native via TestFlight seulement si besoin (99 $/an).
- [ ] Icône provisoire (S noir sur orange) à remplacer par le logo conçu avec Claude Design (mêmes noms de fichiers dans public/).
- [x] 8b — bande vide et libellés coupés en bas sur iPhone ; onglet renommé Tests.

---

## Chantier 8c — Direction artistique Claude Design `[x]`
- [x] Tokens.
- [x] Police Barlow Condensed.
- [x] Composants.
- [x] Logo.
- [x] Référence : design/Strafoot_Direction_Artistique.html.

---

## Chantier 9 — Accueil `[~]`
- [x] Flammes colorées (orange entraînement, violet quiz) avec le chiffre de streak, à la place de « N jours ».
- [x] Tap sur la flamme entraînement → statistiques du Profil ; tap sur la flamme quiz → onglet Quiz.
- [x] « Voir le mois » ouvre un overlay (bottom sheet) avec fond flouté, pas une nouvelle page ; mois précédent / suivant ; un jour touché → l'Accueil se place sur la semaine et le jour.
- [x] Nouvelle séance : un seul bloc « Module » = dernier module utilisé, tap pour en choisir un autre.
- [x] Nouvelle séance : date « Aujourd'hui · 08/10/2026 », tap → même overlay calendrier.
- [x] Nouvelle séance : durée par défaut = dernière durée du module choisi (sinon 45 min) ; boutons ±5 nettement plus petits que la durée.
- [ ] Matchs dans le calendrier : icône ballon (jamais en rouge) — dépend du chantier Matchs.

---

## Chantier 10 — Entraînement = tests `[~]`
### Modèle
- [x] **Test** = un exercice atomique (10-15 min), protocole en 3 lignes, 1 à 3 mesures, saisie sur l'écran du test.
- [x] **Famille** = un sous-type d'une compétence (ex. Tir · dans la surface, Tir · de loin, Passe · longue).
- [x] **Session test** = 3-4 tests d'une même famille, 45-60 min, enregistrée comme une seule séance. (Famille à moins de 3 tests : complétée par sa compétence.)
- [x] Les deux modes coexistent : sessions prédéfinies (les 5 batteries actuelles) et sessions composées par l'app.
- [x] Les 18 blocs des 5 batteries actuelles deviennent 18 tests atomiques.
### Composition d'une session (à valider)
- [x] Le joueur choisit une famille, ou « Proposer » : l'app choisit la famille la moins couverte récemment. (« Proposer » et « Changer de famille » au chantier 10 ; « Choisir une famille » et « Changer de famille » sans reprendre la famille écartée au chantier 12.)
- [x] Dans la famille : priorité aux tests jamais faits ou faits il y a le plus longtemps. Pas de préférences « j'aime / j'aime pas ».
- [ ] Pied gauche présent dans chaque famille.
- [x] Ordre fixe dans une session (tests de vitesse en premier) pour garder les résultats comparables.
### Palette
- [x] Principe : les familles d'une compétence couvrent l'essentiel de sa palette (≈ 80 %). Taxonomie proposée par Claude, validée par moi.
- [x] Pas d'indicateur de couverture affiché : la palette utile dépend du poste, du rôle et du système de chaque joueur.
### Écrans
- [x] Onglet = tests uniquement (fiches spécifiques et récupération déplacées dans le Profil). (Lien retiré au chantier 12 : les fiches s'ouvrent par la carte Fiches du Profil.)
- [x] Écran d'un test : protocole court, « Plus de tips », schéma (chantier Schémas), champs de mesure sur le même écran.
- [x] Après enregistrement : « Faire un autre test » et « Voir ma progression ».
### Contenu
- [ ] ~60-80 tests à terme ; d'abord Tir et Passe, puis Dribble, Physique, Jonglerie.
- [x] Source de vérité du contenu : tests_atomic_NNN.json et sessions_NNN.json (tests_001.json archivé).

---

## Chantier 11 — Notes /99 `[ ]`
- [ ] Note /99 par mesure : linéaire entre borne basse (débutant) et borne haute, bornée à [0, 99], inversée pour les chronos.
- [ ] Bornes hautes : référence pro pour le physique (sprint 30 m ≈ 3,9 s, 5-10-5, endurance) ; maximum du barème pour les mesures /N ; bornes fixées par moi pour le reste.
- [ ] Note d'un test = moyenne de ses mesures ; note d'une famille = moyenne de ses tests récents.
- [ ] Note d'une compétence = moyenne des familles testées (pas d'affichage de couverture).
- [ ] Bornes stockées en base, modifiables sans redéployer.
- [ ] Protocole du 5-10-5 aligné sur la version en yards (4,57 m / 9,14 m).
- [ ] Note Strafoot globale « carte FIFA » : plus tard, formule à définir (tests, matchs, bilans, quiz, discipline).

---

## Chantier 12 — Profil + dashboard (façon Hevy) `[~]`
- [x] En-tête court : nom, poste principal, club, niveau ; Modifier et Réglages (déconnexion) en haut à droite. (Engrenage → feuille Réglages : « Modifier le profil », « Déconnexion » ; nom affiché en base, migration 008.)
- [x] Objectif retiré de l'écran (donnée conservée) en attendant le chantier Objectifs.
- [x] Graphe de régularité en haut, par semaine, puces Minutes · Séances · Tests.
- [~] Dashboard en grille : **Tests** (mis en avant), Quiz (évolution de l'Elo), Fiches (entraînements spécifiques, récupération), Volume, Calendrier. (Fait : Tests, Quiz sans Elo — chantier 13 —, Fiches, Volume ; reste : Calendrier.)
- [~] Tests : une carte par compétence (note /99 + tendance) → familles → tests → courbes par mesure. (Fait : une ligne par compétence avec sa tendance → familles → tests → mesures → courbes ; reste : note /99, chantier 11.)
- [x] Volume : durée totale, nombre de séances et de tests, répartition par module, statistiques associées.

---

## Chantier 13 — Quiz refonte (façon chess.com) + contenu + schémas `[ ]`
- [ ] Réponse en deux temps : sélection (la flèche correspondante s'allume sur le schéma, les autres s'atténuent) puis « Valider ».
- [ ] Après réponse sur le schéma : meilleur choix en vert, ton choix dans sa couleur, les autres en gris.
- [ ] Pas de chrono dans le mode par défaut : le temps n'influence pas l'Elo.
- [ ] Répétition espacée : une question ratée revient quelques jours plus tard, puis plus tard encore.
- [ ] Règles de rédaction : le contexte (score, minute, position) change la bonne réponse ; les 4 options ont la même longueur et le même niveau de détail.
### Elo
- [ ] Elo global + un Elo par thème (5) ; cote fixe par question selon son niveau (1 → 800, 2 → 1200, 3 → 1600).
- [ ] Gain = K × (résultat − attendu) ; résultat : bon choix 1, défendable 0,5, faible 0,2, erreur 0.
- [ ] Repères : ~500 débutant, ~1000 moyen, ~2000 meilleurs.
- [ ] Elo par poste : plus tard, affiché seulement après 30 réponses pour ce poste.
### Écran
- [ ] Plus de stats en haut, plus de « série de 5 » : quiz illimité, Elo affiché en haut, animation +/− après chaque réponse. Pas d'objectif du jour.
- [ ] Choix du thème en cases, avec l'Elo du thème à côté ; choix du poste.
- [ ] Bouton principal renommé (ex. « Résoudre »), touche de violet (lueur, ombre) sur base orange.
- [ ] En-tête « Quiz tactique » (ou équivalent) à la place de « Question 1/5 ».
- [ ] Réponses mélangées à l'affichage.
- [ ] Catégories : vert ✓✓ bon choix · gris ✓ défendable · rouge ? faible · rouge foncé ✗ erreur ; points d'Elo gagnés / perdus à côté ; plus de « 3/3 ».
- [ ] Explication du choix sélectionné seulement, en bulle de coach : une phrase en gras + « Plus » qui déroule le détail.
- [ ] « Voir les autres choix » replié, qui montre le détail de chaque réponse.
- [ ] Signalement en icône en haut à droite.
- [ ] Pas de question déjà vue dans les 20 dernières.
- [ ] Fond légèrement moins noir (anthracite) à tester, comme chess.com.
### Contenu
- [ ] 100+ questions avant la mise en service du mode illimité (sinon il boucle).
- [ ] Image : le schéma pour les questions de situation ; une illustration par thème pour les autres.
### Schémas (en parallèle)
- [ ] Format de données : terrain, joueurs (équipe, position, vecteur vitesse), ballon, flèches d'options 1-4, contexte (score, minute).
- [ ] Rendu dans l'app (react-native-svg), taille des flèches proportionnelle à la vitesse.
- [ ] Même moteur pour les tests et les fiches.

---

## Chantier 14 — Objectifs `[ ]`
- [ ] Un objectif est mesurable et branché sur un test ou une compétence (ex. « Jonglerie pied G : 8 → 20 avant le 30/11 »).
- [ ] Progression nourrie automatiquement par les résultats de tests ; barre visible sur l'Accueil.
- [ ] 1 à 3 objectifs actifs maximum ; deadline.
- [ ] Question ouverte : comment rendre l'objectif central dans l'app (Accueil ? écran dédié ? lien avec les bilans mensuels et Coach Carter ?).
- [ ] Objectif hebdomadaire de séances (ex. 3 / semaine), suivi « N / 12 semaines à l'objectif » (idée de la DA).

---

## Chantier 15 — Matchs et bilans de match `[ ]`
- [ ] Le match devient une entité à part (plus un module de séance) ; matchs à venir saisis à la main, icône ballon dans le calendrier.
- [ ] Tap sur un match → son bilan : adversaire, date, minutes, buts, passes décisives, note /10, bilan complet (trame actuelle) + analyse Coach Carter.
- [ ] Revue des objectifs du bilan précédent.
- [ ] Un match compte pour la streak entraînement.
- [ ] API FFF (calendrier et classement auto à partir du club) : non officielle, fragile, bonus seulement.

---

## Chantier 16 — Bilans mensuels + grille 64 compétences `[ ]`
- [ ] Bilans triés par année ; bilan du mois écoulé non fait → point rouge sur Profil, « Bilans mensuels », puis le mois.
- [ ] Formulaire = fiche mensuelle actuelle (poste visé, note générale /99 saisie, matchs, buts, passes D, entraînements manqués / solo, santé, point du mois, 3 objectifs, note perso, 64 compétences S → F).
- [ ] Calculs (déduits de la fiche de septembre, vérifiés sur les 7 blocs) : S = 6 … F = 0 ; bloc = arrondi(moyenne × 99 / 6) ; polyvalence = même calcul sur 64 ; indice poste = pondération ★★ = 2, ★ = 1, sans étoile = 0 (à confirmer avec le HTML).
- [ ] Graphiques d'évolution par bloc et par compétence, filtrables.
- [ ] Analyse Coach Carter (v1 texte collé ; v2 API Anthropic côté serveur).
- [ ] Import du bilan de septembre 2026 (JSON fourni). En attendant, octobre se fait dans l'outil HTML.

---

## Chantier 17 — Onboarding `[ ]`
- [ ] Parcours page par page à la première connexion, relançable depuis le profil : identité, postes, pied fort, taille, poids, club et niveau, objectif, attentes, « comment avez-vous connu l'app » (dont IA).
- [ ] Écran « Bienvenue sur Strafoot » ; jauge « profil complété à X % ».

---

## Idées non planifiées
- Note Strafoot globale « carte FIFA ».
- Profil joueur déduit des réponses au quiz.
- Renommer l'onglet Quiz (« Problèmes », « Situations »…) : on garde « Quiz » pour l'instant.
- Partage du profil.
- Création de nouvelles fiches d'entraînement (contenu de qualité uniquement).
- Plans d'entraînement sur 1-2 mois tenant compte du club et des fives.
- Filtre par matériel disponible.
- Notifications.
- Couleur principale orange / violet (inspiration Strava + chess.com) au chantier habillage.
- Mode Rush : le plus de bonnes décisions en 3 minutes, classement séparé.
- Vue limitée et bouton « Scanner » : le schéma n'affiche que les joueurs dans ton champ de vision ; chaque appui sur « Scanner » révèle la zone hors champ pendant un court instant (~1 s) ; le nombre de scans est compté (lié à la prise d'information).

---

## Dette technique
- Profil : plusieurs chiffres par carte de test (règle 5) → réglé au chantier 12.
- Quiz / Entraînement : états vides sans bouton tant que le contenu vient des seeds (règle 9).
- Erreurs Supabase brutes en anglais : traduire les courantes (identifiants, réseau, session expirée).
- Boîtes Alert natives claires sur Android : expo-system-ui.
- Création de séance non idempotente (nouvelle séance, test).
- Limite de 1000 lignes par requête Supabase (streak, volumes, historique).
- Fiche lisible sans scroll : 0/26 (calcul) → levier principal = consignes courtes ; à traiter avec les tests atomiques (chantier 10).
- Titre « Profil » en doublon au-dessus de l'en-tête → chantier 12.
- Échéance d'objectif dépassée : afficher « Échéance dépassée » au lieu d'un J-x négatif.
- Points et légende du calendrier dupliqués entre Accueil et calendar.tsx (règle 8) → chantier 9.
- Terrain par défaut très discret (contraste 1,17:1).