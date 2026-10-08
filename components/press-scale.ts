import { useState } from 'react';
import { Animated } from 'react-native';

import { motion } from '../lib/theme';

/**
 * Appui sur une Card tappable ou un Button (micro-interaction a) : l'élément
 * passe à 0,97 pendant l'appui et revient à sa taille en moins de 150 ms.
 * pressed porte aussi le fond « pressé ». À brancher sur onPressIn / onPressOut
 * d'un Pressable animé, scaleStyle en dernier dans son style.
 */
export function usePressScale() {
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  function animateTo(toValue: number, duration: number) {
    Animated.timing(scale, { toValue, duration, useNativeDriver: motion.useNativeDriver }).start();
  }

  return {
    pressed,
    scaleStyle: { transform: [{ scale }] },
    onPressIn: () => {
      setPressed(true);
      animateTo(motion.pressScale, motion.pressInMs);
    },
    onPressOut: () => {
      setPressed(false);
      animateTo(1, motion.pressOutMs);
    },
  };
}
