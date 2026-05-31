import {
  Component,
  inject
} from '@angular/core';

import { AppLoaderService }
from '../../services/app-loader.service';

@Component({

  selector:
    'app-loader',

  standalone:
    true,

  templateUrl:
    './app-loader.component.html',

  styleUrls: [
    './app-loader.component.css'
  ]
})
export class AppLoaderComponent {

  loader =
    inject(
      AppLoaderService
    );
}