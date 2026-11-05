import { signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { OrganizationRegistrationStateService } from './services/organization-registration-state.service';
import { BillingService } from './services/billing.service';
import { EntitiesService } from '../../core/services/entities.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { CurrentContextService } from '../../core/services/current-context.service';
import { OrganizationLifecycleEventsService } from '../../core/services/organization-lifecycle-events.service';
import { StepReviewComponent } from './components/step-review/step-review.component';
import { ApprovalStatusCardComponent } from '../settings/components/approval-status-card/approval-status-card.component';

const complete = {entityType:'association',organizationName:'Test org',organizationNumber:'123',displayName:'Test',email:'owner@example.test',phone:'0500000000',organizationDescription:'Purpose'};
const entity = {id:'new-org',entity_type:'association',legal_name:'Test org',display_name:'Test',status:'draft',is_profile_complete:true};

describe('Explicit organization submission lifecycle',()=>{
  let state:OrganizationRegistrationStateService,http:HttpTestingController;
  beforeEach(()=>{
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([]),
      {provide:BillingService,useValue:{createEntityBilling:()=>of({})}},
      {provide:CurrentEntityService,useValue:{currentEntity:signal(null),setRole:()=>{}}},
    ]});
    state=TestBed.inject(OrganizationRegistrationStateService);state.updateState(complete);
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  const matches=(suffix:string)=>(r:any)=>r.url.endsWith(suffix);
  function created(){http.expectOne(matches('/api/entities')).flush({entity});}
  function submitted(){http.expectOne(matches('/api/entities/new-org/request-review')).flush({entity:{...entity,status:'pending_review'}});}
  it('saves a complete draft without calling submission',()=>{
    let result:any;state.save({includeBilling:false}).subscribe(value=>result=value);created();
    expect(result.status).toBe('draft');http.expectNone(matches('/request-review'));expect(state.saving()).toBeFalse();
  });
  it('reuses the same organization when submitting a saved draft instead of creating another record',()=>{
    state.save({includeBilling:false}).subscribe();created();
    expect(state.state().entityId).toBe('new-org');
    state.submitForReview().subscribe();
    http.expectNone(matches('/api/entities'));
    http.expectOne(matches('/api/entities/new-org')).flush(entity);
    submitted();
    expect(state.state().entityId).toBe('new-org');
  });
  it('requires explicit submission and notifies views only after API confirmation',()=>{
    const changed=jasmine.createSpy();const sub=TestBed.inject(OrganizationLifecycleEventsService).changed$.subscribe(changed);
    let result:any;state.submitForReview().subscribe(value=>result=value);created();
    expect(changed).not.toHaveBeenCalled();submitted();expect(result.status).toBe('pending_review');expect(changed).toHaveBeenCalledWith('new-org');sub.unsubscribe();
  });
  it('does not submit an incomplete or whitespace-only profile',()=>{
    state.updateState({organizationDescription:'  '});let error:any;
    state.submitForReview().subscribe({error:value=>error=value});expect(error.message).toContain('דוא״ל');
    http.expectNone(()=>true);expect(state.saving()).toBeFalse();
  });
  it('waits for every chosen upload before submitting, without making optional documents mandatory',()=>{
    state.updateState({certificateFile:new File(['document'],'registration.pdf'),logoFile:new File(['image'],'logo.png')});
    state.submitForReview().subscribe();created();
    const certificate=http.expectOne(matches('/association-document'));const logo=http.expectOne(matches('/logo'));
    certificate.flush({result:{association_certificate_url:'/document'}});http.expectNone(matches('/request-review'));
    logo.flush({result:{logo_url:'/logo'}});submitted();expect(state.state().certificateFile).toBeNull();expect(state.state().logoFile).toBeNull();
  });
  it('keeps a failed upload for retry and does not repeat completed uploads or create another organization',()=>{
    const logoFile=new File(['image'],'logo.png');state.updateState({certificateFile:new File(['doc'],'registration.pdf'),logoFile});
    let failed=false;state.submitForReview().subscribe({error:()=>failed=true});created();
    http.expectOne(matches('/association-document')).flush({result:{}});
    http.expectOne(matches('/logo')).flush({error:'Upload failed'},{status:500,statusText:'Error'});
    expect(failed).toBeTrue();expect(state.state().logoFile).toBe(logoFile);http.expectNone(matches('/request-review'));
    state.submitForReview().subscribe();const save=http.expectOne(matches('/api/entities/new-org'));expect(save.request.method).toBe('PATCH');save.flush(entity);
    http.expectNone(matches('/association-document'));http.expectOne(matches('/logo')).flush({result:{}});submitted();
  });
  it('prevents duplicate submission and save clicks while a submission is running',()=>{
    state.submitForReview().subscribe();let errors=0;
    state.submitForReview().subscribe({error:()=>errors++});state.save({includeBilling:false}).subscribe({error:()=>errors++});
    expect(errors).toBe(2);expect(state.saving()).toBeTrue();created();submitted();expect(state.saving()).toBeFalse();
  });
  it('preserves existing organizations and other roles when finishing registration',fakeAsync(()=>{
    const context=TestBed.inject(CurrentContextService);
    context.initFromLogin({entities:[{id:'existing',display_name:'Existing'}],isDonor:true});
    const fixture=TestBed.createComponent(StepReviewComponent);const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
    fixture.componentInstance.submitApplication();created();submitted();tick(1800);
    expect(context.roles().find(group=>group.role==='entity-manager')?.contexts.map(item=>item.id)).toEqual(['existing','new-org']);
    expect(context.roles().some(group=>group.role==='donor')).toBeTrue();expect(context.active()?.context?.id).toBe('new-org');
    expect(navigate).toHaveBeenCalledWith(['/campaigns']);fixture.destroy();
  }));
});

describe('Review decision and owner correction recovery',()=>{
  let api:any;
  beforeEach(()=>{
    api={getApprovalStatus:jasmine.createSpy().and.returnValue(of({status:'changes_requested',comment:'Fix description',reasonTags:[],updatedAt:'2026-11-01',actionBy:'Admin'})),requestReview:jasmine.createSpy()};
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:EntitiesService,useValue:api}]});
  });
  function card(status='changes_requested'){
    api.getApprovalStatus.and.returnValue(of({status,comment:'Admin feedback',reasonTags:[],updatedAt:'2026-11-01',actionBy:'Admin'}));
    const fixture=TestBed.createComponent(ApprovalStatusCardComponent);fixture.componentRef.setInput('entityId','org');fixture.detectChanges();return fixture;
  }
  it('blocks rejected owner resubmission and allows an explicit submission for a draft',()=>{
    const rejected=card('rejected');rejected.componentInstance.resubmit();expect(api.requestReview).not.toHaveBeenCalled();rejected.destroy();
    const draft=card('draft');const result=new Subject<any>();api.requestReview.and.returnValue(result);draft.componentInstance.resubmit();expect(api.requestReview).toHaveBeenCalledWith('org');draft.destroy();
  });
  it('requires saved corrections, prevents duplicate clicks, and publishes confirmed state to the parent',()=>{
    const fixture=card();const component=fixture.componentInstance;fixture.componentRef.setInput('canSubmit',false);fixture.detectChanges();component.resubmit();expect(api.requestReview).not.toHaveBeenCalled();
    fixture.componentRef.setInput('canSubmit',true);fixture.detectChanges();const pending=new Subject<any>();api.requestReview.and.returnValue(pending);
    const updated=jasmine.createSpy();component.entityUpdated.subscribe(updated);component.resubmit();component.resubmit();expect(api.requestReview).toHaveBeenCalledTimes(1);
    api.getApprovalStatus.and.returnValue(of({status:'pending_review',comment:'Admin feedback',reasonTags:[],updatedAt:'2026-11-01',actionBy:'Admin'}));
    pending.next({entity:{id:'org',status:'pending_review'}});fixture.detectChanges();expect(updated).toHaveBeenCalledWith({id:'org',status:'pending_review'});
    expect(component.data?.status).toBe('pending_review');expect(fixture.nativeElement.querySelector('.approval-resubmit-btn')).toBeNull();fixture.destroy();
  });
  it('keeps feedback and retry available after a rejected submission request',()=>{
    const fixture=card();const pending=new Subject<any>();api.requestReview.and.returnValue(pending);fixture.componentInstance.resubmit();
    pending.error({error:{error:'Missing required fields'}});fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Missing required fields');expect(fixture.componentInstance.resubmitting).toBeFalse();fixture.destroy();
  });
  it('refreshes feedback after a decision event for this organization only',()=>{
    const fixture=card();const calls=api.getApprovalStatus.calls.count();const events=TestBed.inject(OrganizationLifecycleEventsService);
    events.changed('another-org');expect(api.getApprovalStatus.calls.count()).toBe(calls);events.changed('org');expect(api.getApprovalStatus.calls.count()).toBe(calls+1);fixture.destroy();
  });
  it('discards an old pending request after switching the card to another organization',()=>{
    const fixture=card();const pending=new Subject<any>();api.requestReview.and.returnValue(pending);const updated=jasmine.createSpy();fixture.componentInstance.entityUpdated.subscribe(updated);
    fixture.componentInstance.resubmit();fixture.componentRef.setInput('entityId','second');fixture.detectChanges();pending.next({entity:{id:'org',status:'pending_review'}});
    expect(updated).not.toHaveBeenCalled();expect(fixture.componentInstance.resubmitting).toBeFalse();fixture.destroy();
  });
});
