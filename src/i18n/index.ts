/**
 * UI translations. Swedish is the source language and the key:
 *   t('Ansökningar')                      -> 'Applications' in English
 *   t('Inaktivera {name}?', { name })     -> placeholders are filled in
 * Missing English entries fall back to Swedish (a test fails the build if a
 * wrapped text has no English entry).
 *
 * The language is decided once when the app loads (account choice, saved
 * browser choice or the browser's language). Switching language saves the
 * choice and reloads the page, so texts defined at module level (label
 * tables) are always in the right language.
 */
import EN from './en';

export type Language = 'sv' | 'en';
const STORAGE_KEY = 'ag-lang';

function detect(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'sv' || saved === 'en') return saved;
  } catch { /* private mode */ }
  if (typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language || '')) return 'en';
  return 'sv';
}

let current: Language = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLanguage(): Language {
  return current;
}

/** Locale for dates and numbers. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'sv-SE';
}

const DICT: Record<string, string> = EN;

export function t(sv: string, params?: Record<string, string | number | null | undefined>): string {
  const text = current === 'en' ? (DICT[sv] ?? sv) : sv;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
}

/**
 * Change language. Saves the choice in the browser and reloads the page
 * (unless it is already active). The account setting is saved by the caller.
 */
export function setLanguage(lang: Language, { reload = true }: { reload?: boolean } = {}): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (reload && typeof window !== 'undefined') window.location.reload();
}

export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(locale());
}

export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString(locale());
}
