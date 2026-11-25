import {Component,Input,inject} from '@angular/core';
import {CommonModule} from '@angular/common';import {FormsModule} from '@angular/forms';import {TranslocoPipe} from '@jsverse/transloco';
import {ColorPickerComponent} from '../../../../shared/ui/color-picker/color-picker.component';import {TextRoleEditorComponent} from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import {CampaignBlock,CampaignStudioStateService} from '../../services/campaign-studio-state.service';import {FundraisingSummaryConfig} from '../../utils/campaign-composition';
@Component({selector:'app-fundraising-summary-editor',standalone:true,imports:[CommonModule,FormsModule,TranslocoPipe,ColorPickerComponent,TextRoleEditorComponent],templateUrl:'./fundraising-summary-editor.component.html',styles:[`:host{display:block}.summary-controls{display:grid;gap:14px}label{display:grid;gap:6px;font-size:12px;color:#475569}input:not([type=checkbox]):not([type=range]),select{width:100%;min-height:36px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:white;box-sizing:border-box;font:inherit}.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.presets button{padding:10px 4px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:10px;cursor:pointer}.presets button[aria-pressed=true]{border-color:#9b85d7;background:#f7f4fd;color:#5b3ec8}.miniature{display:block;position:relative;height:34px;background:linear-gradient(#e5dff2,#e5dff2) center 6px/35% 4px no-repeat,linear-gradient(#9b85d7,#9b85d7) center 16px/60% 6px no-repeat,linear-gradient(#eee9f6,#eee9f6) center 30px/85% 3px no-repeat}.miniature[data-preset=animated]::after{content:'';position:absolute;bottom:-1px;left:28%;width:12px;height:12px;border-radius:50%;background:#9b85d7}.miniature[data-preset=minimal]{background:linear-gradient(#9b85d7,#9b85d7) center 12px/50% 5px no-repeat,linear-gradient(#eee9f6,#eee9f6) center 24px/85% 2px no-repeat}.visibility{display:grid;grid-template-columns:1fr 1fr;gap:8px}.visibility label{display:flex;align-items:center;gap:6px}.reorder{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9}.reorder button{border:1px solid #e2e8f0;border-radius:5px;background:white;padding:4px 10px;cursor:pointer}.hint{font-size:11px;color:#94a3b8;line-height:1.6}button:focus-visible{outline:2px solid #9b85d7;outline-offset:2px}`]})
export class FundraisingSummaryEditorComponent{
 @Input({required:true})block!:CampaignBlock;@Input()tab='content';readonly state=inject(CampaignStudioStateService);readonly presets=['classic','animated','minimal'];readonly visibility=['Heading','Amount','Target','Track','Badge'];
 get config():FundraisingSummaryConfig{return (this.block.data as any).summary??{};}
 get part(){const selected=this.state.summarySelection();return selected?.blockId===this.block.id&&['heading','amount','target','percent'].includes(selected.part)?selected.part:'heading';}
 set part(value:string){this.state.summarySelection.set({blockId:this.block.id,part:value});}
 get style(){return this.config.styles?.[this.part as keyof NonNullable<FundraisingSummaryConfig['styles']>];}
 patch(patch:Partial<FundraisingSummaryConfig>){this.state.updateBlockData(this.block.id,{...this.block.data,summary:{...this.config,...patch}} as any);}
 preset(value:any){this.patch({preset:value,animateTrack:value==='animated',showBadge:value==='animated'});}
 show(name:string){return (this.config as any)['show'+name]!==false;}
 setOption(key:string,value:unknown){this.patch({[key]:value});}
 setShow(name:string,value:boolean){this.patch({['show'+name]:value});}
 setStyle(value:any){this.patch({styles:{...this.config.styles,[this.part]:value}});}
 get order(){return this.config.order??['heading','amount','target','track'];}
 move(index:number,step:number){const order=[...this.order],at=index+step;if(at<0||at>=order.length)return;[order[index],order[at]]=[order[at],order[index]];this.patch({order});}
 preview(){this.state.summaryPreview.set({blockId:this.block.id,token:this.state.summaryPreview().token+1});}
}
