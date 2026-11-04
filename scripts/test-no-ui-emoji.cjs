// Design-system rule: no decorative emoji in application UI (docs/DESIGN_SYSTEM.md).
// Enforced on the areas migrated so far; add paths as screens are migrated.
// Campaign templates, public campaign pages and user content are out of scope.
// Usage: node scripts/test-no-ui-emoji.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENFORCED = [
  'src/app/modules/onboarding',
  'src/app/modules/organization-registration',
  'src/app/shared/ui/empty-state',
];
// Emoji and dingbat ranges; also covers the ✓ ✕ ⚠ text marks replaced by Lucide.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/gu;

const files = (p) => {
  const abs = path.join(ROOT, p);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(p, e.name)) : [path.join(abs, e.name)]);
};
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

const failures = [];
for (const file of ENFORCED.flatMap(files)) {
  if (!/\.(html|ts)$/.test(file) || file.endsWith('.spec.ts')) continue;
  stripComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
    const found = line.match(EMOJI);
    if (found) failures.push(`${path.relative(ROOT, file)}:${i + 1}  ${found.join(' ')}  ${line.trim().slice(0, 100)}`);
  });
}

if (failures.length) {
  console.error(`Decorative emoji found in ${failures.length} line(s); use Lucide icons:\n` + failures.join('\n'));
  process.exit(1);
}
console.log(`PASS: no UI emoji in ${ENFORCED.length} enforced paths`);
