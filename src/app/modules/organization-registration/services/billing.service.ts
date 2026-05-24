import {
  Injectable,
  inject
} from '@angular/core';

import {
  HttpClient
} from '@angular/common/http';

import {
  environment
} from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BillingService {

  private http =
    inject(HttpClient);

  createEntityBilling(
    payload: any
  ) {

    return this.http.post(

      `${environment.apiUrl}/api/billing`,

      payload
    );
  }

  getPublicConfig() {

  return this.http.get(

    `${environment.apiUrl}/api/billing/public-config`
  );
}

createLowProfile(
  payload: any
) {

  return this.http.post(

    `${environment.apiUrl}/api/billing/create-low-profile`,

    payload

  );

}

getLowProfileResult(
  lowProfileId: string
) {

  return this.http.get(

    `${environment.apiUrl}/api/billing/low-profile-result/${lowProfileId}`

  );

}
}