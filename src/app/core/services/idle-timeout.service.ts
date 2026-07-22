import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CurrentContextService } from './current-context.service';
import { environment } from '../../../environments/environment';

// How long before the actual logout the warning modal appears and starts
// counting down — same lead time for admin and regular users, only the
// total idle budget differs.
const WARNING_SECONDS = 60;

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

// mousemove fires dozens of times/sec — only re-arm the idle timer at most
// this often, no need to reset on every single event.
const THROTTLE_MS = 1000;

@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private auth = inject(AuthService);
  private ctx = inject(CurrentContextService);

  readonly warningVisible = signal(false);
  readonly secondsRemaining = signal(WARNING_SECONDS);

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = 0;
  private started = false;
  private boundOnActivity = () => this.onActivity();

  private get timeoutMinutes(): number {
    const { admin, regular } = environment.idleTimeoutMinutes;
    return this.ctx.adminMode() ? admin : regular;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, this.boundOnActivity, { passive: true }));
    this.resetIdleTimer();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, this.boundOnActivity));
    this.clearTimers();
    this.warningVisible.set(false);
  }

  // Called by the warning modal's "stay logged in" button — activity during
  // the warning itself is ignored by onActivity() below (see comment there),
  // so this is the only way to dismiss it and re-arm the timer.
  extendSession(): void {
    this.warningVisible.set(false);
    this.resetIdleTimer();
  }

  private onActivity(): void {
    // Once the warning is showing, mere presence (e.g. the mouse resting
    // over the page) must not silently dismiss it — only an explicit
    // "extend" click should. Otherwise the countdown would never fire for
    // an unattended tab.
    if (this.warningVisible()) return;

    const now = Date.now();
    if (now - this.lastActivityAt < THROTTLE_MS) return;
    this.lastActivityAt = now;
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    this.clearTimers();
    const idleMs = Math.max(0, this.timeoutMinutes * 60 - WARNING_SECONDS) * 1000;
    this.idleTimer = setTimeout(() => this.showWarning(), idleMs);
  }

  private showWarning(): void {
    this.warningVisible.set(true);
    this.secondsRemaining.set(WARNING_SECONDS);
    this.countdownTimer = setInterval(() => {
      const remaining = this.secondsRemaining() - 1;
      if (remaining <= 0) {
        this.performLogout();
      } else {
        this.secondsRemaining.set(remaining);
      }
    }, 1000);
  }

  private performLogout(): void {
    this.clearTimers();
    this.warningVisible.set(false);
    this.auth.logout();
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.idleTimer = null;
    this.countdownTimer = null;
  }
}
