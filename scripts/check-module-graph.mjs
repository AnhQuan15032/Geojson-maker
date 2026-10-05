// Verify the generated module graph: every import specifier resolves to a file
// that exists and actually exports that name.
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

const exportsOf = new Map();
const importsOf = new Map();

for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const exp = new Set();
  const imp = [];
  traverse(ast, {
    ExportNamedDeclaration(p) {
      const d = p.node.declaration;
      if (t.isFunctionDeclaration(d) && d.id) exp.add(d.id.name);
      else if (t.isVariableDeclaration(d)) {
        for (const x of d.declarations) {
          for (const id of Object.values(t.getBindingIdentifiers(x.id))) exp.add(id.name);
        }
      }
      for (const s of p.node.specifiers || []) if (t.isExportSpecifier(s)) exp.add(s.exported.name);
    },
    ExportDefaultDeclaration() { exp.add('default'); },
    ExportAllDeclaration() { exp.add('*'); },
    ImportDeclaration(p) {
      const names = [];
      for (const s of p.node.specifiers) {
        if (t.isImportSpecifier(s)) names.push(s.imported.name);
        else names.push('default');
      }
      imp.push({ source: p.node.source.value, names, line: p.node.loc.start.line });
    },
  });
  exportsOf.set(f, exp);
  importsOf.set(f, imp);
}

let problems = 0;
let totalImports = 0;
const edges = new Map();
for (const f of files) {
  for (const im of importsOf.get(f)) {
    if (!im.source.startsWith('.')) continue; // bare package specifier
    const target = resolveSpecifier(f, im.source);
    if (!target) {
      console.log(`MISSING FILE  ${f}:${im.line} -> ${im.source}`);
      problems++;
      continue;
    }
    const ex = exportsOf.get(target);
    if (!ex) continue;
    for (const n of im.names) {
      totalImports++;
      if (!ex.has(n)) {
        console.log(`MISSING EXPORT  ${f}:${im.line}  '${n}' not exported by ${target}`);
        problems++;
      }
    }
    if (!edges.has(f)) edges.set(f, new Set());
    edges.get(f).add(target);
  }
}
console.log(`\n${files.length} files, ${totalImports} relative named imports, ${problems} problems`);

// ---- cycles (informational: ESM handles function hoisting, but cycles that
//      touch top-level consts can hit TDZ) ----
const state = new Map();
const cycles = [];
const visit = (node, stack) => {
  if (state.get(node) === 1) {
    const i = stack.indexOf(node);
    cycles.push([...stack.slice(i), node]);
    return;
  }
  if (state.get(node) === 2) return;
  state.set(node, 1);
  for (const next of edges.get(node) || []) visit(next, [...stack, node]);
  state.set(node, 2);
};
for (const f of files) visit(f, []);
console.log(`\n${cycles.length} import cycles`);
for (const c of cycles.slice(0, 12)) console.log('  ' + c.map((x) => x.replace('src/engine/', '')).join(' -> '));
