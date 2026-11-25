# Multi-currency donations (ILS / USD / EUR)

Status (2026-11-06): **implemented locally and disabled.** Migration 087 is
prepared and is **not** applied to production. USD/EUR stay off until the
CardCom and FIN-11 questions below are answered, and the flags are switched
on deliberately.

Evidence tags: **Verified** = checked against the live system or provider.
**Documented** = stated in the provider's official documentation, but not
exercised against our terminal. **Unknown** = must be confirmed before release.

## 1. What a donor sees

- ILS is the default. A campaign offers USD/EUR only when its manager turns
  them on (Studio, "הגדרות תרומה", "מטבעות לתרומה"), **and** the platform
  has them enabled (`GET /api/donations/currencies`). Until then the public
  page shows ₪ only. The Studio shows the choice with a note.
- The selector (`₪ ILS | $ USD | € EUR`) appears in the donation widget and in
  Checkout V2. Checkout V2 is used by both regular campaigns and quick
  donation pages. It is a radiogroup with `aria-checked`, and its notices use
  `aria-live`.
- Each currency has its own presets: the campaign's ILS amounts, or round
  amounts in USD/EUR that the manager can edit (defaults 18/36/54/100/180/360).
  No preset is ever a converted shekel amount.
- Switching currency **clears** the chosen amount and says so. An amount is
  never converted. Gifts ("תשורות") and registration are priced in ILS, so
  they are ILS-only; the server refuses the combination (`ITEMS_REQUIRE_ILS`).
- The charged currency is shown in the checkout footer, on the payment step
  ("החיוב יתבצע בדולר ארה״ב ($): …"), on the success screen and on the
  success page.

## 2. CardCom (v11 swagger, fetched 2026-11-06)

| Question | Answer | Tag |
|---|---|---|
| How to charge in a currency | `LowProfile/Create` → `ISOCoinId`: "1 - ILS, 2 - USD, else ISO Coin from list (ISO 4217)". EUR = 978. An `AdvancedDefinition.ISOCoinName` alternative also exists. | Documented |
| Currency in the confirmation | `GetLpResult` → `TranzactionInfo.CoinId` (same codes) and `Amount` | Documented |
| Does our terminal accept USD/EUR | Terminal setting at CardCom | **Unknown** |
| Settled in ILS or original currency | `TransactionInfo` carries no settlement amount or rate. `GET /api/v11/Financial/FinancialTransactions` carries `DepositeCurrency`, `DepositeAmount`, `CurrencyOrIndexRate` | Documented / **Unknown for our account** |
| OpenFields | OpenFields consumes the LowProfile created with `ISOCoinId`; it has no currency of its own | Documented |
| Recurring | Created through the legacy `/interface/RecurringPayment.aspx`. `RecurringPayments.FinalDebitCoinId` is already sent (it was hard-coded to `1`); v11 `ExtRecurringPaymentsRsp.FinalDebitCoinId` documents "1 NIS, 2 USD, else ISO". The legacy interface's own documentation for non-1 values was not found | **Unknown** |
| DetailRecurring webhook | The handler reads `Sum`/`Status`; whether the payload names the charged currency is not documented | **Unknown** |
| Receipt/document currency | `DocumentLP` has no currency field; presumably the transaction currency | **Unknown** |

What the code does:
- ILS requests are byte-identical to before: `ISOCoinId` is omitted, and
  recurring still sends `FinalDebitCoinId=1`.
- USD/EUR send `ISOCoinId` 2 and 978, and recurring sends the authorized coin.
- The verification gate (Gate v1) now expects the donation's own coin id
  instead of the constant 1. A mismatched currency or amount is **held**
  (`gate_v1_mismatch` finding, admin notification) and never marked paid.
- Recurring reconciliation holds a history row whose `FinalDebitCoinID`
  differs from the instruction's currency (`recurring_charge_currency_mismatch`).
- The CardCom-issued recurring receipt lookup compares the expected coin.
- No call to the CardCom Financial API was added: that endpoint is outside the
  pilot provider boundary and has not been exercised against our account.
  The `settlement_*` columns are ready for it.

## 3. Exchange rates

- Source: **Bank of Israel representative rate** ("שער יציג"), from BoI's
  public SDMX API (Verified 2026-11-06):
  `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS?startperiod=…&endperiod=…&format=csv`
  (and `RER_EUR_ILS`). There is one row per business day, with no row on
  weekends or holidays. USD/EUR have `UNIT_MULT=0`, meaning per 1 unit; any
  other multiplier is refused.
- **Rule:** a payment on Israel date D uses the latest representative rate
  published for a date **before** D, i.e. the rate already known when D
  began. Weekends and holidays therefore use the previous business day. The
  rule doesn't depend on the time of day of the lookup, so a rate resolved
  late (after an outage) is the same rate an immediate lookup would have
  used. A gap of more than 7 days is treated as missing data. *(Accounting
  convention to confirm, see §7.)*
- **Storage:** every resolution is stored in `exchange_rate_resolutions`
  (source, currency, for_date, rate_date, rate, series). The table is
  immutable. A stored resolution is reused; BoI is not asked again.
- **No fallback.** If BoI is unreachable and the date was never resolved, the
  lookup throws `FX_RATE_UNAVAILABLE`. No rate is invented, extrapolated or
  borrowed from another date.
- **Payment never fails because of the rate source.** A confirmed payment is
  marked paid with `fx_status='pending'`, recorded as an `fx_rate_pending`
  finding, and left out of campaign progress. The job
  `fx-snapshot-backfill`, plus `resolvePendingFx()`, later resolves the rate
  for the payment's own date and adds the ILS equivalent exactly once. The
  job is scheduled only while a foreign currency is enabled.
- **Arithmetic:** the ILS equivalent is computed **in PostgreSQL**
  (`ROUND(amount * fx_rate, 2)`, numeric, half away from zero) by the
  migration's trigger. `money.js` repeats the rule in integer minor units for
  display and verification. The test compares it with PostgreSQL on 500
  random cases.
- This is the representative rate, **not** the rate the card network or
  CardCom used. The UI and CSV label the figure "שווה ערך בש״ח (שער יציג)" and
  never present it as the amount the nonprofit received.

## 4. Data model (migration 087)

`donations`:
- `amount` is unchanged in meaning: the charged amount, in `currency`.
- New columns:
  - `currency` (ILS/USD/EUR, default ILS, immutable);
  - `amount_ils`;
  - `fx_rate`, `fx_rate_source`, `fx_rate_date`;
  - `fx_status` (not_required / pending / resolved);
  - `provider_amount`, `provider_coin_id` (what CardCom confirmed);
  - `settlement_amount`, `settlement_currency`, `settlement_rate`, `settlement_source` (nothing fills these yet).
- Trigger `donations_sync_ils_equivalent`:
  - ILS rows always have `amount_ils = amount` and `fx_rate = 1`;
  - USD/EUR rows are `pending` until a complete snapshot is supplied, at which
    point the trigger computes `amount_ils` itself;
  - a resolved snapshot can never change, and the currency can never change.
- `CHECK donations_fx_consistency` enforces the three states.
- The existing paid-immutability trigger is untouched and still applies.

`recurring_instructions.currency` holds the donor-authorized currency and is
immutable. `receipts.currency` is new.

Existing rows: the migration fills `amount_ils = amount` for every
historical (ILS) donation. Verified on a copy with 66 donations (46 paid):
totals identical, `updated_at` untouched, none of the frozen columns written.

Rollback: `scripts/rollback-087-donation-multi-currency.sql`. It refuses to
run while any non-ILS record exists.

## 5. Where ILS was assumed, and what changed

- **Campaign progress** (`campaigns.current_amount`) is in ILS. It now adds
  `amount_ils`, or nothing while pending, in `markDonationPaid`, recurring
  charges and the backfill. The `aggregate-consistency` job now checks
  against `SUM(amount_ils)`.
- **Reports, dashboards, KPIs, donor totals, top donors, ambassador totals
  and the platform dashboard** sum `amount_ils`. For ILS this is identical to
  before.
- **Lists** (admin donations, platform browser, public donors, live toasts,
  my donations, success page) show the original amount with its own symbol.
  The admin list adds "≈ ₪" for foreign donations.
- **The CSV export** now has three separate columns: original amount,
  currency, and the ILS equivalent (representative rate).
- **Ambassador attribution** is unchanged. A foreign donation counts toward
  the ambassador by its ILS equivalent.
- **Manual donations and registration** stay ILS (both priced in ILS).

## 6. FIN-11 and commissions (not changed)

**FIN-11 code is untouched.** The test asserts that no file under
billing-engine, collection-engine, platform/collection-ops or the FIN-11 jobs
changed.

Today, statement calculation sums `donations.amount` for every paid donation
(`calculation.service.js`). The same sum is used by Collection Ops' gross
amounts, card collection thresholds and MASAV exports. If a USD donation
became paid, it would be billed 3% + VAT as if `$100` were `₪100`. That is
why foreign currency needs `HAMONYM_FX_BILLING_POLICY_CONFIRMED`, and this
work does not set it.

Decisions needed before that flag is set:
1. What is the commission base for a foreign donation: the representative-rate
   ILS equivalent (known at payment), the actual settled ILS amount (known
   only after settlement), or a commission in the original currency?
2. A pending rate means the ILS base is unknown at payment time. Is such a
   donation billed in the period it was paid, or in the period its rate was
   resolved (`billing_effective_at` is currently the payment time)?
3. How does a difference between the representative-rate equivalent and the
   settled amount affect statements that are already approved? Should it be a
   statement adjustment, or ignored?
4. Card collection thresholds and outstanding balances are in ILS: confirm
   they apply to the ILS base chosen in (1).
5. MASAV exports are ILS-only by nature. Confirm that the commission is
   always collected in ILS.
6. Reconciliation of foreign settlements against CardCom's Financial API: who
   owns it, and how often?

Once decided, the change is local: compute the statement base from the chosen
column in `calculation.service.js#computeAmounts` (and the Collection Ops
gross queries), with FIN-11's own tests and approval.

## 7. Receipts, tax and accounting (needs professional confirmation)

Our internal `receipts` row is an audit record. **CardCom issues the
official donation receipt.** Nothing here invents a legal rule.

Questions for the accountant or legal advisor:
1. A donation receipt (קבלה על תרומה, section 46) for a donation paid in USD
   or EUR: must it state the amount in ILS, in the original currency, or both?
   Which rate (representative rate of which day), and must the rate and its
   date be printed?
2. Can CardCom's document for a foreign-currency transaction serve as the
   section 46 receipt as issued? (CardCom's document has no currency field of
   its own; see §2.)
3. Does Israel Invoices (allocation number) apply to foreign-currency donation
   receipts, and on which amount?
4. Is "the representative rate known at the start of the payment day" (§3)
   acceptable for the ILS equivalent in reports, or should it be the rate of
   the payment day itself, or the settlement rate?
5. Annual donor statements: original currency, ILS, or both?

## 8. Switches (all off by default)

| Variable | Meaning |
|---|---|
| `HAMONYM_FX_DONATIONS_ENABLED=true` | CardCom confirmed USD/EUR LowProfile charging on the terminal(s), and an end-to-end test was done |
| `HAMONYM_FX_BILLING_POLICY_CONFIRMED=true` | §6 is decided and implemented |
| `HAMONYM_FX_RECURRING_ENABLED=true` | CardCom confirmed foreign recurring and the DetailRecurring currency (§2) |
| `HAMONYM_FX_CURRENCIES=USD,EUR` | Optional narrowing |

USD/EUR are offered only when the first **two** are set. Recurring also needs
the third.

## 9. Before production release

1. CardCom: confirm in writing that the terminal(s) accept USD and EUR through
   LowProfile (`ISOCoinId` 2/978) and through OpenFields; how foreign
   transactions settle (currency, timing, rate); whether `FinalDebitCoinId` 2/978
   works on `RecurringPayment.aspx` and what the DetailRecurring payload
   contains; and what currency the issued document uses.
2. Make one real low-value USD and one EUR payment on a test terminal (not
   during development). Confirm `TranzactionInfo.CoinId`, the document, and
   the settlement in the Financial API.
3. Decide §6 (FIN-11) and §7 (receipts), and implement the commission base
   with FIN-11's own review.
4. Apply migration 087, with approval and a backup, **before** deploying the
   backend that uses it (the code requires the new columns). Record it in
   `docs/MIGRATION_HISTORY_NOTES.md`.
5. Deploy the backend and frontend with the flags off. Confirm that ILS
   checkout, webhook and recurring behave exactly as before.
6. Turn on `HAMONYM_FX_DONATIONS_ENABLED` and
   `HAMONYM_FX_BILLING_POLICY_CONFIRMED` (recurring separately, later).
   `fx-snapshot-backfill` is scheduled automatically from then on.
7. Watch `gate_v1_mismatch`, `fx_rate_pending` and
   `recurring_charge_currency_mismatch` findings for the first weeks.

## 10. Tests

- Backend: `node scripts/test-multi-currency-donations-postgres.cjs`, 26 checks
  on an isolated PostgreSQL clone, with fixture CardCom and BoI responses and
  all external HTTPS refused.
- `scripts/test-fin11-carry-forward-postgres.cjs` builds its own schema. It now
  adds 087's columns and trigger to that private schema, taken from the
  migration file.
- Frontend: `src/app/modules/campaigns/multi-currency.spec.ts`.
