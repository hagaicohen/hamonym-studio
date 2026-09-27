// Checkout V2 feature flag (2026-09-24) — the smallest reversible mechanism
// available: this codebase has no existing app-wide feature-flag system
// (verified — no FEATURE_FLAGS map, no config service; the one real
// precedent, the AI Visibility Gate, is a per-entity DB column, which is
// the wrong shape here since this isn't an entity-level capability). A
// single exported constant is deliberately simple: turning V2 off is a
// one-line edit + redeploy, no code revert of the feature itself, no DB
// migration/rollback, and the old CheckoutModalComponent is never modified
// by this feature at all — see MinimalDonationPageComponent/CampaignPreview
// Component's own `*ngIf="CHECKOUT_V2_ENABLED"` branches.
export const CHECKOUT_V2_ENABLED = true;
