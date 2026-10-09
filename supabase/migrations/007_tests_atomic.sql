-- =============================================================================
-- 007_tests_atomic.sql
--
-- But   : onglet Tests, tests atomiques, familles et sessions (chantier 10).
--         1. training_sheets.family : famille d'un test atomique (sous-type de
--            sa compétence, liste fermée FAMILY_KEYS de lib/test-families.ts) ;
--            null pour une fiche de lecture ou une session.
--         2. training_sheets.blocks : slugs ordonnés des tests d'une session ;
--            null pour une fiche de lecture ou un test.
--         3. kind 'session' ajouté à la liste fermée SHEET_KINDS
--            (lib/sheet-types.ts). SEULE MODIFICATION NON STRICTEMENT
--            ADDITIVE : la contrainte training_sheets_kind_check de 004 est
--            supprimée et remplacée par training_sheets_kind_check_v2 (les 2
--            mêmes kinds + 'session'), comme 004 l'a fait pour
--            sessions_module_check.
--         4. Index (user_id, kind) : lecture des tests et des sessions de
--            l'onglet Tests.
-- Date  : 2026-10-09
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 006, AVANT le seed régénéré supabase/seed_sheets_001.sql
--         (qui écrit family et blocks, et passe les 5 batteries en kind
--         'session'). Idempotent : ré-exécutable sans erreur ni perte de
--         données. Aucune ligne supprimée ni modifiée : deux colonnes
--         ajoutées, nulles partout, et des contraintes que les lignes
--         existantes respectent déjà.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- training_sheets : famille d'un test, tests d'une session
-- -----------------------------------------------------------------------------

alter table public.training_sheets
  add column if not exists family text;

alter table public.training_sheets
  add column if not exists blocks text[];

-- -----------------------------------------------------------------------------
-- kind : 'session' en plus
-- Liste fermée, à garder identique à SHEET_KINDS dans lib/sheet-types.ts.
-- L'ancienne contrainte est supprimée, la nouvelle créée seulement si absente.
-- -----------------------------------------------------------------------------

alter table public.training_sheets
  drop constraint if exists training_sheets_kind_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sheets_kind_check_v2'
      and conrelid = 'public.training_sheets'::regclass
  ) then
    alter table public.training_sheets
      add constraint training_sheets_kind_check_v2 check (kind in ('training', 'test', 'session'));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- family : liste fermée, à garder identique à FAMILY_KEYS dans
-- lib/test-families.ts (même ordre). Créée seulement si absente : changer la
-- liste demandera une nouvelle migration.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sheets_family_check'
      and conrelid = 'public.training_sheets'::regclass
  ) then
    alter table public.training_sheets
      add constraint training_sheets_family_check check (
        family is null or family in (
          'tir_arret',
          'tir_surface',
          'tir_mouvement',
          'tir_loin',
          'tir_dos',
          'passe_courte',
          'passe_longue',
          'passe_remise',
          'passe_mouvement',
          'passe_centre',
          'dribble_slalom',
          'dribble_conduite',
          'dribble_controle',
          'dribble_aerien',
          'jonglerie_pieds',
          'jonglerie_tete',
          'jonglerie_enchainement',
          'phys_vitesse',
          'phys_agilite',
          'phys_endurance',
          'phys_gainage'
        )
      );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Index : fiches d'un utilisateur par kind (tests, sessions)
-- -----------------------------------------------------------------------------

create index if not exists training_sheets_user_id_kind_idx
  on public.training_sheets (user_id, kind);

-- Contrôle (doit renvoyer blocks / ARRAY et family / text, puis les 2 lignes
-- training_sheets_family_check et training_sheets_kind_check_v2, sans
-- training_sheets_kind_check) :
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'training_sheets'
--     and column_name in ('family', 'blocks')
--   order by column_name;
--   select conname
--   from pg_constraint
--   where conrelid = 'public.training_sheets'::regclass
--     and conname in (
--       'training_sheets_kind_check',
--       'training_sheets_kind_check_v2',
--       'training_sheets_family_check'
--     )
--   order by conname;
