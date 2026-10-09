-- =============================================================================
-- 009_question_diagrams.sql
--
-- But   : schémas tactiques des questions du quiz (chantier 13a).
--         questions.diagram : schéma en données (format de
--         lib/diagram-types.ts), dessiné par l'app en SVG
--         (components/diagram.tsx). null : question sans schéma. Les ids des
--         options du schéma (1 à 4) sont les rangs des options dans
--         questions.options, à partir de 1. Contenu : supabase/content/
--         diagrams_NNN.json, posé par seed_questions_NNN.sql.
--         Contrainte : null ou un objet JSON (le format détaillé est vérifié
--         par l'app et par scripts/build-seed-questions.ts).
-- Date  : 2026-10-10
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 008, AVANT le seed régénéré supabase/seed_questions_001.sql
--         (qui écrit diagram). Idempotent et additif : une colonne ajoutée si
--         absente, nulle partout ; une contrainte créée si absente, que les
--         lignes existantes respectent déjà. RLS et policies de questions
--         inchangées (001, 003).
-- =============================================================================

alter table public.questions
  add column if not exists diagram jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_diagram_object_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_diagram_object_check
      check (diagram is null or jsonb_typeof(diagram) = 'object');
  end if;
end
$$;

-- Contrôle (doit renvoyer la ligne diagram / jsonb, puis la ligne
-- questions_diagram_object_check) :
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'questions'
--     and column_name = 'diagram';
--   select conname
--   from pg_constraint
--   where conrelid = 'public.questions'::regclass
--     and conname = 'questions_diagram_object_check';
