// Bilingual UI kill switches (docs/BILINGUAL-I18N-ROADMAP.md §2.5).
// Development build: English is available for QA. Production uses
// i18n-flags.prod.ts (angular.json fileReplacements), where everything is off.
export const I18N_FLAGS = {
  // Shows the HE/EN selector; when false the interface is Hebrew-only.
  englishEnabled: true,
  // Public campaign pages and checkout (Phase 7a).
  publicEnglishEnabled: false,
  // CardCom-hosted pages in English (Phase 7b, provider-sensitive).
  englishProviderPagesEnabled: false,
};
