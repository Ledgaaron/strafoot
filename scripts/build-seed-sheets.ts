// Génère le seed SQL des fiches de l'onglet Entraînement à partir du contenu
// versionné : supabase/content/sheets_001.json (fiches de lecture) et
// supabase/content/tests_001.json (tests mesurés) → supabase/seed_sheets_001.sql.
//
// Usage, depuis la racine du projet (chemins relatifs au répertoire courant) :
//   npx tsx scripts/build-seed-sheets.ts
//     sans argument : lit sheets_001.json puis tests_001.json, dans cet ordre,
//     qui est celui des fiches dans le SQL.
//
// Validation, avec lib/sheet-types.ts et la taxonomie de lib/quiz-taxonomy.ts :
// racine { _format facultatif, sheets non vide } ; fiche aux clés exactement
// slug, kind, title, subtitle, positions, skill, duration_min, intro, exercises ;
// slug en kebab-case, unique sur les deux fichiers (clé d'idempotence du SQL) ;
// kind dans SHEET_KINDS ; title, subtitle et skill non vides ; positions non
// vide, dans la liste fermée, sans doublon ; duration_min entier positif ; intro
// et exercises au format de lib/sheet-types.ts (validateIntro, validateExercises).
// Aucune chaîne de la fiche, à toute profondeur, ne contient de caractère de
// contrôle, ni « $$ », qui fermerait le bloc do du SQL, ni le marqueur de l'UUID.
// Sur les fiches valides : key de mesure unique sur toutes les fiches (clé
// d'idempotence du catalogue tests) ; chaque diagram est un fichier de
// supabase/content/diagrams, au nom exact. Un fichier de ce dossier qu'aucune
// fiche ne référence est signalé, sans être une erreur. Toutes les erreurs sont
// listées en une passe ; s'il y en a une, aucun SQL n'est écrit et le script
// finit en code 1.
//
// Sortie déterministe : ni date ni horodatage, fins de ligne LF, UTF-8 sans BOM,
// retour à la ligne final. Le SQL n'est réécrit que s'il change (CRLF ramenés à
// LF pour comparer) : relancé sur les mêmes JSON, le script annonce « inchangé ».
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:fs.
/// <reference types="node" />
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { isPositionKey, POSITION_KEYS, type PositionKey } from '../lib/quiz-taxonomy';
import {
  isSheetKind,
  SHEET_KINDS,
  validateExercises,
  validateIntro,
  type Exercise,
  type Measure,
  type SheetKind,
} from '../lib/sheet-types';

const CONTENT_DIR = 'supabase/content';
/** Schémas des exercices : les fichiers à déposer à la main dans le bucket Storage diagrams. */
const DIAGRAMS_DIR = `${CONTENT_DIR}/diagrams`;
/** Entrées fixes, lues dans cet ordre, qui est celui des fiches dans le SQL. */
const CONTENT_FILES: readonly string[] = ['sheets_001.json', 'tests_001.json'];
const OUTPUT_FILE = 'seed_sheets_001.sql';
const OUTPUT_PATH = `supabase/${OUTPUT_FILE}`;
const SCRIPT_PATH = 'scripts/build-seed-sheets.ts';
const MIGRATION_PATH = 'supabase/migrations/004_training_sheets_and_tests.sql';
/** Remplacé par l'utilisateur dans le SQL Editor : une seule occurrence, ligne uid. */
const UUID_MARKER = '<REMPLACER_PAR_MON_UUID>';
// Lignes de démonstration de supabase/seed.sql, sans slug ni key : le seed ne les
// touche pas, mais la requête de contrôle les compte.
const DEMO_SHEET_COUNT = 3;
const DEMO_TEST_COUNT = 2;

const ROOT_KEYS: readonly string[] = ['_format', 'sheets'];
const SHEET_KEYS: readonly string[] = [
  'slug',
  'kind',
  'title',
  'subtitle',
  'positions',
  'skill',
  'duration_min',
  'intro',
  'exercises',
];
/** kebab-case : « bo-tir-finition-surface ». */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Retour à la ligne, tabulation… : refusés dans toute chaîne d'une fiche.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
// Longueurs citées dans les messages d'erreur : slug ou titre, valeur fautive.
const EXCERPT_LENGTH = 50;
const VALUE_LENGTH = 60;
/** Indentation des champs d'une ligne du values (…) des fiches. */
const FIELD_INDENT = '      ';

/** Fiche validée, prête pour le SQL. */
type SeedSheet = {
  /** « sheets_001.json, fiche 2 « bo-passe-remise-controle-scan » » : de quoi la retrouver dans le JSON. */
  where: string;
  slug: string;
  kind: SheetKind;
  title: string;
  subtitle: string;
  positions: PositionKey[];
  skill: string;
  durationMin: number;
  /** intro telle que lue dans le JSON : le SQL l'écrit à l'identique. */
  introJson: unknown;
  /** exercises tel que lu dans le JSON (sans measures pour une fiche training) : le SQL l'écrit à l'identique. */
  exercisesJson: unknown;
  /** Exercices validés : mesures (aucune pour une fiche training) et schémas. */
  exercises: Exercise[];
};

/** Ligne du catalogue tests : une mesure et son protocole « titre du test — titre du bloc ». */
type SeedMeasure = Measure & { protocol: string };

/** Fichier de contenu (« tests_001.json ») et ses fiches valides, dans l'ordre du JSON. */
type ContentFile = { name: string; sheets: SeedSheet[] };

/** Schémas référencés par les fiches et présents ; fichiers du dossier que rien ne référence. */
type DiagramCheck = { found: Set<string>; unreferenced: string[] };

function main(): void {
  if (!statSync(CONTENT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`Dossier ${CONTENT_DIR} introuvable dans ${process.cwd()}. Lance le script depuis la racine du projet.`);
    return;
  }
  const errors: string[] = [];
  // Slug → endroit de la première fiche qui l'emploie, sur les deux fichiers.
  const slugs = new Map<string, string>();
  const files: ContentFile[] = [];
  for (const name of CONTENT_FILES) {
    files.push({ name, sheets: validateContentFile(name, slugs, errors) });
  }
  const sheets = files.flatMap((file) => file.sheets);
  const measures = collectMeasures(sheets, errors);
  const diagrams = checkDiagrams(sheets, errors);
  if (errors.length === 0 && measures.length === 0) {
    // La liste in (…) et le values (…) du catalogue seraient vides : SQL invalide.
    errors.push(
      `${CONTENT_FILES.join(', ')} : aucune mesure ; il faut au moins un test (kind test) pour le catalogue tests du SQL.`,
    );
  }
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    fail(`${formatCount(errors.length, 'erreur', 'erreurs')}, ${OUTPUT_PATH} non écrit.`);
    return;
  }
  // Seulement sans erreur : une fiche invalide, écartée des contrôles croisés, peut référencer le fichier.
  for (const name of diagrams.unreferenced) {
    console.warn(
      `${DIAGRAMS_DIR}/${name} : aucune fiche ne le référence ; inutile de le déposer dans le bucket diagrams.`,
    );
  }

  const sql = buildSql(sheets, measures);
  // Garde-fou : une chaîne qui contiendrait le marqueur le dupliquerait (déjà refusé par checkSqlSafety).
  if (sql.split(UUID_MARKER).length !== 2) {
    fail(`${UUID_MARKER} doit apparaître une seule fois dans le SQL, ${OUTPUT_PATH} non écrit.`);
    return;
  }
  // Comparaison en LF : un fichier réenregistré en CRLF n'a pas changé pour autant.
  const unchanged = readIfExists(OUTPUT_PATH)?.replaceAll('\r\n', '\n') === sql;
  if (!unchanged) {
    writeFileSync(OUTPUT_PATH, sql, 'utf8');
  }
  for (const file of files) {
    console.log(`${file.name} : ${formatCount(file.sheets.length, 'fiche valide', 'fiches valides')}`);
  }
  const counts = countByKind(sheets);
  const kinds = SHEET_KINDS.map((kind) => `${counts[kind]} ${kind}`).join(', ');
  const total = formatCount(sheets.length, 'fiche', 'fiches');
  const measureTotal = formatCount(measures.length, 'mesure', 'mesures');
  const found = formatCount(diagrams.found.size, 'schéma trouvé', 'schémas trouvés');
  console.log(`${total} (${kinds}), ${measureTotal}, ${found} → ${OUTPUT_PATH} (${unchanged ? 'inchangé' : 'écrit'})`);
}

// Validation : chaque erreur s'ajoute à `errors` et la lecture continue, pour
// tout signaler en une passe.

/** Fiches valides d'un fichier de contenu ; ses erreurs s'ajoutent à `errors`. */
function validateContentFile(fileName: string, slugs: Map<string, string>, errors: string[]): SeedSheet[] {
  const filePath = `${CONTENT_DIR}/${fileName}`;
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    errors.push(`${fileName} : ${filePath} introuvable.`);
    return [];
  }
  const text = readFileSync(filePath, 'utf8');
  let root: unknown;
  try {
    // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`${fileName} : JSON illisible (${reason}).`);
    return [];
  }
  if (!isRecord(root)) {
    errors.push(`${fileName} : racine ${describeValue(root)} invalide ; attendu un objet { "sheets": [ … ] }.`);
    return [];
  }

  const rootWhere = `${fileName}, racine`;
  checkUnknownKeys(root, ROOT_KEYS, rootWhere, errors);
  const items = root.sheets;
  if (!isArray(items) || items.length === 0) {
    errors.push(`${rootWhere} : ${fieldError('sheets', items)} ; attendu un tableau non vide de fiches.`);
    return [];
  }
  const sheets: SeedSheet[] = [];
  for (const [index, item] of items.entries()) {
    const sheet = validateSheet(item, fileName, index + 1, slugs, errors);
    if (sheet) {
      sheets.push(sheet);
    }
  }
  return sheets;
}

/**
 * Une fiche ; null si elle a une erreur, quelle qu'elle soit (clé inconnue
 * comprise) : seules les fiches sans erreur passent aux contrôles croisés.
 */
function validateSheet(
  item: unknown,
  fileName: string,
  number: number,
  slugs: Map<string, string>,
  errors: string[],
): SeedSheet | null {
  const where = locate(`${fileName}, fiche ${number}`, sheetName(item));
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${SHEET_KEYS.join(', ')} }.`);
    return null;
  }
  const errorCount = errors.length;
  checkUnknownKeys(item, SHEET_KEYS, where, errors);

  const slug = checkSlug(item.slug, where, slugs, errors);
  const kind = checkKind(item.kind, where, errors);
  const title = checkText(item.title, 'title', where, errors);
  const subtitle = checkText(item.subtitle, 'subtitle', where, errors);
  const positions = checkPositions(item.positions, where, errors);
  const skill = checkText(item.skill, 'skill', where, errors);
  const durationMin = checkPositiveInteger(item.duration_min, 'duration_min', where, errors);
  addSheetErrors(validateIntro(item.intro).errors, where, errors);
  // Le format des exercices dépend du kind (measures pour un test) : sans kind valide, rien à valider.
  const exercises = kind === null ? null : validateExercises(item.exercises, kind);
  if (exercises !== null) {
    addSheetErrors(exercises.errors, where, errors);
  }
  checkSqlSafety(item, '', where, errors);
  if (
    errors.length > errorCount ||
    slug === null ||
    kind === null ||
    title === null ||
    subtitle === null ||
    positions === null ||
    skill === null ||
    durationMin === null ||
    exercises === null
  ) {
    return null;
  }
  return {
    where,
    slug,
    kind,
    title,
    subtitle,
    positions,
    skill,
    durationMin,
    introJson: item.intro,
    exercisesJson: item.exercises,
    exercises: exercises.value,
  };
}

/** Ce qui nomme une fiche dans les messages : son slug s'il est renseigné, sinon son titre. */
function sheetName(item: unknown): unknown {
  if (!isRecord(item)) {
    return undefined;
  }
  return typeof item.slug === 'string' && item.slug.trim() !== '' ? item.slug : item.title;
}

/** Slug kebab-case, pas encore employé par une autre fiche des deux fichiers ; null sinon. */
function checkSlug(value: unknown, where: string, slugs: Map<string, string>, errors: string[]): string | null {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    errors.push(
      `${where} : ${fieldError('slug', value)} ; attendu un identifiant kebab-case (« bo-tir-finition-surface »).`,
    );
    return null;
  }
  const first = slugs.get(value);
  if (first !== undefined) {
    errors.push(
      `${where} : slug "${value}" déjà employé (${first}) ; un slug est unique sur toutes les fiches (clé d'idempotence du SQL).`,
    );
    return null;
  }
  slugs.set(value, where);
  return value;
}

function checkKind(value: unknown, where: string, errors: string[]): SheetKind | null {
  if (typeof value === 'string' && isSheetKind(value)) {
    return value;
  }
  errors.push(`${where} : ${fieldError('kind', value)} ; valeurs permises : ${SHEET_KINDS.join(', ')}.`);
  return null;
}

/** Tableau non vide de postes de la liste fermée, sans doublon ; null sinon. */
function checkPositions(value: unknown, where: string, errors: string[]): PositionKey[] | null {
  const allowed = `valeurs permises : ${POSITION_KEYS.join(', ')}`;
  if (!isArray(value) || value.length === 0) {
    errors.push(`${where} : ${fieldError('positions', value)} ; attendu un tableau non vide, ${allowed}.`);
    return null;
  }
  const positions: PositionKey[] = [];
  let valid = true;
  for (const entry of value) {
    if (typeof entry !== 'string' || !isPositionKey(entry)) {
      errors.push(`${where} : position ${describeValue(entry)} invalide ; ${allowed}.`);
      valid = false;
    } else if (positions.includes(entry)) {
      errors.push(`${where} : position ${describeValue(entry)} en double.`);
      valid = false;
    } else {
      positions.push(entry);
    }
  }
  return valid ? positions : null;
}

/** Chaîne non vide après trim ; null sinon (caractères interdits : voir checkSqlSafety). */
function checkText(value: unknown, field: string, where: string, errors: string[]): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu une chaîne non vide.`);
  return null;
}

function checkPositiveInteger(value: unknown, field: string, where: string, errors: string[]): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu un entier positif.`);
  return null;
}

/** Erreurs de lib/sheet-types.ts (« intro : … », « exercice 2 « … » : … »), précédées de l'endroit de la fiche. */
function addSheetErrors(messages: readonly string[], where: string, errors: string[]): void {
  for (const message of messages) {
    errors.push(`${where}, ${message}`);
  }
}

/**
 * Chaque chaîne de la fiche, à toute profondeur (les valeurs, pas les clés) :
 * ni caractère de contrôle, ni « $$ », qui fermerait le bloc do $$ du SQL, ni le
 * marqueur de l'UUID. L'erreur donne le chemin JSON de la valeur
 * (« exercises[2].instructions[0] »).
 */
function checkSqlSafety(value: unknown, jsonPath: string, where: string, errors: string[]): void {
  if (typeof value === 'string') {
    const control = CONTROL_CHARACTER.exec(value);
    if (control) {
      const code = control[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
      errors.push(
        `${where} : ${jsonPath} contient le caractère de contrôle U+${code} ; un texte tient sur une ligne, sans tabulation.`,
      );
    }
    if (value.includes('$$')) {
      errors.push(`${where} : ${jsonPath} contient "$$", qui fermerait le bloc do $$ … $$ du SQL.`);
    }
    if (value.includes(UUID_MARKER)) {
      errors.push(`${where} : ${jsonPath} contient le marqueur ${UUID_MARKER}, réservé à la ligne uid du SQL.`);
    }
  } else if (isArray(value)) {
    for (const [index, item] of value.entries()) {
      checkSqlSafety(item, `${jsonPath}[${index}]`, where, errors);
    }
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      checkSqlSafety(item, jsonPath === '' ? key : `${jsonPath}.${key}`, where, errors);
    }
  }
}

/**
 * Mesures des fiches valides, fiche → bloc → mesure, chacune avec son protocole.
 * validateExercises n'assure l'unicité de key que dans une fiche : ici, sur toutes.
 */
function collectMeasures(sheets: readonly SeedSheet[], errors: string[]): SeedMeasure[] {
  const measures: SeedMeasure[] = [];
  // key → endroit de la première mesure qui l'emploie, toutes fiches confondues.
  const keys = new Map<string, string>();
  for (const sheet of sheets) {
    for (const exercise of sheet.exercises) {
      for (const [index, measure] of exercise.measures.entries()) {
        const where = `${exerciseWhere(sheet, exercise)}, mesure ${index + 1}`;
        const first = keys.get(measure.key);
        if (first !== undefined) {
          errors.push(
            `${where} : key "${measure.key}" déjà employée (${first}) ; une key est unique sur toutes les fiches (clé d'idempotence du catalogue tests).`,
          );
          continue;
        }
        keys.set(measure.key, where);
        measures.push({ ...measure, protocol: `${sheet.title} — ${exercise.title}` });
      }
    }
  }
  return measures;
}

/**
 * Schémas des fiches valides : chaque diagram non nul est un fichier de
 * supabase/content/diagrams, au nom exact (le bucket Storage distingue la casse,
 * Windows non). Retourne les fichiers référencés et présents, et ceux du dossier
 * qu'aucune fiche ne référence.
 */
function checkDiagrams(sheets: readonly SeedSheet[], errors: string[]): DiagramCheck {
  const files = listDiagramFiles();
  const found = new Set<string>();
  for (const sheet of sheets) {
    for (const exercise of sheet.exercises) {
      if (exercise.diagram === null) {
        continue;
      }
      if (files.includes(exercise.diagram)) {
        found.add(exercise.diagram);
      } else {
        errors.push(
          `${exerciseWhere(sheet, exercise)} : diagram "${exercise.diagram}" introuvable dans ${DIAGRAMS_DIR} (nom exact, casse comprise) ; c'est ce fichier qui est déposé dans le bucket diagrams.`,
        );
      }
    }
  }
  return { found, unreferenced: files.filter((name) => !found.has(name)) };
}

/** Noms exacts des fichiers de supabase/content/diagrams, triés ; aucun si le dossier n'existe pas. */
function listDiagramFiles(): string[] {
  if (!statSync(DIAGRAMS_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }
  return readdirSync(DIAGRAMS_DIR)
    .filter((name) => statSync(`${DIAGRAMS_DIR}/${name}`, { throwIfNoEntry: false })?.isFile() ?? false)
    .sort();
}

/** « tests_001.json, fiche 1 « test-tir », exercice 2 « Finition après contrôle » », comme lib/sheet-types.ts. */
function exerciseWhere(sheet: SeedSheet, exercise: Exercise): string {
  return `${sheet.where}, ${locate(`exercice ${exercise.order}`, exercise.title)}`;
}

/** Clés hors de la liste attendue : une faute de frappe (« subtitel ») est signalée, pas ignorée. */
function checkUnknownKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  where: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) {
      errors.push(`${where} : clé "${key}" inconnue ; clés permises : ${expected.join(', ')}.`);
    }
  }
}

/** Début d'un message sur un champ : « clé "skill" absente » ou « skill "" invalide ». */
function fieldError(field: string, value: unknown): string {
  // JSON.parse ne produit jamais undefined : undefined veut dire clé absente.
  return value === undefined ? `clé "${field}" absente` : `${field} ${describeValue(value)} invalide`;
}

/** Valeur fautive telle qu'écrite en JSON (une chaîne garde ses guillemets), abrégée. */
function describeValue(value: unknown): string {
  return truncate(JSON.stringify(value), VALUE_LENGTH);
}

/** « sheets_001.json, fiche 2 « bo-passe-remise-controle-scan » » : le libellé, suivi du nom abrégé s'il y en a un. */
function locate(label: string, name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    return label;
  }
  return `${label} « ${truncate(name.trim().replace(/\s+/g, ' '), EXCERPT_LENGTH)} »`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Array.isArray sans le any[] qu'il infère : les éléments restent à vérifier. */
function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

// SQL : même mise en page que supabase/seed_questions_001.sql.

/** SQL du seed ; mêmes JSON, même texte à l'octet près (aucune date). */
function buildSql(sheets: readonly SeedSheet[], measures: readonly SeedMeasure[]): string {
  const counts = countByKind(sheets);
  const sheetTotal = formatCount(sheets.length, 'fiche', 'fiches');
  const readingTotal = formatCount(counts.training, 'fiche', 'fiches');
  const testTotal = formatCount(counts.test, 'test', 'tests');
  const measureTotal = formatCount(measures.length, 'mesure', 'mesures');
  const lines = [
    '-- =============================================================================',
    `-- ${OUTPUT_FILE} : ${sheetTotal} de l'onglet Entraînement (${readingTotal} de`,
    `-- lecture, ${testTotal}) et le catalogue de leurs ${measureTotal}, depuis`,
    `-- ${CONTENT_FILES.map((name) => `${CONTENT_DIR}/${name}`).join(' et ')}.`,
    '--',
    `-- Fichier généré par ${SCRIPT_PATH} : ne pas modifier à la`,
    `-- main, modifier les JSON puis relancer npx tsx ${SCRIPT_PATH}.`,
    '--',
    '-- À exécuter dans le SQL Editor APRÈS',
    `-- ${MIGRATION_PATH}.`,
    '--',
    '-- 1. Récupère ton UUID : Dashboard Supabase → Authentication → Users →',
    '--    clique sur ton utilisateur → copie « User UID ».',
    '-- 2. Colle tout le fichier dans le SQL Editor, puis remplace par cet UUID le',
    '--    marqueur entre chevrons de la ligne uid uuid := … (une seule occurrence).',
    '--    Fais-le dans le SQL Editor, pas dans ce fichier, qui est régénéré.',
    '-- 3. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),',
    "--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.",
    '--',
    '-- Idempotent : upsert sur (user_id, key) pour les mesures et sur',
    '-- (user_id, slug) pour les fiches. Une ligne absente est insérée ; une ligne qui',
    '-- diffère du JSON est mise à jour sur place (même id : séances et résultats',
    "-- liés conservés) ; une ligne identique n'est pas touchée. Une seconde",
    '-- exécution ne change rien.',
    '-- Les schémas (champ diagram) sont des fichiers du bucket Storage diagrams,',
    '-- déposés à la main : ce fichier ne les crée pas.',
    '--',
    "-- Le trigger set_user_id impose user_id := auth.uid(). Le SQL Editor n'a pas de",
    "-- JWT (auth.uid() est null) : le bloc simule celui de l'utilisateur, le temps",
    "-- de la transaction uniquement. Les inserts n'envoient donc jamais user_id.",
    '-- =============================================================================',
    '',
    'do $$',
    'declare',
    `  uid uuid := '${UUID_MARKER}';`,
    '  existing_count integer;',
    '  changed_count integer;',
    'begin',
    '  if not exists (select 1 from auth.users where id = uid) then',
    "    raise exception 'Aucun utilisateur % dans auth.users : vérifie l’UUID copié.', uid;",
    '  end if;',
    '',
    '  perform set_config(',
    "    'request.jwt.claims',",
    "    json_build_object('sub', uid, 'role', 'authenticated')::text,",
    '    true',
    '  );',
    '  if auth.uid() is distinct from uid then',
    "    raise exception 'Simulation du JWT inopérante : auth.uid() = %, attendu %.', auth.uid(), uid;",
    '  end if;',
    '',
    '  -- ---------------------------------------------------------------------------',
    '  -- Catalogue des mesures (clé : key) ; protocol = titre du test — titre du bloc',
    '  -- ---------------------------------------------------------------------------',
    ...existingCountLines('tests', 't', 'key', measures.map((measure) => measure.key)),
    '',
    '  insert into public.tests (key, name, unit, higher_is_better, protocol)',
    '  select v.key, v.name, v.unit, v.higher_is_better, v.protocol',
    '  from (values',
    ...joinWithCommas(measures.map((measure) => [measureLine(measure)])),
    '  ) as v(key, name, unit, higher_is_better, protocol)',
    '  on conflict (user_id, key) where key is not null do update',
    '  set name = excluded.name,',
    '      unit = excluded.unit,',
    '      higher_is_better = excluded.higher_is_better,',
    '      protocol = excluded.protocol',
    '  where (tests.name, tests.unit, tests.higher_is_better, tests.protocol)',
    '    is distinct from (excluded.name, excluded.unit, excluded.higher_is_better, excluded.protocol);',
    '',
    '  -- Lignes insérées ou mises à jour ; une ligne identique au JSON ne compte pas.',
    '  get diagnostics changed_count = row_count;',
    ...upsertNoticeLines('Mesures', measures.length),
    '',
    '  -- ---------------------------------------------------------------------------',
    '  -- Fiches et tests (clé : slug) ; exercises = tableau complet du JSON',
    '  -- ---------------------------------------------------------------------------',
    ...existingCountLines('training_sheets', 's', 'slug', sheets.map((sheet) => sheet.slug)),
    '',
    '  insert into public.training_sheets',
    '    (slug, kind, title, subtitle, positions, skill, duration_min, intro, exercises, is_public)',
    '  select v.slug, v.kind, v.title, v.subtitle, v.positions, v.skill, v.duration_min, v.intro, v.exercises, false',
    '  from (values',
    ...joinWithCommas(sheets.map(sheetLines)),
    '  ) as v(slug, kind, title, subtitle, positions, skill, duration_min, intro, exercises)',
    '  on conflict (user_id, slug) where slug is not null do update',
    '  set kind = excluded.kind,',
    '      title = excluded.title,',
    '      subtitle = excluded.subtitle,',
    '      positions = excluded.positions,',
    '      skill = excluded.skill,',
    '      duration_min = excluded.duration_min,',
    '      intro = excluded.intro,',
    '      exercises = excluded.exercises',
    '  where (training_sheets.kind, training_sheets.title, training_sheets.subtitle, training_sheets.positions,',
    '         training_sheets.skill, training_sheets.duration_min, training_sheets.intro, training_sheets.exercises)',
    '    is distinct from (excluded.kind, excluded.title, excluded.subtitle, excluded.positions,',
    '                      excluded.skill, excluded.duration_min, excluded.intro, excluded.exercises);',
    '',
    '  get diagnostics changed_count = row_count;',
    ...upsertNoticeLines('Fiches', sheets.length),
    'end',
    '$$;',
    '',
    '-- Contrôle (tous utilisateurs confondus). Attendu après seed.sql, 004 et une',
    `-- première exécution, inchangé après une seconde : training_sheets ${DEMO_SHEET_COUNT + sheets.length} (${DEMO_SHEET_COUNT} de`,
    `-- démonstration + ${sheets.length}), tests ${DEMO_TEST_COUNT + measures.length} (${DEMO_TEST_COUNT} de démonstration + ${measures.length}).`,
    "select 'training_sheets' as table_name, count(*) as nb_lignes from public.training_sheets",
    "union all select 'tests', count(*) from public.tests;",
  ];
  return `${lines.join('\n')}\n`;
}

/** select count(*) des lignes de l'utilisateur déjà présentes : une valeur de la liste in (…) par ligne. */
function existingCountLines(table: string, alias: string, column: string, values: readonly string[]): string[] {
  return [
    '  select count(*) into existing_count',
    `  from public.${table} ${alias}`,
    `  where ${alias}.user_id = uid`,
    `    and ${alias}.${column} in (`,
    ...joinWithCommas(values.map((value) => [`      ${sqlString(value)}`])),
    '    );',
  ];
}

/**
 * Bilan d'un upsert de `total` lignes : insérées = total − déjà présentes,
 * mises à jour = lignes changées − insérées, inchangées = présentes − mises à jour.
 */
function upsertNoticeLines(label: string, total: number): string[] {
  return [
    `  raise notice '${label} pour % : sur ${total}, insérées : %, mises à jour : %, inchangées : %.',`,
    '    uid,',
    `    ${total} - existing_count,`,
    `    changed_count - (${total} - existing_count),`,
    `    existing_count - (changed_count - (${total} - existing_count));`,
  ];
}

/** Une ligne du values (…) du catalogue : key, name, unit, higher_is_better, protocol. */
function measureLine(measure: SeedMeasure): string {
  const values = [
    sqlString(measure.key),
    sqlString(measure.name),
    sqlString(measure.unit),
    String(measure.higher_is_better),
    sqlString(measure.protocol),
  ];
  return `    (${values.join(', ')})`;
}

/** Une ligne du values (…) des fiches : intro et exercises tels que lus dans le JSON. */
function sheetLines(sheet: SeedSheet): string[] {
  const fields = [
    [sqlString(sheet.slug)],
    [sqlString(sheet.kind)],
    [sqlString(sheet.title)],
    [sqlString(sheet.subtitle)],
    [`array[${sheet.positions.map(sqlString).join(', ')}]`],
    [sqlString(sheet.skill)],
    [String(sheet.durationMin)],
    jsonbLines(sheet.introJson),
    jsonbLines(sheet.exercisesJson),
  ];
  return ['    (', ...joinWithCommas(fields).map((line) => `${FIELD_INDENT}${line}`), '    )'];
}

/**
 * Littéral jsonb sur plusieurs lignes : JSON.stringify indenté de 2, apostrophes
 * doublées. Les sauts de ligne tombent entre les jetons JSON, jamais dans une
 * chaîne (JSON.stringify les y échapperait, et les caractères de contrôle sont
 * refusés à la validation).
 */
function jsonbLines(value: unknown): string[] {
  const lines = sqlString(JSON.stringify(value, null, 2)).split('\n');
  return [...lines.slice(0, -1), `${lines[lines.length - 1]}::jsonb`];
}

/** Blocs de lignes mis bout à bout, une virgule à la fin de chacun sauf du dernier. */
function joinWithCommas(blocks: readonly string[][]): string[] {
  return blocks.flatMap((block, index) =>
    index === blocks.length - 1 ? block : [...block.slice(0, -1), `${block[block.length - 1]},`],
  );
}

/** Littéral SQL : apostrophes doublées ; standard_conforming_strings est actif, l'antislash reste tel quel. */
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Nombre de fiches par kind (fiches de lecture, tests). */
function countByKind(sheets: readonly SeedSheet[]): Record<SheetKind, number> {
  const counts: Record<SheetKind, number> = { training: 0, test: 0 };
  for (const sheet of sheets) {
    counts[sheet.kind] += 1;
  }
  return counts;
}

/** Contenu actuel d'un fichier, null s'il n'existe pas encore. */
function readIfExists(filePath: string): string | null {
  return statSync(filePath, { throwIfNoEntry: false }) ? readFileSync(filePath, 'utf8') : null;
}

/** Au plus `max` caractères, « … » si coupé (Array.from : sans couper un caractère en deux). */
function truncate(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}

/** « 1 erreur », « 3 erreurs » : 0 et 1 au singulier. */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** Erreur affichée ; le script finira en code 1. */
function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

main();
