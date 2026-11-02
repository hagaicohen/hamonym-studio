import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { EntityBillingSectionEditComponent } from '../edit/entity-billing-section-edit/entity-billing-section-edit.component';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { BillingService } from '../../../organization-registration/services/billing.service';

describe('Billing settings keep the route organization context',()=>{
  let api:any,billing:any,current:any,query:any,route:any;
  const b={id:'b',billing_method:'credit-card'};
  beforeEach(()=>{
    query=convertToParamMap({LowProfileId:'test-reference',InternalDealNumber:'test-result'});
    route={snapshot:{queryParamMap:query}};
    api={getEntityById:jasmine.createSpy().and.returnValue(of(b))};
    billing={createEntityBilling:jasmine.createSpy().and.returnValue(of({})),upsertMasavConfig:jasmine.createSpy(),uploadMasavAuthorizationDocument:jasmine.createSpy()};
    current={currentEntity:signal({id:'a'}),setEntity:jasmine.createSpy()};
    TestBed.configureTestingModule({providers:[
      {provide:EntitiesService,useValue:api},{provide:BillingService,useValue:billing},
      {provide:CurrentEntityService,useValue:current},
      {provide:CurrentContextService,useValue:{active:signal({role:'entity-manager',context:{id:'a'}})}},
      {provide:ActivatedRoute,useValue:route},
    ]});
    TestBed.overrideComponent(EntityBillingSectionEditComponent,{set:{template:''}});
  });
  it('refreshes B after the existing billing callback without replacing active A',()=>{
    const fixture=TestBed.createComponent(EntityBillingSectionEditComponent);fixture.componentRef.setInput('entity',b);fixture.detectChanges();
    expect(billing.createEntityBilling).toHaveBeenCalledWith(jasmine.objectContaining({entityId:'b'}));
    expect(current.setEntity).not.toHaveBeenCalled();fixture.destroy();
  });
  it('ignores a late initialization response after the entity input changes',()=>{
    const delayed=new Subject<any>();api.getEntityById.and.returnValue(delayed);
    const fixture=TestBed.createComponent(EntityBillingSectionEditComponent);fixture.componentRef.setInput('entity',b);fixture.detectChanges();
    fixture.componentRef.setInput('entity',{id:'a'});fixture.detectChanges();delayed.next(b);
    expect(fixture.componentInstance.entity.id).toBe('a');expect(current.setEntity).not.toHaveBeenCalled();fixture.destroy();
  });
  it('does not continue a document-upload chain after leaving the billing component',async()=>{
    const pending=new Subject<any>();billing.upsertMasavConfig.and.returnValue(pending);
    route.snapshot.queryParamMap = convertToParamMap({});
    api.getEntityById.and.returnValue(of({...b,billing_method:'masav'}));
    const fixture=TestBed.createComponent(EntityBillingSectionEditComponent);fixture.componentRef.setInput('entity',{...b,billing_method:'masav'});fixture.detectChanges();
    const component=fixture.componentInstance;
    component.masavAckChecked=true;component.masavAccountHolderName='Test';component.masavBankCode='10';component.masavBranchCode='1';component.masavAccountNumber='123';
    component.masavDocFile=new File(['test'],'authorization.pdf');
    const save=component.onSaveClick();fixture.destroy();pending.next({config:{}});pending.complete();await save;
    expect(billing.upsertMasavConfig).toHaveBeenCalledWith('b',jasmine.any(Object));
    expect(billing.uploadMasavAuthorizationDocument).not.toHaveBeenCalled();
  });
});
