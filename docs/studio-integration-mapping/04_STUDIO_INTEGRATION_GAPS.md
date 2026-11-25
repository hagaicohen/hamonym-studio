# 04 - Studio integration gaps
> Inspection date: 2026-11-24. Evidence is local code and migration files, not a deployed-schema or runtime certification. No application/configuration/test changes, builds, test suites, API mutations, or database operations were performed.
>
> Source aliases: **F** = `C:/DEV/HamonymStudio/hamonym-app` (frontend/main checkout); **B** = `C:/DEV/HamonymStudio/hamonym-backend` (sibling backend in the parent repository); **L** = `F/hamonym-backend` (divergent nested backend). Do not combine these copies silently. B is the backend mapped below; deployment alignment remains a release prerequisite. Claude's conversion files are untouched.


Reference read in full: [STUDIO_BACKEND_MAPPING.md](C:/Users/hagai/Downloads/CLOUDE/STUDIO_BACKEND_MAPPING.md), supplied v4.48. It describes intended integration seams, not proof that equivalent classes/endpoints are deployed. Local Claude conversion: C:/DEV/HamonymStudio/simple-studio-conversion; inspected without modification. Some documented class names differ from the conversion's engine/store names.

## Explicit mapping
| Studio value/capability | Existing authority / integration | Status or gap |
|---|---|---|
| campaignState.current document | CampaignDraft + CampaignApiService; backend campaign SQL | Adapter required; never a second business ledger |
| content.hero.title | Campaign title; management title derives from it | Bind both views to one canonical value |
| content.stats.goal | target_amount | Business numeric value, not demo counter |
| content.campaignInfo.endAt/category | Campaign lifecycle/category fields | Map dates/enums to existing validated values |
| content.share.url / derived slug | Backend slug, generated on create; published slug restrictions | Do not parse/change published identity silently |
| content hero/header/logo/story | Existing scalar Hero/logo/story fields + presentation document | Preserve unknown fields; story node-tree conversion must retain semantics, not flatten rich text blindly |
| template/theme/visible/deviceVisibility/sectionOrder | Existing layout/blocks and render configuration | Presentation adapter required, not arbitrary SQL columns |
| desktop/mobile design | Device overrides in presentation settings | Preserve unset inheritance; no copy/freeze on switching |
| management organizer/access | Authenticated entity/user context + backend membership | Host context is not authorization; don't persist client roles as truth |
| donations amounts/monthly/installments | Existing donation settings and checkout contracts | Exact mapping needed; monthly != card installments |
| rewards/items | Campaign rewards JSON + paid reward snapshots | Preserve IDs; real inventory/price backend-owned |
| ambassadors/items | campaign_ambassadors + adjustments/paid donations | Never replace live ledger with demo module array |
| donors/comments | Public live APIs/moderation | Read-only feed projection; comments frontend/backend contract diverges |
| updates/sponsors | Authored campaign JSON; affiliations separate | Reuse existing save fields; keep partner identities distinct |
| races | Registration options/orders/participants | Partial backend fit; heats/capacity/full race model not established |
| campaignKind simple/minimal | Existing minimal pageFormat and publication rules | Not a direct enum substitution; target requirement remains |
| readinessEvidence | Existing server publication blockers | UI evidence never overrides server gates |
| media references | Upload API public URLs | Local hamonymmedia references need asynchronous resolution |
| cart/exportCart | Existing checkout donation/reward/registration payloads | UI cart is not payment truth; validate server-side |
| local persistence/export | Existing server create/update/get | Current conversion persistence is synchronous local storage; no remote guarantee |
| public HTML/export | Existing Angular campaign page and live feeds | Standalone export is not server publication |

## Concrete current seam
### Implementation cross-reference
| Studio capability | Existing implementation | Files/functions | Database fields/tables | Gap | Recommended integration |
|---|---|---|---|---|---|
| Save/reopen | Authenticated create/update/get | F CampaignApiService.toSnake/fromSnake; B campaigns.service.createCampaign/updateCampaign/getCampaignById; exact links in report 01 | campaigns scalar/JSON columns, related options/ambassadors | Synchronous local persist; whole JSON replacement | Async adapter and intentional patches |
| Theme/layout/devices | Shared draft and campaign renderer | F campaign-studio-state.service.ts; campaign-preview.component.ts; report 02 | campaigns.layout/blocks; physical types unconfirmed | Prototype document not automatically consumed by renderer | Versioned namespace + shared presentation adapter |
| Live modules | Public donations/ambassadors/comments services | B donations.service.getCampaignDonors/getRewardCounts; ambassadors.service.listPublic; comments.service; report 02 links | donations, campaign_ambassadors, campaign_comments | Demo arrays; contracts differ | Read-only feed projection; no save-back |
| Media | Authenticated upload | B media.routes.js; report 03 link | Public storage object URL persisted in campaign fields | Browser-local references | Existing upload bridge before save |
| Publication | Existing blockers/manual and deferred publish | B campaigns.service.getPublishBlockers/publishRequestedCampaigns; reports 01/03 | campaigns.status/publish_requested_at/published_at | No isolated live-edit draft | Server published projection and promotion |
| Payments/cart | Checkout and verified Cardcom workflow | F checkout-v2.component.ts; B donations.service/payment.handler; report 03 | donations, recurring_instructions, registration_orders/participants | Prototype completion is UI-only | Existing checkout using actual IDs; defer unsupported operations |

CampaignPersistenceService.persist returns synchronous {ok,message} after writing hamonym-studio-v01 through draft storage. A successful local return cannot mean server save. **PROPOSED:** asynchronous host save integration with explicit local/saving/server-saved/error states; retain Claude's UI/state/history ownership and avoid direct HTTP sprinkled throughout visual components.

## Smallest compatible contract — PROPOSED, not implemented
Use a versioned namespace such as layout.simpleStudio within the existing JSON serialization path, after verifying the actual DB type. Keep CampaignDraft authoritative for business fields; store authored presentation there with schemaVersion and stable component IDs. Round-trip unknown namespace/sibling fields; never normalize existing campaigns destructively. Bilingual paths must use the existing canonical Hebrew/English mechanism, including publication language gates.

No new endpoint/table is automatically required for first draft create/get/patch. However current whole-JSON replacement and no CAS are unsafe for concurrent writers:
- Add intentional dirty-field patches and backend-supported atomic document revision checks; stale writes return a clear conflict.
- Capture immutable submitted snapshots and serialize saves; a slow response must not mark subsequent edits saved.
- Omit untouched ambassadors/options to avoid destructive synchronization.
- Bound/validate document size; express.json currently has no explicit increased limit, so the translation validator's 1MB ceiling is not a transport guarantee.
- Resolve media before remote persistence and restore authoritative returned IDs/options.

## Draft versus published content — PROPOSED server work
Existing public GET exposes layout wholesale; adding draft/published keys alone leaks draft content unless the server projects published-only data. Likewise root title/rewards/settings currently update in place: two presentation snapshots do not stage those business fields.

Before promising unpublished edits to a live campaign, define staged authored changes and an atomic promotion through existing publication gates, including organization-approval auto-publication. Exclude totals, permissions and payment secrets from staging. Document revision/history and draft-vs-live are different requirements; local Undo/Redo is neither.

## Blocking gaps and decisions
1. Confirm deployed frontend/backend pairing: B and nested L diverge; F lacks the safe patch adapter from the separate integration worktree.
2. Verify actual schema/applied migrations (especially 087–090); source files alone cannot prove readiness.
3. Fix bilingual create/update absence behavior before claiming reliable bilingual persistence.
4. Implement async persistence/media/context adapters before financial/public features.
5. Source v4.48 explicitly defers races, public join/comments, monthly/installments and matching for the first slice. Keep these unavailable explicitly; do not display fake functional actions.
6. Product decision only if staging is expected immediately: whether first release allows live-campaign edits before draft/published isolation. Safer recommendation: do not promise isolated unpublished editing until server projection/promotion exists. Previously approved draft-organization authoring policy remains a backend implementation item, not a new product question.

