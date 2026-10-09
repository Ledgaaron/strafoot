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

// Goutte renversée, pointe en haut, évidée d'une petite goutte (fill-rule evenodd),
// dans un repère de 24 × 24 ; dessinée à size.flame, trait de taille fixe.
const FLAME_PATH =
  'M12 2 C9.5 6 5 10 5 15 A7 7 0 0 0 19 15 C19 10 14.5 6 12 2 Z ' +
  'M12 12 C10.5 14 9.5 15.5 9.5 17 A2.5 2.5 0 0 0 14.5 17 C14.5 15.5 13.5 14 12 12 Z';
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
