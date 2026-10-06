// Tests de lib/quiz-select.ts, sans framework : npx tsx lib/quiz-select.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { pickQuizQuestions, type QuizCandidate } from './quiz-select';

function unanswered(id: string): QuizCandidate {
  return { id, lastAnsweredAt: null, lastScore: null };
}

/** lastAnsweredAt au format renvoyé par Supabase : « 2026-10-06T21:30:00.123456+00:00 ». */
function answered(id: string, lastAnsweredAt: string, lastScore: number): QuizCandidate {
  return { id, lastAnsweredAt, lastScore };
}

function ids(questions: readonly QuizCandidate[]): string[] {
  return questions.map((question) => question.id);
}

/** rng déterministe : les valeurs données, dans [0, 1), l'une après l'autre et en boucle. */
function sequence(values: readonly number[]): () => number {
  let index = -1;
  return () => {
    index += 1;
    return values[index % values.length];
  };
}

// Le tirage ne départage que les questions à égalité : hors égalité, l'ordre
// attendu doit sortir avec un tirage croissant, décroissant comme constant.
const DRAW_SEQUENCES: readonly (readonly number[])[] = [
  [0, 0.2, 0.4, 0.6, 0.8],
  [0.8, 0.6, 0.4, 0.2, 0],
  [0.5],
];

/** Ids choisis, une liste par suite de DRAW_SEQUENCES. */
function pickWithEachDraw(candidates: readonly QuizCandidate[], n: number): string[][] {
  return DRAW_SEQUENCES.map((draws) => ids(pickQuizQuestions(candidates, n, sequence(draws))));
}

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

check('jamais répondues d’abord, même face à un score faible ou à une réponse très ancienne', () => {
  const candidates = [
    answered('faible-recente', '2026-10-06T21:30:00.123456+00:00', 0),
    answered('forte-tres-ancienne', '2019-03-01T09:00:00+00:00', 3),
    answered('faible-tres-ancienne', '2018-01-01T08:00:00.5+00:00', 0),
    unanswered('jamais-1'),
    unanswered('jamais-2'),
  ];
  for (const picked of pickWithEachDraw(candidates, 5)) {
    // Les deux jamais répondues sont à égalité : leur ordre relève du tirage.
    assert.deepEqual(picked.slice(0, 2).sort(), ['jamais-1', 'jamais-2']);
    assert.deepEqual(picked.slice(2), ['faible-tres-ancienne', 'faible-recente', 'forte-tres-ancienne']);
  }
});

check('puis dernier score ≤ 1 avant ≥ 2, même quand la réponse faible est plus récente', () => {
  const candidates = [
    answered('forte-3', '2025-11-02T07:15:00.5+00:00', 3),
    answered('forte-2', '2026-03-01T12:00:00+00:00', 2),
    answered('faible-1', '2026-10-06T21:30:00.123456+00:00', 1),
    answered('faible-0', '2026-10-01T18:45:10.25+00:00', 0),
  ];
  for (const picked of pickWithEachDraw(candidates, 4)) {
    assert.deepEqual(picked, ['faible-0', 'faible-1', 'forte-3', 'forte-2']);
  }
});

// Dans un même groupe, le score ne départage pas : seule compte l'ancienneté.
check('puis dernières réponses les plus anciennes d’abord, groupe score ≥ 2', () => {
  const candidates = [
    answered('score-2-mai', '2026-05-01T10:00:00.25+00:00', 2),
    answered('score-3-sept', '2026-09-30T20:00:00+00:00', 3),
    answered('score-3-fevr', '2026-02-01T08:30:00.123456+00:00', 3),
    answered('score-2-aout', '2026-08-01T12:00:00+00:00', 2),
  ];
  for (const picked of pickWithEachDraw(candidates, 4)) {
    assert.deepEqual(picked, ['score-3-fevr', 'score-2-mai', 'score-2-aout', 'score-3-sept']);
  }
});

check('puis dernières réponses les plus anciennes d’abord, groupe score ≤ 1', () => {
  const candidates = [
    answered('score-0-juil', '2026-07-01T19:00:00.5+00:00', 0),
    answered('score-1-mars', '2026-03-01T09:15:00+00:00', 1),
    answered('score-0-oct', '2026-10-06T21:30:00.123456+00:00', 0),
    answered('score-1-juin', '2026-06-01T18:00:00.75+00:00', 1),
  ];
  for (const picked of pickWithEachDraw(candidates, 4)) {
    assert.deepEqual(picked, ['score-1-mars', 'score-1-juin', 'score-0-juil', 'score-0-oct']);
  }
});

check('frontière : score 1 prioritaire, score 2 non', () => {
  const candidates = [
    answered('score-2', '2026-01-01T10:00:00+00:00', 2),
    answered('score-1', '2026-10-06T21:30:00.123456+00:00', 1),
  ];
  for (const picked of pickWithEachDraw(candidates, 2)) {
    // Si 1 et 2 tombaient dans le même groupe, score-2, plus ancienne, passerait devant.
    assert.deepEqual(picked, ['score-1', 'score-2']);
  }
});

check('égalité entre jamais répondues : l’ordre suit le tirage', () => {
  const candidates = ['jamais-1', 'jamais-2', 'jamais-3', 'jamais-4'].map((id) => unanswered(id));
  const rising = [0.1, 0.3, 0.5, 0.7];
  const falling = [0.7, 0.5, 0.3, 0.1];
  const picked = ids(pickQuizQuestions(candidates, 4, sequence(rising)));
  // Même suite, même ordre : la série est reproductible.
  assert.deepEqual(ids(pickQuizQuestions(candidates, 4, sequence(rising))), picked);
  // Autre suite, autre ordre, mêmes questions.
  const reshuffled = ids(pickQuizQuestions(candidates, 4, sequence(falling)));
  assert.notDeepEqual(reshuffled, picked);
  assert.deepEqual([...picked].sort(), ['jamais-1', 'jamais-2', 'jamais-3', 'jamais-4']);
  assert.deepEqual([...reshuffled].sort(), ['jamais-1', 'jamais-2', 'jamais-3', 'jamais-4']);
});

check('pas de doublon : une question présente deux fois en entrée ne sort qu’une fois', () => {
  const unseen = unanswered('jamais');
  const a = answered('a', '2026-09-01T10:00:00+00:00', 3);
  const b = answered('b', '2026-09-02T10:00:00+00:00', 3);
  const c = answered('c', '2026-09-03T10:00:00+00:00', 3);
  // Même objet répété, et copies distinctes de même id : le doublon se repère à l'id.
  // n = 4 questions distinctes : un doublon qui prendrait une place évincerait c.
  const candidates = [a, unseen, a, b, { ...unseen }, { ...a }, c, b];
  for (const picked of pickWithEachDraw(candidates, 4)) {
    assert.deepEqual(picked, ['jamais', 'a', 'b', 'c']);
  }
});

check('moins de n candidates : toutes, dans l’ordre de priorité', () => {
  const candidates = [
    answered('forte', '2026-09-01T10:00:00+00:00', 3),
    unanswered('jamais'),
    answered('faible', '2026-10-06T21:30:00.123456+00:00', 1),
  ];
  for (const picked of pickWithEachDraw(candidates, 10)) {
    assert.deepEqual(picked, ['jamais', 'faible', 'forte']);
  }
});

check('plus de n candidates : les n plus prioritaires, dans l’ordre', () => {
  const candidates = [
    answered('forte-ancienne', '2025-12-01T10:00:00+00:00', 2),
    answered('faible-recente', '2026-10-06T21:30:00.123456+00:00', 0),
    unanswered('jamais'),
    answered('forte-recente', '2026-10-05T10:00:00+00:00', 3),
    answered('faible-ancienne', '2026-06-01T10:00:00+00:00', 1),
  ];
  for (const picked of pickWithEachDraw(candidates, 3)) {
    assert.deepEqual(picked, ['jamais', 'faible-ancienne', 'faible-recente']);
  }
});

check('aucune candidate : liste vide', () => {
  const none: QuizCandidate[] = [];
  assert.deepEqual(pickQuizQuestions(none, 10, sequence([0.5])), []);
});

check('n = 0 (ou négatif) : liste vide', () => {
  const candidates = [unanswered('jamais'), answered('faible', '2026-10-06T21:30:00.123456+00:00', 0)];
  assert.deepEqual(pickQuizQuestions(candidates, 0, sequence([0.5])), []);
  assert.deepEqual(pickQuizQuestions(candidates, -1, sequence([0.5])), []);
});

// Supabase écrit un timestamptz avec 0 à 6 chiffres après la virgule (zéros de
// fin retirés) et le décalage du fuseau de la base.
check('instants Supabase : fraction à 6, 2 ou 1 chiffre, ou absente', () => {
  // .2 vaut 200 ms et .15 vaut 150 ms : lus comme 2 et 15 ms, l'ordre serait faux.
  const candidates = [
    answered('un-chiffre', '2026-10-06T21:30:00.2+00:00', 3),
    answered('six-chiffres', '2026-10-06T21:30:00.123456+00:00', 3),
    answered('sans-fraction', '2026-10-06T21:30:00+00:00', 3),
    answered('deux-chiffres', '2026-10-06T21:30:00.15+00:00', 3),
    answered('seconde-precedente', '2026-10-06T21:29:59.999999+00:00', 3),
  ];
  for (const picked of pickWithEachDraw(candidates, 5)) {
    assert.deepEqual(picked, ['seconde-precedente', 'sans-fraction', 'six-chiffres', 'deux-chiffres', 'un-chiffre']);
  }
});

check('instants Supabase : décalages horaires autres que +00:00', () => {
  // En UTC, à 1 ms d'écart : 21:29:59.999, 21:30:00.000, .001 puis .002. L'heure
  // écrite suit l'ordre inverse : comparer les textes ou ignorer le décalage
  // renverserait la série.
  const candidates = [
    answered('utc', '2026-10-06T21:30:00.001234+00:00', 3),
    answered('moins-4h', '2026-10-06T17:30:00.002-04:00', 3),
    answered('plus-9h', '2026-10-07T06:29:59.999999+09:00', 3),
    answered('plus-2h', '2026-10-06T23:30:00+02:00', 3),
  ];
  for (const picked of pickWithEachDraw(candidates, 4)) {
    assert.deepEqual(picked, ['plus-9h', 'plus-2h', 'utc', 'moins-4h']);
  }
});

// Un instant illisible est une erreur de programmation : exception, jamais un classement faux.
check('instant illisible : exception', () => {
  const valid = answered('valide', '2026-10-06T21:30:00.123456+00:00', 2);
  assert.throws(
    () => pickQuizQuestions([valid, answered('texte', 'hier soir', 1)], 10, sequence([0.5])),
    /Instant invalide/,
  );
  assert.throws(() => pickQuizQuestions([answered('vide', '', 3), valid], 10, sequence([0.5])), /Instant invalide/);
});

/** Question telle que l'écran la passe : les champs du tri, plus les siens. */
type ScreenQuestion = QuizCandidate & { situation: string; theme: string };

check('renvoie les objets reçus, champs en plus conservés, sans modifier l’entrée', () => {
  const recent: ScreenQuestion = {
    id: 'recente',
    lastAnsweredAt: '2026-10-06T21:30:00.123456+00:00',
    lastScore: 3,
    situation: 'Contre-attaque à 3 contre 2, ballon dans l’axe.',
    theme: 'tactique',
  };
  const old: ScreenQuestion = {
    id: 'ancienne',
    lastAnsweredAt: '2026-09-01T10:00:00+00:00',
    lastScore: 2,
    situation: 'Penalty à tirer à la dernière minute.',
    theme: 'mental',
  };
  const candidates = [recent, old];
  // Le type reçu est le type rendu, sans conversion : vérifié par tsc.
  const picked: ScreenQuestion[] = pickQuizQuestions(candidates, 2, sequence([0.5]));
  // Mêmes objets, pas des copies.
  assert.equal(picked[0], old);
  assert.equal(picked[1], recent);
  assert.equal(picked[0].theme, 'mental');
  // L'entrée garde son ordre : la liste de l'écran peut resservir pour la série suivante.
  assert.deepEqual(ids(candidates), ['recente', 'ancienne']);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
