// ESM cycles are safe for hoisted function declarations, but a `const` that is
// *read* during another module's top-level evaluation can hit the TDZ.
// This finds exactly those cases.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = _traverse.default || _traverse;

// Bundler-style specifiers omit the extension; resolve them the way Vite does.
function resolveSpecifier(fromFile, source) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source));
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p.replace(/\\/g, '/'));
  }
})('src');

// ---- import graph + strongly connected components ------------------------
const edges = new Map();
for (const f of files) {
  const ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const out = new Set();
  traverse(ast, {
    ImportDeclaration(p) {
      if (!p.node.source.value.startsWith('.')) return;
      const target = resolveSpecifier(f, p.node.source.value);
      if (target) out.add(target);
    },
  });
  edges.set(f, out);
}
// Tarjan
let index = 0;
const idx = new Map(), low = new Map(), onStack = new Map(), stack = [];
const sccOf = new Map();
const strongconnect = (v) => {
  idx.set(v, index); low.set(v, index); index++;
  stack.push(v); onStack.set(v, true);
  for (const w of edges.get(v) || []) {
    if (!idx.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
    else if (onStack.get(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
  }
  if (low.get(v) === idx.get(v)) {
    const comp = [];
    let w;
    do { w = stack.pop(); onStack.set(w, false); comp.push(w); } while (w !== v);
    if (comp.length > 1) for (const m of comp) sccOf.set(m, comp);
  }
};
for (const f of files) if (!idx.has(f)) strongconnect(f);

let hazards = 0;
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  // only imports from modules in the same cycle can be uninitialised
  const cyclical = new Set();
  for (const target of edges.get(f) || []) {
    if ((sccOf.get(f) || []).includes(target)) cyclical.add(target);
  }
  const imported = new Map();
  traverse(ast, {
    ImportDeclaration(p) {
      const src = p.node.source.value.startsWith('.') ? resolveSpecifier(f, p.node.source.value) : null;
      if (!src || !cyclical.has(src)) return;
      for (const s of p.node.specifiers) imported.set(s.local.name, src);
    },
  });
  if (!imported.size) continue;

  // top-level variable initializers, and any statement that runs at import time
  for (const node of ast.program.body) {
    if (!t.isVariableDeclaration(node)) continue;
    for (const d of node.declarations) {
      if (!d.init) continue;
      const hits = new Set();
      // walk the initializer but do NOT descend into function bodies: those run
      // later, when every module has finished evaluating.
      traverse(t.file(t.program([t.expressionStatement(d.init)])), {
        enter(p) {
          if (p.isFunction()) { p.skip(); return; }
          if (p.isIdentifier() && imported.has(p.node.name)) {
            const par = p.parent;
            if (t.isMemberExpression(par) && par.property === p.node && !par.computed) return;
            if (t.isObjectProperty(par) && par.key === p.node && !par.computed) return;
            hits.add(p.node.name);
          }
        },
      });
      if (hits.size) {
        hazards++;
        const name = t.isIdentifier(d.id) ? d.id.name : '(destructured)';
        console.log(`TDZ RISK  ${f}  top-level ${node.kind} ${name} reads: ${[...hits].join(', ')}`);
      }
    }
  }
}
console.log(`\n${hazards} top-level initializers read a binding from a module in an import cycle`);
