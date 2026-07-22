import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { IdleTimeoutService } from './idle-timeout.service';
import { AuthService } from './auth.service';
import { CurrentContextService } from './current-context.service';

describe('IdleTimeoutService', () => {
  let service: IdleTimeoutService;
  let authSpy: jasmine.SpyObj<AuthService>;
  let ctx: CurrentContextService;

  beforeEach(() => {
    authSpy = jasmine.createSpyObj('AuthService', ['logout']);

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authSpy }],
    });

    service = TestBed.inject(IdleTimeoutService);
    ctx = TestBed.inject(CurrentContextService);
  });

  it('shows the warning 60s before the regular-user 30-minute timeout, then logs out if ignored', fakeAsync(() => {
    ctx.adminMode.set(false);
    service.start();

    const warnAt = 29 * 60 * 1000; // 30min - 60s

    tick(warnAt - 1000);
    expect(service.warningVisible()).toBe(false);
    expect(authSpy.logout).not.toHaveBeenCalled();

    tick(1000); // crosses the warnAt threshold
    expect(service.warningVisible()).toBe(true);
    expect(service.secondsRemaining()).toBe(60);

    tick(59 * 1000); // 59 of the 60 warning seconds pass
    expect(service.warningVisible()).toBe(true);
    expect(service.secondsRemaining()).toBe(1);
    expect(authSpy.logout).not.toHaveBeenCalled();

    tick(1000); // last second — logout fires
    expect(authSpy.logout).toHaveBeenCalledTimes(1);
    expect(service.warningVisible()).toBe(false);

    service.stop();
  }));

  it('uses a 15-minute timeout in admin mode instead of 30', fakeAsync(() => {
    ctx.adminMode.set(true);
    service.start();

    const warnAt = 14 * 60 * 1000; // 15min - 60s

    tick(warnAt - 1000);
    expect(service.warningVisible()).toBe(false);

    tick(1000);
    expect(service.warningVisible()).toBe(true);

    service.stop();
  }));

  it('activity before the warning threshold re-arms the timer instead of firing early', fakeAsync(() => {
    ctx.adminMode.set(true); // 15 min -> warn at 14:00 idle
    service.start();

    tick(10 * 60 * 1000); // 10 minutes idle
    window.dispatchEvent(new Event('mousemove')); // re-arms: new deadline is 10:00 + 14:00 from now
    tick(10 * 60 * 1000); // 10 more minutes — only 10:00 into the NEW 14:00 window

    expect(service.warningVisible()).toBe(false);

    tick(4 * 60 * 1000 - 1000); // just under the re-armed 14:00 mark
    expect(service.warningVisible()).toBe(false);

    tick(1000); // crosses it
    expect(service.warningVisible()).toBe(true);

    service.stop();
  }));

  it('extendSession() dismisses the warning and restarts the full idle countdown', fakeAsync(() => {
    ctx.adminMode.set(true); // 15 min -> warning at 14:00
    service.start();

    tick(14 * 60 * 1000);
    expect(service.warningVisible()).toBe(true);

    service.extendSession();
    expect(service.warningVisible()).toBe(false);

    tick(14 * 60 * 1000 - 1000); // just under the new 14:00 mark
    expect(service.warningVisible()).toBe(false);
    expect(authSpy.logout).not.toHaveBeenCalled();

    tick(1000);
    expect(service.warningVisible()).toBe(true);

    service.stop();
  }));

  it('stop() clears pending timers so a stale logout never fires after navigating away', fakeAsync(() => {
    ctx.adminMode.set(true);
    service.start();
    tick(5 * 60 * 1000);
    service.stop();

    tick(20 * 60 * 1000);
    expect(authSpy.logout).not.toHaveBeenCalled();
    expect(service.warningVisible()).toBe(false);
  }));
});
