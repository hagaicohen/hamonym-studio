import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'ham-welcome-actions',
  standalone: true,
  templateUrl: './welcome-actions.component.html',
  styleUrl: './welcome-actions.component.css'
})
export class WelcomeActionsComponent {
  @Output() begin = new EventEmitter<void>();
  start(): void { this.begin.emit(); }
}
