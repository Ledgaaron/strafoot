import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Diagram } from '../../components/diagram';
import { allStates, describeState, findOverlaps, layoutDiagram, type DiagramState } from '../../components/diagram-layout';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { listQuestionDiagrams, type QuestionDiagramRow } from '../../lib/db/questions';
import { listSheets, type SheetRow } from '../../lib/db/training';
import {
  optionLetter,
  parseDiagram,
  type DiagramData,
  type DiagramParseResult,
  type OptionId,
  type OptionScores,
} from '../../lib/diagram-types';
import { SCORE_LABELS } from '../../lib/quiz-taxonomy';
import { parseAtomicExercise, parseExercises, type Exercise, type ParseResult } from '../../lib/sheet-types';
import { colors, layout, spacing, text } from '../../lib/theme';
import diagrams001 from '../../supabase/content/diagrams_001.json';
import questions001 from '../../supabase/content/questions_001.json';
import sheets001 from '../../supabase/content/sheets_001.json';
import testsAtomic001 from '../../supabase/content/tests_atomic_001.json';

// Prévisualisation des schémas (chantiers 13a et 16), ouverte seulement par
// l'URL /dev/diagrams, liée nulle part dans l'app. Deux sources : « Dépôt »
// d'abord (les JSON de supabase/content/ importés dans le bundle : de quoi relire
// un lot sur la préversion avant tout seed ; un fichier numéroté nouveau s'ajoute
// à la liste REPOSITORY), puis « Base » (ce que Supabase contient). Chaque schéma
// dans ses états v2 : repos, sélection de B, réponse pour chaque choix (ton choix
// et la meilleure option), la réponse A avec tout affiché ; un seul état pour un
// test. Sous chaque schéma, les superpositions calculées par
// components/diagram-layout.ts (celles que les seeds refusent). Deux
// démonstrations du format en code, pour ce que le contenu n'emploie pas (encart
// sur un plein terrain, objets, passes, tir). Vérification visuelle, rien n'est
// enregistré.

/** Option allumée par l'état de sélection (B) ; à défaut, la première du schéma. */
const SELECTED_ID: OptionId = 2;

/** Fichiers de supabase/content/ embarqués : questions et leurs schémas (même numéro), tests, fiches. */
const REPOSITORY = {
  questions: [{ name: 'questions_001.json', root: questions001 as unknown, diagrams: diagrams001 as unknown }],
  exercises: [
    { name: 'tests_atomic_001.json', root: testsAtomic001 as unknown, listKey: 'tests', caption: 'Test' },
    { name: 'sheets_001.json', root: sheets001 as unknown, listKey: 'sheets', caption: 'Fiche de lecture' },
  ],
};

/** Un schéma à montrer : validé, ou son erreur de validation. */
type PreviewItem = {
  key: string;
  title: string;
  caption: string;
  parsed: DiagramParseResult;
  /** Scores des options (questions et démonstrations) : états de résultat ; null pour un exercice. */
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

  const repository = repositoryItems();
  const demos = DEMOS.map((demo) => ({ ...demo, parsed: parseDiagram(demo.diagram), scores: DEMO_SCORES }));

  return (
    <>
      <Stack.Screen options={{ title: 'Schémas' }} />
      <Screen footer={<Button variant="secondary" label="Retour" onPress={leave} />}>
        <Text style={text.meta}>
          {`Vérification visuelle : chaque schéma au repos, option ${optionLetter(SELECTED_ID)} sélectionnée, la réponse pour chaque choix, puis la réponse A avec tout affiché. Sous chaque schéma, les superpositions calculées (celles que les seeds refusent).`}
        </Text>
        <PreviewSection title={`Dépôt · Questions (${repository.questions.length})`} items={repository.questions} />
        <PreviewSection title={`Dépôt · Exercices (${repository.exercises.length})`} items={repository.exercises} />
        {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {state.status === 'error' ? (
          <View style={layout.section}>
            <FieldError error={state.message} />
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
        {state.status === 'ready' ? (
          <>
            <PreviewSection title={`Base · Questions (${state.questions.length})`} items={state.questions} />
            <PreviewSection title={`Base · Exercices (${state.exercises.length})`} items={state.exercises} />
          </>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tableau `key` de la racine d'un fichier de contenu embarqué ; [] s'il manque. */
function rootList(root: unknown, key: string): readonly unknown[] {
  const list: unknown = isRecord(root) ? root[key] : undefined;
  return Array.isArray(list) ? list : [];
}

/** Scores des 4 options d'une question du dépôt, par rang ; null si elles ne se lisent pas. */
function repositoryScores(question: unknown): OptionScores | null {
  const options = isRecord(question) ? rootList(question, 'options') : [];
  const scores: (0 | 1 | 2 | 3)[] = [];
  for (const option of options) {
    const score: unknown = isRecord(option) ? option.score : undefined;
    if (score === 0 || score === 1 || score === 2 || score === 3) {
      scores.push(score);
    }
  }
  return scores.length === 4 ? { 1: scores[0], 2: scores[1], 3: scores[2], 4: scores[3] } : null;
}

/** Schémas des JSON embarqués : questions (scores lus dans questions_NNN.json) et exercices à diagram_data. */
function repositoryItems(): { questions: PreviewItem[]; exercises: PreviewItem[] } {
  const questions: PreviewItem[] = [];
  for (const file of REPOSITORY.questions) {
    const known = rootList(file.root, 'questions');
    rootList(file.diagrams, 'diagrams').forEach((entry, index) => {
      const situation: unknown = isRecord(entry) ? entry.situation : undefined;
      const title = typeof situation === 'string' ? situation : `Schéma ${index + 1}`;
      const question = known.find((candidate) => isRecord(candidate) && candidate.situation === situation);
      questions.push({
        key: `${file.name}-${index}`,
        title,
        caption: `Question · ${file.name}${question === undefined ? ' · situation absente de questions' : ''}`,
        parsed: parseDiagram(isRecord(entry) ? entry.diagram : undefined),
        scores: question === undefined ? null : repositoryScores(question),
      });
    });
  }
  const exercises: PreviewItem[] = [];
  for (const file of REPOSITORY.exercises) {
    rootList(file.root, file.listKey).forEach((sheet, sheetIndex) => {
      const slug: unknown = isRecord(sheet) ? sheet.slug : undefined;
      const sheetTitle: unknown = isRecord(sheet) ? sheet.title : undefined;
      const name = typeof slug === 'string' ? slug : typeof sheetTitle === 'string' ? sheetTitle : `${sheetIndex + 1}`;
      const list = isRecord(sheet) && Array.isArray(sheet.exercises) ? sheet.exercises : [];
      list.forEach((exercise: unknown, order) => {
        if (!isRecord(exercise) || exercise.diagram_data === undefined) {
          return;
        }
        const exerciseTitle: unknown = exercise.title;
        exercises.push({
          key: `${file.name}-${name}-${order}`,
          title: typeof exerciseTitle === 'string' && exerciseTitle !== name ? `${name} · ${exerciseTitle}` : name,
          caption: `${file.caption} · ${file.name}`,
          parsed: parseDiagram(exercise.diagram_data),
          scores: null,
        });
      });
    });
  }
  return { questions, exercises };
}

/**
 * Questions à schéma, puis exercices à diagram_data (tests et fiches de lecture)
 * lus en base. Un schéma invalide est montré avec son erreur, sans masquer les autres.
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
    caption: 'Question · base',
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
  const caption = row.kind === 'test' ? 'Test · base' : 'Fiche de lecture · base';
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
      {items.length === 0 ? <Text style={text.meta}>Aucun schéma.</Text> : null}
      {items.map((item) => (
        <PreviewCard key={item.key} item={item} />
      ))}
    </View>
  );
}

/** États montrés : repos, sélection de B (ou de la première option), la réponse pour chaque choix, la réponse A avec tout affiché. */
function previewStates(diagram: DiagramData, scores: OptionScores | null): DiagramState[] {
  const ids = diagram.options.map((option) => option.id).sort((a, b) => a - b);
  if (ids.length === 0) {
    return [{ kind: 'idle' }];
  }
  const selected = ids.includes(SELECTED_ID) ? SELECTED_ID : ids[0];
  const states: DiagramState[] = [{ kind: 'idle' }, { kind: 'selected', id: selected }];
  if (scores !== null) {
    states.push(...ids.map((chosen): DiagramState => ({ kind: 'result', chosen, scores, showAll: false })));
    states.push({ kind: 'result', chosen: ids[0], scores, showAll: true });
  }
  return states;
}

/** Un schéma dans chacun de ses états, puis les superpositions calculées dans tous ses états (allStates). */
function PreviewCard({ item }: { item: PreviewItem }) {
  const { parsed, scores } = item;
  return (
    <View style={styles.item}>
      <Text style={text.bodyStrong}>{item.title}</Text>
      <Text style={text.meta}>{item.caption}</Text>
      {parsed.error !== null ? <FieldError message="Schéma invalide." error={parsed.error} /> : null}
      {parsed.data !== null ? <PreviewStates diagram={parsed.data} scores={scores} /> : null}
    </View>
  );
}

function PreviewStates({ diagram, scores }: { diagram: DiagramData; scores: OptionScores | null }) {
  const states = previewStates(diagram, scores);
  const geometry = layoutDiagram(diagram);
  const overlaps = allStates(
    diagram.options.map((option) => option.id),
    scores,
  ).flatMap((state) =>
    findOverlaps(diagram, geometry, state).map(
      (overlap) => `${describeState(state)} : ${overlap.first} et ${overlap.second}, il manque ${overlap.shortfall.toFixed(1)} px`,
    ),
  );
  return (
    <>
      {states.map((state) => (
        <View key={describeState(state)} style={styles.state}>
          <Text style={text.overline}>{stateTitle(state)}</Text>
          <Diagram
            diagram={diagram}
            selected={state.kind === 'selected' ? state.id : undefined}
            result={state.kind === 'result' ? { chosen: state.chosen, scores: state.scores } : undefined}
            showAll={state.kind === 'result' && state.showAll}
          />
        </View>
      ))}
      {diagram.options.length > 0 && scores === null ? (
        <Text style={text.meta}>Sans scores : pas d’état de réponse.</Text>
      ) : null}
      {overlaps.length > 0 ? (
        <FieldError message={`Superpositions (${overlaps.length}) :\n${overlaps.join('\n')}`} />
      ) : (
        <Text style={text.meta}>Superpositions calculées : aucune.</Text>
      )}
    </>
  );
}

/** « Repos », « Sélection B », « Réponse C · Bon choix », « Réponse A, tout afficher ». */
function stateTitle(state: DiagramState): string {
  const label = describeState(state);
  const titled = label.charAt(0).toUpperCase() + label.slice(1);
  if (state.kind === 'result' && !state.showAll) {
    return `${titled} · ${SCORE_LABELS[state.scores[state.chosen]]}`;
  }
  return titled;
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  state: {
    gap: spacing.xs,
  },
});
