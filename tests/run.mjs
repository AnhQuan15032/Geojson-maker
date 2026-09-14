/** Runs every check: static consistency, logic tests, then the app smoke tests. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['static checks', 'scripts/syntax-check.mjs'],
  ['logic tests', 'tests/logic.test.mjs'],
  ['coastline tests', 'tests/land.test.mjs'],
  ['app tests', 'tests/app.test.mjs'],
];

let failed = 0;
for (const [label, script] of steps) {
  console.log(`\n── ${label} ──────────────────────────────`);
  const result = spawnSync(process.execPath, [resolve(root, script)], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) failed++;
}

console.log(failed
  ? `\n✗ ${failed} of ${steps.length} suites failed\n`
  : `\n✓ all ${steps.length} suites passed\n`);
process.exit(failed ? 1 : 0);
