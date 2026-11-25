import {UploadService} from '../../../../core/services/upload.service';
import { Component, inject } from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ColorPickerComponent} from '../../../../shared/ui/color-picker/color-picker.component';
import {TextRoleEditorComponent} from '../../../../shared/ui/text-role-editor/text-role-editor.component';
import { AsyncPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CampaignDraft, CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { AmountCardStyle, AmountButtonsStyle, PanoramicAmountStyle, MAX_SUGGESTED_AMOUNTS } from '../../utils/amount-buttons';

// The campaign's suggested-amount buttons: shape, size, spacing, columns and the
// amounts themselves (layout.amountButtons, campaign.suggestedAmounts). One editor
// for the page's donation widget and the minimal donation page, so Checkout V2,
// the widget and the minimal page always share one configuration.
@Component({
  selector: 'app-amount-buttons-editor',
  standalone: true,
  imports: [FormsModule, ColorPickerComponent, TextRoleEditorComponent, AsyncPipe, TranslocoPipe],
  templateUrl: './amount-buttons-editor.component.html',
  styleUrl: './amount-buttons-editor.component.css',
})
export class AmountButtonsEditorComponent {
  private upload=inject(UploadService);uploading=false;uploadError=false;
  uploadArtwork(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;const key=this.cardKey,language=this.state.contentLanguage,campaignId=this.state.draft.id;if(!key)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>10*1024*1024){this.uploadError=true;input.value='';return;}this.uploading=true;this.uploadError=false;this.upload.upload(file,'campaigns/blocks').subscribe({next:url=>{const d=this.state.draft;if(d.id===campaignId&&this.cards(d).some(c=>c.key===key)){const cards={...d.layout.amountButtons?.cards};cards[key]={...cards[key],...(language==='en'?{imageUrlByLanguage:{...cards[key]?.imageUrlByLanguage,en:url}}:{imageUrl:url}),mode:'artwork'};this.set({cards});}this.uploading=false;input.value='';},error:()=>{this.uploading=false;this.uploadError=true;input.value='';}});}
  cardImage(d:CampaignDraft){const c=this.selectedCard(d),own=c.imageUrlByLanguage?.[this.state.contentLanguage];return own===undefined?c.imageUrl:own;}
  setCardImage(value:string|undefined){if(this.state.contentLanguage==='en')this.setCard({imageUrlByLanguage:{...this.selectedCard(this.state.draft).imageUrlByLanguage,en:value??''}});else this.setCard({imageUrl:value});}
  setPanorama(patch:Partial<PanoramicAmountStyle>){this.set({panorama:{...this.state.draft.layout.amountButtons?.panorama,...patch}});}
  panoramaImage(d:CampaignDraft){const c=d.layout.amountButtons?.panorama;return c?.imageUrlByLanguage?.[this.state.contentLanguage]??c?.imageUrl;}
  removePanoramaImage(){const c=this.state.draft.layout.amountButtons?.panorama;if(this.state.contentLanguage==='en')this.setPanorama({imageUrlByLanguage:{...c?.imageUrlByLanguage,en:''}});else this.setPanorama({imageUrl:undefined});}
  uploadPanorama(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||this.uploading)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>10*1024*1024){this.uploadError=true;input.value='';return;}const campaignId=this.state.draft.id,language=this.state.contentLanguage;this.uploadError=false;this.uploading=true;this.upload.upload(file,'campaigns/blocks').subscribe({next:url=>{if(this.state.draft.id===campaignId){const c=this.state.draft.layout.amountButtons?.panorama;this.setPanorama(language==='en'?{imageUrlByLanguage:{...c?.imageUrlByLanguage,en:url},enabled:true}:{imageUrl:url,enabled:true});}this.uploading=false;input.value='';},error:()=>{this.uploading=false;this.uploadError=true;input.value='';}});}
  get cardKey(){return this.state.amountCardSelection;}set cardKey(value:string){this.state.amountCardSelection=value;}
  bounded(value:number){return Math.max(0,Math.min(48,Number(value)||0));}
  cards(d:CampaignDraft){return [...d.suggestedAmounts.map(a=>({key:'once:'+a,label:a,frequency:'once'})),...d.monthlyAmounts.map(a=>({key:'monthly:'+a,label:a,frequency:'monthly'}))];}
  selectedCard(d:CampaignDraft):AmountCardStyle{return d.layout.amountButtons?.cards?.[this.cardKey]??{};}
  setCard(value:Partial<AmountCardStyle>){if(!this.cardKey)return;const cards={...this.state.draft.layout.amountButtons?.cards};cards[this.cardKey]={...cards[this.cardKey],...value};this.set({cards});}
  clearCard(){const cards={...this.state.draft.layout.amountButtons?.cards};delete cards[this.cardKey];this.set({cards:Object.keys(cards).length?cards:undefined});}
  private readonly state = inject(CampaignStudioStateService);
  readonly draft$ = this.state.draft$;
  readonly max = MAX_SUGGESTED_AMOUNTS;
  readonly columns = [2, 3, 4, 5, 6];
  readonly aligns = [
    { value: 'stretch', label: 'builder.amounts.alignStretch' },
    { value: 'right', label: 'builder.amounts.alignRight' },
    { value: 'center', label: 'builder.amounts.alignCenter' },
    { value: 'left', label: 'builder.amounts.alignLeft' },
  ] as const;
  readonly shapes = [
    { value: 'rect', label: 'builder.amounts.shapeRect' },
    { value: 'rounded', label: 'builder.amounts.shapeRounded' },
    { value: 'circle', label: 'builder.amounts.shapeCircle' },
  ] as const;
  readonly sizes = [
    { value: 'sm', label: 'builder.amounts.sizeSm' },
    { value: 'md', label: 'builder.amounts.sizeMd' },
    { value: 'lg', label: 'builder.amounts.sizeLg' },
  ] as const;

  styleOf(draft: CampaignDraft): AmountButtonsStyle { return draft.layout.amountButtons ?? {}; }

  set(patch: Partial<AmountButtonsStyle>): void {
    const layout = this.state.draft.layout;
    const next: Record<string, unknown> = { ...(layout.amountButtons ?? {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const updated = { ...layout };
    if (Object.keys(next).length) updated.amountButtons = next as AmountButtonsStyle; else delete updated.amountButtons;
    this.state.patch({ layout: updated });
  }

  // Same rules as the Donation settings: whole positive shekels, ascending, at most 8.
  private write(list: number[]): void {
    const clean = [...new Set(list.filter(n => Number.isFinite(n) && n > 0).map(n => Math.round(n)))].sort((a, b) => a - b).slice(0, this.max);
    this.state.patch({ suggestedAmounts: clean });
  }
  setAmount(index: number, value: string): void {
    const list = [...this.state.draft.suggestedAmounts];
    list[index] = Number(value);
    this.write(list);
  }
  removeAmount(index: number): void { this.write(this.state.draft.suggestedAmounts.filter((_, i) => i !== index)); }
  addAmount(): void {
    const list = this.state.draft.suggestedAmounts;
    const last = list.length ? list[list.length - 1] : 0;
    this.write([...list, last ? last * 2 : 50]);
  }
}
