import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HeaderClock } from '../../components/active-session-bar';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ContentSection, ExerciseDiagram, ExerciseTips, TextList } from '../../components/exercise-content';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { FIRST_EXERCISE_INDEX } from '../../lib/active-session';
import { askAboutActiveSession, useActiveSession } from '../../lib/active-session-context';
import { localToday } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import { getLastSessionForSheet, getSheet, type Sheet } from '../../lib/db/training';
import { hapticMedium } from '../../lib/haptics';
import { DEFAULT_DIFFICULTY, getModule, SHEET_MODULE_KEY } from '../../lib/modules';
import type { Exercise } from '../../lib/sheet-types';
import { colors, layout, spacing, text } from '../../lib/theme';

const NO_SESSION_MESSAGE = 'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.';

/** Fiche chargée, avec ce que son dernier écran demande. */
type Loaded = {
  sheet: Sheet;
  /** Jour de la dernière séance liée ; null si jamais faite. */
  lastSessionDate: string | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; loaded: Loaded };

/** Envoi de « Séance faite » en cours, ou refusé. */
type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

/** id : la fiche de lecture (un test se lit sur app/test/[slug].tsx). */
type SheetParams = { id?: string };

export default function SheetScreen() {
  const { id } = useLocalSearchParams<SheetParams>();
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

  return <SheetReader key={state.loaded.sheet.id} loaded={state.loaded} />;
}

/** Fiche introuvable : écran précédent ; sans historique (lien direct, rechargement web), la liste des fiches. */
function leaveMissingSheet() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace({ pathname: '/training/[theme]', params: { theme: 'specifique' } });
  }
}

/** Fiche, puis le jour de sa dernière séance (« Séance faite » une fois par jour). */
async function loadSheet(sheetId: string): Promise<LoadState> {
  const { data: sheet, error } = await getSheet(sheetId);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  if (!sheet) {
    return { status: 'empty' };
  }
  const last = await getLastSessionForSheet(sheet.id);
  if (last.error !== null) {
    return { status: 'error', message: last.error };
  }
  return { status: 'ready', loaded: { sheet, lastSessionDate: last.data } };
}

function SheetReader({ loaded }: { loaded: Loaded }) {
  const { sheet } = loaded;
  const activeSession = useActiveSession();
  const { setIndex } = activeSession;
  // Séance en cours de cette fiche (chronométrée) ; null : simple lecture, ou une autre séance est en cours.
  const current = activeSession.session;
  const timed = current?.kind === 'training' && current.sheetId === sheet.id ? current : null;
  const isTimed = timed !== null;
  // Jour figé à l'ouverture : sans chrono, la séance compte pour le jour où la fiche a été ouverte.
  const [today] = useState(localToday);
  const exerciseCount = sheet.exercises.length;
  const lastStep = exerciseCount;
  // 0 : présentation ; 1 à n : un exercice par écran.
  // Séance en cours : reprise à sa dernière étape, bornée si la fiche a changé depuis.
  const [step, setStep] = useState(() =>
    timed === null ? 0 : Math.min(Math.max(timed.lastExerciseIndex, 0), lastStep),
  );
  const [starting, setStarting] = useState(false);
  // Échec de mémorisation au démarrage : rien n'a démarré.
  const [startError, setStartError] = useState<string | null>(null);
  // « Plus de tips » déplié ou non : gardé d'un exercice à l'autre, le temps de la lecture.
  const [tipsOpen, setTipsOpen] = useState(false);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
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
  const alreadyDoneToday = !isTimed && loaded.lastSessionDate === today;

  function goTo(next: number) {
    setStep(Math.min(Math.max(next, 0), lastStep));
    // Contenu entièrement remplacé : lecture depuis le haut, sans défilement animé.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  /** Démarrer : la séance de cette fiche part maintenant, lecture au premier exercice. */
  async function start() {
    if (activeSession.loading || starting) {
      return;
    }
    if (current !== null && !(current.kind === 'training' && current.sheetId === sheet.id)) {
      // replace : la lecture de cette fiche cède la place à la séance en cours.
      askAboutActiveSession(current, 'replace');
      return;
    }
    setStarting(true);
    setStartError(null);
    const error = await activeSession.start({ kind: 'training', sheetId: sheet.id, title: sheet.title });
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

  /** Terminer : durée réelle sur l'écran de fin. */
  function finishTimed() {
    router.push('/session/finish');
  }

  async function markDone() {
    if (isTimed) {
      // « Séance faite » d'une fiche en cours = Terminer : durée réelle sur l'écran de fin.
      finishTimed();
      return;
    }
    if (pendingRef.current || alreadyDoneToday) {
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
      setSave({ status: 'error', message: error ?? NO_SESSION_MESSAGE });
      return;
    }
    // pendingRef reste vrai : l'écran se ferme, pas de second envoi possible.
    hapticMedium();
    router.dismissTo({ pathname: '/training', params: { savedSession: data.id, savedTitle: sheet.title } });
  }

  // En-tête natif : l'étape ; le titre de la fiche est dans le contenu de la présentation.
  const headerTitle = step === 0 ? 'Présentation' : `Exercice ${step} / ${exerciseCount}`;

  // Bouton principal : démarrer depuis la présentation, avancer d'une étape, puis « Séance faite ».
  let primary: ReactNode;
  if (step === 0 && !isTimed) {
    primary = <Button label="Démarrer" loading={starting} onPress={start} style={styles.primaryButton} />;
  } else if (step < lastStep) {
    primary = <Button label="Suivant" disabled={saving} onPress={() => goTo(step + 1)} style={styles.primaryButton} />;
  } else {
    primary = (
      <Button
        label={alreadyDoneToday ? 'Déjà enregistrée aujourd’hui' : 'Séance faite'}
        disabled={alreadyDoneToday}
        loading={saving}
        onPress={markDone}
        style={styles.primaryButton}
      />
    );
  }

  // Pied fixe, hors du défilement : pas de geste de balayage, identique sur web et natif.
  const footer = (
    <>
      {/* Message de l'enregistrement, au-dessus du bouton qui l'a produit : à la dernière étape seulement. */}
      {step === lastStep && save.status === 'error' ? <FieldError message={`Erreur : ${save.message}`} /> : null}
      {step === 0 ? <FieldError message={startError} /> : null}
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
      {/* Présentation hors séance en cours : la noter sans chrono, Démarrer reste l'action principale. */}
      {step === 0 && !isTimed ? (
        <Button variant="secondary" label="Séance déjà faite" disabled={starting} onPress={openDoneForm} />
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
      </Screen>
    </>
  );
}

/** Matériel identique dans tous les exercices : le matériel de toute la fiche ; null sinon (l'intro le décrit). */
function sharedEquipment(exercises: readonly Exercise[]): string | null {
  if (exercises.length === 0) {
    return null;
  }
  const first = exercises[0].setup.equipment;
  return exercises.every((exercise) => exercise.setup.equipment === first) ? first : null;
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
          Exercices
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
 * Consignes ; le reste du JSON sous « Plus de tips ». Tout le contenu du JSON
 * reste affichable.
 */
function ExerciseStep({ exercise, tipsOpen, onToggleTips }: ExerciseStepProps) {
  return (
    <>
      <ExerciseDiagram exercise={exercise} />

      <View style={styles.titleBlock}>
        <Text role="heading" style={text.title}>
          {exercise.title}
        </Text>
        <Text style={text.meta}>{`${exercise.duration_min} min`}</Text>
      </View>

      <ContentSection title="Objectif">
        <Text style={text.body}>{exercise.objective}</Text>
      </ContentSection>
      <ContentSection title="But">
        <Text style={text.body}>{exercise.goal}</Text>
      </ContentSection>
      <ContentSection title="Consignes">
        <TextList items={exercise.instructions} numbered />
      </ContentSection>

      {/* Repli sans animation ; l'état vit dans SheetReader, gardé d'un exercice à l'autre. */}
      <Button
        variant="secondary"
        label="Plus de tips"
        icon={tipsOpen ? 'chevron-up' : 'chevron-down'}
        expanded={tipsOpen}
        onPress={onToggleTips}
      />
      {tipsOpen ? <ExerciseTips exercise={exercise} /> : null}
    </>
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
  titleBlock: {
    gap: spacing.xs,
  },
});
