import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, disabledOpacity, radius, size, spacing } from '../lib/theme';
import { usePressScale } from './press-scale';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type CardProps = {
  children: ReactNode;
  /** Bordure 1 px visible (couleur border). */
  bordered?: boolean;
  /** Mise en évidence (option choisie) : bordure accent, jamais grisée même désactivée. */
  highlighted?: boolean;
  /** Présent : carte tappable, fond surface2 et 0,97 pendant l'appui. */
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Mise en page du contenu (gap, direction) : tokens uniquement. */
  style?: StyleProp<ViewStyle>;
};

/** Bloc de contenu : surface, coins de 12 px, 16 px de marge intérieure ; tappable avec onPress. */
export function Card({
  children,
  bordered = false,
  highlighted = false,
  onPress,
  onLongPress,
  disabled = false,
  accessibilityLabel,
  style,
}: CardProps) {
  // Micro-interaction a, carte tappable seulement. Appelé avant tout retour : ordre des hooks stable.
  const press = usePressScale();
  if (onPress === undefined && onLongPress === undefined) {
    return (
      <View style={[styles.card, bordered && styles.bordered, highlighted && styles.highlighted, style]}>
        {children}
      </View>
    );
  }
  return (
    <AnimatedPressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      accessibilityState={{ disabled, selected: highlighted }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.card,
        styles.pressable,
        bordered && styles.bordered,
        highlighted && styles.highlighted,
        press.pressed && styles.pressed,
        disabled && !highlighted && styles.disabled,
        style,
        press.scaleStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.card,
    // Bordure toujours présente, invisible par défaut : l'activer ne décale rien.
    borderWidth: size.border,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  pressable: {
    minHeight: size.touch,
  },
  bordered: {
    borderColor: colors.border,
  },
  highlighted: {
    borderColor: colors.accent,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  disabled: {
    opacity: disabledOpacity,
  },
});
