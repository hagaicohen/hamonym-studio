const lowProfileClient = require('./lowprofile.client');
const cardcomClient = require('./cardcom.client');
const recurringClient = require('./recurring.client');

// The real CardCom provider for the DONATION rail (Phase B1, 2026-10-09).
//
// Scope: donations only. This is deliberately NOT a shared "CardCom
// provider" — the platform-billing rail (src/modules/billing/,
// src/modules/collection-engine/adapters/cardcom-token-charge.adapter.js)
// runs on its own terminal and its own HAMONYM_CARDCOM_* credentials, and
// must never resolve through here. See the DONATION_CARDCOM_FALLBACK_NOT_
// CONFIGURED guard in donations.service.js: the two rails were proven not
// interchangeable (2026-09-08/09) and a missing donation credential set must
// fail loudly rather than borrow the billing terminal's.
//
// Credential resolution stays entirely in donations.service.js
// (resolveDonationFallbackCredentials / credentialsFromEntityRow /
// resolveCardcomCredentials / resolveCardcomCredentialsForEntity). This
// facade never reads process.env and never queries the database — callers
// pass credentials in, exactly as they already did when they called the
// clients directly.
//
// Every method delegates through the client MODULE OBJECT rather than a
// destructured function reference, on purpose: scripts/test-business-clock-
// safety.js and several other tests monkey-patch the clients' exports after
// require time, and late binding keeps those traps effective through the
// facade.
module.exports = {
  name: 'cardcom',

  createLowProfile: (payload) => lowProfileClient.createLowProfile(payload),

  getLpResult: (args) => cardcomClient.getLpResult(args),

  createRecurring: (args) => recurringClient.createRecurring(args),

  updateRecurring: (args) => recurringClient.updateRecurring(args),

  getRecurringPaymentHistory: (args) => cardcomClient.getRecurringPaymentHistory(args),
};
