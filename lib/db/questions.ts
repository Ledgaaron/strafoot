import { parseDiagram, type DiagramData } from '../diagram-types';
import { appMessage } from '../errors';
import type { QuestionOption } from '../json-types';
import { ALL_POSITIONS, type PositionKey, type ThemeKey } from '../quiz-taxonomy';
import { supabase } from '../supabase';
import type { Json, Tables } from '../types';
import { fetchAllRows } from './fetch-all';
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
 * celles marquées 'tous' ; sans poste, toutes. Deux lectures, chacune page par
 * page, jointure ici. Questions : les miennes et le contenu public (RLS) ;
 * réponses : toutes, de la plus récente à la plus ancienne.
 */
export async function listEligibleQuestions({
  theme,
  position,
}: QuestionFilter = {}): Promise<DbResult<EligibleQuestion[]>> {
  const [questions, answers] = await Promise.all([
    fetchAllRows((first, last) => {
      let query = supabase.from('questions').select('*');
      if (theme) {
        query = query.eq('theme', theme);
      }
      if (position && position !== ALL_POSITIONS) {
        // && en SQL : positions contient le poste choisi ou 'tous'.
        query = query.overlaps('positions', [position, ALL_POSITIONS]);
      }
      return query.order('created_at', { ascending: true }).order('id', { ascending: true }).range(first, last);
    }),
    fetchAllRows((first, last) =>
      supabase
        .from('answers')
        .select('question_id, score, answered_at')
        .order('answered_at', { ascending: false })
        .order('id', { ascending: true })
        .range(first, last),
    ),
  ]);
  if (questions.error !== null) {
    return { data: null, error: questions.error };
  }
  if (answers.error !== null) {
    return { data: null, error: answers.error };
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
        error: appMessage(
          `Question ${question.id} : options mal formées (attendu ${OPTION_COUNT} × { text, score 0-3, explanation }).`,
        ),
      };
    }
    // Colonne absente tant que la migration 009 n'est pas exécutée : undefined, pas de schéma.
    const rawDiagram: Json | undefined = question.diagram;
    let diagram: DiagramData | null = null;
    if (rawDiagram !== null && rawDiagram !== undefined) {
      const parsed = parseDiagram(rawDiagram);
      if (parsed.error !== null) {
        return { data: null, error: appMessage(`Question ${question.id} : schéma invalide en base.\n${parsed.error}`) };
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
  const { data, error } = await fetchAllRows((first, last) =>
    supabase
      .from('questions')
      .select('id, situation, options, diagram')
      .not('diagram', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(first, last),
  );
  if (error !== null) {
    return { data: null, error };
  }
  const rows: QuestionDiagramRow[] = [];
  for (const question of data) {
    const options = parseQuestionOptions(question.options);
    if (!options) {
      return {
        data: null,
        error: appMessage(
          `Question ${question.id} : options mal formées (attendu ${OPTION_COUNT} × { text, score 0-3, explanation }).`,
        ),
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
