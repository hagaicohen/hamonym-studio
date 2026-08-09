// TODO — DetailRecurring: an actual recurring charge attempt (SUCCESSFUL /
// PENDINGFORPROCESSING / DEBTAUTOBILLING / LOSTDEBT / PAYBYOTHERE / ONHOLD).
// This is where a real state machine becomes necessary — see the Tech Lead
// review discussion referenced in docs/CARDCOM_INTEGRATION.md; markDonationPaid's
// simple `status != 'paid'` guard is not sufficient once these statuses are
// in play. Not implemented until a real payload is captured.
exports.handle = async (_payload) => {};
