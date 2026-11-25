# 03 - Authentication, media and payments
> Inspection date: 2026-11-24. Evidence is local code and migration files, not a deployed-schema or runtime certification. No application/configuration/test changes, builds, test suites, API mutations, or database operations were performed.
>
> Source aliases: **F** = `C:/DEV/HamonymStudio/hamonym-app` (frontend/main checkout); **B** = `C:/DEV/HamonymStudio/hamonym-backend` (sibling backend in the parent repository); **L** = `F/hamonym-backend` (divergent nested backend). Do not combine these copies silently. B is the backend mapped below; deployment alignment remains a release prerequisite. Claude's conversion files are untouched.


## Authentication and permissions
Reuse the existing login/token flow; do not introduce Studio identities. Backend requireAuth verifies JWT and returns 401 for missing/invalid/expired credentials. Entity membership is checked against user_entities for campaign access; frontend role checks are not server authorization. Entity status draft is currently rejected by createCampaign. Editing/publication/payment permissions are separate concerns: the approved future policy allowing draft organizations to author drafts is not implemented by this report.

Publication checks include title, slug, positive target and dates unless ongoing. Minimal page format bypasses Hero checks, not the positive-target requirement. Public campaign/payment availability additionally requires an active entity and published, non-hidden/non-deleted campaign. request-publish records a request; organization approval can subsequently publish eligible requests. Preserve both paths.

Evidence: [B/src/modules/campaigns/campaigns.routes.js:10](C:/DEV/HamonymStudio/hamonym-backend/src/modules/campaigns/campaigns.routes.js#L10); [B/src/modules/campaigns/campaigns.service.js:216](C:/DEV/HamonymStudio/hamonym-backend/src/modules/campaigns/campaigns.service.js#L216); [B/src/modules/campaigns/campaigns.service.js:166](C:/DEV/HamonymStudio/hamonym-backend/src/modules/campaigns/campaigns.service.js#L166); [B/src/modules/campaigns/campaigns.service.js:1291](C:/DEV/HamonymStudio/hamonym-backend/src/modules/campaigns/campaigns.service.js#L1291).

## Media
Existing authenticated POST /api/media/upload accepts multipart file/folder, uploads to Supabase media storage and returns a public URL. Supabase credentials stay on the server. No media-list/delete/ownership-library API was verified in this module; don't promise a complete media library from this upload endpoint.

Studio mapping v4.48 uses local IndexedDB references hamonymmedia:<id>. These cannot render on another browser/public page. **PROPOSED:** asynchronously upload referenced blobs through the existing API and substitute accepted URLs in a captured save snapshot. Failed uploads must fail remote save clearly, without claiming persistence. Keep recovery data locally and avoid embedding base64 blobs in campaign JSON.

Evidence: [B/src/modules/media/media.routes.js:7](C:/DEV/HamonymStudio/hamonym-backend/src/modules/media/media.routes.js#L7).

## Payment flow and authority
1. Existing Angular checkout creates a donation via POST /api/donations. Backend revalidates campaign/entity eligibility, amounts/currency, rewards/options and commercial readiness.
2. Backend creates pending donation and Cardcom LowProfile session using server credentials, with donation ID in ReturnValue. Existing checkout/OpenFields handles card submission; Studio must not implement another card form or terminal.
3. Cardcom webhook passes secret/idempotency processing and provider verification. Stored LowProfile identity, amount, currency and ReturnValue are checked before marking paid. Browser redirects do not establish payment success.
4. markDonationPaid updates payment state, ILS totals, supporter count and receipt finalization transactionally; public status lookup drives the success screen. Campaign saving has no equivalent all-write transaction.
5. Public campaign totals come from accepted payments, not cart totals or Studio demo counters.

Evidence: [B/src/modules/donations/donations.service.js:226](C:/DEV/HamonymStudio/hamonym-backend/src/modules/donations/donations.service.js#L226); [B/src/modules/donations/donations.service.js:779](C:/DEV/HamonymStudio/hamonym-backend/src/modules/donations/donations.service.js#L779); [B/src/modules/donations/donations.service.js:843](C:/DEV/HamonymStudio/hamonym-backend/src/modules/donations/donations.service.js#L843); [B/src/modules/payment/handlers/payment.handler.js:51](C:/DEV/HamonymStudio/hamonym-backend/src/modules/payment/handlers/payment.handler.js#L51); [B/src/modules/payment/verification-gate.js:3](C:/DEV/HamonymStudio/hamonym-backend/src/modules/payment/verification-gate.js#L3).

### Recurring, installments and races
Recurring instructions are separate lifecycle records and use recurring-provider callbacks after initial signup/payment. Monthly recurring contributions and card installments are different mechanisms; never map the prototype's monthly count to arbitrary payment installments. Registration orders/participants and priced registration options exist, but do not establish a complete race/heat/capacity engine. Reward and registration charges must use actual backend IDs and pricing.

Evidence: [B/migrations/044_recurring_instructions.sql:7](C:/DEV/HamonymStudio/hamonym-backend/migrations/044_recurring_instructions.sql#L7); [B/migrations/067_recurring_donor_requested_installments.sql:12](C:/DEV/HamonymStudio/hamonym-backend/migrations/067_recurring_donor_requested_installments.sql#L12); [B/migrations/024_registration_orders.sql:9](C:/DEV/HamonymStudio/hamonym-backend/migrations/024_registration_orders.sql#L9).

### Preview safety
Disable payment initiation, registration, ambassador join and comment submission in preview; retain read-only navigation/content switching. The local pilot-provider boundary's mock/test label is **not** assurance of safety: its allowlist permits real Cardcom requests. Never determine transactional safety from that label. No transactions were initiated here.

