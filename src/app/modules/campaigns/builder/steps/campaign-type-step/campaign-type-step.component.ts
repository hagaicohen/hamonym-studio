import { Component } from '@angular/core';

import {
  CampaignStudioStateService,
  CampaignType,
} from '../../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-type-step',
  standalone: true,
  templateUrl: './campaign-type-step.component.html',
  styleUrls: ['./campaign-type-step.component.css'],
})
export class CampaignTypeStepComponent {
  constructor(public state: CampaignStudioStateService) {}

  selectType(type: CampaignType): void {
    this.state.setType(type);
  }
}
