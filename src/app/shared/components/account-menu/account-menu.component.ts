import { ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { CurrentContextService } from '../../../core/services/current-context.service';
import { CurrentEntityService } from '../../../core/services/current-entity.service';
import { EntitiesService } from '../../../core/services/entities.service';
import { OrganizationEntryService } from '../../../core/services/organization-entry.service';
import { registeredOrganizations } from '../../../core/utils/organization-registration-status';
import { ActiveContext } from '../../../core/models/user-context.model';
import { AmbassadorCampaignSummary, AmbassadorService } from '../../../modules/campaigns/services/ambassador.service';
import { HmIconComponent } from '../../ui/design-system/icon.component';

type Organization = { id: string; display_name: string; legal_name?: string; entity_type?: string; status?: string };
@Component({
 selector: 'app-account-menu', standalone: true,
 imports: [CommonModule, FormsModule, HmIconComponent],
 templateUrl: './account-menu.component.html', styleUrl: './account-menu.component.css',
})
export class AccountMenuComponent implements OnDestroy {
 readonly auth = inject(AuthService);
 readonly ctx = inject(CurrentContextService);
 private readonly currentEntity = inject(CurrentEntityService);
 private readonly entities = inject(EntitiesService);
 private readonly ambassadors = inject(AmbassadorService);
 private readonly entry = inject(OrganizationEntryService);
 private readonly router = inject(Router);
 private readonly cdr = inject(ChangeDetectorRef);
 @Input() publicPage = false;
 @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLDialogElement>;
 @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;
 open = false;
 mode: 'root' | 'organizations' | 'ambassadors' = 'root';
 search = '';
 loading = false;
 navigating = false;
 photoFailed = false;
 error = '';
 top = 0;
 left = 8;
 organizations: Organization[] = [];
 campaigns: AmbassadorCampaignSummary[] = [];
 private requests?: Subscription;
 private navigation?: Subscription;
 private destroyed = false;
 private accountId: number | null = null;
 private picture: string | null | undefined;
 private previousOverflow = '';
 private previousPriority = '';
 constructor() {
  effect(() => {
   const user = this.auth.currentUser();
   this.ctx.active();
   untracked(() => {
    if (this.accountId !== (user?.id ?? null)) {
     this.requests?.unsubscribe();
     this.close();
     this.organizations = [];
     this.campaigns = [];
     this.accountId = user?.id ?? null;
    }
    if (this.picture !== user?.picture) { this.picture = user?.picture; this.photoFailed = false; }
    this.refresh();
   });
  });
 }
 get name(): string { return this.auth.currentUser()?.full_name || 'החשבון שלי'; }
 get initials(): string { return this.name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join(''); }
 get photo(): string { const value = this.auth.currentUser()?.picture || ''; return /^(https?:|data:image\/)/i.test(value) && !this.photoFailed ? value : ''; }
 get organizationLabel(): string { return this.organizations.every(e => e.entity_type === 'association') ? 'מנהל עמותה' : 'ניהול ארגונים'; }
 get filteredOrganizations(): Organization[] { const q = this.search.trim().toLocaleLowerCase(); return this.organizations.filter(e => (e.display_name || e.legal_name || '').toLocaleLowerCase().includes(q)); }
 get filteredCampaigns(): AmbassadorCampaignSummary[] { const q = this.search.trim().toLocaleLowerCase(); return this.campaigns.filter(c => c.name.toLocaleLowerCase().includes(q)); }
 get selectedWorkspace(): string { return this.ctx.active()?.role || 'donor'; }
 photoError(): void { this.photoFailed = true; this.refresh(); }
 toggle(event: MouseEvent): void {
  event.stopPropagation();
  if (this.open) { this.close(); return; }
  this.mode = 'root'; this.search = ''; this.error = ''; this.open = true;
  this.previousOverflow = document.documentElement.style.overflow;
  this.previousPriority = document.documentElement.style.getPropertyPriority('overflow');
  document.documentElement.style.setProperty('overflow', 'hidden', 'important');
  this.position();
  this.refresh();
  this.panel.nativeElement.showModal();
  if (this.auth.currentUser()) { this.ctx.ensureDonorRole(); this.loadMemberships(); }
 }
 close(): void {
  if (!this.open) return;
  this.open = false;
  this.panel.nativeElement.close();
  document.documentElement.style.setProperty('overflow', this.previousOverflow, this.previousPriority);
  this.refresh();
 }
 cancel(event: Event): void { event.preventDefault(); this.close(); }
 backdrop(event: MouseEvent): void {
  const d = this.panel.nativeElement, b = d.getBoundingClientRect();
  if (event.target === d && (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom)) this.close();
 }
 @HostListener('window:resize') position(): void {
  if (!this.open) return;
  const b = this.trigger.nativeElement.getBoundingClientRect();
  this.top = Math.min(b.bottom + 8, Math.max(8, window.innerHeight - 240));
  this.left = Math.max(8, Math.min(b.right - 328, window.innerWidth - 336));
  this.refresh();
 }
 loadMemberships(): void {
  this.requests?.unsubscribe(); this.loading = true; this.error = ''; this.refresh();
  this.requests = forkJoin({
   organizations: this.entities.getMyEntities().pipe(catchError(() => of(null))),
   campaigns: this.ambassadors.getMyCampaigns(),
  }).subscribe({next: result => {
   this.loading = false;
   this.organizations = registeredOrganizations<Organization>(result.organizations?.entities || []);
   this.campaigns = result.campaigns;
   if (!result.organizations) this.error = 'לא ניתן לטעון את כל סביבות העבודה. אפשר לנסות שוב.';
   this.refresh();
  }, error: () => { this.loading = false; this.error = 'לא ניתן לטעון סביבות עבודה. יש לנסות שוב.'; this.refresh(); }});
 }
 choose(kind: 'organizations' | 'ambassadors'): void {
  this.search = '';
  this.mode = this.mode === kind ? 'root' : kind;
  this.refresh();
 }
 searchChanged(value: string): void { this.search = value; this.refresh(); }
 selectOrganization(organization: Organization): void {
  if (this.navigating) return;
  const previous = this.ctx.active();
  this.ctx.addEntityContext(organization);
  this.navigating = true; this.error = ''; this.refresh();
  this.navigation = this.currentEntity.selectEntity(organization.id).subscribe({
   next: () => { this.entry.enter(organization.id); void this.navigate('/dashboard', previous); },
   error: () => { this.navigating = false; this.error = 'לא ניתן לעבור לארגון. יש לבדוק הרשאה ולנסות שוב.'; this.refresh(); },
  });
 }
 async selectCampaign(campaign: AmbassadorCampaignSummary): Promise<void> {
  if (this.navigating) return;
  const previous = this.ctx.active();
  // Membership comes from the existing authenticated getMyCampaigns API.
  this.ctx.addAmbassadorContext({ id: campaign.id, name: campaign.name });
  this.ctx.switchContext('ambassador', campaign.id);
  await this.navigate(`/campaigns/${campaign.id}/ambassador-studio`, previous);
 }
 async donor(): Promise<void> {
  if (this.navigating) return;
  const previous = this.ctx.active(); this.ctx.ensureDonorRole(); this.ctx.switchContext('donor', null);
  await this.navigate('/my-donations', previous);
 }
 async navigate(path: string, previous?: ActiveContext | null): Promise<void> {
  this.navigating = true; this.error = ''; this.refresh();
  try {
   const success = await this.router.navigateByUrl(path);
   if (success) this.close();
   else if (previous) this.ctx.switchContext(previous.role, previous.context?.id ?? null);
  } catch {
   if (previous) this.ctx.switchContext(previous.role, previous.context?.id ?? null);
   this.error = 'לא ניתן לפתוח את העמוד. יש לנסות שוב.';
  } finally { this.navigating = false; this.refresh(); }
 }
 async details(): Promise<void> { this.ctx.ensureDonorRole(); await this.navigate('/settings'); }
 async login(register = false): Promise<void> {
  const returnUrl = this.router.url;
  const success = await this.router.navigate([register ? '/register' : '/login'], { queryParams: { returnUrl } });
  if (success) this.close();
 }
 logout(): void { const destination = this.publicPage ? this.router.url : '/'; this.close(); this.auth.logout(destination); }
 // Public preview roots are created outside ApplicationRef; keep this shared view reactive there too.
 private refresh(): void { queueMicrotask(() => { if (!this.destroyed) this.cdr.detectChanges(); }); }
 ngOnDestroy(): void { this.close(); this.destroyed = true; this.requests?.unsubscribe(); this.navigation?.unsubscribe(); }
}
