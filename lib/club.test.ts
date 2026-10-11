// Tests de lib/club.ts, sans framework : npx tsx lib/club.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { isClubPlannedDay, proposeClubSession, usualClubWeekdays, type ClubSessionSource } from './club';

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

// Mardi 13 octobre 2026 : J-7 mardi 6, J-14 mardi 29 septembre.
const TODAY = '2026-10-13';

function club(date: string, name: string | null = 'Entraînement U19', durationMin = 90, createdAt?: string): ClubSessionSource {
  return {
    date,
    module: 'entrainement_club',
    name,
    duration_min: durationMin,
    created_at: createdAt ?? `${date}T19:00:00.000000+00:00`,
  };
}

check('proposeClubSession : club à J-7, nom et durée repris', () => {
  assert.deepEqual(proposeClubSession([club('2026-10-06', 'Entraînement U19', 100)], TODAY, null), {
    name: 'Entraînement U19',
    durationMin: 100,
  });
});

check('proposeClubSession : club à J-14 seulement', () => {
  assert.deepEqual(proposeClubSession([club('2026-09-29', 'Séance club', 75)], TODAY, null), {
    name: 'Séance club',
    durationMin: 75,
  });
});

check('proposeClubSession : J-7 l’emporte sur J-14', () => {
  const proposal = proposeClubSession([club('2026-09-29', 'Ancien', 60), club('2026-10-06', 'Récent', 90)], TODAY, null);
  assert.deepEqual(proposal, { name: 'Récent', durationMin: 90 });
});

check('proposeClubSession : deux le même jour, la plus récemment enregistrée', () => {
  const proposal = proposeClubSession(
    [
      club('2026-10-06', 'Premier', 60, '2026-10-06T17:00:00.000000+00:00'),
      club('2026-10-06', 'Second', 80, '2026-10-06T20:00:00.000000+00:00'),
    ],
    TODAY,
    null,
  );
  assert.deepEqual(proposal, { name: 'Second', durationMin: 80 });
});

check('proposeClubSession : nom automatique refait pour aujourd’hui', () => {
  const proposal = proposeClubSession([club('2026-10-06', 'Entraînement club — mar. 6 oct.')], TODAY, null);
  assert.deepEqual(proposal, { name: 'Entraînement club — mar. 13 oct.', durationMin: 90 });
  const unnamed = proposeClubSession([club('2026-10-06', null)], TODAY, null);
  assert.equal(unnamed?.name, 'Entraînement club — mar. 13 oct.');
});

check('proposeClubSession : autre jour de la semaine, rien', () => {
  assert.equal(proposeClubSession([club('2026-10-07'), club('2026-10-12'), club('2026-09-22')], TODAY, null), null);
});

check('proposeClubSession : club déjà enregistré aujourd’hui, rien', () => {
  assert.equal(proposeClubSession([club('2026-10-06'), club(TODAY)], TODAY, null), null);
});

check('proposeClubSession : « Pas ce soir » le jour même, rien ; la veille, sans effet', () => {
  assert.equal(proposeClubSession([club('2026-10-06')], TODAY, TODAY), null);
  assert.notEqual(proposeClubSession([club('2026-10-06')], TODAY, '2026-10-12'), null);
});

check('proposeClubSession : seules les séances club comptent', () => {
  const free: ClubSessionSource = { ...club('2026-10-06'), module: 'seance_libre' };
  assert.equal(proposeClubSession([free], TODAY, null), null);
  // Une séance libre aujourd'hui n'empêche pas la proposition.
  assert.notEqual(proposeClubSession([club('2026-10-06'), { ...club(TODAY), module: 'seance_libre' }], TODAY, null), null);
});

check('usualClubWeekdays : jours de la semaine des 14 derniers jours, aujourd’hui compris', () => {
  const weekdays = usualClubWeekdays(
    [
      club('2026-09-28'), // lundi, J-15 : hors fenêtre
      club('2026-09-29'), // mardi, J-14
      club('2026-10-08'), // jeudi
      club(TODAY), // mardi
      { ...club('2026-10-10'), module: 'seance_libre' }, // samedi, pas un club
    ],
    TODAY,
  );
  assert.deepEqual([...weekdays].sort(), [2, 4]);
});

check('isClubPlannedDay : jours à venir habituels, de demain à J+14', () => {
  const weekdays = new Set([2, 4]);
  assert.equal(isClubPlannedDay('2026-10-15', TODAY, weekdays), true); // jeudi
  assert.equal(isClubPlannedDay('2026-10-20', TODAY, weekdays), true); // mardi J+7
  assert.equal(isClubPlannedDay('2026-10-27', TODAY, weekdays), true); // mardi J+14
  assert.equal(isClubPlannedDay('2026-10-29', TODAY, weekdays), false); // jeudi J+16
  assert.equal(isClubPlannedDay(TODAY, TODAY, weekdays), false); // aujourd'hui : la carte le propose
  assert.equal(isClubPlannedDay('2026-10-08', TODAY, weekdays), false); // passé
  assert.equal(isClubPlannedDay('2026-10-16', TODAY, weekdays), false); // vendredi
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
