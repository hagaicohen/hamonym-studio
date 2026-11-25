import {RichTextBlockEditorComponent} from '../../../builder/block-editors/rich-text-block-editor.component';
import {campaignBodyRoot} from '../../../utils/campaign-body-root';
import {CampaignNavigationEditorComponent} from '../../../builder/editors/campaign-navigation-editor.component';
import {FundraisingSummaryEditorComponent} from '../../../builder/editors/fundraising-summary-editor.component';
import {Component,EventEmitter,Input,Output,inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TranslocoPipe} from '@jsverse/transloco';
import {ColorPickerComponent} from '../../../../../shared/ui/color-picker/color-picker.component';
import {TextRoleEditorComponent} from '../../../../../shared/ui/text-role-editor/text-role-editor.component';
import {SurfaceStyle} from '../../../../../shared/models/style-role.model';
import {CampaignBlock,CampaignStudioStateService} from '../../../services/campaign-studio-state.service';
import {StudioUiService} from '../../services/studio-ui.service';
import {AmountButtonsEditorComponent} from '../../../builder/editors/amount-buttons-editor.component';
import {CampaignEnhancementsEditorComponent} from '../../../builder/editors/campaign-enhancements-editor.component';
import {blockOrder,blockPlacement,BlockPlacement} from '../../../utils/campaign-composition';
import {EditingScope,openingSurface,sectionSurface} from '../../../utils/studio-section-style';
export type InspectorTab='content'|'layout'|'design'|'effects';
@Component({selector:'app-studio-inspector',standalone:true,imports:[RichTextBlockEditorComponent,CampaignNavigationEditorComponent,FundraisingSummaryEditorComponent,CommonModule,FormsModule,TranslocoPipe,ColorPickerComponent,TextRoleEditorComponent,AmountButtonsEditorComponent,CampaignEnhancementsEditorComponent],templateUrl:'./studio-inspector.component.html',styleUrl:'./studio-inspector.component.css'})
export class StudioInspectorComponent{
 @Input()block:CampaignBlock|undefined;@Input()opening=false;@Input()tab:InspectorTab='content';@Output()tabChange=new EventEmitter<InspectorTab>();@Output()editText=new EventEmitter<void>();@Output()textAction=new EventEmitter<string>();
 readonly state=inject(CampaignStudioStateService);readonly ui=inject(StudioUiService);@Input() scope:EditingScope='both';@Output()scopeChange=new EventEmitter<EditingScope>();
 readonly math=Math;
 textMargin(field:string){return field==='marginBefore'?(this.surface.marginBefore??this.block?.spacingTop??0):(this.surface.marginAfter??this.block?.spacingBottom??0);}
 textRole='sectionTitle';
 get isSummary(){return this.block?.type==='progress'&&!!this.data['summary'];}
 get hasTextDesign(){if(this.isSummary)return false;return !!this.block&&['rich-text','donation-widget','progress','contact'].includes(this.block.type);}
 get textOverride(){return this.block?.type==='rich-text'?this.data['bodyStyle']:this.block?.type==='donation-widget'?this.data['textStyles']?.[this.textRole]:this.data['textStyle'];}
 setTextOverride(value:unknown){if(this.block?.type==='rich-text')this.patchData({bodyStyle:value});else if(this.block?.type==='donation-widget')this.patchData({textStyles:{...this.data['textStyles'],[this.textRole]:value}});else this.patchData({textStyle:value});}
 get containerSplit(){return this.scope==='both'?(this.data['splitPercent']??50):(this.block?.responsive?.[this.scope]?.splitPercent??this.data['splitPercent']??50);}
 setContainerSplit(value:number){if(!this.block)return;this.state.patch({blocks:this.state.draft.blocks.map(b=>{if(b.id!==this.block!.id)return b;const responsive={...b.responsive};if(this.scope==='both'){for(const d of ['desktop','mobile'] as const){if(responsive[d]){responsive[d]={...responsive[d]};delete responsive[d]!.splitPercent;}}return {...b,data:{...b.data,splitPercent:value},responsive};}return {...b,responsive:{...responsive,[this.scope]:{...responsive[this.scope],splitPercent:value}}};})});}
 setSpacing(field:'spacingTop'|'spacingBottom',value:number){this.setSurface(field==='spacingTop'?{marginBefore:value}:{marginAfter:value});}
 get tabs():InspectorTab[]{return this.block?.type==='rich-text'?['content','design','layout','effects']:['content','layout','design','effects'];}readonly positions:BlockPlacement[]=['above-header','above-hero','in-hero','below-hero','content'];
 readonly cardPresets=['cards','list','soft','outlined'];
 get showTextTitle(){if(this.data['showTitle']!==undefined)return this.data['showTitle']!==false;const parent=this.state.draft.blocks.find(b=>(b.data as any).childBlockIds?.includes(this.block?.id));return (!!this.block&&blockPlacement(this.block,this.ui.device==='mobile')!=='content')||!parent||!!(parent.data as any).bodyRole;}
 get data():Record<string,any>{return (this.block?.data??{}) as Record<string,any>;}
 setUniformPadding(padding:number){this.setSurface({padding,paddingTop:undefined,paddingBottom:undefined,paddingInlineStart:undefined,paddingInlineEnd:undefined});}
 mathWidth(value:number){return Math.max(160,Math.min(2400,Number(value)||760));}
 get isBodyRoot(){return !!this.block&&this.block.id===this.state.draft.layout.bodyRootId;}
 get bodyLayout(){return !!campaignBodyRoot(this.state.draft);}
 get openingSurfaceTarget(){return this.isOpening&&!(this.bodyLayout&&this.block?.type==='hero');}
 get isOpening(){return this.opening||this.block?.type==='hero';}
 get fieldNames():string[]{if(this.isSummary)return [];if(this.isOpening)return ['title','shortDescription'];const fields:Record<string,string[]>={'donation-widget':['title','subtitle','ctaLabel'],progress:['label'],contact:['title','text','email','phone','whatsapp','website'],image:['caption'],badge:['text','subtext'],cta:['title','text'],countdown:['title','expiredText']};return fields[this.block?.type??'']??[];}
 copy(field:string){return this.isOpening?(this.state.draft as any)[field]:this.data[field];}
 setCopy(field:string,value:string){if(this.isOpening)this.state.patch({[field]:value});else if(this.block)this.state.updateBlockData(this.block.id,{...this.block.data,[field]:value} as any);}
 get surface():Partial<SurfaceStyle>{const mobile=(this.scope==='both'?this.ui.device:this.scope)==='mobile';if(this.openingSurfaceTarget)return this.scope==='both'?(this.state.draft.layout.openingSurface??{}):openingSurface(this.state.draft,mobile);if(!this.block)return {};return this.scope==='both'?(this.block.sectionStyle??{}):sectionSurface(this.block,mobile);}
 private clean(value:Partial<SurfaceStyle>){const next={...value};for(const key of Object.keys(next) as (keyof SurfaceStyle)[])if(next[key]===undefined)delete next[key];return Object.keys(next).length?next:undefined;}
 setSurface(patch:Partial<SurfaceStyle>){
  const devices=this.scope==='both'?['desktop','mobile'] as const:[this.scope];
  if(this.openingSurfaceTarget){const layout={...this.state.draft.layout},responsive={...layout.openingResponsive};if(this.scope==='both')layout.openingSurface=this.clean({...layout.openingSurface,...patch});for(const d of devices){if(this.scope==='both'){const own={...responsive[d]};for(const key of Object.keys(patch) as (keyof SurfaceStyle)[])delete own[key];responsive[d]=this.clean(own);}else responsive[d]=this.clean({...responsive[d],...patch});}layout.openingResponsive=responsive;this.state.patch({layout});return;}
  if(!this.block)return;this.state.patch({blocks:this.state.draft.blocks.map(b=>{if(b.id!==this.block!.id)return b;const responsive={...b.responsive};for(const d of devices){const own={...responsive[d]?.sectionStyle};if(this.scope==='both'){for(const key of Object.keys(patch) as (keyof SurfaceStyle)[])delete own[key];}else Object.assign(own,patch);responsive[d]={...responsive[d],sectionStyle:this.clean(own)};}return {...b,sectionStyle:this.scope==='both'?this.clean({...b.sectionStyle,...patch}):b.sectionStyle,responsive};})});
 }
 resetSurface(){if(this.openingSurfaceTarget){const layout={...this.state.draft.layout},openingResponsive={...layout.openingResponsive};if(this.scope==='both'){layout.openingSurface=undefined;for(const d of ['desktop','mobile'] as const)delete openingResponsive[d];}else delete openingResponsive[this.scope];this.state.patch({layout:{...layout,openingResponsive}});return;}if(this.block)this.state.patch({blocks:this.state.draft.blocks.map(b=>{if(b.id!==this.block!.id)return b;const responsive={...b.responsive};for(const d of (this.scope==='both'?['desktop','mobile']:[this.scope]) as ('desktop'|'mobile')[]){if(responsive[d]){responsive[d]={...responsive[d]};delete responsive[d]!.sectionStyle;}}return {...b,sectionStyle:this.scope==='both'?undefined:b.sectionStyle,responsive};})});}
 setScope(value:EditingScope){this.scope=value;this.scopeChange.emit(value);if(value!=='both')this.ui.setDevice(value);}
 get hasOverrides(){return this.openingSurfaceTarget?!!this.state.draft.layout.openingResponsive?.[this.ui.device]:!!this.block?.responsive?.[this.ui.device]?.sectionStyle;}
 place(placement:BlockPlacement){if(!this.block)return;const devices=(this.scope==='both'?['desktop','mobile']:[this.scope]) as ('desktop'|'mobile')[];this.state.patch({blocks:this.state.draft.blocks.map(b=>{if(b.id!==this.block!.id)return b;const responsive={...b.responsive};for(const d of devices)responsive[d]={...responsive[d],placement};return {...b,responsive};})});}
 get placement(){return this.block?blockPlacement(this.block,this.ui.device==='mobile'):'content';}
 move(step:number){if(!this.block)return;const device=this.ui.device,blocks=this.state.draft.blocks,parent=blocks.find(b=>(b.data as any).childBlockIds?.includes(this.block!.id));const peers=blocks.filter(b=>b.visible&&blockPlacement(b,device==='mobile')===this.placement&&(parent?(parent.data as any).childBlockIds.includes(b.id):!blocks.some(p=>(p.data as any).childBlockIds?.includes(b.id)))).sort((a,b)=>blockOrder(a,device==='mobile')-blockOrder(b,device==='mobile'));const ids=peers.map(b=>b.id);if(step<0)this.state.moveBlockUpInScope(this.block.id,ids,device);else this.state.moveBlockDownInScope(this.block.id,ids,device);}
 get collection(){return !!this.block&&['donors','ambassadors','rewards','updates','sponsors'].includes(this.block.type);}
 preset(name:string){if(!this.block)return;const type=this.block.type;const sectionPresentation={...this.state.draft.layout.sectionPresentation,[type]:name==='list'?'list':'cards'};const blocks=this.state.draft.blocks.map(b=>{if(b.id!==this.block!.id||!['donors','ambassadors'].includes(type))return b;return {...b,data:{...b.data,design:{...(b.data as any).design,template:name==='list'?undefined:name==='cards'?'clean':name}}};});this.state.patch({layout:{...this.state.draft.layout,sectionPresentation},blocks});}
 setDecoration(value:string){this.patchData({design:{...this.data['design'],decoration:value}});}
 setWidgetProgress(visible:boolean){this.patchData({progress:{...this.data['progress'],visible}});}
 patchData(patch:Record<string,unknown>){if(this.block)this.state.updateBlockData(this.block.id,{...this.block.data,...patch} as any);}
 get effect(){return this.isOpening?this.state.draft.layout.openingEffect:this.block?.effect;}
 setEffect(patch:Record<string,unknown>){if(this.isOpening)this.state.patch({layout:{...this.state.draft.layout,openingEffect:{...this.effect,...patch}}});else if(this.block)this.state.patch({blocks:this.state.draft.blocks.map(b=>b.id===this.block!.id?{...b,effect:{...b.effect,...patch}}:b)});}
}
