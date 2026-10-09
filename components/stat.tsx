import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, text } from '../lib/theme';

/** Couleur du chiffre ; muted : série perdue. */
export type StatTone = 'accent' | 'quiz' | 'text' | 'muted';

type StatProps = {
  /** Libellé meta, au-dessus du chiffre. */
  label: string;
  /** Chiffre dominant ; « — » tant qu'il n'est pas chargé. */
  value: string | number;
  /** Dénominateur collé au chiffre, dans sa police à 40 % (« 74/99 », « 2,3/3 »). */
  denominator?: string;
  /** Unité meta, après le chiffre (« 4,47 s »). */
  unit?: string;
  /** Posé à gauche du chiffre, sur sa ligne de base (Flame d'une série). */
  leading?: ReactNode;
  tone?: StatTone;
  /** Remplace le libellé lu par défaut (« Entraînement : 12 ») quand le chiffre seul ne dit pas tout. */
  accessibilityLabel?: string;
};

/** Chiffre dominant (44 px, police d'affichage) avec son libellé, son dénominateur et son unité en secondaire. */
export function Stat({ label, value, denominator, unit, leading, tone = 'text', accessibilityLabel }: StatProps) {
  const shown = String(value);
  const spoken = `${label} : ${shown}${denominator ?? ''}${unit ? ` ${unit}` : ''}`;
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? spoken} style={styles.stat}>
      <Text style={text.meta}>{label}</Text>
      <View style={styles.valueRow}>
        {leading}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[text.number, TONE_STYLES[tone]]}>
          {shown}
          {denominator ? <Text style={text.denominator}>{denominator}</Text> : null}
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
  muted: { color: colors.textMuted },
});

const styles = StyleSheet.create({
  stat: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  // Ligne de base commune : une vue sans texte (la flamme) y pose son bord bas.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
});
