-- =============================================================================
-- 011_goals.sql
--
-- But   : objectifs du joueur et objectif hebdomadaire (chantier 15).
--         1. Table goals : données de l'utilisateur (RLS sur auth.uid() =
--            user_id, 4 policies), pas du contenu partagé. Un objectif porte
--            sur une mesure d'un test atomique : test_id (ligne du catalogue
--            tests, celle des test_results et de la courbe) et sheet_id (le
--            test atomique, training_sheets kind test, pour le titre et la
--            suggestion du jour). start_value : dernier résultat de la mesure à
--            la création, null si elle n'a jamais été mesurée ; target_value :
--            la cible ; deadline : l'échéance (jour local, obligatoire) ;
--            retired_at : null tant que l'objectif est actif, posé quand il est
--            retiré (la ligne est conservée). La progression, l'objectif
--            atteint et l'échéance dépassée se calculent dans l'app
--            (lib/goals.ts), rien n'est stocké. 1 à 3 objectifs actifs : règle
--            de l'app. Une mesure ne porte qu'un objectif actif à la fois :
--            index unique partiel goals_one_active_per_test (user_id, test_id)
--            where retired_at is null ; un second objectif actif sur la même
--            mesure est refusé par Postgres (23505), affiché comme un doublon.
--         2. profiles.weekly_session_goal : séances de travail personnel visées
--            par semaine, de 1 à 7 ; null tant que l'objectif n'a pas été
--            réglé (l'app compte alors 3).
--         profiles.goal et profiles.goal_deadline (006) restent en place,
--         inutilisées.
-- Date  : 2026-10-11
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 010. Idempotent et additif : une table, deux index et une
--         colonne créés si absents, une contrainte ajoutée si absente,
--         policies et trigger supprimés s'ils existent puis recréés ; aucune
--         ligne modifiée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- goals : données de l'utilisateur
-- -----------------------------------------------------------------------------

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  -- Défaut auth.uid() comme les 8 tables de 002 ; le trigger set_user_id l'impose.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  sheet_id uuid not null references public.training_sheets (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  start_value numeric,
  target_value numeric not null,
  deadline date not null,
  retired_at timestamptz
);

create index if not exists goals_user_id_created_at_idx
  on public.goals (user_id, created_at);

-- Une mesure ne porte qu'un objectif actif à la fois ; retiré, l'objectif libère
-- sa mesure (la ligne reste, hors de l'index). Garde-fou en base de la règle de
-- l'app (une mesure qui porte un objectif actif n'est pas proposée), par exemple
-- depuis deux appareils.
create unique index if not exists goals_one_active_per_test
  on public.goals (user_id, test_id)
  where retired_at is null;

-- Privilèges Data API, comme les tables de 001 ; anon n'en reçoit aucun.
grant select, insert, update, delete on table public.goals to authenticated, service_role;

alter table public.goals enable row level security;

drop policy if exists goals_select_own on public.goals;
create policy goals_select_own on public.goals
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists goals_insert_own on public.goals;
create policy goals_insert_own on public.goals
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists goals_update_own on public.goals;
create policy goals_update_own on public.goals
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists goals_delete_own on public.goals;
create policy goals_delete_own on public.goals
  for delete to authenticated
  using (auth.uid() = user_id);

-- user_id vient toujours du JWT, jamais du client (fonction de 001).
drop trigger if exists set_user_id on public.goals;
create trigger set_user_id
  before insert on public.goals
  for each row execute function public.set_user_id();

-- -----------------------------------------------------------------------------
-- profiles.weekly_session_goal : de 1 à 7, null = pas encore réglé (3 dans l'app)
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists weekly_session_goal smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_weekly_session_goal_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_weekly_session_goal_check
      check (weekly_session_goal between 1 and 7);
  end if;
end
$$;

-- Contrôle (doit renvoyer 4 lignes de policies sur goals, select / insert /
-- update / delete, toutes sur auth.uid() = user_id ; puis le trigger set_user_id ;
-- puis l'index unique partiel « CREATE UNIQUE INDEX goals_one_active_per_test ON
-- public.goals USING btree (user_id, test_id) WHERE (retired_at IS NULL) » ;
-- puis la ligne weekly_session_goal / smallint et sa contrainte) :
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'goals'
--   order by cmd;
--   select tgname from pg_trigger
--   where tgrelid = 'public.goals'::regclass and not tgisinternal;
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'goals'
--     and indexname = 'goals_one_active_per_test';
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name = 'weekly_session_goal';
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'profiles_weekly_session_goal_check';
