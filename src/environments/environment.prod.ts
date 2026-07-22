export const environment = {
  production: true,

  apiUrl: 'https://your-api-domain.com',

  googleClientId:
    '615094696252-ia7q90nc7skpos9qqiln0gp9u6tirguu.apps.googleusercontent.com',

  // Hamonym's own GA4 property (platform-wide analytics). Empty until a real
  // Measurement ID is provisioned — analytics.service.ts simply won't load
  // gtag.js if this is blank.
  gaMeasurementId: '',

  // Minutes of inactivity before auto-logout (idle-timeout.service.ts) — a
  // 60s warning modal shows before the actual logout, so the real "silent"
  // budget is this value minus one minute.
  idleTimeoutMinutes: {
    admin: 15,
    regular: 30,
  },
};
