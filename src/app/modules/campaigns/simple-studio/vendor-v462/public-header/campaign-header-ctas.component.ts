import { Component, inject } from '@angular/core';
import { STUDIO_PUBLIC_ACTIONS } from '../../studio-public-actions';
/** Public header CTA controls are Angular-owned, original donation handlers still process data-* clicks. */
@Component({selector:'ham-campaign-header-ctas',standalone:true,
 templateUrl:'./campaign-header-ctas.component.html',
 styleUrls:['./campaign-header-ctas.component.css']})
export class CampaignHeaderCtasComponent {
  private readonly actions = inject(STUDIO_PUBLIC_ACTIONS, { optional: true });

  get ambassadorLabel(): string | null {
    const actions = this.actions;
    return actions?.ambassadorActionLabel ? actions.ambassadorActionLabel() : 'הצטרף כשגריר';
  }
}
