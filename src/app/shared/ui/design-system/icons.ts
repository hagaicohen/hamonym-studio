import { EnvironmentProviders, inject, makeEnvironmentProviders, ENVIRONMENT_INITIALIZER } from '@angular/core';
import { LucideIconConfig } from 'lucide-angular';

/** Icon sizes and stroke for design-system components and new screens. */
export const HM_ICON_SIZE = { sm: 16, md: 20, lg: 24, xl: 40 } as const;
export const HM_ICON_STROKE = 1.75;

/* Global Lucide defaults, kept equal to the library defaults: 35 existing
   icons set no size and 160 set no stroke width, so changing these would
   restyle screens that have not been migrated yet. */
export const HM_LUCIDE_GLOBAL_DEFAULTS = {
  size: 24,
  strokeWidth: 2,
  color: 'currentColor',
  absoluteStrokeWidth: false,
} as const;

export function provideHmIconDefaults(): EnvironmentProviders {
  return makeEnvironmentProviders([{
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useValue: () => Object.assign(inject(LucideIconConfig), HM_LUCIDE_GLOBAL_DEFAULTS),
  }]);
}
