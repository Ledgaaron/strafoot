-- =============================================================================
-- seed_sheets_001.sql : 7 fiches de l'onglet Entraînement (2 fiches de
-- lecture, 5 tests) et le catalogue de leurs 23 mesures, depuis
-- supabase/content/sheets_001.json et supabase/content/tests_001.json.
--
-- Fichier généré par scripts/build-seed-sheets.ts : ne pas modifier à la
-- main, modifier les JSON puis relancer npx tsx scripts/build-seed-sheets.ts.
--
-- À exécuter dans le SQL Editor APRÈS
-- supabase/migrations/004_training_sheets_and_tests.sql.
--
-- 1. Récupère ton UUID : Dashboard Supabase → Authentication → Users →
--    clique sur ton utilisateur → copie « User UID ».
-- 2. Colle tout le fichier dans le SQL Editor, puis remplace par cet UUID le
--    marqueur entre chevrons de la ligne uid uuid := … (une seule occurrence).
--    Fais-le dans le SQL Editor, pas dans ce fichier, qui est régénéré.
-- 3. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),
--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.
--
-- Idempotent : upsert sur (user_id, key) pour les mesures et sur
-- (user_id, slug) pour les fiches. Une ligne absente est insérée ; une ligne qui
-- diffère du JSON est mise à jour sur place (même id : séances et résultats
-- liés conservés) ; une ligne identique n'est pas touchée. Une seconde
-- exécution ne change rien.
-- Les schémas (champ diagram) sont des fichiers du bucket Storage diagrams,
-- déposés à la main : ce fichier ne les crée pas.
--
-- Le trigger set_user_id impose user_id := auth.uid(). Le SQL Editor n'a pas de
-- JWT (auth.uid() est null) : le bloc simule celui de l'utilisateur, le temps
-- de la transaction uniquement. Les inserts n'envoient donc jamais user_id.
-- =============================================================================

do $$
declare
  uid uuid := '<REMPLACER_PAR_MON_UUID>';
  existing_count integer;
  changed_count integer;
begin
  if not exists (select 1 from auth.users where id = uid) then
    raise exception 'Aucun utilisateur % dans auth.users : vérifie l’UUID copié.', uid;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  if auth.uid() is distinct from uid then
    raise exception 'Simulation du JWT inopérante : auth.uid() = %, attendu %.', auth.uid(), uid;
  end if;

  -- ---------------------------------------------------------------------------
  -- Catalogue des mesures (clé : key) ; protocol = titre du test — titre du bloc
  -- ---------------------------------------------------------------------------
  select count(*) into existing_count
  from public.tests t
  where t.user_id = uid
    and t.key in (
      'tir_precision_droit',
      'tir_precision_gauche',
      'tir_finition_controle',
      'tir_enchainement_cadres',
      'tir_enchainement_temps',
      'passe_courte_libre',
      'passe_courte_gauche',
      'passe_longue_droit',
      'passe_longue_gauche',
      'passe_mouvement',
      'dribble_slalom_libre',
      'dribble_slalom_gauche',
      'dribble_conduite_20m',
      'dribble_huit_libre',
      'dribble_huit_gauche',
      'jonglerie_alternance',
      'jonglerie_gauche',
      'jonglerie_tete',
      'jonglerie_30s',
      'phys_sprint_30m',
      'phys_5_10_5',
      'phys_gainage',
      'phys_6min_distance'
    );

  insert into public.tests (key, name, unit, higher_is_better, protocol)
  select v.key, v.name, v.unit, v.higher_is_better, v.protocol
  from (values
    ('tir_precision_droit', 'Précision arrêt — pied droit', 'pts /30', true, 'Test Tir — Précision à l''arrêt'),
    ('tir_precision_gauche', 'Précision arrêt — pied gauche', 'pts /30', true, 'Test Tir — Précision à l''arrêt'),
    ('tir_finition_controle', 'Finition après contrôle', 'pts /20', true, 'Test Tir — Finition après contrôle'),
    ('tir_enchainement_cadres', 'Enchaînement — frappes cadrées', '/6', true, 'Test Tir — Enchaînement sous chrono'),
    ('tir_enchainement_temps', 'Enchaînement — temps', 's', false, 'Test Tir — Enchaînement sous chrono'),
    ('passe_courte_libre', 'Passes courtes 2'' — pied libre', 'nb', true, 'Test Passe — Précision courte au mur'),
    ('passe_courte_gauche', 'Passes courtes 2'' — pied gauche', 'nb', true, 'Test Passe — Précision courte au mur'),
    ('passe_longue_droit', 'Passe longue 25 m — pied droit', '/10', true, 'Test Passe — Passe longue dans la zone'),
    ('passe_longue_gauche', 'Passe longue 18 m — pied gauche', '/10', true, 'Test Passe — Passe longue dans la zone'),
    ('passe_mouvement', 'Passe en mouvement', '/10', true, 'Test Passe — Passe en mouvement'),
    ('dribble_slalom_libre', 'Slalom 8 plots — pied libre', 's', false, 'Test Dribble — Slalom conduite libre'),
    ('dribble_slalom_gauche', 'Slalom 8 plots — pied gauche', 's', false, 'Test Dribble — Slalom pied gauche'),
    ('dribble_conduite_20m', 'Conduite-vitesse 20 m A/R', 's', false, 'Test Dribble — Conduite-vitesse 20 m'),
    ('dribble_huit_libre', 'Huit 30 s — pied libre', 'tours', true, 'Test Dribble — Huit en 30 secondes'),
    ('dribble_huit_gauche', 'Huit 30 s — pied gauche', 'tours', true, 'Test Dribble — Huit en 30 secondes'),
    ('jonglerie_alternance', 'Jonglerie alternance D/G', 'touches', true, 'Test Jonglerie — Alternance stricte D / G'),
    ('jonglerie_gauche', 'Jonglerie pied gauche seul', 'touches', true, 'Test Jonglerie — Pied gauche seul'),
    ('jonglerie_tete', 'Jonglerie tête', 'touches', true, 'Test Jonglerie — Tête'),
    ('jonglerie_30s', 'Jonglerie 30 s libres', 'touches', true, 'Test Jonglerie — 30 secondes libres'),
    ('phys_sprint_30m', 'Sprint 30 m', 's', false, 'Test Physique — Sprint 30 m'),
    ('phys_5_10_5', '5-10-5 agilité', 's', false, 'Test Physique — 5-10-5 (agilité)'),
    ('phys_gainage', 'Gainage frontal', 's', true, 'Test Physique — Gainage frontal'),
    ('phys_6min_distance', 'Test 6 minutes — distance', 'm', true, 'Test Physique — Test 6 minutes')
  ) as v(key, name, unit, higher_is_better, protocol)
  on conflict (user_id, key) where key is not null do update
  set name = excluded.name,
      unit = excluded.unit,
      higher_is_better = excluded.higher_is_better,
      protocol = excluded.protocol
  where (tests.name, tests.unit, tests.higher_is_better, tests.protocol)
    is distinct from (excluded.name, excluded.unit, excluded.higher_is_better, excluded.protocol);

  -- Lignes insérées ou mises à jour ; une ligne identique au JSON ne compte pas.
  get diagnostics changed_count = row_count;
  raise notice 'Mesures pour % : sur 23, insérées : %, mises à jour : %, inchangées : %.',
    uid,
    23 - existing_count,
    changed_count - (23 - existing_count),
    existing_count - (changed_count - (23 - existing_count));

  -- ---------------------------------------------------------------------------
  -- Fiches et tests (clé : slug) ; exercises = tableau complet du JSON
  -- ---------------------------------------------------------------------------
  select count(*) into existing_count
  from public.training_sheets s
  where s.user_id = uid
    and s.slug in (
      'bo-tir-finition-surface',
      'bo-passe-remise-controle-scan',
      'test-tir',
      'test-passe',
      'test-dribble',
      'test-jonglerie',
      'test-physique'
    );

  insert into public.training_sheets
    (slug, kind, title, subtitle, positions, skill, duration_min, intro, exercises, is_public)
  select v.slug, v.kind, v.title, v.subtitle, v.positions, v.skill, v.duration_min, v.intro, v.exercises, false
  from (values
    (
      'bo-tir-finition-surface',
      'training',
      'Tir : finition dans la surface',
      'Séance BO — solo, but réel',
      array['avant_centre', 'ailier', 'milieu_offensif'],
      'tir',
      45,
      '[
        "45'' hors échauffement. 1 joueur, 2 ballons, plots, but réel avec filet. Intérieur du pied D / G, placé « petit filet ».",
        "Zone petit filet = ballon au sol entre le poteau et le plot cible (1 m).",
        "Règle commune : ballon au sol ; 2 ballons puis récupération en marchant = repos."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Gamme de frappe à l''arrêt — D / G",
          "duration_min": 10,
          "objective": "Fixer la mécanique de la frappe intérieur du pied, surtout pied gauche, sur ballon arrêté sans contrainte.",
          "goal": "Marquer au sol dans la zone « petit filet » (entre le poteau et le plot cible).",
          "instructions": [
            "2 ballons posés face au but. Pied droit depuis le point de penalty (11 m). Pied gauche depuis 7-8 m : on raccourcit pour réussir le geste avant d''ajouter la distance.",
            "Série = 2 frappes du même pied, alterner le côté visé à chaque frappe (poteau gauche, poteau droit). 10 séries D + 10 séries G.",
            "Élan de 2-3 pas en diagonale, pas de course. Entre deux séries : récupérer en marchant, c''est la récupération."
          ],
          "success_criteria": [
            "Pied droit : 12 petits filets / 20.",
            "Pied gauche : 8 / 20, tous les ballons au sol et cadrés.",
            "Si gauche ≥ 14/20, reculer à 11 m."
          ],
          "technical_points": [
            "Pied d''appui à 15-20 cm du ballon, à hauteur du ballon, pointe vers la cible, genou fléchi.",
            "Hanche ouverte, cheville verrouillée pointe relevée, contact plein centre du ballon avec la voûte interne.",
            "Regard sur le ballon au contact, buste légèrement penché, bras opposé en équilibre.",
            "Accompagner le geste dans la direction de la cible (pas de frappe sèche). Pied gauche : ralentir le geste, priorité à la précision, pas à la vitesse."
          ],
          "variations": {
            "easier": "Pied gauche à 6 m, ballon posé légèrement devant le pied d''appui.",
            "harder": "Viser un seul poteau sur 5 frappes consécutives ; pied droit à 14 m ; chrono entre les 2 frappes d''une série (3 s)."
          },
          "setup": {
            "surface": "Face au but, 7 à 11 m",
            "sequence": "20 séries de 2 frappes",
            "equipment": "1 joueur, 2 ballons, 2 plots"
          },
          "diagram": "tir-exo1.png"
        },
        {
          "order": 2,
          "title": "Conduite — porte — frappe croisée",
          "duration_min": 10,
          "objective": "Frapper intérieur du pied après une conduite : enchaîner la touche d''orientation et la frappe sans casser le rythme.",
          "goal": "Frapper en 2 touches maximum après la porte et marquer au sol dans le petit filet opposé (frappe croisée).",
          "instructions": [
            "2 parcours symétriques. Départ excentré à 25 m (plot), conduite libre jusqu''à une porte de 2 m posée à 16-18 m, à hauteur de la ligne de surface.",
            "Après la porte : 1 touche d''orientation vers l''intérieur puis frappe du pied côté départ (côté droit = pied droit, côté gauche = pied gauche), croisée vers le poteau opposé.",
            "2 ballons = 2 courses de suite (une par côté), puis récupération. 8 courses par côté."
          ],
          "success_criteria": [
            "6 frappes croisées au sol sur 8 côté droit, 4 sur 8 côté gauche.",
            "Zéro frappe au-dessus du genou."
          ],
          "technical_points": [
            "Dernière touche de conduite légèrement vers l''intérieur pour ouvrir l''angle vers le poteau opposé.",
            "Lever la tête pendant la conduite (2 regards vers le but avant la porte) : repérer le poteau visé avant la touche d''orientation.",
            "Pied d''appui planté à côté du ballon même en mouvement ; ne pas frapper « en avançant » le ballon trop loin devant.",
            "Côté gauche : réduire la vitesse de conduite jusqu''à ce que le geste soit propre, puis réaccélérer."
          ],
          "variations": {
            "easier": "Porte à 14 m, 3 touches autorisées, frapper côté le plus proche d''abord.",
            "harder": "1 seule touche après la porte (frappe directe sur la conduite), départ à 30 m, porte réduite à 1,5 m."
          },
          "setup": {
            "surface": "Surface + 10 m",
            "sequence": "8 passages par côté",
            "equipment": "1 joueur, 2 ballons, 6 plots"
          },
          "diagram": "tir-exo2.png"
        },
        {
          "order": 3,
          "title": "Auto-passe — scan — contrôle orienté — finition",
          "duration_min": 13,
          "objective": "Finir après une course : décider du côté avant le contrôle (scan pendant la course du ballon), contrôle orienté puis frappe placée.",
          "goal": "Marquer au sol dans le petit filet du côté choisi, en 2 touches (contrôle + frappe), moins de 4 s après la 1re touche.",
          "instructions": [
            "Départ plot excentré à 25 m. Zone de réception 3 × 3 m (4 plots) autour du point de penalty.",
            "Auto-passe au sol dans la zone (passe appuyée pour soi), sprint, contrôle orienté vers le but, frappe immédiate en 2e touche.",
            "Règle de décision : avant la 1re touche, regarder le but. Côté départ droit = pied droit vers poteau gauche ; côté départ gauche = pied gauche vers poteau droit. Alterner les côtés. 2 ballons = 2 actions puis récupération."
          ],
          "success_criteria": [
            "Contrôle orienté dans le sens du but 14 fois / 16 (pas de touche vers l''arrière).",
            "Petit filet 6/16, dont 2 du gauche.",
            "Chaque action < 4 s."
          ],
          "technical_points": [
            "Scan : tête levée pendant que le ballon roule, avant la 1re touche (le choix est fait quand le ballon arrive).",
            "1re touche avec le pied éloigné du but qui pousse le ballon à 1,5-2 m vers l''avant-intérieur, face au but, pas sur le côté.",
            "Frappe en 2e touche sans réajustement : si on fait un pas de plus, le contrôle était trop long ou trop court.",
            "Respiration et appuis : freiner sur le dernier appui avant le contrôle, ne pas arriver lancé sur le ballon."
          ],
          "variations": {
            "easier": "Zone à 9 m, 3 touches, choisir le côté avant de partir.",
            "harder": "Zone 2 × 2 m à 14 m ; auto-passe plus forte ; tirer au sort le côté en levant la tête sur un repère (ex. choisir le poteau opposé au pied qui contrôle)."
          },
          "setup": {
            "surface": "Surface + 10 m",
            "sequence": "8 actions par côté",
            "equipment": "1 joueur, 2 ballons, 6 plots"
          },
          "diagram": "tir-exo3.png"
        },
        {
          "order": 4,
          "title": "Circuit « match » — 2 frappes sous fatigue, score",
          "duration_min": 12,
          "objective": "Finir sous fatigue et avec un enjeu : garder la mécanique de frappe quand le rythme cardiaque monte (transfert vers le match).",
          "goal": "Marquer le maximum de points sur 8 tours : petit filet au sol = 3, cadré au sol ailleurs = 1, non cadré ou au-dessus du genou = -1.",
          "instructions": [
            "Ballon A posé à 10 m dans l''axe. Ballon B posé à 16 m, excentré gauche (tours impairs) ou droit (tours pairs). Départ plot à 35 m.",
            "Tour : sprint 35 m — frappe A du pied gauche placée (sans conduite) — course vers B — 2 touches (orientation + frappe croisée du pied côté ballon) — récupération des 2 ballons en marchant = repos.",
            "Replacer les ballons, repartir. Noter le score à chaque tour, total sur 8."
          ],
          "success_criteria": [
            "Score ≥ 20 points sur 48 possibles.",
            "Aucune frappe à -1 sur les tours 6 à 8 (tenir la technique fatigué)."
          ],
          "technical_points": [
            "Les 3 derniers appuis avant chaque ballon : courts et rapides pour replacer le pied d''appui ; c''est ce qui casse quand on est fatigué.",
            "Pied gauche sur A : même geste lent et appuyé que dans l''exo 1, même si l''enjeu pousse à frapper fort.",
            "Tête haute dans la course vers B : choisir le poteau avant la touche d''orientation."
          ],
          "variations": {
            "easier": "Départ à 25 m, ballon A à 8 m, 3 touches sur B.",
            "harder": "Chrono 15 s max par tour, ballon A du pied gauche en 1 touche après une auto-passe, ballon B en 1 touche."
          },
          "setup": {
            "surface": "Surface + 20 m",
            "sequence": "8 tours (repos = récupération)",
            "equipment": "1 joueur, 2 ballons, 4 plots"
          },
          "diagram": "tir-exo4.png"
        }
      ]'::jsonb
    ),
    (
      'bo-passe-remise-controle-scan',
      'training',
      'Passe : remise 1 touche, contrôle orienté, pied gauche, scan',
      'Séance BO — solo, mur bas — routine quotidienne',
      array['tous'],
      'passe',
      45,
      '[
        "45'' hors échauffement. 1 joueur, 2 ballons, plots, mur < 1 m : tout ballon qui monte au-dessus est une passe ratée, c''est le juge de la séance.",
        "Portes = 2 plots au pied du mur. Scan = tourner la tête par-dessus l''épaule pendant que le ballon roule, et nommer ce qu''on voit.",
        "Le 2e ballon sert à relancer sans arrêter le chrono."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Gamme au mur — passe intérieur D / G, 2 touches puis 1 touche",
          "duration_min": 8,
          "objective": "Qualité de passe intérieur du pied : ballon au sol, dosé, précis, des deux pieds. Mettre le pied gauche en route sans contrainte.",
          "goal": "Enchaîner les passes au mur sans que le ballon ne monte ni ne s''arrête. Cible : une porte de 1 m sur le mur (2 plots au pied du mur).",
          "instructions": [
            "Joueur à 5 m du mur, 2e ballon à portée (relance immédiate si le 1er s''échappe).",
            "Bloc 1 (2'') : 2 touches, alterner pied droit / pied gauche à chaque passe (contrôle du pied qui va passer).",
            "Bloc 2 (2'') : 2 touches, pied gauche uniquement. Bloc 3 (2'') : 1 touche, alterner D / G. Bloc 4 (2'') : 1 touche, pied gauche uniquement.",
            "Compter les passes réussies dans la porte par bloc."
          ],
          "success_criteria": [
            "Bloc 2 : 40 passes dans la porte en 2''.",
            "Bloc 4 : 25 passes dans la porte en 2'', aucune au-dessus du genou.",
            "Le mur bas est ton juge : ballon qui monte = passe ratée."
          ],
          "technical_points": [
            "Pied d''appui à côté du ballon, pointé vers la porte ; cheville verrouillée, pointe relevée, surface de contact large (voûte interne).",
            "Dosage : la passe doit revenir jusqu''à toi sans que tu avances. Trop forte = tu recules, trop faible = tu avances.",
            "Pied gauche : geste plus lent, accompagnement long vers la cible. Accepter le rythme plus bas plutôt qu''une passe approximative.",
            "Posture : genoux fléchis, buste au-dessus du ballon, bras en équilibre."
          ],
          "variations": {
            "easier": "4 m, porte de 1,5 m, bloc 4 en 2 touches.",
            "harder": "7 m, porte de 0,8 m, chrono sur 30 passes consécutives, extérieur du pied en bloc 3."
          },
          "setup": {
            "surface": "5 m du mur",
            "sequence": "4 blocs de 2'', 30 s de pause",
            "equipment": "1 joueur, 2 ballons, 2 plots"
          },
          "diagram": "passe-exo1.png"
        },
        {
          "order": 2,
          "title": "Remise 1 touche + scan dans le dos",
          "duration_min": 10,
          "objective": "Remise en 1 touche de qualité avec un scan systématique pendant la course du ballon : installer l''habitude tête levée AVANT la réception.",
          "goal": "Scan dans le dos avant chaque remise, remise 1 touche dans la porte du mur.",
          "instructions": [
            "Joueur à 5 m du mur, 3 plots repères dans le dos à 6-8 m (gauche, axe, droite).",
            "Cycle : passe au mur — pendant que le ballon va et revient, tourner la tête par-dessus l''épaule et nommer à voix haute le plot regardé (G / A / D) — remise 1 touche dans la porte.",
            "Ordre des regards imposé : G, D, A, G, D, A… Alterner l''épaule de scan (épaule gauche pour G, droite pour D). Séries 1-2 : pied libre. Séries 3-5 : pied gauche obligatoire.",
            "Ballon manqué ou qui monte : reprendre avec le 2e ballon sans arrêter le chrono."
          ],
          "success_criteria": [
            "100 % des remises précédées d''un scan nommé (sinon la remise ne compte pas).",
            "Séries 3-5 : 20 remises valides du gauche par série."
          ],
          "technical_points": [
            "Timing : la tête part dès que le ballon quitte le pied, elle revient sur le ballon à mi-chemin du retour. Pas de scan quand le ballon est à 1 m.",
            "Le scan a un contenu : dire ce qu''on voit, pas juste tourner la tête.",
            "Appuis réglés avant la remise : petit pas d''ajustement, pied d''appui planté, remise avec le pied le plus proche de l''orientation voulue.",
            "Remise amortie puis dosée : le ballon ne doit pas rebondir au-dessus du mur."
          ],
          "variations": {
            "easier": "2 touches, scan sur 2 plots seulement.",
            "harder": "Ordre aléatoire via le téléphone (mémo vocal avec des G/A/D enregistrés à intervalles irréguliers, écouteurs) ; 6 m ; remise vers le côté du plot nommé (angle)."
          },
          "setup": {
            "surface": "5 m du mur + 8 m dans le dos",
            "sequence": "5 × 90 s, 30 s de pause",
            "equipment": "1 joueur, 2 ballons, 5 plots"
          },
          "diagram": "passe-exo2.png"
        },
        {
          "order": 3,
          "title": "Zigzag au mur — scan, contrôle orienté, passe dans la porte",
          "duration_min": 12,
          "objective": "Contrôle orienté sous contrainte de déplacement : la 1re touche prépare la passe suivante, le regard a déjà choisi la porte avant que le ballon arrive.",
          "goal": "Porte suivante en 2 touches : 1re touche orientée en mouvement, 2e touche = passe au sol dans la porte.",
          "instructions": [
            "3 portes de 1,5 m au pied du mur : G, A, D espacées de 3 m. Joueur à 6 m face à A.",
            "Passe dans A — retour — scan de la porte suivante — 1re touche orientée — passe dans D — le ballon revient en biais — déplacement, scan, 1re touche — passe dans G… Ordre : A, D, A, G, A, D.",
            "Séries 1-2 : pied libre. Séries 3-4 : passe du pied gauche obligatoire (contrôle libre).",
            "2''30 par série ; compter les portes consécutives (retour à 0 si porte ratée ou 3e touche)."
          ],
          "success_criteria": [
            "Séries 1-2 : 10 portes consécutives au moins une fois.",
            "Séries 3-4 (gauche) : 6 portes consécutives.",
            "Aucun ballon au-dessus du mur."
          ],
          "technical_points": [
            "1re touche avec le pied éloigné de la porte visée, qui pousse le ballon de 1 à 2 m dans la direction de la prochaine passe : le corps est déjà orienté.",
            "Scan pendant que le ballon revient : lire la porte suivante ET le rebond (où le ballon va arriver). Tête levée, puis regard sur le ballon pour la touche.",
            "Si tu dois faire une 3e touche, le contrôle était trop long ou mal orienté : noter et corriger, ne pas accélérer.",
            "Déplacement latéral en pas chassés courts, jamais dos au mur."
          ],
          "variations": {
            "easier": "Portes de 2 m, 3 touches, 5 m.",
            "harder": "Portes de 1 m, 7 m, ordre aléatoire (mémo vocal), contrôle du pied gauche imposé + passe du gauche, sprint entre deux portes."
          },
          "setup": {
            "surface": "Mur 10 m × 6 m",
            "sequence": "4 × 2''30, 30 s de pause",
            "equipment": "1 joueur, 2 ballons, 6 plots"
          },
          "diagram": "passe-exo3.png"
        },
        {
          "order": 4,
          "title": "Test noté « scan — remise — orientation » (référence du mois)",
          "duration_min": 12,
          "objective": "Mesurer chaque jour la même chose : qualité de remise et de contrôle orienté sous fatigue et chrono, pied gauche valorisé.",
          "goal": "Maximum de points en 3 manches de 2'' sur le dispositif de l''exo 3.",
          "instructions": [
            "Ordre imposé des portes : A, D, A, G, A, D… Passe vers la porte suivante dès le retour du ballon.",
            "Barème par passe : porte réussie en 2 touches = 1 pt ; porte en 1 touche (remise directe orientée) = 2 pts ; passe du pied gauche = +1 ; porte ratée = 0 ; ballon au-dessus du mur ou perdu = -1 et relance avec le 2e ballon.",
            "Manche 1 : pied libre. Manche 2 : pied gauche obligatoire (le bonus +1 ne compte donc que pour les 1 touche). Manche 3 : pied libre, 1 touche encouragée.",
            "1'' de repos entre les manches. Noter le score de chaque manche puis le total."
          ],
          "success_criteria": [
            "Référence à établir le jour 1, puis total en hausse sur la moyenne hebdomadaire.",
            "Manche 2 (gauche) jamais inférieure à la moitié de la manche 1.",
            "Zéro -1 en manche 3."
          ],
          "technical_points": [
            "Même protocole chaque jour : mêmes distances, mêmes portes, mêmes ballons. Un test qui change ne mesure rien.",
            "Les points viennent de la régularité, pas de la vitesse : une porte ratée coûte plus qu''une passe lente.",
            "Scan avant chaque passe même sous chrono : c''est précisément ce qui saute quand le rythme monte.",
            "Noter honnêtement, y compris les -1."
          ],
          "variations": {
            "easier": "Jours 1-3 si le score est nul : manches de 90 s, portes de 2 m.",
            "harder": "Quand la moyenne hebdo stagne 2 semaines : 7 m, portes de 1 m, ordre aléatoire au mémo vocal, 1 touche obligatoire en manche 3."
          },
          "setup": {
            "surface": "Dispositif de l''exo 3",
            "sequence": "3 manches de 2'', 1'' de repos",
            "equipment": "1 joueur, 2 ballons, 6 plots"
          },
          "diagram": "passe-exo4.png"
        }
      ]'::jsonb
    ),
    (
      'test-tir',
      'test',
      'Test Tir',
      'Mensuel — but réel, 2 ballons, plots — 30''',
      array['tous'],
      'tir',
      30,
      '[
        "Même protocole chaque mois : mêmes distances, même but, même échauffement avant (10'' hors test).",
        "Zone petit filet = ballon au sol entre le poteau et un plot posé à 1 m. Noter chaque frappe immédiatement, pas de mémoire."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Précision à l''arrêt",
          "duration_min": 10,
          "objective": "Mesurer la précision de la frappe intérieur du pied sur ballon arrêté, des deux pieds.",
          "goal": "Marquer le maximum de points sur 10 frappes par pied.",
          "instructions": [
            "Pied droit : 10 frappes depuis l''entrée de la surface (16 m), dans l''axe.",
            "Pied gauche : 10 frappes depuis le point de penalty (11 m).",
            "Alterner le petit filet visé à chaque frappe (gauche, droite). Élan de 2-3 pas, pas de course.",
            "Barème par frappe : petit filet au sol = 3, cadré au sol ailleurs = 1, non cadré ou au-dessus du genou = 0."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : D ≥ 18/30, G ≥ 12/30 à 3 mois."
          ],
          "technical_points": [
            "Pied d''appui pointé vers la cible, cheville verrouillée, accompagnement du geste. Même rythme sur les 10 frappes."
          ],
          "variations": null,
          "setup": {
            "surface": "Face au but, 11 et 16 m",
            "sequence": "10 frappes D puis 10 frappes G",
            "equipment": "2 ballons, 2 plots cibles"
          },
          "diagram": null,
          "measures": [
            {
              "key": "tir_precision_droit",
              "name": "Précision arrêt — pied droit",
              "unit": "pts /30",
              "higher_is_better": true
            },
            {
              "key": "tir_precision_gauche",
              "name": "Précision arrêt — pied gauche",
              "unit": "pts /30",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 2,
          "title": "Finition après contrôle",
          "duration_min": 10,
          "objective": "Mesurer la finition en 2 touches après un contrôle orienté, des deux côtés.",
          "goal": "Marquer le maximum de points sur 10 actions.",
          "instructions": [
            "Départ à 25 m, excentré. Auto-passe au sol vers le point de penalty, course, contrôle orienté vers le but, frappe en 2e touche.",
            "5 actions côté droit (pied droit, vers le poteau gauche), 5 actions côté gauche (pied gauche, vers le poteau droit).",
            "Barème par action : petit filet au sol = 2, cadré au sol = 1, autre ou 3e touche = 0."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : ≥ 12/20 à 3 mois, dont ≥ 4 du gauche."
          ],
          "technical_points": [
            "Scan avant la 1re touche, contrôle avec le pied éloigné du but, frappe sans pas d''ajustement."
          ],
          "variations": null,
          "setup": {
            "surface": "Surface + 10 m",
            "sequence": "5 actions par côté",
            "equipment": "2 ballons, 4 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "tir_finition_controle",
              "name": "Finition après contrôle",
              "unit": "pts /20",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 3,
          "title": "Enchaînement sous chrono",
          "duration_min": 8,
          "objective": "Mesurer la qualité de frappe quand la vitesse d''exécution est imposée.",
          "goal": "Cadrer le maximum des 6 frappes en un minimum de temps.",
          "instructions": [
            "6 ballons posés en arc à 14 m du but, espacés de 3 m. Départ au premier ballon, chrono lancé à la première frappe, arrêté à la sixième.",
            "Pied libre. Enchaîner sans pause. Un seul passage, le chrono au téléphone posé au sol ou en commande vocale.",
            "Noter deux valeurs : nombre de frappes cadrées (au sol ou non), et temps total."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : 5/6 cadrés en moins de 15 s à 3 mois."
          ],
          "technical_points": [
            "Trois derniers appuis courts avant chaque ballon. Lever la tête entre deux frappes."
          ],
          "variations": null,
          "setup": {
            "surface": "Arc à 14 m",
            "sequence": "1 passage de 6 frappes",
            "equipment": "6 ballons ou 2 ballons replacés avant le départ, 6 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "tir_enchainement_cadres",
              "name": "Enchaînement — frappes cadrées",
              "unit": "/6",
              "higher_is_better": true
            },
            {
              "key": "tir_enchainement_temps",
              "name": "Enchaînement — temps",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        }
      ]'::jsonb
    ),
    (
      'test-passe',
      'test',
      'Test Passe',
      'Mensuel — mur bas, plots, 25 m d''espace — 30''',
      array['tous'],
      'passe',
      30,
      '[
        "Même mur, même distance, mêmes portes chaque mois. Ballon qui monte au-dessus du mur = non compté.",
        "Chrono au téléphone pour les blocs de 2''."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Précision courte au mur",
          "duration_min": 8,
          "objective": "Mesurer la cadence de passes précises en 1 touche, pied libre puis pied gauche.",
          "goal": "Maximum de passes dans une porte de 1 m en 2''.",
          "instructions": [
            "Joueur à 5 m du mur, porte de 1 m (2 plots au pied du mur). 2e ballon à portée pour relancer sans arrêter le chrono.",
            "Bloc 1 : 2'', 1 touche, pied libre. Compter les passes qui passent dans la porte et reviennent au sol.",
            "1'' de repos. Bloc 2 : 2'', 1 touche, pied gauche uniquement."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : gauche ≥ 60 % du pied libre à 3 mois."
          ],
          "technical_points": [
            "Dosage : le ballon revient jusqu''à toi sans que tu avances. Pied gauche : accepter le rythme plus lent."
          ],
          "variations": null,
          "setup": {
            "surface": "5 m du mur",
            "sequence": "2 blocs de 2'', 1'' de repos",
            "equipment": "2 ballons, 2 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "passe_courte_libre",
              "name": "Passes courtes 2'' — pied libre",
              "unit": "nb",
              "higher_is_better": true
            },
            {
              "key": "passe_courte_gauche",
              "name": "Passes courtes 2'' — pied gauche",
              "unit": "nb",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 2,
          "title": "Passe longue dans la zone",
          "duration_min": 12,
          "objective": "Mesurer la précision de la passe longue au sol ou aérienne, des deux pieds.",
          "goal": "Maximum de ballons arrêtés ou roulant dans une zone de 3 × 3 m.",
          "instructions": [
            "Zone de 3 × 3 m (4 plots). Pied droit : 10 passes depuis 25 m. Pied gauche : 10 passes depuis 18 m.",
            "Ballon arrêté. Compte si le ballon touche le sol dans la zone ou s''y arrête (un ballon qui traverse la zone en l''air ne compte pas).",
            "Récupérer les ballons en marchant entre deux séries de 2 : c''est le repos."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : D ≥ 6/10, G ≥ 4/10 à 3 mois."
          ],
          "technical_points": [
            "Pied d''appui à côté du ballon, contact sous le ballon pour la trajectoire aérienne, regard sur la zone avant l''élan."
          ],
          "variations": null,
          "setup": {
            "surface": "25 m en ligne",
            "sequence": "10 passes D puis 10 passes G",
            "equipment": "2 ballons, 4 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "passe_longue_droit",
              "name": "Passe longue 25 m — pied droit",
              "unit": "/10",
              "higher_is_better": true
            },
            {
              "key": "passe_longue_gauche",
              "name": "Passe longue 18 m — pied gauche",
              "unit": "/10",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 3,
          "title": "Passe en mouvement",
          "duration_min": 10,
          "objective": "Mesurer la précision de la passe après une conduite, en alternant les pieds.",
          "goal": "Maximum de passes dans une porte de 1,5 m après 10 m de conduite.",
          "instructions": [
            "Départ plot, conduite libre sur 10 m jusqu''à une ligne (2 plots), puis passe au sol dans une porte de 1,5 m placée à 10 m de la ligne.",
            "10 essais en alternant pied droit / pied gauche à chaque essai (5 et 5). La passe doit partir avant la ligne.",
            "Compte si le ballon passe dans la porte au sol."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : ≥ 7/10 à 3 mois."
          ],
          "technical_points": [
            "Dernière touche de conduite légèrement devant, tête levée avant la passe, pied d''appui planté même en mouvement."
          ],
          "variations": null,
          "setup": {
            "surface": "20 m en ligne",
            "sequence": "10 essais alternés",
            "equipment": "2 ballons, 5 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "passe_mouvement",
              "name": "Passe en mouvement",
              "unit": "/10",
              "higher_is_better": true
            }
          ]
        }
      ]'::jsonb
    ),
    (
      'test-dribble',
      'test',
      'Test Dribble',
      'Mensuel — plots, 20 m — 25''',
      array['tous'],
      'dribble',
      25,
      '[
        "Chrono au téléphone. Pour les slaloms, noter le meilleur de 3 ; les deux autres passages sont le repos de l''autre.",
        "Plot touché = +1 s ajouté au chrono."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Slalom conduite libre",
          "duration_min": 7,
          "objective": "Mesurer la vitesse de conduite en changements de direction serrés.",
          "goal": "Meilleur temps sur 3 passages.",
          "instructions": [
            "8 plots alignés espacés de 1,5 m. Départ 2 m avant le premier plot, arrivée 2 m après le dernier.",
            "Slalom aller uniquement, pied libre, ballon toujours à moins d''un mètre.",
            "3 passages, 45 s de repos entre chaque. +1 s par plot touché. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Petites touches, ballon collé, buste légèrement penché, regard devant et pas sur le ballon."
          ],
          "variations": null,
          "setup": {
            "surface": "15 m en ligne",
            "sequence": "3 passages",
            "equipment": "1 ballon, 8 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "dribble_slalom_libre",
              "name": "Slalom 8 plots — pied libre",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        },
        {
          "order": 2,
          "title": "Slalom pied gauche",
          "duration_min": 7,
          "objective": "Mesurer la conduite du pied faible sur le même dispositif.",
          "goal": "Meilleur temps sur 3 passages, pied gauche uniquement.",
          "instructions": [
            "Même dispositif. Toutes les touches du pied gauche (intérieur et extérieur autorisés).",
            "Toute touche du pied droit = passage non valide, à refaire.",
            "3 passages, 45 s de repos. +1 s par plot touché. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : écart avec le slalom libre < 3 s à 3 mois."
          ],
          "technical_points": [
            "Alterner intérieur / extérieur du gauche sans que le pied droit intervienne, même pour rattraper."
          ],
          "variations": null,
          "setup": {
            "surface": "15 m en ligne",
            "sequence": "3 passages",
            "equipment": "1 ballon, 8 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "dribble_slalom_gauche",
              "name": "Slalom 8 plots — pied gauche",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        },
        {
          "order": 3,
          "title": "Conduite-vitesse 20 m",
          "duration_min": 5,
          "objective": "Mesurer la vitesse pure en conduite de balle sur une ligne droite avec demi-tour.",
          "goal": "Meilleur temps sur 3 passages.",
          "instructions": [
            "2 plots à 20 m. Départ balle au pied, conduite jusqu''au plot, demi-tour balle au pied autour du plot, retour.",
            "Chrono du départ au retour du ballon derrière la ligne de départ.",
            "3 passages, 1'' de repos. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Touches longues à l''aller, freinage sur 3 appuis courts avant le plot, demi-tour semelle ou intérieur."
          ],
          "variations": null,
          "setup": {
            "surface": "20 m en ligne",
            "sequence": "3 passages",
            "equipment": "1 ballon, 2 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "dribble_conduite_20m",
              "name": "Conduite-vitesse 20 m A/R",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        },
        {
          "order": 4,
          "title": "Huit en 30 secondes",
          "duration_min": 6,
          "objective": "Mesurer la maîtrise du ballon en changements de direction continus, pied libre puis pied gauche.",
          "goal": "Maximum de tours complets en 30 s.",
          "instructions": [
            "2 plots espacés de 5 m. Conduite en 8 autour des deux plots, ballon au pied en permanence.",
            "Essai 1 : 30 s, pied libre. Compter les tours complets (retour au point de départ = 1 tour).",
            "1'' de repos. Essai 2 : 30 s, pied gauche uniquement."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Ballon du côté extérieur au plot, rotation sur l''appui, pas de ballon qui s''échappe."
          ],
          "variations": null,
          "setup": {
            "surface": "5 m",
            "sequence": "2 essais de 30 s",
            "equipment": "1 ballon, 2 plots"
          },
          "diagram": null,
          "measures": [
            {
              "key": "dribble_huit_libre",
              "name": "Huit 30 s — pied libre",
              "unit": "tours",
              "higher_is_better": true
            },
            {
              "key": "dribble_huit_gauche",
              "name": "Huit 30 s — pied gauche",
              "unit": "tours",
              "higher_is_better": true
            }
          ]
        }
      ]'::jsonb
    ),
    (
      'test-jonglerie',
      'test',
      'Test Jonglerie',
      'Mensuel — 1 ballon — 20''',
      array['tous'],
      'jonglerie',
      20,
      '[
        "Ballon qui touche le sol = fin de l''essai. Pour chaque record : 2 essais, noter le meilleur.",
        "Pas de rattrapage à la main, pas de rebond au sol."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Alternance stricte D / G",
          "duration_min": 6,
          "objective": "Mesurer le contrôle aérien des deux pieds en alternance obligatoire.",
          "goal": "Record de touches en alternant strictement pied droit, pied gauche.",
          "instructions": [
            "Une touche par pied, en alternance. Deux touches de suite du même pied = fin de l''essai.",
            "2 essais, 1'' de repos. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Hauteur de balle constante (genou), cheville verrouillée, appuis vifs entre deux touches."
          ],
          "variations": null,
          "setup": {
            "surface": "Sur place",
            "sequence": "2 essais",
            "equipment": "1 ballon"
          },
          "diagram": null,
          "measures": [
            {
              "key": "jonglerie_alternance",
              "name": "Jonglerie alternance D/G",
              "unit": "touches",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 2,
          "title": "Pied gauche seul",
          "duration_min": 6,
          "objective": "Mesurer le contrôle aérien du pied faible.",
          "goal": "Record de touches du pied gauche uniquement.",
          "instructions": [
            "Pied gauche seul, toute touche d''une autre surface = fin de l''essai.",
            "2 essais, 1'' de repos. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : doubler en 3 mois."
          ],
          "technical_points": [
            "Petites touches basses, le pied droit reste au sol et sert d''appui stable."
          ],
          "variations": null,
          "setup": {
            "surface": "Sur place",
            "sequence": "2 essais",
            "equipment": "1 ballon"
          },
          "diagram": null,
          "measures": [
            {
              "key": "jonglerie_gauche",
              "name": "Jonglerie pied gauche seul",
              "unit": "touches",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 3,
          "title": "Tête",
          "duration_min": 4,
          "objective": "Mesurer le contrôle aérien de la tête.",
          "goal": "Record de touches de la tête.",
          "instructions": [
            "Départ ballon lancé à la main. Tête uniquement.",
            "2 essais. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Front, yeux ouverts, genoux fléchis, petits déplacements sous le ballon."
          ],
          "variations": null,
          "setup": {
            "surface": "Sur place",
            "sequence": "2 essais",
            "equipment": "1 ballon"
          },
          "diagram": null,
          "measures": [
            {
              "key": "jonglerie_tete",
              "name": "Jonglerie tête",
              "unit": "touches",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 4,
          "title": "30 secondes libres",
          "duration_min": 4,
          "objective": "Mesurer la cadence de jonglerie toutes surfaces sous chrono.",
          "goal": "Maximum de touches en 30 s.",
          "instructions": [
            "Toutes surfaces autorisées. Si le ballon tombe, le reprendre immédiatement, le chrono continue.",
            "Un seul essai. Compter toutes les touches."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Rythme régulier plutôt que touches hautes."
          ],
          "variations": null,
          "setup": {
            "surface": "Sur place",
            "sequence": "1 essai de 30 s",
            "equipment": "1 ballon"
          },
          "diagram": null,
          "measures": [
            {
              "key": "jonglerie_30s",
              "name": "Jonglerie 30 s libres",
              "unit": "touches",
              "higher_is_better": true
            }
          ]
        }
      ]'::jsonb
    ),
    (
      'test-physique',
      'test',
      'Test Physique',
      'Mensuel — piste ou terrain mesuré — 30''',
      array['tous'],
      'physique',
      30,
      '[
        "Échauffement 10'' obligatoire avant (hors test). Ordre imposé : sprint, agilité, gainage, puis le 6 minutes en dernier.",
        "Même surface et mêmes chaussures chaque mois. Les chronos à la main sont imprécis : toujours le même protocole (téléphone au sol, départ au bip)."
      ]'::jsonb,
      '[
        {
          "order": 1,
          "title": "Sprint 30 m",
          "duration_min": 8,
          "objective": "Mesurer la vitesse linéaire.",
          "goal": "Meilleur temps sur 3 sprints.",
          "instructions": [
            "Départ arrêté, pied avant sur la ligne. 30 m mesurés au décamètre ou au GPS.",
            "3 sprints, 2'' de repos entre chaque. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Premiers appuis courts et puissants, buste penché, montée progressive."
          ],
          "variations": null,
          "setup": {
            "surface": "30 m en ligne",
            "sequence": "3 sprints",
            "equipment": "2 plots, chrono"
          },
          "diagram": null,
          "measures": [
            {
              "key": "phys_sprint_30m",
              "name": "Sprint 30 m",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        },
        {
          "order": 2,
          "title": "5-10-5 (agilité)",
          "duration_min": 7,
          "objective": "Mesurer la vitesse de changement de direction.",
          "goal": "Meilleur temps sur 3 passages.",
          "instructions": [
            "3 plots alignés : A, B (5 m), C (5 m de B). Départ au plot B, main au sol.",
            "Sprint vers A (5 m), toucher le plot au sol, sprint vers C (10 m), toucher, retour à B (5 m).",
            "3 passages, 2'' de repos. Noter le meilleur."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Freiner sur l''appui extérieur, centre de gravité bas dans le changement de direction."
          ],
          "variations": null,
          "setup": {
            "surface": "10 m en ligne",
            "sequence": "3 passages",
            "equipment": "3 plots, chrono"
          },
          "diagram": null,
          "measures": [
            {
              "key": "phys_5_10_5",
              "name": "5-10-5 agilité",
              "unit": "s",
              "higher_is_better": false
            }
          ]
        },
        {
          "order": 3,
          "title": "Gainage frontal",
          "duration_min": 5,
          "objective": "Mesurer l''endurance de la ceinture abdominale.",
          "goal": "Tenue maximale en position de planche.",
          "instructions": [
            "Planche sur les avant-bras, corps aligné. L''essai s''arrête quand le bassin descend ou monte visiblement.",
            "Un seul essai. Noter le temps."
          ],
          "success_criteria": [
            "Référence au mois 1."
          ],
          "technical_points": [
            "Regard au sol, fessiers serrés, respiration continue."
          ],
          "variations": null,
          "setup": {
            "surface": "Sol",
            "sequence": "1 essai",
            "equipment": "chrono"
          },
          "diagram": null,
          "measures": [
            {
              "key": "phys_gainage",
              "name": "Gainage frontal",
              "unit": "s",
              "higher_is_better": true
            }
          ]
        },
        {
          "order": 4,
          "title": "Test 6 minutes",
          "duration_min": 10,
          "objective": "Estimer la VMA seul, sans matériel de bip.",
          "goal": "Distance maximale parcourue en 6 minutes.",
          "instructions": [
            "Sur piste (400 m) ou terrain mesuré, ou GPS du téléphone. Allure régulière dès le départ : partir trop vite fait perdre 50 à 100 m.",
            "Noter la distance en mètres. VMA estimée (km/h) ≈ distance / 100 (ex. 1 650 m → 16,5 km/h).",
            "Toujours en dernier : le test est épuisant."
          ],
          "success_criteria": [
            "Référence au mois 1. Objectif : +50 m par mois sur 3 mois."
          ],
          "technical_points": [
            "Allure cible = celle que tu peux tenir 6'' sans ralentir sur la dernière minute. Si tu accélères à la fin, tu es parti trop lentement."
          ],
          "variations": null,
          "setup": {
            "surface": "Piste ou terrain mesuré",
            "sequence": "1 effort de 6''",
            "equipment": "chrono, GPS ou piste"
          },
          "diagram": null,
          "measures": [
            {
              "key": "phys_6min_distance",
              "name": "Test 6 minutes — distance",
              "unit": "m",
              "higher_is_better": true
            }
          ]
        }
      ]'::jsonb
    )
  ) as v(slug, kind, title, subtitle, positions, skill, duration_min, intro, exercises)
  on conflict (user_id, slug) where slug is not null do update
  set kind = excluded.kind,
      title = excluded.title,
      subtitle = excluded.subtitle,
      positions = excluded.positions,
      skill = excluded.skill,
      duration_min = excluded.duration_min,
      intro = excluded.intro,
      exercises = excluded.exercises
  where (training_sheets.kind, training_sheets.title, training_sheets.subtitle, training_sheets.positions,
         training_sheets.skill, training_sheets.duration_min, training_sheets.intro, training_sheets.exercises)
    is distinct from (excluded.kind, excluded.title, excluded.subtitle, excluded.positions,
                      excluded.skill, excluded.duration_min, excluded.intro, excluded.exercises);

  get diagnostics changed_count = row_count;
  raise notice 'Fiches pour % : sur 7, insérées : %, mises à jour : %, inchangées : %.',
    uid,
    7 - existing_count,
    changed_count - (7 - existing_count),
    existing_count - (changed_count - (7 - existing_count));
end
$$;

-- Contrôle (tous utilisateurs confondus). Attendu après seed.sql, 004 et une
-- première exécution, inchangé après une seconde : training_sheets 10 (3 de
-- démonstration + 7), tests 25 (2 de démonstration + 23).
select 'training_sheets' as table_name, count(*) as nb_lignes from public.training_sheets
union all select 'tests', count(*) from public.tests;
