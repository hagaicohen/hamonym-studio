// Test phase is a code-level boundary. Production provider activation is a separate release.
const installed = new WeakSet();
function install(axios = require('axios')) {
  if (installed.has(axios)) return;
  axios.interceptors.request.use(config => {
    let host, pathname;
    try { const target = new URL(config.url, config.baseURL); host = target.hostname; pathname = target.pathname; } catch { return config; }
    if (/(^|\.)cardcom\.(solutions|co\.il|com)$/i.test(host)) {
      if (host === 'secure.cardcom.solutions' && [
        '/api/v11/LowProfile/Create',
        '/api/v11/LowProfile/GetLpResult',
        '/interface/RecurringPayment.aspx',
        '/api/v11/RecuringPayments/GetRecurringPaymentHistory',
      ].includes(pathname)) return config;
      throw Object.assign(new Error('פנייה אמיתית לקארדקום חסומה בשלב הבדיקות'), { code: 'REAL_PROVIDER_DISABLED_DURING_PILOT' });
    }
    return config;
  });
  installed.add(axios);
}
module.exports = { install, phase: 'test', provider: 'mock' };
