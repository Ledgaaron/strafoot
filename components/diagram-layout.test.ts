// Tests de components/diagram-layout.ts, sans framework : npx tsx components/diagram-layout.test.ts
// Lit les schémas pilotes de supabase/content/diagrams_001.json : à lancer depuis
// la racine du projet, comme les scripts de seed.
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert et node:fs.
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseDiagram, type DiagramData, type Point } from '../lib/diagram-types';
import {
  BALL_OUTER,
  layoutDiagram,
  outerRadius,
  PASTILLE_GAP,
  PASTILLE_OUTER,
  project,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type DiagramLayout,
} from './diagram-layout';

const PILOTS_FILE = 'supabase/content/diagrams_001.json';
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

/** Schémas pilotes, validés comme par le seed. */
function readPilots(): { situation: string; diagram: DiagramData }[] {
  const text = readFileSync(PILOTS_FILE, 'utf8');
  // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
  const root: unknown = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const entries: readonly unknown[] = isRecord(root) && Array.isArray(root.diagrams) ? root.diagrams : [];
  return entries.map((entry) => {
    assert.ok(isRecord(entry) && typeof entry.situation === 'string', `${PILOTS_FILE} : entrée sans situation`);
    return { situation: entry.situation, diagram: parsed(entry.diagram) };
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
    const edge = Math.min(at.x, VIEW_WIDTH - at.x, at.y, VIEW_HEIGHT - at.y) - PASTILLE_OUTER;
    if (edge < -TOLERANCE) {
      faults.push(`${where} : pastille hors du cadre de ${(-edge).toFixed(1)} px`);
    }
    for (const player of diagram.players) {
      const center = layout.centers.get(player.id) ?? project(layout.frame, player);
      const gap = distance(at, center) - outerRadius(player) - PASTILLE_OUTER;
      if (gap < PASTILLE_GAP - TOLERANCE) {
        faults.push(`${where} : pastille à ${gap.toFixed(1)} px du joueur ${player.id}`);
      }
    }
    for (const ball of layout.balls) {
      const gap = distance(at, ball) - BALL_OUTER - PASTILLE_OUTER;
      if (gap < PASTILLE_GAP - TOLERANCE) {
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

check(`${PILOTS_FILE} : 3 schémas pilotes valides`, () => {
  assert.equal(pilots.length, 3);
});

pilots.forEach(({ situation, diagram }, index) => {
  const excerpt = situation.length > 40 ? `${situation.slice(0, 40)}…` : situation;
  check(`pilote ${index + 1} « ${excerpt} » : aucune pastille sur un joueur, le ballon ou une autre pastille`, () => {
    const layout = layoutDiagram(diagram);
    assert.deepEqual(
      layout.options.map((shape) => shape.option.id),
      diagram.options.map((option) => option.id).sort((a, b) => a - b),
    );
    assert.deepEqual(placementFaults(diagram, layout), []);
    // Mêmes données, mêmes places : aucun hasard, aucun état caché.
    assert.deepEqual(layoutDiagram(diagram), layout);
  });
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
  assert.ok(shape.cappedLine !== null, 'le trait doit s’arrêter sous la pastille, sans pointe');
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
  assert.equal(shape.cappedLine, null);
  assert.ok(shape.head !== null);
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
  assert.ok(shape.head !== null);
  assert.ok(distance(shape.pastille, shape.head[0]) >= PASTILLE_OUTER, 'la pastille ne doit pas couvrir la pointe');
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
  assert.equal(shape.cappedLine, null);
  assert.deepEqual(placementFaults(diagram, layout), []);
});

check('étiquettes : sous le plot si la place est libre, à côté si le trajet la croise', () => {
  // Trajet vertical qui part juste au-dessus du second plot et descend : dessous et dessus sont croisés.
  const diagram = parsed({
    view: 'local',
    width_m: 30,
    players: [],
    objects: [
      { type: 'cone', x: 10, y: 10, label: '10 m' },
      { type: 'cone', x: 20, y: 10, label: '20 m' },
    ],
    path: {
      points: [
        { x: 20, y: 9 },
        { x: 20, y: 20 },
      ],
      style: 'run',
    },
  });
  const layout = layoutDiagram(diagram);
  const [free, crossed] = layout.labels;
  const first = project(layout.frame, { x: 10, y: 10 });
  const second = project(layout.frame, { x: 20, y: 10 });
  assert.equal(free.anchor, 'middle');
  assert.ok(free.at.y > first.y, '« 10 m » doit rester sous son plot');
  assert.notEqual(crossed.anchor, 'middle', '« 20 m » doit passer à côté de son plot');
  assert.ok(Math.abs(crossed.at.x - second.x) > 0);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
