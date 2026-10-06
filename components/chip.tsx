import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, disabledOpacity, fontSize, hitSlop, lineHeight, radius, size, spacing } from '../lib/theme';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Choix impossible (poste secondaire égal au principal) : grisée et inerte. */
  disabled?: boolean;
};

/**
 * Puce de choix, la même partout : surface2, accent quand elle est choisie.
 * 44 px de haut, zone tactile de 48 px (hitSlop) ; à poser dans layout.chipRow.
 */
export function Chip({ label, selected, onPress, accessibilityLabel, disabled = false }: ChipProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && (selected ? styles.selectedPressed : styles.pressed),
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: size.chip,
    minWidth: size.touch,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.chip,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.accent,
  },
  pressed: {
    backgroundColor: colors.border,
  },
  selectedPressed: {
    backgroundColor: colors.accentPressed,
  },
  disabled: {
    opacity: disabledOpacity,
  },
  label: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    // Graisse fixe : la puce ne change pas de largeur quand elle est choisie.
    fontWeight: '500',
    color: colors.text,
  },
  selectedLabel: {
    color: colors.onAccent,
  },
});
