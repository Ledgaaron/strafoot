-- =============================================================================
-- 005_profile.sql
--
-- But   : onglet Profil.
--         1. profiles : strong_foot (pied fort) et club_level (niveau, texte libre
--            court, ex. « D2 district »).
--         2. Postes du profil dans la taxonomie de lib/profile-taxonomy.ts : les 8
--            postes de lib/quiz-taxonomy.ts, sans 'tous' (qui qualifie une
--            question, pas un joueur). main_position et secondary_position sont
--            d'abord recodés (attaquant → avant_centre, milieu offensif →
--            milieu_offensif, et les autres anciens libellés recodés par 003 et
--            004) ; toute autre valeur hors liste passe à null, avec une notice
--            qui la nomme. Sans ce recodage, les contraintes échoueraient.
--         3. Contraintes profiles_main_position_check,
--            profiles_secondary_position_check et profiles_strong_foot_check
--            (droit, gauche, ambidextre) ; null permis partout (non renseigné).
--         4. Index unique profiles (user_id) : un profil par utilisateur, clé de
--            l'upsert de l'écran d'édition (lib/db/profiles.ts).
-- Date  : 2026-10-06
-- Usage : exécuter à la main dans le SQL Editor de Supabase (tout le fichier),
--         après 004. Idempotent : ré-exécutable sans erreur ni perte de données.
--         Additif, hormis le recodage des postes du profil (seed.sql : attaquant,
--         milieu offensif) : aucune ligne supprimée.
--         S'il existe plusieurs profils pour un même utilisateur, le contrôle
--         ci-dessous lève une exception avant toute modification : rien n'est
--         appliqué. Garder alors le plus ancien avec la requête commentée en fin
--         de fichier (suppression à lancer à la main, après lecture), puis relancer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Un profil par utilisateur : vérifié avant toute modification
-- -----------------------------------------------------------------------------

do $$
declare
  duplicates text;
begin
  select string_agg(format('%s (%s profils)', d.user_id, d.profile_count), ', ' order by d.user_id)
  into duplicates
  from (
    select user_id, count(*) as profile_count
    from public.profiles
    group by user_id
    having count(*) > 1
  ) as d;
  if duplicates is not null then
    raise exception 'Plusieurs profils pour un même utilisateur : %. Rien n''est appliqué : garder le plus ancien avec la requête commentée en fin de 005_profile.sql, puis relancer.', duplicates;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles : pied fort et niveau
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists strong_foot text;

alter table public.profiles
  add column if not exists club_level text;

-- -----------------------------------------------------------------------------
-- Postes : recodage vers les clés de la taxonomie (sans effet à la seconde
-- exécution). Mêmes anciens libellés que 003 (questions) et 004 (fiches).
-- -----------------------------------------------------------------------------

update public.profiles
set main_position =
  case main_position
    when 'attaquant' then 'avant_centre'
    when 'milieu offensif' then 'milieu_offensif'
    when 'milieu défensif' then 'milieu_defensif'
    when 'milieu central' then 'milieu_central'
    when 'défenseur central' then 'defenseur_central'
    when 'latéral' then 'lateral'
  end
where main_position in (
  'attaquant', 'milieu offensif', 'milieu défensif', 'milieu central', 'défenseur central', 'latéral'
);

update public.profiles
set secondary_position =
  case secondary_position
    when 'attaquant' then 'avant_centre'
    when 'milieu offensif' then 'milieu_offensif'
    when 'milieu défensif' then 'milieu_defensif'
    when 'milieu central' then 'milieu_central'
    when 'défenseur central' then 'defenseur_central'
    when 'latéral' then 'lateral'
  end
where secondary_position in (
  'attaquant', 'milieu offensif', 'milieu défensif', 'milieu central', 'défenseur central', 'latéral'
);

-- Toute autre valeur hors des 8 postes ('tous' compris) passe à null : la notice
-- la nomme, pour la ressaisir dans l'écran d'édition du profil.
do $$
declare
  known_positions constant text[] := array[
    'gardien',
    'defenseur_central',
    'lateral',
    'milieu_defensif',
    'milieu_central',
    'milieu_offensif',
    'ailier',
    'avant_centre'
  ];
  unknown_positions text;
begin
  select string_agg(distinct p.position_key, ', ' order by p.position_key)
  into unknown_positions
  from (
    select main_position as position_key from public.profiles
    union all
    select secondary_position from public.profiles
  ) as p
  where p.position_key <> all (known_positions);
  if unknown_positions is not null then
    raise notice 'Postes hors taxonomie remis à null : %.', unknown_positions;
    update public.profiles set main_position = null where main_position <> all (known_positions);
    update public.profiles set secondary_position = null where secondary_position <> all (known_positions);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Listes fermées, à garder identiques à PROFILE_POSITIONS et STRONG_FEET
-- (lib/profile-taxonomy.ts). Créées seulement si absentes : changer une liste
-- demandera une nouvelle migration. Une valeur null passe le CHECK.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_main_position_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_main_position_check check (
        main_position in (
          'gardien',
          'defenseur_central',
          'lateral',
          'milieu_defensif',
          'milieu_central',
          'milieu_offensif',
          'ailier',
          'avant_centre'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_secondary_position_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_secondary_position_check check (
        secondary_position in (
          'gardien',
          'defenseur_central',
          'lateral',
          'milieu_defensif',
          'milieu_central',
          'milieu_offensif',
          'ailier',
          'avant_centre'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_strong_foot_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_strong_foot_check check (
        strong_foot in ('droit', 'gauche', 'ambidextre')
      );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Un profil par utilisateur (les doublons ont été écartés par le contrôle de tête)
-- -----------------------------------------------------------------------------

create unique index if not exists profiles_user_id_idx
  on public.profiles (user_id);

-- -----------------------------------------------------------------------------
-- Seulement si le contrôle de tête a levé une exception. Suppression définitive :
-- à lancer à la main, jamais par cette migration.
-- 1. Lire les profils en double :
--      select id, user_id, created_at, main_position, secondary_position, club, birth_date
--      from public.profiles
--      where user_id in (select user_id from public.profiles group by user_id having count(*) > 1)
--      order by user_id, created_at;
-- 2. Garder le plus ancien de chaque utilisateur (à created_at égal : le plus petit id) :
--      delete from public.profiles p
--      using public.profiles older
--      where older.user_id = p.user_id
--        and (older.created_at, older.id) < (p.created_at, p.id);
-- 3. Relancer tout ce fichier.
-- -----------------------------------------------------------------------------
