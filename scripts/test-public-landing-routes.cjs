const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/app/app.routes.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(js, { exports: exportsObject, require: () => new Proxy({}, { get: (_, name) => name === 'platformSectionGuard' ? section => section : name }) });
const routes = exportsObject.routes;
const auth = routes.find(r => r.children?.some(c => c.path === 'welcome'));
const root = auth.children.find(r => r.path === '');
assert.equal(root.pathMatch, 'full');
assert.equal(root.redirectTo, undefined);
assert.equal(root.canActivate[0], 'welcomeGuard');
assert.equal(auth.children.find(r => r.path === 'welcome').canActivate[0], 'welcomeGuard');
assert.match(String(root.loadComponent), /welcome.component/);
assert.match(String(auth.children.find(r => r.path === 'welcome').loadComponent), /welcome.component/);
for (const path of ['campaigns/discover', 'campaigns/:slug', 'campaigns/:slug/view']) {
  assert.equal(routes.find(r => r.path === path).canActivate, undefined);
}
assert.equal(routes.find(r => r.component === 'AppLayoutComponent').canActivate[0], 'contextGuard');
assert.equal(auth.children.find(r => r.path === 'organization-registration').canActivate[0], 'authGuard');
console.log('PASS: actual route configuration preserves original landing, public campaigns and management guards');


