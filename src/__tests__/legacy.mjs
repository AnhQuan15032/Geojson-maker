// Loads the ORIGINAL single-file engine (legacy/index.html) into a sandbox so
// tests can diff its behaviour against the React app's modules.
//
// The whole <script> body is evaluated as one sloppy-mode script, exactly as a
// browser would have, which preserves the semantics the refactor had to keep —
// including "last duplicate function declaration wins".
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import L from 'leaflet';
import { parse } from '@babel/parser';

const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../legacy/index.html'), 'utf8');
const start = html.indexOf('<script>', html.indexOf('<body')) + '<script>'.length;
const end = html.indexOf('</script>', start);
const source = html.slice(start, end);

// sanity: the parser must agree about what we sliced out
const ast = parse(source, { sourceType: 'script' });
export const legacyFunctionNames = new Set(
  ast.program.body
    .filter((n) => n.type === 'FunctionDeclaration' && n.id)
    .map((n) => n.id.name),
);

const element = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {},
  getAttribute: () => null,
  appendChild() {},
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
});

const sandbox = {
  console,
  Math,
  JSON,
  Date,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  Promise,
  Map,
  Set,
  WeakMap,
  setTimeout,
  clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'node', vibrate() {}, geolocation: null },
  document: {
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: element,
    body: element(),
    head: element(),
  },
  window: { addEventListener() {}, requestIdleCallback: null },
  // The original picked Leaflet up off window; the modules import it. Give the
  // sandbox the same instance so both sides do identical projections.
  L,
};
sandbox.globalThis = sandbox;
sandbox.window.document = sandbox.document;

const context = vm.createContext(sandbox);
vm.runInContext(source, context, { filename: 'legacy-engine.js' });

/** A function from the original monolith, bound to the original scope. */
export function legacy(name) {
  const fn = vm.runInContext(`typeof ${name} === 'function' ? ${name} : undefined`, context);
  if (typeof fn !== 'function') throw new Error(`legacy engine has no function ${name}`);
  return fn;
}

/** Any top-level value from the original monolith. */
export function legacyValue(expression) {
  return vm.runInContext(expression, context);
}

/**
 * Assign one of the original's top-level `let` bindings.
 *
 * Those live in the script's global *lexical* environment, not on the context
 * object, so they cannot be set by writing a property on the sandbox — the
 * value has to be handed over through a scratch global and assigned in-context.
 */
export function setLegacyVar(name, value) {
  sandbox.__inject = value;
  vm.runInContext(`${name} = __inject`, context);
}
