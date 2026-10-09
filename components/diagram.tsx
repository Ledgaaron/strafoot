import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  HALFWAY_X,
  PITCH_LENGTH,
  PITCH_WIDTH,
  viewRegion,
  type DiagramData,
  type DiagramObject,
  type DiagramOption,
  type DiagramPlayer,
  type DiagramResult,
  type OptionId,
  type OptionTarget,
  type Point,
  type Speed,
} from '../lib/diagram-types';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from '../lib/diagrams';
import { colors, fontSize, radius, size, spacing, text } from '../lib/theme';

// Schéma dessiné depuis ses données (lib/diagram-types.ts), selon la DA
// (Illustration, « Schéma tactique vu du dessus ») : terrain sombre aux lignes
// pitchLine, nous en disques blancs, eux en anneaux gris, toi avec un halo
// violet, options 1 à 4 numérotées. Aucune animation : les flèches sont fixes.
// Le dessin est calculé dans le repère de la DA (schéma de 358 px de large sur un
// écran de 390) puis mis à l'échelle de la largeur réelle, cadre 722 × 646 :
// même rendu sur le web et en natif, à toutes les largeurs.

/** Repère du dessin, en pixels de la DA. */
const VIEW_WIDTH = 358;
const VIEW_HEIGHT = (VIEW_WIDTH * DIAGRAM_HEIGHT) / DIAGRAM_WIDTH;
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
const LINE_WIDTH = 1.5;
const SPOT_RADIUS = 2;
const PLAYER_RADIUS = 11;
const OPPONENT_RADIUS = 10;
const OPPONENT_RING = 2.5;
const HALO_RADIUS = 16;
const HALO_WIDTH = 2.5;
const BALL_RADIUS = 4.5;
const BALL_RING = 1.5;
/** Ballon collé au porteur, en bas à gauche du disque. */
const BALL_OFFSET: Point = { x: -15, y: 15 };
/** Numéro de maillot : 12 px gras, exception assumée de la DA (repris en toutes lettres dans la question). */
const SHIRT_SIZE = 12;
/** Vitesse : longueur et épaisseur de la flèche, marche · course · sprint. */
const SPEED_ARROWS: Readonly<Record<Speed, { length: number; width: number }>> = {
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
/** Option : trait au repos, choisi (selected), fort et faible (result). */
const OPTION_WIDTH = { idle: 2.5, selected: 3.5, strong: 3, weak: 2 };
/** Passe : pointillé de la DA. */
const OPTION_DASH = [7, 6];
/** Pointe d'une option ; le trait s'arrête sous elle (overlap). */
const OPTION_HEAD = { length: 11, halfWidth: 6, overlap: 3 };
/** Au repos, le trait des options est un violet léger ; la pastille reste pleine. */
const IDLE_LINE_OPACITY = 0.5;
/** Options atténuées autour de l'option choisie (selected). */
const DIMMED_OPACITY = 0.4;
/** Pastille d'une option : 14 px gras, cerclée de surface pour se détacher du trait. */
const PASTILLE_RADIUS = 11;
const PASTILLE_RING = 2;
const PASTILLE_SIZE = fontSize.meta;
/** Hold : arc de 120° autour du joueur, pastille en son milieu. */
const HOLD_SPAN = (2 * Math.PI) / 3;
/** Hold : directions essayées pour la pastille, en degrés (0 à droite, -90 en haut). */
const HOLD_ANGLES = [-45, -135, 45, 135, -90, 90, 0, 180];
/** Pastille dont la place est prise : elle recule le long du trait par pas de 4 px. */
const PASTILLE_STEP = 4;
/** Trajet d'un test. */
const PATH_WIDTH = 2.5;
/** Plot : triangle de 9 px. */
const CONE = { halfWidth: 4.5, top: 5, bottom: 4 };
/** Mannequin vu du dessus. */
const MANNEQUIN = { width: 8, height: 16 };
const OBJECT_STROKE = 2;
const ZONE_DASH = [4, 4];
/** Étiquette d'un objet : secondaire (14 px), 4 px sous l'objet. */
const LABEL_SIZE = fontSize.meta;
const LABEL_GAP = spacing.xs;
/** Points par tronçon d'une course en courbe. */
const CURVE_STEPS = 12;
/** Chiffres centrés sur leur repère : ligne de base abaissée d'environ la moitié de leur hauteur. */
const DIGIT_CENTER = 0.35;
/** Hauteur des chiffres au-dessus de la ligne de base, environ. */
const DIGIT_ASCENT = 0.75;
/**
 * Sur le web, le texte SVG hérite de la police par défaut du navigateur, à
 * empattements : police système explicite. En natif, police système.
 */
const SVG_FONT_FAMILY = Platform.OS === 'web' ? 'system-ui, sans-serif' : undefined;

/** Couleur de l'option choisie après réponse, selon son score (catégorie du quiz). */
const CATEGORY_COLORS: Readonly<Record<0 | 1 | 2 | 3, string>> = {
  3: colors.success,
  2: colors.textMuted,
  1: colors.danger,
  0: colors.error,
};

type DiagramProps = {
  diagram: DiagramData;
  /** Option choisie, en attente : violet plein, les autres atténuées. */
  selected?: OptionId;
  /** Après réponse : options à 3 en succès, la choisie dans sa catégorie, les autres en retrait ; l'emporte sur selected. */
  result?: DiagramResult;
  /** Ce que montre le schéma, pour les lecteurs d'écran ; à défaut, joueurs et options comptés. */
  accessibilityLabel?: string;
};

/** Schéma en pleine largeur, hauteur par le ratio 722 × 646 ; encart score · minute en haut à gauche. */
export function Diagram({ diagram, selected, result, accessibilityLabel }: DiagramProps) {
  const frame = frameOf(diagram);
  const centers = new Map(diagram.players.map((player) => [player.id, project(frame, player)]));
  const options = layoutOptions(diagram, frame, centers);
  const path = layoutPath(diagram, frame, centers);
  const zones = diagram.objects.filter((object) => object.type === 'zone');
  const things = diagram.objects.filter((object) => object.type !== 'zone');
  // Eux d'abord : nos joueurs, et toi, restent au-dessus d'un adversaire qui les touche.
  const players = [...diagram.players].sort((a, b) => drawRank(a) - drawRank(b));
  const carrier = diagram.players.find((player) => player.ball);
  const context = diagram.context;
  return (
    <View role="img" accessibilityLabel={accessibilityLabel ?? describeDiagram(diagram)} style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} fontFamily={SVG_FONT_FAMILY}>
        {diagram.view !== 'local' ? <PitchLines frame={frame} /> : null}
        {zones.map((object, index) => (
          <ObjectMark key={`zone-${index}`} object={object} frame={frame} />
        ))}
        {things.map((object, index) => (
          <ObjectMark key={`object-${index}`} object={object} frame={frame} />
        ))}
        {path !== null ? (
          <G>
            <Polyline
              points={toPoints(path.line)}
              fill="none"
              stroke={colors.text}
              strokeWidth={PATH_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {path.head !== null ? <Polygon points={toPoints(path.head)} fill={colors.text} /> : null}
          </G>
        ) : null}
        {options.map((shape) => {
          const tone = optionTone(shape.option.id, selected, result);
          return (
            // Opacité posée sur le groupe : trait et pointe se recouvrent sans se foncer.
            <G key={shape.option.id} opacity={tone.opacity * tone.lineOpacity}>
              {shape.arc !== null ? (
                <Path d={shape.arc} fill="none" stroke={tone.line} strokeWidth={tone.width} strokeLinecap="round" />
              ) : (
                <Polyline
                  points={toPoints(shape.line)}
                  fill="none"
                  stroke={tone.line}
                  strokeWidth={tone.width}
                  strokeDasharray={shape.option.kind === 'pass' ? OPTION_DASH : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {shape.head !== null ? <Polygon points={toPoints(shape.head)} fill={tone.line} /> : null}
            </G>
          );
        })}
        {diagram.players.map((player) => (
          <SpeedArrow key={`move-${player.id}`} player={player} center={centers.get(player.id) ?? project(frame, player)} />
        ))}
        {players.map((player) => (
          <PlayerMark key={player.id} player={player} center={centers.get(player.id) ?? project(frame, player)} />
        ))}
        {carrier !== undefined ? <Ball at={add(centers.get(carrier.id) ?? project(frame, carrier), BALL_OFFSET)} /> : null}
        {diagram.ball !== null ? <Ball at={project(frame, diagram.ball)} /> : null}
        {path?.ball ? <Ball at={path.ball} /> : null}
        {diagram.objects.map((object, index) =>
          object.label !== null ? (
            <ObjectLabel key={`label-${index}`} object={object} label={object.label} frame={frame} />
          ) : null,
        )}
        {options.map((shape) => {
          const tone = optionTone(shape.option.id, selected, result);
          return (
            <G key={`pastille-${shape.option.id}`} opacity={tone.opacity}>
              <Circle
                cx={shape.pastille.x}
                cy={shape.pastille.y}
                r={PASTILLE_RADIUS}
                fill={tone.fill}
                stroke={colors.surface}
                strokeWidth={PASTILLE_RING}
              />
              <SvgText
                x={shape.pastille.x}
                y={shape.pastille.y + DIGIT_CENTER * PASTILLE_SIZE}
                fontSize={PASTILLE_SIZE}
                fontWeight="700"
                textAnchor="middle"
                fill={tone.label}
              >
                {String(shape.option.id)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {context !== null ? (
        <View style={styles.context}>
          {context.score !== null ? (
            <Text style={text.scoreboard}>{`${context.score.us}–${context.score.them}`}</Text>
          ) : null}
          {context.minute !== null ? (
            <Text style={[text.scoreboard, styles.minute]}>{`${context.minute}’`}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type OptionBadgeProps = {
  id: OptionId;
  selected?: OptionId;
  result?: DiagramResult;
};

/**
 * Numéro d'une option hors du schéma (réponses du quiz) : la même pastille, dans
 * la même couleur que sur le schéma pour les mêmes selected et result.
 */
export function OptionBadge({ id, selected, result }: OptionBadgeProps) {
  const tone = optionTone(id, selected, result);
  return (
    <View style={[styles.badge, { backgroundColor: tone.fill, opacity: tone.opacity }]}>
      <Text style={[text.meta, text.tabular, styles.badgeLabel, { color: tone.label }]}>{id}</Text>
    </View>
  );
}

/** Couleurs d'une option : trait, pastille et numéro, opacité du groupe. */
type OptionTone = {
  line: string;
  lineOpacity: number;
  width: number;
  fill: string;
  label: string;
  opacity: number;
};

/**
 * Au repos : trait violet léger, pastille violette. selected : l'option choisie
 * en violet plein, les autres atténuées. result : les options à 3 en succès,
 * la choisie dans la couleur de sa catégorie, les autres couleur bordure, numéro
 * secondaire.
 */
function optionTone(id: OptionId, selected: OptionId | undefined, result: DiagramResult | undefined): OptionTone {
  if (result !== undefined) {
    const score = result.scores[id];
    if (id === result.chosen || score === 3) {
      const color = id === result.chosen ? CATEGORY_COLORS[score] : colors.success;
      // error ne porte pas de texte sombre lisible : numéro blanc, comme la pastille « Erreur » du quiz.
      const label = color === colors.error ? colors.text : colors.onAccent;
      return { line: color, lineOpacity: 1, width: OPTION_WIDTH.strong, fill: color, label, opacity: 1 };
    }
    return {
      line: colors.border,
      lineOpacity: 1,
      width: OPTION_WIDTH.weak,
      fill: colors.border,
      label: colors.textMuted,
      opacity: 1,
    };
  }
  if (selected === id) {
    return { line: colors.quiz, lineOpacity: 1, width: OPTION_WIDTH.selected, fill: colors.quiz, label: colors.onAccent, opacity: 1 };
  }
  return {
    line: colors.quiz,
    lineOpacity: IDLE_LINE_OPACITY,
    width: OPTION_WIDTH.idle,
    fill: colors.quiz,
    label: colors.onAccent,
    opacity: selected !== undefined ? DIMMED_OPACITY : 1,
  };
}

// Repère : mètres du schéma → pixels de la DA.

/** px = left + x × scale, py = top + y × scale : même échelle en x et en y. */
type Frame = { scale: number; left: number; top: number };

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

function project(frame: Frame, point: Point): Point {
  return { x: frame.left + point.x * frame.scale, y: frame.top + point.y * frame.scale };
}

// Terrain.

/** Lignes du terrain entier ; la vue en montre la partie qui tient dans le cadre. */
function PitchLines({ frame }: { frame: Frame }) {
  const corner = project(frame, { x: 0, y: 0 });
  const center = project(frame, { x: HALFWAY_X, y: CENTER_Y });
  const halfwayTop = project(frame, { x: HALFWAY_X, y: 0 });
  const halfwayBottom = project(frame, { x: HALFWAY_X, y: PITCH_WIDTH });
  return (
    <G fill="none" stroke={colors.pitchLine} strokeWidth={LINE_WIDTH}>
      <Rect x={corner.x} y={corner.y} width={PITCH_LENGTH * frame.scale} height={PITCH_WIDTH * frame.scale} />
      <Line x1={halfwayTop.x} y1={halfwayTop.y} x2={halfwayBottom.x} y2={halfwayBottom.y} />
      <Circle cx={center.x} cy={center.y} r={CIRCLE_RADIUS * frame.scale} />
      <Circle cx={center.x} cy={center.y} r={SPOT_RADIUS} fill={colors.pitchLine} stroke="none" />
      <PitchEnd frame={frame} goalX={0} inward={1} />
      <PitchEnd frame={frame} goalX={PITCH_LENGTH} inward={-1} />
    </G>
  );
}

/** Un bout du terrain : surfaces, point de penalty, arc et but, côté goalX ; inward vers le centre. */
function PitchEnd({ frame, goalX, inward }: { frame: Frame; goalX: number; inward: 1 | -1 }) {
  const box = (depth: number, width: number, outside = false) => {
    const near = outside ? goalX - inward * depth : goalX;
    const far = outside ? goalX : goalX + inward * depth;
    const topLeft = project(frame, { x: Math.min(near, far), y: CENTER_Y - width / 2 });
    return { x: topLeft.x, y: topLeft.y, width: depth * frame.scale, height: width * frame.scale };
  };
  const spot = project(frame, { x: goalX + inward * PENALTY_SPOT, y: CENTER_Y });
  // Arc : cercle de 9,15 m autour du point de penalty, hors de la surface.
  const arcHalfWidth = Math.sqrt(CIRCLE_RADIUS ** 2 - (PENALTY_AREA.depth - PENALTY_SPOT) ** 2);
  const arcStart = project(frame, { x: goalX + inward * PENALTY_AREA.depth, y: CENTER_Y - arcHalfWidth });
  const arcEnd = project(frame, { x: goalX + inward * PENALTY_AREA.depth, y: CENTER_Y + arcHalfWidth });
  const arcRadius = CIRCLE_RADIUS * frame.scale;
  // De haut en bas, bombé vers le centre : sens horaire à gauche, antihoraire à droite.
  const sweep = inward === 1 ? 1 : 0;
  return (
    <>
      <Rect {...box(PENALTY_AREA.depth, PENALTY_AREA.width)} />
      <Rect {...box(GOAL_AREA.depth, GOAL_AREA.width)} />
      <Circle cx={spot.x} cy={spot.y} r={SPOT_RADIUS} fill={colors.pitchLine} stroke="none" />
      <Path d={`M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`} />
      <Rect {...box(GOAL.depth, GOAL.width, true)} />
    </>
  );
}

// Joueurs et ballon.

/** Rayon extérieur d'un joueur : son halo, son anneau ou son disque. */
function outerRadius(player: DiagramPlayer): number {
  if (player.you) {
    return HALO_RADIUS + HALO_WIDTH / 2;
  }
  return player.team === 'us' ? PLAYER_RADIUS : OPPONENT_RADIUS + OPPONENT_RING / 2;
}

/** Ordre de dessin : eux, nous, toi. */
function drawRank(player: DiagramPlayer): number {
  if (player.you) {
    return 2;
  }
  return player.team === 'us' ? 1 : 0;
}

function PlayerMark({ player, center }: { player: DiagramPlayer; center: Point }) {
  const us = player.team === 'us';
  return (
    <G>
      {player.you ? (
        <Circle cx={center.x} cy={center.y} r={HALO_RADIUS} fill="none" stroke={colors.quiz} strokeWidth={HALO_WIDTH} />
      ) : null}
      {us ? (
        <Circle cx={center.x} cy={center.y} r={PLAYER_RADIUS} fill={colors.text} />
      ) : (
        <Circle
          cx={center.x}
          cy={center.y}
          r={OPPONENT_RADIUS}
          fill={colors.surface}
          stroke={colors.textMuted}
          strokeWidth={OPPONENT_RING}
        />
      )}
      {player.number !== null ? (
        <SvgText
          x={center.x}
          y={center.y + DIGIT_CENTER * SHIRT_SIZE}
          fontSize={SHIRT_SIZE}
          fontWeight="700"
          textAnchor="middle"
          // Nous : numéro anthracite (couleur du fond) sur disque blanc.
          fill={us ? colors.bg : colors.textMuted}
        >
          {String(player.number)}
        </SvgText>
      ) : null}
    </G>
  );
}

/** Flèche de vitesse à côté du joueur : plus longue et plus épaisse de la marche au sprint. */
function SpeedArrow({ player, center }: { player: DiagramPlayer; center: Point }) {
  if (player.move === null) {
    return null;
  }
  const direction = normalize({ x: player.move.dx, y: player.move.dy });
  const { length, width } = SPEED_ARROWS[player.move.speed];
  const start = add(center, scale(direction, outerRadius(player) + ARROW_GAP));
  const end = add(start, scale(direction, length));
  const head = arrowHead(add(end, scale(direction, SPEED_HEAD.ahead)), direction, SPEED_HEAD.length, SPEED_HEAD.halfWidth);
  const color = player.team === 'us' ? colors.text : colors.textMuted;
  return (
    <G>
      <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <Polygon points={toPoints(head)} fill={color} />
    </G>
  );
}

/** Ballon blanc cerclé. */
function Ball({ at }: { at: Point }) {
  return <Circle cx={at.x} cy={at.y} r={BALL_RADIUS} fill={colors.text} stroke={colors.bg} strokeWidth={BALL_RING} />;
}

// Objets.

/** Demi-hauteur d'un objet à l'écran : son étiquette se pose dessous. */
function objectHalfHeight(object: DiagramObject, frame: Frame): number {
  switch (object.type) {
    case 'cone':
      return CONE.bottom;
    case 'mannequin':
      return MANNEQUIN.height / 2;
    default:
      return ((object.h ?? 0) * frame.scale) / 2;
  }
}

function ObjectMark({ object, frame }: { object: DiagramObject; frame: Frame }) {
  const center = project(frame, object);
  if (object.type === 'cone') {
    const cone = [
      { x: center.x, y: center.y - CONE.top },
      { x: center.x + CONE.halfWidth, y: center.y + CONE.bottom },
      { x: center.x - CONE.halfWidth, y: center.y + CONE.bottom },
    ];
    return <Polygon points={toPoints(cone)} fill={colors.accent} />;
  }
  if (object.type === 'mannequin') {
    return (
      <Rect
        x={center.x - MANNEQUIN.width / 2}
        y={center.y - MANNEQUIN.height / 2}
        width={MANNEQUIN.width}
        height={MANNEQUIN.height}
        rx={MANNEQUIN.width / 2}
        fill={colors.textMuted}
      />
    );
  }
  // goal, wall, zone : w × h mètres autour du centre ; un mur fin reste visible.
  const width = Math.max(OBJECT_STROKE, (object.w ?? 0) * frame.scale);
  const height = Math.max(OBJECT_STROKE, (object.h ?? 0) * frame.scale);
  const box = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  if (object.type === 'wall') {
    return <Rect {...box} fill={colors.textMuted} />;
  }
  if (object.type === 'zone') {
    return (
      <Rect
        {...box}
        fill={colors.surface2}
        stroke={colors.textMuted}
        strokeWidth={LINE_WIDTH}
        strokeDasharray={ZONE_DASH}
      />
    );
  }
  return <Rect {...box} fill="none" stroke={colors.textMuted} strokeWidth={OBJECT_STROKE} />;
}

/** Étiquette en secondaire : au centre d'une zone, sous les autres objets. */
function ObjectLabel({ object, label, frame }: { object: DiagramObject; label: string; frame: Frame }) {
  const center = project(frame, object);
  const y =
    object.type === 'zone'
      ? center.y + DIGIT_CENTER * LABEL_SIZE
      : center.y + objectHalfHeight(object, frame) + LABEL_GAP + DIGIT_ASCENT * LABEL_SIZE;
  return (
    <SvgText x={center.x} y={y} fontSize={LABEL_SIZE} textAnchor="middle" fill={colors.textMuted}>
      {label}
    </SvgText>
  );
}

// Options et trajet.

type OptionShape = {
  option: DiagramOption;
  /** Trait, en pixels ; [] pour un hold. */
  line: Point[];
  /** Arc d'un hold (chemin SVG) ; null sinon. */
  arc: string | null;
  /** Pointe ; null quand la pastille marque elle-même l'extrémité. */
  head: Point[] | null;
  pastille: Point;
};

/** Disque déjà posé : joueur ou pastille. Une pastille ne recouvre aucun. */
type Disc = Point & { r: number };

/** Une option avant le choix de sa pastille : les places possibles, de la préférée à la dernière. */
type OptionPlan = {
  option: DiagramOption;
  candidates: Point[];
  /** La forme, la pastille posée à la place `index` de candidates. */
  build: (index: number) => OptionShape;
};

/**
 * Chaque option : trait (courbe par ses points de passage), pointe et pastille.
 * La pastille se pose à l'extrémité (juste avant la pointe vers un joueur) ; si
 * un joueur ou une autre pastille y est déjà, elle recule le long du trait, pas
 * à pas. Hold : arc autour du joueur, pastille dans la première direction libre.
 * L'option qui a le moins de places libres choisit la première ; sans place
 * libre, la moins encombrée.
 */
function layoutOptions(diagram: DiagramData, frame: Frame, centers: ReadonlyMap<string, Point>): OptionShape[] {
  const players = new Map(diagram.players.map((player) => [player.id, player]));
  const ballRadius = BALL_RADIUS + BALL_RING / 2;
  // Joueurs et ballon : une pastille ne les recouvre pas.
  const playerDiscs: Disc[] = [
    ...diagram.players.map((player) => ({ ...(centers.get(player.id) ?? project(frame, player)), r: outerRadius(player) })),
    ...diagram.players
      .filter((player) => player.ball)
      .map((player) => ({ ...add(centers.get(player.id) ?? project(frame, player), BALL_OFFSET), r: ballRadius })),
    ...(diagram.ball !== null ? [{ ...project(frame, diagram.ball), r: ballRadius }] : []),
  ];
  const plans: OptionPlan[] = [];
  for (const option of diagram.options) {
    const from = players.get(option.from);
    if (from === undefined) {
      continue;
    }
    const start = centers.get(from.id) ?? project(frame, from);
    plans.push(
      option.to === null
        ? holdPlan(option, start, outerRadius(from))
        : linePlan(option, option.to, start, outerRadius(from), players, frame, centers),
    );
  }
  const freeCount = (plan: OptionPlan) =>
    plan.candidates.filter((point) => clearance(point, playerDiscs) >= 0).length;
  const order = [...plans].sort((a, b) => freeCount(a) - freeCount(b) || a.option.id - b.option.id);
  const placed: Disc[] = [];
  const shapes: OptionShape[] = [];
  for (const plan of order) {
    const discs = [...playerDiscs, ...placed];
    const margins = plan.candidates.map((point) => clearance(point, discs));
    const firstFree = margins.findIndex((margin) => margin >= 0);
    const index = firstFree >= 0 ? firstFree : margins.indexOf(Math.max(...margins));
    const shape = plan.build(Math.max(0, index));
    placed.push({ ...shape.pastille, r: PASTILLE_RADIUS + PASTILLE_RING });
    shapes.push(shape);
  }
  return shapes.sort((a, b) => a.option.id - b.option.id);
}

function linePlan(
  option: DiagramOption,
  to: OptionTarget,
  start: Point,
  startRadius: number,
  players: ReadonlyMap<string, DiagramPlayer>,
  frame: Frame,
  centers: ReadonlyMap<string, Point>,
): OptionPlan {
  const target = to.player !== null ? players.get(to.player) : undefined;
  const end = target !== undefined ? (centers.get(target.id) ?? project(frame, target)) : project(frame, to);
  const full = smooth([start, ...option.path.map((point) => project(frame, point)), end]);
  const total = lengthOf(full);
  const startCut = Math.min(startRadius + ARROW_GAP, total / 2);
  const endCut = target !== undefined ? outerRadius(target) + TARGET_GAP : 0;
  const drawn = slicePolyline(full, startCut, Math.max(startCut, total - endCut));
  const length = lengthOf(drawn);
  if (length < OPTION_HEAD.length + PASTILLE_RADIUS) {
    // Trop court pour une pointe : la pastille marque la fin.
    const last = drawn[drawn.length - 1] ?? end;
    return { option, candidates: [last], build: () => ({ option, line: drawn, arc: null, head: null, pastille: last }) };
  }
  // Distances depuis la fin du trait : l'extrémité (juste avant la pointe vers un
  // joueur), puis en reculant pas à pas jusqu'au départ.
  const first = Math.min(length, target !== undefined ? OPTION_HEAD.length + PASTILLE_RADIUS + PASTILLE_RING : 0);
  const backs: number[] = [];
  for (let back = first; back <= length; back += PASTILLE_STEP) {
    backs.push(back);
  }
  const { point: tip, direction } = pointAt(drawn, length);
  return {
    option,
    candidates: backs.map((back) => pointAt(drawn, length - back).point),
    build: (index) => {
      const back = backs[index] ?? first;
      const pastille = pointAt(drawn, length - back).point;
      if (back === 0) {
        // Pastille à l'extrémité : le trait s'arrête à son bord, sans pointe.
        return { option, line: slicePolyline(drawn, 0, length - PASTILLE_RADIUS), arc: null, head: null, pastille };
      }
      return {
        option,
        line: slicePolyline(drawn, 0, length - (OPTION_HEAD.length - OPTION_HEAD.overlap)),
        arc: null,
        head: arrowHead(tip, direction, OPTION_HEAD.length, OPTION_HEAD.halfWidth),
        pastille,
      };
    },
  };
}

/** Hold : arc de 120° autour du joueur, pastille au milieu de l'arc ; une place par direction de HOLD_ANGLES. */
function holdPlan(option: DiagramOption, center: Point, playerRadius: number): OptionPlan {
  const arcRadius = playerRadius + PASTILLE_RING + PASTILLE_RADIUS + 1;
  const at = (angle: number) => add(center, scale({ x: Math.cos(angle), y: Math.sin(angle) }, arcRadius));
  const angles = HOLD_ANGLES.map((degrees) => (degrees * Math.PI) / 180);
  return {
    option,
    candidates: angles.map(at),
    build: (index) => {
      const angle = angles[index] ?? angles[0];
      const arcStart = at(angle - HOLD_SPAN / 2);
      const arcEnd = at(angle + HOLD_SPAN / 2);
      return {
        option,
        line: [],
        arc: `M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`,
        head: null,
        pastille: at(angle),
      };
    },
  };
}

/**
 * Marge d'une pastille posée là : au moins 0 si elle ne recouvre aucun disque et
 * reste dans le cadre ; négative sinon, d'autant plus qu'elle recouvre.
 */
function clearance(point: Point, discs: readonly Disc[]): number {
  const edges = Math.min(
    point.x - PASTILLE_RADIUS,
    VIEW_WIDTH - PASTILLE_RADIUS - point.x,
    point.y - PASTILLE_RADIUS,
    VIEW_HEIGHT - PASTILLE_RADIUS - point.y,
  );
  return discs.reduce((margin, disc) => Math.min(margin, distance(point, disc) - disc.r - PASTILLE_RADIUS - 1), edges);
}

type PathShape = { line: Point[]; head: Point[] | null; ball: Point | null };

/**
 * Trajet d'un test, en blanc, pointe à l'arrivée ; départ décalé du joueur posé
 * sur le premier point. Conduite : ballon au départ, sauf si ce joueur le porte déjà.
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
  if (length < OPTION_HEAD.length) {
    return { line: drawn, head: null, ball };
  }
  const { point: tip, direction } = pointAt(drawn, length);
  return {
    line: slicePolyline(drawn, 0, length - (OPTION_HEAD.length - OPTION_HEAD.overlap)),
    head: arrowHead(tip, direction, OPTION_HEAD.length, OPTION_HEAD.halfWidth),
    ball,
  };
}

// Géométrie, en pixels.

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

/** « x1,y1 x2,y2 … » des props points de Polyline et Polygon. */
function toPoints(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

/** Point à `at` pixels du début, et la direction du tronçon qui le porte ; bornés aux extrémités. */
function pointAt(points: readonly Point[], at: number): { point: Point; direction: Point } {
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

/** « Schéma : 11 joueurs, options 1, 2, 3 et 4 ». */
function describeDiagram(diagram: DiagramData): string {
  const parts: string[] = [];
  const count = (value: number, singular: string, plural: string) => `${value} ${value > 1 ? plural : singular}`;
  if (diagram.players.length > 0) {
    parts.push(count(diagram.players.length, 'joueur', 'joueurs'));
  }
  if (diagram.objects.length > 0) {
    parts.push(count(diagram.objects.length, 'objet', 'objets'));
  }
  if (diagram.path !== null) {
    parts.push(diagram.path.style === 'dribble' ? 'trajet en conduite' : 'trajet de course');
  }
  if (diagram.options.length > 0) {
    const ids = diagram.options.map((option) => option.id).sort((a, b) => a - b);
    const listed = ids.length > 1 ? `${ids.slice(0, -1).join(', ')} et ${ids[ids.length - 1]}` : `${ids[0]}`;
    parts.push(`${ids.length > 1 ? 'options' : 'option'} ${listed}`);
  }
  return parts.length > 0 ? `Schéma : ${parts.join(', ')}` : 'Schéma';
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: DIAGRAM_WIDTH / DIAGRAM_HEIGHT,
    borderRadius: radius.card,
    // Les coins arrondis découpent aussi le dessin.
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  // Encart de la DA : en haut à gauche, sur fond sombre cerclé de bordure.
  context: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: size.border,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  minute: {
    color: colors.textMuted,
  },
  badge: {
    width: PASTILLE_RADIUS * 2,
    height: PASTILLE_RADIUS * 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontWeight: '700',
  },
});
