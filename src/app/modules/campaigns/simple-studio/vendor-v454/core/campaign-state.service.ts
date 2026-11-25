import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { CampaignHistoryService, HistoryDirection } from '../preview/campaign-history.service';
import { CampaignDocument, CampaignDocumentService } from '../persistence/campaign-document.service';
import { CampaignPersistenceService, HamCampaignPersistResult } from '../persistence/campaign-persistence.service';
import { HamDraftStorageBridge } from '../persistence/campaign-draft-storage.service';
import { Campaign, blankCampaign, migrateCampaignState, normalizeStoredCampaign } from './campaign-defaults';

/** localStorage key of the editor draft (format unchanged since the original studio). */
export const DRAFT_KEY = 'hamonym-studio-v01';

/**
 * Callbacks the core engine registers once. They resolve the engine's live bindings
 * lazily, because other code still wraps `persist`/`render` through the media context
 * (e.g. the management engine adds the slug and readiness meters to `persist`).
 */
export interface CampaignStateHooks {
  persist(): void;
  render(): void;
  renderPreview(): void;
}

/**
 * Owner of the campaign document (v4.43): the current state, saving the draft, and
 * undo/redo. The core engine has no state variable of its own; it reads and writes
 * `current` and replaces the document only through `replace`.
 *
 * The legacy renderer still mutates the document in place. Those mutations become
 * visible to signal readers at the transaction points the engine already has:
 * every save (`writeDraft`), `change`, `replace` and undo/redo bump `revision`.
 */
@Injectable({ providedIn: 'root' })
export class CampaignStateService implements OnDestroy {
  private doc: Campaign | null = null;
  private hooks: CampaignStateHooks | null = null;
  private readonly rev = signal(0);
  private readonly undoAvailable = signal(false);
  private readonly redoAvailable = signal(false);
  private readonly saveText = signal('');

  /** Increases on every save, transaction, replacement and undo/redo. */
  readonly revision = this.rev.asReadonly();
  /** The current campaign, re-read at each `revision`. */
  readonly campaign = computed(() => { this.rev(); return this.doc; }, { equal: () => false });
  readonly canUndo = this.undoAvailable.asReadonly();
  readonly canRedo = this.redoAvailable.asReadonly();
  /** The last save status message (also written to `#saveStatus`). */
  readonly saveMessage = this.saveText.asReadonly();

  constructor(
    private readonly history: CampaignHistoryService,
    private readonly persistence: CampaignPersistenceService,
    private readonly documents: CampaignDocumentService
  ) {}

  /** The campaign document. Throws before `load`, as the engine never runs without one. */
  get current(): Campaign {
    if (!this.doc) throw new Error('Campaign state has not been loaded');
    return this.doc;
  }

  /** The campaign, or undefined before the core has loaded it (for code that may run first). */
  peek(): Campaign | undefined { return this.doc ?? undefined; }

  private get storage(): HamDraftStorageBridge {
    const storage = window.hamAngularDraftStorage;
    if (!storage) throw new Error('Draft storage has not been initialized');
    return storage;
  }

  /**
   * Reads the stored draft (or a blank campaign), then applies the start-up
   * normalization and migrations, in the original order.
   */
  load(templates: Record<string, unknown>): Campaign {
    let doc: Campaign;
    try { doc = JSON.parse(this.storage.getItem(DRAFT_KEY) as string) || blankCampaign(); }
    catch { doc = blankCampaign(); }
    normalizeStoredCampaign(doc, templates, this.storage);
    migrateCampaignState(doc);
    this.doc = doc;
    this.bump();
    return doc;
  }

  attach(hooks: CampaignStateHooks): void { this.hooks = hooks; }

  /** Replaces the whole document (undo/redo, import, reset). */
  replace(next: Campaign): void {
    this.doc = next;
    this.bump();
  }

  // ---- saving -------------------------------------------------------------

  /** Writes the draft without touching the status line (reset uses this). */
  saveDraft(): HamCampaignPersistResult {
    return this.persistence.persist(this.current);
  }

  /** The original `persist()`: save, then show the result in `#saveStatus`. */
  writeDraft(): HamCampaignPersistResult {
    const result = this.saveDraft();
    this.showSave(result.message);
    this.bump();
    if (result.pending) {
      // v4.54: an asynchronous store shows "saving" until it completes; only the latest save updates the status.
      const ticket = ++this.saveTicket;
      this.saving.set(true);
      this.lastSave = result.pending.then(final => {
        if (ticket === this.saveTicket) { this.saving.set(false); this.showSave(final.message); }
        return final;
      });
    } else {
      this.saveTicket++;
      this.saving.set(false);
      this.lastSave = Promise.resolve(result);
    }
    return result;
  }

  /** v4.54: true while an asynchronous save is pending. */
  readonly saving = signal(false);
  /** v4.54: the latest save's final result (resolves after the remote write, never rejects). */
  lastSave: Promise<HamCampaignPersistResult> = Promise.resolve({ ok: true, message: '' });
  private saveTicket = 0;
  private showSave(message: string): void {
    this.saveText.set(message);
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = message;
  }

  /**
   * Full save as the engine performs it, including wrappers installed by other code.
   * This is what `hamAngularLegacyActions.persist` calls.
   */
  persist(): void {
    if (this.hooks) this.hooks.persist(); else this.writeDraft();
  }

  // ---- history ------------------------------------------------------------

  /** Records the current document as an undo step (clears redo). */
  snapshot(): void {
    this.apply(this.history.snapshot(JSON.stringify(this.current)));
  }

  /** Story Builder: one undo step for a continuous edit that started at `before`. */
  recordStoryEdit(before: string): void {
    this.apply(this.history.storyEdit(before, JSON.stringify(this.current)));
  }

  /**
   * Undo or redo. Returns false when there is nothing to restore. The restored
   * document gets the device-visibility defaults, as before; the caller saves and renders.
   */
  restore(direction: HistoryDirection): boolean {
    const restored = this.history.restore(direction, JSON.stringify(this.current));
    this.apply(this.history.availability);
    if (restored === null) return false;
    const doc = JSON.parse(restored) as Campaign;
    doc['deviceVisibility'] = { ...blankCampaign()['deviceVisibility'], ...(doc['deviceVisibility'] || {}) };
    this.replace(doc);
    return true;
  }

  clearHistory(): void {
    this.history.clear();
    this.apply(this.history.availability);
  }

  /** Live undo/redo stacks (the media migration scans and clears them). */
  historyEntries(): { past: string[]; future: string[] } { return this.history.entries; }

  /** Updates the undo/redo buttons from the history (the original `updateUndo`). */
  syncUndo(): void { this.apply(this.history.availability); }

  // ---- transactions -------------------------------------------------------

  /** The original `change()`: undo step, mutation, save, render. One synchronous transaction. */
  change(mutate: () => void, rerender = true): void {
    const hooks = this.requireHooks();
    this.snapshot();
    mutate();
    hooks.persist();
    if (rerender) hooks.render(); else hooks.renderPreview();
  }

  /** Validates and merges an imported JSON document, then loads it as one undoable change. */
  importDocument(raw: unknown): void {
    const normalized = this.documents.normalizeImport(raw, blankCampaign() as CampaignDocument) as Campaign;
    this.change(() => this.replace(normalized));
  }

  private requireHooks(): CampaignStateHooks {
    if (!this.hooks) throw new Error('Campaign core has not attached to the state');
    return this.hooks;
  }

  private bump(): void { this.rev.update(v => v + 1); }

  private apply({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }): void {
    this.undoAvailable.set(canUndo);
    this.redoAvailable.set(canRedo);
    // Synchronous, like the original updateUndo: other code reads `disabled` right away.
    const set = (id: string, disabled: boolean) => {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = disabled;
    };
    set('undoBtn', !canUndo); set('redoBtn', !canRedo);
    // v4.54: the Story Builder's buttons are its component's (StoryBuilderComponent), rendered synchronously here.
    if (this.onAvailability) this.onAvailability(canUndo, canRedo);
    else { set('sbUndo', !canUndo); set('sbRedo', !canRedo); }
  }

  /** v4.54: called with the undo / redo availability on each change (the Story Builder's buttons). */
  onAvailability: ((canUndo: boolean, canRedo: boolean) => void) | null = null;

  ngOnDestroy(): void {
    this.doc = null;
    this.hooks = null;
  }
}
