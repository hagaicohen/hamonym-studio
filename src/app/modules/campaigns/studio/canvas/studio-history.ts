import { Subscription } from 'rxjs';
import type { CampaignDraft, CampaignStudioStateService } from '../../services/campaign-studio-state.service';

// Undo/redo for the Campaign Builder Studio. Snapshots are deep copies: the
// wizard steps edit the draft object in place before syncing, so a shallow
// reference would change under the history. Bursts of edits (typing, slider
// drags) settle into one step after a short pause.
//
// Undo restores campaign content only. Server-owned fields (id, status,
// amounts, publish dates…) always keep their current value, so undoing past
// a save never turns a saved campaign back into an unsaved one.
const SERVER_FIELDS = ['id', 'entityId', 'status', 'currentAmount', 'supportersCount', 'isHidden', 'createdAt',
  'updatedAt', 'publishedAt', 'publishRequestedAt', 'ownerType', 'ownerId'] as const;

export const HISTORY_LIMIT = 50;
export const HISTORY_SETTLE_MS = 500;

function clone(draft: CampaignDraft): CampaignDraft {
  try { return structuredClone(draft); } catch { return JSON.parse(JSON.stringify(draft)); }
}

export class StudioHistory {
  private past: CampaignDraft[] = [];
  private future: CampaignDraft[] = [];
  private current: CampaignDraft | null = null;
  private currentPrint = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private restoring = false;
  private sub: Subscription | null = null;

  constructor(private state: CampaignStudioStateService) {}

  get canUndo(): boolean { return this.past.length > 0 || (this.timer !== null && this.changed()); }
  get canRedo(): boolean { return this.future.length > 0 && this.timer === null; }

  // Starts a fresh history from the current draft (campaign loaded or started).
  start(): void {
    this.stop();
    this.past = [];
    this.future = [];
    this.snapshotCurrent();
    this.sub = this.state.draft$.subscribe(() => {
      if (this.restoring) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.commit(), HISTORY_SETTLE_MS);
    });
  }

  stop(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // Records the draft as a new step if its content changed.
  commit(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.current || !this.changed()) return;
    this.past.push(this.current);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.snapshotCurrent();
  }

  undo(): void {
    this.commit();
    const previous = this.past.pop();
    if (!previous || !this.current) return;
    this.future.push(this.current);
    this.restore(previous);
  }

  redo(): void {
    this.commit();
    const next = this.future.pop();
    if (!next || !this.current) return;
    this.past.push(this.current);
    this.restore(next);
  }

  private changed(): boolean {
    return this.state.draftFingerprint(this.state.draft) !== this.currentPrint;
  }

  private snapshotCurrent(): void {
    this.current = clone(this.state.draft);
    this.currentPrint = this.state.draftFingerprint(this.current);
  }

  private restore(snapshot: CampaignDraft): void {
    const live = this.state.draft as unknown as Record<string, unknown>;
    const next = clone(snapshot) as unknown as Record<string, unknown>;
    for (const key of SERVER_FIELDS) next[key] = live[key];
    this.restoring = true;
    try { this.state.replaceDraft(next as unknown as CampaignDraft); } finally { this.restoring = false; }
    this.current = snapshot;
    this.currentPrint = this.state.draftFingerprint(snapshot);
  }
}
