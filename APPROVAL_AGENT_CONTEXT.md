# Approval Agent — Session Context

Full summary of the AI Agent infrastructure built in this session, for continuity in a new chat. Everything described here is implemented and smoke-tested against real data (including a real OpenAI call). **Nothing in this arc is committed yet** — all on branch `feature/approval-agent-skeleton`.

## Project Stack (recap)

- **Frontend**: Angular 17+ standalone components, signals — `hamonym-app`
- **Backend**: Node.js + Express 5 + PostgreSQL (`pg` pool) — sibling repo `hamonym-backend`, plain JS/CommonJS (no TypeScript anywhere in this backend)
- **Git topology**: `hamonym-app` and the parent `c:\DEV\HamonymStudio` repo (which contains `hamonym-backend`) push to the same remote/branch (`hagaicohen/hamonym-studio.git`, `main`). Push `hamonym-app` first, then in the parent: `git fetch && git rebase origin/main && git push` (use `git -c http.sslVerify=false`, local SSL cert quirk).

---

## Why this exists

Building toward an AI layer that helps a Super Admin decide whether to approve a new organization (`entities.status`). Deliberately staged, per explicit direction: **Agent → Tools → Context → Normalizer/Facts → Validation Engine/Checks → Prompt → OpenAI → Recommendation → UI → (later) RAG → Vector DB → MCP → Multi-Agent**. (Normalizer/Facts and Validation Engine/Checks were both inserted mid-session, between Context and Prompt — see §3d and §3e — as it became clear the prompt builder shouldn't couple itself to raw tool shapes, and the LLM shouldn't have to re-derive verdicts the code already knows how to judge, e.g. "is סעיף 46 missing.") Each stage has to work and be verified before the next is added — no framework, no workflow engine, no MCP, no multi-agent for now. UI is wired and working (§1); RAG is next only after real usage surfaces what's actually missing.

---

## 1. Architecture

```
Angular (super admin, "ניתוח עמותה" button on platform-organization-detail-page)
    │
    ▼
POST /api/platform/organizations/:id/recommend   ← what the button calls today
    │                                                (POST .../analyze also exists, unchanged,
    │                                                 kept as an internal/debug API — not wired
    │                                                 to any button — returns raw ApprovalContext,
    │                                                 no LLM. See §3f.)
    ▼
ApprovalAgent.recommend(entityId)
    │
    ▼
ApprovalAgent.analyze(entityId)  — pure data gathering, no LLM
    │
    ├── EntityTool, WebSearchTool, DocumentTool, CampaignsTool run in parallel
    │     EntityTool      → entities.service.getEntityById, shaped to a safe whitelist
    │     WebSearchTool   → stub (returns null) — no real integration exists (Google has no free API; SerpAPI/Custom Search not set up)
    │     DocumentTool    → association certificate + tax document metadata (no raw blob bytes)
    │     CampaignsTool   → campaign list for the entity
    │
    ├── GuideStarTool runs AFTER, using entity.registrationNumber (GuideStar has
    │     no concept of our internal entityId, so this can't be parallel with EntityTool)
    │     → REAL integration: guidestar.org.il REST API (login + org lookup by reg number)
    │
    ▼
ApprovalContext { entity, guideStar, webSearch, documents, campaigns }
    │
    ├── buildApprovalFacts(context)    → approval.facts.js — Normalizer/Fact Builder, see §3d
    ▼
ApprovalFacts { entityName, entityStatus, nihulTakin, approval46, campaignsCount, ... 16 flat fields }
    │
    ├── buildApprovalChecks(facts)     → approval.checks.js — Validation Engine, see §3e
    ▼
ApprovalCheck[] — 10 checks, each { id, title, status: pass|warning|fail, explanation }
    │
    ├── buildApprovalPrompt(entityName, checks)  → approval.prompt.js, pure string formatting, Hebrew
    │     — never sees ApprovalContext or Facts, only entityName + already-judged Checks
    ├── llm.service.getApprovalRecommendation(systemPrompt, userPrompt)  → OpenAI gpt-4o-mini, JSON mode
    │
    ▼
{ summary, confidence, recommendation, checks, trace }
    │
    ▼
Angular displays it directly on the page (§3f) — not just console.log anymore
```

All files under `hamonym-backend/src/agents/approval/`:
```
approval.agent.js       — analyze() + recommend()
approval.types.js       — JSDoc typedefs only (no TS compiler in this backend)
approval.facts.js       — buildApprovalFacts(context) — Normalizer/Fact Builder, see §3d
approval.checks.js      — buildApprovalChecks(facts) — Validation Engine, see §3e
approval.prompt.js      — SYSTEM_PROMPT + buildApprovalPrompt(entityName, checks)
llm.service.js          — thin OpenAI wrapper, reads OPENAI_API_KEY
guidestar.service.js    — thin guidestar.org.il REST wrapper (login + org lookup), reads GUIDESTAR_*
trace.util.js           — createTracer(label) — per-step timing, see §3b
tools/
  entity.tool.js
  guidestar.tool.js      — REAL, shapes guidestar.service.js's raw response
  websearch.tool.js      — stub
  document.tool.js
  campaigns.tool.js
```

Demo scripts (backend `scripts/`, matching the project's existing ad-hoc-script convention):
- `node scripts/demo-approval-agent.js <entityId>` — just the Context (no LLM)
- `node scripts/demo-approval-recommend.js <entityId>` — full pipeline including the real LLM call

## 2. What's real vs. stubbed

| Piece | Status |
|---|---|
| Entity profile (Tool 1) | **Real** — DB, safe whitelist |
| Documents (Tool 4) | **Real** — metadata only, no blob bytes |
| Campaigns | **Real** — DB |
| GuideStar (Tool 2) | **Real** — guidestar.org.il REST API (login → bearer token → org lookup by registration number). See §3c. |
| Web search / Google (Tool 3) | **Stub** — returns `null`, deliberately skipped per explicit decision (no free Google API; a paid one like SerpAPI/Custom Search wasn't set up yet) |
| Normalizer / Fact Builder | **Real** — see §3d |
| Validation Engine | **Real** — see §3e |
| Prompt builder | **Real** — consumes `ApprovalCheck[]` + `entityName`, not `ApprovalFacts` or `ApprovalContext` |
| LLM call | **Real** — `gpt-4o-mini`, JSON mode, verified against the real OpenAI API this session |
| UI | **Real** — wired, displays summary/confidence/recommendation/trace on the page. See §3f. |

`recommend()` runs today with webSearch `null` (GuideStar is real now) — the Normalizer sets `webSearchFound: false`, so the LLM sees a clean fact rather than hallucinating data it doesn't have.

## 3c. GuideStar integration (real, not a stub)

`guidestar.service.js` — thin wrapper around `guidestar.org.il/services/apexrest/api` (Salesforce-backed):
- `POST /login` with `{ username, password }` (from `GUIDESTAR_USERNAME`/`GUIDESTAR_PASSWORD` in `.env`) → `{ sessionId }`.
- `GET /organizations/:registrationNumber?fullObject=true` with `Authorization: Bearer <sessionId>` → raw org payload (~30 fields).
- **No refresh-token flow known** — logs in fresh on every lookup. Simple and correct; only worth caching the session if Tracing shows the extra login round trip actually matters (it currently takes ~1.2s combined with the org lookup, not a bottleneck yet).
- 404 from GuideStar → tool returns `null` (organization not found in their registry), not an error.

`guidestar.tool.js` shapes the raw payload down to what matters for an approval decision — not the full ~30-field dump:
```json
{
  "registrationNumber": "580014983",
  "name": "לביא - העמותה העירונית לפיתוח החינוך בירושלים (ע\"ר)",
  "status": "עמותה רשומה",
  "yearFounded": 1984,
  "goal": "לקיים, להחזיק ולנהל בית ספר",
  "primaryClassification": "חינוך, השכלה והכשרה מקצועית",
  "hasProperManagementCert": true,
  "properManagementCertValidNextYear": true,
  "approvedForTaxDeduction46": true,
  "hasSubmittedRecentReports": true,
  "guidestarUrl": "https://www.guidestar.org.il/organization/580014983"
}
```
`hasProperManagementCert` ("ניהול תקין") and `approvedForTaxDeduction46` (סעיף 46) are the two fields that matter most for a donation platform's approval decision — both now flow into the LLM prompt for real.

## 3d. Normalizer / Fact Builder (new layer, inserted between Context and Prompt)

**The pipeline changed shape.** It used to be `ApprovalContext → PromptBuilder → LLM` (the prompt builder read `entity`/`guideStar`/`documents`/`campaigns` directly, each in its own shape). Now it's:

```
ApprovalContext → approval.facts.js (Normalizer) → ApprovalFacts → approval.prompt.js (PromptBuilder) → LLM
```

**Why**: `approval.prompt.js` was directly formatting three differently-shaped payloads (GuideStar's ~10 fields, Entity's ~20 fields, a documents array) into prose. That meant every prompt tweak was coupled to every tool's exact shape, and swapping GuideStar for a different provider tomorrow would mean touching the prompt too. `approval.facts.js` is the single seam where "raw tool data" becomes "verified business facts" — 16 flat boolean/count/string fields (`nihulTakin`, `approval46`, `campaignsCount`, `websiteExists`, ...), each already computed by code, not left for the LLM to infer. `approval.prompt.js` now only knows about `ApprovalFacts` — it has never seen GuideStar's or Entity's actual shape.

**Effect on the prompt**: shrank from ~858 chars (narrative dump of all three payloads) to ~377 chars (flat `label = value` list). The LLM's `summary`/`recommendation` are still natural Hebrew — it interprets the facts, it doesn't just echo them.

**Traced like everything else** — `Normalizer` is a real step in the pipeline, e.g. `✓ Normalizer (0ms) — facts: 16` (instant — pure computation, no I/O, unlike every other step which hits the network).

**Known rough edge, not fixed**: the LLM sometimes echoes a raw fact name/value verbatim instead of phrasing it naturally in Hebrew (e.g. `⚠ קיים אתר: false` instead of `⚠ אין אתר`) — cosmetic, not structural. Worth a `SYSTEM_PROMPT` tweak later; not done since it wasn't what was asked.

**Verified both paths**: a real, valid registration number (`580014983`, a large real Jerusalem-area org) returns full real data as shown above. Our actual test entity ("קשת נחושה", reg number `580789654`) returns `not_found` — a genuine "not in GuideStar's registry" result from the real API, not a bug — and the LLM correctly factored that into a lower confidence score and a "don't approve yet" recommendation.

## 3. Security note (carried over from the skeleton phase)

`EntityTool` maps the raw `entities` row to an explicit whitelist — this is **not** incidental. `entitiesService.getEntityById`'s raw row includes `cardcom_api_password` in plaintext (a real, separate finding from earlier this session, not yet fixed at the DB/service level for other callers). The whitelist is what stops payment credentials from ever reaching a prompt string or an LLM call.

## 3b. Tracing

`trace.util.js`'s `createTracer(label)` wraps every tool call + the prompt build + the LLM call, printing a clean per-step timing summary to the console. Each `trace(name, fn, describe?)` call takes an optional `describe(result)` returning a small object of counts/status — not the full payload, just enough to tell a slow-but-empty run from a slow-and-full one at a glance:

```
ApprovalAgent.recommend
✓ GuideStarTool (2ms) — status: not_integrated
✓ WebSearchTool (2ms) — results: 0
✓ DocumentTool (2079ms) — documents: 2, uploaded: 2
✓ CampaignsTool (2102ms) — campaigns: 4
✓ EntityTool (2123ms) — found: true
✓ PromptBuilder (1ms) — chars: 830
✓ LLM (3765ms) — confidence: 60
Total: 10074ms
```

`analyze(entityId, callerTracer?)` takes an optional tracer — `recommend()` passes its own through so the whole pipeline (tools + prompt + LLM) prints as one trace; called standalone, `analyze()` creates and prints its own.

**This immediately caught a real bug**: `DocumentTool` was taking ~24s (vs. ~2s for everything else) on its first traced run. Root cause — the exact same anti-pattern fixed twice already this session (`getEntityById`, `getMyEntities`): `entitiesService.getAssociationDocument`/`getTaxDocument` (used by the real file-download routes, so they correctly still `SELECT ..._data`) were being reused by `DocumentTool` just to compute a `hasData` boolean, pulling multi-MB PDF blobs over the wire and discarding them. Fixed by adding metadata-only variants — `getAssociationDocumentMeta`/`getTaxDocumentMeta` (`entities.service.js`) — which select `(..._data IS NOT NULL) AS has_data` instead of the blob itself. `DocumentTool` now uses those; the download routes are untouched. Result: 24s → 2.1s, `DocumentTool` now in line with every other tool.

## 3e. Validation Engine (new layer, inserted between Facts and Prompt)

**The pipeline changed shape again.** `approval.checks.js`'s `buildApprovalChecks(facts)` turns `ApprovalFacts` (raw booleans/counts) into `ApprovalCheck[]` — each one `{ id, title, status: 'pass'|'warning'|'fail', explanation }`. This is the layer where business rules about what's *critical* vs. *nice-to-have* live, in code:

```js
{ id: 'registration_document', title: 'מסמך רישום', status: 'pass'|'fail', ... }   // fail if missing — hard requirement
{ id: 'guidestar',              title: 'רישום ב-GuideStar', status: 'pass'|'warning', ... }  // warning only — a new/small org may not be listed yet
```

10 checks total: `registration_document`, `tax_document`, `contact_info`, `nihul_takin` — all `fail` if missing (hard requirements); `guidestar`, `approval_46`, `recent_reports`, `website`, `profile_complete`, `has_campaign` — all `warning` only (soft signals). **Why this matters**: the LLM no longer decides whether "missing סעיף 46" is serious — that severity judgment is now explicit, in code, testable, and consistent run-to-run. The LLM's job shrank to exactly what it's good at: weighing already-judged checks into one coherent recommendation, in natural Hebrew.

`buildApprovalPrompt` changed signature: `buildApprovalPrompt(entityName, checks)` — it no longer takes `facts` at all. It doesn't know `ApprovalFacts` exists, only the uniform `ApprovalCheck` shape.

Traced like everything else: `✓ ValidationEngine (0ms) — pass: 4, warning: 4, fail: 2` (instant — pure computation).

**`recommend()`'s return shape grew**: now `{ summary, confidence, recommendation, checks, trace }` — `checks` (the Validation Engine's raw output) is included alongside the LLM's prose, so a future UI could render pass/warning/fail as colored badges instead of only reading the LLM's `summary` text. Not built yet — not asked for.

## 3f. UI wired — the button now shows a real recommendation, not console.log

**Two separate endpoints, deliberately not merged** (explicit architectural decision this session — `analyze()` is infrastructure, `recommend()` is a business use case; merging them would force every future caller that only wants the Context to pay for an LLM call):

- `POST /api/platform/organizations/:id/analyze` — unchanged, still returns raw `ApprovalContext`, no LLM. Kept as an internal/debug API for future consumers (tests, CLI, batch jobs) that only need collected data. **Not wired to any button.**
- `POST /api/platform/organizations/:id/recommend` — **new this session**. `platform.controller.js`'s `recommendOrganization` calls `approvalAgent.recommend(id)`, returns the full `{ summary, confidence, recommendation, checks, trace }`. This is what the "ניתוח עמותה" button calls now.

`platform-organization-detail-page.component.ts`: `recommendOrganization()` replaced the button's old `analyzeOrganization()` handler (that method still exists in the component, unused by any button — kept for the same reason as the backend `analyze()` route). Result renders in a simple `.plat-ai-recommendation` panel directly on the page: title with confidence %, the checklist `summary` (pre-formatted, `white-space: pre-wrap`), the `recommendation` sentence, and an "מעקב ריצה" (Execution Trace) section listing every pipeline step with its duration. No fancy design — explicit per direction ("אין צורך עדיין במסך חדש או בעיצוב מתקדם").

Verified via Playwright against the real running app: click → panel appears with real confidence/summary/recommendation/trace, matching a real live OpenAI call.

## 4. Verified this session

- `ApprovalAgent.analyze()` — real entity, real documents, real campaigns, in the exact `ApprovalContext` shape.
- `POST /api/platform/organizations/:id/analyze` — real HTTP round trip, gated by `requirePermission('organizations')` (same as sibling approve/reject actions on that page), confirmed via Playwright.
- `POST /api/platform/organizations/:id/recommend` — real HTTP round trip, real button click through the actual UI, confirmed via Playwright screenshot showing the rendered panel.
- `buildApprovalChecks()` — real output inspected: 10 checks, correct pass/warning/fail severities (hard requirements → fail, soft signals → warning).
- `buildApprovalPrompt(entityName, checks)` — inspected real output, correctly formatted Hebrew prompt built from Checks only.
- `ApprovalAgent.recommend()` — **real OpenAI call succeeded**, example output (current shape, with Checks + Validation Engine):
  ```json
  {
    "summary": "✔ מסמך רישום: מסמך הרישום הועלה\n✔ אישור מס: אישור המס הועלה\n✗ פרטי קשר: אין פרטי קשר...\n✗ ניהול תקין: אין אישור ניהול תקין בתוקף\n⚠ רישום ב-GuideStar: העמותה לא נמצאה ברישום GuideStar\n...",
    "confidence": 45,
    "recommendation": "יש לדחות את הבקשה. העמותה חסרה פרטי קשר ואישור ניהול תקין...",
    "checks": [ { "id": "registration_document", "title": "מסמך רישום", "status": "pass", "explanation": "..." }, ... 10 total ],
    "trace": [ ... 9 steps ... ]
  }
  ```
  Note: the LLM chose to use `✗` for `fail`-status checks and `⚠` for `warning`-status ones in `summary`, even though `SYSTEM_PROMPT` only specified two marks (✔/⚠) — a reasonable refinement it made on its own, not a bug.
- Missing-key path fails clean and explicit (`Error: OPENAI_API_KEY is not set`) rather than silently falling back to fake data.

## 5. Explicitly NOT done yet (by design, staged for later)

- No RAG / Vector DB (e.g. רשם העמותות circulars, Hamonym's own internal policies) — explicit direction: don't start until real usage (see §8) surfaces what's actually missing.
- No MCP.
- No multi-agent — one agent only.
- Real web-search integration — deliberately deferred, no credentials/API chosen yet.
- `ApprovalCheck[]` is returned by `recommend()` but not yet rendered as its own UI element (e.g. colored pass/warning/fail badges) — the panel currently only shows the LLM's prose `summary`, not the structured `checks` array directly. Not asked for yet.

## 6. Known unrelated pre-existing issues (noticed, not fixed, out of scope for this arc)

- `association_certificate_name` / `tax_document_name` come back as mojibake (Hebrew filename encoding bug, pre-existing, unrelated to the agent).
- `association_certificate_url` / `tax_document_url` contain stale `blob:http://localhost:4200/...` browser-session URLs that were persisted to the DB — broken, pre-existing, unrelated.

## 7. Environment

- `hamonym-backend/.env`: `OPENAI_API_KEY` set (user's own key, billing enabled on their OpenAI account). Model hardcoded to `gpt-4o-mini` in `llm.service.js` — change there if a different model is wanted.
- `hamonym-backend/.env`: `GUIDESTAR_BASE_URL`, `GUIDESTAR_USERNAME`, `GUIDESTAR_PASSWORD` set (user's own guidestar.org.il login). No refresh-token flow — logs in fresh per lookup, see §3c.
- `openai` npm package added to `hamonym-backend/package.json` — the one new dependency explicitly authorized this session. GuideStar needed no new dependency — plain `fetch` (built into Node 18+).

## 8. Next steps — pivot: from "build AI system" to "build decision system" (explicit direction this session)

Phase 1 (Agent → Tools → Context → Facts → Checks → Prompt → OpenAI → JSON → UI) is **complete** — this is a working system now, not a PoC. Explicit direction going forward: **stop adding layers** (no RAG, no new Tools, no Multi-Agent, no MCP) until real usage surfaces what's actually missing.

1. ~~Agent skeleton~~ ✅
2. ~~Tools (Entity, GuideStar, WebSearch-stub, Documents, Campaigns)~~ ✅
3. ~~Prompt Builder~~ ✅
4. ~~Recommendation (real LLM call)~~ ✅
4b. ~~Tracing~~ ✅ — caught and fixed one real bug (DocumentTool blob transfer, §3b); reports per-tool result metadata, not just timing
5. ~~Replace GuideStarTool stub with a real integration~~ ✅ — see §3c
5b. ~~Normalizer / Fact Builder~~ ✅ — see §3d
5c. ~~Validation Engine / Checks~~ ✅ — see §3e — code now judges severity (fail vs. warning), not the LLM
6. ~~Wire UI to `recommend()`, keep `analyze()` as a separate internal/debug endpoint (deliberately not merged)~~ ✅ — see §3f
7. **← Current step, not yet started**: manually run the agent against **~50 real organizations** and, for each recommendation, ask "why did the Agent recommend this?" This is explicitly a *usage/observation* task, not a coding task — no code changes expected to come out of this step directly. Two outcomes per case, per explicit direction:
   - If the answer is something the code already knows how to check (e.g. "no approval_46") → that's a signal a `Check` is missing or needs a different severity, not that the LLM needs a better prompt.
   - If the answer is something requiring judgment (e.g. "the documents contradict each other") → that's exactly where the LLM is adding real value.
8. Only after that review: decide whether the next investment is more Checks, RAG, or something else — deliberately not decided in advance.
9. WebSearchTool stub → real integration, only if the review in step 7 shows it's actually needed.
10. RAG (רשם העמותות circulars / Hamonym internal policies → Vector DB) — only after step 7-8.
11. MCP
12. Multi-agent (only if actually needed)
