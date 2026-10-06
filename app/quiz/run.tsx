import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ScrollView, type ViewStyle } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { Stat } from '../../components/stat';
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
import { colors, layout, radius, size, spacing, text } from '../../lib/theme';

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
      <>
        <Stack.Screen options={{ title: 'Quizz' }} />
        <Screen>
          <View style={layout.section}>
            <FieldError message={filterError} />
            <Button variant="secondary" label="Retour" onPress={leaveRun} />
          </View>
        </Screen>
      </>
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

  // Pied selon l'étape : l'action qui fait avancer la série, sous le pouce. Aucun
  // pendant le choix (les options sont l'action), l'enregistrement ou le chargement.
  let footer: ReactNode = null;
  if (screen.status === 'running' && screen.run.phase.step === 'answered') {
    const isLast = screen.run.scores.length === screen.run.questions.length - 1;
    footer = (
      <Button label={isLast ? 'Voir le récap' : 'Suivant'} onPress={goNext} disabled={screen.run.phase.flagging} />
    );
  } else if (screen.status === 'recap') {
    footer = (
      <>
        <Button label="Nouvelle série" onPress={reload} />
        <Button variant="secondary" label="Retour" onPress={leaveRun} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollRef={scrollRef} footer={footer}>
        {screen.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {screen.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${screen.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {screen.status === 'empty' ? (
          <EmptyState
            title="Aucune question pour ce filtre"
            message="Élargis le thème ou le poste depuis l’onglet Quizz."
            action={{ label: 'Retour', onPress: leaveRun }}
          />
        ) : null}
        {screen.status === 'running' ? (
          <QuestionStep run={screen.run} onChoose={chooseOption} onRetrySave={retrySave} onToggleFlag={toggleFlag} />
        ) : null}
        {screen.status === 'recap' ? <RunRecap questions={screen.questions} scores={screen.scores} /> : null}
      </Screen>
    </>
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
};

function QuestionStep({ run, onChoose, onRetrySave, onToggleFlag }: QuestionStepProps) {
  const index = run.scores.length;
  const question = run.questions[index];
  const { phase } = run;
  return (
    <>
      <View style={layout.section}>
        {run.questions.length < RUN_LENGTH ? (
          <Text style={text.meta}>{formatShortRun(run.questions.length)}</Text>
        ) : null}
        <Text style={text.meta}>{formatQuestionMeta(question)}</Text>
        <Card>
          <Text style={text.title}>{question.situation}</Text>
        </Card>
      </View>

      {phase.step === 'answered' ? (
        <AnswerReview options={question.options} phase={phase} onToggleFlag={onToggleFlag} />
      ) : (
        <View style={layout.section}>
          {/* Une fois le choix fait, il reste en évidence et les autres sont grisées. */}
          {question.options.map((option, optionIndex) => (
            <Card
              key={optionIndex}
              onPress={() => onChoose(optionIndex)}
              highlighted={phase.step !== 'choosing' && phase.chosenIndex === optionIndex}
              disabled={phase.step !== 'choosing'}
              style={styles.option}
            >
              <Text style={text.body}>{option.text}</Text>
            </Card>
          ))}
          {phase.step === 'saving' ? <Text style={text.meta}>Enregistrement…</Text> : null}
          {phase.step === 'saveError' ? (
            <>
              <FieldError message={`Erreur : ${phase.message}`} />
              <Button variant="secondary" label="Réessayer l’enregistrement" onPress={onRetrySave} />
            </>
          ) : null}
        </View>
      )}
    </>
  );
}

type AnswerReviewProps = {
  options: QuestionOption[];
  phase: AnsweredPhase;
  onToggleFlag: () => void;
};

/** Réponse confirmée : le score de l'option choisie, puis les 4 options et leurs explications. */
function AnswerReview({ options, phase, onToggleFlag }: AnswerReviewProps) {
  const chosen = options[phase.chosenIndex];
  // Score décroissant ; à égalité, ordre d'origine, explicite quel que soit le moteur JS.
  const ranked = options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => b.option.score - a.option.score || a.index - b.index);
  const flagged = phase.answer.flagged;
  return (
    <>
      <Card highlighted>
        <Text style={text.overline}>Ton choix</Text>
        <View style={styles.scoreRow}>
          <ScorePill score={chosen.score} />
          <Text style={text.meta}>{SCORE_LABELS[chosen.score]}</Text>
        </View>
        <Text style={text.body}>{chosen.text}</Text>
      </Card>

      <View style={layout.section}>
        <Text style={text.overline}>Toutes les options</Text>
        {ranked.map(({ option, index }) => (
          <Card key={index} highlighted={index === phase.chosenIndex}>
            <View style={styles.scoreRow}>
              <ScorePill score={option.score} />
              <Text style={text.meta}>
                {SCORE_LABELS[option.score]}
                {index === phase.chosenIndex ? ' · Ton choix' : ''}
              </Text>
            </View>
            <Text style={text.bodyStrong}>{option.text}</Text>
            <Text style={text.body}>{option.explanation}</Text>
          </Card>
        ))}
      </View>

      <View style={layout.section}>
        <Button
          variant="secondary"
          label={flagged ? 'Réponse signalée · Annuler' : 'Réponse contestable'}
          onPress={onToggleFlag}
          loading={phase.flagging}
          accessibilityLabel={flagged ? 'Retirer le signalement' : 'Signaler une réponse contestable'}
        />
        <FieldError message={phase.flagError !== null ? `Erreur : ${phase.flagError}` : null} />
      </View>
    </>
  );
}

type RunRecapProps = {
  questions: EligibleQuestion[];
  scores: OptionScore[];
};

function RunRecap({ questions, scores }: RunRecapProps) {
  const total = scores.reduce<number>((sum, score) => sum + score, 0);
  return (
    <>
      <Stat label="Score de la série" value={total} unit={`/${questions.length * MAX_OPTION_SCORE}`} tone="accent" />
      <View style={layout.section}>
        {questions.map((question, index) => (
          <Card key={question.id} style={styles.recapRow}>
            <Text style={[text.body, styles.recapSituation]} numberOfLines={2}>
              {`${index + 1}. ${question.situation}`}
            </Text>
            <ScorePill score={scores[index]} />
          </Card>
        ))}
      </View>
    </>
  );
}

type ScorePillProps = {
  score: OptionScore;
};

/**
 * Pastille « 3/3 » : le score de chaque option, jamais « la bonne réponse »
 * (plusieurs options peuvent valoir 3).
 */
function ScorePill({ score }: ScorePillProps) {
  return (
    <View style={[styles.pill, PILL_TONES[score]]}>
      <Text style={[text.meta, text.tabular, styles.pillLabel]}>{`${score}/${MAX_OPTION_SCORE}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: size.option,
    justifyContent: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
  },
  pillLabel: {
    fontWeight: '700',
    // onAccent reste lisible (au moins 5,3:1) sur les trois fonds de PILL_TONES.
    color: colors.onAccent,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recapSituation: {
    flex: 1,
  },
});

/** Fond de la pastille selon le score : 3 accent, 2 et 1 neutre, 0 danger. */
const PILL_TONES: Readonly<Record<OptionScore, ViewStyle>> = StyleSheet.create({
  3: { backgroundColor: colors.accent },
  2: { backgroundColor: colors.textMuted },
  1: { backgroundColor: colors.textMuted },
  0: { backgroundColor: colors.danger },
});
