/* Local-only native Chrome keyboard/rendering verification; no application API. */
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
  const css = sass.compile('src/styles.scss', { logger: { warn() {}, debug() {} } }).css.replace(/@import[^;]+;/g, '')
    + fs.readFileSync('src/styles/onboarding.css', 'utf8')
    + fs.readFileSync('src/app/shared/ui/style-role-editor/style-role-editor.component.css', 'utf8');
  const html = `<html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
    *{transition:none!important} body{padding:16px} main{max-width:600px;margin:auto} input,select{width:100%}
    label{display:block;margin-block:12px} .tse-switch{margin:16px} </style></head>
    <body><main><button id="start">Start</button><label for="name">Name</label><input id="name">
    <label for="choice">Choice</label><select id="choice"><option>A</option></select>
    <input disabled id="disabled"><input readonly id="readonly" value="Readonly">
    <label class="tse-switch"><input type="checkbox" id="switch" aria-label="Toggle"><span class="tse-switch-slider"></span></label>
    <input type="file" id="file"></main></body></html>`;
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
    for (const width of [1440, 390]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
      await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
      for (let i = 0; i < 100; i++) {
        if (await evaluate('document.readyState === "complete" && !!document.getElementById("start")')) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await evaluate('document.getElementById("start").focus()'); await tab();
      assert.equal(await evaluate('document.activeElement.id'), 'name');
      assert.equal(await evaluate('getComputedStyle(document.activeElement).borderTopColor'), 'rgb(109, 40, 217)');
      assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none');
      await command('Input.insertText', { text: 'Keyboard test' });
      assert.equal(await evaluate('document.activeElement.value'), 'Keyboard test');
      await evaluate('document.activeElement.setAttribute("aria-invalid", "true")');
      assert.equal(await evaluate('getComputedStyle(document.activeElement).borderTopColor'), 'rgb(185, 28, 28)');
      await tab(); assert.equal(await evaluate('document.activeElement.id'), 'choice');
      await tab(); assert.equal(await evaluate('document.activeElement.id'), 'readonly');
      await tab(); assert.equal(await evaluate('document.activeElement.id'), 'switch');
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".tse-switch-slider")).outlineStyle'), 'solid');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      assert.equal(await evaluate('document.getElementById("switch").checked'), true);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      console.log(`PASS native Tab/Space, values, invalid focus, disabled skip, readonly, switch and RTL layout at ${width}px`);
    }
  } finally {
    if (ws) ws.close();
    if (chrome) chrome.kill();
    await new Promise(resolve => server.close(resolve));
    // A task-specific temporary browser profile is retained outside Git for
    // inspection; no user browser profile, application data or credentials used.
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
