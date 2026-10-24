import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Blocks, Globe, ImagePlus, ShieldCheck } from 'lucide-react'
import { defaults, type AppState, type LinkItem, type TileKey } from '../model'
import { AnimatedOverlay } from './AnimatedOverlay'
import { SiteIcon } from './SiteIcon'
import { widgetCatalog, installedPlugins, importPlugin, exportPlugin, uninstallPlugin, downloadExamplePlugin } from './Widgets'
import './add-icon-panel.css'
import { Select } from './Select'

const pages = ['小组件', '网址导航', '自定义图标'] as const
const siteGroups: Record<string, string> = { GitHub: '工作效率', Notion: '工作效率', Figma: '设计灵感', Dribbble: '设计灵感', '哔哩哔哩': '影音生活', YouTube: '影音生活', '网易云音乐': '影音生活', '豆瓣': '阅读社区', '知乎': '阅读社区', '少数派': '阅读社区', '即刻': '阅读社区', ChatGPT: '工作效率' }
const previews: Record<string, [string, string]> = {
  'widget:calendar': ['日 一 二 三 四 五 六', '01 02 03 04 05 06 07'],
  'widget:memo': ['☑ 记录今天的灵感', '☐ 完成一件小事'],
  'widget:anniversary': ['重要的日子', '还有 28 天'],
  'widget:work': ['距离下班', '02 : 35 : 18'],
  'widget:weather': ['晴 · 轻风', '24°'],
  'widget:movie': ['我的电影日历', '留住一句喜欢的台词'],
}
export function AddIconPanel({ state, active, folder, onClose, onLink, onWidget, renderCustom }: {
  state: AppState; active: string; folder?: string; onClose: () => void;
  onLink: (site: LinkItem, category: string, folder?: string) => Promise<boolean>;
  onWidget: (key: TileKey, category: string) => Promise<boolean>;
  renderCustom: (category: string, folder: string | undefined) => ReactNode;
}) {
  const [page, setPage] = useState<(typeof pages)[number]>('小组件')
  const [category, setCategory] = useState(active)
  const [target, setTarget] = useState(folder ?? '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('全部')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const pluginInput = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0 }, [page])
  const PageIcon = page === '小组件' ? Blocks : page === '网址导航' ? Globe : ImagePlus
  const description = page === '小组件' ? '挑选实用的小组件，让日常信息触手可及。' : page === '网址导航' ? '收藏常用的网站，打造顺手的网址导航。' : '自定义名称、网址与图标，添加专属快捷入口。'
  const [, refresh] = useState(0)
  const [siteAdded, setSiteAdded] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const sync = () => refresh(v => v + 1)
    window.addEventListener('ztab:plugins-change', sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener('ztab:plugins-change', sync); window.removeEventListener('storage', sync) }
  }, [])
  const targetCategory = state.categories.some(c => c.id === category) ? category : state.categories[0]?.id ?? active
  const targetFolder = state.folders.some(f => f.id === target && f.category === targetCategory) ? target : undefined
  const matches = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase())
  const plugins = installedPlugins()
  const widgets = [...widgetCatalog, ...plugins.map(p => ({ key: `plugin:${p.id}` as TileKey, name: p.name, description: `本地插件 · ${p.version}`, size: '2 × 2' }))].filter(w => matches(w.name + w.description) && (filter === '全部' || (filter === '本地插件' ? w.key.startsWith('plugin:') : w.key.startsWith('widget:'))))
  const sites = defaults().links.filter(s => matches(s.title + s.url) && (filter === '全部' || siteGroups[s.title] === filter))
  async function perform(action: () => Promise<boolean | void> | boolean | void, success: string) {
    if (pending) return
    setPending(true); setFailed(false); setMessage('正在保存…')
    try { if (await action() === false) throw new Error('保存失败，请检查存储后重试'); setMessage(success) }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '操作失败，请重试') }
    finally { setPending(false) }
  }
  return <AnimatedOverlay open onClose={onClose} label="添加图标" className="add-icon-panel">
    <aside className="add-icon-nav"><nav aria-label="添加图标类型">{pages.map(name => <button type="button" key={name} aria-pressed={page === name} onClick={() => { setPage(name); setSearch(''); setFilter('全部'); setMessage('') }}>{name}</button>)}</nav></aside>
    <main className="add-icon-main"><header className="add-icon-header"><span className="modal-icon"><PageIcon /></span><div><h2>{page}</h2><p>{description}</p></div></header><div className="add-icon-tools">{page !== '自定义图标' && <input type="search" aria-label="搜索当前目录" placeholder={page === '小组件' ? '搜索组件名称或用途' : '搜索网站名称或网址'} value={search} onChange={e => setSearch(e.target.value)} />}<label>添加到分类<Select label="添加到分类" theme={state.settings.theme} disabled={pending} value={targetCategory} onValueChange={value => { setCategory(value); setTarget(''); setMessage('') }} options={state.categories.map(c => ({ value: c.id, label: c.name }))} /></label>{page !== '小组件' && <label>文件夹<Select label="目标文件夹" theme={state.settings.theme} disabled={pending} value={targetFolder ?? ''} onValueChange={value => { setTarget(value); setMessage('') }} options={[{ value: '', label: '分类桌面' }, ...state.folders.filter(f => f.category === targetCategory).map(f => ({ value: f.id, label: f.name }))]} /></label>}</div>
      <div className="add-icon-content" ref={contentRef} aria-busy={pending}>
      {page !== '自定义图标' && <div className="add-icon-filters" aria-label="目录分类">{(page === '小组件' ? ['全部', '内置组件', '本地插件'] : ['全部', '工作效率', '设计灵感', '影音生活', '阅读社区']).map(name => <button type="button" key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>}
      {page === '小组件' && <><p className="add-icon-hint">组件只添加到分类桌面，不放入文件夹。内容在所有分类共享，同一分类不重复添加。</p><div className="add-icon-cards">{widgets.map(w => {
        const added = state.settings.showWidgets && !!state.layouts?.[targetCategory]?.order.includes(w.key) && !state.layouts[targetCategory].hidden.includes(w.key)
        const plugin = plugins.find(p => w.key === `plugin:${p.id}`)
        const preview = previews[w.key] ?? ['本地插件', '隔离运行 · 不预执行插件代码']
        return <article className="add-icon-card" key={w.key}><div className={`add-widget-preview preview-${w.key.replace(':', '-')}`} aria-label={`${w.name}示意预览`}><span>{preview[0]}</span><strong>{preview[1]}</strong><small>示意预览 · {w.size}</small></div><h3>{w.name}</h3><p>{w.description}</p><div className="add-icon-card-actions"><button type="button" disabled={pending || added} onClick={() => void perform(() => onWidget(w.key, targetCategory), `「${w.name}」已添加到分类桌面`)}>{added ? '已添加' : '添加'}</button>{plugin && <><button type="button" disabled={pending} onClick={() => void perform(() => exportPlugin(plugin.id), '插件已导出')}>导出</button><button type="button" disabled={pending} onClick={() => { if (confirm(`全局卸载「${plugin.name}」？所有分类均会移除此插件。`)) void perform(() => uninstallPlugin(plugin.id), '插件已全局卸载') }}>全局卸载</button></>}</div></article>
      })}</div>{widgets.length === 0 && <p className="add-icon-empty">没有匹配的组件，试试其他关键词或分类。</p>}<section className="add-icon-plugin"><h3>安全的本地插件入口</h3><p>仅导入可信 JSON（最多 150 KB / 10 个插件）。插件在隔离沙箱中运行，无法访问桌面存储；仍可能导航自身并联网，不限制资源消耗，请勿输入敏感信息。</p><div className="add-icon-plugin-actions"><button className="add-icon-import" type="button" disabled={pending} onClick={() => pluginInput.current?.click()}>导入插件 JSON</button><input ref={pluginInput} hidden aria-label="导入插件 JSON 文件" disabled={pending} type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void perform(() => importPlugin(file), '插件已安装，请点击插件卡片添加到目标分类') }} /><button type="button" disabled={pending} onClick={() => void perform(downloadExamplePlugin, '示例插件已下载')}>下载示例插件</button></div></section></>}
      {page === '网址导航' && <><p className="add-icon-hint">精选自项目内置网站目录，可连续添加到所选分类或文件夹。</p><div className="add-icon-cards add-site-cards">{sites.map(site => {
        const key = `${site.id}:${targetCategory}:${targetFolder ?? ''}`
        return <article className="add-icon-card" key={site.id}><div className="add-site-icon" style={{ background: site.color, color: site.color === '#ffffff' ? '#252d3a' : '#fff' }}><SiteIcon item={site} /></div><h3>{site.title}</h3><p>{new URL(site.url).hostname}</p><button type="button" disabled={pending} onClick={() => void perform(async () => { const ok = await onLink(site, targetCategory, targetFolder); if (ok) setSiteAdded(prev => ({ ...prev, [key]: true })); return ok }, `「${site.title}」已添加并保存，可继续添加`)}>{siteAdded[key] ? '再次添加' : '添加'}</button>{siteAdded[key] && <small className="add-site-success">已添加成功</small>}</article>
      })}</div>{sites.length === 0 && <p className="add-icon-empty">没有匹配的网站，可前往“自定义图标”添加。</p>}</>}
      {page === '自定义图标' && <div className="add-icon-custom">{renderCustom(targetCategory, targetFolder)}</div>}
      </div>
      <footer className={`add-icon-bottom ${failed ? 'is-error' : ''}`}><ShieldCheck size={14} aria-hidden="true" /><span role={failed ? 'alert' : 'status'}>{message || '添加后自动保存于此设备'}</span></footer>
    </main>
  </AnimatedOverlay>
}
