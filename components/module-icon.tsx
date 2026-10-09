import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { moduleIcon } from '../lib/modules';
import { colors, radius, size } from '../lib/theme';

type ModuleIconProps = {
  /** Valeur de sessions.module ; une valeur hors liste prend l'icône du module par défaut. */
  module: string;
};

/**
 * Tuile d'un module : carré de 48 px, surface2, coins md, icône Ionicons du
 * module (lib/modules.ts). La même sur la carte d'une séance (Accueil) et dans le
 * choix du module (formulaire de séance). Décorative : le texte à côté nomme le module.
 */
export function ModuleIcon({ module }: ModuleIconProps) {
  return (
    <View aria-hidden style={styles.tile}>
      <Ionicons name={moduleIcon(module)} size={size.icon} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
});
