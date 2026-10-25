// Never invent confirmation for a historical donor transaction.
const unavailable = async () => { throw Object.assign(new Error('פעולה זו אינה נתמכת עדיין בספק התרומות המדומה; לא בוצעה סליקה'), { code: 'MOCK_DONATION_OPERATION_UNAVAILABLE' }); };
module.exports = {
  name: 'mock', createLowProfile: unavailable, createRecurring: unavailable, updateRecurring: unavailable,
  getLpResult: async () => ({ ResponseCode: 9998, Description: 'No confirmed mock donor transaction' }),
  getRecurringPaymentHistory: async () => ({ ResponseCode: 9998, Description: 'No confirmed mock recurring history' }),
};
