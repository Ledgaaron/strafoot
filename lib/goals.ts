// Objectifs du joueur : une mesure d'un test atomique, son départ (dernier
// résultat à la création, null si elle n'a jamais été mesurée), une cible et
// une échéance. La progression se lit dans les résultats enregistrés depuis la
// création, dans le sens de la mesure (higher_is_better) : rien n'est stocké.
// Calcul pur, sans dépendance native : testé par lib/goals.test.ts
// (npx tsx lib/goals.test.ts).

import { daysBetween, formatShortDay, relativeDay, shiftDay, timestampMs } from './dates';
import { formatDecimal, formatMeasure } from './measure-delta';

/** Objectifs actifs (non retirés) au plus : au-delà, l'Accueil n'en propose plus. */
export const MAX_ACTIVE_GOALS = 3;
/** Échéance proposée à la création : J+42. */
export const DEFAULT_GOAL_DAYS = 42;

/** Ce que le calcul lit d'un objectif (ligne de goals). */
export type GoalSource = {
  /** timestamptz de la création : seuls les résultats enregistrés depuis comptent. */
  created_at: string;
  start_value: number | null;
  target_value: number;
  /** Jour local YYYY-MM-DD. */
  deadline: string;
};

/** Résultat de la mesure de l'objectif : valeur, jour local et instant d'enregistrement. */
export type GoalResult = { value: number; date: string; created_at: string };

/**
 * reached : un résultat depuis la création atteint la cible (jour du premier) ;
 * overdue : échéance passée sans l'atteindre ; unmeasured : ni départ ni
 * résultat depuis la création ; ongoing : jours restants jusqu'à l'échéance
 * (0 le jour même), jamais négatif.
 */
export type GoalState =
  | { kind: 'reached'; date: string }
  | { kind: 'overdue' }
  | { kind: 'unmeasured' }
  | { kind: 'ongoing'; daysLeft: number };

export type GoalProgress = {
  /** Meilleur résultat depuis la création, dans le sens de la mesure ; null sans résultat depuis. */
  best: number | null;
  /** Chemin parcouru du départ (à défaut, du premier résultat depuis la création) à la cible : de 0 à 1. */
  ratio: number;
  state: GoalState;
};

/** Saisie de la cible lue : la valeur, ou le message affiché sous le champ. */
export type TargetCheck = { value: number; error: null } | { value: null; error: string };

/** Barème en fin d'unité de score : « 30 » dans « pts /30 », « 10 » dans « /10 ». */
const SCALE_MAX = /\/\s*(\d+(?:[.,]\d+)?)\s*$/;
/** Nombre saisi : chiffres, virgule ou point décimal (« 12 », « 4,35 »). */
const DECIMAL_INPUT = /^\d+(?:[.,]\d+)?$/;
/** En deçà de 7 jours, une date passée s'écrit en relatif (« hier ») ; au-delà, « le 3 nov. ». */
const RELATIVE_DAY_LIMIT = 7;

/** Échéance proposée à la création d'un objectif. */
export function defaultDeadline(today: string): string {
  return shiftDay(today, DEFAULT_GOAL_DAYS);
}

/** La valeur atteint la cible : au moins la cible si higherIsBetter, au plus sinon (chrono). */
export function reachesTarget(value: number, target: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? value >= target : value <= target;
}

/**
 * Progression d'un objectif le jour today. results : les résultats de sa
 * mesure, dans n'importe quel ordre ; seuls comptent ceux enregistrés depuis la
 * création (created_at), une valeur non finie est écartée. Atteint : le premier
 * résultat qui atteint la cible, dans l'ordre d'enregistrement ; l'état atteint
 * l'emporte sur l'échéance dépassée, qui l'emporte sur « pas encore mesuré ».
 */
export function goalProgress(
  goal: GoalSource,
  results: readonly GoalResult[],
  higherIsBetter: boolean,
  today: string,
): GoalProgress {
  const since = timestampMs(goal.created_at);
  const after = results
    .filter((result) => Number.isFinite(result.value) && timestampMs(result.created_at) >= since)
    .sort((a, b) => timestampMs(a.created_at) - timestampMs(b.created_at));

  let best: number | null = null;
  let reachedDate: string | null = null;
  for (const result of after) {
    if (best === null || (higherIsBetter ? result.value > best : result.value < best)) {
      best = result.value;
    }
    if (reachedDate === null && reachesTarget(result.value, goal.target_value, higherIsBetter)) {
      reachedDate = result.date;
    }
  }

  const daysLeft = daysBetween(today, goal.deadline);
  let state: GoalState;
  if (reachedDate !== null) {
    state = { kind: 'reached', date: reachedDate };
  } else if (daysLeft < 0) {
    state = { kind: 'overdue' };
  } else if (goal.start_value === null && best === null) {
    state = { kind: 'unmeasured' };
  } else {
    state = { kind: 'ongoing', daysLeft };
  }

  const baseline = goal.start_value ?? after[0]?.value ?? null;
  return { best, ratio: progressRatio(baseline, best, goal.target_value, reachedDate !== null), state };
}

/** Part du chemin du départ à la cible ; 1 une fois atteinte, 0 sans départ ni résultat. */
function progressRatio(baseline: number | null, best: number | null, target: number, reached: boolean): number {
  if (reached) {
    return 1;
  }
  if (baseline === null || best === null || target === baseline) {
    return 0;
  }
  // Même formule dans les deux sens : target − baseline porte le signe d'un progrès.
  return Math.min(1, Math.max(0, (best - baseline) / (target - baseline)));
}

/**
 * Cible saisie : un nombre plus grand que 0 (virgule ou point), au plus le
 * barème d'une unité de score (« /10 »), et strictement meilleure que le départ
 * s'il y en a un (plus haute, ou plus basse pour un chrono).
 */
export function parseTarget(text: string, start: number | null, unit: string, higherIsBetter: boolean): TargetCheck {
  const trimmed = text.trim();
  if (!DECIMAL_INPUT.test(trimmed)) {
    return { value: null, error: 'Cible attendue : un nombre, par exemple 20 ou 12,5.' };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!(value > 0)) {
    return { value: null, error: 'Cible attendue : un nombre plus grand que 0.' };
  }
  const scale = SCALE_MAX.exec(unit);
  if (scale !== null) {
    const max = Number(scale[1].replace(',', '.'));
    if (value > max) {
      return { value: null, error: `Cible au plus ${formatDecimal(max)} : le barème est sur ${formatDecimal(max)}.` };
    }
  }
  if (start !== null && (higherIsBetter ? value <= start : value >= start)) {
    const startLabel = formatMeasure(start, unit);
    return {
      value: null,
      error: higherIsBetter
        ? `Cible à viser au-dessus du départ (${startLabel}).`
        : `Cible à viser sous le départ (${startLabel}) : un temps plus bas est meilleur.`,
    };
  }
  return { value, error: null };
}

/** « 8 → 20 touches », l'unité une seule fois ; sans départ : « Cible : 20 touches ». */
export function formatGoalRange(start: number | null, target: number, unit: string): string {
  return start === null ? `Cible : ${formatMeasure(target, unit)}` : `${formatDecimal(start)} → ${formatMeasure(target, unit)}`;
}

/**
 * État lisible : « J-12 », « Jour J », « Atteint ✓ hier », « Atteint ✓ le
 * 3 nov. », « Échéance dépassée », « Pas encore mesuré ».
 */
export function formatGoalState(state: GoalState, today: string): string {
  switch (state.kind) {
    case 'reached': {
      const when = relativeDay(state.date, today);
      return daysBetween(state.date, today) < RELATIVE_DAY_LIMIT ? `Atteint ✓ ${when}` : `Atteint ✓ le ${when}`;
    }
    case 'overdue':
      return 'Échéance dépassée';
    case 'unmeasured':
      return 'Pas encore mesuré';
    case 'ongoing':
      return state.daysLeft === 0 ? 'Jour J' : `J-${state.daysLeft}`;
  }
}

/** Ligne d'échéance d'un formulaire : « Dim. 22 nov. · J-42 » ; passée : « Ven. 9 oct. · dépassée ». */
export function formatDeadlineLine(deadline: string, today: string): string {
  const day = formatShortDay(deadline);
  const label = `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
  const daysLeft = daysBetween(today, deadline);
  if (daysLeft < 0) {
    return `${label} · dépassée`;
  }
  return `${label} · ${daysLeft === 0 ? 'Jour J' : `J-${daysLeft}`}`;
}
