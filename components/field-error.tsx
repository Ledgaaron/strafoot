import { StyleSheet, Text } from 'react-native';

import { colors, fontSize, lineHeight } from '../lib/theme';

type FieldErrorProps = {
  /** Message en français ; rien n'est rendu sans message. */
  message: string | null | undefined;
};

/** Erreur posée juste sous le champ ou l'action qui l'a produite ; la saisie reste en place. */
export function FieldError({ message }: FieldErrorProps) {
  if (!message) {
    return null;
  }
  return (
    <Text role="alert" style={styles.error}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  error: {
    // 14 px : taille meta.
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    color: colors.danger,
  },
});
