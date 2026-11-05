const axios = require('axios');
const BASE = 'https://secure.cardcom.solutions';
const fail = () => Object.assign(new Error('Official receipt unavailable'), { status: 424 });
function safeDocumentUrl(value) {
  const url = new URL(String(value).trim());
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') ||
      !['secure.cardcom.solutions', 'tinyurl.com'].includes(url.hostname)) throw fail();
  return url.href;
}
exports.safeDocumentUrl = safeDocumentUrl;
// Public CardCom v11 GetDocumentRequest; no document creation or payment API.
exports.recurringDocument = async (credentials, donation) => {
  const { data } = await axios({
    method: 'get', url: BASE + '/api/v11/RecuringPayments/GetRecurringPaymentHistory',
    data: { apiUserName: credentials.apiName, apiPassword: credentials.apiPassword,
      AccountId: Number(donation.cardcom_account_id),
      ...(donation.provider_row_id ? { RowId: Number(donation.provider_row_id) } : {}) },
    timeout: 15000,
  });
  if (data?.ResponseCode !== 0 || !Array.isArray(data.RecurringPaymentHistory)) return null;
  const matching = data.RecurringPaymentHistory.filter(row => row.Status === 'SUCCESSFUL' &&
    (!donation.provider_row_id || String(row.RowID) === String(donation.provider_row_id)) &&
    String(row.AccountID) === String(donation.cardcom_account_id) &&
    String(row.TerminalNumber) === String(credentials.terminalNumber) &&
    String(row.TranzactionId) === String(donation.provider_reference) &&
    row.FinalDebitCoinID === 1 &&
    Math.round(Number(row.SumToBill) * 100) === Math.round(Number(donation.amount) * 100));
  if (matching.length !== 1) return null;
  return { TranzactionId: matching[0].TranzactionId,
    DocumentInfo: { ResponseCode: 0, DocumentNumber: matching[0].DocumentNumber, DocumentType: matching[0].DocumentType } };
};
exports.getPdf = async (credentials, document) => {
  if (/^[1-9][0-9]*$/.test(document.document_type)) {
    const response = await axios.get(BASE + '/interface/GetDocumentPDF.aspx', {
      params: { UserName: credentials.apiName, UserPassword: credentials.apiPassword,
        DocumentNumber: document.document_number, DocumentType: document.document_type },
      responseType: 'arraybuffer', maxRedirects: 0, timeout: 15000, maxContentLength: 10 * 1024 * 1024,
    });
    const pdf = Buffer.from(response.data);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw fail();
    return pdf;
  }
  const { data } = await axios.post(BASE + '/api/v11/Documents/CreateDocumentUrl', {
    ApiName: credentials.apiName, ApiPassword: credentials.apiPassword,
    DocumentType: document.document_type, DocumentNumber: Number(document.document_number),
  }, { timeout: 15000 });
  if (data?.ResponseCode !== 0 || !data.DocUrl) throw fail();
  let url = safeDocumentUrl(data.DocUrl);
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer', maxRedirects: 0, timeout: 15000,
      maxContentLength: 10 * 1024 * 1024,
      validateStatus: status => status === 200 || [301, 302, 303, 307, 308].includes(status),
    });
    if (response.status !== 200) {
      url = safeDocumentUrl(new URL(response.headers.location, url).href);
      continue;
    }
    const pdf = Buffer.from(response.data);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw fail();
    return pdf;
  }
  throw fail();
};
