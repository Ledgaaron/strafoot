// Tests de lib/uuid.ts, sans framework : npx tsx lib/uuid.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { fallbackUuid, randomUuid } from './uuid';

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

/** UUID v4 : version 4, variante RFC 4122 (8, 9, a ou b), minuscules. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

check('randomUuid : UUID v4 (crypto.randomUUID sous Node)', () => {
  assert.match(randomUuid(), UUID_V4);
});

check('repli sans Web Crypto (Hermes) : UUID v4 aux bornes du tirage', () => {
  assert.equal(fallbackUuid(() => 0), '00000000-0000-4000-8000-000000000000');
  assert.equal(fallbackUuid(() => 0.999999), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  for (let index = 0; index < 200; index += 1) {
    assert.match(fallbackUuid(Math.random), UUID_V4);
  }
});

check('deux tirages diffèrent', () => {
  assert.notEqual(randomUuid(), randomUuid());
  assert.notEqual(fallbackUuid(Math.random), fallbackUuid(Math.random));
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
