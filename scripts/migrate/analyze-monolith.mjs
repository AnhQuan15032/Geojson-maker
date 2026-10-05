// Analyze the monolithic engine script: top-level bindings, duplicates,
// sections, and which top-level names each top-level declaration references.
import fs from 'node:fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = _traverse.default || _traverse;

const code = fs.readFileSync('.migrate/engine.js', 'utf8');
const ast = parse(code, { sourceType: 'script' });

// ---- section banners -----------------------------------------------------
const sections = [];
for (const m of code.matchAll(/^ *\/\/ ={5,}\s*(.+?)\s*=*$/gm)) {
  sections.push({ line: code.slice(0, m.index).split('\n').length, name: m[1] });
}
const sectionAt = (line) => {
  let cur = '(preamble)';
  for (const s of sections) if (s.line <= line) cur = s.name;
  return cur;
};

// ---- top-level bindings --------------------------------------------------
const decls = [];
for (const node of ast.program.body) {
  if (t.isFunctionDeclaration(node) && node.id) {
    decls.push({ name: node.id.name, kind: 'function', node, line: node.loc.start.line, endLine: node.loc.end.line, section: sectionAt(node.loc.start.line) });
  } else if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) {
      if (!t.isIdentifier(d.id)) continue;
      decls.push({ name: d.id.name, kind: node.kind, node, declarator: d, line: d.loc.start.line, endLine: d.loc.end.line, section: sectionAt(d.loc.start.line) });
    }
  } else if (!t.isExpressionStatement(node)) {
    console.log('OTHER top-level node:', node.type, 'line', node.loc.start.line);
  }
}

const byName = new Map();
for (const d of decls) {
  if (!byName.has(d.name)) byName.set(d.name, []);
  byName.get(d.name).push(d);
}
const winners = [...byName.values()].map((v) => v.at(-1));
const topLevelNames = new Set(byName.keys());

console.log('=== DUPLICATE TOP-LEVEL NAMES ===');
for (const [n, v] of byName) {
  if (v.length > 1) console.log(` ${n}: lines ${v.map((d) => d.line).join(', ')} -> winner line ${v.at(-1).line}`);
}

const kinds = {};
for (const d of decls) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
console.log('\n=== TOP-LEVEL BINDINGS ===', kinds, '| unique:', byName.size);

const mutable = winners.filter((d) => d.kind === 'let' || d.kind === 'var');
console.log('\n=== MUTABLE STATE (' + mutable.length + ') ===\n' + mutable.map((d) => d.name).join(' '));

// ---- references, resolved through real scope ----------------------------
const refs = new Map();
const recordFrom = (owner, path) => {
  if (!refs.has(owner)) refs.set(owner, new Set());
  const visit = (p) => {
    if (p.isIdentifier() && p.isReferencedIdentifier()) {
      const b = p.scope.getBinding(p.node.name);
      if (b && b.scope.path.node === ast.program) refs.get(owner).add(p.node.name);
    }
    p.traverse({
      Identifier(inner) {
        if (!inner.isReferencedIdentifier()) return;
        const b = inner.scope.getBinding(inner.node.name);
        if (b && b.scope.path.node === ast.program) refs.get(owner).add(inner.node.name);
      },
    });
  };
  visit(path);
};

traverse(ast, {
  FunctionDeclaration(path) {
    if (!path.parentPath.isProgram() || !path.node.id) return;
    recordFrom(path.node.id.name, path);
    path.skip();
  },
  VariableDeclarator(path) {
    if (!path.parentPath.parentPath.isProgram()) return;
    if (!t.isIdentifier(path.node.id) || !path.node.init) return;
    recordFrom(path.node.id.name, path.get('init'));
  },
});
for (const [k, v] of refs) v.delete(k);

// Top-level statements that are not declarations (the DOMContentLoaded
// bootstrap, the try/catch, the trailing if) are reachability roots.
const ROOT = '__root__';
refs.set(ROOT, new Set());
const collectRefsIn = (path) => {
  const add = (p) => {
    if (!p.isReferencedIdentifier()) return;
    const n = p.node.name;
    if (!topLevelNames.has(n)) return;
    const b = p.scope.getBinding(n);
    // count it unless a local binding shadows the program-level one
    if (!b || b.scope.path.node === ast.program) refs.get(ROOT).add(n);
  };
  if (path.isIdentifier()) add(path);
  path.traverse({ Identifier: add });
};
for (let i = 0; i < ast.program.body.length; i++) void i;
{
  let programPath = null;
  traverse(ast, { Program(p) { programPath = p; p.stop(); } });
  for (const child of programPath.get('body')) {
    if (child.isFunctionDeclaration() || child.isVariableDeclaration()) continue;
    collectRefsIn(child);
  }
}

// ---- liveness: is a function referenced by anything else? ---------------
const referenced = new Set();
for (const [owner, set] of refs) for (const r of set) referenced.add(r);

const html = fs.readFileSync('.migrate/body.html', 'utf8');
for (const m of html.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
  if (topLevelNames.has(m[1])) referenced.add(m[1]);
}
for (const m of html.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) void m;

const deadFns = winners.filter((d) => d.kind === 'function' && !referenced.has(d.name));
console.log('\n=== FUNCTIONS NEVER REFERENCED (' + deadFns.length + ') ===');
for (const d of deadFns) console.log(` ${d.name}  line ${d.line}  [${d.section}]`);

// ---- dead duplicates: earlier shadowed copies ---------------------------
const shadowed = [];
for (const [n, v] of byName) if (v.length > 1) for (const d of v.slice(0, -1)) shadowed.push(d);
console.log('\n=== SHADOWED (DEAD) DUPLICATE DECLARATIONS (' + shadowed.length + ') ===');
for (const d of shadowed) console.log(` ${d.name}  line ${d.line}  [${d.section}]`);

// Symbols referenced ONLY by dead code (candidates for removal).
const liveNames = new Set(winners.map((d) => d.name));
for (const d of deadFns) liveNames.delete(d.name);
for (const d of shadowed) liveNames.delete(d.name);
const roots = new Set(refs.get(ROOT));
let changed = true;
while (changed) {
  changed = false;
  for (const name of [...liveNames]) {
    if (roots.has(name)) continue; // reachable from the bootstrap
    const d = byName.get(name).at(-1);
    const users = [...refs.entries()].filter(([owner, set]) => owner !== ROOT && set.has(name) && liveNames.has(owner));
    if (users.length === 0 && !new RegExp('\\b' + name + '\\b').test(html)) {
      liveNames.delete(name);
      changed = true;
    }
  }
}
console.log('\n=== BOOTSTRAP ROOTS (' + roots.size + ') ===\n' + [...roots].join(' '));
const deadOnly = winners.filter((d) => !liveNames.has(d.name) && !deadFns.includes(d) && !shadowed.includes(d));
console.log('\n=== DEAD BY REACHABILITY (' + deadOnly.length + ') ===');
for (const d of deadOnly) console.log(` ${d.name} (${d.kind})  line ${d.line}  [${d.section}]`);

fs.writeFileSync('.migrate/analysis.json', JSON.stringify({
  sections,
  roots: [...(refs.get(ROOT) || [])],
  declarations: winners.map((d) => ({
    name: d.name, kind: d.kind, line: d.line, endLine: d.endLine, section: d.section,
    duplicates: (byName.get(d.name) || []).map((x) => ({ line: x.line, endLine: x.endLine })),
    refs: [...(refs.get(d.name) || [])],
    live: liveNames.has(d.name),
    dead: !liveNames.has(d.name),
  })),
}, null, 1));
console.log('\nwrote .migrate/analysis.json');
