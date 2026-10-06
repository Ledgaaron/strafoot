import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { SessionForm, sessionFormValuesFromRow, type SessionFormResult } from '../../components/session-form';
import { localToday } from '../../lib/dates';
import {
  deleteSession,
  getSession,
  updateSession,
  type SessionPatch,
  type SessionRow,
} from '../../lib/db/sessions';
import { getModule } from '../../lib/modules';
import { colors, layout } from '../../lib/theme';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; row: SessionRow };

export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sessionId = typeof id === 'string' && id !== '' ? id : null;
  // Jour figé à l'ouverture : les puces de date ne bougent pas pendant la saisie.
  const [today] = useState(localToday);
  const [state, setState] = useState<State>(sessionId ? { status: 'loading' } : { status: 'empty' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    let active = true;
    getSession(sessionId).then(({ data, error: loadError }) => {
      if (!active) {
        return;
      }
      if (loadError) {
        setState({ status: 'error', message: loadError });
      } else if (data) {
        setState({ status: 'ready', row: data });
      } else {
        setState({ status: 'empty' });
      }
    });
    return () => {
      active = false;
    };
  }, [sessionId, loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  if (state.status !== 'ready') {
    return (
      <>
        <Stack.Screen options={{ title: 'Séance' }} />
        <Screen>
          {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
          {state.status === 'error' ? (
            <View style={layout.section}>
              <FieldError message={`Erreur : ${state.message}`} />
              <Button variant="secondary" label="Réessayer" onPress={reload} />
            </View>
          ) : null}
          {state.status === 'empty' ? (
            <EmptyState
              title="Séance introuvable"
              message="Elle a peut-être déjà été supprimée."
              action={{ label: 'Retour', onPress: goBack }}
            />
          ) : null}
        </Screen>
      </>
    );
  }

  const row = state.row;
  // Une requête à la fois : pendant l'enregistrement ou la suppression, l'autre bouton est désactivé.
  const busy = saving || deleting;

  async function handleSave(result: SessionFormResult) {
    if (busy) {
      return;
    }
    setSaving(true);
    setError(null);
    const patch: SessionPatch = { ...result };
    // Le type ne suit le module que si celui-ci change : une séance match du seed,
    // dont le module vaut 'seance_libre' par défaut en base, garde son type.
    if (result.module !== row.module) {
      patch.type = getModule(result.module).type;
    }
    const { data, error: saveError } = await updateSession(row.id, patch);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }
    if (!data) {
      setError('Supabase n’a renvoyé ni la séance ni d’erreur.');
      setSaving(false);
      return;
    }
    router.dismissTo({ pathname: '/', params: { day: data.date, session: data.id } });
  }

  function confirmDelete() {
    if (busy) {
      return;
    }
    // Alert.alert ne fait rien sur web : confirmation du navigateur à la place.
    if (Platform.OS === 'web') {
      if (window.confirm('Supprimer cette séance ? Cette action est définitive.')) {
        handleDelete();
      }
      return;
    }
    Alert.alert('Supprimer la séance', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: handleDelete },
    ]);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await deleteSession(row.id);
    if (deleteError) {
      setError(deleteError);
      setDeleting(false);
      return;
    }
    router.dismissTo({ pathname: '/', params: { day: row.date, session: row.id } });
  }

  return (
    <SessionForm
      key={row.id}
      title="Modifier la séance"
      today={today}
      initialValues={sessionFormValuesFromRow(row)}
      submitting={saving}
      disabled={deleting}
      error={error}
      onSubmit={handleSave}
      footer={
        <Button
          variant="danger"
          label="Supprimer la séance"
          onPress={confirmDelete}
          loading={deleting}
          disabled={saving}
        />
      }
    />
  );
}

/** Retour à l'écran précédent ; sans historique (lien ouvert directement), l'Accueil. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
