import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import {
  CommentField,
  DifficultyField,
  DurationField,
  MAX_DURATION,
  parseDuration,
  stepDurationText,
} from '../../components/session-form';
import { elapsedMinutes, elapsedMs, formatElapsed, type ActiveSession } from '../../lib/active-session';
import {
  confirmAbandon,
  finishActiveSession,
  useActiveSession,
  vibrateOnSave,
} from '../../lib/active-session-context';
import { localDateOfTimestamp } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import { getSheetDuration } from '../../lib/db/training';
import { DEFAULT_DIFFICULTY, getModule, SHEET_MODULE_KEY } from '../../lib/modules';
import { colors, layout, spacing, text } from '../../lib/theme';

const TITLE = 'Terminer la séance';
const NO_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.';
/** Même message que le pied du formulaire de séance. */
const INVALID_DURATION_MESSAGE = 'À corriger : durée.';
const SHEET_GONE_MESSAGE = 'Durée de la fiche non lue : la fiche n’existe plus.';

const MINUTE_MS = 60 * 1000;
/**
 * Chrono au-delà duquel la séance a sans doute été oubliée en cours (3 h) :
 * la durée prévue de la fiche est proposée à la place de celle du chrono.
 */
const FORGOTTEN_SESSION_MIN = 180;

/** Puce d'où vient la durée proposée : durée prévue de la fiche, ou chrono. */
type DurationSource = 'sheet' | 'chrono';

/** Saisie de la durée et la puce qui l'a posée ; source null après une frappe ou ±5 : aucune puce choisie. */
type DurationDraft = { text: string; source: DurationSource | null };

/** Durée prévue de la fiche, lue seulement pour une séance oubliée. */
type SheetDurationState =
  | { status: 'loading' }
  | { status: 'ready'; minutes: number }
  | { status: 'error'; message: string };

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
  const forgotten = measuredMs > FORGOTTEN_SESSION_MIN * MINUTE_MS;
  // Durée du chrono, en minutes arrondies, bornée au maximum d'une séance.
  const chronoMinutes = Math.min(MAX_DURATION, elapsedMinutes(measuredMs));
  // Saisie brute : vide ou hors bornes pendant la frappe, lue à l'enregistrement.
  const [duration, setDuration] = useState<DurationDraft>(() => ({ text: String(chronoMinutes), source: 'chrono' }));
  // Lue au montage pour une séance oubliée seulement ; ignorée sinon.
  const [sheetDuration, setSheetDuration] = useState<SheetDurationState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture de la durée de la fiche.
  const [loadCount, setLoadCount] = useState(0);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  // Enregistrer refusé : durée illisible ou hors bornes (le détail est sous le champ).
  const [invalidSubmit, setInvalidSubmit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);
  // Séance oubliée, durée de la fiche pas encore lue : ni durée affichée ni
  // enregistrement, aucune valeur fausse ne passe.
  const durationLoading = forgotten && sheetDuration.status === 'loading';

  useEffect(() => {
    if (!forgotten) {
      return;
    }
    let active = true;
    getSheetDuration(session.sheetId).then(({ data, error: loadError }) => {
      if (!active) {
        return;
      }
      if (loadError !== null) {
        setSheetDuration({ status: 'error', message: `Durée de la fiche non lue : ${loadError}` });
      } else if (data === null) {
        setSheetDuration({ status: 'error', message: SHEET_GONE_MESSAGE });
      } else {
        setSheetDuration({ status: 'ready', minutes: data });
        // Durée de la fiche présélectionnée ; une durée tapée après un échec reste en place.
        setDuration((current) => (current.source === null ? current : { text: String(data), source: 'sheet' }));
      }
    });
    return () => {
      active = false;
    };
  }, [forgotten, session.sheetId, loadCount]);

  function reloadSheetDuration() {
    setSheetDuration({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  function changeDurationText(value: string) {
    setInvalidSubmit(false);
    setDuration({ text: value, source: null });
  }

  function stepDuration(delta: number) {
    setInvalidSubmit(false);
    // Saisie illisible : on repart de la durée du chrono.
    setDuration((current) => ({ text: stepDurationText(current.text, delta, chronoMinutes), source: null }));
  }

  /** Puce touchée : sa durée remplace la saisie et la puce est choisie. */
  function pickDuration(source: DurationSource, minutes: number) {
    setInvalidSubmit(false);
    setDuration({ text: String(minutes), source });
  }

  function toggleDifficulty(level: number) {
    setDifficulty((current) => (current === level ? null : level));
  }

  async function save() {
    if (pendingRef.current || durationLoading) {
      return;
    }
    const durationMin = parseDuration(duration.text);
    if (durationMin === null) {
      // Saisie conservée ; le message détaillé est déjà sous le champ.
      setInvalidSubmit(true);
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
            {/* Le champ en erreur peut être hors de l'écran : le pied, toujours visible, le dit. */}
            <FieldError message={invalidSubmit ? INVALID_DURATION_MESSAGE : error} />
            <Button label="Enregistrer" onPress={save} loading={saving} disabled={durationLoading} />
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

        {forgotten ? (
          <View style={layout.section}>
            <Text style={text.body}>{`Chrono : ${formatHoursMinutes(measuredMs)} — séance oubliée ?`}</Text>
            {sheetDuration.status === 'error' ? (
              <>
                <FieldError message={sheetDuration.message} />
                <Button variant="secondary" label="Réessayer" onPress={reloadSheetDuration} />
              </>
            ) : null}
            {/* Pendant la lecture, l'indicateur tient la place des puces et du champ, plus bas. */}
            {sheetDuration.status !== 'loading' ? (
              <View style={layout.chipRow}>
                {sheetDuration.status === 'ready' ? (
                  <Chip
                    label={`Durée de la fiche (${sheetDuration.minutes} min)`}
                    selected={duration.source === 'sheet'}
                    onPress={() => pickDuration('sheet', sheetDuration.minutes)}
                  />
                ) : null}
                <Chip
                  label="Durée du chrono"
                  selected={duration.source === 'chrono'}
                  onPress={() => pickDuration('chrono', chronoMinutes)}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {durationLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <DurationField text={duration.text} onChangeText={changeDurationText} onStep={stepDuration} />
        )}
        <DifficultyField value={difficulty} onToggle={toggleDifficulty} />
        <CommentField value={comment} onChange={setComment} />
      </Screen>
    </>
  );
}

/** Chrono en heures et minutes : « 6 h 12 », « 3 h 05 » ; secondes ignorées, comme dans formatElapsed. */
function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${Math.floor(totalMinutes / 60)} h ${minutes}`;
}

const styles = StyleSheet.create({
  titleBlock: {
    gap: spacing.xs,
  },
});
