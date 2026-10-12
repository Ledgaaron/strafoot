// Tests de components/diagram-layout.ts, sans framework : npx tsx components/diagram-layout.test.ts
// Lit les schémas pilotes de supabase/content/diagrams_001.json (et les scores de
// leurs questions dans questions_001.json) : à lancer depuis la racine du projet,
// comme les scripts de seed.
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert et node:fs.
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseDiagram, type DiagramData, type OptionScores, type Point } from '../lib/diagram-types';
import {
  allStates,
  BALL_OUTER,
  describeState,
  findOverlaps,
  layoutDiagram,
  outerRadius,
  PASTILLE_GAP,
  PASTILLE_OUTER,
  PLAYER_RADIUS,
  project,
  VIEW_WIDTH,
  visibleOptionIds,
  type DiagramLayout,
} from './diagram-layout';

const PILOTS_FILE = 'supabase/content/diagrams_001.json';
const QUESTIONS_FILE = 'supabase/content/questions_001.json';
/** Arrondis du calcul. */
const TOLERANCE = 1e-6;

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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const squared = ab.x ** 2 + ab.y ** 2;
  const t = squared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / squared));
  return distance(point, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** Schéma validé ; le cas échoue avec l'erreur de validation sinon. */
function parsed(value: unknown): DiagramData {
  const result = parseDiagram(value);
  assert.equal(result.error, null);
  assert.ok(result.data !== null);
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Schémas pilotes, validés comme par le seed, avec les scores de leur question. */
function readPilots(): { situation: string; diagram: DiagramData; scores: OptionScores }[] {
  const root = readJson(PILOTS_FILE);
  const questionsRoot = readJson(QUESTIONS_FILE);
  const entries: readonly unknown[] = isRecord(root) && Array.isArray(root.diagrams) ? root.diagrams : [];
  const questions: readonly unknown[] =
    isRecord(questionsRoot) && Array.isArray(questionsRoot.questions) ? questionsRoot.questions : [];
  return entries.map((entry) => {
    assert.ok(isRecord(entry) && typeof entry.situation === 'string', `${PILOTS_FILE} : entrée sans situation`);
    const question = questions.find((candidate) => isRecord(candidate) && candidate.situation === entry.situation);
    assert.ok(isRecord(question), `${QUESTIONS_FILE} : question « ${entry.situation} » introuvable`);
    const options: readonly unknown[] = Array.isArray(question.options) ? question.options : [];
    const score = (index: number): 0 | 1 | 2 | 3 => {
      const item: unknown = options[index];
      const value = isRecord(item) ? item.score : undefined;
      assert.ok(value === 0 || value === 1 || value === 2 || value === 3);
      return value;
    };
    return { situation: entry.situation, diagram: parsed(entry.diagram), scores: { 1: score(0), 2: score(1), 3: score(2), 4: score(3) } };
  });
}

/**
 * Manquements à la règle des pastilles : chacune dans le cadre, son bord à
 * PASTILLE_GAP au moins de tout joueur (halo compris), de tout ballon et de
 * toute autre pastille.
 */
function placementFaults(diagram: DiagramData, layout: DiagramLayout): string[] {
  const faults: string[] = [];
  for (const shape of layout.options) {
    const where = `option ${shape.option.id}`;
    const at = shape.pastille;
    const edge = Math.min(at.x, layout.frame.width - at.x, at.y, layout.frame.height - at.y) - PASTILLE_OUTER;
    if (edge < -TOLERANCE) {
      faults.push(`${where} : pastille hors du cadre de ${(-edge).toFixed(1)} px`);
    }
    // La pastille d'un hold touche son joueur par construction, et peut toucher son ballon (sans le recouvrir).
    const hold = shape.option.to === null;
    const carrier = diagram.players.find((player) => player.ball);
    for (const player of diagram.players) {
      if (hold && player.id === shape.option.from) {
        continue;
      }
      const center = layout.centers.get(player.id) ?? project(layout.frame, player);
      const gap = distance(at, center) - outerRadius(player) - PASTILLE_OUTER;
      if (gap < PASTILLE_GAP - TOLERANCE) {
        faults.push(`${where} : pastille à ${gap.toFixed(1)} px du joueur ${player.id}`);
      }
    }
    for (const [index, ball] of layout.balls.entries()) {
      const own = hold && index === 0 && carrier !== undefined && carrier.id === shape.option.from;
      const gap = distance(at, ball) - BALL_OUTER - PASTILLE_OUTER;
      if (gap < (own ? 0 : PASTILLE_GAP) - TOLERANCE) {
        faults.push(`${where} : pastille à ${gap.toFixed(1)} px du ballon`);
      }
    }
    for (const other of layout.options) {
      const gap = distance(at, other.pastille) - 2 * PASTILLE_OUTER;
      if (other.option.id > shape.option.id && gap < PASTILLE_GAP - TOLERANCE) {
        faults.push(`options ${shape.option.id} et ${other.option.id} : pastilles à ${gap.toFixed(1)} px`);
      }
    }
  }
  return faults;
}

const pilots = readPilots();

check(`${PILOTS_FILE} : 7 schémas pilotes valides, en vue zone`, () => {
  assert.equal(pilots.length, 7);
  assert.ok(pilots.every(({ diagram }) => diagram.view === 'zone'));
});

pilots.forEach(({ situation, diagram, scores }, index) => {
  const excerpt = situation.length > 40 ? `${situation.slice(0, 40)}…` : situation;
  check(`pilote ${index + 1} « ${excerpt} » : pastilles bien placées, aucune superposition dans aucun état`, () => {
    const layout = layoutDiagram(diagram);
    const ids = diagram.options.map((option) => option.id).sort((a, b) => a - b);
    assert.deepEqual(
      layout.options.map((shape) => shape.option.id),
      ids,
    );
    assert.deepEqual(placementFaults(diagram, layout), []);
    const states = allStates(ids, scores);
    // Repos, 4 sélections, 4 réponses, tout afficher.
    assert.equal(states.length, 1 + 2 * ids.length + 1);
    for (const state of states) {
      assert.deepEqual(
        findOverlaps(diagram, layout, state).map((overlap) => `${describeState(state)} : ${overlap.first} / ${overlap.second}`),
        [],
      );
    }
    // Mêmes données, mêmes places : aucun hasard, aucun état caché.
    assert.deepEqual(layoutDiagram(diagram), layout);
  });
});

check('cadre par vue : 358 × 320 pour le terrain, 358 × 268,5 en zone, 358 × 179 en local', () => {
  const pitch = layoutDiagram(parsed({ view: 'half_right', players: [] })).frame;
  assert.equal(pitch.width, VIEW_WIDTH);
  assert.ok(Math.abs(pitch.height - (358 * 646) / 722) < TOLERANCE);
  const zone = layoutDiagram(parsed({ view: 'zone', width_m: 40, center: { x: 80, y: 40 }, players: [] })).frame;
  assert.ok(Math.abs(zone.height - (358 * 542) / 722) < TOLERANCE);
  const local = layoutDiagram(parsed({ view: 'local', width_m: 30, players: [] })).frame;
  assert.ok(Math.abs(local.height - (358 * 361) / 722) < TOLERANCE);
  // Zone : la fenêtre entière tient dans le cadre, centrée, même échelle en x et en y.
  const topLeft = project(zone, { x: 60, y: 25 });
  const bottomRight = project(zone, { x: 100, y: 55 });
  assert.ok(topLeft.x >= 0 && topLeft.y >= 0 && bottomRight.x <= zone.width && bottomRight.y <= zone.height);
  assert.ok(Math.abs(zone.width / 2 - (topLeft.x + bottomRight.x) / 2) < TOLERANCE);
});

check('états : rien au repos, la sélectionnée seule, ton choix et la meilleure (seul s’il l’est), toutes avec showAll', () => {
  const ids = [1, 2, 3, 4] as const;
  const scores: OptionScores = { 1: 1, 2: 3, 3: 3, 4: 0 };
  assert.deepEqual(visibleOptionIds(ids, { kind: 'idle' }), []);
  assert.deepEqual(visibleOptionIds(ids, { kind: 'selected', id: 3 }), [3]);
  // Meilleure : B (3, le plus petit rang à égalité avec C).
  assert.deepEqual(visibleOptionIds(ids, { kind: 'result', chosen: 4, scores, showAll: false }), [2, 4]);
  assert.deepEqual(visibleOptionIds(ids, { kind: 'result', chosen: 3, scores, showAll: false }), [2, 3]);
  assert.deepEqual(visibleOptionIds(ids, { kind: 'result', chosen: 2, scores, showAll: false }), [2]);
  assert.deepEqual(visibleOptionIds(ids, { kind: 'result', chosen: 1, scores, showAll: true }), [1, 2, 3, 4]);
  // Une option absente du schéma n'est pas dessinée.
  assert.deepEqual(visibleOptionIds([1, 4], { kind: 'result', chosen: 4, scores, showAll: false }), [4]);
  assert.equal(describeState({ kind: 'result', chosen: 3, scores, showAll: true }), 'réponse C, tout afficher');
});

check('extrémité libre : la pastille coiffe le bout d’une course vers un point', () => {
  const diagram = parsed({
    view: 'half_right',
    players: [{ id: 'us7', team: 'us', number: 7, x: 70, y: 34, you: true }],
    options: [{ id: 1, kind: 'run', to: { x: 90, y: 34 } }],
  });
  const layout = layoutDiagram(diagram);
  const [shape] = layout.options;
  assert.ok(distance(shape.pastille, project(layout.frame, { x: 90, y: 34 })) < TOLERANCE);
  assert.ok(shape.stroke.cappedLine !== null, 'le trait doit s’arrêter sous la pastille, sans pointe');
  assert.deepEqual(placementFaults(diagram, layout), []);
});

check('extrémité prise par un joueur : la pastille recule le long du trait, pointe dessinée', () => {
  const diagram = parsed({
    view: 'half_right',
    players: [
      { id: 'us7', team: 'us', number: 7, x: 70, y: 34, you: true },
      { id: 'them4', team: 'them', number: 4, x: 90, y: 34 },
    ],
    options: [{ id: 1, kind: 'run', to: { x: 89, y: 34 } }],
  });
  const layout = layoutDiagram(diagram);
  const [shape] = layout.options;
  const start = project(layout.frame, { x: 70, y: 34 });
  const end = project(layout.frame, { x: 89, y: 34 });
  assert.ok(distanceToSegment(shape.pastille, start, end) < 0.01, 'la pastille doit rester sur le trait');
  assert.ok(distance(shape.pastille, end) > PASTILLE_OUTER, 'la pastille ne doit plus être au bout');
  assert.equal(shape.stroke.cappedLine, null);
  assert.ok(shape.stroke.head !== null);
  assert.deepEqual(placementFaults(diagram, layout), []);
});

check('passe vers un joueur : la pastille sur la passe, avant le receveur, sans couvrir la pointe', () => {
  const diagram = parsed({
    view: 'half_right',
    players: [
      { id: 'us8', team: 'us', number: 8, x: 60, y: 34, you: true, ball: true },
      { id: 'us9', team: 'us', number: 9, x: 90, y: 34 },
    ],
    options: [{ id: 1, kind: 'pass', to: 'us9' }],
  });
  const layout = layoutDiagram(diagram);
  const [shape] = layout.options;
  const passer = project(layout.frame, { x: 60, y: 34 });
  const receiver = project(layout.frame, { x: 90, y: 34 });
  assert.ok(distanceToSegment(shape.pastille, passer, receiver) < 0.01, 'la pastille doit rester sur la passe');
  assert.ok(distance(shape.pastille, receiver) < distance(shape.pastille, passer), 'la pastille doit être côté receveur');
  assert.ok(shape.stroke.head !== null);
  assert.ok(distance(shape.pastille, shape.stroke.head[0]) >= PASTILLE_OUTER, 'la pastille ne doit pas couvrir la pointe');
  assert.deepEqual(placementFaults(diagram, layout), []);
});

check('trait sans place libre : la pastille s’en écarte perpendiculairement', () => {
  // Course de 5 m (21 px) : tout le trait est trop près du halo de toi.
  const diagram = parsed({
    view: 'half_right',
    players: [{ id: 'us7', team: 'us', number: 7, x: 70, y: 34, you: true }],
    options: [{ id: 1, kind: 'run', to: { x: 75, y: 34 } }],
  });
  const layout = layoutDiagram(diagram);
  const [shape] = layout.options;
  const start = project(layout.frame, { x: 70, y: 34 });
  const end = project(layout.frame, { x: 75, y: 34 });
  assert.ok(distanceToSegment(shape.pastille, start, end) >= PASTILLE_OUTER, 'la pastille doit être à côté du trait');
  assert.equal(shape.stroke.cappedLine, null);
  assert.deepEqual(placementFaults(diagram, layout), []);
});

check('hold : pas de trait ; pastille accolée au halo du joueur, sans couvrir son numéro, du côté libre', () => {
  const diagram = parsed({
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
  });
  const layout = layoutDiagram(diagram);
  const [pass, hold] = layout.options;
  const you = diagram.players[0];
  const center = project(layout.frame, you);
  assert.deepEqual(hold.stroke, { line: [], head: null, cappedLine: null });
  // Bord à bord avec le halo, et le numéro (disque r 11) reste découvert.
  const gap = distance(hold.pastille, center) - outerRadius(you) - PASTILLE_OUTER;
  assert.ok(Math.abs(gap) < TOLERANCE, `la pastille touche le halo (écart ${gap.toFixed(2)} px)`);
  assert.ok(distance(hold.pastille, center) - PASTILLE_OUTER > PLAYER_RADIUS);
  // Du côté libre : loin de la passe A (2 px au moins de son trait).
  assert.ok(pass.stroke.line.length >= 2);
  assert.ok(distanceToSegment(hold.pastille, pass.stroke.line[0], pass.stroke.line[pass.stroke.line.length - 1]) >= PASTILLE_OUTER + 2 + PASTILLE_GAP);
  // Le ballon porté peut être touché, jamais recouvert.
  const [ball] = layout.balls;
  assert.ok(distance(hold.pastille, ball) >= BALL_OUTER + PASTILLE_OUTER - TOLERANCE);
  const scores: OptionScores = { 1: 3, 2: 2, 3: 0, 4: 0 };
  for (const state of allStates([1, 2], scores)) {
    assert.deepEqual(findOverlaps(diagram, layout, state), [], describeState(state));
  }
});

check('cotes : trait décalé du côté libre, étiquette calculée, rien ne se touche', () => {
  // Sprint : trajet au-dessus des plots, cote sous les plots (le côté libre).
  const diagram = parsed({
    view: 'local',
    width_m: 36,
    players: [],
    objects: [
      { type: 'cone', x: 3, y: 12 },
      { type: 'cone', x: 33, y: 12 },
    ],
    path: { points: [{ x: 3, y: 7 }, { x: 33, y: 7 }], style: 'run' },
    dimensions: [{ from: { x: 3, y: 12 }, to: { x: 33, y: 12 } }],
  });
  const layout = layoutDiagram(diagram);
  const [dimension] = layout.dimensions;
  const cones = project(layout.frame, { x: 3, y: 12 });
  assert.ok(dimension.line[0].y > cones.y, 'la cote passe sous les plots, loin du trajet');
  assert.equal(dimension.label.text, '30 m');
  assert.ok(dimension.label.at.y > dimension.line[0].y, 'l’étiquette est au-delà du trait de la cote');
  assert.equal(dimension.ticks.length, 2);
  assert.deepEqual(findOverlaps(diagram, layout, { kind: 'idle' }), []);
});

check('étiquettes : sous le plot si la place est libre, à côté si le trajet la croise', () => {
  // Trajet vertical qui part juste au-dessus du second plot et descend : dessous et dessus sont croisés.
  const diagram = parsed({
    view: 'local',
    width_m: 30,
    players: [],
    objects: [
      { type: 'cone', x: 10, y: 8, label: '10 m' },
      { type: 'cone', x: 20, y: 8, label: '20 m' },
    ],
    path: {
      points: [
        { x: 20, y: 7 },
        { x: 20, y: 14 },
      ],
      style: 'run',
    },
  });
  const layout = layoutDiagram(diagram);
  const [free, crossed] = layout.labels;
  const first = project(layout.frame, { x: 10, y: 8 });
  const second = project(layout.frame, { x: 20, y: 8 });
  assert.equal(free.anchor, 'middle');
  assert.ok(free.at.y > first.y, '« 10 m » doit rester sous son plot');
  assert.notEqual(crossed.anchor, 'middle', '« 20 m » doit passer à côté de son plot');
  assert.ok(Math.abs(crossed.at.x - second.x) > 0);
});

check('superpositions : un trait qui traverse un joueur, deux joueurs collés, signalés avec leur écart', () => {
  const diagram = parsed({
    view: 'zone',
    width_m: 40,
    center: { x: 80, y: 40 },
    players: [
      { id: 'us8', team: 'us', number: 8, x: 70, y: 40, you: true },
      { id: 'them4', team: 'them', number: 4, x: 80, y: 40 },
      { id: 'them5', team: 'them', number: 5, x: 82, y: 40 },
    ],
    options: [{ id: 1, kind: 'run', to: { x: 90, y: 40 } }],
  });
  const layout = layoutDiagram(diagram);
  const idle = findOverlaps(diagram, layout, { kind: 'idle' });
  assert.deepEqual(
    idle.map((overlap) => [overlap.first, overlap.second]),
    [['joueur them4', 'joueur them5']],
  );
  assert.ok(idle[0].shortfall > 0);
  const selected = findOverlaps(diagram, layout, { kind: 'selected', id: 1 });
  assert.ok(selected.some((overlap) => overlap.first === 'trait A' && overlap.second === 'joueur them4'));
  assert.ok(selected.some((overlap) => overlap.first === 'trait A' && overlap.second === 'joueur them5'));
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
