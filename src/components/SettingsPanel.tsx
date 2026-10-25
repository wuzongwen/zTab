import type { CSSProperties } from 'react';
import { resolveTheme, useSystemDark } from '../theme';
import type { AppState } from '../model';
import { Select } from './Select';
import { ColorPicker } from './ColorPicker';
import { Switch } from './Switch';
import { SearchHistoryControls } from './SearchHistoryControls';
import './sidebar-settings.css';
export function rangeStyle(value: number, min: number, max: number): CSSProperties {
  const progress = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  return { '--range-progress': `${progress}%` } as CSSProperties;
}
export const settingGroups = [['search','搜索栏'],['icons','图标'],['time','时间/日期'],['theme','主题/壁纸'],['layout','布局'],['sidebar','侧边栏'],['backup','备份与恢复'],['reset','重置设置'],['about','关于']];
export function SettingsPanel({settings:p,group,update}: {settings: AppState['settings']; group:string; update:(patch:Partial<AppState['settings']>)=>Promise<boolean>}) {
const systemDark = useSystemDark();
const toggle = (key:keyof typeof p,label:string) => <label className="toggle-field" key={key}>{label}<Switch checked={p[key] as boolean} onCheckedChange={checked=>void update({[key]:checked})}/></label>;
const range = (key:keyof typeof p,label:string,min:number,max:number) => <label className="range-field" key={key}>{label}<span>{key === 'sidebarOpacity' ? ((p[key] as number) / 100).toFixed(2) : `${p[key]}${key === 'sidebarWidth' ? ' px' : ''}`}</span><input aria-label={label} type="range" min={min} max={max} style={rangeStyle(p[key] as number, min, max)} value={p[key] as number} onChange={e=>void update({[key]:Number(e.target.value)})}/></label>;
const color = (key:'accent'|'nameColor'|'timeColor',label:string) => <div className="color-field" key={key}><span>{label}</span><ColorPicker label={label} value={p[key]} onValueChange={value=>void update({[key]:value})}/></div>;
const select = (key:'theme'|'mode'|'sidebarPosition'|'categoryTransition',label:string,options:string[][]) => <label className="field">{label}<Select label={label} theme={p.theme} value={p[key]} onValueChange={value=>void update({[key]:value})} options={options.map(([value,label])=>({value,label}))} /></label>;
return <div className="settings-card">
{group==='search' && <>{toggle('showSearch','显示搜索栏')}{toggle('searchNewTab','在新标签页打开搜索结果')}{toggle('searchHistoryEnabled','记录搜索历史')}<p>仅本机保存最近30条搜索词，不随完整备份导出。关闭后停止记录并隐藏，原记录保留；重新开启可恢复。</p><SearchHistoryControls />{range('searchHeight','搜索栏高度',32,80)}{range('searchRadius','搜索栏圆角',0,40)}{range('searchOpacity','搜索栏不透明度',10,100)}</>}
{group==='icons' && <>{range('size','图标大小',42,80)}{range('iconRadius','图标圆角',0,40)}{range('iconOpacity','图标不透明度',10,100)}{range('iconGap','图标间距',0,60)}{toggle('showNames','显示名称')}{range('nameSize','名称字号',10,24)}{color('nameColor','名称颜色')}</>}
{group==='time' && <>{toggle('showTime','显示时间')}{toggle('showDate','显示日期')}{toggle('showWeek','显示星期')}{toggle('showLunar','显示农历')}{toggle('hour12','12小时制')}{toggle('showSeconds','显示秒')}{range('timeSize','时间字号',32,120)}{range('timeWeight','时间字重',100,900)}{color('timeColor','时间颜色')}</>}
{group==='theme' && <><div className="theme-choices" role="group" aria-label="主题">{(['light','dark','system'] as const).map(theme => <button type="button" key={theme} className="theme-choice" aria-pressed={p.theme === theme} onClick={() => void update({ theme })}><span className={`theme-preview preview-${theme}`} aria-hidden="true"><i /><i /><i /></span><strong>{theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}</strong><small>{theme === 'system' ? `当前实际：${resolveTheme(theme, systemDark) === 'dark' ? '深色' : '浅色'}` : p.theme === theme ? '已选择' : '点击预览'}</small></button>)}</div>{color('accent','主题色')}{range('blur','壁纸模糊',0,30)}</>}
{group==='layout' && <>{select('categoryTransition','分类切换效果',[['none','无'],['fade','淡入淡出'],['slide','上下滑动'],['slide-horizontal','左右滑动'],['zoom','缩放淡入'],['blur','模糊淡化']])}<label className="range-field">过渡时长<span>{p.categoryTransitionDuration} ms</span><input aria-label="过渡时长" type="range" min={100} max={1000} disabled={p.categoryTransition === 'none'} style={rangeStyle(p.categoryTransitionDuration,100,1000)} value={p.categoryTransitionDuration} onChange={e=>void update({categoryTransitionDuration:Number(e.target.value)})}/></label><p className="sidebar-settings-hint">越小越快；退场和入场各占总时长的一半。无效果时保留时长设置。</p></>}
{group==='sidebar' && <div className="sidebar-settings">
  <div className="sidebar-position-choices" role="group" aria-label="侧栏位置">{(['left', 'right'] as const).map(side => <button type="button" key={side} className="sidebar-position-choice" aria-pressed={p.sidebarPosition === side} onClick={() => void update({ sidebarPosition: side })}><span className={`sidebar-position-preview sidebar-preview-${side}`} aria-hidden="true"><i className="sidebar-preview-rail"><b /><b /><b /></i><i className="sidebar-preview-content"><b /><b /><b /><b /></i></span><span className="sidebar-position-tag">{side === 'left' ? '左侧' : '右侧'}</span></button>)}</div>
  <div className="sidebar-settings-section">{toggle('sidebarAutoHide','自动隐藏')}{toggle('rememberCategory','记住上次分组')}{toggle('wheelCategories','鼠标滚轮滚动分组')}<p className="sidebar-settings-hint">开启后可在桌面及侧栏滚轮切换分组；关闭后正常滚动。</p></div>
  <div className="sidebar-settings-section">{range('sidebarOpacity','透明度',0,100)}{range('sidebarWidth','宽度',44,90)}</div>
</div>}
{group==='about' && <><h3>zTab 1.0.0</h3><p>本地起始页，无账号和云同步。配置及图片存于 IndexedDB，组件存于此浏览器本地存储。请定期导出完整备份。</p></>}
</div>;
}
