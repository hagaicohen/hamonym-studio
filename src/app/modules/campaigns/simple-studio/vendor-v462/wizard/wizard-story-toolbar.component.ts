import { Component, Input } from '@angular/core';
import { WizardStoryEditorComponent } from './wizard-story-editor.component';

/** Formatting toolbar for the story editor it is given. */
@Component({selector:'ham-wizard-story-toolbar',standalone:true,templateUrl:'./wizard-story-toolbar.component.html',styleUrl:'./wizard-story-toolbar.component.css'})
export class WizardStoryToolbarComponent {
  @Input({ required: true }) editor!: WizardStoryEditorComponent;
  format(command: string): void {
    const rich = this.editor.element;
    rich.focus();
    if (command === 'createLink') {
      const url = prompt('כתובת הקישור');
      if (!url || !/^https?:\/\//i.test(url)) return;
      document.execCommand('createLink', false, url);
    } else if (command === 'h2' || command === 'h3') {
      document.execCommand('formatBlock', false, command);
    } else {
      document.execCommand(command, false);
    }
    this.editor.emit();
  }
}
