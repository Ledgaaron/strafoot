// Tests de lib/test-plan.ts, sans framework : npx tsx lib/test-plan.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import type { FamilyKey } from './test-families';
import { proposeSession, type PlanHistoryEntry, type PlanTest, type SessionProposal } from './test-plan';

/** Jour local de référence ; la fenêtre de 28 jours va du 2026-09-12 au 2026-10-09 inclus. */
const NOW = '2026-10-09';

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

function test(slug: string, family: FamilyKey, durationMin = 10): PlanTest {
  return { slug, family, durationMin };
}

function done(slug: string, date: string): PlanHistoryEntry {
  return { slug, date };
}

/** Proposition non nulle (l'assertion échoue sinon). */
function propose(
  tests: readonly PlanTest[],
  history: readonly PlanHistoryEntry[],
  excluded: readonly FamilyKey[] = [],
): SessionProposal {
  const proposal = proposeSession(tests, history, NOW, excluded);
  assert.ok(proposal !== null, 'proposition attendue, null obtenu');
  return proposal;
}

function slugsOf(proposal: SessionProposal): string[] {
  return proposal.tests.map((planned) => planned.slug);
}

/** Trois tests Tir · Frappe à l'arrêt, puis trois Passe · Passe courte, de 10 min. */
const TIR_PASSE = [
  test('test-tir-1', 'tir_arret'),
  test('test-tir-2', 'tir_arret'),
  test('test-tir-3', 'tir_arret'),
  test('test-passe-1', 'passe_courte'),
  test('test-passe-2', 'passe_courte'),
  test('test-passe-3', 'passe_courte'),
];

check('famille jamais testée choisie avant une famille testée il y a longtemps', () => {
  const proposal = propose(TIR_PASSE, [done('test-tir-1', '2026-01-01')]);
  assert.equal(proposal.family, 'passe_courte');
  assert.equal(proposal.skill, 'passe');
  assert.deepEqual(slugsOf(proposal), ['test-passe-1', 'test-passe-2', 'test-passe-3']);
  assert.equal(proposal.durationMin, 30);
});

check('familles testées : la moins testée sur 28 jours, puis la plus anciennement testée', () => {
  // Tir 2 fois récemment, Passe 1 fois mais plus récemment : le nombre prime.
  const fewer = propose(TIR_PASSE, [
    done('test-tir-1', '2026-10-01'),
    done('test-tir-2', '2026-10-02'),
    done('test-passe-1', '2026-10-08'),
  ]);
  assert.equal(fewer.family, 'passe_courte');
  // 1 couple chacun (le doublon du même jour ne compte qu'une fois) : Tir, plus ancien.
  const older = propose(TIR_PASSE, [
    done('test-tir-1', '2026-09-20'),
    done('test-tir-1', '2026-09-20'),
    done('test-passe-1', '2026-10-05'),
  ]);
  assert.equal(older.family, 'tir_arret');
  // Égalité parfaite : l'ordre de TEST_FAMILIES départage.
  const tie = propose(TIR_PASSE, [done('test-tir-1', '2026-10-05'), done('test-passe-2', '2026-10-05')]);
  assert.equal(tie.family, 'tir_arret');
});

check('dans la famille : jamais faits d’abord, puis les plus anciens', () => {
  const tests = [
    test('test-tir-1', 'tir_arret'),
    test('test-tir-2', 'tir_arret'),
    test('test-tir-3', 'tir_arret'),
    test('test-tir-4', 'tir_arret'),
    test('test-tir-5', 'tir_arret'),
    test('test-tir-6', 'tir_arret'),
  ];
  const proposal = propose(tests, [
    done('test-tir-2', '2025-01-01'),
    done('test-tir-4', '2026-08-01'),
    done('test-tir-4', '2026-10-01'),
    done('test-tir-5', '2026-09-15'),
    done('test-tir-6', '2026-10-05'),
  ]);
  // Priorité : 1 et 3 (jamais), 2 (2025), 5 (15 sept.) ; 4 (dernier : 1er oct.) et 6 restent.
  assert.deepEqual(slugsOf(proposal), ['test-tir-1', 'test-tir-2', 'test-tir-3', 'test-tir-5']);
  assert.equal(proposal.durationMin, 40);
});

check('ordre de passage : vitesse puis agilité d’abord, endurance en dernier', () => {
  const tests = [
    test('test-endurance-1', 'phys_endurance', 15),
    test('test-gainage-1', 'phys_gainage'),
    test('test-agilite-1', 'phys_agilite'),
    test('test-vitesse-1', 'phys_vitesse'),
  ];
  // Endurance jamais testée : choisie, complétée par les deux plus anciennes du physique.
  const endurance = propose(tests, [
    done('test-vitesse-1', '2026-09-20'),
    done('test-agilite-1', '2026-09-25'),
    done('test-gainage-1', '2026-10-01'),
  ]);
  assert.equal(endurance.family, 'phys_endurance');
  assert.deepEqual(slugsOf(endurance), ['test-vitesse-1', 'test-agilite-1', 'test-endurance-1']);
  assert.equal(endurance.durationMin, 35);
  // Gainage jamais testé : les autres familles entre vitesse et endurance.
  const gainage = propose(tests, [
    done('test-endurance-1', '2026-09-15'),
    done('test-vitesse-1', '2026-09-20'),
    done('test-agilite-1', '2026-10-01'),
  ]);
  assert.equal(gainage.family, 'phys_gainage');
  assert.deepEqual(slugsOf(gainage), ['test-vitesse-1', 'test-gainage-1', 'test-endurance-1']);
});

check('plafonds : 4 tests au plus, 60 min au plus (test trop long sauté)', () => {
  const six = Array.from({ length: 6 }, (_, index) => test(`test-tir-${index + 1}`, 'tir_arret'));
  const capped = propose(six, []);
  assert.deepEqual(slugsOf(capped), ['test-tir-1', 'test-tir-2', 'test-tir-3', 'test-tir-4']);
  assert.equal(capped.durationMin, 40);
  // 25 + 25 = 50 ; le 15 min mènerait à 65 : sauté, le 10 min passe encore.
  const long = propose(
    [
      test('test-tir-1', 'tir_arret', 25),
      test('test-tir-2', 'tir_arret', 25),
      test('test-tir-3', 'tir_arret', 15),
      test('test-tir-4', 'tir_arret', 10),
    ],
    [],
  );
  assert.deepEqual(slugsOf(long), ['test-tir-1', 'test-tir-2', 'test-tir-4']);
  assert.equal(long.durationMin, 60);
});

check('famille à 1 test : complétée par sa compétence jusqu’à 3, pas au-delà', () => {
  const tests = [
    test('test-tir-1', 'tir_arret'),
    test('test-tir-2', 'tir_surface'),
    test('test-tir-3', 'tir_surface'),
    test('test-tir-4', 'tir_surface'),
    test('test-passe-1', 'passe_courte'),
    test('test-passe-2', 'passe_courte'),
  ];
  // Tir · Frappe à l'arrêt et Passe courte jamais testées : l'ordre de TEST_FAMILIES choisit le Tir.
  const proposal = propose(tests, [done('test-tir-2', '2026-10-05'), done('test-tir-4', '2026-09-20')]);
  assert.equal(proposal.family, 'tir_arret');
  assert.equal(proposal.skill, 'tir');
  // Complétion par priorité dans Finition dans la surface : 3 (jamais), puis 4 (le plus ancien).
  assert.deepEqual(slugsOf(proposal), ['test-tir-1', 'test-tir-3', 'test-tir-4']);
  // Compétence sans autre famille : la session a moins de 3 tests.
  const alone = propose([test('test-dribble-1', 'dribble_slalom'), test('test-passe-1', 'passe_courte')], [
    done('test-passe-1', '2026-10-01'),
  ]);
  assert.equal(alone.family, 'dribble_slalom');
  assert.deepEqual(slugsOf(alone), ['test-dribble-1']);
  assert.equal(alone.durationMin, 10);
});

check('excluded : famille suivante, tout exclu → null', () => {
  assert.equal(propose(TIR_PASSE, []).family, 'tir_arret');
  assert.equal(propose(TIR_PASSE, [], ['tir_arret']).family, 'passe_courte');
  // Une famille exclue sans test ne change rien.
  assert.equal(propose(TIR_PASSE, [], ['phys_gainage']).family, 'tir_arret');
  assert.equal(proposeSession(TIR_PASSE, [], NOW, ['tir_arret', 'passe_courte']), null);
});

check('liste de tests vide → null, même avec un historique', () => {
  assert.equal(proposeSession([], [], NOW), null);
  assert.equal(proposeSession([], [done('test-tir-1', '2026-10-01')], NOW), null);
});

check('historique de plus de 28 jours : compte seulement pour la dernière date', () => {
  // Le 11 sept. est hors fenêtre : Tir n'a aucun test récent, Passe en a un.
  const outside = propose(TIR_PASSE, [
    done('test-tir-1', '2026-09-11'),
    done('test-tir-2', '2026-09-11'),
    done('test-tir-3', '2026-08-01'),
    done('test-passe-1', '2026-10-08'),
  ]);
  assert.equal(outside.family, 'tir_arret');
  // Le 12 sept. est le premier jour de la fenêtre : 2 tests récents pour Tir, 1 pour Passe.
  const inside = propose(TIR_PASSE, [
    done('test-tir-1', '2026-09-12'),
    done('test-tir-2', '2026-09-12'),
    done('test-passe-1', '2026-10-08'),
  ]);
  assert.equal(inside.family, 'passe_courte');
  // Aucun test récent de part et d'autre : la plus anciennement testée.
  const old = propose(TIR_PASSE, [done('test-tir-1', '2026-08-01'), done('test-passe-1', '2026-07-01')]);
  assert.equal(old.family, 'passe_courte');
});

check('slug hors catalogue ignoré, date après now comptée récente', () => {
  const unknown = propose(TIR_PASSE, [
    done('test-supprime', '2026-10-08'),
    done('test-supprime', '2026-10-07'),
    done('test-passe-1', '2026-10-01'),
  ]);
  assert.equal(unknown.family, 'tir_arret');
  // Deux tests Tir datés du 20 oct. : 2 récents contre 1 pour Passe.
  const future = propose(TIR_PASSE, [
    done('test-tir-1', '2026-10-20'),
    done('test-tir-2', '2026-10-20'),
    done('test-passe-1', '2026-10-01'),
  ]);
  assert.equal(future.family, 'passe_courte');
});

check('famille dont aucun test ne tient en 60 min : écartée', () => {
  const proposal = propose([test('test-endurance-1', 'phys_endurance', 75), test('test-tir-1', 'tir_arret')], [
    done('test-tir-1', '2026-10-08'),
  ]);
  assert.equal(proposal.family, 'tir_arret');
  assert.deepEqual(slugsOf(proposal), ['test-tir-1']);
  assert.equal(proposeSession([test('test-endurance-1', 'phys_endurance', 75)], [], NOW), null);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
