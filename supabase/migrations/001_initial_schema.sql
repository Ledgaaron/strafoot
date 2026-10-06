-- =============================================================================
-- 001_initial_schema.sql
--
-- But   : schéma initial Strafoot v1. Enum session_type, 8 tables, index,
--         privilèges Data API, RLS (4 policies par table sur auth.uid() = user_id)
--         et trigger set_user_id qui impose user_id := auth.uid() à chaque insert.
-- Date  : 2026-10-06
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier).
--         Idempotent : ré-exécutable sans erreur ni perte de données.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'session_type'
      and n.nspname = 'public'
  ) then
    create type public.session_type as enum ('collectif', 'solo', 'match', 'recup', 'test');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables (ordre imposé par les clés étrangères)
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  main_position text,
  secondary_position text,
  club text,
  birth_date date
);

create table if not exists public.training_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  positions text[] not null default '{}',
  skill text not null,
  duration_min integer not null,
  exercises jsonb not null default '[]'::jsonb,
  is_public boolean not null default false
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  type public.session_type not null,
  name text,
  duration_min integer not null,
  difficulty smallint not null,
  comment text,
  sheet_id uuid references public.training_sheets (id) on delete set null,
  constraint sessions_duration_min_check check (duration_min > 0),
  constraint sessions_difficulty_check check (difficulty between 1 and 5)
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  protocol text not null,
  unit text not null
);

create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  test_id uuid not null references public.tests (id) on delete cascade,
  date date not null,
  value numeric not null,
  comment text
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  situation text not null,
  options jsonb not null,
  theme text not null,
  positions text[] not null default '{}',
  level smallint,
  source text,
  is_public boolean not null default false,
  constraint questions_options_check check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4
  )
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  question_id uuid not null references public.questions (id) on delete cascade,
  chosen_index smallint not null,
  score smallint not null,
  answered_at timestamptz not null default now(),
  constraint answers_chosen_index_check check (chosen_index between 0 and 3),
  constraint answers_score_check check (score between 0 and 3)
);

create table if not exists public.self_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  date date not null,
  grid jsonb not null
);

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------

create index if not exists sessions_user_id_date_idx
  on public.sessions (user_id, date);
create index if not exists answers_user_id_answered_at_idx
  on public.answers (user_id, answered_at);
create index if not exists test_results_user_id_test_id_date_idx
  on public.test_results (user_id, test_id, date);

-- -----------------------------------------------------------------------------
-- Privilèges Data API
-- Supabase accordait ces droits automatiquement sur public et rend désormais
-- l'exposition opt-in : on les accorde explicitement. Sans effet s'ils existent.
-- anon n'en reçoit aucun : l'app exige une connexion.
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on table
  public.profiles,
  public.training_sheets,
  public.sessions,
  public.tests,
  public.test_results,
  public.questions,
  public.answers,
  public.self_assessments
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security : chaque utilisateur ne voit et ne modifie que ses lignes
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.training_sheets enable row level security;
alter table public.sessions enable row level security;
alter table public.tests enable row level security;
alter table public.test_results enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.self_assessments enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (auth.uid() = user_id);

-- training_sheets
drop policy if exists training_sheets_select_own on public.training_sheets;
create policy training_sheets_select_own on public.training_sheets
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists training_sheets_insert_own on public.training_sheets;
create policy training_sheets_insert_own on public.training_sheets
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists training_sheets_update_own on public.training_sheets;
create policy training_sheets_update_own on public.training_sheets
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists training_sheets_delete_own on public.training_sheets;
create policy training_sheets_delete_own on public.training_sheets
  for delete to authenticated
  using (auth.uid() = user_id);

-- sessions
drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own on public.sessions
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own on public.sessions
  for delete to authenticated
  using (auth.uid() = user_id);

-- tests
drop policy if exists tests_select_own on public.tests;
create policy tests_select_own on public.tests
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists tests_insert_own on public.tests;
create policy tests_insert_own on public.tests
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists tests_update_own on public.tests;
create policy tests_update_own on public.tests
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists tests_delete_own on public.tests;
create policy tests_delete_own on public.tests
  for delete to authenticated
  using (auth.uid() = user_id);

-- test_results
drop policy if exists test_results_select_own on public.test_results;
create policy test_results_select_own on public.test_results
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists test_results_insert_own on public.test_results;
create policy test_results_insert_own on public.test_results
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists test_results_update_own on public.test_results;
create policy test_results_update_own on public.test_results
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists test_results_delete_own on public.test_results;
create policy test_results_delete_own on public.test_results
  for delete to authenticated
  using (auth.uid() = user_id);

-- questions
drop policy if exists questions_select_own on public.questions;
create policy questions_select_own on public.questions
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists questions_update_own on public.questions;
create policy questions_update_own on public.questions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists questions_delete_own on public.questions;
create policy questions_delete_own on public.questions
  for delete to authenticated
  using (auth.uid() = user_id);

-- answers
drop policy if exists answers_select_own on public.answers;
create policy answers_select_own on public.answers
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists answers_insert_own on public.answers;
create policy answers_insert_own on public.answers
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists answers_update_own on public.answers;
create policy answers_update_own on public.answers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists answers_delete_own on public.answers;
create policy answers_delete_own on public.answers
  for delete to authenticated
  using (auth.uid() = user_id);

-- self_assessments
drop policy if exists self_assessments_select_own on public.self_assessments;
create policy self_assessments_select_own on public.self_assessments
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists self_assessments_insert_own on public.self_assessments;
create policy self_assessments_insert_own on public.self_assessments
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists self_assessments_update_own on public.self_assessments;
create policy self_assessments_update_own on public.self_assessments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists self_assessments_delete_own on public.self_assessments;
create policy self_assessments_delete_own on public.self_assessments
  for delete to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Trigger set_user_id : user_id vient toujours du JWT, jamais du client.
-- Toute valeur fournie à l'insert est écrasée par auth.uid(). Sans JWT
-- (SQL Editor, service_role), auth.uid() est null et l'insert échoue sur
-- le not null : voir supabase/seed.sql pour simuler l'utilisateur.
-- -----------------------------------------------------------------------------

create or replace function public.set_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_user_id on public.profiles;
create trigger set_user_id
  before insert on public.profiles
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.training_sheets;
create trigger set_user_id
  before insert on public.training_sheets
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.sessions;
create trigger set_user_id
  before insert on public.sessions
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.tests;
create trigger set_user_id
  before insert on public.tests
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.test_results;
create trigger set_user_id
  before insert on public.test_results
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.questions;
create trigger set_user_id
  before insert on public.questions
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.answers;
create trigger set_user_id
  before insert on public.answers
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id on public.self_assessments;
create trigger set_user_id
  before insert on public.self_assessments
  for each row execute function public.set_user_id();
