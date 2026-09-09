// Single source of truth for the Israeli bank dropdown used by both MASAV
// setup surfaces (association self-service Settings + Super Admin Billing
// Ops drawer). Persists the official numeric bank code into the existing
// entity_masav_details.bank_code column -- no DB/schema change, this is
// display-only sugar over the same string value the field always held.
//
// Source (2026-09-09): Bank of Israel's identification-code policy page --
// https://www.boi.org.il/roles/supervisionregulation/payment-systems-oversight/psaccess/code/
// That page is blocked by Radware bot-protection for this project's own
// fetch tooling (confirmed directly, not assumed) -- every entry below was
// supplied and cross-checked by the user against that source, not
// independently re-verified by Claude against the raw page. If this list
// ever needs re-confirming, a human will need to open that URL directly.
//
// Deliberately limited to currently-relevant Israeli banks an association
// would actually hold its own account at -- the BOI table also lists
// payment/card companies (CardCom, Tranzila...), MASAV itself, and foreign
// banks, none of which belong in a "which bank is your account at" picker.
// Also deliberately excludes historical codes still listed by BOI (14 --
// Otsar HaHayal, 52 -- Poalei Agudat Israel): both are now served by Bank
// Igud/HaBinleumi's operations per BOI's own current listing, and how an
// association's account under either legacy bank should actually be
// identified for MASAV wasn't verified -- do not add them as independent
// choices without checking that first.
export interface IsraeliBank {
  code: string;
  name: string;
}

export const ISRAELI_BANKS: IsraeliBank[] = [
  { code: '4', name: 'בנק יהב' },
  { code: '10', name: 'בנק לאומי' },
  { code: '11', name: 'בנק דיסקונט' },
  { code: '12', name: 'בנק הפועלים' },
  { code: '17', name: 'בנק מרכנתיל דיסקונט' },
  { code: '18', name: 'One Zero' },
  { code: '20', name: 'בנק מזרחי טפחות' },
  { code: '31', name: 'הבנק הבינלאומי הראשון' },
  { code: '46', name: 'בנק מסד' },
  { code: '54', name: 'בנק ירושלים' },
];
