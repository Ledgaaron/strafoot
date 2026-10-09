// Calculs du tableau de bord du Profil et de ses écrans de statistiques
// (app/stats/[skill].tsx, app/stats/volume.tsx) : régularité par semaine,
// volume du mois, tendance des tests par compétence, détail d'une compétence,
// durées affichées, ligne d'en-tête et initiales de l'avatar. Calcul pur, sans
// dépendance native : testé par lib/profile-stats.test.ts
// (npx tsx lib/profile-stats.test.ts).

import { monthBounds, monthOf, shiftDay, startOfWeek } from './dates';
import { describeDelta, type Delta } from './measure-delta';
import type { MeasureLatest } from './records';
import { getFamily, SKILLS, TEST_FAMILIES, type FamilyKey, type SkillKey } from './test-families';

/** Semaines du graphe de régularité, la semaine courante comprise (à droite). */
export const REGULARITY_WEEK_COUNT = 12;

const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;

/** Séance lue pour les volumes : son jour local et sa durée. */
export type SessionVolumeSource = { date: string; duration_min: number };

/** Une semaine du graphe de régularité, du lundi au dimanche. */
export type WeekVolume = {
  /** Lundi de la semaine (YYYY-MM-DD). */
  monday: string;
  /** Minutes des séances enregistrées. */
  minutes: number;
  /** Séances enregistrées, tout module. */
  sessions: number;
  /** Tests passés : couples (test, jour) distincts. */
  tests: number;
};

/** Grandeur portée par les barres (puces Minutes · Séances · Tests) : un champ de WeekVolume. */
export type RegularityMetric = 'minutes' | 'sessions' | 'tests';

/** Lundi de la première des REGULARITY_WEEK_COUNT semaines : premier jour à lire. */
export function regularityStart(today: string): string {
  return shiftDay(startOfWeek(today), -DAYS_PER_WEEK * (REGULARITY_WEEK_COUNT - 1));
}

/**
 * Les REGULARITY_WEEK_COUNT semaines, de la plus ancienne à la courante.
 * testDays : un jour par test passé (couples (test, jour) distincts, comme
 * resultDates d'un test). Une séance ou un test hors de ces semaines est ignoré.
 */
export function buildRegularityWeeks(
  today: string,
  sessions: readonly SessionVolumeSource[],
  testDays: readonly string[],
): WeekVolume[] {
  const first = regularityStart(today);
  const weeks: WeekVolume[] = Array.from({ length: REGULARITY_WEEK_COUNT }, (_, index) => ({
    monday: shiftDay(first, DAYS_PER_WEEK * index),
    minutes: 0,
    sessions: 0,
    tests: 0,
  }));
  const byMonday = new Map(weeks.map((week) => [week.monday, week]));
  for (const session of sessions) {
    const week = byMonday.get(startOfWeek(session.date));
    if (week !== undefined) {
      week.minutes += session.duration_min;
      week.sessions += 1;
    }
  }
  for (const day of testDays) {
    const week = byMonday.get(startOfWeek(day));
    if (week !== undefined) {
      week.tests += 1;
    }
  }
  return weeks;
}

/** Semaines actives : au moins une séance, tout module (comme la streak d'entraînement). */
export function countActiveWeeks(weeks: readonly WeekVolume[]): number {
  return weeks.filter((week) => week.sessions > 0).length;
}

/** Séances et minutes du mois de today, du 1er à today (carte Volume du Profil). */
export function monthVolume(
  today: string,
  sessions: readonly SessionVolumeSource[],
): { minutes: number; sessions: number } {
  const { from } = monthBounds(monthOf(today));
  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
  const inMonth = sessions.filter((session) => session.date >= from && session.date <= today);
  return {
    minutes: inMonth.reduce((sum, session) => sum + session.duration_min, 0),
    sessions: inMonth.length,
  };
}

/** Tests passés (un jour par test passé) depuis from inclus ; sans from, depuis le début. */
export function countTestsSince(testDays: readonly string[], from?: string): number {
  return from === undefined ? testDays.length : testDays.filter((day) => day >= from).length;
}

/** Minutes en heures pleines et minutes restantes : 400 → 6 h et 40 min. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / MINUTES_PER_HOUR), minutes: total % MINUTES_PER_HOUR };
}

/** « 45 min » ; en heures à partir de 60 min : « 1 h », « 6 h 40 », « 2 h 05 ». */
export function formatMinutes(total: number): string {
  if (total < MINUTES_PER_HOUR) {
    return `${total} min`;
  }
  const { hours, minutes } = splitMinutes(total);
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
}

/** Mesure d'un test, telle que les statistiques la lisent (format de lib/sheet-types.ts). */
export type MeasureSource = { key: string; name: string; unit: string; higher_is_better: boolean };

/** Ce que les statistiques lisent d'un test : TestSummary (lib/db/training.ts) le fournit tel quel. */
export type TestStatsSource = {
  slug: string;
  title: string;
  skill: SkillKey;
  family: FamilyKey;
  /** Jour du dernier résultat ; null si jamais fait. */
  lastDate: string | null;
  /** Jours distincts où il a été fait. */
  resultDates: readonly string[];
  /** Record de chaque mesure (key → meilleure valeur). */
  records: ReadonlyMap<string, number>;
  /** Dernier résultat de chaque mesure (key) et la valeur du précédent. */
  latest: ReadonlyMap<string, MeasureLatest>;
  exercise: { measures: readonly MeasureSource[] };
};

/** Tendance d'une compétence : mesures dont le dernier résultat bat, ou non, le précédent. */
export type SkillTrend = {
  /** Dernier résultat meilleur que le précédent, selon higher_is_better. */
  progress: number;
  /** Dernier résultat moins bon que le précédent. */
  regress: number;
  /** Mesures à deux résultats ou plus ; une égalité n'est ni un progrès ni un recul. */
  compared: number;
};

/** Ligne d'une compétence dans la carte Tests du Profil. */
export type SkillSummary = {
  skill: SkillKey;
  /** Tests de la compétence faits au moins une fois. */
  testsDone: number;
  /** Jour (YYYY-MM-DD) du dernier test de la compétence. */
  lastDate: string;
  trend: SkillTrend;
};

/** Compétences ayant au moins un test fait, dans l'ordre de SKILLS. */
export function summarizeSkills(tests: readonly TestStatsSource[]): SkillSummary[] {
  return SKILLS.flatMap((skill): SkillSummary[] => {
    const done = tests.filter((test) => test.skill === skill.key && test.lastDate !== null);
    const lastDate = latestDay(done.flatMap((test) => test.lastDate ?? []));
    if (lastDate === null) {
      return [];
    }
    return [{ skill: skill.key, testsDone: done.length, lastDate, trend: skillTrend(done) }];
  });
}

/** Partie de la ligne de tendance, avec son sens : la couleur la double, le texte la porte. */
export type TrendPart = { text: string; direction: 'better' | 'worse' | 'same' };

/**
 * « 2 mesures en progrès · 1 en recul » en parties colorables : une partie à 0
 * est omise ; « Stable » quand toutes les mesures comparables sont égales ;
 * « Pas encore de tendance » sans mesure à deux résultats.
 */
export function describeTrend(trend: SkillTrend): TrendPart[] {
  if (trend.compared === 0) {
    return [{ text: 'Pas encore de tendance', direction: 'same' }];
  }
  const parts: TrendPart[] = [];
  if (trend.progress > 0) {
    parts.push({ text: `${countMeasures(trend.progress)} en progrès`, direction: 'better' });
  }
  if (trend.regress > 0) {
    // Après « 2 mesures en progrès », le mot ne se répète pas : « 1 en recul ».
    const amount = parts.length > 0 ? String(trend.regress) : countMeasures(trend.regress);
    parts.push({ text: `${amount} en recul`, direction: 'worse' });
  }
  return parts.length > 0 ? parts : [{ text: 'Stable', direction: 'same' }];
}

/** Mesure d'un test fait : record, dernier résultat et son évolution. */
export type MeasureStat = {
  key: string;
  name: string;
  unit: string;
  /** Meilleure valeur ; null si jamais mesurée. */
  record: number | null;
  /** Dernier résultat ; null si jamais mesurée. */
  latest: MeasureLatest | null;
  /** Dernier résultat face au précédent ; direction none sans précédent. */
  delta: Delta;
};

/** Test fait d'une compétence et ses mesures, dans l'ordre de l'exercice. */
export type TestStat = {
  slug: string;
  title: string;
  lastDate: string;
  /** Jours où il a été fait. */
  doneCount: number;
  measures: MeasureStat[];
};

/** Famille d'une compétence et ses tests faits. */
export type FamilyStat = { family: FamilyKey; label: string; tests: TestStat[] };

/**
 * Détail d'une compétence : ses familles ayant au moins un test fait, dans
 * l'ordre de TEST_FAMILIES, et leurs tests faits dans l'ordre reçu.
 */
export function buildSkillDetail(tests: readonly TestStatsSource[], skill: SkillKey): FamilyStat[] {
  return TEST_FAMILIES.filter((family) => family.skill === skill).flatMap((family): FamilyStat[] => {
    const familyTests = tests.flatMap((test): TestStat[] =>
      test.family === family.key && test.lastDate !== null
        ? [
            {
              slug: test.slug,
              title: test.title,
              lastDate: test.lastDate,
              doneCount: test.resultDates.length,
              measures: test.exercise.measures.map((measure) => toMeasureStat(test, measure)),
            },
          ]
        : [],
    );
    return familyTests.length > 0 ? [{ family: family.key, label: getFamily(family.key).label, tests: familyTests }] : [];
  });
}

/** « Milieu relayeur · FC Vaulx · Régional 2 » : parties non vides seulement ; null s'il n'en reste aucune. */
export function joinCaption(parts: readonly (string | null | undefined)[]): string | null {
  const kept = parts.flatMap((part) => {
    const trimmed = part?.trim() ?? '';
    return trimmed === '' ? [] : [trimmed];
  });
  return kept.length > 0 ? kept.join(' · ') : null;
}

/**
 * Initiales de l'avatar, deux lettres tirées du nom affiché : premières lettres
 * du premier et du dernier mot (« Karim Mansouri » → « KM », « Jean-Pierre
 * Papin » → « JP ») ; les deux premières d'un nom d'un seul mot (« Zizou » →
 * « ZI »). null pour un nom absent ou vide : l'avatar garde l'icône personne.
 */
export function initialsOf(displayName: string | null): string | null {
  const words = (displayName ?? '').split(/[\s-]+/).filter((word) => word !== '');
  const first = words[0];
  if (first === undefined) {
    return null;
  }
  // Array.from : une lettre hors du plan de base (deux unités UTF-16) reste entière.
  const letters =
    words.length === 1
      ? Array.from(first).slice(0, 2)
      : [Array.from(first)[0], Array.from(words[words.length - 1])[0]];
  return letters.join('').toUpperCase();
}

/** Dernier jour d'une liste de jours YYYY-MM-DD ; null si elle est vide. */
function latestDay(days: readonly string[]): string | null {
  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
  return days.reduce<string | null>((latest, day) => (latest === null || day > latest ? day : latest), null);
}

function skillTrend(tests: readonly TestStatsSource[]): SkillTrend {
  const trend: SkillTrend = { progress: 0, regress: 0, compared: 0 };
  for (const test of tests) {
    for (const measure of test.exercise.measures) {
      const latest = test.latest.get(measure.key);
      if (latest === undefined || latest.previousValue === null) {
        continue;
      }
      trend.compared += 1;
      const { direction } = describeDelta(latest.value, latest.previousValue, measure.unit, measure.higher_is_better);
      if (direction === 'better') {
        trend.progress += 1;
      } else if (direction === 'worse') {
        trend.regress += 1;
      }
    }
  }
  return trend;
}

function toMeasureStat(test: TestStatsSource, measure: MeasureSource): MeasureStat {
  const latest = test.latest.get(measure.key) ?? null;
  return {
    key: measure.key,
    name: measure.name,
    unit: measure.unit,
    record: test.records.get(measure.key) ?? null,
    latest,
    delta:
      latest === null
        ? { text: '', direction: 'none' }
        : describeDelta(latest.value, latest.previousValue, measure.unit, measure.higher_is_better),
  };
}

/** « 1 mesure », « 2 mesures ». */
function countMeasures(count: number): string {
  return `${count} ${count >= 2 ? 'mesures' : 'mesure'}`;
}
