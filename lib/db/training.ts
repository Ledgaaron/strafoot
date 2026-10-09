import { latestByKey, recordsByKey, type MeasureLatest } from '../records';
import {
  parseAtomicExercise,
  parseBlocks,
  parseExercises,
  parseIntro,
  type Exercise,
  type SheetKind,
} from '../sheet-types';
import { supabase } from '../supabase';
import { getFamily, isFamilyKey, type FamilyKey, type SkillKey } from '../test-families';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type SheetRow = Tables<'training_sheets'>;

/** Fiche de lecture prête à lire : intro et exercices validés (format de lib/sheet-types.ts). */
export type Sheet = Omit<SheetRow, 'kind' | 'intro' | 'exercises'> & {
  kind: 'training';
  intro: string[];
  exercises: Exercise[];
};

/** Test atomique prêt à lire : famille connue, un seul exercice validé (mesures comprises). */
export type AtomicTest = {
  id: string;
  slug: string;
  title: string;
  skill: SkillKey;
  family: FamilyKey;
  durationMin: number;
  /** Règles communes de la batterie d'origine, sous « Plus de tips ». */
  intro: string[];
  exercise: Exercise;
};

/** Test de l'onglet Tests et des statistiques du Profil : sa dernière fois, record et dernier résultat de chaque mesure. */
export type TestSummary = AtomicTest & {
  /** Jour (YYYY-MM-DD) du dernier résultat d'une de ses mesures ; null si jamais fait. */
  lastDate: string | null;
  /** Jours distincts où il a été fait, du plus récent au plus ancien (historique de proposeSession, régularité). */
  resultDates: string[];
  /** Record de chaque mesure (key → meilleure valeur) ; une mesure jamais saisie est absente. */
  records: ReadonlyMap<string, number>;
  /** Dernier résultat de chaque mesure (key) et la valeur du précédent : tendance ; une mesure jamais saisie est absente. */
  latest: ReadonlyMap<string, MeasureLatest>;
};

/** Session prédéfinie : suite ordonnée de tests, par slug. */
export type TestSessionSheet = {
  id: string;
  title: string;
  skill: string;
  durationMin: number;
  /** Slugs des tests, dans l'ordre de passage. */
  blocks: string[];
};

/** Lignes lisibles, et une phrase par ligne écartée (contenu en base hors format) : affichées, jamais avalées. */
export type Listing<T> = { items: T[]; problems: string[] };

/** Ajouté à tout problème de contenu : le plus souvent, migration ou seed pas encore exécutés. */
const SEED_HINT = 'Exécuter supabase/migrations/007_tests_atomic.sql puis supabase/seed_sheets_001.sql.';

/**
 * Fiches de lecture (kind 'training'), tests atomiques (kind 'test') ou sessions
 * (kind 'session'), par titre. Lignes brutes : exercises n'est pas validé ici.
 */
export async function listSheets({ kind }: { kind: SheetKind }): Promise<DbResult<SheetRow[]>> {
  const { data, error } = await supabase
    .from('training_sheets')
    .select('*')
    .eq('kind', kind)
    .order('title', { ascending: true });
  return { data, error: error?.message ?? null };
}

/** Nombre de fiches d'un kind (carte Fiches du Profil : fiches de lecture). */
export async function countSheets({ kind }: { kind: SheetKind }): Promise<DbResult<number>> {
  // GET + limit(1) plutôt que head: true : en HEAD, une erreur arrive sans message.
  const { count, error } = await supabase
    .from('training_sheets')
    .select('id', { count: 'exact' })
    .eq('kind', kind)
    .limit(1);
  if (error) {
    return { data: null, error: error.message };
  }
  if (count === null) {
    return { data: null, error: 'Supabase n’a pas renvoyé le nombre de fiches.' };
  }
  return { data: count, error: null };
}

/**
 * Une fiche de lecture par id, prête à lire ; data null sans erreur si elle
 * n'existe pas (ou plus). Un test ou une session se lit dans l'onglet Tests :
 * erreur lisible ici, comme un contenu en base hors du format des JSON.
 */
export async function getSheet(id: string): Promise<DbResult<Sheet>> {
  const { data, error } = await supabase.from('training_sheets').select('*').eq('id', id).maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }
  if (data.kind !== 'training') {
    return {
      data: null,
      error: `« ${data.title} » n’est pas une fiche de lecture (kind « ${data.kind} ») : l’ouvrir depuis l’onglet Tests.`,
    };
  }
  const intro = parseIntro(data.intro);
  if (intro.error !== null) {
    return { data: null, error: `Fiche « ${data.title} » : intro invalide en base.\n${intro.error}` };
  }
  const exercises = parseExercises(data.exercises, 'training');
  if (exercises.error !== null) {
    return { data: null, error: `Fiche « ${data.title} » : exercices invalides en base.\n${exercises.error}` };
  }
  return { data: { ...data, kind: 'training', intro: intro.data, exercises: exercises.data }, error: null };
}

/**
 * Tests atomiques de l'onglet Tests et des statistiques du Profil, par slug
 * (ordre du contenu : batterie puis bloc), avec leur dernière fois, le record et
 * le dernier résultat de chaque mesure : deux requêtes, les tests puis tous les
 * résultats avec la key de leur mesure. Un test hors format est écarté et dit
 * dans problems. Résultats lus dans la limite du max rows du projet (1000 par
 * défaut).
 */
export async function listTests(): Promise<DbResult<Listing<TestSummary>>> {
  const [sheets, results] = await Promise.all([
    supabase.from('training_sheets').select('*').eq('kind', 'test').order('slug', { ascending: true }),
    supabase
      .from('test_results')
      .select('value, date, test:tests(key)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (sheets.error || results.error) {
    const messages = [sheets.error?.message, results.error?.message].filter((message) => message !== undefined);
    // Une même panne (réseau, session expirée) remonte souvent sur les deux requêtes.
    return { data: null, error: [...new Set(messages)].join('\n') };
  }
  // Résultats par key de mesure ; ceux d'un test de démonstration (key null) ne servent à aucun test atomique.
  const keyed: { key: string; value: number; date: string }[] = [];
  for (const row of results.data) {
    if (row.test?.key) {
      keyed.push({ key: row.test.key, value: row.value, date: row.date });
    }
  }
  const items: TestSummary[] = [];
  const problems: string[] = [];
  for (const row of sheets.data) {
    const parsed = toAtomicTest(row);
    if (parsed.error !== null) {
      problems.push(parsed.error);
      continue;
    }
    const test = parsed.data;
    const measures = test.exercise.measures;
    const keys = new Set(measures.map((measure) => measure.key));
    const higherIsBetter = new Map(measures.map((measure) => [measure.key, measure.higher_is_better]));
    const own = keyed.filter((result) => keys.has(result.key));
    // Plus récents d'abord : les jours sortent dans l'ordre, le premier est le dernier.
    const resultDates = [...new Set(own.map((result) => result.date))];
    items.push({
      ...test,
      lastDate: resultDates[0] ?? null,
      resultDates,
      records: recordsByKey(own, higherIsBetter),
      latest: latestByKey(own),
    });
  }
  return { data: { items, problems: withSeedHint(problems) }, error: null };
}

/** Un test atomique par slug, prêt à lire ; data null sans erreur s'il n'existe pas (ou plus). */
export async function getTestBySlug(slug: string): Promise<DbResult<AtomicTest>> {
  const { data, error } = await supabase
    .from('training_sheets')
    .select('*')
    .eq('kind', 'test')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }
  const parsed = toAtomicTest(data);
  return parsed.error !== null ? { data: null, error: `${parsed.error}\n${SEED_HINT}` } : parsed;
}

/** Sessions prédéfinies, par titre ; une session hors format est écartée et dite dans problems. */
export async function listSessions(): Promise<DbResult<Listing<TestSessionSheet>>> {
  const { data, error } = await supabase
    .from('training_sheets')
    .select('id, title, skill, duration_min, blocks')
    .eq('kind', 'session')
    .order('title', { ascending: true });
  if (error) {
    return { data: null, error: error.message };
  }
  const items: TestSessionSheet[] = [];
  const problems: string[] = [];
  for (const row of data) {
    const blocks = parseBlocks(row.blocks);
    if (blocks.error !== null) {
      problems.push(`Session « ${row.title} » : tests illisibles en base.\n${blocks.error}`);
      continue;
    }
    items.push({ id: row.id, title: row.title, skill: row.skill, durationMin: row.duration_min, blocks: blocks.data });
  }
  return { data: { items, problems: withSeedHint(problems) }, error: null };
}

/** Ligne kind test lue en base → test atomique, ou erreur lisible (slug, famille, exercice unique, intro). */
function toAtomicTest(row: SheetRow): { data: AtomicTest; error: null } | { data: null; error: string } {
  const where = `Test « ${row.title} »`;
  if (row.slug === null) {
    return { data: null, error: `${where} : slug absent.` };
  }
  // Colonne absente tant que 007 n'est pas exécutée : undefined à l'exécution, malgré le type.
  const familyValue: unknown = row.family;
  if (typeof familyValue !== 'string' || !isFamilyKey(familyValue)) {
    return { data: null, error: `${where} : famille absente ou inconnue (${JSON.stringify(familyValue ?? null)}).` };
  }
  const family = getFamily(familyValue);
  if (family.skill !== row.skill) {
    return { data: null, error: `${where} : famille ${familyValue} hors de la compétence « ${row.skill} ».` };
  }
  const exercise = parseAtomicExercise(row.exercises);
  if (exercise.error !== null) {
    return { data: null, error: `${where} : exercice invalide en base.\n${exercise.error}` };
  }
  const intro = parseIntro(row.intro);
  if (intro.error !== null) {
    return { data: null, error: `${where} : intro invalide en base.\n${intro.error}` };
  }
  return {
    data: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      skill: family.skill,
      family: familyValue,
      durationMin: row.duration_min,
      intro: intro.data,
      exercise: exercise.data,
    },
    error: null,
  };
}

/** Problèmes de contenu suivis, s'il y en a, de la marche à suivre. */
function withSeedHint(problems: string[]): string[] {
  return problems.length > 0 ? [...problems, SEED_HINT] : problems;
}

/** Durée prévue (minutes) d'une fiche ; data null sans erreur si elle n'existe pas (ou plus). */
export async function getSheetDuration(id: string): Promise<DbResult<number>> {
  const { data, error } = await supabase.from('training_sheets').select('duration_min').eq('id', id).maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data ? data.duration_min : null, error: null };
}

/** Jour (YYYY-MM-DD) de la dernière séance liée à la fiche ou au test ; null s'il n'y en a aucune. */
export async function getLastSessionForSheet(sheetId: string): Promise<DbResult<string | null>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .eq('sheet_id', sheetId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data ? data.date : null, error: null };
}

/**
 * Jour de la dernière séance liée à chaque fiche ou test (sheet_id → YYYY-MM-DD),
 * en une requête pour toute la liste de l'onglet. Une fiche sans séance est
 * absente. Séances lues de la plus récente à la plus ancienne, dans la limite du
 * max rows du projet (1000 par défaut).
 */
export async function listLastSessionDates(): Promise<DbResult<ReadonlyMap<string, string>>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('sheet_id, date')
    .not('sheet_id', 'is', null)
    .order('date', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  const lastDates = new Map<string, string>();
  for (const row of data) {
    // Plus récentes d'abord : la première séance vue pour une fiche est sa dernière.
    if (row.sheet_id !== null && !lastDates.has(row.sheet_id)) {
      lastDates.set(row.sheet_id, row.date);
    }
  }
  return { data: lastDates, error: null };
}
