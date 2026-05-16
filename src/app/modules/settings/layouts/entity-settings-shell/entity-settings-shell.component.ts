import { Component, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  ActivatedRoute,
  RouterModule
} from '@angular/router';

@Component({
  selector: 'app-entity-settings-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './entity-settings-shell.component.html',
  styleUrls: ['./entity-settings-shell.component.css']
})
export class EntitySettingsShellComponent {

  private route =
    inject(ActivatedRoute);

  entityId =
    this.route.snapshot.paramMap.get('id');

  entity = {

    id: this.entityId,

    name: `Entity #${this.entityId}`,

    type: 'עמותה',

    status: 'פעילה'

  };

  menuItems = [

    {
      label: 'פרטי ישות',
      icon: 'profile',
      route: 'profile'
    },

    {
      label: 'מסמכים',
      icon: 'documents',
      route: 'documents'
    },

    {
      label: 'משתמשים והרשאות',
      icon: 'users',
      route: 'users'
    },

    {
      label: 'סליקה',
      icon: 'billing',
      route: 'billing'
    },

    {
      label: 'מיתוג',
      icon: 'branding',
      route: 'branding'
    },

    {
      label: 'קמפיינים',
      icon: 'campaigns',
      route: 'campaigns'
    }

  ];

}