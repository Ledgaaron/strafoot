import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from '../lib/diagrams';
import { colors, radius, size } from '../lib/theme';

// Demi-terrain dessinÃ© dans le repÃ¨re des schÃ©mas (722 Ã— 646) : ligne mÃ©diane en
// haut, but en bas, Ã  l'Ã©chelle d'un terrain de 68 m de large. Aucune image :
// seulement des traits, de la couleur pitchLine.
const MARGIN = 24;
/** Pixels par mÃ¨tre : 68 m de large sur toute la largeur utile. */
const SCALE = (DIAGRAM_WIDTH - 2 * MARGIN) / 68;
const PITCH_WIDTH = 68 * SCALE;
/** Demi-terrain de 52,5 m (terrain de 105 m), centrÃ© en hauteur. */
const PITCH_DEPTH = 52.5 * SCALE;
const LEFT = MARGIN;
const TOP = (DIAGRAM_HEIGHT - PITCH_DEPTH) / 2;
const CENTER_X = DIAGRAM_WIDTH / 2;
const GOAL_LINE = TOP + PITCH_DEPTH;
const CIRCLE_RADIUS = 9.15 * SCALE;
const PENALTY_AREA = { width: 40.32 * SCALE, depth: 16.5 * SCALE };
const GOAL_AREA = { width: 18.32 * SCALE, depth: 5.5 * SCALE };
const GOAL = { width: 7.32 * SCALE, depth: 2 * SCALE };
const PENALTY_SPOT_Y = GOAL_LINE - 11 * SCALE;
const SPOT_RADIUS = 0.4 * SCALE;
const PENALTY_AREA_TOP = GOAL_LINE - PENALTY_AREA.depth;
/** Arc de la surface : cercle de 9,15 m autour du point de penalty, hors de la surface. */
const ARC_HALF_WIDTH = Math.sqrt(CIRCLE_RADIUS ** 2 - (PENALTY_SPOT_Y - PENALTY_AREA_TOP) ** 2);

/**
 * Terrain stylisÃ© affichÃ© quand un exercice n'a pas de schÃ©ma (fiches et tests) :
 * mÃªme cadre que les schÃ©mas, fond surface2, lignes border.
 */
export function PitchPlaceholder() {
  return (
    <View role="img" accessibilityLabel="Terrain : pas de schÃ©ma pour cet exercice" style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}>
        {/* Trait de taille fixe Ã  l'Ã©cran, quelle que soit la largeur du cadre. */}
        <Rect
          x={LEFT}
          y={TOP}
          width={PITCH_WIDTH}
          height={PITCH_DEPTH}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
        <Path
          d={`M ${CENTER_X - CIRCLE_RADIUS} ${TOP} A ${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 0 0 ${CENTER_X + CIRCLE_RADIUS} ${TOP}`}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
        <Circle cx={CENTER_X} cy={TOP} r={SPOT_RADIUS} fill={colors.pitchLine} />
        <Rect
          x={CENTER_X - PENALTY_AREA.width / 2}
          y={PENALTY_AREA_TOP}
          width={PENALTY_AREA.width}
          height={PENALTY_AREA.depth}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
        <Rect
          x={CENTER_X - GOAL_AREA.width / 2}
          y={GOAL_LINE - GOAL_AREA.depth}
          width={GOAL_AREA.width}
          height={GOAL_AREA.depth}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
        <Path
          d={`M ${CENTER_X - ARC_HALF_WIDTH} ${PENALTY_AREA_TOP} A ${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 0 1 ${CENTER_X + ARC_HALF_WIDTH} ${PENALTY_AREA_TOP}`}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
        <Circle cx={CENTER_X} cy={PENALTY_SPOT_Y} r={SPOT_RADIUS} fill={colors.pitchLine} />
        <Rect
          x={CENTER_X - GOAL.width / 2}
          y={GOAL_LINE}
          width={GOAL.width}
          height={GOAL.depth}
          fill="none"
          stroke={colors.pitchLine}
          strokeWidth={size.chartStroke}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: DIAGRAM_WIDTH / DIAGRAM_HEIGHT,
    borderRadius: radius.card,
    // Les coins arrondis dÃ©coupent aussi le dessin.
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
});
