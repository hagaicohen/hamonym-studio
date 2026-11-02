# Angular frontend on Vercel

Preparation only; no deployment or Render configuration changes performed.

## Project settings

| Setting | Value |
| --- | --- |
| Git repository | `hagaicohen/hamonym-studio` |
| Frontend branch inspected | `codex/fin11-single-clock-frontend` |
| Root Directory | `.` (repository root on this frontend branch) |
| Framework Preset | Angular |
| Node.js Version | `22.x` (compatible with Angular 18) |
| Install Command | `npm ci` |
| Build Command | `npm run build -- --configuration production` |
| Output Directory | `dist/hamonym-app/browser` |

The selected revision must contain the root `package.json` named `hamonym-app`,
`angular.json` and `src/main.ts`. Do not select the backend-only `main` branch
or the nested `hamonym-app` Git link. Paths above are relative to this frontend
repository root, not the parent Windows workspace. Future publication must
include the approved local frontend work; current remote revisions do not
automatically contain uncommitted changes.

`vercel.json` serves existing files first, then supplies `index.html` for Angular
routes such as `/welcome`, `/login`, `/campaigns/discover`, `/my-donations` and
`/platform/collection-ops`. Angular guards remain responsible for client-side
navigation and backend authorization remains authoritative. This is a static
SPA, with no Vercel API proxy, SSR server or financial jobs.

## Production API and authentication

The production build replaces `src/environments/environment.ts` with
`environment.prod.ts`: `production: true`, API origin
`https://hamonym-studio.onrender.com`. No frontend secret or Vercel environment
variable is required by the current build. Public Google client ID is compiled
into the bundle; never put backend credentials in frontend configuration.

Current requests use JWT Bearer headers and browser localStorage, not
cross-origin session cookies (`withCredentials` is not enabled). Logout clears
the local authentication state, disables Google auto-selection and navigates on
the frontend origin. Tokens stored on localhost are not transferred to the new
Vercel origin: sign in again there. Existing returnUrl query parameters remain
client-side paths and are retained by the SPA fallback.

Read-only inspection of the available backend source found `app.use(cors())`,
which supports the current non-cookie Bearer requests and preflight. No CORS
backend edit is needed for that source configuration. Actual Render runtime
headers/settings still require verification after a frontend URL is assigned.
If the running service has a separate origin allowlist, add the exact published
HTTPS frontend origin there; do not enable credentialed wildcard CORS.

## Manual external settings before end-to-end testing

1. On Render, set/verify `FRONTEND_URL` to the final published HTTPS frontend
   origin (no path). Existing email verification, invitations, password reset,
   billing setup and payment return links use it. This is a global setting:
   changing it also changes where users of localhost are sent after those flows.
2. Verify `APP_URL` uses the intended frontend origin for ambassador links.
   Verify `BACKEND_URL` remains `https://hamonym-studio.onrender.com`; CardCom
   callbacks/webhooks must continue to reach Render, not this static frontend.
3. In Google Cloud OAuth settings for the existing web client, add the final
   Vercel/custom-domain HTTPS origin under Authorized JavaScript origins.
   Current Google sign-in uses a JavaScript credential callback, not a new
   frontend OAuth redirect endpoint. Keep localhost authorized if still used.
4. Verify the existing CardCom/OpenFields account permits the published frontend
   domain if its account has domain restrictions. Do not change provider
   credentials or payment configuration as part of frontend preparation.

Use a stable frontend domain for backend-generated links; arbitrary preview
domains do not automatically update Render or Google configuration. Render
environment values and Google/CardCom dashboards were not modified or verified
through authenticated dashboard access during preparation.

## Validation and future smoke checks

Run the production build and focused routing/header tests locally. The local
corporate certificate workaround, when needed, is `NODE_EXTRA_CA_CERTS` pointing
to an existing trusted-root bundle. Do not copy its Windows path into Vercel and
do not disable TLS verification.

After an explicitly authorized deployment: open and refresh `/`, `/login`,
`/campaigns/discover`, a published campaign URL and a protected management URL.
Check that assets return their real content, guards preserve returnUrl, API
calls use Render, login/logout work, and logged-out refresh remains logged out.
Verify CORS preflight includes Authorization and email/payment return links use
the published origin. Do not create donations or run financial jobs merely to
verify hosting. Local builds do not prove live Vercel routing or live Render CORS.
