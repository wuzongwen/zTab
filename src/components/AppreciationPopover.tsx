import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X } from 'lucide-react';
import './appreciation-popover.css';

export function AppreciationPopover({ open, onOpenChange, side }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: 'left' | 'right';
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const button = trigger.current;
    const popup = panel.current;
    const sidebar = button.closest('.sidebar');
    const viewport = window.visualViewport;
    const place = () => {
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const right = left + (viewport?.width ?? window.innerWidth) - 16;
      const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
      popup.style.width = `${Math.max(0, Math.min(306, right - left, bottom - top - 62))}px`;
      popup.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      const rect = button.getBoundingClientRect();
      const size = popup.getBoundingClientRect();
      const beside = side === 'right' ? rect.left - size.width - 10 : rect.right + 10;
      popup.style.left = `${Math.max(left, Math.min(beside, right - size.width))}px`;
      popup.style.top = `${Math.max(top, Math.min(rect.bottom, bottom) - size.height)}px`;
    };
    const pointer = (event: PointerEvent) => {
      if (!button.contains(event.target as Node) && !popup.contains(event.target as Node)) onOpenChange(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onOpenChange(false);
      button.focus({ preventScroll: true });
    };
    place();
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    sidebar?.addEventListener('transitionend', place);
    const observer = new ResizeObserver(place);
    observer.observe(button);
    observer.observe(popup);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      sidebar?.removeEventListener('transitionend', place);
    };
  }, [open, onOpenChange, side]);
  return <>
    <button ref={trigger} type="button" className="appreciation-trigger" title="赞赏" aria-label="赞赏" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => onOpenChange(!open)}>
      <Heart size={20} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={panel} id={id} className="appreciation-popover" role="dialog" aria-label="微信赞赏码">
      <div className="appreciation-heading"><strong>赞赏支持</strong><button type="button" aria-label="关闭赞赏码" onClick={() => { onOpenChange(false); trigger.current?.focus({ preventScroll: true }); }}><X size={16} aria-hidden="true" /></button></div>
      <img src={`${import.meta.env.BASE_URL}wechat-appreciation.jpeg`} width="1167" height="1167" alt="微信赞赏码，感谢您的支持" draggable={false} />
      <p>微信扫一扫，感谢支持</p>
    </div>, document.body)}
  </>;
}
