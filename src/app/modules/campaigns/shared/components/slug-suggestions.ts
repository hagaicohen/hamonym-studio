const LATIN: Record<string, string> = {
  א:'a', ב:'b', ג:'g', ד:'d', ה:'h', ו:'v', ז:'z', ח:'ch', ט:'t', י:'y',
  כ:'k', ך:'k', ל:'l', מ:'m', ם:'m', נ:'n', ן:'n', ס:'s', ע:'a',
  פ:'p', ף:'f', צ:'ts', ץ:'ts', ק:'k', ר:'r', ש:'sh', ת:'t',
};

export function suggestPublicSlug(name: string, mode: 'he' | 'en', limit: number): string {
  const text = mode === 'en' ? name.replace(/[א-ת]/g, letter => LATIN[letter]) : name;
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-ת-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, limit).replace(/-$/, '');
}
