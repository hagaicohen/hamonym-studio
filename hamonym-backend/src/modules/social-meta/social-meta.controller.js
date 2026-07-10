const service = require('./social-meta.service');

exports.campaignMeta = async (req, res) => {
  try {
    const { status, html } = await service.renderCampaignMeta(req.params.slug);
    res.status(status).type('html').send(html);
  } catch (err) {
    console.error('[social-meta] campaignMeta error:', err.message);
    res.status(500).type('html').send('<!doctype html><html><body>שגיאה</body></html>');
  }
};

exports.sitemap = async (req, res) => {
  try {
    const xml = await service.renderSitemap();
    res.type('application/xml').send(xml);
  } catch (err) {
    console.error('[social-meta] sitemap error:', err.message);
    res.status(500).send('');
  }
};
