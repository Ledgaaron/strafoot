import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { localToday, relativeDay } from '../../lib/dates';
import { listLastSessionDates, listSheets, type SheetRow } from '../../lib/db/training';
import { countMeasures, type SheetKind } from '../../lib/sheet-types';
import { colors, layout, size, spacing, text } from '../../lib/theme';

/** État vide sans bouton : fiches et tests viennent du seed SQL, exécuté hors de l'app. */
const EMPTY_MESSAGE = 'Le contenu d’entraînement n’est pas encore chargé dans la base.';

/** Fiche ou test prêt à afficher : une carte tappable de la liste. */
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
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);
  const savedParams = useLocalSearchParams<SavedParams>();

  // loadCount en dépendance : « Réessayer » donne un nouveau callback, rejoué
  // aussitôt puisque l'onglet a le focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Pas de retour à « chargement » au focus : au retour sur l'onglet, les listes
      // précédentes restent affichées jusqu'à la réponse. Seul « Réessayer » y repasse.
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
          // exception (jour mal formé refusé par relativeDay) part dans le catch.
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
    }, [loadCount]),
  );

  function reload() {
    setListsState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  const confirmation = formatConfirmation(savedParams);

  return (
    <Screen title="Entraînement">
      {confirmation !== null ? (
        <Card bordered style={styles.confirmation}>
          <Ionicons name="checkmark-circle" size={size.icon} color={colors.success} aria-hidden />
          <Text style={[text.body, styles.confirmationText]}>{confirmation}</Text>
        </Card>
      ) : null}
      {listsState.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
      {listsState.status === 'error' ? (
        <View style={layout.section}>
          <FieldError message={`Erreur : ${listsState.message}`} />
          <Button variant="secondary" label="Réessayer" onPress={reload} />
        </View>
      ) : null}
      {listsState.status === 'ready' ? (
        <>
          <SheetSection title="Fiches" emptyTitle="Aucune fiche" items={listsState.sheets} />
          <SheetSection title="Tests" emptyTitle="Aucun test" items={listsState.tests} />
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Carte d'une fiche ou d'un test. `lastSessionDates` : jour de la dernière séance
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
    `dernière fois : ${lastDate === undefined ? 'jamais' : relativeDay(lastDate, today)}`,
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
  /** Titre de l'état vide : « Aucune fiche ». */
  emptyTitle: string;
  items: SheetItem[];
};

function SheetSection({ title, emptyTitle, items }: SheetSectionProps) {
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.title}>
        {title}
      </Text>
      {items.length === 0 ? <EmptyState title={emptyTitle} message={EMPTY_MESSAGE} /> : null}
      {items.map((item) => (
        <SheetCard key={item.id} item={item} />
      ))}
    </View>
  );
}

function SheetCard({ item }: { item: SheetItem }) {
  return (
    <Card
      accessibilityLabel={item.title}
      onPress={() => router.push({ pathname: '/sheet/[id]', params: { id: item.id } })}
    >
      <Text style={text.bodyStrong}>{item.title}</Text>
      {item.subtitle !== null ? <Text style={text.meta}>{item.subtitle}</Text> : null}
      <Text style={text.meta}>{item.details}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  confirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmationText: {
    // Un titre long passe à la ligne à côté de l'icône au lieu de déborder de la carte.
    flex: 1,
    color: colors.success,
  },
});
