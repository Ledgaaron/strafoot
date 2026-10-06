-- =============================================================================
-- 002_sessions_module_and_defaults.sql
--
-- But   : 1. user_id prend auth.uid() par défaut sur les 8 tables : le client
--            n'envoie jamais user_id. Le trigger set_user_id de 001 reste en
--            place et continue d'imposer auth.uid() à chaque insert.
--         2. sessions.module : module choisi dans le formulaire de séance,
--            liste fermée identique à MODULE_KEYS (lib/modules.ts).
--            sessions.name existe déjà depuis 001 : rien à ajouter.
-- Date  : 2026-10-06
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 001. Idempotent : ré-exécutable sans erreur ni perte de données.
--         Additif uniquement : les séances existantes (seed compris) reçoivent
--         module = 'seance_libre', aucune ligne n'est supprimée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_id par défaut (sans effet si le défaut est déjà en place)
-- -----------------------------------------------------------------------------

alter table public.profiles alter column user_id set default auth.uid();
alter table public.training_sheets alter column user_id set default auth.uid();
alter table public.sessions alter column user_id set default auth.uid();
alter table public.tests alter column user_id set default auth.uid();
alter table public.test_results alter column user_id set default auth.uid();
alter table public.questions alter column user_id set default auth.uid();
alter table public.answers alter column user_id set default auth.uid();
alter table public.self_assessments alter column user_id set default auth.uid();

-- -----------------------------------------------------------------------------
-- sessions.module
-- -----------------------------------------------------------------------------

alter table public.sessions
  add column if not exists module text not null default 'seance_libre';

-- Liste fermée, à garder identique à MODULE_KEYS dans lib/modules.ts.
-- Créée seulement si absente : changer la liste demandera une nouvelle migration.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_module_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_module_check check (
        module in (
          'entrainement_club',
          'entrainement_specifique',
          'seance_libre',
          'recup_active',
          'etirements',
          'massage',
          'piscine'
        )
      );
  end if;
end
$$;
