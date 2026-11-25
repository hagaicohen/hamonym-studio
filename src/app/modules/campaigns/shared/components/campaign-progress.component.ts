import {campaignLang} from '../../../../core/i18n/content-language';
import {elementColor} from '../../utils/element-color';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, EventEmitter, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HmPublicTextPipe } from '../../../../core/i18n/content-language';
import { HmTextRoleDirective } from '../../studio/preview/text-role.directive';
import type { ProgressConfig } from '../../utils/campaign-composition';
@Component({ selector: 'app-campaign-progress', standalone: true, imports: [CommonModule, HmPublicTextPipe, HmTextRoleDirective], template: `<section class="progress-block" [class.has-badge]="!!config.badge" [style.--badge-size.px]="badgeSize" [style.--progress-fill]="config.fill || 'var(--hm-primary, #6236ed)'" [style.--progress-track]="config.track || '#e2e8f0'" [style.--progress-height.px]="height" [style.--progress-radius.px]="radius">
<p *ngIf="config.label" [attr.data-inline-edit]="editing?'blocks#'+blockId+'.data.label':null">{{config.label}}</p>
<ng-container *ngIf="percent !== null; else noGoal">
<span *ngIf="config.percentPosition === 'above'" class="above" [hmTextRole]="config.textStyle" [style.color]="resolvedColor">{{percent | number:'1.0-2'}}%</span>
<div class="progress-shell"><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="capped" [attr.aria-valuetext]="percent + '%'" [attr.aria-label]="config.label || ('builder.enhance.progress' | hmPublic)">
<div class="fill" [style.width.%]="fill"></div>
<span *ngIf="(config.percentPosition || 'inside') === 'inside'" aria-hidden="true" class="inside" [hmTextRole]="config.textStyle" [class.small-fill]="capped < 25" [style.color]="resolvedColor">{{display | number:'1.0-2'}}%</span>
</div><span *ngIf="config.badge" class="percentage-badge" [style.pointer-events]="editing?'auto':null" [attr.data-summary-part]="editing?'percent':null" aria-hidden="true" [style.inset-inline-start]="badgePosition" [style.background]="config.badge.background||config.fill||'var(--hm-primary,#6236ed)'" [style.color]="resolvedColor||config.badge.color||'#ffffff'" [style.border-color]="config.badge.border||'transparent'" [style.box-shadow]="config.badge.shadow?'0 4px 14px #0f172a25':null" [hmTextRole]="config.textStyle">{{display|number:'1.0-2'}}%</span></div></ng-container><ng-template #noGoal><span class="no-goal">{{'builder.enhance.noGoal' | hmPublic}}</span></ng-template></section>`, styles: [`
:host{display:block;min-inline-size:0}.progress-block{padding:8px 12px}.progress-block p{margin:0 0 6px}.track{position:relative;block-size:var(--progress-height);min-block-size:8px;background:var(--progress-track);border-radius:var(--progress-radius);overflow:hidden}.fill{block-size:100%;background:var(--progress-fill);border-radius:inherit}.inside{position:absolute;inset-block:0;inset-inline-start:8px;display:flex;align-items:center;color:white;font-weight:700;font-size:12px;line-height:1}.small-fill{inset-inline-start:auto;inset-inline-end:8px;color:#0f172a}.above{display:block;margin-block-end:4px;font-weight:700}.no-goal{color:#64748b;font-size:13px}.progress-shell{position:relative;min-inline-size:0}.has-badge{padding-block:calc(var(--badge-size)/2 + 8px)}.percentage-badge{position:absolute;inset-block-start:calc((var(--progress-height) - var(--badge-size))/2);inline-size:var(--badge-size);max-inline-size:100%;aspect-ratio:1;box-sizing:border-box;display:grid;place-items:center;border-radius:50%;border:2px solid transparent;font-weight:700;font-size:14px;white-space:nowrap;pointer-events:none}
`] })
export class CampaignProgressComponent implements OnChanges, AfterViewInit, OnDestroy {
 private readonly lang=campaignLang();get resolvedColor(){return elementColor(this.config.textStyle,this.lang())??this.config.color??null;}
    @Output() animationFrame=new EventEmitter<number>(true);
    @Input() replay=0;
    get badgeSize(){return Math.max(32,Math.min(80,this.config.badge?.size??56));}
    get badgePosition(){return `clamp(0px, calc(${this.fill}% - ${this.badgeSize/2}px), calc(100% - ${this.badgeSize}px))`;}
    @Input()
    blockId = '';
    @Input()
    editing = false;
    @Input()
    percent: number | null = null;
    @Input()
    config: ProgressConfig = {};
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private observer?: IntersectionObserver;
    private raf = 0;
    private entered = false;
    display = 0;
    fill = 0;
    get capped() { return Math.max(0, Math.min(100, this.percent ?? 0)); }
    get height() { return Math.max((this.config.percentPosition??'inside')==='inside'?16:8, Math.min(64, this.config.height ?? 16)); }
    get radius() { return Math.max(0, Math.min(32, this.config.radius ?? 8)); }
    ngOnChanges(changes:SimpleChanges) { if(changes['replay']&&!changes['replay'].firstChange&&this.entered){this.run();return;} if (!this.config.animate || this.entered || this.reduced()) {
        this.finish();
    }
    else {
        this.display = this.config.countPercent===false?(this.percent??0):0;
        this.fill = this.config.animateFill===false?this.capped:0;
    } }
    private reduced() { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
    ngAfterViewInit() { this.observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !this.entered) {
        this.entered = true;
        this.observer?.disconnect();
        this.run();
    } }); this.observer.observe(this.host.nativeElement); }
    private finish() { cancelAnimationFrame(this.raf); this.display = this.percent ?? 0; this.fill = this.capped;this.animationFrame.emit(1); }
    private run() { if (!this.config.animate || this.reduced() || this.percent === null) {
        this.finish();
        return;
    } cancelAnimationFrame(this.raf);this.animationFrame.emit(0); const start = performance.now(), duration = Math.max(200, Math.min(5000, this.config.duration ?? 900)), actual = this.percent; const tick = (now: number) => { const t = Math.min(1, (now - start) / duration), ease = this.config.easing === 'linear' ? t : 1 - Math.pow(1 - t, 3); this.display = this.config.countPercent===false?actual:actual*ease; this.fill = this.config.animateFill===false?this.capped:this.capped*ease;this.animationFrame.emit(ease); if (t < 1)
        this.raf = requestAnimationFrame(tick);
    else
        this.finish(); }; this.raf = requestAnimationFrame(tick); }
    ngOnDestroy() { cancelAnimationFrame(this.raf); this.observer?.disconnect(); }
}
