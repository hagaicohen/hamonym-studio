// Proves sanitize-rich-html.ts (src/app/shared/utils/sanitize-rich-html.ts)
// strips dangerous input (script tags, event-handler attributes,
// javascript: URLs) while preserving the formatting the rich-text editor
// (Tiptap) actually produces -- the smallest fix for the stored-XSS path
// flagged in the Launch Closure audit (2026-09-10): campaign story/content
// and update text reach the public page via
// sanitizer.bypassSecurityTrustHtml(), which trusts whatever string it's
// given -- this is the one sanitization boundary before that trust.
//
// Runs in plain Node + jsdom (no Chrome available in this environment for
// `ng test`/Karma) -- duplicates the real source file's DOMPurify config
// inline rather than importing the .ts file directly, since this project
// has no ts-node/ad-hoc TS runner set up. Keep ALLOWED_TAGS/ALLOWED_ATTR
// here in sync with src/app/shared/utils/sanitize-rich-html.ts if that
// file's allowlist changes.
//
// Run: node scripts/test-sanitize-rich-html.js

const { JSDOM } = require('jsdom');
const assert = require('assert');
const createDOMPurify = require('dompurify');

const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'u', 's', 'mark',
  'ul', 'ol', 'li',
  'blockquote', 'a',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class'];

function sanitizeRichHtml(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR });
}

let failures = 0;
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log('      ', err.message);
  }
}

check('strips a <script> tag entirely', () => {
  const out = sanitizeRichHtml('<p>hello</p><script>alert(1)</script>');
  assert.ok(!out.includes('<script'), `script tag survived: ${out}`);
  assert.ok(!out.includes('alert(1)'), `script content survived: ${out}`);
});

check('strips an onerror event-handler attribute on img', () => {
  const out = sanitizeRichHtml('<p>hi<img src=x onerror="alert(1)"></p>');
  assert.ok(!out.includes('onerror'), `onerror survived: ${out}`);
});

check('strips an onclick event-handler attribute', () => {
  const out = sanitizeRichHtml('<p onclick="alert(1)">click me</p>');
  assert.ok(!out.includes('onclick'), `onclick survived: ${out}`);
});

check('neutralizes a javascript: URL in an href', () => {
  const out = sanitizeRichHtml('<a href="javascript:alert(1)">link</a>');
  assert.ok(!/href\s*=\s*"javascript:/i.test(out), `javascript: href survived: ${out}`);
});

check('strips an <iframe> injection', () => {
  const out = sanitizeRichHtml('<p>text</p><iframe src="https://evil.example"></iframe>');
  assert.ok(!out.includes('<iframe'), `iframe survived: ${out}`);
});

check('preserves normal Tiptap-style formatting: bold, italic, links, lists', () => {
  const input = '<p><strong>Bold</strong> and <em>italic</em></p>'
    + '<ul><li>one</li><li>two</li></ul>'
    + '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a real link</a>';
  const out = sanitizeRichHtml(input);
  assert.ok(out.includes('<strong>Bold</strong>'));
  assert.ok(out.includes('<em>italic</em>'));
  assert.ok(out.includes('<li>one</li>'));
  assert.ok(out.includes('href="https://example.com"'));
  assert.ok(out.includes('target="_blank"'));
});

check('preserves inline color/font-size/text-align styles the editor sets', () => {
  const input = '<p style="text-align: center"><span style="color: rgb(255, 0, 0); font-size: 18px">styled text</span></p>';
  const out = sanitizeRichHtml(input);
  assert.ok(out.includes('text-align'), `text-align style stripped: ${out}`);
  assert.ok(out.includes('color'), `color style stripped: ${out}`);
  assert.ok(out.includes('font-size'), `font-size style stripped: ${out}`);
});

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
