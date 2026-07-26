const axios = require('axios');

const RESEND_API_URL = 'https://api.resend.com/emails';

exports.send = async ({ to, subject, html, text, from, replyTo }) => {
  let response;
  try {
    response = await axios.post(
      RESEND_API_URL,
      {
        from,
        to: [to],
        subject,
        html,
        text,
        reply_to: replyTo || undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message || 'Resend request failed');
  }

  return { providerMessageId: response.data?.id || null, stub: false };
};
