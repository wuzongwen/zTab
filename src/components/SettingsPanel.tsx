import type { AppState } from '../model';
import { Select } from './Select';
export const settingGroups = [['opening','打开方式'],['search','搜索栏'],['icons','图标'],['time','时间/日期'],['theme','主题/壁纸'],['layout','布局'],['sidebar','侧边栏'],['backup','备份与恢复'],['reset','重置设置'],['about','关于']];
export function SettingsPanel({settings:p,group,update}: {settings: AppState['settings']; group:string; update:(patch:Partial<AppState['settings']>)=>Promise<boolean>}) {
const toggle = (key:keyof typeof p,label:string) => <label className="toggle-field" key={key}>{label}<input type="checkbox" checked={p[key] as boolean} onChange={e=>void update({[key]:e.target.checked})}/></label>;
const range = (key:keyof typeof p,label:string,min:number,max:number) => <label className="range-field" key={key}>{label}<span>{String(p[key])}</span><input aria-label={label} type="range" min={min} max={max} value={p[key] as number} onChange={e=>void update({[key]:Number(e.target.value)})}/></label>;
const color = (key:'accent'|'nameColor'|'timeColor',label:string) => <label className="toggle-field">{label}<input aria-label={label} type="color" value={p[key]} onChange={e=>void update({[key]:e.target.value})}/></label>;
const select = (key:'theme'|'mode'|'sidebarPosition'|'categoryTransition',label:string,options:string[][]) => <label className="field">{label}<Select label={label} theme={p.theme} value={p[key]} onValueChange={value=>void update({[key]:value})} options={options.map(([value,label])=>({value,label}))} /></label>;
return <div className="settings-card">
{group==='opening' && <>{toggle('searchNewTab','在新标签页打开搜索结果')}{toggle('siteNewTab','在新标签页打开网站')}</>}
{group==='search' && <>{toggle('showSearch','显示搜索栏')}{range('searchHeight','搜索栏高度',32,80)}{range('searchRadius','搜索栏圆角',0,40)}{range('searchOpacity','搜索栏不透明度',10,100)}</>}
{group==='icons' && <>{range('size','图标大小',42,80)}{range('iconRadius','图标圆角',0,40)}{range('iconOpacity','图标不透明度',10,100)}{range('iconGap','图标间距',0,60)}{toggle('showNames','显示名称')}{range('nameSize','名称字号',10,24)}{color('nameColor','名称颜色')}</>}
{group==='time' && <>{toggle('showTime','显示时间')}{toggle('showDate','显示日期')}{toggle('showWeek','显示星期')}{toggle('showLunar','显示农历')}{toggle('hour12','12小时制')}{toggle('showSeconds','显示秒')}{range('timeSize','时间字号',32,120)}{range('timeWeight','时间字重',100,900)}{color('timeColor','时间颜色')}</>}
{group==='theme' && <>{select('theme','主题',[['light','浅色'],['dark','深色'],['system','跟随系统']])}{color('accent','主题色')}{range('blur','壁纸模糊',0,30)}</>}
{group==='layout' && <>{select('mode','桌面模式',[['normal','普通'],['minimal','极简']])}{select('categoryTransition','分类切换效果',[['none','无'],['fade','淡入淡出'],['slide','上下滑动']])}{toggle('showGreeting','显示底部寄语')}</>}
{group==='sidebar' && <>{select('sidebarPosition','侧栏位置',[['left','左侧'],['right','右侧']])}{toggle('sidebarAutoHide','自动隐藏侧栏')}{toggle('rememberCategory','记住上次分类')}{toggle('wheelCategories','滚轮切换分类')}{range('sidebarOpacity','侧栏不透明度',0,100)}{range('sidebarWidth','侧栏宽度',44,90)}</>}
{group==='about' && <><h3>zTab 1.0.0</h3><p>本地起始页，无账号和云同步。配置及图片存于 IndexedDB，组件存于此浏览器本地存储。请定期导出完整备份。</p></>}
</div>;
}
