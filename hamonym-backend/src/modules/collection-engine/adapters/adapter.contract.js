// Collection provider adapter contract (2026-08-28, updated 2026-08-29) —
// see docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 6 and
// docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md.
// Every adapter module exports:
//
//   NOT_IMPLEMENTED: boolean
//     true means the Router must not create a collection_attempts row at
//     all for this method -- it records a reconciliation finding instead
//     (see collection.service.js). card is implemented (2026-08-29, see
//     cardcom-token-charge.adapter.js) now that the CardCom Do Transaction
//     contract has been verified against official docs. masav is still
//     NOT_IMPLEMENTED: no provider/bank-data model is decided.
//
//   async charge({ statementId, attemptId, amount, paymentInstrument, entityId })
//     -> { outcome: 'succeeded' | 'declined' | 'technical_failure' | 'ambiguous',
//          providerReference?: string, providerRawStatus?: string,
//          failureReason?: string }
//     Only called when NOT_IMPLEMENTED is false. This is the actual shape
//     collection.service.js calls with -- note it differs from an earlier
//     draft of this comment (statement/billingAccount objects); corrected
//     2026-08-29 to match the real caller, not the original design sketch.
//     Must never guess: a timeout or any response that doesn't unambiguously
//     confirm the charge happened is 'ambiguous', not 'technical_failure' --
//     see the design doc's section 6.5 on why ambiguity is a first-class
//     outcome, not an error to paper over with a blind retry.
//
//   async reconcile({ attemptId }) [optional -- only cardcom-token-charge
//     implements it so far]
//     -> { outcome: 'succeeded' | 'declined' | 'technical_failure' | 'not_found' | 'not_found_confirmed',
//          providerReference?: string, providerRawStatus?: string,
//          failureReason?: string }
//     Resolves an 'ambiguous' attempt by asking the provider directly, using
//     the SAME attemptId/ExternalUniqTranId originally submitted to charge()
//     -- never a new one. 'not_found' means the provider has no record of a
//     successful transaction under that id; it deliberately does NOT mean
//     "definitely never charged" (the provider may simply not index it yet)
//     -- how long to wait before treating not_found as final is an
//     undecided retry/business policy (design doc §9, open question #6), not
//     resolved by this function. Nothing in this codebase calls reconcile()
//     automatically yet -- no scheduled job wires it up, deliberately, until
//     that policy is decided. IMPORTANT: 'succeeded'/'declined'/
//     'technical_failure' from reconcile() are safe to feed straight into
//     collection.service.js's resolveAttempt(attemptId, statementId, outcome)
//     to finalize the attempt (it's the same outcome shape resolveAttempt
//     already handles from charge()) -- but 'not_found' is NOT a valid
//     collection_attempts.status and must never be passed to resolveAttempt
//     as-is; a caller must decide what to do with 'not_found' (per the
//     undecided policy above) before touching that row.
//
//     'not_found_confirmed' (added 2026-09-07, migration 064) is a SEPARATE,
//     genuinely terminal outcome -- do not conflate it with 'not_found'
//     above. It is returned only for CardCom's own documented
//     ResponseCode=9998 on GetTransactionByExternalUniqTran ("there is not
//     successful transaction for this ExternalUniqTranId"), verified live
//     against a real attempt -- an authoritative negative answer, not an
//     indexing-lag guess. It IS a valid collection_attempts.status (see
//     migration 064's CHECK constraint) and IS safe to feed straight into
//     resolveAttempt() exactly like 'succeeded'/'declined'/
//     'technical_failure' -- resolveAttempt's generic (non-'succeeded')
//     branch persists it, creates no Payment, and leaves the Statement
//     'open'. It is deliberately absent from
//     collection.service.js's ACTIVE_ATTEMPT_STATUSES, so once persisted a
//     fresh collection attempt on the same Statement is never blocked by it.
module.exports = {};
