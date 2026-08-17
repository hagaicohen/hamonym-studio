import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CampaignDraft } from './campaign-studio-state.service';

export interface DiscoverCampaign {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  category: string | null;
  cover_image_url: string | null;
  video_url: string | null;
  current_amount: string | number;
  target_amount: string | number;
  supporters_count: number;
  end_date: string | null;
  created_at: string;
  entity_name: string;
  entity_logo: string | null;
}

// pg v8 returns DATE columns as Date objects. Convert to YYYY-MM-DD using local time.
function toDateStr(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
      campaign_lifecycle:       draft.campaignLifecycle       || 'one-time',
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
      show_logo:                draft.showLogo,
      campaign_logo_url:        draft.campaignLogoUrl    || null,
      hero_logo_position:       draft.heroLogoPosition   || 'left',
      show_hero_title:          draft.showHeroTitle,
      show_hero_subtitle:       draft.showHeroSubtitle,
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
      recurring_billing_mode:        draft.recurringBillingMode        || 'until_cancelled',
      recurring_installments_count:  draft.recurringInstallmentsCount  || 12,
      // Wire keys stay 'rewards'/'rewards_enabled' — already persisted under
      // those names for every existing campaign; only the frontend-facing
      // name changed (CampaignReward → Offering).
      rewards_enabled:          draft.offeringsEnabled,
      rewards:                  draft.offerings,
      // Registration Options — a real table server-side (registration_options),
      // not an opaque JSON column. See DECISIONS.md (2026-07-16).
      registration_field_label: draft.registrationFieldLabel,
      registration_field_icon:  draft.registrationFieldIcon,
      registration_options:     draft.registrationOptions,
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
      isHidden:                data.is_hidden ?? false,
      currentAmount:           parseFloat(data.current_amount)  || 0,
      supportersCount:         parseInt(data.supporters_count)  || 0,
      createdAt:               data.created_at,
      updatedAt:               data.updated_at,
      publishedAt:             data.published_at,
      entityGaMeasurementId:   data.entity_ga_measurement_id ?? null,
      entityName:              data.entity_name,
      entityLogo:              data.entity_logo ?? null,
      // The backend backfills this exact placeholder on first save so a
      // title-less draft never blocks saving mid-edit (campaigns.service.js's
      // DEFAULT_TITLE) — showing it back in the title field/checklist as if
      // the manager had typed a real title was confusing (and could get
      // silently published as the literal, permanent campaign title if
      // nobody noticed). Strip it back to empty on load. See DECISIONS.md
      // (2026-07-17).
      title:                   (data.title === 'קמפיין ללא כותרת' ? '' : data.title) ?? '',
      slug:                    data.slug                    ?? '',
      shortDescription:        data.short_description       ?? '',
      campaignLifecycle:       data.campaign_lifecycle      ?? 'one-time',
      fundingType:             data.funding_type            ?? 'flexible',
      category:                data.category                ?? '',
      managerName:             data.manager_name            ?? '',
      targetAmount:            parseFloat(data.target_amount) || 0,
      startDate:               toDateStr(data.start_date),
      endDate:                 toDateStr(data.end_date),
      logoPlacement:           data.logo_placement          ?? 'overlay',
      logoStripAlign:          data.logo_strip_align        ?? 'center',
      logoStripBg:             data.logo_strip_bg           ?? '#ffffff',
      showEntityName:          data.show_entity_name        ?? true,
      showLogo:                data.show_logo               ?? true,
      campaignLogoUrl:         data.campaign_logo_url       ?? null,
      heroLogoPosition:        data.hero_logo_position      ?? 'left',
      showHeroTitle:           data.show_hero_title         ?? true,
      showHeroSubtitle:        data.show_hero_subtitle      ?? true,
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
      recurringBillingMode:        data.recurring_billing_mode       ?? 'until_cancelled',
      recurringInstallmentsCount:  data.recurring_installments_count ?? 12,
      donorFields: {
        showAddress:    data.donor_fields?.show_address    ?? true,
        showPostalCode: data.donor_fields?.show_postal_code ?? false,
        showIdNumber:   data.donor_fields?.show_id_number  ?? false,
      },
      offeringsEnabled:        data.rewards_enabled         ?? true,
      offerings:               data.rewards                 ?? [],
      registrationFieldLabel: data.registration_field_label ?? 'סוג משתתף',
      registrationFieldIcon:  data.registration_field_icon  ?? '👤',
      registrationOptions:    (data.registration_options ?? []).map((o: any) => ({
        id:          o.id,
        key:         o.key         ?? '',
        title:       o.title       ?? '',
        description: o.description ?? '',
        price:       parseFloat(o.price) || 0,
      })),
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
        // Backward-compat source: the legacy flat show_hero_title/
        // show_hero_subtitle columns, converted once here. See
        // CampaignLayout's doc comment (campaign-studio-state.service.ts).
        heroTitlePosition:    data.layout?.heroTitlePosition    ?? (data.show_hero_title    === false ? 'hidden' : 'hero'),
        heroSubtitlePosition: data.layout?.heroSubtitlePosition ?? (data.show_hero_subtitle === false ? 'hidden' : 'hero'),
        // Brand-new field, no legacy source — every existing campaign just
        // loads with it empty (renders nothing extra).
        projectDescription:   data.layout?.projectDescription   ?? '',
        projectDescriptionPosition: data.layout?.projectDescriptionPosition ?? 'below',
        // A campaign whose stored layout predates theme support (or was
        // created outside the normal preset/template flow, which is the
        // only place that populates this) would otherwise load with
        // layout.theme === undefined. Every `draft.layout.theme.X` read in
        // campaign-preview/page-builder templates is unguarded (no `?.`) —
        // one throws mid-render, which aborts that change-detection pass
        // app-wide, silently leaving whatever the app-loader overlay was
        // doing at that moment (visible or not) stuck forever. See
        // docs/DECISIONS.md.
        theme: {
          primaryColor:   '#333333',
          secondaryColor: '#6fc9eb',
          accentColor:    '#cc350f',
          bodyTextColor:  '#334155',
          logoBg:         '#ffffff',
          topStripBg:     '#061b3a',
          rewardsBg:              '#014737',
          rewardCardBorder:       'rgba(255,255,255,.12)',
          rewardCardBorderActive: '#7DD3FC',
          lineColor:      '#e2e8f0',
          ...(data.layout?.theme ?? {}),
        },
      } as any,
    };
  }

  list(entityId?: string): Observable<CampaignDraft[]> {
    const params: Record<string, string> = entityId ? { entityId } : {};
    return this.http.get<{ campaigns: any[] }>(`${this.apiUrl}/my`, {
      headers: this.headers(),
      params,
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

  advise(campaignId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${campaignId}/advise`, {}, {
      headers: this.headers(),
    });
  }

  // Generates a title/short-description candidate from the campaign's own
  // free-form content (rich-text blocks) — used only by the Publish step,
  // only when the dedicated field is empty. Either field is null when it
  // wasn't needed or there wasn't enough real content to generate one
  // confidently — never a guessed/generic filler. See DECISIONS.md.
  generateMetadata(campaignId: string): Observable<{ suggestedTitle: string | null; suggestedShortDescription: string | null }> {
    return this.http.post<{ suggestedTitle: string | null; suggestedShortDescription: string | null }>(
      `${this.apiUrl}/${campaignId}/generate-metadata`, {}, { headers: this.headers() },
    );
  }

  getBySlug(slug: string): Observable<CampaignDraft> {
    return this.http.get<any>(`${this.apiUrl}/slug/${slug}`, {
      headers: this.headers(),
    }).pipe(map(r => this.fromSnake(r)));
  }

  // Truly public — no auth header, only resolves published campaigns of active
  // entities. Use this for anonymous-visitor pages (the public campaign page,
  // donation flow); getBySlug() above is entity-owner-scoped and requires login.
  getBySlugPublic(slug: string): Observable<CampaignDraft> {
    return this.http.get<any>(`${this.apiUrl}/public/${slug}`)
      .pipe(map(r => this.fromSnake(r)));
  }

  discover(query: {
    search?: string;
    category?: string;
    sortBy?: string;
    page?: number;
    limit?: number;
  }): Observable<{ campaigns: DiscoverCampaign[]; total: number; page: number; limit: number }> {
    let params: Record<string, string> = {
      page: String(query.page ?? 0),
      limit: String(query.limit ?? 12),
    };
    if (query.search) params['search'] = query.search;
    if (query.category) params['category'] = query.category;
    if (query.sortBy) params['sortBy'] = query.sortBy;

    return this.http.get<{ campaigns: DiscoverCampaign[]; total: number; page: number; limit: number }>(
      `${this.apiUrl}/discover`,
      { params },
    );
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

  setVisibility(campaignId: string, isHidden: boolean): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/${campaignId}/visibility`,
      { is_hidden: isHidden },
      { headers: this.headers() },
    );
  }

  delete(campaignId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${campaignId}`, {
      headers: this.headers(),
    });
  }
}
