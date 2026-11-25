import { ApplicationRef, ChangeDetectionStrategy, Component, ComponentRef, DestroyRef, EnvironmentInjector, Injectable, createComponent, inject, signal } from '@angular/core';
import { Json, ManagementModelService } from '../management-model.service';
import { RewardTileComponent } from '../../public-page/cards/reward-tile.component';
import { contentContext, contentWindow } from './content-context';

/** The public reward card at full size, in a modal dialog (old engine `openRewardManagerCardPreview`). */
@Component({
  selector: 'dialog[ham-reward-preview]',
  standalone: true,
  imports: [RewardTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'huRewardManagerPreviewDialog', class: 'hu-race-expanded-dialog hu-reward-expanded-dialog', '(click)': 'backdrop($event)' },
  template: `<div class="hu-race-expanded-frame" dir="rtl"><div class="hu-race-expanded-head"><div><small>תצוגה מקדימה של תשורה {{ index() + 1 }}</small><strong>{{ name() }}</strong></div><button type="button" data-hu-reward-preview-close aria-label="סגור תצוגה מקדימה" (click)="close()">×</button></div><div class="hu-race-expanded-body"><div class="hu-race-expanded-preview hu-reward-expanded-preview" inert>@if (item(); as reward) {<div class="preview reward-mini-preview" dir="rtl" [attr.style]="vars()"><article ham-reward-tile [item]="reward" [cfg]="cfg()" [index]="index()"></article></div>}</div></div><div class="hu-race-expanded-foot"><small>תצוגת עיצוב בלבד · בחירת התשורה אינה מופעלת כאן</small><button type="button" data-hu-reward-preview-close (click)="close()">סגור</button></div></div>`
})
export class RewardPreviewComponent {
  readonly index = signal(0);
  readonly name = signal('');
  /** A copy of the reward as of opening (a new object, so the card renders again). */
  readonly item = signal<Json | null>(null);
  readonly cfg = signal<Json>({});
  readonly vars = signal('');
  dialog!: HTMLDialogElement;
  close(): void { if (this.dialog.open) this.dialog.close(); }
  backdrop(e: MouseEvent): void { if (e.target === this.dialog) this.dialog.close(); }
}

/**
 * Opens the reward preview from the scaled-down card of a reward editor (`[data-hu-reward-expand]`,
 * core markup): on pointerdown, so a pending field change that redraws the page cannot swallow the
 * first click, and with Enter/Space. The dialog is created on first use, at the end of `<body>`.
 */
@Injectable({ providedIn: 'root' })
export class RewardPreviewService {
  private readonly model = inject(ManagementModelService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);
  private ref: ComponentRef<RewardPreviewComponent> | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    const expand = (e: Event): HTMLElement | null => e.target instanceof Element ? e.target.closest<HTMLElement>('[data-hu-reward-expand]') : null;
    const onPointer = (e: PointerEvent): void => { const t = expand(e); if (!t) return; e.preventDefault(); this.open(Number(t.dataset['huRewardExpand'])); };
    const onClick = (e: MouseEvent): void => { const t = expand(e); if (t && !this.ref?.instance.dialog.open) this.open(Number(t.dataset['huRewardExpand'])); };
    const onKey = (e: KeyboardEvent): void => { const t = expand(e); if (!t || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); this.open(Number(t.dataset['huRewardExpand'])); };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      this.ref?.destroy();
    });
  }

  open(index: number): void {
    const item = this.model.partsFor('rewards')[index];
    if (!item) return;
    const ctx = contentContext(this.model.context), state = ctx.readState(), cfg = state['content'].rewards || {};
    const vars = ctx.rewardStyleVars(cfg) + `--reward-bg:${cfg.cardBg || '#ffffff'};--reward-accent:${cfg.accentColor || state['theme'].primary};`;
    const preview = this.ensure();
    preview.instance.index.set(index);
    preview.instance.name.set(String(item['name'] || 'תשורה חדשה'));
    preview.instance.cfg.set(cfg);
    preview.instance.vars.set(vars);
    preview.instance.item.set({ ...item });
    preview.changeDetectorRef.detectChanges();
    const dialog = preview.instance.dialog;
    contentWindow().hamonymMediaFix?.patchMedia(dialog);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }

  private ensure(): ComponentRef<RewardPreviewComponent> {
    if (this.ref) return this.ref;
    const host = document.createElement('dialog');
    document.body.appendChild(host);
    const ref = createComponent(RewardPreviewComponent, { environmentInjector: this.injector, hostElement: host });
    ref.instance.dialog = host;
    this.appRef.attachView(ref.hostView);
    return this.ref = ref;
  }
}
