import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/action-button';
import { createAnswer, flagAnswer, type AnswerRow } from '../../lib/db/answers';
import { listEligibleQuestions, type EligibleQuestion, type QuestionFilter } from '../../lib/db/questions';
import type { QuestionOption } from '../../lib/json-types';
import { pickQuizQuestions, RUN_LENGTH } from '../../lib/quiz-select';
import {
  ALL_POSITIONS,
  isPositionKey,
  isThemeKey,
  MAX_OPTION_SCORE,
  positionLabel,
  SCORE_LABELS,
  themeLabel,
} from '../../lib/quiz-taxonomy';

const NO_ROW_MESSAGE = 'Supabase n’a renvoyé ni la réponse ni d’erreur.';

type OptionScore = QuestionOption['score'];

/** Valeur brute d'un paramètre : à l'exécution, un paramètre répété arrive sous forme de tableau. */
type RawParam = string | string[] | undefined;

type ParsedFilter = { filter: QuestionFilter; error: null } | { filter: null; error: string };

/**
 * Étape de la question courante. Le choix et l'id de la réponse sont figés dès
 * le tap ; le résultat et les explications n'apparaissent qu'une fois la réponse
 * confirmée par la base.
 */
type QuestionPhase =
  | { step: 'choosing' }
  | { step: 'saving'; chosenIndex: number; answerId: string }
  | { step: 'saveError'; chosenIndex: number; answerId: string; message: string }
  | {
      step: 'answered';
      chosenIndex: number;
      /** Ligne enregistrée : son id et son flagged servent au signalement. */
      answer: AnswerRow;
      flagging: boolean;
      flagError: string | null;
    };

type AnsweredPhase = Extract<QuestionPhase, { step: 'answered' }>;

type Run = {
  /** Identifiant client de la série, envoyé avec chacune de ses réponses. */
  id: string;
  questions: EligibleQuestion[];
  /** Score des questions déjà passées : la question courante est questions[scores.length]. */
  scores: OptionScore[];
  phase: QuestionPhase;
};

type ScreenState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'running'; run: Run }
  | { status: 'recap'; questions: EligibleQuestion[]; scores: OptionScore[] };

export default function QuizRunScreen() {
  const { theme, position } = useLocalSearchParams<{ theme?: string; position?: string }>();
  const parsed = parseFilter(theme, position);
  // Primitives : dépendances stables de l'effet de chargement.
  const filterTheme = parsed.filter?.theme;
  const filterPosition = parsed.filter?.position;
  const filterError = parsed.error;
  const [screen, setScreen] = useState<ScreenState>({ status: 'loading' });
  // Incrémenté par « Réessayer » et « Nouvelle série » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même
  // rendu, donc une question encore à choisir.
  const pendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (filterError !== null) {
      return;
    }
    let active = true;
    loadRun({ theme: filterTheme, position: filterPosition })
      .then((next) => {
        if (active) {
          setScreen(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue (ex. instant illisible refusé par pickQuizQuestions) : affichée, jamais avalée.
        if (active) {
          setScreen({
            status: 'error',
            message: exception instanceof Error ? exception.message : String(exception),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [filterTheme, filterPosition, filterError, loadCount]);

  if (filterError !== null) {
    // Lien mal formé : réessayer ne changerait rien, seul le retour est proposé.
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Quizz' }} />
        <Text style={styles.error}>{filterError}</Text>
        <ActionButton label="Retour" onPress={leaveRun} />
      </View>
    );
  }

  /** Mêmes filtres, nouveau tirage, nouvel identifiant de série. */
  function reload() {
    setScreen({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  /** Change l'étape de la question index de la série runId, si elle est toujours affichée. */
  function updatePhase(runId: string, index: number, phase: QuestionPhase) {
    setScreen((current) =>
      current.status === 'running' && current.run.id === runId && current.run.scores.length === index
        ? { status: 'running', run: { ...current.run, phase } }
        : current,
    );
  }

  async function saveAnswer(run: Run, chosenIndex: number, answerId: string) {
    const index = run.scores.length;
    const question = run.questions[index];
    pendingRef.current = true;
    updatePhase(run.id, index, { step: 'saving', chosenIndex, answerId });
    // Enregistrée dès le tap : la streak quizz compte dès la première réponse.
    const { data, error } = await createAnswer({
      id: answerId,
      question_id: question.id,
      chosen_index: chosenIndex,
      score: question.options[chosenIndex].score,
      quiz_run_id: run.id,
    });
    pendingRef.current = false;
    if (error !== null || data === null) {
      updatePhase(run.id, index, {
        step: 'saveError',
        chosenIndex,
        answerId,
        message: error ?? NO_ROW_MESSAGE,
      });
      return;
    }
    updatePhase(run.id, index, { step: 'answered', chosenIndex, answer: data, flagging: false, flagError: null });
  }

  function chooseOption(chosenIndex: number) {
    // Garde sur l'état, pas seulement disabled : un second tap, même rapide, est ignoré.
    if (screen.status !== 'running' || pendingRef.current) {
      return;
    }
    const { run } = screen;
    if (run.phase.step !== 'choosing') {
      return;
    }
    // Id tiré une seule fois, avant le premier envoi : chaque réessai renverra le même.
    saveAnswer(run, chosenIndex, randomUuid());
  }

  function retrySave() {
    if (screen.status !== 'running' || pendingRef.current) {
      return;
    }
    const { run } = screen;
    if (run.phase.step !== 'saveError') {
      return;
    }
    // Même choix (il ne peut plus changer après le tap) et même id : si le premier
    // envoi est arrivé en base, la base l'ignore au lieu de créer un doublon.
    saveAnswer(run, run.phase.chosenIndex, run.phase.answerId);
  }

  async function toggleFlag() {
    if (screen.status !== 'running' || pendingRef.current) {
      return;
    }
    const { run } = screen;
    const { phase } = run;
    if (phase.step !== 'answered' || phase.flagging) {
      return;
    }
    const index = run.scores.length;
    pendingRef.current = true;
    updatePhase(run.id, index, { ...phase, flagging: true, flagError: null });
    const { data, error } = await flagAnswer(phase.answer.id, !phase.answer.flagged);
    pendingRef.current = false;
    if (error !== null || data === null) {
      updatePhase(run.id, index, { ...phase, flagging: false, flagError: error ?? NO_ROW_MESSAGE });
      return;
    }
    // La ligne renvoyée fait foi : l'état affiché est celui de la base.
    updatePhase(run.id, index, { ...phase, answer: data, flagging: false, flagError: null });
  }

  function goNext() {
    if (screen.status !== 'running' || pendingRef.current) {
      return;
    }
    const { run } = screen;
    // La série n'avance qu'après confirmation (étape answered : ligne renvoyée par
    // la base), et pas pendant un signalement, dont le résultat serait perdu.
    if (run.phase.step !== 'answered' || run.phase.flagging) {
      return;
    }
    const question = run.questions[run.scores.length];
    const scores = [...run.scores, question.options[run.phase.chosenIndex].score];
    setScreen(
      scores.length === run.questions.length
        ? { status: 'recap', questions: run.questions, scores }
        : { status: 'running', run: { ...run, scores, phase: { step: 'choosing' } } },
    );
    // Contenu entièrement remplacé : lecture depuis le haut, sans défilement animé.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  const title =
    screen.status === 'running'
      ? `Question ${screen.run.scores.length + 1} / ${screen.run.questions.length}`
      : screen.status === 'recap'
        ? 'Récap'
        : 'Quizz';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {screen.status === 'loading' ? <ActivityIndicator /> : null}
        {screen.status === 'error' ? (
          <>
            <Text style={styles.error}>Erreur : {screen.message}</Text>
            <ActionButton label="Réessayer" onPress={reload} />
          </>
        ) : null}
        {screen.status === 'empty' ? (
          <>
            <Text style={styles.text}>Aucune question pour ce filtre. Élargis le thème ou le poste.</Text>
            <ActionButton label="Retour" onPress={leaveRun} />
          </>
        ) : null}
        {screen.status === 'running' ? (
          <QuestionStep
            run={screen.run}
            onChoose={chooseOption}
            onRetrySave={retrySave}
            onToggleFlag={toggleFlag}
            onNext={goNext}
          />
        ) : null}
        {screen.status === 'recap' ? (
          <RunRecap questions={screen.questions} scores={screen.scores} onNewRun={reload} onLeave={leaveRun} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Filtre de la série. Paramètre absent : pas de filtre ; poste « tous » : pas de
 * filtre de poste ; valeur hors liste ou répétée : erreur, jamais ignorée.
 */
function parseFilter(theme: RawParam, position: RawParam): ParsedFilter {
  const filter: QuestionFilter = {};
  const unknown: string[] = [];
  if (theme !== undefined) {
    if (typeof theme === 'string' && isThemeKey(theme)) {
      filter.theme = theme;
    } else {
      unknown.push(`thème « ${formatRawParam(theme)} »`);
    }
  }
  if (position !== undefined) {
    if (typeof position === 'string' && isPositionKey(position)) {
      if (position !== ALL_POSITIONS) {
        filter.position = position;
      }
    } else {
      unknown.push(`poste « ${formatRawParam(position)} »`);
    }
  }
  return unknown.length > 0
    ? { filter: null, error: `Filtre inconnu : ${unknown.join(', ')}.` }
    : { filter, error: null };
}

function formatRawParam(value: string | string[]): string {
  return typeof value === 'string' ? value : value.join(', ');
}

/**
 * Questions éligibles puis tirage d'une série, avec un nouvel identifiant.
 * pickQuizQuestions peut lever une exception (instant illisible) : l'appelant l'affiche.
 */
async function loadRun(filter: QuestionFilter): Promise<ScreenState> {
  const { data, error } = await listEligibleQuestions(filter);
  if (error !== null) {
    return { status: 'error', message: error };
  }
  const questions = pickQuizQuestions(data ?? [], RUN_LENGTH, Math.random);
  if (questions.length === 0) {
    return { status: 'empty' };
  }
  return {
    status: 'running',
    run: { id: randomUuid(), questions, scores: [], phase: { step: 'choosing' } },
  };
}

/**
 * UUID v4 d'une série ou d'une réponse. crypto.randomUUID existe sur le web
 * (contexte sécurisé seulement), pas sous Hermes dans Expo Go, qui n'a pas Web
 * Crypto : repli sur Math.random, suffisant pour des identifiants qui ne sont
 * pas des secrets.
 */
function randomUuid(): string {
  // Le type DOM déclare crypto.randomUUID toujours présent : test à l'exécution.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const nibble = Math.floor(Math.random() * 16);
    // y : variante RFC 4122, bits 10xx (8, 9, a ou b).
    return (char === 'x' ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}

/** Retour à l'écran précédent ; sans historique (lien direct, rechargement web) : l'onglet Quizz. */
function leaveRun() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/quiz');
  }
}

/** « 3/3 · Bon choix » : jamais « la bonne réponse », plusieurs options peuvent valoir 3. */
function formatScore(score: OptionScore): string {
  return `${score}/${MAX_OPTION_SCORE} · ${SCORE_LABELS[score]}`;
}

/** Pluriel français : « Seulement 1 question éligible… », « Seulement 3 questions éligibles… ». */
function formatShortRun(count: number): string {
  const plural = count >= 2 ? 's' : '';
  return `Seulement ${count} question${plural} éligible${plural} pour ce filtre : série de ${count}.`;
}

/** « Tactique · Milieu central, Latéral » */
function formatQuestionMeta(question: EligibleQuestion): string {
  const positions = question.positions.map(positionLabel).join(', ');
  return positions === '' ? themeLabel(question.theme) : `${themeLabel(question.theme)} · ${positions}`;
}

type QuestionStepProps = {
  run: Run;
  onChoose: (chosenIndex: number) => void;
  onRetrySave: () => void;
  onToggleFlag: () => void;
  onNext: () => void;
};

function QuestionStep({ run, onChoose, onRetrySave, onToggleFlag, onNext }: QuestionStepProps) {
  const index = run.scores.length;
  const question = run.questions[index];
  const { phase } = run;
  return (
    <>
      {run.questions.length < RUN_LENGTH ? (
        <Text style={styles.notice}>{formatShortRun(run.questions.length)}</Text>
      ) : null}
      <Text style={styles.meta}>{formatQuestionMeta(question)}</Text>
      <Text style={styles.situation}>{question.situation}</Text>

      {phase.step === 'answered' ? (
        <AnswerReview
          options={question.options}
          phase={phase}
          isLast={index === run.questions.length - 1}
          onToggleFlag={onToggleFlag}
          onNext={onNext}
        />
      ) : (
        <>
          <View style={styles.list}>
            {question.options.map((option, optionIndex) => (
              <OptionButton
                key={optionIndex}
                text={option.text}
                selected={phase.step !== 'choosing' && phase.chosenIndex === optionIndex}
                disabled={phase.step !== 'choosing'}
                onPress={() => onChoose(optionIndex)}
              />
            ))}
          </View>
          {phase.step === 'saving' ? <Text style={styles.text}>Enregistrement…</Text> : null}
          {phase.step === 'saveError' ? (
            <>
              <Text style={styles.error}>Erreur : {phase.message}</Text>
              <ActionButton label="Réessayer l’enregistrement" onPress={onRetrySave} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}

type OptionButtonProps = {
  text: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
};

/** Option tappable ; une fois le choix fait, il reste en évidence et les autres sont grisées. */
function OptionButton({ text, selected, disabled, onPress }: OptionButtonProps) {
  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.chosen,
        (pressed || (disabled && !selected)) && styles.dimmed,
      ]}
    >
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

type AnswerReviewProps = {
  options: QuestionOption[];
  phase: AnsweredPhase;
  isLast: boolean;
  onToggleFlag: () => void;
  onNext: () => void;
};

function AnswerReview({ options, phase, isLast, onToggleFlag, onNext }: AnswerReviewProps) {
  const chosen = options[phase.chosenIndex];
  // Score décroissant ; à égalité, ordre d'origine, explicite quel que soit le moteur JS.
  const ranked = options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => b.option.score - a.option.score || a.index - b.index);
  const flagged = phase.answer.flagged;
  return (
    <>
      <View style={[styles.card, styles.chosen]}>
        <Text style={styles.label}>Ton choix</Text>
        <Text style={styles.verdict}>{formatScore(chosen.score)}</Text>
        <Text style={styles.text}>{chosen.text}</Text>
      </View>

      <View style={styles.list}>
        <Text style={styles.label}>Toutes les options</Text>
        {ranked.map(({ option, index }) => (
          <View key={index} style={[styles.card, index === phase.chosenIndex && styles.chosen]}>
            <Text style={styles.cardTitle}>
              {formatScore(option.score)}
              {index === phase.chosenIndex ? ' · Ton choix' : ''}
            </Text>
            <Text style={styles.text}>{option.text}</Text>
            <Text style={styles.explanation}>{option.explanation}</Text>
          </View>
        ))}
      </View>

      <Pressable
        role="button"
        aria-disabled={phase.flagging}
        disabled={phase.flagging}
        accessibilityState={{ selected: flagged }}
        onPress={onToggleFlag}
        style={({ pressed }) => [
          styles.toggle,
          flagged && styles.toggleOn,
          (pressed || phase.flagging) && styles.dimmed,
        ]}
      >
        <Text style={[styles.buttonLabel, flagged && styles.toggleLabelOn]}>Réponse contestable</Text>
      </Pressable>
      {phase.flagError !== null ? <Text style={styles.error}>Erreur : {phase.flagError}</Text> : null}

      <PrimaryButton label={isLast ? 'Voir le récap' : 'Suivant'} disabled={phase.flagging} onPress={onNext} />
    </>
  );
}

type RunRecapProps = {
  questions: EligibleQuestion[];
  scores: OptionScore[];
  onNewRun: () => void;
  onLeave: () => void;
};

function RunRecap({ questions, scores, onNewRun, onLeave }: RunRecapProps) {
  const total = scores.reduce<number>((sum, score) => sum + score, 0);
  return (
    <>
      <View>
        <Text style={styles.label}>Score de la série</Text>
        <Text style={styles.total}>{`${total} / ${questions.length * MAX_OPTION_SCORE}`}</Text>
      </View>

      <View>
        {questions.map((question, index) => (
          <View key={question.id} style={styles.recapLine}>
            <Text style={styles.text} numberOfLines={2}>
              {`${index + 1}. ${question.situation}`}
            </Text>
            <Text style={styles.cardTitle}>{formatScore(scores[index])}</Text>
          </View>
        ))}
      </View>

      <PrimaryButton label="Nouvelle série" onPress={onNewRun} />
      <ActionButton label="Retour" onPress={onLeave} />
    </>
  );
}

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Action principale de l'étape (Suivant, Nouvelle série) : plus haute, libellé en gras. */
function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  content: {
    padding: 16,
    gap: 16,
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
  notice: {
    fontSize: 14,
  },
  meta: {
    fontSize: 13,
    color: '#555',
  },
  situation: {
    fontSize: 18,
  },
  list: {
    gap: 8,
  },
  option: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  chosen: {
    backgroundColor: '#e0e0e0',
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  verdict: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  explanation: {
    fontSize: 14,
  },
  toggle: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#222',
    borderColor: '#222',
  },
  buttonLabel: {
    fontSize: 16,
  },
  toggleLabelOn: {
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
  total: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  recapLine: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
