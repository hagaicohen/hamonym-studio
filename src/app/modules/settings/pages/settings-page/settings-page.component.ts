import {
  Component,
  OnInit,
  inject
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  RouterModule
} from '@angular/router';

import {
  EntitiesService
} from '../../../../core/services/entities.service';

import {
  CurrentEntityService
} from '../../../../core/services/current-entity.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.css'],
})
export class SettingsPageComponent
  implements OnInit {

  private entitiesService =
    inject(EntitiesService);

  private currentEntityService =
    inject(CurrentEntityService);

  entities: any[] = [];

  loading = true;

  ngOnInit(): void {

    const currentEntity =

      this.currentEntityService
        .currentEntity();

    if (currentEntity) {

      this.entities = [
        currentEntity
      ];

      this.loading = false;
    }

    this.entitiesService
      .getMyEntities()
      .subscribe({

        next: (res) => {

          this.entities =
            res.entities || [];

          this.loading = false;
        },

        error: (err) => {

          console.error(err);

          this.loading = false;
        }
      });
  }

  selectEntity(
    entity: any
  ) {

    this.currentEntityService
      .currentEntity
      .set(entity);
  }

  getStatusLabel(
    status: string
  ): string {

    switch (status) {

      case 'active':
        return 'פעילה';

      case 'draft':
        return 'הגדרה לא הושלמה';

      case 'pending_review':
        return 'ממתינה לאישור';

      default:
        return '';
    }
  }

  getEntityTypeLabel(
  type: string
): string {

  switch (type) {

    case 'association':
      return 'עמותה';

    case 'chalatz':
      return 'חל״צ';

    case 'political_party_registered':
      return 'מפלגה';

    case 'sole_registered':
      return 'עוסק מורשה';

    default:
      return 'יישות';
  }
}
}