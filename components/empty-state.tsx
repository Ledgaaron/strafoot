import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, text } from '../lib/theme';
import { Button } from './button';

type EmptyStateAction = {
  label: string;
  onPress: () => void;
  /** primary par défaut ; secondary quand l'écran porte déjà son action principale ailleurs. */
  variant?: 'primary' | 'secondary';
};

type EmptyStateProps = {
  /** Ce qui manque : « Aucune séance ce jour ». */
  title: string;
  /** Quoi faire : « Ajoute-en une avec Nouvelle séance. » */
  message: string;
  /** Le bouton qui le fait. */
  action?: EmptyStateAction;
};

/** État vide : dit ce qui manque, quoi faire, et porte le bouton pour le faire. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={text.title}>{title}</Text>
      <Text style={[text.body, styles.message]}>{message}</Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'primary'} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  message: {
    color: colors.textMuted,
  },
});
