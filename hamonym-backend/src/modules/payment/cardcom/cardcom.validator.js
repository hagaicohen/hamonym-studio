// Cardcom's webhook target URL is configured once, manually, in the Cardcom
// terminal admin panel — not verified per-request via a signed header. We embed
// a shared secret in that configured URL (?secret=) and check it here.
// ASSUMPTION, not yet confirmed against Cardcom's own webhook docs: this is
// the mechanism referenced by "יש להשתמש ב-Secret לצורך אימות" in
// docs/PAYMENTS_ARCHITECTURE_CONTEXT.md. Revisit if Cardcom turns out to sign
// requests differently.
exports.validateWebhookSecret =
  (secret) => {

    const expected =
      process.env.CARDCOM_WEBHOOK_SECRET;

    return !!expected && secret === expected;
  };

// Recurring webhooks (MasterRecurring/DetailRecurring) carry the secret as a
// form field in the body, NOT as ?secret= in the URL like the LowProfile
// webhook above — verified against a real captured payload (2026-08-14).
// ASSUMPTION, not yet confirmed against the raw capture: the field name is
// `Secret` (PascalCase), matching every other Cardcom field name seen across
// this whole integration (RecurringId, AccountId, IsActive, ...). Revisit if
// a real delivery to the live endpoint fails validation unexpectedly.
exports.validateRecurringWebhookSecret =
  (body) => {

    const expected =
      process.env.CARDCOM_WEBHOOK_SECRET;

    return !!expected && body?.Secret === expected;
  };

exports.validateConnectionResponse =
  (response) => {

    if (!response) {

      return {
        success: false,
        status: 'failed',
        message: 'Empty response'
      };
    }

    if (response.ResponseCode === 0) {

      return {
        success: true,
        status: 'connected',
        message: 'CardCom connected successfully'
      };
    }

    return {
      success: false,
      status: 'failed',
      code: response.ResponseCode,
      message:
        response.Description ||
        'CardCom connection failed'
    };
  };