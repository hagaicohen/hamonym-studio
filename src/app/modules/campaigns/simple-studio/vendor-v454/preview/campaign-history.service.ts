import { Injectable } from '@angular/core';

export type HistoryDirection = 'undo' | 'redo';
export interface HistoryAvailability { canUndo: boolean; canRedo: boolean; }

/**
 * Angular owns editor undo/redo snapshots, through CampaignStateService (v4.43).
 * Snapshots are strings to preserve the exact existing JSON roundtrip behavior.
 */
@Injectable({ providedIn: 'root' })
export class CampaignHistoryService {
  private readonly past: string[] = [];
  private readonly future: string[] = [];
  private readonly normalLimit = 20;
  private readonly normalBudget = 8_000_000;
  private readonly maxSnapshot = 2_500_000;
  private readonly storyLimit = 60;

  get availability(): HistoryAvailability {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
  }

  snapshot(current: string): HistoryAvailability {
    if (current.length <= this.maxSnapshot) {
      this.past.push(current);
      let size = this.past.reduce((total, entry) => total + entry.length, 0);
      while (this.past.length > this.normalLimit || size > this.normalBudget) {
        size -= this.past.shift()?.length ?? 0;
      }
    } else {
      this.past.length = 0;
    }
    this.future.length = 0;
    return this.availability;
  }

  storyEdit(before: string, current: string): HistoryAvailability {
    if (before !== current) {
      this.past.push(before);
      if (this.past.length > this.storyLimit) this.past.shift();
      this.future.length = 0;
    }
    return this.availability;
  }

  restore(direction: HistoryDirection, current: string): string | null {
    const source = direction === 'undo' ? this.past : this.future;
    const destination = direction === 'undo' ? this.future : this.past;
    if (!source.length) return null;
    const restored = source[source.length - 1];
    // Preserve history if a corrupted entry cannot be parsed.
    JSON.parse(restored);
    destination.push(current);
    source.pop();
    return restored;
  }

  /** The live stacks (oldest first). Code that scans or clears undo entries uses these. */
  get entries(): { past: string[]; future: string[] } {
    return { past: this.past, future: this.future };
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
