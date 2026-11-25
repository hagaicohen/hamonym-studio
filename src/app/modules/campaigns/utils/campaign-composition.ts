import type { CampaignBlock } from '../services/campaign-studio-state.service';
export type BlockPlacement = 'content' | 'above-header' | 'below-header' | 'above-hero' | 'below-hero' | 'in-hero';
export interface DeviceComposition {
 splitPercent?:number;
 sectionStyle?:Partial<import('../../../shared/models/style-role.model').SurfaceStyle>;
    placement?: BlockPlacement;
    order?: number;
}
export interface FundraisingSummaryConfig {
 preset?:'classic'|'animated'|'minimal';heading?:string;targetLabel?:string;
 showHeading?:boolean;showAmount?:boolean;showTarget?:boolean;showTrack?:boolean;showBadge?:boolean;
 animateTrack?:boolean;animateAmount?:boolean;animatePercent?:boolean;duration?:number;easing?:'linear'|'ease-out';reanimate?:boolean;
 fill?:string;track?:string;height?:number;radius?:number;badgeSize?:number;badgeColor?:string;badgeTextColor?:string;badgeBorder?:string;badgeShadow?:boolean;
 align?:'start'|'center'|'end';order?:('heading'|'amount'|'target'|'track')[];styles?:Partial<Record<'heading'|'amount'|'target'|'percent',Partial<import('../../../shared/models/text-style.model').TextStyle>>>;
}
export interface ProgressConfig {
 summary?:FundraisingSummaryConfig;animateFill?:boolean;countPercent?:boolean;badge?:{size?:number;background?:string;color?:string;border?:string;shadow?:boolean};
    label?: string;
    percentPosition?: 'inside' | 'above' | 'hidden';
    fill?: string;
    track?: string;
    color?: string;
    height?: number;
    radius?: number;
    animate?: boolean;
    duration?: number;
    easing?: 'linear' | 'ease-out';
    textStyle?: Partial<import('../../../shared/models/text-style.model').TextStyle>;
}
export interface ContactConfig {
    title?: string;
    text?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    website?: string;
    template?: 'columns' | 'centered' | 'compact';
    background?: string;
    color?: string;
    gap?: number;
    padding?: number;
    textStyle?: Partial<import('../../../shared/models/text-style.model').TextStyle>;
}
export function blockPlacement(block: CampaignBlock, mobile: boolean): BlockPlacement { const placement=block.responsive?.[mobile ? 'mobile' : 'desktop']?.placement ?? block.placement ?? 'content';return block.type==='hero'&&(placement==='above-hero'||placement==='below-hero'||placement==='in-hero')?'below-header':placement; }
export function blockOrder(block: CampaignBlock, mobile: boolean): number { return block.responsive?.[mobile ? 'mobile' : 'desktop']?.order ?? block.order; }

export interface NavigationPresentation{mode?:'horizontal'|'dropdown'|'hamburger'|'icons';behavior?:'normal'|'sticky'|'floating'|'auto-hide';align?:'start'|'center'|'end';background?:string;color?:string;opacity?:number;padding?:number;radius?:number;shadow?:boolean;textStyle?:Partial<import('../../../shared/models/text-style.model').TextStyle>;}
export interface NavigationConfig{desktop?:NavigationPresentation;mobile?:NavigationPresentation;}
