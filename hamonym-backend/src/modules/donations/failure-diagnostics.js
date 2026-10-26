// Versioned, allowlisted diagnostics in the existing failure_reason TEXT field.
// Never retain provider descriptions, payloads, credentials or donor data.
const UNKNOWN = 'unknown';
function providerCode(value) {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  return /^\d{1,5}$/.test(text) ? Number(text) : null;
}
function captureInitializationFailure({ code, connectionFailure = false } = {}) {
  const normalizedCode = providerCode(code);
  return JSON.stringify({
    version: 1, stage: 'cardcom_initialization', providerCode: normalizedCode,
    reason: normalizedCode === 605 ? 'api_user_blocked' : normalizedCode === 8500 ? 'recurring_token_unavailable' : connectionFailure ? 'provider_connection_failed' : UNKNOWN,
    failedAt: new Date().toISOString(),
  });
}
function readFailureDiagnostic(value) {
  try {
    const record = JSON.parse(value);
    if (record?.version !== 1 || record.stage !== 'cardcom_initialization') return null;
    const code = providerCode(record.providerCode);
    const reason = code === 605 ? 'api_user_blocked' : code === 8500 ? 'recurring_token_unavailable' : record.reason === 'provider_connection_failed' && code === null ? 'provider_connection_failed' : UNKNOWN;
    return { stage: 'cardcom_initialization', providerCode: code, reason,
      failedAt: typeof record.failedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.failedAt) && Number.isFinite(Date.parse(record.failedAt)) ? record.failedAt : null };
  } catch { return null; }
}
module.exports = { captureInitializationFailure, readFailureDiagnostic };
