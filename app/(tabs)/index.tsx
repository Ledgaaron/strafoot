import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { Avatar } from '../../components/avatar';
import { BottomSheet } from '../../components/bottom-sheet';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ActivityLegend, DayCell, WEEKDAY_INITIALS } from '../../components/day-cell';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Flame, type FlameState, type FlameTone } from '../../components/flame';
import { IconButton, type IconName } from '../../components/icon-button';
import { ModuleIcon } from '../../components/module-icon';
import { MonthCalendar, MonthSheet } from '../../components/month-sheet';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { isClubPlannedDay, proposeClubSession, usualClubWeekdays, type ClubProposal } from '../../lib/club';
import { getClubDismissal, saveClubDismissal } from '../../lib/club-dismissal';
import {
  formatLongDay,
  formatMonthSpan,
  formatRecentDay,
  isLocalDateString,
  localToday,
  relativeDay,
  shiftDay,
  startOfWeek,
  weekdayOf,
  weekDays,
} from '../../lib/dates';
import {
  centeredStripIndex,
  clampStripIndex,
  defaultStripStart,
  STRIP_VISIBLE_DAYS,
  stripDays,
  stripStartFor,
} from '../../lib/day-strip';
import { listActivityHistory, type ActivityHistory } from '../../lib/db/activity';
import { createGoal, listActiveGoals, retireGoal, updateGoal, type GoalInput, type GoalRow } from '../../lib/db/goals';
import { getMyProfile, upsertMyProfile } from '../../lib/db/profiles';
import { createSession, listSessionsForDay, type SessionRow } from '../../lib/db/sessions';
import { listResultHistory, listTestCatalog, type ResultEntry, type TestRow } from '../../lib/db/test-results';
import { listTests, type TestSummary } from '../../lib/db/training';
import {
  defaultDeadline,
  formatDeadlineLine,
  formatGoalRange,
  formatGoalState,
  goalProgress,
  MAX_ACTIVE_GOALS,
  parseTarget,
  type GoalProgress,
} from '../../lib/goals';
import { hapticMedium } from '../../lib/haptics';
import { formatDecimal, formatMeasure } from '../../lib/measure-delta';
import { CLUB_MODULE_KEY, DEFAULT_DIFFICULTY, getModule, moduleLabel } from '../../lib/modules';
import {
  MAX_WEEKLY_SESSION_GOAL,
  MIN_WEEKLY_SESSION_GOAL,
  weeklyGoalOf,
  weekWork,
} from '../../lib/personal-work';
import { formatMinutes, initialsOf } from '../../lib/profile-stats';
import { recordHistory, type RecordEvent } from '../../lib/records';
import { useReduceMotion } from '../../lib/reduce-motion';
import { computeStreaks, type Streaks } from '../../lib/streak';
import { formatSuggestionReason, suggestTest, type SuggestionGoal } from '../../lib/suggestion';
import { SKILLS } from '../../lib/test-families';
import {
  colors,
  disabledOpacity,
  input,
  inputProps,
  layout,
  motion,
  radius,
  size,
  spacing,
  text,
} from '../../lib/theme';
import { randomUuid } from '../../lib/uuid';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son unité en fin de ligne (« 12 jours »). */
const NBSP = ' ';
/** Derniers records affichés. */
const RECORD_COUNT = 3;
/** Rang du jour centré parmi les 7 visibles de la bande. */
const STRIP_CENTER_OFFSET = Math.floor(STRIP_VISIBLE_DAYS / 2);

const NO_ACTIVITY_MESSAGE = 'Supabase n’a renvoyé ni les jours actifs ni d’erreur.';
const NO_CLUB_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier les séances du jour avant de réessayer.';
const NO_GOAL_MESSAGE = 'Supabase n’a renvoyé ni l’objectif ni d’erreur.';
const DISMISS_ERROR_MESSAGE = '« Pas ce soir » non mémorisé : la proposition reviendra au prochain lancement.';
const RETIRE_QUESTION = 'Il ne sera plus suivi ; ses données sont conservées.';

type StreakKind = 'training' | 'quiz';

// Dernière streak courante affichée par l'Accueil : survit au démontage de l'écran
// tant que l'app tourne, jamais persistée (comme lastFilter du Quiz). Une valeur
// plus haute à un chargement suivant compte depuis celle-ci.
const lastShownStreak: Record<StreakKind, number | null> = { training: null, quiz: null };

type LoadingState = { status: 'loading' };
type ErrorState = { status: 'error'; message: string };
/** Section de l'écran : chargement, erreur affichée, ou données. */
type Loadable<T> = LoadingState | ErrorState | { status: 'ready'; data: T };

/** Activité de tout l'historique et ses deux streaks (entraînement : travail personnel seulement). */
type HomeActivity = ActivityHistory & { training: Streaks; quiz: Streaks };

/** Ce que l'Accueil lit du profil : initiales de l'avatar, objectif hebdomadaire. */
type HomeProfile = { initials: string | null; weeklyGoal: number };

/** Mesure d'un test atomique présente au catalogue : id de sa courbe, test, nom, unité, sens. */
type MeasureInfo = {
  /** Ligne du catalogue tests : résultats, objectifs, courbe (app/measure/[testId]). */
  catalogId: string;
  key: string;
  name: string;
  unit: string;
  higherIsBetter: boolean;
  test: TestSummary;
};

/** Tests, mesures et résultats : test suggéré, objectifs, derniers records. */
type HomeProgress = {
  /** Tests atomiques, ordre du catalogue (slug). */
  tests: TestSummary[];
  /** Mesures des tests présentes au catalogue, par id du catalogue. */
  measures: ReadonlyMap<string, MeasureInfo>;
  /** Tous mes résultats, du plus ancien au plus récent. */
  results: ResultEntry[];
  /** Tests hors format en base : affichés, jamais avalés. */
  problems: string[];
};

/** « Pas ce soir » relu sur l'appareil : le jour écarté, ou null. */
type DismissalState = { status: 'loading' } | { status: 'ready'; day: string | null };

/** `day` : jour auquel appartient la liste (ou l'erreur) gardée en état. */
type DaySessionsState =
  | { status: 'loading' }
  | { status: 'error'; day: string; message: string }
  | { status: 'ready'; day: string; sessions: SessionRow[] };

/** Confirmation flottante : key la rejoue (une par enregistrement). */
type Toast = { key: string; message: string };

/** Objectif actif et ce qu'il en reste à lire ; measure null : mesure absente du catalogue, retirable seulement. */
type GoalView = { row: GoalRow; measure: MeasureInfo | null; progress: GoalProgress | null };

/** Record battu et sa mesure. */
type RecordView = { event: RecordEvent; measure: MeasureInfo };

/** Ligne « Test suggéré » de la carte Aujourd'hui. */
type SuggestedTest = { slug: string; title: string; reason: string };

/** Feuille d'objectif ouverte : ajout ou détail ; key la remonte à chaque ouverture (état neuf). */
type GoalSheetState =
  | { kind: 'add'; open: boolean; key: number }
  | { kind: 'detail'; open: boolean; key: number; goalId: string }
  | null;

/** Feuille de l'objectif hebdomadaire ; key comme GoalSheetState. */
type WeekGoalSheetState = { open: boolean; key: number } | null;

export default function HomeScreen() {
  const [today, setToday] = useState(localToday);
  const [selectedDay, setSelectedDay] = useState(today);
  // Premier jour de la bande : 12 semaines en arrière, plus tôt si un jour plus ancien a été choisi.
  const [stripStart, setStripStart] = useState(() => defaultStripStart(today));
  // Jour à centrer dans la bande ; nonce : relance le centrage, même sur le même jour.
  const [stripCenter, setStripCenter] = useState({ day: today, nonce: 0 });
  const [activity, setActivity] = useState<Loadable<HomeActivity>>({ status: 'loading' });
  const [profile, setProfile] = useState<Loadable<HomeProfile>>({ status: 'loading' });
  const [progress, setProgress] = useState<Loadable<HomeProgress>>({ status: 'loading' });
  const [goals, setGoals] = useState<Loadable<GoalRow[]>>({ status: 'loading' });
  const [dismissal, setDismissal] = useState<DismissalState>({ status: 'loading' });
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<DaySessionsState>({ status: 'loading' });
  // Incrémentés par « Réessayer » ou après un enregistrement : relancent les lectures.
  const [reloadCount, setReloadCount] = useState(0);
  const [daySessionsAttempt, setDaySessionsAttempt] = useState(0);
  // Feuille du mois : ouverte par « Voir le mois », sur le mois de anchor.
  const [monthSheet, setMonthSheet] = useState({ visible: false, anchor: today });
  const [weekGoalSheet, setWeekGoalSheet] = useState<WeekGoalSheetState>(null);
  const [goalSheet, setGoalSheet] = useState<GoalSheetState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Séance club du soir : envoi en cours, erreur, et jour où elle vient d'être
  // enregistrée (la proposition disparaît aussitôt, avant la relecture).
  const [clubSaving, setClubSaving] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubSavedDay, setClubSavedDay] = useState<string | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const clubPendingRef = useRef(false);
  // Id de la séance club, tiré au premier envoi et gardé pour chaque réessai : la base ignore un second envoi.
  const clubIdRef = useRef<string | null>(null);
  const sheetKeyRef = useRef(0);
  // Dernier objectif montré par sa feuille : elle redescend avec lui même s'il vient d'être retiré.
  const lastGoalDetailRef = useRef<GoalView | null>(null);
  const { day, session, savedTitle } = useLocalSearchParams<{
    day?: string;
    session?: string;
    savedTitle?: string;
  }>();

  // Retour d'un écran de séance : sélectionne le jour reçu et centre la bande sur
  // lui ; une séance libre tout juste créée (savedTitle n'est envoyé que par
  // session/new) rejoue la confirmation. `session` change à chaque nouvelle séance.
  useEffect(() => {
    // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
    if (typeof day === 'string' && isLocalDateString(day)) {
      focusDay(day);
    }
    if (typeof savedTitle === 'string' && savedTitle !== '' && typeof session === 'string') {
      setToast({ key: session, message: `Séance enregistrée : ${savedTitle}.` });
    }
  }, [day, session, savedTitle]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;
      // Relu à chaque focus : l'app peut rester ouverte après minuit.
      const now = localToday();
      setToday(now);
      // Sections indépendantes : la panne de l'une n'empêche pas les autres de
      // s'afficher. Au retour sur l'onglet, les données précédentes restent
      // affichées jusqu'à la réponse ; seul « Réessayer » repasse une section à
      // « chargement ».
      settle(loadActivity(now), isActive, setActivity);
      settle(loadProfile(), isActive, setProfile);
      settle(loadProgress(), isActive, setProgress);
      settle(loadGoals(), isActive, setGoals);
      getClubDismissal().then(({ data, error }) => {
        if (active) {
          setDismissal({ status: 'ready', day: data });
          setDismissError(error);
        }
      });
      return () => {
        active = false;
      };
    }, [reloadCount]),
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

  /** Place l'Accueil sur target : jour choisi, bande agrandie s'il le faut, centrée sur lui. */
  function focusDay(target: string) {
    setSelectedDay(target);
    setStripStart((current) => stripStartFor(current, target));
    setStripCenter((current) => ({ day: target, nonce: current.nonce + 1 }));
  }

  /** Relit toutes les sections, sans repasser par « chargement » (après un enregistrement). */
  function refresh() {
    setReloadCount((count) => count + 1);
  }

  /** « Réessayer » d'une section en erreur : elle repasse à « chargement », puis toutes se relisent. */
  function retry(setSection: (state: LoadingState) => void) {
    setSection({ status: 'loading' });
    refresh();
  }

  function retryDaySessions() {
    setDaySessions({ status: 'loading' });
    setDaySessionsAttempt((attempt) => attempt + 1);
  }

  function showToast(message: string, key: string = randomUuid()) {
    setToast({ key, message });
  }

  function openMonth(anchor: string) {
    setMonthSheet({ visible: true, anchor });
  }

  /** Jour touché dans la feuille du mois : la feuille se ferme, l'Accueil se place sur lui. */
  function pickDay(pickedDay: string) {
    setMonthSheet((current) => ({ ...current, visible: false }));
    focusDay(pickedDay);
  }

  async function confirmClub(proposal: ClubProposal) {
    if (clubPendingRef.current) {
      return;
    }
    clubPendingRef.current = true;
    clubIdRef.current ??= randomUuid();
    setClubSaving(true);
    setClubError(null);
    // Jamais de user_id : la base le tire du JWT. Difficulté par défaut, comme une séance saisie sans choix.
    const { data, error } = await createSession({
      id: clubIdRef.current,
      date: today,
      module: CLUB_MODULE_KEY,
      type: getModule(CLUB_MODULE_KEY).type,
      name: proposal.name,
      duration_min: proposal.durationMin,
      difficulty: DEFAULT_DIFFICULTY,
      comment: null,
    });
    clubPendingRef.current = false;
    setClubSaving(false);
    if (error !== null || data === null) {
      setClubError(error ?? NO_CLUB_SESSION_MESSAGE);
      return;
    }
    // Enregistrée : une prochaine proposition tirera un nouvel id.
    clubIdRef.current = null;
    setClubSavedDay(data.date);
    hapticMedium();
    showToast(`Séance enregistrée : ${data.name ?? proposal.name}.`, data.id);
    refresh();
    if (data.date === selectedDay) {
      setDaySessionsAttempt((attempt) => attempt + 1);
    }
  }

  async function dismissClub() {
    // Masquée aussitôt ; l'écriture sur l'appareil suit, son échec est dit sous la carte.
    setDismissal({ status: 'ready', day: today });
    setDismissError(null);
    const { error } = await saveClubDismissal(today);
    if (error !== null) {
      setDismissError(error);
    }
  }

  function openWeekGoal() {
    sheetKeyRef.current += 1;
    setWeekGoalSheet({ open: true, key: sheetKeyRef.current });
  }

  function closeWeekGoal() {
    setWeekGoalSheet((current) => (current === null ? null : { ...current, open: false }));
  }

  /** Enregistre l'objectif hebdomadaire ; renvoie l'erreur à afficher dans la feuille, ou null. */
  async function saveWeeklyGoal(value: number): Promise<string | null> {
    const { error } = await upsertMyProfile({ weekly_session_goal: value });
    if (error !== null) {
      return error;
    }
    hapticMedium();
    showToast(`Objectif de la semaine : ${value}${NBSP}${value >= 2 ? 'séances' : 'séance'}.`);
    closeWeekGoal();
    refresh();
    return null;
  }

  function openAddGoal() {
    sheetKeyRef.current += 1;
    setGoalSheet({ kind: 'add', open: true, key: sheetKeyRef.current });
  }

  function openGoal(goalId: string) {
    sheetKeyRef.current += 1;
    setGoalSheet({ kind: 'detail', open: true, key: sheetKeyRef.current, goalId });
  }

  function closeGoalSheet() {
    setGoalSheet((current) => (current === null ? null : { ...current, open: false }));
  }

  /** Courbe d'une mesure : une feuille ouverte est retirée d'un coup (une Modal resterait par-dessus l'écran). */
  function openCurve(catalogId: string) {
    setGoalSheet(null);
    router.push({ pathname: '/measure/[testId]', params: { testId: catalogId } });
  }

  async function submitNewGoal(goalInput: GoalInput, name: string): Promise<string | null> {
    const { data, error } = await createGoal(goalInput);
    if (error !== null || data === null) {
      return error ?? NO_GOAL_MESSAGE;
    }
    hapticMedium();
    showToast(`Objectif créé : ${name}.`, data.id);
    closeGoalSheet();
    refresh();
    return null;
  }

  async function submitGoalChange(goalId: string, targetValue: number, deadline: string): Promise<string | null> {
    const { data, error } = await updateGoal(goalId, { target_value: targetValue, deadline });
    if (error !== null || data === null) {
      return error ?? NO_GOAL_MESSAGE;
    }
    hapticMedium();
    showToast('Objectif enregistré.');
    closeGoalSheet();
    refresh();
    return null;
  }

  async function submitRetire(goalId: string): Promise<string | null> {
    const { data, error } = await retireGoal(goalId);
    if (error !== null || data === null) {
      return error ?? NO_GOAL_MESSAGE;
    }
    hapticMedium();
    showToast('Objectif retiré : ses données sont conservées.');
    closeGoalSheet();
    refresh();
    return null;
  }

  const activityData = activity.status === 'ready' ? activity.data : null;
  const profileData = profile.status === 'ready' ? profile.data : null;
  const progressData = progress.status === 'ready' ? progress.data : null;
  const goalRows = goals.status === 'ready' ? goals.data : null;

  const days = useMemo(() => stripDays(stripStart, today), [stripStart, today]);
  const clubWeekdays = useMemo(
    () => (activityData !== null ? usualClubWeekdays(activityData.sessions, today) : new Set<number>()),
    [activityData, today],
  );
  const goalViews = useMemo(
    () => (goalRows !== null && progressData !== null ? goalRows.map((row) => toGoalView(row, progressData, today)) : null),
    [goalRows, progressData, today],
  );
  const records = useMemo(() => (progressData !== null ? recordViews(progressData) : []), [progressData]);
  // Test suggéré : masqué dès qu'un test a été fait aujourd'hui. Sans objectifs
  // lisibles, la règle se passe de son premier critère.
  const suggested = useMemo((): SuggestedTest | 'done' | null => {
    // Les objectifs passent avant tout : la suggestion attend leur lecture (réussie ou non).
    if (progressData === null || goals.status === 'loading') {
      return null;
    }
    if (progressData.tests.some((test) => test.lastDate === today)) {
      return 'done';
    }
    // Chaque objectif actif avec son état : un objectif atteint reste affiché, la règle
    // l'écarte de son premier critère. Mesure absente du catalogue : pas d'état, pas de test à suggérer.
    const goalTests = (goalViews ?? []).flatMap((view): SuggestionGoal[] => {
      const test = progressData.tests.find((candidate) => candidate.id === view.row.sheet_id);
      return view.progress !== null && test !== undefined ? [{ slug: test.slug, state: view.progress.state }] : [];
    });
    const suggestion = suggestTest(progressData.tests, goalTests, today);
    return suggestion === null
      ? null
      : { slug: suggestion.test.slug, title: suggestion.test.title, reason: formatSuggestionReason(suggestion.reason, today) };
  }, [progressData, goals.status, goalViews, today]);

  const clubProposal =
    activityData !== null && dismissal.status === 'ready' && clubSavedDay !== today
      ? proposeClubSession(activityData.sessions, today, dismissal.day)
      : null;
  const quizDone = activityData !== null ? activityData.quizDays.has(today) : null;
  const testLine = suggested !== null && suggested !== 'done' ? suggested : null;
  // Rien à proposer, une fois tout lu (activité, tests, objectifs, « Pas ce soir ») :
  // ni club, quiz fait, et pas de test à faire.
  const dayDone =
    activityData !== null &&
    progressData !== null &&
    goals.status !== 'loading' &&
    dismissal.status === 'ready' &&
    clubProposal === null &&
    quizDone === true &&
    testLine === null;

  const foundDetail =
    goalSheet !== null && goalSheet.kind === 'detail'
      ? (goalViews ?? []).find((view) => view.row.id === goalSheet.goalId) ?? null
      : null;
  useEffect(() => {
    if (foundDetail !== null) {
      lastGoalDetailRef.current = foundDetail;
    }
  }, [foundDetail]);
  // Objectif tout juste retiré : absent de la relecture, sa feuille finit de redescendre avec ce qu'elle montrait.
  const goalDetail =
    foundDetail ?? (goalSheet !== null && goalSheet.kind === 'detail' && !goalSheet.open ? lastGoalDetailRef.current : null);

  // Liste d'un autre jour : le jour sélectionné vient de changer, chargement jusqu'à la sienne.
  // Au simple retour sur l'onglet, la liste du même jour reste affichée jusqu'à la réponse.
  const shownSessions: DaySessionsState =
    daySessions.status !== 'loading' && daySessions.day !== selectedDay ? { status: 'loading' } : daySessions;

  return (
    <Screen
      footer={<Button label="Nouvelle séance" onPress={() => router.push('/session/new')} />}
      toast={toast !== null ? <SaveToast key={toast.key} message={toast.message} /> : null}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={text.meta}>{formatLongDay(today)}</Text>
          <Text role="heading" style={text.screen}>
            Aujourd’hui
          </Text>
        </View>
        {/* Le même avatar que le Profil (initiales du nom affiché, sinon l'icône personne), vers le Profil. */}
        <Avatar
          initials={profileData?.initials ?? null}
          diameter={size.touch}
          accessibilityLabel="Profil"
          onPress={() => router.navigate('/profile')}
        />
      </View>

      <View style={layout.section}>
        <View style={styles.streakRow}>
          <StreakCard
            kind="training"
            label="Entraînement"
            tone="accent"
            streaks={activityData ? activityData.training : null}
            // Flamme du travail personnel : un entraînement club ne la remplit pas.
            todayDone={activityData !== null && activityData.personalDays.has(today)}
            onPress={() => router.navigate('/profile')}
          />
          <StreakCard
            kind="quiz"
            label="Quiz"
            tone="quiz"
            streaks={activityData ? activityData.quiz : null}
            todayDone={activityData !== null && activityData.quizDays.has(today)}
            onPress={() => router.navigate('/quiz')}
          />
        </View>
        {activity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {activity.status === 'error' ? <SectionError error={activity.message} onRetry={() => retry(setActivity)} /> : null}
      </View>

      <TodayCard
        loading={
          activity.status === 'loading' ||
          progress.status === 'loading' ||
          goals.status === 'loading' ||
          dismissal.status === 'loading'
        }
        club={clubProposal}
        clubSaving={clubSaving}
        clubError={clubError}
        dismissError={dismissError}
        onConfirmClub={confirmClub}
        onDismissClub={dismissClub}
        quizDone={dayDone ? null : quizDone}
        test={testLine}
        dayDone={dayDone}
      />

      <DayStripCard
        days={days}
        today={today}
        selectedDay={selectedDay}
        activity={activityData}
        clubWeekdays={clubWeekdays}
        center={stripCenter}
        onSelectDay={setSelectedDay}
        onOpenMonth={openMonth}
      />

      <View style={layout.section}>
        <Text role="heading" style={text.title}>
          {selectedDay === today ? 'Séances du jour' : `Séances · ${formatRecentDay(selectedDay, today)}`}
        </Text>
        {shownSessions.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {shownSessions.status === 'error' ? (
          <SectionError error={shownSessions.message} onRetry={retryDaySessions} />
        ) : null}
        {shownSessions.status === 'ready' && shownSessions.sessions.length === 0 ? (
          // En secondaire, sans bouton : le pied de l'écran porte déjà « Nouvelle séance ».
          <Text style={text.meta}>Aucune séance ce jour. Ajoute-la avec « Nouvelle séance », en bas de l’écran.</Text>
        ) : null}
        {shownSessions.status === 'ready' ? shownSessions.sessions.map((row) => <SessionCard key={row.id} row={row} />) : null}
      </View>

      <WeekCard
        today={today}
        activity={activityData}
        weeklyGoal={profileData?.weeklyGoal ?? null}
        loading={activity.status === 'loading' || profile.status === 'loading'}
        profileError={profile.status === 'error' ? profile.message : null}
        onPress={openWeekGoal}
        onRetry={() => retry(setProfile)}
      />

      <GoalsSection
        goals={goals}
        progress={progress}
        views={goalViews}
        today={today}
        onOpenGoal={openGoal}
        onAddGoal={openAddGoal}
        onRetryGoals={() => retry(setGoals)}
        onRetryProgress={() => retry(setProgress)}
      />

      {records.length > 0 ? <RecordsSection records={records} today={today} onOpen={openCurve} /> : null}

      <MonthSheet
        visible={monthSheet.visible}
        mode="browse"
        today={today}
        selectedDay={selectedDay}
        anchorDay={monthSheet.anchor}
        onClose={() => setMonthSheet((current) => ({ ...current, visible: false }))}
        onPickDay={pickDay}
      />

      {weekGoalSheet !== null ? (
        <WeeklyGoalSheet
          key={weekGoalSheet.key}
          visible={weekGoalSheet.open}
          initialGoal={profileData?.weeklyGoal ?? weeklyGoalOf(null)}
          onClose={closeWeekGoal}
          onSave={saveWeeklyGoal}
        />
      ) : null}

      {goalSheet !== null && goalSheet.kind === 'add' && progressData !== null ? (
        <AddGoalSheet
          key={goalSheet.key}
          visible={goalSheet.open}
          today={today}
          progress={progressData}
          activeGoals={goalRows ?? []}
          onClose={closeGoalSheet}
          onCreate={submitNewGoal}
        />
      ) : null}

      {goalSheet !== null && goalSheet.kind === 'detail' && goalDetail !== null ? (
        <GoalDetailSheet
          key={goalSheet.key}
          visible={goalSheet.open}
          today={today}
          view={goalDetail}
          onClose={closeGoalSheet}
          onSave={submitGoalChange}
          onRetire={submitRetire}
          onOpenCurve={openCurve}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Pose l'état chargé tant que l'écran est actif. Une exception inattendue (jour
 * mal formé refusé par computeStreaks, par exemple) devient une erreur affichée,
 * jamais avalée.
 */
function settle<S>(
  load: Promise<S>,
  isActive: () => boolean,
  // NoInfer : S vient de load seul, pas du setter (dont le type accepte aussi une fonction).
  apply: (state: NoInfer<S> | ErrorState) => void,
): void {
  load
    .then((state) => {
      if (isActive()) {
        apply(state);
      }
    })
    .catch((exception: unknown) => {
      if (isActive()) {
        apply({ status: 'error', message: exception instanceof Error ? exception.message : String(exception) });
      }
    });
}

/** Messages distincts de plusieurs lectures : une même panne (réseau, session expirée) remonte souvent sur toutes. */
function joinErrors(errors: readonly (string | null)[]): string | null {
  const messages = [...new Set(errors.filter((message): message is string => message !== null))];
  return messages.length > 0 ? messages.join('\n') : null;
}

/** Activité de tout l'historique ; flamme d'entraînement sur les jours de travail personnel seulement. */
async function loadActivity(today: string): Promise<Loadable<HomeActivity>> {
  const { data, error } = await listActivityHistory(today);
  if (error !== null || data === null) {
    return { status: 'error', message: error ?? NO_ACTIVITY_MESSAGE };
  }
  return {
    status: 'ready',
    data: {
      ...data,
      training: computeStreaks(data.personalDays, today),
      quiz: computeStreaks(data.quizDays, today),
    },
  };
}

async function loadProfile(): Promise<Loadable<HomeProfile>> {
  const { data, error } = await getMyProfile();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  // Sans profil enregistré : icône personne et objectif par défaut.
  return {
    status: 'ready',
    data: {
      initials: initialsOf(data?.display_name?.trim() || null),
      weeklyGoal: weeklyGoalOf(data?.weekly_session_goal ?? null),
    },
  };
}

/**
 * Tests atomiques (dernière fois, dernier résultat de chaque mesure), catalogue
 * des mesures (id de chaque courbe, par key) et tous mes résultats horodatés.
 */
async function loadProgress(): Promise<Loadable<HomeProgress>> {
  const [tests, catalog, results] = await Promise.all([listTests(), listTestCatalog(), listResultHistory()]);
  const error = joinErrors([tests.error, catalog.error, results.error]);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  const items = tests.data?.items ?? [];
  const catalogByKey = new Map<string, TestRow>(
    (catalog.data ?? []).flatMap((row): [string, TestRow][] => (row.key !== null ? [[row.key, row]] : [])),
  );
  const measures = new Map<string, MeasureInfo>();
  for (const test of items) {
    for (const measure of test.exercise.measures) {
      const row = catalogByKey.get(measure.key);
      // Mesure absente du catalogue (seed pas encore lancé) : ni objectif ni record possible.
      if (row !== undefined) {
        measures.set(row.id, {
          catalogId: row.id,
          key: measure.key,
          name: measure.name,
          unit: measure.unit,
          higherIsBetter: measure.higher_is_better,
          test,
        });
      }
    }
  }
  return {
    status: 'ready',
    data: { tests: items, measures, results: results.data ?? [], problems: tests.data?.problems ?? [] },
  };
}

async function loadGoals(): Promise<Loadable<GoalRow[]>> {
  const { data, error } = await listActiveGoals();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return { status: 'ready', data: data ?? [] };
}

/** Objectif, sa mesure et sa progression le jour today. */
function toGoalView(row: GoalRow, progress: HomeProgress, today: string): GoalView {
  const measure = progress.measures.get(row.test_id) ?? null;
  if (measure === null) {
    return { row, measure: null, progress: null };
  }
  const results = progress.results.filter((result) => result.test_id === row.test_id);
  return { row, measure, progress: goalProgress(row, results, measure.higherIsBetter, today) };
}

/** Les derniers records battus, mesures des tests atomiques seulement. */
function recordViews(progress: HomeProgress): RecordView[] {
  const senses = new Map([...progress.measures].map(([catalogId, measure]) => [catalogId, measure.higherIsBetter]));
  const events = recordHistory(
    progress.results.map((result) => ({
      testId: result.test_id,
      value: result.value,
      date: result.date,
      created_at: result.created_at,
    })),
    senses,
    RECORD_COUNT,
  );
  return events.flatMap((event): RecordView[] => {
    const measure = progress.measures.get(event.testId);
    return measure !== undefined ? [{ event, measure }] : [];
  });
}

/** Pluriel français, 0 et 1 au singulier : « 1 séance », « 3 séances ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count}${NBSP}${count >= 2 ? plural : singular}`;
}

/** « 0 jour », « 1 jour », « 12 jours ». */
function formatDayCount(count: number): string {
  return formatCount(count, 'jour', 'jours');
}

/** Confirmation d'une action destructive : window.confirm sur le web (Alert n'y fait rien), Alert en natif. */
function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title} ? ${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Erreur d'une section et son « Réessayer » ; jamais dans une carte tappable (deux cibles l'une dans l'autre). */
function SectionError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <>
      <FieldError error={error} />
      <Button variant="secondary" label="Réessayer" onPress={onRetry} />
    </>
  );
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
    return <DoneStatus label="Fait aujourd’hui" />;
  }
  return <Text style={text.meta}>{state === 'lost' ? 'Série perdue' : PLACEHOLDER}</Text>;
}

/** « ✓ Fait » : coche et libellé en secondaire. */
function DoneStatus({ label }: { label: string }) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name="checkmark" size={size.iconSmall} color={colors.textMuted} aria-hidden />
      <Text style={text.meta}>{label}</Text>
    </View>
  );
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

type TodayCardProps = {
  /** Une des sources de la carte n'est pas encore lue : indicateur sous les lignes. */
  loading: boolean;
  /** Entraînement club à proposer ce soir ; null sinon. */
  club: ClubProposal | null;
  clubSaving: boolean;
  /** Échec de l'enregistrement de la séance club, brut. */
  clubError: string | null;
  /** Échec de la mémorisation de « Pas ce soir » sur l'appareil, brut. */
  dismissError: string | null;
  onConfirmClub: (proposal: ClubProposal) => void;
  onDismissClub: () => void;
  /** null : ligne absente (activité pas encore lue, ou journée faite). */
  quizDone: boolean | null;
  test: SuggestedTest | null;
  /** Rien à proposer : une ligne « Journée faite » seule. */
  dayDone: boolean;
};

/**
 * Carte « Aujourd'hui » : ce qu'il y a à faire, chaque ligne lancée en un tap.
 * Entraînement club du soir (✓ et « Pas ce soir »), quiz du jour (« ✓ Fait » dès
 * une réponse), test suggéré (masqué dès qu'un test a été fait aujourd'hui) ;
 * rien à proposer : « Journée faite ».
 */
function TodayCard({
  loading,
  club,
  clubSaving,
  clubError,
  dismissError,
  onConfirmClub,
  onDismissClub,
  quizDone,
  test,
  dayDone,
}: TodayCardProps) {
  return (
    <Card style={styles.todayCard}>
      <Text role="heading" style={text.overline}>
        Aujourd’hui
      </Text>
      {club !== null ? (
        <ClubLine
          proposal={club}
          saving={clubSaving}
          error={clubError}
          onConfirm={() => onConfirmClub(club)}
          onDismiss={onDismissClub}
        />
      ) : null}
      {quizDone !== null ? (
        <TodayLine
          icon="help-circle"
          iconColor={colors.quiz}
          title="Quiz du jour"
          caption={
            quizDone ? <DoneStatus label="Fait" /> : <Text style={[text.meta, TODO_STYLES.quiz]}>À faire</Text>
          }
          accessibilityLabel={`Quiz du jour : ${quizDone ? 'fait' : 'à faire'}. Ouvrir le quiz`}
          onPress={() => router.navigate('/quiz')}
        />
      ) : null}
      {test !== null ? (
        <TodayLine
          icon="stopwatch"
          iconColor={colors.text}
          title={`Test suggéré : ${test.title}`}
          caption={<Text style={text.meta}>{test.reason}</Text>}
          accessibilityLabel={`Test suggéré : ${test.title} · ${test.reason}. Ouvrir le test`}
          onPress={() => router.push({ pathname: '/test/[slug]', params: { slug: test.slug } })}
        />
      ) : null}
      {dayDone ? (
        <TodayLine
          icon="checkmark-done"
          iconColor={colors.success}
          title="Journée faite"
          caption={<Text style={text.meta}>Rien d’autre à proposer aujourd’hui.</Text>}
        />
      ) : null}
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {dismissError !== null ? <FieldError message={DISMISS_ERROR_MESSAGE} error={dismissError} /> : null}
    </Card>
  );
}

type TodayLineProps = {
  icon: IconName;
  iconColor: string;
  title: string;
  /** Sous le titre : état ou raison, en secondaire. */
  caption: ReactNode;
  accessibilityLabel?: string;
  /** Présent : ligne tappable, chevron à droite. */
  onPress?: () => void;
};

/** Ligne de la carte Aujourd'hui : tuile d'icône, titre, état ; tappable avec onPress. */
function TodayLine({ icon, iconColor, title, caption, accessibilityLabel, onPress }: TodayLineProps) {
  const content = (
    <>
      <LineIcon icon={icon} color={iconColor} />
      <View style={styles.lineText}>
        <Text style={text.bodyStrong}>{title}</Text>
        {caption}
      </View>
      {onPress !== undefined ? (
        <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
      ) : null}
    </>
  );
  if (onPress === undefined) {
    return <View style={styles.line}>{content}</View>;
  }
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.line, pressed && styles.linePressed]}
    >
      {content}
    </Pressable>
  );
}

/** Tuile d'une ligne : carré de 48 px surface2, comme la tuile d'un module. Décorative. */
function LineIcon({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View aria-hidden style={styles.lineIcon}>
      <Ionicons name={icon} size={size.icon} color={color} />
    </View>
  );
}

type ClubLineProps = {
  proposal: ClubProposal;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
};

/** « Entraînement club ce soir ? » : ✓ l'enregistre en un tap, « Pas ce soir » l'écarte pour la journée. */
function ClubLine({ proposal, saving, error, onConfirm, onDismiss }: ClubLineProps) {
  const details = `${proposal.name} · ${proposal.durationMin}${NBSP}min`;
  return (
    <View style={styles.clubBlock}>
      <View style={styles.line}>
        <ModuleIcon module={CLUB_MODULE_KEY} />
        <View style={styles.lineText}>
          <Text style={text.bodyStrong}>Entraînement club ce soir ?</Text>
          <Text style={text.meta}>{details}</Text>
        </View>
        <IconButton
          icon="checkmark"
          accessibilityLabel={`Oui : enregistrer ${details}`}
          loading={saving}
          onPress={onConfirm}
        />
      </View>
      <InlineAction label="Pas ce soir" disabled={saving} onPress={onDismiss} />
      {error !== null ? <FieldError message="Séance club non enregistrée." error={error} /> : null}
    </View>
  );
}

/** Action discrète sous le texte d'une ligne (« Pas ce soir ») : libellé orange, 48 px de haut, fond à l'appui. */
function InlineAction({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.inlineAction, pressed && styles.linePressed, disabled && styles.disabled]}
    >
      <Text style={[text.button, styles.inlineActionLabel]}>{label}</Text>
    </Pressable>
  );
}

type DayStripCardProps = {
  /** Jours de la bande, du plus ancien à today + 14 (lib/day-strip.ts). */
  days: readonly string[];
  today: string;
  selectedDay: string;
  /** Points ; null tant que l'activité n'est pas lue. */
  activity: ActivityHistory | null;
  /** Jours de club habituels : point creux des jours à venir. */
  clubWeekdays: ReadonlySet<number>;
  /** Jour à centrer ; nonce : relance le centrage, même sur le même jour. */
  center: { day: string; nonce: number };
  onSelectDay: (day: string) => void;
  /** « Voir le mois », sur le mois du jour choisi s'il est visible, sinon des jours visibles. */
  onOpenMonth: (anchorDay: string) => void;
};

/**
 * Bande des jours : continue, 7 jours visibles, glissée au doigt jour par jour
 * (aimantation sur chaque jour), aujourd'hui centré à l'ouverture ; ‹ › décalent
 * de 7 jours, sans animation (scrollTo animated: false) ; titre = mois visibles.
 * Jours à venir inertes, point creux orange les jours de club habituels.
 */
function DayStripCard({ days, today, selectedDay, activity, clubWeekdays, center, onSelectDay, onOpenMonth }: DayStripCardProps) {
  const scrollRef = useRef<ScrollView>(null);
  // Largeur de la bande (onLayout) : une case = 1/7.
  const [width, setWidth] = useState(0);
  // Premier jour visible (rang dans days), suivi au défilement.
  const [startIndex, setStartIndex] = useState(() => centeredStripIndex(days, center.day));
  // Centrage en attente du contenu (bande pas encore remplie ou tout juste agrandie).
  const pendingCenterRef = useRef<string | null>(null);
  // Nombre de jours de la bande déjà posés à l'écran (dernier onContentSizeChange).
  const laidOutCountRef = useRef(0);
  const cellWidth = width / STRIP_VISIBLE_DAYS;

  function scrollToIndex(index: number) {
    const clamped = clampStripIndex(days.length, index);
    scrollRef.current?.scrollTo({ x: clamped * cellWidth, animated: false });
    setStartIndex(clamped);
  }

  // Demande de centrage (ouverture, jour choisi dans le mois, retour d'une séance) :
  // aussitôt si la bande est posée telle quelle, sinon dès que son contenu l'est.
  useEffect(() => {
    if (width === 0 || days.length !== laidOutCountRef.current) {
      pendingCenterRef.current = center.day;
      return;
    }
    scrollToIndex(centeredStripIndex(days, center.day));
    // Seulement à une nouvelle demande ou à la première mesure : un défilement au doigt reste où il est.
  }, [center, width]);

  function handleContentSizeChange(contentWidth: number) {
    // Avant la mesure, la bande est vide : ses jours ne sont pas encore posés.
    if (cellWidth === 0 || contentWidth === 0) {
      return;
    }
    laidOutCountRef.current = days.length;
    const pending = pendingCenterRef.current;
    if (pending !== null) {
      pendingCenterRef.current = null;
      scrollToIndex(centeredStripIndex(days, pending));
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (cellWidth === 0) {
      return;
    }
    const index = clampStripIndex(days.length, Math.round(event.nativeEvent.contentOffset.x / cellWidth));
    setStartIndex((current) => (current === index ? current : index));
  }

  const lastIndex = clampStripIndex(days.length, days.length);
  const visible = days.slice(startIndex, startIndex + STRIP_VISIBLE_DAYS);
  const title = visible.length > 0 ? formatMonthSpan(visible[0], visible[visible.length - 1], today) : '';
  const anchor = visible.includes(selectedDay) ? selectedDay : (visible[STRIP_CENTER_OFFSET] ?? selectedDay);

  return (
    <Card style={styles.stripCard}>
      <View style={styles.stripHeader}>
        <Text numberOfLines={1} role="heading" style={[text.overline, styles.stripTitle]}>
          {title}
        </Text>
        {/* Deux boutons compacts à 16 px : leurs zones tactiles de 48 se touchent sans se recouvrir. */}
        <View style={styles.stripNav}>
          <IconButton
            compact
            subtle
            icon="chevron-back"
            accessibilityLabel="7 jours plus tôt"
            disabled={startIndex === 0}
            onPress={() => scrollToIndex(startIndex - STRIP_VISIBLE_DAYS)}
          />
          <IconButton
            compact
            subtle
            icon="chevron-forward"
            accessibilityLabel="7 jours plus tard"
            disabled={startIndex >= lastIndex}
            onPress={() => scrollToIndex(startIndex + STRIP_VISIBLE_DAYS)}
          />
        </View>
      </View>

      {/* Sept cases sans écart : à 8 px des bords de la carte, elles gardent 48 px de large sur un iPhone de 390. */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        {...dayByDaySnapping(cellWidth)}
      >
        {cellWidth > 0
          ? days.map((cellDay) => {
              // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre des jours.
              const future = cellDay > today;
              return (
                <View key={cellDay} style={[styles.stripCell, { width: cellWidth }]}>
                  <DayCell
                    day={cellDay}
                    // Initiales du lundi au dimanche ; weekdayOf compte depuis dimanche.
                    initial={WEEKDAY_INITIALS[(weekdayOf(cellDay) + 6) % 7]}
                    isToday={cellDay === today}
                    isSelected={cellDay === selectedDay}
                    isFuture={future}
                    // Jour à venir : rien à y voir, inerte sans être estompé (son numéro est déjà en secondaire).
                    disabled={future}
                    faded={false}
                    hasTraining={activity !== null && activity.trainingDays.has(cellDay)}
                    hasQuiz={activity !== null && activity.quizDays.has(cellDay)}
                    clubPlanned={future && isClubPlannedDay(cellDay, today, clubWeekdays)}
                    onPress={() => onSelectDay(cellDay)}
                  />
                </View>
              );
            })
          : null}
      </ScrollView>

      <View style={styles.stripFooter}>
        <ActivityLegend clubPlanned />
        <Button variant="text" label="Voir le mois" icon="chevron-forward" onPress={() => onOpenMonth(anchor)} />
      </View>
    </Card>
  );
}

/**
 * Aimantation jour par jour : sur le web, l'accrochage CSS de react-native-web
 * (pagingEnabled pose scroll-snap sur chaque case) ; en natif, un pas d'une case,
 * sans élan qui en saute plusieurs (iOS).
 */
function dayByDaySnapping(cellWidth: number): Partial<ScrollViewProps> {
  if (Platform.OS === 'web') {
    return { pagingEnabled: true };
  }
  return cellWidth > 0 ? { snapToInterval: cellWidth, decelerationRate: 'fast', disableIntervalMomentum: true } : {};
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
      <View style={styles.lineText}>
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

type WeekCardProps = {
  today: string;
  activity: ActivityHistory | null;
  /** Séances de travail personnel visées par semaine ; null tant que le profil n'est pas lu. */
  weeklyGoal: number | null;
  loading: boolean;
  /** Profil illisible : l'objectif n'est pas connu, la carte dit l'erreur. */
  profileError: string | null;
  onPress: () => void;
  onRetry: () => void;
};

/**
 * « Cette semaine » (du lundi au dimanche) : séances de travail personnel sur
 * l'objectif hebdomadaire en chiffre dominant (« 2/3 ») ; jours actifs (séance
 * ou réponse, tout module) et minutes de travail personnel en secondaire.
 * Tappable : feuille de l'objectif hebdomadaire.
 */
function WeekCard({ today, activity, weeklyGoal, loading, profileError, onPress, onRetry }: WeekCardProps) {
  const label = (
    <Text role="heading" style={text.overline}>
      Cette semaine
    </Text>
  );
  if (activity === null || weeklyGoal === null) {
    // Pas tappable tant que l'objectif n'est pas connu : « Réessayer » ne se loge pas dans une carte tappable.
    return (
      <Card style={styles.weekCard}>
        {label}
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {profileError !== null ? <SectionError error={profileError} onRetry={onRetry} /> : null}
        {!loading && profileError === null ? <Text style={text.number}>{PLACEHOLDER}</Text> : null}
      </Card>
    );
  }
  const work = weekWork(activity.sessions, today);
  const activeDays = weekDays(startOfWeek(today)).filter(
    (weekDay) => activity.trainingDays.has(weekDay) || activity.quizDays.has(weekDay),
  ).length;
  const sessionsLabel = work.sessions >= 2 ? 'séances de travail perso' : 'séance de travail perso';
  const details = `${formatCount(activeDays, 'jour actif', 'jours actifs')} · ${formatMinutes(work.minutes)} de travail perso`;
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Cette semaine : ${work.sessions} ${sessionsLabel} sur ${weeklyGoal}, ${details}. Régler l’objectif de la semaine`}
      style={styles.weekCard}
    >
      {label}
      <View style={styles.numberRow}>
        <Text style={text.number}>
          {work.sessions}
          <Text style={text.denominator}>{`/${weeklyGoal}`}</Text>
        </Text>
        <Text style={[text.meta, styles.numberLabel]}>{sessionsLabel}</Text>
      </View>
      <Text style={text.meta}>{details}</Text>
    </Card>
  );
}

type GoalsSectionProps = {
  goals: Loadable<GoalRow[]>;
  progress: Loadable<HomeProgress>;
  /** Objectifs avec leur mesure et leur progression ; null tant que les deux lectures ne sont pas prêtes. */
  views: GoalView[] | null;
  today: string;
  onOpenGoal: (goalId: string) => void;
  onAddGoal: () => void;
  onRetryGoals: () => void;
  onRetryProgress: () => void;
};

/**
 * « Mes objectifs » : un objectif actif par ligne (mesure, départ → cible,
 * barre de progression, état), « Ajouter un objectif » tant qu'il y en a moins
 * de 3, un état vide qui le dit et porte le bouton.
 */
function GoalsSection({
  goals,
  progress,
  views,
  today,
  onOpenGoal,
  onAddGoal,
  onRetryGoals,
  onRetryProgress,
}: GoalsSectionProps) {
  const problems = progress.status === 'ready' ? progress.data.problems : [];
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.title}>
        Mes objectifs
      </Text>
      {goals.status === 'loading' || progress.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
      {goals.status === 'error' ? <SectionError error={goals.message} onRetry={onRetryGoals} /> : null}
      {progress.status === 'error' ? <SectionError error={progress.message} onRetry={onRetryProgress} /> : null}
      <FieldError message={problems.length > 0 ? problems.join('\n') : null} />
      {views !== null && views.length === 0 ? (
        // secondary : le pied de l'écran porte déjà l'action principale (« Nouvelle séance »).
        <EmptyState
          title="Aucun objectif"
          message="Choisis une mesure d’un test et la valeur à atteindre : ta progression s’affichera ici à chaque résultat."
          action={{ label: 'Ajouter un objectif', onPress: onAddGoal, variant: 'secondary' }}
        />
      ) : null}
      {views !== null
        ? views.map((view) => <GoalCard key={view.row.id} view={view} today={today} onPress={() => onOpenGoal(view.row.id)} />)
        : null}
      {views !== null && views.length > 0 && views.length < MAX_ACTIVE_GOALS ? (
        <Button variant="secondary" label="Ajouter un objectif" onPress={onAddGoal} />
      ) : null}
      {views !== null && views.length >= MAX_ACTIVE_GOALS ? (
        <Text style={text.meta}>
          {`${MAX_ACTIVE_GOALS}${NBSP}objectifs en cours, le maximum : retire-en un pour en ajouter un autre.`}
        </Text>
      ) : null}
    </View>
  );
}

/** Objectif : mesure et état, départ → cible, barre de progression ; ouvre sa feuille. */
function GoalCard({ view, today, onPress }: { view: GoalView; today: string; onPress: () => void }) {
  const { row, measure, progress } = view;
  const name = measure?.name ?? 'Mesure introuvable';
  const state = progress !== null ? formatGoalState(progress.state, today) : 'Mesure absente du catalogue';
  const range = formatGoalRange(row.start_value, row.target_value, measure?.unit ?? '');
  const best =
    progress !== null && progress.best !== null && measure !== null
      ? `, meilleur depuis la création ${formatMeasure(progress.best, measure.unit)}`
      : '';
  const reached = progress?.state.kind === 'reached';
  return (
    <Card onPress={onPress} accessibilityLabel={`Objectif ${name} : ${range}${best}, ${state}. Ouvrir l’objectif`} style={styles.goalCard}>
      <View style={styles.goalHeading}>
        <Text style={[text.bodyStrong, styles.goalName]}>{name}</Text>
        <Text style={[text.meta, reached && styles.reachedText]}>{state}</Text>
      </View>
      <Text style={[text.meta, text.tabular]}>{range}</Text>
      <ProgressBar ratio={progress?.ratio ?? 0} reached={reached} />
    </Card>
  );
}

/** Barre de progression du départ à la cible ; verte une fois la cible atteinte. Décorative : l'état est écrit. */
function ProgressBar({ ratio, reached }: { ratio: number; reached: boolean }) {
  return (
    <View aria-hidden style={styles.progressTrack}>
      <View style={[styles.progressFill, { flex: ratio }, reached && styles.progressReached]} />
      <View style={{ flex: 1 - ratio }} />
    </View>
  );
}

/** « Derniers records » : les 3 plus récents ; chacun ouvre la courbe de sa mesure. */
function RecordsSection({ records, today, onOpen }: { records: RecordView[]; today: string; onOpen: (catalogId: string) => void }) {
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.title}>
        Derniers records
      </Text>
      <Card style={styles.recordsCard}>
        {records.map(({ event, measure }) => {
          const value = formatMeasure(event.value, measure.unit);
          const when = relativeDay(event.date, today);
          return (
            <Pressable
              key={`${event.testId}-${event.created_at}`}
              role="button"
              accessibilityLabel={`Record ${measure.name} : ${value}, ${when}. Voir la courbe`}
              onPress={() => onOpen(measure.catalogId)}
              style={({ pressed }) => [styles.recordLine, pressed && styles.linePressed]}
            >
              <Ionicons name="trophy" size={size.icon} color={colors.success} aria-hidden />
              <View style={styles.lineText}>
                <Text style={text.bodyStrong}>{measure.name}</Text>
                <Text style={text.meta}>{when}</Text>
              </View>
              <Text style={[text.bodyStrong, text.tabular]}>{value}</Text>
              <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

type WeeklyGoalSheetProps = {
  visible: boolean;
  initialGoal: number;
  onClose: () => void;
  /** Enregistre ; renvoie l'erreur brute à afficher, ou null (la feuille se ferme). */
  onSave: (value: number) => Promise<string | null>;
};

/** Feuille de l'objectif hebdomadaire : séances de travail personnel par semaine, de 1 à 7, − / +. */
function WeeklyGoalSheet({ visible, initialGoal, onClose, onSave }: WeeklyGoalSheetProps) {
  const [value, setValue] = useState(initialGoal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function save() {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setSaving(true);
    setError(null);
    const saveError = await onSave(value);
    pendingRef.current = false;
    setSaving(false);
    setError(saveError);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Objectif de la semaine">
      <Text style={text.body}>Séances de travail personnel par semaine, du lundi au dimanche. L’entraînement club n’y compte pas.</Text>
      <View style={styles.stepper}>
        <IconButton
          icon="remove"
          accessibilityLabel="Une séance de moins"
          disabled={value <= MIN_WEEKLY_SESSION_GOAL}
          onPress={() => setValue((current) => Math.max(MIN_WEEKLY_SESSION_GOAL, current - 1))}
        />
        <View accessible accessibilityLabel={formatCount(value, 'séance', 'séances')} style={styles.stepperValue}>
          <Text style={text.number}>{value}</Text>
          <Text style={text.meta}>{value >= 2 ? 'séances' : 'séance'}</Text>
        </View>
        <IconButton
          icon="add"
          accessibilityLabel="Une séance de plus"
          disabled={value >= MAX_WEEKLY_SESSION_GOAL}
          onPress={() => setValue((current) => Math.min(MAX_WEEKLY_SESSION_GOAL, current + 1))}
        />
      </View>
      {error !== null ? <FieldError message="Objectif non enregistré." error={error} /> : null}
      <Button label="Enregistrer" loading={saving} onPress={save} />
    </BottomSheet>
  );
}

/** Étape de la feuille d'ajout : test → mesure → cible et échéance ; deadline : le calendrier de l'échéance. */
type AddGoalStep = { kind: 'test' } | { kind: 'measure'; test: TestSummary } | { kind: 'form'; measure: MeasureInfo; viaMeasure: boolean } | { kind: 'deadline'; measure: MeasureInfo; viaMeasure: boolean };

type AddGoalSheetProps = {
  visible: boolean;
  today: string;
  progress: HomeProgress;
  /** Objectifs actifs : leurs mesures ne se reprennent pas. */
  activeGoals: readonly GoalRow[];
  onClose: () => void;
  /** Crée l'objectif ; renvoie l'erreur brute à afficher, ou null (la feuille se ferme). */
  onCreate: (goal: GoalInput, name: string) => Promise<string | null>;
};

/**
 * Ajout d'un objectif : un test, puis une de ses mesures (dernier résultat et
 * record affichés ; étape sautée pour un test à une seule mesure), puis la
 * cible et l'échéance (J+42 proposée, calendrier des jours à venir).
 */
function AddGoalSheet({ visible, today, progress, activeGoals, onClose, onCreate }: AddGoalSheetProps) {
  const [step, setStep] = useState<AddGoalStep>({ kind: 'test' });
  const [targetText, setTargetText] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(() => defaultDeadline(today));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  // Id de l'objectif, tiré au premier envoi et gardé pour chaque réessai : la base ignore un second envoi.
  const goalIdRef = useRef<string | null>(null);

  const takenIds = new Set(activeGoals.map((goal) => goal.test_id));
  const infoByKey = new Map([...progress.measures.values()].map((info) => [info.key, info]));
  /** Mesures du test qui peuvent porter un objectif : au catalogue, sans objectif actif. */
  const freeMeasures = (test: TestSummary) =>
    test.exercise.measures.flatMap((measure): MeasureInfo[] => {
      const info = infoByKey.get(measure.key);
      return info !== undefined && !takenIds.has(info.catalogId) ? [info] : [];
    });

  function chooseTest(test: TestSummary) {
    const free = freeMeasures(test);
    if (test.exercise.measures.length === 1 && free.length === 1) {
      chooseMeasure(free[0], false);
      return;
    }
    setStep({ kind: 'measure', test });
  }

  function chooseMeasure(measure: MeasureInfo, viaMeasure: boolean) {
    setTargetText('');
    setTargetError(null);
    setSaveError(null);
    goalIdRef.current = null;
    setStep({ kind: 'form', measure, viaMeasure });
  }

  async function create(measure: MeasureInfo) {
    if (pendingRef.current) {
      return;
    }
    const start = measure.test.latest.get(measure.key)?.value ?? null;
    const target = parseTarget(targetText, start, measure.unit, measure.higherIsBetter);
    if (target.error !== null) {
      // Saisie conservée ; le message est sous le champ.
      setTargetError(target.error);
      return;
    }
    pendingRef.current = true;
    goalIdRef.current ??= randomUuid();
    setSaving(true);
    setSaveError(null);
    const error = await onCreate(
      {
        id: goalIdRef.current,
        sheet_id: measure.test.id,
        test_id: measure.catalogId,
        start_value: start,
        target_value: target.value,
        deadline,
      },
      measure.name,
    );
    pendingRef.current = false;
    setSaving(false);
    setSaveError(error);
  }

  if (step.kind === 'test') {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Choisir un test">
        {progress.tests.length === 0 ? (
          <Text style={text.meta}>Aucun test atomique en base : le contenu vient des seeds.</Text>
        ) : null}
        {SKILLS.map((skill) => {
          const tests = progress.tests.filter((test) => test.skill === skill.key);
          if (tests.length === 0) {
            return null;
          }
          return (
            <View key={skill.key} style={styles.sheetGroup}>
              <Text role="heading" style={text.overline}>
                {skill.label}
              </Text>
              {tests.map((test) => {
                const available = freeMeasures(test).length > 0;
                const caption = !available
                  ? 'Objectif en cours sur chaque mesure'
                  : test.lastDate === null
                    ? 'Jamais fait'
                    : `Dernière fois : ${relativeDay(test.lastDate, today)}`;
                return (
                  <SheetRow
                    key={test.id}
                    title={test.title}
                    caption={caption}
                    disabled={!available}
                    onPress={() => chooseTest(test)}
                  />
                );
              })}
            </View>
          );
        })}
      </BottomSheet>
    );
  }

  if (step.kind === 'measure') {
    const { test } = step;
    return (
      <BottomSheet visible={visible} onClose={onClose} onBack={() => setStep({ kind: 'test' })} title="Choisir une mesure">
        <Text style={text.bodyStrong}>{test.title}</Text>
        <View style={styles.sheetGroup}>
          {test.exercise.measures.map((measure) => {
            const info = infoByKey.get(measure.key);
            const taken = info !== undefined && takenIds.has(info.catalogId);
            const caption =
              info === undefined
                ? 'Mesure absente du catalogue : lancer le seed des tests.'
                : taken
                  ? 'Objectif en cours'
                  : measureSummary(test, measure.key, measure.unit, today);
            return (
              <SheetRow
                key={measure.key}
                title={measure.name}
                caption={caption}
                disabled={info === undefined || taken}
                onPress={() => {
                  if (info !== undefined) {
                    chooseMeasure(info, true);
                  }
                }}
              />
            );
          })}
        </View>
      </BottomSheet>
    );
  }

  const { measure, viaMeasure } = step;
  const back = () => (viaMeasure ? setStep({ kind: 'measure', test: measure.test }) : setStep({ kind: 'test' }));

  if (step.kind === 'deadline') {
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        onBack={() => setStep({ kind: 'form', measure, viaMeasure })}
        title="Échéance"
      >
        <MonthCalendar
          today={today}
          selectedDay={deadline}
          mode="deadline"
          activity={null}
          onPickDay={(picked) => {
            setDeadline(picked);
            setStep({ kind: 'form', measure, viaMeasure });
          }}
        />
      </BottomSheet>
    );
  }

  const start = measure.test.latest.get(measure.key)?.value ?? null;
  return (
    <BottomSheet visible={visible} onClose={onClose} onBack={back} title="Nouvel objectif">
      <View style={styles.sheetGroup}>
        <Text style={text.bodyStrong}>{measure.name}</Text>
        <Text style={text.meta}>{measureSummary(measure.test, measure.key, measure.unit, today)}</Text>
        <Text style={text.meta}>
          {start !== null ? `Départ : ${formatMeasure(start, measure.unit)} (dernier résultat)` : 'Départ : aucun, jamais mesuré'}
        </Text>
      </View>
      <TargetField
        value={targetText}
        unit={measure.unit}
        higherIsBetter={measure.higherIsBetter}
        problem={targetError}
        onChange={(value) => {
          setTargetText(value);
          setTargetError(null);
        }}
      />
      <DeadlineRow deadline={deadline} today={today} onPress={() => setStep({ kind: 'deadline', measure, viaMeasure })} />
      {saveError !== null ? <FieldError message="Objectif non créé." error={saveError} /> : null}
      <Button label="Créer l’objectif" loading={saving} onPress={() => create(measure)} />
    </BottomSheet>
  );
}

/** « Dernier : 8 touches · hier · Record : 12 touches », ou « Jamais mesuré ». */
function measureSummary(test: TestSummary, key: string, unit: string, today: string): string {
  const latest = test.latest.get(key);
  const record = test.records.get(key);
  if (latest === undefined) {
    return 'Jamais mesuré';
  }
  const last = `Dernier : ${formatMeasure(latest.value, unit)} · ${relativeDay(latest.date, today)}`;
  return record !== undefined ? `${last} · Record : ${formatMeasure(record, unit)}` : last;
}

type SheetRowProps = { title: string; caption: string; disabled: boolean; onPress: () => void };

/** Ligne de choix d'une feuille (test, mesure) : titre, précision, chevron ; estompée et inerte si indisponible. */
function SheetRow({ title, caption, disabled, onPress }: SheetRowProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${title}, ${caption}`}
      aria-disabled={disabled}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.linePressed, disabled && styles.disabled]}
    >
      <View style={styles.lineText}>
        <Text style={text.bodyStrong}>{title}</Text>
        <Text style={text.meta}>{caption}</Text>
      </View>
      <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

type TargetFieldProps = {
  value: string;
  unit: string;
  higherIsBetter: boolean;
  /** Saisie refusée : message de l'app (parseTarget) sous le champ, saisie conservée. */
  problem: string | null;
  onChange: (value: string) => void;
};

/** Cible : nombre (virgule ou point) et son unité, sens rappelé ; erreur sous le champ. */
function TargetField({ value, unit, higherIsBetter, problem, onChange }: TargetFieldProps) {
  return (
    <View style={layout.section}>
      <View style={styles.labelGroup}>
        <Text style={text.overline}>Cible</Text>
        <Text style={text.meta}>{higherIsBetter ? 'Plus haut = mieux.' : 'Plus bas = mieux (temps).'}</Text>
      </View>
      <View style={styles.targetRow}>
        <TextInput
          {...inputProps}
          style={[input.field, styles.targetInput, problem !== null && input.invalid]}
          value={value}
          onChangeText={onChange}
          inputMode="decimal"
          placeholder="20"
          accessibilityLabel={`Cible en ${unit}`}
        />
        <Text style={text.meta}>{unit}</Text>
      </View>
      <FieldError message={problem} />
    </View>
  );
}

/** Échéance : « Dim. 22 nov. · J-42 » ; le tap ouvre le calendrier des jours à venir. */
function DeadlineRow({ deadline, today, onPress }: { deadline: string; today: string; onPress: () => void }) {
  const label = formatDeadlineLine(deadline, today);
  return (
    <View style={layout.section}>
      <Text style={text.overline}>Échéance</Text>
      <Pressable
        role="button"
        accessibilityLabel={`Échéance : ${label}. Changer d’échéance`}
        onPress={onPress}
        style={({ pressed }) => [styles.pickerRow, pressed && styles.linePressed]}
      >
        <Ionicons name="calendar-outline" size={size.icon} color={colors.textMuted} aria-hidden />
        <Text numberOfLines={1} style={[text.bodyStrong, styles.lineText]}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={size.icon} color={colors.textMuted} aria-hidden />
      </Pressable>
    </View>
  );
}

type GoalDetailSheetProps = {
  visible: boolean;
  today: string;
  view: GoalView;
  onClose: () => void;
  /** Enregistre cible et échéance ; renvoie l'erreur brute à afficher, ou null (la feuille se ferme). */
  onSave: (goalId: string, targetValue: number, deadline: string) => Promise<string | null>;
  /** Retire l'objectif ; même contrat. */
  onRetire: (goalId: string) => Promise<string | null>;
  onOpenCurve: (catalogId: string) => void;
};

/** Feuille d'un objectif : état et progression, cible et échéance modifiables, courbe, retrait (confirmé). */
function GoalDetailSheet({ visible, today, view, onClose, onSave, onRetire, onOpenCurve }: GoalDetailSheetProps) {
  const { row, measure, progress } = view;
  const [targetText, setTargetText] = useState(() => formatDecimal(row.target_value));
  const [targetError, setTargetError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(row.deadline);
  const [pickingDeadline, setPickingDeadline] = useState(false);
  const [busy, setBusy] = useState<'save' | 'retire' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function run(kind: 'save' | 'retire', action: () => Promise<string | null>) {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setBusy(kind);
    setError(null);
    const actionError = await action();
    pendingRef.current = false;
    setBusy(null);
    setError(actionError);
  }

  function save() {
    if (measure === null) {
      return;
    }
    const target = parseTarget(targetText, row.start_value, measure.unit, measure.higherIsBetter);
    if (target.error !== null) {
      setTargetError(target.error);
      return;
    }
    run('save', () => onSave(row.id, target.value, deadline));
  }

  function confirmRetire() {
    const name = measure?.name ?? 'cet objectif';
    confirmAction(`Retirer l’objectif « ${name} »`, RETIRE_QUESTION, 'Retirer', () => {
      run('retire', () => onRetire(row.id));
    });
  }

  if (pickingDeadline) {
    return (
      <BottomSheet visible={visible} onClose={onClose} onBack={() => setPickingDeadline(false)} title="Échéance">
        <MonthCalendar
          today={today}
          selectedDay={deadline}
          // Échéance dépassée : le calendrier s'ouvre sur demain, le premier jour possible.
          anchorDay={deadline > today ? deadline : shiftDay(today, 1)}
          mode="deadline"
          activity={null}
          onPickDay={(picked) => {
            setDeadline(picked);
            setPickingDeadline(false);
          }}
        />
      </BottomSheet>
    );
  }

  const parsed = Number(targetText.trim().replace(',', '.'));
  const changed = deadline !== row.deadline || !(Number.isFinite(parsed) && parsed === row.target_value);
  const reached = progress?.state.kind === 'reached';
  return (
    <BottomSheet visible={visible} onClose={onClose} title={measure?.name ?? 'Objectif'}>
      {measure === null || progress === null ? (
        <Text style={text.body}>Mesure absente du catalogue : l’objectif ne peut plus être suivi, seulement retiré.</Text>
      ) : (
        <View style={styles.sheetGroup}>
          <View style={styles.goalHeading}>
            <Text style={[text.bodyStrong, text.tabular, styles.goalName]}>
              {formatGoalRange(row.start_value, row.target_value, measure.unit)}
            </Text>
            <Text style={[text.meta, reached && styles.reachedText]}>{formatGoalState(progress.state, today)}</Text>
          </View>
          <ProgressBar ratio={progress.ratio} reached={reached} />
          <Text style={text.meta}>
            {progress.best !== null
              ? `Meilleur depuis la création : ${formatMeasure(progress.best, measure.unit)}`
              : 'Aucun résultat depuis la création.'}
          </Text>
        </View>
      )}
      {measure !== null ? (
        <>
          <TargetField
            value={targetText}
            unit={measure.unit}
            higherIsBetter={measure.higherIsBetter}
            problem={targetError}
            onChange={(value) => {
              setTargetText(value);
              setTargetError(null);
            }}
          />
          <DeadlineRow deadline={deadline} today={today} onPress={() => setPickingDeadline(true)} />
        </>
      ) : null}
      {error !== null ? <FieldError message="Objectif non modifié." error={error} /> : null}
      {measure !== null ? (
        <Button label="Enregistrer" loading={busy === 'save'} disabled={!changed || busy !== null} onPress={save} />
      ) : null}
      {measure !== null ? (
        <Button variant="secondary" label="Voir la courbe" onPress={() => onOpenCurve(measure.catalogId)} />
      ) : null}
      <Button variant="danger" label="Retirer l’objectif" loading={busy === 'retire'} disabled={busy === 'save'} onPress={confirmRetire} />
    </BottomSheet>
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
  todayCard: {
    gap: spacing.sm,
  },
  /** Ligne d'action : au moins 48 px, tuile, texte, chevron ou bouton. */
  line: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  linePressed: {
    backgroundColor: colors.surfacePressed,
  },
  lineText: {
    flex: 1,
    gap: spacing.xs,
  },
  lineIcon: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  clubBlock: {
    gap: spacing.xs,
  },
  /** « Pas ce soir » : aligné sur le texte de la ligne, sous la tuile de 48 et son écart de 12. */
  inlineAction: {
    alignSelf: 'flex-start',
    minHeight: size.touch,
    justifyContent: 'center',
    marginLeft: size.touch + spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
  },
  inlineActionLabel: {
    color: colors.accent,
  },
  disabled: {
    opacity: disabledOpacity,
  },
  /** Marges latérales réduites à 8 px : la place va aux sept cases. */
  stripCard: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  stripTitle: {
    flex: 1,
  },
  stripNav: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  /** Case d'un jour : la largeur d'un septième, la case s'y étend. */
  stripCell: {
    flexDirection: 'row',
  },
  // Légende à gauche, « Voir le mois » à droite ; l'un passe sous l'autre si la place manque.
  stripFooter: {
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
  weekCard: {
    gap: spacing.sm,
  },
  /** Chiffre et son libellé sur une même ligne de base (DA). */
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  numberLabel: {
    flexShrink: 1,
  },
  goalCard: {
    gap: spacing.sm,
  },
  goalHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  goalName: {
    flex: 1,
  },
  reachedText: {
    color: colors.success,
  },
  progressTrack: {
    height: size.progressBar,
    flexDirection: 'row',
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: {
    backgroundColor: colors.accent,
  },
  progressReached: {
    backgroundColor: colors.success,
  },
  recordsCard: {
    gap: spacing.xs,
  },
  recordLine: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  stepperValue: {
    alignItems: 'center',
  },
  sheetGroup: {
    gap: spacing.sm,
  },
  sheetRow: {
    minHeight: size.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
  },
  /** Libellé et sa précision serrés. */
  labelGroup: {
    gap: spacing.xs,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  targetInput: {
    flex: 1,
  },
  /** Ligne de choix : même fond et mêmes coins qu'un champ, au moins la hauteur d'un bouton (formulaire de séance). */
  pickerRow: {
    minHeight: size.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface2,
  },
});
