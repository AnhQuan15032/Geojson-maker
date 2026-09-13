/**
 * Static consistency checks for the browser code (no DOM needed):
 *
 *   1. every relative import resolves to a real file
 *   2. every named import is actually exported by that file
 *   3. every `$('#some-id')` / getElementById used in JS exists in index.html
 *   4. every `data-*` hook queried in JS exists in index.html
 *   5. no leftover references to removed features (presets / AI / demo shapes)
 *
 * Run with:  node scripts/syntax-check.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

const sources = walk(join(root, 'src'));
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* ---------------------------------------------------------- exported names */

function exportedNames(file) {
  const code = readFileSync(file, 'utf8');
  const names = new Set();

  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) names.add(m[1]);
  }
  // export { a, b as c }
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      const as = bit.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/export\s+default/.test(code)) names.add('default');
  if (/export\s*\*/.test(code)) names.add('*');
  return names;
}

const exportCache = new Map();
function exportsOf(file) {
  if (!exportCache.has(file)) exportCache.set(file, exportedNames(file));
  return exportCache.get(file);
}

/* ------------------------------------------------------------- import check */

for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);

  for (const m of code.matchAll(/import\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1];
    const spec = m[2];
    if (!spec.startsWith('.')) {
      problems.push(`${rel}: bare import "${spec}" — this project has no dependencies`);
      continue;
    }
    const target = resolve(dirname(file), spec);
    if (!existsSync(target)) {
      problems.push(`${rel}: cannot resolve "${spec}"`);
      continue;
    }
    const named = clause.match(/\{([^}]*)\}/);
    if (!named) continue;
    const available = exportsOf(target);
    if (available.has('*')) continue;
    for (const part of named[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!available.has(name)) {
        problems.push(`${rel}: "${name}" is not exported by ${spec}`);
      }
    }
  }
}

/* --------------------------------------------------------- DOM id references */

const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const htmlDataAttrs = new Set([...html.matchAll(/\s(data-[a-z-]+)="([^"]*)"/g)].map((m) => `${m[1]}="${m[2]}"`));
const htmlClasses = new Set([...html.matchAll(/\sclass="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/).filter(Boolean)));

const idRefs = new Map();
for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  const selectors = [];

  for (const m of code.matchAll(/\$\(\s*'#([A-Za-z0-9_-]+)'\s*\)/g)) selectors.push({ kind: 'id', value: m[1] });
  for (const m of code.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) selectors.push({ kind: 'id', value: m[1] });
  for (const m of code.matchAll(/\$\$\(\s*'\.([A-Za-z0-9_-]+)'\s*\)/g)) selectors.push({ kind: 'class', value: m[1] });
  for (const m of code.matchAll(/\$\(\s*'\.([A-Za-z0-9_-]+)'\s*\)/g)) selectors.push({ kind: 'class', value: m[1] });

  for (const s of selectors) {
    if (s.kind === 'id' && !htmlIds.has(s.value)) {
      problems.push(`${rel}: #${s.value} does not exist in index.html`);
    }
    if (s.kind === 'class' && !htmlClasses.has(s.value)) {
      notes.push(`${rel}: .${s.value} is queried but never present in the initial HTML (created at runtime?)`);
    }
    idRefs.set(s.value, (idRefs.get(s.value) || 0) + 1);
  }
}

/* attribute-selector hooks such as $('.panel[data-panel="data"]') */
for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const m of code.matchAll(/\[([a-z-]+)="([^"]+)"\]/g)) {
    if (!htmlDataAttrs.has(`${m[1]}="${m[2]}"`) && !html.includes(`${m[1]}="${m[2]}"`)) {
      problems.push(`${rel}: [${m[1]}="${m[2]}"] is queried but absent from index.html`);
    }
  }
}

/* ------------------------------------------------- radio input name/value */

for (const file of sources) {
  const code = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const m of code.matchAll(/name=([A-Za-z]+)/g)) {
    if (!html.includes(`name="${m[1]}"`)) problems.push(`${rel}: radio group name="${m[1]}" missing from index.html`);
  }
}

/* --------------------------------------------------- removed-feature audit */

const banned = [
  [/\bpreset/i, 'presets were removed'],
  [/\b(AI|GPT|LLM|openai|anthropic|claude|gemini|copilot|auto-?generate|magic|smart-fill)\b/i, 'AI features were removed'],
  [/\b(demo|sample|example)\s+(shape|feature|polygon)/i, 'no starting shape'],
];
const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.startsWith('<!--');
};

for (const file of [...sources, join(root, 'index.html')]) {
  const code = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const [re, why] of banned) {
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (isComment(line)) return;      // documentation about the removal is fine
      if (re.test(line)) problems.push(`${rel}:${i + 1}: "${line.trim().slice(0, 90)}" — ${why}`);
    });
  }
}

/* ------------------------------------------------------------------ report */

if (notes.length) {
  console.log('\nnotes:');
  for (const n of notes) console.log(`  · ${n}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n✓ ${sources.length} modules, ${htmlIds.size} DOM ids, imports/exports/selectors all consistent\n`);
