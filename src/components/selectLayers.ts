// Portalled controls retain the ownership of their in-panel trigger.
const layers: { trigger: HTMLElement; popup: HTMLElement; close: () => void }[] = []
export function registerSelectLayer(trigger: HTMLElement, popup: HTMLElement, close: () => void) {
  const layer = { trigger, popup, close }
  layers.push(layer)
  return () => { const index = layers.indexOf(layer); if (index >= 0) layers.splice(index, 1) }
}
export function ownsFloatingTarget(owner: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && (owner.contains(target) || layers.some(layer => owner.contains(layer.trigger) && layer.popup.contains(target)))
}
export function dismissSelectOnEscape(event: KeyboardEvent, owner: HTMLElement): boolean {
  if (event.key !== 'Escape') return false
  const layer = [...layers].reverse().find(layer => owner.contains(layer.trigger))
  if (!layer) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  layer.close()
  return true
}
