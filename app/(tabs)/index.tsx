import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { Stat, type StatTone } from '../../components/stat';
import {
  buildMonthGrid,
  dayOfMonth,
  formatMonthTitle,
  formatShortDay,
  isLocalDateString,
  localToday,
  monthBounds,
  monthOf,
  relativeDay,
  shiftMonth,
  type YearMonth,
} from '../../lib/dates';
import { listAnswerDays } from '../../lib/db/answers';
import { countSessions, listActiveDays, listSessionsForDay, type SessionRow } from '../../lib/db/sessions';
import { moduleLabel } from '../../lib/modules';
import { computeStreaks, type Streaks } from '../../lib/streak';
import { colors, layout, radius, size, spacing, text } from '../../lib/theme';

// Tout l'historique est chargé une fois par focus : la meilleure streak et le
// calendrier de n'importe quel mois en ont besoin, pas de rechargement par mois.
const HISTORY_START = '2000-01-01';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son unité en fin de ligne (« 12 jours »). */
const NBSP = ' ';
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

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
  // Incrémentés par « Réessayer » : seul rôle, relancer l'effet de chargement correspondant.
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [daySessionsAttempt, setDaySessionsAttempt] = useState(0);
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
    }, [summaryAttempt]),
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
    }, [selectedDay, daySessionsAttempt]),
  );

  function retrySummary() {
    setSummaryState({ status: 'loading' });
    setSummaryAttempt((attempt) => attempt + 1);
  }

  function retryDaySessions() {
    setDaySessions({ status: 'loading' });
    setDaySessionsAttempt((attempt) => attempt + 1);
  }

  const summary = summaryState.status === 'ready' ? summaryState.summary : null;
  // Liste d'un autre jour : le jour sélectionné vient de changer, chargement jusqu'à la sienne.
  // Au simple retour sur l'onglet, la liste du même jour reste affichée jusqu'à la réponse.
  const shownSessions: DaySessionsState =
    daySessions.status !== 'loading' && daySessions.day !== selectedDay ? { status: 'loading' } : daySessions;

  return (
    <Screen
      title="Accueil"
      footer={<Button label="Nouvelle séance" onPress={() => router.push('/session/new')} />}
    >
      <View style={layout.section}>
        <View style={styles.streakRow}>
          <StreakCard label="Entraînement" tone="accent" streaks={summary ? summary.training : null}>
            <Text style={text.meta}>ce mois : {summary ? formatSessionCount(summary.monthCount) : PLACEHOLDER}</Text>
            <Text style={text.meta}>total : {summary ? formatSessionCount(summary.totalCount) : PLACEHOLDER}</Text>
          </StreakCard>
          <StreakCard label="Quizz" tone="quiz" streaks={summary ? summary.quiz : null} />
        </View>
        {summaryState.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {summaryState.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${summaryState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retrySummary} />
          </>
        ) : null}
      </View>

      <MonthCalendar
        month={displayedMonth}
        today={today}
        selectedDay={selectedDay}
        activity={summary}
        onShiftMonth={(months) => setDisplayedMonth((current) => shiftMonth(current, months))}
        onSelectDay={setSelectedDay}
      />

      <View style={layout.section}>
        <Text role="heading" style={text.title}>
          Séances · {relativeDay(selectedDay, today)}
        </Text>
        {shownSessions.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {shownSessions.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${shownSessions.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retryDaySessions} />
          </>
        ) : null}
        {shownSessions.status === 'ready' && shownSessions.sessions.length === 0 ? (
          // Pas de bouton ici : le pied de l'écran porte déjà « Nouvelle séance ».
          <EmptyState
            title="Aucune séance ce jour"
            message="Ajoute-la avec « Nouvelle séance », en bas de l’écran."
          />
        ) : null}
        {shownSessions.status === 'ready'
          ? shownSessions.sessions.map((row) => <SessionCard key={row.id} row={row} today={today} />)
          : null}
      </View>
    </Screen>
  );
}

/** Pluriel français : « 0 jour », « 1 jour », « 2 jours ». */
function dayUnit(count: number): string {
  return count >= 2 ? 'jours' : 'jour';
}

function formatDayCount(count: number): string {
  return `${count}${NBSP}${dayUnit(count)}`;
}

/** Pluriel français : « 0 séance », « 1 séance », « 2 séances ». */
function formatSessionCount(count: number): string {
  return `${count}${NBSP}séance${count >= 2 ? 's' : ''}`;
}

type StreakCardProps = {
  label: string;
  tone: StatTone;
  /** null tant que le résumé n'est pas chargé : « — », sans unité. */
  streaks: Streaks | null;
  /** Lignes secondaires sous la meilleure streak. */
  children?: ReactNode;
};

/** Streak courante en chiffre dominant ; meilleure et compteurs en secondaire. */
function StreakCard({ label, tone, streaks, children }: StreakCardProps) {
  return (
    <Card style={styles.streakCard}>
      <Stat
        label={label}
        value={streaks ? streaks.current : PLACEHOLDER}
        unit={streaks ? dayUnit(streaks.current) : undefined}
        tone={tone}
      />
      <View>
        <Text style={text.meta}>meilleure : {streaks ? formatDayCount(streaks.best) : PLACEHOLDER}</Text>
        {children}
      </View>
    </Card>
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
    <Card>
      <View style={styles.calendarHeader}>
        <MonthArrow icon="chevron-back" label="Mois précédent" onPress={() => onShiftMonth(-1)} />
        <Text style={[text.title, styles.monthTitle]}>{formatMonthTitle(month)}</Text>
        <MonthArrow icon="chevron-forward" label="Mois suivant" onPress={() => onShiftMonth(1)} />
      </View>

      <View>
        <View style={styles.week}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <Text key={index} style={[text.meta, styles.weekday]}>
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
        <Text style={text.meta}>
          <Text style={styles.trainingMark}>●</Text> Entraînement
        </Text>
        <Text style={text.meta}>
          <Text style={styles.quizMark}>●</Text> Quizz
        </Text>
      </View>
    </Card>
  );
}

type MonthArrowProps = {
  icon: 'chevron-back' | 'chevron-forward';
  /** Lu par le lecteur d'écran : l'icône seule n'a pas de nom. */
  label: string;
  onPress: () => void;
};

function MonthArrow({ icon, label, onPress }: MonthArrowProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.monthArrow, pressed && styles.monthArrowPressed]}
    >
      <Ionicons name={icon} size={size.icon} color={colors.text} />
    </Pressable>
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
        pressed && styles.pressedCell,
      ]}
    >
      <Text style={[text.body, text.tabular]}>{dayOfMonth(day)}</Text>
      {/* Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent.
          Deux places fixes, entraînement à gauche, quizz à droite (ordre de la légende) :
          les deux oranges sont proches, la place les distingue. */}
      <View style={styles.dots}>
        <View style={[styles.dot, hasTraining && styles.trainingDot]} />
        <View style={[styles.dot, hasQuiz && styles.quizDot]} />
      </View>
    </Pressable>
  );
}

function SessionCard({ row, today }: { row: SessionRow; today: string }) {
  const label = moduleLabel(row.module);
  const name = row.name?.trim() || label;
  const details = [
    label,
    `${row.duration_min}${NBSP}min`,
    `difficulté ${row.difficulty}/5`,
    relativeDay(row.date, today),
  ].join(' · ');
  return (
    <Card
      accessibilityLabel={`${name}, ${details}`}
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: row.id } })}
    >
      <Text style={text.bodyStrong}>{name}</Text>
      <Text style={text.meta}>{details}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  streakRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  streakCard: {
    flex: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthArrow: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.surface2,
  },
  monthArrowPressed: {
    backgroundColor: colors.border,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  // Sept colonnes sans écart : chaque case garde toute la largeur disponible.
  cell: {
    flex: 1,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    // Bordure toujours présente, transparente : celle d'aujourd'hui ne décale rien.
    borderWidth: size.border,
    borderColor: 'transparent',
  },
  todayCell: {
    borderColor: colors.accent,
  },
  selectedCell: {
    backgroundColor: colors.surface2,
  },
  pressedCell: {
    backgroundColor: colors.border,
  },
  dots: {
    height: size.dot,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: size.dot / 2,
  },
  trainingDot: {
    backgroundColor: colors.accent,
  },
  quizDot: {
    backgroundColor: colors.quiz,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  trainingMark: {
    color: colors.accent,
  },
  quizMark: {
    color: colors.quiz,
  },
});
