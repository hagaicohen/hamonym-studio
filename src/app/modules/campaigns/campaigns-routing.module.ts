import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CampaignListComponent } from './pages/campaign-list/campaign-list.component';
import { CampaignBuilderComponent } from './pages/campaign-builder/campaign-builder.component';

const routes: Routes = [
  {
    path: '',
    component: CampaignListComponent,
  },
  {
    path: 'builder/new',
    component: CampaignBuilderComponent,
  },
  {
    path: 'builder/:id',
    component: CampaignBuilderComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CampaignsRoutingModule {}
