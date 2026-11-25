import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, Signal, computed, inject, signal } from '@angular/core';

/** The platform supplies verified server data and commands; Studio only renders it. */
export interface PublicationCheck {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  required: boolean;
  action?: 'save' | 'settings' | 'legacy' | 'organization' | 'identity';
}
export interface PublicationState {
  loading: boolean;
  publishing: boolean;
  status: string;
  checks: PublicationCheck[];
  canPublish: boolean;
  publicUrl: string;
  error: string;
}
export interface StudioPublication {
  state: Signal<PublicationState>;
  refresh(): Promise<void>;
  saveAndRefresh(): Promise<void>;
  publish(): Promise<void>;
  openCheck(check: PublicationCheck): void;
  copyUrl(): Promise<void>;
}
export const STUDIO_PUBLICATION = new InjectionToken<StudioPublication>('HAMONYM platform publication');

@Component({
  selector: 'ham-publication-checks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .publication-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .publication-url { display: flex; align-items: center; gap: 8px; margin-block: 12px; }
    .publication-url-text { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; user-select: text; }
    .hu-check-row { width: 100%; text-align: right; }
    .hu-check-row:disabled { opacity: 1; cursor: default; }
    .hu-check-row.missing { border: 1px solid #fecaca; border-radius: 10px; background: #fff7f7; color: #991b1b; margin-block: 6px; }
    .hu-check-row svg { width: 18px; height: 18px; flex-shrink: 0; }
    .publication-error { color: #991b1b; }
    .publication-ready { padding: 16px; margin-bottom: 16px; border: 1px solid #a7e6c2; border-radius: 12px; background: #effcf5; color: #166534; }
    .publication-ready strong { font-size: 18px; }
    .publication-ready p { margin: 6px 0 0; }
    button:disabled { cursor: default; opacity: .5; }
  `],
  template: `@if (publication; as p) {
    @let s = p.state();
    @if (s.status === 'published') {
      <div class="publication-ready" role="status"><strong>הקמפיין פורסם</strong></div>
      @if (s.publicUrl) { <a class="hu-action primary" [href]="s.publicUrl" target="_blank" rel="noopener">צפה בקמפיין</a> }
    } @else if (s.loading || s.publishing) {
      <p role="status">{{ s.publishing ? 'מפרסם את הקמפיין…' : 'בודק נתונים והרשאות מול השרת…' }}</p>
    } @else {
      @if (s.canPublish && !s.error) {
        <div class="publication-ready" role="status"><strong>הקמפיין מוכן לפרסום</strong><p>{{ completed() }} מתוך {{ requiredCount() }} תנאי הפרסום הושלמו.</p></div>
      } @else {
        <h3>{{ blockers().length ? 'נדרשות השלמות לפני הפרסום' : 'הפרסום טרם אושר' }}</h3>
        @for (check of blockers(); track check.id) {
          <button type="button" class="hu-check-row missing" [disabled]="!check.action" (click)="p.openCheck(check)"><span><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></span>@if (check.action) { <span aria-hidden="true">‹</span> }</button>
        }
      }
      @if (s.error) { <p class="publication-error" role="alert">{{ s.error }}</p> }
      <div class="publication-actions">
        @if (s.canPublish && !s.error) {
          <button class="hu-action primary" type="button" (click)="p.publish()">פרסם קמפיין</button>
        } @else {
          @if (firstAction(); as check) {
            <button class="hu-action primary" type="button" (click)="p.openCheck(check)">השלם פרטים</button>
          } @else {
            <button class="hu-action" type="button" (click)="p.refresh()">בדוק מחדש</button>
          }
        }
        <button class="hu-action" type="button" [attr.aria-expanded]="detailsOpen()" (click)="detailsOpen.set(!detailsOpen())">הצג תנאים</button>
      </div>
    }
    @if (s.publicUrl) {
      <div class="publication-url"><span class="publication-url-text" dir="ltr">{{ s.publicUrl }}</span><button type="button" class="hu-action" (click)="p.copyUrl()">העתק קישור</button></div>
    }
    <details #checklist [open]="detailsOpen()" (toggle)="detailsOpen.set(checklist.open)" style="margin-top:16px">
      <summary>פירוט תנאי הפרסום</summary>
      @for (check of s.checks; track check.id) {
        <button type="button" class="hu-check-row" [class.done]="check.complete" [class.missing]="check.required && !check.complete" [disabled]="!check.action || s.publishing" (click)="p.openCheck(check)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/>@if (check.complete) {<path d="m7 12 3 3 7-7"/>} @else {<path d="M12 7v6m0 3h.01"/>}</svg>
          <span><strong>{{ check.label }} · {{ check.complete ? 'הושלם' : check.required ? 'נדרש להשלים' : 'מידע' }}</strong><small>{{ check.detail }}</small></span>
          @if (check.action) { <span aria-hidden="true">‹</span> }
        </button>
      }
      @if (s.status !== 'published') { <div class="publication-actions"><button class="hu-action" type="button" [disabled]="s.loading || s.publishing" (click)="p.saveAndRefresh()">שמור ובדוק מחדש</button></div> }
    </details>
  } @else { <p class="publication-error" role="alert">חיבור הפרסום למערכת אינו זמין. יש לפתוח מחדש את Studio מתוך HAMONYM.</p> }`,
})
export class PublicationChecksComponent implements OnInit {
  readonly publication = inject(STUDIO_PUBLICATION, { optional: true });
  readonly detailsOpen = signal(false);
  readonly blockers = computed(() => this.publication?.state().checks.filter(check => check.required && !check.complete) || []);
  readonly firstAction = computed(() => this.blockers().find(check => check.action));
  readonly requiredCount = computed(() => this.publication?.state().checks.filter(check => check.required).length || 0);
  readonly completed = computed(() => this.requiredCount() - this.blockers().length);
  ngOnInit(): void { void this.publication?.refresh(); }
}
