# Visual Builder integration into Main — local only

Main: `C:\DEV\HamonymStudio\hamonym-app`.
Source: `C:\DEV\_wt\bilingual-i18n` (working tree left unchanged).

## Integration

- Resolved 25 overlapping hunks in Preview TS/HTML, Checkout V2 TS/HTML/CSS and the donation configuration imports. No whole-branch merge or whole-worktree copy.
- Integrated the existing v1.3 workspace, nested containers, inspector, direct selection, responsive column controls, navigation, fundraising summary, individual/layered artwork and shared panoramic amount cards, required typography/styles and translation dependencies.
- Kept Main currency configuration, presets, currency availability/recurring eligibility, reward restrictions, frozen payment snapshots, amount clearing without conversion and currency request propagation. Fourteen existing checkout/currency/provider methods match the pre-integration Main versions exactly after line-ending normalization.
- Kept Main donation service, Checkout Modal implementation, OpenFields implementation, backend, authentication service, environment/API configuration, onboarding/admin changes and financial logic. The editor guard only retains its return URL; ownership checks remain unchanged.
- Public campaign language wrapper is integrated. Other Main routes retain their existing Hebrew presentation. New Studio is default; `?visualPilot=0` selects the previous workspace without changing saved campaigns.
- Existing list APIs are reused with client-side Load More where Main has no server paging contract. Comments preserve Main's existing required email POST contract through a presentation adapter; no new backend endpoints or moderation workflow were introduced.

## Verification

- Production build: PASS (final build, 307.325 seconds; initial bundle 698.17 kB). Existing optional-chain, CommonJS and two CSS selector warnings remain nonblocking. Node used Windows-trusted roots only for the build process; TLS verification stayed enabled.
- Focused unit regressions: 98/98 PASS, including currency, Checkout V2, legacy registration checkout, typography, localization, amount surfaces, visual statistics and authorization. Two stale registration assertions were corrected to match Main's unchanged separation of participants from catalog rewards.
- Browser verification: PASS — 56 final successful cases (16 panorama/Hero, 36 integration/editing and 4 public-style cases), Hebrew/English desktop/mobile. Main routing, legacy rollback, currency-to-Checkout handoff, nested insertion, responsive ratios, fundraising summary, navigation, layered cards, save/reload, Undo/Redo and public rendering checked. The first cold-start route timeout and an incorrect host-element visibility locator were corrected/rechecked; the final matrix passed. Uses real Main Angular/browser rendering with API, upload, authorization and payment responses mocked; external payment provider operations blocked. No real login, payment or database save was performed.
- Main process 23076 serves port 4200; the Studio URL returns HTTP 200. Source server was stopped safely.

- Exact integrated files: 253 source/test/config files listed in `test-results/main-integration-1794345855850/files-integrated.txt`, with original/final hashes in `files-integrated.json`. Original Main files are backed up byte-for-byte. The standard Angular test configuration uses the same verified translation bootstrap.
- Rollback dry-run: PASS; no restoration executed. Source Git status and both HEAD commits remain unchanged.

## Local access and rollback

- New editor: `http://localhost:4200/campaigns/create/studio` (explicit flag `?visualPilot=1` also works).
- Previous editor: `http://localhost:4200/campaigns/create/studio?visualPilot=0`.
- Pre-integration originals, complete file/hash manifest, payment-method checks and guarded rollback script: `test-results/main-integration-1794345855850`.
- Run `rollback-integration.ps1` without arguments for a read-only check. To restore intentionally, run it with `-Apply`: it refuses later-edited files, restores original byte-preserving backups and archives added files instead of deleting them. No Git reset is needed. Do not overwrite later user edits manually.

No commit, push, deployment, database migration or production data modification.