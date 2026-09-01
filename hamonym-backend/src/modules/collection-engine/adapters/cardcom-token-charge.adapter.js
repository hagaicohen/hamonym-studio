// Card rail adapter — implemented 2026-08-29 against the verified CardCom
// v11 "Do Transaction" contract. See
// docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md for the
// evidence trail (official swagger schema + CardCom's own support articles,
// not guessed) and docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md
// section 6 for the outcome semantics this adapter must produce.
//
// CVV2 is deliberately never sent. CardCom's "Step 3 — Token Charging" API
// doc states: "For token charging, the terminal must not require CVV from
// credit companies. Such a terminal does not verify the card's expiry date
// (only requires it to be in the future), does not check CVV, and ID
// verification is optional." entity_billing correctly never stores CVV
// (PCI DSS forbids retaining it past authorization) -- this is the
// documented CardCom model for token/standing-order charging, not a
// workaround around a missing field.
//
// PRECONDITION not yet verified live (blocked by the open 603 "invalid
// username/password" issue on HAMONYM_CARDCOM_TERMINAL): CardCom must have
// actually provisioned that terminal as a token/no-CVV-model terminal
// (support.cardcom.solutions article 360002653694 describes this as
// something requested from CardCom, not automatic for every terminal). If
// it hasn't been, CardCom will reject or decline token charges -- that
// surfaces as an ordinary provider response handled by the classification
// below, never a silent wrong charge, so this adapter is safe to ship ahead
// of that confirmation.
const cardcomClient = require('../../payment/cardcom/cardcom.client');

exports.NOT_IMPLEMENTED = false;

// entity_billing.exp_month/exp_year are stored as CardCom returned them at
// tokenization time (TokenInfo.CardMonth/CardYear, both plain integers per
// the official schema -- no example value published, so whether CardYear
// comes back 2-digit or 4-digit has never been observed against a real
// token: entity_billing has 0 rows as of this writing). Built defensively so
// it produces a correct MMYY either way, instead of assuming one.
function buildCardExpirationMMYY(expMonth, expYear) {
  if (!expMonth || !expYear) return null;
  const mm = String(expMonth).padStart(2, '0');
  const yyRaw = String(expYear);
  const yy = yyRaw.length >= 4 ? yyRaw.slice(-2) : yyRaw.padStart(2, '0');
  return `${mm}${yy}`;
}

// Classifies a response CardCom actually returned (HTTP 200 -- the request
// reached CardCom and got a definitive answer about it). Raw ResponseCode
// and Description are always preserved verbatim in providerRawStatus/
// failureReason -- same principle as detail-recurring.handler.js's
// `cardcom_recurring_<status>`, never an invented taxonomy.
function classifyChargeResponse(data) {
  const responseCode = data?.ResponseCode;
  const rawStatus = `${responseCode}:${data?.Description || ''}`;

  if (responseCode === 0) {
    return {
      outcome: 'succeeded',
      providerReference: data?.TranzactionId != null ? String(data.TranzactionId) : null,
      providerRawStatus: rawStatus,
    };
  }

  if (responseCode === 608) {
    // The same ExternalUniqTranId was already submitted to CardCom. This
    // response alone does not tell us whether that earlier submission
    // succeeded -- never resolved here. reconcile() (below) answers it via
    // GetTransactionByExternalUniqTran, same principle as
    // stale-pending-donations.job.js: ask the provider, don't guess.
    return {
      outcome: 'ambiguous',
      providerRawStatus: rawStatus,
      failureReason: 'external_uniq_tran_id_duplicate_608',
    };
  }

  // Any other non-zero ResponseCode is a definitive provider answer about
  // this specific card/token (decline, blocked card, invalid token, etc) --
  // not a transport problem, so it is never retried automatically.
  return {
    outcome: 'declined',
    providerRawStatus: rawStatus,
    failureReason: `cardcom_response_${responseCode}`,
  };
}

exports.charge = async ({ attemptId, amount, paymentInstrument }) => {
  const terminalNumber = process.env.HAMONYM_CARDCOM_TERMINAL;
  const apiName = process.env.HAMONYM_CARDCOM_API_NAME;

  const cardExpirationMMYY = buildCardExpirationMMYY(
    paymentInstrument?.exp_month,
    paymentInstrument?.exp_year
  );

  try {
    const data = await cardcomClient.chargeToken({
      terminalNumber,
      apiName,
      amount,
      token: paymentInstrument?.token,
      cardExpirationMMYY,
      // collection_attempts.id is the approved ExternalUniqTranId (design
      // doc §"CardCom v11 — CLOSED / VERIFIED"): stable per attempt, so a
      // process crash-and-retry against the SAME attempt never mints a new
      // id, and CardCom's own 608 duplicate detection protects us if we (or
      // a retry) ever submit it twice.
      externalUniqTranId: attemptId,
    });

    return classifyChargeResponse(data);
  } catch (err) {
    if (err.response) {
      // CardCom answered synchronously with 400/401 (see the Do Transaction
      // swagger responses) -- a request-format or credentials problem,
      // rejected before any card network activity. Never guessed as
      // ambiguous: this class of failure is documented as pre-charge
      // validation, so there is nothing to reconcile.
      return {
        outcome: 'technical_failure',
        providerRawStatus: `http_${err.response.status}`,
        failureReason: `cardcom_http_${err.response.status}`,
      };
    }

    // No response at all -- timeout, connection reset, DNS failure. We
    // cannot tell whether CardCom received and processed the charge before
    // the connection dropped. Never guess: ambiguous, resolved later via
    // reconcile(), not assumed safe to blindly retry.
    return {
      outcome: 'ambiguous',
      failureReason: `cardcom_transport_error: ${err.message}`,
    };
  }
};

// Resolves an 'ambiguous' collection_attempts row by asking CardCom
// directly, via the exact same ExternalUniqTranId originally submitted to
// charge(). See adapter.contract.js for the full return-shape contract.
// Nothing in this codebase invokes this automatically yet -- see that file
// for why.
exports.reconcile = async ({ attemptId }) => {
  const terminalNumber = process.env.HAMONYM_CARDCOM_TERMINAL;
  const apiName = process.env.HAMONYM_CARDCOM_API_NAME;

  let data;
  try {
    data = await cardcomClient.getTransactionByExternalUniqTran({
      terminalNumber,
      apiName,
      externalUniqTranId: attemptId,
    });
  } catch (err) {
    // The lookup call itself failed technically -- this tells us nothing
    // about the original charge. Stay ambiguous rather than concluding
    // anything from a failed lookup.
    return {
      outcome: 'ambiguous',
      failureReason: `cardcom_lookup_transport_error: ${err.message}`,
    };
  }

  const responseCode = data?.ResponseCode;
  const rawStatus = `${responseCode}:${data?.Description || ''}`;

  if (responseCode === 0 && data?.TranzactionId != null) {
    return {
      outcome: 'succeeded',
      providerReference: String(data.TranzactionId),
      providerRawStatus: rawStatus,
    };
  }

  // CardCom has no successful transaction on record under this id. This
  // does NOT mean "definitely never charged" -- see adapter.contract.js.
  return { outcome: 'not_found', providerRawStatus: rawStatus };
};
