import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  bestOptionId,
  optionLetter,
  viewFrame,
  type DiagramData,
  type DiagramObject,
  type DiagramPlayer,
  type DiagramResult,
  type OptionId,
  type Point,
} from '../lib/diagram-types';
import { colors, fontSize, radius, size, spacing, text } from '../lib/theme';
import {
  BALL_RADIUS,
  BALL_RING,
  CAP_CENTER,
  CONE,
  DIMENSION,
  HALO_RADIUS,
  HALO_WIDTH,
  LABEL_SIZE,
  layoutDiagram,
  MANNEQUIN,
  OBJECT_STROKE,
  objectBox,
  OPPONENT_RADIUS,
  OPPONENT_RING,
  PASTILLE_RADIUS,
  PASTILLE_RING,
  PLAYER_RADIUS,
  project,
  SPEED_ARROWS,
  SPOT_RADIUS,
  visibleOptionIds,
  type DiagramState,
  type DimensionShape,
  type Frame,
  type LabelShape,
  type OptionShape,
  type PitchMarks,
} from './diagram-layout';

// Schéma dessiné depuis ses données (lib/diagram-types.ts), selon la DA
// (Illustration, « Schéma tactique vu du dessus ») : terrain sombre aux lignes
// fieldLine, nous en disques blancs, eux en anneaux gris, toi avec un halo
// violet, options en lettres A à D (distinctes des numéros de maillot). Aucune
// animation : un trait apparaît ou disparaît sans transition. La géométrie
// (cadre, traits, cotes, places des pastilles et des étiquettes) vient
// de components/diagram-layout.ts, en pixels de la DA (schéma de 358 px de large
// sur un écran de 390), mise à l'échelle de la largeur réelle ; cadre 722 × 646,
// 722 × 542 (zone) ou 722 × 361 (local) : même rendu sur le web et en natif, à
// toutes les largeurs.

/** Lignes du terrain. */
const LINE_WIDTH = 1.5;
/** Numéro de maillot : 12 px gras, exception assumée de la DA (repris en toutes lettres dans la question). */
const SHIRT_SIZE = 12;
/** Option : trait sélectionné (selected), fort et faible (result). */
const OPTION_WIDTH = { selected: 3.5, strong: 3, weak: 2 };
/** Passe : pointillé de la DA. */
const OPTION_DASH = [7, 6];
/** Lettre d'une pastille : 14 px gras. */
const PASTILLE_SIZE = fontSize.meta;
/** Trajet d'un test. */
const PATH_WIDTH = 2.5;
const ZONE_DASH = [4, 4];
/** Cote : trait fin. */
const DIMENSION_WIDTH = 2 * DIMENSION.strokeHalf;
/**
 * Sur le web, le texte SVG hérite de la police par défaut du navigateur, à
 * empattements : police système explicite. En natif, police système.
 */
const SVG_FONT_FAMILY = Platform.OS === 'web' ? 'system-ui, sans-serif' : undefined;

/** Couleur d'une option après réponse, selon son score (catégorie du quiz). */
const CATEGORY_COLORS: Readonly<Record<0 | 1 | 2 | 3, string>> = {
  3: colors.success,
  2: colors.textMuted,
  1: colors.danger,
  0: colors.error,
};

type DiagramProps = {
  diagram: DiagramData;
  /** Option sélectionnée, avant validation : seule dessinée, violet plein avec sa pastille. */
  selected?: OptionId;
  /**
   * Après réponse : ton choix et la meilleure option (seul s'il l'est), chacune
   * dans la couleur de sa catégorie ; l'emporte sur selected.
   */
  result?: DiagramResult;
  /** Avec result : les quatre options, les autres en retrait (« Voir les autres choix », chantier 18). */
  showAll?: boolean;
  /** Ce que montre le schéma, pour les lecteurs d'écran ; à défaut, joueurs et options comptés. */
  accessibilityLabel?: string;
};

/** Schéma en pleine largeur, hauteur par le cadre de sa vue ; encart score · minute en haut à gauche. */
export function Diagram({ diagram, selected, result, showAll = false, accessibilityLabel }: DiagramProps) {
  // Calculée une fois par schéma : les états ne changent que les couleurs et ce qui est dessiné.
  const geometry = useMemo(() => layoutDiagram(diagram), [diagram]);
  const { frame, centers } = geometry;
  const state = stateOf(selected, result, showAll);
  const visible = visibleOptionIds(
    geometry.options.map((shape) => shape.option.id),
    state,
  );
  const shown = geometry.options
    .filter((shape) => visible.includes(shape.option.id))
    .map((shape) => ({ shape, look: optionLook(shape.option.id, state) }));
  const zones = diagram.objects.filter((object) => object.type === 'zone');
  const things = diagram.objects.filter((object) => object.type !== 'zone');
  // Eux d'abord : nos joueurs, et toi, restent au-dessus d'un adversaire qui les touche.
  const players = [...diagram.players].sort((a, b) => drawRank(a) - drawRank(b));
  const context = diagram.context;
  const ratio = viewFrame(diagram.view);
  return (
    <View
      role="img"
      accessibilityLabel={accessibilityLabel ?? describeDiagram(diagram)}
      style={[styles.frame, { aspectRatio: ratio.width / ratio.height }]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${frame.width} ${frame.height}`} fontFamily={SVG_FONT_FAMILY}>
        {geometry.pitch !== null ? <PitchLines pitch={geometry.pitch} /> : null}
        {zones.map((object, index) => (
          <ObjectMark key={`zone-${index}`} object={object} frame={frame} />
        ))}
        {things.map((object, index) => (
          <ObjectMark key={`object-${index}`} object={object} frame={frame} />
        ))}
        {geometry.path !== null ? (
          <G>
            <Polyline
              points={toPoints(geometry.path.line)}
              fill="none"
              stroke={colors.text}
              strokeWidth={PATH_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {geometry.path.head !== null ? <Polygon points={toPoints(geometry.path.head)} fill={colors.text} /> : null}
          </G>
        ) : null}
        {geometry.dimensions.map((dimension, index) => (
          <DimensionMark key={`dimension-${index}`} dimension={dimension} />
        ))}
        {shown.map(({ shape, look }) => (
          <OptionLine key={shape.option.id} shape={shape} look={look} />
        ))}
        {geometry.speedArrows.map((arrow) => {
          const color = arrow.player.team === 'us' ? colors.text : colors.textMuted;
          return (
            <G key={`move-${arrow.player.id}`}>
              <Line
                x1={arrow.start.x}
                y1={arrow.start.y}
                x2={arrow.end.x}
                y2={arrow.end.y}
                stroke={color}
                strokeWidth={SPEED_ARROWS[arrow.speed].width}
                strokeLinecap="round"
              />
              <Polygon points={toPoints(arrow.head)} fill={color} />
            </G>
          );
        })}
        {players.map((player) => (
          <PlayerMark key={player.id} player={player} center={centers.get(player.id) ?? project(frame, player)} />
        ))}
        {geometry.balls.map((ball, index) => (
          <Circle
            key={`ball-${index}`}
            cx={ball.x}
            cy={ball.y}
            r={BALL_RADIUS}
            fill={colors.text}
            stroke={colors.bg}
            strokeWidth={BALL_RING}
          />
        ))}
        {geometry.labels.map((label, index) => (
          <LabelText key={`label-${index}`} label={label} />
        ))}
        {shown.map(({ shape, look }) => (
          <G key={`pastille-${shape.option.id}`}>
            <Circle
              cx={shape.pastille.x}
              cy={shape.pastille.y}
              r={PASTILLE_RADIUS}
              fill={look.fill}
              stroke={colors.surface}
              strokeWidth={PASTILLE_RING}
            />
            <SvgText
              x={shape.pastille.x}
              y={shape.pastille.y + CAP_CENTER * PASTILLE_SIZE}
              fontSize={PASTILLE_SIZE}
              fontWeight="700"
              textAnchor="middle"
              fill={look.letter}
            >
              {optionLetter(shape.option.id)}
            </SvgText>
          </G>
        ))}
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
  result?: DiagramResult;
};

/**
 * Lettre d'une option hors du schéma (réponses du quiz) : la même pastille, dans
 * la même couleur que sur le schéma pour le même result (violette avant la
 * réponse, même pour une option que le schéma ne dessine pas à cet instant).
 */
export function OptionBadge({ id, result }: OptionBadgeProps) {
  const look = optionLook(id, result === undefined ? { kind: 'idle' } : { kind: 'result', ...result, showAll: true });
  return (
    <View style={[styles.badge, { backgroundColor: look.fill }]}>
      <Text style={[text.meta, styles.badgeLabel, { color: look.letter }]}>{optionLetter(id)}</Text>
    </View>
  );
}

/** Les props du schéma → son état (result l'emporte sur selected). */
function stateOf(selected: OptionId | undefined, result: DiagramResult | undefined, showAll: boolean): DiagramState {
  if (result !== undefined) {
    return { kind: 'result', chosen: result.chosen, scores: result.scores, showAll };
  }
  return selected !== undefined ? { kind: 'selected', id: selected } : { kind: 'idle' };
}

/** Couleurs d'une option dans l'état : trait, épaisseur, fond et lettre de sa pastille. */
type OptionLook = {
  line: string;
  width: number;
  fill: string;
  letter: string;
};

/**
 * Repos et sélection : violet plein. Résultat : ton choix et la meilleure
 * option dans la couleur de leur catégorie ; les autres (showAll, pastilles des
 * réponses) couleur bordure, lettre secondaire.
 */
function optionLook(id: OptionId, state: DiagramState): OptionLook {
  if (state.kind === 'result') {
    if (id === state.chosen || id === bestOptionId(state.scores)) {
      const color = CATEGORY_COLORS[state.scores[id]];
      // error ne porte pas de texte sombre lisible : lettre blanche, comme la pastille « Erreur » du quiz.
      const letter = color === colors.error ? colors.text : colors.onAccent;
      return { line: color, width: OPTION_WIDTH.strong, fill: color, letter };
    }
    return { line: colors.border, width: OPTION_WIDTH.weak, fill: colors.border, letter: colors.textMuted };
  }
  return { line: colors.quiz, width: OPTION_WIDTH.selected, fill: colors.quiz, letter: colors.onAccent };
}

type OptionLineProps = {
  shape: OptionShape;
  look: OptionLook;
};

/**
 * Trait et pointe d'une option ; un hold n'en a pas (sa pastille suffit). La
 * pastille coiffe l'extrémité d'un trait vers un point, à la place de la pointe.
 */
function OptionLine({ shape, look }: OptionLineProps) {
  const { stroke } = shape;
  const line = stroke.cappedLine ?? stroke.line;
  const head = stroke.cappedLine !== null ? null : stroke.head;
  return (
    <G>
      {line.length >= 2 ? (
        <Polyline
          points={toPoints(line)}
          fill="none"
          stroke={look.line}
          strokeWidth={look.width}
          strokeDasharray={shape.option.kind === 'pass' ? OPTION_DASH : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {head !== null ? <Polygon points={toPoints(head)} fill={look.line} /> : null}
    </G>
  );
}

/** Cote : trait fin décalé du segment mesuré, tirets aux extrémités, étiquette. */
function DimensionMark({ dimension }: { dimension: DimensionShape }) {
  const [a, b] = dimension.line;
  return (
    <G stroke={colors.textMuted} strokeWidth={DIMENSION_WIDTH} strokeLinecap="round">
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {dimension.ticks.map(([from, to], index) => (
        <Line key={`tick-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      ))}
      <LabelText label={dimension.label} />
    </G>
  );
}

function LabelText({ label }: { label: LabelShape }) {
  return (
    <SvgText x={label.at.x} y={label.at.y} fontSize={LABEL_SIZE} textAnchor={label.anchor} fill={colors.textMuted} stroke="none">
      {label.text}
    </SvgText>
  );
}

/** Lignes du terrain entier ; la vue en montre la partie qui tient dans le cadre. */
function PitchLines({ pitch }: { pitch: PitchMarks }) {
  const [top, bottom] = pitch.halfway;
  return (
    <G fill="none" stroke={colors.fieldLine} strokeWidth={LINE_WIDTH}>
      {pitch.boxes.map((box, index) => (
        <Rect key={`box-${index}`} x={box.x} y={box.y} width={box.width} height={box.height} />
      ))}
      <Line x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} />
      <Circle cx={pitch.circle.center.x} cy={pitch.circle.center.y} r={pitch.circle.r} />
      {pitch.arcs.map((arc, index) => (
        <Path key={`arc-${index}`} d={arc.d} />
      ))}
      {pitch.spots.map((spot, index) => (
        <Circle key={`spot-${index}`} cx={spot.x} cy={spot.y} r={SPOT_RADIUS} fill={colors.fieldLine} stroke="none" />
      ))}
    </G>
  );
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
          y={center.y + CAP_CENTER * SHIRT_SIZE}
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
  const box = objectBox(object, frame);
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

/** « x1,y1 x2,y2 … » des props points de Polyline et Polygon. */
function toPoints(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** « Schéma : 11 joueurs, options A, B, C et D ». */
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
  if (diagram.dimensions.length > 0) {
    parts.push(count(diagram.dimensions.length, 'cote', 'cotes'));
  }
  if (diagram.options.length > 0) {
    const letters = diagram.options
      .map((option) => option.id)
      .sort((a, b) => a - b)
      .map(optionLetter);
    const listed =
      letters.length > 1 ? `${letters.slice(0, -1).join(', ')} et ${letters[letters.length - 1]}` : `${letters[0]}`;
    parts.push(`${letters.length > 1 ? 'options' : 'option'} ${listed}`);
  }
  return parts.length > 0 ? `Schéma : ${parts.join(', ')}` : 'Schéma';
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
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
