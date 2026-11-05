/* Local-only responsive Dashboard rendering verification; no application API. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const sass = require('sass');
const assert = require('node:assert/strict');

(async () => {
  const chromePath = process.env.CHROME_BIN || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(p => fs.existsSync(p));
  assert(chromePath, 'Chrome is required');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hamonym-form-keyboard-'));
  const cssFiles = [
    ['src/app/core/layout/app-layout/app-layout.component.css', 'app-layout'],
    ['src/app/core/layout/topbar/topbar.component.css', 'app-topbar'],
    ['src/app/core/layout/sidebar/sidebar.component.css', 'app-sidebar'],
    ['src/app/modules/dashboard/pages/dashboard/dashboard.component.css', 'app-dashboard'],
    ['src/app/modules/dashboard/pages/dashboard/organization-card-heading.css', 'app-organization-status-card'],
    ['src/app/modules/dashboard/pages/dashboard/organization-status-card.component.css', 'app-organization-status-card'],
    ['src/app/modules/settings/components/approval-status-card/approval-status-card.component.css', 'app-approval-status-card'],
    ['src/app/shared/components/date-range-picker/date-range-picker.component.css', 'app-date-range-picker'],
  ];
  const css = sass.compile('src/styles.scss', { logger: { warn() {}, debug() {} } }).css.replace(/@import[^;]+;/g, '')
    + fs.readFileSync('src/styles/onboarding.css', 'utf8')
    + cssFiles.map(([file, host]) => fs.readFileSync(file, 'utf8').replace(/:host\(([^)]+)\)/g, (_, classes) => host + classes).replaceAll(':host', host)).join('\n');
  const html = fs.readFileSync('scripts/fixtures/dashboard-responsive.html', 'utf8').replace('</head>', `<style>${css}</style></head>`);
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  let chrome, ws;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
    const browserUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 20000);
      let output = '';
      chrome.stderr.on('data', data => {
        output += data.toString(); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      chrome.on('error', reject);
    });
    const debugBase = browserUrl.replace('ws://', 'http://').split('/devtools/')[0];
    const targets = await (await fetch(`${debugBase}/json/list`)).json();
    ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    let sequence = 0; const pending = new Map();
    ws.on('message', message => {
      const result = JSON.parse(message);
      if (!result.id) return;
      const request = pending.get(result.id); pending.delete(result.id);
      if (result.error) request.reject(new Error(JSON.stringify(result.error))); else request.resolve(result.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const tab = async () => {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    };
    const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamonym-dashboard-responsive-'));
    for (const width of [320, 390, 768, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 769 });
      await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
      for (let i = 0; i < 100; i++) {
        if (await evaluate('document.readyState === "complete" && !!document.querySelector(".kpi-card")')) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const measurements = await evaluate(`(() => {
        const page = document.querySelector('.db');
        const grid = document.querySelector('.kpi-grid');
        const presets = [...document.querySelectorAll('.range-btn')];
        return {
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          contentFits: page.scrollWidth <= page.clientWidth + 1,
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          presetsVisible: presets.every(button => { button.scrollIntoView({block:'nearest',inline:'nearest'}); const r=button.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
          dateRows: new Set(presets.map(button => Math.round(button.getBoundingClientRect().top))).size,
          touchTargets: presets.every(button => button.getBoundingClientRect().height >= 44),
          kpiRows: new Set([...grid.children].map(card => Math.round(card.getBoundingClientRect().top))).size,
        };
      })()`);
      assert(measurements.pageFits, `Page overflow at ${width}: ${JSON.stringify(measurements)}`);
      assert(measurements.contentFits, `Dashboard overflow at ${width}`);
      assert(measurements.presetsVisible, `Unreachable date presets at ${width}`);
      assert.equal(measurements.dateRows, 1);
      await evaluate('document.querySelector(".range-btn").scrollIntoView({block:"nearest",inline:"nearest"})');
      assert.equal(measurements.columns, width <= 1200 ? 2 : 4);
      if (width <= 768) { assert(measurements.touchTargets); assert.equal(measurements.kpiRows, 2); }
      const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(artifactDirectory, `dashboard-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      console.log(`PASS dashboard fixture ${width}px: ${JSON.stringify(measurements)}`);
    }
    console.log('Screenshots: ' + artifactDirectory);
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
    await new Promise(resolve => server.close(resolve));
    // A task-specific temporary browser profile is retained outside Git for
    // inspection; no user browser profile, application data or credentials used.
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
