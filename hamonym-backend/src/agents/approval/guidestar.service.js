// Thin wrapper around the real guidestar.org.il REST API (Salesforce-backed).
// No refresh-token flow is known yet, so this logs in fresh on every call —
// simple and correct; worth caching the session only if Tracing shows the
// extra login round trip actually matters.

function baseUrl() {
  if (!process.env.GUIDESTAR_BASE_URL) throw new Error('GUIDESTAR_BASE_URL is not set');
  return process.env.GUIDESTAR_BASE_URL;
}

async function login() {
  if (!process.env.GUIDESTAR_USERNAME || !process.env.GUIDESTAR_PASSWORD) {
    throw new Error('GUIDESTAR_USERNAME/GUIDESTAR_PASSWORD are not set');
  }

  const res = await fetch(`${baseUrl()}/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.GUIDESTAR_USERNAME,
      password: process.env.GUIDESTAR_PASSWORD,
    }),
  });

  if (!res.ok) throw new Error(`GuideStar login failed: ${res.status}`);
  const { sessionId } = await res.json();
  return sessionId;
}

// @param {string} registrationNumber - Israeli association/company registration number (e.g. "580014983").
// @returns {Promise<object|null>} raw GuideStar organization payload, or null if not found.
exports.getOrganization = async (registrationNumber) => {
  const sessionId = await login();

  const res = await fetch(`${baseUrl()}/organizations/${registrationNumber}?fullObject=true`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${sessionId}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GuideStar organization lookup failed: ${res.status}`);
  return res.json();
};
