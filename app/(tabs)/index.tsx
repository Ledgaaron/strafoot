import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { IconButton } from '../../components/icon-button';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { Stat, type StatTone } from '../../components/stat';
import {
  dayOfMonth,
  formatShortDay,
  formatWeekRange,
  isLocalDateString,
  localToday,
  monthBounds,
  monthOf,
  relativeDay,
  shiftDay,
  startOfWeek,
  weekDays,
} from '../../lib/dates';
import { listAnswerDays } from '../../lib/db/answers';
import { countSessions, listActiveDays, listSessionsForDay, type SessionRow } from '../../lib/db/sessions';
import { moduleLabel } from '../../lib/modules';
import { computeStreaks, type Streaks } from '../../lib/streak';
import { colors, layout, motion, radius, size, spacing, text } from '../../lib/theme';

// Tout l'historique est chargé une fois par focus : la meilleure streak et la
// bande de n'importe quelle semaine en ont besoin, pas de rechargement par semaine.
const HISTORY_START = '2000-01-01';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son unité en fin de ligne (« 12 jours »). */
const NBSP = ' ';
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAYS_PER_WEEK = 7;

type StreakKind = 'training' | 'quiz';

// Dernière streak courante affichée par l'Accueil : survit au démontage de l'écran
// tant que l'app tourne, jamais persistée (comme lastFilter du Quizz). Une valeur
// plus haute à un chargement suivant compte depuis celle-ci.
const lastShownStreak: Record<StreakKind, number | null> = { training: null, quiz: null };

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
  // Lundi de la semaine affichée par la bande ; les flèches la changent sans toucher au jour sélectionné.
  const [displayedWeek, setDisplayedWeek] = useState(() => startOfWeek(today));
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'loading' });
  const [daySessions, setDaySessions] = useState<DaySessionsState>({ status: 'loading' });
  // Incrémentés par « Réessayer » : seul rôle, relancer l'effet de chargement correspondant.
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [daySessionsAttempt, setDaySessionsAttempt] = useState(0);
  const { day, session, savedTitle, picked } = useLocalSearchParams<{
    day?: string;
    session?: string;
    savedTitle?: string;
    picked?: string;
  }>();

  // Retour d'un écran de séance ou du calendrier : sélectionne le jour reçu et affiche
  // sa semaine. Ici, `session` et `picked` ne servent qu'à relancer l'effet quand le même jour revient.
  useEffect(() => {
    // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
    if (typeof day === 'string' && isLocalDateString(day)) {
      setSelectedDay(day);
      setDisplayedWeek(startOfWeek(day));
    }
  }, [day, session, picked]);

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

  function openMonth() {
    // Mois du jour sélectionné s'il est dans la semaine affichée, sinon celui de son lundi.
    const anchor = weekDays(displayedWeek).includes(selectedDay) ? selectedDay : displayedWeek;
    router.push({ pathname: '/calendar', params: { day: selectedDay, anchor } });
  }

  const summary = summaryState.status === 'ready' ? summaryState.summary : null;
  // Liste d'un autre jour : le jour sélectionné vient de changer, chargement jusqu'à la sienne.
  // Au simple retour sur l'onglet, la liste du même jour reste affichée jusqu'à la réponse.
  const shownSessions: DaySessionsState =
    daySessions.status !== 'loading' && daySessions.day !== selectedDay ? { status: 'loading' } : daySessions;
  // Séance libre tout juste créée (savedTitle n'est envoyé que par session/new) : la key
  // rejoue la confirmation à chaque nouvelle séance, jamais au simple retour sur l'onglet.
  const toast =
    typeof savedTitle === 'string' && savedTitle !== '' && typeof session === 'string' ? (
      <SaveToast key={session} message={`Séance enregistrée : ${savedTitle}.`} />
    ) : null;

  return (
    <Screen
      title="Accueil"
      footer={<Button label="Nouvelle séance" onPress={() => router.push('/session/new')} />}
      toast={toast}
    >
      <View style={layout.section}>
        <View style={styles.streakRow}>
          <StreakCard kind="training" label="Entraînement" tone="accent" streaks={summary ? summary.training : null}>
            <Text style={text.meta}>ce mois : {summary ? formatSessionCount(summary.monthCount) : PLACEHOLDER}</Text>
            <Text style={text.meta}>total : {summary ? formatSessionCount(summary.totalCount) : PLACEHOLDER}</Text>
          </StreakCard>
          <StreakCard kind="quiz" label="Quizz" tone="quiz" streaks={summary ? summary.quiz : null} />
        </View>
        {summaryState.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {summaryState.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${summaryState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retrySummary} />
          </>
        ) : null}
      </View>

      <WeekStrip
        week={displayedWeek}
        today={today}
        selectedDay={selectedDay}
        activity={summary}
        onShiftWeek={(weeks) => setDisplayedWeek((current) => shiftDay(current, weeks * DAYS_PER_WEEK))}
        onSelectDay={setSelectedDay}
        onOpenMonth={openMonth}
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
  /** Streak affichée : son chiffre compte jusqu'à la nouvelle valeur quand elle augmente. */
  kind: StreakKind;
  label: string;
  tone: StatTone;
  /** null tant que le résumé n'est pas chargé : « — », sans unité. */
  streaks: Streaks | null;
  /** Lignes secondaires sous la meilleure streak. */
  children?: ReactNode;
};

/** Streak courante en chiffre dominant ; meilleure et compteurs en secondaire. */
function StreakCard({ kind, label, tone, streaks, children }: StreakCardProps) {
  const current = useStreakCountUp(kind, streaks ? streaks.current : null);
  return (
    <Card style={styles.streakCard}>
      <Stat
        label={label}
        value={current ?? PLACEHOLDER}
        // L'unité suit le chiffre affiché, décompte compris (« 1 jour », puis « 2 jours »).
        unit={current !== null ? dayUnit(current) : undefined}
        tone={tone}
      />
      <View>
        <Text style={text.meta}>meilleure : {streaks ? formatDayCount(streaks.best) : PLACEHOLDER}</Text>
        {children}
      </View>
    </Card>
  );
}

/**
 * Chiffre de la streak courante (micro-interaction d) : target dès qu'elle est
 * chargée ; plus haute que la dernière valeur affichée, elle compte depuis
 * celle-ci en motion.countUpMs. null tant que target est null (« — »).
 */
function useStreakCountUp(kind: StreakKind, target: number | null): number | null {
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const previous = lastShownStreak[kind];
    if (previous === null || target <= previous) {
      // Premier affichage depuis le lancement, streak égale ou en baisse : pas de décompte.
      lastShownStreak[kind] = target;
      setShown(target);
      return;
    }
    const value = new Animated.Value(previous);
    const listener = value.addListener(({ value: current }) => {
      // Chaque chiffre affiché devient la référence : un décompte interrompu reprend là où il en était.
      const rounded = Math.round(current);
      lastShownStreak[kind] = rounded;
      setShown(rounded);
    });
    setShown(previous);
    // Valeur lue en JS pour écrire le chiffre : pas de pilote natif.
    const animation = Animated.timing(value, {
      toValue: target,
      duration: motion.countUpMs,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) {
        lastShownStreak[kind] = target;
        setShown(target);
      }
    });
    // Nouvelle valeur, démontage ou double effet de StrictMode : décompte arrêté, le
    // suivant repart de la dernière valeur affichée.
    return () => {
      animation.stop();
      value.removeListener(listener);
    };
  }, [kind, target]);

  return target === null ? null : shown;
}

type WeekStripProps = {
  /** Lundi de la semaine affichée. */
  week: string;
  today: string;
  selectedDay: string;
  /** Jours actifs ; null tant que le résumé n'est pas chargé (aucun point affiché). */
  activity: Pick<Summary, 'trainingDays' | 'quizDays'> | null;
  onShiftWeek: (weeks: number) => void;
  onSelectDay: (day: string) => void;
  /** « Voir le mois » : calendrier mensuel (app/calendar.tsx). */
  onOpenMonth: () => void;
};

/** Bande de la semaine, du lundi au dimanche ; le mois entier est sur app/calendar.tsx. */
function WeekStrip({ week, today, selectedDay, activity, onShiftWeek, onSelectDay, onOpenMonth }: WeekStripProps) {
  return (
    <View style={layout.section}>
      <View style={styles.weekHeader}>
        <IconButton icon="chevron-back" accessibilityLabel="Semaine précédente" onPress={() => onShiftWeek(-1)} />
        <Text style={[text.title, styles.weekTitle]}>{formatWeekRange(week, today)}</Text>
        <IconButton icon="chevron-forward" accessibilityLabel="Semaine suivante" onPress={() => onShiftWeek(1)} />
      </View>

      <View style={styles.strip}>
        {weekDays(week).map((cellDay, index) => (
          <WeekDayCell
            key={cellDay}
            day={cellDay}
            initial={WEEKDAY_INITIALS[index]}
            isToday={cellDay === today}
            isSelected={cellDay === selectedDay}
            hasTraining={activity !== null && activity.trainingDays.has(cellDay)}
            hasQuiz={activity !== null && activity.quizDays.has(cellDay)}
            onPress={() => onSelectDay(cellDay)}
          />
        ))}
      </View>

      <View style={styles.stripFooter}>
        <View style={styles.legend}>
          <Text style={text.meta}>
            <Text style={styles.trainingMark}>●</Text> Entraînement
          </Text>
          <Text style={text.meta}>
            <Text style={styles.quizMark}>●</Text> Quizz
          </Text>
        </View>
        <Button variant="text" label="Voir le mois" icon="chevron-forward" onPress={onOpenMonth} />
      </View>
    </View>
  );
}

type WeekDayCellProps = {
  day: string;
  /** Initiale du jour de la semaine : L, M, M, J, V, S, D. */
  initial: string;
  isToday: boolean;
  isSelected: boolean;
  hasTraining: boolean;
  hasQuiz: boolean;
  onPress: () => void;
};

function WeekDayCell({ day, initial, isToday, isSelected, hasTraining, hasQuiz, onPress }: WeekDayCellProps) {
  const label = `${formatShortDay(day)}${hasTraining ? ', entraînement' : ''}${hasQuiz ? ', quizz' : ''}`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayCell,
        isToday && styles.todayCell,
        isSelected && styles.selectedCell,
        pressed && styles.pressedCell,
      ]}
    >
      <Text style={text.meta}>{initial}</Text>
      <Text style={[text.body, text.tabular]}>{dayOfMonth(day)}</Text>
      {/* Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent.
          Deux places fixes, entraînement à gauche, quizz à droite (ordre de la légende) :
          la place double la couleur (orange, violet). */}
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
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekTitle: {
    flex: 1,
    textAlign: 'center',
  },
  // Sept cases d'au moins 48 dp à 8 dp d'écart (règle 3) : 7 × 48 + 6 × 8 = 384 dp,
  // plus que les 380 dp de contenu d'un Pixel de 412 dp (marges de 16 dp). La bande
  // mord donc de 8 dp sur chaque marge : 396 dp, des cases d'environ 49,7 dp. Pas de
  // carte autour : sa marge intérieure mangerait cette largeur.
  strip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  dayCell: {
    flex: 1,
    minHeight: size.touch,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
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
  // Légende à gauche, « Voir le mois » à droite ; l'un passe sous l'autre si la place manque.
  stripFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
