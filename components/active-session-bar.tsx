import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text } from 'react-native';

import { elapsedMs, formatElapsed, type ActiveSession } from '../lib/active-session';
import { openActiveSession, useActiveSession } from '../lib/active-session-context';
import { colors, size, spacing, text } from '../lib/theme';
import { FieldError } from './field-error';

/** Rafraîchissement du chrono affiché. */
const TICK_MS = 1000;

/**
 * Au-dessus de la barre d'onglets (prop tabBar de app/(tabs)/_layout.tsx), sur
 * les 4 onglets : « En cours · titre · 12:34 », tap → la fiche à sa dernière
 * étape. Au-dessus, l'échec éventuel de mémorisation de la séance. Rien sinon.
 */
export function ActiveSessionBar() {
  const { session, error, dismissError } = useActiveSession();
  return (
    <>
      {error !== null ? (
        <Pressable
          role="button"
          accessibilityLabel={`${error} Toucher pour masquer.`}
          onPress={dismissError}
          style={({ pressed }) => [styles.error, pressed && styles.errorPressed]}
        >
          <FieldError message={error} />
          <Text style={text.meta}>Toucher pour masquer.</Text>
        </Pressable>
      ) : null}
      {session !== null ? <SessionBar session={session} /> : null}
    </>
  );
}

function SessionBar({ session }: { session: ActiveSession }) {
  const elapsed = useElapsedLabel(session.startedAt);
  return (
    <Pressable
      role="button"
      // Libellé stable : un chrono relu chaque seconde par le lecteur d'écran serait du bruit.
      accessibilityLabel={`Séance en cours : ${session.title}. Reprendre la fiche.`}
      onPress={() => openActiveSession(session, 'push')}
      style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
    >
      {/* Un titre long se coupe ; le chrono reste entier. */}
      <Text numberOfLines={1} style={[text.bodyStrong, styles.onAccent, styles.title]}>
        {`En cours · ${session.title}`}
      </Text>
      <Text style={[text.bodyStrong, text.tabular, styles.onAccent]}>{` · ${elapsed}`}</Text>
    </Pressable>
  );
}

/**
 * Chrono = maintenant − startedAt, recalculé chaque seconde seulement quand le
 * bandeau est visible : onglets au premier plan de la pile, app au premier plan.
 * Caché, rien ne tourne ; au retour, la valeur est recalculée aussitôt.
 */
function useElapsedLabel(startedAt: string): string {
  // Onglets au sommet de la pile racine : une fiche ouverte par-dessus les rend invisibles.
  const focused = useIsFocused();
  const [appVisible, setAppVisible] = useState(() => AppState.currentState !== 'background');
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppVisible(state !== 'background'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!focused || !appVisible) {
      return;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [focused, appVisible]);

  return formatElapsed(elapsedMs(startedAt, now));
}

const styles = StyleSheet.create({
  bar: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
  },
  barPressed: {
    backgroundColor: colors.accentPressed,
  },
  onAccent: {
    color: colors.onAccent,
  },
  title: {
    flexShrink: 1,
  },
  error: {
    minHeight: size.touch,
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: size.border,
    borderTopColor: colors.border,
    backgroundColor: colors.surface2,
  },
  errorPressed: {
    backgroundColor: colors.border,
  },
});
