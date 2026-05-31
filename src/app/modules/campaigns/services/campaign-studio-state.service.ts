import {
  Injectable
} from '@angular/core';

import {
  BehaviorSubject
} from 'rxjs';

export type CampaignType =
  | 'nonprofit'
  | 'business'
  | 'social'
  | 'private'
  | 'political';

export interface CampaignDraft {

  type: CampaignType | null;

}

@Injectable({
  providedIn: 'root'
})
export class CampaignStudioStateService {

  private draftSubject =
    new BehaviorSubject<CampaignDraft>({
      type: null
    });

  draft$ =
    this.draftSubject.asObservable();

  get draft(): CampaignDraft {

    return this.draftSubject.value;

  }

  setType(
    type: CampaignType
  ): void {

    this.draftSubject.next({

      ...this.draft,

      type

    });

  }
} 