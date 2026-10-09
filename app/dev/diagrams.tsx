import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Diagram } from '../../components/diagram';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { listQuestionDiagrams, type QuestionDiagramRow } from '../../lib/db/questions';
import { listSheets, type SheetRow } from '../../lib/db/training';
import { parseDiagram, type DiagramParseResult, type OptionScores } from '../../lib/diagram-types';
import { SCORE_LABELS } from '../../lib/quiz-taxonomy';
import { parseAtomicExercise, parseExercises, type Exercise, type ParseResult } from '../../lib/sheet-types';
import { colors, layout, spacing, text } from '../../lib/theme';

// Prévisualisation des schémas (chantier 13a), ouverte seulement par l'URL
// /dev/diagrams, liée nulle part dans l'app : chaque schéma en base, nu, option 2
// sélectionnée, puis réponse avec le choix 3 ; deux démonstrations du format en
// code pour ce que les schémas en base n'emploient pas (encart, objets, passes,
// tir, vues full et box_right). Vérification visuelle, rien n'est enregistré.

/** Option allumée par l'état selected, et choix de l'état result. */
const SELECTED_ID = 2;
const CHOSEN_ID = 3;

/** Un schéma à montrer : validé, ou son erreur de validation. */
type PreviewItem = {
  key: string;
  title: string;
  caption: string;
  parsed: DiagramParseResult;
  /** Scores des options (questions et démonstrations) : état result ; null pour un exercice. */
  scores: OptionScores | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; questions: PreviewItem[]; exercises: PreviewItem[] };

/** Scores fictifs des démonstrations : chaque couleur de l'état result apparaît. */
const DEMO_SCORES: OptionScores = { 1: 3, 2: 2, 3: 1, 4: 0 };

/** Démonstrations, au format des JSON (validées comme eux). */
const DEMOS: readonly { key: string; title: string; caption: string; diagram: unknown }[] = [
  {
    key: 'demo-full',
    title: 'Plein terrain',
    caption: 'Vue full : encart, passes vers un joueur, conduite en courbe, tir, flèches de vitesse',
    diagram: {
      view: 'full',
      context: { score: '2-1', minute: 78 },
      players: [
        { id: 'us8', team: 'us', number: 8, x: 74, y: 38, you: true, ball: true },
        { id: 'us10', team: 'us', number: 10, x: 82, y: 18, move: { dx: 1, dy: 0, speed: 'run' } },
        { id: 'us9', team: 'us', number: 9, x: 90, y: 30, move: { dx: 1, dy: 0.3, speed: 'sprint' } },
        { id: 'us4', team: 'us', number: 4, x: 58, y: 48, move: { dx: 1, dy: 0, speed: 'walk' } },
        { id: 'them6', team: 'them', number: 6, x: 79, y: 43, move: { dx: -1, dy: -0.4, speed: 'run' } },
        { id: 'them4', team: 'them', number: 4, x: 94, y: 36 },
        { id: 'them5', team: 'them', number: 5, x: 92, y: 47 },
        { id: 'them1', team: 'them', number: 1, x: 102, y: 34 },
      ],
      options: [
        { id: 1, kind: 'pass', to: 'us9' },
        { id: 2, kind: 'pass', to: 'us4' },
        { id: 3, kind: 'dribble', to: { x: 86, y: 54 }, path: [{ x: 78, y: 52 }] },
        { id: 4, kind: 'shot', to: { x: 105, y: 32 } },
      ],
    },
  },
  {
    key: 'demo-box',
    title: 'Surface et objets',
    caption: 'Vue box_right : plots, mini-but, mur, zone, mannequin, trajet en conduite',
    diagram: {
      view: 'box_right',
      players: [
        { id: 'joueur', team: 'us', x: 82, y: 22 },
        { id: 'gardien', team: 'them', number: 1, x: 103, y: 34 },
      ],
      objects: [
        { type: 'cone', x: 86, y: 26, label: 'Plot' },
        { type: 'cone', x: 84, y: 32 },
        { type: 'goal', x: 97, y: 13, w: 1.5, h: 3, label: 'Mini-but' },
        { type: 'wall', x: 82, y: 50, w: 0.5, h: 6, label: 'Mur' },
        { type: 'zone', x: 96, y: 48, w: 8, h: 8, label: 'Zone' },
        { type: 'mannequin', x: 93, y: 34, label: 'Mannequin' },
      ],
      path: {
        points: [
          { x: 82, y: 22 },
          { x: 88, y: 29 },
          { x: 83, y: 35 },
          { x: 88, y: 40 },
        ],
        style: 'dribble',
      },
    },
  },
];

export default function DiagramsPreviewScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let active = true;
    loadPreviews()
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue : affichée, jamais avalée.
        if (active) {
          setState({ status: 'error', message: exception instanceof Error ? exception.message : String(exception) });
        }
      });
    return () => {
      active = false;
    };
  }, [loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  const demos = DEMOS.map((demo) => ({ ...demo, parsed: parseDiagram(demo.diagram), scores: DEMO_SCORES }));

  return (
    <>
      <Stack.Screen options={{ title: 'Schémas' }} />
      <Screen footer={<Button variant="secondary" label="Retour" onPress={leave} />}>
        <Text style={text.meta}>
          {`Vérification visuelle : chaque schéma nu, option ${SELECTED_ID} sélectionnée, puis réponse avec le choix ${CHOSEN_ID}.`}
        </Text>
        {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {state.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${state.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {state.status === 'ready' && state.questions.length === 0 && state.exercises.length === 0 ? (
          <EmptyState
            title="Aucun schéma en base"
            message="Exécuter supabase/migrations/009_question_diagrams.sql, puis seed_questions_001.sql et seed_sheets_001.sql."
            action={{ label: 'Réessayer', onPress: reload, variant: 'secondary' }}
          />
        ) : null}
        {state.status === 'ready' && state.questions.length > 0 ? (
          <PreviewSection title={`Questions (${state.questions.length})`} items={state.questions} />
        ) : null}
        {state.status === 'ready' && state.exercises.length > 0 ? (
          <PreviewSection title={`Exercices (${state.exercises.length})`} items={state.exercises} />
        ) : null}
        <PreviewSection title="Démonstrations du format (en code)" items={demos} />
      </Screen>
    </>
  );
}

/** Retour à l'écran précédent ; ouvert par l'URL, sans historique : l'Accueil. */
function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * Questions à schéma, puis exercices à diagram_data (tests et fiches de lecture).
 * Un schéma invalide est montré avec son erreur, sans masquer les autres.
 */
async function loadPreviews(): Promise<LoadState> {
  const [questions, tests, readings] = await Promise.all([
    listQuestionDiagrams(),
    listSheets({ kind: 'test' }),
    listSheets({ kind: 'training' }),
  ]);
  const error = questions.error ?? tests.error ?? readings.error;
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return {
    status: 'ready',
    questions: (questions.data ?? []).map(questionItem),
    exercises: [...(tests.data ?? []), ...(readings.data ?? [])].flatMap(exerciseItems),
  };
}

function questionItem(row: QuestionDiagramRow): PreviewItem {
  const [first, second, third, fourth] = row.options;
  return {
    key: row.id,
    title: row.situation,
    caption: 'Question',
    parsed: parseDiagram(row.diagram),
    scores: { 1: first.score, 2: second.score, 3: third.score, 4: fourth.score },
  };
}

/** Exercices d'une fiche ou d'un test qui portent un diagram_data ; la fiche entière en erreur si ses exercices ne se lisent pas. */
function exerciseItems(row: SheetRow): PreviewItem[] {
  // Seules les lignes dont le JSON nomme diagram_data concernent cet écran.
  if (!JSON.stringify(row.exercises).includes('"diagram_data"')) {
    return [];
  }
  const caption = row.kind === 'test' ? 'Test' : 'Fiche de lecture';
  const exercises = parseRowExercises(row);
  if (exercises.error !== null) {
    return [{ key: row.id, title: row.title, caption, parsed: { data: null, error: exercises.error }, scores: null }];
  }
  return exercises.data.flatMap((exercise) =>
    exercise.diagram_data !== null
      ? [
          {
            key: `${row.id}-${exercise.order}`,
            title: exercise.title === row.title ? row.title : `${row.title} · ${exercise.title}`,
            caption,
            parsed: { data: exercise.diagram_data, error: null },
            scores: null,
          },
        ]
      : [],
  );
}

/** Exercices d'une ligne : l'unique exercice d'un test, ceux d'une fiche de lecture. */
function parseRowExercises(row: SheetRow): ParseResult<Exercise[]> {
  if (row.kind !== 'test') {
    return parseExercises(row.exercises, 'training');
  }
  const parsed = parseAtomicExercise(row.exercises);
  return parsed.error !== null ? { data: null, error: parsed.error } : { data: [parsed.data], error: null };
}

function PreviewSection({ title, items }: { title: string; items: readonly PreviewItem[] }) {
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.title}>
        {title}
      </Text>
      {items.map((item) => (
        <PreviewCard key={item.key} item={item} />
      ))}
    </View>
  );
}

/** Un schéma : nu ; avec des options, option 2 sélectionnée ; avec des scores, la réponse au choix 3. */
function PreviewCard({ item }: { item: PreviewItem }) {
  const { parsed, scores } = item;
  return (
    <View style={styles.item}>
      <Text style={text.bodyStrong}>{item.title}</Text>
      <Text style={text.meta}>{item.caption}</Text>
      {parsed.error !== null ? <FieldError message={`Schéma invalide :\n${parsed.error}`} /> : null}
      {parsed.data !== null ? (
        <>
          <Text style={text.overline}>Nu</Text>
          <Diagram diagram={parsed.data} />
          {parsed.data.options.length > 0 ? (
            <>
              <Text style={text.overline}>{`Option ${SELECTED_ID} sélectionnée`}</Text>
              <Diagram diagram={parsed.data} selected={SELECTED_ID} />
            </>
          ) : (
            <Text style={text.meta}>Sans options : les trois états sont identiques.</Text>
          )}
          {parsed.data.options.length > 0 && scores !== null ? (
            <>
              <Text style={text.overline}>{`Réponse : choix ${CHOSEN_ID} · ${SCORE_LABELS[scores[CHOSEN_ID]]}`}</Text>
              <Diagram diagram={parsed.data} result={{ chosen: CHOSEN_ID, scores }} />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
});
