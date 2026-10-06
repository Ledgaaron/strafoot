-- =============================================================================
-- 004_training_sheets_and_tests.sql
--
-- But   : onglet Entraînement, fiches de lecture et tests mesurés.
--         1. training_sheets : slug (clé du contenu versionné, unique par
--            utilisateur), kind ('training' : fiche de lecture ; 'test' : test
--            mesuré), subtitle, intro (lignes de texte), pdf_url. Postes dans la
--            taxonomie de lib/quiz-taxonomy.ts (9 postes) : les 3 fiches de
--            démonstration de seed.sql sont d'abord recodées, comme 003 l'a fait
--            pour les questions, sans quoi la contrainte échouerait.
--         2. tests : key (identifiant stable d'une mesure, unique par
--            utilisateur, jamais renommé) et higher_is_better (false pour les
--            chronos).
--         3. test_results : session_id (séance de type test qui a produit le
--            résultat) et index du dernier résultat par test.
--         4. sessions : module 'test' ajouté à la liste fermée MODULE_KEYS
--            (lib/modules.ts). SEULE MODIFICATION NON STRICTEMENT ADDITIVE : la
--            contrainte sessions_module_check de 002 est supprimée et remplacée
--            par sessions_module_check_v2 (les 7 mêmes modules + 'test').
--         5. Storage : bucket public 'diagrams' (schémas des exercices) et
--            policy de lecture publique. Aucune policy d'écriture : les PNG sont
--            déposés à la main (dashboard → Storage → diagrams → Upload).
-- Date  : 2026-10-06
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 003. Idempotent : ré-exécutable sans erreur ni perte de données.
--         Aucune ligne supprimée : seuls les postes des 3 fiches de
--         démonstration sont recodés.
--         Si une contrainte échoue (« violated by some row »), une fiche hors
--         taxonomie existe encore : rien n'est appliqué, la corriger puis relancer.
--         Ne plus ré-exécuter 002 après 004 : son bloc recréerait
--         sessions_module_check, sans 'test'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- training_sheets : fiche de lecture ou test, contenu versionné
-- -----------------------------------------------------------------------------

alter table public.training_sheets
  add column if not exists slug text;

alter table public.training_sheets
  add column if not exists kind text not null default 'training';

alter table public.training_sheets
  add column if not exists subtitle text;

alter table public.training_sheets
  add column if not exists intro jsonb not null default '[]'::jsonb;

alter table public.training_sheets
  add column if not exists pdf_url text;

-- Recodage des postes des 3 fiches de seed.sql (sans effet à la seconde exécution).
update public.training_sheets
set positions =
  array_replace(
    array_replace(
      array_replace(
        array_replace(
          array_replace(
            array_replace(positions, 'attaquant', 'avant_centre'),
            'milieu offensif', 'milieu_offensif'),
          'milieu défensif', 'milieu_defensif'),
        'milieu central', 'milieu_central'),
      'défenseur central', 'defenseur_central'),
    'latéral', 'lateral')
where positions && array[
  'attaquant', 'milieu offensif', 'milieu défensif', 'milieu central', 'défenseur central', 'latéral'
]::text[];

-- Listes fermées, à garder identiques à SHEET_KINDS (lib/sheet-types.ts) et à
-- POSITIONS (lib/quiz-taxonomy.ts). Créées seulement si absentes : changer une
-- liste demandera une nouvelle migration.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sheets_kind_check'
      and conrelid = 'public.training_sheets'::regclass
  ) then
    alter table public.training_sheets
      add constraint training_sheets_kind_check check (kind in ('training', 'test'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sheets_positions_check'
      and conrelid = 'public.training_sheets'::regclass
  ) then
    alter table public.training_sheets
      add constraint training_sheets_positions_check check (
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

-- Clé d'idempotence de supabase/seed_sheets_001.sql ; les fiches sans slug
-- (démonstration) ne sont pas concernées.
create unique index if not exists training_sheets_user_id_slug_idx
  on public.training_sheets (user_id, slug)
  where slug is not null;

-- -----------------------------------------------------------------------------
-- tests : catalogue des mesures
-- -----------------------------------------------------------------------------

alter table public.tests
  add column if not exists key text;

alter table public.tests
  add column if not exists higher_is_better boolean not null default true;

-- Une mesure des JSON = une ligne, repérée par key ; les tests sans key
-- (démonstration) ne sont pas concernés.
create unique index if not exists tests_user_id_key_idx
  on public.tests (user_id, key)
  where key is not null;

-- -----------------------------------------------------------------------------
-- test_results : séance d'origine et dernier résultat par test
-- -----------------------------------------------------------------------------

alter table public.test_results
  add column if not exists session_id uuid references public.sessions (id) on delete set null;

create index if not exists test_results_user_id_test_id_date_desc_idx
  on public.test_results (user_id, test_id, date desc);

-- -----------------------------------------------------------------------------
-- sessions : module 'test'
-- Liste fermée, à garder identique à MODULE_KEYS dans lib/modules.ts. L'ancienne
-- contrainte est supprimée, la nouvelle créée seulement si absente.
-- -----------------------------------------------------------------------------

alter table public.sessions
  drop constraint if exists sessions_module_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_module_check_v2'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_module_check_v2 check (
        module in (
          'entrainement_club',
          'entrainement_specifique',
          'seance_libre',
          'recup_active',
          'etirements',
          'massage',
          'piscine',
          'test'
        )
      );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Storage : bucket public des schémas
-- L'URL publique (/storage/v1/object/public/diagrams/<fichier>) ne demande
-- aucune policy ; celle-ci ouvre aussi la lecture par l'API Storage.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('diagrams', 'diagrams', true)
on conflict do nothing;

drop policy if exists diagrams_public_read on storage.objects;
create policy diagrams_public_read on storage.objects
  for select to public
  using (bucket_id = 'diagrams');
