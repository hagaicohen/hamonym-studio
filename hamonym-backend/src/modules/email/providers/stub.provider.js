// Does not send anything — logs the outcome as 'stub' so callers, and
// email_logs, behave exactly as they will with a real provider. Set
// EMAIL_PROVIDER=resend (see providers/resend.provider.js) to actually send.
exports.send = async ({ to, subject }) => {
  console.log(`[EmailService:stub] would send "${subject}" to ${to}`);
  return { providerMessageId: null, stub: true };
};
