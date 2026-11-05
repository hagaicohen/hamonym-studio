module.exports = function (config) {
  config.set({
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher'), require('@angular-devkit/build-angular/plugins/karma')],
    reporters: ['dots'],
    customLaunchers: {
      ChromeDesktopForms: { base: 'ChromeHeadless', flags: ['--window-size=1440,1000'] },
      ChromeMobileForms: { base: 'ChromeHeadless', flags: ['--window-size=390,844', '--force-device-scale-factor=1'] },
    },
    browsers: ['ChromeDesktopForms', 'ChromeMobileForms'],
    singleRun: true,
  });
};
