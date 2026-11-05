# Organization categories and category suggestions

## Official list (2026-11-03)

`src/modules/campaigns/entity-categories.js` is the backend copy of the frontend
list (`hamonym-app/src/app/shared/config/entity-categories.ts`); ids and Hebrew
labels must match (`scripts/test-campaign-category-validation.js`, check F).
Stored values are ids, so adding a category needs no migration. The AI
campaign-creation prompt builds its closed category list from this file.

Added: settlement, agriculture, youth-movements, security-rescue,
soldiers-reservists, bereaved-families, heritage-commemoration, communities,
employment-training, immigrant-absorption, disabilities-accessibility,
food-security, housing ("דיור", separate from "סיוע לנזקקים"),
research-development. "בעלי חיים" already existed.

## Suggestions (migration 086)

- Table `category_suggestions`; one pending row per normalized label.
- `POST /api/category-suggestions` (authenticated): label 2–60 letters/digits/
  spaces/basic punctuation; optional `entityId` requires membership; an
  existing official category returns 409 with that category; a pending
  duplicate returns 200 `duplicate: true`; 5 per hour and 20 per day per user.
- `GET /api/platform/category-suggestions?status=`, `POST .../:id/approve|reject`
  (Super Admin only, optional note ≤ 500, audit log).
- Approving never changes the official list or any entity's categories.
- The frontend link is hidden for now (`CATEGORY_SUGGESTIONS_ENABLED = false`).

Deploy order: backend (categories) → migration 086 → frontend. Until 086 is
applied, the suggestion endpoints fail if called directly; nothing in the
current UI calls them.

Tests (isolated local Postgres only; both refuse a non-local `DB_HOST`):
`scripts/test-category-suggestions-postgres.js`,
`scripts/test-campaign-category-validation.js` (set `HAMONYM_APP_DIR` when the
frontend is not the sibling directory).
