-- =============================================================================
-- 008_profile_name.sql
--
-- But   : nom affiché du joueur dans l'en-tête du Profil (chantier 12).
--         profiles.display_name : texte libre court (40 caractères au plus,
--         limite posée par l'écran d'édition), dont l'app tire les initiales
--         de l'avatar. null permis (non renseigné).
-- Date  : 2026-10-09
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 007. Idempotent et additif : une colonne ajoutée si absente,
--         aucune ligne modifiée. RLS et policies de profiles inchangées (001).
-- =============================================================================

alter table public.profiles
  add column if not exists display_name text;

-- Contrôle (doit renvoyer la ligne display_name / text) :
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name = 'display_name';
