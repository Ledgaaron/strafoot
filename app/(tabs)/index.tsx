import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ActivityLegend, DayCell, WEEKDAY_INITIALS } from '../../components/day-cell';
import { FieldError } from '../../components/field-error';
import { Flame, type FlameState, type FlameTone } from '../../components/flame';
import { IconButton } from '../../components/icon-button';
import { ModuleIcon } from '../../components/module-icon';
import { MonthSheet } from '../../components/month-sheet';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import {
  formatLongDay,
  formatRecentDay,
  formatWeekOf,
  isLocalDateString,
  localToday,
  shiftDay,
  startOfWeek,
  weekDays,
} from '../../lib/dates';
import { listActivityHistory, type ActivityDays } from '../../lib/db/activity';
import { listSessionsForDay, type SessionRow } from '../../lib/db/sessions';
import { moduleLabel } from '../../lib/modules';
import { useReduceMotion } from '../../lib/reduce-motion';
import { computeStreaks, type Streaks } from '../../lib/streak';
import { colors, layout, motion, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son unité en fin de ligne (« 12 jours »). */
const NBSP = ' ';
const DAYS_PER_WEEK = 7;

type StreakKind = 'training' | 'quiz';

// Dernière streak courante affichée par l'Accueil : survit au démontage de l'écran
// tant que l'app tourne, jamais persistée (comme lastFilter du Quiz). Une valeur
// plus haute à un chargement suivant compte depuis celle-ci.
const lastShownStreak: Record<StreakKind, number | null> = { training: null, quiz: null };

type Summary = ActivityDays & {
  training: Streaks;
  quiz: Streaks;
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
  // Lundi de la semaine affichée par la carte ; les flèches la changent sans toucher au jour sélectionné.
  const [displayedWeek, setDisplayedWeek] = useState(() => startOfWeek(today));
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'loading' });
  const [daySessions, setDaySessions] = useState<DaySessionsState>({ status: 'loading' });
  // Incrémentés par « Réessayer » : seul rôle, relancer l'effet de chargement correspondant.
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [daySessionsAttempt, setDaySessionsAttempt] = useState(0);
  // Feuille du mois : ouverte par « Voir le mois », sur le mois de monthAnchor.
  const [monthVisible, setMonthVisible] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState(today);
  const { day, session, savedTitle } = useLocalSearchParams<{
    day?: string;
    session?: string;
    savedTitle?: string;
  }>();

  // Retour d'un écran de séance : sélectionne le jour reçu et affiche sa semaine.
  // Ici, `session` ne sert qu'à relancer l'effet quand le même jour revient.
  useEffect(() => {
    // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
    if (typeof day === 'string' && isLocalDateString(day)) {
      setSelectedDay(day);
      setDisplayedWeek(startOfWeek(day));
    }
  }, [day, session]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus : l'app peut rester ouverte après minuit.
      const today = localToday();
      setToday(today);
      listActivityHistory(today)
        .then(({ data, error }) => {
          if (!active) {
            return;
          }
          if (error !== null || data === null) {
            setSummaryState({ status: 'error', message: error ?? 'Supabase n’a renvoyé ni les jours actifs ni d’erreur.' });
            return;
          }
          setSummaryState({
            status: 'ready',
            summary: {
              ...data,
              training: computeStreaks(data.trainingDays, today),
              quiz: computeStreaks(data.quizDays, today),
            },
          });
        })
        .catch((exception: unknown) => {
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
    setMonthAnchor(weekDays(displayedWeek).includes(selectedDay) ? selectedDay : displayedWeek);
    setMonthVisible(true);
  }

  /** Jour touché dans la feuille du mois : la feuille se ferme, l'Accueil se place sur sa semaine et lui. */
  function pickDay(pickedDay: string) {
    setMonthVisible(false);
    setSelectedDay(pickedDay);
    setDisplayedWeek(startOfWeek(pickedDay));
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
    <Screen footer={<Button label="Nouvelle séance" onPress={() => router.push('/session/new')} />} toast={toast}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={text.meta}>{formatLongDay(today)}</Text>
          <Text role="heading" style={text.screen}>
            Aujourd’hui
          </Text>
        </View>
        {/* Avatar sans donnée (aucune photo, aucune initiale) : l'icône personne, vers le Profil. */}
        <Pressable
          role="button"
          accessibilityLabel="Profil"
          onPress={() => router.navigate('/profile')}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
        >
          <Ionicons name="person" size={size.icon} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={layout.section}>
        <View style={styles.streakRow}>
          <StreakCard
            kind="training"
            label="Entraînement"
            tone="accent"
            streaks={summary ? summary.training : null}
            todayDone={summary !== null && summary.trainingDays.has(today)}
            onPress={() => router.navigate('/profile')}
          />
          <StreakCard
            kind="quiz"
            label="Quiz"
            tone="quiz"
            streaks={summary ? summary.quiz : null}
            todayDone={summary !== null && summary.quizDays.has(today)}
            onPress={() => router.navigate('/quiz')}
          />
        </View>
        {summaryState.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {summaryState.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${summaryState.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retrySummary} />
          </>
        ) : null}
      </View>

      <WeekCard
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
          {selectedDay === today ? 'Séances du jour' : `Séances · ${formatRecentDay(selectedDay, today)}`}
        </Text>
        {shownSessions.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {shownSessions.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${shownSessions.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retryDaySessions} />
          </>
        ) : null}
        {shownSessions.status === 'ready' && shownSessions.sessions.length === 0 ? (
          // En secondaire, sans bouton : le pied de l'écran porte déjà « Nouvelle séance ».
          <Text style={text.meta}>Aucune séance ce jour. Ajoute-la avec « Nouvelle séance », en bas de l’écran.</Text>
        ) : null}
        {shownSessions.status === 'ready' ? shownSessions.sessions.map((row) => <SessionCard key={row.id} row={row} />) : null}
      </View>

      <MonthSheet
        visible={monthVisible}
        mode="browse"
        today={today}
        selectedDay={selectedDay}
        anchorDay={monthAnchor}
        onClose={() => setMonthVisible(false)}
        onPickDay={pickDay}
      />
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

/** « 0 jour actif », « 1 jour actif », « 4 jours actifs ». */
function formatActiveDays(count: number): string {
  return `${formatDayCount(count)} actif${count >= 2 ? 's' : ''}`;
}

type StreakCardProps = {
  /** Streak affichée : son chiffre passe à la nouvelle valeur quand elle augmente. */
  kind: StreakKind;
  label: string;
  tone: FlameTone;
  /** null tant que le résumé n'est pas chargé : « — », sans flamme. */
  streaks: Streaks | null;
  /** Au moins une activité aujourd'hui : flamme pleine. */
  todayDone: boolean;
  /** Entraînement : onglet Profil ; Quiz : onglet Quiz. */
  onPress: () => void;
};

/** Carte de streak : flamme et chiffre dominant, libellé, ligne d'état du jour ; tappable. */
function StreakCard({ kind, label, tone, streaks, todayDone, onPress }: StreakCardProps) {
  const reduceMotion = useReduceMotion();
  const current = useStreakCountUp(kind, streaks ? streaks.current : null, reduceMotion);
  const flame = streaks !== null ? flameState(streaks.current, todayDone) : null;
  const spoken =
    current !== null && flame !== null ? `${label} : ${formatDayCount(current)}, ${FLAME_LABELS[flame]}` : `${label} : ${PLACEHOLDER}`;
  return (
    <Card onPress={onPress} accessibilityLabel={spoken} style={styles.streakCard}>
      <View style={styles.streakValue}>
        {/* Flamme seulement une fois la streak chargée : montée dans son état, sans transition. */}
        {flame !== null ? <Flame state={flame} tone={tone} /> : null}
        <Text numberOfLines={1} style={[text.number, flame === 'lost' && styles.lostNumber]}>
          {current ?? PLACEHOLDER}
        </Text>
      </View>
      <Text style={text.title}>{label}</Text>
      <StreakStatus state={flame} tone={tone} />
    </Card>
  );
}

/** Pleine dès une activité aujourd'hui ; contour tant que la série tient (jusqu'à minuit) ; grise si elle est perdue. */
function flameState(current: number, todayDone: boolean): FlameState {
  if (todayDone) {
    return 'done';
  }
  return current > 0 ? 'todo' : 'lost';
}

const FLAME_LABELS: Readonly<Record<FlameState, string>> = {
  done: 'faite aujourd’hui',
  todo: 'à faire aujourd’hui',
  lost: 'série perdue',
};

/** « À faire aujourd’hui » dans la couleur de sa série. */
const TODO_STYLES = StyleSheet.create({
  accent: { color: colors.accent },
  quiz: { color: colors.quiz },
});

/** Ligne d'état sous le libellé : à faire (couleur de la série), fait (coche, secondaire), perdue (secondaire). */
function StreakStatus({ state, tone }: { state: FlameState | null; tone: FlameTone }) {
  if (state === 'todo') {
    return <Text style={[text.meta, TODO_STYLES[tone]]}>À faire aujourd’hui</Text>;
  }
  if (state === 'done') {
    return (
      <View style={styles.statusRow}>
        <Ionicons name="checkmark" size={size.iconSmall} color={colors.textMuted} aria-hidden />
        <Text style={text.meta}>Fait aujourd’hui</Text>
      </View>
    );
  }
  return <Text style={text.meta}>{state === 'lost' ? 'Série perdue' : PLACEHOLDER}</Text>;
}

/**
 * Chiffre de la streak courante (micro-interaction d) : target dès qu'elle est
 * chargée. Plus haute que la dernière valeur affichée depuis le lancement, donc
 * après une action (séance enregistrée, réponse au quiz) et jamais au simple
 * affichage de l'Accueil, le chiffre laisse d'abord la flamme se remplir
 * (motion.micro), puis passe de l'ancienne à la nouvelle valeur en motion.micro.
 * « Réduire les animations » : nouvelle valeur aussitôt. null tant que target
 * est null (« — »).
 */
function useStreakCountUp(kind: StreakKind, target: number | null, reduceMotion: boolean): number | null {
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const previous = lastShownStreak[kind];
    if (previous === null || target <= previous || reduceMotion) {
      // Premier affichage depuis le lancement, streak égale ou en baisse : pas de transition.
      lastShownStreak[kind] = target;
      setShown(target);
      return;
    }
    const value = new Animated.Value(previous);
    const listener = value.addListener(({ value: current }) => {
      // Chaque chiffre affiché devient la référence : une transition interrompue reprend là où elle en était.
      const rounded = Math.round(current);
      lastShownStreak[kind] = rounded;
      setShown(rounded);
    });
    setShown(previous);
    // Valeur lue en JS pour écrire le chiffre : pas de pilote natif.
    const animation = Animated.sequence([
      Animated.delay(motion.micro),
      Animated.timing(value, {
        toValue: target,
        duration: motion.micro,
        easing: motion.easing,
        useNativeDriver: false,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        lastShownStreak[kind] = target;
        setShown(target);
      }
    });
    // Nouvelle valeur, démontage ou double effet de StrictMode : transition arrêtée, la
    // suivante repart de la dernière valeur affichée.
    return () => {
      animation.stop();
      value.removeListener(listener);
    };
  }, [kind, target, reduceMotion]);

  return target === null ? null : shown;
}

type WeekCardProps = {
  /** Lundi de la semaine affichée. */
  week: string;
  today: string;
  selectedDay: string;
  /** Jours actifs ; null tant que le résumé n'est pas chargé (aucun point, « — » jours actifs). */
  activity: ActivityDays | null;
  onShiftWeek: (weeks: number) => void;
  onSelectDay: (day: string) => void;
  /** « Voir le mois » : feuille du mois (MonthSheet). */
  onOpenMonth: () => void;
};

/** Carte « Cette semaine » : jours actifs, ‹ ›, bande du lundi au dimanche, légende et « Voir le mois ». */
function WeekCard({ week, today, selectedDay, activity, onShiftWeek, onSelectDay, onOpenMonth }: WeekCardProps) {
  const days = weekDays(week);
  const isCurrentWeek = week === startOfWeek(today);
  const activeCount =
    activity === null ? null : days.filter((cellDay) => activity.trainingDays.has(cellDay) || activity.quizDays.has(cellDay)).length;
  return (
    <Card style={styles.weekCard}>
      <View style={styles.weekHeader}>
        <Text numberOfLines={1} style={[text.overline, styles.weekTitle]}>
          {isCurrentWeek ? 'Cette semaine' : formatWeekOf(week, today)}
        </Text>
        <Text style={text.meta}>{activeCount === null ? PLACEHOLDER : formatActiveDays(activeCount)}</Text>
        {/* Deux boutons compacts à 16 px : leurs zones tactiles de 48 se touchent sans se recouvrir. */}
        <View style={styles.weekNav}>
          <IconButton compact subtle icon="chevron-back" accessibilityLabel="Semaine précédente" onPress={() => onShiftWeek(-1)} />
          <IconButton compact subtle icon="chevron-forward" accessibilityLabel="Semaine suivante" onPress={() => onShiftWeek(1)} />
        </View>
      </View>

      {/* Sept cases sans écart (comme la grille du mois) : à 8 px des bords de la carte, elles gardent 48 px de large sur un iPhone de 390. */}
      <View style={styles.strip}>
        {days.map((cellDay, index) => (
          <DayCell
            key={cellDay}
            day={cellDay}
            initial={WEEKDAY_INITIALS[index]}
            isToday={cellDay === today}
            isSelected={cellDay === selectedDay}
            // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre des jours.
            isFuture={cellDay > today}
            hasTraining={activity !== null && activity.trainingDays.has(cellDay)}
            hasQuiz={activity !== null && activity.quizDays.has(cellDay)}
            onPress={() => onSelectDay(cellDay)}
          />
        ))}
      </View>

      <View style={styles.weekFooter}>
        <ActivityLegend />
        <Button variant="text" label="Voir le mois" icon="chevron-forward" onPress={onOpenMonth} />
      </View>
    </Card>
  );
}

/** Carte d'une séance du jour : tuile du module, nom, « module · durée · difficulté », chevron. */
function SessionCard({ row }: { row: SessionRow }) {
  const label = moduleLabel(row.module);
  const name = row.name?.trim() || label;
  const details = [label, `${row.duration_min}${NBSP}min`, `difficulté ${row.difficulty}/5`].join(' · ');
  return (
    <Card
      accessibilityLabel={`${name}, ${details}`}
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: row.id } })}
      style={styles.sessionCard}
    >
      <ModuleIcon module={row.module} />
      <View style={styles.sessionText}>
        <Text numberOfLines={1} style={text.bodyStrong}>
          {name}
        </Text>
        <Text numberOfLines={1} style={text.meta}>
          {details}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  /** Rond de 48 px, surface2 ; un cran plus sombre à l'appui. */
  avatar: {
    width: size.touch,
    height: size.touch,
    borderRadius: size.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  avatarPressed: {
    backgroundColor: colors.surfacePressed,
  },
  streakRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  streakCard: {
    flex: 1,
    gap: spacing.xs,
  },
  /** Flamme et chiffre centrés sur une même ligne. */
  streakValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lostNumber: {
    color: colors.textMuted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  /** Marges latérales réduites à 8 px : la place va aux sept cases. */
  weekCard: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  weekTitle: {
    flex: 1,
  },
  weekNav: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  strip: {
    flexDirection: 'row',
  },
  // Légende à gauche, « Voir le mois » à droite ; l'un passe sous l'autre si la place manque.
  weekFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sessionText: {
    flex: 1,
    gap: spacing.xs,
  },
});
