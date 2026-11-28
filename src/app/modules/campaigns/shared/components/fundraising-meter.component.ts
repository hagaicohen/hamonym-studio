import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, inject, signal, booleanAttribute } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-fundraising-meter',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    @if (personal) {
      <div class="personal-summary">
        <div><small>גויסו עד כה</small><strong class="raised"><bdi>{{ displayed() | currency:'ILS':'symbol':'1.0-2' }}</bdi></strong></div>
        <div><small>יעד אישי</small><b>@if (goal > 0) { <bdi>{{ goal | currency:'ILS':'symbol':'1.0-2' }}</bdi> } @else { לא הוגדר יעד }</b></div>
      </div>
      @if (goal > 0) {
        <div class="track personal-track" role="progressbar" aria-label="התקדמות בגיוס" [attr.aria-valuenow]="fill" [attr.aria-valuetext]="percent + '%'"><span [style.width.%]="fill"></span></div>
      }
      <div class="personal-summary personal-footer">
        @if (goal > 0) { <b><bdi>{{ percent | number:'1.0-1' }}%</bdi> מהיעד</b> }
        @if (personalDonorCount != null) { <small>{{ personalDonorCount | number }} תורמים</small> }
      </div>
    } @else {
    @if (showRaised) { <strong class="raised"><bdi>{{ displayed() | currency:'ILS':'symbol':'1.0-2' }}</bdi></strong> }
    @if (showGoal && goal > 0) { <span>{{ goalLabel }} <bdi>{{ goal | currency:'ILS':'symbol':'1.0-2' }}</bdi></span> }
    @if (showProgress && showRaised && showGoal && goal > 0) {
      <div class="track" role="progressbar" aria-label="התקדמות בגיוס"
        [attr.aria-valuenow]="fill" [attr.aria-valuetext]="percent.toFixed(1) + '%'">
        <span [style.width.%]="fill"></span>
      </div>
      <b><bdi>{{ percent.toFixed(1) }}%</bdi> מהיעד</b>
    }
    }
  `,
  styles: [`
    .personal-summary { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; align-items:end; }
    .personal-summary > div { display:grid; gap:3px; }
    .personal-summary small { color:#526761; font-size:12px; }
    .personal-summary .raised { font-size:26px; color:var(--fundraising-accent,currentColor); }
    .track.personal-track { height:7px; }
    .personal-footer { font-size:12px; color:var(--fundraising-accent,currentColor); }
    :host { display:grid; gap:var(--fundraising-meter-gap, 8px); direction:rtl; }
    .raised { font-size:var(--fundraising-amount-size, clamp(34px, 5vw, 40px)); line-height:1.12; font-variant-numeric:tabular-nums; }
    .track { background:color-mix(in srgb, var(--fundraising-accent, currentColor) 15%, transparent); height:var(--fundraising-track-size, 9px); border-radius:20px; overflow:hidden; }
    .track span { display:block; height:100%; background:var(--fundraising-accent,currentColor); border-radius:inherit; }
  `],
})
export class FundraisingMeterComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() raised = 0;
  @Input() goal = 0;
  @Input() goalLabel = 'מתוך יעד של';
  @Input() animated = true;
  @Input({transform: booleanAttribute}) personal = false;
  @Input() personalDonorCount?: number;
  @Input() showRaised = true;
  @Input() showGoal = true;
  @Input() showProgress = true;
  readonly displayed = signal(0);
  private readonly host = inject(ElementRef<HTMLElement>);
  private visible = false;
  private observer?: IntersectionObserver;
  private frame = 0;

  get percent(): number { return this.goal > 0 ? this.displayed() / this.goal * 100 : 0; }
  get fill(): number { return Math.max(0, Math.min(100, this.percent)); }

  ngAfterViewInit(): void {
    if (!this.animated || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      this.visible = true;
      this.update();
      return;
    }
    this.observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      this.observer?.disconnect();
      this.visible = true;
      this.update();
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnChanges(): void { this.update(); }

  private update(): void {
    cancelAnimationFrame(this.frame);
    const end = Number.isFinite(this.raised) ? this.raised : 0;
    if (!this.animated || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.displayed.set(end);
      return;
    }
    if (!this.visible) return;
    const start = this.displayed();
    if (start === end) return;
    const time = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - time) / 1700);
      this.displayed.set(start + (end - start) * (1 - (1 - elapsed) ** 3));
      if (elapsed < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
