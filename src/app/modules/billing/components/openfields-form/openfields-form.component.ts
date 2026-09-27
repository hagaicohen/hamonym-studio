// openfields-form.component.ts

import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { BillingApiService } from '../../services/billing-api.service';

import { BillingService } from '../../../organization-registration/services/billing.service';

import { OrganizationRegistrationStateService } from '../../../organization-registration/services/organization-registration-state.service';

// Explicit lifecycle states (Stage 1 hardening, 2026-09-27) -- replaces the
// old implicit "contentWindow exists == ready" + fixed-350ms-timer
// assumptions. See initState's own doc comment below for why.
type InitState = 'idle' | 'waitingForFrames' | 'initializing' | 'initialized' | 'failed';

@Component({
  selector: 'app-openfields-form',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './openfields-form.component.html',

  styleUrls: ['./openfields-form.component.css'],
})
export class OpenfieldsFormComponent implements OnInit, OnDestroy, OnChanges {
  // Optional -- used in two contexts: Settings (entity always exists, real
  // id) and the organization-registration wizard's billing step (the draft
  // entity may not have been created yet when this step first renders).
  // /api/billing/init-openfields now requires an entityId it can verify
  // ownership of (2026-08-28 security fix), so without one we skip
  // initializing rather than sending a request that's guaranteed to 400.
  @Input() entityId?: string;

  // Donation reuse (2026-09-25) — all optional, all default to today's
  // exact existing behavior when unset, so the two proven call sites
  // (Settings edit, organization-registration wizard) are byte-identical
  // to before. When lowProfileId is supplied directly, this skips its own
  // initOpenFields(entityId) fetch entirely and uses the given session —
  // the LowProfile already exists by then for a donation (created by
  // donations.service.js#createDonation), same reasoning
  // embedded-openfields-checkout.component.ts's own doc comment already
  // established before this component absorbed it. cardOwner* default to
  // the exact placeholder values this component already hardcoded for
  // tokenization (not tied to a specific charge) — a donation passes the
  // real donor's info instead.
  @Input() cardOwnerName = 'Hamonym User';
  @Input() cardOwnerEmail = 'test@test.com';
  @Input() cardOwnerPhone = '0500000000';

  // Was a plain internal field, set only after initOpenFields() resolved.
  // Now also an @Input — a donation passes an already-created LowProfileId
  // directly; billing/wizard never pass it, so it starts '' for them
  // exactly as before and gets set the same way it always did.
  @Input() lowProfileId = '';

  private donationMode = false;

  private billingApi = inject(BillingApiService);

  private billingService = inject(BillingService);

  private stateService = inject(OrganizationRegistrationStateService);

  terminalNumber = '';

  apiName = '';

  // True once 'init' has actually been sent to the master frame -- kept for
  // any external/diagnostic reads of this field; superseded internally by
  // initState.
  isReady = false;

  // Public field names unchanged (existing template binds to these) --
  // meaning changed: now driven by initState reaching 'initialized'
  // (confirmed via the master's own 'initialized' postMessage), not a fixed
  // 350ms timer after sending init.
  cvvIframeReady = false;
  cardIframeReady = false;

  // Unchanged name/meaning for the template's own @if -- now mirrors
  // initState === 'failed' instead of a single one-shot poll giving up.
  initError = false;

  private transactionStarted = false;

  private boundMessageHandler = this.onMessage.bind(this);

  // ── Explicit lifecycle (Stage 1 hardening, 2026-09-27) ──────────────────
  // Carries over the fix proven in the isolated OpenFields POC. Root cause,
  // confirmed directly against CardCom's own live scripts (not guessed):
  // CardCom's child field frames are asymmetric in when they attach their
  // own message listener -- CVV.js attaches it at top level (early);
  // CardNumber.js attaches it only inside its own
  // `document.addEventListener('DOMContentLoaded', ...)`. Neither ever
  // announces "I'm listening now" to anyone. The OLD code below treated
  // `document.getElementById('CardComMasterFrame')?.contentWindow` existing
  // as proof CardCom was ready to receive 'init' -- but contentWindow exists
  // near-instantly (the DOM node exists), long before either child frame's
  // own script has necessarily finished loading. If our 'init' reaches the
  // master before both children are listening, the master's own relayed
  // 'setStyles' postMessage to them is silently dropped (CardCom's own
  // try/catch swallows it) -- the master's unconditional 'ready' still
  // fires regardless (it depends only on the MASTER's own load, not its
  // siblings'), so the donor sees CardCom's raw default-styled input
  // instead of ours.
  //
  // Fix: never send 'init' until ALL of the following are true —
  // master's own 'ready' postMessage was actually observed (not just
  // contentWindow existing), a lowProfileId is set, AND both child field
  // iframes fired their own native `load` DOM event (which fires after
  // each child's own DOMContentLoaded has already run -- a real,
  // deterministic, standards-based signal, not a guess).
  //
  // SECOND race found via runtime instrumentation (2026-09-27, "replace
  // existing card" investigation), confirmed with millisecond-level browser
  // logs: master/card/cvv iframes -- src is static in the template, so they
  // start loading the instant the component is created -- can finish
  // loading and fire ready/load BEFORE the async initOpenFields(entityId)
  // HTTP call (which only then calls startInit()) resolves. The three
  // readiness flags below are properties of THIS INSTANCE'S iframe DOM
  // elements, which are never recreated for the lifetime of one component
  // instance (only the skeleton overlay is conditional -- the iframes
  // themselves are always rendered). A once-true readiness flag is
  // therefore valid for as long as the instance lives; startInit() must
  // NOT reset them back to false, or a ready/load event that already fired
  // (a one-shot event, never fired again on an already-loaded iframe) is
  // permanently lost and tryProceed() waits forever for something that
  // already happened -- exactly the 8s-timeout failure reproduced. This is
  // also why opening DevTools "fixed" it: the added overhead happened to
  // make the HTTP call resolve BEFORE the iframe events instead of after.
  initState: InitState = 'idle';
  private generation = 0;
  private initMessageSent = false;
  private masterReady = false;
  private cardFrameLoaded = false;
  private cvvFrameLoaded = false;
  private failTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    window.addEventListener('message', this.boundMessageHandler);

    // Donation checkout supplies an already-created LowProfileId directly —
    // skip the self-fetch entirely and go straight to the frame handshake.
    if (this.lowProfileId) {
      this.donationMode = true;
      this.startInit();
      return;
    }

    if (!this.entityId) {
      console.error('OPENFIELDS: no entityId provided, skipping init');
      return;
    }

    try {
      const config: any = await this.billingApi.initOpenFields(this.entityId).toPromise();
      this.lowProfileId = config.lowProfileId;
      this.terminalNumber = config.terminalNumber;
      this.apiName = config.apiName;
      this.startInit();
    } catch (err) {
      console.error('OPENFIELDS: initOpenFields() failed', err);
      this.initState = 'failed';
      this.initError = true;
    }
  }

  // Both existing consumers (Settings edit, registration wizard) pass a
  // fixed entityId once and never rebind it -- this is a no-op for them,
  // confirmed by reading both call sites. Exists for a future caller (e.g.
  // Checkout V2, not part of this Stage) that creates a NEW donation/
  // LowProfile after a financial-term edit and needs this component to
  // cleanly reinitialize against the new lowProfileId rather than silently
  // keep talking about the old one. A new lowProfileId on the SAME instance
  // does not require the iframes to reload -- see startInit()'s own comment
  // on why readiness flags are preserved across attempts.
  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['lowProfileId'];
    if (change && !change.firstChange && change.currentValue && change.currentValue !== change.previousValue) {
      this.donationMode = true;
      this.startInit();
    }
  }

  ngOnDestroy(): void {
    // Invalidates every in-flight callback/timer belonging to this
    // instance (iframe load handlers, postMessage handler checks, the fail
    // timer) so a destroyed instance can never mutate state a future
    // instance relies on. The instance (and its whole DOM, including the
    // iframes the readiness flags describe) is gone at this point, so a
    // future instance always starts with fresh, correctly-false flags.
    this.generation++;
    window.removeEventListener('message', this.boundMessageHandler);
    this.clearFailTimer();
  }

  private clearFailTimer(): void {
    if (this.failTimer) { clearTimeout(this.failTimer); this.failTimer = null; }
  }

  // Single entry point for (re)starting the handshake -- called from
  // ngOnInit (both branches), ngOnChanges, and retryInit(). Bumps the
  // generation so any callback still in flight from a previous run (a
  // stale postMessage, the previous fail timer) becomes a no-op instead of
  // corrupting the new run's state.
  //
  // Deliberately does NOT reset masterReady/cardFrameLoaded/cvvFrameLoaded.
  // Those describe whether THIS instance's iframe DOM elements (static
  // src, never recreated within one instance's lifetime) have already
  // loaded/announced readiness -- a fact that stays true once observed,
  // regardless of how many times startInit() itself runs on this same
  // instance (first attempt, a lowProfileId change, or retryInit()). See
  // this class's own header comment for the confirmed race this fixes.
  private startInit(): void {
    const generation = ++this.generation;
    this.initMessageSent = false;
    this.initState = 'waitingForFrames';
    this.initError = false;
    this.cardIframeReady = false;
    this.cvvIframeReady = false;
    this.clearFailTimer();

    // Deterministic ceiling, not the primary mechanism -- every condition
    // tryProceed() waits for is event-driven (postMessage 'ready' + native
    // iframe 'load' events + postMessage 'initialized'). This only catches
    // the genuine case where one of those never fires, so the donor/admin
    // is never left staring at a silently-frozen skeleton forever.
    this.failTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      if (this.initState === 'initialized') return;
      console.error('OPENFIELDS: initialization timed out (8s) waiting for ready/frame-load/initialized');
      this.initState = 'failed';
      this.initError = true;
    }, 8000);

    // Readiness already observed for this instance's iframes (e.g. ready/
    // load fired while the initOpenFields() HTTP call above was still in
    // flight) must be acted on immediately here, not just left for a
    // postMessage/load event that -- being one-shot -- will never fire
    // again on an already-loaded iframe.
    this.tryProceed(generation);
  }

  // Retries the whole handshake — used by the "נסה שוב" button surfaced
  // when initState is 'failed'. Reuses the current lowProfileId (an
  // init-lifecycle failure is not an expired/invalid LowProfile session,
  // so there's no need to call initOpenFields() again) AND the current
  // iframe readiness state (see startInit()'s own comment) -- a retry after
  // the iframes already finished loading immediately re-sends init instead
  // of waiting for load events that cannot fire again.
  retryInit(): void {
    this.startInit();
  }

  // Native iframe `load` events (see this class's header comment). Fire
  // after each child's own document, including its DOMContentLoaded (where
  // CardNumber.js/CVV.js attach their message listeners), has finished
  // loading.
  onCardFrameLoad(): void {
    this.cardFrameLoaded = true;
    this.tryProceed(this.generation);
  }

  onCvvFrameLoad(): void {
    this.cvvFrameLoaded = true;
    this.tryProceed(this.generation);
  }

  // Sends 'init' exactly once per generation, only once every required
  // condition is true. Called both from the event handlers (ready/load)
  // AND synchronously from startInit() itself, so whichever arrives last —
  // the events or the generation actually being allowed to send — is what
  // triggers the send, instead of assuming the events always come after.
  private tryProceed(generation: number): void {
    if (generation !== this.generation) return;
    if (this.initMessageSent) return;
    if (this.initState !== 'waitingForFrames') return;
    if (!this.masterReady || !this.lowProfileId || !this.cardFrameLoaded || !this.cvvFrameLoaded) return;

    const masterFrame = document.getElementById('CardComMasterFrame') as HTMLIFrameElement | null;
    if (!masterFrame?.contentWindow) {
      // Should not happen by this point (master already posted 'ready' to
      // us, meaning its own script already ran) -- guarded rather than
      // assumed, with a short re-check instead of a hard failure.
      setTimeout(() => this.tryProceed(generation), 100);
      return;
    }

    this.initMessageSent = true;
    this.initState = 'initializing';
    this.isReady = true;

    const iframeMessage = {
      action: 'init',

      cardFieldCSS: `
        body{margin:0;padding:0;background:transparent;overflow:hidden;}
        .cardNumber{width:100%;height:54px;border:1px solid #dbe2ea;border-radius:16px;background:#ffffff;padding:0 16px;margin:0;box-sizing:border-box;font-size:17px;font-family:Arial,sans-serif;font-weight:500;color:#0f172a;direction:rtl;text-align:right;outline:none;line-height:54px;background-position:left 14px center !important;}
        .cardNumber:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.08);}
        .cardNumber.invalid{border-color:#dc2626;}
      `,

      cvvFieldCSS: `
        body{margin:0;padding:0;background:transparent;overflow:hidden;}
        .cvvField{width:100%;height:54px;border:1px solid #dbe2ea;border-radius:16px;background:#ffffff;padding:0 16px;margin:0;box-sizing:border-box;font-size:17px;font-family:Arial,sans-serif;font-weight:500;color:#0f172a;direction:rtl;text-align:right;outline:none;line-height:54px;}
        .cvvField:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.08);}
        .cvvField.invalid{border-color:#dc2626;}
      `,

      placeholder: '0000 0000 0000 0000',

      cvvPlaceholder: '123',

      lowProfileCode: this.lowProfileId,
    };

    masterFrame.contentWindow.postMessage(iframeMessage, '*');
  }

  async tokenize(): Promise<boolean> {
    if (!this.lowProfileId) {
      console.error('LOW PROFILE NOT READY');

      return false;
    }

    // Preserves the existing external contract (callable any time the
    // caller's own UI allows it, no lifecycle awareness required of the
    // caller) while guaranteeing submission cannot actually fire before the
    // real CardCom handshake completed — the concrete lifecycle bug the
    // old blind-timing code allowed, per this file's own header comment.
    if (this.initState !== 'initialized') {
      console.error('OPENFIELDS: tokenize() called before initState reached initialized');
      return false;
    }

    if (this.transactionStarted) {
      return false;
    }

    return new Promise((resolve) => {
      const expirationMonth = (
        document.getElementById('expirationMonth') as HTMLInputElement
      )?.value;

      const expirationYear = (
        document.getElementById('expirationYear') as HTMLInputElement
      )?.value;

      const masterFrame = document.getElementById(
        'CardComMasterFrame',
      ) as HTMLIFrameElement;

      if (!masterFrame?.contentWindow) {
        console.error('MASTER FRAME MISSING');

        resolve(false);

        return;
      }

      const timeout = setTimeout(() => {
        console.error('CARDCOM TIMEOUT');

        this.transactionStarted = false;

        window.removeEventListener('message', listener);

        resolve(false);
      }, 15000);

      const listener = (event: MessageEvent) => {
        if (!event?.data) {
          return;
        }

        const msg = event.data;

        if (msg?.action === 'HandleSubmit') {
          clearTimeout(timeout);

          this.transactionStarted = false;

          window.removeEventListener('message', listener);

          const result = msg.data;

          const internalDealNumber =
            result?.InternalDealNumber || result?.TranzactionId || null;

          // Donation checkout — no entity billing token to save, no
          // registration-wizard state to update. The caller (CheckoutV2)
          // awaits this same Promise<boolean> and handles success itself
          // (navigating to the existing donation-success page) — webhook
          // remains the only thing that ever writes donations.status='paid',
          // exactly as before this component was reused here.
          if (this.donationMode) {
            resolve(result?.IsSuccess === true);
            return;
          }

          if (window.location.pathname.includes('/settings/entities/')) {
            this.billingService
              .createEntityBilling({
                entityId: this.entityId,

                provider: 'cardcom',

                lowProfileId: this.lowProfileId,

                internalDealNumber,

                expMonth: expirationMonth,

                expYear: expirationYear,
              })

              .subscribe({
                next: () => {
                  resolve(true);
                },

                error: (err: any) => {
                  console.error(err);

                  resolve(false);
                },
              });

            return;
          }

          this.stateService.updateState({
            cardcomLowProfileId: this.lowProfileId,

            cardcomInternalDealNumber: internalDealNumber,
          });

          resolve(result?.IsSuccess === true);

          return;
        }

        if (msg?.action === 'HandleEror') {
          clearTimeout(timeout);

          this.transactionStarted = false;

          window.removeEventListener('message', listener);

          console.error('CARDCOM ERROR', msg);

          resolve(false);

          return;
        }
      };

      window.addEventListener('message', listener);

      const payload = {
        action: 'doTransaction',

        lowProfileCode: this.lowProfileId,

        cardOwnerId: '000000000',

        cardOwnerName: this.cardOwnerName,

        cardOwnerEmail: this.cardOwnerEmail,

        cardOwnerPhone: this.cardOwnerPhone,

        expirationMonth,

        expirationYear,

        numberOfPayments: '1',
      };

      this.transactionStarted = true;

      masterFrame.contentWindow.postMessage(
        payload,

        '*',
      );
    });
  }

  // Persistent listener (added once in ngOnInit, removed once in
  // ngOnDestroy — never duplicated across retries/reinitializations, which
  // all go through startInit() instead of touching this listener).
  private onMessage(event: MessageEvent): void {
    const action = event?.data?.action;

    if (action === 'ready') {
      this.masterReady = true;
      this.tryProceed(this.generation);
      return;
    }

    if (action === 'initialized') {
      if (this.initState === 'initializing') {
        this.initState = 'initialized';
        this.cardIframeReady = true;
        this.cvvIframeReady = true;
        this.clearFailTimer();
      }
      return;
    }
  }
}
