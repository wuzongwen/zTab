import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type CSSProperties } from 'react'
import { tileSize } from '../model'
import type { CategoryLayout, TileKey, WidgetLayoutSeed } from '../model'
import type { FormEvent, ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { AnimatedOverlay } from './AnimatedOverlay'
import './widgets.css'

const STORAGE_KEY = 'ztab.widgets.v1'
const LEGACY_WIDGETS = ['calendar', 'memo', 'anniversary', 'work'] as const
const WIDGETS = [...LEGACY_WIDGETS, 'weather', 'movie'] as const
type WidgetName = (typeof WIDGETS)[number]
type Anniversary = { id: string; title: string; date: string }
type MemoItem = { id: string; text: string; done: boolean }
export type WidgetPlugin = { id: string; name: string; version: string; html: string; visible: boolean }
export function parseWidgetPlugin(value: unknown): WidgetPlugin {
  const p = value as Record<string, unknown> | null
  if (!p || p.format !== 'ztab-widget' || p.schemaVersion !== 1 ||
    typeof p.id !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(p.id) ||
    typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 ||
    typeof p.version !== 'string' || !p.version.trim() || p.version.length > 30 ||
    typeof p.html !== 'string' || !p.html.trim() || p.html.length > 100000)
    throw new Error('插件格式无效：需要 ztab-widget v1 包和有效的 id、name、version、html')
  return { id: p.id, name: p.name.trim(), version: p.version, html: p.html, visible: true }
}
const PLUGIN_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
function pluginDocument(html: string) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PLUGIN_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:12px;color:#28344a}*{box-sizing:border-box}</style></head><body>${html}</body></html>`
}
function downloadPlugin(value: object, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export type WidgetState = {
  version: 1
  visible: Record<WidgetName, boolean>
  memo: string
  notes: MemoItem[]
  plugins: WidgetPlugin[]
  order: WidgetName[]
  compact: boolean
  weather: { city: string }
  movie: { title: string; quote: string }
  anniversaries: Anniversary[]
  work: { time: string; days: number[]; salary?: number; payday?: number }
}
const WIDGET_DESCRIPTIONS: Record<WidgetName, string> = {
  calendar: '查看月历、农历和当天纪念日',
  memo: '记录待办与自由笔记，内容在分类间共享',
  anniversary: '记录重要日期，查看已过或剩余天数',
  work: '按工作日计算下班倒计时，可记录发薪日',
  weather: '手动查询城市天气，不定位、不自动联网',
  movie: '本地收藏喜欢的片名与台词，非在线推荐',
}
export const widgetCatalog = WIDGETS.map(key => ({ key: `widget:${key}` as TileKey, name: ({ calendar: '月历', memo: '备忘录', anniversary: '纪念日', work: '下班倒计时', weather: '天气', movie: '我的电影日历' })[key], description: WIDGET_DESCRIPTIONS[key], size: key === 'work' ? '4×2' : '2×2' }))
export function readWidgetState() { return loadState() }
export function installedPlugins() { return readWidgetState().state.plugins }
export function notifyWidgetStorageChange() {
  window.dispatchEvent(new Event('ztab:widgets-import'))
  window.dispatchEvent(new Event('ztab:plugins-change'))
}
function savePlugins(plugins: WidgetPlugin[]) {
  const loaded = readWidgetState()
  if (loaded.error) throw new Error(loaded.error)
  const next = parseWidgetState({ ...loaded.state, plugins })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyWidgetStorageChange()
}
export async function importPlugin(file: File) {
  if (file.size > 150000) throw new Error('插件包不能超过 150 KB')
  const plugin = parseWidgetPlugin(JSON.parse(await file.text()))
  const plugins = installedPlugins()
  if (plugins.length >= 10) throw new Error('最多安装 10 个插件')
  if (plugins.some(p => p.id === plugin.id)) throw new Error('插件 ID 已存在')
  savePlugins([...plugins, { ...plugin, visible: false }])
}
export function uninstallPlugin(id: string) { savePlugins(installedPlugins().filter(p => p.id !== id)) }
export function exportPlugin(id: string) { const p = installedPlugins().find(p => p.id === id); if (p) downloadPlugin({ ...p, format: 'ztab-widget', schemaVersion: 1 }, `${id}.ztab-widget.json`) }
export function downloadExamplePlugin() { downloadPlugin({ format: 'ztab-widget', schemaVersion: 1, id: 'example.clock', name: '示例时钟', version: '1.0.0', html: '<h2>我的时钟</h2>' }, 'example.clock.ztab-widget.json') }
const LABELS: Record<WidgetName, string> = {
  calendar: '月历', memo: '备忘录', anniversary: '纪念日', work: '下班倒计时', weather: '天气', movie: '我的电影日历',
}
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const DAY = 86400000

function defaults(): WidgetState {
  return {
    version: 1,
    visible: { calendar: true, memo: true, anniversary: true, work: true, weather: false, movie: false },
    weather: { city: '' }, movie: { title: '', quote: '' },
    memo: '', notes: [], plugins: [], order: [...WIDGETS], compact: true, anniversaries: [], work: { time: '18:00', days: [1, 2, 3, 4, 5] },
  }
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 9999) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY
}
export function parseWidgetState(value: unknown): WidgetState {
    if (!isObject(value) || value.version !== 1 || !isObject(value.visible)
      || typeof value.memo !== 'string' || value.memo.length > 20000
      || !Array.isArray(value.anniversaries) || value.anniversaries.length > 100
      || !isObject(value.work) || typeof value.work.time !== 'string'
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.work.time)
      || !Array.isArray(value.work.days) || !value.work.days.length
      || !value.work.days.every((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)
      || !LEGACY_WIDGETS.every((key) => typeof (value.visible as Record<string, unknown>)[key] === 'boolean')
      || !(['weather', 'movie'] as const).every(key => (value.visible as Record<string, unknown>)[key] === undefined || typeof (value.visible as Record<string, unknown>)[key] === 'boolean')) {
      throw new Error('Invalid widget state')
    }
    const ids = new Set<string>()
    const anniversaries = value.anniversaries.map((item: unknown): Anniversary => {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100
        || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim()
        || item.title.length > 40 || !isDate(item.date)) throw new Error('Invalid anniversary')
      ids.add(item.id)
      return { id: item.id, title: item.title, date: item.date }
    })
    const visible = Object.fromEntries(WIDGETS.map((key) => [key, (value.visible as Record<string, unknown>)[key] ?? false])) as WidgetState['visible']
    const legacyOrder = Array.isArray(value.order) && value.order.length === 4 && new Set(value.order).size === 4 && value.order.every(key => LEGACY_WIDGETS.includes(key as typeof LEGACY_WIDGETS[number]))
    const order = value.order === undefined ? [...WIDGETS] : legacyOrder ? [...value.order as string[], 'weather', 'movie'] : value.order
    if (!Array.isArray(order) || order.length !== WIDGETS.length || new Set(order).size !== WIDGETS.length || !order.every(key => WIDGETS.includes(key as WidgetName))) throw new Error('Invalid widget order')
    if (value.compact !== undefined && typeof value.compact !== 'boolean') throw new Error('Invalid layout')
    const notes = value.notes === undefined ? [] : value.notes
    if (!Array.isArray(notes) || notes.length > 100) throw new Error('Invalid notes')
    const noteIds = new Set<string>()
    const parsedNotes = notes.map((note: unknown): MemoItem => {
      if (!isObject(note) || typeof note.id !== 'string' || !note.id || note.id.length > 100 || noteIds.has(note.id) || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 2000 || typeof note.done !== 'boolean') throw new Error('Invalid note')
      noteIds.add(note.id)
      return { id: note.id, text: note.text, done: note.done }
    })
    const { salary, payday } = value.work
    if (salary !== undefined && (typeof salary !== 'number' || !Number.isFinite(salary) || salary < 0 || salary > 100000000)) throw new Error('Invalid salary')
    if (payday !== undefined && (!Number.isInteger(payday) || Number(payday) < 1 || Number(payday) > 31)) throw new Error('Invalid payday')
    const weather = value.weather === undefined ? { city: '' } : value.weather
    const movie = value.movie === undefined ? { title: '', quote: '' } : value.movie
    if (!isObject(weather) || typeof weather.city !== 'string' || weather.city.length > 100) throw new Error('Invalid weather city')
    if (!isObject(movie) || typeof movie.title !== 'string' || movie.title.length > 100 || typeof movie.quote !== 'string' || movie.quote.length > 2000) throw new Error('Invalid movie')
    const plugins = value.plugins === undefined ? [] : value.plugins
    if (!Array.isArray(plugins) || plugins.length > 10) throw new Error('最多安装 10 个插件')
    const pluginIds = new Set<string>()
    const parsedPlugins = plugins.map((plugin: unknown) => {
      if (!isObject(plugin) || typeof plugin.visible !== 'boolean') throw new Error('插件设置无效')
      const parsed = parseWidgetPlugin({ ...plugin, format: 'ztab-widget', schemaVersion: 1 })
      if (pluginIds.has(parsed.id)) throw new Error('插件 ID 重复')
      pluginIds.add(parsed.id)
      return { ...parsed, visible: plugin.visible }
    })
    return { version: 1, visible, memo: value.memo, notes: parsedNotes, plugins: parsedPlugins, order: order as WidgetName[], compact: value.compact as boolean ?? true, anniversaries, weather: { city: weather.city }, movie: { title: movie.title, quote: movie.quote },
      work: { time: value.work.time, days: [...new Set(value.work.days as number[])], ...(salary !== undefined ? { salary: salary as number } : {}), ...(payday !== undefined ? { payday: payday as number } : {}) } }
}

export function validateWidgetBackup(value: unknown): boolean {
  try {
    parseWidgetState(value)
    return true
  } catch {
    return false
  }
}

function loadState(): { state: WidgetState; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: defaults(), error: '' }
    return { state: parseWidgetState(JSON.parse(raw)), error: '' }
  } catch {
    return { state: defaults(), error: '无法读取组件数据，已暂用默认设置。原数据未覆盖；可重新导入备份。' }
  }
}
export function nextPayday(now: Date, payday: number): { date: string; days: number } {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(payday) || payday < 1 || payday > 31) throw new Error('Invalid payday')
  const today = dateKey(now)
  const candidate = (offset: number) => {
    const month = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return dateKey(new Date(month.getFullYear(), month.getMonth(), Math.min(payday, lastDay)))
  }
  let date = candidate(0)
  if (dayNumber(date) < dayNumber(today)) date = candidate(1)
  return { date, days: dayNumber(date) - dayNumber(today) }
}
export function weatherLabel(code: number): string {
  if (code === 0) return '晴'
  if (code === 1) return '晴间多云'
  if (code === 2) return '多云'
  if (code === 3) return '阴'
  if ([45, 48].includes(code)) return '雾'
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨'
  if ([61, 63, 65, 66, 67].includes(code)) return '雨'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪'
  if ([80, 81, 82].includes(code)) return '阵雨'
  if ([95, 96, 99].includes(code)) return '雷暴'
  return `WMO 天气代码 ${code}`
}
function nextWorkEnd(now: Date, work: WidgetState['work']): Date {
  const [hours, minutes] = work.time.split(':').map(Number)
  for (let offset = 0; offset <= 7; offset += 1) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes)
    if (work.days.includes(end.getDay()) && end.getTime() > now.getTime()) return end
  }
  return new Date(now.getTime() + DAY)
}
function Icon({ kind }: { kind: 'settings' | 'calendar' | 'memo' | 'heart' | 'sun' | 'plus' | 'close' }) {
  return <svg className="ztab-widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'settings' && <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none" /></>}
    {kind === 'calendar' && <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-11 4h.01m4 0h.01m-4 3h.01" /></>}
    {kind === 'memo' && <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8m-8 4h5" /></>}
    {kind === 'heart' && <path d="M20.8 5.7a5.1 5.1 0 0 0-7.2 0L12 7.3l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8.1a5.1 5.1 0 0 0 0-7.2Z" />}
    {kind === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
    {kind === 'plus' && <path d="M12 5v14M5 12h14" />}
    {kind === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
  </svg>
}

function WidgetCard({ name, label, expanded, onClose, summary, children, drag, style }: {
  style?: CSSProperties;
  name: WidgetName; label: string; order: number; expanded: boolean; onClose: () => void; summary: ReactNode; children: ReactNode
  drag: { dragging?: string; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: string) => void }
}) {
  return <article style={style} className={`ztab-widget-card ztab-widget-${name} ${drag.dragging === name ? 'tile-drag-placeholder' : ''}`} aria-label={label} data-expanded={false}
    data-sort-id={`widget:${name}`} onPointerDown={event => { if ((event.target as HTMLElement).closest('.ztab-widget-summary')) drag.onPointerDown(event, name) }} onDragStart={event => event.preventDefault()}>
    {summary}
    <span className="ztab-widget-summary-label">{label}</span>
    <AnimatedOverlay open={expanded} onClose={onClose} label={`${label}详情`} id={`ztab-widget-detail-${name}`} className={`ztab-widget-dialog ztab-widget-dialog-${name}`}>
      <div className={`ztab-widget-panel ztab-widget-card ztab-widget-${name}`} data-expanded={true}>{children}</div>
    </AnimatedOverlay>
  </article>
}

export function widgetLayoutSeed(): WidgetLayoutSeed { const { state } = loadState(); return state }
export function WidgetPanel({ layout, onLayout, renderTiles, drag: externalDrag, onMenu, enabled = true, onAddIcons }: {
  layout: CategoryLayout; onLayout: (layout: CategoryLayout) => void;
  renderTiles: (tiles: Map<string, ReactNode>, seed: WidgetLayoutSeed) => ReactNode;
  drag: { dragging?: string; onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: string) => void };
  onMenu: (key: TileKey, trigger: HTMLElement, x: number, y: number, open: () => void) => void;
  enabled?: boolean; onAddIcons: () => void;
}) {
  const [initial] = useState(loadState)
  const [shared, setState] = useState(initial.state)
  const state = { ...shared, visible: Object.fromEntries(WIDGETS.map(key => [key, enabled && !layout.hidden.includes(`widget:${key}`)])) as WidgetState['visible'], order: layout.order.filter(key => key.startsWith('widget:')).map(key => key.slice(7)) as WidgetName[], plugins: shared.plugins.map(p => ({ ...p, visible: enabled && !layout.hidden.includes(`plugin:${p.id}`) })) }
  const [error, setError] = useState(initial.error)
  const [now, setNow] = useState(() => new Date())
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  
  const [workOpen, setWorkOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [noteText, setNoteText] = useState('')
  const [expanded, setExpanded] = useState<WidgetName | null>(null)
  const [city, setCity] = useState(initial.state.weather.city)
  const [weatherResult, setWeatherResult] = useState<{ city: string; temperature: number; code: number; time: string } | null>(null)
  const [weatherError, setWeatherError] = useState('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const weatherRequest = useRef<AbortController | null>(null)
  useEffect(() => () => weatherRequest.current?.abort(), [])
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const dirty = useRef(false)

  function update(next: WidgetState) {
    const hidden = layout.order.filter(key => key.startsWith('widget:') ? !next.visible[key.slice(7) as WidgetName] : key.startsWith('plugin:') && !next.plugins.find(p => p.id === key.slice(7))?.visible)
    if (JSON.stringify(hidden) !== JSON.stringify(layout.hidden)) onLayout({ ...layout, hidden })
    dirty.current = true
    setState({ ...next, visible: shared.visible, order: shared.order })
  }
  useEffect(() => {
    if (!dirty.current) return
    dirty.current = false
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shared))
      window.dispatchEvent(new Event('ztab:plugins-change'))
      setError('')
    } catch {
      setError('本地保存失败，修改仅暂存于当前页面。请勿刷新；检查浏览器存储权限并复制保留重要内容。')
    }
  }, [shared])
  useEffect(() => {
    const reload = () => {
      const result = loadState()
      dirty.current = false
      weatherRequest.current?.abort()
      setWeatherLoading(false)
      setWeatherResult(null)
      setWeatherError('')
      setCity(result.state.weather.city)
      setState(result.state)
      setError(result.error)
      setEditing(null)
      setDeleteId(null)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) reload()
    }
    window.addEventListener('ztab:widgets-import', reload)
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => {
      window.removeEventListener('ztab:widgets-import', reload)
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [])

  const today = dateKey(now)
  const firstWeekday = (month.getDay() + 6) % 7
  const monthDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const calendarDays = Array.from({ length: 42 }, (_, index) => index - firstWeekday + 1)
  const end = nextWorkEnd(now, state.work)
  const seconds = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sameDay = dateKey(end) === today
  const pay = state.work.payday === undefined ? null : nextPayday(now, state.work.payday)


  async function queryWeather(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = city.trim()
    if (!query) return
    weatherRequest.current?.abort()
    const request = new AbortController()
    weatherRequest.current = request
    setWeatherLoading(true)
    setWeatherError('')
    setWeatherResult(null)
    const timeout = window.setTimeout(() => {
      request.abort()
      setWeatherLoading(false)
      setWeatherError('天气查询超时，请检查网络后重试')
    }, 15000)
    request.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true })
    try {
      const locationResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=zh&format=json`, { signal: request.signal })
      if (!locationResponse.ok) throw new Error('城市查询服务暂不可用')
      const locations = await locationResponse.json()
      const location = locations.results?.[0]
      if (!location || typeof location.name !== 'string' || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new Error('未找到城市，请尝试城市英文名或更完整名称')
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&timezone=auto`, { signal: request.signal })
      if (!response.ok) throw new Error('天气服务暂不可用')
      const data = await response.json()
      if (!data.current || !Number.isFinite(data.current.temperature_2m) || !Number.isInteger(data.current.weather_code) || typeof data.current.time !== 'string') throw new Error('天气数据格式异常')
      if (request.signal.aborted) return
      setWeatherResult({ city: [location.name, location.admin1, location.country].filter(value => typeof value === 'string').join(' · '), temperature: data.current.temperature_2m, code: data.current.weather_code, time: data.current.time })
      dirty.current = true
      setState(current => ({ ...current, weather: { city: query } }))
    } catch (error) {
      if (!request.signal.aborted) setWeatherError(error instanceof Error ? error.message : '查询失败，请检查网络后重试')
    } finally {
      window.clearTimeout(timeout)
      if (!request.signal.aborted) setWeatherLoading(false)
    }
  }
  function summary(key: WidgetName) {
    const elapsed = dayNumber(today) - dayNumber(`${now.getFullYear()}-01-01`) + 1
    const friday = (5 - now.getDay() + 7) % 7
    const lunarToday = (() => { try { return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(now) } catch { return '农历暂不可用' } })()
    return <button type="button" className={`ztab-widget-summary ztab-widget-summary-${key}`} aria-label={`打开${LABELS[key]}详情`} aria-expanded={expanded === key} aria-controls={`ztab-widget-detail-${key}`} onClick={() => setExpanded(key)}>
      {key === 'calendar' && <><span className="ztab-widget-summary-title">{now.getFullYear()}年 {now.getMonth() + 1}月</span><strong className="ztab-widget-summary-date">{now.getDate()}</strong><span>第 {elapsed} 天 · 第 {Math.ceil(elapsed / 7)} 周</span><small>{lunarToday} · 周{WEEKDAYS[now.getDay()]}</small></>}
      {key === 'memo' && <><span className="ztab-widget-summary-title">备忘录</span><span className="ztab-widget-summary-lines">{state.notes.length ? state.notes.slice(0, 3).map(note => <span key={note.id}>{note.done ? '✓' : '○'} {note.text}</span>) : <span>{state.memo || '点击记录待办与灵感'}</span>}</span></>}
      {key === 'anniversary' && <>{state.anniversaries.length ? state.anniversaries.slice(0, 3).map(item => <span className="ztab-widget-summary-event" key={item.id}><span>{item.title}</span><strong>{Math.abs(dayNumber(item.date) - dayNumber(today))}<small>天{dayNumber(item.date) < dayNumber(today) ? '前' : '后'}</small></strong></span>) : <><strong>纪念日</strong><span>点击添加重要日子</span></>}</>}
      {key === 'work' && <><span>距离下次下班</span><strong className="ztab-widget-summary-clock">{String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong><span>{pay ? `发薪还有 ${pay.days} 天` : '点击设置发薪日'} · {friday === 0 ? '今天周五' : `距周五 ${friday} 天`}</span></>}
      {key === 'weather' && <><strong>{weatherResult ? `${weatherResult.temperature} °C` : '天气'}</strong><span>{weatherResult ? weatherLabel(weatherResult.code) : '点击手动查询'}</span><small>{weatherResult?.city || state.weather.city || '不定位 · 不自动联网'}</small></>}
      {key === 'movie' && <><span>{today}</span><strong>{state.movie.title || '我的电影日历'}</strong><span>{state.movie.quote || '点击收藏片名与台词'}</span><small>自定义 · 非在线推荐</small></>}
    </button>
  }
  const tileDrag = { dragging: externalDrag.dragging?.replace(/^widget:/, ''), onPointerDown: (event: ReactPointerEvent<HTMLElement>, id: string) => externalDrag.onPointerDown(event, `widget:${id}`) }
  const widgetOrder = (_key: WidgetName) => 0
  function TileCollection({ children }: { children: ReactNode }) {
    const tiles = new Map<string, ReactNode>();
    Children.forEach(isValidElement<{ children: ReactNode }>(children) ? children.props.children : children, child => {
      if (!isValidElement<{ name?: string; 'aria-label'?: string }>(child)) return;
      const key = child.props.name ? `widget:${child.props.name}` : child.key ? `plugin:${child.key}` : '';
      if (!key) return;
      const [cols, rows] = tileSize(layout, key as TileKey).split('x').map(Number);
      const sized = cloneElement(child as import('react').ReactElement<{ style?: CSSProperties }>, { style: { '--tile-cols': cols, '--tile-rows': rows } as CSSProperties });
      tiles.set(key, <div key={key} style={{ display: 'contents' }} onContextMenu={event => { if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return; event.preventDefault(); event.stopPropagation(); onMenu(key as TileKey, event.target as HTMLElement, event.clientX, event.clientY, () => child.props.name ? setExpanded(child.props.name as WidgetName) : onAddIcons()) }} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); const r = (event.target as HTMLElement).getBoundingClientRect(); onMenu(key as TileKey, event.target as HTMLElement, r.left, r.bottom, () => child.props.name ? setExpanded(child.props.name as WidgetName) : onAddIcons()) } }}>{sized}</div>);
    });
    return <>{renderTiles(tiles, shared)}</>;
  }
  const selected = new Date(`${selectedDate}T12:00:00`)
  let lunar = '当前浏览器不支持农历显示'
  try { lunar = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).format(selected) } catch { /* Graceful fallback for older browsers. */ }
  function startEvent(item?: Anniversary) {
    setEditing(item?.id ?? '')
    setTitle(item?.title ?? '')
    setEventDate(item?.date ?? today)
    setFormError('')
    setDeleteId(null)
  }
  function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !isDate(eventDate)) {
      setFormError('请填写名称和有效日期（1900—9999 年）。')
      return
    }
    if (editing === '' && state.anniversaries.length >= 100) {
      setFormError('最多保存 100 个纪念日，请先删除不再需要的项目。')
      return
    }
    const item = { id: editing === '' ? crypto.randomUUID() : editing!, title: title.trim(), date: eventDate }
    update({ ...state, anniversaries: editing === '' ? [...state.anniversaries, item] : state.anniversaries.map((entry) => entry.id === editing ? item : entry) })
    setEditing(null)
  }

  return <section className="ztab-widget-panel" aria-label="我的桌面组件">
    {error && <p role="alert">{error}</p>}
    <div className={`ztab-widget-grid ${state.compact ? 'ztab-widget-compact' : ''}`}>{TileCollection({ children: <>
      {state.plugins.filter(plugin => plugin.visible).map(plugin => <article key={plugin.id} data-sort-id={`plugin:${plugin.id}`} onPointerDown={event => { if ((event.target as HTMLElement).closest('header')) externalDrag.onPointerDown(event, `plugin:${plugin.id}`) }} className={`ztab-widget-card ztab-widget-plugin ${externalDrag.dragging === `plugin:${plugin.id}` ? 'tile-drag-placeholder' : ''}`} aria-label={plugin.name}>
        <header className="ztab-widget-card-header"><h2>{plugin.name}</h2></header>
        <iframe title={`插件：${plugin.name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={pluginDocument(plugin.html)} style={{ width: '100%', height: 220, border: 0, background: '#fff' }} />
      </article>)}
      {state.visible.weather && <WidgetCard name="weather" label="天气" order={widgetOrder('weather')} expanded={expanded === 'weather'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('weather')}>
        <button type="button" className="ztab-widget-expand" aria-label="展开或收起天气" onClick={() => setExpanded(expanded === 'weather' ? null : 'weather')}>天气详情 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="sun" /><h2>天气</h2></div></header>
        <form className="ztab-widget-event-form" onSubmit={queryWeather}><label>城市<input value={city} maxLength={100} required onChange={event => setCity(event.target.value)} placeholder="例如 Beijing / 北京" /></label><button type="submit" className="ztab-widget-primary">{weatherLoading ? '重新查询' : '查询天气'}</button><p>点击查询才向 Open-Meteo 发送城市名称，无定位；天气结果不写入备份。</p></form>
        {weatherLoading && <p role="status">正在查询天气…</p>}
        {weatherError && <p className="ztab-widget-error" role="alert">{weatherError}</p>}
        {weatherResult && <div className="ztab-widget-work-content"><strong>{weatherResult.city}</strong><p>{weatherResult.temperature} °C · {weatherLabel(weatherResult.code)}</p><p>数据时间（当地）：{weatherResult.time.replace('T', ' ')}</p><span>来源：Open-Meteo · 首个匹配城市，请核对地点</span></div>}
      </WidgetCard>}
      {state.visible.movie && <WidgetCard name="movie" label="我的电影日历" order={widgetOrder('movie')} expanded={expanded === 'movie'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('movie')}>
        <button type="button" className="ztab-widget-expand" aria-label="展开或收起电影日历" onClick={() => setExpanded(expanded === 'movie' ? null : 'movie')}>编辑电影日历 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="calendar" /><h2>我的电影日历</h2></div></header>
        <div className="ztab-widget-work-content"><p>{today}</p><strong>{state.movie.title || '记录你喜欢的电影'}</strong><p>{state.movie.quote || '收藏一句打动你的台词。'}</p><small>自定义内容 · 非在线每日推荐</small></div>
        <div className="ztab-widget-event-form"><label>片名<input maxLength={100} value={state.movie.title} onChange={event => update({ ...state, movie: { ...state.movie, title: event.target.value } })} /></label><label>台词<textarea maxLength={2000} value={state.movie.quote} onChange={event => update({ ...state, movie: { ...state.movie, quote: event.target.value } })} /></label></div>
      </WidgetCard>}
      {state.visible.calendar && <WidgetCard name="calendar" label="日历" order={widgetOrder('calendar')} expanded={expanded === 'calendar'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('calendar')}>
        <button className="ztab-widget-expand" aria-label="展开或收起日历" onClick={() => setExpanded(expanded === 'calendar' ? null : 'calendar')}>日历详情 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="calendar" /><h2>日历</h2></div><span className="ztab-widget-eyebrow">每一天，都值得期待</span></header>
        <div className="ztab-widget-calendar-top"><div><strong className="ztab-widget-month">{month.getMonth() + 1}<span>月</span></strong><span className="ztab-widget-year">{month.getFullYear()}</span></div><div className="ztab-widget-calendar-nav"><button type="button" aria-label="上个月" disabled={month.getFullYear() <= 1900 && month.getMonth() === 0} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button type="button" className="ztab-widget-today-button" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>今天</button><button type="button" aria-label="下个月" disabled={month.getFullYear() >= 9999 && month.getMonth() === 11} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div></div>
        <div className="ztab-widget-calendar-grid" role="grid" aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月`}>
          {['一', '二', '三', '四', '五', '六', '日'].map((day, index) => <span role="columnheader" className={`ztab-widget-weekday ${index > 4 ? 'ztab-widget-weekend' : ''}`} key={day}>{day}</span>)}
          {calendarDays.map((day, index) => {
            const date = new Date(month.getFullYear(), month.getMonth(), day)
            const isToday = dateKey(date) === today
            return <button type="button" key={index} role="gridcell" aria-selected={dateKey(date) === selectedDate} onClick={() => { setSelectedDate(dateKey(date)); setExpanded('calendar') }} aria-current={isToday ? 'date' : undefined} aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`} className={`ztab-widget-day ${day < 1 || day > monthDays ? 'ztab-widget-day-muted' : ''} ${index % 7 > 4 ? 'ztab-widget-weekend' : ''} ${isToday ? 'ztab-widget-day-today' : ''}`}>{date.getDate()}</button>
          })}
        </div>
        <div className="ztab-widget-date-detail" aria-live="polite"><strong>{selectedDate} · 星期{WEEKDAYS[selected.getDay()]}</strong><span>农历 {lunar}</span>{state.anniversaries.filter(item => item.date === selectedDate).map(item => <span key={item.id}>{item.title}</span>)}</div>
        <footer className="ztab-widget-calendar-footer">今天是 {now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}</footer>
      </WidgetCard>}

      {state.visible.memo && <WidgetCard name="memo" label="备忘录" order={widgetOrder('memo')} expanded={expanded === 'memo'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('memo')}>
        <button className="ztab-widget-expand" aria-label="展开或收起备忘录" onClick={() => setExpanded(expanded === 'memo' ? null : 'memo')}>管理备忘 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="memo" /><h2>随手记</h2></div><span className="ztab-widget-memo-tag">灵感收集站</span></header>
        <form className="ztab-widget-note-form" onSubmit={event => { event.preventDefault(); if (!noteText.trim() || state.notes.length >= 100) return; update({ ...state, notes: [...state.notes, { id: crypto.randomUUID(), text: noteText.trim(), done: false }] }); setNoteText('') }}><label className="ztab-widget-sr-only" htmlFor="ztab-new-note">新备忘条目</label><input id="ztab-new-note" value={noteText} maxLength={2000} onChange={event => setNoteText(event.target.value)} placeholder="记下一件事…" /><button type="submit" disabled={!noteText.trim() || state.notes.length >= 100}>添加条目</button></form>
        <ul className="ztab-widget-notes">{state.notes.map(note => <li key={note.id}><input type="checkbox" aria-label={`完成${note.text}`} checked={note.done} onChange={event => update({ ...state, notes: state.notes.map(item => item.id === note.id ? { ...item, done: event.target.checked } : item) })} /><input aria-label={`编辑备忘${note.text}`} value={note.text} maxLength={2000} onChange={event => { const text = event.target.value; if (text.trim()) update({ ...state, notes: state.notes.map(item => item.id === note.id ? { ...item, text } : item) }) }} style={{ textDecoration: note.done ? 'line-through' : undefined }} /><button type="button" aria-label={`删除备忘${note.text}`} onClick={() => { if (window.confirm('删除这条备忘？')) update({ ...state, notes: state.notes.filter(item => item.id !== note.id) }) }}>×</button></li>)}</ul>
        <label className="ztab-widget-legacy-label" htmlFor="ztab-widget-memo">自由笔记（原有内容完整保留）</label>
        <textarea id="ztab-widget-memo" className="ztab-widget-memo-input" value={state.memo} maxLength={20000} placeholder={'今天想做些什么？\n\n记下一个灵感，\n或一件让你开心的小事。'} onChange={(event) => update({ ...state, memo: event.target.value })} spellCheck={false} />
        <footer className="ztab-widget-memo-footer"><span>{error ? '当前页面暂存' : '自动保存在此浏览器'}</span><span>{state.memo.length.toLocaleString()} / 20,000</span></footer>
      </WidgetCard>}

      {state.visible.work && <WidgetCard name="work" label="下班倒计时" order={widgetOrder('work')} expanded={expanded === 'work'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('work')}>
        <button className="ztab-widget-expand" aria-label="展开或收起下班倒计时" onClick={() => setExpanded(expanded === 'work' ? null : 'work')}>工作详情 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="sun" /><h2>下班倒计时</h2></div><button type="button" className="ztab-widget-icon-button" aria-label="设置下班时间" aria-expanded={workOpen} aria-controls="ztab-widget-work-settings" onClick={() => setWorkOpen(!workOpen)}><Icon kind="settings" /></button></header>
        <div className="ztab-widget-work-scene" aria-hidden="true"><div className="ztab-widget-scene-sun" /><div className="ztab-widget-scene-hill ztab-widget-scene-hill-back" /><div className="ztab-widget-scene-hill" /><div className="ztab-widget-scene-path" /></div>
        <div className="ztab-widget-work-content"><p className="ztab-widget-work-caption">{sameDay ? '距离今天下班还有' : '距离下次下班还有'}</p><div className="ztab-widget-countdown" role="timer" aria-label={`${hours}小时${minutes}分${seconds % 60}秒`}><span>{String(hours).padStart(2, '0')}<small>小时</small></span><b>:</b><span>{String(minutes).padStart(2, '0')}<small>分钟</small></span><b>:</b><span>{String(seconds % 60).padStart(2, '0')}<small>秒</small></span></div><p className="ztab-widget-work-footer">{sameDay ? '今天' : `${end.getMonth() + 1} 月 ${end.getDate()} 日 周${WEEKDAYS[end.getDay()]}`} {state.work.time}<span>生活，不止工作</span></p></div>
        {(state.work.salary !== undefined || state.work.payday !== undefined) && <p className="ztab-widget-pay-info">{state.work.salary !== undefined && `月薪 ¥${state.work.salary.toLocaleString()} `}{pay && `发薪还有 ${pay.days} 天 · 下次发薪日：${pay.date}`}</p>}
        {workOpen && <div className="ztab-widget-work-settings" id="ztab-widget-work-settings"><label className="ztab-widget-time-label">下班时间<input type="time" aria-label="下班时间" value={state.work.time} onChange={(event) => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) update({ ...state, work: { ...state.work, time: event.target.value } }) }} /></label><fieldset className="ztab-widget-work-days"><legend>工作日（至少一天）</legend>{[1, 2, 3, 4, 5, 6, 0].map((day) => <label key={day}><input type="checkbox" aria-label={`星期${WEEKDAYS[day]}`} checked={state.work.days.includes(day)} disabled={state.work.days.length === 1 && state.work.days.includes(day)} onChange={(event) => update({ ...state, work: { ...state.work, days: event.target.checked ? [...state.work.days, day] : state.work.days.filter((entry) => entry !== day) } })} /><span>{WEEKDAYS[day]}</span></label>)}</fieldset><label className="ztab-widget-time-label">月薪（元，可选）<input type="number" min="0" max="100000000" aria-label="月薪" value={state.work.salary ?? ''} onChange={event => { const salary = event.target.value === '' ? undefined : Number(event.target.value); if (salary === undefined || (Number.isFinite(salary) && salary >= 0 && salary <= 100000000)) update({ ...state, work: { ...state.work, salary } }) }} /></label><label className="ztab-widget-time-label">每月发薪日<input type="number" min="1" max="31" aria-label="发薪日" value={state.work.payday ?? ''} onChange={event => { const payday = event.target.value === '' ? undefined : Number(event.target.value); if (payday === undefined || (Number.isInteger(payday) && payday >= 1 && payday <= 31)) update({ ...state, work: { ...state.work, payday } }) }} /></label><p>按本机时间计算，不含法定节假日调休。薪资仅本地记录，不估算实际收入；不足发薪日的月份按月末显示。</p></div>}
      </WidgetCard>}

      {state.visible.anniversary && <WidgetCard name="anniversary" label="纪念日和倒计时" order={widgetOrder('anniversary')} expanded={expanded === 'anniversary'} onClose={() => setExpanded(null)} drag={tileDrag} summary={summary('anniversary')}>
        <button className="ztab-widget-expand" aria-label="展开或收起纪念日" onClick={() => setExpanded(expanded === 'anniversary' ? null : 'anniversary')}>纪念日详情 ↗</button>
        <header className="ztab-widget-card-header"><div className="ztab-widget-heading"><Icon kind="heart" /><h2>值得期待</h2></div><button type="button" className="ztab-widget-add" onClick={() => startEvent()} disabled={state.anniversaries.length >= 100}><Icon kind="plus" />添加纪念日</button></header>
        {!state.anniversaries.length && editing === null && <div className="ztab-widget-anniversary-empty"><div className="ztab-widget-empty-heart"><Icon kind="heart" /></div><div><strong>把重要的日子，放在心上</strong><p>生日、旅行，或下一次相见。</p></div><button type="button" className="ztab-widget-text-button" onClick={() => startEvent()}>添加第一个纪念日 →</button></div>}
        {!!state.anniversaries.length && <ul className="ztab-widget-event-list">{state.anniversaries.map((item) => {
          const diff = dayNumber(item.date) - dayNumber(today)
          return <li key={item.id} className="ztab-widget-event"><div className="ztab-widget-event-mark"><Icon kind="heart" /></div><div className="ztab-widget-event-text"><strong>{item.title}</strong><span>{item.date.replaceAll('-', '.')} · {diff > 0 ? '还有' : diff < 0 ? '已经' : '就是今天'}</span></div><div className="ztab-widget-event-days"><strong>{diff === 0 ? '今天' : Math.abs(diff).toLocaleString()}</strong>{diff !== 0 && <span>天</span>}</div><div className="ztab-widget-event-actions">{deleteId === item.id ? <><span>删除？</span><button type="button" className="ztab-widget-danger-button" onClick={() => { update({ ...state, anniversaries: state.anniversaries.filter((entry) => entry.id !== item.id) }); setDeleteId(null); if (editing === item.id) setEditing(null) }}>确定</button><button type="button" onClick={() => setDeleteId(null)}>取消</button></> : <><button type="button" aria-label={`编辑${item.title}`} onClick={() => startEvent(item)}>编辑</button><button type="button" aria-label={`删除${item.title}`} onClick={() => setDeleteId(item.id)}>删除</button></>}</div></li>
        })}</ul>}
        {editing !== null && <form className="ztab-widget-event-form" onSubmit={saveEvent}><div className="ztab-widget-form-heading"><strong>{editing === '' ? '添加一个期待' : '编辑纪念日'}</strong><button type="button" className="ztab-widget-icon-button" aria-label="取消编辑" onClick={() => setEditing(null)}><Icon kind="close" /></button></div><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} placeholder="例如：去看一场海" required /></label><label>日期<input type="date" min="1900-01-01" max="9999-12-31" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></label>{formError && <p className="ztab-widget-form-error" role="alert">{formError}</p>}<div className="ztab-widget-form-buttons"><button type="button" className="ztab-widget-text-button" onClick={() => setEditing(null)}>取消</button><button type="submit" className="ztab-widget-primary">保存纪念日</button></div></form>}
        <footer className="ztab-widget-anniversary-footer">收藏日子，也收藏生活的小美好<span>按自然日计算</span></footer>
      </WidgetCard>}
    </> })}</div>
  </section>
}
