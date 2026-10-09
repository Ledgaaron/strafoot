import { useState } from 'react';
import { Animated } from 'react-native';

import { motion } from '../lib/theme';

/**
 * Appui sur une Card tappable ou un Button (micro-interaction a) : l'élément
 * passe à 0,98 en 100 ms et revient de même ; pressed porte aussi le fond « un
 * cran plus sombre ». Seule animation gardée avec « Réduire les animations ».
 * À brancher sur onPressIn / onPressOut d'un Pressable animé, scaleStyle en
 * dernier dans son style.
 */
export function usePressScale() {
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  function animateTo(toValue: number) {
    Animated.timing(scale, {
      toValue,
      duration: motion.press,
      easing: motion.easing,
      useNativeDriver: motion.useNativeDriver,
    }).start();
  }

  return {
    pressed,
    scaleStyle: { transform: [{ scale }] },
    onPressIn: () => {
      setPressed(true);
      animateTo(motion.pressScale);
    },
    onPressOut: () => {
      setPressed(false);
      animateTo(1);
    },
  };
}
