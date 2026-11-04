import { OrganizationLifecycleEventsService } from '../../../../core/services/organization-lifecycle-events.service';
import { Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { OrganizationStatusCardComponent } from './organization-status-card.component';
import { Subscription, catchError, forkJoin, of, switchMap, interval, merge, startWith, EMPTY } from 'rxjs';
import { EntitiesService } from '../../../../core/services/entities.service';
import { IncompleteRegistrationsComponent } from '../../../../shared/components/incomplete-registrations/incomplete-registrations.component';
import { registeredOrganizations, registrationDrafts } from '../../../../core/utils/organization-registration-status';

@Component({
  selector: 'app-other-organizations',
  standalone: true,
  imports: [OrganizationStatusCardComponent, IncompleteRegistrationsComponent],
  template: `
    @if (error) { <p role="status">{{ error }}</p> }
    <app-incomplete-registrations [drafts]="drafts"></app-incomplete-registrations>
    @for (organization of organizations; track organization.id) {
      <app-organization-status-card [entity]="organization"></app-organization-status-card>
    }
  `,

})
export class OtherOrganizationsComponent implements OnChanges, OnDestroy {
  @Input({required:true}) selectedId!: string;
  private api = inject(EntitiesService);
  private lifecycle = inject(OrganizationLifecycleEventsService);
  private request?: Subscription;
  organizations: any[] = [];
  drafts: any[] = [];
  error = '';

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.organizations = [];
    this.drafts = [];
    this.error = '';
    this.request = merge(interval(20000), this.lifecycle.changed$).pipe(
      startWith(0),
      switchMap(() => this.api.getMyEntities().pipe(catchError(() => { this.error = 'לא ניתן לרענן את סטטוס העמותות. יש לנסות שוב.'; return EMPTY; }))),
      switchMap(result => {
        const entities = result.entities || [];
        this.drafts = registrationDrafts(entities);
        const others = registeredOrganizations(entities).filter((entity: any) => entity.id !== this.selectedId);
        return others.length ? forkJoin(others.map((entity: any) => this.api.getEntityById(entity.id).pipe(
          catchError(() => of({...entity, unavailable:true})),
        ))) : of([]);
      }),
    ).subscribe({
      next: rows => { this.error = ''; this.organizations = rows as any[]; },
      error: () => this.error = 'לא ניתן לטעון את רשימת העמותות הנוספות. יש לנסות לרענן.',
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }
}
