// Exact money arithmetic for amounts with at most 2 decimals and rates with at
// most 6, in integer minor units (BigInt) -- never in floating point. The
// database computes the stored ILS equivalent itself (ROUND(amount * fx_rate, 2)
// in migration 087); ilsEquivalent() here follows the same rule (half away from
// zero, to agorot) and exists so the application can show/verify it.

const AMOUNT_RE = /^(\d{1,10})(?:\.(\d{1,2}))?$/;
const RATE_RE = /^(\d{1,6})(?:\.(\d{1,6}))?$/;

function toMinorUnits(amount) {
  const text = typeof amount === 'number' ? amountToText(amount) : String(amount).trim();
  const match = AMOUNT_RE.exec(text);
  if (!match) throw Object.assign(new Error('Invalid amount'), { code: 'INVALID_AMOUNT' });
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

// A JS number is only accepted when it is already a whole number of agorot
// (12.5, 100, 0.07) -- 12.345 is rejected rather than silently rounded.
function amountToText(n) {
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('Invalid amount'), { code: 'INVALID_AMOUNT' });
  const text = String(n);
  if (/e/i.test(text) || !AMOUNT_RE.test(text)) throw Object.assign(new Error('Invalid amount'), { code: 'INVALID_AMOUNT' });
  return text;
}

function fromMinorUnits(minor) {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

function rateToMicro(rate) {
  const match = RATE_RE.exec(String(rate).trim());
  if (!match) throw Object.assign(new Error('Invalid exchange rate'), { code: 'INVALID_RATE' });
  const micro = BigInt(match[1]) * 1000000n + BigInt((match[2] || '').padEnd(6, '0'));
  if (micro <= 0n) throw Object.assign(new Error('Invalid exchange rate'), { code: 'INVALID_RATE' });
  return micro;
}

// amount (in the donation currency) x rate (ILS per unit) -> ILS, as a
// 2-decimal string, rounded half away from zero.
function ilsEquivalent(amount, rate) {
  const product = toMinorUnits(amount) * rateToMicro(rate); // agorot x 10^6
  const quotient = product / 1000000n;
  const remainder = product % 1000000n;
  return fromMinorUnits(remainder * 2n >= 1000000n ? quotient + 1n : quotient);
}

function sameAmount(a, b) { return toMinorUnits(a) === toMinorUnits(b); }

module.exports = { toMinorUnits, fromMinorUnits, ilsEquivalent, sameAmount, rateToMicro };
