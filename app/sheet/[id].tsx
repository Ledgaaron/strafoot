import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useElapsedLabel } from '../../components/active-session-bar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { IconButton } from '../../components/icon-button';
import { PitchPlaceholder } from '../../components/pitch-placeholder';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { elapsedMinutes, elapsedMs, FIRST_EXERCISE_INDEX } from '../../lib/active-session';
import {
  askAboutActiveSession,
  confirmAbandon,
  useActiveSession,
  vibrateOnSave,
} from '../../lib/active-session-context';
import { localDateOfTimestamp, localToday, relativeDay } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import {
  createTestResults,
  getLatestResults,
  listTestCatalog,
  type LatestResult,
  type TestRow,
} from '../../lib/db/test-results';
import { getLastSessionForSheet, getSheet, type Sheet } from '../../lib/db/training';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, diagramUrl } from '../../lib/diagrams';
import { hapticMedium, hapticSuccess } from '../../lib/haptics';
import { formatDecimal, formatMeasure } from '../../lib/measure-delta';
import { DEFAULT_DIFFICULTY, getModule, SHEET_MODULE_KEY, TEST_MODULE_KEY } from '../../lib/modules';
import { useReduceMotion } from '../../lib/reduce-motion';
import type { Exercise, Measure } from '../../lib/sheet-types';
import { colors, input, inputProps, layout, motion, radius, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
const NO_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.';
const NO_RESULTS_MESSAGE = 'Supabase n’a renvoyé ni les résultats ni d’erreur.';
/** Sous une mesure refusée (✓ ou envoi) ; le message au-dessus du bouton nomme toutes les mesures à compléter. */
const INVALID_MEASURE_MESSAGE = 'Nombre attendu (virgule ou point).';
/** Valeur d'une mesure, espaces retirés : des chiffres, avec virgule ou point décimal. */
const DECIMAL_PATTERN = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const NO_KEYS: ReadonlySet<string> = new Set();

/** Fiche chargée, avec ce que son dernier écran demande. */
type Loaded =
  | {
      kind: 'training';
      sheet: Sheet;
      /** Jour de la dernière séance liée ; null si jamais faite. */
      lastSessionDate: string | null;
    }
  | {
      kind: 'test';
      sheet: Sheet;
      /** Ligne du catalogue de chaque mesure du test, par key. */
      tests: ReadonlyMap<string, TestRow>;
      /** Dernier résultat par id de test ; absent si jamais mesuré. */
      latest: ReadonlyMap<string, LatestResult>;
    };

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; loaded: Loaded };

/** Envoi en cours, ou refusé ; invalidKeys : mesures vides ou illisibles, encadrées en rouge. */
type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string; invalidKeys: ReadonlySet<string> };

/** Test enregistré : sa séance et le nombre de résultats, confirmés à la place de la saisie. */
type SavedTest = { sessionId: string; resultCount: number };

/**
 * id : la fiche ou le test. finish « 1 » : « Terminer l'autre d'abord » sur un
 * test en cours, ouvert directement sur sa saisie des mesures.
 */
type SheetParams = { id?: string; finish?: string };

export default function SheetScreen() {
  const { id, finish } = useLocalSearchParams<SheetParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const sheetId = typeof id === 'string' && id !== '' ? id : null;
  const [state, setState] = useState<LoadState>(sheetId ? { status: 'loading' } : { status: 'empty' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    if (!sheetId) {
      return;
    }
    let active = true;
    loadSheet(sheetId)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue : affichée, jamais avalée.
        if (active) {
          setState({
            status: 'error',
            message: exception instanceof Error ? exception.message : String(exception),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [sheetId, loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  if (state.status !== 'ready') {
    return (
      <>
        <Stack.Screen options={{ title: 'Fiche' }} />
        <Screen>
          {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
          {state.status === 'error' ? (
            <View style={layout.section}>
              <FieldError message={`Erreur : ${state.message}`} />
              <Button variant="secondary" label="Réessayer" onPress={reload} />
            </View>
          ) : null}
          {state.status === 'empty' ? (
            <EmptyState
              title="Fiche introuvable"
              message="Elle a peut-être été retirée du contenu."
              action={{ label: 'Retour', onPress: leaveMissingSheet }}
            />
          ) : null}
        </Screen>
      </>
    );
  }

  return <SheetReader key={state.loaded.sheet.id} loaded={state.loaded} finishRequested={finish === '1'} />;
}

/** Fiche introuvable : écran précédent ; sans historique (lien direct, rechargement web), l'onglet Entraînement. */
function leaveMissingSheet() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/training');
  }
}

/**
 * Fiche, puis ce que son dernier écran demande : pour une fiche de lecture, le
 * jour de sa dernière séance ; pour un test, la ligne du catalogue et le dernier
 * résultat de chaque mesure. Une mesure absente du catalogue est une erreur : le
 * seed n'a pas été exécuté, ou le JSON a changé sans lui.
 */
async function loadSheet(sheetId: string): Promise<LoadState> {
  const { data: sheet, error } = await getSheet(sheetId);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  if (!sheet) {
    return { status: 'empty' };
  }

  if (sheet.kind === 'training') {
    const last = await getLastSessionForSheet(sheet.id);
    if (last.error !== null) {
      return { status: 'error', message: last.error };
    }
    return { status: 'ready', loaded: { kind: 'training', sheet, lastSessionDate: last.data } };
  }

  const catalog = await listTestCatalog();
  if (catalog.error !== null) {
    return { status: 'error', message: catalog.error };
  }
  const byKey = new Map<string, TestRow>();
  for (const row of catalog.data ?? []) {
    if (row.key !== null) {
      byKey.set(row.key, row);
    }
  }
  const tests = new Map<string, TestRow>();
  const missing: string[] = [];
  for (const measure of sheet.exercises.flatMap((block) => block.measures)) {
    const row = byKey.get(measure.key);
    if (row) {
      tests.set(measure.key, row);
    } else {
      missing.push(measure.key);
    }
  }
  if (missing.length > 0) {
    return {
      status: 'error',
      message: `Mesures absentes du catalogue tests : ${missing.join(', ')}. Exécuter supabase/seed_sheets_001.sql.`,
    };
  }
  const latest = await getLatestResults([...tests.values()].map((row) => row.id));
  if (latest.error !== null) {
    return { status: 'error', message: latest.error };
  }
  return { status: 'ready', loaded: { kind: 'test', sheet, tests, latest: latest.data ?? new Map() } };
}

type SheetReaderProps = {
  loaded: Loaded;
  /** Ouvrir un test en cours sur sa saisie des mesures. */
  finishRequested: boolean;
};

function SheetReader({ loaded, finishRequested }: SheetReaderProps) {
  const { sheet } = loaded;
  const activeSession = useActiveSession();
  const { setIndex } = activeSession;
  // Séance en cours de cette fiche (chronométrée) ; null : simple lecture, ou une autre fiche est en cours.
  const timed = activeSession.session?.sheetId === sheet.id ? activeSession.session : null;
  const isTimed = timed !== null;
  // Jour figé à l'ouverture : sans chrono, la séance compte pour le jour où la fiche a été ouverte.
  const [today] = useState(localToday);
  const exerciseCount = sheet.exercises.length;
  const lastStep = loaded.kind === 'test' ? exerciseCount + 1 : exerciseCount;
  // 0 : présentation ; 1 à n : un exercice par écran ; n + 1 : saisie des mesures (test).
  // Séance en cours : reprise à sa dernière étape, bornée si la fiche a changé depuis.
  const [step, setStep] = useState(() => {
    if (timed === null) {
      return 0;
    }
    if (finishRequested && loaded.kind === 'test') {
      return lastStep;
    }
    return Math.min(Math.max(timed.lastExerciseIndex, 0), lastStep);
  });
  const [starting, setStarting] = useState(false);
  // Échec de mémorisation au démarrage : rien n'a démarré.
  const [startError, setStartError] = useState<string | null>(null);
  // « Plus de tips » déplié ou non : gardé d'un exercice à l'autre, le temps de la lecture.
  const [tipsOpen, setTipsOpen] = useState(false);
  // Saisie du test, gardée ici : elle survit aux allers-retours entre les blocs.
  const [values, setValues] = useState<Readonly<Partial<Record<string, string>>>>({});
  // Lignes validées par ✓, et lignes dont le ✓ a été refusé (valeur illisible) : gardées de même.
  const [validated, setValidated] = useState<ReadonlySet<string>>(NO_KEYS);
  const [refused, setRefused] = useState<ReadonlySet<string>>(NO_KEYS);
  const [comment, setComment] = useState('');
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  // Séance du test créée mais résultats non enregistrés : le réessai ne la recrée pas.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  // Test enregistré : la confirmation remplace la saisie.
  const [savedTest, setSavedTest] = useState<SavedTest | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Étape mémorisée à chaque changement : le bandeau des onglets y ramène.
  useEffect(() => {
    if (isTimed) {
      setIndex(step);
    }
  }, [isTimed, step, setIndex]);

  const exercise = step >= 1 && step <= exerciseCount ? sheet.exercises[step - 1] : null;
  const saving = save.status === 'saving';
  // Sans chrono seulement : une fiche démarrée peut être refaite le même jour.
  const alreadyDoneToday = !isTimed && loaded.kind === 'training' && loaded.lastSessionDate === today;
  // Envoi d'un test : chaque mesure validée par ✓ (aucune mesure dans une fiche de lecture).
  const measureKeys = sheet.exercises.flatMap((block) => block.measures.map((measure) => measure.key));
  const validatedCount = measureKeys.filter((key) => validated.has(key)).length;
  const allValidated = validatedCount === measureKeys.length;

  function goTo(next: number) {
    setStep(Math.min(Math.max(next, 0), lastStep));
    // Contenu entièrement remplacé : lecture depuis le haut, sans défilement animé.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function changeValue(key: string, text: string) {
    setValues((current) => ({ ...current, [key]: text }));
    // Nouvelle saisie : le refus du ✓ précédent ne la concerne plus.
    setRefused((current) => withoutKey(current, key));
  }

  /** ✓ : la valeur proposée (saisie, ou dernière valeur en gris) devient celle de la ligne, si elle se lit. */
  function validateMeasure(key: string, candidate: string) {
    if (parseMeasureValue(candidate) === null) {
      setRefused((current) => withKey(current, key));
      return;
    }
    setValues((current) => ({ ...current, [key]: candidate }));
    setRefused((current) => withoutKey(current, key));
    setValidated((current) => withKey(current, key));
    hapticSuccess();
  }

  /** Ligne validée touchée (sa valeur ou son ✓) : de nouveau modifiable. */
  function editMeasure(key: string) {
    setValidated((current) => withoutKey(current, key));
  }

  /** Démarrer : la séance de cette fiche part maintenant, lecture au premier exercice. */
  async function start() {
    if (activeSession.loading || starting) {
      return;
    }
    const current = activeSession.session;
    if (current !== null && current.sheetId !== sheet.id) {
      // replace : la lecture de cette fiche cède la place à la séance en cours.
      askAboutActiveSession(current, 'replace');
      return;
    }
    setStarting(true);
    setStartError(null);
    const error = await activeSession.start({ sheetId: sheet.id, kind: sheet.kind, title: sheet.title });
    setStarting(false);
    if (error !== null) {
      setStartError(`La séance n’a pas démarré. ${error}`);
      return;
    }
    goTo(FIRST_EXERCISE_INDEX);
  }

  /** Séance déjà faite, sans chrono : formulaire de séance pré-rempli (module, nom, durée), date modifiable. */
  function openDoneForm() {
    router.push({
      pathname: '/session/new',
      params: { sheetId: sheet.id, module: SHEET_MODULE_KEY, name: sheet.title, durationMin: String(sheet.duration_min) },
    });
  }

  /** Terminer : une fiche passe par l'écran de fin ; un test, par sa saisie des mesures. */
  function finishTimed() {
    if (loaded.kind === 'test') {
      goTo(lastStep);
    } else {
      router.push('/session/finish');
    }
  }

  /** Abandon d'un test en cours, depuis sa saisie : rien n'est enregistré. */
  function abandon() {
    if (pendingRef.current) {
      return;
    }
    confirmAbandon(() => {
      pendingRef.current = true;
      void activeSession.clear();
      // Sans params : une confirmation d'enregistrement restée sur l'onglet disparaît.
      router.dismissTo('/training');
    });
  }

  async function markDone() {
    if (isTimed) {
      // « Séance faite » d'une fiche en cours = Terminer : durée réelle sur l'écran de fin.
      finishTimed();
      return;
    }
    if (loaded.kind !== 'training' || pendingRef.current || alreadyDoneToday) {
      return;
    }
    pendingRef.current = true;
    setSave({ status: 'saving' });
    // Jamais de user_id : la base le tire du JWT.
    const { data, error } = await createSession({
      date: today,
      module: SHEET_MODULE_KEY,
      type: getModule(SHEET_MODULE_KEY).type,
      name: sheet.title,
      duration_min: sheet.duration_min,
      difficulty: DEFAULT_DIFFICULTY,
      comment: null,
      sheet_id: sheet.id,
    });
    if (error !== null || data === null) {
      pendingRef.current = false;
      setSave({ status: 'error', message: error ?? NO_SESSION_MESSAGE, invalidKeys: NO_KEYS });
      return;
    }
    // pendingRef reste vrai : l'écran se ferme, pas de second envoi possible.
    hapticMedium();
    router.dismissTo({ pathname: '/training', params: { savedSession: data.id, savedTitle: sheet.title } });
  }

  async function submitTest() {
    if (loaded.kind !== 'test' || pendingRef.current) {
      return;
    }
    const entries: { testId: string; value: number }[] = [];
    const invalid: Measure[] = [];
    for (const measure of sheet.exercises.flatMap((block) => block.measures)) {
      const value = parseMeasureValue(values[measure.key] ?? '');
      const test = loaded.tests.get(measure.key);
      if (value === null || !test) {
        invalid.push(measure);
      } else {
        entries.push({ testId: test.id, value });
      }
    }
    if (invalid.length > 0) {
      setSave({
        status: 'error',
        message: `Toutes les mesures sont obligatoires (nombre, virgule ou point). À compléter : ${invalid
          .map((measure) => measure.name)
          .join(', ')}.`,
        invalidKeys: new Set(invalid.map((measure) => measure.key)),
      });
      return;
    }

    pendingRef.current = true;
    setSave({ status: 'saving' });
    // Test démarré : jour du démarrage en heure locale, comme l'écran de fin d'une fiche.
    const sessionDate = timed !== null ? localDateOfTimestamp(timed.startedAt) : today;
    let sessionId: string;
    if (pendingSessionId === null) {
      const created = await createSession({
        date: sessionDate,
        module: TEST_MODULE_KEY,
        type: getModule(TEST_MODULE_KEY).type,
        name: sheet.title,
        // Test démarré : durée réelle, en minutes arrondies ; sinon celle de la fiche.
        duration_min: timed !== null ? elapsedMinutes(elapsedMs(timed.startedAt, Date.now())) : sheet.duration_min,
        difficulty: DEFAULT_DIFFICULTY,
        comment: comment.trim() || null,
        sheet_id: sheet.id,
      });
      if (created.error !== null || created.data === null) {
        pendingRef.current = false;
        setSave({
          status: 'error',
          message: `Erreur : ${created.error ?? NO_SESSION_MESSAGE}`,
          invalidKeys: NO_KEYS,
        });
        return;
      }
      sessionId = created.data.id;
      setPendingSessionId(sessionId);
    } else {
      sessionId = pendingSessionId;
      // Réessai : l'envoi précédent a pu aboutir en base sans que sa réponse arrive.
      // Si le dernier résultat de chaque mesure vient déjà de cette séance, rien à
      // renvoyer : un second insert les doublerait.
      const check = await getLatestResults(entries.map((entry) => entry.testId));
      if (check.error !== null || check.data === null) {
        pendingRef.current = false;
        setSave({
          status: 'error',
          message: resultsNotSaved(check.error ?? NO_RESULTS_MESSAGE),
          invalidKeys: NO_KEYS,
        });
        return;
      }
      const latestNow = check.data;
      if (entries.every((entry) => latestNow.get(entry.testId)?.session_id === sessionId)) {
        showSavedTest(sessionId, entries.length);
        return;
      }
    }

    // Une seule requête pour toutes les mesures : enregistrées toutes, ou aucune.
    const saved = await createTestResults(
      entries.map((entry) => ({ test_id: entry.testId, value: entry.value, date: sessionDate, session_id: sessionId })),
    );
    if (saved.error !== null || saved.data === null) {
      pendingRef.current = false;
      setSave({
        status: 'error',
        message: resultsNotSaved(saved.error ?? NO_RESULTS_MESSAGE),
        invalidKeys: NO_KEYS,
      });
      return;
    }
    showSavedTest(sessionId, saved.data.length);
  }

  /** Confirmation à la place de la saisie, avec la vibration. pendingRef reste vrai : pas de second envoi possible. */
  function showSavedTest(sessionId: string, resultCount: number) {
    // Test démarré : fin de sa séance en cours ; une autre fiche en cours n'est pas touchée.
    if (isTimed) {
      vibrateOnSave();
      void activeSession.clear();
    } else {
      hapticMedium();
    }
    setSavedTest({ sessionId, resultCount });
  }

  if (savedTest !== null) {
    return <TestConfirmation sheet={sheet} saved={savedTest} />;
  }

  // En-tête natif : l'étape ; le titre de la fiche est dans le contenu de la présentation.
  const headerTitle =
    step === 0
      ? 'Présentation'
      : exercise !== null
        ? `${loaded.kind === 'test' ? 'Bloc' : 'Exercice'} ${step} / ${exerciseCount}`
        : 'Saisie des mesures';

  // Bouton principal : démarrer depuis la présentation, avancer d'une étape, puis l'action de la dernière.
  let primary: ReactNode;
  if (step === 0 && !isTimed) {
    primary = <Button label="Démarrer" loading={starting} onPress={start} style={styles.primaryButton} />;
  } else if (step < lastStep) {
    primary = <Button label="Suivant" disabled={saving} onPress={() => goTo(step + 1)} style={styles.primaryButton} />;
  } else if (loaded.kind === 'training') {
    primary = (
      <Button
        label={alreadyDoneToday ? 'Déjà enregistrée aujourd’hui' : 'Séance faite'}
        disabled={alreadyDoneToday}
        loading={saving}
        onPress={markDone}
        style={styles.primaryButton}
      />
    );
  } else {
    primary = (
      <Button
        label={pendingSessionId !== null ? 'Réessayer les résultats' : 'Enregistrer le test'}
        // Envoi possible une fois chaque mesure validée par ✓.
        disabled={!allValidated}
        loading={saving}
        onPress={submitTest}
        style={styles.primaryButton}
      />
    );
  }

  // Pied fixe, hors du défilement : pas de geste de balayage, identique sur web et natif.
  const footer = (
    <>
      {/* Message de l'enregistrement, au-dessus du bouton qui l'a produit : à la dernière étape seulement. */}
      {step === lastStep && save.status === 'error' ? (
        <FieldError message={loaded.kind === 'training' ? `Erreur : ${save.message}` : save.message} />
      ) : null}
      {step === 0 ? <FieldError message={startError} /> : null}
      {/* Saisie d'un test : pourquoi l'envoi attend encore, et ce qu'il reste à valider. */}
      {loaded.kind === 'test' && step === lastStep && !allValidated ? (
        <Text style={[text.meta, text.tabular]}>
          {`Valide chaque mesure avec ✓ : ${validatedCount} / ${measureKeys.length}`}
        </Text>
      ) : null}
      {/* Séance en cours : Terminer à tout moment ; au dernier écran, l'action principale termine déjà. */}
      {isTimed && step < lastStep ? (
        <Button variant="secondary" label="Terminer" disabled={saving} onPress={finishTimed} />
      ) : null}
      <View style={layout.buttonRow}>
        {step > 0 ? (
          <Button
            variant="secondary"
            label="Précédent"
            disabled={saving}
            onPress={() => goTo(step - 1)}
            style={styles.previousButton}
          />
        ) : null}
        {primary}
      </View>
      {/* Présentation d'une fiche hors séance en cours : la noter sans chrono, Démarrer reste l'action principale. */}
      {step === 0 && !isTimed && loaded.kind === 'training' ? (
        <Button variant="secondary" label="Séance déjà faite" disabled={starting} onPress={openDoneForm} />
      ) : null}
      {/* Test en cours, sur sa saisie : abandon possible tant que sa séance n'est pas créée. */}
      {isTimed && loaded.kind === 'test' && step === lastStep && pendingSessionId === null ? (
        <Button variant="danger" label="Abandonner la séance" disabled={saving} onPress={abandon} />
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          // Séance en cours de cette fiche : son chrono à droite. undefined explicite sinon :
          // setOptions fusionne, le chrono d'une séance finie resterait affiché.
          headerRight: timed !== null ? () => <HeaderClock startedAt={timed.startedAt} /> : undefined,
        }}
      />
      <Screen title={step === 0 ? sheet.title : undefined} scrollRef={scrollRef} footer={footer}>
        {step === 0 ? <Overview sheet={sheet} onOpen={goTo} /> : null}
        {exercise !== null ? (
          <ExerciseStep exercise={exercise} tipsOpen={tipsOpen} onToggleTips={() => setTipsOpen((open) => !open)} />
        ) : null}

        {loaded.kind === 'test' && step === lastStep ? (
          <TestForm
            sheet={sheet}
            tests={loaded.tests}
            latest={loaded.latest}
            today={today}
            values={values}
            validated={validated}
            refused={refused}
            comment={comment}
            // Séance déjà créée : son commentaire est enregistré, seuls les résultats restent à envoyer.
            commentEditable={pendingSessionId === null}
            invalidKeys={save.status === 'error' ? save.invalidKeys : NO_KEYS}
            onChangeValue={changeValue}
            onValidate={validateMeasure}
            onEdit={editMeasure}
            onChangeComment={setComment}
          />
        ) : null}
      </Screen>
    </>
  );
}

/** Valeur saisie en nombre ; null si vide ou illisible. Virgule ou point, espaces ignorés (« 1 650 »). */
function parseMeasureValue(text: string): number | null {
  const compact = text.replace(/\s/g, '');
  if (!DECIMAL_PATTERN.test(compact)) {
    return null;
  }
  const value = Number(compact.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function resultsNotSaved(error: string): string {
  return `Séance enregistrée, résultats non enregistrés : ${error}\n« Réessayer les résultats » ne recrée pas la séance.`;
}

/** Ensemble avec key en plus ; le même s'il la contient déjà (pas de rendu inutile). */
function withKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  return keys.has(key) ? keys : new Set([...keys, key]);
}

/** Ensemble sans key ; le même s'il ne la contient pas. */
function withoutKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) {
    return keys;
  }
  const next = new Set(keys);
  next.delete(key);
  return next;
}

/** Pluriel français, 0 et 1 au singulier : « 1 résultat », « 2 résultats ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count >= 2 ? plural : singular}`;
}

/** « Précision arrêt — pied droit (pts /30) » */
function formatMeasureLabel(measure: Measure): string {
  return `${measure.name} (${measure.unit})`;
}

/** Matériel identique dans tous les exercices : le matériel de toute la fiche ; null sinon (l'intro le décrit). */
function sharedEquipment(exercises: readonly Exercise[]): string | null {
  if (exercises.length === 0) {
    return null;
  }
  const first = exercises[0].setup.equipment;
  return exercises.every((exercise) => exercise.setup.equipment === first) ? first : null;
}

/** Chrono de la séance en cours, à droite de l'en-tête natif : même source que le bandeau des onglets. */
function HeaderClock({ startedAt }: { startedAt: string }) {
  // Recalculé chaque seconde seulement fiche au premier plan et app active.
  const elapsed = useElapsedLabel(startedAt);
  // Libellé stable : un chrono relu chaque seconde par le lecteur d'écran serait du bruit.
  return (
    <Text
      accessibilityLabel="Chrono de la séance"
      style={[text.bodyStrong, text.tabular, Platform.OS === 'web' && styles.headerClockWeb]}
    >
      {elapsed}
    </Text>
  );
}

type TestConfirmationProps = {
  sheet: Sheet;
  saved: SavedTest;
};

/**
 * Test enregistré, à la place de sa saisie : confirmation, puis sa progression
 * dans le Profil ou le retour à l'onglet. Plus de Précédent, de Suivant ni
 * d'abandon : tout est envoyé.
 */
function TestConfirmation({ sheet, saved }: TestConfirmationProps) {
  const results = formatCount(saved.resultCount, 'résultat', 'résultats');
  return (
    <>
      {/* headerRight explicite : setOptions fusionne, le chrono de la séance terminée resterait affiché. */}
      <Stack.Screen options={{ title: 'Test enregistré', headerRight: undefined }} />
      <Screen
        // key : la confirmation glisse une fois, à l'arrivée sur cet état.
        toast={<SaveToast key={saved.sessionId} message={`Test enregistré : ${sheet.title}, ${results}.`} />}
        footer={
          <>
            <Button
              label="Voir ma progression"
              onPress={() =>
                router.dismissTo({
                  pathname: '/profile',
                  params: { focusTest: sheet.id, focusSession: saved.sessionId },
                })
              }
            />
            <Button variant="secondary" label="Retour à l’entraînement" onPress={() => router.dismissTo('/training')} />
          </>
        }
      >
        <Card bordered style={styles.savedCard}>
          <Ionicons name="checkmark-circle" size={size.icon} color={colors.success} aria-hidden />
          <View style={styles.savedText}>
            <Text style={text.bodyStrong}>{`Test enregistré : ${sheet.title}`}</Text>
            <Text style={text.meta}>{`${results} · évolution dans le Profil`}</Text>
          </View>
        </Card>
      </Screen>
    </>
  );
}

type OverviewProps = {
  sheet: Sheet;
  /** Saute à l'écran d'un exercice (1 à n). */
  onOpen: (step: number) => void;
};

/** Présentation : le titre est celui de Screen ; ici le sous-titre, l'intro, puis un accès à chaque exercice. */
function Overview({ sheet, onOpen }: OverviewProps) {
  const equipment = sharedEquipment(sheet.exercises);
  const duration = `Durée : ${sheet.duration_min} min`;
  return (
    <>
      <View style={layout.section}>
        {sheet.subtitle ? <Text style={[text.body, styles.muted]}>{sheet.subtitle}</Text> : null}
        {sheet.intro.map((line, index) => (
          <Text key={index} style={text.body}>
            {line}
          </Text>
        ))}
        <Text style={text.meta}>{equipment !== null ? `${duration} · Matériel : ${equipment}` : duration}</Text>
      </View>

      <View style={layout.section}>
        <Text role="heading" style={text.overline}>
          {sheet.kind === 'test' ? 'Blocs' : 'Exercices'}
        </Text>
        {sheet.exercises.map((exercise, index) => (
          <Card key={exercise.order} onPress={() => onOpen(index + 1)}>
            <Text style={text.bodyStrong}>{`${exercise.order}. ${exercise.title}`}</Text>
            <Text style={text.meta}>{`${exercise.duration_min} min`}</Text>
          </Card>
        ))}
      </View>
    </>
  );
}

type ExerciseStepProps = {
  exercise: Exercise;
  /** « Plus de tips » déplié : critères, points techniques, variables, mise en place. */
  tipsOpen: boolean;
  onToggleTips: () => void;
};

/**
 * Un exercice, l'essentiel d'abord : illustration, titre, Objectif, But,
 * Consignes (et les mesures d'un bloc de test) ; le reste du JSON sous « Plus
 * de tips ». Tout le contenu du JSON reste affichable.
 */
function ExerciseStep({ exercise, tipsOpen, onToggleTips }: ExerciseStepProps) {
  const { setup, variations } = exercise;
  return (
    <>
      {/* key : l'état chargé / introuvable repart de zéro à chaque schéma. Sans schéma : le terrain par défaut. */}
      {exercise.diagram !== null ? (
        <Diagram key={exercise.diagram} file={exercise.diagram} title={exercise.title} />
      ) : (
        <PitchPlaceholder />
      )}

      <View style={styles.titleBlock}>
        <Text role="heading" style={text.title}>
          {exercise.title}
        </Text>
        <Text style={text.meta}>{`${exercise.duration_min} min`}</Text>
      </View>

      <Section title="Objectif">
        <Text style={text.body}>{exercise.objective}</Text>
      </Section>
      <Section title="But">
        <Text style={text.body}>{exercise.goal}</Text>
      </Section>
      <Section title="Consignes">
        <TextList items={exercise.instructions} numbered />
      </Section>
      {/* Bloc de test : ce qu'il faut noter pendant le bloc, toujours visible. */}
      {exercise.measures.length > 0 ? (
        <Section title="Mesures, saisies à la fin">
          {exercise.measures.map((measure) => (
            <Text key={measure.key} style={text.body}>
              {formatMeasureLabel(measure)}
            </Text>
          ))}
        </Section>
      ) : null}

      {/* Repli sans animation ; l'état vit dans SheetReader, gardé d'un exercice à l'autre. */}
      <Button
        variant="secondary"
        label="Plus de tips"
        icon={tipsOpen ? 'chevron-up' : 'chevron-down'}
        expanded={tipsOpen}
        onPress={onToggleTips}
      />
      {tipsOpen ? (
        <>
          <Section title="Critères de réussite">
            <TextList items={exercise.success_criteria} />
          </Section>
          <Section title="Points techniques">
            <TextList items={exercise.technical_points} />
          </Section>
          {variations !== null ? (
            <Section title="Variables">
              <Text style={text.body}>{`Plus facile : ${variations.easier}`}</Text>
              <Text style={text.body}>{`Plus dur : ${variations.harder}`}</Text>
            </Section>
          ) : null}

          <Text style={text.meta}>
            {`Surface : ${setup.surface} · Séquence : ${setup.sequence} · Effectif : ${setup.equipment}`}
          </Text>
        </>
      ) : null}
    </>
  );
}

/** Schéma en pleine largeur ; un fichier absent du bucket est dit, jamais masqué. */
function Diagram({ file, title }: { file: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <FieldError message={`Schéma introuvable : ${file} (bucket Storage diagrams).`} />;
  }
  return (
    <View style={styles.diagram}>
      <Image
        source={{ uri: diagramUrl(file) }}
        resizeMode="contain"
        accessibilityLabel={`Schéma : ${title}`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
      {!loaded ? <ActivityIndicator color={colors.accent} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** Intertitre en overline, puis son contenu. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.overline}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Liste à puces « · », ou numérotée ; une ligne trop longue reste alignée sous son texte. */
function TextList({ items, numbered = false }: { items: readonly string[]; numbered?: boolean }) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[text.body, text.tabular]}>{numbered ? `${index + 1}.` : '·'}</Text>
          <Text style={[text.body, styles.listText]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

type TestFormProps = {
  sheet: Sheet;
  tests: ReadonlyMap<string, TestRow>;
  latest: ReadonlyMap<string, LatestResult>;
  today: string;
  values: Readonly<Partial<Record<string, string>>>;
  /** Mesures validées par ✓ : valeur affichée en clair sur fond vert. */
  validated: ReadonlySet<string>;
  /** Mesures dont le ✓ a été refusé (valeur illisible) : champ encadré en rouge et message dessous. */
  refused: ReadonlySet<string>;
  comment: string;
  commentEditable: boolean;
  /** Mesures refusées au dernier envoi : champ encadré en rouge et message dessous. */
  invalidKeys: ReadonlySet<string>;
  onChangeValue: (key: string, text: string) => void;
  /** ✓ sur une ligne non validée, avec la valeur proposée (saisie, ou dernière valeur). */
  onValidate: (key: string, candidate: string) => void;
  /** Ligne validée touchée : de nouveau modifiable. */
  onEdit: (key: string) => void;
  onChangeComment: (text: string) => void;
};

/**
 * Dernier écran d'un test : une ligne par mesure, bloc par bloc, à valider par ✓
 * (façon Strong). Le bouton d'envoi et son message sont dans le pied de l'écran.
 */
function TestForm({
  sheet,
  tests,
  latest,
  today,
  values,
  validated,
  refused,
  comment,
  commentEditable,
  invalidKeys,
  onChangeValue,
  onValidate,
  onEdit,
  onChangeComment,
}: TestFormProps) {
  // Pas de titre ici : l'en-tête natif dit déjà « Saisie des mesures ».
  return (
    <>
      {sheet.exercises.map((block) => (
        <Card key={block.order} style={styles.blockCard}>
          <Text style={text.bodyStrong}>{`${block.order}. ${block.title}`}</Text>
          {block.measures.map((measure) => {
            const test = tests.get(measure.key);
            const last = test ? latest.get(test.id) : undefined;
            return (
              <MeasureField
                key={measure.key}
                measure={measure}
                value={values[measure.key] ?? ''}
                lastValue={last ? formatDecimal(last.value) : null}
                validated={validated.has(measure.key)}
                invalid={invalidKeys.has(measure.key) || refused.has(measure.key)}
                lastLabel={
                  last
                    ? `dernier : ${formatMeasure(last.value, measure.unit)} · ${relativeDay(last.date, today)}`
                    : PLACEHOLDER
                }
                onChange={(entry) => onChangeValue(measure.key, entry)}
                onValidate={(candidate) => onValidate(measure.key, candidate)}
                onEdit={() => onEdit(measure.key)}
              />
            );
          })}
        </Card>
      ))}

      <View style={layout.section}>
        <Text style={text.overline}>Commentaire</Text>
        <TextInput
          {...inputProps}
          style={[input.field, input.multiline]}
          value={comment}
          onChangeText={onChangeComment}
          editable={commentEditable}
          placeholder="Commentaire (facultatif)"
          multiline
        />
      </View>
    </>
  );
}

type MeasureFieldProps = {
  measure: Measure;
  value: string;
  /** Dernière valeur connue (« 18 », « 4,32 »), en gris dans le champ vide ; null si jamais mesurée. */
  lastValue: string | null;
  validated: boolean;
  invalid: boolean;
  /** « dernier : 18 pts /30 · il y a 4 j », ou « — » si jamais mesurée. */
  lastLabel: string;
  onChange: (text: string) => void;
  onValidate: (candidate: string) => void;
  onEdit: () => void;
};

/**
 * Une mesure façon Strong : la dernière valeur en gris dans le champ, ✓ valide
 * la saisie ou, sans saisie, cette valeur grise. Ligne validée : teinte succès,
 * valeur en clair ; touchée (valeur ou ✓), elle redevient modifiable.
 */
function MeasureField({
  measure,
  value,
  lastValue,
  validated,
  invalid,
  lastLabel,
  onChange,
  onValidate,
  onEdit,
}: MeasureFieldProps) {
  const label = formatMeasureLabel(measure);
  const typed = value.trim();
  const reduceMotion = useReduceMotion();
  // Micro-interaction b, au passage à « validée » : teinte succès fondue en
  // motion.micro (la coche se pose en même temps) et pulsation 1 → 1,03 → 1 en
  // motion.base, courbe de la DA, sans ressort.
  const [scale] = useState(() => new Animated.Value(1));
  const [tint] = useState(() => new Animated.Value(validated ? 1 : 0));
  // Validée au rendu précédent : une ligne déjà validée à l'affichage (retour d'un bloc) ne s'anime pas.
  const wasValidated = useRef(validated);
  const inputRef = useRef<TextInput>(null);
  // Valeur touchée pour la modifier : le champ qui la remplace prend le focus (pas avec le ✓).
  const focusOnEdit = useRef(false);

  useEffect(() => {
    const before = wasValidated.current;
    wasValidated.current = validated;
    // Premier affichage : ni animation, ni focus.
    if (before === validated) {
      return;
    }
    if (!validated) {
      tint.setValue(0);
      if (focusOnEdit.current) {
        focusOnEdit.current = false;
        inputRef.current?.focus();
      }
      return;
    }
    if (reduceMotion) {
      tint.setValue(1);
      return;
    }
    const half = motion.base / 2;
    const timing = (animated: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(animated, { toValue, duration, easing: motion.easing, useNativeDriver: motion.useNativeDriver });
    const animation = Animated.parallel([
      timing(tint, 1, motion.micro),
      Animated.sequence([timing(scale, motion.validateScale, half), timing(scale, 1, half)]),
    ]);
    animation.start();
    return () => {
      // Ligne rouverte ou écran quitté pendant l'animation : aspect validé aussitôt.
      animation.stop();
      scale.setValue(1);
      tint.setValue(1);
    };
  }, [validated, reduceMotion, scale, tint]);

  function validate() {
    // Sans saisie, la dernière valeur (en gris) devient la valeur de la ligne.
    const candidate = typed !== '' ? typed : lastValue;
    if (candidate !== null) {
      onValidate(candidate);
    }
  }

  function editValue() {
    focusOnEdit.current = true;
    onEdit();
  }

  return (
    <Animated.View style={[styles.measure, { transform: [{ scale }] }]}>
      {/* Teinte succès sous le contenu, aux coins de la ligne ; les touches passent à travers. */}
      <Animated.View style={[styles.measureTint, { opacity: tint }]} />
      <Text style={text.body}>{label}</Text>
      <View style={styles.measureRow}>
        {validated ? (
          <Pressable
            role="button"
            accessibilityLabel={`Modifier : ${measure.name}, ${value}`}
            onPress={editValue}
            style={({ pressed }) => [styles.validatedValue, pressed && styles.validatedValuePressed]}
          >
            <Text style={[text.title, text.tabular]}>{value}</Text>
          </Pressable>
        ) : (
          <TextInput
            {...inputProps}
            ref={inputRef}
            style={[input.field, styles.valueInput, invalid && input.invalid]}
            value={value}
            onChangeText={onChange}
            // Clavier numérique avec séparateur décimal (decimal-pad natif, inputmode web).
            inputMode="decimal"
            // Dernière valeur en gris (placeholderTextColor de inputProps) ; l'unité si jamais mesurée.
            placeholder={lastValue ?? measure.unit}
            accessibilityLabel={label}
          />
        )}
        <IconButton
          icon="checkmark"
          // Le libellé dit ce que fait le tap : valider, ou rouvrir une ligne validée.
          accessibilityLabel={validated ? `Modifier : ${measure.name}` : `Valider : ${measure.name}`}
          // Rien à valider : ni saisie, ni dernière valeur.
          disabled={!validated && typed === '' && lastValue === null}
          checked={validated}
          onPress={validated ? onEdit : validate}
        />
      </View>
      <Text style={[text.meta, text.tabular]}>{lastLabel}</Text>
      <FieldError message={invalid ? INVALID_MEASURE_MESSAGE : null} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  muted: {
    color: colors.textMuted,
  },
  previousButton: {
    flex: 1,
  },
  primaryButton: {
    flex: 2,
  },
  // En-tête web : rien n'écarte sa droite du bord (Android et iOS le font déjà).
  headerClockWeb: {
    paddingEnd: spacing.lg,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  // Un titre long passe à la ligne à côté de l'icône au lieu de déborder.
  savedText: {
    flex: 1,
    gap: spacing.xs,
  },
  diagram: {
    width: '100%',
    aspectRatio: DIAGRAM_WIDTH / DIAGRAM_HEIGHT,
    borderRadius: radius.card,
    // Les coins arrondis découpent aussi l'image.
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listText: {
    flex: 1,
  },
  // Plus d'écart entre deux mesures qu'à l'intérieur d'une mesure : chaque libellé
  // se lit avec son champ, pas avec celui du dessus.
  blockCard: {
    gap: spacing.lg,
  },
  // Même marge et mêmes coins validée ou non, seule la teinte change : rien ne se décale.
  measure: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.button,
  },
  measureTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.button,
    backgroundColor: colors.successSoft,
    pointerEvents: 'none',
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  // Le champ prend la rangée, le ✓ garde ses 48 px à droite.
  valueInput: {
    flex: 1,
  },
  // Valeur validée, à la place du champ : même hauteur, même marge intérieure.
  validatedValue: {
    flex: 1,
    minHeight: size.input,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
  },
  validatedValuePressed: {
    backgroundColor: colors.surfacePressed,
  },
});
