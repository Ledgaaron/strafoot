import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { CommentField, DifficultyField, DurationField } from '../../components/session-form';
import {
  elapsedMinutes,
  elapsedMs,
  formatElapsed,
  MIN_TIMED_DURATION,
  type ActiveSession,
} from '../../lib/active-session';
import {
  confirmAbandon,
  finishActiveSession,
  useActiveSession,
  vibrateOnSave,
} from '../../lib/active-session-context';
import { localDateOfTimestamp } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import { DEFAULT_DIFFICULTY, getModule, SHEET_MODULE_KEY } from '../../lib/modules';
import { colors, spacing, text } from '../../lib/theme';

const TITLE = 'Terminer la séance';
const NO_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.';

/** Fin d'une fiche chronométrée : durée réelle ajustable, difficulté, commentaire ; ou abandon. */
export default function FinishSessionScreen() {
  const { loading, session } = useActiveSession();
  // Séance figée à son arrivée : l'effacer en partant (enregistrée ou abandonnée)
  // ne remplace pas le formulaire par l'état vide pendant l'animation de sortie.
  const [shown, setShown] = useState(session);
  if (shown === null && session !== null) {
    setShown(session);
  }

  if (shown !== null && shown.kind === 'training') {
    return <FinishForm key={shown.startedAt} session={shown} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: TITLE }} />
      <Screen>
        {loading ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {!loading && shown === null ? (
          <EmptyState
            title="Aucune séance en cours"
            message="Démarre une fiche avec ▶ dans l’onglet Entraînement."
            action={{ label: 'Voir les fiches', onPress: () => router.dismissTo('/training') }}
          />
        ) : null}
        {shown !== null && shown.kind === 'test' ? (
          // Lien direct (web) : un test se termine sur sa saisie des mesures, pas ici.
          <EmptyState
            title="Un test est en cours"
            message={`« ${shown.title} » se termine sur sa saisie des mesures.`}
            action={{ label: 'Ouvrir la saisie', onPress: () => finishActiveSession(shown, 'replace') }}
          />
        ) : null}
      </Screen>
    </>
  );
}

function FinishForm({ session }: { session: ActiveSession }) {
  const { clear } = useActiveSession();
  // Chrono lu à l'arrivée sur l'écran : la durée proposée ne bouge plus pendant la saisie.
  const [measuredMs] = useState(() => elapsedMs(session.startedAt, Date.now()));
  const [durationMin, setDurationMin] = useState(() => elapsedMinutes(measuredMs));
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);

  function stepDuration(delta: number) {
    setDurationMin((current) => Math.max(MIN_TIMED_DURATION, current + delta));
  }

  function toggleDifficulty(level: number) {
    setDifficulty((current) => (current === level ? null : level));
  }

  async function save() {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setSaving(true);
    setError(null);
    // Jamais de user_id : la base le tire du JWT. Jour du démarrage, en heure
    // locale : une séance commencée à 23h30 compte pour ce jour-là.
    const { data, error: createError } = await createSession({
      date: localDateOfTimestamp(session.startedAt),
      module: SHEET_MODULE_KEY,
      type: getModule(SHEET_MODULE_KEY).type,
      name: session.title,
      duration_min: durationMin,
      difficulty: difficulty ?? DEFAULT_DIFFICULTY,
      comment: comment.trim() || null,
      sheet_id: session.sheetId,
    });
    if (createError !== null || data === null) {
      pendingRef.current = false;
      setSaving(false);
      setError(createError ?? NO_SESSION_MESSAGE);
      return;
    }
    // pendingRef reste vrai : l'écran se ferme, pas de second envoi possible.
    vibrateOnSave();
    void clear();
    router.dismissTo({ pathname: '/training', params: { savedSession: data.id, savedTitle: session.title } });
  }

  function abandon() {
    if (pendingRef.current) {
      return;
    }
    confirmAbandon(() => {
      pendingRef.current = true;
      void clear();
      // Sans params : une confirmation d'enregistrement restée sur l'onglet disparaît.
      router.dismissTo('/training');
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: TITLE }} />
      <Screen
        footer={
          <>
            <FieldError message={error} />
            <Button label="Enregistrer" onPress={save} loading={saving} />
            <Button variant="danger" label="Abandonner la séance" onPress={abandon} disabled={saving} />
          </>
        }
      >
        <View style={styles.titleBlock}>
          <Text role="heading" style={text.title}>
            {session.title}
          </Text>
          <Text style={[text.meta, text.tabular]}>
            {`${getModule(SHEET_MODULE_KEY).label} · chrono ${formatElapsed(measuredMs)}`}
          </Text>
        </View>

        <DurationField value={durationMin} onStep={stepDuration} />
        <DifficultyField value={difficulty} onToggle={toggleDifficulty} />
        <CommentField value={comment} onChange={setComment} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    gap: spacing.xs,
  },
});
