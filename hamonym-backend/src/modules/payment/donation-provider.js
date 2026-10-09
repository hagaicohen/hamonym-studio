const realCardcomDonationProvider = require('./cardcom/donation.provider');

// The single resolution point for the donation rail's payment provider
// (Phase B1, 2026-10-09).
//
// Phase B1 has exactly ONE provider: real CardCom. There is no simulated
// provider, and HAMONYM_SIMULATION_MODE deliberately has no say here — the
// business-time clock (src/lib/clock.js, Phase A) moves time, it does not
// and must not redirect money. Introducing a second provider is Phase B2's
// job, and when it happens this function is the only place that has to
// learn how to choose (fail-closed), rather than every donation call site.
function getDonationProvider() {
  return realCardcomDonationProvider;
}

module.exports = { getDonationProvider };
