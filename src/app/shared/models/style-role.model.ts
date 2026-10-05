// Universal Local Styling — Phase B1 (2026-10). The non-text siblings of
// TextStyle (text-style.model.ts) — same "semantic role, Partial<...>,
// property-level inheritance" shape, one interface per style KIND rather
// than per component, so every block's surfaceStyles/buttonStyles/
// progressStyles map reuses the exact same shape regardless of which
// component it belongs to. See the Universal Local Styling Audit for the
// full reasoning (no new Campaign Style tokens needed — these resolve
// against the existing generic cards.*/buttons.* tokens).

export interface SurfaceStyle {
  background?:   string;
  borderColor?:  string;
  borderRadius?: number; // px
  shadow?:       string; // CSS box-shadow value — typed for future use, not yet exposed in any Builder UI (kept narrow per the "no oversized CSS engine" constraint)
}

export interface ButtonStyle {
  background?:   string;
  textColor?:    string;
  borderColor?:  string;
  borderRadius?: number; // px
}

export interface ProgressStyle {
  trackColor?: string;
  fillColor?:  string;
}
