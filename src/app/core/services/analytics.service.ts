import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Thin wrapper around gtag.js (GA4). Loads the script once, configures the
// platform's own property (environment.gaMeasurementId) plus, per public
// campaign page, the owning entity's own optional property — a single
// trackEvent() call then reaches both automatically, since gtag dispatches
// an event to every measurement ID that's been config'd.
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private loadedIds = new Set<string>();
  private scriptLoaded = false;

  init(entityMeasurementId?: string | null): void {
    const ids = [environment.gaMeasurementId, entityMeasurementId].filter(
      (id): id is string => !!id && !this.loadedIds.has(id),
    );
    if (ids.length === 0) return;

    this.ensureScriptLoaded(ids[0]);
    for (const id of ids) {
      this.loadedIds.add(id);
      window.gtag?.('config', id);
    }
  }

  trackEvent(name: string, params: Record<string, unknown> = {}): void {
    if (this.loadedIds.size === 0) return;
    window.gtag?.('event', name, params);
  }

  // For events immediately followed by a full-page navigation (e.g. the
  // donation redirect to the payment provider) — gtag sends hits async, so
  // firing trackEvent() right before window.location.href changes can lose
  // the hit entirely. event_callback/event_timeout make gtag wait for the
  // hit (or a 1s timeout) before we navigate.
  trackEventThenNavigate(name: string, params: Record<string, unknown>, url: string): void {
    if (this.loadedIds.size === 0) {
      window.location.href = url;
      return;
    }
    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      window.location.href = url;
    };
    window.gtag?.('event', name, { ...params, event_callback: go, event_timeout: 1000 });
    setTimeout(go, 1000);
  }

  private ensureScriptLoaded(firstId: string): void {
    if (this.scriptLoaded) return;
    this.scriptLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${firstId}`;
    document.head.appendChild(script);
  }
}
