// Règles de contenu des schémas (chantier 16), vérifiées par les deux scripts de
// seed avant d'écrire le SQL, jamais par l'app à la lecture : une donnée ancienne
// en base ne casse aucun écran. Module pur, partagé par
// scripts/build-seed-questions.ts (schémas des questions, avec les scores de
// leurs options) et scripts/build-seed-sheets.ts (diagram_data des exercices),
// testé par scripts/diagram-rules.test.ts sur tout le contenu de supabase/content/.
//
// - Quiz (schéma avec options) : vue zone ; 6 à 9 joueurs ; destinations deux à
//   deux à 8 m au moins (destination : point visé, joueur visé, ou le joueur
//   lui-même pour un hold) ; deux options du même joueur écartées de 30° au
//   moins (hold exclu).
// - Test (vue local) : aucun joueur ; 2 cotes au plus (déjà dans le format).
// - Tous : aucune superposition, calculée par components/diagram-layout.ts
//   (findOverlaps) dans chaque état : repos, chaque sélection, chaque résultat,
//   tout afficher.
// Chaque violation est une phrase : « vue half_right ; … », « options A et B :
// destinations à 5,2 m ; 8 m au moins. », « état réponse C : pastille A et
// joueur them4, il manque 3,1 px. ».

import { allStates, describeState, findOverlaps, layoutDiagram } from '../components/diagram-layout';
import {
  formatMeters,
  optionLetter,
  type DiagramData,
  type DiagramOption,
  type OptionScores,
  type Point,
} from '../lib/diagram-types';

/** Joueurs d'un schéma de quiz. */
export const QUIZ_PLAYERS = { min: 6, max: 9 } as const;
/** Entre deux destinations d'options, en mètres. */
export const MIN_DESTINATION_GAP = 8;
/** Entre deux options du même joueur, en degrés. */
export const MIN_OPTION_ANGLE = 30;

/**
 * Violations des règles de contenu d'un schéma validé ; [] s'il les respecte
 * toutes. `scores` : ceux des options de la question d'un schéma de quiz (états
 * de résultat) ; null pour un exercice, sans réponse.
 */
export function checkDiagramRules(diagram: DiagramData, scores: OptionScores | null): string[] {
  const violations: string[] = [];
  if (diagram.options.length > 0) {
    violations.push(...quizRules(diagram));
  }
  if (diagram.view === 'local' && diagram.players.length > 0) {
    violations.push(
      `vue local : ${formatCount(diagram.players.length, 'joueur', 'joueurs')} ; un schéma de test n'a aucun joueur.`,
    );
  }
  const layout = layoutDiagram(diagram);
  const ids = diagram.options.map((option) => option.id);
  for (const state of allStates(ids, scores)) {
    for (const overlap of findOverlaps(diagram, layout, state)) {
      violations.push(
        `état ${describeState(state)} : ${overlap.first} et ${overlap.second}, il manque ${formatPixels(overlap.shortfall)} px.`,
      );
    }
  }
  return violations;
}

/** Vue zone, 6 à 9 joueurs, destinations écartées, directions distinctes. */
function quizRules(diagram: DiagramData): string[] {
  const violations: string[] = [];
  if (diagram.view !== 'zone') {
    violations.push(`vue ${diagram.view} ; un schéma de quiz est en vue zone.`);
  }
  const count = diagram.players.length;
  if (count < QUIZ_PLAYERS.min || count > QUIZ_PLAYERS.max) {
    violations.push(
      `${formatCount(count, 'joueur', 'joueurs')} ; un schéma de quiz en a de ${QUIZ_PLAYERS.min} à ${QUIZ_PLAYERS.max}.`,
    );
  }
  const players = new Map(diagram.players.map((player) => [player.id, player]));
  const options = [...diagram.options].sort((a, b) => a.id - b.id);
  const destinations = options.map((option) => ({ option, at: destinationOf(option, players) }));
  for (const [index, first] of destinations.entries()) {
    for (const second of destinations.slice(index + 1)) {
      if (first.at === null || second.at === null) {
        continue;
      }
      const gap = Math.hypot(second.at.x - first.at.x, second.at.y - first.at.y);
      if (gap < MIN_DESTINATION_GAP) {
        violations.push(
          `options ${optionLetter(first.option.id)} et ${optionLetter(second.option.id)} : destinations à ${formatMeters(gap)} m ; ${MIN_DESTINATION_GAP} m au moins.`,
        );
      }
    }
  }
  const directions = options.flatMap((option) => {
    const from = players.get(option.from);
    const heading = option.to === null || from === undefined ? null : directionOf(option, from);
    return heading === null ? [] : [{ option, heading }];
  });
  for (const [index, first] of directions.entries()) {
    for (const second of directions.slice(index + 1)) {
      if (first.option.from !== second.option.from) {
        continue;
      }
      const angle = angleBetween(first.heading, second.heading);
      if (angle < MIN_OPTION_ANGLE) {
        violations.push(
          `options ${optionLetter(first.option.id)} et ${optionLetter(second.option.id)} : directions à ${Math.round(angle)}° ; ${MIN_OPTION_ANGLE}° au moins.`,
        );
      }
    }
  }
  return violations;
}

/** Point visé, joueur visé, ou le joueur lui-même (hold) ; null si le joueur de départ manque. */
function destinationOf(option: DiagramOption, players: ReadonlyMap<string, Point>): Point | null {
  if (option.to !== null) {
    return { x: option.to.x, y: option.to.y };
  }
  return players.get(option.from) ?? null;
}

/** Direction de départ d'une option : vers son premier point de passage, sinon vers sa fin (degrés). */
function directionOf(option: DiagramOption, from: Point): number | null {
  const next = option.path[0] ?? option.to;
  if (next === null) {
    return null;
  }
  return (Math.atan2(next.y - from.y, next.x - from.x) * 180) / Math.PI;
}

/** Écart entre deux directions, de 0 à 180°. */
function angleBetween(first: number, second: number): number {
  const raw = Math.abs(first - second) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** « 3,1 » : un écart en pixels, au dixième. */
function formatPixels(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
}

/** « 1 joueur », « 3 joueurs » : 0 et 1 au singulier. */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`;
}
