import { Observable, Subscription } from 'rxjs';
import { DonationService, DonationStatusResult } from '../../../services/donation.service';

export interface PaymentConfirmation {
  state: 'confirming' | 'uncertain' | 'paid' | 'failed';
  result?: DonationStatusResult;
}

/** Checkout V2's bounded foreground/background polling, shared by both checkout presentations. */
export function paymentConfirmation(api: DonationService, donationId: string): Observable<PaymentConfirmation> {
  return new Observable(observer => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requests = new Subscription();
    const schedule = () => {
      if (observer.closed) return;
      attempts++;
      const foreground = attempts < 15;
      observer.next({ state: foreground ? 'confirming' : 'uncertain' });
      if (attempts >= 63) { observer.complete(); return; }
      timer = setTimeout(poll, foreground ? 1000 : 5000);
    };
    const poll = () => {
      if (observer.closed) return;
      requests.add(api.getStatus(donationId).subscribe({
        next: result => {
          if (result.id !== donationId) { schedule(); return; }
          if (result.status === 'paid' || result.status === 'failed') {
            observer.next({ state: result.status, result });
            observer.complete();
          } else schedule();
        },
        // A network failure is an unknown outcome, never permission to retry a charge.
        error: schedule
      }));
    };
    observer.next({ state: 'confirming' });
    poll();
    return () => { clearTimeout(timer); requests.unsubscribe(); };
  });
}
