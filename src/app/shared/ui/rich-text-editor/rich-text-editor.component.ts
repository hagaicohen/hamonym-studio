import {TextSelection,AllSelection,SelectionBookmark} from '@tiptap/pm/state';
  import {
    AfterViewInit, ChangeDetectorRef, Component, OnChanges, SimpleChanges,
    ElementRef, forwardRef, inject, Input, OnDestroy, ViewChild,
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
  import {toHex} from '../../../modules/campaigns/utils/element-color';
  import { Editor, Extension } from '@tiptap/core';
  import { CAMPAIGN_FONTS, ensureStackLoaded } from '../../../modules/campaigns/utils/campaign-fonts';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import Link from '@tiptap/extension-link';
  import Underline from '@tiptap/extension-underline';
  import TextAlign from '@tiptap/extension-text-align';
  import { TextStyle } from '@tiptap/extension-text-style';
  import Highlight from '@tiptap/extension-highlight';
  import { HmIconComponent } from '../design-system/icon.component';
  import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
  import { textOf } from '../../../core/i18n/text.pipe';

  // Single TextStyle extension carrying both color and fontSize as inline marks
  const CustomTextStyle = TextStyle.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        ...Object.fromEntries(['fontFamily','fontWeight','lineHeight'].map(name=>[name,{
          default:null, parseHTML:(el:HTMLElement)=>el.style[name as 'fontFamily']||null,
          renderHTML:(attrs:Record<string,any>)=>attrs[name]?{style:name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+': '+attrs[name]}:{}
        }])),
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

  const paragraphTypography=['fontFamily','fontSize','fontWeight','lineHeight','color','marginBottom'] as const;
  const ParagraphTypography=Extension.create({name:'paragraphTypography',addGlobalAttributes(){return [{types:['paragraph','heading'],attributes:Object.fromEntries(paragraphTypography.map(name=>[name,{default:null,parseHTML:(el:HTMLElement)=>el.style[name]||null,renderHTML:(attrs:Record<string,any>)=>attrs[name]?{style:name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+': '+attrs[name]}:{}}]))}];}});

  @Component({
    selector: 'app-rich-text-editor',
    standalone: true,
    imports: [TranslocoPipe, CommonModule, FormsModule, HmIconComponent],
    templateUrl: './rich-text-editor.component.html',
    styleUrls: ['./rich-text-editor.component.css'],
    providers: [{
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    }],
  })
  export class RichTextEditorComponent implements AfterViewInit, OnChanges, OnDestroy, ControlValueAccessor {
    private readonly i18n = inject(TranslocoService);
    @Input() placeholder = 'editors.richText.placeholder';
    @Input() minHeight = 160;
    // Compact mode (2026-08-06) — for short fields like an update's title,
    // not a full story body: only Font Size / Color / Align. No headings,
    // no bold/italic/underline/strike, no lists, no link/blockquote — those
    // read as "editing a document", not "styling a headline".
    @Input() compact = false;
    @Input() selectionTypography = false;
    @Input() prototypeUx=false;
    @Input() paragraphSpacing=10;
    private formatBookmark:SelectionBookmark|null=null;
    private editingContext=false;
    get hasEditingContext(){return !!this.editor&&this.editingContext&&(this.editor.state.selection instanceof TextSelection||this.editor.state.selection instanceof AllSelection)&&!this.disabled;}
    rememberSelection(){if(this.editor&&(this.editor.state.selection instanceof TextSelection||this.editor.state.selection instanceof AllSelection)){this.formatBookmark=this.editor.state.selection.getBookmark();this.editingContext=true;}}
    get editingTarget(){if(!this.hasEditingContext)return '';const {from,to}=this.editor!.state.selection;return from===to?this.i18n.translate('editors.richText.atCursor'):this.editor!.state.doc.textBetween(from,to,' ').slice(0,70);}
    changeLocal(name:string,value:string){
      if(!this.hasEditingContext||!this.formatBookmark)return;
      if(['fontSize','lineHeight','marginBottom'].includes(name)&&(!value||!Number.isFinite(+value)||+value<0||(name!=='marginBottom'&&+value===0)))return;
      const editor=this.editor!,selection=this.formatBookmark.resolve(editor.state.doc);if(!(selection instanceof TextSelection||selection instanceof AllSelection))return;
      let chain=editor.chain().command(({tr})=>{if(!selection.eq(tr.selection))tr.setSelection(selection);return true;});
      if(name==='marginBottom')chain=chain.updateAttributes('paragraph',{marginBottom:+value+'px'});
      else {if(name==='fontFamily'&&value)ensureStackLoaded(value);if(name==='fontWeight')chain=chain.unsetBold();chain=chain.setMark('textStyle',{[name]:value?(name==='fontSize'?+value+'px':value):null});}
      chain.run();this.formatBookmark=editor.state.selection.getBookmark();
    }
    formattingState(name:string):{value:string;mixed:boolean;inherited:boolean;valid:boolean}{
      const editor=this.editor;if(!editor||!this.hasEditingContext)return {value:'',mixed:false,inherited:false,valid:false};
      const {from,to,empty}=editor.state.selection,values=new Set<string>();let inherited=true;
      const sample=(position:number,marks:readonly any[],paragraph:any)=>{
        const mark=marks.find(m=>m.type.name==='textStyle');const own=name==='marginBottom'?paragraph?.attrs[name]:mark?.attrs[name];
        const explicit=own??(name==='fontWeight'&&marks.some(m=>m.type.name==='bold')?'700':paragraph?.attrs[name]);if(explicit!=null)inherited=false;
        const point=editor.view.domAtPos(Math.min(Math.max(1,position),editor.state.doc.content.size));const dom=point.node.nodeType===1?(point.node.childNodes[point.offset]??point.node):point.node;const element=dom.nodeType===1?dom as HTMLElement:dom.parentElement;
        const css=getComputedStyle(element??editor.view.dom),paraCss=getComputedStyle(element?.closest('p,h1,h2,h3')??editor.view.dom);
        let value=String(explicit??(name==='marginBottom'?paraCss.marginBottom:css.getPropertyValue(name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()))));
        if(name==='fontSize'||name==='marginBottom'){const computed=name==='fontSize'?css.fontSize:paraCss.marginBottom;value=String(parseFloat(explicit&&/px$/.test(String(explicit))?String(explicit):computed)||0);}
        if(name==='lineHeight'){const raw=String(explicit??css.lineHeight);value=String(Math.round((raw.endsWith('px')?parseFloat(raw)/parseFloat(css.fontSize):parseFloat(raw)||1.6)*100)/100);}
        if(name==='fontFamily'){const first=value.split(',')[0].replace(/['"]/g,'').trim().toLowerCase();value=this.fonts.find(font=>font.stack.split(',')[0].replace(/['"]/g,'').trim().toLowerCase()===first)?.stack??value;}
        if(name==='color')value=toHex(value)??value;
        values.add(value);
      };
      if(empty)sample(from,editor.state.storedMarks??editor.state.selection.$from.marks(),editor.state.selection.$from.parent);
      else editor.state.doc.nodesBetween(from,to,(node,pos,parent)=>{if(node.isText)sample(Math.max(from,pos),node.marks,parent);});
      return {value:values.size===1?Array.from(values)[0]:'',mixed:values.size>1,inherited,valid:values.size>0};
    }
    knownFont(value:string){return this.fonts.some(font=>font.stack===value);}
    knownWeight(value:string){return this.weights.includes(value);}
    formatHint(name:string){const state=this.formattingState(name);return !state.valid?'editors.richText.chooseText':state.mixed?'editors.richText.mixedValues':state.inherited?'editors.richText.inheritedValue':'editors.richText.localValue';}
    formatPlaceholder(name:string){return this.i18n.translate(this.formattingState(name).mixed?'editors.richText.mixedValues':'editors.richText.chooseText');}
    get localColor(){return toHex(this.formattingState('color').value)??'#000000';}
    @Input() direction: 'rtl'|'ltr' = 'rtl';
    readonly fonts=CAMPAIGN_FONTS;
    readonly weights=['400','500','600','700','800','900'];
    private destroyed=false;
    ngOnChanges(changes:SimpleChanges){if(changes['direction']&&this.editor)this.editor.setOptions({editorProps:{attributes:{class:'hamonym-editor-content',dir:this.direction}}});}
    get selectionSummary(){return this.selectionTypography?'editors.richText.localFormatting':'editors.ui.advancedDesign';}
    selectedAttribute(name:string):string {
      const editor=this.editor;if(!editor)return '';
      const {from,to,empty}=editor.state.selection;
      if(empty)return String(editor.getAttributes('textStyle')[name]??(name==='fontWeight'&&editor.isActive('bold')?'700':''));
      const values=new Set<string>();
      editor.state.doc.nodesBetween(from,to,node=>{if(node.isText){const mark=node.marks.find(m=>m.type.name==='textStyle');values.add(String(mark?.attrs[name]??(name==='fontWeight'&&node.marks.some(m=>m.type.name==='bold')?'700':'')));}});
      return values.size===1?Array.from(values)[0]:'';
    }
    setLocalAttribute(name:'fontFamily'|'fontWeight'|'lineHeight',value:string){
      if(name==='lineHeight'&&value&&(!Number.isFinite(+value)||+value<=0))return;
      if(name==='fontFamily'&&value)ensureStackLoaded(value);
      let chain=this.editor?.chain().focus();if(name==='fontWeight')chain=chain?.unsetBold();
      chain?.setMark('textStyle',{[name]:value||null}).run();
    }
    setPreciseSize(value:string){if(!value){this.setFontSize('');return;}const size=Number(value);if(Number.isFinite(size)&&size>0)this.setFontSize(size+'px');}
    get preciseSize(){return this.selectedAttribute('fontSize').replace(/px$/,'');}

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
        if(this.destroyed)return;
        this.editor = new Editor({
          element: this.editorElement.nativeElement,
          extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] }, link:false, underline:false }),
            Underline,
            CustomTextStyle, ParagraphTypography,
            Highlight.configure({ multicolor: true }),
            // Every link a manager inserts opens in a NEW tab — a donor
            // clicking an external link inside campaign body text
            // shouldn't get navigated away from the donation page itself.
            // See DECISIONS.md (2026-07-31).
            Link.configure({
              openOnClick: false, autolink: true, linkOnPaste: true,
              HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
            }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Placeholder.configure({ placeholder: textOf(this.i18n, this.placeholder) }),
          ],
          content: this.value,
          editable: !this.disabled,
          editorProps: {
            attributes: { class: 'hamonym-editor-content', dir: this.direction },
          },
          onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            this.value = html;
            this.internalUpdate = true;
            this.onChange(html);
            this.internalUpdate = false;
          },
          onFocus: () => {this.rememberSelection();this.cdr.markForCheck();},
          onSelectionUpdate: () => {if(this.editor?.isFocused)this.rememberSelection();this.cdr.markForCheck();},
          onTransaction: ({transaction}) => {if(this.formatBookmark&&transaction.docChanged)this.formatBookmark=this.formatBookmark.map(transaction.mapping);this.cdr.markForCheck();},
          onBlur: () => { this.onTouched(); },
        });
        this.cdr.detectChanges();
      });
    }

    writeValue(value: string): void {
      const newValue = value || '';
      if (this.internalUpdate || newValue === this.value) return;
      this.value = newValue;
      if (this.editor) {this.editor.commands.setContent(this.value, { emitUpdate: false });this.formatBookmark=null;this.editingContext=false;}
    }
    registerOnChange(fn: any): void { this.onChange = fn; }
    registerOnTouched(fn: any): void { this.onTouched = fn; }
    setDisabledState(isDisabled: boolean): void {
      this.disabled = isDisabled;
      if (this.editor) this.editor.setEditable(!isDisabled);
    }

    toggleBold()        { const chain=this.editor?.chain().focus();if(this.selectionTypography)chain?.setMark('textStyle',{fontWeight:null});chain?.toggleBold().run(); }
    toggleItalic()      { this.editor?.chain().focus().toggleItalic().run(); }
    toggleUnderline()   { this.editor?.chain().focus().toggleUnderline().run(); }
    toggleStrike()      { this.editor?.chain().focus().toggleStrike().run(); }
    toggleBulletList()  { this.editor?.chain().focus().toggleBulletList().run(); }
    toggleOrderedList() { this.editor?.chain().focus().toggleOrderedList().run(); }
    toggleBlockquote()  { this.editor?.chain().focus().toggleBlockquote().run(); }
    setTextAlign(a: 'right'|'center'|'left') { this.editor?.chain().focus().setTextAlign(a).run(); }
    setParagraph()      { this.editor?.chain().focus().setParagraph().run(); }
    setHeading(level: 1|2|3) { this.editor?.chain().focus().toggleHeading({ level }).run(); }
    clearFormatting()   { this.editor?.chain().focus().unsetAllMarks().clearNodes().resetAttributes('paragraph',[...paragraphTypography]).unsetTextAlign().run(); }

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
      return this.selectedAttribute('color') || '#000000';
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
      return this.selectedAttribute('fontSize');
    }

    addLink(): void {
      if (!this.editor) return;
      const previousUrl = this.editor.getAttributes('link')['href'];
      const url = window.prompt(this.i18n.translate('editors.richText.enterLink'), previousUrl);
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

    ngOnDestroy(): void { this.destroyed=true; this.editor?.destroy(); }
  }
