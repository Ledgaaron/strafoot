import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDayChip, localToday } from '../../lib/dates';
import { listLastSessionDates, listSheets, type SheetRow } from '../../lib/db/training';
import { countMeasures, type SheetKind } from '../../lib/sheet-types';

/** Fiche ou test prêt à afficher : une ligne tappable de la liste. */
type SheetItem = {
  id: string;
  title: string;
  /** null : pas de sous-titre (absent ou vide). */
  subtitle: string | null;
  /** « 45 min · tir · dernière fois : auj. » ; un test annonce ses mesures avant « dernière fois ». */
  details: string;
};

type ListsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sheets: SheetItem[]; tests: SheetItem[] };

/** Posés par l'écran de fiche (app/sheet/[id].tsx) quand il revient ici par router.dismissTo. */
type SavedParams = {
  /** Id de la séance créée : sa présence seule déclenche la confirmation. */
  savedSession?: string;
  savedTitle?: string;
  /** Nombre de résultats enregistrés, en chaîne ; seulement au retour d'un test. */
  savedResults?: string;
};

export default function TrainingScreen() {
  const [listsState, setListsState] = useState<ListsState>({ status: 'loading' });
  const savedParams = useLocalSearchParams<SavedParams>();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Pas de retour à « chargement » : au retour sur l'onglet, les listes précédentes
      // restent affichées jusqu'à la réponse.
      Promise.all([listSheets({ kind: 'training' }), listSheets({ kind: 'test' }), listLastSessionDates()])
        .then(([sheets, tests, lastDates]) => {
          if (!active) {
            return;
          }
          const errors = [sheets.error, tests.error, lastDates.error].filter((message) => message !== null);
          if (errors.length > 0) {
            // Une même panne (réseau, session expirée) remonte souvent sur les trois requêtes.
            setListsState({ status: 'error', message: [...new Set(errors)].join('\n') });
            return;
          }
          const lastSessionDates = lastDates.data ?? new Map<string, string>();
          // Libellés calculés ici avec le `today` de la lecture, pas au rendu : une
          // exception (jour mal formé refusé par formatDayChip) part dans le catch.
          setListsState({
            status: 'ready',
            sheets: (sheets.data ?? []).map((row) => toSheetItem(row, 'training', lastSessionDates, today)),
            tests: (tests.data ?? []).map((row) => toSheetItem(row, 'test', lastSessionDates, today)),
          });
        })
        .catch((exception: unknown) => {
          // Exception inattendue : affichée, jamais avalée.
          if (active) {
            setListsState({
              status: 'error',
              message: exception instanceof Error ? exception.message : String(exception),
            });
          }
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const confirmation = formatConfirmation(savedParams);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {confirmation !== null ? <Text style={styles.confirmation}>{confirmation}</Text> : null}
      {listsState.status === 'loading' ? <ActivityIndicator /> : null}
      {listsState.status === 'error' ? <Text style={styles.error}>Erreur : {listsState.message}</Text> : null}
      {listsState.status === 'ready' ? (
        <>
          <SheetSection title="Fiches" emptyText="Aucune fiche." items={listsState.sheets} />
          <SheetSection title="Tests" emptyText="Aucun test." items={listsState.tests} />
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * Ligne d'une fiche ou d'un test. `lastSessionDates` : jour de la dernière séance
 * liée, par id de fiche ; `today` : jour local lu en même temps que les données.
 */
function toSheetItem(
  row: SheetRow,
  kind: SheetKind,
  lastSessionDates: ReadonlyMap<string, string>,
  today: string,
): SheetItem {
  const lastDate = lastSessionDates.get(row.id);
  const details = [
    `${row.duration_min} min`,
    row.skill,
    // Un test annonce ses mesures ; une fiche de lecture n'en a pas.
    ...(kind === 'test' ? [formatMeasureCount(countMeasures(row.exercises))] : []),
    `dernière fois : ${lastDate === undefined ? 'jamais' : formatDayChip(lastDate, today)}`,
  ];
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle?.trim() || null,
    details: details.join(' · '),
  };
}

/** « 5 mesures » ; « mesures illisibles » si countMeasures renvoie null (exercices invalides en base). */
function formatMeasureCount(count: number | null): string {
  return count === null ? 'mesures illisibles' : formatCount(count, 'mesure', 'mesures');
}

/**
 * Confirmation du retour d'un écran de fiche : « Séance enregistrée : Tir. »,
 * « Test enregistré : Vitesse, 5 résultats. » ; null sans séance enregistrée.
 */
function formatConfirmation({ savedSession, savedTitle, savedResults }: SavedParams): string | null {
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  if (typeof savedSession !== 'string') {
    return null;
  }
  const title = typeof savedTitle === 'string' && savedTitle.trim() !== '' ? savedTitle.trim() : null;
  if (typeof savedResults !== 'string') {
    return title === null ? 'Séance enregistrée.' : `Séance enregistrée : ${title}.`;
  }
  if (title === null) {
    return 'Test enregistré.';
  }
  // Entier attendu ; autre chose (URL retouchée à la main sur le web) n'est pas affiché.
  return /^\d+$/.test(savedResults)
    ? `Test enregistré : ${title}, ${formatCount(Number(savedResults), 'résultat', 'résultats')}.`
    : `Test enregistré : ${title}.`;
}

/** Pluriel français, 0 et 1 au singulier : « 1 mesure », « 2 mesures ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count >= 2 ? plural : singular}`;
}

type SheetSectionProps = {
  title: string;
  emptyText: string;
  items: SheetItem[];
};

function SheetSection({ title, emptyText, items }: SheetSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {items.length === 0 ? <Text style={styles.text}>{emptyText}</Text> : null}
      {items.map((item) => (
        <SheetLine key={item.id} item={item} />
      ))}
    </View>
  );
}

function SheetLine({ item }: { item: SheetItem }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={item.title}
      onPress={() => router.push({ pathname: '/sheet/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      <Text style={styles.lineTitle}>{item.title}</Text>
      {item.subtitle !== null ? <Text style={styles.text}>{item.subtitle}</Text> : null}
      <Text style={styles.text}>{item.details}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  confirmation: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 'bold',
  },
  error: {
    fontSize: 16,
    lineHeight: 22,
    color: '#b00020',
  },
  pressed: {
    opacity: 0.5,
  },
  line: {
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  lineTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 'bold',
  },
});
