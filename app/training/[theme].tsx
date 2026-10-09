import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { askAboutActiveSession, openActiveSession, useActiveSession } from '../../lib/active-session-context';
import { localToday, relativeDay } from '../../lib/dates';
import { listLastSessionDates, listSheets, type SheetRow } from '../../lib/db/training';
import type { SheetKind } from '../../lib/sheet-types';
import { colors, layout, radius, size, spacing, text } from '../../lib/theme';
import { getTrainingTheme, isTrainingThemeKey, sheetTheme, type TrainingThemeKey } from '../../lib/training-themes';

/** Espace insécable : un nombre et son unité restent sur la même ligne (« 45 min »). */
const NBSP = ' ';

/** Fiche ou test prêt à afficher : une carte tappable de la liste. */
type SheetItem = {
  id: string;
  kind: SheetKind;
  title: string;
  /** « 45 min · tir · dernière fois : auj. » : l'essentiel, ni sous-titre ni nombre de mesures. */
  details: string;
  /** Tout le contenu de la carte, lu par le lecteur d'écran. */
  accessibilityLabel: string;
};

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: SheetItem[] };

/** theme : segment d'URL, une clé de TRAINING_THEMES (tests, specifique, recuperation). */
type ThemeParams = { theme?: string };

export default function TrainingThemeScreen() {
  const { theme } = useLocalSearchParams<ThemeParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const themeKey = typeof theme === 'string' && isTrainingThemeKey(theme) ? theme : null;

  if (themeKey === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Entraînement' }} />
        <Screen>
          <EmptyState
            title="Thème introuvable"
            message="Choisis un thème sur l’onglet Entraînement."
            action={{ label: 'Retour', onPress: leaveUnknownTheme }}
          />
        </Screen>
      </>
    );
  }
  // key : un autre thème repart d'un état neuf (liste, erreur de démarrage).
  return <ThemeSheets key={themeKey} themeKey={themeKey} />;
}

/** Thème inconnu (lien retouché à la main) : écran précédent ; sans historique, l'onglet Entraînement. */
function leaveUnknownTheme() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/training');
  }
}

/** Fiches d'un thème : lecture au tap sur la carte, séance chronométrée par le ▶ à sa droite. */
function ThemeSheets({ themeKey }: { themeKey: TrainingThemeKey }) {
  const theme = getTrainingTheme(themeKey);
  const { kind } = theme;
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);
  const activeSession = useActiveSession();
  // Échec de mémorisation au démarrage par ▶ : rien n'a démarré.
  const [startError, setStartError] = useState<string | null>(null);
  // Garde synchrone : deux ▶ rapprochés ne démarrent qu'une séance.
  const startingRef = useRef(false);

  // loadCount en dépendance : « Réessayer » donne un nouveau callback, rejoué
  // aussitôt puisque l'écran a le focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Pas de retour à « chargement » au focus : au retour d'une fiche, la liste
      // précédente reste affichée jusqu'à la réponse. Seul « Réessayer » y repasse.
      Promise.all([listSheets({ kind }), listLastSessionDates()])
        .then(([sheets, lastDates]) => {
          if (!active) {
            return;
          }
          const errors = [sheets.error, lastDates.error].filter((message) => message !== null);
          if (errors.length > 0) {
            // Une même panne (réseau, session expirée) remonte souvent sur les deux requêtes.
            setListState({ status: 'error', message: [...new Set(errors)].join('\n') });
            return;
          }
          const lastSessionDates = lastDates.data ?? new Map<string, string>();
          // Libellés calculés ici avec le `today` de la lecture, pas au rendu : une
          // exception (jour mal formé refusé par relativeDay) part dans le catch.
          setListState({
            status: 'ready',
            items: (sheets.data ?? [])
              // Entraînements spécifiques et Récupération se partagent les fiches de lecture.
              .filter((row) => sheetTheme(row) === themeKey)
              .map((row) => toSheetItem(row, kind, themeKey, lastSessionDates, today)),
          });
        })
        .catch((exception: unknown) => {
          // Exception inattendue : affichée, jamais avalée.
          if (active) {
            setListState({
              status: 'error',
              message: exception instanceof Error ? exception.message : String(exception),
            });
          }
        });
      return () => {
        active = false;
      };
    }, [kind, themeKey, loadCount]),
  );

  function reload() {
    setListState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  /**
   * ▶ : démarre la fiche et l'ouvre au premier exercice ; reprend celle-ci si
   * elle est déjà en cours ; une autre en cours : Reprendre / Terminer l'autre
   * d'abord / Annuler.
   */
  async function startSheet(item: SheetItem) {
    // Relecture de la séance mémorisée pas finie (premières millisecondes) : rien à décider encore.
    if (activeSession.loading || startingRef.current) {
      return;
    }
    const current = activeSession.session;
    if (current !== null) {
      if (current.sheetId === item.id) {
        openActiveSession(current, 'push');
      } else {
        askAboutActiveSession(current, 'push');
      }
      return;
    }
    startingRef.current = true;
    setStartError(null);
    const error = await activeSession.start({ sheetId: item.id, kind: item.kind, title: item.title });
    startingRef.current = false;
    if (error !== null) {
      setStartError(`« ${item.title} » n’a pas démarré. ${error}`);
      return;
    }
    router.push({ pathname: '/sheet/[id]', params: { id: item.id } });
  }

  return (
    <>
      {/* En-tête natif : le nom du thème, flèche retour vers l'onglet. */}
      <Stack.Screen options={{ title: theme.label }} />
      <Screen>
        <FieldError message={startError} />
        {listState.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {listState.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${listState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {/* État vide sans bouton : fiches et tests viennent du seed SQL, exécuté hors de l'app. */}
        {listState.status === 'ready' && listState.items.length === 0 ? (
          <EmptyState title={theme.empty.title} message={theme.empty.message} />
        ) : null}
        {listState.status === 'ready' && listState.items.length > 0 ? (
          <View style={layout.section}>
            {listState.items.map((item) => (
              <SheetCard key={item.id} item={item} onStart={() => startSheet(item)} />
            ))}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

/**
 * Carte d'une fiche ou d'un test : durée, compétence, dernière séance.
 * `lastSessionDates` : jour de la dernière séance liée, par id de fiche ;
 * `today` : jour local lu en même temps que les données.
 */
function toSheetItem(
  row: SheetRow,
  kind: SheetKind,
  themeKey: TrainingThemeKey,
  lastSessionDates: ReadonlyMap<string, string>,
  today: string,
): SheetItem {
  const lastDate = lastSessionDates.get(row.id);
  const details = [
    `${row.duration_min}${NBSP}min`,
    // En Récupération, la compétence est le thème lui-même (clé « recuperation ») : rien à apprendre.
    ...(themeKey === 'recuperation' ? [] : [row.skill]),
    `dernière fois : ${lastDate === undefined ? 'jamais' : relativeDay(lastDate, today)}`,
  ];
  return {
    id: row.id,
    kind,
    title: row.title,
    details: details.join(' · '),
    accessibilityLabel: [row.title, ...details].join(', '),
  };
}

/**
 * Carte (lecture de la fiche) et ▶ à sa droite (démarrer la séance) : deux
 * cibles voisines, jamais l'une dans l'autre, chacune avec son état pressé.
 */
function SheetCard({ item, onStart }: { item: SheetItem; onStart: () => void }) {
  return (
    <View style={styles.cardRow}>
      <Card
        accessibilityLabel={item.accessibilityLabel}
        onPress={() => router.push({ pathname: '/sheet/[id]', params: { id: item.id } })}
        style={styles.card}
      >
        <Text style={text.bodyStrong}>{item.title}</Text>
        <Text style={text.meta}>{item.details}</Text>
      </Card>
      <Pressable
        role="button"
        accessibilityLabel={`Démarrer : ${item.title}`}
        onPress={onStart}
        style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
      >
        <Ionicons name="play" size={size.icon} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Carte et ▶ côte à côte, 8 px entre les deux cibles ; ▶ prend la hauteur de la carte. */
  cardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
  },
  startButton: {
    width: size.touch,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  startButtonPressed: {
    backgroundColor: colors.surfacePressed,
  },
});
