export const environment = {
  production: false,

  apiUrl: 'http://localhost:3000',

  googleClientId:
    '615094696252-ia7q90nc7skpos9qqiln0gp9u6tirguu.apps.googleusercontent.com',

  // Hamonym's own GA4 property (platform-wide analytics). Empty until a real
  // Measurement ID is provisioned — analytics.service.ts simply won't load
  // gtag.js if this is blank.
  gaMeasurementId: '',
};
