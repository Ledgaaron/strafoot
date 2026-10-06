import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { listQuestions, type QuestionRow } from '../../lib/db/questions';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; questions: QuestionRow[] };

export default function QuizScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    listQuestions().then(({ data, error }) => {
      if (!active) {
        return;
      }
      setState(error ? { status: 'error', message: error } : { status: 'ready', questions: data ?? [] });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      {state.status === 'loading' ? <ActivityIndicator /> : null}
      {state.status === 'error' ? <Text style={styles.error}>Erreur : {state.message}</Text> : null}
      {state.status === 'ready' && state.questions.length === 0 ? (
        <Text>Aucune question disponible.</Text>
      ) : null}
      {state.status === 'ready' && state.questions.length > 0 ? (
        <Text style={styles.value}>
          {state.questions.length} question{state.questions.length > 1 ? 's' : ''} disponible
          {state.questions.length > 1 ? 's' : ''}
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
