// src/app/core/layout/topbar/topbar.component.ts

import { Component, EventEmitter, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { AuthService } from '../../services/auth.service';

import { CurrentEntityService } from '../../../core/services/current-entity.service';

import { inject } from '@angular/core';

@Component({
  selector: 'app-topbar',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './topbar.component.html',

  styleUrls: ['./topbar.component.css'],
})
export class TopbarComponent {
  @Output()
  menuClick = new EventEmitter<void>();

  currentEntityService = inject(CurrentEntityService);

  constructor(private auth: AuthService) {}

  logout(): void {
    this.auth.logout();
  }
}
