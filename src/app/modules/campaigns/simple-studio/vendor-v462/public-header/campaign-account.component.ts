import { Component, Input } from '@angular/core';
import { AccountMenuComponent } from '../../../../../shared/components/account-menu/account-menu.component';
export interface CampaignAccountUser { isLoggedIn?: boolean; name?: string; photo?: string; }
@Component({selector:'div[ham-campaign-account]',standalone:true,imports:[AccountMenuComponent],
 host:{style:'flex:0 0 auto!important;width:auto!important;height:auto!important;min-width:0!important'},
 templateUrl:'./campaign-account.component.html',styleUrl:'./campaign-account.component.css'})
export class CampaignAccountComponent { @Input() user: CampaignAccountUser | null = null; }
