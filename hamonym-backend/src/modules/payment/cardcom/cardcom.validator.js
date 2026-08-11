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