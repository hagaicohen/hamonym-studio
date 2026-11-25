import {campaignLang} from '../../../../core/i18n/content-language';
import {elementColor} from '../../utils/element-color';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HmTextRoleDirective } from '../../studio/preview/text-role.directive';
import { AmountCardStyle } from '../../utils/amount-buttons';
export function amountCardImage(value: string | undefined): string | null { if (!value)
    return null; try {
    const url = new URL(value, location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
}
catch {
    return null;
} }
@Component({ selector: 'app-amount-card', standalone: true, imports: [CommonModule, HmTextRoleDirective], template: `<span class="amount-card" [class.designed]="!!config" [class.artwork]="artwork" [class.layered]="config?.mode==='layered'" [attr.data-card-mode]="config?.mode||null" [style.--card-ratio]="config?.aspectRatio||'1 / 1'" [style.--card-fit]="config?.imageFit||'cover'" [style.--card-position]="config?.imagePosition||'50% 50%'" [style.--card-overlay]="config?.overlayColor||'#0f172a'" [style.--card-opacity]="opacity" [style.--card-align]="config?.contentAlign||'center'" [attr.data-decoration]="config?.decoration||null" [style.background]="config?.background||null" [style.color]="resolvedColor" [style.borderColor]="config?.borderColor||null" [style.borderRadius.px]="config?.radius??null" [style.padding.px]="config?.padding??null" [hmTextRole]="config?.textStyle"><img *ngIf="image as url" [src]="url" (error)="failedImage=url" alt="" loading="lazy"><span class="card-overlay" *ngIf="config?.mode==='layered' && image" aria-hidden="true"></span><span class="amount-card-copy" [class.artwork-metadata]="artwork"><strong><ng-content /></strong><span *ngIf="config?.title">{{config?.title}}</span><small *ngIf="config?.description">{{config?.description}}</small><span class="sr-only" *ngIf="config?.accessibleDescription">{{config?.accessibleDescription}}</span></span></span>`, styles: [`:host{display:contents}.amount-card{display:contents}.amount-card.designed{display:flex;position:relative;inline-size:100%;min-inline-size:0;block-size:100%;box-sizing:border-box;flex-direction:column;overflow:hidden;border:1px solid transparent;border-radius:inherit;padding:10px;isolation:isolate}.amount-card img{display:block;inline-size:100%;aspect-ratio:2;object-fit:cover;border-radius:6px;margin-block-end:8px}.amount-card-copy{display:contents}.designed .amount-card-copy{display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}.amount-card strong{font:inherit}.amount-card small{font-size:.8em;line-height:1.4}.artwork.designed{padding:0!important;aspect-ratio:var(--card-ratio);block-size:auto}.artwork img{inline-size:100%;block-size:100%;aspect-ratio:auto;object-fit:var(--card-fit);object-position:var(--card-position);margin:0;border-radius:0}.artwork-metadata,.sr-only{position:absolute!important;inline-size:1px!important;block-size:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}.layered.designed{aspect-ratio:var(--card-ratio);justify-content:var(--card-align);min-block-size:120px}.layered img{position:absolute;inset:0;inline-size:100%;block-size:100%;object-fit:var(--card-fit);object-position:var(--card-position);margin:0;border-radius:0;z-index:-2}.card-overlay{position:absolute;inset:0;background:var(--card-overlay);opacity:var(--card-opacity);z-index:-1}.layered .amount-card-copy{padding:8px;position:relative;text-align:center}.layered[data-decoration=pill] .amount-card-copy{background:var(--card-overlay);border-radius:999px}.layered[data-decoration=seal] .amount-card-copy{background:var(--card-overlay);border-radius:22% 38% 18% 28%;transform:rotate(-2deg)}@media(prefers-reduced-motion:no-preference){.designed{transition:box-shadow 150ms ease}}`] })
export class AmountCardComponent {
 private readonly lang=campaignLang();get resolvedColor(){return elementColor(this.config?.textStyle,this.lang())??this.config?.color??null;}
    @Input()
    config: AmountCardStyle | null | undefined;
    failedImage: string | null = null;
    get artwork(){return this.config?.mode==='artwork'&&!!this.image;}
    get opacity(){return Math.max(0,Math.min(.9,this.config?.overlayOpacity??.25));}
    get image() { const own=this.config?.imageUrlByLanguage?.[this.lang()];const url=amountCardImage(own===undefined?this.config?.imageUrl:own);return url===this.failedImage?null:url; }
}

