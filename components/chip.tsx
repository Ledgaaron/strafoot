import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, disabledOpacity, fontSize, lineHeight, radius, size, spacing } from '../lib/theme';

/** Couleur d'une puce choisie : orange, ou violet sur un écran du quiz. */
export type ChipTone = 'accent' | 'quiz';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Choix impossible (poste secondaire égal au principal) : grisée et inerte. */
  disabled?: boolean;
  tone?: ChipTone;
};

/**
 * Puce de choix, la même partout : 48 px, surface2, coins pleins. Choisie :
 * teinte à 14 %, contour de 1,5 px et coche, donc lisible sans la couleur.
 * À poser dans layout.chipRow.
 */
export function Chip({ label, selected, onPress, accessibilityLabel, disabled = false, tone = 'accent' }: ChipProps) {
  const toneStyles = TONES[tone];
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && toneStyles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={size.iconSmall} color={colors[tone]} aria-hidden /> : null}
      <Text style={[styles.label, selected && toneStyles.label]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: size.chip,
    minWidth: size.touch,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.chip,
    // Contour toujours présent, transparent : le choisir ne décale rien.
    borderWidth: size.chipBorder,
    borderColor: 'transparent',
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  /** Un cran plus sombre, choisie ou non ; le contour d'une puce choisie reste. */
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: disabledOpacity,
  },
  label: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    color: colors.text,
  },
});

const TONES = {
  accent: StyleSheet.create({
    selected: { backgroundColor: colors.accentTint, borderColor: colors.accent },
    label: { color: colors.accent },
  }),
  quiz: StyleSheet.create({
    selected: { backgroundColor: colors.quizTint, borderColor: colors.quiz },
    label: { color: colors.quiz },
  }),
} as const;
