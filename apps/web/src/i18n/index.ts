/**
 * i18n public surface. Components use the hooks (`useT` / `useLocale`); plain
 * helpers use `getDict`. See `./store` for detection/persistence and `./locales`
 * for the dictionaries.
 */
export { useT, useLocale } from './hooks';
export { LOCALES, getDict, getLocale, setLocale, type Locale } from './store';
export type { Dict } from './locales/en';
