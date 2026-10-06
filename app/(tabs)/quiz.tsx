import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { localToday } from '../../lib/dates';
import { getQuizStats, listAnswerDays } from '../../lib/db/answers';
import { listEligibleQuestions, type QuestionFilter } from '../../lib/db/questions';
import { RUN_LENGTH } from '../../lib/quiz-select';
import {
  ALL_POSITIONS,
  MAX_OPTION_SCORE,
  POSITIONS,
  THEMES,
  type PositionKey,
  type ThemeKey,
} from '../../lib/quiz-taxonomy';
import { computeStreaks } from '../../lib/streak';

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
  const [statsState, setStatsState] = useState<StatsState>({ status: 'loading' });
  const [eligibleState, setEligibleState] = useState<EligibleState>({ status: 'loading' });
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
    }, []),
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
    }, [theme, position]),
  );

  const stats = statsState.status === 'ready' ? statsState.stats : null;
  // Décompte d'un autre filtre : le filtre vient de changer, chargement jusqu'au sien.
  // Au simple retour sur l'onglet, le décompte du même filtre reste affiché jusqu'à la réponse.
  const shownEligible: EligibleState =
    eligibleState.status !== 'loading' && !isSameFilter(eligibleState.filter, filter)
      ? { status: 'loading' }
      : eligibleState;
  const eligible = shownEligible.status === 'ready' ? shownEligible : null;
  const eligibleCount = eligible !== null ? eligible.count : 0;
  const canStart = eligibleCount > 0;
  // Moins de RUN_LENGTH questions éligibles : la série les prend toutes.
  const runLength = canStart ? Math.min(RUN_LENGTH, eligibleCount) : RUN_LENGTH;

  function changeFilter(next: FilterChoice) {
    lastFilter = next;
    setFilter(next);
  }

  function startRun() {
    // Mêmes champs que la requête du décompte : seuls les filtres choisis, jamais de valeur undefined.
    router.push({ pathname: '/quiz/run', params: toQuestionFilter(filter) });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.heading}>Statistiques</Text>
        <Text style={styles.text}>Questions répondues au total : {stats ? stats.total : PLACEHOLDER}</Text>
        <Text style={styles.text}>
          Score moyen sur 7 jours : {stats ? formatAverage(stats.last7DaysAvg) : PLACEHOLDER}
        </Text>
        <Text style={styles.text}>
          Streak quizz : {stats ? formatCount(stats.currentStreak, 'jour', 'jours') : PLACEHOLDER}
        </Text>
        {statsState.status === 'loading' ? <ActivityIndicator /> : null}
        {statsState.status === 'error' ? (
          <Text style={styles.error}>Erreur : {statsState.message}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Thème</Text>
        <View style={styles.wrapRow}>
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

      <View style={styles.section}>
        <Text style={styles.heading}>Poste</Text>
        <View style={styles.wrapRow}>
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

      <View style={styles.section}>
        <Text style={styles.heading}>Série</Text>
        {shownEligible.status === 'loading' ? <ActivityIndicator /> : null}
        {shownEligible.status === 'error' ? (
          <Text style={styles.error}>Erreur : {shownEligible.message}</Text>
        ) : null}
        {/* Sans filtre, il n'y a rien à élargir : aucune question n'est disponible. */}
        {eligible !== null && eligible.count === 0 ? (
          <Text style={styles.text}>
            {theme === null && position === null
              ? 'Aucune question disponible.'
              : 'Aucune question pour ce filtre. Élargis le thème ou le poste.'}
          </Text>
        ) : null}
        {eligible !== null && eligible.count > 0 ? (
          <Text style={styles.text}>{formatEligible(eligible.count, eligible.unseenCount)}</Text>
        ) : null}
        {eligible !== null && eligible.count > 0 && eligible.count < RUN_LENGTH ? (
          <Text style={styles.text}>
            {`Moins de ${RUN_LENGTH} questions éligibles : la série en comptera ${eligible.count}.`}
          </Text>
        ) : null}
        <Pressable
          role="button"
          aria-disabled={!canStart}
          disabled={!canStart}
          onPress={startRun}
          style={({ pressed }) => [styles.primaryButton, (pressed || !canStart) && styles.dimmed]}
        >
          <Text style={styles.primaryButtonLabel}>Lancer une série de {runLength}</Text>
        </Pressable>
      </View>
    </ScrollView>
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

/** Pluriel français, 0 et 1 au singulier : « 1 jour », « 2 jours ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count >= 2 ? plural : singular}`;
}

/** « 12 questions éligibles, dont 5 jamais vues » */
function formatEligible(count: number, unseenCount: number): string {
  const eligibleText = formatCount(count, 'question éligible', 'questions éligibles');
  const unseenText = formatCount(unseenCount, 'jamais vue', 'jamais vues');
  return `${eligibleText}, dont ${unseenText}`;
}

/**
 * « 2,3/3 » ; « — » sans réponse. Virgule écrite à la main : Intl ne rend pas la
 * même chose sur web et sur Hermes.
 */
function formatAverage(average: number | null): string {
  if (average === null) {
    return PLACEHOLDER;
  }
  return `${average.toFixed(1).replace('.', ',')}/${MAX_OPTION_SCORE}`;
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Puce de choix : fond sombre si sélectionnée, bordure seule sinon. Copie de la
 * puce privée de components/session-form.tsx.
 */
function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.dimmed]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
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
    fontWeight: 'bold',
  },
  text: {
    fontSize: 16,
  },
  error: {
    color: '#b00020',
  },
  dimmed: {
    opacity: 0.5,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#222',
    borderColor: '#222',
  },
  chipLabel: {
    fontSize: 16,
  },
  chipLabelSelected: {
    color: '#fff',
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
