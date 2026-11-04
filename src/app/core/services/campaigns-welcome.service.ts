import { Injectable, signal } from '@angular/core';

// Lets the layout hide duplicate "new campaign" actions while the Campaigns welcome screen is shown.
@Injectable({ providedIn: 'root' })
export class CampaignsWelcomeService {
  readonly visible = signal(false);
}
