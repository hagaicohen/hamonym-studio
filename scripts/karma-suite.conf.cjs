// Karma config for scripts/run-karma-suite.cjs: the Angular CLI defaults plus
// longer timeouts, so a busy machine (dev server compiling, Playwright running)
// does not disconnect the headless browser in the middle of the suite.
const fs = require('node:fs');
const path = require('node:path');
function BilingualResultsReporter() {
  const specs = [];
  this.onSpecComplete = (_browser, result) => specs.push({ name: [...result.suite, result.description].join(' '), success: result.success, skipped: result.skipped, pending: result.pending, disabled: result.disabled, pendingReason: result.pendingReason, log: result.log });
  this.onRunComplete = () => fs.writeFileSync(path.join(__dirname, '../test-results/karma-spec-results.json'), JSON.stringify(specs, null, 2));
}
module.exports = function (config) {
  config.set({
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      { 'reporter:bilingual-results': ['type', BilingualResultsReporter] },
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: { random: false, stopOnSpecFailure: false }, clearContext: false },
    jasmineHtmlReporter: { suppressAll: true },
    reporters: ['progress', 'bilingual-results'],
    browsers: ['ChromeBilingual'],
    customLaunchers: { ChromeBilingual: { base: 'ChromeHeadless', flags: ['--disable-gpu', '--remote-debugging-port=0'] } },
    browserNoActivityTimeout: 300000,
    browserDisconnectTimeout: 60000,
    browserDisconnectTolerance: 1,
    captureTimeout: 300000,
    singleRun: true,
    restartOnFileChange: false,
  });
};
