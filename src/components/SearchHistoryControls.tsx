import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { writeHistory } from '../searchHistory';
export function SearchHistoryControls() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); }
      if (e.key === 'Tab') {
        const nodes = [...panel.current!.querySelectorAll('button')];
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); (previous.isConnected ? previous : trigger.current)?.focus(); };
  }, [open]);
  return <><button type="button" ref={trigger} onClick={() => { setError(''); setOpen(true); }}>清空搜索历史</button>{open && createPortal(<div className="modal-backdrop delete-backdrop"><section ref={panel} className="modal delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="search-history-confirm"><h2 id="search-history-confirm">清空搜索历史？</h2><p>仅删除本机保存的搜索词，无法撤销。</p>{error && <p role="alert">{error}</p>}<div className="delete-actions"><button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" className="delete-danger" onClick={() => { if (writeHistory([])) setOpen(false); else setError('清空失败，请检查本地存储权限。历史未更改。'); }}>确认清空</button></div></section></div>, document.body)}</>;
}
