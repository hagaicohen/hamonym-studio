import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

@Component({
  selector: 'app-campaign-editor-footer',
  standalone: true,
  templateUrl: './campaign-editor-footer.component.html',
  styleUrls: ['./campaign-editor-footer.component.css']
})
export class CampaignEditorFooterComponent {

  @Input()
  currentStep = 1;

  @Input()
  canContinue = false;

  @Output()
  previous =
    new EventEmitter<void>();

  @Output()
  next =
    new EventEmitter<void>();

}