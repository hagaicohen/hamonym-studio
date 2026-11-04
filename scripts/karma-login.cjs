module.exports = function (config) {
  require('./karma-form-controls.cjs')(config);
  config.set({
    concurrency: 1,
    customLaunchers: {
      ChromeDesktopForms: { base: 'ChromeHeadless', flags: ['--window-size=1440,1000', '--disable-gpu', '--remote-debugging-port=0'] },
      ChromeMobileForms: { base: 'ChromeHeadless', flags: ['--window-size=390,844', '--disable-gpu', '--remote-debugging-port=0'] },
    },
  });
};
