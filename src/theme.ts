import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { AppState } from './model';

type Theme = AppState['settings']['theme'];
export function resolveTheme(preference: Theme, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
function subscribe(onChange: () => void) {
  const query = media();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
export function useSystemDark() {
  return useSyncExternalStore(subscribe, () => media().matches, () => false);
}
export function useRootTheme(preference: Theme, accent: string) {
  const systemDark = useSystemDark();
  const resolved = resolveTheme(preference, systemDark);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    root.style.setProperty('--accent', accent);
    const rgb = accent.slice(1).match(/../g)?.map(value => parseInt(value, 16)) ?? [0, 0, 0];
    const luminance = rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    root.style.setProperty('--accent-contrast', luminance[0] * .2126 + luminance[1] * .7152 + luminance[2] * .0722 > .179 ? '#111827' : '#ffffff');
  }, [resolved, accent]);
  return resolved;
}
