-- =============================================================================
-- transfer_content_owner.sql (chantier 14)
--
-- But   : le contenu partagé (questions, training_sheets, tests) change de
--         propriétaire : il passe de ton compte au compte technique
--         « contenu » et devient public (is_public = true), lisible par tout
--         compte connecté (policies de 010). Mêmes lignes, mêmes id : tes
--         réponses (answers.question_id), tes résultats (test_results.test_id)
--         et tes séances (sessions.sheet_id) restent liés aux mêmes lignes.
--         Les lignes de démonstration de seed.sql (3 fiches sans slug, 2 tests
--         sans key, 5 questions) changent de propriétaire comme les autres :
--         ton compte ne possède plus aucun contenu.
--
-- Usage : une fois, APRÈS supabase/migrations/010_shared_content.sql et AVANT
--         tout seed régénéré.
-- 1. Crée le compte technique : Dashboard Supabase → Authentication → Users →
--    Add user → Create new user, email du compte technique, mot de passe long,
--    « Auto Confirm User » coché. Ne jamais le supprimer : la cascade
--    effacerait tout le contenu, et avec lui les réponses et résultats de tous
--    les comptes.
-- 2. Copie les deux UUID (« User UID ») : le tien et celui du compte technique.
-- 3. Colle tout le fichier dans le SQL Editor, puis remplace les deux
--    marqueurs entre chevrons des lignes mine uuid := … et
--    content_owner uuid := … (une occurrence chacun). Fais-le dans le SQL
--    Editor, jamais dans ce fichier, qui est versionné.
-- 4. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),
--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.
--
-- Idempotent : relancé, il ne trouve plus rien à transférer (0 ligne). Rien
-- n'est inséré ni supprimé : seuls user_id et is_public changent. Le trigger
-- set_user_id (001) ne joue qu'à l'insert : il ne touche pas ces updates.
-- Refuse, sans rien appliquer : deux fois le même UUID, un UUID absent de
-- auth.users, 010 pas encore exécutée, un compte technique qui a des données
-- personnelles (UUID inversés ?), ou un compte technique qui possède déjà une
-- ligne de même clé que la tienne (seed lancé avant ce transfert : voir le
-- message, qui nomme les lignes).
-- =============================================================================

do $$
declare
  mine uuid := '<REMPLACER_PAR_MON_UUID>';
  content_owner uuid := '<REMPLACER_PAR_CONTENU_UUID>';
  conflicts text;
  moved_questions integer;
  moved_sheets integer;
  moved_tests integer;
  published integer;
  left_behind integer;
begin
  if mine = content_owner then
    raise exception 'Les deux UUID sont identiques : % ; attendu ton compte puis le compte technique.', mine;
  end if;
  if not exists (select 1 from auth.users where id = mine) then
    raise exception 'Aucun utilisateur % dans auth.users : vérifie ton UUID.', mine;
  end if;
  if not exists (select 1 from auth.users where id = content_owner) then
    raise exception 'Aucun utilisateur % dans auth.users : crée le compte technique, puis copie son UUID.', content_owner;
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tests' and column_name = 'is_public'
  ) then
    raise exception 'Colonne tests.is_public absente : exécute d’abord supabase/migrations/010_shared_content.sql.';
  end if;

  -- Le compte technique ne joue jamais : des séances, réponses ou résultats à son
  -- nom trahissent un UUID inversé.
  if exists (select 1 from public.sessions where user_id = content_owner)
    or exists (select 1 from public.answers where user_id = content_owner)
    or exists (select 1 from public.test_results where user_id = content_owner)
  then
    raise exception 'Le compte % a des séances, réponses ou résultats : ce n’est pas le compte technique (UUID inversés ?). Rien n’est appliqué.', content_owner;
  end if;

  -- Clés d'idempotence des seeds, uniques par propriétaire : une ligne du
  -- compte technique de même clé qu'une des tiennes empêcherait le transfert
  -- (index uniques de 004) ou doublerait une question.
  select string_agg(conflict, ', ' order by conflict)
  into conflicts
  from (
    select 'training_sheets.slug ' || s.slug as conflict
    from public.training_sheets s
    join public.training_sheets c on c.slug = s.slug and c.user_id = content_owner
    where s.user_id = mine
    union all
    select 'tests.key ' || t.key
    from public.tests t
    join public.tests c on c.key = t.key and c.user_id = content_owner
    where t.user_id = mine
    union all
    select 'questions « ' || left(q.situation, 40) || '… »'
    from public.questions q
    join public.questions c on c.situation = q.situation and c.user_id = content_owner
    where q.user_id = mine
  ) as clashes;
  if conflicts is not null then
    raise exception 'Le compte technique possède déjà : %. Rien n’est transféré. Un seed a sans doute tourné avant ce transfert : supprime ces lignes du compte technique (aucune réponse ni aucun résultat ne doit y renvoyer), relance ce fichier, puis le seed.', conflicts;
  end if;

  update public.questions set user_id = content_owner, is_public = true where user_id = mine;
  get diagnostics moved_questions = row_count;
  update public.training_sheets set user_id = content_owner, is_public = true where user_id = mine;
  get diagnostics moved_sheets = row_count;
  update public.tests set user_id = content_owner, is_public = true where user_id = mine;
  get diagnostics moved_tests = row_count;
  raise notice 'Transférées vers le compte technique % : questions %, training_sheets %, tests %.',
    content_owner, moved_questions, moved_sheets, moved_tests;

  -- Tout le contenu du compte technique est public (0 attendu : rien d'autre ne lui écrit).
  update public.questions set is_public = true where user_id = content_owner and not is_public;
  get diagnostics published = row_count;
  update public.training_sheets set is_public = true where user_id = content_owner and not is_public;
  get diagnostics left_behind = row_count;
  published := published + left_behind;
  update public.tests set is_public = true where user_id = content_owner and not is_public;
  get diagnostics left_behind = row_count;
  published := published + left_behind;
  raise notice 'Lignes du compte technique rendues publiques en plus : %.', published;

  select (select count(*) from public.questions where user_id = mine)
    + (select count(*) from public.training_sheets where user_id = mine)
    + (select count(*) from public.tests where user_id = mine)
  into left_behind;
  if left_behind <> 0 then
    raise exception 'Il reste % ligne(s) de contenu à ton compte : rien n’est appliqué.', left_behind;
  end if;
  raise notice 'Contenu restant à ton compte % : 0 ligne.', mine;
end
$$;

-- =============================================================================
-- Contrôle (lisible à tout moment, sans UUID à remplacer). Le SQL Editor n'affiche
-- que le résultat de la dernière requête : sélectionner une requête, puis Run,
-- pour la lancer seule.
-- =============================================================================

-- 1. Lignes de contenu par propriétaire et par is_public. Attendu après le
--    transfert : le seul email du compte technique, is_public true partout.
select 'questions' as table_name, coalesce(u.email, q.user_id::text) as proprietaire, q.is_public, count(*) as nb_lignes
from public.questions q
left join auth.users u on u.id = q.user_id
group by 1, 2, 3
union all
select 'training_sheets', coalesce(u.email, s.user_id::text), s.is_public, count(*)
from public.training_sheets s
left join auth.users u on u.id = s.user_id
group by 1, 2, 3
union all
select 'tests', coalesce(u.email, t.user_id::text), t.is_public, count(*)
from public.tests t
left join auth.users u on u.id = t.user_id
group by 1, 2, 3
order by 1, 2, 3;

-- 2. Policies des trois tables : 3 lignes, une policy select par table, sur
--    (auth.uid() = user_id) OR is_public ; aucune policy insert, update ni delete
--    (contenu en lecture seule depuis l'app, 010).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('questions', 'training_sheets', 'tests')
order by tablename, cmd;

-- 3. Aucune ligne de contenu restée à un compte qui joue (séances, réponses ou
--    résultats à son nom : le tien) : 0 attendu sur les trois lignes.
select 'questions' as table_name, count(*) as restees_a_un_compte_joueur
from public.questions c
where exists (select 1 from public.sessions s where s.user_id = c.user_id)
   or exists (select 1 from public.answers a where a.user_id = c.user_id)
   or exists (select 1 from public.test_results r where r.user_id = c.user_id)
union all
select 'training_sheets', count(*)
from public.training_sheets c
where exists (select 1 from public.sessions s where s.user_id = c.user_id)
   or exists (select 1 from public.answers a where a.user_id = c.user_id)
   or exists (select 1 from public.test_results r where r.user_id = c.user_id)
union all
select 'tests', count(*)
from public.tests c
where exists (select 1 from public.sessions s where s.user_id = c.user_id)
   or exists (select 1 from public.answers a where a.user_id = c.user_id)
   or exists (select 1 from public.test_results r where r.user_id = c.user_id)
order by 1;
