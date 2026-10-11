import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, size, text } from '../lib/theme';

type AvatarProps = {
  /** Initiales du nom affiché (initialsOf, lib/profile-stats.ts) ; null : l'icône personne. */
  initials: string | null;
  /** Diamètre : size.touch (Accueil), size.avatar (Profil). */
  diameter: number;
  /** Présent : avatar tappable (Accueil, vers le Profil), fond un cran plus sombre à l'appui. */
  onPress?: () => void;
  /** Lu par le lecteur d'écran quand l'avatar est tappable. */
  accessibilityLabel?: string;
};

/**
 * Avatar rond, le même sur l'Accueil et le Profil : surface2, sans couleur
 * propre ; initiales du nom affiché, sinon l'icône personne. Décoratif s'il
 * n'est pas tappable (le nom, à côté, est lu).
 */
export function Avatar({ initials, diameter, onPress, accessibilityLabel }: AvatarProps) {
  const shape = { width: diameter, height: diameter, borderRadius: diameter / 2 };
  const content =
    initials !== null ? (
      <Text style={text.title}>{initials}</Text>
    ) : (
      <Ionicons name="person" size={size.icon} color={colors.textMuted} aria-hidden />
    );
  if (onPress === undefined) {
    return (
      <View aria-hidden style={[styles.avatar, shape]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.avatar, shape, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
