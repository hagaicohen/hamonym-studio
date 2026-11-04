import { Injectable } from '@angular/core';

/** A one-use, in-memory navigation intent, never restored on refresh/history. */
@Injectable({ providedIn: 'root' })
export class OrganizationEntryService {
  private pending: string | null = null;
  enter(entityId: string): void { this.pending = entityId; }
  consume(entityId: string): boolean {
    const matches = this.pending === entityId;
    this.pending = null;
    return matches;
  }
}
