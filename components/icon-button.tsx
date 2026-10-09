import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, disabledOpacity, radius, size } from '../lib/theme';

/** Nom d'une icône Ionicons, la seule famille d'icônes de l'app. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Zone tactile d'un bouton compact ramenée à size.touch : 8 px de chaque côté. */
const COMPACT_HIT_SLOP = (size.touch - size.compactButton) / 2;

type IconButtonProps = {
  icon: IconName;
  /** Lu par le lecteur d'écran : l'icône seule n'a pas de nom. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  /** Action en cours : indicateur à la place de l'icône, appuis ignorés. */
  loading?: boolean;
  /** Coché (✓ d'une mesure validée) : fond success, icône onAccent. */
  checked?: boolean;
  /** Discret : sans fond, icône textMuted ; fond surface2 à l'appui (‹ › d'une carte, fermeture d'une feuille). */
  subtle?: boolean;
  /** 32 px visibles, zone tactile de 48 par hitSlop (‹ › dans l'en-tête d'une carte). */
  compact?: boolean;
};

/**
 * Bouton icône carré de 48 px : flèches des calendriers, icônes de l'en-tête du
 * profil, ✓ d'une mesure. Fond surface2 (success s'il est coché), un cran plus
 * sombre pendant l'appui. Discret (subtle) : sans fond, l'appui le fait apparaître.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  checked,
  subtle = false,
  compact = false,
}: IconButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={inactive}
      aria-busy={loading}
      aria-checked={checked}
      accessibilityState={{ disabled: inactive, busy: loading, checked }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={compact ? COMPACT_HIT_SLOP : undefined}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        subtle && styles.subtle,
        checked === true && styles.checked,
        pressed && (subtle ? styles.subtlePressed : styles.pressed),
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) =>
        loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Ionicons name={icon} size={size.icon} color={iconColor(checked === true, subtle, pressed)} />
        )
      }
    </Pressable>
  );
}

/** Pendant l'appui, le fond passe à surfacePressed (ou surface2 pour un bouton discret) : l'icône reprend la couleur text. */
function iconColor(checked: boolean, subtle: boolean, pressed: boolean): string {
  if (pressed) {
    return colors.text;
  }
  if (checked) {
    return colors.onAccent;
  }
  return subtle ? colors.textMuted : colors.text;
}

const styles = StyleSheet.create({
  button: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.surface2,
  },
  compact: {
    width: size.compactButton,
    height: size.compactButton,
    borderRadius: radius.sm,
  },
  subtle: {
    backgroundColor: 'transparent',
  },
  checked: {
    backgroundColor: colors.success,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  subtlePressed: {
    backgroundColor: colors.surface2,
  },
  disabled: {
    opacity: disabledOpacity,
  },
});
