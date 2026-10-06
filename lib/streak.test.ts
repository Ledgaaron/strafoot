// Tests de lib/streak.ts, sans framework : npx tsx lib/streak.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { computeStreaks, type Streaks } from './streak';

type Case = { name: string; days: string[]; today: string; expected: Streaks };

// Mercredi 7 octobre 2026 : hier = 6 oct., avant-hier = 5 oct.
const TODAY = '2026-10-07';

const cases: Case[] = [
  {
    name: 'jours consécutifs jusqu’à aujourd’hui',
    days: ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
    today: TODAY,
    expected: { current: 4, best: 4 },
  },
  {
    name: 'jusqu’à hier seulement : aujourd’hui vide ne casse pas la streak',
    days: ['2026-10-04', '2026-10-05', '2026-10-06'],
    today: TODAY,
    expected: { current: 3, best: 3 },
  },
  {
    name: 'trou avant-hier, actif hier et aujourd’hui : le compte s’arrête au trou',
    days: ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-07'],
    today: TODAY,
    expected: { current: 2, best: 3 },
  },
  {
    name: 'trou avant-hier, actif hier seulement, aujourd’hui vide : hier suffit',
    days: ['2026-10-03', '2026-10-04', '2026-10-06'],
    today: TODAY,
    expected: { current: 1, best: 2 },
  },
  {
    name: 'hier et aujourd’hui inactifs : streak cassée',
    days: ['2026-10-03', '2026-10-04', '2026-10-05'],
    today: TODAY,
    expected: { current: 0, best: 3 },
  },
  {
    name: 'aucun jour',
    days: [],
    today: TODAY,
    expected: { current: 0, best: 0 },
  },
  {
    name: 'un seul jour : aujourd’hui',
    days: ['2026-10-07'],
    today: TODAY,
    expected: { current: 1, best: 1 },
  },
  {
    name: 'meilleure streak passée supérieure à la courante',
    days: ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-10-06', '2026-10-07'],
    today: TODAY,
    expected: { current: 2, best: 5 },
  },
  {
    name: 'doublons de dates (plusieurs séances le même jour) : un jour compte une fois',
    days: ['2026-10-06', '2026-10-06', '2026-10-07', '2026-10-07', '2026-10-07'],
    today: TODAY,
    expected: { current: 2, best: 2 },
  },
  {
    name: 'passage de mois : 29 sept. → 2 oct.',
    days: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
    today: '2026-10-02',
    expected: { current: 4, best: 4 },
  },
  {
    name: 'passage de mois court : 27 févr. → 1er mars 2026',
    days: ['2026-02-27', '2026-02-28', '2026-03-01'],
    today: '2026-03-02',
    expected: { current: 3, best: 3 },
  },
  {
    name: 'année bissextile : 28 févr. et 1er mars 2024 ne se suivent pas',
    days: ['2024-02-28', '2024-03-01'],
    today: '2024-03-01',
    expected: { current: 1, best: 1 },
  },
  {
    name: 'passage d’année : 30 déc. → 1er janv.',
    days: ['2025-12-30', '2025-12-31', '2026-01-01'],
    today: '2026-01-01',
    expected: { current: 3, best: 3 },
  },
  {
    name: 'changement d’heure du 25 oct. 2026 sans effet',
    days: ['2026-10-24', '2026-10-25', '2026-10-26'],
    today: '2026-10-26',
    expected: { current: 3, best: 3 },
  },
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
  // Comme à l'écran : un Set construit à partir des lignes renvoyées par Supabase.
  check(testCase.name, () => {
    assert.deepEqual(computeStreaks(new Set(testCase.days), testCase.today), testCase.expected);
  });
}

// Un jour mal formé est une erreur de programmation : exception, jamais un 0 silencieux.
check('jour invalide : exception', () => {
  assert.throws(() => computeStreaks(new Set(['2026-02-30']), TODAY), /Jour invalide/);
  assert.throws(() => computeStreaks(new Set<string>(), '07/10/2026'), /Jour invalide/);
});

const total = cases.length + 1;
if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
