// Split the monolithic <script> into ES modules.
//
//  1. drop the 11 provably-shadowed duplicate function declarations
//  2. rewrite every reference to a top-level `let` into `S.<name>` so the
//     mutable state can live in one shared, observable store module
//  3. bucket the remaining top-level declarations into feature modules by the
//     `// ===== SECTION =====` banner they sit under
//  4. generate the import statements each module needs
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;
const gen = (node) => generate(node, { comments: true, jsescOption: { minimal: true } }).code;

const importPath = (from, to) => {
  const rel = path.posix.relative(path.posix.dirname('/' + from), '/' + to);
  return (rel.startsWith('.') ? rel : './' + rel) + '.js';
};

const code = fs.readFileSync('.migrate/engine.js', 'utf8');
const ast = parse(code, { sourceType: 'script' });

// ---------------------------------------------------------------- sections
const sections = [];
for (const m of code.matchAll(/^ *\/\/ ={5,}\s*(.+?)\s*=*$/gm)) {
  sections.push({ line: code.slice(0, m.index).split('\n').length, name: m[1] });
}
const sectionAt = (line) => {
  let cur = '(preamble)';
  for (const s of sections) if (s.line <= line) cur = s.name;
  return cur;
};

const SECTION_MODULE = {
  '(preamble)': 'bootstrap',
  'BASE MAP LAYERS': 'baseMaps',
  'BASE MAPS & BORDERS': 'baseMaps',
  'UNIQUE COLOR ENGINE': 'colors',
  'LAZY HEAVY LIBRARIES (Lightweight Init)': 'heavyLibs',
  'ALIGHT MOTION XML EXPORTER': 'exporters/alightMotion',
  'SVG VECTOR EXPORTER': 'exporters/svg',
  'XML / KML GEOSPATIAL EXPORTER': 'exporters/kml',
  'TRANSPARENT PNG VECTOR RENDERER': 'exporters/png',
  'REGION STYLE INSPECTOR': 'styleInspector',
  'GEOJSON LOADER': 'geojsonLoader',
  'CLIENT-SIDE LAND ENGINE & SEA CUTTER': 'landmass',
  'COASTLINE DETAIL LEVELS': 'landmass',
  'SUPER-DETAIL COASTLINE (LIVE OPENSTREETMAP)': 'osmCoastline',
  'FAST COASTLINE (VECTOR TILES)': 'coastTiles',
  'LOAD COUNTRIES AS EDITABLE GEOJSON': 'countries',
  'MERGE REGIONS': 'merge',
  'REFERENCE IMAGE ENGINE': 'overlayImage',
  'AUTO-GEOREFERENCE ENGINE': 'georef',
  'SEA-COLOUR COASTLINE DETECTION': 'seaDetect',
  'BORDER DETAILENER (natural fractal roughener)': 'borderDetail',
  'CURVED EDGES (smooth individual polygon lines)': 'curves',
  'CURVED EDGES — ALIGHT MOTION STYLE (v2)': 'curves',
  'MAKE POLYGON PART OF THE MAP (tile baker)': 'tileBake',
  'SPLIT SHAPE WITH A LINE': 'split',
  'DRAW TOOLS': 'drawTools',
  'GEOJSON STATS & EXPORT': 'exporters/geojson',
  'COALESCED STATS ENGINE': 'stats',
  'UNDO / REDO HISTORY': 'history',
  'QUICK TOOLS': 'quickTools',
  'UI HELPERS': 'uiHelpers',
  'INTERACTIVE TUTORIAL': 'tutorial',
};

// Names that were CDN globals in the single-file app. They are now live ESM
// bindings exported by heavyLibs.js, filled in by a dynamic import.
const EXTERNAL_PROVIDERS = { turf: 'heavyLibs', topojson: 'heavyLibs' };

// Bare globals the engine used to pick up off `window`. Each becomes a real
// import. Leaflet must be the *default* import: it is a mutable CJS object
// that Geoman and the MapLibre bridge decorate, and a namespace object would
// hide those additions.
const BARE_IMPORTS = {
  L: { source: 'leaflet', default: true },
  lucide: { source: 'lib/icons', default: false },
};

// Pure helpers several modules share — hoisted into src/lib/util.js.
const UTIL_HELPERS = new Set([
  'clampInt', 'nowMs', 'nextTick', 'yieldFrame', 'bboxArea', 'bboxesTouch',
  'bboxOfRings', 'bboxOfLine', 'computeGeoBbox', 'escapeXml', 'hexToRgba',
  'hexToRgbArr', 'rgbToHexStr', 'mercXY', 'mercLL', 'padBoundsLL', 'rngFactory',
  'subsamplePts', 'pushTop', 'gridKey', 'normDir', 'rectOverlapArea',
  'isElementVisible', 'countCoords', 'chaikinOpen',
]);

// ------------------------------------------------- collect top-level decls
const collect = () => {
  const m = new Map();
  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id) {
      m.set(node.id.name, { name: node.id.name, kind: 'function', node, line: node.loc.start.line, section: sectionAt(node.loc.start.line) });
    } else if (t.isVariableDeclaration(node)) {
      for (const d of node.declarations) {
        if (t.isIdentifier(d.id)) m.set(d.id.name, { name: d.id.name, kind: node.kind, node, declarator: d, line: d.loc.start.line, section: sectionAt(d.loc.start.line) });
      }
    }
  }
  return m;
};
let winners = collect();

// ---------------------------------------- 1. drop shadowed duplicates
const seen = new Map();
const dropNodes = new Set();
for (const node of ast.program.body) {
  const names = t.isFunctionDeclaration(node) && node.id ? [node.id.name]
    : t.isVariableDeclaration(node) ? node.declarations.filter((d) => t.isIdentifier(d.id)).map((d) => d.id.name) : [];
  for (const n of names) {
    if (seen.has(n)) dropNodes.add(seen.get(n)); // earlier copy loses
    seen.set(n, node);
  }
}
ast.program.body = ast.program.body.filter((n) => !dropNodes.has(n));
console.log(`1. dropped ${dropNodes.size} shadowed duplicate declarations`);

winners = collect();
const MUTABLE = new Set([...winners.values()].filter((d) => d.kind === 'let' || d.kind === 'var').map((d) => d.name));
const CONSTS = new Set([...winners.values()].filter((d) => d.kind === 'const').map((d) => d.name));
const FUNCS = new Set([...winners.values()].filter((d) => d.kind === 'function').map((d) => d.name));
console.log(`   bindings now: ${MUTABLE.size} mutable, ${CONSTS.size} const, ${FUNCS.size} functions`);

// ------------------------------------------ 1b. CDN loaders -> npm imports
const stmts = (code) => parse(`async function __wrap__() {\n${code}\n}`, { sourceType: 'module' })
  .program.body[0].body.body;
const expr = (code) => parse(`(${code})`, { sourceType: 'module', allowReturnOutsideFunction: true })
  .program.body[0].expression;

const HEAVY_LIBS_IMPL = `
  let turf = null;
  let topojson = null;
  function ensureHeavyLibs() {
    if (!S.heavyLibsPromise) {
      S.heavyLibsPromise = Promise.all([
        import('@turf/turf'),
        import('topojson-client')
      ]).then(([turfModule, topojsonModule]) => {
        turf = turfModule.default ?? turfModule;
        topojson = topojsonModule.default ?? topojsonModule;
      });
    }
    return S.heavyLibsPromise;
  }
`;

const MAPLIBRE_IMPL = `
  function ensureMapLibre() {
    if (S.maplibreLibPromise) return S.maplibreLibPromise;
    S.maplibreLibPromise = (async () => {
      // Both packages are code-split: neither is in the initial bundle.
      await import('maplibre-gl');
      await import('@maplibre/maplibre-gl-leaflet');
      if (typeof L.maplibreGL !== 'function') {
        S.maplibreLibPromise = null;
        throw new Error('MapLibre GL bridge unavailable');
      }
    })();
    return S.maplibreLibPromise;
  }
`;

{
  // Build a fresh body array rather than splicing in place: splicing while
  // iterating re-visits the statements just inserted and loops forever.
  const nextBody = [];
  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id) {
      // loadScriptOnce is obsolete — nothing injects <script> tags any more
      if (node.id.name === 'loadScriptOnce') continue;
      if (node.id.name === 'ensureHeavyLibs') { nextBody.push(...stmts(HEAVY_LIBS_IMPL)); continue; }
      if (node.id.name === 'ensureMapLibre') { node.body = stmts(MAPLIBRE_IMPL)[0].body; }
    }
    nextBody.push(node);
  }
  ast.program.body = nextBody;
  // the `if (typeof topojson === 'undefined') await loadScriptOnce(...)` guard
  traverse(ast, {
    IfStatement(p) {
      const test = p.node.test;
      if (!t.isBinaryExpression(test) || test.operator !== '===') return;
      const unary = test.left;
      if (!t.isUnaryExpression(unary) || unary.operator !== 'typeof') return;
      if (!t.isIdentifier(unary.argument) || unary.argument.name !== 'topojson') return;
      p.replaceWithMultiple(stmts('await ensureHeavyLibs();'));
    },
  });
  console.log('1b. replaced CDN <script> injection with npm dynamic imports');
}

// -------------------------------- 1c. DOMContentLoaded -> startEngine()
// React owns the document now: the engine has to wait until the component
// tree has committed, so the boot block becomes an exported function that
// main.jsx calls from a ref callback instead of a DOM event.
{
  const body = ast.program.body;
  const next = [];
  let converted = 0;
  for (const node of body) {
    const isDomReady =
      t.isExpressionStatement(node) &&
      t.isCallExpression(node.expression) &&
      t.isMemberExpression(node.expression.callee) &&
      t.isIdentifier(node.expression.callee.object, { name: 'document' }) &&
      node.expression.callee.property.name === 'addEventListener' &&
      t.isStringLiteral(node.expression.arguments[0], { value: 'DOMContentLoaded' });
    if (isDomReady) {
      const fn = t.functionDeclaration(
        t.identifier('startEngine'),
        [],
        node.expression.arguments[1].body,
      );
      fn.leadingComments = [
        { type: 'CommentLine', value: ' Boots the engine. Called by main.jsx once React has committed the UI.' },
      ];
      // keep the original position so the section banner lookup still files it
      // under the preamble rather than crashing on a synthesised node
      fn.loc = node.loc;
      fn.start = node.start;
      fn.end = node.end;
      next.push(fn);
      converted++;
      continue;
    }
    next.push(node);
  }
  ast.program.body = next;
  console.log(`1c. converted ${converted} DOMContentLoaded listener(s) into startEngine()`);
}

winners = collect();
// The statements above were parsed from a snippet, so their line numbers point
// into that snippet and the section lookup would file them under the preamble.
// `turf` / `topojson` are module-local live bindings, not app state.
for (const name of [...Object.keys(EXTERNAL_PROVIDERS), 'ensureHeavyLibs']) {
  const d = winners.get(name);
  if (d) d.section = 'LAZY HEAVY LIBRARIES (Lightweight Init)';
}
MUTABLE.delete('turf');
MUTABLE.delete('topojson');

// ------------------------------- 2. rewrite top-level `let` refs -> S.name
// babel's isReferencedIdentifier() is false for assignment targets, so the
// predicate below classifies every identifier position explicitly.
const isStateRef = (p) => {
  const name = p.node.name;
  if (!MUTABLE.has(name)) return false;
  const parent = p.parent;
  if (t.isVariableDeclarator(parent) && parent.id === p.node) return false;
  if (t.isFunction(parent) && parent.params.includes(p.node)) return false;
  if (t.isCatchClause(parent) && parent.param === p.node) return false;
  if (t.isMemberExpression(parent) && parent.property === p.node && !parent.computed) return false;
  if (t.isObjectProperty(parent) && parent.key === p.node && !parent.computed) return false;
  if (t.isObjectMethod(parent) && parent.key === p.node && !parent.computed) return false;
  if (t.isFunctionDeclaration(parent) && parent.id === p.node) return false;
  if (t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent)) return false;
  if (t.isImportSpecifier(parent) || t.isExportSpecifier(parent)) return false;
  const b = p.scope.getBinding(name);
  return !!b && b.scope.path.node === ast.program;
};
const memberS = (name) => t.memberExpression(t.identifier('S'), t.identifier(name));

let rewritten = 0;
let shorthand = 0;
traverse(ast, {
  Identifier(p) {
    if (!isStateRef(p)) return;
    const name = p.node.name;
    // object shorthand `{ map }` must become `{ map: S.map }`
    if (t.isObjectProperty(p.parent) && p.parent.shorthand && p.parent.value === p.node) {
      p.parent.shorthand = false;
      p.parent.value = memberS(name);
      shorthand++;
      return;
    }
    p.replaceWith(memberS(name));
    rewritten++;
  },
});
console.log(`2. rewrote ${rewritten} references (+${shorthand} object shorthand) to S.*`);

// --------------------------------------------- 3. bucket decls into modules
// Consts whose initializer closes over an engine function (the tutorial step
// tables) must live with their own feature module. Keeping them in
// constants.js would make that module import half the app, and a const read
// during another module's top-level evaluation is a TDZ crash waiting for the
// import order to change.
const IMPURE_CONSTS = new Set();
for (const d of winners.values()) {
  if (d.kind !== 'const' || !d.declarator?.init) continue;
  traverse(t.file(t.program([t.expressionStatement(d.declarator.init)])), {
    Identifier(p) {
      const par = p.parent;
      if (t.isMemberExpression(par) && par.property === p.node && !par.computed) return;
      if (FUNCS.has(p.node.name)) IMPURE_CONSTS.add(d.name);
    },
  });
}

const moduleOf = (name) => {
  if (EXTERNAL_PROVIDERS[name]) return EXTERNAL_PROVIDERS[name];
  const d = winners.get(name);
  if (!d) return null;
  if (MUTABLE.has(name)) return 'state';
  if (CONSTS.has(name)) return IMPURE_CONSTS.has(name) ? (SECTION_MODULE[d.section] || 'constants') : 'constants';
  if (UTIL_HELPERS.has(name) && d.kind === 'function') return '@util';
  return SECTION_MODULE[d.section] || 'misc';
};

const buckets = new Map();
const push = (mod, entry) => {
  if (!buckets.has(mod)) buckets.set(mod, []);
  buckets.get(mod).push(entry);
};
const rootStatements = [];
for (const node of ast.program.body) {
  if (t.isFunctionDeclaration(node) && node.id) {
    push(moduleOf(node.id.name), { name: node.id.name, node, kind: 'function' });
  } else if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) {
      if (!t.isIdentifier(d.id)) continue;
      push(moduleOf(d.id.name), { name: d.id.name, node: t.variableDeclaration(node.kind, [d]), kind: node.kind, declarator: d });
    }
  } else {
    rootStatements.push(node);
  }
}
for (const n of rootStatements) push('bootstrap', { name: null, node: n, kind: 'root' });

// --------------------------------------------------- 4. emit state.js first
const stateInit = buckets.get('state') || [];
const stateNeeds = new Set();
for (const e of stateInit) {
  if (!e.declarator.init) continue;
  traverse(t.file(t.program([t.expressionStatement(e.declarator.init)])), {
    Identifier(p) {
      const n = p.node.name;
      const par = p.parent;
      if (t.isMemberExpression(par) && par.property === p.node && !par.computed) return;
      if (!CONSTS.has(n) && !FUNCS.has(n)) return;
      if (MUTABLE.has(n)) return;
      stateNeeds.add(n);
    },
  });
}
const stateImports = [...stateNeeds].sort().map((n) => {
  const target = CONSTS.has(n) ? 'constants' : moduleOf(n);
  return { name: n, target };
});
const stateImportLines = [];
for (const target of [...new Set(stateImports.map((i) => i.target))].sort()) {
  const names = stateImports.filter((i) => i.target === target).map((i) => i.name).sort();
  if (!names.length || target === 'state') continue;
  const dest = target === '@util' ? 'src/lib/util' : `src/engine/${target}`;
  stateImportLines.push(`import { ${names.join(', ')} } from '${importPath('src/engine/state', dest)}';`);
}

const stateLines = stateInit.map((e) => {
  const init = e.declarator.init ? gen(e.declarator.init) : 'undefined';
  return `  ${e.name}: ${init},`;
});
const stateJs = `// Shared mutable application state.
//
// The original single-file app kept ~90 top-level \`let\` bindings in one script
// scope. They now live on a single object behind a Proxy, which lets React
// subscribe to changes (see src/store/useAppState.js) without the engine
// having to announce anything — assigning \`S.foo = x\` notifies on its own.
import { createStore } from '../store/createStore.js';
${stateImportLines.length ? stateImportLines.join('\n') + '\n' : ''}
const initialState = {
${stateLines.join('\n')}
};

export const { store: S, subscribe, getVersion } = createStore(initialState);
`;
fs.mkdirSync('src/engine/exporters', { recursive: true });
fs.mkdirSync('src/store', { recursive: true });
fs.mkdirSync('src/lib', { recursive: true });
fs.writeFileSync('src/engine/state.js', stateJs);
console.log(`4. wrote src/engine/state.js with ${stateInit.length} fields`);

// ------------------------------------------- 5. emit every other module

const written = [];
for (const [mod, items] of [...buckets].sort()) {
  if (mod === 'state') continue;
  const outFile = mod === '@util' ? 'src/lib/util.js' : `src/engine/${mod}.js`;


  const needs = new Set();
  const bareGlobals = new Set();
  let usesS = false;
  traverse(t.file(t.program(items.map((i) => i.node))), {
    Identifier(p) {
      const n = p.node.name;
      const parent = p.parent;
      // non-reference positions
      if (t.isMemberExpression(parent) && parent.property === p.node && !parent.computed) return;
      if (t.isObjectProperty(parent) && parent.key === p.node && !parent.computed) return;
      if (t.isObjectMethod(parent) && parent.key === p.node && !parent.computed) return;
      if (t.isFunctionDeclaration(parent) && parent.id === p.node) return;
      if (t.isVariableDeclarator(parent) && parent.id === p.node) return;
      if (t.isFunction(parent) && parent.params.includes(p.node)) return;
      if (t.isCatchClause(parent) && parent.param === p.node) return;
      if (t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent)) return;

      if (n === 'S') { usesS = true; return; }
      if (BARE_IMPORTS[n] && !p.scope.getBinding(n)) { bareGlobals.add(n); return; }
      // a binding visible in this file is local to it — no import needed.
      // (this is what keeps a local `const map = {}` from shadowing the
      //  engine's `map` state field)
      if (p.scope.getBinding(n)) return;
      if (EXTERNAL_PROVIDERS[n]) { needs.add(n); return; }
      if (!winners.has(n)) return;
      if (MUTABLE.has(n)) return; // already rewritten to S.<name>
      needs.add(n);
    },
  });

  const grouped = new Map();
  for (const name of needs) {
    const target = EXTERNAL_PROVIDERS[name] || moduleOf(name);
    if (!target || target === 'state') continue;
    if (target === mod) continue; // provided by this very module
    if (!grouped.has(target)) grouped.set(target, []);
    grouped.get(target).push(name);
  }

  const importLines = [];
  for (const name of [...bareGlobals].sort()) {
    const spec = BARE_IMPORTS[name];
    const from = spec.source.startsWith('.') || spec.source.startsWith('lib/')
      ? importPath(outFile.replace(/\.js$/, ''), 'src/' + spec.source)
      : spec.source;
    importLines.push(spec.default
      ? `import ${name} from '${from}';`
      : `import * as ${name} from '${from}';`);
  }
  if (usesS) {
    importLines.push(`import { S } from '${importPath(outFile.replace(/\.js$/, ''), 'src/engine/state')}';`);
  }
  for (const [target, names] of [...grouped].sort()) {
    const sorted = [...new Set(names)].sort();
    if (!sorted.length) continue;
    const spec = sorted.length > 6
      ? `{\n  ${sorted.join(',\n  ')},\n}`
      : `{ ${sorted.join(', ')} }`;
    const dest = target === '@util' ? 'src/lib/util' : `src/engine/${target}`;
    importLines.push(`import ${spec} from '${importPath(outFile.replace(/\.js$/, ''), dest)}';`);
  }

  // Leading comments (the section banners) must stay *above* the `export`
  // keyword, otherwise babel emits `export // banner\nfunction foo()`.
  const renderComment = (c) => (c.type === 'CommentLine' ? `//${c.value}` : `/*${c.value}*/`);
  const renderEntry = (i) => {
    const leading = (i.node.leadingComments || []).map(renderComment).join('\n');
    i.node.leadingComments = null;
    const code = gen(i.node);
    const prefix = leading ? leading + '\n' : '';
    return i.name ? `${prefix}export ${code}` : `${prefix}${code}`;
  };
  const body = items.map(renderEntry).join('\n\n');

  const secs = [...new Set(items.map((i) => (i.name ? winners.get(i.name)?.section : '(bootstrap)')))].filter(Boolean);
  const header = `// Split out of the original single-file engine (see legacy/index.html).\n// Origin: ${secs.join('  ·  ')}\n`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${header}${importLines.length ? '\n' + importLines.join('\n') + '\n' : ''}\n${body}\n`);
  written.push(outFile);
}
console.log(`5. wrote ${written.length} modules:`);
for (const f of written) console.log(`     ${f}`);

fs.writeFileSync('.migrate/module-map.json', JSON.stringify({
  modules: Object.fromEntries([...buckets].map(([m, items]) => [m, items.filter((i) => i.name).map((i) => i.name)])),
  mutable: [...MUTABLE],
  consts: [...CONSTS],
  utilHelpers: [...UTIL_HELPERS],
}, null, 1));
