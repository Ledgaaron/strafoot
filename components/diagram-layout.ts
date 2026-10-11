// Géométrie des schémas, sans dessin ni react-native : cadre, terrain, flèches
// de vitesse, trajet d'un test, traits des options, anneau d'un hold, places des
// pastilles, cotes et étiquettes ; états d'un schéma (repos, sélection, résultat,
// tout afficher) et détection des superpositions, pure, que les seeds et les
// tests appliquent au contenu. components/diagram.tsx la dessine en SVG. Tout est
// en pixels de la DA (schéma de 358 px de large sur un écran de 390 ; cadre
// 722 × 646, 722 × 542 pour une vue zone, 722 × 361 pour une vue local), mis à
// l'échelle de la largeur réelle au dessin. Module pur, sans lib/theme.ts (qui
// importe react-native) : testé par components/diagram-layout.test.ts (npx tsx)
// sur les schémas pilotes, dans tous leurs états.

import {
  bestOptionId,
  HALFWAY_X,
  optionLetter,
  PITCH_LENGTH,
  PITCH_WIDTH,
  viewFrame,
  viewRegion,
  type DiagramData,
  type DiagramDimension,
  type DiagramObject,
  type DiagramOption,
  type DiagramPlayer,
  type OptionId,
  type OptionScores,
  type Point,
  type Speed,
} from '../lib/diagram-types';

/** Largeur du repère du dessin, en pixels de la DA ; la hauteur suit le cadre de la vue. */
export const VIEW_WIDTH = 358;
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
/** Écart entre un joueur (ou l'anneau de son hold) et le début de ses flèches (vitesse, options). */
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
/** Marge minimale entre deux éléments qui ne doivent pas se toucher (règles de contenu). */
export const CLEARANCE = 2;
/** Écart minimal entre le bord d'une pastille et un joueur, un ballon ou une autre pastille. */
export const PASTILLE_GAP = CLEARANCE;
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
/** Hold : anneau pointillé juste au-delà du halo (ou du ballon porté) ; 3 px d'écart. */
const RING_GAP = 3;
/**
 * Hold : directions essayées pour la pastille accolée à l'anneau, en degrés (0 à
 * droite, -90 en haut) : les diagonales, haut, bas, les côtés, puis tous les 15°.
 */
const HOLD_ANGLES = [
  -45, -135, 45, 135, -90, 90, 0, 180, -60, -30, -120, -150, 60, 30, 120, 150, -75, -105, 75, 105, -15, -165, 15, 165,
];
/**
 * Demi-épaisseur d'un trait d'option, d'un anneau, d'une flèche de vitesse ou
 * du trajet, arrondie au-dessus (3,5 px au plus).
 */
export const STROKE_HALF = 2;
/** Cote : trait fin, décalé de 20 px du segment mesuré, extrémités marquées par un tiret de 8 px. */
export const DIMENSION = { offset: 20, tick: 4, strokeHalf: 0.5 };
/** Au départ commun de deux options du même joueur, leurs traits se touchent par construction : zone ignorée. */
const COMMON_START = 2 * PASTILLE_OUTER;
/** Plot : triangle de 9 px. */
export const CONE = { halfWidth: 4.5, top: 5, bottom: 4 };
/** Mannequin vu du dessus. */
export const MANNEQUIN = { width: 8, height: 16 };
/** Contour d'un but ; épaisseur minimale d'un mur ou d'une zone. */
export const OBJECT_STROKE = 2;
/**
 * Étiquette d'un objet ou d'une cote : 14 px (fontSize.meta de lib/theme.ts, que
 * ce module n'importe pas), à 4 px de l'objet (spacing.xs).
 */
export const LABEL_SIZE = 14;
const LABEL_GAP = 4;
/** Largeur d'un caractère, en fraction de la taille : estimation large (le texte n'est pas mesuré). */
const CHAR_WIDTH = 0.6;
/** Chiffres et capitales centrés sur leur repère : ligne de base abaissée d'environ la moitié de leur hauteur. */
export const CAP_CENTER = 0.35;
/** Hauteur du texte au-dessus et au-dessous de sa ligne de base, en fraction de sa taille. */
const TEXT_ASCENT = 0.75;
const TEXT_DESCENT = 0.25;
/** Points par tronçon d'une course en courbe ; segments d'un arc ou d'un cercle échantillonné. */
const CURVE_STEPS = 12;
const ARC_STEPS = 16;
const CIRCLE_STEPS = 48;
/** Coût d'une place de pastille : tout chevauchement (joueur, ballon, trait, pastille, cadre) l'emporte sur le rang. */
const OVERLAP_COST = 1_000_000;
/** Arrondis du calcul : un écart de 2 px moins un millionième vaut 2 px. */
const EPSILON = 1e-6;

/** px = left + x × scale, py = top + y × scale : même échelle en x et en y ; width × height : le dessin. */
export type Frame = { scale: number; left: number; top: number; width: number; height: number };

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

/** Trait d'une option : jusqu'au pied de la pointe, la pointe, et la variante coiffée par la pastille. */
export type OptionStroke = {
  /** Trait jusqu'au pied de la pointe ; [] pour un hold. */
  line: Point[];
  /** Pointe ; null pour un hold ou un trait trop court. */
  head: Point[] | null;
  /**
   * Trait quand la pastille, dessinée, coiffe l'extrémité : arrêté à son bord,
   * sans pointe. null : la pastille est ailleurs, trait et pointe restent.
   */
  cappedLine: Point[] | null;
};

/** Anneau d'un hold : centre, rayon, et le cercle échantillonné (fermé). */
export type HoldRing = { center: Point; r: number; points: Point[] };

export type OptionShape = {
  option: DiagramOption;
  /** Trait depuis le joueur de départ (ou vide pour un hold). */
  stroke: OptionStroke;
  /**
   * Le même trait, parti du bord de l'anneau du hold du joueur de départ : à
   * dessiner quand cet anneau est affiché. null si ce joueur n'a pas de hold.
   */
  fromRing: OptionStroke | null;
  /** Anneau d'un hold ; null sinon. */
  ring: HoldRing | null;
  /** Centre de la pastille. */
  pastille: Point;
};

/** Étiquette (objet, cote) : texte, position sur sa ligne de base, ancrage, et le rectangle qu'elle occupe. */
export type LabelShape = { text: string; at: Point; anchor: 'start' | 'middle' | 'end'; box: Box };

/** Cote : trait décalé du segment mesuré, tirets aux extrémités, étiquette. */
export type DimensionShape = { dimension: DiagramDimension; line: [Point, Point]; ticks: [Point, Point][]; label: LabelShape };

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
  dimensions: DimensionShape[];
  /** Étiquettes des objets. */
  labels: LabelShape[];
};

/**
 * État d'un schéma de quiz : repos (aucune option), sélection (la seule option
 * sélectionnée), résultat (ton choix et la meilleure option ; avec showAll, les
 * quatre). Un schéma sans options n'a qu'un état.
 */
export type DiagramState =
  | { kind: 'idle' }
  | { kind: 'selected'; id: OptionId }
  | { kind: 'result'; chosen: OptionId; scores: OptionScores; showAll: boolean };

/** Deux éléments trop proches : leurs noms, et ce qui manque à la marge, en pixels. */
export type Overlap = { first: string; second: string; shortfall: number };

/**
 * Géométrie d'un schéma. Les pastilles ont les mêmes places dans tous les états
 * (repos, sélection, résultat, tout afficher) : un état n'en dessine qu'une partie.
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
  // Joueurs et ballons : ni pastille, ni cote, ni étiquette ne les recouvre.
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
  const pastilles = placed.shapes.map((shape) => ({ ...shape.pastille, r: PASTILLE_OUTER }));
  const objectBoxes = diagram.objects.map((object) => objectBox(object, frame));
  const dimensionLines = placeDimensions(diagram, frame, {
    discs: [...discs, ...pastilles],
    strokes: [...fixedStrokes, ...placed.strokes, ...objectBoxes.map(boxOutline)],
  });
  const labels = placeLabels(diagram, frame, objectBoxes, dimensionLines, {
    strokes: [
      ...(pitch !== null ? pitchStrokes(pitch) : []),
      ...fixedStrokes,
      ...placed.strokes,
      ...dimensionLines.flatMap(dimensionStrokes),
    ],
    discs: [...discs, ...pastilles, ...(pitch?.spots ?? []).map((spot) => ({ ...spot, r: SPOT_RADIUS }))],
  });
  const dimensions = dimensionLines.map((line, index) => ({ ...line, label: labels.dimensions[index] }));
  return { frame, centers, pitch, speedArrows, path, balls, options: placed.shapes, dimensions, labels: labels.objects };
}

/** Rayon extérieur d'un joueur : son halo, son anneau ou son disque. */
export function outerRadius(player: DiagramPlayer): number {
  if (player.you) {
    return HALO_RADIUS + HALO_WIDTH / 2;
  }
  return player.team === 'us' ? PLAYER_RADIUS : OPPONENT_RADIUS + OPPONENT_RING / 2;
}

/** Rayon de l'anneau d'un hold : juste au-delà du halo (ou du disque), et du ballon si le joueur le porte. */
export function ringRadius(player: DiagramPlayer): number {
  const beyondPlayer = outerRadius(player) + RING_GAP;
  if (!player.ball) {
    return beyondPlayer;
  }
  return Math.max(beyondPlayer, Math.hypot(BALL_OFFSET.x, BALL_OFFSET.y) + BALL_OUTER + RING_GAP);
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

// États.

/**
 * Options dessinées dans un état, parmi celles du schéma (ids) : aucune au
 * repos ; la sélectionnée ; au résultat, ton choix et la meilleure option (le
 * score le plus haut, à égalité le plus petit rang : seule si c'est ton choix),
 * ou toutes avec showAll.
 */
export function visibleOptionIds(ids: readonly OptionId[], state: DiagramState): OptionId[] {
  if (state.kind === 'idle') {
    return [];
  }
  if (state.kind === 'selected') {
    return ids.filter((id) => id === state.id);
  }
  if (state.showAll) {
    return [...ids];
  }
  const best = bestOptionId(state.scores);
  return ids.filter((id) => id === state.chosen || id === best);
}

/** « repos », « sélection B », « réponse C », « réponse C, tout afficher ». */
export function describeState(state: DiagramState): string {
  if (state.kind === 'idle') {
    return 'repos';
  }
  if (state.kind === 'selected') {
    return `sélection ${optionLetter(state.id)}`;
  }
  return `réponse ${optionLetter(state.chosen)}${state.showAll ? ', tout afficher' : ''}`;
}

/** Tous les états d'un schéma de quiz, pour ses options et les scores de la question ; un seul sans options. */
export function allStates(ids: readonly OptionId[], scores: OptionScores | null): DiagramState[] {
  if (ids.length === 0) {
    return [{ kind: 'idle' }];
  }
  const states: DiagramState[] = [{ kind: 'idle' }, ...ids.map((id): DiagramState => ({ kind: 'selected', id }))];
  if (scores !== null) {
    states.push(...ids.map((chosen): DiagramState => ({ kind: 'result', chosen, scores, showAll: false })));
    states.push({ kind: 'result', chosen: ids[0], scores, showAll: true });
  }
  return states;
}

/** Joueurs dont un hold est affiché : leurs autres options partent du bord de l'anneau. */
export function playersWithRing(options: readonly OptionShape[], visible: readonly OptionId[]): Set<string> {
  const players = new Set<string>();
  for (const shape of options) {
    if (shape.ring !== null && visible.includes(shape.option.id)) {
      players.add(shape.option.from);
    }
  }
  return players;
}

/** Trait d'une option dans l'état : depuis l'anneau si celui du joueur de départ est affiché, sinon depuis le joueur. */
export function optionStroke(shape: OptionShape, ringPlayers: ReadonlySet<string>): OptionStroke {
  return shape.fromRing !== null && ringPlayers.has(shape.option.from) ? shape.fromRing : shape.stroke;
}

// Superpositions.

/** Un élément du dessin et sa forme : disque, polylignes d'une épaisseur, ou rectangle. */
type Element = { name: string } & (
  | { shape: 'disc'; disc: Disc }
  | { shape: 'poly'; polys: Point[][]; half: number }
  | { shape: 'box'; box: Box }
);

/** Trait d'une option affichée. */
type LineElement = { name: string; shape: 'poly'; polys: Point[][]; half: number; option: DiagramOption };

/**
 * Superpositions d'un schéma dans un état, règles de contenu du chantier 16 :
 * une pastille, un anneau, une étiquette ou une cote ne touche (marge CLEARANCE)
 * ni un joueur (halo compris), ni le ballon, ni une autre pastille, étiquette
 * ou cote, ni l'anneau d'un autre hold, ni le trait d'une autre option (sauf un
 * trait parti du bord de l'anneau, même joueur), ni une flèche de vitesse, ni le
 * trajet, et reste dans le cadre ; deux traits d'option
 * ne se croisent pas hors de leur départ commun ; un trait d'option ne traverse
 * aucun joueur hors son départ et son receveur ; deux joueurs ne se touchent
 * pas, ni un ballon et un autre joueur ; une flèche de vitesse ne touche aucun
 * autre joueur. Seuls les éléments dessinés dans l'état comptent.
 */
export function findOverlaps(diagram: DiagramData, layout: DiagramLayout, state: DiagramState): Overlap[] {
  const overlaps: Overlap[] = [];
  const visible = visibleOptionIds(
    layout.options.map((shape) => shape.option.id),
    state,
  );
  const ringPlayers = playersWithRing(layout.options, visible);
  const shown = layout.options.filter((shape) => visible.includes(shape.option.id));
  const carrier = diagram.players.find((player) => player.ball);

  const players: (Element & { id: string })[] = diagram.players.map((player) => ({
    id: player.id,
    name: `joueur ${player.id}`,
    shape: 'disc',
    disc: { ...(layout.centers.get(player.id) ?? project(layout.frame, player)), r: outerRadius(player) },
  }));
  // Le premier ballon est celui du porteur, s'il y en a un.
  const balls: (Element & { owner: string | null })[] = layout.balls.map((ball, index) => ({
    owner: index === 0 && carrier !== undefined ? carrier.id : null,
    name: 'ballon',
    shape: 'disc',
    disc: { ...ball, r: BALL_OUTER },
  }));
  const lines: LineElement[] = shown
    .filter((shape) => shape.ring === null)
    .map((shape): LineElement => {
      const stroke = optionStroke(shape, ringPlayers);
      return {
        option: shape.option,
        name: `trait ${optionLetter(shape.option.id)}`,
        shape: 'poly',
        polys: [stroke.line, ...(stroke.head !== null ? [closed(stroke.head)] : [])],
        half: STROKE_HALF,
      };
    });
  const arrows: (Element & { owner: string })[] = layout.speedArrows.map((arrow) => ({
    owner: arrow.player.id,
    name: `flèche de vitesse de ${arrow.player.id}`,
    shape: 'poly',
    polys: [[arrow.start, arrow.end], closed(arrow.head)],
    half: STROKE_HALF,
  }));
  const path: Element[] =
    layout.path !== null
      ? [
          {
            name: 'trajet',
            shape: 'poly',
            polys: [layout.path.line, ...(layout.path.head !== null ? [closed(layout.path.head)] : [])],
            half: STROKE_HALF,
          },
        ]
      : [];
  // Marques : pastilles et anneaux des options affichées, étiquettes, cotes.
  type Mark = Element & { optionId: OptionId | null; owner: string | null };
  const marks: Mark[] = [
    ...shown.map(
      (shape): Mark => ({
        optionId: shape.option.id,
        owner: null,
        name: `pastille ${optionLetter(shape.option.id)}`,
        shape: 'disc',
        disc: { ...shape.pastille, r: PASTILLE_OUTER },
      }),
    ),
    ...shown.flatMap((shape): Mark[] =>
      shape.ring !== null
        ? [
            {
              optionId: shape.option.id,
              owner: shape.option.from,
              name: `anneau ${optionLetter(shape.option.id)}`,
              shape: 'poly',
              polys: [shape.ring.points],
              half: STROKE_HALF,
            },
          ]
        : [],
    ),
    ...layout.labels.map((label): Mark => ({ optionId: null, owner: null, name: `étiquette « ${label.text} »`, shape: 'box', box: label.box })),
    ...layout.dimensions.flatMap((dimension): Mark[] => [
      {
        optionId: null,
        owner: null,
        name: `cote « ${dimension.dimension.label} »`,
        shape: 'poly',
        polys: dimensionStrokes(dimension),
        half: DIMENSION.strokeHalf,
      },
      {
        optionId: null,
        owner: null,
        name: `étiquette de la cote « ${dimension.dimension.label} »`,
        shape: 'box',
        box: dimension.label.box,
      },
    ]),
  ];

  const report = (first: Element, second: Element, required: number) => {
    const shortfall = required - elementsDistance(first, second);
    if (shortfall > EPSILON) {
      overlaps.push({ first: first.name, second: second.name, shortfall });
    }
  };

  for (const [index, mark] of marks.entries()) {
    for (const player of players) {
      if (!(mark.shape === 'poly' && mark.owner === player.id)) {
        report(mark, player, CLEARANCE);
      }
    }
    for (const ball of balls) {
      if (!(mark.shape === 'poly' && mark.owner !== null && mark.owner === ball.owner)) {
        report(mark, ball, CLEARANCE);
      }
    }
    for (const other of marks.slice(index + 1)) {
      // La pastille d'un hold est accolée à son anneau par construction.
      if (mark.optionId === null || mark.optionId !== other.optionId) {
        report(mark, other, CLEARANCE);
      }
    }
    for (const line of lines) {
      // Un trait parti d'un joueur dont le hold est affiché part du bord de son anneau.
      const fromOwnRing = mark.shape === 'poly' && mark.owner !== null && mark.owner === line.option.from;
      if (mark.optionId !== line.option.id && !fromOwnRing) {
        report(mark, line, CLEARANCE);
      }
    }
    for (const arrow of arrows) {
      report(mark, arrow, CLEARANCE);
    }
    for (const trail of path) {
      report(mark, trail, CLEARANCE);
    }
    const outside = frameShortfall(mark, layout.frame);
    if (outside > EPSILON) {
      overlaps.push({ first: mark.name, second: 'cadre', shortfall: outside });
    }
  }
  for (const [index, line] of lines.entries()) {
    for (const other of lines.slice(index + 1)) {
      const crossing = linesCrossing(line, other, layout);
      if (crossing > EPSILON) {
        overlaps.push({ first: line.name, second: other.name, shortfall: crossing });
      }
    }
    for (const player of players) {
      if (player.id !== line.option.from && player.id !== line.option.to?.player) {
        report(line, player, CLEARANCE);
      }
    }
  }
  for (const [index, player] of players.entries()) {
    for (const other of players.slice(index + 1)) {
      report(player, other, CLEARANCE);
    }
    for (const ball of balls) {
      if (ball.owner !== player.id) {
        report(ball, player, CLEARANCE);
      }
    }
    for (const arrow of arrows) {
      if (arrow.owner !== player.id) {
        report(arrow, player, CLEARANCE);
      }
    }
  }
  return overlaps;
}

/** Distance entre les bords de deux éléments ; négative s'ils se recouvrent. */
function elementsDistance(first: Element, second: Element): number {
  if (first.shape === 'disc') {
    if (second.shape === 'disc') {
      return distance(first.disc, second.disc) - first.disc.r - second.disc.r;
    }
    if (second.shape === 'poly') {
      return polysDistanceToPoint(second.polys, first.disc) - second.half - first.disc.r;
    }
    return boxDistanceToPoint(second.box, first.disc) - first.disc.r;
  }
  if (first.shape === 'poly') {
    if (second.shape === 'disc') {
      return elementsDistance(second, first);
    }
    if (second.shape === 'poly') {
      return polysDistance(first.polys, second.polys) - first.half - second.half;
    }
    return polysDistanceToBox(first.polys, second.box) - first.half;
  }
  if (second.shape === 'box') {
    return boxesDistance(first.box, second.box);
  }
  return elementsDistance(second, first);
}

/** De combien une marque sort du cadre (0 si elle y tient). */
function frameShortfall(mark: Element, frame: Frame): number {
  const box = elementBounds(mark);
  return Math.max(0, -box.x, -box.y, box.x + box.width - frame.width, box.y + box.height - frame.height);
}

/** Rectangle englobant d'un élément, épaisseur comprise. */
function elementBounds(element: Element): Box {
  if (element.shape === 'disc') {
    return { x: element.disc.x - element.disc.r, y: element.disc.y - element.disc.r, width: 2 * element.disc.r, height: 2 * element.disc.r };
  }
  if (element.shape === 'box') {
    return element.box;
  }
  const points = element.polys.flat();
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs) - element.half;
  const y = Math.min(...ys) - element.half;
  return { x, y, width: Math.max(...xs) + element.half - x, height: Math.max(...ys) + element.half - y };
}

/**
 * Deux traits d'option se croisent (ou se touchent) : ce qui manque pour qu'ils
 * soient séparés, 0 sinon. Deux options du même joueur partent du même point :
 * leur début, à COMMON_START du joueur, est ignoré.
 */
function linesCrossing(first: LineElement, second: LineElement, layout: DiagramLayout): number {
  let firstPolys = first.polys;
  let secondPolys = second.polys;
  if (first.option.from === second.option.from) {
    const start = layout.centers.get(first.option.from);
    if (start !== undefined) {
      firstPolys = firstPolys.map((poly) => beyondRadius(poly, start, COMMON_START));
      secondPolys = secondPolys.map((poly) => beyondRadius(poly, start, COMMON_START));
    }
  }
  return Math.max(0, first.half + second.half - polysDistance(firstPolys, secondPolys));
}

/** Partie d'une polyligne hors du disque (center, radius) : les points dedans sont retirés, le premier tronçon coupé au bord. */
function beyondRadius(poly: readonly Point[], center: Point, radius: number): Point[] {
  const kept: Point[] = [];
  for (let index = 0; index < poly.length; index += 1) {
    const point = poly[index];
    const inside = distance(point, center) < radius;
    if (!inside) {
      if (kept.length === 0 && index > 0 && distance(poly[index - 1], center) < radius) {
        // Tronçon qui sort du disque : il commence au bord.
        kept.push(exitPoint(poly[index - 1], point, center, radius));
      }
      kept.push(point);
    }
  }
  return kept;
}

/** Point du segment ab (a dans le disque, b hors) sur le bord du disque. */
function exitPoint(a: Point, b: Point, center: Point, radius: number): Point {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    const point = add(a, scale(subtract(b, a), mid));
    if (distance(point, center) < radius) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return add(a, scale(subtract(b, a), high));
}

function polysDistanceToPoint(polys: readonly Point[][], point: Point): number {
  let nearest = Infinity;
  for (const poly of polys) {
    nearest = Math.min(nearest, distanceToPolyline(point, poly));
  }
  return nearest;
}

function polysDistance(first: readonly Point[][], second: readonly Point[][]): number {
  let nearest = Infinity;
  for (const a of first) {
    for (const b of second) {
      nearest = Math.min(nearest, polylinesDistance(a, b));
    }
  }
  return nearest;
}

function polysDistanceToBox(polys: readonly Point[][], box: Box): number {
  let nearest = Infinity;
  for (const poly of polys) {
    if (poly.length === 1) {
      nearest = Math.min(nearest, boxDistanceToPoint(box, poly[0]));
    }
    for (let index = 1; index < poly.length; index += 1) {
      nearest = Math.min(nearest, segmentDistanceToBox(poly[index - 1], poly[index], box));
    }
  }
  return nearest;
}

/** Distance d'un point au bord d'un rectangle ; négative dedans (jusqu'au bord le plus proche). */
function boxDistanceToPoint(box: Box, point: Point): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  if (dx > 0 || dy > 0) {
    return Math.hypot(dx, dy);
  }
  return -Math.min(point.x - box.x, box.x + box.width - point.x, point.y - box.y, box.y + box.height - point.y);
}

/** Distance d'un segment à un rectangle : 0 s'il le traverse ou le touche. */
function segmentDistanceToBox(a: Point, b: Point, box: Box): number {
  if (lengthInBox(a, b, box) > 0 || boxDistanceToPoint(box, a) <= 0 || boxDistanceToPoint(box, b) <= 0) {
    return 0;
  }
  const outline = boxOutline(box);
  let nearest = Infinity;
  for (let index = 1; index < outline.length; index += 1) {
    nearest = Math.min(nearest, segmentsDistance(a, b, outline[index - 1], outline[index]));
  }
  return nearest;
}

/** Distance entre deux rectangles ; négative s'ils se recouvrent (le plus petit enfoncement). */
function boxesDistance(first: Box, second: Box): number {
  const dx = Math.max(second.x - (first.x + first.width), first.x - (second.x + second.width));
  const dy = Math.max(second.y - (first.y + first.height), first.y - (second.y + second.height));
  if (dx > 0 || dy > 0) {
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  }
  return Math.max(dx, dy);
}

// Repère : mètres du schéma → pixels de la DA.

/**
 * La vue entière dans le cadre de sa vue, marges comprises, à la plus grande
 * échelle possible. La place en trop va en largeur vers notre camp (half_right,
 * box_right : vue calée sur le but de droite ; half_left : sur celui de gauche),
 * en hauteur à parts égales.
 */
function frameOf(diagram: DiagramData): Frame {
  const region = viewRegion(diagram.view, diagram.width_m, diagram.center);
  const ratio = viewFrame(diagram.view);
  const width = VIEW_WIDTH;
  const height = (VIEW_WIDTH * ratio.height) / ratio.width;
  const innerWidth = width - 2 * FRAME_MARGIN;
  const innerHeight = height - 2 * FRAME_MARGIN;
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
    width,
    height,
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
  return [...pitch.boxes.map(boxOutline), pitch.halfway, circlePoints(pitch.circle.center, pitch.circle.r), ...pitch.arcs.map((arc) => arc.points)];
}

/** Cercle échantillonné, fermé. */
function circlePoints(center: Point, r: number): Point[] {
  return Array.from({ length: CIRCLE_STEPS + 1 }, (_, step) => polar(center, r, (2 * Math.PI * step) / CIRCLE_STEPS));
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

/** Disque qu'une pastille, une cote ou une étiquette ne recouvre pas : joueur, ballon, pastille, point du terrain. */
type Disc = Point & { r: number };

/** Une place possible de la pastille d'une option. */
type Spot = {
  at: Point;
  /** Rang de préférence dans la liste de l'option (0 : la place idéale), ajouté au coût. */
  rank: number;
  /** La pastille coiffe l'extrémité, à la place de la pointe. */
  capped: boolean;
};

/** Une option avant le choix de sa pastille. */
type OptionPlan = {
  option: DiagramOption;
  stroke: OptionStroke;
  fromRing: OptionStroke | null;
  ring: HoldRing | null;
  /** Trait, pointe ou anneau, qu'une autre pastille ne doit pas toucher. */
  strokes: Point[][];
  /** Places de la pastille, de la préférée à la dernière. */
  spots: Spot[];
};

/**
 * Traits des options, anneaux des holds et places des pastilles. Une pastille
 * se pose à l'extrémité de son trait (juste avant la pointe vers un joueur,
 * donc avant le receveur) ; si la place est prise, elle recule le long du
 * trait, puis s'en écarte perpendiculairement. Hold : anneau autour du joueur
 * (et de son ballon), pastille accolée à l'anneau, dans la première direction
 * libre. Jamais : un bord de pastille à moins de PASTILLE_GAP d'un joueur, d'un
 * ballon, d'une autre pastille, du trait ou de l'anneau d'une autre option,
 * d'une flèche de vitesse ou du trajet, ni hors du cadre. Les options sont
 * posées une à une, chacune à sa place la moins coûteuse, dans chaque ordre
 * possible (24 pour 4 options) : la répartition la moins coûteuse l'emporte, à
 * égalité le premier ordre essayé. Renvoie aussi les traits posés (traits,
 * pointes, anneaux), pour les cotes et les étiquettes.
 */
function placeOptions(
  diagram: DiagramData,
  frame: Frame,
  centers: ReadonlyMap<string, Point>,
  discs: readonly Disc[],
  fixedStrokes: readonly Point[][],
): { shapes: OptionShape[]; strokes: Point[][] } {
  const players = new Map(diagram.players.map((player) => [player.id, player]));
  const holders = new Set(diagram.options.filter((option) => option.to === null).map((option) => option.from));
  const plans: OptionPlan[] = [];
  for (const option of diagram.options) {
    const from = players.get(option.from);
    if (from === undefined) {
      continue;
    }
    const start = centerOf(centers, frame, from);
    if (option.to === null) {
      plans.push(holdPlan(option, start, ringRadius(from)));
      continue;
    }
    const target = option.to.player !== null ? players.get(option.to.player) : undefined;
    const end = target !== undefined ? centerOf(centers, frame, target) : project(frame, option.to);
    const via = option.path.map((point) => project(frame, point));
    const targetRadius = target !== undefined ? outerRadius(target) : null;
    const ringStart = holders.has(from.id) ? ringRadius(from) + STROKE_HALF : null;
    plans.push(linePlan(option, start, outerRadius(from), ringStart, via, end, targetRadius));
  }
  // Coût de chaque place sans les autres pastilles : il ne change pas d'un ordre à l'autre.
  const costs = plans.map((plan) => {
    const strokes = [...fixedStrokes, ...plans.flatMap((other) => (other === plan ? [] : other.strokes))];
    return plan.spots.map((spot) => spot.rank + fixedCost(spot, discs, strokes, frame));
  });
  const picks = bestPicks(plans, costs);
  const shapes = plans.map((plan, index): OptionShape => {
    const spot = plan.spots[picks[index]];
    const stroke = spot.capped ? plan.stroke : { ...plan.stroke, cappedLine: null };
    const fromRing = plan.fromRing === null ? null : spot.capped ? plan.fromRing : { ...plan.fromRing, cappedLine: null };
    return { option: plan.option, stroke, fromRing, ring: plan.ring, pastille: spot.at };
  });
  return { shapes: shapes.sort((a, b) => a.option.id - b.option.id), strokes: plans.flatMap((plan) => plan.strokes) };
}

/**
 * Trait vers un point ou vers un joueur (targetRadius : son rayon), depuis le
 * joueur (fromRadius) et, s'il porte un hold, depuis son anneau (ringStart), et
 * les places de sa pastille.
 */
function linePlan(
  option: DiagramOption,
  from: Point,
  fromRadius: number,
  ringStart: number | null,
  via: readonly Point[],
  end: Point,
  targetRadius: number | null,
): OptionPlan {
  const full = smooth([from, ...via, end]);
  const total = lengthOf(full);
  const endCut = targetRadius !== null ? targetRadius + TARGET_GAP : 0;
  const toPoint = targetRadius === null;
  const stroke = strokeOf(full, total, fromRadius + ARROW_GAP, endCut, toPoint);
  const fromRing = ringStart === null ? null : strokeOf(full, total, ringStart + ARROW_GAP, endCut, toPoint);
  const startCut = Math.min(fromRadius + ARROW_GAP, total / 2);
  const drawn = slicePolyline(full, startCut, Math.max(startCut, total - endCut));
  const length = lengthOf(drawn);
  const { point: tip, direction } = pointAt(drawn, length);
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
    stroke,
    fromRing,
    ring: null,
    strokes: [drawn, ...(stroke.head !== null ? [closed(stroke.head)] : [])],
    spots: places.map((place, rank) => ({ ...place, rank })),
  };
}

/** Trait d'une option le long de `full`, coupé de startCut au départ et de endCut à l'arrivée. */
function strokeOf(full: readonly Point[], total: number, startCut: number, endCut: number, toPoint: boolean): OptionStroke {
  const start = Math.min(startCut, total / 2);
  const drawn = slicePolyline(full, start, Math.max(start, total - endCut));
  const length = lengthOf(drawn);
  const { point: tip, direction } = pointAt(drawn, length);
  const head = length >= ARROW_HEAD.length ? arrowHead(tip, direction, ARROW_HEAD.length, ARROW_HEAD.halfWidth) : null;
  return {
    line: head !== null ? slicePolyline(drawn, 0, length - (ARROW_HEAD.length - ARROW_HEAD.overlap)) : drawn,
    head,
    // Pastille à l'extrémité : le trait s'arrête sous son bord (rien s'il est plus court qu'elle).
    cappedLine: toPoint ? (length > PASTILLE_RADIUS ? slicePolyline(drawn, 0, length - PASTILLE_RADIUS) : []) : null,
  };
}

/** Hold : anneau de rayon `radius` autour du joueur, pastille accolée ; une place par direction de HOLD_ANGLES. */
function holdPlan(option: DiagramOption, center: Point, radius: number): OptionPlan {
  const ring: HoldRing = { center, r: radius, points: circlePoints(center, radius) };
  const pastilleRadius = radius + STROKE_HALF + PASTILLE_OUTER;
  const empty: OptionStroke = { line: [], head: null, cappedLine: null };
  return {
    option,
    stroke: empty,
    fromRing: null,
    ring,
    strokes: [ring.points],
    spots: HOLD_ANGLES.map((degrees, rank) => ({ at: polar(center, pastilleRadius, (degrees * Math.PI) / 180), rank, capped: false })),
  };
}

/** Coût d'une place sans les autres pastilles : chevauchements (joueurs, ballons, traits, anneaux, cadre). */
function fixedCost(spot: Spot, discs: readonly Disc[], strokes: readonly Point[][], frame: Frame): number {
  let overlap = Math.max(
    0,
    PASTILLE_OUTER - Math.min(spot.at.x, frame.width - spot.at.x, spot.at.y, frame.height - spot.at.y) - EPSILON,
  );
  for (const disc of discs) {
    overlap += gapShortfall(distance(spot.at, disc) - disc.r - PASTILLE_OUTER);
  }
  for (const stroke of strokes) {
    overlap += gapShortfall(distanceToPolyline(spot.at, stroke) - STROKE_HALF - PASTILLE_OUTER);
  }
  return costOf(overlap);
}

/** Coût d'une place face aux pastilles déjà posées. */
function placedCost(spot: Spot, placed: readonly Point[]): number {
  let overlap = 0;
  for (const other of placed) {
    overlap += gapShortfall(distance(spot.at, other) - 2 * PASTILLE_OUTER);
  }
  return costOf(overlap);
}

/** Ce qui manque pour que deux bords soient à PASTILLE_GAP l'un de l'autre ; 0 s'ils le sont. */
function gapShortfall(clearance: number): number {
  return Math.max(0, PASTILLE_GAP - clearance - EPSILON);
}

function costOf(overlap: number): number {
  return overlap > 0 ? OVERLAP_COST * (1 + overlap) : 0;
}

/** Place retenue de chaque option (index dans ses spots) : la répartition la moins coûteuse sur tous les ordres. */
function bestPicks(plans: readonly OptionPlan[], costs: readonly (readonly number[])[]): number[] {
  let best: { total: number; picks: number[] } | null = null;
  for (const order of permutations(plans.length)) {
    const picks = plans.map(() => 0);
    const placed: Point[] = [];
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
      placed.push(spots[pick].at);
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

// Cotes.

/** Ce qu'une cote ne touche pas : disques (joueurs, ballons, pastilles) et traits (options, flèches, trajet, objets). */
type DimensionObstacles = { discs: Disc[]; strokes: Point[][] };

/** Cote sans son étiquette, posée après. */
type DimensionLine = Omit<DimensionShape, 'label'> & {
  /** Normale du côté où la cote est décalée (vers l'extérieur) : l'étiquette va d'abord de ce côté. */
  normal: Point;
};

/**
 * Chaque cote : trait parallèle au segment mesuré, décalé de DIMENSION.offset du
 * côté libre (le moins gêné par les joueurs, ballons, pastilles, traits et
 * objets ; à égalité, à droite du sens from → to), tirets perpendiculaires aux
 * extrémités. Les cotes déjà posées comptent pour les suivantes.
 */
function placeDimensions(diagram: DiagramData, frame: Frame, obstacles: DimensionObstacles): DimensionLine[] {
  const placed: DimensionLine[] = [];
  for (const dimension of diagram.dimensions) {
    const from = project(frame, dimension.from);
    const to = project(frame, dimension.to);
    const tangent = normalize(subtract(to, from));
    const right = { x: -tangent.y, y: tangent.x };
    const strokes = [...obstacles.strokes, ...placed.flatMap(dimensionStrokes)];
    const sides = [right, scale(right, -1)].map((normal) => {
      const line = dimensionLine(dimension, from, to, normal);
      return { line, conflict: dimensionConflict(line, obstacles.discs, strokes, frame) };
    });
    placed.push(sides[1].conflict < sides[0].conflict ? sides[1].line : sides[0].line);
  }
  return placed;
}

function dimensionLine(dimension: DiagramDimension, from: Point, to: Point, normal: Point): DimensionLine {
  const offset = scale(normal, DIMENSION.offset);
  const a = add(from, offset);
  const b = add(to, offset);
  const tick = scale(normal, DIMENSION.tick);
  return {
    dimension,
    line: [a, b],
    ticks: [
      [subtract(a, tick), add(a, tick)],
      [subtract(b, tick), add(b, tick)],
    ],
    normal,
  };
}

/** Polylignes d'une cote : son trait et ses deux tirets. */
function dimensionStrokes(dimension: Pick<DimensionShape, 'line' | 'ticks'>): Point[][] {
  return [dimension.line, ...dimension.ticks];
}

/** Gêne d'une cote : ce qui manque à la marge face aux disques et aux traits, et sa sortie du cadre. */
function dimensionConflict(line: DimensionLine, discs: readonly Disc[], strokes: readonly Point[][], frame: Frame): number {
  const polys = dimensionStrokes(line);
  let conflict = 0;
  for (const disc of discs) {
    conflict += Math.max(0, CLEARANCE - (polysDistanceToPoint(polys, disc) - disc.r - DIMENSION.strokeHalf));
  }
  for (const stroke of strokes) {
    conflict += Math.max(0, CLEARANCE - (polysDistance(polys, [stroke]) - STROKE_HALF - DIMENSION.strokeHalf));
  }
  const bounds = elementBounds({ name: '', shape: 'poly', polys, half: DIMENSION.strokeHalf });
  conflict += Math.max(0, -bounds.x, -bounds.y, bounds.x + bounds.width - frame.width, bounds.y + bounds.height - frame.height);
  return conflict;
}

// Étiquettes d'objets et de cotes.

/** Ce qu'une étiquette ne croise pas (traits, lignes du terrain) et ne recouvre pas (disques). */
type LabelObstacles = { strokes: Point[][]; discs: Disc[] };

type LabelCandidate = { box: Box; at: Point; anchor: LabelShape['anchor'] };

/**
 * Étiquette de chaque objet (sous l'objet, sinon au-dessus, à droite, à gauche ;
 * une zone : en son centre d'abord), puis de chaque cote (au-delà de son trait,
 * sinon en deçà, puis après chaque extrémité), à la première place libre : dans
 * le cadre, sans croiser ni trait, ni ligne du terrain, ni bord de zone, ni
 * cote, sans recouvrir ni joueur, ni ballon, ni pastille, ni autre objet, ni
 * étiquette. Aucune place libre : la moins gênée.
 */
function placeLabels(
  diagram: DiagramData,
  frame: Frame,
  boxes: readonly Box[],
  dimensions: readonly DimensionLine[],
  obstacles: LabelObstacles,
): { objects: LabelShape[]; dimensions: LabelShape[] } {
  // Zone : son bord se croise ; les autres objets se recouvrent.
  const strokes = [
    ...obstacles.strokes,
    ...diagram.objects.flatMap((object, index) => (object.type === 'zone' ? [boxOutline(boxes[index])] : [])),
  ];
  const taken = diagram.objects.flatMap((object, index) => (object.type !== 'zone' ? [boxes[index]] : []));
  const choose = (candidates: readonly LabelCandidate[], text: string): LabelShape => {
    const conflicts = candidates.map(({ box }) => labelConflict(box, strokes, obstacles.discs, taken, frame));
    // La moins gênée, la première à égalité : une place libre (0) passe avant toute autre.
    const chosen = candidates[conflicts.indexOf(Math.min(...conflicts))];
    taken.push(chosen.box);
    return { text, at: chosen.at, anchor: chosen.anchor, box: chosen.box };
  };
  const objects: LabelShape[] = [];
  diagram.objects.forEach((object, index) => {
    if (object.label !== null) {
      objects.push(choose(labelCandidates(object, object.label, project(frame, object), boxes[index]), object.label));
    }
  });
  const dimensionLabels = dimensions.map((dimension) =>
    choose(dimensionLabelCandidates(dimension), dimension.dimension.label),
  );
  return { objects, dimensions: dimensionLabels };
}

/** Taille du rectangle d'un texte de LABEL_SIZE : largeur estimée, hauteur ascendante + descendante. */
function textSize(label: string): { width: number; height: number; ascent: number } {
  return {
    width: Array.from(label).length * LABEL_SIZE * CHAR_WIDTH,
    height: (TEXT_ASCENT + TEXT_DESCENT) * LABEL_SIZE,
    ascent: TEXT_ASCENT * LABEL_SIZE,
  };
}

/** Places d'une étiquette autour de son objet (own), de la préférée à la dernière. */
function labelCandidates(object: DiagramObject, label: string, center: Point, own: Box): LabelCandidate[] {
  const { width, height, ascent } = textSize(label);
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
 * Places de l'étiquette d'une cote, centrée : au-delà de son trait (côté
 * extérieur, loin du segment mesuré), en deçà, puis après chaque extrémité.
 */
function dimensionLabelCandidates(dimension: DimensionLine): LabelCandidate[] {
  const { width, height, ascent } = textSize(dimension.dimension.label);
  const [a, b] = dimension.line;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tangent = normalize(subtract(b, a));
  const normal = dimension.normal;
  // Demi-étendue du rectangle dans une direction : il reste droit, le trait non.
  const reach = (direction: Point) => (width / 2) * Math.abs(direction.x) + (height / 2) * Math.abs(direction.y);
  const centered = (center: Point): LabelCandidate => ({
    box: { x: center.x - width / 2, y: center.y - height / 2, width, height },
    at: { x: center.x, y: center.y - height / 2 + ascent },
    anchor: 'middle',
  });
  const beside = DIMENSION.tick + LABEL_GAP;
  return [
    centered(add(middle, scale(normal, beside + reach(normal)))),
    centered(subtract(middle, scale(normal, beside + reach(normal)))),
    centered(add(b, scale(tangent, LABEL_GAP + reach(tangent)))),
    centered(subtract(a, scale(tangent, LABEL_GAP + reach(tangent)))),
  ];
}

/**
 * Gêne d'une étiquette posée dans `box`, en pixels : longueur des traits qui la
 * traversent (marge CLEARANCE comprise), enfoncement des disques et des
 * rectangles qui la recouvrent ; 0 pour une place libre, infinie hors du cadre.
 */
function labelConflict(
  box: Box,
  strokes: readonly Point[][],
  discs: readonly Disc[],
  taken: readonly Box[],
  frame: Frame,
): number {
  if (box.x < 0 || box.y < 0 || box.x + box.width > frame.width || box.y + box.height > frame.height) {
    return Infinity;
  }
  const padded = {
    x: box.x - CLEARANCE - STROKE_HALF,
    y: box.y - CLEARANCE - STROKE_HALF,
    width: box.width + 2 * (CLEARANCE + STROKE_HALF),
    height: box.height + 2 * (CLEARANCE + STROKE_HALF),
  };
  let conflict = 0;
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      conflict += lengthInBox(stroke[index - 1], stroke[index], padded);
    }
  }
  for (const disc of discs) {
    conflict += Math.max(0, disc.r + CLEARANCE - boxDistanceToPoint(box, disc));
  }
  for (const other of taken) {
    conflict += Math.max(0, CLEARANCE - boxesDistance(box, other));
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
