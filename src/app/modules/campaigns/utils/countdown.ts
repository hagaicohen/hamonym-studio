export interface CountdownParts {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// Time left until an absolute instant (ISO 8601). Invalid or missing → null.
// Counted from the instant itself, so every visitor sees the same remaining
// time whatever their device time zone.
export function countdownParts(targetAt: string | null | undefined, now: number): CountdownParts | null {
  const target = targetAt ? Date.parse(targetAt) : NaN;
  if (!Number.isFinite(target)) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  return {
    expired: left === 0,
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3_600),
    minutes: Math.floor((left % 3_600) / 60),
    seconds: left % 60,
  };
}

// <input type="datetime-local"> works in the editor's local time; the block
// stores the absolute instant it means.
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function isoToLocalInput(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
