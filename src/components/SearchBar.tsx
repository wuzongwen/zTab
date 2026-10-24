import { useEffect, useId, useRef, useState } from 'react';
import { History, Search, X } from 'lucide-react';
import { safeUrl, type AppState } from '../model';
import { addHistory, readHistory, writeHistory, matchSites, HISTORY_EVENT, HISTORY_KEY } from '../searchHistory';
import { Select } from './Select';
import { SiteIcon } from './SiteIcon';
import { SearchHistoryControls } from './SearchHistoryControls';
import './search-bar.css';

export function SearchBar({ state, updateSettings, tell, context }: { state: AppState; updateSettings: (patch: Partial<AppState['settings']>) => Promise<boolean>; tell: (message: string) => void; context: string }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLFormElement>(null);
  const composing = useRef(false);
  const engineOpen = useRef(false);
  const id = useId();
  const engine = state.engines.find(e => e.id === state.settings.engine) ?? state.engines[0];
  const enabled = state.settings.searchHistoryEnabled;
  const notify = useRef(tell);
  notify.current = tell;
  useEffect(() => {
    const refresh = () => { const result = readHistory(); setHistory(result.items); if (result.error) notify.current(result.error); };
    const storage = (event: StorageEvent) => { if (event.key === HISTORY_KEY || event.key === null) refresh(); };
    refresh(); window.addEventListener(HISTORY_EVENT, refresh); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(HISTORY_EVENT, refresh); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => { setOpen(false); setActive(-1); }, [context, state.settings.showSearch, enabled]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !(event.target as Element).closest('.delete-backdrop')) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const sites = matchSites(state, query);
  const words = enabled ? history.filter(word => word.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const actions = [
    ...sites.map(hit => ({ label: hit.item.title, run: () => navigate(hit.item.url, state.settings.siteNewTab), hit })),
    ...words.map(word => ({ label: word, run: () => search(word), word })),
    ...(query.trim() ? [{ label: `使用${engine.name}搜索“${query.trim()}”`, run: () => search(query) }] : []),
  ];
  useEffect(() => { setActive(-1); }, [query, history, enabled]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, id]);
  function navigate(value: string, newTab: boolean) {
    try { const url = safeUrl(value); setOpen(false); if (newTab) window.open(url, '_blank', 'noopener,noreferrer'); else window.location.assign(url); }
    catch { tell('网址无效，未打开。'); }
  }
  function search(word: string) {
    word = word.trim(); if (!word || composing.current) return;
    try {
      const url = safeUrl(engine.template.replaceAll('{query}', encodeURIComponent(word)));
      if (enabled && word.length <= 200) {
        const current = readHistory();
        if (current.error) tell(current.error);
        else if (!writeHistory(addHistory(current.items, word))) tell('搜索历史保存失败；仍将正常搜索。');
      }
      setQuery(word); navigate(url, state.settings.searchNewTab);
    } catch { tell('搜索引擎网址无效，未搜索。'); }
  }
  return <form ref={root} className="search" hidden={!state.settings.showSearch} onSubmit={event => { event.preventDefault(); if (!composing.current) search(query); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !(event.relatedTarget as Element | null)?.closest('.delete-backdrop')) setOpen(false); }}>
    <div className="engine-select"><Select label="搜索引擎" compact display={engine.name === '必应' ? 'b' : engine.name.slice(0, 1)} value={engine.id} options={state.engines.map(e => ({ value: e.id, label: e.name }))} onOpenChange={value => { engineOpen.current = value; if (value) setOpen(false); }} onValueChange={value => { void updateSettings({ engine: value }); input.current?.focus(); }} /></div>
    <input ref={input} aria-label="搜索内容" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open && active >= 0 && active < actions.length ? `${id}-${active}` : undefined} value={query} placeholder="搜索一下，发现更多可能" onFocus={() => { if (!engineOpen.current) setOpen(true); }} onClick={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return; }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
      else if (event.key === 'Tab') setActive(-1);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (actions.length) setActive(current => current < 0 ? (event.key === 'ArrowDown' ? 0 : actions.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length); }
      else if (event.key === 'Enter') { event.preventDefault(); if (open && active >= 0 && actions[active]) actions[active].run(); else search(query); }
    }} />
    {query && <button type="button" className="search-clear" aria-label="清空搜索内容" onClick={() => { setQuery(''); input.current?.focus(); setOpen(true); }}><X size={16} /></button>}
    <button aria-label="搜索" type="submit"><Search size={21} /></button>
    {open && <div className="search-candidates"><div id={id} role="listbox" aria-label="本地网站与搜索历史">
      {actions.map((action, index) => <div className="search-candidate-row" key={'hit' in action ? action.hit.item.id : action.label}>
        <div role="option" id={`${id}-${index}`} aria-selected={active === index} className={`search-candidate ${active === index ? 'is-active' : ''}`} onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => action.run()}>
          {'hit' in action ? <span className="search-site-icon"><SiteIcon item={action.hit.item} /></span> : 'word' in action ? <History className="search-row-icon" size={15} aria-hidden="true" /> : <Search className="search-row-icon" size={15} aria-hidden="true" />}<span className="search-candidate-text"><span className="search-candidate-label">{action.label}</span>{'hit' in action && <small>{new URL(action.hit.item.url).hostname} · {action.hit.path}</small>}</span>
        </div>
        {'word' in action && <button type="button" aria-label={`删除搜索历史：${action.word}`} onClick={() => { const current = readHistory(); if (current.error || !writeHistory(current.items.filter(word => word.toLowerCase() !== action.word.toLowerCase()))) tell('删除历史失败，请检查本地存储权限。'); input.current?.focus(); }}><X size={14} /></button>}
      </div>)}
    </div>{!actions.length && <p>暂无本地匹配或搜索历史</p>}<div className="search-history-footer"><small>{enabled ? '仅本机保存最近30条搜索词，不随完整备份导出。' : '搜索历史已关闭，原记录保留；不提供联网建议。'}</small><SearchHistoryControls /></div></div>}
  </form>;
}
