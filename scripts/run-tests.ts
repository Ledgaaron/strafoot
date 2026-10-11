// Lance tous les fichiers de tests du projet (*.test.ts sous lib/, components/ et
// scripts/), chacun dans son propre processus, comme npx tsx <fichier> : tests
// purs, sans framework, qui finissent en code 1 au moindre cas en échec. Tous
// sont lancés, même après un échec ; le script finit alors en code 1. Un fichier
// de tests ajouté est pris d'office, sans liste à tenir.
//
// Usage, depuis la racine du projet (les tests lisent des chemins relatifs) :
//   npm run test        (ou npx tsx scripts/run-tests.ts)
//   npm run check       (tsc, puis ce script : build Vercel)
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:*.
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS: readonly string[] = ['lib', 'components', 'scripts'];
const TEST_FILE = /\.test\.ts$/;

/** Fichiers de tests sous `dir`, dans l'ordre alphabétique, sous-dossiers compris. */
function findTests(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...findTests(full));
    } else if (TEST_FILE.test(name)) {
      files.push(full);
    }
  }
  return files;
}

function main(): void {
  const files = ROOTS.filter((root) => statSync(root, { throwIfNoEntry: false })?.isDirectory()).flatMap(findTests);
  if (files.length === 0) {
    console.error(`Aucun fichier *.test.ts sous ${ROOTS.join(', ')} (lancer depuis la racine du projet).`);
    process.exitCode = 1;
    return;
  }
  const failed: string[] = [];
  for (const file of files) {
    const shown = file.split(path.sep).join('/');
    console.log(`\n▶ ${shown}`);
    // Comme npx tsx <fichier>, sans npx : le même node, avec le chargeur de tsx.
    const result = spawnSync(process.execPath, ['--import', 'tsx', file], { stdio: 'inherit' });
    if (result.error) {
      console.error(`${shown} : lancement impossible (${result.error.message}).`);
    }
    if (result.status !== 0) {
      failed.push(shown);
    }
  }
  const total = `${files.length} fichier${files.length > 1 ? 's' : ''} de tests`;
  if (failed.length > 0) {
    console.error(`\n${total}, ${failed.length} en échec : ${failed.join(', ')}.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${total}, tous passent.`);
  }
}

main();
