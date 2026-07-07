import { Component, inject, ViewChild, ElementRef, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, DOCUMENT } from '@angular/common';
import { LucideAngularModule, Image, Video, Settings2, ChevronDown, ChevronUp } from 'lucide-angular';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import {
  CampaignStudioStateService, HeroType, CampaignDraft, RichTextBlockData,
} from '../../../../campaigns/services/campaign-studio-state.service';
import { CampaignApiService } from '../../../../campaigns/services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { UploadService } from '../../../../../core/services/upload.service';
import { environment } from '../../../../../../environments/environment';
import { TextStyle, CtaConfig } from '../../../../../shared/models/text-style.model';
import { ENTITY_CATEGORIES } from '../../../../../shared/config/entity-categories';

@Component({
  selector: 'app-campaign-basic-step',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LucideAngularModule,
    TextStyleEditorComponent, ColorPickerComponent, RichTextEditorComponent,
  ],
  templateUrl: './campaign-basic-step.component.html',
  styleUrl: './campaign-basic-step.component.css',
})
export class CampaignBasicStepComponent implements OnInit {
  protected state       = inject(CampaignStudioStateService);
  private entityService = inject(CurrentEntityService);
  private uploadService = inject(UploadService);
  private entitiesService = inject(EntitiesService);
  private campaignApi   = inject(CampaignApiService);
  private doc = inject(DOCUMENT);

  readonly ImageIcon   = Image;
  readonly VideoIcon   = Video;
  readonly Settings2   = Settings2;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp   = ChevronUp;

  // Categories sorted alphabetically (Hebrew locale)
  readonly categories = [...ENTITY_CATEGORIES].sort((a, b) =>
    a.label.localeCompare(b.label, 'he')
  );

  @ViewChild('heroImageInput') heroImageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('campaignLogoInput') campaignLogoInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('categoryInput') categoryInputRef?: ElementRef<HTMLInputElement>;

  entityLogoUrl: string | null = null;
  entityName = '';

  showAdvanced = false;

  // ── Category picker ──
  categorySearch = '';
  categoryDropdownOpen = false;

  get filteredCategories(): { id: string; label: string }[] {
    const q = this.categorySearch.trim().toLowerCase();
    if (!q) return this.categories;
    return this.categories.filter(c => c.label.toLowerCase().includes(q));
  }

  get categoryWordCount(): number {
    return this.categorySearch.trim() ? this.categorySearch.trim().split(/\s+/).length : 0;
  }

  openCategoryDropdown(): void {
    this.categorySearch = this.draft.category || '';
    this.categoryDropdownOpen = true;
  }

  onCategoryInput(value: string): void {
    const limited = value.length > 20 ? value.slice(0, 20) : value;
    this.categorySearch = limited;
    if (this.categoryInputRef && limited !== value) {
      this.categoryInputRef.nativeElement.value = limited;
    }
    this.state.patch({ category: limited.trim() });
    this.sync();
  }

  selectCategory(label: string): void {
    this.categorySearch = label;
    this.state.patch({ category: label });
    this.sync();
    this.categoryDropdownOpen = false;
  }

  onCategoryBlur(): void {
    setTimeout(() => { this.categoryDropdownOpen = false; }, 150);
  }

  @HostListener('document:keydown.escape')
  closeCategoryOnEscape(): void { this.categoryDropdownOpen = false; }

  slugTimeout: any;
  isCheckingSlug = false;
  slugAvailable: boolean | null = null;
  slugFocused = false;
  titleTouched = false;

  ngOnInit(): void {
    const entity = this.entityService.currentEntity();
    if (!entity?.id) return;
    this.entityName = entity.display_name || entity.legal_name || entity.name || '';
    this.entitiesService.getEntityById(entity.id).subscribe({
      next: (res: any) => {
        const raw = res?.logo_url ?? null;
        if (raw) {
          this.entityLogoUrl = (raw.startsWith('http') || raw.startsWith('data:image'))
            ? raw : `${environment.apiUrl}${raw}`;
        }
        if (!this.entityName)
          this.entityName = res?.display_name || res?.legal_name || res?.name || '';
        // Pre-populate manager name: prefer contact_full_name from entities table
        if (!this.state.draft.managerName) {
          const name = res?.contact_full_name || res?.admin_name || res?.contact_name || this.entityName;
          if (name) this.state.patch({ managerName: name });
        }
      },
    });
  }


  get draft(): CampaignDraft { return this.state.draft; }

  get urlPrefix(): string {
    return `${this.doc.location.origin}/campaigns/`;
  }

  // ── Story (first rich-text block) ──
  get storyContent(): string {
    const block = this.state.draft.blocks.find(b => b.type === 'rich-text');
    return (block?.data as RichTextBlockData)?.content || '';
  }

  setStoryContent(content: string): void {
    let found = false;
    const blocks = this.state.draft.blocks.map(b => {
      if (!found && b.type === 'rich-text') {
        found = true;
        return { ...b, data: { ...(b.data as RichTextBlockData), content } };
      }
      return b;
    });
    this.state.patch({ blocks });
  }

  // ── Hero ──
  sync(): void { this.state.sync(); }

  setHeroType(type: HeroType): void {
    if (type === 'image') {
      this.state.patch({ heroType: 'image', videoUrl: '' });
      if (!this.state.draft.coverImageUrl) {
        setTimeout(() => this.heroImageInputRef?.nativeElement.click(), 0);
      }
    } else {
      this.state.patch({ heroType: 'video', coverImageUrl: null });
    }
  }

  isUploadingCover = false;
  isUploadingLogo  = false;

  onCampaignLogoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingLogo = true;
    this.uploadService.upload(file, 'campaigns/logos').subscribe({
      next: url => { this.state.patch({ campaignLogoUrl: url }); this.isUploadingLogo = false; },
      error: ()  => { this.isUploadingLogo = false; },
    });
  }

  removeCampaignLogo(): void {
    this.state.patch({ campaignLogoUrl: null });
    if (this.campaignLogoInputRef) this.campaignLogoInputRef.nativeElement.value = '';
  }

  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingCover = true;
    this.uploadService.upload(file, 'campaigns/covers').subscribe({
      next: url => { this.state.patch({ coverImageUrl: url }); this.isUploadingCover = false; },
      error: ()  => { this.isUploadingCover = false; },
    });
  }

  getYoutubeThumbnail(url: string): string | null {
    if (!url) return null;
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
    }
    return null;
  }

  get hasHero(): boolean {
    return this.draft.heroType === 'image' ? !!this.draft.coverImageUrl : !!this.draft.videoUrl;
  }

  // ── Advanced ──
  onTextStyleChange(style: TextStyle): void { this.state.patch({ heroTextStyle: style }); }
  onCtaConfigChange(cta: CtaConfig): void   { this.state.patch({ heroCtaConfig: cta }); }

  patchLogo(partial: Partial<Pick<CampaignDraft,
    'logoPlacement' | 'logoStripAlign' | 'logoStripBg' | 'showEntityName'>>): void {
    this.state.patch(partial);
  }

  // ── Slug ──
  onSlugBlur(): void { this.slugFocused = false; }

  allowSlugChars(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowed.includes(event.key)) return;
    if (!/^[a-zA-Z0-9-]$/.test(event.key)) event.preventDefault();
  }

  onSlugChange(value: string): void {
    const normalized = value.toLowerCase();
    this.state.patch({ slug: normalized });
    clearTimeout(this.slugTimeout);
    if (!normalized || normalized.trim().length < 3) {
      this.slugAvailable = null; this.isCheckingSlug = false; return;
    }
    this.isCheckingSlug = true; this.slugAvailable = null;
    this.slugTimeout = setTimeout(() => {
      const excludeId = this.state.draft.id;
      this.campaignApi.checkSlugAvailable(normalized.trim(), excludeId).subscribe({
        next: (available) => { this.slugAvailable = available; this.isCheckingSlug = false; },
        error: ()          => { this.slugAvailable = null;      this.isCheckingSlug = false; },
      });
    }, 800);
  }

  isTitleInvalid(): boolean { return this.titleTouched && !this.draft.title.trim(); }
}
