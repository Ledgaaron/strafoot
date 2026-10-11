// Tests de lib/day-strip.ts, sans framework : npx tsx lib/day-strip.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  centeredStripIndex,
  clampStripIndex,
  defaultStripStart,
  STRIP_VISIBLE_DAYS,
  stripDays,
  stripStartFor,
} from './day-strip';

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

// Dimanche 11 octobre 2026.
const TODAY = '2026-10-11';

check('bande par défaut : 12 semaines en arrière, 14 jours devant', () => {
  const start = defaultStripStart(TODAY);
  assert.equal(start, '2026-07-19');
  const days = stripDays(start, TODAY);
  assert.equal(days.length, 84 + 1 + 14);
  assert.equal(days[0], '2026-07-19');
  assert.equal(days[days.length - 1], '2026-10-25');
  assert.equal(days[84], TODAY);
});

check('aujourd’hui centré : trois jours de part et d’autre', () => {
  const days = stripDays(defaultStripStart(TODAY), TODAY);
  const index = centeredStripIndex(days, TODAY);
  assert.equal(index, 81);
  assert.deepEqual(days.slice(index, index + STRIP_VISIBLE_DAYS), [
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
  ]);
});

check('bornes : jamais de case vide aux extrémités', () => {
  const days = stripDays(defaultStripStart(TODAY), TODAY);
  assert.equal(centeredStripIndex(days, '2026-07-19'), 0);
  assert.equal(centeredStripIndex(days, '2026-10-25'), days.length - STRIP_VISIBLE_DAYS);
  assert.equal(clampStripIndex(days.length, 81 + 7), 88);
  assert.equal(clampStripIndex(days.length, 88 + 7), 92);
  assert.equal(clampStripIndex(days.length, -7), 0);
  assert.equal(clampStripIndex(3, 1), 0);
});

check('jour plus ancien choisi : la bande recule pour le centrer, sans jamais avancer', () => {
  const start = defaultStripStart(TODAY);
  const extended = stripStartFor(start, '2026-05-10');
  assert.equal(extended, '2026-05-07');
  const days = stripDays(extended, TODAY);
  assert.equal(days[centeredStripIndex(days, '2026-05-10') + 3], '2026-05-10');
  // Un jour récent ne raccourcit pas la bande déjà agrandie.
  assert.equal(stripStartFor(extended, '2026-10-01'), extended);
  assert.equal(stripStartFor(start, '2026-10-01'), start);
});

check('bande vide : rang 0', () => {
  assert.equal(centeredStripIndex([], TODAY), 0);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
