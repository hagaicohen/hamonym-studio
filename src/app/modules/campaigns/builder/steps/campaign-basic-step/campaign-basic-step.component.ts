import { Component } from '@angular/core';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-campaign-basic-step',

  standalone: true,

  imports: [FormsModule, RichTextEditorComponent],

  templateUrl: './campaign-basic-step.component.html',

  styleUrl: './campaign-basic-step.component.css',
})
export class CampaignBasicStepComponent {
  campaignSlug = '';

  slugTimeout: any;

  isCheckingSlug = false;

  slugAvailable: boolean | null = null;

  campaignTitle = '';

  shortDescription = '';

  fullDescription = '';

  titleTouched = false;

  slugTouched = false;

  shortDescriptionTouched = false;

  fullDescriptionTouched = false;

  allowSlugChars(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    const isValid = /^[a-z0-9-]$/.test(event.key);

    if (!isValid) {
      event.preventDefault();
    }
  }

  onSlugChange(value: string): void {
    this.campaignSlug = value;

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
    return this.titleTouched && !this.campaignTitle.trim();
  }

  isSlugInvalid(): boolean {
    return (
      this.slugTouched &&
      (!this.campaignSlug.trim() || this.slugAvailable === false)
    );
  }

  isShortDescriptionInvalid(): boolean {
    return (
      this.shortDescriptionTouched &&
      !this.shortDescription.trim()
    );
  }

  isFullDescriptionInvalid(): boolean {
    const content = this.fullDescription
      ?.replace(/<[^>]*>/g, '')
      ?.replace(/&nbsp;/g, '')
      ?.trim();

    return this.fullDescriptionTouched && !content;
  }

  isValid(): boolean {
    return (
      !!this.campaignTitle?.trim() &&
      !!this.campaignSlug?.trim() &&
      !!this.shortDescription?.trim() &&
      !!this.fullDescription?.trim() &&
      this.slugAvailable === true &&
      !this.isCheckingSlug
    );
  }
}