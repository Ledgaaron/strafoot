import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';

import { BottomSheet } from '../../components/bottom-sheet';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Chip } from '../../components/chip';
import { DurationValue } from '../../components/duration-value';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { IconButton, type IconName } from '../../components/icon-button';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { useAuth } from '../../lib/auth-context';
import { formatShortDay, formatShortMonth, localToday, relativeDay } from '../../lib/dates';
import { getQuizStats, listAnswerDays } from '../../lib/db/answers';
import { getMyProfile } from '../../lib/db/profiles';
import { listSessions } from '../../lib/db/sessions';
import { countSheets, listTests } from '../../lib/db/training';
import {
  buildRegularityWeeks,
  countActiveWeeks,
  describeTrend,
  formatMinutes,
  initialsOf,
  joinCaption,
  monthVolume,
  REGULARITY_WEEK_COUNT,
  regularityStart,
  summarizeSkills,
  type RegularityMetric,
  type SkillSummary,
  type TrendPart,
  type WeekVolume,
} from '../../lib/profile-stats';
import { positionLabel } from '../../lib/profile-taxonomy';
import { MAX_OPTION_SCORE } from '../../lib/quiz-taxonomy';
import { computeStreaks } from '../../lib/streak';
import { getSkill, type SkillKey } from '../../lib/test-families';
import { colors, fontSize, layout, radius, size, spacing, text } from '../../lib/theme';
import { DEFAULT_TRAINING_THEME } from '../../lib/training-themes';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son mot en fin de ligne (« 3 tests »). */
const NBSP = ' ';
const SIGN_OUT_QUESTION = 'Se déconnecter de cet appareil ?';
/** Email affiché à la place du nom, réduit pour tenir sur une ligne, jamais sous la taille du corps : 20 × 0,8 = 16 px. */
const EMAIL_MIN_FONT_SCALE = fontSize.body / fontSize.title;
// Toutes les réponses depuis le début : la streak du quiz n'a pas de limite de durée.
const HISTORY_START = '2000-01-01';
/** Barre d'une semaine vide : un trait gris qui garde le rythme des 12 semaines. */
const EMPTY_BAR_HEIGHT = spacing.xs;
/** Barre d'une semaine active : jamais plus basse, même très loin de la plus haute. */
const MIN_BAR_HEIGHT = spacing.sm;

/** Puces du graphe de régularité, dans l'ordre affiché. */
const METRICS: readonly { key: RegularityMetric; label: string }[] = [
  { key: 'minutes', label: 'Minutes' },
  { key: 'sessions', label: 'Séances' },
  { key: 'tests', label: 'Tests' },
];

// Grandeur choisie pour les barres : survit au démontage de l'écran tant que l'app
// tourne, jamais persistée (comme le filtre du quiz). Minutes au lancement.
let lastMetric: RegularityMetric = 'minutes';

/** Posés par router.dismissTo à l'arrivée sur l'onglet. */
type ProfileParams = {
  /** « Voir ma progression » d'un test : la carte Tests est mise en évidence et amenée à l'écran. */
  focusTest?: string;
  /** Séance qui a produit les résultats : nonce, une mise en évidence par test passé. */
  focusSession?: string;
  /** Nonce posé par l'écran d'édition après un enregistrement : rejoue la confirmation. */
  saved?: string;
};

type LoadingState = { status: 'loading' };
type ErrorState = { status: 'error'; message: string };
/** Section de l'écran : chargement, erreur affichée, ou données. */
type Loadable<T> = LoadingState | ErrorState | { status: 'ready'; data: T };

/** En-tête : nom affiché (null : l'email le remplace) et « poste · club · niveau » (null : rien de renseigné). */
type HeaderData = { displayName: string | null; caption: string | null };

/** Ligne d'une compétence dans la carte Tests. */
type SkillRow = {
  skill: SkillKey;
  label: string;
  icon: IconName;
  /** « 3 tests faits · dernière fois : hier » */
  details: string;
  /** « 2 mesures en progrès · 1 en recul », en parties colorées. */
  trend: TrendPart[];
  accessibilityLabel: string;
};

/** Séances des 12 semaines et tests : cartes Régularité, Tests et Volume. */
type TrainingData = {
  weeks: WeekVolume[];
  activeWeeks: number;
  /** Mois aux extrémités de l'axe : « Juil. », « Oct. ». */
  firstMonth: string;
  lastMonth: string;
  skills: SkillRow[];
  /** Tests hors format en base : affichés dans la carte Tests, jamais avalés. */
  problems: string[];
  /** Du 1er du mois à aujourd'hui. */
  month: { minutes: number; sessions: number };
};

type QuizData = { total: number; last7DaysAvg: number | null; streak: number };

/** Feuille Réglages ; open false : elle redescend. null : retirée d'un coup (avant d'ouvrir l'édition). */
type SettingsSheet = { open: boolean };

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { focusTest, focusSession, saved } = useLocalSearchParams<ProfileParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const focusTestId = typeof focusTest === 'string' && focusTest !== '' ? focusTest : null;
  const focusNonce = typeof focusSession === 'string' ? focusSession : null;
  const savedNonce = typeof saved === 'string' && saved !== '' ? saved : null;
  const email = session?.user.email ?? null;
  const [header, setHeader] = useState<Loadable<HeaderData>>({ status: 'loading' });
  const [training, setTraining] = useState<Loadable<TrainingData>>({ status: 'loading' });
  const [quiz, setQuiz] = useState<Loadable<QuizData>>({ status: 'loading' });
  const [sheetCount, setSheetCount] = useState<Loadable<number>>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance les lectures du focus.
  const [reloadCount, setReloadCount] = useState(0);
  const [metric, setMetric] = useState<RegularityMetric>(lastMetric);
  const [settings, setSettings] = useState<SettingsSheet | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Carte Tests mise en évidence au retour de « Voir ma progression », le temps de la visite.
  const [testsHighlighted, setTestsHighlighted] = useState(false);
  // Incrémenté à chaque arrivée par « Voir ma progression » : relance la mise en vue.
  const [focusRequest, setFocusRequest] = useState(0);
  // Carte Tests encore à amener à l'écran ; false une fois fait, ou l'onglet quitté.
  const pendingFocusRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // Contenu de l'écran (ancêtre de la carte Tests, par rapport auquel elle se mesure)
  // et sa position dans le contenu défilant : fixe, c'est son seul enfant.
  const contentRef = useRef<View>(null);
  const contentYRef = useRef(0);
  const testsCardRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const day = localToday();
      // Sections indépendantes : la panne de l'une n'empêche pas les autres de
      // s'afficher. Pas de retour à « chargement » : au retour sur l'onglet (après
      // l'édition du profil, un test, une suppression), les données précédentes
      // restent affichées jusqu'à la réponse. Seul « Réessayer » repasse sa section
      // à « chargement ».
      settle(loadHeader(), isActive, setHeader);
      settle(loadTraining(day), isActive, setTraining);
      settle(loadQuiz(day), isActive, setQuiz);
      settle(loadSheetCount(), isActive, setSheetCount);
      return () => {
        active = false;
      };
    }, [reloadCount]),
  );

  // Quitter l'onglet efface la mise en évidence et annule une mise en vue encore en attente.
  useFocusEffect(
    useCallback(
      () => () => {
        setTestsHighlighted(false);
        pendingFocusRef.current = false;
      },
      [],
    ),
  );

  // Arrivée par « Voir ma progression ». Les paramètres restent sur l'onglet : la
  // mise en évidence ne revient pas à chaque focus, seulement avec un nouveau test
  // passé (focusSession).
  useEffect(() => {
    if (focusTestId === null) {
      return;
    }
    setTestsHighlighted(true);
    pendingFocusRef.current = true;
    setFocusRequest((count) => count + 1);
  }, [focusTestId, focusNonce]);

  // Mise en vue de la carte Tests, une fois l'en-tête et les cartes du dessus
  // chargés (leur hauteur la déplace). Position mesurée au moment du défilement,
  // par rapport au contenu : sur le web, onLayout ne signale pas un simple
  // déplacement ; en natif, measureLayout veut un ancêtre.
  const headerSettled = header.status !== 'loading';
  const trainingSettled = training.status !== 'loading';
  useEffect(() => {
    if (!pendingFocusRef.current || !headerSettled || !trainingSettled) {
      return;
    }
    // Une image plus tard : la mise en page de ce rendu est faite.
    const frame = requestAnimationFrame(() => {
      const content = contentRef.current;
      const card = testsCardRef.current;
      if (!pendingFocusRef.current || content === null || card === null) {
        return;
      }
      pendingFocusRef.current = false;
      // Haut de la carte à 16 px sous le haut de l'écran.
      card.measureLayout(content, (_left, top) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, contentYRef.current + top - spacing.lg), animated: false });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequest, headerSettled, trainingSettled]);

  /** « Réessayer » d'une section en erreur : elle repasse à « chargement », puis toutes les sections se relisent. */
  function retry(setSection: (state: LoadingState) => void) {
    setSection({ status: 'loading' });
    setReloadCount((count) => count + 1);
  }

  function changeMetric(next: RegularityMetric) {
    lastMetric = next;
    setMetric(next);
  }

  function openSettings() {
    setSignOutError(null);
    setSettings({ open: true });
  }

  function closeSettings() {
    setSettings((current) => (current === null ? null : { open: false }));
  }

  function editProfile() {
    // Feuille retirée d'un coup : une Modal resterait par-dessus l'écran d'édition.
    setSettings(null);
    router.push('/profile/edit');
  }

  function confirmSignOut() {
    if (signingOut) {
      return;
    }
    // Alert.alert ne fait rien sur web : confirmation du navigateur à la place.
    if (Platform.OS === 'web') {
      if (window.confirm(SIGN_OUT_QUESTION)) {
        handleSignOut();
      }
      return;
    }
    Alert.alert('Déconnexion', SIGN_OUT_QUESTION, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: handleSignOut },
    ]);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    // En cas de succès, la session disparaît et le layout des onglets redirige vers /login.
    const { error } = await signOut();
    if (error) {
      setSignOutError(error);
      setSigningOut(false);
    }
  }

  return (
    <Screen
      scrollRef={scrollRef}
      // Retour de l'édition : saved change à chaque enregistrement et rejoue la confirmation.
      toast={savedNonce !== null ? <SaveToast key={savedNonce} message="Profil enregistré." /> : null}
    >
      <View
        ref={contentRef}
        onLayout={(event) => {
          contentYRef.current = event.nativeEvent.layout.y;
        }}
        style={styles.content}
      >
        <ProfileHeader email={email} header={header} onRetry={() => retry(setHeader)} onOpenSettings={openSettings} />

        {/* Cartes à 12 px les unes des autres (DA), plus serrées que les blocs de l'écran. */}
        <View style={styles.cards}>
          <RegularityCard
            state={training}
            metric={metric}
            onChangeMetric={changeMetric}
            onRetry={() => retry(setTraining)}
          />
          {/* Card ne prend pas de ref : la vue qui l'enveloppe se mesure pour la mise en vue. */}
          <View ref={testsCardRef}>
            <TestsCard state={training} highlighted={testsHighlighted} onRetry={() => retry(setTraining)} />
          </View>
          <View style={styles.cardRow}>
            <QuizCard state={quiz} onRetry={() => retry(setQuiz)} />
            <SheetsCard state={sheetCount} onRetry={() => retry(setSheetCount)} />
          </View>
          <VolumeCard state={training} onRetry={() => retry(setTraining)} />
        </View>
      </View>

      {settings !== null ? (
        <BottomSheet visible={settings.open} onClose={closeSettings} title="Réglages">
          {email !== null ? <Text style={text.meta}>{`Connecté : ${email}`}</Text> : null}
          {/* L'écran d'édition relit le profil lui-même : proposé même si l'en-tête est en erreur. */}
          <Button variant="secondary" label="Modifier le profil" onPress={editProfile} />
          <FieldError message={signOutError} />
          <Button variant="danger" label="Déconnexion" loading={signingOut} onPress={confirmSignOut} />
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

/**
 * Pose l'état chargé tant que l'écran est actif. Une exception inattendue (jour
 * mal formé refusé par relativeDay, par exemple) devient une erreur affichée,
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

async function loadHeader(): Promise<Loadable<HeaderData>> {
  const { data, error } = await getMyProfile();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return {
    status: 'ready',
    data: {
      displayName: data?.display_name?.trim() || null,
      caption: joinCaption([
        data?.main_position ? positionLabel(data.main_position) : null,
        data?.club,
        data?.club_level,
      ]),
    },
  };
}

/**
 * Séances des 12 semaines (régularité, volume du mois : la fenêtre couvre tout
 * le mois en cours) et tests avec leurs résultats (barres Tests, carte Tests).
 */
async function loadTraining(today: string): Promise<Loadable<TrainingData>> {
  const [sessions, tests] = await Promise.all([listSessions({ from: regularityStart(today), to: today }), listTests()]);
  const error = joinErrors([sessions.error, tests.error]);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  const sessionRows = sessions.data ?? [];
  const testItems = tests.data?.items ?? [];
  // Un jour par test passé : couples (test, jour) distincts.
  const weeks = buildRegularityWeeks(
    today,
    sessionRows,
    testItems.flatMap((test) => test.resultDates),
  );
  return {
    status: 'ready',
    data: {
      weeks,
      activeWeeks: countActiveWeeks(weeks),
      firstMonth: formatShortMonth(weeks[0].monday),
      lastMonth: formatShortMonth(today),
      skills: summarizeSkills(testItems).map((summary) => toSkillRow(summary, today)),
      problems: tests.data?.problems ?? [],
      month: monthVolume(today, sessionRows),
    },
  };
}

async function loadQuiz(today: string): Promise<Loadable<QuizData>> {
  const [stats, answerDays] = await Promise.all([getQuizStats(), listAnswerDays({ from: HISTORY_START, to: today })]);
  const error = joinErrors([stats.error, answerDays.error]);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  if (!stats.data) {
    return { status: 'error', message: 'Supabase n’a renvoyé ni les statistiques ni d’erreur.' };
  }
  return {
    status: 'ready',
    data: {
      total: stats.data.total,
      last7DaysAvg: stats.data.last7DaysAvg,
      streak: computeStreaks(new Set(answerDays.data ?? []), today).current,
    },
  };
}

async function loadSheetCount(): Promise<Loadable<number>> {
  const { data, error } = await countSheets({ kind: 'training' });
  if (error !== null || data === null) {
    return { status: 'error', message: error ?? 'Supabase n’a pas renvoyé le nombre de fiches.' };
  }
  return { status: 'ready', data };
}

/** Ligne d'une compétence ; la date en relatif à l'écran, en absolu pour le lecteur d'écran. */
function toSkillRow(summary: SkillSummary, today: string): SkillRow {
  const skill = getSkill(summary.skill);
  const done = formatCount(summary.testsDone, 'test fait', 'tests faits');
  const trend = describeTrend(summary.trend);
  return {
    skill: summary.skill,
    label: skill.label,
    icon: skill.icon,
    details: `${done} · dernière fois : ${relativeDay(summary.lastDate, today)}`,
    trend,
    accessibilityLabel: [
      skill.label,
      done,
      `dernière fois le ${formatShortDay(summary.lastDate)}`,
      ...trend.map((part) => part.text),
    ].join(', '),
  };
}

/** Pluriel français, 0 et 1 au singulier : « 1 test fait », « 3 tests faits ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count}${NBSP}${count >= 2 ? plural : singular}`;
}

/** « 2,3 » (le barème « /3 » est posé à côté) ; « — » sans réponse sur 7 jours. Virgule écrite à la main (Intl). */
function formatAverage(average: number | null): string {
  return average === null ? PLACEHOLDER : average.toFixed(1).replace('.', ',');
}

/** Valeur d'une semaine pour le lecteur d'écran : « 1 h 30 », « 3 ». */
function formatMetricValue(metric: RegularityMetric, value: number): string {
  return metric === 'minutes' ? formatMinutes(value) : String(value);
}

type ProfileHeaderProps = {
  email: string | null;
  header: Loadable<HeaderData>;
  onRetry: () => void;
  onOpenSettings: () => void;
};

/**
 * En-tête, seul titre de l'écran : avatar (initiales du nom affiché, sinon
 * l'icône personne), le nom ou à défaut l'email, « poste · club · niveau », et
 * l'engrenage des Réglages.
 */
function ProfileHeader({ email, header, onRetry, onOpenSettings }: ProfileHeaderProps) {
  const data = header.status === 'ready' ? header.data : null;
  const initials = initialsOf(data?.displayName ?? null);
  return (
    <View style={layout.section}>
      <View style={styles.header}>
        {/* Décoratif : le nom, juste à côté, est lu. */}
        <View aria-hidden style={styles.avatar}>
          {initials !== null ? (
            <Text style={text.title}>{initials}</Text>
          ) : (
            <Ionicons name="person" size={size.icon} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.headerText}>
          {data === null ? (
            // Tant que le profil n'est pas lu : ni l'email ni le nom, pour ne pas changer de nom sous les yeux.
            <Text role="heading" style={text.title}>
              {PLACEHOLDER}
            </Text>
          ) : data.displayName !== null ? (
            <Text role="heading" style={text.title} numberOfLines={2}>
              {data.displayName}
            </Text>
          ) : (
            <Text
              role="heading"
              style={text.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={EMAIL_MIN_FONT_SCALE}
            >
              {email ?? PLACEHOLDER}
            </Text>
          )}
          {data?.caption ? <Text style={text.meta}>{data.caption}</Text> : null}
        </View>
        <IconButton icon="settings" subtle accessibilityLabel="Réglages" onPress={onOpenSettings} />
      </View>
      {header.status === 'error' ? <SectionError message={header.message} onRetry={onRetry} /> : null}
    </View>
  );
}

/** Erreur d'une section et son « Réessayer » ; jamais dans une carte tappable (deux cibles l'une dans l'autre). */
function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <>
      <FieldError message={`Erreur : ${message}`} />
      <Button variant="secondary" label="Réessayer" onPress={onRetry} />
    </>
  );
}

type RegularityCardProps = {
  state: Loadable<TrainingData>;
  metric: RegularityMetric;
  onChangeMetric: (metric: RegularityMetric) => void;
  onRetry: () => void;
};

/**
 * Régularité : semaines actives (au moins une séance) sur les 12 dernières en
 * chiffre dominant, puis une barre par semaine (la courante à droite) de la
 * grandeur choisie en puces, et les mois aux extrémités. Ni objectif ni repère
 * (chantier 14).
 */
function RegularityCard({ state, metric, onChangeMetric, onRetry }: RegularityCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeading}>
        <Text role="heading" style={text.overline}>
          Régularité
        </Text>
        <Text style={text.meta}>{`${REGULARITY_WEEK_COUNT}${NBSP}semaines`}</Text>
      </View>
      {state.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
      {state.status === 'error' ? <SectionError message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' ? (
        <>
          <View
            accessible
            accessibilityLabel={`${formatCount(state.data.activeWeeks, 'semaine active', 'semaines actives')} sur ${REGULARITY_WEEK_COUNT}`}
            style={styles.numberRow}
          >
            <Text style={text.number}>
              {state.data.activeWeeks}
              <Text style={text.denominator}>{`/${REGULARITY_WEEK_COUNT}`}</Text>
            </Text>
            <Text style={text.meta}>{state.data.activeWeeks >= 2 ? 'semaines actives' : 'semaine active'}</Text>
          </View>
          <View style={layout.chipRow}>
            {METRICS.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                accessibilityLabel={`Barres : ${entry.label}`}
                selected={entry.key === metric}
                onPress={() => onChangeMetric(entry.key)}
              />
            ))}
          </View>
          <WeekBars weeks={state.data.weeks} metric={metric} />
          <View style={styles.axis}>
            <Text style={text.meta}>{state.data.firstMonth}</Text>
            <Text style={text.meta}>{state.data.lastMonth}</Text>
          </View>
        </>
      ) : null}
    </Card>
  );
}

/**
 * Une barre par semaine, de la plus ancienne à la courante, haute en proportion
 * de la plus haute ; une semaine à 0 garde un trait gris. Le libellé
 * d'accessibilité donne les valeurs : le sens ne repose pas sur le dessin seul.
 */
function WeekBars({ weeks, metric }: { weeks: readonly WeekVolume[]; metric: RegularityMetric }) {
  const values = weeks.map((week) => week[metric]);
  const max = Math.max(0, ...values);
  const label = METRICS.find((entry) => entry.key === metric)?.label ?? '';
  const summary = `${label} par semaine, de la plus ancienne à la semaine en cours : ${values
    .map((value) => formatMetricValue(metric, value))
    .join(', ')}.`;
  return (
    <View accessible role="img" accessibilityLabel={summary} style={styles.bars}>
      {weeks.map((week, index) => {
        const value = values[index];
        return (
          <View
            key={week.monday}
            style={[
              styles.bar,
              value > 0
                ? { height: Math.max(MIN_BAR_HEIGHT, (size.barChart * value) / max) }
                : styles.emptyBar,
            ]}
          />
        );
      })}
    </View>
  );
}

type TestsCardProps = {
  state: Loadable<TrainingData>;
  /** Retour de « Voir ma progression » : bordure et teinte accent. */
  highlighted: boolean;
  onRetry: () => void;
};

/**
 * Tests, mise en avant (étiquette orange) : une ligne par compétence qui a au
 * moins un résultat, vers ses statistiques (familles, tests, mesures). Pas de
 * note (chantier 11).
 */
function TestsCard({ state, highlighted, onRetry }: TestsCardProps) {
  return (
    <Card highlighted={highlighted} style={styles.card}>
      <Text role="heading" style={[text.overline, styles.testsLabel]}>
        Tests
      </Text>
      {state.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
      {state.status === 'error' ? <SectionError message={state.message} onRetry={onRetry} /> : null}
      {state.status === 'ready' ? (
        <>
          <FieldError message={state.data.problems.length > 0 ? state.data.problems.join('\n') : null} />
          {state.data.skills.length === 0 ? (
            // secondary : la carte n'est pas l'action principale de l'écran, qui n'en a pas.
            <EmptyState
              title="Aucun test fait"
              message="Passe ton premier test depuis l’onglet Tests : tes records et tes progrès s’afficheront ici."
              action={{ label: 'Voir les tests', onPress: () => router.navigate('/training'), variant: 'secondary' }}
            />
          ) : (
            state.data.skills.map((row) => <SkillLine key={row.skill} row={row} />)
          )}
        </>
      ) : null}
    </Card>
  );
}

/** Compétence : icône, libellé, tests faits et dernière fois, tendance colorée ; ouvre ses statistiques. */
function SkillLine({ row }: { row: SkillRow }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={row.accessibilityLabel}
      onPress={() => router.push({ pathname: '/stats/[skill]', params: { skill: row.skill } })}
      style={({ pressed }) => [styles.skillLine, pressed && styles.pressed]}
    >
      <Ionicons name={row.icon} size={size.icon} color={colors.textMuted} aria-hidden />
      <View style={styles.skillText}>
        <Text style={text.bodyStrong}>{row.label}</Text>
        <Text style={text.meta}>{row.details}</Text>
        <Text style={text.meta}>
          {row.trend.map((part, index) => (
            <Fragment key={part.text}>
              {index > 0 ? ' · ' : null}
              <Text style={TREND_STYLES[part.direction]}>{part.text}</Text>
            </Fragment>
          ))}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

/** Quiz (étiquette violette) : réponses en chiffre dominant, streak et moyenne sur 7 jours ; ouvre l'onglet Quiz. */
function QuizCard({ state, onRetry }: { state: Loadable<QuizData>; onRetry: () => void }) {
  const label = (
    <Text role="heading" style={[text.overline, styles.quizLabel]}>
      Quiz
    </Text>
  );
  if (state.status !== 'ready') {
    // Pas tappable tant qu'elle n'a rien à ouvrir : « Réessayer » ne se loge pas dans une carte tappable.
    return (
      <Card style={[styles.card, styles.halfCard]}>
        {label}
        {state.status === 'loading' ? <ActivityIndicator color={colors.quiz} /> : null}
        {state.status === 'error' ? <SectionError message={state.message} onRetry={onRetry} /> : null}
      </Card>
    );
  }
  const { total, last7DaysAvg, streak } = state.data;
  const answered = total >= 2 ? 'questions répondues' : 'question répondue';
  const streakText = `Série : ${formatCount(streak, 'jour', 'jours')}`;
  const averageText = `Moyenne 7${NBSP}j : ${formatAverage(last7DaysAvg)}${last7DaysAvg !== null ? `/${MAX_OPTION_SCORE}` : ''}`;
  return (
    <Card
      onPress={() => router.navigate('/quiz')}
      accessibilityLabel={`Quiz : ${total} ${answered}, ${streakText}, ${averageText}`}
      style={[styles.card, styles.halfCard]}
    >
      {label}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={text.number}>
        {total}
      </Text>
      <Text style={text.meta}>{answered}</Text>
      <Text style={text.meta}>{streakText}</Text>
      <Text style={text.meta}>{averageText}</Text>
    </Card>
  );
}

/** Fiches : nombre de fiches de lecture ; ouvre leur liste (entraînements spécifiques, puis récupération). */
function SheetsCard({ state, onRetry }: { state: Loadable<number>; onRetry: () => void }) {
  const label = (
    <Text role="heading" style={text.overline}>
      Fiches
    </Text>
  );
  if (state.status !== 'ready') {
    return (
      <Card style={[styles.card, styles.halfCard]}>
        {label}
        {state.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {state.status === 'error' ? <SectionError message={state.message} onRetry={onRetry} /> : null}
      </Card>
    );
  }
  const caption = state.data >= 2 ? 'fiches de lecture' : 'fiche de lecture';
  return (
    <Card
      onPress={() => router.push({ pathname: '/training/[theme]', params: { theme: DEFAULT_TRAINING_THEME } })}
      accessibilityLabel={`Fiches : ${state.data} ${caption}`}
      style={[styles.card, styles.halfCard]}
    >
      {label}
      <Text numberOfLines={1} style={text.number}>
        {state.data}
      </Text>
      <Text style={text.meta}>{caption}</Text>
    </Card>
  );
}

/** Volume : durée du mois en chiffre dominant et nombre de séances ; ouvre le détail par module. */
function VolumeCard({ state, onRetry }: { state: Loadable<TrainingData>; onRetry: () => void }) {
  const label = (
    <Text role="heading" style={text.overline}>
      Volume
    </Text>
  );
  if (state.status !== 'ready') {
    return (
      <Card style={styles.card}>
        {label}
        {state.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {state.status === 'error' ? <SectionError message={state.message} onRetry={onRetry} /> : null}
      </Card>
    );
  }
  const { minutes, sessions } = state.data.month;
  const caption = `ce mois · ${formatCount(sessions, 'séance', 'séances')}`;
  return (
    <Card
      onPress={() => router.push('/stats/volume')}
      accessibilityLabel={`Volume : ${formatMinutes(minutes)} ${caption}`}
      style={styles.card}
    >
      {label}
      <DurationValue minutes={minutes} />
      <Text style={text.meta}>{caption}</Text>
    </Card>
  );
}

/** Tendance : vert en progrès, rouge en recul, secondaire sinon ; le texte dit toujours le sens. */
const TREND_STYLES = StyleSheet.create({
  better: {
    color: colors.success,
  },
  worse: {
    color: colors.danger,
  },
  same: {
    color: colors.textMuted,
  },
});

const styles = StyleSheet.create({
  /** Tout le contenu, seul enfant du défilement : même écart entre blocs que Screen. */
  content: {
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  /** Rond de 56 px, surface2, comme celui de l'Accueil en plus grand (maquette). */
  avatar: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: size.avatar / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  cards: {
    gap: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  card: {
    gap: spacing.md,
  },
  /** Carte de la grille à deux colonnes : la moitié de la rangée, même hauteur que sa voisine. */
  halfCard: {
    flex: 1,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  testsLabel: {
    color: colors.accent,
  },
  quizLabel: {
    color: colors.quiz,
  },
  /** Chiffre et son libellé sur une même ligne de base (DA, carte Régularité). */
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  bars: {
    height: size.barChart,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: radius.bar,
    borderTopRightRadius: radius.bar,
    borderBottomLeftRadius: radius.bar / 2,
    borderBottomRightRadius: radius.bar / 2,
    backgroundColor: colors.accent,
  },
  emptyBar: {
    height: EMPTY_BAR_HEIGHT,
    backgroundColor: colors.pitchLine,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skillLine: {
    minHeight: size.touch,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skillText: {
    flex: 1,
    gap: spacing.xs,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
