-- =============================================================================
-- 006_profile_goal.sql
--
-- But   : objectif du joueur dans le Profil (chantier 7).
--         profiles.goal : objectif en texte libre (140 caractères au plus,
--         limite posée par l'écran d'édition) ; profiles.goal_deadline :
--         échéance de l'objectif (jour), d'où le compte à rebours « J-42 ».
--         null permis partout (non renseigné).
-- Date  : 2026-10-07
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 005. Idempotent et additif : deux colonnes ajoutées si
--         absentes, aucune ligne modifiée. RLS et policies de profiles
--         inchangées (001).
-- =============================================================================

alter table public.profiles
  add column if not exists goal text;

alter table public.profiles
  add column if not exists goal_deadline date;

-- Contrôle (doit renvoyer les 2 lignes goal / text et goal_deadline / date) :
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('goal', 'goal_deadline')
--   order by column_name;
