import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';
import {campaignLang} from '../../../core/i18n/content-language';

// Suggested-amount buttons, one look for the whole campaign (2026-11-08): the page's
// donation widget, Checkout V2 and the minimal donation page all render the same
// layout.amountButtons. Absent = each surface's own grid of rectangles, as before.
// Presentation only: the amounts, their selection and every payment value are
// untouched. Styles: src/styles/amount-buttons.css.
export interface AmountCardStyle {
 imageUrlByLanguage?:Partial<Record<'he'|'en',string>>;
 mode?:'artwork'|'layered';imageFit?:'cover'|'contain';imagePosition?:string;aspectRatio?:'1 / 1'|'3 / 4'|'4 / 3'|'16 / 9';accessibleDescription?:string;
 overlayColor?:string;overlayOpacity?:number;contentAlign?:'start'|'center'|'end';decoration?:'none'|'pill'|'seal';
 title?:string;description?:string;imageUrl?:string;background?:string;color?:string;
 borderColor?:string;radius?:number;padding?:number;textStyle?:Partial<import('../../../shared/models/text-style.model').TextStyle>;
}
export interface PanoramicAmountStyle {
 enabled?:boolean;imageUrl?:string;imageUrlByLanguage?:Partial<Record<'he'|'en',string>>;
 zoom?:number;positionX?:number;positionY?:number;height?:number;
 mobile?:'scroll'|'wrap';overlayColor?:string;overlayOpacity?:number;textColor?:string;
}
export interface AmountButtonsStyle {
 panorama?:PanoramicAmountStyle;
 cards?:Partial<Record<string,AmountCardStyle>>;

  shape?: 'rect' | 'rounded' | 'circle';
  size?: 'sm' | 'md' | 'lg';
  gap?: number;      // px between buttons
  columns?: number;  // buttons per row at most; fewer when the space is narrower
  // Physical side (same on RTL and LTR pages). Unset/'stretch' = the full-width grid, as before.
  align?: 'right' | 'left' | 'center' | 'stretch';
}

export const MAX_SUGGESTED_AMOUNTS = 8;

// On the element that holds the amount buttons:
//   <div class="cv2-amounts" [hmAmountButtons]="draft.layout.amountButtons">
@Directive({
  selector: '[hmAmountButtons]',
  standalone: true,
  host: {
    '[class.hm-ab]': '!!style',
    '[class.hm-ab--rounded]': "style?.shape === 'rounded'",
    '[class.hm-ab--circle]': "style?.shape === 'circle'",
    '[class.hm-ab--sm]': "style?.size === 'sm'",
    '[class.hm-ab--lg]': "style?.size === 'lg'",
    '[class.hm-ab--cols]': '!!style?.columns',
    '[class.hm-ab--align]': "!!style?.align && style?.align !== 'stretch'",
    '[style.--hm-ab-justify]': "style?.align && style.align !== 'stretch' ? style.align : null",
    '[style.--hm-ab-cols]': 'style?.columns || null',
    '[style.--hm-ab-gap.px]': 'style?.gap ?? null',
    '[style.gap.px]': 'style?.gap ?? null',
  },
})
export class HmAmountButtonsDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input('hmAmountButtons') style: AmountButtonsStyle | null | undefined;
  private host=inject<ElementRef<HTMLElement>>(ElementRef);private zone=inject(NgZone);private language=campaignLang();private resize?:ResizeObserver;private mutation?:MutationObserver;private frame=0;private destroyed=false;private buttons=new Set<HTMLElement>();private image?:HTMLImageElement;private loadedUrl='';private failedUrl='';
  ngAfterViewInit(){this.zone.runOutsideAngular(()=>{this.resize=new ResizeObserver(()=>this.schedule());this.resize.observe(this.host.nativeElement);this.mutation=new MutationObserver(()=>this.schedule());this.mutation.observe(this.host.nativeElement,{childList:true});this.schedule();});}
  ngOnChanges(){this.schedule();}
  private schedule(){if(this.destroyed||this.frame)return;this.zone.runOutsideAngular(()=>{this.frame=requestAnimationFrame(()=>{this.frame=0;this.paint();});});}
  private imageUrl(){const c=this.style?.panorama;if(!c?.enabled)return '';const value=c.imageUrlByLanguage?.[this.language()]??c.imageUrl;if(!value)return '';try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}}
  private clear(){for(const b of this.buttons){for(const p of ['background-image','background-size','background-position','background-repeat'])b.style.removeProperty(p);}this.buttons.clear();}
  private paint(){const host=this.host.nativeElement,url=this.imageUrl(),c=this.style?.panorama;const enabled=!!url&&this.failedUrl!==url;host.classList.toggle('hm-ab--panorama',enabled);if(!enabled){this.clear();host.classList.remove('hm-ab--panorama-wrap');return;}
   if(this.loadedUrl!==url){this.loadedUrl=url;this.failedUrl='';if(this.image){this.image.onload=null;this.image.onerror=null;}const image=this.image=new Image();image.onload=()=>this.schedule();image.onerror=()=>{if(this.destroyed||this.loadedUrl!==url)return;this.failedUrl=url;this.schedule();};image.src=url;}
   host.classList.toggle('hm-ab--panorama-wrap',c?.mobile==='wrap'&&host.clientWidth<480);host.style.setProperty('--hm-panorama-gap',Math.max(0,Math.min(48,this.style?.gap??0))+'px');host.style.setProperty('--hm-panorama-height',Math.max(90,Math.min(320,c?.height??130))+'px');host.style.setProperty('--hm-panorama-color',c?.textColor||'#ffffff');host.style.setProperty('--hm-panorama-wash','color-mix(in srgb, '+(c?.overlayColor||'#0f172a')+' '+Math.max(0,Math.min(90,(c?.overlayOpacity??.3)*100))+'%, transparent)');
   this.clear();const buttons=Array.from(host.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.tagName==='BUTTON'&&!el.hidden);if(!buttons.length)return;host.style.setProperty('--hm-panorama-count',String(buttons.length));const rects=buttons.map(b=>b.getBoundingClientRect()),left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top)),width=Math.max(...rects.map(r=>r.right))-left,height=Math.max(...rects.map(r=>r.bottom))-top;
   const ratio=this.image?.naturalWidth&&this.image.naturalHeight?this.image.naturalWidth/this.image.naturalHeight:width/height,zoom=Math.max(1,Math.min(3,c?.zoom??1)),imageWidth=Math.max(width,height*ratio)*zoom,imageHeight=imageWidth/ratio,x=(width-imageWidth)*Math.max(0,Math.min(100,c?.positionX??50))/100,y=(height-imageHeight)*Math.max(0,Math.min(100,c?.positionY??50))/100;
   buttons.forEach((b,i)=>{b.style.backgroundImage='linear-gradient(var(--hm-panorama-wash),var(--hm-panorama-wash)),url('+JSON.stringify(url)+')';b.style.backgroundSize=imageWidth+'px '+imageHeight+'px';b.style.backgroundPosition=(x-(rects[i].left-left))+'px '+(y-(rects[i].top-top))+'px';b.style.backgroundRepeat='no-repeat';this.buttons.add(b);});
  }
  ngOnDestroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.resize?.disconnect();this.mutation?.disconnect();if(this.image){this.image.onload=null;this.image.onerror=null;}this.clear();}

}

export function isCircle(style: AmountButtonsStyle | null | undefined): boolean {
  return style?.shape === 'circle';
}
