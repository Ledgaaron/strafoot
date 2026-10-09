// Tests de lib/records.ts, sans framework : npx tsx lib/records.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { bestValue, isNewRecord, latestByKey, recordsByKey } from './records';

let total = 0;
let failures = 0;

function check(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`ok     ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ÉCHEC  ${name}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

check('bestValue : chrono, le plus petit gagne', () => {
  assert.equal(bestValue([4.5, 4.1, 4.32], false), 4.1);
});

check('bestValue : score, le plus grand gagne', () => {
  assert.equal(bestValue([18, 22, 20], true), 22);
});

check('bestValue : liste vide → null', () => {
  assert.equal(bestValue([], true), null);
  assert.equal(bestValue([], false), null);
});

check('bestValue : NaN et Infinity écartés', () => {
  assert.equal(bestValue([Number.NaN, 12.5, Number.NEGATIVE_INFINITY, 11.9], false), 11.9);
  // Infinity battrait tout score, -Infinity tout chrono.
  assert.equal(bestValue([Number.POSITIVE_INFINITY, 4, Number.NaN], true), 4);
  assert.equal(bestValue([Number.NaN, Number.POSITIVE_INFINITY], true), null);
  // NaN en tête ne bloque pas la comparaison des suivantes.
  assert.equal(bestValue([Number.NaN, 3, 7], true), 7);
});

check('recordsByKey : sens propre à chaque mesure', () => {
  const senses = new Map([
    ['sprint_10m', false],
    ['frappes_cadrees', true],
  ]);
  const records = recordsByKey(
    [
      { key: 'sprint_10m', value: 1.92 },
      { key: 'frappes_cadrees', value: 6 },
      { key: 'sprint_10m', value: 1.85 },
      { key: 'frappes_cadrees', value: 8 },
      { key: 'sprint_10m', value: 1.99 },
      { key: 'frappes_cadrees', value: 7 },
    ],
    senses,
  );
  assert.deepEqual(
    records,
    new Map([
      ['sprint_10m', 1.85],
      ['frappes_cadrees', 8],
    ]),
  );
});

check('recordsByKey : key inconnue ignorée, mesure sans résultat absente', () => {
  const senses = new Map([
    ['sprint_10m', false],
    ['jongles_pieds', true],
  ]);
  const records = recordsByKey(
    [
      { key: 'sprint_10m', value: 1.9 },
      { key: 'mesure_supprimee', value: 99 },
    ],
    senses,
  );
  assert.deepEqual(records, new Map([['sprint_10m', 1.9]]));
  assert.equal(records.has('jongles_pieds'), false);
  assert.equal(records.has('mesure_supprimee'), false);
});

check('recordsByKey : listes vides, valeurs non finies écartées', () => {
  const senses = new Map([['jongles_pieds', true]]);
  assert.equal(recordsByKey([], senses).size, 0);
  assert.equal(recordsByKey([{ key: 'jongles_pieds', value: 40 }], new Map()).size, 0);
  const records = recordsByKey(
    [
      { key: 'jongles_pieds', value: Number.POSITIVE_INFINITY },
      { key: 'jongles_pieds', value: 40 },
      { key: 'jongles_pieds', value: Number.NaN },
    ],
    senses,
  );
  assert.deepEqual(records, new Map([['jongles_pieds', 40]]));
});

check('latestByKey : dernier et avant-dernier de chaque mesure, du plus récent au plus ancien', () => {
  const latest = latestByKey([
    { key: 'sprint_10m', value: 1.85, date: '2026-10-08' },
    { key: 'frappes_cadrees', value: 8, date: '2026-10-08' },
    { key: 'sprint_10m', value: 1.92, date: '2026-10-01' },
    { key: 'sprint_10m', value: 1.99, date: '2026-09-20' },
  ]);
  assert.deepEqual(
    latest,
    new Map([
      ['sprint_10m', { value: 1.85, date: '2026-10-08', previousValue: 1.92 }],
      ['frappes_cadrees', { value: 8, date: '2026-10-08', previousValue: null }],
    ]),
  );
});

check('latestByKey : liste vide, et un 0 précédent reste posé', () => {
  assert.equal(latestByKey([]).size, 0);
  const latest = latestByKey([
    { key: 'jongles_tete', value: 3, date: '2026-10-08' },
    { key: 'jongles_tete', value: 0, date: '2026-10-07' },
    { key: 'jongles_tete', value: 9, date: '2026-10-06' },
  ]);
  assert.deepEqual(latest.get('jongles_tete'), { value: 3, date: '2026-10-08', previousValue: 0 });
});

check('isNewRecord : chrono strictement plus petit', () => {
  assert.equal(isNewRecord(1.8, 1.85, false), true);
  assert.equal(isNewRecord(1.9, 1.85, false), false);
});

check('isNewRecord : score strictement plus grand', () => {
  assert.equal(isNewRecord(9, 8, true), true);
  assert.equal(isNewRecord(7, 8, true), false);
});

check('isNewRecord : égalité, pas un record', () => {
  assert.equal(isNewRecord(8, 8, true), false);
  assert.equal(isNewRecord(1.85, 1.85, false), false);
});

check('isNewRecord : premier résultat, rien à battre', () => {
  assert.equal(isNewRecord(8, null, true), false);
  assert.equal(isNewRecord(1.85, null, false), false);
});

check('isNewRecord : valeur non finie, jamais un record', () => {
  assert.equal(isNewRecord(Number.POSITIVE_INFINITY, 8, true), false);
  assert.equal(isNewRecord(Number.NEGATIVE_INFINITY, 1.85, false), false);
  assert.equal(isNewRecord(Number.NaN, 8, true), false);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
