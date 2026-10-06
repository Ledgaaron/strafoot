import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildMonthGrid,
  dayOfMonth,
  formatMonthTitle,
  formatShortDay,
  isLocalDateString,
  localToday,
  monthBounds,
  monthOf,
  shiftMonth,
  type YearMonth,
} from '../../lib/dates';
import { listAnswerDays } from '../../lib/db/answers';
import { countSessions, listActiveDays, listSessionsForDay, type SessionRow } from '../../lib/db/sessions';
import { moduleLabel } from '../../lib/modules';
import { computeStreaks, type Streaks } from '../../lib/streak';

// Tout l'historique est chargé une fois par focus : la meilleure streak et le
// calendrier de n'importe quel mois en ont besoin, pas de rechargement par mois.
const HISTORY_START = '2000-01-01';

const PLACEHOLDER = '—';
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const TRAINING_COLOR = '#2e7d32';
const QUIZ_COLOR = '#1565c0';

type Summary = {
  trainingDays: ReadonlySet<string>;
  quizDays: ReadonlySet<string>;
  training: Streaks;
  quiz: Streaks;
  monthCount: number;
  totalCount: number;
};

type SummaryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: Summary };

/** `day` : jour auquel appartient la liste (ou l'erreur) gardée en état. */
type DaySessionsState =
  | { status: 'loading' }
  | { status: 'error'; day: string; message: string }
  | { status: 'ready'; day: string; sessions: SessionRow[] };

export default function HomeScreen() {
  const [today, setToday] = useState(localToday);
  const [selectedDay, setSelectedDay] = useState(today);
  const [displayedMonth, setDisplayedMonth] = useState(() => monthOf(today));
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'loading' });
  const [daySessions, setDaySessions] = useState<DaySessionsState>({ status: 'loading' });
  const { day, session } = useLocalSearchParams<{ day?: string; session?: string }>();

  // Retour d'un écran de séance : sélectionne le jour de la séance et affiche son mois.
  // `session` ne sert qu'à relancer l'effet quand le même jour revient.
  useEffect(() => {
    // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
    if (typeof day === 'string' && isLocalDateString(day)) {
      setSelectedDay(day);
      setDisplayedMonth(monthOf(day));
    }
  }, [day, session]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus : l'app peut rester ouverte après minuit.
      const today = localToday();
      setToday(today);
      Promise.all([
        listActiveDays({ from: HISTORY_START, to: today }),
        listAnswerDays({ from: HISTORY_START, to: today }),
        countSessions(monthBounds(monthOf(today))),
        countSessions(),
      ]).then(([sessionDays, answerDays, monthCount, totalCount]) => {
        if (!active) {
          return;
        }
        const errors = [sessionDays.error, answerDays.error, monthCount.error, totalCount.error].filter(
          (message) => message !== null,
        );
        if (errors.length > 0) {
          // Une même panne (réseau, session expirée) remonte souvent sur les quatre requêtes.
          setSummaryState({ status: 'error', message: [...new Set(errors)].join('\n') });
          return;
        }
        const trainingDays = new Set(sessionDays.data ?? []);
        const quizDays = new Set(answerDays.data ?? []);
        setSummaryState({
          status: 'ready',
          summary: {
            trainingDays,
            quizDays,
            training: computeStreaks(trainingDays, today),
            quiz: computeStreaks(quizDays, today),
            monthCount: monthCount.data ?? 0,
            totalCount: totalCount.data ?? 0,
          },
        });
      }).catch((exception: unknown) => {
        // Exception inattendue (ex. jour mal formé refusé par computeStreaks) : affichée, jamais avalée.
        if (active) {
          setSummaryState({
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
      let active = true;
      listSessionsForDay(selectedDay).then(({ data, error }) => {
        if (!active) {
          return;
        }
        setDaySessions(
          error !== null
            ? { status: 'error', day: selectedDay, message: error }
            : { status: 'ready', day: selectedDay, sessions: data ?? [] },
        );
      });
      return () => {
        active = false;
      };
    }, [selectedDay]),
  );

  const summary = summaryState.status === 'ready' ? summaryState.summary : null;
  // Liste d'un autre jour : le jour sélectionné vient de changer, chargement jusqu'à la sienne.
  // Au simple retour sur l'onglet, la liste du même jour reste affichée jusqu'à la réponse.
  const shownSessions: DaySessionsState =
    daySessions.status !== 'loading' && daySessions.day !== selectedDay ? { status: 'loading' } : daySessions;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.cards}>
        <StreakCard title="Entraînement" streaks={summary ? summary.training : null} />
        <StreakCard title="Quizz" streaks={summary ? summary.quiz : null} />
      </View>
      {summaryState.status === 'loading' ? <ActivityIndicator /> : null}
      {summaryState.status === 'error' ? (
        <Text style={styles.error}>Erreur : {summaryState.message}</Text>
      ) : null}

      <View style={styles.counters}>
        <Text style={styles.text}>
          Ce mois : {summary ? formatSessionCount(summary.monthCount) : PLACEHOLDER}
        </Text>
        <Text style={styles.text}>
          Total : {summary ? formatSessionCount(summary.totalCount) : PLACEHOLDER}
        </Text>
      </View>

      <Pressable
        role="button"
        onPress={() => router.push('/session/new')}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryButtonLabel}>Nouvelle séance</Text>
      </Pressable>

      <MonthCalendar
        month={displayedMonth}
        today={today}
        selectedDay={selectedDay}
        activity={summary}
        onShiftMonth={(months) => setDisplayedMonth((current) => shiftMonth(current, months))}
        onSelectDay={setSelectedDay}
      />

      <View style={styles.section}>
        <Text style={styles.heading}>Séances du {formatShortDay(selectedDay)}</Text>
        {shownSessions.status === 'loading' ? <ActivityIndicator /> : null}
        {shownSessions.status === 'error' ? (
          <Text style={styles.error}>Erreur : {shownSessions.message}</Text>
        ) : null}
        {shownSessions.status === 'ready' && shownSessions.sessions.length === 0 ? (
          <Text style={styles.text}>Aucune séance ce jour</Text>
        ) : null}
        {shownSessions.status === 'ready'
          ? shownSessions.sessions.map((row) => <SessionLine key={row.id} row={row} />)
          : null}
      </View>
    </ScrollView>
  );
}

/** Pluriel français : « 0 séance », « 1 séance », « 2 séances ». */
function formatSessionCount(count: number): string {
  return `${count} séance${count >= 2 ? 's' : ''}`;
}

function StreakCard({ title, streaks }: { title: string; streaks: Streaks | null }) {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{title}</Text>
      <Text style={styles.streak}>{streaks ? streaks.current : PLACEHOLDER}</Text>
      <Text style={styles.best}>meilleure : {streaks ? streaks.best : PLACEHOLDER}</Text>
    </View>
  );
}

type MonthCalendarProps = {
  month: YearMonth;
  today: string;
  selectedDay: string;
  /** Jours actifs ; null tant que le résumé n'est pas chargé (aucun point affiché). */
  activity: Pick<Summary, 'trainingDays' | 'quizDays'> | null;
  onShiftMonth: (months: number) => void;
  onSelectDay: (day: string) => void;
};

function MonthCalendar({ month, today, selectedDay, activity, onShiftMonth, onSelectDay }: MonthCalendarProps) {
  return (
    <View style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <Pressable
          role="button"
          accessibilityLabel="Mois précédent"
          onPress={() => onShiftMonth(-1)}
          style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
        >
          <Text style={styles.monthButtonLabel}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{formatMonthTitle(month)}</Text>
        <Pressable
          role="button"
          accessibilityLabel="Mois suivant"
          onPress={() => onShiftMonth(1)}
          style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
        >
          <Text style={styles.monthButtonLabel}>›</Text>
        </Pressable>
      </View>

      <View>
        <View style={styles.week}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <Text key={index} style={styles.weekday}>
              {initial}
            </Text>
          ))}
        </View>
        {buildMonthGrid(month).map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((cellDay, cellIndex) =>
              cellDay === null ? (
                <View key={cellIndex} style={styles.cell} />
              ) : (
                <DayCell
                  key={cellIndex}
                  day={cellDay}
                  isToday={cellDay === today}
                  isSelected={cellDay === selectedDay}
                  hasTraining={activity !== null && activity.trainingDays.has(cellDay)}
                  hasQuiz={activity !== null && activity.quizDays.has(cellDay)}
                  onPress={() => onSelectDay(cellDay)}
                />
              ),
            )}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={styles.text}>
          <Text style={styles.trainingText}>●</Text> Entraînement
        </Text>
        <Text style={styles.text}>
          <Text style={styles.quizText}>●</Text> Quizz
        </Text>
      </View>
    </View>
  );
}

type DayCellProps = {
  day: string;
  isToday: boolean;
  isSelected: boolean;
  hasTraining: boolean;
  hasQuiz: boolean;
  onPress: () => void;
};

function DayCell({ day, isToday, isSelected, hasTraining, hasQuiz, onPress }: DayCellProps) {
  const label = `${formatShortDay(day)}${hasTraining ? ', entraînement' : ''}${hasQuiz ? ', quizz' : ''}`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        isToday && styles.todayCell,
        isSelected && styles.selectedCell,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.text}>{dayOfMonth(day)}</Text>
      {/* Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent. */}
      <View style={styles.dots}>
        {hasTraining ? <View style={[styles.dot, styles.trainingDot]} /> : null}
        {hasQuiz ? <View style={[styles.dot, styles.quizDot]} /> : null}
      </View>
    </Pressable>
  );
}

function SessionLine({ row }: { row: SessionRow }) {
  const label = moduleLabel(row.module);
  return (
    <Pressable
      role="button"
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: row.id } })}
      style={({ pressed }) => [styles.sessionLine, pressed && styles.pressed]}
    >
      <Text style={styles.sessionName}>{row.name?.trim() || label}</Text>
      <Text style={styles.text}>{`${label} · ${row.duration_min} min · difficulté ${row.difficulty}/5`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  text: {
    fontSize: 16,
  },
  error: {
    color: '#b00020',
  },
  pressed: {
    opacity: 0.5,
  },
  cards: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  streak: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  best: {
    fontSize: 13,
  },
  counters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
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
  calendar: {
    gap: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthButton: {
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonLabel: {
    fontSize: 24,
  },
  monthTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    paddingVertical: 4,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCell: {
    borderWidth: 1,
  },
  selectedCell: {
    backgroundColor: '#e0e0e0',
  },
  dots: {
    height: 6,
    marginTop: 2,
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trainingDot: {
    backgroundColor: TRAINING_COLOR,
  },
  quizDot: {
    backgroundColor: QUIZ_COLOR,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
  trainingText: {
    color: TRAINING_COLOR,
  },
  quizText: {
    color: QUIZ_COLOR,
  },
  section: {
    gap: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sessionLine: {
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  sessionName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
