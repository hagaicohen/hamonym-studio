import type { Page, Request, Route } from '@playwright/test';

// Network guard + fixture backend for the bilingual regression suite.
// - The dev server (localhost:<port>) is served normally.
// - Google Fonts are allowed (static, read-only CDN) so text renders with the real fonts.
// - API hosts (the production API host the dev environment points to, and a local
//   backend) are NEVER contacted: every call is answered here from fixtures.
// - Everything else (Google sign-in, CardCom, analytics) is aborted.
export const API_HOSTS = ['hamonym-studio.onrender.com', 'localhost:3000', '127.0.0.1:3000'];
const ALLOWED_EXTERNAL = ['fonts.googleapis.com', 'fonts.gstatic.com'];

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  params: Record<string, string>;
}
export type MockReply = unknown | { __status: number; body: unknown };
export type MockHandler = (req: MockRequest) => MockReply;
export type MockData = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface RouteDef { method: string; pattern: RegExp; keys: string[]; handler: MockHandler | MockData }

export const reply = (status: number, body: unknown = {}): MockReply => ({ __status: status, body });

export class MockApi {
  private defs: RouteDef[] = [];
  readonly calls: string[] = [];
  readonly unmatched: string[] = [];
  readonly blocked: string[] = [];

  // Path syntax: '/api/entities/:id/dashboard'. Later definitions win.
  on(method: string, path: string, handler: MockHandler | MockData): this {
    const keys: string[] = [];
    const pattern = new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\:([a-zA-Z_]+)|:([a-zA-Z_]+)/g, (_m, a, b) => {
      keys.push(a || b);
      return '([^/]+)';
    }) + '/?$');
    this.defs.unshift({ method: method.toUpperCase(), pattern, keys, handler });
    return this;
  }
  get(path: string, h: MockHandler | MockData) { return this.on('GET', path, h); }
  post(path: string, h: MockHandler | MockData) { return this.on('POST', path, h); }
  put(path: string, h: MockHandler | MockData) { return this.on('PUT', path, h); }
  patch(path: string, h: MockHandler | MockData) { return this.on('PATCH', path, h); }
  delete(path: string, h: MockHandler | MockData) { return this.on('DELETE', path, h); }

  resolve(request: Request): { status: number; body: unknown } | null {
    const url = new URL(request.url());
    const method = request.method();
    // Static paths win over parameterized ones (/api/entities/my before /api/entities/:id).
    const ordered = [...this.defs.filter((d) => !d.keys.length), ...this.defs.filter((d) => d.keys.length)];
    for (const d of ordered) {
      if (d.method !== method && d.method !== 'ANY') continue;
      const m = url.pathname.match(d.pattern);
      if (!m) continue;
      const params = Object.fromEntries(d.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let body: unknown = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      const out = typeof d.handler === 'function'
        ? (d.handler as MockHandler)({ method, path: url.pathname, query: url.searchParams, body, params })
        : d.handler;
      if (out && typeof out === 'object' && '__status' in (out as object)) {
        const r = out as { __status: number; body: unknown };
        return { status: r.__status, body: r.body };
      }
      return { status: 200, body: out };
    }
    return null;
  }
}

export async function installNetwork(page: Page, api: MockApi, baseURL: string): Promise<void> {
  const appHost = new URL(baseURL).host;
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.host === appHost) return route.continue();
    if (ALLOWED_EXTERNAL.includes(url.host)) return route.continue();
    if (API_HOSTS.includes(url.host)) {
      const key = `${request.method()} ${url.pathname}`;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders() });
      api.calls.push(key);
      const res = api.resolve(request);
      if (!res) {
        api.unmatched.push(key);
        return route.fulfill({ status: 404, headers: corsHeaders(), contentType: 'application/json', body: JSON.stringify({ error: 'E2E_NOT_MOCKED', code: 'E2E_NOT_MOCKED' }) });
      }
      return route.fulfill({ status: res.status, headers: corsHeaders(), contentType: 'application/json', body: JSON.stringify(res.body ?? null) });
    }
    api.blocked.push(`${request.method()} ${url.host}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}
