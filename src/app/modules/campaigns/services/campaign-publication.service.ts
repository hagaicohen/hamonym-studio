import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EntitiesService } from '../../../core/services/entities.service';
import { CurrentContextService } from '../../../core/services/current-context.service';
import { CampaignApiService } from './campaign-api.service';
import { CampaignDraft } from './campaign-studio-state.service';
import { publishEntityApproved, publishMissingFields } from '../builder/steps/campaign-publish-step/publish-readiness';
import { validCampaignSlug } from '../simple-studio/studio-slug';
import { parseIsoDate } from '../simple-studio/vendor-v462/management/management-model.service';
import type { PublicationCheck } from '../simple-studio/vendor-v462/management/pages/publication-checks.component';

const UNSAVED_PREFIX = 'hamonym-studio-unsaved:';

/** Shared Studio/list readiness and the existing server publication command. */
@Injectable({ providedIn: 'root' })
export class CampaignPublicationService {
  private readonly api = inject(CampaignApiService);
  private readonly entities = inject(EntitiesService);
  private readonly context = inject(CurrentContextService);
  private readonly router = inject(Router);
  private readonly localRevision = signal(0);
  constructor() {
    const changed = (event: StorageEvent) => { if (!event.key || event.key.startsWith(UNSAVED_PREFIX)) this.localRevision.update(value => value + 1); };
    window.addEventListener('storage', changed);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', changed));
  }

  setUnsaved(id: string | undefined, dirty: boolean): void {
    if (!id) return;
    try {
      const key = UNSAVED_PREFIX + id;
      if ((localStorage.getItem(key) === '1') === dirty) return;
      if (dirty) localStorage.setItem(key, '1'); else localStorage.removeItem(key);
      this.localRevision.update(value => value + 1);
    } catch { /* Storage restrictions do not change backend authorization. */ }
  }
  private unsaved(id?: string): boolean {
    this.localRevision();
    try { return !!id && localStorage.getItem(UNSAVED_PREFIX + id) === '1'; } catch { return false; }
  }
  canManage(draft: CampaignDraft): boolean {
    const active = this.context.active();
    return active?.role === 'entity-manager' && active.context?.id === draft.entityId;
  }
  checks(draft: CampaignDraft, entity: { status?: string } | null, authorized = this.canManage(draft)): PublicationCheck[] {
    const saved = !!draft.id && !this.unsaved(draft.id);
    const missing = publishMissingFields(draft);
    const fields: [string, string, string, PublicationCheck['action']][] = [
      ['title', 'שם הקמפיין', 'יש לתת שם לקמפיין ולשמור אותו.', 'settings'],
      ['slug', 'כתובת הקמפיין', 'יש לבחור כתובת תקינה ופנויה בפרטי הקמפיין ולשמור אותה.', 'identity'],
      ['hero', 'תמונת פתיחה או סרטון', 'יש לבחור תמונת פתיחה או סרטון ולשמור בשרת.', 'save'],
      ['target', 'יעד גיוס חיובי', 'יש להגדיר יעד גיוס גדול מאפס ולשמור בשרת.', 'save'],
      ['dates', 'תאריכי הקמפיין', 'יש לבחור תאריך התחלה; תאריך הסיום אינו יכול להיות לפניו.', 'settings'],
    ];
    return [
      { id: 'saved', label: 'טיוטה שמורה בשרת', required: true, complete: saved, detail: saved ? 'השינויים נשמרו בשרת.' : 'יש שינויים לא שמורים ב־Studio. יש לשמור או לבטל אותם לפני הפרסום.', action: 'save' },
      ...fields.map(([id, label, detail, action]) => {
        const complete = !!draft.id && !missing.includes(`studio.missing.${id}`) && (id !== 'slug' || validCampaignSlug(draft.slug)) && (id !== 'dates' || !!parseIsoDate(draft.startDate));
        return { id, label, detail: complete ? 'הנתון שנשמר בשרת עומד בתנאי הפרסום.' : detail, complete, required: true, action };
      }),
      { id: 'entity', label: 'אישור הארגון', required: true, complete: publishEntityApproved(entity), detail: publishEntityApproved(entity) ? 'הארגון פעיל לפי השרת.' : 'נדרש אישור הארגון לפני הפרסום.', action: 'organization' },
      { id: 'permission', label: 'הרשאת ניהול וקמפיין פתוח לעריכה', required: true, complete: authorized && draft.isLocked === false, detail: !authorized ? 'נדרשת הרשאת ניהול בארגון.' : draft.isLocked === true ? 'הקמפיין נעול. יש לפנות למנהל המערכת.' : draft.isLocked === false ? 'הרשאת הגישה מאומתת; השרת יבדוק אותה שוב בפרסום.' : 'לא התקבל אישור נעילה והרשאות מהשרת.' },
    ];
  }
  url(draft: CampaignDraft): string {
    return validCampaignSlug(draft.slug) ? new URL(this.router.serializeUrl(this.router.createUrlTree(['/campaigns', draft.slug])), document.baseURI).href : '';
  }
  async publish(id: string): Promise<CampaignDraft> {
    const draft = await firstValueFrom(this.api.getById(id));
    const entity = await firstValueFrom(this.entities.getEntityById(draft.entityId!));
    const blocker = this.checks(draft, entity).find(check => check.required && !check.complete);
    if (blocker) throw new Error(blocker.detail);
    if (draft.status === 'published') return draft;
    if (draft.status !== 'draft') throw new Error('הקמפיין אינו טיוטה הזמינה לפרסום.');
    if (!await firstValueFrom(this.api.checkSlugAvailable(draft.slug, draft.id))) throw new Error('כתובת הקמפיין כבר בשימוש. יש לתקן אותה בפרטי הקמפיין.');
    if (this.unsaved(id)) throw new Error('יש שינויים לא שמורים ב־Studio. יש לשמור אותם לפני הפרסום.');
    const result = await firstValueFrom(this.api.publish(id));
    if (result?.status !== 'published') throw new Error('השרת לא אישר את פרסום הקמפיין.');
    return { ...draft, status: result.status, publishedAt: result.published_at ?? draft.publishedAt };
  }
}
