# Campaign comments — release runbook (migration 090)

Status: prepared and verified locally only. Not applied to production.

## Release contents (on top of origin/main 3db1e56)

Backend:
- `src/modules/comments/comments.{service,controller,routes}.js`: moderation, paging, rate limit, trusted-proxy sub-app, Super Admin `/manage/_proxy-check`
- `migrations/090_campaign_comments_moderation.sql`
- `scripts/rollback-090-step1-archive-unpublished.sql` (mandatory before any older backend serves traffic)
- `scripts/rollback-090-campaign-comments-moderation.sql` (optional schema rollback)
- `scripts/restore-090-archived-comments.sql`
- `scripts/test-campaign-comments-postgres.js`, `scripts/test-comments-migration-transition-postgres.js`

Frontend: the Hebrew-only backport files (comments service, `campaign-comments` component, `comments-design-editor`, dashboard `campaign-dashboard-comments`, `utils/comments-design.ts`, and the wiring in the state service, page-builder step, campaign preview and dashboard page).

`server.js`, the middleware, package files, donations, billing, FIN-11, MASAV and multi-currency are untouched.

## COMMENTS_TRUST_PROXY: choosing the value

Default (unset): no forwarded address is trusted. Every visitor looks like the TCP peer. Behind Render that is the proxy, so **all visitors share one rate-limit source**:
- 3 comments per 10 minutes per campaign;
- 10 per day across the platform.

That is safe, but too strict for real use. Set the value before announcing the feature.

1. Deploy with the variable unset.
2. As Super Admin, open `GET /api/comments/manage/_proxy-check` from a plain connection (no VPN or proxy). It returns only counts and address kinds, never an address.
3. If the result is `forwardedForEntries = N` and `socketAddressKind = private`, the infrastructure adds N entries.
4. Repeat with a forged `X-Forwarded-For: 1.2.3.4` header. `forwardedForEntries` must grow by exactly 1. That shows the leftmost entry is client-controlled.
5. Set `COMMENTS_TRUST_PROXY=N`, or the proxy addresses/CIDRs if they are documented. Never use `true`, which is refused. Redeploy, then check that `resolvedFrom = forwarded`, `trustedHopsApplied = N` and `resolvedAddressKind = public`.

## Deployment order

1. Take a full production backup and restore it into an isolated container (same procedure as 086/088).
2. Read-only check of `campaign_comments` and `campaigns.blocks`. Count the campaigns with a comments block or with comments.
3. Apply 090. Verify: columns, the status default is `published`, constraints, indexes, existing comments `published`, the modes as counted in step 2.
4. Deploy the backend. Run the smoke tests. Set `COMMENTS_TRUST_PROXY` as above.
5. Deploy the frontend backport.

Old backend + 090: comments stay published and nothing is hidden (verified).

New backend + old frontend: on campaigns in approval mode, the old form reports a failure although the comment was saved as pending. Keep this window short.

## Rollback (mandatory order)

1. **Run `rollback-090-step1-archive-unpublished.sql` before any older backend serves traffic.**
   - Pending and hidden comments move to `campaign_comments_090_archive`, unchanged.
   - A constraint then allows only published rows in the live table, so the still-running new backend cannot create new pending or hidden rows (those requests fail with 500).
   - The step is transactional and repeatable. It stops without changing anything if an archived id conflicts.
2. Deploy the older backend.
3. Optional: run `rollback-090-campaign-comments-moderation.sql`. It refuses unless step 1 ran first. It archives all remaining rows and every campaign's mode, then drops the 090 columns. `author_email` stays nullable.
4. Roll forward: migration 090, then `restore-090-archived-comments.sql`. Archive rows are marked `restored_at` and never deleted.

Never redeploy the older backend before step 1: it lists every row, including pending and hidden comments.

## Smoke tests after deploy

- GET for an existing campaign with comments: the same comments as before, plus `total`.
- POST on an auto campaign: the comment appears. POST on an approval campaign: `pending`, not on the page.
- A 4th POST from one source within 10 minutes: 429, also with a forged `X-Forwarded-For`.
- `/manage`: 401 without a login, 403 for another organization. Approve and hide reach the public list.
- Draft or hidden campaign: empty list, POST returns 404.
- No new 5xx in the Render logs.
