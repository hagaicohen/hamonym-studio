import { Component } from '@angular/core';

import { NoOrganizationStateComponent } from '../../../../shared/components/no-organization-state/no-organization-state.component';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [
    NoOrganizationStateComponent
  ],
  templateUrl: './campaigns-page.component.html',
  styleUrl: './campaigns-page.component.css'
})
export class CampaignsPageComponent {

}