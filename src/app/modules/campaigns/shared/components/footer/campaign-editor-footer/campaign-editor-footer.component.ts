import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LucideAngularModule,Rocket } from "lucide-angular";

@Component({
  selector: 'app-campaign-editor-footer',
  standalone: true,
  templateUrl: './campaign-editor-footer.component.html',
  styleUrls: ['./campaign-editor-footer.component.css'],
  imports: [LucideAngularModule],
})
export class CampaignEditorFooterComponent {
   readonly Rocket = Rocket;
  @Input()
  currentStep = 1;

  @Input()
  totalSteps = 10;

  @Input()
  canContinue = true;

  @Input()
  isSaving = false;

  @Output()
  previous = new EventEmitter<void>();

  @Output()
  next = new EventEmitter<void>();
}
