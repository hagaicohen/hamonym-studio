# Hamonym Studio — Claude Context

## Project Structure

This is a monorepo with two separate roots:

| Part | Path |
|---|---|
| Angular frontend | `c:\DEV\HamonymStudio\hamonym-app\` ← **this workspace** |
| Node.js backend | `c:\DEV\HamonymStudio\hamonym-backend\` ← **sibling directory** |

> The folder `hamonym-app/hamonym-backend/` is a stale copy — **never edit it**. Always edit the real backend at `c:\DEV\HamonymStudio\hamonym-backend\`.

## Backend

- **Runtime:** Node.js + Express 5 + PostgreSQL (via `pg` pool)
- **Port:** 3000 (dev), started with `npm run dev` (nodemon)
- **Auth:** JWT in `Authorization: Bearer <token>` header, middleware at `src/middleware/require-auth.js`
- **Key routes:**
  - `POST /auth/login` — login
  - `GET /api/entities/:id/dashboard` — dashboard data (authenticated)
  - `GET /api/donations/entity/:id` — donations admin page (authenticated)
  - `GET /api/donations/campaign/:slug/live` — toast polling (public)
  - `GET /api/campaigns` — campaign list

## Frontend

- **Framework:** Angular 17+ standalone components, signals, `@if`/`@for` blocks
- **Language:** Hebrew, RTL (`direction: rtl`)
- **Auth token:** stored in `localStorage.getItem('token')`
- **Entity ID:** from `CurrentEntityService.currentEntity()?.id`
- **App layout:** `AppLayoutComponent` (topbar + sidebar) wraps authenticated routes
- **Loader:** `AppLoaderService.show()` / `.hide()`

## Key Patterns

### Authenticated HTTP call (frontend)
```typescript
const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
this.http.get<T>(`${environment.apiUrl}/api/...`, { headers }).subscribe(...)
```

### Backend route with auth
```javascript
const requireAuth = require('../../middleware/require-auth');
router.get('/entity/:id', requireAuth, controller.getEntityDonations);
```

### SQL parameterized query
```javascript
// Use $${idx} to produce $2, $3 etc. in template literals
where.push(`d.status = $${idx++}`);
```

## Dates

All dates displayed as `DD/MM/YYYY`. Use:
```typescript
const [y, m, d] = iso.slice(0, 10).split('-');
return `${d}/${m}/${y}`;
```

## DB Schema — key tables

- `donations` — id, campaign_id, entity_id, amount, donor_name, donor_email, donor_phone, is_anonymous, status (pending/paid/failed), completed_at, failure_reason, is_mock, utm_params, created_at
- `campaigns` — id, slug, title, entity_id, status, current_amount, supporters_count, target_amount
- `entities` — id, display_name, entity_type, logo_url, status
- `users` — id, email, full_name, role_id

## Coding Conventions

- No comments unless the WHY is non-obvious
- No `console.log` left in production paths
- Standalone Angular components only (no NgModules)
- CSS variables from dashboard: `--primary-color: #583cd6`
- Status badges: `.status-paid` (green) / `.status-failed` (red) / `.status-pending` (yellow)
