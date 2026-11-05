# Campaign Studio as the default editor — switch and rollback

Decision date: 05/11/2026 (product decision: the Studio replaces the classic Wizard as the default campaign editor).
Status: **committed locally, not pushed, not deployed.**

## Git revision before the switch

| | |
|---|---|
| Branch | `feat/campaign-builder-studio` |
| **Revision before the switch** | `9f3dd93` — Campaign Builder Studio, parity, Lucide icons; the classic Wizard is still the default editor there |
| The switch | the commit right after it, "feat(campaign-builder): make the Studio the default campaign editor" — only the files listed below |
| Earlier base | `081ae4b` (before any Studio page); backup branch `backup/hamonym-app-uncommitted-20261104` |

The Studio and the switch are separate commits, so the switch can be reverted without touching the Studio.

## What the switch changes

One setting, `DEFAULT_CAMPAIGN_EDITOR = 'studio'` in
[src/app/modules/campaigns/campaign-editor-route.ts](../src/app/modules/campaigns/campaign-editor-route.ts), plus path helpers
(`campaignCreatePath`, `campaignEditPath`, `campaignStepLink`) that every entry point now uses:

| Entry point | File | Before | Now |
|---|---|---|---|
| "+ קמפיין חדש" (sidebar) | `core/layout/sidebar/sidebar.component.ts` | `/campaigns/create` | `/campaigns/create/studio` |
| Campaigns page: new campaign / first campaign | `campaigns-page.component.ts` | `/campaigns/create` | Studio |
| Campaigns page: "המשך עריכה" / menu "עריכה" | `campaigns-page.component.ts` | `/campaigns/:id/edit` | `/campaigns/:id/studio` (ambassador-only users still go to the ambassador studio) |
| Campaigns page "Beta" buttons | `campaigns-page.component.html/.css` | separate "סטודיו (בטא)" buttons | removed (the main buttons open the Studio) |
| Dashboard: first campaign button | `dashboard.component.html/.ts` | `/campaigns/create` | Studio |
| Dashboard alert "draft not published" | `dashboard.component.ts` | `/campaigns/:id/edit` | Studio |
| Organization status card "יצירת קמפיין ראשון" | `organization-status-card.component.ts` | `/campaigns/create` | Studio |
| Campaign dashboard "עריכת עיצוב" / "פרסום לציבור" | `campaign-dashboard-status.component.ts/.html` | `/campaigns/:id/edit(?returnStep=10)` | `/campaigns/:id/studio(?returnStep=10)` |
| AI creation: after creating / back | `ai-campaign-creation-page.component.ts` | `/campaigns/:id/edit`, `/campaigns/create` | Studio |
| Partner builder: back to the campaign after creating a partner | `partner-builder-page.component.ts` | `/campaigns/:id/edit?returnStep=4` | `/campaigns/:id/studio?returnStep=4` |

The Studio now reads `?returnStep=<step>` like the Wizard: `10` opens the publish dialog (the Wizard's Step 10), a step with its own area selects that area (4 → rewards), a step hidden for the campaign is ignored.

## What does not change

- The classic Wizard and its routes `/campaigns/create` and `/campaigns/:id/edit` — same component, guard and behavior. The Studio's toolbar still links to it ("עורך קלאסי").
- Partner pages (`/partners/...`, partner builder, campaign-partner builder) and partner-owned drafts: the Studio shows a link to the classic editor for them.
- The ambassador studio (`/campaigns/:id/ambassador-studio`).
- Campaign data: no migration, nothing rewritten on open (the Studio does not run the sidebar migration).
- Business logic, validations, permissions (`campaignEditorGuard` on all four routes) and publishing (the Studio hosts the Wizard's own Step 10).
- Backend, database, financial logic.

## Rollback procedure

Fast rollback (one line, no data impact):
1. In `src/app/modules/campaigns/campaign-editor-route.ts` set `export const DEFAULT_CAMPAIGN_EDITOR: CampaignEditor = 'classic';`
2. Update the expectation in `campaign-editor-route.spec.ts` ("the Studio is the default editor") to `'classic'`.
3. `npm run build`, run the focused specs, deploy the frontend.

All entry points return to `/campaigns/create` and `/campaigns/:id/edit`. The Studio stays reachable by URL. Saved campaigns are unaffected: both editors read and write the same campaign record through the same API.

Full rollback (remove the switch): `git revert <switch commit>`. This returns the code exactly to `9f3dd93`: the Wizard is the default again, and the Studio stays available at `/campaigns/:id/studio` with its "(בטא)" entry buttons.

## Verification

- `campaign-editor-route.spec.ts`: default and classic paths; legacy routes still load the classic Wizard without the Studio's leave guard; Studio routes share the Wizard's `campaignEditorGuard`; entry points (campaigns page, ambassador fallback, campaign dashboard); Studio by campaign type (standard, ongoing, minimal, partner → classic link); `returnStep` handling; the classic-editor link in the Studio.
- Production build.
