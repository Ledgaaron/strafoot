import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, disabledOpacity, radius, size, spacing, text } from '../lib/theme';
import type { IconName } from './icon-button';
import { usePressScale } from './press-scale';

export type ButtonVariant = 'primary' | 'quiz' | 'secondary' | 'danger' | 'text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * primary : l'action principale de l'écran, une seule, dans le pied de Screen ;
   * quiz : la même, violette, sur un écran du quiz ; secondary : toute autre
   * action ; danger : suppression, déconnexion ; text : lien discret, sans fond
   * (« Voir le mois »).
   */
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Envoi en cours : indicateur à côté du libellé, appuis ignorés. */
  loading?: boolean;
  /** Icône après le libellé, de sa couleur (chevron). */
  icon?: IconName;
  /** Bouton qui déplie un contenu (« Plus de tips ») : déplié ou non, pour le lecteur d'écran. */
  expanded?: boolean;
  accessibilityLabel?: string;
  /** Mise en page dans une rangée (flex) : tokens uniquement. */
  style?: StyleProp<ViewStyle>;
};

/** Bouton de 56 px, coins md, libellé 16/20 700 ; pressé : 0,98 et fond un cran plus sombre (micro-interaction a). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  expanded,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const variantStyles = VARIANTS[variant];
  const press = usePressScale();
  return (
    <AnimatedPressable
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={inactive}
      aria-busy={loading}
      aria-expanded={expanded}
      accessibilityState={{ disabled: inactive, busy: loading, expanded }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.button,
        variantStyles.container,
        press.pressed && variantStyles.pressed,
        disabled && styles.disabled,
        style,
        press.scaleStyle,
      ]}
    >
      {loading ? <ActivityIndicator color={CONTENT_COLORS[variant]} /> : null}
      <Text style={[text.button, styles.label, variantStyles.label]}>{label}</Text>
      {icon !== undefined ? <Ionicons name={icon} size={size.icon} color={CONTENT_COLORS[variant]} /> : null}
    </AnimatedPressable>
  );
}

/** Couleur du libellé, reprise par l'indicateur de chargement et l'icône. */
const CONTENT_COLORS: Readonly<Record<ButtonVariant, string>> = {
  primary: colors.onAccent,
  quiz: colors.onAccent,
  secondary: colors.text,
  danger: colors.danger,
  text: colors.accent,
};

const styles = StyleSheet.create({
  button: {
    minHeight: size.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: disabledOpacity,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
});

const VARIANTS = {
  primary: StyleSheet.create({
    container: { backgroundColor: colors.accent },
    pressed: { backgroundColor: colors.accentPressed },
    label: { color: CONTENT_COLORS.primary },
  }),
  quiz: StyleSheet.create({
    container: { backgroundColor: colors.quiz },
    pressed: { backgroundColor: colors.quizPressed },
    label: { color: CONTENT_COLORS.quiz },
  }),
  secondary: StyleSheet.create({
    container: { backgroundColor: colors.surface2 },
    pressed: { backgroundColor: colors.surfacePressed },
    label: { color: CONTENT_COLORS.secondary },
  }),
  danger: StyleSheet.create({
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.surface2 },
    label: { color: CONTENT_COLORS.danger },
  }),
  text: StyleSheet.create({
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.surface2 },
    label: { color: CONTENT_COLORS.text },
  }),
} as const;
