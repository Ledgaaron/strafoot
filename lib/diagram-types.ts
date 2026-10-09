// Format des schémas dessinés par l'app (components/diagram.tsx) : colonne jsonb
// questions.diagram (migration 009) et clé diagram_data d'un exercice
// (training_sheets.exercises, lib/sheet-types.ts). C'est le format des entrées de
// supabase/content/diagrams_NNN.json et des diagram_data de tests_atomic_NNN.json.
// Validation partagée : lib/db/questions.ts à la lecture en base,
// lib/sheet-types.ts pour les exercices, et les deux scripts de seed avant
// d'écrire le SQL. Seul import : les dimensions du cadre (lib/diagrams.ts) ;
// le module se charge hors de l'app, avec npx tsx.
//
// Repère terrain (vues full, half_right, half_left, box_right) : 105 × 68 m, x de
// 0 (but de gauche) à 105 (but de droite), y de 0 (touche du haut) à 68. L'équipe
// qui a le ballon attaque vers la droite : but attaqué en x = 105. En phase de
// pressing (eux au ballon, partant de leur but en x = 0), vue half_left.
// Repère local (vue local, tests) : mètres depuis le coin haut gauche, x de 0 à
// width_m, y de 0 à width_m × 646 / 722 (ratio du cadre).
// Le dessin garde les vraies distances (même échelle en x et en y) ; la vue dit
// quelle zone doit être visible, le cadre 722 × 646 en montre parfois plus.

import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from './diagrams';

/** Longueur et largeur du terrain, en mètres. */
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
/** Ligne médiane. */
export const HALFWAY_X = PITCH_LENGTH / 2;

/**
 * full : tout le terrain ; half_right : x ≥ 52,5 (attaque) ; half_left : x ≤ 52,5
 * (pressing, relance) ; box_right : x ≥ 80 et 10 ≤ y ≤ 58 (la surface de droite et
 * ses abords) ; local : repère d'un test, largeur width_m.
 */
export type DiagramView = 'full' | 'half_right' | 'half_left' | 'box_right' | 'local';

export const DIAGRAM_VIEWS: readonly DiagramView[] = ['full', 'half_right', 'half_left', 'box_right', 'local'];

export type Point = { x: number; y: number };

/** Zone où tout élément du schéma doit se trouver, en mètres. */
export type Region = { xMin: number; xMax: number; yMin: number; yMax: number };

export type Team = 'us' | 'them';

/** Marche, course, sprint : longueur et épaisseur de la flèche de vitesse. */
export type Speed = 'walk' | 'run' | 'sprint';

/** Flèche de vitesse à côté du joueur : direction (dx, dy, dans le repère du schéma) et allure. */
export type PlayerMove = { dx: number; dy: number; speed: Speed };

export type DiagramPlayer = {
  /** Identifiant unique dans le schéma (« us7 »), cible des options. */
  id: string;
  team: Team;
  /** Numéro de maillot, 1 à 99 ; null : disque sans numéro. */
  number: number | null;
  x: number;
  y: number;
  /** Toi : halo violet ; un seul joueur au plus, de l'équipe us. */
  you: boolean;
  /** Porteur du ballon, collé à lui. */
  ball: boolean;
  move: PlayerMove | null;
};

/** Plot, but (mini-but), mur de frappe, zone, mannequin. */
export type DiagramObjectType = 'cone' | 'goal' | 'wall' | 'zone' | 'mannequin';

export type DiagramObject = {
  type: DiagramObjectType;
  /** Centre de l'objet. */
  x: number;
  y: number;
  /** Étendue en x et en y, en mètres : goal, wall et zone seulement (obligatoires) ; null sinon. */
  w: number | null;
  h: number | null;
  /** Étiquette (« 0 m », « 30 m », « Zone de frappe ») ; null : aucune. */
  label: string | null;
};

/** Numéro d'une option, repris dans les réponses. */
export type OptionId = 1 | 2 | 3 | 4;

export const OPTION_IDS: readonly OptionId[] = [1, 2, 3, 4];

/** Passe : pointillé. Conduite, course, tir : trait plein. Hold : petit arc sur place. */
export type OptionKind = 'pass' | 'dribble' | 'run' | 'shot' | 'hold';

/** Fin d'une option : un point, ou un joueur (player = son id, x et y = sa position). */
export type OptionTarget = Point & { player: string | null };

export type DiagramOption = {
  id: OptionId;
  kind: OptionKind;
  /** Joueur d'où part l'option : from du JSON, sinon le joueur you. */
  from: string;
  /** null pour un hold, qui reste sur place. */
  to: OptionTarget | null;
  /** Points de passage, dans l'ordre (course en courbe) ; [] : trait direct. */
  path: Point[];
};

/** Trajet d'un test : course sans ballon, ou conduite (ballon posé au départ). */
export type PathStyle = 'run' | 'dribble';

export type DiagramPath = { points: Point[]; style: PathStyle };

/** Encart en haut à gauche : score (nous–eux) et minute ; l'un des deux au moins. */
export type DiagramContext = {
  score: { us: number; them: number } | null;
  minute: number | null;
};

/** Schéma validé. Clés facultatives du JSON absentes : null, ou [] pour une liste. */
export type DiagramData = {
  view: DiagramView;
  /** Largeur du repère local en mètres (vue local) ; null pour une vue de terrain. */
  width_m: number | null;
  context: DiagramContext | null;
  players: DiagramPlayer[];
  /** Ballon libre ; null : pas de ballon libre (il peut être collé à un porteur). */
  ball: Point | null;
  objects: DiagramObject[];
  options: DiagramOption[];
  path: DiagramPath | null;
};

/** Score (0 à 3) de chaque option, selon son numéro. */
export type OptionScores = Readonly<Record<OptionId, 0 | 1 | 2 | 3>>;

/** Après réponse : l'option choisie et le score de chacune. */
export type DiagramResult = { chosen: OptionId; scores: OptionScores };

/** Lecture validée : la donnée, ou une erreur lisible (jamais d'exception). */
export type DiagramParseResult = { data: DiagramData; error: null } | { data: null; error: string };

const ROOT_KEYS: readonly string[] = ['view', 'width_m', 'context', 'players', 'ball', 'objects', 'options', 'path'];
const CONTEXT_KEYS: readonly string[] = ['score', 'minute'];
const PLAYER_KEYS: readonly string[] = ['id', 'team', 'number', 'x', 'y', 'you', 'ball', 'move'];
const MOVE_KEYS: readonly string[] = ['dx', 'dy', 'speed'];
const OBJECT_KEYS: readonly string[] = ['type', 'x', 'y', 'w', 'h', 'label'];
const OPTION_KEYS: readonly string[] = ['id', 'kind', 'from', 'to', 'path'];
const PATH_KEYS: readonly string[] = ['points', 'style'];
const POINT_KEYS: readonly string[] = ['x', 'y'];
const TEAMS: readonly Team[] = ['us', 'them'];
const SPEEDS: readonly Speed[] = ['walk', 'run', 'sprint'];
const OBJECT_TYPES: readonly DiagramObjectType[] = ['cone', 'goal', 'wall', 'zone', 'mannequin'];
/** Objets à étendue : w et h obligatoires ; les autres ont une taille fixe à l'écran. */
const SIZED_OBJECTS: readonly DiagramObjectType[] = ['goal', 'wall', 'zone'];
const OPTION_KINDS: readonly OptionKind[] = ['pass', 'dribble', 'run', 'shot', 'hold'];
const PATH_STYLES: readonly PathStyle[] = ['run', 'dribble'];
/** « us7 », « them_4 », « joueur » : de quoi le citer dans une option. */
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Score nous-eux : « 2-1 ». */
const SCORE_PATTERN = /^(\d{1,2})-(\d{1,2})$/;
const MAX_NUMBER = 99;
const MAX_MINUTE = 130;
/** Une option va quelque part : sa fin est à plus de 0,5 m de son départ. */
const MIN_OPTION_LENGTH = 0.5;
/** Erreurs affichées à l'écran au plus ; les suivantes sont résumées. */
const MAX_SHOWN_ERRORS = 5;
const VALUE_LENGTH = 60;

/** Région de chaque vue de terrain ; local : calculée depuis width_m. */
const PITCH_REGIONS: Readonly<Record<Exclude<DiagramView, 'local'>, Region>> = {
  full: { xMin: 0, xMax: PITCH_LENGTH, yMin: 0, yMax: PITCH_WIDTH },
  half_right: { xMin: HALFWAY_X, xMax: PITCH_LENGTH, yMin: 0, yMax: PITCH_WIDTH },
  half_left: { xMin: 0, xMax: HALFWAY_X, yMin: 0, yMax: PITCH_WIDTH },
  // La surface (40,3 m de large) et 4 m de chaque côté : plus étroit, le cadre
  // 722 × 646 la couperait.
  box_right: { xMin: 80, xMax: PITCH_LENGTH, yMin: 10, yMax: 58 },
};

/** Zone que la vue doit montrer, où tout élément du schéma doit se trouver. */
export function viewRegion(view: DiagramView, widthM: number | null): Region {
  if (view !== 'local') {
    return PITCH_REGIONS[view];
  }
  const width = widthM ?? 0;
  return { xMin: 0, xMax: width, yMin: 0, yMax: (width * DIAGRAM_HEIGHT) / DIAGRAM_WIDTH };
}

/**
 * Option affichée ↔ option du schéma : id = rang de l'option dans questions.options
 * (jsonb), à partir de 1. Le mélange des réponses (chantier 13b) devra garder ce
 * rang d'origine. null hors de 0 à 3.
 */
export function optionIdOfIndex(index: number): OptionId | null {
  return OPTION_IDS.find((id) => id === index + 1) ?? null;
}

/** Schéma lu en base ; erreur lisible (les 5 premiers problèmes) s'il ne respecte pas le format. */
export function parseDiagram(value: unknown): DiagramParseResult {
  const { value: diagram, errors } = validateDiagram(value);
  if (diagram === null || errors.length > 0) {
    return { data: null, error: summarizeErrors(errors) };
  }
  return { data: diagram, error: null };
}

/**
 * Schéma et toutes ses erreurs, une par problème, sous la forme « <endroit> :
 * <problème>. » (endroit : « view », « joueur 3 « us7 » », « option 2 », « objet
 * 1 (cone) », « path, point 2 »…). Le schéma ne sert que si `errors` est vide.
 * Règles : racine aux clés de ROOT_KEYS, view et players obligatoires ; width_m
 * pour la vue local seulement (nombre > 0, au plus 105) ; tout point (joueurs,
 * ballon, objets, options, trajet) dans le terrain puis dans la vue (local : dans
 * le repère) ; joueurs d'id uniques, un seul you (us), un seul ballon (porteur ou
 * libre) ; objets goal, wall et zone avec w et h, cone et mannequin sans ;
 * options de 1 à 4, id uniques, from (sinon le joueur you) et to (point ou joueur)
 * existants, hold sur place, sans path ; trajet de 2 points au moins.
 */
export function validateDiagram(value: unknown): { value: DiagramData | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    errors.push(`schéma : ${describeValue(value)} invalide ; attendu un objet { view, players, … }.`);
    return { value: null, errors };
  }
  checkUnknownKeys(value, ROOT_KEYS, 'schéma', errors);

  const view = checkChoice(value.view, 'view', DIAGRAM_VIEWS, 'schéma', errors);
  const widthM = view === null ? undefined : checkWidth(value.width_m, view, errors);
  if (view === null || widthM === undefined) {
    // Sans vue lisible, aucun point ne peut être situé : le reste attendrait une correction.
    return { value: null, errors };
  }
  const area: Area = { view, region: viewRegion(view, widthM) };

  const context = checkContext(value.context, errors);
  const players = checkPlayers(value.players, area, errors);
  // undefined : ballon libre invalide (null : pas de ballon libre).
  const ball = value.ball === undefined ? null : (checkPoint(value.ball, 'ball', area, errors) ?? undefined);
  const objects = checkObjects(value.objects, area, errors);
  const options = players === null ? null : checkOptions(value.options, players, area, errors);
  const path = value.path === undefined ? null : checkPath(value.path, area, errors);

  if (players !== null) {
    const carriers = players.filter((player) => player.ball).length;
    if (carriers + (value.ball === undefined ? 0 : 1) > 1) {
      errors.push('ballon : un seul par schéma, collé à un porteur (ball: true) ou libre (ball de la racine).');
    }
  }
  if (
    context === undefined ||
    players === null ||
    ball === undefined ||
    objects === null ||
    options === null ||
    path === undefined ||
    errors.length > 0
  ) {
    return { value: null, errors };
  }
  return { value: { view, width_m: widthM, context, players, ball, objects, options, path }, errors };
}

/** Vue d'un schéma et sa région, pour situer chaque point. */
type Area = { view: DiagramView; region: Region };

/** width_m : obligatoire pour local (nombre > 0, au plus 105), interdit sinon ; undefined si invalide. */
function checkWidth(value: unknown, view: DiagramView, errors: string[]): number | null | undefined {
  if (view !== 'local') {
    if (value === undefined) {
      return null;
    }
    errors.push('schéma : width_m ne vaut que pour la vue local ; une vue de terrain a le repère 105 × 68.');
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= PITCH_LENGTH) {
    return value;
  }
  errors.push(
    `schéma : ${fieldError('width_m', value)} ; la vue local demande sa largeur en mètres (nombre > 0, au plus ${PITCH_LENGTH}).`,
  );
  return undefined;
}

/** Absent : null ; sinon { score « 2-1 », minute 1-130 }, l'un des deux au moins ; undefined si invalide. */
function checkContext(value: unknown, errors: string[]): DiagramContext | null | undefined {
  if (value === undefined) {
    return null;
  }
  const where = 'context';
  if (!isRecord(value) || (value.score === undefined && value.minute === undefined)) {
    errors.push(`${where} : ${describeValue(value)} invalide ; attendu { score: "2-1", minute: 78 }, l'un des deux au moins.`);
    return undefined;
  }
  checkUnknownKeys(value, CONTEXT_KEYS, where, errors);
  let score: DiagramContext['score'] = null;
  let valid = true;
  if (value.score !== undefined) {
    const match = typeof value.score === 'string' ? SCORE_PATTERN.exec(value.score) : null;
    if (match) {
      score = { us: Number(match[1]), them: Number(match[2]) };
    } else {
      errors.push(`${where} : ${fieldError('score', value.score)} ; attendu "nous-eux", par exemple "2-1".`);
      valid = false;
    }
  }
  let minute: number | null = null;
  if (value.minute !== undefined) {
    if (isIntegerIn(value.minute, 1, MAX_MINUTE)) {
      minute = value.minute;
    } else {
      errors.push(`${where} : ${fieldError('minute', value.minute)} ; attendu un entier de 1 à ${MAX_MINUTE}.`);
      valid = false;
    }
  }
  return valid ? { score, minute } : undefined;
}

/** Tableau (éventuellement vide) de joueurs valides, id uniques, un seul you ; null sinon. */
function checkPlayers(value: unknown, area: Area, errors: string[]): DiagramPlayer[] | null {
  if (!isArray(value)) {
    errors.push(`schéma : ${fieldError('players', value)} ; attendu un tableau de joueurs (vide pour un test sans joueur).`);
    return null;
  }
  const players: DiagramPlayer[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const player = checkPlayer(item, index + 1, area, errors);
    if (player === null) {
      valid = false;
      continue;
    }
    if (players.some((other) => other.id === player.id)) {
      errors.push(`${playerWhere(index + 1, player.id)} : id "${player.id}" déjà employé ; un id est unique dans le schéma.`);
      valid = false;
    }
    players.push(player);
  }
  if (players.filter((player) => player.you).length > 1) {
    errors.push('joueurs : plusieurs you ; un seul joueur porte le halo violet.');
    valid = false;
  }
  return valid ? players : null;
}

function checkPlayer(item: unknown, number: number, area: Area, errors: string[]): DiagramPlayer | null {
  const where = playerWhere(number, isRecord(item) ? item.id : undefined);
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${PLAYER_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, PLAYER_KEYS, where, errors);
  let valid = true;
  const id = typeof item.id === 'string' && PLAYER_ID_PATTERN.test(item.id) ? item.id : null;
  if (id === null) {
    errors.push(`${where} : ${fieldError('id', item.id)} ; attendu lettres, chiffres, « _ » ou « - » (« us7 »).`);
    valid = false;
  }
  const team = checkChoice(item.team, 'team', TEAMS, where, errors);
  let shirt: number | null = null;
  if (item.number !== undefined) {
    if (isIntegerIn(item.number, 1, MAX_NUMBER)) {
      shirt = item.number;
    } else {
      errors.push(`${where} : ${fieldError('number', item.number)} ; attendu un entier de 1 à ${MAX_NUMBER}.`);
      valid = false;
    }
  }
  const point = checkCoordinates(item, where, area, errors);
  const you = checkOptionalBoolean(item.you, 'you', where, errors);
  const ball = checkOptionalBoolean(item.ball, 'ball', where, errors);
  if (you === true && team === 'them') {
    errors.push(`${where} : you sur un joueur de l'équipe them ; le halo violet est toujours sur un joueur us.`);
    valid = false;
  }
  const move = item.move === undefined ? null : checkMove(item.move, where, errors);
  if (!valid || id === null || team === null || point === null || you === null || ball === null || move === undefined) {
    return null;
  }
  return { id, team, number: shirt, x: point.x, y: point.y, you, ball, move };
}

/** { dx, dy, speed }, direction non nulle ; undefined si invalide. */
function checkMove(value: unknown, where: string, errors: string[]): PlayerMove | undefined {
  const moveWhere = `${where}, move`;
  if (!isRecord(value)) {
    errors.push(`${moveWhere} : ${describeValue(value)} invalide ; attendu { dx, dy, speed: walk | run | sprint }.`);
    return undefined;
  }
  checkUnknownKeys(value, MOVE_KEYS, moveWhere, errors);
  const dx = checkFinite(value.dx, 'dx', moveWhere, errors);
  const dy = checkFinite(value.dy, 'dy', moveWhere, errors);
  const speed = checkChoice(value.speed, 'speed', SPEEDS, moveWhere, errors);
  if (dx === null || dy === null || speed === null) {
    return undefined;
  }
  if (dx === 0 && dy === 0) {
    errors.push(`${moveWhere} : dx et dy nuls ; la flèche de vitesse a besoin d'une direction.`);
    return undefined;
  }
  return { dx, dy, speed };
}

/** Absent : [] ; sinon un tableau d'objets valides ; null s'il y a une erreur. */
function checkObjects(value: unknown, area: Area, errors: string[]): DiagramObject[] | null {
  if (value === undefined) {
    return [];
  }
  if (!isArray(value)) {
    errors.push(`schéma : ${fieldError('objects', value)} ; attendu un tableau d'objets { ${OBJECT_KEYS.join(', ')} }.`);
    return null;
  }
  const objects: DiagramObject[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const object = checkObject(item, index + 1, area, errors);
    if (object === null) {
      valid = false;
    } else {
      objects.push(object);
    }
  }
  return valid ? objects : null;
}

function checkObject(item: unknown, number: number, area: Area, errors: string[]): DiagramObject | null {
  const type = isRecord(item) && typeof item.type === 'string' ? ` (${item.type})` : '';
  const where = `objet ${number}${type}`;
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${OBJECT_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, OBJECT_KEYS, where, errors);
  const objectType = checkChoice(item.type, 'type', OBJECT_TYPES, where, errors);
  const point = checkCoordinates(item, where, area, errors);
  let w: number | null = null;
  let h: number | null = null;
  let valid = true;
  if (objectType !== null && SIZED_OBJECTS.includes(objectType)) {
    w = checkExtent(item.w, 'w', where, errors);
    h = checkExtent(item.h, 'h', where, errors);
    valid = w !== null && h !== null;
  } else if (objectType !== null && (item.w !== undefined || item.h !== undefined)) {
    errors.push(`${where} : w et h ne valent que pour ${SIZED_OBJECTS.join(', ')} ; un ${objectType} a une taille fixe.`);
    valid = false;
  }
  let label: string | null = null;
  if (item.label !== undefined) {
    if (typeof item.label === 'string' && item.label.trim() !== '') {
      label = item.label;
    } else {
      errors.push(`${where} : ${fieldError('label', item.label)} ; attendu une chaîne non vide.`);
      valid = false;
    }
  }
  if (!valid || objectType === null || point === null) {
    return null;
  }
  return { type: objectType, x: point.x, y: point.y, w, h, label };
}

/** Étendue d'un objet : nombre > 0, au plus la longueur du terrain ; null sinon. */
function checkExtent(value: unknown, field: string, where: string, errors: string[]): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= PITCH_LENGTH) {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu une étendue en mètres (nombre > 0, au plus ${PITCH_LENGTH}).`);
  return null;
}

/** Absent : [] ; sinon 1 à 4 options valides, id uniques ; null s'il y a une erreur. */
function checkOptions(
  value: unknown,
  players: readonly DiagramPlayer[],
  area: Area,
  errors: string[],
): DiagramOption[] | null {
  if (value === undefined) {
    return [];
  }
  if (!isArray(value) || value.length === 0 || value.length > OPTION_IDS.length) {
    errors.push(
      `schéma : ${fieldError('options', value)} ; attendu un tableau de 1 à ${OPTION_IDS.length} options { ${OPTION_KEYS.join(', ')} }.`,
    );
    return null;
  }
  const options: DiagramOption[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const option = checkOption(item, index + 1, players, area, errors);
    if (option === null) {
      valid = false;
      continue;
    }
    if (options.some((other) => other.id === option.id)) {
      errors.push(`option ${option.id} : id en double ; chaque numéro de 1 à 4 désigne une seule option.`);
      valid = false;
    }
    options.push(option);
  }
  return valid ? options : null;
}

function checkOption(
  item: unknown,
  number: number,
  players: readonly DiagramPlayer[],
  area: Area,
  errors: string[],
): DiagramOption | null {
  const where = isRecord(item) && typeof item.id === 'number' ? `option ${item.id}` : `option n° ${number} de la liste`;
  if (!isRecord(item)) {
    errors.push(`${where} : ${describeValue(item)} invalide ; attendu un objet { ${OPTION_KEYS.join(', ')} }.`);
    return null;
  }
  checkUnknownKeys(item, OPTION_KEYS, where, errors);
  const id = OPTION_IDS.find((optionId) => optionId === item.id) ?? null;
  if (id === null) {
    errors.push(`${where} : ${fieldError('id', item.id)} ; attendu 1, 2, 3 ou 4 (rang de l'option dans la question).`);
  }
  const kind = checkChoice(item.kind, 'kind', OPTION_KINDS, where, errors);
  const from = checkFrom(item.from, players, where, errors);
  if (kind === null || from === null) {
    return null;
  }
  if (kind === 'hold') {
    if (item.path !== undefined) {
      errors.push(`${where} : path dans un hold ; un hold reste sur place.`);
      return null;
    }
    if (!checkHoldTarget(item.to, from, where, errors)) {
      return null;
    }
    return id === null ? null : { id, kind, from: from.id, to: null, path: [] };
  }
  const to = checkTarget(item.to, from, players, where, area, errors);
  const path = item.path === undefined ? [] : checkPoints(item.path, `${where}, path`, 1, area, errors);
  if (id === null || to === null || path === null) {
    return null;
  }
  return { id, kind, from: from.id, to, path };
}

/** Joueur d'où part l'option : from s'il est donné, sinon le joueur you ; null s'il n'existe pas. */
function checkFrom(
  value: unknown,
  players: readonly DiagramPlayer[],
  where: string,
  errors: string[],
): DiagramPlayer | null {
  if (value === undefined) {
    const you = players.find((player) => player.you);
    if (you === undefined) {
      errors.push(`${where} : pas de from et aucun joueur you ; de qui part l'option ?`);
      return null;
    }
    return you;
  }
  const player = players.find((candidate) => candidate.id === value);
  if (player === undefined) {
    errors.push(`${where} : from ${describeValue(value)} n'est aucun joueur du schéma ; attendu l'id d'un joueur.`);
    return null;
  }
  return player;
}

/** Fin d'une option : l'id d'un autre joueur, ou un point de la vue, à distance du départ ; null sinon. */
function checkTarget(
  value: unknown,
  from: DiagramPlayer,
  players: readonly DiagramPlayer[],
  where: string,
  area: Area,
  errors: string[],
): OptionTarget | null {
  if (typeof value === 'string') {
    const player = players.find((candidate) => candidate.id === value);
    if (player === undefined) {
      errors.push(`${where} : to "${value}" n'est aucun joueur du schéma ; attendu l'id d'un joueur ou un point { x, y }.`);
      return null;
    }
    if (player.id === from.id) {
      errors.push(`${where} : to "${value}" est le joueur de départ ; une option qui reste sur place est un hold.`);
      return null;
    }
    return { x: player.x, y: player.y, player: player.id };
  }
  if (value === undefined) {
    errors.push(`${where} : clé "to" absente ; attendu l'id d'un joueur ou un point { x, y }.`);
    return null;
  }
  const point = checkPoint(value, `${where}, to`, area, errors);
  if (point === null) {
    return null;
  }
  if (Math.hypot(point.x - from.x, point.y - from.y) <= MIN_OPTION_LENGTH) {
    errors.push(`${where} : to au même endroit que le joueur de départ ; une option qui reste sur place est un hold.`);
    return null;
  }
  return { x: point.x, y: point.y, player: null };
}

/** to d'un hold : absent, ou le joueur de départ (son id ou sa position exacte). */
function checkHoldTarget(value: unknown, from: DiagramPlayer, where: string, errors: string[]): boolean {
  if (value === undefined || value === from.id) {
    return true;
  }
  if (isRecord(value) && value.x === from.x && value.y === from.y && Object.keys(value).length === POINT_KEYS.length) {
    return true;
  }
  errors.push(
    `${where} : to ${describeValue(value)} pour un hold ; un hold reste sur place (to absent, "${from.id}" ou { x: ${from.x}, y: ${from.y} }).`,
  );
  return false;
}

/** Trajet d'un test : { points (2 au moins), style run | dribble } ; undefined si invalide. */
function checkPath(value: unknown, area: Area, errors: string[]): DiagramPath | undefined {
  const where = 'path';
  if (!isRecord(value)) {
    errors.push(`${where} : ${describeValue(value)} invalide ; attendu { points: [{ x, y }, …], style: run | dribble }.`);
    return undefined;
  }
  checkUnknownKeys(value, PATH_KEYS, where, errors);
  const points = checkPoints(value.points, `${where}, points`, 2, area, errors);
  const style = checkChoice(value.style, 'style', PATH_STYLES, where, errors);
  return points === null || style === null ? undefined : { points, style };
}

/** Tableau d'au moins `min` points de la vue ; null sinon. */
function checkPoints(value: unknown, where: string, min: number, area: Area, errors: string[]): Point[] | null {
  if (!isArray(value) || value.length < min) {
    errors.push(`${where} : ${describeValue(value)} invalide ; attendu un tableau d'au moins ${min} point${min > 1 ? 's' : ''} { x, y }.`);
    return null;
  }
  const points: Point[] = [];
  let valid = true;
  for (const [index, item] of value.entries()) {
    const point = checkPoint(item, `${where}, point ${index + 1}`, area, errors);
    if (point === null) {
      valid = false;
    } else {
      points.push(point);
    }
  }
  return valid ? points : null;
}

/** Un point { x, y } de la vue ; null sinon. */
function checkPoint(value: unknown, where: string, area: Area, errors: string[]): Point | null {
  if (!isRecord(value)) {
    errors.push(`${where} : ${describeValue(value)} invalide ; attendu un point { x, y }.`);
    return null;
  }
  checkUnknownKeys(value, POINT_KEYS, where, errors);
  return checkCoordinates(value, where, area, errors);
}

/**
 * x et y d'un élément : des nombres, dans le terrain (vues de terrain) puis dans
 * la vue ; dans le repère pour la vue local. null sinon.
 */
function checkCoordinates(item: Record<string, unknown>, where: string, area: Area, errors: string[]): Point | null {
  const x = checkFinite(item.x, 'x', where, errors);
  const y = checkFinite(item.y, 'y', where, errors);
  if (x === null || y === null) {
    return null;
  }
  const { view, region } = area;
  const at = `(${formatMeters(x)} ; ${formatMeters(y)})`;
  if (view === 'local') {
    if (!isInside(x, y, region)) {
      errors.push(`${where} : ${at} hors du repère local (${describeRegion(region)}).`);
      return null;
    }
    return { x, y };
  }
  if (!isInside(x, y, PITCH_REGIONS.full)) {
    errors.push(`${where} : ${at} hors du terrain (${describeRegion(PITCH_REGIONS.full)}).`);
    return null;
  }
  if (!isInside(x, y, region)) {
    errors.push(`${where} : ${at} hors de la vue ${view} (${describeRegion(region)}).`);
    return null;
  }
  return { x, y };
}

function isInside(x: number, y: number, region: Region): boolean {
  return x >= region.xMin && x <= region.xMax && y >= region.yMin && y <= region.yMax;
}

/** « x de 52,5 à 105, y de 0 à 68 ». */
function describeRegion(region: Region): string {
  return `x de ${formatMeters(region.xMin)} à ${formatMeters(region.xMax)}, y de ${formatMeters(region.yMin)} à ${formatMeters(region.yMax)}`;
}

/** Nombre en français, au dixième au plus : « 52,5 », « 26,8 ». */
function formatMeters(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/** « joueur 3 « us7 » » : de quoi retrouver le joueur dans le JSON. */
function playerWhere(number: number, id: unknown): string {
  return typeof id === 'string' && id !== '' ? `joueur ${number} « ${id} »` : `joueur ${number}`;
}

function checkFinite(value: unknown, field: string, where: string, errors: string[]): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu un nombre.`);
  return null;
}

/** Absent : false ; sinon true ou false ; null si invalide. */
function checkOptionalBoolean(value: unknown, field: string, where: string, errors: string[]): boolean | null {
  if (value === undefined) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; attendu true ou false.`);
  return null;
}

/** Valeur d'une liste fermée ; null sinon. */
function checkChoice<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  where: string,
  errors: string[],
): T | null {
  const choice = allowed.find((candidate) => candidate === value);
  if (choice !== undefined) {
    return choice;
  }
  errors.push(`${where} : ${fieldError(field, value)} ; valeurs permises : ${allowed.join(', ')}.`);
  return null;
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Clés hors de la liste attendue : une faute de frappe (« speeed ») est signalée, pas ignorée. */
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

/** Début d'un message sur un champ : « clé "view" absente » ou « view "demi" invalide ». */
function fieldError(field: string, value: unknown): string {
  // JSON.parse ne produit jamais undefined : undefined veut dire clé absente.
  return value === undefined ? `clé "${field}" absente` : `${field} ${describeValue(value)} invalide`;
}

/** Valeur fautive telle qu'écrite en JSON (une chaîne garde ses guillemets), abrégée. */
function describeValue(value: unknown): string {
  const json = JSON.stringify(value) ?? String(value);
  const characters = Array.from(json);
  return characters.length > VALUE_LENGTH ? `${characters.slice(0, VALUE_LENGTH).join('')}…` : json;
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
