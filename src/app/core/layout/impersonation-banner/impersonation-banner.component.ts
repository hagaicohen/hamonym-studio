// src/app/core/layout/impersonation-banner/impersonation-banner.component.ts

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrentContextService } from '../../services/current-context.service';

import { HmIconComponent } from '../../../shared/ui/design-system/icon.component';
@Component({
  selector: 'app-impersonation-banner',
  standalone: true,
  imports: [HmIconComponent, CommonModule],
  templateUrl: './impersonation-banner.component.html',
  styleUrl: './impersonation-banner.component.css',
})
export class ImpersonationBannerComponent {
  private ctx = inject(CurrentContextService);

  readonly impersonating = this.ctx.impersonating;
  readonly impersonatorName = this.ctx.impersonatorName;

  returnToAdmin(): void {
    this.ctx.endImpersonation();
    window.location.href = '/platform/users';
  }
}
