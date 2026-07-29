const service = require('./campaign-partners.service');

exports.listForCampaign = async (req, res) => {
  try {
    const partners = await service.listForCampaign(req.user.id, req.params.campaignId);
    res.json({ partners });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.listPublicForCampaign = async (req, res) => {
  try {
    const partners = await service.listPublicForCampaign(req.params.slug);
    res.json({ partners });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    if (!req.body.partnerEntityId) {
      return res.status(400).json({ error: 'partnerEntityId is required' });
    }
    const partner = await service.create(req.user.id, req.params.campaignId, req.body);
    res.status(201).json({ partner });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const partner = await service.update(req.user.id, req.params.id, req.body);
    res.json({ partner });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await service.remove(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
