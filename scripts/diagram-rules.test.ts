// Tests de scripts/diagram-rules.ts, sans framework : npx tsx scripts/diagram-rules.test.ts
// Applique les règles de contenu à tout supabase/content/ (schémas des questions
// avec les scores de leurs options, diagram_data des tests et des fiches) : à
// lancer depuis la racine du projet, comme les scripts de seed.
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert et node:fs.
/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { parseDiagram, type DiagramData, type OptionScores } from '../lib/diagram-types';
import { checkDiagramRules } from './diagram-rules';

const CONTENT_DIR = 'supabase/content';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(name: string): unknown {
  const text = readFileSync(`${CONTENT_DIR}/${name}`, 'utf8');
  // BOM retiré : un éditeur Windows peut en ajouter un, et JSON.parse le refuse.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Tableau `key` de la racine d'un fichier de contenu. */
function rootList(name: string, key: string): readonly unknown[] {
  const root = readJson(name);
  return isRecord(root) && Array.isArray(root[key]) ? root[key] : [];
}

/** Schéma validé ; le cas échoue avec l'erreur de validation sinon. */
function parsed(value: unknown, where: string): DiagramData {
  const result = parseDiagram(value);
  assert.equal(result.error, null, `${where} : ${result.error}`);
  assert.ok(result.data !== null);
  return result.data;
}

/** Scores des 4 options d'une question, par rang (1 à 4). */
function scoresOf(question: Record<string, unknown>): OptionScores {
  const options = Array.isArray(question.options) ? question.options : [];
  const score = (index: number): 0 | 1 | 2 | 3 => {
    const item: unknown = options[index];
    const value = isRecord(item) ? item.score : undefined;
    assert.ok(value === 0 || value === 1 || value === 2 || value === 3, `score invalide : ${String(value)}`);
    return value;
  };
  return { 1: score(0), 2: score(1), 3: score(2), 4: score(3) };
}

/** Un schéma de contenu et ce qu'il faut pour le vérifier. */
type ContentDiagram = { where: string; diagram: DiagramData; scores: OptionScores | null };

/** Schémas des questions (diagrams_NNN.json, scores de questions_NNN.json) et diagram_data des exercices. */
function readContent(): ContentDiagram[] {
  const names = readdirSync(CONTENT_DIR).sort();
  const items: ContentDiagram[] = [];
  for (const name of names) {
    const diagramsMatch = /^diagrams_(\d{3})\.json$/.exec(name);
    if (diagramsMatch) {
      const questions = rootList(`questions_${diagramsMatch[1]}.json`, 'questions').filter(isRecord);
      for (const [index, entry] of rootList(name, 'diagrams').entries()) {
        assert.ok(isRecord(entry) && typeof entry.situation === 'string', `${name} : entrée ${index + 1} sans situation`);
        const question = questions.find((candidate) => candidate.situation === entry.situation);
        assert.ok(question !== undefined, `${name} : situation inconnue « ${entry.situation} »`);
        const where = `${name}, schéma ${index + 1}`;
        items.push({ where, diagram: parsed(entry.diagram, where), scores: scoresOf(question) });
      }
      continue;
    }
    if (/^(tests_atomic|sheets)_\d{3}\.json$/.test(name)) {
      const key = name.startsWith('tests_') ? 'tests' : 'sheets';
      for (const [index, sheet] of rootList(name, key).entries()) {
        const exercises = isRecord(sheet) && Array.isArray(sheet.exercises) ? sheet.exercises : [];
        for (const [order, exercise] of exercises.entries()) {
          if (isRecord(exercise) && exercise.diagram_data !== undefined) {
            const slug = isRecord(sheet) && typeof sheet.slug === 'string' ? sheet.slug : String(index + 1);
            const where = `${name}, ${slug}, exercice ${order + 1}`;
            items.push({ where, diagram: parsed(exercise.diagram_data, where), scores: null });
          }
        }
      }
    }
  }
  return items;
}

/** Schéma de quiz qui respecte toutes les règles : chaque cas le modifie en un seul point. */
function quizDiagram(): Record<string, unknown> {
  return {
    view: 'zone',
    width_m: 40,
    center: { x: 80, y: 40 },
    players: [
      { id: 'us8', team: 'us', number: 8, x: 70, y: 40, you: true, ball: true },
      { id: 'us9', team: 'us', number: 9, x: 90, y: 30 },
      { id: 'us7', team: 'us', number: 7, x: 82, y: 54 },
      { id: 'them4', team: 'them', number: 4, x: 78, y: 32 },
      { id: 'them5', team: 'them', number: 5, x: 80, y: 48 },
      { id: 'them6', team: 'them', number: 6, x: 66, y: 46 },
    ],
    options: [
      { id: 1, kind: 'pass', to: 'us9' },
      { id: 2, kind: 'dribble', to: { x: 84, y: 44 } },
      { id: 3, kind: 'pass', to: 'us7' },
      { id: 4, kind: 'hold' },
    ],
  };
}

const QUIZ_SCORES: OptionScores = { 1: 3, 2: 2, 3: 1, 4: 0 };

const content = readContent();

check(`${CONTENT_DIR} : au moins un schéma de question et un schéma de test`, () => {
  assert.ok(content.some((item) => item.scores !== null));
  assert.ok(content.some((item) => item.scores === null && item.diagram.view === 'local'));
});

for (const item of content) {
  check(`${item.where} : respecte les règles de contenu dans tous ses états`, () => {
    assert.deepEqual(checkDiagramRules(item.diagram, item.scores), []);
  });
}

check('schéma de quiz conforme : aucune violation', () => {
  assert.deepEqual(checkDiagramRules(parsed(quizDiagram(), 'quiz'), QUIZ_SCORES), []);
});

check('quiz hors de la vue zone : signalé', () => {
  const diagram = quizDiagram();
  diagram.view = 'half_right';
  delete diagram.width_m;
  delete diagram.center;
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  assert.ok(violations.some((message) => message.startsWith('vue half_right')), violations.join('\n'));
});

check('quiz à 5 joueurs : signalé, avec le nombre', () => {
  const diagram = quizDiagram();
  diagram.players = (diagram.players as unknown[]).slice(0, 5);
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  assert.ok(violations.some((message) => message.startsWith('5 joueurs ;')), violations.join('\n'));
});

check('destinations à moins de 8 m : signalées, options en lettres et distance en mètres', () => {
  const diagram = quizDiagram();
  // B vise un point à 2,5 m de us9, la cible de A.
  diagram.options = [
    { id: 1, kind: 'pass', to: 'us9' },
    { id: 2, kind: 'run', to: { x: 88, y: 28.5 } },
  ];
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  assert.ok(violations.some((message) => message.startsWith('options A et B : destinations à 2,5 m ; 8 m au moins.')), violations.join('\n'));
});

check('deux options du même joueur à moins de 30° : signalées ; un hold n’a pas de direction', () => {
  const diagram = quizDiagram();
  diagram.options = [
    { id: 1, kind: 'run', to: { x: 90, y: 40 } },
    { id: 2, kind: 'run', to: { x: 90, y: 44 } },
    { id: 3, kind: 'hold' },
  ];
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  assert.ok(violations.some((message) => /^options A et B : directions à 1[0-2]° ; 30° au moins\.$/.test(message)), violations.join('\n'));
  assert.ok(!violations.some((message) => message.includes('C : directions')), violations.join('\n'));
});

check('test en vue local avec un joueur : signalé', () => {
  const diagram = parsed(
    { view: 'local', width_m: 30, players: [{ id: 'joueur', team: 'us', x: 2, y: 7 }], path: { points: [{ x: 2, y: 7 }, { x: 28, y: 7 }], style: 'run' } },
    'test',
  );
  const violations = checkDiagramRules(diagram, null);
  assert.ok(violations.some((message) => message.startsWith('vue local : 1 joueur ;')), violations.join('\n'));
});

check('superposition : deux joueurs qui se touchent, signalés avec l’état et l’écart en px', () => {
  const diagram = quizDiagram();
  // them4 à 1 m de us8 (8 px environ) : son anneau entre dans le halo de toi.
  (diagram.players as Record<string, unknown>[])[3] = { id: 'them4', team: 'them', number: 4, x: 71, y: 40 };
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  assert.ok(
    violations.some((message) => /^état repos : joueur us8 et joueur them4, il manque \d+,\d px\.$/.test(message)),
    violations.join('\n'),
  );
});

check('superposition selon l’état : un trait qui traverse un joueur n’est signalé que quand il est dessiné', () => {
  const diagram = quizDiagram();
  // A traverse them4 (78 ; 32), sur le chemin de us8 (70 ; 40) vers (86 ; 26).
  diagram.options = [
    { id: 1, kind: 'run', to: { x: 86, y: 26 } },
    { id: 2, kind: 'hold' },
  ];
  const violations = checkDiagramRules(parsed(diagram, 'quiz'), QUIZ_SCORES);
  const crossing = violations.filter((message) => message.includes('trait A et joueur them4'));
  assert.ok(crossing.length > 0, violations.join('\n'));
  assert.ok(crossing.every((message) => !message.startsWith('état repos') && !message.startsWith('état sélection B')));
  assert.ok(crossing.some((message) => message.startsWith('état sélection A')));
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
