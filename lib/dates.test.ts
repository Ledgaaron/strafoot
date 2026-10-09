// Tests de relativeDay, daysBetween, startOfWeek, formatWeekRange et des libellés
// de l'Accueil et du formulaire (formatLongDay, formatRecentDay, formatDateLine,
// formatWeekOf) de lib/dates.ts, sans framework : npx tsx lib/dates.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  daysBetween,
  formatDateLine,
  formatLongDay,
  formatRecentDay,
  formatWeekOf,
  formatWeekRange,
  relativeDay,
  startOfWeek,
} from './dates';

type Case = { name: string; day: string; today: string; expected: string };

// Mercredi 7 octobre 2026.
const TODAY = '2026-10-07';

const cases: Case[] = [
  {
    name: 'même jour : « auj. »',
    day: '2026-10-07',
    today: TODAY,
    expected: 'auj.',
  },
  {
    name: 'veille : « hier »',
    day: '2026-10-06',
    today: TODAY,
    expected: 'hier',
  },
  {
    // 71 h entre les deux minuits locaux en France : l'arrondi compte 3 jours, pas 2.
    name: '3 jours avant, passage à l’heure d’été du 29 mars compris : « il y a 3 j »',
    day: '2026-03-27',
    today: '2026-03-30',
    expected: 'il y a 3 j',
  },
  {
    name: '6 jours avant : encore relatif',
    day: '2026-10-01',
    today: TODAY,
    expected: 'il y a 6 j',
  },
  {
    name: '7 jours avant : date absolue',
    day: '2026-09-30',
    today: TODAY,
    expected: '30 sept.',
  },
  {
    name: 'passage de mois : 29 sept. vu le 2 oct.',
    day: '2026-09-29',
    today: '2026-10-02',
    expected: 'il y a 3 j',
  },
  {
    name: 'autre année : l’année suit la date absolue',
    day: '2025-12-20',
    today: '2026-01-05',
    expected: '20 déc. 2025',
  },
];

type ValueCase<T> = { name: string; run: () => T; expected: T };

// Semaine du lundi 5 au dimanche 11 octobre 2026.
const valueCases: ValueCase<string | number>[] = [
  { name: 'daysBetween : échéance dans 42 jours', run: () => daysBetween(TODAY, '2026-11-18'), expected: 42 },
  { name: 'daysBetween : même jour, 0', run: () => daysBetween(TODAY, TODAY), expected: 0 },
  { name: 'daysBetween : jour passé, négatif', run: () => daysBetween(TODAY, '2026-10-04'), expected: -3 },
  {
    // 47 h entre les deux minuits locaux en France (heure d’hiver le 25 octobre) : 2 jours.
    name: 'daysBetween : passage à l’heure d’hiver compris',
    run: () => daysBetween('2026-10-24', '2026-10-26'),
    expected: 2,
  },
  { name: 'startOfWeek : mercredi → lundi 5 oct.', run: () => startOfWeek(TODAY), expected: '2026-10-05' },
  { name: 'startOfWeek : un lundi reste lui-même', run: () => startOfWeek('2026-10-05'), expected: '2026-10-05' },
  { name: 'startOfWeek : dimanche → lundi précédent', run: () => startOfWeek('2026-10-11'), expected: '2026-10-05' },
  { name: 'startOfWeek : jeudi 1er janv. → lundi 29 déc.', run: () => startOfWeek('2026-01-01'), expected: '2025-12-29' },
  { name: 'formatWeekRange : même mois', run: () => formatWeekRange('2026-10-05', TODAY), expected: '5 – 11 oct.' },
  { name: 'formatWeekRange : deux mois', run: () => formatWeekRange('2026-09-28', TODAY), expected: '28 sept. – 4 oct.' },
  {
    name: 'formatWeekRange : autre année, l’année suit la fin',
    run: () => formatWeekRange('2025-12-01', TODAY),
    expected: '1 – 7 déc. 2025',
  },
  {
    name: 'formatWeekRange : semaine à cheval sur deux années',
    run: () => formatWeekRange('2026-12-28', TODAY),
    expected: '28 déc. 2026 – 3 janv. 2027',
  },
  // En-tête de l'Accueil : jour de la semaine, numéro, mois en toutes lettres, sans année.
  { name: 'formatLongDay : vendredi 9 octobre', run: () => formatLongDay('2026-10-09'), expected: 'Vendredi 9 octobre' },
  { name: 'formatLongDay : 1er de l’an, jeudi', run: () => formatLongDay('2026-01-01'), expected: 'Jeudi 1 janvier' },
  { name: 'formatLongDay : dimanche 2 août', run: () => formatLongDay('2026-08-02'), expected: 'Dimanche 2 août' },
  // Titre des séances d'un jour (« Séances · hier », « Séances · dim. 4 oct. »).
  { name: 'formatRecentDay : même jour', run: () => formatRecentDay(TODAY, TODAY), expected: 'aujourd’hui' },
  { name: 'formatRecentDay : veille', run: () => formatRecentDay('2026-10-06', TODAY), expected: 'hier' },
  { name: 'formatRecentDay : 3 jours avant, en court', run: () => formatRecentDay('2026-10-04', TODAY), expected: 'dim. 4 oct.' },
  { name: 'formatRecentDay : jour à venir, en court', run: () => formatRecentDay('2026-10-09', TODAY), expected: 'ven. 9 oct.' },
  {
    name: 'formatRecentDay : autre année, l’année suit',
    run: () => formatRecentDay('2025-12-20', '2026-01-05'),
    expected: 'sam. 20 déc. 2025',
  },
  // Ligne de date du formulaire de séance : libellé capitalisé, puis JJ/MM/AAAA.
  { name: 'formatDateLine : aujourd’hui', run: () => formatDateLine(TODAY, TODAY), expected: 'Aujourd’hui · 07/10/2026' },
  { name: 'formatDateLine : hier', run: () => formatDateLine('2026-10-06', TODAY), expected: 'Hier · 06/10/2026' },
  { name: 'formatDateLine : jour en court', run: () => formatDateLine('2026-10-04', TODAY), expected: 'Dim. 4 oct. · 04/10/2026' },
  {
    name: 'formatDateLine : autre année',
    run: () => formatDateLine('2025-12-20', '2026-01-05'),
    expected: 'Sam. 20 déc. 2025 · 20/12/2025',
  },
  // Carte de la semaine, hors semaine courante.
  { name: 'formatWeekOf : semaine du 12 oct.', run: () => formatWeekOf('2026-10-12', TODAY), expected: 'Semaine du 12 oct.' },
  { name: 'formatWeekOf : autre année', run: () => formatWeekOf('2025-12-29', TODAY), expected: 'Semaine du 29 déc. 2025' },
];

let failures = 0;

function check(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok     ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ÉCHEC  ${name}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const testCase of cases) {
  check(testCase.name, () => {
    assert.equal(relativeDay(testCase.day, testCase.today), testCase.expected);
  });
}

for (const testCase of valueCases) {
  check(testCase.name, () => {
    assert.equal(testCase.run(), testCase.expected);
  });
}

const total = cases.length + valueCases.length;

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
