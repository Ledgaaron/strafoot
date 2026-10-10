// Tests de lib/diagram-types.ts, sans framework : npx tsx lib/diagram-types.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { OPTION_IDS, optionIdOfIndex, optionLetter, parseDiagram, validateDiagram } from './diagram-types';

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

/** Schéma de question valide : chaque cas le modifie en un seul point. */
function questionDiagram(): Record<string, unknown> {
  return {
    view: 'half_right',
    context: { score: '2-1', minute: 78 },
    players: [
      { id: 'us8', team: 'us', number: 8, x: 70, y: 40, you: true, ball: true },
      { id: 'us9', team: 'us', number: 9, x: 90, y: 30, move: { dx: 1, dy: 0, speed: 'sprint' } },
      { id: 'them6', team: 'them', number: 6, x: 75, y: 42, move: { dx: -1, dy: 0, speed: 'run' } },
    ],
    options: [
      { id: 1, kind: 'pass', to: 'us9' },
      { id: 2, kind: 'dribble', from: 'us8', to: { x: 80, y: 50 }, path: [{ x: 74, y: 48 }] },
      { id: 3, kind: 'hold', to: 'us8' },
      { id: 4, kind: 'shot', to: { x: 105, y: 34 } },
    ],
  };
}

/** Une erreur au moins contient `fragment` (message lisible, pas seulement un échec). */
function assertError(value: unknown, fragment: string): void {
  const { value: diagram, errors } = validateDiagram(value);
  assert.equal(diagram, null);
  assert.ok(
    errors.some((message) => message.includes(fragment)),
    `aucune erreur ne contient « ${fragment} » : ${JSON.stringify(errors)}`,
  );
  assert.equal(parseDiagram(value).data, null);
}

check('valide : options de chaque sorte, from par défaut = le joueur you, to joueur résolu', () => {
  const { data, error } = parseDiagram(questionDiagram());
  assert.equal(error, null);
  assert.ok(data !== null);
  assert.deepEqual(data.context, { score: { us: 2, them: 1 }, minute: 78 });
  assert.equal(data.players.length, 3);
  assert.deepEqual(data.players[1].move, { dx: 1, dy: 0, speed: 'sprint' });
  assert.deepEqual(
    data.options.map((option) => [option.id, option.kind, option.from]),
    [
      [1, 'pass', 'us8'],
      [2, 'dribble', 'us8'],
      [3, 'hold', 'us8'],
      [4, 'shot', 'us8'],
    ],
  );
  // Passe vers un joueur : sa position et son id ; hold : sur place, sans fin.
  assert.deepEqual(data.options[0].to, { x: 90, y: 30, player: 'us9' });
  assert.deepEqual(data.options[1].path, [{ x: 74, y: 48 }]);
  assert.equal(data.options[2].to, null);
  assert.deepEqual(data.objects, []);
  assert.equal(data.ball, null);
  assert.equal(data.path, null);
});

check('option vers un joueur inconnu : refusée, l’id fautif cité', () => {
  const diagram = questionDiagram();
  diagram.options = [{ id: 1, kind: 'pass', to: 'us99' }];
  assertError(diagram, 'to "us99" n\'est aucun joueur');
});

check('id d’option hors de 1 à 4 : refusé', () => {
  const diagram = questionDiagram();
  diagram.options = [{ id: 5, kind: 'run', to: { x: 80, y: 20 } }];
  assertError(diagram, 'option 5 : id 5 invalide');
});

check('coordonnées hors terrain : refusées', () => {
  const diagram = questionDiagram();
  diagram.players = [{ id: 'us8', team: 'us', x: 110, y: 40, you: true }];
  diagram.options = [{ id: 1, kind: 'hold' }];
  assertError(diagram, '(110 ; 40) hors du terrain');
});

check('vue incompatible : joueur dans le terrain mais hors de la demi-vue', () => {
  const diagram = questionDiagram();
  diagram.players = [{ id: 'us8', team: 'us', x: 30, y: 40, you: true }];
  diagram.options = [{ id: 1, kind: 'hold' }];
  assertError(diagram, '(30 ; 40) hors de la vue half_right');
});

check('test sans options : repère local, plots étiquetés et trajet', () => {
  const { data, error } = parseDiagram({
    view: 'local',
    width_m: 30,
    players: [{ id: 'joueur', team: 'us', x: 0, y: 12 }],
    objects: [
      { type: 'cone', x: 0, y: 15, label: '0 m' },
      { type: 'cone', x: 30, y: 15, label: '30 m' },
    ],
    path: { points: [{ x: 0, y: 12 }, { x: 30, y: 12 }], style: 'run' },
  });
  assert.equal(error, null);
  assert.ok(data !== null);
  assert.deepEqual(data.options, []);
  assert.equal(data.width_m, 30);
  assert.deepEqual(
    data.objects.map((object) => [object.type, object.label, object.w]),
    [
      ['cone', '0 m', null],
      ['cone', '30 m', null],
    ],
  );
  assert.deepEqual(data.path, { points: [{ x: 0, y: 12 }, { x: 30, y: 12 }], style: 'run' });
});

check('optionLetter : 1 → A, 2 → B, 3 → C, 4 → D ; une réponse garde la lettre de son rang', () => {
  assert.deepEqual(OPTION_IDS.map(optionLetter), ['A', 'B', 'C', 'D']);
  // 3e réponse de questions.options (rang 2) : option 3 du schéma, lettre C.
  const id = optionIdOfIndex(2);
  assert.ok(id !== null);
  assert.equal(optionLetter(id), 'C');
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
