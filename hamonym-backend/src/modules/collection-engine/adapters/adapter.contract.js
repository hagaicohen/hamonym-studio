// Collection provider adapter contract (2026-08-28) — see
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 6.
// Every adapter module exports:
//
//   NOT_IMPLEMENTED: boolean
//     true means the Router must not create a collection_attempts row at
//     all for this method -- it records a reconciliation finding instead
//     (see collection.service.js). Both real adapters are NOT_IMPLEMENTED
//     today: card because there is no verified CardCom API call for
//     "charge this existing token once" (three existing CardCom calls in
//     this codebase are GetLpResult/LowProfile-Create/Recurring-v10, none
//     of which fit), masav because no provider/bank-data model is decided.
//
//   async charge({ statement, billingAccount, paymentInstrument })
//     -> { outcome: 'succeeded' | 'declined' | 'technical_failure' | 'ambiguous',
//          providerReference?: string, providerRawStatus?: string,
//          failureReason?: string }
//     Only called when NOT_IMPLEMENTED is false. Must never guess: a
//     timeout or any response that doesn't unambiguously confirm the charge
//     happened is 'ambiguous', not 'technical_failure' -- see the design
//     doc's section 6.5 on why ambiguity is a first-class outcome, not an
//     error to paper over with a blind retry.
module.exports = {};
