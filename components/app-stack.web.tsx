import { CardStyleInterpolators, Stack, type StackNavigationOptions } from 'expo-router/js-stack';

import { useReduceMotion } from '../lib/reduce-motion';
import { motion } from '../lib/theme';
import type { AppStackProps } from './app-stack';

/** Ouverture et fermeture : même durée, même courbe (DA), aucun ressort. */
const TRANSITION: NonNullable<StackNavigationOptions['transitionSpec']>['open'] = {
  animation: 'timing',
  config: { duration: motion.screen, easing: motion.easing },
};

/**
 * Pile d'écrans de l'app (micro-interaction g), version web : la pile native
 * d'expo-router n'anime rien sur le web, la pile JS embarquée (expo-router/js-stack,
 * API Animated) glisse depuis la droite, ou monte depuis le bas pour les routes
 * de rising, en motion.screen avec la courbe de la DA ; la fermeture rejoue le
 * même mouvement à l'envers. Pas de geste de retour (le web n'en a pas ici).
 * « Réduire les animations » : aucune transition. En natif, app-stack.tsx.
 */
export function AppStack({ headerShown, rising = [] }: AppStackProps) {
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }): StackNavigationOptions => {
        const header = headerShown === undefined ? {} : { headerShown };
        if (reduceMotion) {
          return { ...header, animation: 'none' };
        }
        const rises = rising.includes(route.name);
        return {
          ...header,
          animation: rises ? 'slide_from_bottom' : 'slide_from_right',
          transitionSpec: { open: TRANSITION, close: TRANSITION },
          cardStyleInterpolator: rises ? CardStyleInterpolators.forVerticalIOS : CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: false,
        };
      }}
    />
  );
}
