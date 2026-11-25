const axios = require('axios');
const defaultDb = require('../../db/db');

// Bank of Israel representative rates ("שער יציג"), the official daily
// USD/EUR -> ILS rates, from BoI's public SDMX API (verified 2026-11-06):
//   GET .../BOI.STATISTICS/EXR/1.0/RER_USD_ILS?startperiod=YYYY-MM-DD&endperiod=YYYY-MM-DD&format=csv
// One row per business day (TIME_PERIOD, OBS_VALUE, UNIT_MULT); weekends and
// holidays have no row. USD and EUR are quoted per 1 unit (UNIT_MULT 0) -- any
// other multiplier is refused instead of being guessed at.
//
// Rule: a payment made on Israel calendar date D uses the latest
// representative rate published for a date BEFORE D -- the rate already known
// when D began. It does not depend on what time of day the lookup runs, so a
// rate resolved later (after an outage) is the same one an immediate lookup
// would have used. Weekends/holidays fall back to the previous business day;
// a gap of more than MAX_GAP_DAYS is treated as missing data, not a holiday.
//
// This is the representative rate, used for the ILS equivalent in campaign
// progress and reports. It is not the rate the card network or CardCom used
// to settle, which is recorded separately when known (donations.settlement_*).
//
// No fallback: when BoI cannot be reached and the date was never resolved
// before, this throws FX_RATE_UNAVAILABLE. It never invents, extrapolates or
// reuses a rate for another date.
const SOURCE = 'boi_representative';
const SERIES = Object.freeze({ USD: 'RER_USD_ILS', EUR: 'RER_EUR_ILS' });
const BASE_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/';
const LOOKBACK_DAYS = 10;
const MAX_GAP_DAYS = 7;
const TIMEOUT_MS = 10000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_RE = /^\d{1,6}(\.\d{1,6})?$/;

function unavailable(reason, details = {}) {
  return Object.assign(new Error(`Exchange rate unavailable: ${reason}`), { code: 'FX_RATE_UNAVAILABLE', reason, ...details });
}

function israelDate(instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instant));
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(later, earlier) {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

// Picks the latest valid observation for `series` dated before forDate.
function pickRate(csv, series, forDate) {
  const lines = String(csv).trim().split(/\r?\n/);
  const header = (lines.shift() || '').split(',');
  const col = name => header.indexOf(name);
  const [iSeries, iPeriod, iValue, iMult] = ['SERIES_CODE', 'TIME_PERIOD', 'OBS_VALUE', 'UNIT_MULT'].map(col);
  if ([iSeries, iPeriod, iValue, iMult].some(i => i < 0)) throw unavailable('unexpected_response_format');

  let best = null;
  for (const line of lines) {
    const cells = line.split(',');
    if (cells[iSeries] !== series) continue;
    const period = cells[iPeriod], value = cells[iValue];
    if (!DATE_RE.test(period) || period >= forDate) continue;
    if (cells[iMult] !== '0') throw unavailable('unexpected_unit_multiplier', { unitMult: cells[iMult] });
    if (!RATE_RE.test(value) || Number(value) <= 0) continue;
    if (!best || period > best.rateDate) best = { rateDate: period, rate: value };
  }
  if (!best) throw unavailable('no_published_rate_in_window');
  if (dayDiff(forDate, best.rateDate) > MAX_GAP_DAYS) throw unavailable('published_rate_too_old', { rateDate: best.rateDate });
  return best;
}

function fromRow(row) {
  return {
    currency: row.currency, forDate: toIsoDate(row.for_date), rateDate: toIsoDate(row.rate_date),
    rate: String(row.rate), source: row.source, seriesCode: row.series_code,
  };
}

function toIsoDate(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  // pg returns DATE as a local-midnight Date; read it back in the same zone.
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createExchangeRateService({ db = defaultDb, http = axios, now = () => new Date() } = {}) {
  const memory = new Map();

  async function stored(currency, forDate) {
    const { rows } = await db.query(
      `SELECT source, currency, for_date::text AS for_date, rate_date::text AS rate_date, rate::text AS rate, series_code
       FROM exchange_rate_resolutions WHERE source = $1 AND currency = $2 AND for_date = $3`,
      [SOURCE, currency, forDate]
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  // The rate for a payment made on Israel date forDate (YYYY-MM-DD).
  async function rateFor(currency, forDate) {
    if (currency === 'ILS') return { currency, forDate, rateDate: null, rate: '1', source: 'identity', seriesCode: null };
    const series = SERIES[currency];
    if (!series) throw Object.assign(new Error(`Unsupported currency ${currency}`), { code: 'UNSUPPORTED_CURRENCY' });
    if (!DATE_RE.test(String(forDate))) throw new Error('forDate must be YYYY-MM-DD');
    if (forDate > israelDate(now())) throw unavailable('date_in_future');

    const key = `${currency}:${forDate}`;
    if (memory.has(key)) return memory.get(key);
    const cached = await stored(currency, forDate);
    if (cached) { memory.set(key, cached); return cached; }

    let response;
    try {
      response = await http.get(BASE_URL + series, {
        params: { startperiod: addDays(forDate, -LOOKBACK_DAYS), endperiod: addDays(forDate, -1), format: 'csv' },
        timeout: TIMEOUT_MS, responseType: 'text', transformResponse: [data => data],
      });
    } catch (err) {
      throw unavailable('provider_unreachable', { status: err?.response?.status ?? null });
    }
    if (response?.status !== 200) throw unavailable('provider_error', { status: response?.status ?? null });

    const picked = pickRate(response.data, series, forDate);
    await db.query(
      `INSERT INTO exchange_rate_resolutions (source, currency, for_date, rate_date, rate, series_code)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source, currency, for_date) DO NOTHING`,
      [SOURCE, currency, forDate, picked.rateDate, picked.rate, series]
    );
    // A concurrent resolver may have won the insert; the stored row is the one
    // every donation for this date uses.
    const resolved = await stored(currency, forDate);
    memory.set(key, resolved);
    return resolved;
  }

  // The rate for a payment at `instant`.
  function rateAt(currency, instant) { return rateFor(currency, israelDate(instant)); }

  return { rateFor, rateAt };
}

const defaultService = createExchangeRateService();

module.exports = {
  SOURCE, SERIES, BASE_URL, LOOKBACK_DAYS, MAX_GAP_DAYS,
  israelDate, pickRate, createExchangeRateService,
  rateFor: (...args) => defaultService.rateFor(...args),
  rateAt: (...args) => defaultService.rateAt(...args),
};
