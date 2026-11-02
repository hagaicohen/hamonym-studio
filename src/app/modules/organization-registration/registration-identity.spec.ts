import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RegistrationIdentityCheckComponent } from '../../shared/components/registration-identity-check/registration-identity-check.component';
import { OrganizationRegistrationStateService } from './services/organization-registration-state.service';
import { StepEntityComponent } from './components/step-entity/step-entity.component';
import { EntityBasicInfoSectionEditComponent } from '../settings/components/edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';

describe('Normalized organization identity UX',()=>{
 let http:HttpTestingController;
 beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([])]});http=TestBed.inject(HttpTestingController);});
 afterEach(()=>http.verify());
 const endpoint=(r:any)=>r.url.endsWith('/api/entities/registration-availability');
 function fixture(){const f=TestBed.createComponent(RegistrationIdentityCheckComponent);f.componentRef.setInput('entityType','association');f.componentRef.setInput('registrationNumber','580123456');f.detectChanges();return f;}
 it('debounces typing and checks only the latest number',fakeAsync(()=>{
  const f=fixture();tick(399);http.expectNone(endpoint);
  f.componentRef.setInput('registrationNumber','580123457');f.detectChanges();tick(399);http.expectNone(endpoint);tick(1);
  const request=http.expectOne(endpoint);expect(request.request.body.registrationNumber).toBe('580123457');request.flush({available:true});f.detectChanges();
  expect(f.nativeElement.textContent).toContain('פנוי לרישום');expect(getComputedStyle(f.nativeElement.querySelector('.identity-feedback')).color).toBe('rgb(100, 116, 139)');f.destroy();
 }));
 it('cancels old requests and never overwrites a new result with stale data',fakeAsync(()=>{
  const f=fixture();tick(400);const old=http.expectOne(endpoint);
  f.componentRef.setInput('registrationNumber','580123458');f.detectChanges();expect(old.cancelled).toBeTrue();tick(400);
  http.expectOne(endpoint).flush({available:false});f.detectChanges();expect(f.componentInstance.state.status).toBe('duplicate');f.destroy();
 }));
 it('shows only the authorized management action, never an automatic membership grant',fakeAsync(()=>{
  const f=fixture();tick(400);http.expectOne(endpoint).flush({available:false,existingEntityId:'owned-org'});f.detectChanges();
  expect(f.nativeElement.querySelector('a').getAttribute('href')).toBe('/settings/entities/owned-org');
  f.componentRef.setInput('registrationNumber','580123459');f.detectChanges();tick(400);http.expectOne(endpoint).flush({available:false});f.detectChanges();
  expect(f.nativeElement.querySelector('a')).toBeNull();expect(f.nativeElement.textContent).toContain('לפנות לתמיכה');f.destroy();
 }));
 it('does not label technical failures or malformed replies as available and allows retry',fakeAsync(()=>{
  const f=fixture();tick(400);http.expectOne(endpoint).flush({error:'Offline'},{status:503,statusText:'Unavailable'});f.detectChanges();
  expect(f.componentInstance.state.status).toBe('error');expect(f.nativeElement.textContent).toContain('לא אומתה');
  f.nativeElement.querySelector('button').click();tick(400);http.expectOne(endpoint).flush({});f.detectChanges();expect(f.componentInstance.state.status).toBe('error');f.destroy();
 }));
 it('rechecks on reload and sends the authorized edit exclusion to the backend',fakeAsync(()=>{
  const f=fixture();f.componentRef.setInput('excludeEntityId','owned-org');f.detectChanges();tick(400);
  const req=http.expectOne(endpoint);expect(req.request.body.excludeEntityId).toBe('owned-org');req.flush({available:true});f.destroy();
  const reloaded=fixture();tick(400);http.expectOne(endpoint).flush({available:false});expect(reloaded.componentInstance.state.status).toBe('duplicate');reloaded.destroy();
 }));
 it('clears duplicate blocking when corrected and prevents draft creation while a duplicate is confirmed',()=>{
  const state=TestBed.inject(OrganizationRegistrationStateService);state.updateState({entityType:'association',organizationName:'Org',organizationNumber:'123'});
  const step=TestBed.createComponent(StepEntityComponent);step.componentInstance.onIdentityCheck({status:'duplicate'});expect(state.canSaveDraft).toBeFalse();
  let failure='';state.save({includeBilling:false}).subscribe({error:e=>failure=e.message});expect(failure).toContain('כבר רשום');http.expectNone(()=>true);
  step.componentInstance.organizationNumber='124';expect(state.identityDuplicate()).toBeFalse();expect(state.canSaveDraft).toBeTrue();step.destroy();
 });
 it('renders one red error border, keeps RTL feedback contained and permits correction in the wizard',fakeAsync(()=>{
  const state=TestBed.inject(OrganizationRegistrationStateService);state.updateState({entityType:'association',organizationName:'Org',organizationNumber:'580123456',primaryCategory:'education',fullName:'Owner',phone:'050-0000000',email:'owner@example.test'});
  const f=TestBed.createComponent(StepEntityComponent);f.detectChanges();tick(400);http.expectOne(endpoint).flush({available:false});f.detectChanges();
  const input=f.nativeElement.querySelector('input[aria-describedby="registration-identity-feedback"]') as HTMLInputElement;
  expect(input.getAttribute('aria-invalid')).toBe('true');input.focus();
  expect(getComputedStyle(input).borderColor).toBe('rgb(185, 28, 28)');expect(getComputedStyle(input).boxShadow).toBe('none');
  expect(f.nativeElement.querySelector('button.continue-btn').disabled).toBeTrue();
  const feedback=f.nativeElement.querySelector('.identity-feedback');expect(getComputedStyle(feedback).direction).toBe('rtl');expect(feedback.scrollWidth).toBeLessThanOrEqual(feedback.clientWidth+1);
  f.componentInstance.organizationNumber='580123457';f.detectChanges();tick(400);http.expectOne(endpoint).flush({available:true});f.detectChanges();
  expect(f.nativeElement.querySelector('button.continue-btn').disabled).toBeFalse();f.destroy();
 }));
 it('blocks duplicate saves in settings and clears stale feedback on an organization change',fakeAsync(()=>{
  const f=TestBed.createComponent(EntityBasicInfoSectionEditComponent);f.componentRef.setInput('entity',{id:'a',entity_type:'association',registration_number:'580123456'});f.detectChanges();tick(400);
  http.expectOne(endpoint).flush({available:false});f.detectChanges();expect(f.nativeElement.querySelector('.save-btn').disabled).toBeTrue();
  f.componentRef.setInput('entity',{id:'b',entity_type:'association',registration_number:'580123457'});f.detectChanges();tick(400);
  const req=http.expectOne(endpoint);expect(req.request.body.excludeEntityId).toBe('b');req.flush({available:true});f.detectChanges();
  expect(f.nativeElement.querySelector('.save-btn').disabled).toBeFalse();f.destroy();
 }));
 it('recognizes a server-confirmed identity conflict without treating other 409 errors as duplicates',()=>{
  const state=TestBed.inject(OrganizationRegistrationStateService);
  for(const code of ['DUPLICATE_LEGAL_IDENTIFIER','INVALID_TRANSITION']) {
    state.resetState();state.updateState({entityType:'association',organizationName:'Org',organizationNumber:'580123456'});
    state.save({includeBilling:false}).subscribe({error:()=>{}});
    http.expectOne(r=>r.url.endsWith('/api/entities')).flush({code,error:'Conflict'},{status:409,statusText:'Conflict'});
    expect(state.identityDuplicate()).toBe(code==='DUPLICATE_LEGAL_IDENTIFIER');
  }
 });
});
