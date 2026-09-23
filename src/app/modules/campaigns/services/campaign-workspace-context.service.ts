import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, shareReplay, tap } from 'rxjs/operators';
import { CampaignApiService } from './campaign-api.service';
import { CampaignDraft } from './campaign-studio-state.service';

// Campaign Workspace persistent-shell fix, round 2 (2026-09-23) -- the shell
// and every CampaignDraft-based Workspace page (Dashboard/Rewards/Sponsors/
// Registration/Donation/Settings/Visibility) used to each independently
// campaignApi.getById() the same campaign on every mount, so the content
// area visibly wiped itself back to a loading state on every click even
// though the shell itself stayed mounted. This service is the single
// source of truth for "the currently open campaign's draft" for the
// lifetime of one Workspace visit: the first page to ask for a campaignId
// triggers the real fetch: every page after that, for the SAME campaignId,
// gets the already-cached value back synchronously -- no refetch, no
// loading flash. Cleared automatically the moment a different campaignId is
// requested (switching campaigns).
@Injectable({ providedIn: 'root' })
export class CampaignWorkspaceContextService {
  private campaignApi = inject(CampaignApiService);

  private campaignId = signal<string | null>(null);
  private _draft = signal<CampaignDraft | null>(null);
  private _loading = signal(false);
  private inFlight: Observable<CampaignDraft> | null = null;

  readonly draft = this._draft.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Cache-hit path resolves synchronously (of()), so a subscriber's
  // ngOnInit sees the real draft in the same tick -- no intermediate
  // "loading" render ever happens for an already-known campaign.
  ensureLoaded(id: string): Observable<CampaignDraft> {
    if (!id) return throwError(() => new Error('CampaignWorkspaceContextService.ensureLoaded: missing id'));

    if (this.campaignId() === id && this._draft()) {
      return of(this._draft()!);
    }

    if (this.campaignId() !== id) {
      this.campaignId.set(id);
      this._draft.set(null);
      this.inFlight = null;
    }

    if (this.inFlight) return this.inFlight;

    this._loading.set(true);
    // shareReplay -- two pages can both ask for the same not-yet-loaded
    // campaign within the same tick (the shell + the first child page on a
    // cold Workspace entry); without it each subscription would trigger its
    // own independent HTTP request instead of sharing the one in flight.
    const request$ = this.campaignApi.getById(id).pipe(
      tap(draft => {
        this._draft.set(draft);
        this._loading.set(false);
      }),
      catchError(err => {
        this._loading.set(false);
        this.inFlight = null;
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inFlight = request$;
    return request$;
  }

  // Called by a page right after it successfully saves a change, so every
  // other page sharing this campaign's context sees the fresh value on its
  // next visit instead of the value going stale until the next full reload.
  setDraft(draft: CampaignDraft): void {
    this._draft.set(draft);
  }
}
