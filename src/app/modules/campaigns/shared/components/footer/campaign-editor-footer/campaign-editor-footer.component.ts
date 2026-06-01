import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-campaign-editor-footer',
  standalone: true,
  templateUrl: './campaign-editor-footer.component.html',
  styleUrls: ['./campaign-editor-footer.component.css'],
  imports: [NgIf],
})
export class CampaignEditorFooterComponent {
  @Input()
  currentStep = 1;

  @Input()
  canContinue = true;

  @Output()
  previous = new EventEmitter<void>();

  @Output()
  next = new EventEmitter<void>();
}
