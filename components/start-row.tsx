import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, size, spacing, text } from '../lib/theme';
import { Card } from './card';

type StartRowProps = {
  title: string;
  /** « 10 min · dernière fois : hier · record : 18 pts /30 » */
  details: string;
  /** Tout le contenu de la carte, lu par le lecteur d'écran. */
  accessibilityLabel: string;
  /** Tap sur la carte : lire la fiche, ouvrir le test, voir la session. */
  onPress: () => void;
  /** ▶ : démarrer le chrono. */
  onStart: () => void;
};

/**
 * Carte d'une fiche, d'un test ou d'une session, et ▶ à sa droite : deux cibles
 * voisines, jamais l'une dans l'autre, chacune avec son état pressé. Liste d'un
 * thème de fiches et onglet Tests.
 */
export function StartRow({ title, details, accessibilityLabel, onPress, onStart }: StartRowProps) {
  return (
    <View style={styles.row}>
      <Card accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.card}>
        <Text style={text.bodyStrong}>{title}</Text>
        <Text style={text.meta}>{details}</Text>
      </Card>
      <Pressable
        role="button"
        accessibilityLabel={`Démarrer : ${title}`}
        onPress={onStart}
        style={({ pressed }) => [styles.start, pressed && styles.startPressed]}
      >
        <Ionicons name="play" size={size.icon} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Carte et ▶ côte à côte, 8 px entre les deux cibles ; ▶ prend la hauteur de la carte. */
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
  },
  start: {
    width: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  startPressed: {
    backgroundColor: colors.surfacePressed,
  },
});
