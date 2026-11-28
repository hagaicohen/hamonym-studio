import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { UploadService } from '../../../../core/services/upload.service';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AmbassadorSlugFieldComponent } from './ambassador-slug-field/ambassador-slug-field.component';

export const DEFAULT_AMBASSADOR_SLOGAN = 'בואו לתרום דרכי ולעזור לנו להגיע ליעד!';

@Component({
  selector: 'app-ambassador-form-fields',
  standalone: true,
  imports: [FormsModule, DecimalPipe, AmbassadorSlugFieldComponent],
  template: `
    <div class="profile">
      <div class="avatar">@if (model.photoUrl || photoUrl) { <img [src]="model.photoUrl || photoUrl" alt=""> } @else {
        @if (model.fullName) { {{ initials }} } @else {
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
        }
      }</div>
      <div>
        <strong>{{ identityOnly ? model.fullName : 'תמונת השגריר' }}</strong>
        @if (identityOnly) {
          <small class="campaign-caption">{{ editingId ? 'שגריר בקמפיין' : 'שגרירות בקמפיין' }} @if (campaignTitle) { ״{{ campaignTitle }}״ }</small>
        } @else {
          <small>אופציונלי</small>
        }
        <div><button type="button" [disabled]="disabled || photoUploading" (click)="photo.click()">
          {{ photoUploading ? 'מעלה…' : (identityOnly || editingId || model.photoUrl || photoUrl) ? 'החלפת תמונה' : 'בחירת תמונה' }}
        </button></div>
        <input #photo hidden type="file" accept="image/*" (change)="selectPhoto($event)">
        @if (photoError) { <small role="alert">{{ photoError }}</small> }
      </div>
    </div>
    @if (!identityOnly) {
      <label class="field">שם מלא *<input [(ngModel)]="model.fullName" placeholder="שם השגריר" autocomplete="name" [disabled]="disabled"></label>
      <div class="two">
        <label class="field">טלפון<input type="tel" dir="ltr" placeholder="050-0000000" [(ngModel)]="model.phone" [disabled]="disabled"></label>
        <label class="field">אימייל<input type="email" dir="ltr" placeholder="name@example.com" [(ngModel)]="model.email" [disabled]="disabled"></label>
      </div>
    }
    <ng-content select="[ambassador-title]" />
    <label class="field">יעד גיוס אישי (₪)
      <input type="text" inputmode="numeric" placeholder="לדוגמה: 5,000" [value]="(model.goalAmount | number) ?? ''" (input)="setGoal($event)" [disabled]="disabled">
      @if (target && model.goalAmount && model.goalAmount > target) {
        <small>היעד האישי גבוה מיעד הקמפיין ({{ target | number }} ₪). אפשר להמשיך.</small>
      }
    </label>
    <div class="field">
      <label for="ambassador-form-slogan">סלוגן אישי</label>
      <textarea id="ambassador-form-slogan" rows="2" [(ngModel)]="model.personalMessage" [disabled]="disabled"></textarea>
      <div class="hint"><span>יוצג בדף השגריר</span><button type="button" [disabled]="disabled" (click)="model.personalMessage = defaultSlogan">שחזור ברירת מחדל</button></div>
    </div>
    @if (campaignSlug) {
      <hr class="rule">
      <div class="urltitle">כתובת דף השגריר</div>
      <app-ambassador-slug-field [suggestions]="true" [compact]="true" [campaignSlug]="campaignSlug"
        [nameForDefault]="model.fullName" [excludeAmbassadorId]="editingId" [savedValue]="savedSlug"
        [value]="model.slug ?? ''" (valueChange)="model.slug = $event"
        (availabilityChange)="availabilityChange.emit($event)" [disabled]="disabled" />
      @if (editingId && model.slug !== savedSlug) { <small>שינוי כתובת עלול לשבור קישורים שכבר שותפו.</small> }
    }
  `,
  styles: [`
    :host { display:block; min-width:0; color:inherit; }
    .profile { display:flex; align-items:center; gap:12px; min-height:58px; margin-bottom:14px; }
    .avatar { width:54px; height:54px; flex:none; border-radius:50%; display:grid; place-items:center; overflow:hidden;
      background:var(--amb-soft,#f5f2fb); color:var(--amb-form-accent,var(--hm-admin-primary)); border:1px solid var(--amb-border,#dce2e9); }
    .avatar img { width:100%; height:100%; object-fit:cover; }
    .profile strong { font-size:15px; }
    .campaign-caption { font-weight:400; }
    small { display:block; color:#64748b; font-size:12px; overflow-wrap:anywhere; }
    .field { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; min-width:0; }
    label { color:#37465a; font-size:13px; font-weight:600; }
    input,textarea { box-sizing:border-box; width:100%; min-width:0; border:1px solid #cbd5e1; border-radius:8px; padding:9px 11px;
      font-family:inherit; font-weight:400; font-size:14px; color:#233044; background:white; outline:none; }
    input { height:40px; }
    textarea { height:60px; resize:none; line-height:1.5; }
    input:focus,textarea:focus { outline:1px solid var(--amb-form-accent,var(--hm-admin-primary)); outline-offset:0; box-shadow:none; }
    .two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .hint { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:#64748b; }
    button { border:0; background:none; padding:0; color:var(--amb-form-accent,var(--hm-admin-primary)); font:inherit; font-size:12px; cursor:pointer; }
    button:focus-visible { outline:2px solid var(--amb-form-accent,var(--hm-admin-primary)); outline-offset:2px; box-shadow:none; }
    .rule { border:0; border-top:1px solid var(--amb-border,#dce2e9); margin:4px 0 14px; }
    .urltitle { font-size:14px; font-weight:700; margin-bottom:8px; }
  `]
})
export class AmbassadorFormFieldsComponent {
  @Input({required:true}) model!: {
    fullName: string; phone?: string | null; email?: string | null; personalMessage?: string | null;
    goalAmount?: number | null; slug?: string | null; photoUrl?: string | null;
  };
  @Input() identityOnly = false;
  @Input() campaignTitle = '';
  @Input() campaignSlug = '';
  @Input() editingId?: string;
  @Input() savedSlug?: string;
  @Input() target?: number | null;
  @Input() photoUrl?: string | null;
  @Input() disabled = false;
  @Output() availabilityChange = new EventEmitter<boolean>();
  @ViewChild(AmbassadorSlugFieldComponent) private slugField?: AmbassadorSlugFieldComponent;

  markSlugTaken(): void { this.slugField?.markTaken(); }

  @Output() photoBusy = new EventEmitter<boolean>();
  private readonly uploads = inject(UploadService);
  photoUploading = false;
  photoError = '';

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.disabled || this.photoUploading) return;
    if (!file.type.startsWith('image/')) {
      this.photoError = 'יש לבחור קובץ תמונה';
      return;
    }
    this.photoError = '';
    this.photoUploading = true;
    this.photoBusy.emit(true);
    this.uploads.upload(file, 'campaigns/ambassadors').subscribe({
      next: url => {
        this.model.photoUrl = url;
        this.finishUpload();
      },
      error: () => {
        this.photoError = 'העלאת התמונה נכשלה. נסו שוב.';
        this.finishUpload();
      },
    });
  }

  private finishUpload(): void {
    this.photoUploading = false;
    this.photoBusy.emit(false);
  }

  readonly defaultSlogan = DEFAULT_AMBASSADOR_SLOGAN;

  get initials(): string {
    return this.model.fullName.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('');
  }

  setGoal(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/[^0-9]/g, '');
    this.model.goalAmount = digits ? Number(digits) : null;
    input.value = this.model.goalAmount?.toLocaleString('he-IL') ?? '';
  }
}
