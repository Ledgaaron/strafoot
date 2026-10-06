import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
  }, [sessionId]);

  if (state.status !== 'ready') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Séance' }} />
        {state.status === 'loading' ? <ActivityIndicator /> : null}
        {state.status === 'error' ? <Text style={styles.error}>{state.message}</Text> : null}
        {state.status === 'empty' ? <Text>Séance introuvable.</Text> : null}
      </View>
    );
  }

  const row = state.row;
  // Une requête à la fois : enregistrer et supprimer sont désactivés ensemble.
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
      submitting={busy}
      error={error}
      onSubmit={handleSave}
      footer={
        <Pressable
          role="button"
          aria-disabled={busy}
          disabled={busy}
          onPress={confirmDelete}
          style={({ pressed }) => [styles.deleteButton, (pressed || busy) && styles.dimmed]}
        >
          <Text style={styles.deleteLabel}>{deleting ? 'Suppression…' : 'Supprimer la séance'}</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  error: {
    color: '#b00020',
  },
  deleteButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: '#b00020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 16,
    color: '#b00020',
  },
  dimmed: {
    opacity: 0.5,
  },
});
