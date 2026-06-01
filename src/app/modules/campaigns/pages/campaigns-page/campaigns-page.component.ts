import { Component } from '@angular/core';

import { Router } from '@angular/router';

import { AppLoaderService } from '../../../../core/services/app-loader.service';

@Component({
  selector: 'app-campaigns-page',

  standalone: true,

  imports: [],

  templateUrl: './campaigns-page.component.html',

  styleUrls: ['./campaigns-page.component.css'],
})
export class CampaignsPageComponent {
  viewMode: 'grid' | 'list' = 'grid';

  constructor(
    private router: Router,

    private loader: AppLoaderService,
  ) {}

  createCampaign(): void {
    this.loader.show('טוען את אשף יצירת הקמפיין...');

    setTimeout(() => {
      this.router.navigate(['/campaigns/create']);

      this.loader.hide();
    }, 900);
  }
}
