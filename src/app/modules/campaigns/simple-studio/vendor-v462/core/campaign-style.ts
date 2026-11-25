// Color and layout helpers of the campaign core (v4.43): pure functions, moved out of
// campaign-core-engine.ts. The core had several local copies with slightly different rules;
// each rule is kept as its own function, so every call site behaves exactly as before.

/** `#rrggbb` (either case). */
const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** `#rgb` … `#rrggbbaa`: 3 to 8 hex digits (lenient, as the content-card styles accept). */
const HEX3_8 = /^#[0-9a-fA-F]{3,8}$/;

/**
 * The value if it is a `#rrggbb` color, otherwise the fallback.
 * Used where the value feeds an `<input type="color">` or a contrast calculation.
 */
export function hexColor6<F>(value: unknown, fallback: F): string | F {
  return HEX6.test(String(value || '')) ? value as string : fallback;
}

/** The value if it is a 3–8 digit hex color, otherwise the fallback. */
export function hexColor<F>(value: unknown, fallback: F): string | F {
  return HEX3_8.test(String(value || '')) ? value as string : fallback;
}

/**
 * A number limited to [min, max]. A value that is not a finite number gives the fallback
 * (note: `''` and `null` count as 0, as `+v` does).
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = +(value as number);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback));
}

/**
 * Like `clampNumber`, but an empty value (`''`, `null`, `undefined`) gives the fallback too.
 * (Argument order of the original donor-card helper: value, fallback, min, max.)
 */
export function clampSize(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) && value != null && value !== '' ? n : fallback));
}

/** Like `clampNumber`, but any falsy number (including 0) gives the fallback. */
export function clampOrDefault(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number(value) || fallback));
}

/** The red, green and blue channels (0–255) of a `#rrggbb` color. */
export function hexRgb(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return [r, g, b];
}

/** Relative brightness of a `#rrggbb` color (Rec. 709 weights, on a 0–255 scale). */
export function luminance(hex: string): number {
  return hexRgb(hex).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
