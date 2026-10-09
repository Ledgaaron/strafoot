import { parseDiagram, type DiagramData } from '../diagram-types';
import type { QuestionOption } from '../json-types';
import { ALL_POSITIONS, type PositionKey, type ThemeKey } from '../quiz-taxonomy';
import { supabase } from '../supabase';
import type { Json, Tables } from '../types';
import type { DbResult } from './result';

export type QuestionRow = Tables<'questions'>;

/**
 * Question prête pour le quiz : options typées, schéma validé (null : pas de
 * schéma), et dernière réponse donnée (instant et score), null si la question
 * n'a jamais été répondue.
 */
export type EligibleQuestion = Omit<QuestionRow, 'options' | 'diagram'> & {
  options: QuestionOption[];
  diagram: DiagramData | null;
  lastAnsweredAt: string | null;
  lastScore: number | null;
};

/** Question qui porte un schéma (écran /dev/diagrams) : schéma brut, validé par l'écran, une erreur par question. */
export type QuestionDiagramRow = {
  id: string;
  situation: string;
  options: QuestionOption[];
  diagram: Json | null;
};

/** Filtre du quiz ; un champ absent ne filtre pas (« Tous », « Tous postes »). */
export type QuestionFilter = {
  theme?: ThemeKey;
  position?: PositionKey;
};

const OPTION_COUNT = 4;

/**
 * Questions éligibles au filtre, dans l'ordre de création, chacune avec sa
 * dernière réponse. Thème : égalité exacte. Poste : les questions de ce poste et
 * celles marquées 'tous' ; sans poste, toutes. Deux requêtes, jointure ici.
 * Les réponses sont lues de la plus récente à la plus ancienne, dans la limite
 * du max rows du projet (1000 par défaut) : une question répondue seulement
 * avant les 1000 dernières réponses passerait pour jamais vue.
 */
export async function listEligibleQuestions({
  theme,
  position,
}: QuestionFilter = {}): Promise<DbResult<EligibleQuestion[]>> {
  let questionQuery = supabase.from('questions').select('*');
  if (theme) {
    questionQuery = questionQuery.eq('theme', theme);
  }
  if (position && position !== ALL_POSITIONS) {
    // && en SQL : positions contient le poste choisi ou 'tous'.
    questionQuery = questionQuery.overlaps('positions', [position, ALL_POSITIONS]);
  }
  const [questions, answers] = await Promise.all([
    questionQuery.order('created_at', { ascending: true }),
    supabase
      .from('answers')
      .select('question_id, score, answered_at')
      .order('answered_at', { ascending: false }),
  ]);
  if (questions.error) {
    return { data: null, error: questions.error.message };
  }
  if (answers.error) {
    return { data: null, error: answers.error.message };
  }

  const lastAnswers = new Map<string, { answeredAt: string; score: number }>();
  for (const answer of answers.data) {
    // Plus récentes d'abord : la première réponse vue pour une question est sa dernière.
    if (!lastAnswers.has(answer.question_id)) {
      lastAnswers.set(answer.question_id, { answeredAt: answer.answered_at, score: answer.score });
    }
  }

  const eligible: EligibleQuestion[] = [];
  for (const question of questions.data) {
    const options = parseQuestionOptions(question.options);
    if (!options) {
      return {
        data: null,
        error: `Question ${question.id} : options mal formées (attendu ${OPTION_COUNT} × { text, score 0-3, explanation }).`,
      };
    }
    // Colonne absente tant que la migration 009 n'est pas exécutée : undefined, pas de schéma.
    const rawDiagram: Json | undefined = question.diagram;
    let diagram: DiagramData | null = null;
    if (rawDiagram !== null && rawDiagram !== undefined) {
      const parsed = parseDiagram(rawDiagram);
      if (parsed.error !== null) {
        return { data: null, error: `Question ${question.id} : schéma invalide en base.\n${parsed.error}` };
      }
      diagram = parsed.data;
    }
    const last = lastAnswers.get(question.id);
    eligible.push({
      ...question,
      options,
      diagram,
      lastAnsweredAt: last ? last.answeredAt : null,
      lastScore: last ? last.score : null,
    });
  }
  return { data: eligible, error: null };
}

/**
 * Questions qui portent un schéma, dans l'ordre de création, schéma brut :
 * l'écran de prévisualisation le valide question par question.
 */
export async function listQuestionDiagrams(): Promise<DbResult<QuestionDiagramRow[]>> {
  const { data, error } = await supabase
    .from('questions')
    .select('id, situation, options, diagram')
    .not('diagram', 'is', null)
    .order('created_at', { ascending: true });
  if (error) {
    return { data: null, error: error.message };
  }
  const rows: QuestionDiagramRow[] = [];
  for (const question of data) {
    const options = parseQuestionOptions(question.options);
    if (!options) {
      return {
        data: null,
        error: `Question ${question.id} : options mal formées (attendu ${OPTION_COUNT} × { text, score 0-3, explanation }).`,
      };
    }
    rows.push({ id: question.id, situation: question.situation, options, diagram: question.diagram });
  }
  return { data: rows, error: null };
}

/** Options lues en base (jsonb), ou null si leur forme n'est pas celle attendue. */
function parseQuestionOptions(value: Json): QuestionOption[] | null {
  if (!Array.isArray(value) || value.length !== OPTION_COUNT) {
    return null;
  }
  const options: QuestionOption[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const { text, score, explanation } = item;
    if (typeof text !== 'string' || typeof explanation !== 'string' || !isOptionScore(score)) {
      return null;
    }
    options.push({ text, score, explanation });
  }
  return options;
}

function isOptionScore(value: Json | undefined): value is QuestionOption['score'] {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
