const service = require('./partner-invites.service');

exports.createInvite = async (req, res) => {
  try {
    const result = await service.createInvite(req.user.id, req.params.id, req.body.email);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getInvite = async (req, res) => {
  try {
    const invite = await service.getInviteByToken(req.params.token);
    res.json(invite);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const result = await service.acceptInvite(req.user.id, req.params.token);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
