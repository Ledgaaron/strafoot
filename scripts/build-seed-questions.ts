// Génère le seed SQL des questions du quizz à partir du contenu versionné :
// supabase/content/questions_NNN.json → supabase/seed_questions_NNN.sql.
//
// Usage, depuis la racine du projet (chemins relatifs au répertoire courant) :
//   npx tsx scripts/build-seed-questions.ts
//     traite chaque supabase/content/questions_NNN.json (NNN = 3 chiffres), dans l'ordre ;
//   npx tsx scripts/build-seed-questions.ts questions_002.json supabase/content/questions_003.json
//     ne traite que les fichiers de contenu nommés (nom seul, ou chemin dans supabase/content).
//
// Validation, avec la taxonomie de lib/quiz-taxonomy.ts : racine { _format
// facultatif, questions non vide } ; question aux clés exactement situation,
// options, theme, positions, level, source ; situation non vide et unique dans le
// fichier (clé d'idempotence du SQL) ; theme et positions dans les listes fermées,
// positions sans doublon ; level 1, 2 ou 3 ; source non vide ; 4 options aux clés
// exactement text, score, explanation, score entier de 0 à 3, au moins une à 3,
// textes distincts. Chaque texte tient sur une ligne et ne contient pas « $$ »,
// qui fermerait le bloc do du SQL. Toutes les erreurs d'un fichier sont listées ;
// un fichier en erreur n'écrit aucun SQL et le script finit en code 1.
//
// Sortie déterministe : ni date ni horodatage, fins de ligne LF, UTF-8 sans BOM,
// retour à la ligne final. Le SQL n'est réécrit que s'il change (CRLF ramenés à
// LF pour comparer) : relancé sur le même JSON, le script annonce « inchangé ».
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:fs et node:path.
/// <reference types="node" />
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  isPositionKey,
  isThemeKey,
  MAX_OPTION_SCORE,
  POSITION_KEYS,
  THEME_KEYS,
  type PositionKey,
  type ThemeKey,
} from '../lib/quiz-taxonomy';

const CONTENT_DIR = 'supabase/content';
const OUTPUT_DIR = 'supabase';
const CONTENT_FILE_PATTERN = /^questions_(\d{3})\.json$/;
const SCRIPT_PATH = 'scripts/build-seed-questions.ts';
const MIGRATION_PATH = 'supabase/migrations/003_quiz.sql';
/** Remplacé par l'utilisateur dans le SQL Editor : une seule occurrence, ligne uid. */
const UUID_MARKER = '<REMPLACER_PAR_MON_UUID>';

const ROOT_KEYS: readonly string[] = ['_format', 'questions'];
const QUESTION_KEYS: readonly string[] = ['situation', 'options', 'theme', 'positions', 'level', 'source'];
const OPTION_KEYS: readonly string[] = ['text', 'score', 'explanation'];
const OPTION_COUNT = 4;
const LEVELS: readonly number[] = [1, 2, 3];
const SCORES: readonly number[] = [0, 1, 2, 3];
// Retour à la ligne, tabulation… : un texte tient sur une ligne du SQL.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
// Longueurs citées dans les messages d'erreur : début de situation, valeur fautive.
const EXCERPT_LENGTH = 50;
const VALUE_LENGTH = 60;

/** Fichier de contenu (« questions_001.json ») et son numéro (« 001 »). */
type ContentFile = { name: string; number: string };

type SeedOption = { text: string; score: number; explanation: string };

type SeedQuestion = {
  situation: string;
  options: SeedOption[];
  theme: ThemeKey;
  positions: PositionKey[];
  level: number;
  source: string;
};

function main(): void {
  if (!statSync(CONTENT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`Dossier ${CONTENT_DIR} introuvable dans ${process.cwd()}. Lance le script depuis la racine du projet.`);
    return;
  }
  const args = process.argv.slice(2);
  for (const file of args.length > 0 ? namedContentFiles(args) : allContentFiles()) {
    buildSeedFile(file);
  }
}

/** Sans argument : chaque questions_NNN.json de supabase/content, dans l'ordre des numéros. */
function allContentFiles(): ContentFile[] {
  const files: ContentFile[] = [];
  for (const name of readdirSync(CONTENT_DIR).sort()) {
    const match = CONTENT_FILE_PATTERN.exec(name);
    if (match) {
      files.push({ name, number: match[1] });
    } else if (/^questions.*\.json$/i.test(name)) {
      // Mal nommé, il serait ignoré sans un mot.
      console.warn(`${CONTENT_DIR}/${name} ignoré : nom attendu questions_NNN.json (NNN = 3 chiffres).`);
    }
  }
  if (files.length === 0) {
    fail(`Aucun fichier ${CONTENT_DIR}/questions_NNN.json : rien à générer.`);
  }
  return files;
}

/** Avec arguments : les fichiers nommés, par leur nom seul ou leur chemin dans supabase/content. */
function namedContentFiles(args: readonly string[]): ContentFile[] {
  const files: ContentFile[] = [];
  for (const arg of args) {
    const name = path.basename(arg);
    const match = CONTENT_FILE_PATTERN.exec(name);
    if (!match) {
      fail(`« ${arg} » : nom attendu questions_NNN.json (NNN = 3 chiffres).`);
    } else if (name !== arg && path.relative(path.resolve(CONTENT_DIR), path.resolve(arg)) !== name) {
      // L'en-tête du SQL nomme supabase/content/questions_NNN.json : rien d'autre n'est lu.
      fail(`« ${arg} » : un fichier de contenu doit être dans ${CONTENT_DIR}.`);
    } else if (!statSync(`${CONTENT_DIR}/${name}`, { throwIfNoEntry: false })?.isFile()) {
      fail(`« ${arg} » : ${CONTENT_DIR}/${name} introuvable.`);
    } else if (!files.some((file) => file.name === name)) {
      files.push({ name, number: match[1] });
    }
  }
  return files;
}

/** Valide un fichier de contenu puis écrit son SQL s'il a changé ; en cas d'erreur, n'écrit rien. */
function buildSeedFile(file: ContentFile): void {
  const outputPath = `${OUTPUT_DIR}/seed_questions_${file.number}.sql`;
  const { questions, errors } = validateContent(file.name, readFileSync(`${CONTENT_DIR}/${file.name}`, 'utf8'));
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    fail(`${file.name} : ${formatCount(errors.length, 'erreur', 'erreurs')}, ${outputPath} non écrit.`);
    return;
  }

  const sql = buildSql(file, questions);
  // Garde-fou : un texte du JSON qui contiendrait le marqueur le dupliquerait.
  if (sql.split(UUID_MARKER).length !== 2) {
    fail(`${file.name} : ${UUID_MARKER} doit apparaître une seule fois dans le SQL, ${outputPath} non écrit.`);
    return;
  }
  // Comparaison en LF : un fichier réenregistré en CRLF n'a pas changé pour autant.
  const unchanged = readIfExists(outputPath)?.replaceAll('\r\n', '\n') === sql;
  if (!unchanged) {
    writeFileSync(outputPath, sql, 'utf8');
  }
  const valid = formatCount(questions.length, 'question valide', 'questions valides');
  console.log(`${file.name} : ${valid} → ${outputPath} (${unchanged ? 'inchangé' : 'écrit'})`);
}

// Validation : chaque erreur s'ajoute à `errors` et la lecture continue, pour
// tout signaler en une passe.

/** Questions du fichier et toutes ses erreurs ; les questions ne servent que sans erreur. */
function validateContent(fileName: string, text: string): { questions: SeedQuestion[]; errors: string[] } {
  let root: unknown;
  try {
    // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { questions: [], errors: [`${fileName} : JSON illisible (${reason}).`] };
  }
  if (!isRecord(root)) {
    return {
      questions: [],
      errors: [`${fileName} : racine ${describeValue(root)} invalide ; attendu un objet { "questions": [ … ] }.`],
    };
  }

  const errors: string[] = [];
  const rootWhere = `${fileName}, racine`;
  checkUnknownKeys(root, ROOT_KEYS, rootWhere, errors);
  const items = root.questions;
  if (!isArray(items) || items.length === 0) {
    errors.push(`${rootWhere} : ${fieldError('questions', items)} ; attendu un tableau non vide de questions.`);
    return { questions: [], errors };
  }

  const questions: SeedQuestion[] = [];
  // Situation sans espaces autour → numéro de la première question qui l'emploie.
  const situations = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const question = validateQuestion(item, fileName, index + 1, situations, errors);
    if (question) {
      questions.push(question);
    }
  }
  return { questions, errors };
}

/** Une question ; null si elle a une erreur. */
function validateQuestion(
  item: unknown,
  fileName: string,
  number: number,
  situations: Map<string, number>,
  errors: string[],
): SeedQuestion | null {
  const where = locate(fileName, number, isRecord(item) ? item.situation : undefined);
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${QUESTION_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, QUESTION_KEYS, where, errors);

  const situation = checkText(item.situation, 'situation', where, errors);
  if (situation !== null) {
    const first = situations.get(situation.trim());
    if (first === undefined) {
      situations.set(situation.trim(), number);
    } else {
      errors.push(
        `${where} : même situation que la question ${first} ; elle doit être unique dans le fichier (clé d'idempotence du SQL).`,
      );
    }
  }
  const options = checkOptions(item.options, where, errors);
  const theme = checkTheme(item.theme, where, errors);
  const positions = checkPositions(item.positions, where, errors);
  const level = checkChoice(item.level, 'level', LEVELS, where, errors);
  const source = checkText(item.source, 'source', where, errors);
  if (
    situation === null ||
    options === null ||
    theme === null ||
    positions === null ||
    level === null ||
    source === null
  ) {
    return null;
  }
  return { situation, options, theme, positions, level, source };
}

/** Exactement 4 options valides, au moins une à 3, textes distincts ; null sinon. */
function checkOptions(value: unknown, where: string, errors: string[]): SeedOption[] | null {
  if (!isArray(value)) {
    errors.push(
      `${where} : ${fieldError('options', value)} ; attendu un tableau de ${OPTION_COUNT} objets { ${OPTION_KEYS.join(', ')} }.`,
    );
    return null;
  }
  let valid = true;
  if (value.length !== OPTION_COUNT) {
    errors.push(`${where} : ${formatCount(value.length, 'option', 'options')} au lieu de ${OPTION_COUNT}.`);
    valid = false;
  }
  const options: SeedOption[] = [];
  // Texte sans espaces autour → numéro de la première option qui l'emploie.
  const texts = new Map<string, number>();
  for (const [index, item] of value.entries()) {
    const optionWhere = `${where}, option ${index + 1}`;
    const option = checkOption(item, optionWhere, errors);
    if (option === null) {
      valid = false;
      continue;
    }
    const first = texts.get(option.text.trim());
    if (first === undefined) {
      texts.set(option.text.trim(), index + 1);
    } else {
      errors.push(
        `${optionWhere} : même text que l'option ${first} ; les textes d'une question doivent être distincts.`,
      );
      valid = false;
    }
    options.push(option);
  }
  // Lu sur les options brutes : un score à 3 compte même si son option a une autre erreur.
  if (value.length > 0 && !value.some((item) => isRecord(item) && item.score === MAX_OPTION_SCORE)) {
    errors.push(
      `${where} : aucune option à ${MAX_OPTION_SCORE} ; au moins une doit valoir ${MAX_OPTION_SCORE} (bon choix).`,
    );
    valid = false;
  }
  return valid ? options : null;
}

/** Une option { text, score, explanation } ; null si elle a une erreur. */
function checkOption(item: unknown, where: string, errors: string[]): SeedOption | null {
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${OPTION_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, OPTION_KEYS, where, errors);
  const text = checkText(item.text, 'text', where, errors);
  const score = checkChoice(item.score, 'score', SCORES, where, errors);
  const explanation = checkText(item.explanation, 'explanation', where, errors);
  return text !== null && score !== null && explanation !== null ? { text, score, explanation } : null;
}

function checkTheme(value: unknown, where: string, errors: string[]): ThemeKey | null {
  if (typeof value === 'string' && isThemeKey(value)) {
    return value;
  }
  errors.push(`${where} : ${fieldError('theme', value)} ; valeurs permises : ${THEME_KEYS.join(', ')}.`);
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

/** Entier parmi `allowed` (level, score) ; null sinon. */
function checkChoice(
  value: unknown,
  field: string,
  allowed: readonly number[],
  where: string,
  errors: string[],
): number | null {
  if (typeof value === 'number' && allowed.includes(value)) {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; valeurs permises : ${allowed.join(', ')}.`);
  return null;
}

/** Chaîne non vide après trim, sur une ligne, sans « $$ » ; null sinon. */
function checkText(value: unknown, field: string, where: string, errors: string[]): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${where} : ${fieldError(field, value)} ; attendu une chaîne non vide.`);
    return null;
  }
  const control = CONTROL_CHARACTER.exec(value);
  if (control) {
    const code = control[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    errors.push(
      `${where} : ${field} contient le caractère de contrôle U+${code} ; un texte tient sur une ligne, sans tabulation.`,
    );
    return null;
  }
  if (value.includes('$$')) {
    errors.push(`${where} : ${field} contient "$$", qui fermerait le bloc do $$ … $$ du SQL.`);
    return null;
  }
  return value;
}

/** Clés hors de la liste attendue : une faute de frappe (« levle ») est signalée, pas ignorée. */
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

/** Début d'un message sur un champ : « clé "level" absente » ou « level "2" invalide ». */
function fieldError(field: string, value: unknown): string {
  // JSON.parse ne produit jamais undefined : undefined veut dire clé absente.
  return value === undefined ? `clé "${field}" absente` : `${field} ${describeValue(value)} invalide`;
}

/** Valeur fautive telle qu'écrite en JSON (une chaîne garde ses guillemets), abrégée. */
function describeValue(value: unknown): string {
  return truncate(JSON.stringify(value), VALUE_LENGTH);
}

/** « questions_001.json, question 3 « Ailier, 1 contre 1… » » : de quoi retrouver la question dans le JSON. */
function locate(fileName: string, number: number, situation: unknown): string {
  const where = `${fileName}, question ${number}`;
  if (typeof situation !== 'string' || situation.trim() === '') {
    return where;
  }
  return `${where} « ${truncate(situation.trim().replace(/\s+/g, ' '), EXCERPT_LENGTH)} »`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Array.isArray sans le any[] qu'il infère : les éléments restent à vérifier. */
function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

// SQL : même mise en page que supabase/seed.sql.

/** SQL du seed ; même entrée, même texte à l'octet près (aucune date). */
function buildSql(file: ContentFile, questions: readonly SeedQuestion[]): string {
  const total = questions.length;
  const lines = [
    '-- =============================================================================',
    `-- seed_questions_${file.number}.sql : ${formatCount(total, 'question', 'questions')} du quizz depuis`,
    `-- ${CONTENT_DIR}/${file.name}.`,
    '--',
    `-- Fichier généré par ${SCRIPT_PATH} : ne pas modifier à la`,
    `-- main, modifier le JSON puis relancer npx tsx ${SCRIPT_PATH}.`,
    '--',
    `-- À exécuter dans le SQL Editor APRÈS ${MIGRATION_PATH}.`,
    '--',
    '-- 1. Récupère ton UUID : Dashboard Supabase → Authentication → Users →',
    '--    clique sur ton utilisateur → copie « User UID ».',
    '-- 2. Colle tout le fichier dans le SQL Editor, puis remplace par cet UUID le',
    '--    marqueur entre chevrons de la ligne uid uuid := … (une seule occurrence).',
    '--    Fais-le dans le SQL Editor, pas dans ce fichier, qui est régénéré.',
    '-- 3. Exécute tout le fichier avec le rôle par défaut du SQL Editor (postgres),',
    "--    pas en « Run as authenticated » : ce rôle n'a pas accès à auth.users.",
    '--',
    "-- Idempotent : l'insert ne porte que sur les questions absentes, repérées par",
    "-- (user_id, situation). Une seconde exécution n'ajoute ni ne modifie rien.",
    '--',
    "-- Le trigger set_user_id impose user_id := auth.uid(). Le SQL Editor n'a pas de",
    "-- JWT (auth.uid() est null) : le bloc simule celui de l'utilisateur, le temps",
    "-- de la transaction uniquement. L'insert n'envoie donc jamais user_id.",
    '-- =============================================================================',
    '',
    'do $$',
    'declare',
    `  uid uuid := '${UUID_MARKER}';`,
    '  inserted_count integer;',
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
    '  -- Questions : 4 options { text, score 0-3, explanation } (clé : situation)',
    '  -- ---------------------------------------------------------------------------',
    '  insert into public.questions (situation, options, theme, positions, level, source, is_public)',
    '  select v.situation, v.options, v.theme, v.positions, v.level, v.source, false',
    '  from (values',
    ...joinWithCommas(questions.map(questionLines)),
    '  ) as v(situation, options, theme, positions, level, source)',
    '  where not exists (',
    '    select 1 from public.questions q where q.user_id = uid and q.situation = v.situation',
    '  );',
    '',
    '  get diagnostics inserted_count = row_count;',
    `  raise notice '${file.name} pour % : sur ${formatCount(total, 'question', 'questions')}, insérées : %, déjà présentes : %.',`,
    `    uid, inserted_count, ${total} - inserted_count;`,
    'end',
    '$$;',
    '',
    `-- Contrôle (tous utilisateurs confondus) : au moins ${total} après la première`,
    '-- exécution, inchangé après une seconde.',
    'select count(*) as questions_total from public.questions;',
  ];
  return `${lines.join('\n')}\n`;
}

/** Une ligne du values (…) : situation, options, theme, positions, level, source. */
function questionLines(question: SeedQuestion): string[] {
  const options = question.options.map((option) => [
    '        jsonb_build_object(',
    `          'text', ${sqlString(option.text)},`,
    `          'score', ${option.score},`,
    `          'explanation', ${sqlString(option.explanation)}`,
    '        )',
  ]);
  return [
    '    (',
    `      ${sqlString(question.situation)},`,
    '      jsonb_build_array(',
    ...joinWithCommas(options),
    '      ),',
    `      ${sqlString(question.theme)},`,
    `      array[${question.positions.map(sqlString).join(', ')}],`,
    `      ${question.level},`,
    `      ${sqlString(question.source)}`,
    '    )',
  ];
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

/** Erreur affichée ; le script continue avec les fichiers suivants, mais finira en code 1. */
function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

main();
