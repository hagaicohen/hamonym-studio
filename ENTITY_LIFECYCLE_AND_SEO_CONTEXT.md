# Entity Lifecycle, SEO/Analytics & Perf — Session Context

Full summary of this session's work, for continuity in a new chat. Everything described here is implemented and smoke-tested against the real DB (with throwaway test rows, cleaned up afterward — real data was never touched). Commits noted per section; anything marked **uncommitted** is still pending your `PUSH`.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals — `hamonym-app`
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`
- **Git topology**: `hamonym-app` and the parent `c:\DEV\HamonymStudio` repo (containing `hamonym-backend`) push to the **same remote/branch**. Push order: `hamonym-app` first, then `git fetch && git rebase origin/main && git push` in the parent. Use `git -c http.sslVerify=false` (local SSL cert issue).

---

## 1. SEO / GA4 Phase 1

*Commits: `109c91f`, `2074f36`*

**GA4 dual-account analytics** — `AnalyticsService` (`hamonym-app/src/app/core/services/analytics.service.ts`): loads `gtag.js` once, configures both the platform's own property (`environment.gaMeasurementId`, currently empty — no real ID yet) and, on a public campaign page, the owning entity's own optional property (`entities.ga_measurement_id`, migration `019_seo_analytics.sql`). Three events wired: `campaign_view`, `donation_started`, `donation_completed` — all carry `campaign_id`/`campaign_name`; the two monetary ones also carry `value`/`currency`.

- **Real bug found & fixed**: `donation_started` fires immediately before a full-page redirect to the payment provider (`checkout-modal.component.ts`) — gtag sends hits async, so the hit could be lost before the browser navigates away. Fixed with `AnalyticsService.trackEventThenNavigate()`, which uses gtag's `event_callback`/`event_timeout` to wait for the hit (max 1s) before navigating.
- GA field lives in entity profile settings (`entity-profile-section-edit`/`-view`), plain text input, no validation beyond presence.

**Dynamic rendering for JS-blind crawlers** — new backend module `social-meta/` (`social-meta.service.js`, `.controller.js`, `.routes.js`), mounted at root in `server.js` (not `/api`) so `GET /campaigns/:slug` on the **backend** mirrors the SPA's own public URL shape 1:1. Renders a small server-side HTML page per campaign with title/description/canonical/OG/Twitter Card tags + JSON-LD (`WebPage` + `ImageObject` + `["NGO","Organization"]` publisher + `DonateAction`, plus a separate `BreadcrumbList`). Also `GET /sitemap.xml` (dynamic, lists all published+visible campaigns with `lastmod`/`changefreq`/`priority`).

- **Not yet wired to real bot traffic** — production hosting isn't chosen yet (no reverse proxy exists to route bot user-agents here instead of the SPA). `environment.prod.ts`'s `apiUrl` is still a placeholder. Once hosting exists, route known bot UAs (`facebookexternalhit`, `WhatsApp`, `LinkedInBot`, `Twitterbot`, etc.) hitting `/campaigns/:slug` to this backend route instead of the SPA.
- **Why `<meta http-equiv="refresh">` and not an HTTP 302** for the human fallback: Facebook/WhatsApp/LinkedIn crawlers *do* follow HTTP redirects, so a 302 would bounce them straight to the CSR SPA (no server-rendered tags there — defeats the whole point). They don't process `<meta http-equiv="refresh">` since that's a browser rendering-engine behavior, not something a plain HTML-fetching bot acts on.
- **`og:image` defensive fallback**: if `cover_image_url` starts with `data:` (legacy base64 blobs predating the Supabase upload pipeline), falls back to the entity logo. Checked the actual upload path (`campaign-basic-step.component.ts` → `UploadService` → `POST /api/media/upload` → Supabase Storage) — campaigns built through the normal builder already get real hosted URLs; the base64 case is legacy dev data only, not a live bug.
- `robots.txt` — static file in `hamonym-app/public/`, `Sitemap:` line points to an absolute `https://hamonym.co.il/sitemap.xml` (assumes that's the eventual domain, matching the `.env` email addresses already using it).
- `index.html` has a placeholder HTML comment for the future Google Search Console verification meta tag.

---

## 2. Entity Lifecycle: Hide, Soft Delete, Hard Delete

*Commits: `4e378ea`, `6a9a6a2`, plus **uncommitted** work (entity card icons, `is_hidden` enforcement pass, DB warm-up — see §3/§4)*

Three distinct, deliberately separate actions:

| Action | Who | Reversible? | Effect |
|---|---|---|---|
| **Hide** | Entity manager | Yes | `entities.is_hidden = true`, cascades to `campaigns.is_hidden = true` on all its campaigns |
| **Soft delete** | Entity manager | No (self-service) | `entities.deleted_at`/`deleted_by` set, `status='deleted'`, cascades to `campaigns.deleted_at` on all its campaigns |
| **Hard delete** | Platform admin only | **No, ever** | Entity row and everything under it permanently erased from the DB |

### Hide (migration `021_entity_is_hidden.sql`)
`PATCH /api/entities/:id/visibility` (`entities.service.js: setEntityVisibility`) — ownership-checked, transactional. Hiding cascades to campaigns; **unhiding the entity does NOT un-hide its campaigns** — a campaign could have been hidden independently before the entity-level hide, and blindly restoring it would surprise-publish it. Frontend: `EntitiesService.setVisibility()`.

### Soft delete (migration `020_entity_deletion.sql`)
`DELETE /api/entities/:id` (`entities.service.js: softDeleteEntity`) — ownership-checked, transactional, cascades `deleted_at` to campaigns. `getMyEntities` filters `deleted_at IS NULL`; `getEntityById` deliberately does **not** (it's shared with the platform admin's org-detail view, which needs to see soft-deleted entities to manage/restore/hard-delete them).

### Hard delete (platform admin)
`POST /api/platform/organizations/:id/hard-delete` (`platform.service.js: hardDeleteEntity`), requires `notes` (reason, enforced via existing `requireNotes` helper). **FK map matters here** — most children (`campaigns`, `donations`, `campaign_ambassadors`, `entity_billing`, `user_entities`) cascade automatically via `ON DELETE CASCADE`, but `receipts`, `email_logs`, and `platform_audit_log` use `ON DELETE NO ACTION` (financial/audit records shouldn't silently vanish via an unrelated cascade) — these are cleared explicitly in a transaction before the `DELETE FROM entities`. The audit-log entry for the hard-delete action itself is preserved with `entity_id = NULL` (the entity is gone by the time it would reference it) and the entity name baked into the `notes` text instead.

### Frontend UI
- `entity-settings.component` (the full "ניהול עמותה" page): a "נראות" (visibility) zone (amber) above a "מחיקת עמותה" danger zone (red) — both need typed exact-name confirmation for delete; visibility toggle is a single click (reversible, no friction).
- Platform admin: `platform-organization-detail-page` has a red "מחיקה לצמיתות" zone below suspend/reactivate, also typed-name + required-notes confirmation.
- **Uncommitted**: quick-access icon buttons (eye-off/eye/trash, `lucide-angular`) added directly on the entity card in `settings-page.component` ("הישויות שלי" grid) — the manager reported the full-page danger zone was too hard to find. Delete-from-card opens the same typed-confirmation modal (duplicated in `settings-page.component`, not shared — acceptable given its small size). Hide/unhide-from-card is instant, mirrors the campaign card's own hide/unhide icon pattern exactly (`campaigns-page.component`'s `.btn-icon-action`/`.btn-unhide`/`.badge-hidden` classes copied over).

### Real bug found while building this: `is_hidden` was never enforced anywhere (uncommitted)
Campaigns have had an `is_hidden` column and a working toggle UI all along (`PATCH /api/campaigns/:id/visibility`) — but **no query anywhere ever checked it**. "Hide campaign" set a flag that only ever showed a badge in the manager's own list; it never actually hid anything from the public. Audited and fixed **11 queries across 4 files**:

- `campaigns.service.js`: `getCampaignBySlugPublic`, `discoverCampaigns`
- `social-meta.service.js`: `getCampaignMeta` (the dynamic-rendering route), `renderSitemap`
- `donations.service.js`: `createDonation`'s campaign lookup (now blocks creating a donation against a hidden/deleted campaign — deliberately still allows **draft** campaigns, since the studio editor's live preview lets a manager test-donate against their own unpublished campaign), `getLiveDonations` (donation toasts), `getCampaignDonors` (donor list + top-donors) — the latter two needed a new `entities` join, they didn't have one at all
- `ambassadors.service.js`: `listPublic`, `selfRegister`, `getBySlug` — same missing-join issue

Deliberately **left alone**: `getDonationPublic` (a donor viewing their own receipt via an unguessable UUID — shouldn't break just because the campaign was hidden after they donated).

All fixes are `c.is_hidden = false AND e.is_hidden = false` (both levels — entity-hidden cascades campaign-level flags too, but checking both directly is cheap defense-in-depth and matches how the manager's own list displays state).

**Verified end-to-end** with a throwaway test entity (campaign + donation + ambassador, all cleaned up after): confirmed visible on all 6 surfaces (public campaign page, discover, dynamic-rendering route, sitemap, donor list, ambassador public list) before hiding; confirmed all 6 correctly dropped after hiding the entity; confirmed a new donation attempt against the now-hidden campaign is rejected; confirmed unhiding the entity does **not** resurrect the campaign (matches the documented design choice).

---

## 3. Two more real bugs found & fixed along the way (uncommitted)

**Broken migrations that silently never applied**: `006_campaign_is_hidden.sql` (adds `campaigns.is_hidden`) and `010_ambassador_deactivation.sql` (adds `campaign_ambassadors.deactivated_at`/`deactivated_by`) were both sitting in the migrations folder, never run against the actual DB. `006` just needed running. `010` had a **real bug** — `deactivated_by` was declared `UUID REFERENCES users(id)`, but `users.id` is `BIGINT`; the `ALTER TABLE` always failed with a type-mismatch error, presumably swallowed/ignored whenever someone last tried to apply it. Fixed the column type and applied both.

**`campaignsCount`/`usersCount` never computed**: the settings page's entity-card stat boxes always showed "0 campaigns" — the frontend template referenced `entity.campaignsCount || 0` / `entity.usersCount || 1`, but no backend query ever populated those fields (the `|| 1` fallback on users happened to look plausible, masking that it was fake too). Added real `COUNT(*)` subqueries to `getMyEntities`.

**`SELECT e.*` was dragging multi-MB PDF blobs into every entity API response**: found while debugging why the settings page felt hung — `getMyEntities`/`getEntityById`/`updateEntity`/`requestReview` all used `entities.*`, which includes `association_certificate_data`/`tax_document_data`/`registration_document_data`/`logo_data` (raw `bytea` document uploads), serialized as JSON byte-arrays. One entity's response was **16.5MB**. Added a `stripBlobs()` helper applied at every read/write return point in `entities.service.js`; response is now ~2KB. This was a genuine, severe, pre-existing performance bug unrelated to anything asked for this session — just surfaced by chance during testing.

---

## 4. Login/DB latency (uncommitted)

Diagnosed via direct timing tests (not guessed): a trivial `SELECT 1` through a **fresh** connection took 2–56 seconds at various points this session (Supabase pooler in `ap-northeast-2`/Seoul, likely under load from the sheer number of one-off diagnostic scripts run today), while the **same query through the live server's already-warm pool** was ~0.5s — normal.

**Root cause of "login feels slow"**: `nodemon` restarts the backend on every file save (constant during active development), which resets the connection pool to zero warm connections. Whichever real request lands first after a restart — often a login — eats the full reconnection cost.

**Fix** (`hamonym-backend/src/db/db.js`):
- Fires a warm-up `pool.query('SELECT 1')` immediately on module load, so the server pays the reconnection cost once at startup instead of a real user paying it on their next click.
- Bumped `idleTimeoutMillis` from 30s to 5 minutes, so connections survive normal gaps between user actions without needing to reconnect.

Verified: login right after a fresh nodemon restart now returns in 0.44s (previously multi-second to 25s+).

---

## 5. Settings page UI polish (uncommitted, small)

- All "עריכה" edit-trigger buttons across the entity management page (basic-info, profile, goals, payment, billing) now consistently show a small pencil icon (`size 13`, `strokeWidth 1.75` — reduced from the initial pass per feedback that the default stroke looked "exaggerated" at button scale). Fixed in one shared place (`settings/styles/settings-section-actions.css`'s `.edit-btn`) rather than per-component.
- "החשבון שלי" panel: single edit/save toggle (not per-field), row layout is icon+label grouped on the right, value alone on the left (per explicit design feedback — was originally value+icon together, which read wrong in RTL).
- Entity stat boxes (קמפיינים/משתמשים counts): flag/people icons added, positioned to the right of the number (RTL — icon is the first DOM child so it renders rightmost), sized up to 22px with explicit `width`/`height`/`flex-shrink: 0` after an initial pass had them visually clipped.

---

## Known open items / deferred

- Production hosting not chosen — the dynamic-rendering route (§1) has no reverse proxy routing real bot traffic to it yet.
- Real GA4 Measurement ID not yet provisioned (`environment.gaMeasurementId` is empty).
- Google Search Console not yet set up (placeholder comment in `index.html` only).
- Sensitive fields (`cardcom_api_password`, etc.) are still returned in cleartext by `getMyEntities`/`getEntityById` — noted as a separate, lower-priority concern, not fixed this session (out of scope, and fixing it risks breaking the entity-settings edit form's prefill behavior without more investigation).
