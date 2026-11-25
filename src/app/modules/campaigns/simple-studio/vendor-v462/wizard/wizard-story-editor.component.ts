import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

/**
 * The story's rich-text surface (#hwRich). The HTML is set once and never
 * replaced while typing, so the caret and selection are preserved.
 */
@Component({
  selector: 'ham-wizard-story-editor', standalone: true,
  templateUrl: './wizard-story-editor.component.html',
  styleUrl: './wizard-story-editor.component.css'
})
export class WizardStoryEditorComponent implements AfterViewInit {
  @Input() initialHtml = '';
  @Output() htmlChange = new EventEmitter<string>();
  @ViewChild('editor', {static: true}) editor!: ElementRef<HTMLDivElement>;
  ngAfterViewInit(): void {
    // Trusted HTML from the local campaign story (produced by the Story Builder).
    this.editor.nativeElement.innerHTML = this.initialHtml;
  }
  get element(): HTMLDivElement { return this.editor.nativeElement; }
  emit(): void { this.htmlChange.emit(this.editor.nativeElement.innerHTML); }
}
