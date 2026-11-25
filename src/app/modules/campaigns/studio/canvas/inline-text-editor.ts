import { sanitizeRichHtml } from '../../../../shared/utils/sanitize-rich-html';

// Direct text editing on the Studio canvas (double-click). An editing layer is
// laid exactly over the element, with the element's own typography, so what the
// manager types looks like the page; the rendered element itself is never
// typed into (Angular owns its DOM), and the result is committed through the
// campaign state like any other edit (content path, same as the properties
// panel), so undo/redo, save and the content language work unchanged.
export interface InlineEditRequest {
  element: HTMLElement;    // the rendered text (data-inline-edit)
  host: HTMLElement;       // positioned ancestor to draw the layer in (the canvas frame)
  value: string;           // current value from the draft (text, or HTML when rich)
  rich: boolean;           // rich text (HTML, sanitized on commit)
  multiline: boolean;      // Enter adds a line (Ctrl/Cmd+Enter commits); else Enter commits
  dir: 'rtl' | 'ltr';
  onCommit: (value: string) => void;
  onEnd?: () => void;
}

const COPIED = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing',
  'text-transform', 'text-align', 'color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'] as const;

export class InlineTextEditor {
  private layer: HTMLElement | null = null;
  private request: InlineEditRequest | null = null;
  private original = '';

  get active(): boolean { return !!this.layer; }

  start(req: InlineEditRequest): void {
    this.finish(true);
    const { element, host } = req;
    const frame = host.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const layer = document.createElement('div');
    layer.className = 'studio-inline-editor';
    layer.setAttribute('data-studio-control', '');
    layer.setAttribute('role', 'textbox');
    layer.setAttribute('aria-multiline', String(req.multiline || req.rich));
    layer.setAttribute('dir', req.dir);
    layer.contentEditable = req.rich ? 'true' : 'plaintext-only';
    if (layer.contentEditable !== (req.rich ? 'true' : 'plaintext-only')) layer.contentEditable = 'true';
    layer.spellcheck = true;
    for (const prop of COPIED) layer.style.setProperty(prop, style.getPropertyValue(prop));
    Object.assign(layer.style, {
      position: 'absolute', zIndex: '30', boxSizing: 'border-box',
      top: `${rect.top - frame.top + host.scrollTop}px`, left: `${rect.left - frame.left + host.scrollLeft}px`,
      inlineSize: `${Math.max(rect.width, 40)}px`, minBlockSize: `${rect.height}px`,
      whiteSpace: req.rich ? 'normal' : 'pre-wrap', overflowWrap: 'anywhere',
    });
    if (req.rich) layer.innerHTML = sanitizeRichHtml(req.value);
    else layer.textContent = req.value;
    this.original = req.rich ? layer.innerHTML : req.value;

    layer.addEventListener('keydown', this.onKey);
    layer.addEventListener('blur', this.onBlur);
    // The layer is not part of a block: no selection change, no drag, no canvas click.
    for (const type of ['mousedown', 'click', 'dblclick', 'pointerdown', 'dragstart']) layer.addEventListener(type, (e) => e.stopPropagation());
    layer.draggable = false;
    host.appendChild(layer);
    element.classList.add('studio-inline-editing');
    this.layer = layer;
    this.request = req;
    layer.focus();
    const range = document.createRange();
    range.selectNodeContents(layer);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // commit = false discards the edit (Escape).
  finish(commit: boolean): void {
    const layer = this.layer;
    const req = this.request;
    if (!layer || !req) return;
    this.layer = null;
    this.request = null;
    layer.removeEventListener('blur', this.onBlur);
    const value = req.rich ? sanitizeRichHtml(layer.innerHTML) : (layer.innerText ?? '').replace(/ /g, ' ').replace(/\n+$/, '');
    layer.remove();
    req.element.classList.remove('studio-inline-editing');
    if (commit && value !== this.original && (req.rich || value.trim() !== '' || this.original.trim() === '')) req.onCommit(req.rich ? value : value.trim());
    req.onEnd?.();
  }

  private readonly onKey = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); this.finish(false); return; }
    if (event.key !== 'Enter') return;
    const multiline = this.request?.multiline || this.request?.rich;
    if (!multiline || event.ctrlKey || event.metaKey) { event.preventDefault(); this.finish(true); }
  };

  private readonly onBlur = () => this.finish(true);
}
