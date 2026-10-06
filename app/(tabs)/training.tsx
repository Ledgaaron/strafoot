import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';

import { listTests, listTrainingSheets, type TestRow, type TrainingSheetRow } from '../../lib/db/training';

type ListState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: T[] };

export default function TrainingScreen() {
  const [sheets, setSheets] = useState<ListState<TrainingSheetRow>>({ status: 'loading' });
  const [tests, setTests] = useState<ListState<TestRow>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    listTrainingSheets().then(({ data, error }) => {
      if (active) {
        setSheets(error ? { status: 'error', message: error } : { status: 'ready', items: data ?? [] });
      }
    });
    listTests().then(({ data, error }) => {
      if (active) {
        setTests(error ? { status: 'error', message: error } : { status: 'ready', items: data ?? [] });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Fiches</Text>
      {sheets.status === 'loading' ? <ActivityIndicator /> : null}
      {sheets.status === 'error' ? <Text style={styles.error}>Erreur : {sheets.message}</Text> : null}
      {sheets.status === 'ready' && sheets.items.length === 0 ? <Text>Aucune fiche.</Text> : null}
      {sheets.status === 'ready'
        ? sheets.items.map((sheet) => <Text key={sheet.id}>{sheet.title}</Text>)
        : null}

      <Text style={styles.heading}>Tests</Text>
      {tests.status === 'loading' ? <ActivityIndicator /> : null}
      {tests.status === 'error' ? <Text style={styles.error}>Erreur : {tests.message}</Text> : null}
      {tests.status === 'ready' && tests.items.length === 0 ? <Text>Aucun test.</Text> : null}
      {tests.status === 'ready'
        ? tests.items.map((test) => (
            <Text key={test.id}>
              {test.name} ({test.unit})
            </Text>
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  error: {
    color: '#b00020',
  },
});
