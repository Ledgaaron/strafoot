import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { addDays, toLocalDateString } from '../../lib/dates';
import { listSessions, type SessionRow } from '../../lib/db/sessions';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sessions: SessionRow[] };

export default function HomeScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const today = new Date();
    // 30 derniers jours, aujourd'hui compris, en jours locaux.
    listSessions({ from: toLocalDateString(addDays(today, -29)), to: toLocalDateString(today) }).then(
      ({ data, error }) => {
        if (!active) {
          return;
        }
        setState(error ? { status: 'error', message: error } : { status: 'ready', sessions: data ?? [] });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      {state.status === 'loading' ? <ActivityIndicator /> : null}
      {state.status === 'error' ? <Text style={styles.error}>Erreur : {state.message}</Text> : null}
      {state.status === 'ready' && state.sessions.length === 0 ? (
        <Text>Aucune séance sur les 30 derniers jours.</Text>
      ) : null}
      {state.status === 'ready' && state.sessions.length > 0 ? (
        <Text style={styles.value}>
          {state.sessions.length} séance{state.sessions.length > 1 ? 's' : ''} sur les 30 derniers jours
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  value: {
    fontSize: 18,
  },
  error: {
    color: '#b00020',
  },
});
