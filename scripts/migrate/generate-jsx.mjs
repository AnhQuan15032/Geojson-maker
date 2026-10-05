// Convert the original <body> markup into React components.
//
//  - class -> className, for -> htmlFor, on* -> React handlers
//  - <i data-lucide="x"> -> <Icon name="x" />
//  - inline `onclick="foo()"` -> `onClick={() => actions.foo()}`, with `this`
//    rewritten to `e.currentTarget` and `event` to `e`
//  - text nodes are rendered so that JSX whitespace folding cannot change them
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('.migrate/body.html', 'utf8');
const dom = new JSDOM(`<div id="__root">${html}</div>`);
const root = dom.window.document.getElementById('__root');

const ATTR_RENAMES = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength' };
const EVENT_ATTRS = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onfocus: 'onFocus', onblur: 'onBlur' };
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source']);

// every engine function the markup may call
const map = JSON.parse(fs.readFileSync('.migrate/module-map.json', 'utf8'));
const engineNames = new Set([
  ...Object.values(map.modules).flat(),
  ...map.consts,
]);

const handlersUsed = new Set();

function convertHandler(code) {
  let body = code.trim();
  const usesThis = /\bthis\b/.test(body);
  const usesEvent = /\bevent\b/.test(body);
  body = body.replace(/\bthis\b/g, 'e.currentTarget').replace(/\bevent\b/g, 'e');
  // bare engine globals become actions.* / state reads
  body = body.replace(/[A-Za-z_$][A-Za-z0-9_$]*/g, (name, offset, str) => {
    const before = str[offset - 1];
    if (before === '.' || before === "'" || before === '"') return name;
    if (name === 'e' || name === 'document' || name === 'Math' || name === 'window' || name === 'String' || name === 'Number') return name;
    if (!engineNames.has(name)) return name;
    if (map.mutable.includes(name)) return `S.${name}`;
    handlersUsed.add(name);
    return `actions.${name}`;
  });
  const params = usesThis || usesEvent ? '(e)' : '()';
  return `${params} => { ${body} }`;
}

function jsxText(text) {
  return text.replace(/[{}]/g, (c) => `{'${c}'}`);
}

function attrsOf(el) {
  const out = [];
  const tag = el.tagName.toLowerCase();
  for (const attr of el.attributes) {
    let name = attr.name;
    const value = attr.value;
    // The engine writes input.value imperatively, so these fields are
    // uncontrolled: `value` would make React own them and fight those writes.
    if (name === 'value' && (tag === 'input' || tag === 'textarea')) name = 'defaultValue';
    if (EVENT_ATTRS[name]) {
      out.push(`${EVENT_ATTRS[name]}={${convertHandler(value)}}`);
      continue;
    }
    if (name === 'style') {
      const decls = value.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
        const [k, ...rest] = d.split(':');
        const prop = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return `${prop}: '${rest.join(':').trim()}'`;
      });
      out.push(`style={{ ${decls.join(', ')} }}`);
      continue;
    }
    if (name === 'data-lucide') continue; // handled by the Icon rewrite
    if (ATTR_RENAMES[name]) name = ATTR_RENAMES[name];
    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  return out;
}

function renderIcon(el, indent) {
  const name = el.getAttribute('data-lucide');
  const cls = el.getAttribute('class');
  const extra = [...el.attributes]
    .filter((a) => !['data-lucide', 'class'].includes(a.name))
    .map((a) => ` ${ATTR_RENAMES[a.name] || a.name}="${a.value}"`)
    .join('');
  return `${indent}<Icon name="${name}"${cls ? ` className="${cls}"` : ''}${extra} />`;
}

function render(node, indent) {
  if (node.nodeType === 8) {
    const text = node.textContent.trim();
    return text ? `${indent}{/* ${text.replace(/\*\//g, '*\\/') } */}` : null;
  }
  if (node.nodeType === 3) {
    const raw = node.textContent;
    if (!raw.trim()) return null;
    // keep the exact spacing: JSX folds newlines, a string literal does not
    const needsLiteral = /^\s|\s$|\n/.test(raw);
    const body = needsLiteral ? `{'${raw.replace(/'/g, "\\'").replace(/\n\s*/g, ' ')}'}` : jsxText(raw.trim());
    return `${indent}${body}`;
  }
  if (node.nodeType !== 1) return null;

  const el = node;
  if (el.tagName === 'I' && el.hasAttribute('data-lucide')) return renderIcon(el, indent);

  const tag = el.tagName.toLowerCase();
  const attrs = attrsOf(el);
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;

  const childNodes = [...el.childNodes];
  const hasElementChild = childNodes.some((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()));

  if (!hasElementChild) {
    const text = el.textContent;
    if (!text) return VOID.has(tag) ? `${indent}${open} />` : `${indent}${open}></${tag}>`;
    return `${indent}${open}>${jsxText(text)}</${tag}>`;
  }

  const lines = [];
  for (const child of childNodes) {
    const rendered = render(child, indent + '  ');
    if (rendered) lines.push(rendered);
  }
  if (VOID.has(tag)) return `${indent}${open} />`;
  return `${indent}${open}>\n${lines.join('\n')}\n${indent}</${tag}>`;
}

// ------------------------------------------------------------- components
const COMPONENTS = [
  { file: 'src/ui/AppHeader.jsx', ids: ['app-header'], export: 'AppHeader' },
  { file: 'src/ui/MobileHeader.jsx', ids: ['mobile-app-header'], export: 'MobileHeader' },
  { file: 'src/ui/MapView.jsx', ids: ['map'], export: 'MapView' },
  { file: 'src/ui/DesktopRail.jsx', ids: ['desktop-rail'], export: 'DesktopRail' },
  { file: 'src/ui/MobileNav.jsx', ids: ['mobile-nav'], export: 'MobileNav' },
  { file: 'src/ui/MobileSelectionBar.jsx', ids: ['mobile-selection-bar'], export: 'MobileSelectionBar' },
  { file: 'src/ui/drawers/ExportDrawer.jsx', ids: ['export-drawer'], export: 'ExportDrawer' },
  { file: 'src/ui/drawers/DrawDrawer.jsx', ids: ['draw-drawer'], export: 'DrawDrawer' },
  { file: 'src/ui/drawers/StyleDrawer.jsx', ids: ['style-drawer'], export: 'StyleDrawer' },
  { file: 'src/ui/drawers/ImageDrawer.jsx', ids: ['image-drawer'], export: 'ImageDrawer' },
  { file: 'src/ui/drawers/LayersDrawer.jsx', ids: ['layers-drawer'], export: 'LayersDrawer' },
  { file: 'src/ui/drawers/SettingsDrawer.jsx', ids: ['settings-drawer'], export: 'SettingsDrawer' },
  { file: 'src/ui/TutorialOverlay.jsx', ids: ['tutorial-overlay', 'tour-spot', 'tour-call', 'tutorial-pill'], export: 'TutorialOverlay', multi: true },
  { file: 'src/ui/ShortcutSheet.jsx', ids: ['shortcut-sheet'], export: 'ShortcutSheet' },
  { file: 'src/ui/Toast.jsx', ids: ['toast'], export: 'Toast' },
];

const byId = new Map();
for (const el of root.children) if (el.id) byId.set(el.id, el);

const importsFor = (body, file) => {
  const lines = [];
  if (/<Icon\b/.test(body)) lines.push(`import { Icon } from '${relTo(file, 'src/lib/icons')}';`);
  if (/\bactions\./.test(body)) lines.push(`import actions from '${relTo(file, 'src/engine/actions')}';`);
  if (/\bS\./.test(body)) lines.push(`import { S } from '${relTo(file, 'src/engine/state')}';`);
  return lines.join('\n');
};

const relTo = (file, target) => {
  const rel = path.posix.relative(path.posix.dirname('/' + file), '/' + target);
  return rel.startsWith('.') ? rel : './' + rel;
};

for (const comp of COMPONENTS) {
  const parts = [];
  for (const id of comp.ids) {
    const el = byId.get(id);
    if (!el) throw new Error(`missing element #${id}`);
    const fnName = comp.multi
      ? id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())
      : comp.export;
    parts.push(`export function ${fnName}() {\n  return (\n${render(el, '    ')}\n  );\n}`);
  }
  const body = comp.multi ? parts.join('\n\n') : parts[0];
  const src = `${importsFor(body, comp.file)}
${body}
`;
  fs.mkdirSync(path.dirname(comp.file), { recursive: true });
  fs.writeFileSync(comp.file, src);
  console.log(`wrote ${comp.file} (${comp.ids.join(', ')})`);
}

// ---- App.jsx -------------------------------------------------------------
const multi = COMPONENTS.find((c) => c.multi);
const multiNames = multi.ids.map((id) => id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()));

// keep the original document order
const order = [...root.children].map((el) => {
  const comp = COMPONENTS.find((c) => c.ids.includes(el.id));
  if (comp) {
    if (comp.multi) {
      const fn = el.id.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
      return `      <${fn} />`;
    }
    return `      <${comp.export} />`;
  }
  return render(el, '      ');
});

const inlineFragments = order.join('\n');
const appExtraImports = [
  ...(/\bactions\./.test(inlineFragments) ? ["import actions from './engine/actions';"] : []),
  ...(/\bS\./.test(inlineFragments) ? ["import { S } from './engine/state';"] : []),
].join('\n');

const appSrc = `${appExtraImports ? appExtraImports + '\n' : ''}import { MapView } from '${relTo('src/App.jsx', 'src/ui/MapView')}';
${COMPONENTS.filter((c) => c.export !== 'MapView' && !c.multi)
  .map((c) => `import { ${c.export} } from '${relTo('src/App.jsx', c.file.replace(/\.jsx$/, ''))}';`)
  .join('\n')}
import { ${multiNames.join(', ')} } from '${relTo('src/App.jsx', 'src/ui/TutorialOverlay')}';

export default function App() {
  return (
    <>
${inlineFragments}
    </>
  );
}
`;
fs.writeFileSync('src/App.jsx', appSrc);
console.log('wrote src/App.jsx');

fs.writeFileSync('.migrate/handlers-used.json', JSON.stringify([...handlersUsed].sort(), null, 1));
console.log(`\n${handlersUsed.size} distinct engine functions called from markup`);
