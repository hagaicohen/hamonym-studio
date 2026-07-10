// Does not send anything — logs the outcome as 'stub' so callers, and
// email_logs, behave exactly as they will once a real provider (Resend) is
// wired in. Swap EMAIL_PROVIDER=resend + providers/resend.provider.js later;
// nothing outside email.service.js needs to change.
exports.send = async ({ to, subject }) => {
  console.log(`[EmailService:stub] would send "${subject}" to ${to}`);
  return { providerMessageId: null, stub: true };
};
