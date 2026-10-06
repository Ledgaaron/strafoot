import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, disabledOpacity, fontSize, lineHeight, radius, size, spacing } from '../lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  /**
   * primary : l'action principale de l'écran, une seule, dans le pied de Screen ;
   * secondary : toute autre action ; danger : suppression, déconnexion.
   */
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Envoi en cours : indicateur à côté du libellé, appuis ignorés. */
  loading?: boolean;
  accessibilityLabel?: string;
  /** Mise en page dans une rangée (flex) : tokens uniquement. */
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const variantStyles = VARIANTS[variant];
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={inactive}
      aria-busy={loading}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyles.container,
        pressed && variantStyles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={SPINNER_COLORS[variant]} /> : null}
      <Text style={[styles.label, variantStyles.label]}>{label}</Text>
    </Pressable>
  );
}

const SPINNER_COLORS: Readonly<Record<ButtonVariant, string>> = {
  primary: colors.onAccent,
  secondary: colors.text,
  danger: colors.danger,
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
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});

const VARIANTS = {
  primary: StyleSheet.create({
    container: { backgroundColor: colors.accent },
    pressed: { backgroundColor: colors.accentPressed },
    label: { color: colors.onAccent },
  }),
  secondary: StyleSheet.create({
    container: { backgroundColor: colors.surface2 },
    pressed: { backgroundColor: colors.border },
    label: { color: colors.text },
  }),
  danger: StyleSheet.create({
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.surface2 },
    label: { color: colors.danger },
  }),
} as const;
