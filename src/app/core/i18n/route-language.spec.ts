import { isBilingualRoute } from './route-language';
import { ActivatedRouteSnapshot } from '@angular/router';
describe('Main shell route language',()=>{
 const route=(path:string,data={})=>({routeConfig:{path},data,firstChild:null}) as unknown as ActivatedRouteSnapshot;
 it('keeps Dashboard Campaigns and other authenticated routes bilingual',()=>{for(const path of ['dashboard','campaigns','entities','settings','campaigns/:id/studio'])expect(isBilingualRoute(route(path))).toBeTrue();});
 it('retains an explicit Hebrew-only route opt-out',()=>expect(isBilingualRoute(route('legal',{bilingual:false}))).toBeFalse());
 it('uses the active child route',()=>{const root=route('');Object.defineProperty(root,'firstChild',{value:route('campaigns')});expect(isBilingualRoute(root)).toBeTrue();});
});
