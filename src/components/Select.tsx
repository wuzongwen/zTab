import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { registerSelectLayer } from './selectLayers'
import './select.css'

export type SelectOption = { value: string; label: string }
export function Select({ value, options, onValueChange, disabled = false, label, compact, display, onOpenChange }: {
  value: string; options: SelectOption[]; onValueChange: (value: string) => void;
  disabled?: boolean; label: string; theme?: string; compact?: boolean; display?: ReactNode; onOpenChange?: (open: boolean) => void;
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 })
  const typed = useRef({ text: '', time: 0 })
  const selected = options.findIndex(option => option.value === value)
  const visible = open && !disabled && options.length > 0
  const openCallback = useRef(onOpenChange)
  openCallback.current = onOpenChange
  useLayoutEffect(() => { openCallback.current?.(visible) }, [visible])
  const close = () => setOpen(false)
  const choose = (index: number) => {
    const option = options[index]
    close()
    if (option && option.value !== value) onValueChange(option.value)
  }
  useLayoutEffect(() => {
    if (!visible || !trigger.current || !popup.current) return
    const button = trigger.current
    const list = popup.current
    const positionList = () => {
      const rect = button.getBoundingClientRect()
      const below = innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const upward = below < Math.min(280, options.length * 38 + 12) && above > below
      const maxHeight = Math.max(0, Math.min(280, upward ? above : below))
      const width = Math.min(Math.max(rect.width, compact ? 180 : 200), innerWidth - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top: upward ? Math.max(8, rect.top - Math.min(list.scrollHeight, maxHeight) - 6) : rect.bottom + 6, width, maxHeight })
    }
    positionList()
    const unregister = registerSelectLayer(button, list, close)
    const pointer = (event: PointerEvent) => { if (!button.contains(event.target as Node) && !list.contains(event.target as Node)) close() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close() } }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', positionList)
    window.addEventListener('scroll', positionList, true)
    const observer = new ResizeObserver(positionList)
    observer.observe(button)
    return () => { unregister(); observer.disconnect(); document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', positionList); window.removeEventListener('scroll', positionList, true) }
  }, [visible, compact, options.length])
  useLayoutEffect(() => { if (visible) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, visible, id])
  useLayoutEffect(() => { if (disabled) close() }, [disabled])
  return <><button ref={trigger} type="button" role="combobox" className={`ztab-select ${compact ? 'ztab-select-compact' : ''}`}
    aria-label={label} aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? id : undefined} aria-activedescendant={visible ? `${id}-${active}` : undefined}
    disabled={disabled || !options.length} onBlur={close}
    onClick={() => { setActive(Math.max(0, selected)); setOpen(!visible) }}
    onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        setOpen(true)
        setActive(current => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : !visible ? Math.max(0, selected) : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (visible) choose(active)
        else { setActive(Math.max(0, selected)); setOpen(true) }
      } else if (event.key === 'Tab') close()
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now()
        typed.current = { text: now - typed.current.time < 700 ? typed.current.text + event.key : event.key, time: now }
        const text = typed.current.text.toLocaleLowerCase()
        const index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(text))
        if (index >= 0) { event.preventDefault(); setActive(index); setOpen(true) }
      }
    }}><span className="ztab-select-value">{display ?? options[selected]?.label ?? '请选择'}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {visible && createPortal(<div ref={popup} id={id} role="listbox" aria-label={label} className="ztab-select-popup" style={position} onPointerDown={event => event.preventDefault()}>
      {options.map((option, index) => <div id={`${id}-${index}`} key={option.value} role="option" aria-selected={option.value === value} className={`ztab-select-option ${index === active ? 'is-active' : ''}`} onPointerMove={() => setActive(index)} onClick={event => { event.stopPropagation(); choose(index) }}><span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}</div>)}
    </div>, document.body)}
  </>
}
