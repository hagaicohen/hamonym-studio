import { Component, inject } from '@angular/core';
import { STUDIO_PUBLIC_ACTIONS } from '../../studio-public-actions';
/** The mobile action bar (v4.49: rendered by the page's template, last in #preview; it was CampaignHeaderService's). */
@Component({selector:'div[ham-campaign-mobile-actions]',standalone:true,
  templateUrl:'./campaign-mobile-actions.component.html',
  styleUrls:['./campaign-mobile-actions.component.css']})
export class CampaignMobileActionsComponent {
  private readonly actions = inject(STUDIO_PUBLIC_ACTIONS, { optional: true });

  get ambassadorLabel(): string | null {
    const actions = this.actions;
    return actions?.ambassadorActionLabel ? actions.ambassadorActionLabel() : 'הצטרף כשגריר';
  }
}
