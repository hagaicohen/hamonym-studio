import { AmbassadorFormDrawerComponent } from '../ambassador-form-drawer.component';
import { AmbassadorFormFieldsComponent, DEFAULT_AMBASSADOR_SLOGAN } from '../ambassador-form-fields.component';
import { Component, EventEmitter, ViewChild, OnInit, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { Ambassador, AmbassadorService } from '../../../services/ambassador.service';
import { AuthService } from '../../../../../core/services/auth.service';
@Component({selector:'app-campaign-join-dialog',standalone:true,
 imports:[AmbassadorFormDrawerComponent,AmbassadorFormFieldsComponent,CommonModule,RouterModule],
 templateUrl:'./campaign-join-dialog.component.html',styleUrl:'./campaign-join-dialog.component.css'})
export class CampaignJoinDialogComponent implements OnInit {
 private readonly state=inject(CampaignStudioStateService);
 private readonly ambassadorSvc=inject(AmbassadorService);
 readonly auth=inject(AuthService);
 readonly draft$=this.state.draft$;
 get loginReturnUrl(): string {
  const url = new URL(location.href);
  url.searchParams.set('join', 'ambassador');
  return url.pathname + url.search;
 }
 @Input() editing: Ambassador | null = null;
 @Output() saved = new EventEmitter<Ambassador>();
 private initialForm = '';
 @Output() closed=new EventEmitter<void>();
 @Output() joined=new EventEmitter<{slug:string;shareUrl:string}>();
 ngOnInit(): void {
  this.openJoinModal();
  const user = this.auth.currentUser();
  if (this.editing) {
   const row = this.editing;
   this.joinForm = {
    fullName: row.fullName, phone: '', email: user?.email ?? '', goalAmount: row.goalAmount,
    slug: row.slug, personalMessage: row.personalMessage || this.defaultMessage, photoUrl: row.photoUrl ?? null,
   };
   this.joinSlugAvailable = true;
  } else if (user) {
   this.joinForm.fullName = user.full_name;
   this.joinForm.email = user.email;
  }
  this.initialForm = JSON.stringify(this.joinForm);
 }
 @ViewChild(AmbassadorFormFieldsComponent) private formFields?: AmbassadorFormFieldsComponent;
 photoUploading = false;
 primaryColor(draft:CampaignDraft):string {return (draft.layout.simpleStudio as any)?.theme?.primary || draft.layout?.theme?.secondaryColor || '#217365';}
  joinStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  readonly defaultMessage = DEFAULT_AMBASSADOR_SLOGAN;
  joinForm     = { fullName: '', phone: '', email: '', goalAmount: null as number | null, slug: '', personalMessage: this.defaultMessage, photoUrl: null as string | null };
  // Gates submit alongside fullName -- mirrors how the existing campaign-slug
  // field gates the publish flow on its own availability flag.
  joinSlugAvailable = false;
  joinShareUrl = '';
  joinCopied   = false;
  joinError    = '';

  openJoinModal(): void {
    this.joinForm          = { fullName: '', phone: '', email: '', goalAmount: null, slug: '', personalMessage: this.defaultMessage, photoUrl: null as string | null };
    this.joinSlugAvailable = false;
    this.joinStatus        = 'idle';
    this.joinShareUrl      = '';
    this.joinCopied        = false;
    this.joinError         = '';
  }

  closeJoinModal(): void {
    if (this.joinStatus === 'loading' || this.photoUploading) return;
    if (this.joinStatus !== 'success' && this.initialForm !== JSON.stringify(this.joinForm)
        && !window.confirm('לצאת בלי לשמור את השינויים?')) return;
    this.closed.emit();
  }

  submitJoin(draft: CampaignDraft): void {
    if (!this.auth.currentUser() || !this.joinForm.fullName.trim() || this.joinStatus === 'loading' || !this.joinSlugAvailable || this.photoUploading) return;
    this.joinError = '';
    this.joinStatus = 'loading';
    const editing = this.editing;
    if (editing) {
      this.ambassadorSvc.update(editing.id, {
        goalAmount: this.joinForm.goalAmount,
        personalMessage: this.joinForm.personalMessage,
        ...(this.joinForm.photoUrl && this.joinForm.photoUrl !== editing.photoUrl ? { photoUrl: this.joinForm.photoUrl } : {}),
        ...(editing.slug !== this.joinForm.slug ? { slug: this.joinForm.slug } : {}),
      }).subscribe({
        next: row => this.saved.emit(row),
        error: error => this.joinFailed(error),
      });
      return;
    }
    this.ambassadorSvc.selfRegister(draft.slug!, {
      fullName: this.joinForm.fullName,
      phone: this.joinForm.phone,
      email: this.joinForm.email,
      goalAmount: this.joinForm.goalAmount,
      slug: this.joinForm.slug,
      personalMessage: this.joinForm.personalMessage,
        ...(this.joinForm.photoUrl ? { photoUrl: this.joinForm.photoUrl } : {}),
    }).subscribe({
      next: (res: { slug: string; shareUrl: string }) => {
        this.joinShareUrl = res.shareUrl;
        this.joinStatus   = 'success';
        this.joined.emit(res);
      },
      error: err => this.joinFailed(err),
    });
  }

  private joinFailed(err: { status?: number; error?: { error?: string } }): void {
    this.joinStatus = 'error';
    if (err.error?.error?.includes('campaign_ambassadors_unique_account')) {
      this.joinError = 'לחשבון שלך כבר קיימת שגרירות בקמפיין, גם אם היא בארכיון. שינוי הכתובת לא יאפשר יצירה מחדש.';
      return;
    }
    if (err.status === 409) {
      this.joinSlugAvailable = false;
      this.formFields?.markSlugTaken();
      this.joinError = 'הכתובת תפוסה. בחרו כתובת אחרת.';
    } else {
      this.joinError = err?.error?.error || 'אירעה שגיאה. נסו שוב.';
    }
  }

  copyJoinLink(): void {
    navigator.clipboard.writeText(this.joinShareUrl).then(() => {
      this.joinCopied = true;
      setTimeout(() => { this.joinCopied = false; }, 2500);
    });
  }

}
