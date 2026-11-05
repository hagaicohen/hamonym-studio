import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Invalidate organization views after a confirmed API mutation. No cached facts. */
@Injectable({providedIn:'root'})
export class OrganizationLifecycleEventsService {
  private changes = new Subject<string>();
  readonly changed$ = this.changes.asObservable();
  changed(entityId:string): void { this.changes.next(entityId); }
}
