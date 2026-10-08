import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, disabledOpacity, radius, size } from '../lib/theme';

/** Nom d'une icône Ionicons, la seule famille d'icônes de l'app. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

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
};

/**
 * Bouton icône carré de 48 px : flèches des calendriers, icônes de l'en-tête du
 * profil, ✓ d'une mesure. Fond surface2 (success s'il est coché), border
 * pendant l'appui.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  checked,
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
      style={({ pressed }) => [
        styles.button,
        checked === true && styles.checked,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) =>
        loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Ionicons
            name={icon}
            size={size.icon}
            // Pendant l'appui, le fond passe à border : l'icône reprend la couleur text.
            color={checked === true && !pressed ? colors.onAccent : colors.text}
          />
        )
      }
    </Pressable>
  );
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
  checked: {
    backgroundColor: colors.success,
  },
  pressed: {
    backgroundColor: colors.border,
  },
  disabled: {
    opacity: disabledOpacity,
  },
});
