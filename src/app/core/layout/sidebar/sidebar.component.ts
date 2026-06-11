// src/app/core/layout/sidebar/sidebar.component.ts

import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent {
  @Input() mobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  private router = inject(Router);

  onNavigate(): void {
    this.closeMobile.emit();
  }

  createCampaign(): void {
    this.closeMobile.emit();
    this.router.navigate(['/campaigns/create']);
  }
}
