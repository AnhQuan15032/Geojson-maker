// Splits legacy/index.html into the three chunks the other migration scripts
// consume. Writes to .migrate/, which is git-ignored scratch space.
import fs from 'node:fs';

const src = fs.readFileSync('legacy/index.html', 'utf8');
const line = (marker, from = 0) => {
  const i = src.indexOf(marker, from);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  return src.slice(0, i).split('\n').length;
};

const styleOpen = line('<style>');
const styleClose = line('</style>', styleOpen);
const bodyOpen = line('<body');
const scriptOpen = line('<script>', src.indexOf('<body'));
const scriptClose = line('</script>', scriptOpen);

fs.mkdirSync('.migrate', { recursive: true });
fs.writeFileSync('.migrate/app.css', src.split('\n').slice(styleOpen, styleClose - 1).join('\n'));
fs.writeFileSync('.migrate/body.html', src.split('\n').slice(bodyOpen, scriptOpen - 2).join('\n'));
fs.writeFileSync('.migrate/engine.js', src.split('\n').slice(scriptOpen, scriptClose - 1).join('\n'));
console.log('extracted -> .migrate/{app.css,body.html,engine.js}');
