// The UI selects one ordered list of categories; the API still stores a
// primary category plus secondary ones. The first selected category is the
// primary, so removing it promotes the next one.

export function joinCategories(primary: string | null | undefined, secondary: string[] | null | undefined): string[] {
  return [...new Set([primary, ...(secondary ?? [])].filter((id): id is string => !!id))];
}

export function splitCategories(list: string[]): { primary: string; secondary: string[] } {
  const [primary = '', ...secondary] = [...new Set(list.filter(Boolean))];
  return { primary, secondary };
}

/** Partial, case- and niqqud-insensitive match for the category search. */
export function normalizeCategoryText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('he-IL');
}
