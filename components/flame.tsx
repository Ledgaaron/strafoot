import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReduceMotion } from '../lib/reduce-motion';
import { colors, motion, size } from '../lib/theme';

/** faite : pleine ; à faire (avant minuit) : contour ; perdue : grise, jamais rouge. */
export type FlameState = 'done' | 'todo' | 'lost';
/** Orange pour l'entraînement, violet pour le quiz. */
export type FlameTone = 'accent' | 'quiz';

type FlameProps = {
  state: FlameState;
  tone: FlameTone;
};

type Look = { state: FlameState; tone: FlameTone };

// Flamme (silhouette de l'icône « flame » d'Ionicons) : base arrondie (arc de
// rayon 7), flanc gauche entaillé d'un cran qui remonte en pointe effilée, un peu
// courbée vers la droite ; langue intérieure évidée (fill-rule evenodd), dans un
// repère de 24 × 24 ; dessinée à size.flame, trait de taille fixe.
// Choisie parmi cinq tracés rendus à 160, 64 et 32 px (chantier 9).
const FLAME_PATH =
  'M13 1.5 C13.6 5 11.5 7 9.6 8.2 C8.9 7.6 8.4 6.8 8.2 5.8 C6.2 8 5 10.8 5 14.6 ' +
  'A7 7 0 0 0 19 14.6 C19 9.6 15.6 5.4 13 1.5 Z ' +
  'M12 11 C13 12.8 14.6 14.3 14.6 16.4 A2.6 2.6 0 0 1 9.4 16.4 C9.4 14.3 11 12.8 12 11 Z';
const VIEW_BOX = '0 0 24 24';

/**
 * Flamme de série, à gauche du chiffre de streak (micro-interaction d). Elle ne
 * s'anime qu'en se remplissant (à faire ou perdue → faite, donc quand la série
 * augmente après une action) : fondu de motion.micro vers le nouvel aspect.
 * Tout autre changement, et le premier affichage, se posent sans transition ;
 * « Réduire les animations » aussi. Décorative : le Stat porte le libellé.
 */
export function Flame({ state, tone }: FlameProps) {
  const reduceMotion = useReduceMotion();
  // Aspect affiché ; l'aspect demandé s'y fond quand la flamme se remplit.
  const [shown, setShown] = useState<Look>({ state, tone });
  const [incoming, setIncoming] = useState<Look | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shown.state === state && shown.tone === tone) {
      return;
    }
    const filling = state === 'done' && shown.state !== 'done';
    if (!filling || reduceMotion) {
      setShown({ state, tone });
      setIncoming(null);
      return;
    }
    setIncoming({ state, tone });
    opacity.setValue(0);
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.micro,
      easing: motion.easing,
      useNativeDriver: motion.useNativeDriver,
    });
    fade.start(({ finished }) => {
      if (finished) {
        setShown({ state, tone });
        setIncoming(null);
      }
    });
    // Nouvel aspect pendant le fondu, ou démontage : le fondu suivant repart de l'aspect affiché.
    return () => {
      fade.stop();
    };
  }, [state, tone, shown, reduceMotion, opacity]);

  return (
    <View aria-hidden style={styles.box}>
      <Glyph look={shown} />
      {incoming !== null ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Glyph look={incoming} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Glyph({ look }: { look: Look }) {
  const color = look.state === 'lost' ? colors.textMuted : colors[look.tone];
  const outline = look.state === 'todo';
  return (
    <Svg width={size.flame} height={size.flame} viewBox={VIEW_BOX}>
      <Path
        d={FLAME_PATH}
        fillRule="evenodd"
        fill={outline ? 'none' : color}
        stroke={outline ? color : 'none'}
        strokeWidth={size.chartStroke}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  box: {
    width: size.flame,
    height: size.flame,
  },
});
