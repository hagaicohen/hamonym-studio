const db = require('../../db/db');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(str) {
  return String(str ?? '').replace(/<[^>]*>/g, '').trim();
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

async function getCampaignMeta(slug) {
  const { rows } = await db.query(
    `SELECT c.title, c.short_description, c.cover_image_url, c.current_amount, c.target_amount,
            e.display_name AS entity_name, e.logo_url AS entity_logo
     FROM campaigns c
     JOIN entities e ON e.id = c.entity_id
     WHERE c.slug = $1 AND c.status = 'published' AND e.status = 'active' AND c.deleted_at IS NULL
       AND c.is_hidden = false AND e.is_hidden = false
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

// Renders a small, valid, self-contained HTML document carrying the meta
// tags a JS-blind crawler needs (WhatsApp/Facebook/LinkedIn link unfurlers,
// Twitter, and any search engine that doesn't execute JS).
//
// Why meta-refresh and not an HTTP 302 for the human fallback: Facebook's/
// WhatsApp's/LinkedIn's crawlers DO follow HTTP redirects (Location header)
// — a 302 here would bounce them straight to the CSR SPA, which has no
// server-rendered tags, defeating the entire point of this route. They do
// NOT process <meta http-equiv="refresh">, since that's a browser
// rendering-engine behavior, not something a plain HTML-fetching bot acts
// on. So meta-refresh reaches real browsers only, while every bot we care
// about stays on this page and reads the tags.
exports.renderCampaignMeta = async (slug) => {
  const campaign = await getCampaignMeta(slug);
  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  const canonicalUrl = `${frontBase}/campaigns/${slug}`;

  if (!campaign) {
    return {
      status: 404,
      html: `<!doctype html><html><head><meta charset="utf-8"><title>קמפיין לא נמצא — המונים</title></head><body>קמפיין לא נמצא</body></html>`,
    };
  }

  const title = `${campaign.title} — המונים`;
  const description = truncate(stripHtml(campaign.short_description) || 'תמכו בקמפיין בפלטפורמת המונים', 160);
  // data: URIs (legacy cover images predating the Supabase upload pipeline)
  // can't work as og:image — WhatsApp/Facebook fetch the image by URL, they
  // don't inline base64. Fall back to the entity logo, then the site logo.
  const rawImage = campaign.cover_image_url;
  const image = (rawImage && !rawImage.startsWith('data:'))
    ? rawImage
    : (campaign.entity_logo || `${frontBase}/logo.png`);
  const entityName = campaign.entity_name || 'המונים';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: campaign.title,
      description,
      url: canonicalUrl,
      image: { '@type': 'ImageObject', url: image },
      publisher: {
        '@type': ['NGO', 'Organization'],
        name: entityName,
        logo: campaign.entity_logo || undefined,
      },
      potentialAction: {
        '@type': 'DonateAction',
        target: canonicalUrl,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'המונים', item: frontBase },
        { '@type': 'ListItem', position: 2, name: 'קמפיינים', item: `${frontBase}/campaigns/discover` },
        { '@type': 'ListItem', position: 3, name: campaign.title, item: canonicalUrl },
      ],
    },
  ];

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="המונים">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<h1>${escapeHtml(campaign.title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(canonicalUrl)}">מעבר לקמפיין</a></p>
</body>
</html>`;

  return { status: 200, html };
};

exports.renderSitemap = async () => {
  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  const { rows } = await db.query(
    `SELECT c.slug, c.updated_at
     FROM campaigns c
     JOIN entities e ON e.id = c.entity_id
     WHERE c.status = 'published' AND e.status = 'active' AND c.deleted_at IS NULL
       AND c.is_hidden = false AND e.is_hidden = false
     ORDER BY c.updated_at DESC`
  );

  const urls = rows.map((r) => `  <url>
    <loc>${escapeHtml(`${frontBase}/campaigns/${r.slug}`)}</loc>
    <lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeHtml(frontBase)}</loc></url>
${urls}
</urlset>`;
};
