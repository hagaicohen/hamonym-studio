import { Injectable, Injector, inject, signal } from '@angular/core';
import { EditorService } from '../core/editor.service';
import { CampaignStateService } from '../core/campaign-state.service';

export interface RaceHeat {
  title?: string; name?: string; distance?: string; price?: number | string; start?: string;
  capacity?: number; minAge?: number | null; status?: string; registered?: number;
  [key: string]: unknown;
}
export interface RaceParticipant { name: string; heat: number; age?: number | null; demo?: boolean; id?: string; }

interface RaceCampaign {
  management?: {
    campaignKind?: string;
    modules?: { races?: { items?: RaceHeat[] } };
    raceParticipants?: RaceParticipant[];
  };
}

type LegacyWindow = Window & {
};

export type AgeBucket = 'all' | 'young' | '18-29' | '30-49' | '50+' | 'unknown';
export const AGE_OPTIONS: Array<[AgeBucket, string]> = [['all', 'כל הגילים'], ['young', 'עד גיל 17'], ['18-29', '18–29'], ['30-49', '30–49'], ['50+', '50 ומעלה']];

export function ageBucket(a: unknown): AgeBucket {
  const age = Number(a);
  if (!Number.isFinite(age) || age <= 0) return 'unknown';
  if (age < 18) return 'young';
  if (age < 30) return '18-29';
  if (age < 50) return '30-49';
  return '50+';
}

/** Display a shekel amount with thousands separators. */
export function formatPrice(value: unknown): string {
  const n = Number(String(value ?? 0).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

/** Normalizes typed price text: digits, one dot, 2 decimals, grouped thousands. */
export function normalizePrice(value: unknown): string {
  let v = String(value ?? '').replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  const [whole, decimal] = v.split('.');
  const grouped = (whole || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal === undefined ? grouped : grouped + '.' + decimal;
}

const DEMO: RaceParticipant[] = [
  { name: 'דוד לוי', heat: 0, age: 36 }, { name: 'מיכל כהן', heat: 1, age: 24 }, { name: 'נועה אברהם', heat: 2, age: 31 },
  { name: 'איתי ישראלי', heat: 0, age: 15 }, { name: 'רוני ברק', heat: 1, age: 53 }, { name: 'יעל שחר', heat: 0, age: 16 },
  { name: 'אורי ברק', heat: 2, age: 42 }, { name: 'תמר לוי', heat: 1, age: 38 }];

/**
 * Race heats and participants, read live from the campaign state
 * (so it stays correct after reset/import). Mutations snapshot for undo,
 * persist and re-render the preview.
 */
@Injectable({ providedIn: 'root' })
export class RaceStateService {
  /** Bumped after every mutation so components re-read state. */
  readonly version = signal(0);

  private readonly campaignState = inject(CampaignStateService);
  private readonly injector = inject(Injector);
  private get win(): LegacyWindow { return window as LegacyWindow; }
  private campaign(): RaceCampaign | undefined { return this.campaignState.peek() as RaceCampaign | undefined; }

  ready(): boolean { return !!this.campaign(); }
  isRace(): boolean { return this.campaign()?.management?.campaignKind === 'race'; }
  heats(): RaceHeat[] { return this.campaign()?.management?.modules?.races?.items || []; }
  participants(): RaceParticipant[] {
    const list = this.campaign()?.management?.raceParticipants;
    return Array.isArray(list) ? list : [];
  }

  /** Real participants, or illustrative demo data when there are none. */
  displayParticipants(): RaceParticipant[] {
    const real = this.participants();
    if (real.length) return real;
    const heats = this.heats();
    return DEMO.map((p, i) => ({ ...p, heat: heats[p.heat] ? p.heat : (heats[0] ? 0 : -1), demo: true, id: 'sample-' + i }));
  }

  heatName(p: RaceParticipant): string { return this.heats()[Number(p.heat)]?.title || 'מקצה המירוץ'; }

  saveHeat(index: number, values: Partial<RaceHeat>): void {
    const management = this.campaign()?.management;
    if (!management) return;
    const item: RaceHeat = index < 0 ? { status: 'open', registered: 0 } : { ...this.heats()[index] };
    Object.assign(item, values);
    this.change(() => {
      management.modules ||= {};
      management.modules.races ||= {};
      management.modules.races.items ||= [];
      if (index < 0) management.modules.races.items.push(item); else management.modules.races.items[index] = item;
    });
  }

  /** Deletes a heat (never the last one) and re-indexes participants. */
  deleteHeat(index: number): void {
    const management = this.campaign()?.management;
    if (!management || this.heats().length === 1) return;
    this.change(() => {
      this.heats().splice(index, 1);
      management.raceParticipants = this.participants()
        .filter(p => Number(p.heat) !== index)
        .map(p => ({ ...p, heat: Number(p.heat) > index ? Number(p.heat) - 1 : Number(p.heat) }));
    });
  }

  addParticipant(name: string, heat: number): void {
    const management = this.campaign()?.management;
    if (!management || !name || !this.heats()[heat]) return;
    this.change(() => { (management.raceParticipants ||= []).push({ name, heat, age: null, demo: true }); });
  }

  removeParticipant(index: number): void {
    const management = this.campaign()?.management;
    if (!management) return;
    this.change(() => { management.raceParticipants = this.participants().filter((_, i) => i !== index); });
  }

  private change(mutate: () => void): void {
    this.campaignState.snapshot();
    mutate();
    this.campaignState.persist();
    this.injector.get(EditorService).renderPreview();
    this.version.update(v => v + 1);
  }
}
