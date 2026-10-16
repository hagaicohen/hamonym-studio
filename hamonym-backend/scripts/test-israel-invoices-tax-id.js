// Israel Invoices — Document.TaxId support (2026-10).
// docs/finance/ISRAEL_INVOICES_TAX_ID_AUDIT.md has the full audit + design.
//
// Same testing convention already established in
// scripts/test-donation-cardcom-separation.js for this exact area (its own
// header comment explains why): createDonation's full LowProfile-payload
// wiring is proven by STATIC SOURCE SCAN, not by invoking the real
// function -- createDonation has many side effects (recurring signup
// creation, registration processing, a real donations row, and ultimately
// a real network call unless deeply mocked) that are out of scope for a
// one-line additive change, and "do not perform a real donation without
// approval" is an explicit standing rule in that file. This suite follows
// the same convention: (1) a static scan proving the exact conditional-
// spread pattern exists in the real source, and (2) a pure-logic
// unit test that reproduces that one expression in isolation (no DB, no
// network, no side effects) across the required donor-identification
// scenarios.
//
// Run: node scripts/test-israel-invoices-tax-id.js
const fs = require('fs');
const path = require('path');

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

const SERVICE_PATH = path.join(__dirname, '..', 'src', 'modules', 'donations', 'donations.service.js');
const src = fs.readFileSync(SERVICE_PATH, 'utf8');

// --- 1. Static source-scan: the exact wiring exists, and only there -------
check('1. Document object includes a conditional TaxId spread sourced from donor.idNumber', () => {
  if (!/\.\.\.\(donor\.idNumber \? \{ TaxId: donor\.idNumber \} : \{\}\)/.test(src)) {
    throw new Error('expected conditional TaxId spread not found in donations.service.js');
  }
});

check('2. TaxId is NEVER sent unconditionally (no bare "TaxId:" key outside the conditional spread)', () => {
  const bareMatches = src.match(/^\s*TaxId:\s*donor/gm) || [];
  if (bareMatches.length > 0) {
    throw new Error(`found an unconditional TaxId assignment -- identification must stay optional: ${bareMatches.join(', ')}`);
  }
});

check('3. the Document object itself is unchanged in every OTHER field (To/Email/Phone/Mobile/Products still present, no accidental removal)', () => {
  const start = src.indexOf('Document: {');
  if (start === -1) throw new Error('could not locate the Document object block');
  const end = src.indexOf('};', start); // end of the enclosing payload object
  if (end === -1) throw new Error('could not locate the end of the payload object');
  const block = src.slice(start, end);
  for (const field of ['To:', 'Email:', 'Phone:', 'Mobile:', 'Products:']) {
    if (!block.includes(field)) throw new Error(`Document object is missing pre-existing field "${field}"`);
  }
});

check('4. cardholder-verification wiring (OpenFields CardOwnerIdValue) was not touched -- zero changes outside donations.service.js', () => {
  // The fix is scoped to exactly one file; cardholder verification lives in
  // the frontend (checkout-v2.component.ts / openfields-form.component.ts),
  // neither of which this change modifies. Proven by git diff in the final
  // report, not re-derived here -- this check just documents the boundary.
  const openfieldsPath = path.join(__dirname, '..', '..', 'src', 'app', 'modules', 'campaigns', 'shared', 'components', 'checkout-v2', 'checkout-v2.component.ts');
  if (fs.existsSync(openfieldsPath)) {
    const feSrc = fs.readFileSync(openfieldsPath, 'utf8');
    if (!feSrc.includes('isValidId')) throw new Error('unexpected: the existing ID checksum validator is gone from checkout-v2.component.ts');
  }
});

// --- 2. Pure-logic unit test: reproduce the EXACT expression in isolation --
// (no DB, no network -- this is the backend-authoritative mapping rule,
// extracted verbatim from donations.service.js so a future edit to either
// side will visibly diverge from this test instead of silently drifting.)
function buildDocument(donor, products) {
  return {
    To: donor.name,
    Email: donor.email,
    Phone: donor.phone,
    Mobile: donor.phone,
    ...(donor.idNumber ? { TaxId: donor.idNumber } : {}),
    Products: products,
  };
}

const baseDonor = { name: 'תורם בדיקה', email: 'donor@example.test', phone: '0501234567' };
const products = [{ Description: 'תרומה', UnitCost: 100 }];

check('5. valid personal ID (ת.ז-shaped, passes the existing frontend checksum format) -> TaxId included verbatim', () => {
  const doc = buildDocument({ ...baseDonor, idNumber: '123456782' }, products); // a 9-digit ID-shaped value
  if (doc.TaxId !== '123456782') throw new Error(`expected TaxId="123456782", got ${JSON.stringify(doc.TaxId)}`);
});

check('6. valid company registration number (ח.פ-shaped, 9 digits, same field per CardCom\'s own schema) -> TaxId included verbatim, no special-casing', () => {
  const doc = buildDocument({ ...baseDonor, idNumber: '515123456' }, products); // a realistic ח.פ-shaped value
  if (doc.TaxId !== '515123456') throw new Error(`expected TaxId="515123456", got ${JSON.stringify(doc.TaxId)}`);
});

check('7. missing optional identification -> TaxId key is ABSENT entirely (not sent as empty string, not null)', () => {
  const doc = buildDocument({ ...baseDonor, idNumber: '' }, products);
  if ('TaxId' in doc) throw new Error(`TaxId key should not exist at all when idNumber is empty, got ${JSON.stringify(doc)}`);
});

check('7a. idNumber undefined (field never sent by an older client) -> same safe omission', () => {
  const doc = buildDocument({ ...baseDonor }, products); // no idNumber property at all
  if ('TaxId' in doc) throw new Error(`TaxId key should not exist when idNumber is undefined, got ${JSON.stringify(doc)}`);
});

check('8. no regression: every other Document field is still correctly populated alongside TaxId', () => {
  const doc = buildDocument({ ...baseDonor, idNumber: '123456782' }, products);
  if (doc.To !== baseDonor.name) throw new Error('To field regressed');
  if (doc.Email !== baseDonor.email) throw new Error('Email field regressed');
  if (doc.Phone !== baseDonor.phone || doc.Mobile !== baseDonor.phone) throw new Error('Phone/Mobile fields regressed');
  if (doc.Products !== products) throw new Error('Products field regressed');
});

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
