import type { LinkItem } from '../model';

// Only exact built-in URL/marker pairs opt in. Custom text and uploaded images
// always win; no network requests or persisted data migrations are involved.
export function brandFor(url: string, icon?: string) {
  const brands: Record<string, [string, string]> = {
    'https://github.com': ['GH', 'github'],
    'https://www.youtube.com': ['▶', 'youtube'],
    'https://www.figma.com': ['F', 'figma'],
    'https://www.notion.so': ['N', 'notion'],
    'https://www.bilibili.com': ['哔', 'bilibili'],
  };
  // safeUrl adds a root slash when the editor saves a built-in URL.
  const key = url.endsWith('/') ? url.slice(0, -1) : url;
  const entry = brands[key];
  return entry && entry[0] === icon ? entry[1] : undefined;
}

export function SiteIcon({ item }: { item: Pick<LinkItem, 'url' | 'icon' | 'title'> }) {
  if (item.icon?.startsWith('data:')) return <img src={item.icon} alt="" />;
  const brand = brandFor(item.url, item.icon);
  if (!brand) return <span style={{ width: 'auto', height: 'auto', borderRadius: 0 }}>{item.icon || item.title.trim().slice(0, 1) || '站'}</span>;
  return <svg viewBox="0 0 24 24" width="70%" height="70%" aria-hidden="true" focusable="false" data-brand={brand} fill="currentColor">
    {brand === 'github' && <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.14c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a11 11 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.15c0 .31.21.67.79.56A11.5 11.5 0 0 0 12 .7Z" />}
    {brand === 'youtube' && <><rect x="1" y="4" width="22" height="16" rx="5" /><path d="m10 8 6 4-6 4Z" fill="#f26668" /></>}
    {brand === 'figma' && <><path d="M8 2a4 4 0 1 0 0 8h4V2Z" fill="#f24e1e" /><path d="M12 2h4a4 4 0 0 1 0 8h-4Z" fill="#ff7262" /><path d="M8 10a4 4 0 1 0 0 8h4v-8Z" fill="#a259ff" /><circle cx="16" cy="14" r="4" fill="#1abcfe" /><path d="M8 18a4 4 0 1 0 4 4v-4Z" fill="#0acf83" /></>}
    {brand === 'notion' && <><path d="m3 3 15-1 3 3v16L6 22l-3-3Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h15M6 6v16M3 3l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9 18V9h2l5 7V9h2v1h-1v9h-2l-5-7v6h1v1H8v-1Z" /></>}
    {brand === 'bilibili' && <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m7 2 3 3m7-3-3 3" /><rect x="2" y="5" width="20" height="15" rx="3" /><path d="m7 10-1 4m11-4 1 4m-9 2 3 1 3-1M7 20v2m10-2v2" /></g>}
  </svg>;
}
