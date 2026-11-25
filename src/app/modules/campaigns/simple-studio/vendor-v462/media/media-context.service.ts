import { Injectable } from '@angular/core';
import { CampaignMediaState, DraftStorage, MediaContext } from './media.types';

/** Holds the bridge to the core engine's campaign state for all media services. */
@Injectable({ providedIn: 'root' })
export class MediaContextService {
  private context?: MediaContext;

  attach(context: MediaContext): void { this.context = context; }

  get ctx(): MediaContext {
    if (!this.context) throw new Error('Media context is not attached yet');
    return this.context;
  }

  get storage(): DraftStorage { return this.ctx.storage; }
  state(): CampaignMediaState { return this.ctx.readState(); }

  /** Persist the current draft. Throws on quota errors (callers decide how to recover). */
  persistDraft(): void { this.storage.setItem('hamonym-studio-v01', JSON.stringify(this.state())); }
}
