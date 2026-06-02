import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { CampaignStudioStateService } from '../../../../campaigns/services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-basic-step',
  standalone: true,
  imports: [FormsModule, RichTextEditorComponent],
  templateUrl: './campaign-basic-step.component.html',
  styleUrl: './campaign-basic-step.component.css',
})
export class CampaignBasicStepComponent {

  protected campaignState = inject(CampaignStudioStateService);

  get draft() { return this.campaignState.draft; }

  slugTimeout: any;
  isCheckingSlug = false;
  slugAvailable: boolean | null = null;

  titleTouched = false;
  slugTouched = false;
  shortDescriptionTouched = false;
  fullDescriptionTouched = false;

  sync(): void { this.campaignState.sync(); }

  allowSlugChars(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowedKeys.includes(event.key)) return;
    if (!/^[a-z0-9-]$/.test(event.key)) event.preventDefault();
  }

  onSlugChange(value: string): void {
    this.campaignState.patch({ slug: value });
    clearTimeout(this.slugTimeout);

    if (!value || value.trim().length < 3) {
      this.slugAvailable = null;
      this.isCheckingSlug = false;
      return;
    }

    this.isCheckingSlug = true;
    this.slugAvailable = null;

    this.slugTimeout = setTimeout(() => {
      this.slugAvailable = value.toLowerCase().trim() !== 'abc';
      this.isCheckingSlug = false;
    }, 800);
  }

  isTitleInvalid(): boolean {
    return this.titleTouched && !this.draft.title.trim();
  }

  isSlugInvalid(): boolean {
    return this.slugTouched && (!this.draft.slug.trim() || this.slugAvailable === false);
  }

  isShortDescriptionInvalid(): boolean {
    return this.shortDescriptionTouched && !this.draft.shortDescription.trim();
  }

  isFullDescriptionInvalid(): boolean {
    const content = this.draft.fullDescription
      ?.replace(/<[^>]*>/g, '')
      ?.replace(/&nbsp;/g, '')
      ?.trim();
    return this.fullDescriptionTouched && !content;
  }

  isValid(): boolean {
    return (
      !!this.draft.title?.trim() &&
      !!this.draft.slug?.trim() &&
      !!this.draft.shortDescription?.trim() &&
      !!this.draft.fullDescription?.trim() &&
      this.slugAvailable === true &&
      !this.isCheckingSlug
    );
  }
}
