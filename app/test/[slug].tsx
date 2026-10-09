import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderClock } from '../../components/active-session-bar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ContentSection, ExerciseDiagram, ExerciseTips, TextList } from '../../components/exercise-content';
import { FieldError } from '../../components/field-error';
import { IconButton } from '../../components/icon-button';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { CommentField, MAX_DURATION } from '../../components/session-form';
import { elapsedMinutes, elapsedMs, type ActiveTestRun } from '../../lib/active-session';
import { confirmAbandon, useActiveSession, vibrateOnSave } from '../../lib/active-session-context';
import { localDateOfTimestamp, localToday, relativeDay } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import { createTestResults, getLatestResults, listCatalogByKeys, listResultValues } from '../../lib/db/test-results';
import { getTestBySlug, type AtomicTest } from '../../lib/db/training';
import { hapticMedium, hapticSuccess } from '../../lib/haptics';
import { formatDecimal, formatMeasure } from '../../lib/measure-delta';
import { DEFAULT_DIFFICULTY, getModule, TEST_MODULE_KEY } from '../../lib/modules';
import { bestValue, isNewRecord } from '../../lib/records';
import { useReduceMotion } from '../../lib/reduce-motion';
import type { Measure } from '../../lib/sheet-types';
import { familyCaption } from '../../lib/test-families';
import { colors, input, inputProps, layout, motion, radius, size, spacing, text } from '../../lib/theme';

const NO_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.';
const NO_RESULTS_MESSAGE = 'Supabase n’a renvoyé ni les résultats ni d’erreur.';
/** Sous une mesure refusée (✓ ou envoi) ; le message au-dessus du bouton nomme toutes les mesures à compléter. */
const INVALID_MEASURE_MESSAGE = 'Nombre attendu (virgule ou point).';
/** Valeur d'une mesure, espaces retirés : des chiffres, avec virgule ou point décimal. */
const DECIMAL_PATTERN = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const NO_KEYS: ReadonlySet<string> = new Set();

/** Une mesure du test, prête à saisir. */
type MeasureLine = {
  measure: Measure;
  /** Ligne du catalogue tests : les résultats s'y rattachent. */
  catalogId: string;
  /** Dernière valeur (« 18 », « 4,32 »), en gris dans le champ vide ; null si jamais mesurée. */
  lastValue: string | null;
  /** Record avant cette saisie ; null si jamais mesurée. */
  record: number | null;
  /** « Record : 18 pts /30 · Dernier : 16 pts /30, il y a 4 j », ou « Jamais mesuré ». */
  summary: string;
};

type Loaded = { test: AtomicTest; lines: MeasureLine[] };

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

/** Valeur enregistrée d'une mesure ; previousRecord : record battu, null sinon. */
type SavedValue = { value: number; previousRecord: number | null };

/** Test enregistré hors session : sa séance, et chaque valeur avec son éventuel record battu. */
type SavedTest = { sessionId: string; values: ReadonlyMap<string, SavedValue> };

/** Mesure saisie, lue en nombre. */
type Entry = { line: MeasureLine; value: number };

/**
 * slug : le test. saved / records : posés par le test précédent d'une session,
 * qui vient d'être enregistré (confirmation sur celui-ci).
 */
type TestParams = { slug?: string; saved?: string; records?: string };

export default function TestScreen() {
  const { slug, saved, records } = useLocalSearchParams<TestParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const testSlug = typeof slug === 'string' && slug !== '' ? slug : null;
  const [state, setState] = useState<LoadState>(testSlug ? { status: 'loading' } : { status: 'empty' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    if (!testSlug) {
      return;
    }
    let active = true;
    loadTest(testSlug)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue (jour mal formé refusé par relativeDay…) : affichée, jamais avalée.
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
  }, [testSlug, loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  if (state.status !== 'ready') {
    return (
      <>
        <Stack.Screen options={{ title: 'Test' }} />
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
              title="Test introuvable"
              message="Il a peut-être été retiré du contenu."
              action={{ label: 'Voir les tests', onPress: () => router.dismissTo('/training') }}
            />
          ) : null}
        </Screen>
      </>
    );
  }

  return (
    <TestReader
      key={state.loaded.test.id}
      loaded={state.loaded}
      previousSaved={typeof saved === 'string' && saved !== '' ? { title: saved, records: Number(records) } : null}
    />
  );
}

/**
 * Test, puis chaque mesure : sa ligne du catalogue, sa dernière valeur et son
 * record. Une mesure absente du catalogue est une erreur : le seed n'a pas été
 * exécuté, ou le JSON a changé sans lui.
 */
async function loadTest(slug: string): Promise<LoadState> {
  const { data: test, error } = await getTestBySlug(slug);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  if (!test) {
    return { status: 'empty' };
  }
  const measures = test.exercise.measures;
  const catalog = await listCatalogByKeys(measures.map((measure) => measure.key));
  if (catalog.error !== null) {
    return { status: 'error', message: catalog.error };
  }
  const byKey = new Map((catalog.data ?? []).map((row) => [row.key, row]));
  const missing = measures.filter((measure) => !byKey.has(measure.key)).map((measure) => measure.key);
  if (missing.length > 0) {
    return {
      status: 'error',
      message: `Mesures absentes du catalogue tests : ${missing.join(', ')}. Exécuter supabase/seed_sheets_001.sql.`,
    };
  }
  const ids = measures.flatMap((measure) => byKey.get(measure.key)?.id ?? []);
  const results = await listResultValues(ids);
  if (results.error !== null) {
    return { status: 'error', message: results.error };
  }
  // Libellés calculés ici, avec le jour de la lecture : une exception part dans le catch.
  const today = localToday();
  const lines = measures.flatMap((measure): MeasureLine[] => {
    const row = byKey.get(measure.key);
    if (!row) {
      return [];
    }
    // Plus récents d'abord : le premier est le dernier résultat.
    const own = (results.data ?? []).filter((result) => result.test_id === row.id);
    const last = own[0] ?? null;
    const record = bestValue(
      own.map((result) => result.value),
      measure.higher_is_better,
    );
    const summary =
      last === null || record === null
        ? 'Jamais mesuré'
        : `Record : ${formatMeasure(record, measure.unit)} · Dernier : ${formatMeasure(last.value, measure.unit)}, ${relativeDay(last.date, today)}`;
    return [
      {
        measure,
        catalogId: row.id,
        lastValue: last === null ? null : formatDecimal(last.value),
        record,
        summary,
      },
    ];
  });
  return { status: 'ready', loaded: { test, lines } };
}

type TestReaderProps = {
  loaded: Loaded;
  /** Test précédent de la session, tout juste enregistré : confirmé ici. */
  previousSaved: { title: string; records: number } | null;
};

/**
 * Un test atomique sur un seul écran : protocole, schéma, « Plus de tips », puis
 * la saisie des mesures façon Strong (✓ par ligne). Hors session, Enregistrer
 * crée sa séance puis ses résultats, et la confirmation remplace la saisie. En
 * session, les résultats se rattachent à la séance de la session et Enregistrer
 * enchaîne sur le test suivant ; au dernier, « Terminer la session » ouvre
 * l'écran de fin (durée réelle). Tant qu'aucun résultat de la session n'est
 * enregistré, « Abandonner la session » (rien n'est créé) ; dès le premier,
 * « Terminer » mène à l'écran de fin depuis chaque test sauf le dernier.
 */
function TestReader({ loaded, previousSaved }: TestReaderProps) {
  const { test, lines } = loaded;
  const activeSession = useActiveSession();
  const { updateRun } = activeSession;
  const current = activeSession.session;
  // Jour figé à l'ouverture : sans chrono, la séance compte pour le jour où le test a été ouvert.
  const [today] = useState(localToday);
  // Place de ce test dans la session en cours, figée dès qu'elle est connue : enregistré,
  // le test fait passer la session au suivant sans que cet écran change de mode.
  const [runPosition, setRunPosition] = useState<number | null | undefined>(undefined);
  if (runPosition === undefined && !activeSession.loading) {
    setRunPosition(
      current?.kind === 'session' && current.tests[current.lastExerciseIndex - 1] === test.slug
        ? current.lastExerciseIndex
        : null,
    );
  }
  // Session en cours dont ce test est l'étape ; null : test seul.
  const run =
    typeof runPosition === 'number' && current?.kind === 'session' && current.tests[runPosition - 1] === test.slug
      ? current
      : null;
  // Test démarré seul par ▶ ; null : sans chrono, ou un autre est en cours.
  const timed = current?.kind === 'test' && current.slug === test.slug ? current : null;
  const startedAt = run?.startedAt ?? timed?.startedAt ?? null;
  const runCount = run?.tests.length ?? 0;
  const isLastOfRun = run !== null && runPosition === runCount;

  const [tipsOpen, setTipsOpen] = useState(false);
  const [values, setValues] = useState<Readonly<Partial<Record<string, string>>>>({});
  // Lignes validées par ✓, et lignes dont le ✓ a été refusé (valeur illisible).
  const [validated, setValidated] = useState<ReadonlySet<string>>(NO_KEYS);
  const [refused, setRefused] = useState<ReadonlySet<string>>(NO_KEYS);
  const [comment, setComment] = useState('');
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  // Test seul : séance créée mais résultats non enregistrés ; le réessai ne la recrée pas.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  // Séance créée (test seul ou session), résultats refusés : le bouton devient « Réessayer les résultats ».
  const [resultsPending, setResultsPending] = useState(false);
  // Test seul enregistré : la confirmation remplace la saisie.
  const [savedTest, setSavedTest] = useState<SavedTest | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const saving = save.status === 'saving';
  const validatedCount = lines.filter((line) => validated.has(line.measure.key)).length;
  const allValidated = validatedCount === lines.length;
  // Session sans résultat enregistré (ni séance créée, ni résultats en attente de
  // réessai) : elle s'abandonne ; dès le premier résultat, elle se termine.
  const runUnsaved = run !== null && run.sessionId === null && !resultsPending;
  // Abandon possible tant qu'aucune séance n'est créée, rien n'est perdu : test
  // démarré seul par ▶, ou session sans résultat.
  const canAbandon = (timed !== null && pendingSessionId === null) || runUnsaved;

  function changeValue(key: string, entry: string) {
    setValues((currentValues) => ({ ...currentValues, [key]: entry }));
    // Nouvelle saisie : le refus du ✓ précédent ne la concerne plus.
    setRefused((keys) => withoutKey(keys, key));
  }

  /** ✓ : la valeur proposée (saisie, ou dernière valeur en gris) devient celle de la ligne, si elle se lit. */
  function validateMeasure(key: string, candidate: string) {
    if (parseMeasureValue(candidate) === null) {
      setRefused((keys) => withKey(keys, key));
      return;
    }
    setValues((currentValues) => ({ ...currentValues, [key]: candidate }));
    setRefused((keys) => withoutKey(keys, key));
    setValidated((keys) => withKey(keys, key));
    hapticSuccess();
  }

  /** Ligne validée touchée (sa valeur ou son ✓) : de nouveau modifiable. */
  function editMeasure(key: string) {
    setValidated((keys) => withoutKey(keys, key));
  }

  function fail(message: string) {
    pendingRef.current = false;
    setSave({ status: 'error', message, invalidKeys: NO_KEYS });
  }

  async function submit() {
    if (pendingRef.current) {
      return;
    }
    const entries: Entry[] = [];
    const invalid: Measure[] = [];
    for (const line of lines) {
      const value = parseMeasureValue(values[line.measure.key] ?? '');
      if (value === null) {
        invalid.push(line.measure);
      } else {
        entries.push({ line, value });
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
    if (run !== null && typeof runPosition === 'number') {
      await submitInRun(run, runPosition, entries);
    } else {
      await submitAlone(entries);
    }
  }

  /** Test seul : sa séance (durée réelle si ▶ l'a démarré, sinon celle du test), puis ses résultats. */
  async function submitAlone(entries: Entry[]) {
    // Test démarré : jour du démarrage en heure locale, comme l'écran de fin d'une fiche.
    const sessionDate = timed !== null ? localDateOfTimestamp(timed.startedAt) : today;
    let sessionId: string;
    if (pendingSessionId === null) {
      const created = await createSession({
        date: sessionDate,
        module: TEST_MODULE_KEY,
        type: getModule(TEST_MODULE_KEY).type,
        name: test.title,
        duration_min: timed !== null ? elapsedDuration(timed.startedAt) : test.durationMin,
        difficulty: DEFAULT_DIFFICULTY,
        comment: comment.trim() || null,
        sheet_id: test.id,
      });
      if (created.error !== null || created.data === null) {
        fail(`Erreur : ${created.error ?? NO_SESSION_MESSAGE}`);
        return;
      }
      sessionId = created.data.id;
      setPendingSessionId(sessionId);
    } else {
      sessionId = pendingSessionId;
      const already = await alreadySaved(entries, sessionId);
      if (already === null) {
        return;
      }
      if (already) {
        showSaved(sessionId, entries);
        return;
      }
    }
    if (await insertResults(entries, sessionId, sessionDate)) {
      showSaved(sessionId, entries);
    }
  }

  /**
   * En session : la séance de la session (créée au premier test enregistré, à la
   * durée écoulée ; l'écran de fin pose la durée réelle), puis les résultats ;
   * ensuite le test suivant, ou l'écran de fin après le dernier.
   */
  async function submitInRun(currentRun: ActiveTestRun, position: number, entries: Entry[]) {
    const sessionDate = localDateOfTimestamp(currentRun.startedAt);
    let sessionId = currentRun.sessionId;
    if (sessionId === null) {
      const created = await createSession({
        date: sessionDate,
        module: TEST_MODULE_KEY,
        type: getModule(TEST_MODULE_KEY).type,
        name: currentRun.title,
        duration_min: elapsedDuration(currentRun.startedAt),
        difficulty: DEFAULT_DIFFICULTY,
        comment: null,
        sheet_id: currentRun.sheetId,
      });
      if (created.error !== null || created.data === null) {
        fail(`Erreur : ${created.error ?? NO_SESSION_MESSAGE}`);
        return;
      }
      sessionId = created.data.id;
      // Mémorisée aussitôt : un réessai et les tests suivants s'y rattachent.
      updateRun({ sessionId });
    } else {
      // Réessai, retour arrière ou relance de l'app après l'envoi : déjà enregistré ?
      const already = await alreadySaved(entries, sessionId);
      if (already === null) {
        return;
      }
      if (already) {
        goToNextInRun(currentRun, position, entries);
        return;
      }
    }
    if (await insertResults(entries, sessionId, sessionDate)) {
      goToNextInRun(currentRun, position, entries);
    }
  }

  /**
   * Le dernier résultat de chaque mesure vient-il déjà de cette séance ? Un envoi
   * a pu aboutir en base sans que sa réponse arrive : un second insert doublerait
   * les résultats. null : la vérification a échoué (message affiché).
   */
  async function alreadySaved(entries: Entry[], sessionId: string): Promise<boolean | null> {
    const check = await getLatestResults(entries.map((entry) => entry.line.catalogId));
    if (check.error !== null || check.data === null) {
      setResultsPending(true);
      fail(resultsNotSaved(check.error ?? NO_RESULTS_MESSAGE));
      return null;
    }
    const latest = check.data;
    return entries.every((entry) => latest.get(entry.line.catalogId)?.session_id === sessionId);
  }

  /** Une seule requête pour toutes les mesures : enregistrées toutes, ou aucune. */
  async function insertResults(entries: Entry[], sessionId: string, date: string): Promise<boolean> {
    const saved = await createTestResults(
      entries.map((entry) => ({ test_id: entry.line.catalogId, value: entry.value, date, session_id: sessionId })),
    );
    if (saved.error !== null || saved.data === null) {
      setResultsPending(true);
      fail(resultsNotSaved(saved.error ?? NO_RESULTS_MESSAGE));
      return false;
    }
    return true;
  }

  /** Confirmation à la place de la saisie, avec la vibration. pendingRef reste vrai : pas de second envoi possible. */
  function showSaved(sessionId: string, entries: Entry[]) {
    // Test démarré : fin de sa séance en cours ; une autre séance en cours n'est pas touchée.
    if (timed !== null) {
      vibrateOnSave();
      void activeSession.clear();
    } else {
      hapticMedium();
    }
    setSavedTest({ sessionId, values: savedValues(entries) });
  }

  /** Test suivant de la session (sa confirmation y glisse), ou l'écran de fin après le dernier. */
  function goToNextInRun(currentRun: ActiveTestRun, position: number, entries: Entry[]) {
    hapticMedium();
    const next = position + 1;
    // Passé au suivant avant d'y aller : le bandeau et un retour arrière ne ramènent plus ici.
    updateRun({ lastExerciseIndex: next });
    const nextSlug = currentRun.tests[next - 1];
    if (nextSlug === undefined) {
      // replace : la fin de session ne revient pas sur un test déjà enregistré.
      router.replace('/session/finish');
      return;
    }
    const records = [...savedValues(entries).values()].filter((saved) => saved.previousRecord !== null).length;
    router.replace({ pathname: '/test/[slug]', params: { slug: nextSlug, saved: test.title, records: String(records) } });
  }

  /** Session entamée : Terminer avant le dernier test ; l'écran de fin complète la séance déjà créée. */
  function finishRun() {
    router.push('/session/finish');
  }

  /** Abandon du test ou de la session en cours, avant toute séance créée : rien n'est enregistré. */
  function abandon() {
    if (pendingRef.current) {
      return;
    }
    confirmAbandon(
      () => {
        pendingRef.current = true;
        void activeSession.clear();
        // Sans params : une confirmation d'enregistrement restée sur l'onglet disparaît.
        router.dismissTo('/training');
      },
      run !== null ? 'la session' : 'la séance',
    );
  }

  if (savedTest !== null) {
    return <TestConfirmation test={test} lines={lines} saved={savedTest} />;
  }

  // En session : sa progression dans l'en-tête natif ; le titre du test est dans le contenu.
  const headerTitle = run !== null && typeof runPosition === 'number' ? `Test ${runPosition} / ${runCount}` : 'Test';
  const primaryLabel = resultsPending ? 'Réessayer les résultats' : isLastOfRun ? 'Terminer la session' : 'Enregistrer';

  const footer = (
    <>
      <FieldError message={save.status === 'error' ? save.message : null} />
      {/* Pourquoi l'envoi attend encore, et ce qu'il reste à valider. */}
      {!allValidated ? (
        <Text style={[text.meta, text.tabular]}>{`Valide chaque mesure avec ✓ : ${validatedCount} / ${lines.length}`}</Text>
      ) : null}
      {/* Session entamée : Terminer à chaque test sauf le dernier, dont l'action principale termine déjà. */}
      {run !== null && !runUnsaved && !isLastOfRun ? (
        <Button variant="secondary" label="Terminer" disabled={saving} onPress={finishRun} />
      ) : null}
      <Button label={primaryLabel} disabled={!allValidated} loading={saving} onPress={submit} />
      {/* Un seul bouton d'abandon : la session sans résultat (à chaque test), ou le test démarré seul. */}
      {canAbandon ? (
        <Button
          variant="danger"
          label={run !== null ? 'Abandonner la session' : 'Abandonner la séance'}
          disabled={saving}
          onPress={abandon}
        />
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          // Chrono du test ou de la session en cours à droite. undefined explicite sinon :
          // setOptions fusionne, le chrono d'une séance finie resterait affiché.
          headerRight: startedAt !== null ? () => <HeaderClock startedAt={startedAt} /> : undefined,
        }}
      />
      <Screen
        scrollRef={scrollRef}
        footer={footer}
        toast={
          previousSaved !== null ? (
            <SaveToast key={test.slug} message={formatPreviousSaved(previousSaved.title, previousSaved.records)} />
          ) : null
        }
      >
        <TestHeading test={test} />

        <Card>
          <Text role="heading" style={text.overline}>
            Protocole
          </Text>
          <TextList items={test.exercise.instructions} numbered />
        </Card>

        <ExerciseDiagram exercise={test.exercise} />

        {/* Repli sans animation, gardé tant que l'écran est ouvert. */}
        <Button
          variant="secondary"
          label="Plus de tips"
          icon={tipsOpen ? 'chevron-up' : 'chevron-down'}
          expanded={tipsOpen}
          onPress={() => setTipsOpen((open) => !open)}
        />
        {tipsOpen ? (
          <>
            <ContentSection title="Objectif">
              <Text style={text.body}>{test.exercise.objective}</Text>
            </ContentSection>
            <ContentSection title="But">
              <Text style={text.body}>{test.exercise.goal}</Text>
            </ContentSection>
            <ExerciseTips exercise={test.exercise} />
            {test.intro.length > 0 ? (
              <ContentSection title="Règles communes">
                <TextList items={test.intro} />
              </ContentSection>
            ) : null}
          </>
        ) : null}

        <ContentSection title="Mesures">
          {lines.map((line) => {
            const key = line.measure.key;
            return (
              <MeasureField
                key={key}
                line={line}
                value={values[key] ?? ''}
                validated={validated.has(key)}
                invalid={(save.status === 'error' && save.invalidKeys.has(key)) || refused.has(key)}
                onChange={(entry) => changeValue(key, entry)}
                onValidate={(candidate) => validateMeasure(key, candidate)}
                onEdit={() => editMeasure(key)}
              />
            );
          })}
        </ContentSection>

        {/* Test seul, séance pas encore créée : son commentaire. En session, il se saisit sur l'écran de fin. */}
        {run === null && pendingSessionId === null ? <CommentField value={comment} onChange={setComment} /> : null}
      </Screen>
    </>
  );
}

/** Titre du test (titre d'écran) et sa famille en caption, serrés l'un sous l'autre. */
function TestHeading({ test }: { test: AtomicTest }) {
  return (
    <View style={styles.heading}>
      <Text role="heading" style={text.screen}>
        {test.title}
      </Text>
      <Text style={text.meta}>{`${familyCaption(test.family)} · ${test.durationMin} min`}</Text>
    </View>
  );
}

type TestConfirmationProps = {
  test: AtomicTest;
  lines: readonly MeasureLine[];
  saved: SavedTest;
};

/**
 * Test seul enregistré, à la place de sa saisie : chaque valeur, « Nouveau
 * record » sur chaque mesure améliorée (sans rebond), puis un autre test ou la
 * progression dans le Profil. Plus d'envoi ni d'abandon : tout est enregistré.
 */
function TestConfirmation({ test, lines, saved }: TestConfirmationProps) {
  const recordCount = [...saved.values.values()].filter((value) => value.previousRecord !== null).length;
  return (
    <>
      {/* headerRight explicite : setOptions fusionne, le chrono de la séance terminée resterait affiché. */}
      <Stack.Screen options={{ title: 'Test enregistré', headerRight: undefined }} />
      <Screen
        // key : la confirmation glisse une fois, à l'arrivée sur cet état.
        toast={<SaveToast key={saved.sessionId} message={formatSavedMessage(test.title, recordCount)} />}
        footer={
          <>
            <Button label="Faire un autre test" onPress={() => router.dismissTo('/training')} />
            <Button
              variant="secondary"
              label="Voir ma progression"
              onPress={() =>
                router.dismissTo({ pathname: '/profile', params: { focusTest: test.id, focusSession: saved.sessionId } })
              }
            />
          </>
        }
      >
        <TestHeading test={test} />
        <ContentSection title="Résultats">
          {lines.map((line) => {
            const value = saved.values.get(line.measure.key);
            if (value === undefined) {
              return null;
            }
            return (
              <Card key={line.measure.key}>
                <Text style={text.body}>{line.measure.name}</Text>
                <Text style={[text.title, text.tabular]}>{formatMeasure(value.value, line.measure.unit)}</Text>
                {value.previousRecord !== null ? (
                  <Text style={[text.meta, styles.record]}>
                    {`Nouveau record · avant : ${formatMeasure(value.previousRecord, line.measure.unit)}`}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </ContentSection>
      </Screen>
    </>
  );
}

type MeasureFieldProps = {
  line: MeasureLine;
  value: string;
  validated: boolean;
  invalid: boolean;
  onChange: (text: string) => void;
  onValidate: (candidate: string) => void;
  onEdit: () => void;
};

/**
 * Une mesure façon Strong : la dernière valeur en gris dans le champ, ✓ valide
 * la saisie ou, sans saisie, cette valeur grise. Ligne validée : teinte succès,
 * valeur en clair ; touchée (valeur ou ✓), elle redevient modifiable. Dessous,
 * le record et le dernier résultat.
 */
function MeasureField({ line, value, validated, invalid, onChange, onValidate, onEdit }: MeasureFieldProps) {
  const { measure, lastValue } = line;
  const label = `${measure.name} (${measure.unit})`;
  const typed = value.trim();
  const reduceMotion = useReduceMotion();
  // Micro-interaction b, au passage à « validée » : teinte succès fondue en
  // motion.micro (la coche se pose en même temps) et pulsation 1 → 1,03 → 1 en
  // motion.base, courbe de la DA, sans ressort.
  const [scale] = useState(() => new Animated.Value(1));
  const [tint] = useState(() => new Animated.Value(validated ? 1 : 0));
  // Validée au rendu précédent : une ligne déjà validée à l'affichage ne s'anime pas.
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
      <Text style={text.bodyStrong}>{label}</Text>
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
      <Text style={[text.meta, text.tabular]}>{line.summary}</Text>
      <FieldError message={invalid ? INVALID_MEASURE_MESSAGE : null} />
    </Animated.View>
  );
}

/** Durée enregistrée d'une séance démarrée : minutes écoulées arrondies, bornées au maximum d'une séance. */
function elapsedDuration(startedAt: string): number {
  return Math.min(MAX_DURATION, elapsedMinutes(elapsedMs(startedAt, Date.now())));
}

/** Valeurs enregistrées, avec le record qu'elles battent (strictement mieux que l'ancien). */
function savedValues(entries: readonly Entry[]): ReadonlyMap<string, SavedValue> {
  return new Map(
    entries.map(({ line, value }) => [
      line.measure.key,
      {
        value,
        previousRecord:
          line.record !== null && isNewRecord(value, line.record, line.measure.higher_is_better) ? line.record : null,
      },
    ]),
  );
}

/** Valeur saisie en nombre ; null si vide ou illisible. Virgule ou point, espaces ignorés (« 1 650 »). */
function parseMeasureValue(entry: string): number | null {
  const compact = entry.replace(/\s/g, '');
  if (!DECIMAL_PATTERN.test(compact)) {
    return null;
  }
  const value = Number(compact.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function resultsNotSaved(error: string): string {
  return `Séance enregistrée, résultats non enregistrés : ${error}\n« Réessayer les résultats » ne recrée pas la séance.`;
}

/** « 1 nouveau record », « 2 nouveaux records ». */
function formatRecords(count: number): string {
  return count >= 2 ? `${count} nouveaux records` : `${count} nouveau record`;
}

/** « Test enregistré : Sprint 30 m · 1 nouveau record. » */
function formatSavedMessage(title: string, recordCount: number): string {
  return recordCount > 0 ? `Test enregistré : ${title} · ${formatRecords(recordCount)}.` : `Test enregistré : ${title}.`;
}

/** Test précédent d'une session : « Enregistré : Sprint 30 m · 1 nouveau record. » */
function formatPreviousSaved(title: string, recordCount: number): string {
  const records = Number.isInteger(recordCount) && recordCount > 0 ? ` · ${formatRecords(recordCount)}` : '';
  return `Enregistré : ${title}${records}.`;
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

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs,
  },
  record: {
    color: colors.success,
    fontWeight: '600',
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
