import { Stack } from 'expo-router';

import { useReduceMotion } from '../lib/reduce-motion';
import { motion } from '../lib/theme';

export type AppStackProps = {
  /** false : aucun en-tête (pile racine) ; absent, l'en-tête de chaque écran. */
  headerShown?: boolean;
  /** Routes de la pile qui montent depuis le bas (pile session : formulaire de séance) ; les autres glissent de droite. */
  rising?: readonly string[];
};

/**
 * Pile d'écrans de l'app (micro-interaction g), version native : pile native
 * d'expo-router, qui glisse depuis la droite ou monte depuis le bas, fermeture
 * symétrique. Durée motion.screen là où la pile native la règle (iOS) ; courbe
 * et durée du système sur Android, où elles ne se règlent pas. « Réduire les
 * animations » : aucune transition. Sur le web, app-stack.web.tsx (pile JS,
 * courbe de la DA).
 */
export function AppStack({ headerShown, rising = [] }: AppStackProps) {
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...(headerShown === undefined ? {} : { headerShown }),
        animation: reduceMotion ? 'none' : rising.includes(route.name) ? 'slide_from_bottom' : 'slide_from_right',
        animationDuration: motion.screen,
      })}
    />
  );
}
