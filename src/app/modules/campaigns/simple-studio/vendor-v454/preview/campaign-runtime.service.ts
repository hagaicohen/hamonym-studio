import { CampaignHistoryService, HistoryDirection } from './campaign-history.service';
import { Injectable, OnDestroy } from '@angular/core';
import { CampaignStateService } from '../core/campaign-state.service';

/**
 * Incremental ownership of the campaign rendering lifecycle.
 * Since v4.43 the core no longer calls commit/snapshot/restore/recordStoryEdit here:
 * it uses CampaignStateService. They stay on the bridge as a contract for other code.
 * Until the renderer itself is moved, Angular invokes the unchanged renderer
 * functions through explicit callbacks; no campaign data is cloned or re-saved.
 */
export interface LegacyCampaignRenderers {
  renderSections(): void;
  renderPreview(): void;
  renderInspector(): void;
  title(): string;
}

export interface LegacyUndoAvailability {
  canUndo: boolean;
  canRedo: boolean;
}

export interface LegacyCampaignChange {
  snapshot(): void;
  mutate(): void;
  persist(): void;
  render(): void;
  renderPreview(): void;
  rerender: boolean;
}

export interface HamAngularCampaignRuntimeBridge {
  register(renderers: LegacyCampaignRenderers): void;
  render(): void;
  syncUndo(availability: LegacyUndoAvailability): void;
  commit(change: LegacyCampaignChange): void;
  snapshot(current: string): void;
  recordStoryEdit(before: string, current: string): void;
  restore(direction: HistoryDirection, current: string): string | null;
}

declare global {
  interface Window {
    hamAngularCampaignRuntime?: HamAngularCampaignRuntimeBridge;
  }
}

@Injectable({ providedIn: 'root' })
export class CampaignRuntimeService implements OnDestroy {
  private renderers: LegacyCampaignRenderers | null = null;
  private initialized = false;
  private readonly bridge: HamAngularCampaignRuntimeBridge = {
    register: (renderers) => { this.renderers = renderers; },
    render: () => this.render(),
    syncUndo: (availability) => this.syncUndo(availability),
    commit: (change) => this.commit(change),
    snapshot: (current) => this.snapshot(current),
    recordStoryEdit: (before, current) => this.recordStoryEdit(before, current),
    restore: (direction, current) => this.restore(direction, current)
  };

  constructor(private readonly history: CampaignHistoryService, private readonly campaignState: CampaignStateService) {}

  private snapshot(current: string): void {
    this.syncUndo(this.history.snapshot(current));
  }

  private recordStoryEdit(before: string, current: string): void {
    this.syncUndo(this.history.storyEdit(before, current));
  }

  private restore(direction: HistoryDirection, current: string): string | null {
    const restored = this.history.restore(direction, current);
    this.syncUndo(this.history.availability);
    return restored;
  }

  start(): void {
    if (this.initialized) return;
    this.initialized = true;
    window.hamAngularCampaignRuntime = this.bridge;
  }

  private render(): void {
    const renderers = this.renderers;
    if (!renderers) return;
    // Preserve the original synchronous order and exception propagation.
    renderers.renderSections();
    renderers.renderPreview();
    renderers.renderInspector();
    const title = document.getElementById('projectTitle');
    if (title) title.textContent = renderers.title();
  }

  private commit(change: LegacyCampaignChange): void {
    // One synchronous transaction; preserve the original undo/save/render order.
    change.snapshot();
    change.mutate();
    change.persist();
    if (change.rerender) change.render();
    else change.renderPreview();
  }

  private syncUndo(_availability: LegacyUndoAvailability): void {
    // The availability always comes from the one history; CampaignStateService updates the buttons.
    this.campaignState.syncUndo();
  }

  ngOnDestroy(): void {
    if (window.hamAngularCampaignRuntime === this.bridge) {
      delete window.hamAngularCampaignRuntime;
    }
    this.history.clear();
    this.renderers = null;
    this.initialized = false;
  }
}
