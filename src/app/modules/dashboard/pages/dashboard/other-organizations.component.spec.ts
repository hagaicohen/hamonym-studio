import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { OrganizationLifecycleEventsService } from '../../../../core/services/organization-lifecycle-events.service';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { EntitiesService } from '../../../../core/services/entities.service';
import { OtherOrganizationsComponent } from './other-organizations.component';

describe('Dashboard completion across organizations', () => {
  let api: any;
  const first = {id:'a',display_name:'First',status:'active',is_profile_complete:true};
  const second = {id:'b',display_name:'Second',status:'changes_requested',is_profile_complete:true,requires_completion:true,missing_fields:['contact_full_name']};
  beforeEach(()=>{
    api={getApprovalStatus:()=>of({status:'active',comment:null,reasonTags:[],updatedAt:'2026-11-01',actionBy:null}),getMyEntities:()=>of({entities:[first,second]}),getEntityById:jasmine.createSpy().and.callFake((id:string)=>of(id==='a'?first:second))};
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:EntitiesService,useValue:api}]});
  });
  it('shows the second organization and its own missing requirements when the first is selected',()=>{
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Second');
    expect(fixture.nativeElement.textContent).toContain('שם איש הקשר');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toContain('/settings/entities/b');
    expect(api.getEntityById).not.toHaveBeenCalledWith('a');fixture.destroy();
  });
  it('lists incomplete registrations separately, never as organization cards',()=>{
    const draft={id:'d',legal_name:'Draft org',status:'draft',updated_at:'2026-11-03T10:00:00Z'};
    api.getMyEntities=()=>of({entities:[first,second,draft]});
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    const el=fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.organizations.map((o:any)=>o.id)).toEqual(['b']);
    expect(api.getEntityById).not.toHaveBeenCalledWith('d');
    const section=el.querySelector('app-incomplete-registrations')!;
    expect(section.textContent).toContain('רישומים שלא הושלמו');
    expect(section.textContent).toContain('Draft org');
    expect(section.textContent).toContain('ניתן ליצור קמפיין רק לאחר השלמת הרישום');
    expect(section.querySelector('a.ir-action')!.getAttribute('href')).toBe('/organization-registration?draft=d');
    fixture.destroy();
  });
  it('shows no incomplete-registrations section when there are no drafts',()=>{
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ir-card')).toBeNull();fixture.destroy();
  });
  it('updates the other-organization list when the selection changes',()=>{
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    fixture.componentRef.setInput('selectedId','b');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('First');expect(fixture.nativeElement.textContent).not.toContain('Second');fixture.destroy();
  });
  it('reports unavailable details without inventing a ready status',()=>{
    api.getEntityById.and.returnValue(throwError(()=>new Error('Unavailable')));
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('לא ניתן לטעון את מצב ההשלמות');
    expect(fixture.componentInstance.organizations[0].guidance).toBeUndefined();fixture.destroy();
  });
  it('cancels stale requests after a selection change',()=>{
    const pending=new Subject<any>();api.getEntityById.and.callFake((id:string)=>id==='b'?pending:of(first));
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    fixture.componentRef.setInput('selectedId','b');fixture.detectChanges();pending.next(second);pending.complete();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('First');expect(fixture.nativeElement.textContent).not.toContain('Second');fixture.destroy();
  });
  it('refreshes an unselected organization and its feedback after a confirmed decision',()=>{
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    api.getEntityById.and.returnValue(of({...second,status:'rejected',updated_at:'2026-11-01T12:00:00Z'}));
    spyOn(api,'getApprovalStatus').and.returnValue(of({status:'rejected',comment:'Rejection explanation',reasonTags:[],updatedAt:'2026-11-01T12:00:00Z',actionBy:'Admin'}));
    TestBed.inject(OrganizationLifecycleEventsService).changed('b');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rejection explanation');
    expect(fixture.nativeElement.querySelector('.organization-primary-action').getAttribute('href')).toBe('/settings/entities/b');fixture.destroy();
  });
  it('polls for decisions from another session without changing the selected organization',fakeAsync(()=>{
    const fixture=TestBed.createComponent(OtherOrganizationsComponent);fixture.componentRef.setInput('selectedId','a');fixture.detectChanges();
    const before=api.getEntityById.calls.count();tick(20000);fixture.detectChanges();
    expect(api.getEntityById.calls.count()).toBeGreaterThan(before);expect(fixture.componentInstance.selectedId).toBe('a');fixture.destroy();
  }));
});
