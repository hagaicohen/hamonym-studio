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

## AI / LLM Capabilities

All LLM-backed capabilities live under `src/agents/`, one subfolder per capability — **regardless of whether it's an autonomous judgment-style Agent or a one-shot generation Pipeline**. Don't create a second top-level location (e.g. `src/ai/`) for this — one place to look for "where does AI code live" matters more than the Agent/Pipeline distinction.

```
src/agents/
  llm.service.js        # shared OpenAI wrapper — complete(systemPrompt, userPrompt) → parsed JSON
  trace.util.js          # createTracer(name).trace(step, fn, summarize) for pipeline step tracing
  approval/               # ApprovalAgent — judges an existing entity's readiness for admin approval
  campaign-advisor/       # CampaignAdvisorAgent — advises on an existing campaign
  campaign-creation/       # AI-Assisted Campaign Creation — generates a new draft from source material
```

Shared shape across all of them: `Context (via tools/) → Facts (deterministic) → Prompt → LLM → structured Response`. The LLM never derives facts itself — it only interprets facts the code already computed.

**Naming signals the distinction that matters** (judging vs. constructing), not folder location:
- `*.agent.js` — judges/advises on something that already exists (ApprovalAgent, CampaignAdvisorAgent).
- `*.pipeline.js` — constructs new state from external input (campaign-creation).

See `hamonym-app/AI_CAMPAIGN_CREATION_VISION.md` and `AI_CAMPAIGN_CREATION_MVP.md` for the campaign-creation pipeline's own ADR.

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
