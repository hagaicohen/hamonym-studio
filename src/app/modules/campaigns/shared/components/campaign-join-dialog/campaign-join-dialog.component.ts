import { Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { AmbassadorService } from '../../../services/ambassador.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { HmPublicTextPipe } from '../../../../../core/i18n/content-language';
import { HmCurrencyPipe, HmMoneyArgPipe } from '../../../../../core/i18n/money';
import { HmIconComponent } from '../../../../../shared/ui/design-system/icon.component';
import { AmbassadorSlugFieldComponent } from '../ambassador-slug-field/ambassador-slug-field.component';
@Component({selector:'app-campaign-join-dialog',standalone:true,
 imports:[CommonModule,FormsModule,RouterModule,HmPublicTextPipe,HmCurrencyPipe,HmMoneyArgPipe,HmIconComponent,AmbassadorSlugFieldComponent],
 templateUrl:'./campaign-join-dialog.component.html',styleUrls:['../../../studio/preview/campaign-preview/campaign-preview.component.css']})
export class CampaignJoinDialogComponent implements OnInit {
 private readonly state=inject(CampaignStudioStateService);
 private readonly ambassadorSvc=inject(AmbassadorService);
 private readonly auth=inject(AuthService);
 readonly draft$=this.state.draft$;
 readonly returnUrl=location.pathname+location.search;
 @Output() closed=new EventEmitter<void>();
 @Output() joined=new EventEmitter<{slug:string;shareUrl:string}>();
 ngOnInit():void {this.openJoinModal(); const user=this.auth.currentUser(); if(user){this.joinForm.fullName=user.full_name;this.joinForm.email=user.email;}}
 @HostListener('document:keydown.escape') escape():void {if(this.joinStatus!=='loading')this.closeJoinModal();}
 primaryColor(draft:CampaignDraft):string {return (draft.layout.simpleStudio as any)?.theme?.primary || draft.layout?.theme?.secondaryColor || '#6fc9eb';}
  showJoinModal = false;
  joinStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  joinForm     = { fullName: '', phone: '', email: '', goalAmount: null as number | null, slug: '' };
  // Gates submit alongside fullName -- mirrors how the existing campaign-slug
  // field gates the publish flow on its own availability flag.
  joinSlugAvailable = false;
  joinGoalDisplay = '';
  joinShareUrl = '';
  joinCopied   = false;
  joinError    = '';

  openJoinModal(): void {
    this.joinForm          = { fullName: '', phone: '', email: '', goalAmount: null, slug: '' };
    this.joinSlugAvailable = false;
    this.joinGoalDisplay   = '';
    this.joinStatus        = 'idle';
    this.joinShareUrl      = '';
    this.joinCopied        = false;
    this.joinError         = '';
    this.showJoinModal     = true;
  }

  // Non-blocking (Product Requirement 2): a personal goal above the
  // campaign's target is allowed, just flagged -- never disables submit.
  joinGoalAboveCampaignGoal(draft: CampaignDraft): boolean {
    const target = draft.targetAmount ?? 0;
    return !!this.joinForm.goalAmount && target > 0 && this.joinForm.goalAmount > target;
  }

  onJoinGoalInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    this.joinForm.goalAmount = num && num > 0 ? num : null;
    const formatted = num ? num.toLocaleString('he-IL') : '';
    (event.target as HTMLInputElement).value = formatted;
    this.joinGoalDisplay = formatted;
  }

  closeJoinModal(): void { this.showJoinModal = false; this.closed.emit(); }

  submitJoin(draft: CampaignDraft): void {
    if (!this.joinForm.fullName.trim() || this.joinStatus === 'loading' || !this.joinSlugAvailable) return;
    this.joinStatus = 'loading';
    this.ambassadorSvc.selfRegister(draft.slug!, {
      fullName: this.joinForm.fullName,
      phone: this.joinForm.phone,
      email: this.joinForm.email,
      goalAmount: this.joinForm.goalAmount,
      slug: this.joinForm.slug,
    }).subscribe({
      next: (res: { slug: string; shareUrl: string }) => {
        this.joinShareUrl = res.shareUrl;
        this.joinStatus   = 'success';
        this.joined.emit(res);
      },
      error: (err: { error?: { error?: string } }) => {
        this.joinStatus = 'error';
        this.joinError  = err?.error?.error || 'אירעה שגיאה. נסה שוב.';
      },
    });
  }

  copyJoinLink(): void {
    navigator.clipboard.writeText(this.joinShareUrl).then(() => {
      this.joinCopied = true;
      setTimeout(() => { this.joinCopied = false; }, 2500);
    });
  }

}
