// Génère supabase/seed_sheets_001.sql depuis le contenu versionné de
// supabase/content, édité à la main, seule source de vérité :
// - sheets_NNN.json : fiches de lecture (kind training) ;
// - tests_atomic_NNN.json : tests atomiques (kind test, un exercice et ses
//   mesures, une famille) ;
// - sessions_NNN.json : sessions prédéfinies, suites ordonnées de tests.
// Le script ne réécrit aucun JSON : un test ajouté à la main reste.
// tests_001.json, l'ancienne source des tests (5 batteries, découpées en 18 tests
// atomiques au chantier 10), est archivé dans supabase/content/archive et ne se
// lit plus.
//
// Usage, depuis la racine du projet (chemins relatifs au répertoire courant) :
//   npx tsx scripts/build-seed-sheets.ts
//     sans argument : lit les sheets_NNN.json, puis les tests_atomic_NNN.json,
//     puis les sessions_NNN.json, chaque sorte par numéro croissant (NNN : 3
//     chiffres ; plusieurs fichiers par sorte : tests_atomic_002.json…). C'est
//     l'ordre des lignes dans le SQL.
//
// Sortie : seed_sheets_001.sql, en trois parties, chacune en upsert : catalogue
// des mesures des tests (protocol « Test <Compétence> — <titre du test> »),
// fiches de lecture et tests atomiques, puis sessions (duration_min = somme des
// durées de leurs tests).
//
// Validation, avec lib/sheet-types.ts, lib/test-families.ts et la taxonomie de
// lib/quiz-taxonomy.ts. Fichiers : au moins un de chaque sorte ; un .json dont le
// nom commence par sheets_, tests_ ou sessions_ sans suivre l'un des trois
// formats est refusé (fichier mal numéroté, batteries sorties de l'archive) ;
// racine { _format facultatif, sheets | tests | sessions non vide }.
// - Fiche de lecture : clés exactement slug, kind, title, subtitle, positions,
//   skill, duration_min, intro, exercises ; kind training ; title, subtitle et
//   skill non vides ; exercises au format training (validateExercises).
// - Test atomique : clés exactement slug, kind, title, positions, skill, family,
//   duration_min, intro, exercises ; kind test ; title non vide ; skill dans
//   SKILL_KEYS ; family dans FAMILY_KEYS, de la même compétence ; exactement un
//   exercice, avec ses mesures (validateAtomicExercises).
// - Session : clés exactement slug, title, skill, blocks ; title non vide ;
//   skill dans SKILL_KEYS ; blocks conforme à validateBlocks, chaque slug celui
//   d'un test atomique.
// Pour tous : slug en kebab-case, unique sur toutes les fiches, tous les tests et
// toutes les sessions (clé d'idempotence du SQL) ; positions non vide, dans la
// liste fermée, sans doublon ; duration_min entier positif ; intro au format de
// validateIntro ; diagram_data d'un exercice, s'il y en a un, au format de
// lib/diagram-types.ts (validateDiagram, appelé par validateExercises). Aucune
// chaîne, valeur ou clé, à toute profondeur (diagram_data
// compris), ne contient de caractère de contrôle, ni « $$ », qui fermerait le
// bloc do du SQL, ni le marqueur de l'UUID.
// Sur les éléments valides : key de mesure unique sur tous les tests (clé
// d'idempotence du catalogue tests) ; chaque diagram est un fichier de
// supabase/content/diagrams, au nom exact. Un fichier de ce dossier qu'aucune
// fiche ni aucun test ne référence est signalé, sans être une erreur. Toutes les
// erreurs sont listées en une passe ; s'il y en a une, rien n'est écrit et le
// script finit en code 1.
//
// Sortie déterministe : ni date ni horodatage, fins de ligne LF, UTF-8 sans BOM,
// retour à la ligne final. Le SQL n'est réécrit que s'il change (CRLF ramenés à
// LF pour comparer) : relancé sur les mêmes JSON, le script annonce « inchangé ».
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:fs.
/// <reference types="node" />
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { isPositionKey, POSITION_KEYS, type PositionKey } from '../lib/quiz-taxonomy';
import {
  validateAtomicExercises,
  validateBlocks,
  validateExercises,
  validateIntro,
  type Exercise,
  type ExerciseFormat,
  type Measure,
} from '../lib/sheet-types';
import {
  FAMILY_KEYS,
  getFamily,
  getSkill,
  isFamilyKey,
  isSkillKey,
  SKILL_KEYS,
  type FamilyKey,
  type SkillKey,
} from '../lib/test-families';

const CONTENT_DIR = 'supabase/content';
/** Schémas des exercices : les fichiers à déposer à la main dans le bucket Storage diagrams. */
const DIAGRAMS_DIR = `${CONTENT_DIR}/diagrams`;
/** tests_001.json, ancienne source des tests : sous-dossier, jamais lu. */
const ARCHIVE_DIR = `${CONTENT_DIR}/archive`;
const OUTPUT_FILE = 'seed_sheets_001.sql';
const OUTPUT_PATH = `supabase/${OUTPUT_FILE}`;
const SCRIPT_PATH = 'scripts/build-seed-sheets.ts';
const MIGRATION_PATH = 'supabase/migrations/007_tests_atomic.sql';
/** Remplacé par l'utilisateur dans le SQL Editor : une seule occurrence, ligne uid. */
const UUID_MARKER = '<REMPLACER_PAR_MON_UUID>';
// Lignes de démonstration de supabase/seed.sql, sans slug ni key : le seed ne les
// touche pas, mais la requête de contrôle les compte (fiches kind training).
const DEMO_SHEET_COUNT = 3;
const DEMO_TEST_COUNT = 2;
/** Postes d'une session insérée : elle vaut pour tous (jamais mis à jour ensuite). */
const SESSION_POSITIONS: readonly PositionKey[] = ['tous'];

/** Sorte de fichier source : nom (préfixe puis NNN), tableau racine, nom d'un élément dans les messages. */
type SourceKind = { prefix: string; listKey: string; item: string; items: string };

const READING_SOURCE: SourceKind = { prefix: 'sheets_', listKey: 'sheets', item: 'fiche', items: 'fiches' };
const TEST_SOURCE: SourceKind = { prefix: 'tests_atomic_', listKey: 'tests', item: 'test', items: 'tests' };
const SESSION_SOURCE: SourceKind = { prefix: 'sessions_', listKey: 'sessions', item: 'session', items: 'sessions' };
const SOURCE_KINDS: readonly SourceKind[] = [READING_SOURCE, TEST_SOURCE, SESSION_SOURCE];
/** Après le préfixe : le numéro du fichier sur 3 chiffres, puis .json. */
const FILE_NUMBER = /^\d{3}\.json$/;
/**
 * Préfixes réservés aux sources : un .json qui en porte un sans suivre l'un des
 * trois formats est refusé plutôt qu'ignoré sans bruit (tests_atomic_2.json, ou
 * tests_001.json sorti de l'archive).
 */
const RESERVED_PREFIXES: readonly string[] = ['sheets_', 'tests_', 'sessions_'];

const ROOT_FORMAT_KEY = '_format';
const READING_KEYS: readonly string[] = [
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
/** Pas de subtitle (null en base) ; family en plus. */
const TEST_KEYS: readonly string[] = [
  'slug',
  'kind',
  'title',
  'positions',
  'skill',
  'family',
  'duration_min',
  'intro',
  'exercises',
];
/** Pas de duration_min : calculée, somme des durées des tests de blocks. */
const SESSION_KEYS: readonly string[] = ['slug', 'title', 'skill', 'blocks'];
/** kebab-case : « bo-tir-finition-surface ». */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Retour à la ligne, tabulation… : refusés dans toute chaîne d'un élément.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
// Longueurs citées dans les messages d'erreur : slug ou titre, valeur fautive.
const EXCERPT_LENGTH = 50;
const VALUE_LENGTH = 60;
/** Indentation des champs d'une ligne du values (…) des fiches. */
const FIELD_INDENT = '      ';

/** Fiche de lecture validée (sheets_NNN.json). */
type ReadingSheet = {
  /** « sheets_001.json, fiche 2 « bo-passe-remise-controle-scan » » : de quoi la retrouver dans le JSON. */
  where: string;
  slug: string;
  title: string;
  subtitle: string;
  positions: PositionKey[];
  skill: string;
  durationMin: number;
  /** intro telle que lue dans le JSON : le SQL l'écrit à l'identique. */
  introJson: unknown;
  /** exercises tel que lu dans le JSON : le SQL l'écrit à l'identique. */
  exercisesJson: unknown;
  /** Exercices validés : leurs schémas. */
  exercises: Exercise[];
};

/** Test atomique validé (tests_atomic_NNN.json). */
type AtomicTest = {
  /** « tests_atomic_001.json, test 3 « test-tir-3 » ». */
  where: string;
  slug: string;
  title: string;
  positions: PositionKey[];
  skill: SkillKey;
  family: FamilyKey;
  durationMin: number;
  introJson: unknown;
  /** exercises tel que lu dans le JSON, un seul exercice. */
  exercisesJson: unknown;
  /** Son exercice, validé : mesures et schéma. */
  exercise: Exercise;
};

/** Session validée (sessions_NNN.json), ses tests pas encore cherchés. */
type SessionSource = {
  /** « sessions_001.json, session 2 « test-passe » ». */
  where: string;
  slug: string;
  title: string;
  skill: SkillKey;
  /** Slugs de ses tests, dans l'ordre de passage. */
  blocks: string[];
};

/** Session dont chaque test a été trouvé. */
type SeedSession = SessionSource & {
  /** Somme des durées de ses tests. */
  durationMin: number;
};

/** Ligne de training_sheets écrite par la partie 2 du SQL : fiche de lecture ou test atomique. */
type SheetRow = {
  slug: string;
  kind: ExerciseFormat;
  title: string;
  /** null pour un test atomique. */
  subtitle: string | null;
  positions: readonly PositionKey[];
  skill: string;
  /** null pour une fiche de lecture. */
  family: FamilyKey | null;
  durationMin: number;
  introJson: unknown;
  exercisesJson: unknown;
};

/** Ligne du catalogue tests : une mesure et son protocole « Test <Compétence> — <titre du test> ». */
type SeedMeasure = Measure & { protocol: string };

/** Fichier source lu : ses éléments valides, dans l'ordre du JSON, et les slugs qu'il écrit, éléments invalides compris. */
type SourceFile<T> = { name: string; items: T[]; writtenSlugs: string[] };

/** Exercice validé et l'endroit de sa fiche ou de son test, pour les contrôles croisés. */
type PlacedExercise = { where: string; exercise: Exercise };

/** Schémas référencés par les fiches et les tests et présents ; fichiers du dossier que rien ne référence. */
type DiagramCheck = { found: Set<string>; unreferenced: string[] };

function main(): void {
  if (!statSync(CONTENT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`Dossier ${CONTENT_DIR} introuvable dans ${process.cwd()}. Lance le script depuis la racine du projet.`);
    return;
  }
  const errors: string[] = [];
  const names = listJsonFiles(CONTENT_DIR);
  checkReservedNames(names, errors);
  // Slug → endroit de la première fiche, du premier test ou de la première session qui l'emploie.
  const slugs = new Map<string, string>();
  const readingFiles = readSources(READING_SOURCE, names, errors, (item, where) =>
    validateReading(item, where, slugs, errors),
  );
  const testFiles = readSources(TEST_SOURCE, names, errors, (item, where) => validateTest(item, where, slugs, errors));
  const sessionFiles = readSources(SESSION_SOURCE, names, errors, (item, where) =>
    validateSession(item, where, slugs, errors),
  );
  const readings = readingFiles.flatMap((file) => file.items);
  const tests = testFiles.flatMap((file) => file.items);
  const writtenTestSlugs = new Set(testFiles.flatMap((file) => file.writtenSlugs));
  const sessions = resolveSessions(
    sessionFiles.flatMap((file) => file.items),
    tests,
    writtenTestSlugs,
    errors,
  );
  const measures = collectMeasures(tests, errors);
  const diagrams = checkDiagrams(
    [
      ...readings.flatMap((sheet) => sheet.exercises.map((exercise) => ({ where: sheet.where, exercise }))),
      ...tests.map((test) => ({ where: test.where, exercise: test.exercise })),
    ],
    errors,
  );
  // Au moins un fichier non vide de chaque sorte, et rien d'écrit à la moindre
  // erreur : aucune partie du SQL n'a de liste in (…) ni de values (…) vide.
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    fail(`${formatCount(errors.length, 'erreur', 'erreurs')}, aucun fichier écrit.`);
    return;
  }
  // Seulement sans erreur : un élément invalide, écarté des contrôles croisés, peut référencer le fichier.
  for (const name of diagrams.unreferenced) {
    console.warn(
      `${DIAGRAMS_DIR}/${name} : aucune fiche ni aucun test ne le référence ; inutile de le déposer dans le bucket diagrams.`,
    );
  }

  const sourceNames = [...readingFiles, ...testFiles, ...sessionFiles].map((file) => file.name);
  const sql = buildSql(readings, tests, sessions, measures, sourceNames);
  // Garde-fou : une chaîne qui contiendrait le marqueur le dupliquerait (déjà refusé par checkSqlSafety).
  if (sql.split(UUID_MARKER).length !== 2) {
    fail(`${UUID_MARKER} doit apparaître une seule fois dans le SQL, aucun fichier écrit.`);
    return;
  }
  const sqlUnchanged = writeIfChanged(OUTPUT_PATH, sql);
  printFileCounts(READING_SOURCE, readingFiles);
  printFileCounts(TEST_SOURCE, testFiles);
  printFileCounts(SESSION_SOURCE, sessionFiles);
  const total = formatCount(readings.length + tests.length + sessions.length, 'fiche', 'fiches');
  const parts = [
    `${readings.length} training`,
    formatCount(tests.length, 'test atomique', 'tests atomiques'),
    formatCount(sessions.length, 'session', 'sessions'),
  ].join(', ');
  const measureTotal = formatCount(measures.length, 'mesure', 'mesures');
  const found = formatCount(diagrams.found.size, 'schéma trouvé', 'schémas trouvés');
  console.log(`${total} (${parts}), ${measureTotal}, ${found} → ${OUTPUT_PATH} (${writeState(sqlUnchanged)})`);
}

// Fichiers sources.

/** Noms des .json du dossier, triés (donc par numéro dans chaque sorte) ; ses sous-dossiers, dont l'archive, ne sont pas lus. */
function listJsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(
      (name) => name.endsWith('.json') && (statSync(`${dir}/${name}`, { throwIfNoEntry: false })?.isFile() ?? false),
    )
    .sort();
}

/** La sorte d'un fichier source (« tests_atomic_002.json »), undefined pour tout autre nom. */
function sourceKindOf(name: string): SourceKind | undefined {
  return SOURCE_KINDS.find((kind) => name.startsWith(kind.prefix) && FILE_NUMBER.test(name.slice(kind.prefix.length)));
}

/** Un .json au préfixe réservé qui ne suit aucun des trois formats : erreur, pour qu'il ne soit pas ignoré sans bruit. */
function checkReservedNames(names: readonly string[], errors: string[]): void {
  const formats = SOURCE_KINDS.map((kind) => `${kind.prefix}NNN.json`).join(', ');
  for (const name of names) {
    if (RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix)) && sourceKindOf(name) === undefined) {
      errors.push(
        `${CONTENT_DIR}/${name} : nom non reconnu ; les sources sont ${formats} (NNN : 3 chiffres). Les batteries de tests_001.json sont archivées dans ${ARCHIVE_DIR}, à ne plus éditer.`,
      );
    }
  }
}

/**
 * Fichiers d'une sorte, par numéro croissant : les éléments que `validate`
 * accepte et les slugs écrits. Aucun fichier de la sorte : erreur.
 */
function readSources<T>(
  kind: SourceKind,
  names: readonly string[],
  errors: string[],
  validate: (item: unknown, where: string) => T | null,
): SourceFile<T>[] {
  const files = names.filter((name) => sourceKindOf(name) === kind);
  if (files.length === 0) {
    errors.push(`${CONTENT_DIR} : aucun fichier ${kind.prefix}NNN.json ; il en faut au moins un (${kind.items}).`);
  }
  return files.map((fileName) => {
    const items = readRootList(kind, fileName, errors);
    const valid: T[] = [];
    const writtenSlugs: string[] = [];
    for (const [index, item] of (items ?? []).entries()) {
      if (isRecord(item) && typeof item.slug === 'string') {
        writtenSlugs.push(item.slug);
      }
      const value = validate(item, locate(`${fileName}, ${kind.item} ${index + 1}`, itemName(item)));
      if (value !== null) {
        valid.push(value);
      }
    }
    return { name: fileName, items: valid, writtenSlugs };
  });
}

/** Tableau racine d'un fichier source ; null, son erreur ajoutée, s'il est illisible, absent ou vide. */
function readRootList(kind: SourceKind, fileName: string, errors: string[]): readonly unknown[] | null {
  const text = readFileSync(`${CONTENT_DIR}/${fileName}`, 'utf8');
  let root: unknown;
  try {
    // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`${fileName} : JSON illisible (${reason}).`);
    return null;
  }
  if (!isRecord(root)) {
    errors.push(`${fileName} : racine ${describeValue(root)} invalide ; attendu un objet { "${kind.listKey}": [ … ] }.`);
    return null;
  }
  const rootWhere = `${fileName}, racine`;
  checkUnknownKeys(root, [ROOT_FORMAT_KEY, kind.listKey], rootWhere, errors);
  const items = root[kind.listKey];
  if (!isArray(items) || items.length === 0) {
    errors.push(`${rootWhere} : ${fieldError(kind.listKey, items)} ; attendu un tableau non vide de ${kind.items}.`);
    return null;
  }
  return items;
}

/** Une ligne par fichier source : « tests_atomic_001.json : 18 tests ». */
function printFileCounts(kind: SourceKind, files: readonly SourceFile<unknown>[]): void {
  for (const file of files) {
    console.log(`${file.name} : ${formatCount(file.items.length, kind.item, kind.items)}`);
  }
}

/** Ce qui nomme un élément dans les messages : son slug s'il est renseigné, sinon son titre. */
function itemName(item: unknown): unknown {
  if (!isRecord(item)) {
    return undefined;
  }
  return typeof item.slug === 'string' && item.slug.trim() !== '' ? item.slug : item.title;
}

// Validation : chaque erreur s'ajoute à `errors` et la lecture continue, pour
// tout signaler en une passe. Un élément qui a une erreur, quelle qu'elle soit
// (clé inconnue comprise), vaut null : seuls les éléments sans erreur passent aux
// contrôles croisés.

/** Une fiche de lecture de sheets_NNN.json. */
function validateReading(
  item: unknown,
  where: string,
  slugs: Map<string, string>,
  errors: string[],
): ReadingSheet | null {
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${READING_KEYS.join(', ')} }.`);
    return null;
  }
  const errorCount = errors.length;
  checkUnknownKeys(item, READING_KEYS, where, errors);
  const slug = checkSlug(item.slug, where, slugs, errors);
  checkKind(item.kind, 'training', READING_SOURCE, where, errors);
  const title = checkText(item.title, 'title', where, errors);
  const subtitle = checkText(item.subtitle, 'subtitle', where, errors);
  const positions = checkPositions(item.positions, where, errors);
  const skill = checkText(item.skill, 'skill', where, errors);
  const durationMin = checkPositiveInteger(item.duration_min, 'duration_min', where, errors);
  addSheetErrors(validateIntro(item.intro).errors, where, errors);
  const exercises = validateExercises(item.exercises, 'training');
  addSheetErrors(exercises.errors, where, errors);
  checkSqlSafety(item, '', where, errors);
  if (
    errors.length > errorCount ||
    slug === null ||
    title === null ||
    subtitle === null ||
    positions === null ||
    skill === null ||
    durationMin === null
  ) {
    return null;
  }
  return {
    where,
    slug,
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

/** Un test atomique de tests_atomic_NNN.json. */
function validateTest(item: unknown, where: string, slugs: Map<string, string>, errors: string[]): AtomicTest | null {
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${TEST_KEYS.join(', ')} }.`);
    return null;
  }
  const errorCount = errors.length;
  checkUnknownKeys(item, TEST_KEYS, where, errors);
  const slug = checkSlug(item.slug, where, slugs, errors);
  checkKind(item.kind, 'test', TEST_SOURCE, where, errors);
  const title = checkText(item.title, 'title', where, errors);
  const positions = checkPositions(item.positions, where, errors);
  const skill = checkSkill(item.skill, where, errors);
  const family = checkFamily(item.family, skill, where, errors);
  const durationMin = checkPositiveInteger(item.duration_min, 'duration_min', where, errors);
  addSheetErrors(validateIntro(item.intro).errors, where, errors);
  // Exactement un exercice, au format test : mesures obligatoires.
  const exercises = validateAtomicExercises(item.exercises);
  addSheetErrors(exercises.errors, where, errors);
  checkSqlSafety(item, '', where, errors);
  const exercise = exercises.value.at(0);
  if (
    errors.length > errorCount ||
    slug === null ||
    title === null ||
    positions === null ||
    skill === null ||
    family === null ||
    durationMin === null ||
    exercise === undefined
  ) {
    return null;
  }
  return {
    where,
    slug,
    title,
    positions,
    skill,
    family,
    durationMin,
    introJson: item.intro,
    exercisesJson: item.exercises,
    exercise,
  };
}

/** Une session de sessions_NNN.json ; ses tests sont cherchés ensuite (resolveSessions). */
function validateSession(
  item: unknown,
  where: string,
  slugs: Map<string, string>,
  errors: string[],
): SessionSource | null {
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${SESSION_KEYS.join(', ')} }.`);
    return null;
  }
  const errorCount = errors.length;
  checkUnknownKeys(item, SESSION_KEYS, where, errors);
  const slug = checkSlug(item.slug, where, slugs, errors);
  const title = checkText(item.title, 'title', where, errors);
  const skill = checkSkill(item.skill, where, errors);
  const blocks = validateBlocks(item.blocks);
  addSheetErrors(blocks.errors, where, errors);
  checkSqlSafety(item, '', where, errors);
  if (errors.length > errorCount || slug === null || title === null || skill === null) {
    return null;
  }
  return { where, slug, title, skill, blocks: blocks.value };
}

/** Slug kebab-case, pas encore employé par une autre fiche, un autre test ou une autre session ; null sinon. */
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
      `${where} : slug "${value}" déjà employé (${first}) ; un slug est unique sur toutes les fiches, tous les tests et toutes les sessions (clé d'idempotence du SQL).`,
    );
    return null;
  }
  slugs.set(value, where);
  return value;
}

/** Le kind de la sorte du fichier : training dans sheets_NNN.json, test dans tests_atomic_NNN.json. */
function checkKind(
  value: unknown,
  expected: ExerciseFormat,
  source: SourceKind,
  where: string,
  errors: string[],
): void {
  if (value !== expected) {
    errors.push(
      `${where} : ${fieldError('kind', value)} ; ${source.prefix}NNN.json ne contient que des ${source.items} kind ${expected}.`,
    );
  }
}

/** Compétence de lib/test-families.ts ; null sinon. */
function checkSkill(value: unknown, where: string, errors: string[]): SkillKey | null {
  if (typeof value === 'string' && isSkillKey(value)) {
    return value;
  }
  errors.push(
    `${where} : ${fieldError('skill', value)} ; valeurs permises : ${SKILL_KEYS.join(', ')} (lib/test-families.ts).`,
  );
  return null;
}

/**
 * Famille de lib/test-families.ts, sous-type de la compétence du test ; null
 * sinon. Compétence invalide (null, déjà signalée) : la famille n'est pas
 * comparée.
 */
function checkFamily(value: unknown, skill: SkillKey | null, where: string, errors: string[]): FamilyKey | null {
  if (typeof value !== 'string' || !isFamilyKey(value)) {
    errors.push(
      `${where} : ${fieldError('family', value)} ; valeurs permises : ${FAMILY_KEYS.join(', ')} (lib/test-families.ts).`,
    );
    return null;
  }
  const familySkill = getFamily(value).skill;
  if (skill !== null && familySkill !== skill) {
    errors.push(
      `${where} : famille "${value}" de la compétence ${familySkill}, pas ${skill} ; une famille est un sous-type de la compétence du test.`,
    );
    return null;
  }
  return value;
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

/** Erreurs de lib/sheet-types.ts (« intro : … », « exercice 1 « … » : … », « blocks, test 2 : … »), précédées de l'endroit de l'élément. */
function addSheetErrors(messages: readonly string[], where: string, errors: string[]): void {
  for (const message of messages) {
    errors.push(`${where}, ${message}`);
  }
}

/**
 * Chaque chaîne de l'élément, à toute profondeur, valeurs et clés (celles de
 * diagram_data sont libres) : ni caractère de contrôle, ni « $$ », qui fermerait
 * le bloc do $$ du SQL, ni le marqueur de l'UUID. L'erreur donne le chemin JSON
 * de la valeur (« exercises[0].instructions[2] »).
 */
function checkSqlSafety(value: unknown, jsonPath: string, where: string, errors: string[]): void {
  if (typeof value === 'string') {
    checkSqlText(value, jsonPath, where, errors);
  } else if (isArray(value)) {
    for (const [index, item] of value.entries()) {
      checkSqlSafety(item, `${jsonPath}[${index}]`, where, errors);
    }
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const path = jsonPath === '' ? key : `${jsonPath}.${key}`;
      checkSqlText(key, `${path} (nom de la clé)`, where, errors);
      checkSqlSafety(item, path, where, errors);
    }
  }
}

/** Une chaîne de l'élément, valeur ou clé : les trois interdits de checkSqlSafety. */
function checkSqlText(text: string, jsonPath: string, where: string, errors: string[]): void {
  const control = CONTROL_CHARACTER.exec(text);
  if (control) {
    const code = control[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    errors.push(
      `${where} : ${jsonPath} contient le caractère de contrôle U+${code} ; un texte tient sur une ligne, sans tabulation.`,
    );
  }
  if (text.includes('$$')) {
    errors.push(`${where} : ${jsonPath} contient "$$", qui fermerait le bloc do $$ … $$ du SQL.`);
  }
  if (text.includes(UUID_MARKER)) {
    errors.push(`${where} : ${jsonPath} contient le marqueur ${UUID_MARKER}, réservé à la ligne uid du SQL.`);
  }
}

// Contrôles croisés, sur les éléments valides.

/**
 * Sessions dont chaque slug de blocks est celui d'un test atomique valide, avec
 * leur durée, somme de celles de leurs tests. Un slug écrit par un test invalide
 * n'est pas signalé une seconde fois : l'erreur du test suffit.
 */
function resolveSessions(
  sessions: readonly SessionSource[],
  tests: readonly AtomicTest[],
  writtenTestSlugs: ReadonlySet<string>,
  errors: string[],
): SeedSession[] {
  const testsBySlug = new Map(tests.map((test) => [test.slug, test]));
  const resolved: SeedSession[] = [];
  for (const session of sessions) {
    let durationMin = 0;
    let complete = true;
    for (const slug of session.blocks) {
      const test = testsBySlug.get(slug);
      if (test !== undefined) {
        durationMin += test.durationMin;
        continue;
      }
      complete = false;
      if (!writtenTestSlugs.has(slug)) {
        errors.push(
          `${session.where} : blocks cite "${slug}", qui n'est le slug d'aucun test de ${TEST_SOURCE.prefix}NNN.json.`,
        );
      }
    }
    if (complete) {
      resolved.push({ ...session, durationMin });
    }
  }
  return resolved;
}

/**
 * Mesures des tests valides, test → mesure, dans l'ordre des fichiers, chacune
 * avec son protocole « Test <Compétence> — <titre du test> » : une batterie
 * s'appelait « Test <Compétence> » et chacun de ses tests porte le titre de son
 * bloc, si bien que les mesures d'avant le découpage gardent leur protocol
 * (« titre de la batterie — titre du bloc »). validateExercises n'assure
 * l'unicité de key que dans un test : ici, sur tous.
 */
function collectMeasures(tests: readonly AtomicTest[], errors: string[]): SeedMeasure[] {
  const measures: SeedMeasure[] = [];
  // key → endroit de la première mesure qui l'emploie, tous tests confondus.
  const keys = new Map<string, string>();
  for (const test of tests) {
    const protocol = `Test ${getSkill(test.skill).label} — ${test.title}`;
    for (const [index, measure] of test.exercise.measures.entries()) {
      const where = `${exerciseWhere(test.where, test.exercise)}, mesure ${index + 1}`;
      const first = keys.get(measure.key);
      if (first !== undefined) {
        errors.push(
          `${where} : key "${measure.key}" déjà employée (${first}) ; une key est unique sur tous les tests (clé d'idempotence du catalogue tests).`,
        );
        continue;
      }
      keys.set(measure.key, where);
      measures.push({ ...measure, protocol });
    }
  }
  return measures;
}

/**
 * Schémas des exercices valides : chaque diagram non nul est un fichier de
 * supabase/content/diagrams, au nom exact (le bucket Storage distingue la casse,
 * Windows non). Retourne les fichiers référencés et présents, et ceux du dossier
 * que rien ne référence.
 */
function checkDiagrams(exercises: readonly PlacedExercise[], errors: string[]): DiagramCheck {
  const files = listDiagramFiles();
  const found = new Set<string>();
  for (const { where, exercise } of exercises) {
    if (exercise.diagram === null) {
      continue;
    }
    if (files.includes(exercise.diagram)) {
      found.add(exercise.diagram);
    } else {
      errors.push(
        `${exerciseWhere(where, exercise)} : diagram "${exercise.diagram}" introuvable dans ${DIAGRAMS_DIR} (nom exact, casse comprise) ; c'est ce fichier qui est déposé dans le bucket diagrams.`,
      );
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

/** « tests_atomic_001.json, test 3 « test-tir-3 », exercice 1 « Enchaînement sous chrono » », comme lib/sheet-types.ts. */
function exerciseWhere(where: string, exercise: Exercise): string {
  return `${where}, ${locate(`exercice ${exercise.order}`, exercise.title)}`;
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

/** SQL du seed ; mêmes JSON, même texte à l'octet près (aucune date). `sourceNames` : fichiers lus, dans l'ordre. */
function buildSql(
  readings: readonly ReadingSheet[],
  tests: readonly AtomicTest[],
  sessions: readonly SeedSession[],
  measures: readonly SeedMeasure[],
  sourceNames: readonly string[],
): string {
  const rows: SheetRow[] = [...readings.map(readingRow), ...tests.map(atomicTestRow)];
  const sheetTotal = formatCount(readings.length + tests.length + sessions.length, 'fiche', 'fiches');
  const readingTotal = formatCount(readings.length, 'fiche', 'fiches');
  const testTotal = formatCount(tests.length, 'test atomique', 'tests atomiques');
  const sessionTotal = formatCount(sessions.length, 'session', 'sessions');
  const measureTotal = formatCount(measures.length, 'mesure', 'mesures');
  const lines = [
    '-- =============================================================================',
    `-- ${OUTPUT_FILE} : ${sheetTotal} de l'onglet Tests (${readingTotal} de lecture,`,
    `-- ${testTotal}, ${sessionTotal}) et le catalogue de leurs ${measureTotal},`,
    `-- depuis les JSON sources de ${CONTENT_DIR}, édités à la main :`,
    ...sourceNames.map((name) => `--   ${name}`),
    '--',
    `-- Fichier généré par ${SCRIPT_PATH} : ne pas modifier à la`,
    '-- main, modifier les JSON sources (ou en ajouter un, numéroté) puis',
    `-- relancer npx tsx ${SCRIPT_PATH}.`,
    '--',
    '-- À exécuter dans le SQL Editor APRÈS',
    `-- ${MIGRATION_PATH} : 007 d'abord, puis ce fichier.`,
    '--',
    '-- 1. Récupère ton UUID : Dashboard Supabase → Authentication → Users →',
    '--    clique sur ton utilisateur → copie « User UID ».',
    '-- 2. Colle tout le fichier dans le SQL Editor, puis remplace par cet UUID le',
    '--    marqueur entre chevrons de la ligne uid uuid := … (une seule occurrence).',
    '--    Fais-le dans le SQL Editor, pas dans ce fichier, qui est régénéré.',
    '-- 3. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),',
    "--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.",
    '--',
    '-- Trois parties, chacune en upsert idempotent : une ligne absente est insérée ;',
    '-- une ligne qui diffère est mise à jour sur place (même id : séances et',
    "-- résultats liés conservés) ; une ligne identique n'est pas touchée.",
    '-- 1. Catalogue des mesures, sur (user_id, key) ; protocol = « Test',
    "--    <Compétence> — <titre du test> », soit pour les mesures d'avant le",
    "--    découpage la même valeur qu'alors (« titre de la batterie — titre du",
    "--    bloc ») : une ré-exécution n'en change aucune.",
    '-- 2. Fiches de lecture et tests atomiques, sur (user_id, slug), chaque test',
    '--    avec sa famille ; subtitle et blocks null pour un test, family et blocks',
    '--    null pour une fiche.',
    "-- 3. Sessions, sur (user_id, slug) ; la ligne d'une batterie d'avant 007, de",
    '--    même slug, devient la session (même id). Seuls kind, title, skill,',
    '--    family, duration_min (somme des durées de ses tests) et blocks sont mis',
    '--    à jour, jamais exercises, intro, subtitle ni positions : les anciens',
    "--    blocs d'une batterie restent stockés, sans être lus.",
    '-- Une seconde exécution ne change rien. Aucune ligne supprimée (un élément',
    "-- retiré des JSON reste en base) ; test_results n'est pas touchée (comptée",
    '-- avant et après, en fin de bloc).',
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
    '  results_before integer;',
    '  results_after integer;',
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
    "  -- Résultats de l'utilisateur : le seed n'y touche pas (recomptés en fin de bloc).",
    '  select count(*) into results_before from public.test_results r where r.user_id = uid;',
    '',
    '  -- ---------------------------------------------------------------------------',
    '  -- 1. Catalogue des mesures (clé : key) ; protocol = Test <Compétence> —',
    "  --    <titre du test>, même valeur qu'avant le découpage en tests atomiques",
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
    '  -- 2. Fiches de lecture et tests atomiques (clé : slug) ; exercises = tableau',
    '  --    complet du JSON, un seul bloc pour un test ; blocks toujours null',
    '  -- ---------------------------------------------------------------------------',
    ...existingCountLines('training_sheets', 's', 'slug', rows.map((row) => row.slug)),
    '',
    '  insert into public.training_sheets',
    '    (slug, kind, title, subtitle, positions, skill, family, duration_min, intro, exercises, blocks, is_public)',
    '  select v.slug, v.kind, v.title, v.subtitle, v.positions, v.skill, v.family, v.duration_min, v.intro,',
    '         v.exercises, v.blocks, false',
    '  from (values',
    ...joinWithCommas(rows.map(sheetLines)),
    '  ) as v(slug, kind, title, subtitle, positions, skill, family, duration_min, intro, exercises, blocks)',
    '  on conflict (user_id, slug) where slug is not null do update',
    '  set kind = excluded.kind,',
    '      title = excluded.title,',
    '      subtitle = excluded.subtitle,',
    '      positions = excluded.positions,',
    '      skill = excluded.skill,',
    '      family = excluded.family,',
    '      duration_min = excluded.duration_min,',
    '      intro = excluded.intro,',
    '      exercises = excluded.exercises,',
    '      blocks = excluded.blocks',
    '  where (training_sheets.kind, training_sheets.title, training_sheets.subtitle, training_sheets.positions,',
    '         training_sheets.skill, training_sheets.family, training_sheets.duration_min, training_sheets.intro,',
    '         training_sheets.exercises, training_sheets.blocks)',
    '    is distinct from (excluded.kind, excluded.title, excluded.subtitle, excluded.positions,',
    '                      excluded.skill, excluded.family, excluded.duration_min, excluded.intro,',
    '                      excluded.exercises, excluded.blocks);',
    '',
    '  get diagnostics changed_count = row_count;',
    ...upsertNoticeLines('Fiches et tests atomiques', rows.length),
    '',
    '  -- ---------------------------------------------------------------------------',
    '  -- 3. Sessions (clé : slug) ; blocks = slugs de leurs tests, duration_min =',
    '  --    somme de leurs durées. Mise à jour limitée à kind, title, skill, family,',
    '  --    duration_min et blocks : exercises, intro, subtitle et positions de la',
    '  --    batterie déjà en base sont gardés tels quels.',
    '  -- ---------------------------------------------------------------------------',
    ...existingCountLines('training_sheets', 's', 'slug', sessions.map((session) => session.slug)),
    '',
    '  insert into public.training_sheets',
    '    (slug, kind, title, positions, skill, family, duration_min, blocks, is_public)',
    `  select v.slug, 'session', v.title, ${textArray(SESSION_POSITIONS)}, v.skill, null::text, v.duration_min, v.blocks, false`,
    '  from (values',
    ...joinWithCommas(sessions.map((session) => [sessionLine(session)])),
    '  ) as v(slug, title, skill, duration_min, blocks)',
    '  on conflict (user_id, slug) where slug is not null do update',
    '  set kind = excluded.kind,',
    '      title = excluded.title,',
    '      skill = excluded.skill,',
    '      family = excluded.family,',
    '      duration_min = excluded.duration_min,',
    '      blocks = excluded.blocks',
    '  where (training_sheets.kind, training_sheets.title, training_sheets.skill, training_sheets.family,',
    '         training_sheets.duration_min, training_sheets.blocks)',
    '    is distinct from (excluded.kind, excluded.title, excluded.skill, excluded.family,',
    '                      excluded.duration_min, excluded.blocks);',
    '',
    '  get diagnostics changed_count = row_count;',
    ...upsertNoticeLines('Sessions', sessions.length),
    '',
    '  select count(*) into results_after from public.test_results r where r.user_id = uid;',
    '  if results_after <> results_before then',
    "    raise exception 'Résultats de tests pour % : % avant, % après ; rien n’est appliqué.',",
    '      uid, results_before, results_after;',
    '  end if;',
    "  raise notice 'Résultats de tests pour % : %, inchangés.', uid, results_after;",
    'end',
    '$$;',
    '',
    '-- Contrôle (tous utilisateurs confondus). Attendu après seed.sql, 007 et une',
    '-- première exécution, inchangé après une seconde :',
    `--   training_sheets · training ${DEMO_SHEET_COUNT + readings.length} (${DEMO_SHEET_COUNT} de démonstration + ${readings.length}),`,
    `--   training_sheets · test ${tests.length}, training_sheets · session ${sessions.length},`,
    `--   tests ${DEMO_TEST_COUNT + measures.length} (${DEMO_TEST_COUNT} de démonstration + ${measures.length}),`,
    "--   test_results : le nombre relevé avant l'exécution (même requête, lancée",
    "--   seule) ; le seed n'y touche pas.",
    "select 'training_sheets · ' || s.kind as controle, count(*) as nb_lignes",
    'from public.training_sheets s',
    'group by s.kind',
    "union all select 'tests', count(*) from public.tests",
    "union all select 'test_results', count(*) from public.test_results",
    'order by controle;',
  ];
  return `${lines.join('\n')}\n`;
}

/** Fiche de lecture : ni famille ni blocks. */
function readingRow(sheet: ReadingSheet): SheetRow {
  return {
    slug: sheet.slug,
    kind: 'training',
    title: sheet.title,
    subtitle: sheet.subtitle,
    positions: sheet.positions,
    skill: sheet.skill,
    family: null,
    durationMin: sheet.durationMin,
    introJson: sheet.introJson,
    exercisesJson: sheet.exercisesJson,
  };
}

/** Test atomique : ni sous-titre ni blocks. */
function atomicTestRow(test: AtomicTest): SheetRow {
  return {
    slug: test.slug,
    kind: 'test',
    title: test.title,
    subtitle: null,
    positions: test.positions,
    skill: test.skill,
    family: test.family,
    durationMin: test.durationMin,
    introJson: test.introJson,
    exercisesJson: test.exercisesJson,
  };
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

/**
 * Une ligne du values (…) des fiches et tests atomiques : intro et exercises tels
 * que lus dans le JSON. blocks est null partout dans ce values : sans le cast,
 * la colonne serait typée text, que l'insert refuserait dans text[].
 */
function sheetLines(row: SheetRow): string[] {
  const fields = [
    [sqlString(row.slug)],
    [sqlString(row.kind)],
    [sqlString(row.title)],
    [sqlNullableString(row.subtitle)],
    [textArray(row.positions)],
    [sqlString(row.skill)],
    [sqlNullableString(row.family)],
    [String(row.durationMin)],
    jsonbLines(row.introJson),
    jsonbLines(row.exercisesJson),
    ['null::text[]'],
  ];
  return ['    (', ...joinWithCommas(fields).map((line) => `${FIELD_INDENT}${line}`), '    )'];
}

/** Une ligne du values (…) des sessions : slug, title, skill, duration_min, blocks. */
function sessionLine(session: SeedSession): string {
  const values = [
    sqlString(session.slug),
    sqlString(session.title),
    sqlString(session.skill),
    String(session.durationMin),
    textArray(session.blocks),
  ];
  return `    (${values.join(', ')})`;
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

/** Littéral SQL, ou null. */
function sqlNullableString(value: string | null): string {
  return value === null ? 'null' : sqlString(value);
}

/** Tableau text[] : array['tous'], array['test-tir-1', 'test-tir-2']. */
function textArray(values: readonly string[]): string {
  return `array[${values.map(sqlString).join(', ')}]`;
}

/**
 * Écrit `content` s'il diffère du fichier actuel ; true si le fichier était déjà
 * identique. Comparaison en LF : un fichier réenregistré en CRLF n'a pas changé
 * pour autant.
 */
function writeIfChanged(filePath: string, content: string): boolean {
  const unchanged = readIfExists(filePath)?.replaceAll('\r\n', '\n') === content;
  if (!unchanged) {
    writeFileSync(filePath, content, 'utf8');
  }
  return unchanged;
}

/** Contenu actuel d'un fichier, null s'il n'existe pas encore. */
function readIfExists(filePath: string): string | null {
  return statSync(filePath, { throwIfNoEntry: false }) ? readFileSync(filePath, 'utf8') : null;
}

/** « écrit » ou « inchangé », pour la console. */
function writeState(unchanged: boolean): string {
  return unchanged ? 'inchangé' : 'écrit';
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
