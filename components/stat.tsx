import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, text } from '../lib/theme';

export type StatTone = 'accent' | 'quiz' | 'text';

type StatProps = {
  /** Libellé meta, au-dessus du chiffre. */
  label: string;
  /** Chiffre dominant ; « — » tant qu'il n'est pas chargé. */
  value: string | number;
  /** Unité meta, collée au chiffre (« 12 jours », « 2,3 /3 »). */
  unit?: string;
  tone?: StatTone;
};

/** Chiffre dominant (44 px) avec son libellé et son unité en secondaire. */
export function Stat({ label, value, unit, tone = 'text' }: StatProps) {
  const shown = String(value);
  return (
    <View accessible accessibilityLabel={unit ? `${label} : ${shown} ${unit}` : `${label} : ${shown}`} style={styles.stat}>
      <Text style={text.meta}>{label}</Text>
      <View style={styles.valueRow}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[text.hero, TONE_STYLES[tone]]}>
          {shown}
        </Text>
        {unit ? <Text style={text.meta}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const TONE_STYLES = StyleSheet.create({
  accent: { color: colors.accent },
  quiz: { color: colors.quiz },
  text: { color: colors.text },
});

const styles = StyleSheet.create({
  stat: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
});
