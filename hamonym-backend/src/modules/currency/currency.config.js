// Donation currencies (docs/finance/MULTI_CURRENCY_DONATIONS.md).
//
// CardCom coin ids, verified against the CardCom v11 swagger
// (CreateLowProfile.ISOCoinId / TransactionInfo.CoinId): "1 - ILS, 2 - USD,
// else ISO Coin from list (ISO 4217)" -- so EUR is its ISO 4217 numeric code,
// 978. Whether a given terminal accepts USD/EUR is a terminal setting CardCom
// has to confirm; nothing here assumes it does.
const CURRENCIES = Object.freeze({
  ILS: Object.freeze({ code: 'ILS', symbol: '₪', cardcomCoinId: 1 }),
  USD: Object.freeze({ code: 'USD', symbol: '$', cardcomCoinId: 2 }),
  EUR: Object.freeze({ code: 'EUR', symbol: '€', cardcomCoinId: 978 }),
});
const DEFAULT_CURRENCY = 'ILS';

// Foreign currencies stay off until three separate things are confirmed, each
// with its own switch (all default off):
// - HAMONYM_FX_DONATIONS_ENABLED: CardCom confirmed the terminal(s) charge
//   USD/EUR through LowProfile and the confirmed CoinId was tested end to end;
// - HAMONYM_FX_BILLING_POLICY_CONFIRMED: the FIN-11 commission policy for
//   foreign donations is decided -- billing reads donations.amount, so without
//   it a $100 donation would be billed as ₪100;
// - HAMONYM_FX_RECURRING_ENABLED: CardCom confirmed recurring charges in a
//   foreign currency (RecurringPayments.FinalDebitCoinId) and the DetailRecurring
//   payload carries the charged currency.
// HAMONYM_FX_CURRENCIES optionally narrows the list (default "USD,EUR").
function flag(env, name) { return String(env[name] || '').toLowerCase() === 'true'; }

function enabledForeignCurrencies(env = process.env) {
  if (!flag(env, 'HAMONYM_FX_DONATIONS_ENABLED') || !flag(env, 'HAMONYM_FX_BILLING_POLICY_CONFIRMED')) return [];
  const listed = String(env.HAMONYM_FX_CURRENCIES || 'USD,EUR').split(',').map(c => c.trim().toUpperCase());
  return ['USD', 'EUR'].filter(c => listed.includes(c));
}

function availability(env = process.env) {
  const foreign = enabledForeignCurrencies(env);
  return {
    currencies: [DEFAULT_CURRENCY, ...foreign],
    recurringCurrencies: [DEFAULT_CURRENCY, ...(flag(env, 'HAMONYM_FX_RECURRING_ENABLED') ? foreign : [])],
  };
}

function normalizeCurrency(value) {
  if (value == null || value === '') return DEFAULT_CURRENCY;
  return String(value).trim().toUpperCase();
}

function isSupported(code) { return Object.prototype.hasOwnProperty.call(CURRENCIES, code); }

// Throws a 400 for an unknown currency, or one that is not enabled (for this
// kind of donation).
function assertDonationCurrency(code, { recurring = false } = {}, env = process.env) {
  const fail = (message, errorCode) => Object.assign(new Error(message), { status: 400, code: errorCode });
  if (!isSupported(code)) throw fail('Unsupported currency', 'UNSUPPORTED_CURRENCY');
  const { currencies, recurringCurrencies } = availability(env);
  if (!(recurring ? recurringCurrencies : currencies).includes(code)) {
    throw fail(recurring ? 'Currency is not available for recurring donations' : 'Currency is not available', 'CURRENCY_NOT_ENABLED');
  }
  return CURRENCIES[code];
}

function coinIdFor(code) {
  if (!isSupported(code)) throw new Error(`Unsupported currency ${code}`);
  return CURRENCIES[code].cardcomCoinId;
}

module.exports = { CURRENCIES, DEFAULT_CURRENCY, availability, normalizeCurrency, isSupported, assertDonationCurrency, coinIdFor };
