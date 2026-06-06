  import {
    AfterViewInit, ChangeDetectorRef, Component,
    ElementRef, forwardRef, inject, Input, OnDestroy, ViewChild,
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import Link from '@tiptap/extension-link';
  import Underline from '@tiptap/extension-underline';
  import TextAlign from '@tiptap/extension-text-align';
  import { TextStyle } from '@tiptap/extension-text-style';
  import Highlight from '@tiptap/extension-highlight';

  // Single TextStyle extension carrying both color and fontSize as inline marks
  const CustomTextStyle = TextStyle.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        color: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.color || null,
          renderHTML: (attrs: Record<string, any>) =>
            attrs['color'] ? { style: `color: ${attrs['color']}` } : {},
        },
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, any>) =>
            attrs['fontSize'] ? { style: `font-size: ${attrs['fontSize']}` } : {},
        },
      };
    },
  });

  @Component({
    selector: 'app-rich-text-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './rich-text-editor.component.html',
    styleUrls: ['./rich-text-editor.component.css'],
    providers: [{
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    }],
  })
  export class RichTextEditorComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
    @Input() placeholder = 'ספר את הסיפור שלך...';
    @Input() minHeight = 160;

    @ViewChild('editorEl') editorElement!: ElementRef<HTMLDivElement>;

    editor: Editor | null = null;
    disabled = false;
    showColorPicker = false;

    readonly presetColors = [
      '#000000', '#374151', '#6b7280', '#ffffff',
      '#ef4444', '#f97316', '#f59e0b', '#84cc16',
      '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6',
      '#ec4899', '#f43f5e',
    ];

    readonly fontSizeOptions = [
      { label: 'S',   value: '12px' },
      { label: 'M',   value: '15px' },
      { label: 'L',   value: '18px' },
      { label: 'XL',  value: '22px' },
      { label: 'XXL', value: '28px' },
    ];

    private value = '';
    private onChange = (_: string) => {};
    private onTouched = () => {};
    private cdr = inject(ChangeDetectorRef);
    private internalUpdate = false;

    ngAfterViewInit(): void {
      setTimeout(() => {
        this.editor = new Editor({
          element: this.editorElement.nativeElement,
          extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            Underline,
            CustomTextStyle,
            Highlight.configure({ multicolor: true }),
            Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Placeholder.configure({ placeholder: this.placeholder }),
          ],
          content: this.value,
          editable: !this.disabled,
          editorProps: {
            attributes: { class: 'hamonym-editor-content', dir: 'rtl' },
          },
          onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            this.value = html;
            this.internalUpdate = true;
            this.onChange(html);
            this.internalUpdate = false;
          },
          onBlur: () => { this.onTouched(); },
        });
        this.cdr.detectChanges();
      });
    }

    writeValue(value: string): void {
      const newValue = value || '';
      if (this.internalUpdate || newValue === this.value) return;
      this.value = newValue;
      if (this.editor) this.editor.commands.setContent(this.value, { emitUpdate: false });
    }
    registerOnChange(fn: any): void { this.onChange = fn; }
    registerOnTouched(fn: any): void { this.onTouched = fn; }
    setDisabledState(isDisabled: boolean): void {
      this.disabled = isDisabled;
      if (this.editor) this.editor.setEditable(!isDisabled);
    }

    toggleBold()        { this.editor?.chain().focus().toggleBold().run(); }
    toggleItalic()      { this.editor?.chain().focus().toggleItalic().run(); }
    toggleUnderline()   { this.editor?.chain().focus().toggleUnderline().run(); }
    toggleStrike()      { this.editor?.chain().focus().toggleStrike().run(); }
    toggleBulletList()  { this.editor?.chain().focus().toggleBulletList().run(); }
    toggleOrderedList() { this.editor?.chain().focus().toggleOrderedList().run(); }
    toggleBlockquote()  { this.editor?.chain().focus().toggleBlockquote().run(); }
    setTextAlign(a: 'right'|'center'|'left') { this.editor?.chain().focus().setTextAlign(a).run(); }
    setParagraph()      { this.editor?.chain().focus().setParagraph().run(); }
    setHeading(level: 1|2|3) { this.editor?.chain().focus().toggleHeading({ level }).run(); }
    clearFormatting()   { this.editor?.chain().focus().unsetAllMarks().clearNodes().run(); }

    // Color (selection-only via textStyle mark)
    setColor(color: string): void {
      this.editor?.chain().focus().setMark('textStyle', { color }).run();
      this.showColorPicker = false;
    }
    unsetColor(): void {
      this.editor?.chain().focus().setMark('textStyle', { color: null }).run();
      this.showColorPicker = false;
    }
    getActiveColor(): string {
      return this.editor?.getAttributes('textStyle')['color'] || '#000000';
    }

    // Font size (selection-only via textStyle mark)
    setFontSize(size: string): void {
      if (!size) {
        this.editor?.chain().focus().setMark('textStyle', { fontSize: null }).run();
      } else {
        this.editor?.chain().focus().setMark('textStyle', { fontSize: size }).run();
      }
    }
    getActiveFontSize(): string {
      return this.editor?.getAttributes('textStyle')['fontSize'] || '';
    }

    addLink(): void {
      if (!this.editor) return;
      const previousUrl = this.editor.getAttributes('link')['href'];
      const url = window.prompt('הכנס קישור', previousUrl);
      if (url === null) return;
      if (url === '') { this.editor.chain().focus().unsetLink().run(); return; }
      this.editor.chain().focus().setLink({ href: url }).run();
    }

    removeLink(): void { this.editor?.chain().focus().unsetLink().run(); }

    isActive(name: string, options?: any): boolean {
      return this.editor?.isActive(name, options) ?? false;
    }

    getCurrentBlockType(): string {
      if (!this.editor) return 'paragraph';
      if (this.editor.isActive('heading', { level: 1 })) return 'h1';
      if (this.editor.isActive('heading', { level: 2 })) return 'h2';
      if (this.editor.isActive('heading', { level: 3 })) return 'h3';
      return 'paragraph';
    }

    onBlockTypeChange(event: Event): void {
      const value = (event.target as HTMLSelectElement).value;
      if (value === 'h1') this.setHeading(1);
      else if (value === 'h2') this.setHeading(2);
      else if (value === 'h3') this.setHeading(3);
      else this.setParagraph();
    }

    ngOnDestroy(): void { this.editor?.destroy(); }
  }
