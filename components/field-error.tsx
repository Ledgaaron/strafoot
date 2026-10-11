import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '../lib/errors';
import { colors, fontSize, lineHeight, spacing, text } from '../lib/theme';

type FieldErrorProps = {
  /** Message écrit par l'app, déjà en français (champ refusé, consigne) : affiché tel quel. */
  message?: string | null;
  /**
   * Erreur reçue, brute (message de lib/db, AuthError, exception) : traduite en
   * français par describeError (lib/errors.ts), son texte d'origine en dessous,
   * en secondaire. null ou undefined : aucune erreur. Avec message, celui-ci
   * vient d'abord et la cause reconnue le suit.
   */
  error?: unknown;
};

/**
 * Erreur posée juste sous le champ ou l'action qui l'a produite ; la saisie
 * reste en place. Seul affichage d'une erreur reçue : tout passe par
 * describeError. Rien n'est rendu sans message ni erreur.
 */
export function FieldError({ message = null, error }: FieldErrorProps) {
  if (error === null || error === undefined) {
    return message ? (
      <Text role="alert" style={styles.error}>
        {message}
      </Text>
    ) : null;
  }
  const described = describeError(error);
  // Une erreur non reconnue n'ajoute rien au message de l'app : son texte d'origine suit, en détail.
  const lead =
    message === null || message === ''
      ? described.message
      : described.kind === 'unknown'
        ? message
        : `${message} ${described.message}`;
  return (
    <View style={styles.block}>
      <Text role="alert" style={styles.error}>
        {lead}
      </Text>
      {/* Sélectionnable : le texte d'origine se copie pour chercher la cause. */}
      {described.detail !== null ? (
        <Text selectable style={text.meta}>
          {described.detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  error: {
    // 14 px : taille meta.
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    color: colors.danger,
  },
});
