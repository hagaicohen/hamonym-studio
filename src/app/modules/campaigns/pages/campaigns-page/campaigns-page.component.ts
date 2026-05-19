import { Component, OnInit } from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  LucideAngularModule,
  Target
} from 'lucide-angular';

import { NoOrganizationStateComponent } from '../../../../shared/components/no-organization-state/no-organization-state.component';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [
    CommonModule,
    NoOrganizationStateComponent,
    LucideAngularModule
  ],
  templateUrl:
    './campaigns-page.component.html',

  styleUrl:
    './campaigns-page.component.css',
})
export class CampaignsPageComponent
  implements OnInit {

  hasEntity = false;

  campaigns: any[] = [];

  currentEntity: any = null;

  readonly Target =
    Target;

  ngOnInit(): void {

    const currentEntity =
      localStorage.getItem(
        'currentEntity'
      );

    this.hasEntity =
      !!currentEntity;

    if (currentEntity) {

      this.currentEntity =
        JSON.parse(currentEntity);
    }
  }
}