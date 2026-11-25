import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  LucideAngularModule, LucideIconData,
  AlarmClock, ArrowUp, Bell, Bot, Building2, Calendar, Camera, ChartColumn, Check, Circle, CircleDot, Clock,
  CloudUpload, Columns3, Construction, Copy, CreditCard, Dna, Download, Eye, EyeOff, Facebook, Factory, FileText, FileUp,
  FlaskConical, Flag, GalleryHorizontal, Gift, Globe, HandCoins, Handshake, Heart, Hourglass, House, Image, Landmark,
  Lightbulb, Link, List, Lock, Mail, MapPin, Megaphone, MessageCircle, Palette, PartyPopper, Paperclip, PenLine, Pencil,
  PencilLine, Play, Plus, Printer, Receipt, RefreshCw, Repeat, Rocket, Save, Search, Send, Settings, Shield, Sparkles,
  Sprout, Star, Target, Ticket, Timer, Trash2, TrendingUp, TriangleAlert, User, Users, VenetianMask, X,
} from 'lucide-angular';
import { HM_ICON_STROKE } from './icons';

// The one icon map for UI decoration (replaces the emoji icons that used to
// sit in templates and labels). Emojis that are campaign content or a choice
// the user makes (CTA icons, registration field icons…) stay emojis.
export const HM_ICONS = {
  'alarm-clock': AlarmClock, alert: TriangleAlert, 'arrow-up': ArrowUp, bell: Bell, bot: Bot, building: Building2,
  calendar: Calendar, camera: Camera, chart: ChartColumn, check: Check, clock: Clock, 'cloud-upload': CloudUpload,
  columns: Columns3, construction: Construction, copy: Copy, card: CreditCard, dna: Dna, dot: Circle, download: Download,
  eye: Eye, 'eye-off': EyeOff, facebook: Facebook, factory: Factory, file: FileText, 'file-up': FileUp, flag: Flag, flask: FlaskConical,
  gift: Gift, globe: Globe, coins: HandCoins, handshake: Handshake, heart: Heart, hourglass: Hourglass, house: House,
  image: Image, landmark: Landmark, lightbulb: Lightbulb, link: Link, list: List, lock: Lock, mail: Mail,
  'map-pin': MapPin, megaphone: Megaphone, message: MessageCircle, palette: Palette, party: PartyPopper,
  paperclip: Paperclip, 'pen-line': PenLine, pencil: Pencil, 'pencil-line': PencilLine, play: Play, plus: Plus,
  printer: Printer, receipt: Receipt, refresh: RefreshCw, repeat: Repeat, ring: CircleDot, rocket: Rocket, save: Save,
  search: Search, send: Send, settings: Settings, shield: Shield, slider: GalleryHorizontal, sparkles: Sparkles,
  sprout: Sprout, star: Star, target: Target, ticket: Ticket, timer: Timer, trash: Trash2, 'trending-up': TrendingUp,
  user: User, users: Users, 'venetian-mask': VenetianMask, x: X,
} satisfies Record<string, LucideIconData>;

export type HmIconName = keyof typeof HM_ICONS;

// Status colors for filled dots and toned icons.
export type HmIconTone = 'success' | 'danger' | 'warning' | 'caution' | 'info' | 'neutral' | 'muted' | 'dark' | 'brand';

// Inline icon at the surrounding text size (1em) unless a pixel size is given,
// in the current text color unless a tone is set. Always decorative: the text
// next to it carries the meaning.
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hm-icon',
    'aria-hidden': 'true',
    '[attr.data-tone]': 'tone',
    '[class.hm-icon--filled]': 'filled || name === "dot"',
    '[class.hm-icon--sized]': 'size !== null',
    '[style.--hm-icon-size.px]': 'size',
  },
  template: `<lucide-icon [img]="icon" [strokeWidth]="stroke" />`,
  styles: [`
    :host { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 1em; height: 1em; line-height: 0; vertical-align: -0.125em; }
    :host(.hm-icon--sized) { width: var(--hm-icon-size); height: var(--hm-icon-size); }
    :host ::ng-deep svg { width: 100%; height: 100%; }
    :host(.hm-icon--filled) ::ng-deep svg { fill: currentColor; }
    :host([data-tone="success"]) { color: #16a34a; }
    :host([data-tone="danger"])  { color: #dc2626; }
    :host([data-tone="warning"]) { color: #eab308; }
    :host([data-tone="caution"]) { color: #ea580c; }
    :host([data-tone="info"])    { color: #2563eb; }
    :host([data-tone="neutral"]) { color: #cbd5e1; }
    :host([data-tone="muted"])   { color: #94a3b8; }
    :host([data-tone="dark"])    { color: #334155; }
    :host([data-tone="brand"])   { color: var(--primary-color, #583cd6); }
  `],
})
export class HmIconComponent {
  @Input({ required: true }) name!: HmIconName;
  @Input() size: number | null = null;
  @Input() tone: HmIconTone | null = null;
  @Input() filled = false;
  @Input() stroke = HM_ICON_STROKE;

  get icon(): LucideIconData { return HM_ICONS[this.name] ?? HM_ICONS.dot; }
}
