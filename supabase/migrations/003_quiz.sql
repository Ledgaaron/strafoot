-- =============================================================================
-- 003_quiz.sql
--
-- But   : quizz en séries de 5 questions.
--         1. answers.quiz_run_id : identifiant client de la série, partagé par
--            ses réponses ; answers.flagged : réponse signalée contestable.
--         2. Taxonomie des questions, listes fermées identiques à THEMES et
--            POSITIONS (lib/quiz-taxonomy.ts) : contraintes questions_theme_check
--            (5 thèmes) et questions_positions_check (9 postes). Les 5 questions
--            de démonstration de seed.sql sont d'abord recodées dans cette
--            taxonomie, sans quoi les contraintes échoueraient.
--         3. Index answers (user_id, question_id, answered_at desc) : dernière
--            réponse de chaque question, pour choisir les questions d'une série.
-- Date  : 2026-10-06
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 002. Idempotent : ré-exécutable sans erreur ni perte de données.
--         Additif, hormis le recodage du thème et des postes des 5 questions de
--         démonstration : aucune ligne supprimée.
--         Si une contrainte échoue (« violated by some row »), une question hors
--         taxonomie existe encore : rien n'est appliqué, la corriger puis relancer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- answers : série et signalement
-- -----------------------------------------------------------------------------

alter table public.answers
  add column if not exists quiz_run_id uuid;

alter table public.answers
  add column if not exists flagged boolean not null default false;

-- -----------------------------------------------------------------------------
-- Recodage des 5 questions de seed.sql (sans effet à la seconde exécution).
-- Ce sont toutes des mises en situation (« Que fais-tu ? ») : thème 'situation'.
-- -----------------------------------------------------------------------------

update public.questions
set theme = 'situation'
where theme in ('Jeu dos au but', 'Pressing', 'Transition défensive', 'Construction', 'Finition');

update public.questions
set positions =
  array_replace(
    array_replace(
      array_replace(
        array_replace(
          array_replace(positions, 'attaquant', 'avant_centre'),
          'milieu offensif', 'milieu_offensif'),
        'milieu défensif', 'milieu_defensif'),
      'milieu central', 'milieu_central'),
    'défenseur central', 'defenseur_central')
where positions && array[
  'attaquant', 'milieu offensif', 'milieu défensif', 'milieu central', 'défenseur central'
]::text[];

-- -----------------------------------------------------------------------------
-- Taxonomie : listes fermées, à garder identiques à THEMES et POSITIONS dans
-- lib/quiz-taxonomy.ts. Créées seulement si absentes : changer une liste
-- demandera une nouvelle migration.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_theme_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_theme_check check (
        theme in ('situation', 'tactique', 'technique', 'culture', 'mental')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_positions_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_positions_check check (
        positions <@ array[
          'gardien',
          'defenseur_central',
          'lateral',
          'milieu_defensif',
          'milieu_central',
          'milieu_offensif',
          'ailier',
          'avant_centre',
          'tous'
        ]::text[]
      );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------

create index if not exists answers_user_id_question_id_answered_at_idx
  on public.answers (user_id, question_id, answered_at desc);
