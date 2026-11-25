import { ChangeDetectionStrategy, Component, computed, inject , effect, untracked } from '@angular/core';
import { ManagementModelService, ManagementCategory, publicFriendlyUrl } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { MediaStoreService } from '../../media/media-store.service';
import { ComboOption, MANAGEMENT_FIELDS, clearFile, writeValue } from '../fields';
import { mediaAttrs } from '../fields/markup';
import { STUDIO_SLUG } from '../../../studio-slug';
import { WizardSlugComponent } from '../../wizard/wizard-slug.component';
import { CategorySelectorComponent } from '../../../../../../shared/ui/category-picker/category-selector.component';
import { ManagementEditService } from '../management-edit.service';

/**
 * "פרטי הקמפיין" (old engine `campaignDetailsPage`: campaign kind, `identity()` and the
 * collapsed "צוות והרשאות" group, old `access()`). Also shown for the old `access` page key.
 * Edits go through the `data-hu-path` document handlers; the category fields are Angular comboboxes.
 */
@Component({
  selector: 'ham-mgmt-identity',
  standalone: true,
  imports: [...MANAGEMENT_FIELDS, WizardSlugComponent, CategorySelectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './identity-page.component.html'
})
export class IdentityPageComponent {
  readonly slug = inject(STUDIO_SLUG, { optional: true });
  readonly managerTitle = 'האחראי על הקמפיין';
  readonly managerHelp = 'מנהל הארגון שיצר את הקמפיין נקבע אוטומטית. לא ניתן לשנות את זהותו ב־Studio.';
  readonly view = inject(ManagementViewService);
  readonly clearFile = clearFile;
  private readonly model = inject(ManagementModelService);
  private readonly edit = inject(ManagementEditService);
  chooseCategory(ids: string[], subcategory?: string): void {
    const category = this.model.context.campaignCategoryCatalog.find(item => item.id === ids[0]);
    if (!category) return;
    this.edit.snapshot();
    if (this.model.context.categoryByLabel(String(this.model.get('meta.category') || ''))?.id !== category.id) this.edit.commit('meta.category', category.label, { rebuild: subcategory === undefined });
    if (subcategory !== undefined) this.edit.commit('meta.subcategory', subcategory, { rebuild: true });
  }
  private readonly media = inject(MediaStoreService);

  /**
   * Everything the template shows, read from the campaign state once per redraw. Like the old
   * markup, the page changes at a redraw and not in between (extra change-detection passes,
   * e.g. from a combobox listener, return the same snapshot).
   */
  readonly vm = computed(() => {
    this.view.revision();
    const ctx = this.model.context, get = (p: string) => this.model.get(p);
    const chosen: ManagementCategory | undefined = ctx.categoryByLabel(get('meta.category'));
    const subs = (chosen?.sub || []).map(x => [x, x] as [string, string]).sort((a, b) => this.model.collator.compare(a[1], b[1]));
    const photo = String(get('meta.managerPhoto') || '');
    return {
      categories: ctx.campaignCategoryCatalog,
      categoryIds: chosen ? [chosen.id] : [],
      subcategory: String(get('meta.subcategory') || ''),
      categoryOptions: [...ctx.campaignCategoryCatalog].sort((a, b) => this.model.collator.compare(a.label, b.label))
        .map((x): ComboOption => ({ value: x.label, label: x.label, search: [x.label, ...(ctx.categoryByLabel(x.label)?.sub || [])].join(' ') })),
      subcategoryOptions: [['', 'ללא תת־קטגוריה'] as [string, string], ...subs].map(([value, label]): ComboOption => ({ value, label, search: label })),
      categoryHint: this.model.externalCategoryCatalog ? 'קטגוריות המערכת, ממוינות וניתנות לחיפוש.' : 'בחרו את הקטגוריה המתאימה לקמפיין.',
      mobileHeroEnabled: !!this.model.nget('mobileHero')?.enabled,
      storyBlocks: (this.state()['content'].story.blocks || []).length as number,
      managerPhoto: photo,
      hasSessionManager: !!this.model.linkedSessionManager?.name,
      managerName: String(get('meta.manager') || 'לא הוגדר מנהל')
    };
  });

  private state() { return this.model.context.readState(); }

  readonly writeKind = writeValue(() => this.model.campaignKind());
  /** The avatar's children are also replaced by the media upload service; Angular never owns them. */
  readonly writeAvatar = (el: HTMLElement): void => {
    this.avatar = el;
    const photo = String(this.model.get('meta.managerPhoto') || '');
    el.innerHTML = photo ? `<img ${mediaAttrs(photo, ref => this.media.src(ref))} alt="תמונת מנהל הקמפיין">` : '👤';
  };
  private avatar: HTMLElement | null = null;
  /** A manager photo that loads after the page was drawn is shown then (v4.62: formerly the DOM patcher). */
  private readonly avatarMedia = effect(() => { this.media.version(); untracked(() => { if (this.avatar?.isConnected && this.avatar.querySelector('img[data-ham-media-ref]')) this.writeAvatar(this.avatar); }); });
  /** Also updated while the slug is typed (ManagementEditService.writeSharePreview). */
  readonly writeShareLink = (el: HTMLAnchorElement): void => {
    const url = String(this.state()['content'].share.url);
    el.href = url;
    el.textContent = publicFriendlyUrl(url);
  };
}
