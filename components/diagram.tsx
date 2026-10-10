import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  optionLetter,
  type DiagramData,
  type DiagramObject,
  type DiagramPlayer,
  type DiagramResult,
  type OptionId,
  type Point,
} from '../lib/diagram-types';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from '../lib/diagrams';
import { colors, fontSize, radius, size, spacing, text } from '../lib/theme';
import {
  BALL_RADIUS,
  BALL_RING,
  CAP_CENTER,
  CONE,
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
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type Frame,
  type OptionShape,
  type PitchMarks,
} from './diagram-layout';

// Schéma dessiné depuis ses données (lib/diagram-types.ts), selon la DA
// (Illustration, « Schéma tactique vu du dessus ») : terrain sombre aux lignes
// pitchLine, nous en disques blancs, eux en anneaux gris, toi avec un halo
// violet, options en lettres A à D (distinctes des numéros de maillot). Aucune
// animation : les flèches sont fixes. La géométrie (cadre, traits, places des
// pastilles et des étiquettes) vient de components/diagram-layout.ts, en
// pixels de la DA (schéma de 358 px de large sur un écran de 390), mise à
// l'échelle de la largeur réelle, cadre 722 × 646 : même rendu sur le web et en
// natif, à toutes les largeurs.

/** Lignes du terrain. */
const LINE_WIDTH = 1.5;
/** Numéro de maillot : 12 px gras, exception assumée de la DA (repris en toutes lettres dans la question). */
const SHIRT_SIZE = 12;
/** Option : trait au repos, choisi (selected), fort et faible (result). */
const OPTION_WIDTH = { idle: 2.5, selected: 3.5, strong: 3, weak: 2 };
/** Passe : pointillé de la DA. */
const OPTION_DASH = [7, 6];
/** Au repos, le trait des options est un violet léger ; la pastille reste pleine. */
const IDLE_LINE_OPACITY = 0.5;
/** Options atténuées autour de l'option choisie (selected) : leur trait, sans pastille. */
const DIMMED_OPACITY = 0.4;
/** Lettre d'une pastille : 14 px gras. */
const PASTILLE_SIZE = fontSize.meta;
/** Trajet d'un test. */
const PATH_WIDTH = 2.5;
const ZONE_DASH = [4, 4];
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
  /** Option choisie, en attente : violet plein avec sa pastille ; les autres en trait atténué, sans pastille. */
  selected?: OptionId;
  /**
   * Après réponse : seules la choisie (couleur de sa catégorie) et les options
   * à 3 (succès) sont dessinées ; l'emporte sur selected.
   */
  result?: DiagramResult;
  /** Avec result : les quatre options, les autres en retrait (« Voir les autres choix », chantier 13b). */
  showAll?: boolean;
  /** Ce que montre le schéma, pour les lecteurs d'écran ; à défaut, joueurs et options comptés. */
  accessibilityLabel?: string;
};

/** Schéma en pleine largeur, hauteur par le ratio 722 × 646 ; encart score · minute en haut à gauche. */
export function Diagram({ diagram, selected, result, showAll = false, accessibilityLabel }: DiagramProps) {
  // Calculée une fois par schéma : les états ne changent que les couleurs et ce qui est dessiné.
  const geometry = useMemo(() => layoutDiagram(diagram), [diagram]);
  const { frame, centers } = geometry;
  const shown = geometry.options
    .map((shape) => ({ shape, look: optionLook(shape.option.id, selected, result, showAll) }))
    .filter(({ look }) => look.visible);
  const zones = diagram.objects.filter((object) => object.type === 'zone');
  const things = diagram.objects.filter((object) => object.type !== 'zone');
  // Eux d'abord : nos joueurs, et toi, restent au-dessus d'un adversaire qui les touche.
  const players = [...diagram.players].sort((a, b) => drawRank(a) - drawRank(b));
  const context = diagram.context;
  return (
    <View role="img" accessibilityLabel={accessibilityLabel ?? describeDiagram(diagram)} style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} fontFamily={SVG_FONT_FAMILY}>
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
          <SvgText
            key={`label-${index}`}
            x={label.at.x}
            y={label.at.y}
            fontSize={LABEL_SIZE}
            textAnchor={label.anchor}
            fill={colors.textMuted}
          >
            {label.text}
          </SvgText>
        ))}
        {shown
          .filter(({ look }) => look.pastille)
          .map(({ shape, look }) => (
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
  selected?: OptionId;
  result?: DiagramResult;
};

/**
 * Lettre d'une option hors du schéma (réponses du quiz) : la même pastille, dans
 * la même couleur que sur le schéma pour les mêmes selected et result, même pour
 * une option que le schéma ne dessine pas.
 */
export function OptionBadge({ id, selected, result }: OptionBadgeProps) {
  const look = optionLook(id, selected, result, true);
  return (
    <View style={[styles.badge, { backgroundColor: look.fill, opacity: look.badgeOpacity }]}>
      <Text style={[text.meta, styles.badgeLabel, { color: look.letter }]}>{optionLetter(id)}</Text>
    </View>
  );
}

/** Ce que l'état fait d'une option : dessinée ou non, avec ou sans pastille, et ses couleurs. */
type OptionLook = {
  visible: boolean;
  pastille: boolean;
  line: string;
  lineOpacity: number;
  width: number;
  /** Fond de la pastille, et sa lettre. */
  fill: string;
  letter: string;
  /** Opacité de la pastille hors du schéma (OptionBadge). */
  badgeOpacity: number;
};

/**
 * Au repos : les quatre options, trait violet léger, pastille violette.
 * selected : l'option choisie en violet plein avec sa pastille, les autres en
 * trait atténué sans pastille. result : la choisie dans la couleur de sa
 * catégorie et les options à 3 en succès, seules ; avec showAll, les autres
 * aussi, couleur bordure, lettre secondaire.
 */
function optionLook(
  id: OptionId,
  selected: OptionId | undefined,
  result: DiagramResult | undefined,
  showAll: boolean,
): OptionLook {
  if (result !== undefined) {
    const score = result.scores[id];
    if (id === result.chosen || score === 3) {
      const color = id === result.chosen ? CATEGORY_COLORS[score] : colors.success;
      // error ne porte pas de texte sombre lisible : lettre blanche, comme la pastille « Erreur » du quiz.
      const letter = color === colors.error ? colors.text : colors.onAccent;
      return { visible: true, pastille: true, line: color, lineOpacity: 1, width: OPTION_WIDTH.strong, fill: color, letter, badgeOpacity: 1 };
    }
    return {
      visible: showAll,
      pastille: true,
      line: colors.border,
      lineOpacity: 1,
      width: OPTION_WIDTH.weak,
      fill: colors.border,
      letter: colors.textMuted,
      badgeOpacity: 1,
    };
  }
  if (selected === id) {
    return {
      visible: true,
      pastille: true,
      line: colors.quiz,
      lineOpacity: 1,
      width: OPTION_WIDTH.selected,
      fill: colors.quiz,
      letter: colors.onAccent,
      badgeOpacity: 1,
    };
  }
  const dimmed = selected !== undefined;
  return {
    visible: true,
    pastille: !dimmed,
    line: colors.quiz,
    lineOpacity: dimmed ? IDLE_LINE_OPACITY * DIMMED_OPACITY : IDLE_LINE_OPACITY,
    width: OPTION_WIDTH.idle,
    fill: colors.quiz,
    letter: colors.onAccent,
    badgeOpacity: dimmed ? DIMMED_OPACITY : 1,
  };
}

/**
 * Trait, pointe ou arc d'une option. Une pastille dessinée à l'extrémité coiffe
 * le trait à la place de la pointe ; sans elle, trait et pointe entiers.
 */
function OptionLine({ shape, look }: { shape: OptionShape; look: OptionLook }) {
  const capped = look.pastille && shape.cappedLine !== null;
  const line = capped && shape.cappedLine !== null ? shape.cappedLine : shape.line;
  const head = capped ? null : shape.head;
  return (
    // Opacité posée sur le groupe : trait et pointe se recouvrent sans se foncer.
    <G opacity={look.lineOpacity}>
      {shape.arc !== null ? (
        <Path d={shape.arc} fill="none" stroke={look.line} strokeWidth={look.width} strokeLinecap="round" />
      ) : null}
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

/** Lignes du terrain entier ; la vue en montre la partie qui tient dans le cadre. */
function PitchLines({ pitch }: { pitch: PitchMarks }) {
  const [top, bottom] = pitch.halfway;
  return (
    <G fill="none" stroke={colors.pitchLine} strokeWidth={LINE_WIDTH}>
      {pitch.boxes.map((box, index) => (
        <Rect key={`box-${index}`} x={box.x} y={box.y} width={box.width} height={box.height} />
      ))}
      <Line x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} />
      <Circle cx={pitch.circle.center.x} cy={pitch.circle.center.y} r={pitch.circle.r} />
      {pitch.arcs.map((arc, index) => (
        <Path key={`arc-${index}`} d={arc.d} />
      ))}
      {pitch.spots.map((spot, index) => (
        <Circle key={`spot-${index}`} cx={spot.x} cy={spot.y} r={SPOT_RADIUS} fill={colors.pitchLine} stroke="none" />
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
