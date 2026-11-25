// Design-system rule: no decorative emoji in application UI (docs/DESIGN_SYSTEM.md).
// Enforced on the whole frontend; UI icons come from Lucide through
// <app-icon> (shared/ui/design-system/icon.component.ts).
// Emojis that are campaign content or a user's choice are listed in ALLOWED,
// each with its reason. Comments are ignored.
// Usage: node scripts/test-no-ui-emoji.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENFORCED = ['src/app'];
// Pictographic emoji (incl. ⚠ ✔ ✏ ★ and colored dots). Typographic arrows,
// ©, ✓ and ✕ are text glyphs and stay allowed.
const EMOJI = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])/gu;
const TEXT_GLYPHS = new Set(['©', '®', '™', '↔', '↕', '↖', '↗', '↘', '↙', '↩', '↪', '✓', '✕', '✖']);
// Screens migrated first also replaced the ✓ ✕ text marks; they stay strict.
const STRICT = ['src/app/modules/onboarding/', 'src/app/modules/organization-registration/', 'src/app/shared/ui/empty-state/'];
const STRICT_EMOJI = /[🌀-🫿☀-➿⭐]/gu;

// [file, text the line must contain, reason]
const ALLOWED = [
  ['src/app/shared/ui/text-style-editor/text-style-editor.component.ts', 'presetIcons', 'CTA icons the user picks; saved with the campaign'],
  ['src/app/modules/campaigns/builder/steps/campaign-page-builder-step/campaign-page-builder-step.component.html', "let ic of ['',", 'CTA icons the user picks; saved with the campaign'],
  ['src/app/modules/campaigns/builder/steps/campaign-page-builder-step/campaign-page-builder-step.component.html', 'placeholder="🎯"', 'example for a free-text icon field the user fills'],
  ['src/app/modules/campaigns/builder/presets/campaign-presets.ts', "icon: '", 'preset data: registration field icons applied to the campaign as content'],
  ['src/app/modules/campaigns/services/campaign-studio-state.service.ts', "registrationFieldIcon: '👤'", 'default of a campaign content field (user-editable icon)'],
  ['src/app/modules/campaigns/services/campaign-studio-state.service.ts', "ctaIcon:           '❤️'", 'default of a campaign content field (user-editable CTA icon)'],
  ['src/app/modules/campaigns/services/campaign-api.service.ts', "registration_field_icon  ?? '👤'", 'default of a stored campaign content field'],
  ['src/app/modules/campaigns/shared/components/checkout-modal/checkout-modal.component.ts', "registrationFieldIcon || '👤'", 'campaign content field and its default'],
  ['src/app/modules/campaigns/builder/steps/campaign-registration-step/campaign-registration-step.component.html', "registrationFieldIcon || '👤'", 'campaign content field and its default'],
  ['src/app/modules/campaigns/studio/preview/campaign-preview/campaign-preview.component.html', "ctaIcon || '🔒'", 'campaign content field (CTA icon) and its default'],
  ['src/app/modules/platform/pages/platform-billing-ops-page/platform-billing-ops-page.component.ts', "{ icon: '⚠'", 'status marker value (tested); rendered as a Lucide icon in the template'],
  ['src/app/modules/platform/pages/platform-billing-ops-page/platform-billing-ops-page.component.html', "icon === '⚠'", 'compares the status marker; renders a Lucide icon'],
  ['src/app/modules/platform/components/billing-entity-setup/billing-entity-setup.component.ts', "{ icon: '⚠'", 'status marker value, not rendered'],
];

const files = (p) => {
  const abs = path.join(ROOT, p);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(p, e.name)) : [path.join(abs, e.name)]);
};
const blank = (m) => m.replace(/[^\n]/g, ' ');
const stripComments = (s, ts) => {
  s = s.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank);
  return ts ? s.replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, p) => p + blank(m.slice(p.length))) : s;
};

const failures = [];
const used = new Set();
for (const file of ENFORCED.flatMap(files)) {
  if (!/\.(html|ts)$/.test(file) || file.endsWith('.spec.ts')) continue;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  stripComments(fs.readFileSync(file, 'utf8'), file.endsWith('.ts')).split(/\r?\n/).forEach((line, i) => {
    const strict = STRICT.some((p) => rel.startsWith(p));
    const found = strict ? (line.match(STRICT_EMOJI) || []) : (line.match(EMOJI) || []).filter((e) => !TEXT_GLYPHS.has(e));
    if (!found.length) return;
    const rule = ALLOWED.find(([f, text]) => f === rel && line.includes(text));
    if (rule) { used.add(rule); return; }
    failures.push(`${rel}:${i + 1}  ${found.join(' ')}  ${line.trim().slice(0, 100)}`);
  });
}
const stale = ALLOWED.filter((r) => !used.has(r));

if (failures.length || stale.length) {
  if (failures.length) console.error(`Decorative emoji found in ${failures.length} line(s); use <app-icon> (Lucide):\n` + failures.join('\n'));
  if (stale.length) console.error('Allowed entries that no longer match (remove them):\n' + stale.map(([f, t]) => `${f}  "${t}"`).join('\n'));
  process.exit(1);
}
console.log(`PASS: no decorative emoji in the frontend (${ALLOWED.length} content exceptions)`);
