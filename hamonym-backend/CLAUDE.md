# Hamonym Backend — Claude Context

## Overview

Node.js + Express 5 backend for Hamonym Studio (Hebrew SaaS fundraising platform).

- **Port:** 3000
- **Start:** `npm run dev` (nodemon)
- **DB:** PostgreSQL via `pg` pool (`src/db/db.js`)
- **Frontend:** `c:\DEV\HamonymStudio\hamonym-app\`

## Route Map

```
POST   /auth/login
POST   /auth/register
POST   /auth/google

GET    /api/entities/my                         (auth)
GET    /api/entities/:id                        (auth)
PATCH  /api/entities/:id                        (auth)
GET    /api/entities/:id/dashboard              (auth)

GET    /api/campaigns                           (auth)
POST   /api/campaigns                           (auth)
GET    /api/campaigns/:id                       (public)

POST   /api/donations                           (public)
POST   /api/donations/mock-complete             (dev only)
GET    /api/donations/return                    (Cardcom callback)
GET    /api/donations/public/:id                (public)
GET    /api/donations/campaign/:slug/donors     (public)
GET    /api/donations/campaign/:slug/live       (public, polling)
GET    /api/donations/entity/:id                (auth)
```

## Auth Middleware

```javascript
const requireAuth = require('../../middleware/require-auth');
// Adds req.user = { id, roleId } from JWT
```

JWT payload: `{ userId, roleId }` — signed with `process.env.JWT_SECRET`.

## SQL Conventions

Parameterized queries with `$1`, `$2`, etc.:

```javascript
// Building dynamic WHERE with safe parameter indexing:
const where  = ['d.entity_id = $1'];
const params = [entityId];
let idx = 2;

if (status) {
  where.push(`d.status = $${idx++}`);   // Note: $${} not ${} !
  params.push(status);
}
// ...
db.query(`SELECT ... WHERE ${where.join(' AND ')} LIMIT $${idx} OFFSET $${idx+1}`,
         [...params, limit, offset]);
```

> **Warning:** In PowerShell `-replace`, `$1` in the replacement string is a capture group reference and gets erased. Never use PowerShell regex replace to write JS files containing `$1`/`$2`.

## Payment Provider

Set `PAYMENT_PROVIDER=mock` in `.env` to use the mock payment flow instead of Cardcom.

## Environment Variables

```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
JWT_SECRET
PAYMENT_PROVIDER          # "mock" | "cardcom"
FRONTEND_URL              # http://localhost:4200
BACKEND_URL               # http://localhost:3000
GOOGLE_CLIENT_ID
```
