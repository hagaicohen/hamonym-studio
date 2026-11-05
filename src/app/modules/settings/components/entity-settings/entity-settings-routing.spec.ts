import { signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import { EntitySettingsComponent } from './entity-settings.component';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { BillingService } from '../../../organization-registration/services/billing.service';
import { EntitiesService } from '../../../../core/services/entities.service';

describe('Entity settings route ownership and async isolation', () => {
  const a = {id:'a',display_name:'Organization A',billing_method:'credit-card'};
  const b = {id:'b',display_name:'Organization B',billing_method:'credit-card'};
  let params: BehaviorSubject<any>, http: HttpTestingController, current: any, context: any, fixture: any, component: EntitySettingsComponent;
  beforeEach(()=>{
    params=new BehaviorSubject(convertToParamMap({id:'b'}));
    current={currentEntity:signal<any>(a),setEntity:jasmine.createSpy('setEntity'),clear:jasmine.createSpy('clear')};
    context={active:signal<any>({role:'entity-manager',context:{id:'a'}}),removeEntityContext:jasmine.createSpy()};
    TestBed.configureTestingModule({providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:ActivatedRoute,useValue:{paramMap:params,snapshot:{queryParamMap:convertToParamMap({})}}},
      {provide:CurrentEntityService,useValue:current},{provide:CurrentContextService,useValue:context},
      {provide:BillingService,useValue:{getMasavConfig:()=>of({config:null})}},
    ]});
    // Exercise the real component/service HTTP paths, with no financial child widgets.
    TestBed.overrideComponent(EntitySettingsComponent,{set:{template:'@if (draftEntity) { <input [(ngModel)]="draftEntity.display_name" /> }'}});
    fixture=TestBed.createComponent(EntitySettingsComponent);component=fixture.componentInstance;
    http=TestBed.inject(HttpTestingController);fixture.detectChanges();
  });
  afterEach(()=>{fixture.destroy();http.verify();});
  function get(id:string) { return http.expectOne(r=>r.method==='GET' && r.url.endsWith(`/api/entities/${id}`)); }
  it('loads the URL organization and leaves the active organization unchanged',()=>{
    expect(component.draftEntity).toBeNull();get('b').flush(b);
    expect(component.entity.id).toBe('b');expect(component.draftEntity.display_name).toBe('Organization B');
    expect(current.setEntity).not.toHaveBeenCalled();expect(context.active().context.id).toBe('a');
  });
  it('saves B through its own endpoint, refreshes B and does not update active A',async()=>{
    get('b').flush(b);component.startEdit('profile');component.onEntityChange({display_name:'Edited B'});await component.saveAll();
    const save=http.expectOne(r=>r.method==='PATCH' && r.url.endsWith('/api/entities/b'));
    expect(save.request.body.id).toBe('b');expect(save.request.body.display_name).toBe('Edited B');save.flush({...b,display_name:'Edited B'});
    get('b').flush({...b,display_name:'Edited B'});expect(current.setEntity).not.toHaveBeenCalled();
    expect(component.draftEntity.display_name).toBe('Edited B');
  });
  it('loads and saves A after navigating from B, updating only the matching active context',async()=>{
    get('b').flush(b);params.next(convertToParamMap({id:'a'}));get('a').flush(a);
    component.startEdit('profile');component.onEntityChange({display_name:'Edited A'});await component.saveAll();
    http.expectOne(r=>r.method==='PATCH' && r.url.endsWith('/api/entities/a')).flush({...a,display_name:'Edited A'});
    get('a').flush({...a,display_name:'Edited A'});
    expect(current.setEntity.calls.allArgs().every((args:any[])=>args[0].id==='a')).toBeTrue();
  });
  it('does not fall back to active A after server rejects access to B',async()=>{
    get('b').flush({error:'Unauthorized'},{status:403,statusText:'Forbidden'});
    expect(component.loadError).toBe('Unauthorized');expect(component.draftEntity).toBeNull();
    component.startEdit('profile');await component.saveAll();
    http.expectNone(r=>r.method==='PATCH');expect(current.setEntity).not.toHaveBeenCalled();
  });
  it('cancels the previous entity load on rapid route changes',()=>{
    const old=get('b');params.next(convertToParamMap({id:'a'}));expect(old.cancelled).toBeTrue();
    get('a').flush(a);expect(component.entity.id).toBe('a');
  });
  it('ignores old save subscriptions and completion timers after navigating away',fakeAsync(()=>{
    get('b').flush(b);component.startEdit('profile');component.saveAll();
    http.expectOne(r=>r.method==='PATCH').flush(b);get('b').flush(b);
    params.next(convertToParamMap({id:'a'}));get('a').flush(a);component.startEdit('profile');tick(1600);
    expect(component.entity.id).toBe('a');expect(component.editMode).toBeTrue();
    expect(component.saveState.saveCompleted).toBeFalse();
  }));
  it('cancels pending save responses so they cannot populate a different organization',async()=>{
    get('b').flush(b);await component.saveAll();const save=http.expectOne(r=>r.method==='PATCH');
    params.next(convertToParamMap({id:'a'}));expect(save.cancelled).toBeTrue();get('a').flush(a);
    expect(component.entity.id).toBe('a');expect(current.setEntity).not.toHaveBeenCalled();
  });
  it('pins document uploads to B and stops the save chain after navigation',async()=>{
    get('b').flush(b);component.startEdit('profile');
    component.onEntityChange({logo_file:new File(['image'],'logo.png',{type:'image/png'})});
    const saving=component.saveAll();const upload=http.expectOne(r=>r.url.endsWith('/api/entities/b/logo'));
    params.next(convertToParamMap({id:'a'}));get('a').flush(a);
    upload.flush({result:{logo_url:'/b/logo.png'}});await saving;
    http.expectNone(r=>r.method==='PATCH' && r.url.endsWith('/api/entities/a'));
    http.expectNone(r=>r.method==='PATCH' && r.url.endsWith('/api/entities/b'));
    expect(component.draftEntity.id).toBe('a');expect(component.draftEntity.logo_url).toBeUndefined();
  });
  it('rejects stale child output with a different entity ID',()=>{
    get('b').flush(b);component.onEntityChange({...a,display_name:'Wrong'});expect(component.draftEntity.display_name).toBe('Organization B');
  });
  it('retains the current-entity fallback only for routes without an id and still authorizes through GET',()=>{
    const old=get('b');params.next(convertToParamMap({}));expect(old.cancelled).toBeTrue();
    get('a').flush(a);expect(component.entity.id).toBe('a');
  });
  it('does not alter active state on a rejected save',async()=>{
    get('b').flush(b);await component.saveAll();
    http.expectOne(r=>r.method==='PATCH').flush({error:'Unauthorized'},{status:403,statusText:'Forbidden'});
    expect(component.saveState.saveFailed).toBeTrue();expect(current.setEntity).not.toHaveBeenCalled();
  });
  it('does not let a late MASAV configuration response populate another organization',()=>{
    const configs=new BehaviorSubject<any>({config:{owner:'b'}});
    spyOn(TestBed.inject(BillingService),'getMasavConfig').and.returnValue(configs);
    get('b').flush(b);params.next(convertToParamMap({id:'a'}));expect(component.masavConfig).toBeNull();
    configs.next({config:{owner:'b-late'}});expect(component.masavConfig).toBeNull();get('a').flush(a);
  });
});
