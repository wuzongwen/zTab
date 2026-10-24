import { useLayoutEffect, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export function reorderItems<T extends { id: string }>(items: T[], source: string, target: string): T[] {
  const from = items.findIndex(item => item.id === source)
  const to = items.findIndex(item => item.id === target)
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

type Session<T> = {
  pointer: number; x: number; y: number; startX: number; startY: number
  offsetX: number; offsetY: number; id: string; element: HTMLElement
  active: boolean; clone?: HTMLElement; timer?: number; frame?: number
  order: T[]; destination?: string; target?: HTMLElement; valid: boolean
  slots: (DOMRect | undefined)[]; scrollY: number; scrollTop: number; scrollArea: HTMLElement | null
  lastSwap?: { x: number; y: number }
  sortHover?: { id: string; since: number }
  group?: { id: string; node: HTMLElement; rect: DOMRect; since: number; x: number; y: number; ready: boolean }
  cleanup: () => void
}

export function useTileDrag<T extends { id: string }>({ items, scope, disabled, onCommit, onStart, allowFolders = false, canDrop = () => true, canGroup, onGroup }: {
  items: T[]
  scope: string
  disabled?: boolean
  onCommit: (items: T[], destination: string | undefined, source: string) => Promise<unknown> | void
  onStart?: () => void
  allowFolders?: boolean
  canDrop?: (id: string) => boolean
  canGroup?: (source: string, target: string) => boolean
  onGroup?: (source: string, target: string, items: T[]) => Promise<unknown> | void
}) {
  const [preview, setPreview] = useState<T[] | null>(null)
  const [dragging, setDragging] = useState<string>()
  const session = useRef<Session<T> | null>(null)
  const saving = useRef(false)
  const latest = useRef({ items, onCommit, onStart, disabled, canGroup, onGroup })
  latest.current = { items, onCommit, onStart, disabled, canGroup, onGroup }
  const positions = useRef(new Map<HTMLElement, DOMRect>())
  const animations = useRef(new Map<HTMLElement, Animation>())
  const getRoot = () => [...document.querySelectorAll<HTMLElement>('[data-drag-scope]')].find(element => element.dataset.dragScope === scope)
  const measure = () => {
    positions.current.clear()
    const root = getRoot()
    root?.querySelectorAll<HTMLElement>('[data-sort-id]').forEach(element => { if (element.closest('[data-drag-scope]') === root) positions.current.set(element, element.getBoundingClientRect()) })
  }
  useLayoutEffect(() => {
    if (!positions.current.size) return
    for (const [element, before] of positions.current) {
      animations.current.get(element)?.cancel()
      const after = element.getBoundingClientRect()
      const x = before.left - after.left
      const y = before.top - after.top
      if ((x || y) && element.dataset.sortId !== dragging && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animations.current.set(element, element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], { duration: 300, easing: 'ease' }))
      }
    }
    positions.current.clear()
  }, [preview, dragging])

  const clearGroup = (current: Session<T>) => {
    current.group?.node.classList.remove('tile-group-candidate', 'tile-group-ready')
    current.group = undefined
  }
  const reset = () => {
    const current = session.current
    if (!current) return
    current.cleanup()
    clearGroup(current)
    current.clone?.remove()
    current.target?.classList.remove('tile-drop-target')
    document.body.classList.remove('tiles-dragging')
    if (current.active) measure()
    else positions.current.clear()
    session.current = null
    setPreview(null)
    setDragging(undefined)
  }
  useEffect(() => {
    const cancel = () => { if (!saving.current) reset() }
    window.addEventListener('blur', cancel)
    return () => { window.removeEventListener('blur', cancel); reset(); animations.current.forEach(animation => animation.cancel()) }
  }, [scope])
  useEffect(() => { if (disabled && !saving.current) reset() }, [disabled])

  function onPointerDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary || latest.current.disabled || saving.current || session.current) return
    if ((event.target as HTMLElement).closest('[data-no-drag], input, textarea, select, .site-controls, .site-menu-trigger, .animated-overlay-close')) return
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    const touch = event.pointerType === 'touch'
    const current: Session<T> = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
      element, id, active: false, order: latest.current.items, valid: true, cleanup: () => {},
      slots: [], scrollY: window.scrollY, scrollTop: 0, scrollArea: null,
    }
    session.current = current
    const suppressClick = (click: MouseEvent) => {
      click.preventDefault(); click.stopImmediatePropagation()
      document.removeEventListener('click', suppressClick, true)
    }
    const armClickGuard = () => {
      const clear = () => {
        document.removeEventListener('click', suppressClick, true)
        document.removeEventListener('pointerdown', clear, true)
      }
      document.addEventListener('click', suppressClick, true)
      document.addEventListener('pointerdown', clear, true)
      window.setTimeout(clear, 400)
    }
    const start = () => {
      if (session.current !== current || latest.current.disabled) return
      current.active = true
      const root = getRoot()
      current.slots = []
      current.scrollArea = root?.closest<HTMLElement>('.animated-overlay-panel, .desktop') ?? null
      current.scrollTop = current.scrollArea?.scrollTop ?? 0
      current.scrollY = window.scrollY
      latest.current.onStart?.()
      const clone = element.cloneNode(true) as HTMLElement
      clone.classList.add('tile-drag-clone')
      clone.classList.remove('tile-drag-placeholder')
      clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
      clone.removeAttribute('id')
      clone.removeAttribute('data-sort-id')
      clone.setAttribute('aria-hidden', 'true')
      clone.inert = true
      const size = getComputedStyle(element).getPropertyValue('--icon-size')
      if (element.classList.contains('ztab-widget-card')) {
        const summary = clone.querySelector('.ztab-widget-summary') as HTMLElement | null
        if (summary) { summary.style.display = 'flex'; summary.style.height = '100%' }
        clone.style.overflow = 'visible'
      }
      clone.style.setProperty('--icon-size', size)
      Object.assign(clone.style, { position: 'fixed', left: '0', top: '0', margin: '0', width: `${rect.width}px`, height: `${rect.height}px`, minHeight: '0', zIndex: '1000', pointerEvents: 'none' })
      current.clone = clone
      document.body.append(clone)
      document.body.classList.add('tiles-dragging')
      setDragging(id)
      update('move')
      tick()
    }
    const update = (intent: 'move' | 'frame' | 'release' = 'frame') => {
      if (!current.active) return
      current.clone!.style.transform = `translate3d(${current.x - current.offsetX}px, ${current.y - current.offsetY}px, 0)`
      const scrollTop = current.scrollArea?.scrollTop ?? 0
      const scrolled = current.scrollY !== window.scrollY || current.scrollTop !== scrollTop
      if (scrolled) clearGroup(current)
      current.scrollY = window.scrollY
      current.scrollTop = scrollTop
      const hit = document.elementsFromPoint(current.x, current.y)
      const destination = allowFolders && canDrop(id) ? hit[0]?.closest<HTMLElement>('[data-link-destination]') : null
      const nextTarget = destination ?? undefined
      if (current.target !== nextTarget) {
        current.target?.classList.remove('tile-drop-target')
        nextTarget?.classList.add('tile-drop-target')
        current.target = nextTarget
      }
      current.destination = nextTarget?.dataset.linkDestination
      const root = getRoot()
      current.valid = Boolean(nextTarget || (root && hit[0] && (hit[0] === root || root.contains(hit[0]))))
      if (nextTarget || !current.valid || !root) { clearGroup(current); current.sortHover = undefined; return }
      const nodes = [...root.querySelectorAll<HTMLElement>('[data-sort-id]')].filter(node => node.closest('[data-drag-scope]') === root)
      const targetNode = nodes.find(node => { const r = node.getBoundingClientRect(); return current.x >= r.left && current.x <= r.right && current.y >= r.top && current.y <= r.bottom })
      const target = current.order.find(item => item.id === targetNode?.dataset.sortId)
      const icon = targetNode?.querySelector<HTMLElement>('.site-icon')
      const rect = icon?.getBoundingClientRect()
      const centered = rect && Math.abs(current.x - (rect.left + rect.width / 2)) <= rect.width * .24 && Math.abs(current.y - (rect.top + rect.height / 2)) <= rect.height * .24
      const animating = targetNode && animations.current.get(targetNode)?.playState === 'running'
      const groupable = target && target.id !== id && latest.current.onGroup && latest.current.canGroup?.(id, target.id)
      if (targetNode && target && groupable && centered && !animating) {
        current.sortHover = undefined
        const previous = current.group
        const shifted = previous?.node === targetNode && (Math.abs(previous.rect.left - rect.left) > 1 || Math.abs(previous.rect.top - rect.top) > 1 || previous.rect.width !== rect.width || previous.rect.height !== rect.height)
        if (previous && (previous.node !== targetNode || shifted)) clearGroup(current)
        if (!current.group && intent === 'move' && !scrolled && !shifted) {
          current.group = { id: target.id, node: targetNode, rect, since: performance.now(), x: current.x, y: current.y, ready: false }
          targetNode.classList.add('tile-group-candidate')
        }
        const group = current.group
        if (group) {
          if (Math.hypot(current.x - group.x, current.y - group.y) > 4) {
            group.since = performance.now(); group.x = current.x; group.y = current.y; group.ready = false
            group.node.classList.remove('tile-group-ready')
          }
          if (performance.now() - group.since >= 450) { group.ready = true; group.node.classList.add('tile-group-ready') }
          if (intent !== 'release' || group.ready) return
          clearGroup(current)
        }
      } else {
        clearGroup(current)
        if (groupable && !centered && intent !== 'release') {
          if (current.sortHover?.id !== target.id) current.sortHover = { id: target.id, since: performance.now() }
          if (performance.now() - current.sortHover.since < 120) return
        } else current.sortHover = undefined
      }
      if (current.lastSwap && Math.hypot(current.x - current.lastSwap.x, current.y - current.lastSwap.y) < 12) return
      if (targetNode?.dataset.sortId === id) return
      if (target && target.id !== id) {
        const next = reorderItems(current.order, id, target.id)
        if (next !== current.order) { current.lastSwap = { x: current.x, y: current.y }; measure(); current.order = next; setPreview(next) }
      }
    }
    const tick = () => {
      if (session.current !== current || !current.active || saving.current) return
      update()
      const root = getRoot()
      const scrollArea = root?.closest<HTMLElement>('.animated-overlay-panel, .desktop')
      const bounds = scrollArea?.getBoundingClientRect()
      const top = bounds?.top ?? 0
      const bottom = bounds?.bottom ?? innerHeight
      const delta = current.y < top + 35 ? -10 : current.y > bottom - 35 ? 10 : 0
      if (delta) {
        if (scrollArea) scrollArea.scrollTop += delta
        else window.scrollBy(0, delta)
      }
      current.frame = requestAnimationFrame(tick)
    }
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== current.pointer) return
      current.x = pointer.clientX; current.y = pointer.clientY
      const distance = Math.hypot(current.x - current.startX, current.y - current.startY)
      if (!current.active) {
        if (touch && distance > 8) { reset(); return }
        if (!touch && distance >= 6) start()
      }
      if (current.active) { pointer.preventDefault(); update('move') }
    }
    const cancel = () => { if (current.active) armClickGuard(); reset() }
    const escape = (key: KeyboardEvent) => {
      if (key.key === 'Escape' && !saving.current) {
        key.preventDefault(); key.stopImmediatePropagation(); cancel()
      }
    }
    const up = async (pointer: PointerEvent) => {
      if (pointer.pointerId !== current.pointer || saving.current) return
      if (!current.active) { reset(); return }
      current.x = pointer.clientX
      current.y = pointer.clientY
      update('release')
      armClickGuard()
      current.cleanup()
      current.target?.classList.remove('tile-drop-target')
      if (!current.valid) { reset(); return }
      saving.current = true
      try {
        if (current.group?.ready && latest.current.onGroup) await latest.current.onGroup(current.id, current.group.id, current.order)
        else await latest.current.onCommit(current.order, current.destination, current.id)
      } finally { saving.current = false; reset() }
    }
    const touchMove = (touchEvent: TouchEvent) => { if (current.active) touchEvent.preventDefault() }
    current.cleanup = () => {
      clearTimeout(current.timer)
      cancelAnimationFrame(current.frame ?? 0)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('touchmove', touchMove)
    }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', escape, true)
    document.addEventListener('touchmove', touchMove, { passive: false })
    if (touch) current.timer = window.setTimeout(start, 280)
  }
  return { items: preview ?? items, dragging, onPointerDown, cancel: reset }
}
