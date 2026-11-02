import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { OrganizationStatusCardComponent } from './organization-status-card.component';
import { EntitiesService } from '../../../../core/services/entities.service';

describe('Unified organization status cards',()=>{
  let api:any;
  beforeEach(()=>{
    api={getApprovalStatus:jasmine.createSpy().and.callFake((id:string)=>of({status:id==='rejected'?'rejected':'changes_requested',comment:`Feedback for ${id}`,reasonTags:['missing_docs'],updatedAt:'2026-11-01',actionBy:'Admin'}))};
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:EntitiesService,useValue:api}]});
  });
  function card(status:string,selected=false) {
    const fixture=TestBed.createComponent(OrganizationStatusCardComponent);
    fixture.componentRef.setInput('entity',{id:status,display_name:`Organization ${status}`,status,is_profile_complete:true});
    fixture.componentRef.setInput('selected',selected);fixture.detectChanges();return fixture;
  }
  for(const selected of [true,false]) {
    it(`shows actual admin feedback and correct correction link when selected=${selected}`,()=>{
      const fixture=card('changes_requested',selected);const el=fixture.nativeElement;
      expect(el.textContent).toContain('Feedback for changes_requested');
      const button=el.querySelector('.organization-primary-action');expect(button.textContent).toBe('תיקון והגשה מחדש');
      expect(button.getAttribute('href')).toBe('/settings/entities/changes_requested?edit=true');
      expect(api.getApprovalStatus).toHaveBeenCalledWith('changes_requested');fixture.destroy();
    });
    it(`provides view-only navigation for rejection when selected=${selected}`,()=>{
      const fixture=card('rejected',selected);const el=fixture.nativeElement;
      expect(el.textContent).toContain('Feedback for rejected');
      const button=el.querySelector('.organization-primary-action');expect(button.textContent).toBe('צפייה בפרטים');
      expect(button.getAttribute('href')).toBe('/settings/entities/rejected');
      expect(el.querySelector('.approval-resubmit-btn')).toBeNull();fixture.destroy();
    });
  }
  it('uses identical purple button dimensions, colors and placement for both cards',()=>{
    const properties=['backgroundColor','color','width','minHeight','padding','borderRadius','fontSize'];
    const first=card('changes_requested',true);
    const a=first.nativeElement.querySelector('.organization-primary-action');
    const firstStyle=getComputedStyle(a);
    const snapshot=properties.map(property=>(firstStyle as any)[property]);
    expect(firstStyle.backgroundColor).toBe('rgb(98, 54, 237)');
    if (window.innerWidth <= 768) {
      expect(a.getBoundingClientRect().width).toBeCloseTo(a.parentElement.getBoundingClientRect().width, 0);
    } else {
      expect(firstStyle.width).toBe('200px');
    }
    const firstPlacement=a.parentElement.className;
    // TestBed replaces the root test element when creating the second fixture.
    const second=card('rejected');const b=second.nativeElement.querySelector('.organization-primary-action');
    const secondStyle=getComputedStyle(b);
    properties.forEach((property,index)=>expect((secondStyle as any)[property]).toBe(snapshot[index]));
    expect(firstPlacement).toBe(b.parentElement.className);first.destroy();second.destroy();
  });
  it('keeps admin notes, stored mandatory completion and optional recommendations separate',()=>{
    const fixture=card('changes_requested');
    fixture.componentRef.setInput('entity',{id:'changes_requested',display_name:'Org',status:'changes_requested',is_profile_complete:true,requires_completion:true,missing_fields:['contact_full_name'],entity_type:'association'});fixture.detectChanges();
    const el=fixture.nativeElement;expect(el.querySelector('app-approval-status-card').textContent).toContain('Feedback');
    expect(el.querySelector('.organization-required').textContent).toContain('שם איש הקשר');
    expect(el.querySelector('.organization-required').textContent).not.toContain('סעיף 46');
    expect(el.querySelector('.organization-recommendations').textContent).toContain('אינן חוסמות');
    expect(el.querySelector('.organization-recommendations').hasAttribute('open')).toBeFalse();fixture.destroy();
  });
  it('reports feedback load errors and retries the existing API without changing status',()=>{
    const pending=new Subject<any>();api.getApprovalStatus.and.returnValue(pending);
    const fixture=card('rejected');pending.error({error:{error:'Feedback unavailable'}});fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Feedback unavailable');
    api.getApprovalStatus.and.returnValue(of({status:'rejected',comment:'Recovered',reasonTags:[],updatedAt:'2026-11-01',actionBy:null}));
    fixture.nativeElement.querySelector('[role="alert"] button').click();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Recovered');expect(fixture.componentInstance.entity.status).toBe('rejected');fixture.destroy();
  });
  it('never sends an unselected organization to the campaign builder of the active organization',()=>{
    const fixture=card('active');expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/settings/entities/active');fixture.destroy();
  });
  it('does not duplicate an explicitly required document in optional recommendations',()=>{
    const fixture=card('changes_requested');
    fixture.componentRef.setInput('entity',{id:'changes_requested',display_name:'Org',status:'changes_requested',is_profile_complete:true,requires_completion:true,missing_fields:['association_certificate']});fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.organization-required').textContent).toContain('תעודת התאגדות');
    expect(fixture.nativeElement.querySelector('.organization-recommendations').textContent).not.toContain('תעודת התאגדות');fixture.destroy();
  });
});
