// Tests de lib/measure-delta.ts, sans framework : npx tsx lib/measure-delta.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { describeDelta, formatMeasure, type Delta } from './measure-delta';

const MINUS = '−';

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

function expectDelta(actual: Delta, text: string, direction: Delta['direction']): void {
  assert.deepEqual(actual, { text, direction });
}

check('chrono qui baisse : mieux (higher_is_better false)', () => {
  // 4,1 − 4,5 vaut −0,3999999999999995 en binaire.
  expectDelta(describeDelta(4.1, 4.5, 's', false), `${MINUS}0,4 s ↑ mieux`, 'better');
});

check('chrono qui monte : moins bien', () => {
  expectDelta(describeDelta(4.5, 4.1, 's', false), '+0,4 s ↓ moins bien', 'worse');
});

check('score qui monte : mieux, barème « /30 » retiré de l’écart', () => {
  expectDelta(describeDelta(20, 18, 'pts /30', true), '+2 pts ↑ mieux', 'better');
});

check('unité « /10 » : écart sans unité, dans les deux sens', () => {
  expectDelta(describeDelta(8, 6, '/10', true), '+2 ↑ mieux', 'better');
  expectDelta(describeDelta(5, 6, '/10', true), `${MINUS}1 ↓ moins bien`, 'worse');
  expectDelta(describeDelta(5, 3, '/6', true), '+2 ↑ mieux', 'better');
});

check('décimales : écart arrondi au nombre de décimales des valeurs', () => {
  // 16,2 − 15,5 vaut 0,6999999999999993 en binaire.
  expectDelta(describeDelta(16.2, 15.5, 'm', true), '+0,7 m ↑ mieux', 'better');
  // 4,32 − 4,5 vaut −0,17999999999999972 : deux décimales, celles de 4,32.
  expectDelta(describeDelta(4.32, 4.5, 's', false), `${MINUS}0,18 s ↑ mieux`, 'better');
  expectDelta(describeDelta(12.5, 12, 'touches', true), '+0,5 touches ↑ mieux', 'better');
});

check('pas de précédent : aucune évolution', () => {
  expectDelta(describeDelta(25, null, 'touches', true), '', 'none');
  expectDelta(describeDelta(4.1, null, 's', false), '', 'none');
});

check('égalité : « = », y compris après arrondi binaire', () => {
  expectDelta(describeDelta(25, 25, 'touches', true), '=', 'same');
  expectDelta(describeDelta(4.5, 4.5, 's', false), '=', 'same');
  // 0,1 + 0,2 vaut 0,30000000000000004 : l'écart avec 0,3 n'est pas une évolution.
  expectDelta(describeDelta(0.1 + 0.2, 0.3, 's', false), '=', 'same');
});

check('négatif : signe moins typographique, jamais le trait d’union', () => {
  const delta = describeDelta(20, 25, 'touches', true);
  expectDelta(delta, `${MINUS}5 touches ↓ moins bien`, 'worse');
  assert.ok(!delta.text.includes('-'), `trait d'union dans « ${delta.text} »`);
});

check('formatMeasure : virgule décimale, unité conservée telle quelle', () => {
  assert.equal(formatMeasure(12.5, 's'), '12,5 s');
  assert.equal(formatMeasure(18, 'pts /30'), '18 pts /30');
  assert.equal(formatMeasure(8, '/10'), '8 /10');
  assert.equal(formatMeasure(1650, 'm'), '1650 m');
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
