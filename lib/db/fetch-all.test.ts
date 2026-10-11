// Tests de lib/db/fetch-all.ts, sans framework ni Supabase : npx tsx lib/db/fetch-all.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { describeError } from '../errors';
import { fetchAllRows, MAX_PAGES, PAGE_SIZE } from './fetch-all';

let total = 0;
let failures = 0;

async function check(name: string, run: () => Promise<void>): Promise<void> {
  total += 1;
  try {
    await run();
    console.log(`ok     ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ÉCHEC  ${name}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

type Row = { id: number };

/**
 * Table simulée de `count` lignes, servie comme PostgREST : range(from, to)
 * inclus, jamais plus de PAGE_SIZE lignes par réponse (le Max rows du projet).
 * Les plages demandées sont relevées.
 */
function fakeTable(count: number) {
  const rows: Row[] = Array.from({ length: count }, (_, id) => ({ id }));
  const ranges: [number, number][] = [];
  const page = async (from: number, to: number) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null };
  };
  return { page, ranges };
}

async function main(): Promise<void> {
  await check('aucune ligne : une requête, liste vide', async () => {
    const table = fakeTable(0);
    assert.deepEqual(await fetchAllRows(table.page), { data: [], error: null });
    assert.deepEqual(table.ranges, [[0, PAGE_SIZE - 1]]);
  });

  await check('moins d’une page : une seule requête', async () => {
    const table = fakeTable(999);
    const result = await fetchAllRows(table.page);
    assert.equal(result.data?.length, 999);
    assert.equal(table.ranges.length, 1);
  });

  await check('exactement une page : une seconde requête, vide, confirme la fin', async () => {
    const table = fakeTable(PAGE_SIZE);
    const result = await fetchAllRows(table.page);
    assert.equal(result.data?.length, PAGE_SIZE);
    assert.deepEqual(table.ranges, [
      [0, 999],
      [1000, 1999],
    ]);
  });

  await check('2 500 lignes : trois pages contiguës, toutes les lignes dans l’ordre', async () => {
    const table = fakeTable(2500);
    const result = await fetchAllRows(table.page);
    assert.equal(result.error, null);
    assert.deepEqual(
      result.data?.map((row) => row.id),
      Array.from({ length: 2500 }, (_, id) => id),
    );
    assert.deepEqual(table.ranges, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  await check('erreur à la deuxième page : l’erreur, jamais une liste partielle', async () => {
    const table = fakeTable(2500);
    const page = async (from: number, to: number) =>
      from === 0 ? table.page(from, to) : { data: null, error: { message: 'TypeError: Load failed' } };
    assert.deepEqual(await fetchAllRows(page), { data: null, error: 'TypeError: Load failed' });
  });

  await check('ni lignes ni erreur : un message de l’app, affiché tel quel', async () => {
    const result = await fetchAllRows<Row>(async () => ({ data: null, error: null }));
    assert.equal(result.data, null);
    assert.match(result.error ?? '', /ni les lignes ni d’erreur/);
    assert.equal(describeError(result.error).kind, 'app');
  });

  await check('requête sans .range() : arrêt après MAX_PAGES pages, avec une erreur', async () => {
    let calls = 0;
    const full: Row[] = Array.from({ length: PAGE_SIZE }, (_, id) => ({ id }));
    const result = await fetchAllRows(async () => {
      calls += 1;
      return { data: full, error: null };
    });
    assert.equal(calls, MAX_PAGES);
    assert.equal(result.data, null);
    assert.match(result.error ?? '', /Lecture interrompue/);
    assert.equal(describeError(result.error).kind, 'app');
  });

  if (failures > 0) {
    console.error(`\n${failures} cas en échec sur ${total}.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${total} cas, tous passent.`);
  }
}

void main();
