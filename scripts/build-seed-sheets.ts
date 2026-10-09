// Génère le contenu de l'onglet Tests à partir du contenu versionné :
// supabase/content/sheets_001.json (fiches de lecture) et
// supabase/content/tests_001.json (batteries de tests, source des tests
// atomiques) → supabase/content/tests_atomic_001.json, sessions_001.json et
// supabase/seed_sheets_001.sql.
//
// Usage, depuis la racine du projet (chemins relatifs au répertoire courant) :
//   npx tsx scripts/build-seed-sheets.ts
//     sans argument : lit sheets_001.json puis tests_001.json, dans cet ordre,
//     qui est celui des lignes dans le SQL.
//
// Entrées : sheets_001.json, fiches kind training ; tests_001.json, batteries
// kind test de plusieurs blocs avec mesures. Ce sont les seules sources : les
// deux JSON générés ne se modifient pas à la main.
// Sorties :
// - tests_atomic_001.json : un test atomique par bloc de batterie, slug
//   <slug-batterie>-<n> (n = order du bloc), titre du bloc, compétence et postes
//   de la batterie, famille imposée par BLOCK_FAMILIES, durée du bloc, intro de
//   la batterie (règles communes), exercises = [le bloc, order ramené à 1] ;
// - sessions_001.json : une session par batterie (même slug, même titre),
//   blocks = slugs de ses tests dans l'ordre des blocs ;
// - seed_sheets_001.sql : catalogue des mesures (les lignes d'avant le
//   découpage, protocol « titre de la batterie — titre du bloc »), fiches de
//   lecture et tests atomiques, puis sessions, chaque partie en upsert.
//
// Validation, avec lib/sheet-types.ts, lib/test-families.ts et la taxonomie de
// lib/quiz-taxonomy.ts : racine { _format facultatif, sheets non vide } ; fiche
// aux clés exactement slug, kind, title, subtitle, positions, skill,
// duration_min, intro, exercises ; slug en kebab-case ; kind training dans
// sheets_001.json, test dans tests_001.json ; title, subtitle et skill non
// vides ; positions non vide, dans la liste fermée, sans doublon ; duration_min
// entier positif ; intro et exercises au format de lib/sheet-types.ts
// (validateIntro, validateExercises). Aucune chaîne de la fiche, à toute
// profondeur, ne contient de caractère de contrôle, ni « $$ », qui fermerait le
// bloc do du SQL, ni le marqueur de l'UUID.
// Sur les fiches valides : key de mesure unique sur toutes les fiches (clé
// d'idempotence du catalogue tests) ; chaque diagram est un fichier de
// supabase/content/diagrams, au nom exact. Un fichier de ce dossier qu'aucune
// fiche ne référence est signalé, sans être une erreur.
// Découpage des batteries valides : chaque batterie et chacun de ses blocs a sa
// famille dans BLOCK_FAMILIES, qui n'a ni batterie ni bloc en trop ; skill de la
// batterie dans SKILL_KEYS ; famille dans FAMILY_KEYS, de la même compétence ;
// test atomique conforme à validateAtomicExercises ; slug unique sur tout
// (fiches, batteries, tests atomiques : clé d'idempotence du SQL) ; blocks de
// chaque session conforme à validateBlocks, chaque slug celui d'un test
// atomique. Toutes les erreurs sont listées en une passe ; s'il y en a une, rien
// n'est écrit et le script finit en code 1.
//
// Sortie déterministe : ni date ni horodatage, fins de ligne LF, UTF-8 sans BOM,
// retour à la ligne final. Chaque fichier n'est réécrit que s'il change (CRLF
// ramenés à LF pour comparer) : relancé sur les mêmes JSON, le script annonce
// « inchangé » pour les trois.
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
  isFamilyKey,
  isSkillKey,
  SKILL_KEYS,
  type FamilyKey,
  type SkillKey,
} from '../lib/test-families';

const CONTENT_DIR = 'supabase/content';
/** Schémas des exercices : les fichiers à déposer à la main dans le bucket Storage diagrams. */
const DIAGRAMS_DIR = `${CONTENT_DIR}/diagrams`;
const READINGS_FILE = 'sheets_001.json';
const TESTS_FILE = 'tests_001.json';
/** Entrées fixes, lues dans cet ordre, qui est celui des lignes dans le SQL ; chacune n'admet qu'un kind. */
const CONTENT_FILES: readonly ContentSpec[] = [
  { name: READINGS_FILE, kind: 'training' },
  { name: TESTS_FILE, kind: 'test' },
];
/** Générés depuis tests_001.json, à côté des sources. */
const ATOMIC_TESTS_FILE = 'tests_atomic_001.json';
const SESSIONS_FILE = 'sessions_001.json';
const ATOMIC_TESTS_PATH = `${CONTENT_DIR}/${ATOMIC_TESTS_FILE}`;
const SESSIONS_PATH = `${CONTENT_DIR}/${SESSIONS_FILE}`;
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

/**
 * Famille de chaque bloc des batteries de tests_001.json, imposée : le bloc
 * d'order n reçoit la famille d'indice n − 1. Une batterie ou un bloc absent de
 * la table est une erreur, une entrée sans batterie ou sans bloc aussi : la
 * table et le JSON se correspondent exactement. Valeurs en string, contrôlées à
 * l'exécution (npx tsx ne vérifie pas les types) : clé de FAMILY_KEYS, famille
 * de la compétence de la batterie.
 */
const BLOCK_FAMILIES: ReadonlyMap<string, readonly string[]> = new Map([
  ['test-tir', ['tir_arret', 'tir_mouvement', 'tir_surface']],
  ['test-passe', ['passe_courte', 'passe_longue', 'passe_mouvement']],
  ['test-dribble', ['dribble_slalom', 'dribble_slalom', 'dribble_conduite', 'dribble_slalom']],
  ['test-jonglerie', ['jonglerie_pieds', 'jonglerie_pieds', 'jonglerie_tete', 'jonglerie_pieds']],
  ['test-physique', ['phys_vitesse', 'phys_agilite', 'phys_gainage', 'phys_endurance']],
]);

/** _format des JSON générés : de quoi les lire sans ouvrir le script. */
const GENERATED_NOTE = `généré par ${SCRIPT_PATH} depuis ${TESTS_FILE} : ne pas modifier à la main, modifier ${TESTS_FILE} puis relancer npx tsx ${SCRIPT_PATH}`;
const ATOMIC_TESTS_FORMAT: Readonly<Record<string, string>> = {
  fichier: GENERATED_NOTE,
  kind: `test : test atomique, un seul exercice (un bloc d'une batterie de ${TESTS_FILE}) et ses mesures, saisies sur le même écran`,
  slug: "<slug de la batterie>-<order du bloc> ; clé d'idempotence du seed, ne jamais le renommer",
  family: 'famille de lib/test-families.ts (FAMILY_KEYS), sous-type de la compétence skill ; imposée par BLOCK_FAMILIES du script',
  intro: 'règles communes de la batterie, affichées dans « Plus de tips »',
  exercises:
    'le bloc de la batterie tel quel, order ramené à 1, mesures comprises (measure.key inchangée : relie test_results au catalogue tests)',
};
const SESSIONS_FORMAT: Readonly<Record<string, string>> = {
  fichier: GENERATED_NOTE,
  session: `suite ordonnée de tests atomiques, une par batterie de ${TESTS_FILE} (même slug, même titre : la ligne de la batterie en base devient la session)`,
  blocks: `slugs des tests de ${ATOMIC_TESTS_FILE}, dans l'ordre des blocs de la batterie`,
  duration_min: 'absente : le seed la calcule, somme des durées des tests de blocks',
};

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

/** Fichier source et le seul kind qu'il admet. */
type ContentSpec = { name: string; kind: ExerciseFormat };

/** Fiche source validée : fiche de lecture ou batterie de tests. */
type SeedSheet = {
  /** « sheets_001.json, fiche 2 « bo-passe-remise-controle-scan » » : de quoi la retrouver dans le JSON. */
  where: string;
  slug: string;
  kind: ExerciseFormat;
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

/** Test atomique : un bloc d'une batterie, prêt pour le JSON et le SQL. */
type AtomicTest = {
  slug: string;
  title: string;
  positions: PositionKey[];
  skill: SkillKey;
  family: FamilyKey;
  durationMin: number;
  /** intro de la batterie, telle que lue dans le JSON. */
  introJson: unknown;
  /** [le bloc tel que lu dans le JSON, order ramené à 1]. */
  exercisesJson: unknown[];
};

/** Session : la batterie, réduite à la suite de ses tests atomiques. */
type SeedSession = {
  where: string;
  slug: string;
  title: string;
  skill: SkillKey;
  /** Slugs de ses tests atomiques, dans l'ordre des blocs. */
  blocks: string[];
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

/** Ligne du catalogue tests : une mesure et son protocole « titre de la batterie — titre du bloc ». */
type SeedMeasure = Measure & { protocol: string };

/**
 * Fichier de contenu (« tests_001.json ») : ses fiches valides, dans l'ordre du
 * JSON, et les slugs qu'il écrit, fiches invalides comprises.
 */
type ContentFile = { name: string; sheets: SeedSheet[]; writtenSlugs: string[] };

/** Schémas référencés par les fiches et présents ; fichiers du dossier que rien ne référence. */
type DiagramCheck = { found: Set<string>; unreferenced: string[] };

function main(): void {
  if (!statSync(CONTENT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`Dossier ${CONTENT_DIR} introuvable dans ${process.cwd()}. Lance le script depuis la racine du projet.`);
    return;
  }
  const errors: string[] = [];
  // Slug → endroit de la première fiche ou du premier test atomique qui l'emploie.
  const slugs = new Map<string, string>();
  const files: ContentFile[] = [];
  for (const spec of CONTENT_FILES) {
    files.push(validateContentFile(spec, slugs, errors));
  }
  const sheets = files.flatMap((file) => file.sheets);
  const measures = collectMeasures(sheets, errors);
  const diagrams = checkDiagrams(sheets, errors);
  const readings = sheets.filter((sheet) => sheet.kind === 'training');
  const batteries = sheets.filter((sheet) => sheet.kind === 'test');
  const batterySlugs = files.find((file) => file.name === TESTS_FILE)?.writtenSlugs ?? [];
  const { tests, sessions } = splitBatteries(batteries, batterySlugs, slugs, errors);
  checkSessions(sessions, tests, errors);
  if (errors.length === 0 && measures.length === 0) {
    // La liste in (…) et le values (…) du catalogue seraient vides : SQL invalide.
    errors.push(
      `${CONTENT_FILES.map((spec) => spec.name).join(', ')} : aucune mesure ; il faut au moins un test (kind test) pour le catalogue tests du SQL.`,
    );
  }
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    fail(`${formatCount(errors.length, 'erreur', 'erreurs')}, aucun fichier écrit.`);
    return;
  }
  // Seulement sans erreur : une fiche invalide, écartée des contrôles croisés, peut référencer le fichier.
  for (const name of diagrams.unreferenced) {
    console.warn(
      `${DIAGRAMS_DIR}/${name} : aucune fiche ne le référence ; inutile de le déposer dans le bucket diagrams.`,
    );
  }

  const sql = buildSql(readings, tests, sessions, measures);
  // Garde-fou : une chaîne qui contiendrait le marqueur le dupliquerait (déjà refusé par checkSqlSafety).
  if (sql.split(UUID_MARKER).length !== 2) {
    fail(`${UUID_MARKER} doit apparaître une seule fois dans le SQL, aucun fichier écrit.`);
    return;
  }
  const sqlUnchanged = writeIfChanged(OUTPUT_PATH, sql);
  const testsUnchanged = writeIfChanged(
    ATOMIC_TESTS_PATH,
    jsonText({ _format: ATOMIC_TESTS_FORMAT, tests: tests.map(atomicTestJson) }),
  );
  const sessionsUnchanged = writeIfChanged(
    SESSIONS_PATH,
    jsonText({ _format: SESSIONS_FORMAT, sessions: sessions.map(sessionJson) }),
  );
  for (const file of files) {
    console.log(`${file.name} : ${formatCount(file.sheets.length, 'fiche valide', 'fiches valides')}`);
  }
  const total = formatCount(readings.length + tests.length + sessions.length, 'fiche', 'fiches');
  const parts = [
    `${readings.length} training`,
    formatCount(tests.length, 'test atomique', 'tests atomiques'),
    formatCount(sessions.length, 'session', 'sessions'),
  ].join(', ');
  const measureTotal = formatCount(measures.length, 'mesure', 'mesures');
  const found = formatCount(diagrams.found.size, 'schéma trouvé', 'schémas trouvés');
  console.log(`${total} (${parts}), ${measureTotal}, ${found} → ${OUTPUT_PATH} (${writeState(sqlUnchanged)})`);
  console.log(
    `${ATOMIC_TESTS_PATH} : ${formatCount(tests.length, 'test atomique', 'tests atomiques')} (${writeState(testsUnchanged)})`,
  );
  console.log(`${SESSIONS_PATH} : ${formatCount(sessions.length, 'session', 'sessions')} (${writeState(sessionsUnchanged)})`);
}

// Validation : chaque erreur s'ajoute à `errors` et la lecture continue, pour
// tout signaler en une passe.

/** Fiches valides d'un fichier de contenu et slugs qu'il écrit ; ses erreurs s'ajoutent à `errors`. */
function validateContentFile(spec: ContentSpec, slugs: Map<string, string>, errors: string[]): ContentFile {
  const fileName = spec.name;
  const empty: ContentFile = { name: fileName, sheets: [], writtenSlugs: [] };
  const filePath = `${CONTENT_DIR}/${fileName}`;
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    errors.push(`${fileName} : ${filePath} introuvable.`);
    return empty;
  }
  const text = readFileSync(filePath, 'utf8');
  let root: unknown;
  try {
    // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`${fileName} : JSON illisible (${reason}).`);
    return empty;
  }
  if (!isRecord(root)) {
    errors.push(`${fileName} : racine ${describeValue(root)} invalide ; attendu un objet { "sheets": [ … ] }.`);
    return empty;
  }

  const rootWhere = `${fileName}, racine`;
  checkUnknownKeys(root, ROOT_KEYS, rootWhere, errors);
  const items = root.sheets;
  if (!isArray(items) || items.length === 0) {
    errors.push(`${rootWhere} : ${fieldError('sheets', items)} ; attendu un tableau non vide de fiches.`);
    return empty;
  }
  const sheets: SeedSheet[] = [];
  const writtenSlugs: string[] = [];
  for (const [index, item] of items.entries()) {
    if (isRecord(item) && typeof item.slug === 'string') {
      writtenSlugs.push(item.slug);
    }
    const sheet = validateSheet(item, spec, index + 1, slugs, errors);
    if (sheet) {
      sheets.push(sheet);
    }
  }
  return { name: fileName, sheets, writtenSlugs };
}

/**
 * Une fiche ; null si elle a une erreur, quelle qu'elle soit (clé inconnue
 * comprise) : seules les fiches sans erreur passent aux contrôles croisés.
 */
function validateSheet(
  item: unknown,
  spec: ContentSpec,
  number: number,
  slugs: Map<string, string>,
  errors: string[],
): SeedSheet | null {
  const where = locate(`${spec.name}, fiche ${number}`, sheetName(item));
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${SHEET_KEYS.join(', ')} }.`);
    return null;
  }
  const errorCount = errors.length;
  checkUnknownKeys(item, SHEET_KEYS, where, errors);

  const slug = checkSlug(item.slug, where, slugs, errors);
  const kind = checkKind(item.kind, spec, where, errors);
  const title = checkText(item.title, 'title', where, errors);
  const subtitle = checkText(item.subtitle, 'subtitle', where, errors);
  const positions = checkPositions(item.positions, where, errors);
  const skill = checkText(item.skill, 'skill', where, errors);
  const durationMin = checkPositiveInteger(item.duration_min, 'duration_min', where, errors);
  addSheetErrors(validateIntro(item.intro).errors, where, errors);
  // Format des exercices : celui du fichier (measures pour un test), même si le kind écrit est faux.
  const exercises = validateExercises(item.exercises, spec.kind);
  addSheetErrors(exercises.errors, where, errors);
  checkSqlSafety(item, '', where, errors);
  if (
    errors.length > errorCount ||
    slug === null ||
    kind === null ||
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
  return claimSlug(value, where, slugs, errors) ? value : null;
}

/**
 * Réserve un slug pour `where` ; false s'il est déjà employé, par une fiche, une
 * batterie ou un test atomique (clé d'idempotence du SQL).
 */
function claimSlug(slug: string, where: string, slugs: Map<string, string>, errors: string[]): boolean {
  const first = slugs.get(slug);
  if (first !== undefined) {
    errors.push(
      `${where} : slug "${slug}" déjà employé (${first}) ; un slug est unique sur toutes les fiches, batteries et tests atomiques (clé d'idempotence du SQL).`,
    );
    return false;
  }
  slugs.set(slug, where);
  return true;
}

/** Le kind du fichier : training dans sheets_001.json, test dans tests_001.json ; null sinon. */
function checkKind(value: unknown, spec: ContentSpec, where: string, errors: string[]): ExerciseFormat | null {
  if (value === spec.kind) {
    return spec.kind;
  }
  errors.push(`${where} : ${fieldError('kind', value)} ; ${spec.name} ne contient que des fiches kind ${spec.kind}.`);
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
 * Lues sur les batteries, pas sur les tests atomiques : protocol garde le titre
 * de la batterie, et le catalogue reste celui d'avant le découpage.
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

/**
 * Tests atomiques (batteries puis blocs, dans l'ordre des JSON) et sessions (une
 * par batterie) tirés des batteries valides. `writtenSlugs` : slugs écrits dans
 * tests_001.json, batteries invalides comprises, pour signaler une entrée de
 * BLOCK_FAMILIES sans batterie sans doubler l'erreur d'une batterie invalide.
 */
function splitBatteries(
  batteries: readonly SeedSheet[],
  writtenSlugs: readonly string[],
  slugs: Map<string, string>,
  errors: string[],
): { tests: AtomicTest[]; sessions: SeedSession[] } {
  const tests: AtomicTest[] = [];
  const sessions: SeedSession[] = [];
  for (const battery of batteries) {
    const families = BLOCK_FAMILIES.get(battery.slug);
    if (families === undefined) {
      errors.push(
        `${battery.where} : batterie absente de BLOCK_FAMILIES (${SCRIPT_PATH}) ; chacun de ses blocs y reçoit sa famille.`,
      );
      continue;
    }
    const skill = battery.skill;
    if (!isSkillKey(skill)) {
      errors.push(
        `${battery.where} : skill "${skill}" invalide pour une batterie ; valeurs permises : ${SKILL_KEYS.join(', ')} (lib/test-families.ts).`,
      );
      continue;
    }
    if (families.length > battery.exercises.length) {
      errors.push(
        `${battery.where} : BLOCK_FAMILIES (${SCRIPT_PATH}) donne ${families.length} familles pour ${battery.exercises.length} blocs ; une par bloc, ni plus ni moins.`,
      );
    }
    // Validé par validateExercises : un tableau d'objets, dans l'ordre de battery.exercises.
    const blocks = isArray(battery.exercisesJson) ? battery.exercisesJson : [];
    const batteryTests: AtomicTest[] = [];
    for (const [index, exercise] of battery.exercises.entries()) {
      const test = splitBlock(battery, skill, exercise, blocks[index], families.at(index), slugs, errors);
      if (test) {
        batteryTests.push(test);
      }
    }
    tests.push(...batteryTests);
    sessions.push({
      where: battery.where,
      slug: battery.slug,
      title: battery.title,
      skill,
      blocks: batteryTests.map((test) => test.slug),
      durationMin: batteryTests.reduce((sum, test) => sum + test.durationMin, 0),
    });
  }
  for (const slug of BLOCK_FAMILIES.keys()) {
    if (!writtenSlugs.includes(slug)) {
      errors.push(
        `${SCRIPT_PATH}, BLOCK_FAMILIES : batterie "${slug}" absente de ${TESTS_FILE} ; retirer l'entrée ou rétablir la batterie.`,
      );
    }
  }
  return { tests, sessions };
}

/** Le test atomique d'un bloc ; null s'il a une erreur (famille, slug, format). */
function splitBlock(
  battery: SeedSheet,
  skill: SkillKey,
  exercise: Exercise,
  block: unknown,
  family: string | undefined,
  slugs: Map<string, string>,
  errors: string[],
): AtomicTest | null {
  const where = exerciseWhere(battery, exercise);
  const errorCount = errors.length;
  if (family === undefined) {
    errors.push(`${where} : bloc absent de BLOCK_FAMILIES (${SCRIPT_PATH}) ; chaque bloc y reçoit sa famille.`);
  } else if (!isFamilyKey(family)) {
    errors.push(
      `${where} : famille "${family}" (BLOCK_FAMILIES) inconnue ; valeurs permises : ${FAMILY_KEYS.join(', ')}.`,
    );
  } else if (getFamily(family).skill !== skill) {
    errors.push(
      `${where} : famille "${family}" (BLOCK_FAMILIES) de la compétence ${getFamily(family).skill}, pas ${skill} ; une famille est un sous-type de la compétence de sa batterie.`,
    );
  }
  const slug = `${battery.slug}-${exercise.order}`;
  claimSlug(slug, `${where}, test atomique`, slugs, errors);
  // Le bloc tel que lu dans le JSON, order ramené à 1 (la clé garde sa place).
  const exercisesJson = isRecord(block) ? [{ ...block, order: 1 }] : [];
  addSheetErrors(validateAtomicExercises(exercisesJson).errors, `${where}, test atomique "${slug}"`, errors);
  if (errors.length > errorCount || family === undefined || !isFamilyKey(family)) {
    return null;
  }
  return {
    slug,
    title: exercise.title,
    positions: battery.positions,
    skill,
    family,
    durationMin: exercise.duration_min,
    introJson: battery.introJson,
    exercisesJson,
  };
}

/** blocks de chaque session : conforme à validateBlocks, chaque slug celui d'un test atomique. */
function checkSessions(sessions: readonly SeedSession[], tests: readonly AtomicTest[], errors: string[]): void {
  const testSlugs = new Set(tests.map((test) => test.slug));
  for (const session of sessions) {
    const where = `${session.where}, session`;
    addSheetErrors(validateBlocks(session.blocks).errors, where, errors);
    for (const slug of session.blocks) {
      if (!testSlugs.has(slug)) {
        errors.push(`${where} : blocks cite "${slug}", qui n'est pas un test atomique.`);
      }
    }
  }
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

// JSON générés : clés dans l'ordre de SHEET_KEYS, indentation de 2.

/** Un test de tests_atomic_001.json. */
function atomicTestJson(test: AtomicTest): Record<string, unknown> {
  return {
    slug: test.slug,
    kind: 'test',
    title: test.title,
    positions: test.positions,
    skill: test.skill,
    family: test.family,
    duration_min: test.durationMin,
    intro: test.introJson,
    exercises: test.exercisesJson,
  };
}

/** Une session de sessions_001.json (duration_min absente : calculée par le SQL). */
function sessionJson(session: SeedSession): Record<string, unknown> {
  return { slug: session.slug, title: session.title, skill: session.skill, blocks: session.blocks };
}

/** JSON indenté de 2, retour à la ligne final. */
function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// SQL : même mise en page que supabase/seed_questions_001.sql.

/** SQL du seed ; mêmes JSON, même texte à l'octet près (aucune date). */
function buildSql(
  readings: readonly SeedSheet[],
  tests: readonly AtomicTest[],
  sessions: readonly SeedSession[],
  measures: readonly SeedMeasure[],
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
    `-- depuis ${CONTENT_DIR}/${READINGS_FILE} et ${TESTS_FILE}. Tests`,
    `-- atomiques et sessions : ${ATOMIC_TESTS_FILE} et ${SESSIONS_FILE},`,
    '-- générés en même temps que ce fichier.',
    '--',
    `-- Fichier généré par ${SCRIPT_PATH} : ne pas modifier à la`,
    `-- main, modifier les JSON sources (${READINGS_FILE}, ${TESTS_FILE}) puis`,
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
    `-- 1. Catalogue des mesures, sur (user_id, key) : les ${measureTotal} d'avant le`,
    "--    découpage, à l'identique (protocol = « titre de la batterie — titre du",
    "--    bloc ») : une ré-exécution n'en change aucune.",
    '-- 2. Fiches de lecture et tests atomiques, sur (user_id, slug) : un test par',
    '--    bloc de batterie (slug <batterie>-<n>), avec sa famille ; subtitle et',
    '--    blocks null pour un test, family et blocks null pour une fiche.',
    '-- 3. Sessions, sur (user_id, slug) : une par batterie, même slug ; la ligne',
    '--    de la batterie déjà en base devient la session (même id). Seuls kind,',
    '--    title, skill, family, duration_min (somme des durées de ses tests) et',
    '--    blocks sont mis à jour, jamais exercises, intro, subtitle ni positions :',
    '--    les anciens blocs restent stockés, sans être lus.',
    '-- Une seconde exécution ne change rien. Aucune ligne supprimée ; test_results',
    "-- n'est pas touchée (comptée avant et après, en fin de bloc).",
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
    '  -- 1. Catalogue des mesures (clé : key) ; protocol = titre de la batterie —',
    '  --    titre du bloc, comme avant le découpage en tests atomiques',
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
function readingRow(sheet: SeedSheet): SheetRow {
  return {
    slug: sheet.slug,
    kind: sheet.kind,
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
