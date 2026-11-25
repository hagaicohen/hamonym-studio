import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `<div class="ham-toast-stack" dir="rtl" aria-label="הודעות">
    @for (toast of service.messages(); track toast.id) {
      <div [class]="'ham-toast ham-toast-' + toast.variant + (toast.closing ? ' ham-toast-closing' : '')" [attr.role]="toast.variant === 'error' ? 'alert' : 'status'" aria-atomic="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          @switch (toast.variant) {
            @case ('success') { <circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/> }
            @case ('warning') { <path d="M10.3 4 2.5 18a1.5 1.5 0 0 0 1.3 2h16.4a1.5 1.5 0 0 0 1.3-2L13.7 4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/> }
            @case ('error') { <circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/> }
            @default { <circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/> }
          }
        </svg>
        <div class="message">@if (toast.title) { <strong>{{ toast.title }}</strong> }@if (toast.description) { <p>{{ toast.description }}</p> }</div>
        <button type="button" aria-label="סגירת הודעה" (click)="service.dismiss(toast.id)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
      </div>
    }
  </div>`,
  styles: [`
    :host { position: fixed; inset-inline: 16px; bottom: calc(24px + env(safe-area-inset-bottom, 0px) + var(--app-toast-bottom-offset, 0px)); z-index: 2147483647; pointer-events: none; }
    .ham-toast-stack { width: min(440px, 100%); margin-inline: auto; display: grid; gap: 10px; }
    .ham-toast { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border: 1px solid; border-radius: 12px; box-shadow: 0 8px 28px #0f172a26; pointer-events: auto; font: 14px/1.5 Heebo, sans-serif; animation: toast-in .18s ease-out; }
    .ham-toast-success { background: #EFFCF5; border-color: #A7E6C2; color: #166534; }
    .ham-toast-warning { background: #FFF7ED; border-color: #FED7AA; color: #9A3412; }
    .ham-toast-error { background: #FEF2F2; border-color: #FECACA; color: #991B1B; }
    .ham-toast-info { background: #EFF6FF; border-color: #BFDBFE; color: #1E40AF; }
    svg { width: 20px; height: 20px; flex-shrink: 0; }
    .message { flex: 1; min-width: 0; overflow-wrap: anywhere; text-align: right; }
    strong { font-weight: 600; } p { margin: 2px 0 0; }
    button { display: grid; place-items: center; border: 0; padding: 4px; background: transparent; color: inherit; cursor: pointer; border-radius: 4px; }
    button:focus-visible { outline: 2px solid currentColor; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .ham-toast.ham-toast-closing { animation: toast-out .45s ease-in forwards; }
    @keyframes toast-out { to { opacity: 0; transform: translateY(8px); } }
    @media(max-width: 600px) {
      :host {
        inset-inline-start: max(24px, env(safe-area-inset-left, 0px));
        inset-inline-end: max(24px, env(safe-area-inset-right, 0px));
        bottom: calc(16px + env(safe-area-inset-bottom, 0px) + var(--app-toast-bottom-offset, 80px));
      }
      .ham-toast-stack { width: min(360px, 100%); gap: 8px; }
      .ham-toast {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        align-items: flex-start;
        gap: 8px;
        padding: 12px;
        font-size: 14px;
        line-height: 1.6;
      }
      .ham-toast > svg { margin-top: 4px; }
      .message { align-self: center; }
      button { flex: 0 0 44px; width: 44px; height: 44px; margin: -8px 0 -8px -8px; }
      p { white-space: normal; }
    }
    @media(max-width: 600px) and (max-height: 500px) {
      .ham-toast-stack { max-height: calc(100dvh - 128px - env(safe-area-inset-bottom, 0px) - var(--app-toast-bottom-offset, 80px)); overflow-y: auto; pointer-events: auto; }
    }
    @media(prefers-reduced-motion: reduce) { .ham-toast { animation: none; } }
  `],
})
export class ToastContainerComponent { readonly service = inject(ToastService); }
