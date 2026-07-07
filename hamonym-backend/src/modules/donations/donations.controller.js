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

exports.getCampaignDonors = async (req, res) => {
  try {
    const donors = await donationsService.getCampaignDonors(req.params.slug);
    res.json({ donors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLiveDonations = async (req, res) => {
  try {
    const { slug } = req.params;
    const since = req.query.since || new Date(Date.now() - 5 * 60_000).toISOString();
    const donations = await donationsService.getLiveDonations(slug, since);
    res.json({ donations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getEntityDonations = async (req, res) => {
  try {
    const entityId   = req.params.id;
    const page       = parseInt(req.query.page  || '0', 10);
    const limit      = parseInt(req.query.limit || '25', 10);
    const { status, campaignId, period, search } = req.query;
    console.log('[getEntityDonations]', { entityId, status, campaignId, period, search, page, limit });
    const result = await donationsService.getEntityDonations(entityId, { status, campaignId, period, search, page, limit });
    res.json(result);
  } catch (err) {
    console.error('[getEntityDonations] error:', err.message);
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
