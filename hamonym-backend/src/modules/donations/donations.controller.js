const donationsService = require('./donations.service');

exports.createDonation = async (req, res) => {
  try {
    const { campaignId, donor, amount, rewards } = req.body;

    if (!campaignId || !donor || !amount) {
      return res.status(400).json({ error: 'campaignId, donor and amount are required' });
    }

    const result = await donationsService.createDonation({ campaignId, donor, amount, rewards });
    res.json(result);
  } catch (err) {
    console.error('createDonation error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

exports.handleReturn = async (req, res) => {
  try {
    const { id, status, lowprofilecode, ResponseCode } = req.query;

    if (!id) {
      const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
      return res.redirect(`${frontBase}?payment=error`);
    }

    const result = await donationsService.handleReturn({
      donationId: id,
      status,
      lowprofilecode,
      responseCode: ResponseCode,
    });

    res.redirect(result.redirectUrl);
  } catch (err) {
    console.error('handleReturn error:', err.message);
    const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontBase}?payment=error`);
  }
};
