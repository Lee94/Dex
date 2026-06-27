/**
 * React bindings for the i18n store. `useT` returns the active dictionary and
 * re-renders the calling component whenever the locale changes; `useLocale`
 * exposes the current locale plus a setter for the language switcher.
 *
 * This file exports only hooks (no components) so it doesn't trip the
 * `react/only-export-components` Fast-Refresh rule.
 */
import { useSyncExternalStore } from 'react';
import { getDict, getLocale, setLocale, subscribe, type Locale } from './store';
import type { Dict } from './locales/en';

/** The active translation dictionary; re-renders on locale change. */
export function useT(): Dict {
  return useSyncExternalStore(subscribe, getDict);
}

/** `[locale, setLocale]` — for the language switcher. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale);
  return [locale, setLocale];
}
