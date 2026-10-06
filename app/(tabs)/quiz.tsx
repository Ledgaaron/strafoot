import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Chip } from '../../components/chip';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { Stat } from '../../components/stat';
import { localToday } from '../../lib/dates';
import { getQuizStats, listAnswerDays } from '../../lib/db/answers';
import { listEligibleQuestions, type QuestionFilter } from '../../lib/db/questions';
import { RUN_LENGTH } from '../../lib/quiz-select';
import {
  ALL_POSITIONS,
  MAX_OPTION_SCORE,
  positionLabel,
  POSITIONS,
  themeLabel,
  THEMES,
  type PositionKey,
  type ThemeKey,
} from '../../lib/quiz-taxonomy';
import { computeStreaks } from '../../lib/streak';
import { colors, layout, size, spacing, text } from '../../lib/theme';

// Toutes les réponses depuis le début : la streak courante n'a pas de limite de durée.
const HISTORY_START = '2000-01-01';

const PLACEHOLDER = '—';

// 'tous' marque une question valable pour tous les postes, ce n'est pas un filtre :
// la puce « Tous postes » (aucun filtre de poste) en tient lieu.
const POSITION_FILTERS = POSITIONS.filter((entry) => entry.key !== ALL_POSITIONS);

/** Filtre choisi à l'écran ; null : « Tous » ou « Tous postes », aucun filtre. */
type FilterChoice = {
  theme: ThemeKey | null;
  position: PositionKey | null;
};

// Dernier filtre choisi : survit au démontage de l'écran tant que l'app tourne, jamais
// persisté. Lu pour l'état initial, mis à jour à chaque changement.
let lastFilter: FilterChoice = { theme: null, position: null };

type Stats = {
  total: number;
  last7DaysAvg: number | null;
  currentStreak: number;
};

type StatsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stats: Stats };

/** `filter` : filtre auquel appartient le décompte (ou l'erreur) gardé en état. */
type EligibleState =
  | { status: 'loading' }
  | { status: 'error'; filter: FilterChoice; message: string }
  | { status: 'ready'; filter: FilterChoice; count: number; unseenCount: number };

export default function QuizScreen() {
  const [filter, setFilter] = useState<FilterChoice>(() => lastFilter);
  // Repliés à chaque montage : le résumé de la carte suffit à lire le filtre courant.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsState, setStatsState] = useState<StatsState>({ status: 'loading' });
  const [eligibleState, setEligibleState] = useState<EligibleState>({ status: 'loading' });
  // Incrémentés par « Réessayer » : relancent la requête de leur bloc.
  const [statsLoadCount, setStatsLoadCount] = useState(0);
  const [eligibleLoadCount, setEligibleLoadCount] = useState(0);
  const { theme, position } = filter;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus : l'app peut rester ouverte après minuit.
      const today = localToday();
      Promise.all([getQuizStats(), listAnswerDays({ from: HISTORY_START, to: today })])
        .then(([quizStats, answerDays]) => {
          if (!active) {
            return;
          }
          const errors = [quizStats.error, answerDays.error].filter((message) => message !== null);
          if (errors.length > 0) {
            // Une même panne (réseau, session expirée) remonte souvent sur les deux requêtes.
            setStatsState({ status: 'error', message: [...new Set(errors)].join('\n') });
            return;
          }
          if (!quizStats.data) {
            setStatsState({
              status: 'error',
              message: 'Supabase n’a renvoyé ni les statistiques ni d’erreur.',
            });
            return;
          }
          setStatsState({
            status: 'ready',
            stats: {
              total: quizStats.data.total,
              last7DaysAvg: quizStats.data.last7DaysAvg,
              currentStreak: computeStreaks(new Set(answerDays.data ?? []), today).current,
            },
          });
        })
        .catch((exception: unknown) => {
          // Exception inattendue (ex. jour mal formé refusé par computeStreaks) : affichée, jamais avalée.
          if (active) {
            setStatsState({
              status: 'error',
              message: exception instanceof Error ? exception.message : String(exception),
            });
          }
        });
      return () => {
        active = false;
      };
    }, [statsLoadCount]),
  );

  useFocusEffect(
    useCallback(() => {
      // Changer de filtre ou quitter l'onglet désactive la requête en cours : la réponse
      // d'un ancien filtre n'écrase jamais l'état du filtre courant.
      let active = true;
      const requested: FilterChoice = { theme, position };
      listEligibleQuestions(toQuestionFilter(requested)).then(({ data, error }) => {
        if (!active) {
          return;
        }
        if (error !== null) {
          setEligibleState({ status: 'error', filter: requested, message: error });
          return;
        }
        const questions = data ?? [];
        setEligibleState({
          status: 'ready',
          filter: requested,
          count: questions.length,
          unseenCount: questions.filter((question) => question.lastAnsweredAt === null).length,
        });
      });
      return () => {
        active = false;
      };
    }, [theme, position, eligibleLoadCount]),
  );

  const stats = statsState.status === 'ready' ? statsState.stats : null;
  const average = stats ? stats.last7DaysAvg : null;
  // Décompte d'un autre filtre : le filtre vient de changer, chargement jusqu'au sien.
  // Au simple retour sur l'onglet, le décompte du même filtre reste affiché jusqu'à la réponse.
  const shownEligible: EligibleState =
    eligibleState.status !== 'loading' && !isSameFilter(eligibleState.filter, filter)
      ? { status: 'loading' }
      : eligibleState;
  const eligible = shownEligible.status === 'ready' ? shownEligible : null;
  const eligibleCount = eligible !== null ? eligible.count : 0;
  const canStart = eligibleCount > 0;
  const filterSummary = formatFilter(filter);

  function changeFilter(next: FilterChoice) {
    lastFilter = next;
    setFilter(next);
  }

  function startRun() {
    // Mêmes champs que la requête du décompte : seuls les filtres choisis, jamais de valeur undefined.
    router.push({ pathname: '/quiz/run', params: toQuestionFilter(filter) });
  }

  function retryStats() {
    setStatsState({ status: 'loading' });
    setStatsLoadCount((count) => count + 1);
  }

  function retryEligible() {
    setEligibleState({ status: 'loading' });
    setEligibleLoadCount((count) => count + 1);
  }

  return (
    <Screen title="Quizz" footer={<Button label="Lancer une série" onPress={startRun} disabled={!canStart} />}>
      <View style={layout.section}>
        {/* Sans carte : une carte porte un seul chiffre, et trois ne tiennent pas en largeur. */}
        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Stat label="Répondues" value={stats ? stats.total : PLACEHOLDER} />
          </View>
          <View style={styles.statCell}>
            <Stat
              label="Moyenne 7 j"
              value={formatAverage(average)}
              unit={average !== null ? `/${MAX_OPTION_SCORE}` : undefined}
            />
          </View>
          <View style={styles.statCell}>
            <Stat
              label="Streak"
              value={stats ? stats.currentStreak : PLACEHOLDER}
              unit={stats ? pluralize(stats.currentStreak, 'jour', 'jours') : undefined}
              tone="quiz"
            />
          </View>
        </View>
        {statsState.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {statsState.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${statsState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retryStats} />
          </>
        ) : null}
      </View>

      <View style={layout.section}>
        <Card
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityLabel={`Filtres : ${filterSummary}`}
          style={styles.filterHeader}
        >
          <View style={styles.filterText}>
            <Text style={text.bodyStrong}>Filtres</Text>
            <Text style={text.meta}>{filterSummary}</Text>
          </View>
          <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={size.icon} color={colors.textMuted} />
        </Card>
        {filtersOpen ? (
          <Card style={styles.filterPanel}>
            <View style={layout.section}>
              <Text style={text.overline}>Thème</Text>
              <View style={layout.chipRow}>
                <Chip
                  label="Tous"
                  accessibilityLabel="Tous les thèmes"
                  selected={theme === null}
                  onPress={() => changeFilter({ theme: null, position })}
                />
                {THEMES.map((entry) => (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    selected={entry.key === theme}
                    onPress={() => changeFilter({ theme: entry.key, position })}
                  />
                ))}
              </View>
            </View>
            <View style={layout.section}>
              <Text style={text.overline}>Poste</Text>
              <View style={layout.chipRow}>
                <Chip
                  label="Tous postes"
                  selected={position === null}
                  onPress={() => changeFilter({ theme, position: null })}
                />
                {POSITION_FILTERS.map((entry) => (
                  <Chip
                    key={entry.key}
                    label={entry.label}
                    selected={entry.key === position}
                    onPress={() => changeFilter({ theme, position: entry.key })}
                  />
                ))}
              </View>
            </View>
          </Card>
        ) : null}

        {shownEligible.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {shownEligible.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${shownEligible.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retryEligible} />
          </>
        ) : null}
        {/* Sans filtre, rien à élargir : le contenu du quizz vient du seed, aucun bouton n'y remédie. */}
        {eligible !== null && eligible.count === 0 ? (
          theme === null && position === null ? (
            <EmptyState
              title="Aucune question disponible"
              message="Le contenu du quizz n’est pas encore chargé dans la base."
            />
          ) : (
            // Le pied est alors désactivé : « Retirer les filtres » reste la seule action principale active.
            <EmptyState
              title="Aucune question pour ce filtre"
              message="Élargis le thème ou le poste."
              action={{ label: 'Retirer les filtres', onPress: () => changeFilter({ theme: null, position: null }) }}
            />
          )
        ) : null}
        {eligible !== null && eligible.count > 0 ? (
          <View>
            <Text style={text.meta}>{formatEligible(eligible.count, eligible.unseenCount)}</Text>
            {eligible.count < RUN_LENGTH ? (
              <Text style={text.meta}>
                {`Moins de ${RUN_LENGTH} questions éligibles : la série en comptera ${eligible.count}.`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** Filtre de la requête et paramètres de route : seulement les champs choisis (absent = pas de filtre). */
function toQuestionFilter({ theme, position }: FilterChoice): QuestionFilter {
  const result: QuestionFilter = {};
  if (theme !== null) {
    result.theme = theme;
  }
  if (position !== null) {
    result.position = position;
  }
  return result;
}

function isSameFilter(a: FilterChoice, b: FilterChoice): boolean {
  return a.theme === b.theme && a.position === b.position;
}

/** « Tactique · Tous postes » : le filtre courant, lisible les filtres repliés. */
function formatFilter({ theme, position }: FilterChoice): string {
  const themeText = theme === null ? 'Tous' : themeLabel(theme);
  const positionText = position === null ? 'Tous postes' : positionLabel(position);
  return `${themeText} · ${positionText}`;
}

/** Pluriel français, 0 et 1 au singulier : « jour », « jours ». */
function pluralize(count: number, singular: string, plural: string): string {
  return count >= 2 ? plural : singular;
}

/** Nombre et son mot : « 1 jour », « 2 jours ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

/** « 12 questions éligibles, dont 5 jamais vues » */
function formatEligible(count: number, unseenCount: number): string {
  const eligibleText = formatCount(count, 'question éligible', 'questions éligibles');
  const unseenText = formatCount(unseenCount, 'jamais vue', 'jamais vues');
  return `${eligibleText}, dont ${unseenText}`;
}

/**
 * « 2,3 » (l'unité « /3 » est posée à part) ; « — » sans réponse. Virgule écrite à
 * la main : Intl ne rend pas la même chose sur web et sur Hermes.
 */
function formatAverage(average: number | null): string {
  if (average === null) {
    return PLACEHOLDER;
  }
  return average.toFixed(1).replace('.', ',');
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCell: {
    flex: 1,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  filterText: {
    flex: 1,
  },
  filterPanel: {
    gap: spacing.xl,
  },
});
