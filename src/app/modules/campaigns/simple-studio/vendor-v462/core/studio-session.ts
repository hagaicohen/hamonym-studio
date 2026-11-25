/**
 * One mount of the Studio (v4.56). The Studio can be destroyed and mounted again in the same page (Angular Router):
 *
 * - every listener the Studio adds to `document` / `window` goes through `studioListen`, with the session's
 *   AbortController signal, so `end()` removes them all at once;
 * - `studioInterval` intervals are cleared, `studioTrack` observers disconnected;
 * - the nodes the Studio adds to `<body>` and `<head>` (the editor's shell, dialogs, overlays, toasts, the fonts link)
 *   are adopted where the Studio inserts them (`studioAdopt`) and removed; nodes the host adds are never touched;
 * - the classes, inline style and data attributes of `<html>` and `<body>` are restored as they were before the mount;
 * - the Studio's `window` globals (`ham*`, `Hamonym*`, `HAMONYM_*`, `__ham*`) created during the session are deleted,
 *   except the platform's (`hamonymCurrentUser`) and those that existed before the mount.
 *
 * The services themselves are new per session (AppComponent's child injector, `STUDIO_SERVICES`) and destroyed with it.
 */
type Target = Document | Window | HTMLElement;
const GLOBAL = /^(ham|Hamonym|HAMONYM_|__ham)/;
const KEEP = new Set(['hamonymCurrentUser']);

interface Attrs { hasClass: boolean; className: string; style: string; data: Record<string, string>; }
function attrs(el: HTMLElement): Attrs { return { hasClass: el.hasAttribute('class'), className: el.className, style: el.getAttribute('style') || '', data: { ...el.dataset } as Record<string, string> }; }
function restore(el: HTMLElement, a: Attrs): void {
  if (a.hasClass) el.className = a.className; else el.removeAttribute('class');
  if (a.style) el.setAttribute('style', a.style); else el.removeAttribute('style');
  for (const k of Object.keys(el.dataset)) if (!(k in a.data)) delete el.dataset[k];
  for (const [k, v] of Object.entries(a.data)) el.dataset[k] = v;
}

export class StudioSession {
  static current: StudioSession | null = null;
  private readonly abort = new AbortController();
  private readonly intervals = new Set<ReturnType<typeof setInterval>>();
  private readonly observers = new Set<{ disconnect(): void }>();
  private readonly added = new Set<Node>();
  private readonly html = attrs(document.documentElement);
  private readonly body = attrs(document.body);
  private readonly globals = new Set(Object.keys(window));
  ended = false;

  private constructor(private readonly keep: Element | null) {}

  /** Starts a session (ends a previous one that was not ended). `keep`: the Studio's own host (never removed). */
  static begin(keep: Element | null): StudioSession {
    StudioSession.current?.end();
    return (StudioSession.current = new StudioSession(keep));
  }

  get signal(): AbortSignal { return this.abort.signal; }

  /** A node the Studio puts into `<body>` / `<head>` (or next to its shell): removed when the session ends. */
  adopt<T extends Node>(node: T): T {
    if (node instanceof DocumentFragment) Array.from(node.childNodes).forEach(n => this.added.add(n)); else this.added.add(node);
    return node;
  }

  interval(fn: () => void, ms: number): ReturnType<typeof setInterval> { const id = setInterval(fn, ms); this.intervals.add(id); return id; }
  clearInterval(id: ReturnType<typeof setInterval> | null | undefined): void { if (id == null) return; clearInterval(id); this.intervals.delete(id); }
  track<T extends { disconnect(): void }>(observer: T): T { this.observers.add(observer); return observer; }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.abort.abort();
    this.intervals.forEach(id => clearInterval(id)); this.intervals.clear();
    this.observers.forEach(o => { try { o.disconnect(); } catch { /* already gone */ } }); this.observers.clear();
    for (const n of this.added) {
      if (!n.isConnected) continue;
      if (this.keep && (n === this.keep || n.contains(this.keep))) continue;
      n.parentNode?.removeChild(n);
    }
    this.added.clear();
    restore(document.documentElement, this.html);
    restore(document.body, this.body);
    const w = window as unknown as Record<string, unknown>;
    for (const key of Object.keys(window)) {
      if (GLOBAL.test(key) && !KEEP.has(key) && !this.globals.has(key)) { try { delete w[key]; } catch { w[key] = undefined; } }
    }
    if (StudioSession.current === this) StudioSession.current = null;
  }
}

/** `target.addEventListener` for the Studio's document / window listeners: removed when the session ends. */
export function studioListen(target: Target, type: string, fn: EventListenerOrEventListenerObject | ((e: any) => any), options?: boolean | AddEventListenerOptions): void {
  const session = StudioSession.current;
  if (!session || session.ended) return; // a late callback of a session that ended: nothing to listen for
  const opts: AddEventListenerOptions = typeof options === 'boolean' ? { capture: options } : { ...(options || {}) };
  opts.signal = session.signal;
  target.addEventListener(type, fn as EventListener, opts);
}
/** `setInterval`, cleared when the session ends. */
export function studioInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
  const session = StudioSession.current;
  return session ? session.interval(fn, ms) : setInterval(fn, ms);
}
export function studioClearInterval(id: ReturnType<typeof setInterval> | null | undefined): void {
  if (StudioSession.current) StudioSession.current.clearInterval(id); else if (id != null) clearInterval(id);
}
/** Marks a node the Studio inserts outside its host (body, head) as the Studio's: removed when the session ends. */
export function studioAdopt<T extends Node>(node: T): T { return StudioSession.current ? StudioSession.current.adopt(node) : node; }
/** An observer the session disconnects when it ends. */
export function studioTrack<T extends { disconnect(): void }>(observer: T): T { return StudioSession.current ? StudioSession.current.track(observer) : observer; }
