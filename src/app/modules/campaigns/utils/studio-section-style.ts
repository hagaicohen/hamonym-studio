import type {SurfaceStyle} from '../../../shared/models/style-role.model';import type {CampaignBlock,CampaignDraft} from '../services/campaign-studio-state.service';
export interface SectionEffect {preset?:'none'|'fade'|'slide'|'scale';duration?:number;hover?:'none'|'lift';}
export type EditingScope='both'|'desktop'|'mobile';
export function sectionSurface(block:CampaignBlock,mobile:boolean):Partial<SurfaceStyle>{return {...block.sectionStyle,...block.responsive?.[mobile?'mobile':'desktop']?.sectionStyle};}
export function openingSurface(draft:CampaignDraft,mobile:boolean):Partial<SurfaceStyle>{return {...draft.layout.openingSurface,...draft.layout.openingResponsive?.[mobile?'mobile':'desktop']};}
export function boundedSize(value:number,min:number,max:number){return Math.max(min,Math.min(max,Math.round((Number(value)||min)/8)*8));}
export function publicImage(value:string|undefined):string|null{if(!value)return null;try{const u=new URL(value,location.origin);return ['https:','http:'].includes(u.protocol)?'url('+JSON.stringify(u.href)+')':null;}catch{return null;}}
