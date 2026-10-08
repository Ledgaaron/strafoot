import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { FieldError } from '../../components/field-error';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { localToday, relativeDay } from '../../lib/dates';
import { listLastSessionDates, listSheets, type SheetRow } from '../../lib/db/training';
import { colors, layout, size, spacing, text } from '../../lib/theme';
import { sheetTheme, TRAINING_THEMES, type TrainingThemeKey } from '../../lib/training-themes';

/** Espace insécable : un nombre et son nom restent sur la même ligne (« 3 fiches »). */
const NBSP = ' ';

/** Bloc d'un thème prêt à afficher : une carte tappable de l'onglet. */
type ThemeItem = {
  key: TrainingThemeKey;
  label: string;
  /** « 3 fiches · dernière fois : hier » */
  details: string;
  /** Tout le contenu de la carte, lu par le lecteur d'écran. */
  accessibilityLabel: string;
};

type ThemesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; themes: ThemeItem[] };

/**
 * Posés au retour ici par router.dismissTo : « Séance faite » d'une fiche sans
 * chrono (app/sheet/[id].tsx), fin d'une fiche chronométrée
 * (app/session/finish.tsx), « Séance déjà faite » (app/session/new.tsx ouvert
 * avec sheetId).
 */
type SavedParams = {
  /** Id de la séance créée : sa présence seule déclenche la confirmation, dont il est la key. */
  savedSession?: string;
  savedTitle?: string;
};

export default function TrainingScreen() {
  const [themesState, setThemesState] = useState<ThemesState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);
  const { savedSession, savedTitle } = useLocalSearchParams<SavedParams>();

  // loadCount en dépendance : « Réessayer » donne un nouveau callback, rejoué
  // aussitôt puisque l'onglet a le focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Pas de retour à « chargement » au focus : au retour sur l'onglet, les blocs
      // précédents restent affichés jusqu'à la réponse. Seul « Réessayer » y repasse.
      Promise.all([listSheets({ kind: 'training' }), listSheets({ kind: 'test' }), listLastSessionDates()])
        .then(([sheets, tests, lastDates]) => {
          if (!active) {
            return;
          }
          const errors = [sheets.error, tests.error, lastDates.error].filter((message) => message !== null);
          if (errors.length > 0) {
            // Une même panne (réseau, session expirée) remonte souvent sur les trois requêtes.
            setThemesState({ status: 'error', message: [...new Set(errors)].join('\n') });
            return;
          }
          // Libellés calculés ici avec le `today` de la lecture, pas au rendu : une
          // exception (jour mal formé refusé par relativeDay) part dans le catch.
          setThemesState({
            status: 'ready',
            themes: toThemeItems(
              [...(sheets.data ?? []), ...(tests.data ?? [])],
              lastDates.data ?? new Map<string, string>(),
              today,
            ),
          });
        })
        .catch((exception: unknown) => {
          // Exception inattendue : affichée, jamais avalée.
          if (active) {
            setThemesState({
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
    setThemesState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  // key : une nouvelle séance enregistrée rejoue la confirmation, un simple rendu non.
  const toast =
    typeof savedSession === 'string' ? (
      <SaveToast key={savedSession} message={formatSavedMessage(savedTitle)} />
    ) : null;

  return (
    <Screen title="Entraînement" toast={toast}>
      {themesState.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
      {themesState.status === 'error' ? (
        <View style={layout.section}>
          <FieldError message={`Erreur : ${themesState.message}`} />
          <Button variant="secondary" label="Réessayer" onPress={reload} />
        </View>
      ) : null}
      {/* Pas d'état vide ici : les 3 blocs s'affichent toujours ; un thème sans
          fiche annonce « 0 fiche », et sa liste porte l'état vide. */}
      {themesState.status === 'ready' ? (
        <View style={layout.section}>
          {themesState.themes.map((item) => (
            <ThemeCard key={item.key} item={item} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Les 3 blocs, dans l'ordre de TRAINING_THEMES, même sans fiche.
 * `lastSessionDates` : jour de la dernière séance liée, par id de fiche ;
 * `today` : jour local lu en même temps que les données.
 */
function toThemeItems(
  rows: readonly SheetRow[],
  lastSessionDates: ReadonlyMap<string, string>,
  today: string,
): ThemeItem[] {
  return TRAINING_THEMES.map((theme) => {
    const themeRows = rows.filter((row) => sheetTheme(row) === theme.key);
    // Dernière séance du thème : la plus récente de ses fiches. YYYY-MM-DD se
    // compare comme du texte, dans l'ordre chronologique.
    let lastDate: string | null = null;
    for (const row of themeRows) {
      const date = lastSessionDates.get(row.id);
      if (date !== undefined && (lastDate === null || date > lastDate)) {
        lastDate = date;
      }
    }
    const parts = [
      formatCount(themeRows.length, theme.noun.singular, theme.noun.plural),
      `dernière fois : ${lastDate === null ? 'jamais' : relativeDay(lastDate, today)}`,
    ];
    return {
      key: theme.key,
      label: theme.label,
      details: parts.join(' · '),
      accessibilityLabel: [theme.label, ...parts].join(', '),
    };
  });
}

/** Pluriel français, 0 et 1 au singulier : « 1 fiche », « 2 fiches ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count}${NBSP}${count >= 2 ? plural : singular}`;
}

/** « Séance enregistrée : Tir. » ; « Séance enregistrée. » sans titre. */
function formatSavedMessage(savedTitle: string | undefined): string {
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const title = typeof savedTitle === 'string' ? savedTitle.trim() : '';
  return title === '' ? 'Séance enregistrée.' : `Séance enregistrée : ${title}.`;
}

/** Bloc d'un thème : titre, nombre de fiches et dernière séance ; tap → la liste de ses fiches. */
function ThemeCard({ item }: { item: ThemeItem }) {
  return (
    <Card
      accessibilityLabel={item.accessibilityLabel}
      onPress={() => router.push({ pathname: '/training/[theme]', params: { theme: item.key } })}
      style={styles.themeCard}
    >
      <View style={styles.themeText}>
        <Text style={text.title}>{item.label}</Text>
        <Text style={text.meta}>{item.details}</Text>
      </View>
      <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
    </Card>
  );
}

const styles = StyleSheet.create({
  /** Titre et détails à gauche, chevron à droite, centré sur la hauteur du bloc. */
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  themeText: {
    // Un titre ou un détail long passe à la ligne au lieu de pousser le chevron hors de la carte.
    flex: 1,
    gap: spacing.xs,
  },
});
