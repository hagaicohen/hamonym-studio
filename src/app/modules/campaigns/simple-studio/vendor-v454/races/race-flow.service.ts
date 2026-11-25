import { DestroyRef, Injectable, inject } from '@angular/core';
import { RaceStateService } from './race-state.service';

/**
 * Race campaigns: the participants' shortcut (`[data-ham-go-participants]`) opens their tab, or scrolls to
 * their section. v4.49: the participants tab, panel and section are in the page's template (page-layout.ts
 * `raceParticipants`); this service added them after each render (`hamFinishCampaignRender`).
 * (The heats manager of the management page is rendered by RacePageComponent since v4.42.)
 */
@Injectable({ providedIn: 'root' })
export class RaceFlowService {
  private readonly race = inject(RaceStateService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    if (this.started) return;
    if (!this.race.ready()) throw new Error('Race flow requires campaign state initialization');
    this.started = true;
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element | null)?.closest?.('#preview [data-ham-go-participants]');
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const tab = document.querySelector<HTMLElement>('#preview [data-ham-mobile-tab="participants"],#preview [data-ham-panorama-tab="participants"]');
      if (tab) { tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      else document.querySelector('#ham-race-public-participants')?.scrollIntoView({ behavior: 'smooth' });
    };
    document.addEventListener('click', onClick, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onClick, true));
  }
}
