import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_ICONS, ICON_GROUPS, CategoryIcon } from './categoryIcons';
import { registerSelectLayer } from './selectLayers';
import './category-icon-picker.css';

export function CategoryIconPicker({ value, name, disabled, onChange }: { value: string; name: string; disabled?: boolean; onChange: (value: string) => void | boolean | Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const close = () => { setOpen(false); };
  const [position, setPosition] = useState({ left: 8, top: 8, width: 400, maxHeight: 480 });
  const [theme, setTheme] = useState('system');
  const saving = useRef(false);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const button = trigger.current;
    const popup = panel.current;
    setTheme(button.closest('[data-theme]')?.getAttribute('data-theme') ?? 'system');
    const place = () => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const right = leftEdge + (viewport?.width ?? innerWidth) - 16;
      const bottom = topEdge + (viewport?.height ?? innerHeight) - 16;
      const below = bottom - rect.bottom - 6;
      const above = rect.top - topEdge - 6;
      const upward = below < 420 && above > below;
      const maxHeight = Math.max(0, Math.min(480, upward ? above : below));
      const width = Math.max(0, Math.min(420, right - leftEdge));
      setPosition({ left: Math.max(leftEdge, Math.min(rect.left, right - width)), top: upward ? Math.max(topEdge, rect.top - Math.min(popup.scrollHeight, maxHeight) - 6) : Math.max(topEdge, Math.min(rect.bottom + 6, bottom - maxHeight)), width, maxHeight });
    };
    const unregister = registerSelectLayer(button, popup, close);
    place();
    search.current?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => { if (!button.contains(event.target as Node) && !popup.contains(event.target as Node)) close(); };
    const focus = (event: FocusEvent) => { if (!popup.contains(event.target as Node)) search.current?.focus({ preventScroll: true }); };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    const observer = new ResizeObserver(place);
    observer.observe(button);
    observer.observe(popup);
    return () => {
      unregister(); observer.disconnect();
      document.removeEventListener('pointerdown', pointer); document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
      if (button.isConnected) button.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => { if (disabled && !saving.current) setOpen(false); }, [disabled]);
  const text = query.trim().toLowerCase();
  const entries = CATEGORY_ICONS.filter(entry => (group === '全部' || entry.group === group) && entry.keywords.includes(text));
  async function choose(symbol: string) {
    if (disabled || saving.current) return;
    saving.current = true;
    try { if (await onChange(symbol) !== false) close(); }
    finally { saving.current = false; }
  }
  return <div className="category-icon-picker">
    <button ref={trigger} type="button" className="category-icon-trigger" disabled={disabled} aria-label={`分类图标：${name}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><CategoryIcon symbol={value} /><span>选择图标</span></button>
    {open && createPortal(<div ref={panel} id={id} className="category-icon-panel category-icon-popover" data-theme={theme} style={position} role="dialog" aria-label={`${name}图标选择器`} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter(node => node.getClientRects().length);
        if (!nodes.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    }}>
      <div className="category-icon-search"><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索图标 / Search icons" aria-label="搜索分类图标" /><button type="button" onClick={close} aria-label="收起图标选择器">关闭</button></div>
      <div className="category-icon-groups" aria-label="图标分组">{['全部', ...ICON_GROUPS].map(item => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)}>{item}</button>)}</div>
      <div className="category-icon-summary" aria-live="polite">{entries.length} 个图标</div>
      {!value.startsWith('lucide:') && <button type="button" disabled={disabled} className="category-icon-legacy" onClick={() => choose(value)}><CategoryIcon symbol={value} /> 保留当前符号 {value}</button>}
      <div className="category-icon-grid" role="group" aria-label="可选图标" onKeyDown={event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        const columns = Math.max(1, Math.round(event.currentTarget.clientWidth / buttons[0].getBoundingClientRect().width));
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key] ?? 0);
        event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
      }}>{entries.map(entry => <button type="button" disabled={disabled} key={entry.id} title={`${entry.name} · ${entry.id.slice(7)}`} aria-label={`${entry.name} ${entry.id.slice(7)}`} aria-pressed={value === entry.id} onClick={() => choose(entry.id)}><CategoryIcon symbol={entry.id} /><span>{entry.name.split(' ')[0]}</span></button>)}</div>
      {!entries.length && <p className="category-icon-empty">没有匹配图标，试试中文或英文关键词。</p>}
    </div>, document.body)}
  </div>;
}
