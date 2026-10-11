// Tests de lib/diagram-types.ts, sans framework : npx tsx lib/diagram-types.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  bestOptionId,
  formatDistance,
  OPTION_IDS,
  optionIdOfIndex,
  optionLetter,
  parseDiagram,
  validateDiagram,
  viewFrame,
  viewRegion,
} from './diagram-types';

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

/** Schéma de quiz en vue zone (chantier 16) : fenêtre de 40 × 30 m centrée sur (80 ; 40). */
function zoneDiagram(): Record<string, unknown> {
  return {
    view: 'zone',
    width_m: 40,
    center: { x: 80, y: 40 },
    players: [
      { id: 'us8', team: 'us', number: 8, x: 70, y: 40, you: true, ball: true },
      { id: 'us9', team: 'us', number: 9, x: 90, y: 30 },
    ],
    options: [
      { id: 1, kind: 'pass', to: 'us9' },
      { id: 2, kind: 'hold' },
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
  assert.equal(data.center, null);
  assert.deepEqual(data.dimensions, []);
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

check('vue zone : fenêtre 4:3 centrée, cadre 722 × 542, les vues de terrain gardent 722 × 646', () => {
  const { data, error } = parseDiagram(zoneDiagram());
  assert.equal(error, null);
  assert.ok(data !== null);
  assert.deepEqual(data.center, { x: 80, y: 40 });
  assert.equal(data.width_m, 40);
  assert.deepEqual(viewRegion('zone', 40, { x: 80, y: 40 }), { xMin: 60, xMax: 100, yMin: 25, yMax: 55 });
  assert.deepEqual(viewFrame('zone'), { width: 722, height: 542 });
  assert.deepEqual(viewFrame('local'), { width: 722, height: 361 });
  assert.deepEqual(viewFrame('half_right'), { width: 722, height: 646 });
  assert.deepEqual(viewFrame('full'), viewFrame('box_right'));
});

check('vue zone : joueur dans le terrain mais hors de la fenêtre, refusé', () => {
  const diagram = zoneDiagram();
  diagram.players = [{ id: 'us8', team: 'us', x: 55, y: 40, you: true }];
  diagram.options = [{ id: 1, kind: 'hold' }];
  assertError(diagram, '(55 ; 40) hors de la vue zone');
});

check('vue zone : largeur hors de 30 à 60 m, refusée', () => {
  const diagram = zoneDiagram();
  diagram.width_m = 20;
  assertError(diagram, 'width_m 20 invalide');
  diagram.width_m = 70;
  assertError(diagram, 'width_m 70 invalide');
});

check('vue zone : centre absent, ou fenêtre qui déborde du terrain de plus de 3 m, refusés', () => {
  const diagram = zoneDiagram();
  delete diagram.center;
  assertError(diagram, 'clé "center" absente');
  // Fenêtre de 40 m centrée en x = 90 : bord droit en 110, 5 m au-delà de la ligne de but.
  diagram.center = { x: 90, y: 40 };
  assertError(diagram, 'fenêtre zone');
  // 3 m de débord permis : bord droit en 108.
  diagram.center = { x: 88, y: 40 };
  assert.equal(parseDiagram(diagram).error, null);
});

check('center hors de la vue zone, et width_m hors de local et zone : refusés', () => {
  const withCenter = questionDiagram();
  withCenter.center = { x: 80, y: 40 };
  assertError(withCenter, 'center ne vaut que pour la vue zone');
  const withWidth = questionDiagram();
  withWidth.width_m = 40;
  assertError(withWidth, 'width_m ne vaut que pour les vues local et zone');
});

check('test sans options : repère local 2:1, plots étiquetés, trajet et cotes', () => {
  const { data, error } = parseDiagram({
    view: 'local',
    width_m: 36,
    players: [],
    objects: [
      { type: 'cone', x: 3, y: 12 },
      { type: 'cone', x: 33, y: 12, label: 'Arrivée' },
    ],
    path: { points: [{ x: 3, y: 7 }, { x: 33, y: 7 }], style: 'run' },
    dimensions: [
      { from: { x: 3, y: 12 }, to: { x: 33, y: 12 } },
      { from: { x: 3, y: 12 }, to: { x: 4.5, y: 12 }, label: 'Pas' },
    ],
  });
  assert.equal(error, null);
  assert.ok(data !== null);
  assert.deepEqual(data.options, []);
  assert.equal(data.width_m, 36);
  assert.deepEqual(viewRegion('local', 36, null), { xMin: 0, xMax: 36, yMin: 0, yMax: 18 });
  assert.deepEqual(
    data.objects.map((object) => [object.type, object.label, object.w]),
    [
      ['cone', null, null],
      ['cone', 'Arrivée', null],
    ],
  );
  assert.deepEqual(data.path, { points: [{ x: 3, y: 7 }, { x: 33, y: 7 }], style: 'run' });
  // Étiquette calculée au format français à défaut ; celle du JSON gardée telle quelle.
  assert.deepEqual(
    data.dimensions.map((dimension) => dimension.label),
    ['30 m', 'Pas'],
  );
});

check('repère local 2:1 : un point sous la moitié de la largeur est refusé', () => {
  assertError(
    { view: 'local', width_m: 30, players: [], objects: [{ type: 'cone', x: 10, y: 16 }] },
    '(10 ; 16) hors du repère local (x de 0 à 30, y de 0 à 15)',
  );
});

check('cotes : trois cotes, ou une cote sans longueur, refusées ; étiquette « 1,5 m »', () => {
  const base = { view: 'local', width_m: 30, players: [] };
  const dimension = { from: { x: 1, y: 1 }, to: { x: 2.5, y: 1 } };
  assertError({ ...base, dimensions: [dimension, dimension, dimension] }, '2 cotes au plus');
  assertError({ ...base, dimensions: [{ from: { x: 1, y: 1 }, to: { x: 1, y: 1 } }] }, 'cote 1 : from et to au même endroit');
  assertError({ ...base, dimensions: [{ ...dimension, label: '' }] }, 'cote 1 : label "" invalide');
  assert.equal(formatDistance(dimension.from, dimension.to), '1,5 m');
  assert.equal(formatDistance({ x: 0, y: 0 }, { x: 0, y: 2 }), '2 m');
});

check('optionLetter : 1 → A, 2 → B, 3 → C, 4 → D ; une réponse garde la lettre de son rang', () => {
  assert.deepEqual(OPTION_IDS.map(optionLetter), ['A', 'B', 'C', 'D']);
  // 3e réponse de questions.options (rang 2) : option 3 du schéma, lettre C.
  const id = optionIdOfIndex(2);
  assert.ok(id !== null);
  assert.equal(optionLetter(id), 'C');
});

check('bestOptionId : le score le plus haut ; à égalité, le plus petit rang', () => {
  assert.equal(bestOptionId({ 1: 1, 2: 3, 3: 2, 4: 0 }), 2);
  assert.equal(bestOptionId({ 1: 3, 2: 3, 3: 1, 4: 0 }), 1);
  assert.equal(bestOptionId({ 1: 0, 2: 2, 3: 3, 4: 3 }), 3);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
