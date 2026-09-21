import type { Settings } from './bridge.d';

export type ThemePreference = Settings['theme'];
export type ResolvedTheme = Exclude<ThemePreference, 'auto'>;

const STORAGE_KEY = 'aurora-theme';

export function resolveThemePreference(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  return preference === 'auto' ? (prefersLight ? 'light' : 'dark') : preference;
}

export function readThemePreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'auto';
}

/**
 * Keep the persisted preference separate from the currently resolved palette.
 * This lets `auto` continue following the OS while CSS always receives light/dark.
 */
export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  if (preference === 'auto') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, preference);

  const resolved = resolveThemePreference(
    preference,
    matchMedia('(prefers-color-scheme: light)').matches,
  );
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  return resolved;
}
