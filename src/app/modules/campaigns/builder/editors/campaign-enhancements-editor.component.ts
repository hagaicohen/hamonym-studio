import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ColorPickerComponent } from '../../../../shared/ui/color-picker/color-picker.component';
import { TextRoleEditorComponent } from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import { CampaignBlock, CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { StudioUiService } from '../../studio/services/studio-ui.service';
import { blockPlacement, blockOrder, BlockPlacement } from '../../utils/campaign-composition';
@Component({ selector: 'app-campaign-enhancements-editor', standalone: true, imports: [CommonModule, FormsModule, TranslocoPipe, ColorPickerComponent, TextRoleEditorComponent], template: `
<section class="enhancements" *ngIf="block">
<details data-device-composition><summary>{{'builder.enhance.composition'|transloco}}</summary>
<label>{{'builder.enhance.editDevice'|transloco}}<select [ngModel]="device" data-composition-device (ngModelChange)="setDevice($event)"><option value="desktop">{{'builder.enhance.desktop'|transloco}}</option><option value="mobile">{{'builder.enhance.mobile'|transloco}}</option></select></label>
<p class="hint">{{'builder.enhance.deviceHint'|transloco}}</p>
<label>{{'builder.enhance.position'|transloco}}<select data-block-position [ngModel]="placement" (ngModelChange)="setComposition({placement:$event})"><option *ngFor="let p of placements" [value]="p">{{('builder.enhance.position_'+p)|transloco}}</option></select></label>
<div class="actions"><button type="button" data-order-up [disabled]="atFirst" (click)="move(-1)">{{'builder.enhance.moveUp'|transloco}}</button><button type="button" data-order-down [disabled]="atLast" (click)="move(1)">{{'builder.enhance.moveDown'|transloco}}</button></div>
<button type="button" (click)="resetComposition()">{{'builder.enhance.inherit'|transloco}}</button></details>
<ng-container *ngIf="block.type==='donors'||block.type==='ambassadors'">
<label>{{'builder.enhance.template'|transloco}}<select data-listing-template [ngModel]="data.design?.template||''" (ngModelChange)="setDesign({template:$event||undefined})"><option value="">{{'builder.enhance.inherit'|transloco}}</option><option *ngFor="let t of ['clean','soft','outlined']" [value]="t">{{('builder.enhance.'+t)|transloco}}</option></select></label>
<label>{{'builder.enhance.presentation'|transloco}}<select [ngModel]="presentation" (ngModelChange)="setPresentation($event)"><option value="">{{'builder.enhance.inherit'|transloco}}</option><option value="cards">{{'builder.enhance.cards'|transloco}}</option><option value="list">{{'builder.enhance.list'|transloco}}</option></select></label>
<label *ngIf="presentation!=='list'">{{'builder.enhance.columns'|transloco}}<select data-listing-columns [ngModel]="data.design?.columns||''" (ngModelChange)="setDesign({columns:$event?+$event:undefined})"><option value="">{{'builder.enhance.inherit'|transloco}}</option><option *ngFor="let n of [1,2,3,4]" [value]="n">{{n}}</option></select></label>
<label *ngIf="block.type==='donors'"><input type="checkbox" data-show-donor-search [ngModel]="!!data.design?.showSearch" (ngModelChange)="setDesign({showSearch:$event})">{{'builder.enhance.searchDonors'|transloco}}</label>
<label><input type="checkbox" [ngModel]="!!data.design?.compactControls" (ngModelChange)="setDesign({compactControls:$event})">{{'builder.enhance.compactControls'|transloco}}</label>
<details><summary>{{'builder.enhance.advanced'|transloco}}</summary>
<label *ngFor="let field of ['gap','padding','radius','borderWidth']">{{('builder.enhance.'+field)|transloco}}<input type="range" min="0" [max]="field==='borderWidth'?8:48" [ngModel]="data.design?.[field]??12" (ngModelChange)="setDesignField(field,+$event)"></label>
<app-color-picker *ngFor="let field of ['background','borderColor','sectionBackground']" [value]="data.design?.[field]||'#ffffff'" [label]="('builder.enhance.'+field)|transloco" (valueChange)="setDesignField(field,$event)"/>
<label><input type="checkbox" [ngModel]="!!data.design?.shadow" (ngModelChange)="setDesign({shadow:$event})">{{'builder.enhance.shadow'|transloco}}</label>
<app-text-role-editor *ngFor="let role of listingRoles" [roleLabel]="('builder.enhance.'+role)|transloco" [override]="data.textStyles?.[role]" (overrideChange)="setRole(role,$event)" />
<button type="button" (click)="patch({design:undefined})">{{'builder.enhance.inherit'|transloco}}</button></details>
<details *ngIf="block.type==='ambassadors'" data-join-cta><summary>{{'builder.enhance.joinCta'|transloco}}</summary>
<label>{{'builder.enhance.label'|transloco}}<input data-join-label [ngModel]="data.joinCta?.label" (ngModelChange)="setJoin({label:$event})"></label>
<app-color-picker [value]="data.joinCta?.background||'#6236ed'" [label]="'builder.enhance.background'|transloco" (valueChange)="setJoin({background:$event})"/>
<app-color-picker [value]="data.joinCta?.color||'#ffffff'" [label]="'builder.enhance.textColor'|transloco" (valueChange)="setJoin({color:$event})"/>
<label>{{'builder.enhance.radius'|transloco}}<input type="range" min="0" max="40" [ngModel]="data.joinCta?.radius??12" (ngModelChange)="setJoin({radius:+$event})"></label>
<label>{{'builder.enhance.size'|transloco}}<select [ngModel]="data.joinCta?.size||'md'" (ngModelChange)="setJoin({size:$event})"><option *ngFor="let n of ['sm','md','lg']" [value]="n">{{n}}</option></select></label>
<app-text-role-editor [roleLabel]="'builder.enhance.typography'|transloco" [override]="data.joinCta?.textStyle" (overrideChange)="setJoin({textStyle:$event})"/></details>
</ng-container>
<ng-container *ngIf="block.type==='progress'">
<label>{{'builder.enhance.label'|transloco}}<input data-progress-label [ngModel]="data.label" (ngModelChange)="patch({label:$event})"></label>
<label>{{'builder.enhance.percent'|transloco}}<select data-percent-position [ngModel]="data.percentPosition||'inside'" (ngModelChange)="patch({percentPosition:$event})"><option *ngFor="let p of ['inside','above','hidden']" [value]="p">{{('builder.enhance.'+p)|transloco}}</option></select></label>
<app-color-picker [value]="data.fill||'#6236ed'" [label]="'builder.enhance.fill'|transloco" (valueChange)="patch({fill:$event})" />
<label>{{'builder.enhance.height'|transloco}}<input data-progress-height type="range" [min]="(data.percentPosition||'inside')==='inside'?16:8" max="64" [ngModel]="data.height??16" (ngModelChange)="patch({height:+$event})"></label>
<details><summary>{{'builder.enhance.advanced'|transloco}}</summary>
<app-color-picker [value]="data.track||'#e2e8f0'" [label]="'builder.enhance.track'|transloco" (valueChange)="patch({track:$event})" />
<app-color-picker [value]="data.color||'#ffffff'" [label]="'builder.enhance.textColor'|transloco" (valueChange)="patch({color:$event})" />
<app-text-role-editor [roleLabel]="'builder.enhance.typography'|transloco" [override]="data.textStyle" (overrideChange)="patch({textStyle:$event})" />
<label>{{'builder.enhance.radius'|transloco}}<input type="number" min="0" max="32" [ngModel]="data.radius??8" (ngModelChange)="patch({radius:bounded($event,0,32)})"></label>
<label><input type="checkbox" data-progress-animation [ngModel]="!!data.animate" (ngModelChange)="patch({animate:$event})">{{'builder.enhance.animation'|transloco}}</label>
<ng-container *ngIf="data.animate"><label>{{'builder.enhance.duration'|transloco}}<input type="number" min="200" max="5000" [ngModel]="data.duration??900" (ngModelChange)="patch({duration:bounded($event,200,5000)})"></label><label>{{'builder.enhance.easing'|transloco}}<select [ngModel]="data.easing||'ease-out'" (ngModelChange)="patch({easing:$event})"><option value="ease-out">{{'builder.enhance.easeOut'|transloco}}</option><option value="linear">{{'builder.enhance.linear'|transloco}}</option></select></label></ng-container>
</details></ng-container>
<ng-container *ngIf="block.type==='contact'">
<label>{{'builder.enhance.title'|transloco}}<input [ngModel]="data.title" (ngModelChange)="patch({title:$event})"></label><label>{{'builder.enhance.description'|transloco}}<textarea [ngModel]="data.text" (ngModelChange)="patch({text:$event})"></textarea></label>
<label *ngFor="let field of contactFields">{{('builder.enhance.'+field)|transloco}}<input [attr.data-contact-field]="field" [ngModel]="data[field]" (ngModelChange)="patchField(field,$event)"></label>
<label>{{'builder.enhance.template'|transloco}}<select [ngModel]="data.template||'columns'" (ngModelChange)="patch({template:$event})"><option *ngFor="let t of ['columns','centered','compact']" [value]="t">{{('builder.enhance.'+t)|transloco}}</option></select></label>
<p class="hint">{{'builder.enhance.contactLinksOnly'|transloco}}</p>
<details><summary>{{'builder.enhance.advanced'|transloco}}</summary><app-color-picker [value]="data.background||'#ffffff'" [label]="'builder.enhance.background'|transloco" (valueChange)="patch({background:$event})"/><app-text-role-editor [roleLabel]="'builder.enhance.typography'|transloco" [override]="data.textStyle" (overrideChange)="patch({textStyle:$event})" /></details>
</ng-container>
</section>`, styles: [`.enhancements{display:grid;gap:12px;padding:12px 0}label{display:grid;gap:6px;font-size:13px}label:has(input[type=checkbox]){display:flex;align-items:center}select,input:not([type=checkbox]),textarea{box-sizing:border-box;max-inline-size:100%;inline-size:100%;border:1px solid #dbe3ef;border-radius:8px;padding:8px;font:inherit}details{border-block-end:1px solid #edf0f7;padding-block:8px}details[open]{display:grid;gap:10px}summary{cursor:pointer;font-weight:600;padding-block:4px}.actions{display:flex;gap:8px}button{font:inherit;border:1px solid #ddd6fe;background:#faf8ff;border-radius:8px;padding:6px 10px;color:#4c1d95;cursor:pointer}button:disabled{opacity:.4;cursor:default}.hint{font-size:12px;color:#64748b;margin:4px 0}`] })
export class CampaignEnhancementsEditorComponent {
    @Input({ required: true })
    block!: CampaignBlock;
    private state = inject(CampaignStudioStateService);
    private ui = inject(StudioUiService);
    scope: 'desktop' | 'mobile' | null = null;
    get placements():BlockPlacement[]{return this.block.type==='hero'?['content','above-header','below-header']:['content','above-header','below-header','above-hero','in-hero','below-hero'];}
    readonly contactFields = ['email', 'phone', 'whatsapp', 'website'];
    get presentation() { return (this.state.draft.layout.sectionPresentation as any)?.[this.block.type] ?? ''; }
    setPresentation(value: string) { const sectionPresentation = { ...this.state.draft.layout.sectionPresentation }; if (value)
        (sectionPresentation as any)[this.block.type] = value;
    else
        delete (sectionPresentation as any)[this.block.type]; this.state.patch({ layout: { ...this.state.draft.layout, sectionPresentation } }); }
    get listingRoles() { return this.block.type === 'donors' ? ['donorName', 'donorAmount', 'donorMeta'] : ['ambassadorName', 'raisedAmount', 'donorCount', 'secondaryMeta']; }
    setDesign(value: Record<string, unknown>) { this.patch({ design: { ...this.data.design, ...value } }); }
    setDesignField(field: string, value: unknown) { this.setDesign({ [field]: value }); }
    setRole(role: string, value: unknown) { this.patch({ textStyles: { ...this.data.textStyles, [role]: value } }); }
    setJoin(value: Record<string, unknown>) { this.patch({ joinCta: { ...this.data.joinCta, ...value } }); }
    setDevice(value:'desktop'|'mobile'){this.scope=value;this.ui.setDevice(value);}
    get data(): any { return this.block.data; }
    get device() { return this.scope ?? this.ui.device; }
    get placement() { return blockPlacement(this.block, this.device === 'mobile'); }
    patch(data: Record<string, unknown>) { this.state.updateBlockData(this.block.id, { ...this.block.data, ...data } as any); }
    patchField(field: string, value: unknown) { this.patch({ [field]: value }); }
    bounded(n: number, min: number, max: number) { return Math.max(min, Math.min(max, Number(n) || min)); }
    setComposition(value: Record<string, unknown>) { this.state.patch({ blocks: this.state.draft.blocks.map(b => b.id === this.block.id ? { ...b, responsive: { ...b.responsive, [this.device]: { ...b.responsive?.[this.device], ...value } } } : b) }); }
    resetComposition() { const responsive = { ...this.block.responsive }; delete responsive[this.device]; this.state.patch({ blocks: this.state.draft.blocks.map(b => b.id === this.block.id ? { ...b, responsive } : b) }); }
    private parent(id: string) { return this.state.draft.blocks.find(b => ['container', 'tabs', 'accordion'].includes(b.type) && (b.data as any).childBlockIds?.includes(id))?.id; }
    get peers() { const mobile = this.device === 'mobile', parent = this.parent(this.block.id); return this.state.draft.blocks.filter(b => b.visible && blockPlacement(b, mobile) === this.placement && (this.placement !== 'content' || this.parent(b.id) === parent)).sort((a, b) => blockOrder(a, mobile) - blockOrder(b, mobile)); }
    get atFirst() { return this.peers[0]?.id === this.block.id; }
    get atLast() { return this.peers.at(-1)?.id === this.block.id; }
    move(step: number) { const list = this.peers, at = list.findIndex(b => b.id === this.block.id), to = at + step; if (at < 0 || to < 0 || to >= list.length)
        return; [list[at], list[to]] = [list[to], list[at]]; const order = new Map(list.map((b, i) => [b.id, i + 1])); this.state.patch({ blocks: this.state.draft.blocks.map(b => order.has(b.id) ? { ...b, responsive: { ...b.responsive, [this.device]: { ...b.responsive?.[this.device], order: order.get(b.id)! } } } : b) }); }
}
