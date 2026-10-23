import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { dismissSelectOnEscape } from './selectLayers'

const layers: HTMLElement[] = []
const topLayer = () => [...layers].reverse().find(element => !element.parentElement?.inert)
let scrollLocks = 0
let previousOverflow = ''
let previousGutter = ''

export function AnimatedOverlay({ open, onClose, label, id, variant = 'widget', className = '', children }: {
  open: boolean
  onClose: () => void
  label: string
  id?: string
  variant?: 'folder' | 'widget'
  className?: string
  children: ReactNode
}) {
  const [present, setPresent] = useState(open)
  const [visible, setVisible] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const enterFrame = useRef(0)
  const enterNextFrame = useRef(0)
  const exitTimer = useRef(0)
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (open) {
      setPresent(true)
      if (reduced) setVisible(true)
      else enterFrame.current = requestAnimationFrame(() => { enterNextFrame.current = requestAnimationFrame(() => setVisible(true)) })
    } else {
      setVisible(false)
      if (reduced) setPresent(false)
      else exitTimer.current = window.setTimeout(() => setPresent(false), 300)
    }
    return () => { cancelAnimationFrame(enterFrame.current); cancelAnimationFrame(enterNextFrame.current); clearTimeout(exitTimer.current) }
  }, [open])

  useEffect(() => {
    if (!present) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => {
      if (!media.matches) return
      cancelAnimationFrame(enterFrame.current)
      cancelAnimationFrame(enterNextFrame.current)
      clearTimeout(exitTimer.current)
      setVisible(open)
      if (!open) setPresent(false)
    }
    media.addEventListener('change', reduce)
    return () => media.removeEventListener('change', reduce)
  }, [open, present])

  useEffect(() => {
    const element = panel.current
    if (!present || !element) return
    const trigger = document.activeElement as HTMLElement | null
    layers.push(element)
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow
      previousGutter = document.documentElement.style.scrollbarGutter
      document.documentElement.style.scrollbarGutter = 'stable'
      document.body.style.overflow = 'hidden'
    }
    element.focus({ preventScroll: true })
    const isTop = () => topLayer() === element && !document.querySelector('.modal-backdrop, .site-context-menu')
    const keydown = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return
      if (dismissSelectOnEscape(event, element)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      }
      if (event.key === 'Tab') {
        const targets = [...element.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden], [inert]'))
        const first = targets[0]
        const last = targets.at(-1)
        if (!first) { event.preventDefault(); element.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
    }
    const focusin = (event: FocusEvent) => {
      if (isTop() && !element.contains(event.target as Node)) element.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      layers.splice(layers.indexOf(element), 1)
      if (--scrollLocks === 0) {
        document.body.style.overflow = previousOverflow
        document.documentElement.style.scrollbarGutter = previousGutter
      }
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      if (trigger?.isConnected && (!topLayer() || topLayer()?.contains(trigger)) && !document.querySelector('.modal-backdrop')) trigger.focus({ preventScroll: true })
    }
  }, [present])

  useEffect(() => {
    if (open && present && !panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
  }, [open, present])

  return createPortal(<div className={`animated-overlay animated-overlay-${variant} ${visible ? 'is-visible' : ''}`} hidden={!present} inert={!open} onPointerDown={event => {
    if (event.target === event.currentTarget) close.current()
  }}>
    <div ref={panel} id={id} className={`animated-overlay-panel ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
      <button type="button" className="animated-overlay-close" aria-label={`关闭${label}`} onClick={onClose}><X size={21} /></button>
      {children}
    </div>
  </div>, document.body)
}
