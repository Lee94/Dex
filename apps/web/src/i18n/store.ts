/**
 * Framework-agnostic i18n store. Holds the active locale, detects it on first
 * load (saved preference → browser language → English), persists changes to
 * `localStorage`, keeps `<html lang>` in sync, and notifies subscribers.
 *
 * Kept free of React so plain helpers (e.g. `relativeTime` in lib/threads) can
 * read the active dictionary via {@link getDict}. The React binding lives in
 * `./hooks` and subscribes to this store with `useSyncExternalStore`.
 */
import { en, type Dict } from './locales/en';
import { zhCN } from './locales/zh-CN';

export type Locale = 'en' | 'zh-CN';

/** Selectable locales, in the order the language switcher lists them. */
export const LOCALES: { code: Locale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'zh-CN', nativeLabel: '简体中文' },
];

const DICTS: Record<Locale, Dict> = { en, 'zh-CN': zhCN };
const STORAGE_KEY = 'dex.locale';

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'zh-CN';
}

/** Initial locale: saved preference → first matching browser language → English. */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* localStorage may be unavailable (private mode) — fall through to detection. */
  }
  const langs =
    typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : [];
  for (const lang of langs) {
    const l = (lang ?? '').toLowerCase();
    if (l.startsWith('zh')) return 'zh-CN';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

/** The BCP-47 value written to `<html lang>` for the active locale. */
function htmlLang(locale: Locale): string {
  return locale === 'zh-CN' ? 'zh-CN' : 'en';
}

function applyHtmlLang(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = htmlLang(locale);
  }
}
applyHtmlLang(current);

export function getLocale(): Locale {
  return current;
}

/** The active translation dictionary. Re-read after every {@link setLocale}. */
export function getDict(): Dict {
  return DICTS[current];
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* Persisting is best-effort; the in-memory switch still applies this session. */
  }
  applyHtmlLang(locale);
  for (const listener of listeners) listener();
}

/** Subscribe to locale changes; returns an unsubscribe fn (for useSyncExternalStore). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
