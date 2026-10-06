-- =============================================================================
-- seed.sql : données de démonstration Strafoot pour un utilisateur.
--
-- À exécuter dans le SQL Editor APRÈS supabase/migrations/001_initial_schema.sql.
--
-- 1. Récupère ton UUID : Dashboard Supabase → Authentication → Users →
--    clique sur ton utilisateur → copie « User UID ».
-- 2. Remplace <REMPLACER_PAR_MON_UUID> ci-dessous (une seule occurrence).
-- 3. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),
--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.
--
-- Idempotent : chaque insert ne porte que sur les lignes absentes, repérées par
-- (user_id, titre/nom). Une seconde exécution n'ajoute ni ne modifie rien.
--
-- Le trigger set_user_id impose user_id := auth.uid(). Le SQL Editor n'a pas de
-- JWT (auth.uid() est null) : le bloc simule celui de l'utilisateur, le temps
-- de la transaction uniquement. Les inserts n'envoient donc jamais user_id.
-- =============================================================================

do $$
declare
  uid uuid := '4bf159e0-4b5e-47f7-9cf1-793ccc311a88';
  passes_sheet_id uuid;
  vma_test_id uuid;
  shots_test_id uuid;
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
  -- Profil : un seul par utilisateur
  -- ---------------------------------------------------------------------------
  insert into public.profiles (main_position, secondary_position, club, birth_date)
  select 'attaquant', 'milieu offensif', 'FC Exemple', date '1998-04-12'
  where not exists (select 1 from public.profiles p where p.user_id = uid);

  -- ---------------------------------------------------------------------------
  -- Fiches d’entraînement : 45 min, 4 exercices chacune (clé : title)
  -- ---------------------------------------------------------------------------
  insert into public.training_sheets (title, positions, skill, duration_min, exercises)
  select v.title, v.positions, v.skill, v.duration_min, v.exercises
  from (values
    (
      'Passes et remises — faux 9',
      array['attaquant', 'milieu offensif'],
      'jeu en remise',
      45,
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Échauffement technique',
          'duration_min', 10,
          'description', 'Conduites de balle dans un carré de 10 m, toutes surfaces du pied, accélération sur 5 m toutes les 30 s.'
        ),
        jsonb_build_object(
          'name', 'Remises contre un mur',
          'duration_min', 10,
          'description', 'À 5 m d’un mur : contrôle et passe en deux touches, puis en une touche. 4 × 2 min en alternant pied droit et pied gauche.'
        ),
        jsonb_build_object(
          'name', 'Contrôle dos au but et pivot',
          'duration_min', 15,
          'description', 'Passe reçue dos au but (mur ou partenaire), contrôle orienté pour se retourner, conduite de 10 m vers un mini-but. 3 séries de 8 par côté.'
        ),
        jsonb_build_object(
          'name', 'Décrochage et remise en une touche',
          'duration_min', 10,
          'description', 'Décrochage de 10 m, remise en une touche dans un plot cible à 8 m, puis appel en profondeur. 4 séries de 6, 45 s de récupération.'
        )
      )
    ),
    (
      'Finition dans la surface',
      array['attaquant', 'ailier'],
      'finition',
      45,
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Activation et frappes à 50 %',
          'duration_min', 10,
          'description', 'Footing, gammes athlétiques, puis 10 frappes à 50 % depuis 16 m pour régler le pied d’appui.'
        ),
        jsonb_build_object(
          'name', 'Frappe après contrôle orienté',
          'duration_min', 10,
          'description', 'Ballon lancé depuis le côté, contrôle orienté vers l’axe et frappe en deux touches. 3 séries de 6 par côté.'
        ),
        jsonb_build_object(
          'name', 'Reprises de volée',
          'duration_min', 10,
          'description', 'Ballon auto-lancé ou lancé par un partenaire, reprise du cou-de-pied en visant les zones basses du but. 3 séries de 6.'
        ),
        jsonb_build_object(
          'name', 'Tirs petit filet',
          'duration_min', 15,
          'description', 'Depuis l’angle de la surface, frappe intérieur du pied vers le petit filet opposé. 5 séries de 10 en comptant les réussites.'
        )
      )
    ),
    (
      'Conduite et élimination en 1 contre 1',
      array['ailier', 'latéral'],
      'dribble',
      45,
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Slalom balle au pied',
          'duration_min', 10,
          'description', 'Slalom entre 8 plots espacés de 1,5 m, intérieur puis extérieur du pied, retour en sprint. 6 passages.'
        ),
        jsonb_build_object(
          'name', 'Feintes face à un plot',
          'duration_min', 10,
          'description', 'Face à un plot (défenseur fictif) : passement de jambes, crochet, contre-pied, puis accélération sur 10 m. 4 répétitions par feinte.'
        ),
        jsonb_build_object(
          'name', 'Changements de rythme',
          'duration_min', 10,
          'description', 'Conduite lente sur 10 m puis accélération maximale sur 10 m. 8 répétitions, 30 s de récupération.'
        ),
        jsonb_build_object(
          'name', '1 contre 1 en couloir',
          'duration_min', 15,
          'description', 'Couloir de 10 × 20 m face à un partenaire : franchir sa ligne balle au pied. Séquences de 20 s, 6 par joueur.'
        )
      )
    )
  ) as v(title, positions, skill, duration_min, exercises)
  where not exists (
    select 1 from public.training_sheets s where s.user_id = uid and s.title = v.title
  );

  select s.id into passes_sheet_id
  from public.training_sheets s
  where s.user_id = uid and s.title = 'Passes et remises — faux 9'
  order by s.created_at
  limit 1;

  -- ---------------------------------------------------------------------------
  -- Tests physiques et techniques (clé : name)
  -- ---------------------------------------------------------------------------
  insert into public.tests (name, protocol, unit)
  select v.name, v.protocol, v.unit
  from (values
    (
      'VMA',
      'Demi-Cooper : courir la plus grande distance possible en 6 minutes sur une piste ou un terrain balisé tous les 50 m. VMA (km/h) = distance parcourue (m) / 100.',
      'km/h'
    ),
    (
      'Tirs petit filet /50',
      '50 frappes ballon arrêté depuis l’angle de la surface (25 à droite, 25 à gauche), intérieur du pied, en visant le petit filet opposé (zone d’1 m le long du poteau, marquée par un plot). Compter les tirs qui finissent dans la zone.',
      'tirs réussis'
    )
  ) as v(name, protocol, unit)
  where not exists (
    select 1 from public.tests t where t.user_id = uid and t.name = v.name
  );

  select t.id into vma_test_id
  from public.tests t
  where t.user_id = uid and t.name = 'VMA'
  order by t.created_at
  limit 1;

  select t.id into shots_test_id
  from public.tests t
  where t.user_id = uid and t.name = 'Tirs petit filet /50'
  order by t.created_at
  limit 1;

  -- ---------------------------------------------------------------------------
  -- Résultats : 2 par test, dates fixes (clé : test_id + date)
  -- ---------------------------------------------------------------------------
  insert into public.test_results (test_id, date, value, comment)
  select v.test_id, v.date, v.value, v.comment
  from (values
    (vma_test_id, date '2026-08-24', 15.5, 'Reprise : 1 550 m.'),
    (vma_test_id, date '2026-09-28', 16.2, 'Fin de préparation : 1 620 m.'),
    (shots_test_id, date '2026-08-26', 27, 'Pied gauche à travailler.'),
    (shots_test_id, date '2026-09-30', 34, null)
  ) as v(test_id, date, value, comment)
  where not exists (
    select 1 from public.test_results r
    where r.user_id = uid and r.test_id = v.test_id and r.date = v.date
  );

  -- ---------------------------------------------------------------------------
  -- Questions : 4 options { text, score 0-3, explanation } (clé : situation)
  -- Thème et postes dans la taxonomie de lib/quiz-taxonomy.ts (contraintes de 003).
  -- ---------------------------------------------------------------------------
  insert into public.questions (situation, options, theme, positions, level, source)
  select v.situation, v.options, v.theme, v.positions, v.level, v.source
  from (values
    (
      'Tu es en pointe, dos au but, à 30 m des cages. Le défenseur central adverse est collé dans ton dos. Ton milieu axial te joue une passe au sol et se propose face au jeu, à 8 m de toi. Que fais-tu ?',
      jsonb_build_array(
        jsonb_build_object(
          'text', 'Remise en une touche vers le milieu qui arrive face au jeu',
          'score', 3,
          'explanation', 'Avec un défenseur au contact, la remise immédiate évite le duel, fixe ton adversaire et donne le ballon à un partenaire orienté vers le but. C’est le geste de base du faux 9.'
        ),
        jsonb_build_object(
          'text', 'Contrôle orienté pour te retourner et attaquer le défenseur',
          'score', 1,
          'explanation', 'Se retourner avec un adversaire collé expose à la perte de balle. À tenter seulement si le défenseur est trop loin ou mal orienté.'
        ),
        jsonb_build_object(
          'text', 'Protéger le ballon et attendre un soutien',
          'score', 2,
          'explanation', 'Garder le ballon reste sûr, mais ralentit l’attaque et laisse à la défense le temps de se replacer.'
        ),
        jsonb_build_object(
          'text', 'Frapper en pivot',
          'score', 0,
          'explanation', 'À 30 m et dos au but, la frappe en pivot est presque toujours contrée ou non cadrée : perte de balle quasi assurée.'
        )
      ),
      'situation',
      array['avant_centre'],
      1,
      'Seed Strafoot'
    ),
    (
      'Le défenseur central droit adverse fait une passe en retrait à son gardien. Tu es l’attaquant le plus proche, à 15 m du gardien. Que fais-tu ?',
      jsonb_build_array(
        jsonb_build_object(
          'text', 'Presser le gardien en courbe pour couper la passe vers le défenseur qui vient de lui donner',
          'score', 3,
          'explanation', 'La course en courbe ferme la solution la plus simple et oriente la relance vers un côté où tes partenaires peuvent sortir. C’est le déclencheur de pressing classique.'
        ),
        jsonb_build_object(
          'text', 'Sprinter tout droit sur le gardien',
          'score', 1,
          'explanation', 'Tu mets de la pression, mais sans couper de ligne de passe : le gardien relance facilement vers le défenseur libre.'
        ),
        jsonb_build_object(
          'text', 'Masquer le milieu défensif adverse placé dans ton dos',
          'score', 2,
          'explanation', 'Bloquer la passe axiale est utile, mais sans pression sur le porteur le gardien a tout son temps pour jouer long ou sur un côté.'
        ),
        jsonb_build_object(
          'text', 'Reculer pour te replacer dans le bloc',
          'score', 1,
          'explanation', 'Défendable si le plan de jeu est de défendre bas. Sinon, une passe en retrait est le signal pour presser et tu laisses filer l’occasion.'
        )
      ),
      'situation',
      array['avant_centre', 'milieu_offensif'],
      2,
      'Seed Strafoot'
    ),
    (
      'Ton équipe vient de perdre le ballon au milieu de terrain. Le porteur adverse est face au jeu, à 5 m de toi ; deux attaquants adverses démarrent dans la profondeur. Que fais-tu ?',
      jsonb_build_array(
        jsonb_build_object(
          'text', 'Presser immédiatement le porteur pour l’empêcher de jouer vers l’avant',
          'score', 3,
          'explanation', 'Les secondes qui suivent la perte sont le meilleur moment pour récupérer ou ralentir l’action (contre-pressing). Fermer la passe en profondeur protège ta défense.'
        ),
        jsonb_build_object(
          'text', 'Commettre une faute tactique tout de suite',
          'score', 2,
          'explanation', 'Efficace pour stopper une contre-attaque dangereuse, mais coûteux : carton jaune probable et coup franc adverse. À réserver aux cas où le contre-pressing est impossible.'
        ),
        jsonb_build_object(
          'text', 'Courir vers ton but pour te replacer',
          'score', 1,
          'explanation', 'Le repli est utile quand tu es loin du ballon. À 5 m du porteur, tu lui laisses tout le temps de lancer ses attaquants.'
        ),
        jsonb_build_object(
          'text', 'Lever le bras pour réclamer une faute',
          'score', 0,
          'explanation', 'Pendant que tu protestes, l’adversaire attaque en supériorité numérique. On joue jusqu’au coup de sifflet.'
        )
      ),
      'situation',
      array['milieu_defensif', 'milieu_central'],
      2,
      'Seed Strafoot'
    ),
    (
      'Tu es défenseur central gauche et tu reçois le ballon de ton gardien. L’attaquant adverse arrive en pressing par ta gauche ; ton défenseur central droit est libre, ton milieu défensif est marqué de près. Que fais-tu ?',
      jsonb_build_array(
        jsonb_build_object(
          'text', 'Contrôle orienté vers la droite et passe au défenseur central libre',
          'score', 3,
          'explanation', 'Tu joues à l’opposé de la pression, vers le partenaire libre : la relance reste propre et l’équipe peut progresser par le côté faible.'
        ),
        jsonb_build_object(
          'text', 'Passe dans l’axe au milieu défensif marqué',
          'score', 0,
          'explanation', 'Une passe vers un joueur marqué dans ta moitié de terrain est le scénario de perte de balle le plus dangereux.'
        ),
        jsonb_build_object(
          'text', 'Long ballon vers ton attaquant',
          'score', 1,
          'explanation', 'Option sûre à court terme, mais tu rends souvent le ballon à l’adversaire alors qu’une solution courte existait.'
        ),
        jsonb_build_object(
          'text', 'Conduire pour attirer l’attaquant, puis servir le partenaire libéré',
          'score', 2,
          'explanation', 'Fixer l’adversaire libère un partenaire, mais demande de la maîtrise : risqué si le pressing adverse est coordonné.'
        )
      ),
      'situation',
      array['defenseur_central'],
      1,
      'Seed Strafoot'
    ),
    (
      'Tu es seul face au gardien, à 12 m, légèrement décalé sur la droite. Le gardien sort à ta rencontre. Que fais-tu ?',
      jsonb_build_array(
        jsonb_build_object(
          'text', 'Frappe placée du plat du pied, à ras de terre, côté opposé',
          'score', 3,
          'explanation', 'Ras de terre et côté opposé : c’est la trajectoire la plus difficile pour un gardien qui sort et doit plonger loin et bas.'
        ),
        jsonb_build_object(
          'text', 'Frappe en force au centre',
          'score', 1,
          'explanation', 'Un gardien qui sort couvre d’abord le centre : la puissance compense rarement une frappe mal placée.'
        ),
        jsonb_build_object(
          'text', 'Dribbler le gardien',
          'score', 2,
          'explanation', 'Efficace s’il se jette, mais l’angle se ferme vite quand tu es décalé : risque de finir trop excentré.'
        ),
        jsonb_build_object(
          'text', 'Passer en retrait à un partenaire qui arrive à 25 m',
          'score', 0,
          'explanation', 'Tu es en position idéale : donner le ballon à un partenaire plus loin du but réduit fortement les chances de marquer.'
        )
      ),
      'situation',
      array['avant_centre', 'ailier'],
      1,
      'Seed Strafoot'
    )
  ) as v(situation, options, theme, positions, level, source)
  where not exists (
    select 1 from public.questions q where q.user_id = uid and q.situation = v.situation
  );

  -- ---------------------------------------------------------------------------
  -- Séances : 3 sur les 7 derniers jours (clé : name, les dates étant relatives)
  -- ---------------------------------------------------------------------------
  insert into public.sessions (date, type, name, duration_min, difficulty, comment, sheet_id)
  select v.date, v.type, v.name, v.duration_min, v.difficulty, v.comment, v.sheet_id
  from (values
    (
      current_date - 1,
      'collectif'::public.session_type,
      'Entraînement club — jeu de position',
      90,
      3,
      'Beaucoup de jeu en une touche, bonnes sensations.',
      null::uuid
    ),
    (
      current_date - 3,
      'solo'::public.session_type,
      'Passes et remises — faux 9',
      45,
      2,
      null,
      passes_sheet_id
    ),
    (
      current_date - 5,
      'match'::public.session_type,
      'Match de championnat — J5',
      90,
      4,
      'Titulaire, remplacé à la 75e. Un but, une passe décisive.',
      null::uuid
    )
  ) as v(date, type, name, duration_min, difficulty, comment, sheet_id)
  where not exists (
    select 1 from public.sessions s where s.user_id = uid and s.name = v.name
  );

  raise notice 'Seed Strafoot terminé pour %.', uid;
end
$$;

-- Contrôle (tous utilisateurs confondus). Attendu sur une base vide, et
-- inchangé après une seconde exécution : profiles 1, training_sheets 3,
-- tests 2, test_results 4, questions 5, sessions 3, answers 0, self_assessments 0.
select 'profiles' as table_name, count(*) as nb_lignes from public.profiles
union all select 'training_sheets', count(*) from public.training_sheets
union all select 'tests', count(*) from public.tests
union all select 'test_results', count(*) from public.test_results
union all select 'questions', count(*) from public.questions
union all select 'sessions', count(*) from public.sessions
union all select 'answers', count(*) from public.answers
union all select 'self_assessments', count(*) from public.self_assessments;
