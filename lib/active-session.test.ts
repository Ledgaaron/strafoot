// Tests du chrono de la séance en cours (lib/active-session.ts), sans framework :
// npx tsx lib/active-session.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { elapsedMinutes, formatElapsed } from './active-session';

type Case<T> = { name: string; ms: number; expected: T };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const formatCases: Case<string>[] = [
  { name: '0 s : « 0:00 »', ms: 0, expected: '0:00' },
  { name: '59 s : « 0:59 »', ms: 59 * SECOND, expected: '0:59' },
  { name: '60 s : « 1:00 »', ms: 60 * SECOND, expected: '1:00' },
  { name: '59 min 59 s : « 59:59 », encore sans les heures', ms: 59 * MINUTE + 59 * SECOND, expected: '59:59' },
  { name: '1 h pile : « 1:00:00 »', ms: HOUR, expected: '1:00:00' },
  { name: 'négatif (horloge reculée) : « 0:00 »', ms: -5 * SECOND, expected: '0:00' },
];

const minuteCases: Case<number>[] = [
  { name: '29 s : arrondi à 0, ramené au minimum de 1 min', ms: 29 * SECOND, expected: 1 },
  { name: '1 min 30 s : arrondi à 2 min', ms: 90 * SECOND, expected: 2 },
  { name: '44 min 29 s : arrondi à 44 min', ms: 44 * MINUTE + 29 * SECOND, expected: 44 },
  { name: 'négatif : 1 min', ms: -MINUTE, expected: 1 },
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

for (const testCase of formatCases) {
  check(`formatElapsed, ${testCase.name}`, () => {
    assert.equal(formatElapsed(testCase.ms), testCase.expected);
  });
}

for (const testCase of minuteCases) {
  check(`elapsedMinutes, ${testCase.name}`, () => {
    assert.equal(elapsedMinutes(testCase.ms), testCase.expected);
  });
}

const total = formatCases.length + minuteCases.length;
if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
