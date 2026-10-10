// Géométrie des schémas, sans dessin ni react-native : cadre, terrain, flèches
// de vitesse, trajet d'un test, traits des options, places des pastilles et des
// étiquettes d'objets. components/diagram.tsx la dessine en SVG. Tout est en
// pixels de la DA (schéma de 358 px de large sur un écran de 390, cadre
// 722 × 646), mis à l'échelle de la largeur réelle au dessin. Module pur, sans
// lib/theme.ts (qui importe react-native) : testé par
// components/diagram-layout.test.ts (npx tsx) sur les schémas pilotes.

import {
  HALFWAY_X,
  PITCH_LENGTH,
  PITCH_WIDTH,
  viewRegion,
  type DiagramData,
  type DiagramObject,
  type DiagramOption,
  type DiagramPlayer,
  type Point,
  type Speed,
} from '../lib/diagram-types';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from '../lib/diagrams';

/** Repère du dessin, en pixels de la DA. */
export const VIEW_WIDTH = 358;
export const VIEW_HEIGHT = (VIEW_WIDTH * DIAGRAM_HEIGHT) / DIAGRAM_WIDTH;
/** Autour de la vue : le halo d'un joueur posé sur une ligne reste entier. */
const FRAME_MARGIN = 18;

// Terrain, en mètres (lois du jeu).
const CENTER_Y = PITCH_WIDTH / 2;
const CIRCLE_RADIUS = 9.15;
const PENALTY_AREA = { depth: 16.5, width: 40.32 };
const GOAL_AREA = { depth: 5.5, width: 18.32 };
const PENALTY_SPOT = 11;
const GOAL = { depth: 2, width: 7.32 };

// Tailles en pixels de la DA.
/** Point du centre et points de penalty. */
export const SPOT_RADIUS = 2;
export const PLAYER_RADIUS = 11;
export const OPPONENT_RADIUS = 10;
export const OPPONENT_RING = 2.5;
export const HALO_RADIUS = 16;
export const HALO_WIDTH = 2.5;
export const BALL_RADIUS = 4.5;
export const BALL_RING = 1.5;
/** Bord extérieur du ballon, anneau compris. */
export const BALL_OUTER = BALL_RADIUS + BALL_RING / 2;
/** Ballon collé au porteur, en bas à gauche du disque. */
const BALL_OFFSET: Point = { x: -15, y: 15 };
/** Vitesse : longueur et épaisseur de la flèche, marche · course · sprint. */
export const SPEED_ARROWS: Readonly<Record<Speed, { length: number; width: number }>> = {
  walk: { length: 9, width: 2 },
  run: { length: 15, width: 2.5 },
  sprint: { length: 22, width: 3.2 },
};
/** Pointe d'une flèche de vitesse, posée 6 px au-delà du trait. */
const SPEED_HEAD = { length: 7, halfWidth: 4.5, ahead: 6 };
/** Écart entre un joueur et le début de ses flèches (vitesse, options). */
const ARROW_GAP = 3;
/** Écart entre la pointe d'une option et le joueur visé. */
const TARGET_GAP = 5;
/** Pointe d'une option ou du trajet ; le trait s'arrête sous elle (overlap). */
const ARROW_HEAD = { length: 11, halfWidth: 6, overlap: 3 };
/** Pastille d'une option : disque de 11 px cerclé de 2 px de surface. */
export const PASTILLE_RADIUS = 11;
export const PASTILLE_RING = 2;
/** Bord extérieur d'une pastille, anneau compris. */
export const PASTILLE_OUTER = PASTILLE_RADIUS + PASTILLE_RING / 2;
/** Écart minimal entre le bord d'une pastille et un joueur, un ballon ou une autre pastille. */
export const PASTILLE_GAP = 2;
/** En reculant, première place : juste avant la pointe, sans la couvrir. */
const FIRST_BACK = ARROW_HEAD.length + PASTILLE_OUTER + 1;
/** Puis la pastille recule le long du trait par pas de 4 px. */
const PASTILLE_STEP = 4;
/**
 * De côté : écarts essayés entre le trait et le centre de la pastille. Au plus
 * près, son bord longe la pointe sans la couvrir ; puis un peu plus loin.
 */
const SIDE_OFFSETS = [
  ARROW_HEAD.halfWidth + PASTILLE_OUTER,
  ARROW_HEAD.halfWidth + PASTILLE_OUTER + 2 * PASTILLE_STEP,
];
/** Hold : arc de 120° autour du joueur, pastille en son milieu. */
const HOLD_SPAN = (2 * Math.PI) / 3;
/**
 * Hold : directions essayées pour la pastille, en degrés (0 à droite, -90 en
 * haut) : les diagonales, haut, bas, les côtés, puis tous les 15°.
 */
const HOLD_ANGLES = [
  -45, -135, 45, 135, -90, 90, 0, 180, -60, -30, -120, -150, 60, 30, 120, 150, -75, -105, 75, 105, -15, -165, 15, 165,
];
/**
 * Demi-épaisseur d'un trait, arrondie au-dessus (3,5 px au plus) : une pastille
 * plus proche du trait d'une autre option le couvre.
 */
const STROKE_HALF = 2;
/** Plot : triangle de 9 px. */
export const CONE = { halfWidth: 4.5, top: 5, bottom: 4 };
/** Mannequin vu du dessus. */
export const MANNEQUIN = { width: 8, height: 16 };
/** Contour d'un but ; épaisseur minimale d'un mur ou d'une zone. */
export const OBJECT_STROKE = 2;
/**
 * Étiquette d'un objet : 14 px (fontSize.meta de lib/theme.ts, que ce module
 * n'importe pas), à 4 px de l'objet (spacing.xs).
 */
export const LABEL_SIZE = 14;
const LABEL_GAP = 4;
/** Largeur d'un caractère, en fraction de la taille : estimation large (le texte n'est pas mesuré). */
const CHAR_WIDTH = 0.6;
/** Ce qui passe à moins de 2 px d'une étiquette la touche. */
const LABEL_PAD = 2;
/** Chiffres et capitales centrés sur leur repère : ligne de base abaissée d'environ la moitié de leur hauteur. */
export const CAP_CENTER = 0.35;
/** Hauteur du texte au-dessus et au-dessous de sa ligne de base, en fraction de sa taille. */
const TEXT_ASCENT = 0.75;
const TEXT_DESCENT = 0.25;
/** Points par tronçon d'une course en courbe ; segments d'un arc ou d'un cercle échantillonné. */
const CURVE_STEPS = 12;
const ARC_STEPS = 16;
const CIRCLE_STEPS = 48;
/**
 * Coût d'une place de pastille : un chevauchement (joueur, ballon, pastille,
 * bord du cadre) l'emporte sur tout, puis chaque trait couvert, puis le rang.
 */
const OVERLAP_COST = 1_000_000;
const COVER_COST = 1000;
/** Arrondis du calcul : un écart de 2 px moins un millionième vaut 2 px. */
const EPSILON = 1e-6;

/** px = left + x × scale, py = top + y × scale : même échelle en x et en y. */
export type Frame = { scale: number; left: number; top: number };

/** Rectangle en pixels : coin haut gauche, largeur, hauteur. */
export type Box = { x: number; y: number; width: number; height: number };

/** Arc du terrain : chemin SVG, et le même arc échantillonné. */
export type PitchArc = { d: string; points: Point[] };

/** Lignes du terrain entier ; la vue en montre la partie qui tient dans le cadre. */
export type PitchMarks = {
  /** Contour, surfaces de réparation et de but, buts. */
  boxes: Box[];
  /** Ligne médiane. */
  halfway: [Point, Point];
  /** Rond central. */
  circle: { center: Point; r: number };
  /** Point du centre et points de penalty. */
  spots: Point[];
  /** Arcs des surfaces de réparation. */
  arcs: PitchArc[];
};

/** Flèche de vitesse à côté d'un joueur. */
export type SpeedArrowShape = { player: DiagramPlayer; speed: Speed; start: Point; end: Point; head: Point[] };

/** Trajet d'un test : trait, pointe, ballon posé au départ d'une conduite. */
export type PathShape = { line: Point[]; head: Point[] | null; ball: Point | null };

export type OptionShape = {
  option: DiagramOption;
  /** Trait jusqu'au pied de la pointe ; [] pour un hold. */
  line: Point[];
  /** Pointe ; null pour un hold ou un trait trop court. */
  head: Point[] | null;
  /**
   * Trait quand la pastille, dessinée, coiffe l'extrémité : arrêté à son bord,
   * sans pointe. null : la pastille est ailleurs, trait et pointe restent.
   */
  cappedLine: Point[] | null;
  /** Arc d'un hold (chemin SVG) ; null sinon. */
  arc: string | null;
  /** Centre de la pastille. */
  pastille: Point;
};

/** Étiquette d'un objet : position du texte (sur sa ligne de base) et ancrage. */
export type LabelShape = { text: string; at: Point; anchor: 'start' | 'middle' | 'end' };

/** Tout ce que dessine components/diagram.tsx, sauf les couleurs (selon l'état). */
export type DiagramLayout = {
  frame: Frame;
  /** Centre de chaque joueur, par id. */
  centers: ReadonlyMap<string, Point>;
  /** null pour la vue local (test), sans terrain. */
  pitch: PitchMarks | null;
  speedArrows: SpeedArrowShape[];
  path: PathShape | null;
  /** Ballon du porteur, ballon libre, ballon au départ d'une conduite. */
  balls: Point[];
  /** Dans l'ordre des id. */
  options: OptionShape[];
  labels: LabelShape[];
};

/**
 * Géométrie d'un schéma. Les pastilles ont les mêmes places dans tous les états
 * (nu, selected, result) : un état n'en dessine parfois qu'une partie.
 */
export function layoutDiagram(diagram: DiagramData): DiagramLayout {
  const frame = frameOf(diagram);
  const centers = new Map(diagram.players.map((player) => [player.id, project(frame, player)]));
  const pitch = diagram.view === 'local' ? null : pitchMarks(frame);
  const speedArrows = diagram.players.flatMap((player) => speedArrow(player, centerOf(centers, frame, player)));
  const path = layoutPath(diagram, frame, centers);
  const carrier = diagram.players.find((player) => player.ball);
  const balls = [
    ...(carrier !== undefined ? [add(centerOf(centers, frame, carrier), BALL_OFFSET)] : []),
    ...(diagram.ball !== null ? [project(frame, diagram.ball)] : []),
    ...(path?.ball ? [path.ball] : []),
  ];
  // Joueurs et ballons : ni pastille ni étiquette ne les recouvre.
  const discs: Disc[] = [
    ...diagram.players.map((player) => ({ ...centerOf(centers, frame, player), r: outerRadius(player) })),
    ...balls.map((ball) => ({ ...ball, r: BALL_OUTER })),
  ];
  // Traits fixes : flèches de vitesse et trajet.
  const fixedStrokes: Point[][] = [
    ...speedArrows.flatMap((arrow) => [[arrow.start, arrow.end], closed(arrow.head)]),
    ...(path !== null ? [path.line, ...(path.head !== null ? [closed(path.head)] : [])] : []),
  ];
  const placed = placeOptions(diagram, frame, centers, discs, fixedStrokes);
  const labels = placeLabels(diagram, frame, {
    strokes: [...(pitch !== null ? pitchStrokes(pitch) : []), ...fixedStrokes, ...placed.strokes],
    discs: [
      ...discs,
      ...placed.shapes.map((shape) => ({ ...shape.pastille, r: PASTILLE_OUTER })),
      ...(pitch?.spots ?? []).map((spot) => ({ ...spot, r: SPOT_RADIUS })),
    ],
  });
  return { frame, centers, pitch, speedArrows, path, balls, options: placed.shapes, labels };
}

/** Rayon extérieur d'un joueur : son halo, son anneau ou son disque. */
export function outerRadius(player: DiagramPlayer): number {
  if (player.you) {
    return HALO_RADIUS + HALO_WIDTH / 2;
  }
  return player.team === 'us' ? PLAYER_RADIUS : OPPONENT_RADIUS + OPPONENT_RING / 2;
}

/** Rectangle qu'occupe un objet à l'écran : taille fixe (plot, mannequin) ou w × h mètres. */
export function objectBox(object: DiagramObject, frame: Frame): Box {
  const center = project(frame, object);
  switch (object.type) {
    case 'cone':
      return {
        x: center.x - CONE.halfWidth,
        y: center.y - CONE.top,
        width: 2 * CONE.halfWidth,
        height: CONE.top + CONE.bottom,
      };
    case 'mannequin':
      return {
        x: center.x - MANNEQUIN.width / 2,
        y: center.y - MANNEQUIN.height / 2,
        width: MANNEQUIN.width,
        height: MANNEQUIN.height,
      };
    default: {
      // goal, wall, zone : w × h mètres autour du centre ; un mur fin reste visible.
      const width = Math.max(OBJECT_STROKE, (object.w ?? 0) * frame.scale);
      const height = Math.max(OBJECT_STROKE, (object.h ?? 0) * frame.scale);
      return { x: center.x - width / 2, y: center.y - height / 2, width, height };
    }
  }
}

// Repère : mètres du schéma → pixels de la DA.

/**
 * La vue entière dans le cadre, marges comprises, à la plus grande échelle
 * possible. La place en trop va en largeur vers notre camp (half_right,
 * box_right : vue calée sur le but de droite ; half_left : sur celui de gauche),
 * en hauteur à parts égales.
 */
function frameOf(diagram: DiagramData): Frame {
  const region = viewRegion(diagram.view, diagram.width_m);
  const innerWidth = VIEW_WIDTH - 2 * FRAME_MARGIN;
  const innerHeight = VIEW_HEIGHT - 2 * FRAME_MARGIN;
  const regionWidth = region.xMax - region.xMin;
  const regionHeight = region.yMax - region.yMin;
  const scale = Math.min(innerWidth / regionWidth, innerHeight / regionHeight);
  const spareX = innerWidth - regionWidth * scale;
  const spareY = innerHeight - regionHeight * scale;
  const anchorX = diagram.view === 'half_right' || diagram.view === 'box_right' ? 1 : diagram.view === 'half_left' ? 0 : 0.5;
  return {
    scale,
    left: FRAME_MARGIN + spareX * anchorX - region.xMin * scale,
    top: FRAME_MARGIN + spareY / 2 - region.yMin * scale,
  };
}

export function project(frame: Frame, point: Point): Point {
  return { x: frame.left + point.x * frame.scale, y: frame.top + point.y * frame.scale };
}

function centerOf(centers: ReadonlyMap<string, Point>, frame: Frame, player: DiagramPlayer): Point {
  return centers.get(player.id) ?? project(frame, player);
}

// Terrain.

function pitchMarks(frame: Frame): PitchMarks {
  const corner = project(frame, { x: 0, y: 0 });
  const center = project(frame, { x: HALFWAY_X, y: CENTER_Y });
  const boxes: Box[] = [
    { x: corner.x, y: corner.y, width: PITCH_LENGTH * frame.scale, height: PITCH_WIDTH * frame.scale },
  ];
  const spots = [center];
  const arcs: PitchArc[] = [];
  const ends: readonly (readonly [number, 1 | -1])[] = [
    [0, 1],
    [PITCH_LENGTH, -1],
  ];
  for (const [goalX, inward] of ends) {
    boxes.push(
      endBox(frame, goalX, inward, PENALTY_AREA.depth, PENALTY_AREA.width),
      endBox(frame, goalX, inward, GOAL_AREA.depth, GOAL_AREA.width),
      endBox(frame, goalX - inward * GOAL.depth, inward, GOAL.depth, GOAL.width),
    );
    spots.push(project(frame, { x: goalX + inward * PENALTY_SPOT, y: CENTER_Y }));
    arcs.push(penaltyArc(frame, goalX, inward));
  }
  return {
    boxes,
    halfway: [project(frame, { x: HALFWAY_X, y: 0 }), project(frame, { x: HALFWAY_X, y: PITCH_WIDTH })],
    circle: { center, r: CIRCLE_RADIUS * frame.scale },
    spots,
    arcs,
  };
}

/** Rectangle centré sur l'axe du terrain, de la ligne fromX vers le centre (inward) sur depth mètres. */
function endBox(frame: Frame, fromX: number, inward: 1 | -1, depth: number, width: number): Box {
  const topLeft = project(frame, { x: Math.min(fromX, fromX + inward * depth), y: CENTER_Y - width / 2 });
  return { x: topLeft.x, y: topLeft.y, width: depth * frame.scale, height: width * frame.scale };
}

/** Arc de la surface : cercle de 9,15 m autour du point de penalty, hors de la surface. */
function penaltyArc(frame: Frame, goalX: number, inward: 1 | -1): PitchArc {
  const halfWidth = Math.sqrt(CIRCLE_RADIUS ** 2 - (PENALTY_AREA.depth - PENALTY_SPOT) ** 2);
  const start = project(frame, { x: goalX + inward * PENALTY_AREA.depth, y: CENTER_Y - halfWidth });
  const end = project(frame, { x: goalX + inward * PENALTY_AREA.depth, y: CENTER_Y + halfWidth });
  const spot = project(frame, { x: goalX + inward * PENALTY_SPOT, y: CENTER_Y });
  const r = CIRCLE_RADIUS * frame.scale;
  // De haut en bas, bombé vers le centre : sens horaire à gauche, antihoraire à droite.
  const sweep = inward === 1 ? 1 : 0;
  const axis = inward === 1 ? 0 : Math.PI;
  const half = Math.asin(halfWidth / CIRCLE_RADIUS);
  const points = Array.from({ length: ARC_STEPS + 1 }, (_, step) =>
    polar(spot, r, axis - half + (2 * half * step) / ARC_STEPS),
  );
  return { d: `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweep} ${end.x} ${end.y}`, points };
}

/** Lignes du terrain, en polylignes : ce qu'une étiquette ne croise pas. */
function pitchStrokes(pitch: PitchMarks): Point[][] {
  const circle = Array.from({ length: CIRCLE_STEPS + 1 }, (_, step) =>
    polar(pitch.circle.center, pitch.circle.r, (2 * Math.PI * step) / CIRCLE_STEPS),
  );
  return [...pitch.boxes.map(boxOutline), pitch.halfway, circle, ...pitch.arcs.map((arc) => arc.points)];
}

// Flèches de vitesse et trajet.

/** Flèche de vitesse à côté du joueur, dans sa direction ; aucune s'il ne bouge pas. */
function speedArrow(player: DiagramPlayer, center: Point): SpeedArrowShape[] {
  if (player.move === null) {
    return [];
  }
  const direction = normalize({ x: player.move.dx, y: player.move.dy });
  const start = add(center, scale(direction, outerRadius(player) + ARROW_GAP));
  const end = add(start, scale(direction, SPEED_ARROWS[player.move.speed].length));
  const head = arrowHead(add(end, scale(direction, SPEED_HEAD.ahead)), direction, SPEED_HEAD.length, SPEED_HEAD.halfWidth);
  return [{ player, speed: player.move.speed, start, end, head }];
}

/**
 * Trajet d'un test, pointe à l'arrivée ; départ décalé du joueur posé sur le
 * premier point. Conduite : ballon au départ, sauf si ce joueur le porte déjà.
 */
function layoutPath(diagram: DiagramData, frame: Frame, centers: ReadonlyMap<string, Point>): PathShape | null {
  if (diagram.path === null) {
    return null;
  }
  const first = diagram.path.points[0];
  const runner = diagram.players.find((player) => player.x === first.x && player.y === first.y);
  const full = smooth(diagram.path.points.map((point) => project(frame, point)));
  const total = lengthOf(full);
  const startCut = runner !== undefined ? Math.min(outerRadius(runner) + ARROW_GAP, total / 2) : 0;
  const drawn = slicePolyline(full, startCut, total);
  const length = lengthOf(drawn);
  const withBall = diagram.path.style === 'dribble' && runner?.ball !== true;
  const ball = withBall ? (drawn[0] ?? (runner !== undefined ? centers.get(runner.id) : undefined) ?? null) : null;
  if (length < ARROW_HEAD.length) {
    return { line: drawn, head: null, ball };
  }
  const { point: tip, direction } = pointAt(drawn, length);
  return {
    line: slicePolyline(drawn, 0, length - (ARROW_HEAD.length - ARROW_HEAD.overlap)),
    head: arrowHead(tip, direction, ARROW_HEAD.length, ARROW_HEAD.halfWidth),
    ball,
  };
}

// Options et pastilles.

/** Disque qu'une pastille ou une étiquette ne recouvre pas : joueur, ballon, pastille, point du terrain. */
type Disc = Point & { r: number };

/** Arc d'un hold : chemin SVG, et le même arc échantillonné. */
type HoldArc = { d: string; points: Point[] };

/** Une place possible de la pastille d'une option. */
type Spot = {
  at: Point;
  /** Rang de préférence dans la liste de l'option (0 : la place idéale), ajouté au coût. */
  rank: number;
  /** La pastille coiffe l'extrémité, à la place de la pointe. */
  capped: boolean;
  /** Arc d'un hold, centré sur cette place ; null pour un trait. */
  arc: HoldArc | null;
};

/** Une option avant le choix de sa pastille. */
type OptionPlan = {
  option: DiagramOption;
  line: Point[];
  head: Point[] | null;
  cappedLine: Point[] | null;
  /** Trait et pointe, qu'une autre pastille ne doit pas couvrir ; [] pour un hold (son arc suit sa place). */
  strokes: Point[][];
  /** Places de la pastille, de la préférée à la dernière. */
  spots: Spot[];
};

/** Pastille déjà posée, pendant la répartition. */
type Placed = { at: Point; arc: HoldArc | null };

/**
 * Traits des options et places des pastilles. Une pastille se pose à
 * l'extrémité de son trait (juste avant la pointe vers un joueur, donc avant le
 * receveur) ; si la place est prise, elle recule le long du trait, puis s'en
 * écarte perpendiculairement. Hold : arc autour du joueur, pastille en son
 * milieu, dans la première direction libre. Jamais : un bord de pastille à
 * moins de PASTILLE_GAP d'un joueur, d'un ballon ou d'une autre pastille, ni
 * hors du cadre. Si possible : ne couvrir ni le trait d'une autre option, ni une
 * flèche de vitesse, ni le trajet ; un arc de hold ne croise ni trait ni
 * pastille. Les options sont posées une à une, chacune à sa place la moins
 * coûteuse, dans chaque ordre possible (24 pour 4 options) : la répartition la
 * moins coûteuse l'emporte, à égalité le premier ordre essayé.
 * Renvoie aussi les traits posés (traits, pointes, arcs), pour les étiquettes.
 */
function placeOptions(
  diagram: DiagramData,
  frame: Frame,
  centers: ReadonlyMap<string, Point>,
  discs: readonly Disc[],
  fixedStrokes: readonly Point[][],
): { shapes: OptionShape[]; strokes: Point[][] } {
  const players = new Map(diagram.players.map((player) => [player.id, player]));
  const plans: OptionPlan[] = [];
  for (const option of diagram.options) {
    const from = players.get(option.from);
    if (from === undefined) {
      continue;
    }
    const start = centerOf(centers, frame, from);
    if (option.to === null) {
      plans.push(holdPlan(option, start, outerRadius(from)));
      continue;
    }
    const target = option.to.player !== null ? players.get(option.to.player) : undefined;
    const end = target !== undefined ? centerOf(centers, frame, target) : project(frame, option.to);
    const via = option.path.map((point) => project(frame, point));
    plans.push(linePlan(option, start, outerRadius(from), via, end, target !== undefined ? outerRadius(target) : null));
  }
  // Coût de chaque place sans les autres pastilles : il ne change pas d'un ordre à l'autre.
  const costs = plans.map((plan) => {
    const strokes = [...fixedStrokes, ...plans.flatMap((other) => (other === plan ? [] : other.strokes))];
    return plan.spots.map((spot) => spot.rank + fixedCost(spot, discs, strokes));
  });
  const picks = bestPicks(plans, costs);
  const shapes = plans.map((plan, index): OptionShape => {
    const spot = plan.spots[picks[index]];
    return {
      option: plan.option,
      line: plan.line,
      head: plan.head,
      cappedLine: spot.capped ? plan.cappedLine : null,
      arc: spot.arc?.d ?? null,
      pastille: spot.at,
    };
  });
  const strokes = plans.flatMap((plan, index) => {
    const arc = plan.spots[picks[index]].arc;
    return arc !== null ? [...plan.strokes, arc.points] : plan.strokes;
  });
  return { shapes: shapes.sort((a, b) => a.option.id - b.option.id), strokes };
}

/** Trait vers un point ou vers un joueur (targetRadius : son rayon), et les places de sa pastille. */
function linePlan(
  option: DiagramOption,
  from: Point,
  fromRadius: number,
  via: readonly Point[],
  end: Point,
  targetRadius: number | null,
): OptionPlan {
  const full = smooth([from, ...via, end]);
  const total = lengthOf(full);
  const startCut = Math.min(fromRadius + ARROW_GAP, total / 2);
  const endCut = targetRadius !== null ? targetRadius + TARGET_GAP : 0;
  const drawn = slicePolyline(full, startCut, Math.max(startCut, total - endCut));
  const length = lengthOf(drawn);
  const { point: tip, direction } = pointAt(drawn, length);
  const head = length >= ARROW_HEAD.length ? arrowHead(tip, direction, ARROW_HEAD.length, ARROW_HEAD.halfWidth) : null;
  const toPoint = targetRadius === null;
  // Reculer : juste avant la pointe, puis pas à pas jusqu'au départ.
  const along: Station[] = [];
  for (let back = FIRST_BACK; back <= length; back += PASTILLE_STEP) {
    along.push(pointAt(drawn, length - back));
  }
  // De côté : le long de la pointe (vers un point), puis aux places du recul ; à défaut, au milieu du trait.
  const beside: Station[] = [...(toPoint ? [{ point: tip, direction }] : []), ...along];
  if (beside.length === 0) {
    beside.push(pointAt(drawn, length / 2));
  }
  const places = [
    ...(toPoint ? [{ at: tip, capped: true }] : []),
    ...along.map(({ point }) => ({ at: point, capped: false })),
    ...SIDE_OFFSETS.flatMap((offset) =>
      beside.flatMap(({ point, direction: tangent }) => {
        const normal = scale({ x: -tangent.y, y: tangent.x }, offset);
        return [
          { at: add(point, normal), capped: false },
          { at: subtract(point, normal), capped: false },
        ];
      }),
    ),
  ];
  return {
    option,
    line: head !== null ? slicePolyline(drawn, 0, length - (ARROW_HEAD.length - ARROW_HEAD.overlap)) : drawn,
    head,
    // Pastille à l'extrémité : le trait s'arrête sous son bord (rien s'il est plus court qu'elle).
    cappedLine: toPoint ? (length > PASTILLE_RADIUS ? slicePolyline(drawn, 0, length - PASTILLE_RADIUS) : []) : null,
    strokes: head !== null ? [drawn, closed(head)] : [drawn],
    spots: places.map((place, rank) => ({ ...place, rank, arc: null })),
  };
}

/** Hold : arc de 120° autour du joueur, pastille en son milieu ; une place par direction de HOLD_ANGLES. */
function holdPlan(option: DiagramOption, center: Point, playerRadius: number): OptionPlan {
  const radius = playerRadius + PASTILLE_GAP + PASTILLE_OUTER;
  return {
    option,
    line: [],
    head: null,
    cappedLine: null,
    strokes: [],
    spots: HOLD_ANGLES.map((degrees, rank) => {
      const angle = (degrees * Math.PI) / 180;
      const first = angle - HOLD_SPAN / 2;
      const start = polar(center, radius, first);
      const end = polar(center, radius, angle + HOLD_SPAN / 2);
      return {
        at: polar(center, radius, angle),
        rank,
        capped: false,
        arc: {
          d: `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`,
          points: Array.from({ length: ARC_STEPS + 1 }, (_, step) =>
            polar(center, radius, first + (HOLD_SPAN * step) / ARC_STEPS),
          ),
        },
      };
    }),
  };
}

/** Coût d'une place sans les autres pastilles : chevauchements (joueurs, ballons, cadre) et traits couverts. */
function fixedCost(spot: Spot, discs: readonly Disc[], strokes: readonly Point[][]): number {
  let overlap = Math.max(
    0,
    PASTILLE_OUTER -
      Math.min(spot.at.x, VIEW_WIDTH - spot.at.x, spot.at.y, VIEW_HEIGHT - spot.at.y) -
      EPSILON,
  );
  for (const disc of discs) {
    overlap += gapShortfall(distance(spot.at, disc) - disc.r - PASTILLE_OUTER);
  }
  let covered = strokes.filter((stroke) => distanceToPolyline(spot.at, stroke) < PASTILLE_OUTER + STROKE_HALF).length;
  if (spot.arc !== null) {
    const arc = spot.arc.points;
    covered += strokes.filter((stroke) => polylinesDistance(arc, stroke) < 2 * STROKE_HALF).length;
  }
  return costOf(overlap, covered);
}

/** Coût d'une place face aux pastilles déjà posées (et à l'arc d'un hold). */
function placedCost(spot: Spot, placed: readonly Placed[]): number {
  let overlap = 0;
  let covered = 0;
  for (const other of placed) {
    overlap += gapShortfall(distance(spot.at, other.at) - 2 * PASTILLE_OUTER);
    if (other.arc !== null && distanceToPolyline(spot.at, other.arc.points) < PASTILLE_OUTER + STROKE_HALF) {
      covered += 1;
    }
    if (spot.arc !== null && distanceToPolyline(other.at, spot.arc.points) < PASTILLE_OUTER + STROKE_HALF) {
      covered += 1;
    }
  }
  return costOf(overlap, covered);
}

/** Ce qui manque pour que deux bords soient à PASTILLE_GAP l'un de l'autre ; 0 s'ils le sont. */
function gapShortfall(clearance: number): number {
  return Math.max(0, PASTILLE_GAP - clearance - EPSILON);
}

function costOf(overlap: number, covered: number): number {
  return (overlap > 0 ? OVERLAP_COST * (1 + overlap) : 0) + covered * COVER_COST;
}

/** Place retenue de chaque option (index dans ses spots) : la répartition la moins coûteuse sur tous les ordres. */
function bestPicks(plans: readonly OptionPlan[], costs: readonly (readonly number[])[]): number[] {
  let best: { total: number; picks: number[] } | null = null;
  for (const order of permutations(plans.length)) {
    const picks = plans.map(() => 0);
    const placed: Placed[] = [];
    let total = 0;
    for (const planIndex of order) {
      const { spots } = plans[planIndex];
      let pick = 0;
      let pickCost = Infinity;
      spots.forEach((spot, spotIndex) => {
        const cost = costs[planIndex][spotIndex] + placedCost(spot, placed);
        if (cost < pickCost) {
          pick = spotIndex;
          pickCost = cost;
        }
      });
      picks[planIndex] = pick;
      placed.push({ at: spots[pick].at, arc: spots[pick].arc });
      total += pickCost;
      if (best !== null && total >= best.total) {
        // Déjà plus cher que la meilleure : ordre abandonné.
        break;
      }
    }
    if (best === null || total < best.total) {
      best = { total, picks };
    }
  }
  return best?.picks ?? [];
}

/** Tous les ordres de 0 à count - 1. */
function permutations(count: number): number[][] {
  if (count === 0) {
    return [[]];
  }
  return permutations(count - 1).flatMap((rest) =>
    Array.from({ length: count }, (_, at) => [...rest.slice(0, at), count - 1, ...rest.slice(at)]),
  );
}

// Étiquettes d'objets.

/** Ce qu'une étiquette ne croise pas (traits, lignes du terrain) et ne recouvre pas (disques). */
type LabelObstacles = { strokes: Point[][]; discs: Disc[] };

type LabelCandidate = { box: Box; at: Point; anchor: LabelShape['anchor'] };

/**
 * Étiquette de chaque objet : sous l'objet, sinon au-dessus, à droite, à gauche
 * (une zone : en son centre d'abord), à la première place libre : dans le
 * cadre, sans croiser ni trait, ni ligne du terrain, ni bord de zone, sans
 * recouvrir ni joueur, ni ballon, ni pastille, ni autre objet, ni étiquette.
 * Aucune place libre : la moins gênée.
 */
function placeLabels(diagram: DiagramData, frame: Frame, obstacles: LabelObstacles): LabelShape[] {
  const boxes = diagram.objects.map((object) => objectBox(object, frame));
  // Zone : son bord se croise ; les autres objets se recouvrent.
  const strokes = [
    ...obstacles.strokes,
    ...diagram.objects.flatMap((object, index) => (object.type === 'zone' ? [boxOutline(boxes[index])] : [])),
  ];
  const taken = diagram.objects.flatMap((object, index) => (object.type !== 'zone' ? [boxes[index]] : []));
  const labels: LabelShape[] = [];
  diagram.objects.forEach((object, index) => {
    if (object.label === null) {
      return;
    }
    const candidates = labelCandidates(object, object.label, project(frame, object), boxes[index]);
    const conflicts = candidates.map(({ box }) => labelConflict(box, strokes, obstacles.discs, taken));
    // La moins gênée, la première à égalité : une place libre (0) passe avant toute autre.
    const chosen = candidates[conflicts.indexOf(Math.min(...conflicts))];
    taken.push(chosen.box);
    labels.push({ text: object.label, at: chosen.at, anchor: chosen.anchor });
  });
  return labels;
}

/** Places d'une étiquette autour de son objet (own), de la préférée à la dernière. */
function labelCandidates(object: DiagramObject, label: string, center: Point, own: Box): LabelCandidate[] {
  const width = Array.from(label).length * LABEL_SIZE * CHAR_WIDTH;
  const height = (TEXT_ASCENT + TEXT_DESCENT) * LABEL_SIZE;
  const ascent = TEXT_ASCENT * LABEL_SIZE;
  // Ligne de base d'un texte centré en hauteur sur l'objet.
  const middle = center.y + CAP_CENTER * LABEL_SIZE;
  const below = own.y + own.height + LABEL_GAP;
  const above = own.y - LABEL_GAP - height;
  const right = own.x + own.width + LABEL_GAP;
  const left = own.x - LABEL_GAP;
  const around: LabelCandidate[] = [
    { box: { x: center.x - width / 2, y: below, width, height }, at: { x: center.x, y: below + ascent }, anchor: 'middle' },
    { box: { x: center.x - width / 2, y: above, width, height }, at: { x: center.x, y: above + ascent }, anchor: 'middle' },
    { box: { x: right, y: middle - ascent, width, height }, at: { x: right, y: middle }, anchor: 'start' },
    { box: { x: left - width, y: middle - ascent, width, height }, at: { x: left, y: middle }, anchor: 'end' },
  ];
  if (object.type !== 'zone') {
    return around;
  }
  return [
    { box: { x: center.x - width / 2, y: middle - ascent, width, height }, at: { x: center.x, y: middle }, anchor: 'middle' },
    ...around,
  ];
}

/**
 * Gêne d'une étiquette posée dans `box`, en pixels : longueur des traits qui la
 * traversent, enfoncement des disques et des rectangles qui la recouvrent ;
 * 0 pour une place libre, infinie hors du cadre.
 */
function labelConflict(
  box: Box,
  strokes: readonly Point[][],
  discs: readonly Disc[],
  taken: readonly Box[],
): number {
  if (box.x < 0 || box.y < 0 || box.x + box.width > VIEW_WIDTH || box.y + box.height > VIEW_HEIGHT) {
    return Infinity;
  }
  const padded = {
    x: box.x - LABEL_PAD,
    y: box.y - LABEL_PAD,
    width: box.width + 2 * LABEL_PAD,
    height: box.height + 2 * LABEL_PAD,
  };
  let conflict = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      conflict += lengthInBox(stroke[index - 1], stroke[index], padded);
    }
  }
  for (const disc of discs) {
    const nearest = {
      x: Math.min(padded.x + padded.width, Math.max(padded.x, disc.x)),
      y: Math.min(padded.y + padded.height, Math.max(padded.y, disc.y)),
    };
    conflict += Math.max(0, disc.r - distance(disc, nearest));
  }
  for (const other of taken) {
    const width = Math.min(other.x + other.width, padded.x + padded.width) - Math.max(other.x, padded.x);
    const height = Math.min(other.y + other.height, padded.y + padded.height) - Math.max(other.y, padded.y);
    conflict += Math.max(0, Math.min(width, height));
  }
  return conflict;
}

// Géométrie, en pixels.

/** Point d'une polyligne et direction du tronçon qui le porte. */
type Station = { point: Point; direction: Point };

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector: Point, factor: number): Point {
  return { x: vector.x * factor, y: vector.y * factor };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Point à `radius` du centre, dans la direction `angle` (radians, 0 à droite, sens horaire à l'écran). */
function polar(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/** Vecteur de longueur 1 ; vers la droite pour un vecteur nul. */
function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? { x: 1, y: 0 } : scale(vector, 1 / length);
}

/** Triangle de pointe : sommet `tip`, base perpendiculaire à `direction`. */
function arrowHead(tip: Point, direction: Point, length: number, halfWidth: number): Point[] {
  const base = subtract(tip, scale(direction, length));
  const across = { x: -direction.y, y: direction.x };
  return [tip, add(base, scale(across, halfWidth)), subtract(base, scale(across, halfWidth))];
}

/** Contour fermé d'un polygone. */
function closed(points: readonly Point[]): Point[] {
  return points.length > 0 ? [...points, points[0]] : [];
}

function boxOutline(box: Box): Point[] {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { x: box.x, y: box.y },
    { x: right, y: box.y },
    { x: right, y: bottom },
    { x: box.x, y: bottom },
    { x: box.x, y: box.y },
  ];
}

function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

/** Point à `at` pixels du début, et la direction du tronçon qui le porte ; bornés aux extrémités. */
function pointAt(points: readonly Point[], at: number): Station {
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const segment = distance(a, b);
    if (segment > 0 && (walked + segment >= at || index === points.length - 1)) {
      const t = Math.min(1, Math.max(0, (at - walked) / segment));
      return { point: add(a, scale(subtract(b, a), t)), direction: normalize(subtract(b, a)) };
    }
    walked += segment;
  }
  return { point: points[0] ?? { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
}

/** Morceau d'une polyligne entre deux distances depuis son début. */
function slicePolyline(points: readonly Point[], from: number, to: number): Point[] {
  const sliced: Point[] = [];
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const segment = distance(a, b);
    const next = walked + segment;
    if (segment > 0 && next >= from && walked <= to) {
      const along = (at: number) => add(a, scale(subtract(b, a), Math.min(1, Math.max(0, (at - walked) / segment))));
      if (sliced.length === 0) {
        sliced.push(along(from));
      }
      sliced.push(along(to));
    }
    walked = next;
  }
  return sliced;
}

/**
 * Courbe passant par chaque point (Catmull-Rom, en tronçons de Bézier cubiques
 * échantillonnés) : une course en courbe reste ronde. Deux points : le segment.
 */
function smooth(points: readonly Point[]): Point[] {
  if (points.length < 3) {
    return [...points];
  }
  const curve: Point[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1 = add(p1, scale(subtract(p2, p0), 1 / 6));
    const c2 = subtract(p2, scale(subtract(p3, p1), 1 / 6));
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const u = 1 - t;
      curve.push({
        x: u ** 3 * p1.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * p2.x,
        y: u ** 3 * p1.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * p2.y,
      });
    }
  }
  return curve;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const ab = subtract(b, a);
  const squared = ab.x ** 2 + ab.y ** 2;
  const t = squared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / squared));
  return distance(point, add(a, scale(ab, t)));
}

/** Distance d'un point à une polyligne ; un seul point : à ce point ; vide : infinie. */
function distanceToPolyline(point: Point, polyline: readonly Point[]): number {
  if (polyline.length === 1) {
    return distance(point, polyline[0]);
  }
  let nearest = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, polyline[index - 1], polyline[index]));
  }
  return nearest;
}

/** Signe du virage o → p → q : positif d'un côté, négatif de l'autre, nul s'ils sont alignés. */
function turn(o: Point, p: Point, q: Point): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
}

/** Distance entre deux segments : 0 s'ils se croisent. */
function segmentsDistance(a: Point, b: Point, c: Point, d: Point): number {
  const ab = [turn(c, d, a), turn(c, d, b)];
  const cd = [turn(a, b, c), turn(a, b, d)];
  if (ab[0] * ab[1] < 0 && cd[0] * cd[1] < 0) {
    return 0;
  }
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/** Distance entre deux polylignes ; infinie si l'une est vide. */
function polylinesDistance(first: readonly Point[], second: readonly Point[]): number {
  if (first.length === 1) {
    return distanceToPolyline(first[0], second);
  }
  if (second.length === 1) {
    return distanceToPolyline(second[0], first);
  }
  let nearest = Infinity;
  for (let i = 1; i < first.length; i += 1) {
    for (let j = 1; j < second.length; j += 1) {
      nearest = Math.min(nearest, segmentsDistance(first[i - 1], first[i], second[j - 1], second[j]));
    }
  }
  return nearest;
}

/** Longueur du segment ab à l'intérieur du rectangle (découpage de Liang-Barsky) ; 0 s'il passe à côté. */
function lengthInBox(a: Point, b: Point, box: Box): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) {
        return 0;
      }
    } else if (p < 0) {
      enter = Math.max(enter, q / p);
    } else {
      leave = Math.min(leave, q / p);
    }
  }
  return enter < leave ? (leave - enter) * Math.hypot(dx, dy) : 0;
}
