// Gate v1 (frozen 2026-08-28) — business-field cross-validation of a
// GetLpResult response against the donation it claims to close, run after
// CardCom's own top-level ResponseCode already says the LowProfile session
// succeeded. Independent of the CardCom CreateDate timezone question (F2's
// provider_charged_at population, a separate concern) — every check here is
// a plain equality/amount comparison with no time semantics involved, so it
// is not blocked by that open question.
//
// A failure here means "CardCom's own answer doesn't line up with what we
// expect" — not a network/auth/technical failure (those still throw and hit
// the existing retry path) — so it never marks the donation paid and never
// touches cardcom_webhook_events.error; the caller is expected to hold the
// donation and record a reconciliation_findings row instead.
const ISRAELI_SHEKEL_COIN_ID = 1;

function toAgorot(amount) {
  return Math.round(Number(amount) * 100);
}

function evaluateGateV1({ result, donation, donationId }) {
  const reasons = [];
  const info = result?.TranzactionInfo;

  if (!info) {
    reasons.push('tranzaction_info_missing');
  } else {
    if (info.ResponseCode !== 0) reasons.push('tranzaction_response_code_mismatch');
    if (toAgorot(info.Amount) !== toAgorot(donation.amount)) reasons.push('amount_mismatch');
    if (info.CoinId !== ISRAELI_SHEKEL_COIN_ID) reasons.push('coin_id_mismatch');
  }

  if (String(result?.ReturnValue) !== String(donationId)) reasons.push('return_value_mismatch');
  if (String(result?.LowProfileId) !== String(donation.low_profile_id)) reasons.push('low_profile_id_mismatch');

  return {
    pass: reasons.length === 0,
    reasons,
    // Whitelisted primitives only — the full TranzactionInfo object is
    // never persisted into reconciliation_findings.details.
    comparison: {
      dbAmount: donation.amount,
      cardcomAmount: info?.Amount ?? null,
      cardcomCoinId: info?.CoinId ?? null,
      cardcomTranzactionResponseCode: info?.ResponseCode ?? null,
      cardcomReturnValue: result?.ReturnValue ?? null,
      cardcomLowProfileId: result?.LowProfileId ?? null,
      dbLowProfileId: donation.low_profile_id,
    },
  };
}

module.exports = { evaluateGateV1 };
