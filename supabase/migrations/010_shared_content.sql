-- =============================================================================
-- 010_shared_content.sql
--
-- But   : contenu partagé (chantier 14). Deux sortes de données :
--         - contenu partagé : questions, training_sheets (fiches de lecture,
--           tests atomiques, sessions prédéfinies) et tests (catalogue des
--           mesures). Lecture : propriétaire, ou tout compte connecté si
--           is_public. Écriture : aucune depuis l'app ; seuls les seeds et
--           supabase/transfer_content_owner.sql l'écrivent, en rôle postgres
--           (SQL Editor), que la RLS ne concerne pas ;
--         - données de l'utilisateur : toutes les autres tables, inchangées
--           (RLS sur auth.uid() = user_id).
--         1. tests.is_public, comme questions et training_sheets (001) :
--            false par défaut.
--         2. Policies select des trois tables de contenu remplacées par
--            « auth.uid() = user_id or is_public ».
--         3. Policies insert, update et delete des trois tables de contenu
--            (001, *_insert_own, *_update_own, *_delete_own) supprimées, sans
--            être recréées : RLS active sans policy d'écriture, tout insert,
--            update ou delete d'un compte connecté est refusé. L'app n'écrit
--            jamais dans ces tables (vérifié au chantier 14).
-- Date  : 2026-10-11
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 009, AVANT supabase/transfer_content_owner.sql et les seeds
--         régénérés (seed_sheets_001.sql écrit tests.is_public). Idempotent.
--         Aucune ligne modifiée : une colonne ajoutée si absente (false
--         partout : le transfert la passe à true) ; policies select supprimées
--         si elles existent puis recréées ; policies d'écriture supprimées si
--         elles existent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tests.is_public
-- -----------------------------------------------------------------------------

alter table public.tests
  add column if not exists is_public boolean not null default false;

-- -----------------------------------------------------------------------------
-- Lecture du contenu : propriétaire, ou contenu public pour tout compte connecté.
-- L'ancienne policy (001, *_select_own) est supprimée ; la nouvelle porte un nom
-- qui dit sa règle. anon n'a toujours aucun droit (001) : l'app exige une connexion.
-- -----------------------------------------------------------------------------

-- questions
drop policy if exists questions_select_own on public.questions;
drop policy if exists questions_select_own_or_public on public.questions;
create policy questions_select_own_or_public on public.questions
  for select to authenticated
  using (auth.uid() = user_id or is_public);

-- training_sheets
drop policy if exists training_sheets_select_own on public.training_sheets;
drop policy if exists training_sheets_select_own_or_public on public.training_sheets;
create policy training_sheets_select_own_or_public on public.training_sheets
  for select to authenticated
  using (auth.uid() = user_id or is_public);

-- tests
drop policy if exists tests_select_own on public.tests;
drop policy if exists tests_select_own_or_public on public.tests;
create policy tests_select_own_or_public on public.tests
  for select to authenticated
  using (auth.uid() = user_id or is_public);

-- -----------------------------------------------------------------------------
-- Écriture du contenu : aucune depuis l'app. Sans policy insert, update ni
-- delete, la RLS refuse ces commandes à tout compte connecté, propriétaire
-- compris ; le rôle postgres (seeds, transfert) n'est pas soumis à la RLS.
-- -----------------------------------------------------------------------------

-- questions
drop policy if exists questions_insert_own on public.questions;
drop policy if exists questions_update_own on public.questions;
drop policy if exists questions_delete_own on public.questions;

-- training_sheets
drop policy if exists training_sheets_insert_own on public.training_sheets;
drop policy if exists training_sheets_update_own on public.training_sheets;
drop policy if exists training_sheets_delete_own on public.training_sheets;

-- tests
drop policy if exists tests_insert_own on public.tests;
drop policy if exists tests_update_own on public.tests;
drop policy if exists tests_delete_own on public.tests;

-- Contrôle (doit renvoyer la ligne is_public / boolean, puis 3 lignes : une
-- policy select par table, sur (auth.uid() = user_id) OR is_public ; aucune
-- policy insert, update ni delete) :
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'tests'
--     and column_name = 'is_public';
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('questions', 'training_sheets', 'tests')
--   order by tablename, cmd;
