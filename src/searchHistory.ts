import type { AppState } from './model';
export const HISTORY_KEY = 'ztab.search-history';
export const HISTORY_EVENT = 'ztab:search-history';
export function cleanHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((word): word is string => {
    if (typeof word !== 'string' || !word.trim() || word.trim().length > 200) return false;
    const key = word.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(word => word.trim()).slice(0, 30);
}
export function addHistory(history: string[], word: string) {
  word = word.trim();
  return !word || word.length > 200 ? history : cleanHistory([word, ...history]);
}
export function readHistory(storage?: Pick<Storage, 'getItem'>): { items: string[]; error: string } {
  try { return { items: cleanHistory(JSON.parse((storage ?? localStorage).getItem(HISTORY_KEY) ?? '[]')), error: '' }; }
  catch { return { items: [], error: '搜索历史无法读取；仍可正常搜索。' }; }
}
export function writeHistory(items: string[], storage?: Pick<Storage, 'setItem'>): boolean {
  try { (storage ?? localStorage).setItem(HISTORY_KEY, JSON.stringify(cleanHistory(items))); if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_EVENT)); return true; }
  catch { return false; }
}
export function matchSites(state: Pick<AppState, 'links' | 'categories' | 'folders'>, query: string) {
  const word = query.trim().toLowerCase();
  if (!word) return [];
  return state.links.map((item, index) => {
    const name = item.title.toLowerCase();
    const rank = name.startsWith(word) ? 0 : name.includes(word) ? 1 : item.url.toLowerCase().includes(word) ? 2 : 3;
    const path = [state.categories.find(c => c.id === item.category)?.name, state.folders.find(f => f.id === item.folder)?.name].filter(Boolean).join(' / ');
    return { item, rank, index, path };
  }).filter(hit => hit.rank < 3).sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, 8);
}
