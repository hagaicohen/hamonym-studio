# Registration (מירוצים) — Context

Full summary of the Registration feature arc, for continuity in a new chat. Everything described here is implemented; the backend pieces (migrations, service queries, the multi-participant donation flow, the Registration Management query) were smoke-tested against **real data on the dev DB** (created, verified, then cleaned up — see §7). Nothing here is committed yet.

Companion reading, in order: [CAMPAIGN_PRESETS_VISION.md](./CAMPAIGN_PRESETS_VISION.md) (why "Preset ≠ Builder"), [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) (the original spec — historical: its central idea, "Registration Offering = a type of Offering," was later reversed, see §0), [DECISIONS.md](./DECISIONS.md) (every "why", dated — this doc is the "what/where", DECISIONS.md is the "why").

---

## 0. The one-sentence version (revised 2026-07-16)

**Registration is a distinct business model, not an Offering.** The feature originally reused `Offering.type === 'registration'` (the same array used for donation perks/gifts) — a deliberate, reasoned decision at the time. A colleague's WordPress-based reference implementation exposed that this leaked perk/gift language into the race flow, and structurally, a participant category isn't "a gift a donor receives" — it's who's participating and what they're paying. Registration Options now live in their own first-class table (`registration_options`), with their own Builder step, still no Schema engine / Rules engine / Form Builder. On the public page, Registration is treated as an **Action** (like Donate), not a Page Builder content block — the `donation-widget` block gains a "Register" action alongside Donate when a campaign has Registration Options, rather than adding a new block type.

**Correction, same day**: registering for the race and donating money were briefly (same-day) made *mutually exclusive* — the `donation-widget` fully replaced its Donate UI with the Register UI whenever Registration Options existed, so a race campaign had no way to just donate. That was wrong and has been fixed: both Actions now coexist in the widget (Register section, then an "או" divider, then the always-present Donate section) — two independent things a visitor can do, two separate checkout flows, never combined into one payment.

---

## 1. Architecture / data flow

```
Campaign Builder
    │
    ├── Offerings step   → Offering { id, title, description, minimumAmount, stock, imageUrl, featured? }
    │                       pure gift/perk concept again — no type/key
    │
    └── Registration step → RegistrationOption { id, key, title, description, price }
          entity manager also sets registrationFieldLabel/Icon (e.g. "🏃 מסלול", "🎫 כרטיס",
          "👤 סוג משתתף") — the concept's NAME is configurable per campaign, not hardcoded
    │
    ▼
Public Campaign Page (campaign-preview.component.ts)
    │
    ├── Offerings grid → generic multi-select cart (unchanged, pre-existing donation flow)
    ├── donation-widget block → if registrationOptions.length > 0: an ADDITIONAL "Register"
    │     section renders above the donation UI (same title/subtitle/ctaColor styling fields),
    │     with an "או" divider between them — the amount-picker/Donate section always renders
    │     too, unconditionally. Zero Registration Options → today's Donate-only rendering,
    │     byte-for-byte unchanged. startRegistration() opens Checkout in 'registration' mode —
    │     no specific option pre-selected (checkout-modal defaults to the first one);
    │     openCheckout() (the Donate button) opens it in 'donation' mode as always.
    ▼
Checkout Modal (checkout-modal.component.ts) — dual-mode component
    │
    ├── 'donation' mode: unchanged — amount + cart perks + donor form
    ├── 'registration' mode: Participant repeater (name + Registration Option select + optional
    │     shirt size, "+ הוסף משתתף"), payer contact fields kept SEPARATE from participant names
    │     (a parent can pay without racing themselves) — total = sum of each participant's option price
    ▼
POST /api/donations  { ..., rewards: [{title, minimumAmount}, ...one per participant],
                        participants: [{name, registrationOptionId, shirtSize}] }
    │
    ▼
donations.service.js#createDonation
    │
    ├── loadRegistrationOptions(campaignId, participants)   ← NEW: validates every
    │     registrationOptionId against the DB (exists, belongs to this campaign, is_active)
    │     BEFORE anything is written — rejects the whole request if any id is bad/foreign
    ├── INSERT INTO donations (...)                              ← unchanged, sole source of truth for money
    ├── processRegistrationDonation(donationId, campaignId, participants, registrationOptionsById)
    │     if participants.length > 0:
    │       INSERT INTO registration_orders (donation_id, campaign_id)   ← 1:1 with donation
    │       INSERT INTO registration_participants (...) × N              ← 1:N, one per participant
    │       option_key/option_title snapshotted from the DB-loaded option, NOT trusted client strings
    │     no status column on either table — always derived by joining to donations.status
    ▼
Registration Management page (/registrations, entity-wide)
    │
    └── GET /api/registrations/entity/:id?search=&page=&limit=
          JOIN registration_participants → registration_orders → donations → campaigns
          search across participant name / option title / payer name / payer email
          CSV export (client-side blob, same pattern as the Donations page)
```

---

## 2. Data model

**`campaigns.rewards`** (JSONB, unchanged name — see DECISIONS.md) — array of `Offering`, pure gift/perk concept again.

**`campaigns.registration_field_label` / `registration_field_icon`** (added migration `026`) — per-campaign scalar columns, the entity-manager-chosen name/icon for "what a Registration Option is called" on this campaign.

**`registration_options`** (new table, migration `026_registration_options.sql`):
```sql
id UUID PK, campaign_id UUID FK→campaigns,
key VARCHAR, title VARCHAR NOT NULL, description TEXT, price NUMERIC(10,2) NOT NULL,
sort_order INT, is_active BOOLEAN, created_at, updated_at
```
Synced from the frontend's `CampaignDraft.registrationOptions[]` array on every campaign save (`campaigns.service.js#syncRegistrationOptions` — delete-all-and-reinsert, not a slug-style upsert like `syncAmbassadors`, since options have no natural business key and the array is small/single-admin-edited).

**`registration_orders`** (migration `024_registration_orders.sql`, unchanged):
```sql
id UUID PK, donation_id UUID UNIQUE FK→donations, campaign_id UUID FK→campaigns, created_at
```

**`registration_participants`** (migration `024`, extended by `025` and `026`):
```sql
id UUID PK, registration_order_id UUID FK→registration_orders,
option_key VARCHAR, option_title VARCHAR,           -- snapshot (renamed from offering_key/offering_title in 026)
registration_option_id UUID FK→registration_options ON DELETE SET NULL,  -- live FK, added in 026
name VARCHAR NOT NULL,
shirt_size VARCHAR,
created_at
```
All migrations applied on the dev DB (`node scripts/migrate-024/025/026.js`, run after explicit confirmation it's the dev-only environment — see DECISIONS.md).

**Deliberately NOT added**: `birth_year`, `gender`, any age/custom-question field, stock/capacity limits on Registration Options, immutability enforcement on `key`/price after real registrations exist. Evolution Rules (`HAMONYM_ARCHITECTURE.md` §4) say don't build "in case." **Explicit forward-looking caution from the user**: if a future customer needs age/gender/meal-choice/insurance/etc., don't solve it by piling more fields onto `RegistrationOption` — that's the point at which a real extension model needs designing, not now.

---

## 3. Key files

**Frontend** (`hamonym-app`):
- `src/app/modules/campaigns/services/campaign-studio-state.service.ts` — `Offering` (pure gift again), `RegistrationOption`, `CampaignDraft.registrationOptions`/`registrationFieldLabel`/`registrationFieldIcon`
- `src/app/modules/campaigns/builder/steps/campaign-offerings-step/` — Builder UI for gifts only (reverted)
- `src/app/modules/campaigns/builder/steps/campaign-registration-step/` — **new**, Builder UI for Registration Options: field-label input + preset suggestion chips, option form, live `<select>` preview
- `src/app/modules/campaigns/builder/presets/campaign-presets.ts` — `registrationStepTitle`/`Subtitle`/`AddButtonLabel`/`registrationFieldLabelSuggestions` per preset
- `src/app/modules/campaigns/shared/components/campaign-stepper/` — 10 fixed steps now (Registration inserted as step 5, after Offerings)
- `src/app/modules/campaigns/studio/preview/campaign-preview/campaign-preview.component.ts` — `startRegistration()` (no-arg), donation-widget block conditionally renders as Register CTA
- `src/app/modules/campaigns/shared/components/checkout-modal/checkout-modal.component.ts` — dual-mode checkout, participant repeater, `registrationOptions`/`optionFor`/`registrationFieldLabel`
- `src/app/modules/campaigns/services/donation.service.ts` — `DonationPayload.participants[].registrationOptionId`
- `src/app/modules/registrations/pages/registrations-page/` — Registration Management, columns renamed `option_key`/`option_title`

**Backend** (`hamonym-backend`):
- `src/modules/campaigns/campaigns.service.js` — `syncRegistrationOptions`/`getRegistrationOptions`, wired into `createCampaign`/`updateCampaign`/`getCampaignById`/`getCampaignBySlug`/`getCampaignBySlugPublic`
- `src/modules/donations/donations.service.js` — `loadRegistrationOptions` (DB validation, new) + `processRegistrationDonation` (now snapshots from DB, not client)
- `src/modules/registrations/registrations.service.js` — renamed `offering_key`/`offering_title` → `option_key`/`option_title`
- `migrations/024_registration_orders.sql`, `025_registration_participant_shirt_size.sql`, `026_registration_options.sql`

**Tests**: `campaign-api.service.spec.ts`, `campaign-offerings-step.component.spec.ts`, `campaign-registration-step.component.spec.ts` (new), `campaign-preview.component.spec.ts`, `checkout-modal.component.spec.ts`, `campaign-stepper.component.spec.ts` — 33/33 passing.

---

## 4. Decisions worth knowing before touching this code

(Full text + reasoning in `DECISIONS.md`, dated 2026-07-14 through 2026-07-16 — this is just the index)

- Registration Options are a real table (`registration_options`), not JSONB — this is what finally let the backend validate a participant's chosen option (exists, belongs to the campaign, active) instead of trusting client-supplied strings.
- `RegistrationOption` and `Offering` are two distinct business models on purpose (a category/tier is not a gift) — they may share small UI pieces (price-input style, card layout) but never the same TS type or DB table.
- The concept's display name is per-campaign configurable (`registrationFieldLabel`/`Icon`) — "מסלול" fits a race, "סוג תורם" fits a donor-tier event, "כרטיס" fits a ticketed one. Not hardcoded.
- **No new Page Builder block type for Registration.** It's an Action (like Donate), not Content (like Story/Gallery/FAQ) — the existing `donation-widget` block switches behavior instead. Adding a dedicated block was explicitly rejected as the first step toward "Petitions Block / Events Block / Membership Block" sprawl.
- No `registrationEnabled` boolean — derived purely from `registrationOptions.length > 0`.
- `BlockType`'s `'rewards'` value, `CampaignTheme.rewardsBg`/`rewardCardBorder*`, `CampaignLayout.rewardsLayout`, and `Offering.minimumAmount` **all stay named `rewards*`/`minimumAmount` in code forever** — persisted as literal JSON keys in every existing campaign's `blocks`/`layout`/`rewards` columns.
- Registration Order is a snapshot layer attached to a Donation, never the reverse. Donation is the only source of truth for money; no separate status is ever stored on Registration Order/Participant/Option.
- **Registration does not use the generic donation cart at all** — two genuinely different flows ("pick an amount, maybe a perk" vs. "add participants, pick their options"), not a temporary shortcut.
- The payer and the participants are independent identities — a parent can register three kids without registering themselves.

---

## 5. Explicitly NOT built (by design)

- Any Schema/Rules/conditional-pricing engine — rejected explicitly, twice (once for the original Offering-based design, once again when Registration Options were pulled out into their own model).
- `birth_year`/`gender`/any custom participant field, stock/capacity limits, immutability enforcement on option `key`/price.
- A general-purpose form builder for registration fields — explicit caution from the user: when a real customer eventually needs age/meal-choice/insurance/etc., that's the point to design a real extension model, not to keep piling fields onto `RegistrationOption` ad hoc.
- QR codes, check-in, bib number assignment — next phase, only after Registration Management proves out.
- Coupons, waitlists, editing/cancelling a participant after payment.
- Re-deriving the donation's charged `amount` server-side from Registration Option prices — the donation `amount` field is still client-computed/trusted, same as every other donation on the platform (out of scope; a much larger, unrelated change).

## 6. Prior architecture (superseded 2026-07-16, kept for history)

The original build (2026-07-14/15) added `Offering.type: 'perk' | 'registration'` and reused `campaigns.rewards` for both gifts and race categories, with `registration_participants.offering_key`/`offering_title` as the snapshot columns. That data never existed in production (dev-only, test rows cleaned up) — no backward-compat/migration path was needed for the reversal. See `REGISTRATION_OFFERING_SPEC.md` for the full original reasoning (still useful for the Donation↔Registration Order relationship in §1.3, which is unchanged).

## 7. What's next (per explicit direction)

Registration Management (§1, `/registrations`) intentionally stops at: list, search, CSV export. Next, in order, only once there's real usage to justify each step:
1. (done) List + search + export.
2. QR / check-in / bib numbers — not started.

No further participant-form fields until a real customer asks for one.
