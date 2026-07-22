import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IdleTimeoutService } from '../../services/idle-timeout.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-idle-warning-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './idle-warning-modal.component.html',
  styleUrl: './idle-warning-modal.component.css',
})
export class IdleWarningModalComponent {
  protected idle = inject(IdleTimeoutService);
  private auth = inject(AuthService);

  stayLoggedIn(): void {
    this.idle.extendSession();
  }

  logoutNow(): void {
    this.auth.logout();
  }
}
