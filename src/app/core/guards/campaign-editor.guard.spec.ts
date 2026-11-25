import {TestBed} from '@angular/core/testing';
import {ActivatedRouteSnapshot,Router,RouterStateSnapshot,UrlTree,provideRouter} from '@angular/router';
import {Observable,firstValueFrom,of,throwError} from 'rxjs';
import {campaignEditorGuard} from './campaign-editor.guard';
import {CurrentContextService} from '../services/current-context.service';
import {CampaignApiService} from '../../modules/campaigns/services/campaign-api.service';
describe('Campaign editor authentication return URL',()=>{
 const url='/campaigns/owned-campaign/studio?visualPilot=1';let api:jasmine.SpyObj<CampaignApiService>;
 const route={paramMap:{get:()=> 'owned-campaign'}} as unknown as ActivatedRouteSnapshot;
 const state={url} as RouterStateSnapshot;
 beforeEach(()=>{localStorage.removeItem('token');api=jasmine.createSpyObj('CampaignApiService',['getById']);TestBed.configureTestingModule({providers:[provideRouter([]),{provide:CampaignApiService,useValue:api},{provide:CurrentContextService,useValue:{active:()=>null,roles:()=>[]}}]});});
 afterEach(()=>localStorage.removeItem('token'));
 const invoke=()=>TestBed.runInInjectionContext(()=>campaignEditorGuard(route,state));
 it('retains the exact pilot destination for guests without requesting protected campaign data',()=>{const tree=invoke() as UrlTree;expect(tree.queryParams['returnUrl']).toBe(url);expect(TestBed.inject(Router).serializeUrl(tree)).toContain('/login?returnUrl=');expect(api.getById).not.toHaveBeenCalled();});
 it('still requires live backend authorization before allowing an authenticated user',async()=>{localStorage.setItem('token','test-only-token');api.getById.and.returnValue(of({id:'owned-campaign'} as any));expect(await firstValueFrom(invoke() as Observable<unknown>)).toBeTrue();expect(api.getById).toHaveBeenCalledWith('owned-campaign');});
 it('does not allow editing after backend authorization fails',async()=>{localStorage.setItem('token','test-only-token');api.getById.and.returnValue(throwError(()=>({status:403})));const tree=await firstValueFrom(invoke() as Observable<UrlTree>);expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/campaigns');});
});
