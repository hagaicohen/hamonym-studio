// src/app/core/layout/sidebar/sidebar.component.ts

import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { RouterLink, RouterLinkActive } from '@angular/router';

interface SidebarItem {
  label: string;
  icon: string;
  route: string;
}

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

  menuItems: SidebarItem[] = [
    {
      label: 'דשבורד',
      icon: 'dashboard',
      route: '/dashboard',
    },

    {
      label: 'קמפיינים',
      icon: 'campaign',
      route: '/campaigns',
    },
    {
      label: 'הגדרות',
      icon: 'settings',
      route: '/settings',
    },
  ];

  onNavigate(): void {
    this.closeMobile.emit();
  }
}
