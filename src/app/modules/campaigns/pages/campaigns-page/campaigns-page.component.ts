import { Component, OnInit } from '@angular/core';

import { CommonModule } from '@angular/common';

import { NoOrganizationStateComponent } from '../../../../shared/components/no-organization-state/no-organization-state.component';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [CommonModule, NoOrganizationStateComponent],
  templateUrl: './campaigns-page.component.html',
  styleUrl: './campaigns-page.component.css',
})
export class CampaignsPageComponent implements OnInit {
  hasEntity = false;

  ngOnInit(): void {
    const currentEntity = localStorage.getItem('currentEntity');

    this.hasEntity = !!currentEntity;
  }
}
