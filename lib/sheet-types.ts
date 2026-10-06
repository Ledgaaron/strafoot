// Format des fiches de l'onglet Entraînement : colonnes jsonb
// training_sheets.exercises et training_sheets.intro, que supabase gen types
// type en `Json`. C'est le format de supabase/content/sheets_NNN.json et
// tests_NNN.json, à l'identique : il ne se simplifie pas, tout ce qu'il contient
// s'affiche.
// Validation partagée : getSheet (lib/db/training.ts) à la lecture en base, et
// scripts/build-seed-sheets.ts avant d'écrire le seed. Aucun import à
// l'exécution : le script la charge hors de l'app, avec npx tsx.

/**
 * training : fiche de lecture, aucune saisie ; test : lecture bloc par bloc, puis
 * une valeur par mesure. Liste fermée, identique à la contrainte
 * training_sheets_kind_check (migration 004).
 */
export type SheetKind = 'training' | 'test';

export const SHEET_KINDS: readonly SheetKind[] = ['training', 'test'];

export function isSheetKind(value: string): value is SheetKind {
  return SHEET_KINDS.some((kind) => kind === value);
}

/** Mesure d'un bloc de test : une ligne du catalogue `tests`, reliée par key. */
export type Measure = {
  /** Identifiant stable (snake_case), jamais renommé : relie test_results au catalogue. */
  key: string;
  name: string;
  /** Unité libre affichée (pts /30, s, m, nb, /10…). */
  unit: string;
  /** false pour les chronos. */
  higher_is_better: boolean;
};

export type ExerciseVariations = { easier: string; harder: string };

export type ExerciseSetup = { surface: string; sequence: string; equipment: string };

/** Élément de training_sheets.exercises : un exercice de fiche, ou un bloc de test. */
export type Exercise = {
  /** Rang dans la fiche, à partir de 1 : égal à la position dans le tableau. */
  order: number;
  title: string;
  duration_min: number;
  objective: string;
  goal: string;
  instructions: string[];
  success_criteria: string[];
  technical_points: string[];
  /** null : pas de variables (cas des tests). */
  variations: ExerciseVariations | null;
  setup: ExerciseSetup;
  /** Fichier du bucket Storage `diagrams` ; null : pas de schéma. */
  diagram: string | null;
  /**
   * Au moins une pour un bloc de test. Fiche de lecture : clé absente du JSON et
   * de la base (refusée à la validation), [] une fois lue : ne jamais réécrire en
   * base un exercice validé, seul le JSON d'origine fait foi.
   */
  measures: Measure[];
};

/** Lecture validée : la donnée, ou une erreur lisible (jamais d'exception). */
export type ParseResult<T> = { data: T; error: null } | { data: null; error: string };

/** Résultat d'une validation : la valeur ne sert que si `errors` est vide. */
export type Validation<T> = { value: T; errors: string[] };

const EXERCISE_KEYS: readonly string[] = [
  'order',
  'title',
  'duration_min',
  'objective',
  'goal',
  'instructions',
  'success_criteria',
  'technical_points',
  'variations',
  'setup',
  'diagram',
];
/** Un bloc de test porte en plus ses mesures. */
const TEST_EXERCISE_KEYS: readonly string[] = [...EXERCISE_KEYS, 'measures'];
const VARIATION_KEYS: readonly string[] = ['easier', 'harder'];
const SETUP_KEYS: readonly string[] = ['surface', 'sequence', 'equipment'];
const MEASURE_KEYS: readonly string[] = ['key', 'name', 'unit', 'higher_is_better'];
/** snake_case : « tir_precision_droit ». */
const MEASURE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
/** Nom de fichier simple, sans dossier : « tir-exo1.png ». */
const DIAGRAM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Erreurs affichées à l'écran au plus ; les suivantes sont résumées. */
const MAX_SHOWN_ERRORS = 5;
// Longueurs citées dans les messages d'erreur : début de titre, valeur fautive.
const EXCERPT_LENGTH = 50;
const VALUE_LENGTH = 60;

/**
 * Exercices lus en base (training_sheets.exercises), au format des JSON ; erreur
 * lisible (les 5 premiers problèmes) si le contenu ne le respecte pas.
 */
export function parseExercises(value: unknown, kind: SheetKind): ParseResult<Exercise[]> {
  const { value: exercises, errors } = validateExercises(value, kind);
  return errors.length > 0 ? { data: null, error: summarizeErrors(errors) } : { data: exercises, error: null };
}

/** Lignes d'introduction lues en base (training_sheets.intro) ; erreur lisible si invalides. */
export function parseIntro(value: unknown): ParseResult<string[]> {
  const { value: lines, errors } = validateIntro(value);
  return errors.length > 0 ? { data: null, error: summarizeErrors(errors) } : { data: lines, error: null };
}

/** Nombre de mesures d'un test lu en base ; null si ses exercices sont invalides. */
export function countMeasures(value: unknown): number | null {
  const { value: exercises, errors } = validateExercises(value, 'test');
  return errors.length > 0 ? null : exercises.reduce((sum, exercise) => sum + exercise.measures.length, 0);
}

/**
 * Exercices d'une fiche et toutes leurs erreurs, une par problème, sous la forme
 * « <endroit> : <problème>. » (endroit : « exercises », « exercice 2 « titre » »,
 * « exercice 2 « titre », mesure 1 »…). Règles : tableau non vide ; chaque
 * exercice aux clés exactement celles du format (measures en plus, et
 * obligatoire, pour un test ; interdite pour une fiche) ; order égal au rang ;
 * duration_min entier positif ; textes et listes de textes non vides ; variations
 * null ou { easier, harder } ; setup { surface, sequence, equipment } ; diagram
 * null ou nom de fichier simple ; mesures aux clés exactement key, name, unit,
 * higher_is_better, key en snake_case et unique dans la fiche.
 */
export function validateExercises(value: unknown, kind: SheetKind): Validation<Exercise[]> {
  const errors: string[] = [];
  if (!isArray(value) || value.length === 0) {
    errors.push(`exercises : ${valueError(value)} ; attendu un tableau non vide d'exercices.`);
    return { value: [], errors };
  }
  const exercises: Exercise[] = [];
  // key de mesure → endroit de la première mesure qui l'emploie.
  const measureKeys = new Map<string, string>();
  for (const [index, item] of value.entries()) {
    const exercise = validateExercise(item, index + 1, kind, measureKeys, errors);
    if (exercise) {
      exercises.push(exercise);
    }
  }
  return { value: exercises, errors };
}

/** Lignes d'introduction : tableau, éventuellement vide, de textes non vides. */
export function validateIntro(value: unknown): Validation<string[]> {
  const errors: string[] = [];
  if (!isArray(value)) {
    errors.push(`intro : ${valueError(value)} ; attendu un tableau de textes (éventuellement vide).`);
    return { value: [], errors };
  }
  const lines: string[] = [];
  for (const [index, item] of value.entries()) {
    const line = checkText(item, `ligne ${index + 1}`, 'intro', errors);
    if (line !== null) {
      lines.push(line);
    }
  }
  return { value: lines, errors };
}

/** Un exercice ; null s'il a une erreur sur un champ (une clé inconnue s'ajoute seulement aux erreurs). */
function validateExercise(
  item: unknown,
  number: number,
  kind: SheetKind,
  measureKeys: Map<string, string>,
  errors: string[],
): Exercise | null {
  const where = locate(`exercice ${number}`, isRecord(item) ? item.title : undefined);
  const allowedKeys = kind === 'test' ? TEST_EXERCISE_KEYS : EXERCISE_KEYS;
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${allowedKeys.join(', ')} }.`);
    return null;
  }
  for (const key of Object.keys(item)) {
    if (key === 'measures' && kind === 'training') {
      errors.push(`${where} : clé "measures" dans une fiche training ; les mesures ne vont que dans un test.`);
    } else if (!allowedKeys.includes(key)) {
      errors.push(`${where} : clé "${key}" inconnue ; clés permises : ${allowedKeys.join(', ')}.`);
    }
  }

  const order = checkOrder(item.order, number, where, errors);
  const title = checkText(item.title, 'title', where, errors);
  const durationMin = checkPositiveInteger(item.duration_min, 'duration_min', where, errors);
  const objective = checkText(item.objective, 'objective', where, errors);
  const goal = checkText(item.goal, 'goal', where, errors);
  const instructions = checkTextList(item.instructions, 'instructions', where, errors);
  const successCriteria = checkTextList(item.success_criteria, 'success_criteria', where, errors);
  const technicalPoints = checkTextList(item.technical_points, 'technical_points', where, errors);
  const variations = checkVariations(item.variations, where, errors);
  const setup = checkSetup(item.setup, where, errors);
  const diagram = checkDiagram(item.diagram, where, errors);
  const measures = kind === 'test' ? checkMeasures(item.measures, where, measureKeys, errors) : [];
  if (
    order === null ||
    title === null ||
    durationMin === null ||
    objective === null ||
    goal === null ||
    instructions === null ||
    successCriteria === null ||
    technicalPoints === null ||
    variations === undefined ||
    setup === null ||
    diagram === undefined ||
    measures === null
  ) {
    return null;
  }
  return {
    order,
    title,
    duration_min: durationMin,
    objective,
    goal,
    instructions,
    success_criteria: successCriteria,
    technical_points: technicalPoints,
    variations,
    setup,
    diagram,
    measures,
  };
}

/** Rang de l'exercice, égal à sa position (à partir de 1) ; null sinon. */
function checkOrder(value: unknown, number: number, where: string, errors: string[]): number | null {
  if (value === number) {
    return number;
  }
  errors.push(`${where} : ${fieldError('order', value)} ; attendu ${number}, le rang de l'exercice dans la fiche.`);
  return null;
}

/** null, ou { easier, harder } non vides ; undefined si invalide (null est une valeur permise). */
function checkVariations(value: unknown, where: string, errors: string[]): ExerciseVariations | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    errors.push(
      `${where} : ${fieldError('variations', value)} ; attendu null ou un objet { ${VARIATION_KEYS.join(', ')} }.`,
    );
    return undefined;
  }
  const variationsWhere = `${where}, variations`;
  checkUnknownKeys(value, VARIATION_KEYS, variationsWhere, errors);
  const easier = checkText(value.easier, 'easier', variationsWhere, errors);
  const harder = checkText(value.harder, 'harder', variationsWhere, errors);
  return easier !== null && harder !== null ? { easier, harder } : undefined;
}

/** { surface, sequence, equipment } non vides ; null sinon. */
function checkSetup(value: unknown, where: string, errors: string[]): ExerciseSetup | null {
  if (!isRecord(value)) {
    errors.push(`${where} : ${fieldError('setup', value)} ; attendu un objet { ${SETUP_KEYS.join(', ')} }.`);
    return null;
  }
  const setupWhere = `${where}, setup`;
  checkUnknownKeys(value, SETUP_KEYS, setupWhere, errors);
  const surface = checkText(value.surface, 'surface', setupWhere, errors);
  const sequence = checkText(value.sequence, 'sequence', setupWhere, errors);
  const equipment = checkText(value.equipment, 'equipment', setupWhere, errors);
  return surface !== null && sequence !== null && equipment !== null ? { surface, sequence, equipment } : null;
}

/** null, ou nom de fichier simple ; undefined si invalide (null est une valeur permise). */
function checkDiagram(value: unknown, where: string, errors: string[]): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && DIAGRAM_PATTERN.test(value)) {
    return value;
  }
  errors.push(
    `${where} : ${fieldError('diagram', value)} ; attendu null ou un nom de fichier du bucket diagrams (lettres, chiffres, « . », « _ », « - »).`,
  );
  return undefined;
}

/** Tableau non vide de mesures valides, key unique dans la fiche ; null sinon. */
function checkMeasures(
  value: unknown,
  where: string,
  measureKeys: Map<string, string>,
  errors: string[],
): Measure[] | null {
  if (!isArray(value) || value.length === 0) {
    errors.push(
      `${where} : ${fieldError('measures', value)} ; un bloc de test porte au moins une mesure { ${MEASURE_KEYS.join(', ')} }.`,
    );
    return null;
  }
  const measures: Measure[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const measureWhere = `${where}, mesure ${index + 1}`;
    const measure = checkMeasure(item, measureWhere, errors);
    if (measure === null) {
      valid = false;
      continue;
    }
    const first = measureKeys.get(measure.key);
    if (first === undefined) {
      measureKeys.set(measure.key, measureWhere);
    } else {
      errors.push(`${measureWhere} : key "${measure.key}" déjà employée (${first}) ; une key est unique dans la fiche.`);
      valid = false;
    }
    measures.push(measure);
  }
  return valid ? measures : null;
}

/** Une mesure { key, name, unit, higher_is_better } ; null si elle a une erreur. */
function checkMeasure(item: unknown, where: string, errors: string[]): Measure | null {
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${MEASURE_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, MEASURE_KEYS, where, errors);
  const key = checkMeasureKey(item.key, where, errors);
  const name = checkText(item.name, 'name', where, errors);
  const unit = checkText(item.unit, 'unit', where, errors);
  const higherIsBetter = checkBoolean(item.higher_is_better, 'higher_is_better', where, errors);
  if (key === null || name === null || unit === null || higherIsBetter === null) {
    return null;
  }
  return { key, name, unit, higher_is_better: higherIsBetter };
}

function checkMeasureKey(value: unknown, where: string, errors: string[]): string | null {
  if (typeof value === 'string' && MEASURE_KEY_PATTERN.test(value)) {
    return value;
  }
  errors.push(`${where} : ${fieldError('key', value)} ; attendu un identifiant snake_case (« tir_precision_droit »).`);
  return null;
}

/** Tableau non vide de textes non vides ; null sinon. */
function checkTextList(value: unknown, field: string, where: string, errors: string[]): string[] | null {
  if (!isArray(value) || value.length === 0) {
    errors.push(`${where} : ${fieldError(field, value)} ; attendu un tableau non vide de textes.`);
    return null;
  }
  const texts: string[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const text = checkText(item, `${field}, ligne ${index + 1}`, where, errors);
    if (text === null) {
      valid = false;
    } else {
      texts.push(text);
    }
  }
  return valid ? texts : null;
}

/** Chaîne non vide après trim ; null sinon. */
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

function checkBoolean(value: unknown, field: string, where: string, errors: string[]): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu true ou false.`);
  return null;
}

/** Clés hors de la liste attendue : une faute de frappe (« sucess_criteria ») est signalée, pas ignorée. */
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

/** Début d'un message sur un champ : « clé "goal" absente » ou « goal "" invalide ». */
function fieldError(field: string, value: unknown): string {
  // JSON.parse ne produit jamais undefined : undefined veut dire clé absente.
  return value === undefined ? `clé "${field}" absente` : `${field} ${describeValue(value)} invalide`;
}

/** Même chose pour une valeur dont l'endroit nomme déjà le champ (exercises, intro). */
function valueError(value: unknown): string {
  return value === undefined ? 'clé absente' : `${describeValue(value)} invalide`;
}

/** Valeur fautive telle qu'écrite en JSON (une chaîne garde ses guillemets), abrégée. */
function describeValue(value: unknown): string {
  return truncate(JSON.stringify(value), VALUE_LENGTH);
}

/** « exercice 2 « Slalom pied gauche » » : de quoi retrouver l'exercice dans le JSON. */
function locate(label: string, title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') {
    return label;
  }
  return `${label} « ${truncate(title.trim().replace(/\s+/g, ' '), EXCERPT_LENGTH)} »`;
}

/** Les premières erreurs, une par ligne, puis le nombre des suivantes. */
function summarizeErrors(errors: readonly string[]): string {
  if (errors.length <= MAX_SHOWN_ERRORS) {
    return errors.join('\n');
  }
  const rest = errors.length - MAX_SHOWN_ERRORS;
  const plural = rest > 1 ? 's' : '';
  return [...errors.slice(0, MAX_SHOWN_ERRORS), `… et ${rest} autre${plural} erreur${plural}.`].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Array.isArray sans le any[] qu'il infère : les éléments restent à vérifier. */
function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Au plus `max` caractères, « … » si coupé (Array.from : sans couper un caractère en deux). */
function truncate(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}
