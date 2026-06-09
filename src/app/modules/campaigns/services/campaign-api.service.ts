import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CampaignDraft } from './campaign-studio-state.service';

const DEFAULT_BLOCK_LABELS: Record<string, string> = {
  'rich-text':       'טקסט',
  'image':           'תמונה',
  'video':           'וידאו',
  'gallery':         'גלריה',
  'split':           'עמודות',
  'cta':             'קריאה לפעולה',
  'divider':         'מרווח',
  'container':       'מסגרת',
  'stats':           'פס נתונים',
  'donation-widget': 'תיבת תרומה',
  'rewards':         'תשורות',
  'sponsors':        'חסויות',
  'ambassadors':     'שגרירים',
  'donors':          'תורמים',
  'updates':         'עדכונים',
};

@Injectable({ providedIn: 'root' })
export class CampaignApiService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/campaigns`;

  private headers() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
  }

  // camelCase CampaignDraft → snake_case payload for backend
  private toSnake(draft: CampaignDraft, entityId?: string): Record<string, any> {
    const payload: Record<string, any> = {
      status:                   draft.status,
      slug:                     draft.slug,
      title:                    draft.title,
      short_description:        draft.shortDescription       || null,
      funding_type:             draft.fundingType,
      category:                 draft.category               || null,
      manager_name:             draft.managerName            || null,
      target_amount:            draft.targetAmount           || 0,
      start_date:               draft.startDate              || null,
      end_date:                 draft.endDate                || null,
      logo_placement:           draft.logoPlacement,
      logo_strip_align:         draft.logoStripAlign,
      logo_strip_bg:            draft.logoStripBg,
      show_entity_name:         draft.showEntityName,
      hero_type:                draft.heroType,
      hero_layout:              draft.heroLayout,
      hero_text_style:          draft.heroTextStyle,
      hero_cta_config:          draft.heroCtaConfig,
      hero_custom_html:         draft.heroCustomHtml,
      cover_image_url:          draft.coverImageUrl          || null,
      video_url:                draft.videoUrl               || '',
      enable_suggested_amounts: draft.enableSuggestedAmounts,
      allow_custom_amount:      draft.allowCustomAmount,
      allow_monthly_donation:   draft.allowMonthlyDonation,
      suggested_amounts:        draft.suggestedAmounts,
      monthly_amounts:          draft.monthlyAmounts,
      rewards_enabled:          draft.rewardsEnabled,
      rewards:                  draft.rewards,
      sponsors:                 draft.sponsors,
      ambassadors:              draft.ambassadors,
      updates:                  draft.updates,
      blocks:                   draft.blocks,
      layout:                   draft.layout,
    };
    if (entityId) payload['entity_id'] = entityId;
    return payload;
  }

  // snake_case backend response → camelCase CampaignDraft
  private fromSnake(data: any): CampaignDraft {
    return {
      id:                      data.id,
      entityId:                data.entity_id,
      status:                  data.status,
      currentAmount:           parseFloat(data.current_amount)  || 0,
      supportersCount:         parseInt(data.supporters_count)  || 0,
      createdAt:               data.created_at,
      updatedAt:               data.updated_at,
      publishedAt:             data.published_at,
      title:                   data.title                   ?? '',
      slug:                    data.slug                    ?? '',
      shortDescription:        data.short_description       ?? '',
      fundingType:             data.funding_type            ?? 'flexible',
      category:                data.category                ?? '',
      managerName:             data.manager_name            ?? '',
      targetAmount:            parseFloat(data.target_amount) || 0,
      startDate:               data.start_date              ?? '',
      endDate:                 data.end_date                ?? '',
      logoPlacement:           data.logo_placement          ?? 'overlay',
      logoStripAlign:          data.logo_strip_align        ?? 'center',
      logoStripBg:             data.logo_strip_bg           ?? '#ffffff',
      showEntityName:          data.show_entity_name        ?? true,
      heroType:                data.hero_type               ?? 'image',
      heroLayout:              data.hero_layout             ?? 'title-subtitle',
      heroTextStyle:           data.hero_text_style         ?? { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' },
      heroCtaConfig:           data.hero_cta_config         ?? { visible: false, label: 'תמכו עכשיו', color: '#06b6d4', align: 'center', icon: '' },
      heroCustomHtml:          data.hero_custom_html        ?? '',
      coverImageUrl:           data.cover_image_url         ?? null,
      videoUrl:                data.video_url               ?? '',
      enableSuggestedAmounts:  data.enable_suggested_amounts ?? true,
      allowCustomAmount:       data.allow_custom_amount     ?? true,
      allowMonthlyDonation:    data.allow_monthly_donation  ?? true,
      suggestedAmounts:        data.suggested_amounts       ?? [],
      monthlyAmounts:          data.monthly_amounts         ?? [],
      rewardsEnabled:          data.rewards_enabled         ?? true,
      rewards:                 data.rewards                 ?? [],
      sponsors:                data.sponsors                ?? [],
      ambassadors:             data.ambassadors             ?? [],
      updates:                 data.updates                 ?? [],
      blocks:                  (data.blocks ?? []).map((b: any) => ({
        ...b,
        label: b.label || DEFAULT_BLOCK_LABELS[b.type as string] || '',
      })),
      layout: {
        ...(data.layout ?? {}),
        layoutMode: data.layout?.layoutMode ?? 'standard',
      } as any,
    };
  }

  list(): Observable<CampaignDraft[]> {
    return this.http.get<{ campaigns: any[] }>(`${this.apiUrl}/my`, {
      headers: this.headers(),
    }).pipe(map(res => (res.campaigns ?? []).map(r => this.fromSnake(r))));
  }

  create(entityId: string, draft: CampaignDraft): Observable<CampaignDraft> {
    return this.http.post<any>(this.apiUrl, this.toSnake(draft, entityId), {
      headers: this.headers(),
    }).pipe(map(r => this.fromSnake(r)));
  }

  update(campaignId: string, draft: CampaignDraft): Observable<CampaignDraft> {
    return this.http.patch<any>(`${this.apiUrl}/${campaignId}`, this.toSnake(draft), {
      headers: this.headers(),
    }).pipe(map(r => this.fromSnake(r)));
  }

  getById(campaignId: string): Observable<CampaignDraft> {
    return this.http.get<any>(`${this.apiUrl}/${campaignId}`, {
      headers: this.headers(),
    }).pipe(map(r => this.fromSnake(r)));
  }

  getBySlug(slug: string): Observable<CampaignDraft> {
    return this.http.get<any>(`${this.apiUrl}/slug/${slug}`, {
      headers: this.headers(),
    }).pipe(map(r => this.fromSnake(r)));
  }

  checkSlugAvailable(slug: string, excludeId?: string): Observable<boolean> {
    const params: Record<string, string> = { slug };
    if (excludeId) params['excludeId'] = excludeId;
    return this.http.get<{ available: boolean }>(`${this.apiUrl}/check-slug`, {
      headers: this.headers(),
      params,
    }).pipe(map(r => r.available));
  }

  // No dedicated publish endpoint — update status via PATCH
  publish(campaignId: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${campaignId}`,
      { status: 'published' },
      { headers: this.headers() }
    );
  }

  delete(campaignId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${campaignId}`, {
      headers: this.headers(),
    });
  }
}
