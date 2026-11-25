-- Local preparation only. Shared application requires explicit migration approval.
-- 087: multi-currency donations (ILS / USD / EUR). docs/finance/MULTI_CURRENCY_DONATIONS.md
--
-- donations.amount keeps meaning "the amount charged, in donations.currency"
-- (what CardCom charges and what the verification gate compares). Every
-- existing row is ILS, so its meaning is unchanged. The new amount_ils is the
-- ILS equivalent used for campaign progress and reports:
--   ILS rows      amount_ils = amount, kept in sync by trigger (fx_status 'not_required');
--   USD/EUR rows  'pending' until a representative-rate snapshot is taken, then
--                 'resolved' with amount_ils = ROUND(amount * fx_rate, 2), computed
--                 here in numeric so the application never multiplies money in floats.
-- The snapshot is write-once: a resolved rate never changes, so historical
-- ILS equivalents never move.
--
-- FIN-11 is not touched: billing still reads donations.amount. Foreign-currency
-- donations stay disabled by configuration until the commission policy is
-- decided (see the doc above), so no non-ILS row can reach billing.
--
-- Additive: new columns with defaults, new tables, new triggers. The only data
-- change is the one-time fill of the new columns on existing (ILS) rows; it
-- touches none of the columns frozen by donations_enforce_paid_immutability.
-- Rollback: scripts/rollback-087-donation-multi-currency.sql
BEGIN;

-- ── Representative-rate resolutions (cache + audit trail) ──────────────────
-- One row per (source, currency, date the rate was needed for). rate_date is
-- the Bank of Israel publication date actually used: the latest published
-- before for_date (weekends/holidays fall back to the previous business day).
CREATE TABLE public.exchange_rate_resolutions (
  source       varchar(40) NOT NULL,
  currency     varchar(3)  NOT NULL,
  for_date     date        NOT NULL,
  rate_date    date        NOT NULL,
  rate         numeric(12,6) NOT NULL,
  series_code  varchar(40) NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, currency, for_date),
  CONSTRAINT exchange_rate_resolutions_currency_check CHECK (currency IN ('USD', 'EUR')),
  CONSTRAINT exchange_rate_resolutions_rate_positive CHECK (rate > 0),
  CONSTRAINT exchange_rate_resolutions_rate_date_before CHECK (rate_date < for_date)
);

CREATE FUNCTION public.exchange_rate_resolutions_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exchange rate resolution (%, %, %) is immutable', OLD.source, OLD.currency, OLD.for_date;
END;
$$;
CREATE TRIGGER trg_exchange_rate_resolutions_immutable
  BEFORE UPDATE OR DELETE ON public.exchange_rate_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.exchange_rate_resolutions_block_change();

ALTER TABLE public.exchange_rate_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exchange_rate_resolutions FROM PUBLIC, anon, authenticated;

-- ── Donations ──────────────────────────────────────────────────────────────
ALTER TABLE public.donations
  ADD COLUMN currency            varchar(3)  NOT NULL DEFAULT 'ILS',
  ADD COLUMN amount_ils          numeric(12,2),
  ADD COLUMN fx_rate             numeric(12,6),
  ADD COLUMN fx_rate_source      varchar(40),
  ADD COLUMN fx_rate_date        date,
  ADD COLUMN fx_status           varchar(16) NOT NULL DEFAULT 'not_required',
  -- What CardCom confirmed (GetLpResult TranzactionInfo.Amount / CoinId).
  ADD COLUMN provider_amount     numeric(12,2),
  ADD COLUMN provider_coin_id    integer,
  -- Actual settlement, when known (CardCom Financial API / bank statement).
  -- Nothing fills these yet; kept separate so the representative-rate
  -- equivalent is never presented as the amount the nonprofit received.
  ADD COLUMN settlement_amount   numeric(12,2),
  ADD COLUMN settlement_currency varchar(3),
  ADD COLUMN settlement_rate     numeric(12,6),
  ADD COLUMN settlement_source   varchar(40),
  ADD CONSTRAINT donations_currency_check CHECK (currency IN ('ILS', 'USD', 'EUR')),
  ADD CONSTRAINT donations_fx_status_check CHECK (fx_status IN ('not_required', 'pending', 'resolved')),
  ADD CONSTRAINT donations_settlement_currency_check CHECK (settlement_currency IS NULL OR settlement_currency IN ('ILS', 'USD', 'EUR'));

-- ILS rows mirror amount; foreign rows get their equivalent only from a
-- snapshot, computed here, and never change afterwards.
CREATE FUNCTION public.donations_sync_ils_equivalent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'donation % currency cannot change', OLD.id;
  END IF;

  IF NEW.currency = 'ILS' THEN
    NEW.amount_ils     := NEW.amount;
    NEW.fx_rate        := 1;
    NEW.fx_rate_source := 'identity';
    NEW.fx_rate_date   := NULL;
    NEW.fx_status      := 'not_required';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.fx_status = 'resolved' THEN
    IF NEW.fx_status      IS DISTINCT FROM OLD.fx_status
       OR NEW.fx_rate        IS DISTINCT FROM OLD.fx_rate
       OR NEW.fx_rate_source IS DISTINCT FROM OLD.fx_rate_source
       OR NEW.fx_rate_date   IS DISTINCT FROM OLD.fx_rate_date
       OR NEW.amount_ils     IS DISTINCT FROM OLD.amount_ils
       OR NEW.amount         IS DISTINCT FROM OLD.amount THEN
      RAISE EXCEPTION 'donation % exchange-rate snapshot is frozen once resolved', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.fx_status = 'resolved' THEN
    IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 OR NEW.fx_rate_source IS NULL OR NEW.fx_rate_date IS NULL THEN
      RAISE EXCEPTION 'donation % resolved without a complete exchange-rate snapshot', NEW.id;
    END IF;
    NEW.amount_ils := ROUND(NEW.amount * NEW.fx_rate, 2);
  ELSE
    NEW.fx_status      := 'pending';
    NEW.amount_ils     := NULL;
    NEW.fx_rate        := NULL;
    NEW.fx_rate_source := NULL;
    NEW.fx_rate_date   := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_donations_sync_ils_equivalent
  BEFORE INSERT OR UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.donations_sync_ils_equivalent();

-- Existing rows are all ILS: the trigger fills amount_ils/fx_* from amount.
UPDATE public.donations SET fx_status = 'not_required' WHERE amount_ils IS NULL;

ALTER TABLE public.donations
  ADD CONSTRAINT donations_fx_consistency CHECK (
    (currency = 'ILS' AND fx_status = 'not_required' AND amount_ils = amount AND fx_rate = 1)
    OR (currency <> 'ILS' AND fx_status = 'pending' AND amount_ils IS NULL AND fx_rate IS NULL)
    OR (currency <> 'ILS' AND fx_status = 'resolved' AND amount_ils IS NOT NULL AND fx_rate > 0
        AND fx_rate_source IS NOT NULL AND fx_rate_date IS NOT NULL)
  );

CREATE INDEX donations_fx_pending_idx ON public.donations (completed_at) WHERE fx_status = 'pending' AND status = 'paid';

-- ── Recurring instructions: the donor-authorized currency ─────────────────
ALTER TABLE public.recurring_instructions
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'ILS',
  ADD CONSTRAINT recurring_instructions_currency_check CHECK (currency IN ('ILS', 'USD', 'EUR'));

CREATE FUNCTION public.recurring_instructions_currency_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'recurring instruction % currency cannot change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_recurring_instructions_currency_immutable
  BEFORE UPDATE OF currency ON public.recurring_instructions
  FOR EACH ROW EXECUTE FUNCTION public.recurring_instructions_currency_immutable();

-- ── Internal receipt rows (audit records; CardCom issues the official one) ─
ALTER TABLE public.receipts
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'ILS',
  ADD CONSTRAINT receipts_currency_check CHECK (currency IN ('ILS', 'USD', 'EUR'));

COMMIT;
