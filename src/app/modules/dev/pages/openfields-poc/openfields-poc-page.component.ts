// TEMPORARY (2026-09-27) — CardCom OpenFields entity-credentials feasibility
// POC. Entirely isolated from Checkout V2 / the hosted-iframe donation flow /
// the donation service / webhook / recurring logic -- this page creates a
// throwaway CardCom LowProfile via a dedicated dev-only backend endpoint
// (openfields-poc.controller.js) that never touches the donations table.
//
// This round proves the AUTOMATIC lifecycle a real Checkout V2 integration
// would need: no manual "init" button, raw CardCom fields never visible
// pre-init, and a deterministic (not sleep-based) fix for a real race
// confirmed by reading CardCom's own live scripts directly:
//
//   CardNumber.js only attaches its message listener inside its own
//   document.addEventListener('DOMContentLoaded', ...) -- i.e. AFTER that
//   child iframe finishes loading. CVV.js attaches its listener at top
//   level (earlier). Neither ever posts a "ready"/listener-attached signal
//   of its own. The master frame's 'ready' is about the MASTER's own load
//   timing only -- uncorrelated with its sibling iframes' load timing. If
//   our 'init' (which master relays into 'setStyles' to the two child
//   frames -- see setUserCSS in OpenFields.js) fires before both children
//   have loaded, the postMessage is silently dropped inside CardCom's own
//   try/catch, and the field renders as CardCom's own unstyled default
//   input -- exactly the symptom observed.
//
// Fix: gate sending 'init' on the child iframes' own native `load` DOM
// event (fires after each child's DOMContentLoaded has already run, per
// the above -- a real, deterministic, standards-based signal), in addition
// to master's 'ready' and having a lowProfileId. No CardCom event exists
// that acknowledges "setStyles was received", so 'initialized' (which
// fires only after setUserCSS was already called, following a network
// round-trip) remains the strongest completion signal available for
// revealing the UI -- documented here rather than assumed.
//
// Safe to delete this whole directory + its route entry + devOnlyGuard +
// the backend module once the investigation closes.
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';

interface LogEntry {
  ts: string;
  dir: 'out' | 'in' | 'info' | 'error';
  label: string;
  data?: any;
}

type InitState = 'idle' | 'creatingLowProfile' | 'waitingForMasterReady' | 'initializing' | 'initialized' | 'failed';

@Component({
  selector: 'app-openfields-poc-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './openfields-poc-page.component.html',
  styleUrls: ['./openfields-poc-page.component.css'],
})
export class OpenfieldsPocPageComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);

  entityId = '';
  cardOwnerName = '';
  cardOwnerEmail = '';
  cardOwnerPhone = '';
  cardOwnerId = '';
  expirationMonth = '05';
  expirationYear = '29';

  logs: LogEntry[] = [];

  lowProfileId = '';
  terminalNumber = '';
  apiName = '';
  cardcomInitResponse: any = null;

  // ── Explicit lifecycle state (point 4/9) ──────────────────────────
  // One field drives what the template shows -- no derived/implicit
  // "is it ready" guessing from a pile of booleans.
  initState: InitState = 'idle';
  initError = '';

  // Bumped on every fresh attempt (ngOnInit, retry) AND on destroy. Every
  // async callback (HTTP response, postMessage handler, timers) captures
  // the generation it belongs to and no-ops if the component has since
  // moved on to a new generation or been destroyed -- this is what makes
  // refresh/retry/destroy-recreate safe against stale responses instead of
  // relying on timing.
  private generation = 0;

  masterFrameReady = false;
  cardFrameLoaded = false;
  cvvFrameLoaded = false;
  sawReady = false;
  sawGetScreenValues = false;
  handshakeInitialized = false;

  confirmRealCharge = false;
  transactionStarted = false;

  private boundMessageHandler = this.onWindowMessage.bind(this);
  private initMessageSent = false;
  private failTimer: ReturnType<typeof setTimeout> | null = null;

  readonly IFRAME_URLS = {
    master: 'https://secure.cardcom.solutions/api/openfields/master',
    cardNumber: 'https://secure.cardcom.solutions/api/openfields/cardNumber',
    cvv: 'https://secure.cardcom.solutions/api/openfields/CVV',
  };

  ngOnInit(): void {
    this.entityId = this.currentEntity.currentEntity()?.id || '';
    window.addEventListener('message', this.boundMessageHandler);
    this.log('info', `Component created (t=${performance.now().toFixed(0)}ms)`);
    // Automatic -- no button. If entityId isn't available yet the template
    // shows an inline entityId field + "retry" affordance instead of a
    // permanent manual-init button (see html).
    if (this.entityId) this.startAutoInit();
  }

  ngOnDestroy(): void {
    // Invalidates every in-flight callback/timer belonging to this
    // instance -- see the `generation` field's own comment.
    this.generation++;
    window.removeEventListener('message', this.boundMessageHandler);
    this.clearFailTimer();
  }

  private log(dir: LogEntry['dir'], label: string, data?: any): void {
    const ts = `${new Date().toLocaleTimeString('he-IL')}.${String(Math.floor(performance.now() % 1000)).padStart(3, '0')}`;
    this.logs = [...this.logs, { ts, dir, label, data }];
    const consoleFn = dir === 'error' ? console.error : console.log;
    consoleFn(`[OpenFields POC] ${label}`, data ?? '');
  }

  private clearFailTimer(): void {
    if (this.failTimer) { clearTimeout(this.failTimer); this.failTimer = null; }
  }

  // ── Public entry points ───────────────────────────────────────────

  // Manual retry only -- never called automatically in a loop (point 10:
  // "do not automatically retry forever"). Also reachable if the operator
  // changes entityId by hand (diagnostic use).
  retryInit(): void {
    this.startAutoInit();
  }

  private startAutoInit(): void {
    if (!this.entityId) {
      this.log('error', 'No entityId set -- cannot start initialization');
      return;
    }
    // Guards against duplicate concurrent starts (e.g. a double ngOnInit
    // firing, or a fast double-click on retry) -- a run already in
    // progress is left alone rather than layered with a second one.
    if (this.initState === 'creatingLowProfile' || this.initState === 'waitingForMasterReady' || this.initState === 'initializing') {
      return;
    }

    const generation = ++this.generation;
    this.resetForNewGeneration();
    this.initState = 'creatingLowProfile';
    this.log('info', `[gen ${generation}] Starting automatic initialization (entityId=${this.entityId})`);

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.http.post<any>(`${environment.apiUrl}/api/dev/openfields-poc/init`, { entityId: this.entityId }, { headers })
      .subscribe({
        next: (res) => {
          if (generation !== this.generation) { this.log('info', `[gen ${generation}] Stale LowProfile response ignored (current gen ${this.generation})`); return; }
          this.lowProfileId = res.lowProfileId;
          this.terminalNumber = res.terminalNumber;
          this.apiName = res.apiName;
          this.cardcomInitResponse = res.cardcomResponse;
          this.log('in', `[gen ${generation}] LowProfile created (entity credentials)`, res);
          this.initState = 'waitingForMasterReady';
          this.tryProceed(generation);
          // Deterministic ceiling, not the primary mechanism (point 2) --
          // every condition tryProceed waits for is event-driven
          // (postMessage 'ready' + native iframe 'load' events). This only
          // catches the case where one of those genuinely never fires.
          this.failTimer = setTimeout(() => {
            if (generation !== this.generation) return;
            if (this.initState === 'initialized') return;
            this.log('error', `[gen ${generation}] Timed out waiting for ready/frame-load/initialized (8s)`);
            this.initState = 'failed';
            this.initError = 'לא הצלחנו לטעון את שדות התשלום';
          }, 8000);
        },
        error: (err) => {
          if (generation !== this.generation) return;
          this.initState = 'failed';
          this.initError = err?.error?.error || err.message;
          this.log('error', `[gen ${generation}] Backend init call failed`, err?.error || err.message);
        },
      });
  }

  private resetForNewGeneration(): void {
    this.clearFailTimer();
    this.initMessageSent = false;
    this.lowProfileId = '';
    this.masterFrameReady = false;
    this.cardFrameLoaded = false;
    this.cvvFrameLoaded = false;
    this.sawReady = false;
    this.sawGetScreenValues = false;
    this.handshakeInitialized = false;
    this.initError = '';
  }

  // ── Native iframe load events (the actual fix) ────────────────────
  // Fires after each child's own document (including its
  // DOMContentLoaded, where CardNumber.js/CVV.js attach their message
  // listeners -- confirmed directly from CardCom's live scripts) has
  // finished loading. A real browser-native signal, not a guess.
  onCardFrameLoad(): void {
    this.cardFrameLoaded = true;
    this.log('info', `[gen ${this.generation}] CardComCardNumber iframe load event (t=${performance.now().toFixed(0)}ms)`);
    this.tryProceed(this.generation);
  }

  onCvvFrameLoad(): void {
    this.cvvFrameLoaded = true;
    this.log('info', `[gen ${this.generation}] CardComCvv iframe load event (t=${performance.now().toFixed(0)}ms)`);
    this.tryProceed(this.generation);
  }

  private onWindowMessage(event: MessageEvent): void {
    const action = event?.data?.action;
    this.log('in', `message received (origin=${event.origin}, action=${action ?? '(none)'})`, event.data);

    if (action === 'ready') {
      this.sawReady = true;
      this.tryProceed(this.generation);
    }
    if (action === 'GetScreenValues') this.sawGetScreenValues = true;
    if (action === 'initialized') {
      this.handshakeInitialized = true;
      if (this.initState === 'initializing') {
        this.initState = 'initialized';
        this.clearFailTimer();
        this.log('info', `[gen ${this.generation}] initialized -- revealing fields`);
      }
    }

    if (action === 'HandleSubmit') {
      this.transactionStarted = false;
      this.log('in', 'HandleSubmit -- transaction result received (see data above). NOT auto-navigating anywhere -- this is a diagnostic-only POC.', event.data);
    }
    if (action === 'HandleEror' || action === 'HandleError') {
      this.transactionStarted = false;
      this.log('error', 'HandleEror/HandleError received', event.data);
    }
  }

  // Sends 'init' exactly once per generation, only once every required
  // condition is true: master's own 'ready' (not just contentWindow
  // existence), a lowProfileId, AND both child field iframes' own native
  // load event -- the deterministic fix for the setStyles race.
  private tryProceed(generation: number): void {
    if (generation !== this.generation) return;
    if (this.initMessageSent) return;
    if (this.initState !== 'waitingForMasterReady') return;
    if (!this.sawReady || !this.lowProfileId || !this.cardFrameLoaded || !this.cvvFrameLoaded) return;

    const masterFrame = document.getElementById('CardComMasterFrame') as HTMLIFrameElement | null;
    if (!masterFrame?.contentWindow) {
      // contentWindow should already exist by this point (we only get here
      // after 'ready' actually fired), but guarded rather than assumed.
      setTimeout(() => this.tryProceed(generation), 100);
      return;
    }

    this.initMessageSent = true;
    this.initState = 'initializing';
    this.masterFrameReady = true;

    const iframeMessage = {
      action: 'init',
      cardFieldCSS: `
        body{margin:0;padding:0;background:transparent;overflow:hidden;}
        .cardNumber{width:100%;height:54px;border:1px solid #dbe2ea;border-radius:16px;background:#fff;padding:0 16px;box-sizing:border-box;font-size:17px;font-family:Arial,sans-serif;direction:ltr;text-align:right;outline:none;line-height:54px;}
        .cardNumber:focus{border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.1);}
      `,
      cvvFieldCSS: `
        body{margin:0;padding:0;background:transparent;overflow:hidden;}
        .cvvField{width:100%;height:54px;border:1px solid #dbe2ea;border-radius:16px;background:#fff;padding:0 16px;box-sizing:border-box;font-size:17px;font-family:Arial,sans-serif;direction:ltr;text-align:right;outline:none;line-height:54px;}
        .cvvField:focus{border-color:#16a34a;box-shadow:0 0 0 4px rgba(22,163,74,.1);}
      `,
      placeholder: '0000 0000 0000 0000',
      cvvPlaceholder: '123',
      lowProfileCode: this.lowProfileId,
    };

    this.log('out', `[gen ${generation}] Sending init postMessage to master frame (t=${performance.now().toFixed(0)}ms)`, iframeMessage);
    masterFrame.contentWindow.postMessage(iframeMessage, '*');
  }

  get readyToCharge(): boolean {
    return this.initState === 'initialized' && !!this.lowProfileId && !this.transactionStarted;
  }

  // Builds and logs the exact doTransaction payload the button WOULD send --
  // does not post it. Lets the human operator inspect it before deciding to
  // check the confirmation box and actually click "שלם 5 ₪".
  get pendingTransactionPayload() {
    return {
      action: 'doTransaction',
      lowProfileCode: this.lowProfileId,
      cardOwnerId: this.cardOwnerId || '000000000',
      cardOwnerName: this.cardOwnerName || 'Hamonym POC',
      cardOwnerEmail: this.cardOwnerEmail || 'test@test.com',
      cardOwnerPhone: this.cardOwnerPhone || '0500000000',
      expirationMonth: this.expirationMonth,
      expirationYear: this.expirationYear,
      numberOfPayments: '1',
    };
  }

  // Wired and functional -- fires a real doTransaction against a real card
  // if clicked. Gated behind confirmRealCharge (a separate checkbox the
  // operator must tick first) so this can never fire from an accidental
  // click alone. Not to be invoked by Claude itself -- only a human
  // operator, after explicit approval, clicks שלם 5 ₪.
  startTransaction(): void {
    if (!this.confirmRealCharge || !this.readyToCharge) return;
    const masterFrame = document.getElementById('CardComMasterFrame') as HTMLIFrameElement | null;
    if (!masterFrame?.contentWindow) {
      this.log('error', 'Master frame missing, cannot send doTransaction');
      return;
    }
    const payload = this.pendingTransactionPayload;
    this.transactionStarted = true;
    this.log('out', 'Sending doTransaction postMessage (REAL CHARGE)', payload);
    masterFrame.contentWindow.postMessage(payload, '*');
  }

  clearLogs(): void {
    this.logs = [];
  }
}
