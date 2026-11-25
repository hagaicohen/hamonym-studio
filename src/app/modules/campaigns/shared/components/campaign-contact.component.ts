import {campaignLang} from '../../../../core/i18n/content-language';
import {elementColor} from '../../utils/element-color';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HmPublicTextPipe } from '../../../../core/i18n/content-language';
import { HmTextRoleDirective } from '../../studio/preview/text-role.directive';
import type { ContactConfig } from '../../utils/campaign-composition';
export function contactHref(kind: 'email' | 'phone' | 'whatsapp' | 'website', value: string | undefined): string | null { if (!value || /[\r\n]/.test(value))
    return null; if (kind === 'email')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'mailto:' + encodeURIComponent(value).replace('%40', '@') : null; if (kind === 'website') {
    try {
        const u = new URL(value);
        return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
    }
    catch {
        return null;
    }
} const number = value.replace(/[\s()-]/g, ''); if (!/^\+?\d{7,20}$/.test(number))
    return null; return kind === 'whatsapp' ? 'https://wa.me/' + number.replace(/^\+/, '') : 'tel:' + number; }
@Component({ selector: 'app-campaign-contact', standalone: true, imports: [CommonModule, HmPublicTextPipe, HmTextRoleDirective], template: `<section class="contact-block" [class.centered]="config.template==='centered'" [class.compact]="config.template==='compact'" [style.background]="config.background || null" [style.color]="resolvedColor" [style.padding.px]="config.padding??(config.template==='compact'?12:20)" [style.gap.px]="config.gap??16" [hmTextRole]="config.textStyle">
<div><h2 [attr.data-inline-edit]="editing?'blocks#'+blockId+'.data.title':null">{{config.title || ('builder.enhance.contact'|hmPublic)}}</h2><p *ngIf="config.text" [attr.data-inline-edit]="editing?'blocks#'+blockId+'.data.text':null" data-inline-multiline>{{config.text}}</p></div><address><ng-container *ngFor="let kind of kinds"><a *ngIf="href(kind) as link" [href]="link" [attr.target]="kind==='whatsapp'||kind==='website'?'_blank':null" rel="noopener noreferrer">{{('builder.enhance.'+kind)|hmPublic}}: <bdi>{{config[kind]}}</bdi></a></ng-container></address></section>`, styles: [`:host{display:block}.contact-block{display:grid;grid-template-columns:1fr 1fr;border-radius:12px}.contact-block.centered{grid-template-columns:1fr;text-align:center}h2{margin:0 0 8px}p{margin:0;white-space:pre-wrap}address{font-style:normal;display:flex;flex-direction:column;gap:10px}a{color:inherit;overflow-wrap:anywhere;padding:4px}a:focus-visible{outline:2px solid #6236ed;outline-offset:3px}@media(max-width:600px){.contact-block{grid-template-columns:1fr}}`] })
export class CampaignContactComponent {
 private readonly lang=campaignLang();get resolvedColor(){return elementColor(this.config.textStyle,this.lang())??this.config.color??null;}
    @Input()
    blockId = '';
    @Input()
    editing = false;
    @Input()
    config: ContactConfig = {};
    readonly kinds = ['email', 'phone', 'whatsapp', 'website'] as const;
    href(kind: typeof this.kinds[number]) { return contactHref(kind, this.config[kind]); }
}
