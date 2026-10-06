// Tests de relativeDay (lib/dates.ts), sans framework : npx tsx lib/dates.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { relativeDay } from './dates';

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

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${cases.length}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${cases.length} cas, tous passent.`);
}
