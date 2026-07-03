const donationsService = require('./donations.service');

exports.getDonationPublic = async (req, res) => {
  try {
    const donation = await donationsService.getDonationPublic(req.params.id);
    if (!donation) return res.status(404).json({ error: 'Not found' });
    res.json(donation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createDonation = async (req, res) => {
  try {
    const { campaignId, donor, amount, rewards, utmParams } = req.body;

    if (!campaignId || !donor || !amount) {
      return res.status(400).json({ error: 'campaignId, donor and amount are required' });
    }

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'] || null;

    const result = await donationsService.createDonation({
      campaignId, donor, amount, rewards,
      utmParams, ipAddress, userAgent,
    });
    res.json(result);
  } catch (err) {
    console.error('createDonation error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

exports.getCampaignDonors = async (req, res) => {
  try {
    const donors = await donationsService.getCampaignDonors(req.params.slug);
    res.json({ donors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.mockComplete = async (req, res) => {
  if (process.env.PAYMENT_PROVIDER !== 'mock') {
    return res.status(403).json({ error: 'Mock payments are disabled' });
  }
  try {
    const { id, status, failureReason, completedAt } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'id and status are required' });
    const result = await donationsService.handleMockComplete({ donationId: id, status, failureReason, completedAt });
    res.json({ redirectUrl: result.redirectUrl });
  } catch (err) {
    console.error('mockComplete error:', err.message);
    res.status(500).json({ error: err.message });
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
