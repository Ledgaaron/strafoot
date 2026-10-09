import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { StartRow } from '../../components/start-row';
import { askAboutActiveSession, openActiveSession, useActiveSession } from '../../lib/active-session-context';
import { localToday, relativeDay } from '../../lib/dates';
import { listLastSessionDates, listSheets, type SheetRow } from '../../lib/db/training';
import { colors, layout, text } from '../../lib/theme';
import { isTrainingThemeKey, sheetTheme, TRAINING_THEMES, type TrainingThemeKey } from '../../lib/training-themes';

/** Espace insécable : un nombre et son unité restent sur la même ligne (« 45 min »). */
const NBSP = ' ';

/** Fiche prête à afficher : une carte tappable de la liste. */
type SheetItem = {
  id: string;
  title: string;
  /** « 45 min · tir · dernière fois : auj. » : l'essentiel, ni sous-titre ni nombre de mesures. */
  details: string;
  /** Tout le contenu de la carte, lu par le lecteur d'écran. */
  accessibilityLabel: string;
};

/** Un thème de la liste fermée, sa clé typée. */
type ThemeEntry = (typeof TRAINING_THEMES)[number];

/** Un thème et ses fiches ; sans fiche, son état vide. */
type ThemeSection = { theme: ThemeEntry; items: SheetItem[] };

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; sections: ThemeSection[] };

/** theme : segment d'URL, une clé de TRAINING_THEMES (specifique, recuperation) : la section affichée en premier. */
type ThemeParams = { theme?: string };

export default function TrainingThemeScreen() {
  const { theme } = useLocalSearchParams<ThemeParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const themeKey = typeof theme === 'string' && isTrainingThemeKey(theme) ? theme : null;

  if (themeKey === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Fiches' }} />
        <Screen>
          <EmptyState
            title="Thème introuvable"
            message="Ouvre les fiches depuis la carte Fiches du Profil."
            action={{ label: 'Retour', onPress: leaveUnknownTheme }}
          />
        </Screen>
      </>
    );
  }
  // key : un autre thème repart d'un état neuf (liste, erreur de démarrage).
  return <ThemeSheets key={themeKey} themeKey={themeKey} />;
}

/** Thème inconnu (lien retouché à la main) : écran précédent ; sans historique, l'onglet Profil. */
function leaveUnknownTheme() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/profile');
  }
}

/**
 * Fiches de lecture, ouvertes par la carte Fiches du Profil : une section par
 * thème, celle de themeKey d'abord (Entraînements spécifiques, puis
 * Récupération, vide en attendant son contenu). Lecture au tap sur la carte,
 * séance chronométrée par le ▶ à sa droite.
 */
function ThemeSheets({ themeKey }: { themeKey: TrainingThemeKey }) {
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
      Promise.all([listSheets({ kind: 'training' }), listLastSessionDates()])
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
          const rows = sheets.data ?? [];
          const lastSessionDates = lastDates.data ?? new Map<string, string>();
          // Libellés calculés ici avec le `today` de la lecture, pas au rendu : une
          // exception (jour mal formé refusé par relativeDay) part dans le catch.
          setListState({
            status: 'ready',
            sections: orderedThemes(themeKey).map((theme) => ({
              theme,
              items: rows
                // Entraînements spécifiques et Récupération se partagent les fiches de lecture.
                .filter((row) => sheetTheme(row) === theme.key)
                .map((row) => toSheetItem(row, theme.key, lastSessionDates, today)),
            })),
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
    }, [themeKey, loadCount]),
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
      if (current.kind === 'training' && current.sheetId === item.id) {
        openActiveSession(current, 'push');
      } else {
        askAboutActiveSession(current, 'push');
      }
      return;
    }
    startingRef.current = true;
    setStartError(null);
    const error = await activeSession.start({ kind: 'training', sheetId: item.id, title: item.title });
    startingRef.current = false;
    if (error !== null) {
      setStartError(`« ${item.title} » n’a pas démarré. ${error}`);
      return;
    }
    router.push({ pathname: '/sheet/[id]', params: { id: item.id } });
  }

  return (
    <>
      {/* En-tête natif : « Fiches », comme la carte du Profil ; flèche retour vers lui. */}
      <Stack.Screen options={{ title: 'Fiches' }} />
      <Screen>
        <FieldError message={startError} />
        {listState.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {listState.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${listState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {listState.status === 'ready'
          ? listState.sections.map(({ theme, items }) => (
              <View key={theme.key} style={layout.section}>
                <Text role="heading" style={text.title}>
                  {theme.label}
                </Text>
                {/* État vide sans bouton : les fiches viennent du seed SQL, exécuté hors de l'app. */}
                {items.length === 0 ? <EmptyState title={theme.empty.title} message={theme.empty.message} /> : null}
                {items.map((item) => (
                  <StartRow
                    key={item.id}
                    title={item.title}
                    details={item.details}
                    accessibilityLabel={item.accessibilityLabel}
                    onPress={() => router.push({ pathname: '/sheet/[id]', params: { id: item.id } })}
                    onStart={() => startSheet(item)}
                  />
                ))}
              </View>
            ))
          : null}
      </Screen>
    </>
  );
}

/** Thèmes de TRAINING_THEMES, celui demandé d'abord, les autres dans leur ordre. */
function orderedThemes(first: TrainingThemeKey): ThemeEntry[] {
  return [
    ...TRAINING_THEMES.filter((theme) => theme.key === first),
    ...TRAINING_THEMES.filter((theme) => theme.key !== first),
  ];
}

/**
 * Carte d'une fiche : durée, compétence, dernière séance.
 * `lastSessionDates` : jour de la dernière séance liée, par id de fiche ;
 * `today` : jour local lu en même temps que les données.
 */
function toSheetItem(
  row: SheetRow,
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
    title: row.title,
    details: details.join(' · '),
    accessibilityLabel: [row.title, ...details].join(', '),
  };
}
