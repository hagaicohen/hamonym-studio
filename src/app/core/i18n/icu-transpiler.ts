import { Injectable } from '@angular/core';
import { DefaultTranspiler, TranspileParams } from '@jsverse/transloco';
import MessageFormat, { MessageFunction } from '@messageformat/core';

// Plural/select support without exposing interpolated data to ICU parsing.
// Only messages that contain an ICU argument ("{count, plural, ...}") are
// compiled by messageformat, which substitutes the params itself; everything
// else uses Transloco's plain {{param}} interpolation. An organization or
// campaign name containing "{" or "'" can therefore never break a message.
const ICU = /\{\s*[\w.]+\s*,\s*(?:plural|select|selectordinal)\s*,/;

const KEY_SHAPE = /^[a-z][\w-]*(\.[\w-]+)+$/;

function withTranslatedKeys(params: Record<string, unknown> | undefined, translation: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!params || !translation) return params;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && KEY_SHAPE.test(v) && typeof translation[v] === 'string') (out ??= { ...params })[k] = translation[v];
  }
  return out ?? params;
}

@Injectable()
export class HmTranspiler extends DefaultTranspiler {
  private locale = 'he';
  private readonly formats = new Map<string, MessageFormat>();
  private readonly compiled = new Map<string, MessageFunction<'string'>>();

  override transpile(data: TranspileParams): any {
    const { value } = data;
    // A parameter that is itself a translation key (a status or job label from a
    // label map) is shown translated, in the same language, never as a raw key.
    const params = withTranslatedKeys(data.params, data.translation);
    if (params !== data.params) data = { ...data, params };
    if (typeof value === 'string' && ICU.test(value)) return this.format(value, params ?? {});
    return super.transpile(data);
  }

  onLangChanged(lang: string): void {
    this.locale = lang;
  }

  private format(message: string, params: Record<string, unknown>): string {
    const id = `${this.locale}\u0000${message}`;
    let fn = this.compiled.get(id);
    if (!fn) {
      let mf = this.formats.get(this.locale);
      if (!mf) {
        mf = new MessageFormat(this.locale);
        this.formats.set(this.locale, mf);
      }
      fn = mf.compile(message);
      this.compiled.set(id, fn);
    }
    return fn(params);
  }
}

