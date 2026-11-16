/** Lowercase without diacritics, so "ostra" finds "Östra". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** True when every word of `query` occurs somewhere in `fields`. */
export function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return words.every(w => haystack.includes(w));
}
