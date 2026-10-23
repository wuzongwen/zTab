export interface LinkItem {
  id: string;
  title: string;
  url: string;
  color: string;
  icon?: string;
  category: string;
  folder?: string;
}
export interface Category {
  id: string;
  name: string;
  symbol: string;
}
export interface Folder {
  id: string;
  name: string;
  category: string;
}
export interface Engine {
  id: string;
  name: string;
  template: string;
}
export const BUILTIN_WIDGETS = ['calendar', 'memo', 'anniversary', 'work', 'weather', 'movie'] as const;
export type TileKey = `widget:${string}` | `plugin:${string}` | `folder:${string}` | `link:${string}`;
export const TILE_SIZES = ['1x1', '2x1', '1x2', '2x2', '4x2'] as const;
export type TileSize = typeof TILE_SIZES[number];
export function validTileSize(value: unknown): value is TileSize { return TILE_SIZES.includes(value as TileSize); }
export function tileSize(layout: CategoryLayout, key: TileKey): TileSize | '2x4' { return layout.sizes?.[key] ?? (key.startsWith('plugin:') ? '2x4' : key === 'widget:work' ? '4x2' : key.startsWith('widget:') ? '2x2' : '1x1'); }
export interface CategoryLayout { order: TileKey[]; hidden: TileKey[]; sizes?: Partial<Record<TileKey, TileSize>> }
export interface WidgetLayoutSeed { order: readonly string[]; visible: Record<string, boolean>; plugins: { id: string; visible: boolean }[] }
export interface AppState {
  layouts?: Record<string, CategoryLayout>;
  categories: Category[];
  links: LinkItem[];
  folders: Folder[];
  engines: Engine[];
  settings: {
    engine: string;
    columns: number;
    size: number;
    wallpaper: string;
    dim: number;
    greeting: string;
    newTab: boolean;
    showWidgets: boolean;
    searchNewTab: boolean; siteNewTab: boolean;
    showSearch: boolean; searchHeight: number; searchRadius: number; searchOpacity: number;
    iconRadius: number; iconOpacity: number; iconGap: number; showNames: boolean; nameSize: number; nameColor: string;
    showTime: boolean; showDate: boolean; showWeek: boolean; showLunar: boolean; hour12: boolean; showSeconds: boolean; timeSize: number; timeWeight: number; timeColor: string;
    theme: 'light' | 'dark' | 'system'; accent: string; blur: number;
    mode: 'normal' | 'minimal'; showGreeting: boolean;
    categoryTransition: 'none' | 'fade' | 'slide';
    sidebarPosition: 'left' | 'right'; sidebarAutoHide: boolean; rememberCategory: boolean; wheelCategories: boolean; sidebarOpacity: number; sidebarWidth: number;
  };
}
export const uid = () => crypto.randomUUID();
export const palette = [
  "#5b76ed",
  "#ee7774",
  "#48a49a",
  "#bc87d3",
  "#e3a747",
  "#45536a",
];
const sites = [
  ["GitHub", "https://github.com", "#252d3a", "GH"],
  ["Notion", "https://www.notion.so", "#ffffff", "N"],
  ["哔哩哔哩", "https://www.bilibili.com", "#ed87ac", "哔"],
  ["YouTube", "https://www.youtube.com", "#f26668", "▶"],
  ["即刻", "https://web.okjike.com", "#f7ca46", "J"],
  ["豆瓣", "https://www.douban.com", "#53a77b", "豆"],
  ["Figma", "https://www.figma.com", "#37394a", "F"],
  ["Dribbble", "https://dribbble.com", "#ed8eaf", "D"],
  ["知乎", "https://www.zhihu.com", "#428ae8", "知"],
  ["少数派", "https://sspai.com", "#e46561", "π"],
  ["网易云音乐", "https://music.163.com", "#e45e65", "♪"],
  ["ChatGPT", "https://chatgpt.com", "#70a89d", "✳"],
];
export const defaults = (): AppState => ({
  categories: [
    { id: "daily", name: "日常", symbol: "⌂" },
    { id: "work", name: "工作", symbol: "▤" },
    { id: "inspire", name: "灵感", symbol: "✧" },
    { id: "read", name: "阅读", symbol: "▥" },
  ],
  links: sites.map(([title, url, color, icon], i) => ({
    id: `site-${i}`,
    title,
    url,
    color,
    icon,
    category: "daily",
  })),
  folders: [{ id: "tools", name: "效率工具", category: "daily" }],
  engines: [
    {
      id: "bing",
      name: "必应",
      template: "https://www.bing.com/search?q={query}",
    },
    {
      id: "google",
      name: "Google",
      template: "https://www.google.com/search?q={query}",
    },
    {
      id: "baidu",
      name: "百度",
      template: "https://www.baidu.com/s?wd={query}",
    },
  ],
  settings: {
    engine: "bing",
    columns: 8,
    size: 58,
    wallpaper: "aurora",
    dim: 12,
    greeting: "把日子过成自己喜欢的样子。",
    newTab: true,
    showWidgets: true,
    searchNewTab: true, siteNewTab: true, showSearch: true, searchHeight: 46, searchRadius: 23, searchOpacity: 91,
    iconRadius: 17, iconOpacity: 100, iconGap: 30, showNames: true, nameSize: 12, nameColor: '#ffffff',
    showTime: true, showDate: true, showWeek: true, showLunar: false, hour12: false, showSeconds: false, timeSize: 72, timeWeight: 300, timeColor: '#ffffff',
    theme: 'light', accent: '#3b82f6', blur: 0, mode: 'normal', showGreeting: true, categoryTransition: 'fade',
    sidebarPosition: 'left', sidebarAutoHide: false, rememberCategory: false, wheelCategories: false, sidebarOpacity: 17, sidebarWidth: 50,
  },
});
export function safeUrl(value: string): string {
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("链接必须是无账户密码的 http:// 或 https:// 地址");
  return u.href;
}
export function imageValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length < 8_000_000 &&
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}
export function validateState(input: unknown): AppState {
  const s = input as AppState;
  const text = (v: unknown, max = 100): v is string =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  if (
    !s ||
    !Array.isArray(s.categories) ||
    !s.categories.length ||
    s.categories.length > 30 ||
    !Array.isArray(s.links) ||
    s.links.length > 1000 ||
    !Array.isArray(s.folders) ||
    s.folders.length > 100 ||
    !Array.isArray(s.engines) ||
    !s.engines.length ||
    s.engines.length > 20
  )
    throw new Error("备份数据结构或数量不正确");
  const unique = (items: { id: string }[]) =>
    new Set(items.map((x) => x.id)).size === items.length &&
    items.every((x) => text(x.id));
  if (![s.categories, s.links, s.folders, s.engines].every(unique))
    throw new Error("备份包含无效或重复标识");
  if (s.categories.some((c) => !text(c.name, 20) || !(typeof c.symbol === 'string' && (c.symbol.startsWith('lucide:') ? /^lucide:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(c.symbol) && c.symbol.length <= 71 : text(c.symbol, 5)))))
    throw new Error("分类信息不正确");
  const cats = new Set(s.categories.map((c) => c.id));
  if (s.folders.some((f) => !text(f.name, 30) || !cats.has(f.category)))
    throw new Error("文件夹信息不正确");
  for (const l of s.links) {
    if (
      !text(l.title, 40) ||
      !text(l.url, 4000) ||
      !cats.has(l.category) ||
      !/^#[\da-fA-F]{6}$/.test(l.color) ||
      (l.icon !== undefined && !(text(l.icon, 8) || imageValid(l.icon))) ||
      (l.folder !== undefined &&
        !s.folders.some((f) => f.id === l.folder && f.category === l.category))
    )
      throw new Error("链接信息不正确");
    safeUrl(l.url);
  }
  for (const e of s.engines) {
    if (
      !text(e.name, 20) ||
      !text(e.template, 4000) ||
      !e.template.includes("{query}")
    )
      throw new Error("搜索引擎必须包含 {query}");
    safeUrl(e.template.replaceAll("{query}", "test"));
  }
  const raw = s.settings;
  if (!raw || typeof raw !== 'object') throw new Error('桌面设置不正确');
  const p = { ...defaults().settings, ...raw,
    searchNewTab: raw.searchNewTab === undefined ? raw.newTab : raw.searchNewTab,
    siteNewTab: raw.siteNewTab === undefined ? raw.newTab : raw.siteNewTab };
  const ranges: Partial<Record<keyof AppState['settings'], [number, number]>> = {
    searchHeight: [32,80], searchRadius: [0,40], searchOpacity: [10,100], iconRadius: [0,40], iconOpacity: [10,100], iconGap: [0,60], nameSize: [10,24], timeSize: [32,120], timeWeight: [100,900], blur: [0,30], sidebarOpacity: [0,100], sidebarWidth: [44,90] };
  for (const [key, [min,max]] of Object.entries(ranges)) { const value = p[key as keyof typeof p]; if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('设置数值超出范围'); }
  for (const key of ['searchNewTab','siteNewTab','showSearch','showNames','showTime','showDate','showWeek','showLunar','hour12','showSeconds','showGreeting','sidebarAutoHide','rememberCategory','wheelCategories'] as const) if (typeof p[key] !== 'boolean') throw new Error('设置开关不正确');
  for (const key of ['nameColor','timeColor','accent'] as const) if (typeof p[key] !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(p[key])) throw new Error('设置颜色不正确');
  if (!['none','fade','slide'].includes(p.categoryTransition) || !['light','dark','system'].includes(p.theme) || !['normal','minimal'].includes(p.mode) || !['left','right'].includes(p.sidebarPosition)) throw new Error('设置选项不正确');
  if (
    !p ||
    !s.engines.some((e) => e.id === p.engine) ||
    !Number.isInteger(p.columns) ||
    p.columns < 4 ||
    p.columns > 20 ||
    !Number.isInteger(p.size) ||
    p.size < 42 ||
    p.size > 80 ||
    !Number.isFinite(p.dim) ||
    p.dim < 0 ||
    p.dim > 60 ||
    typeof p.greeting !== "string" ||
    p.greeting.length > 100 ||
    typeof p.newTab !== "boolean" ||
    typeof p.showWidgets !== "boolean" ||
    !(
      ["aurora", "dusk", "forest"].includes(p.wallpaper) ||
      imageValid(p.wallpaper)
    )
  )
    throw new Error("桌面设置不正确");
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 30_000_000)
    throw new Error(
      "桌面数据超过 30 MB，请减少或压缩上传图片，以保证完整备份可以恢复",
    );
  validateLayouts(s);
  return structuredClone({ ...s, settings: p });
}
export const WIDGET_KEY = "ztab.widgets.v1";
export const defaultWidgetSeed = (): WidgetLayoutSeed => ({ order: [...BUILTIN_WIDGETS], visible: Object.fromEntries(BUILTIN_WIDGETS.map(k => [k, !['weather', 'movie'].includes(k)])), plugins: [] });
export function reconcileLayouts(state: AppState, seed: WidgetLayoutSeed = defaultWidgetSeed()): AppState {
  const layouts: Record<string, CategoryLayout> = {};
  for (const category of state.categories) {
    const available: TileKey[] = [...seed.order.map(id => `widget:${id}` as TileKey), ...seed.plugins.map(p => `plugin:${p.id}` as TileKey), ...state.folders.filter(f => f.category === category.id).map(f => `folder:${f.id}` as TileKey), ...state.links.filter(l => l.category === category.id && !l.folder).map(l => `link:${l.id}` as TileKey)];
    const previous = state.layouts?.[category.id];
    const order = [...(previous?.order.filter(key => available.includes(key)) ?? []), ...available.filter(key => !previous?.order.includes(key))];
    const hidden = previous ? previous.hidden.filter(key => available.includes(key)) : available.filter(key => key.startsWith('widget:') ? !seed.visible[key.slice(7)] : key.startsWith('plugin:') && !seed.plugins.find(p => p.id === key.slice(7))?.visible);
    const sizes = previous?.sizes === undefined ? undefined : Object.fromEntries(Object.entries(previous.sizes).filter(([key, size]) => available.includes(key as TileKey) && validTileSize(size)));
    layouts[category.id] = { order, hidden, ...(sizes === undefined ? {} : { sizes }) };
  }
  return { ...state, layouts };
}
export function mergeVisibleOrder(order: TileKey[], visible: TileKey[]): TileKey[] {
  const keys = new Set(visible);
  if (keys.size !== visible.length || visible.some(key => !order.includes(key))) throw new Error('无效的磁贴排序');
  let index = 0;
  return order.map(key => keys.has(key) ? visible[index++] : key);
}
function validateLayouts(state: AppState) {
  if (state.layouts === undefined) return;
  if (!state.layouts || typeof state.layouts !== 'object' || Array.isArray(state.layouts) || Object.keys(state.layouts).length !== state.categories.length) throw new Error('分类布局不正确');
  for (const category of state.categories) {
    const layout = state.layouts[category.id];
    if (!layout || !Array.isArray(layout.order) || !Array.isArray(layout.hidden) || layout.order.length > 1200 || new Set(layout.order).size !== layout.order.length || new Set(layout.hidden).size !== layout.hidden.length) throw new Error('布局包含重复或无效引用');
    for (const key of layout.order) {
      if (typeof key !== 'string') throw new Error('磁贴引用不正确');
      const id = key.slice(key.indexOf(':') + 1);
      const valid = key.startsWith('widget:') ? (BUILTIN_WIDGETS as readonly string[]).includes(id) : key.startsWith('plugin:') ? /^[a-z][a-z0-9.-]{0,79}$/.test(id) : key.startsWith('folder:') ? state.folders.some(f => f.id === id && f.category === category.id) : key.startsWith('link:') && state.links.some(l => l.id === id && l.category === category.id && !l.folder);
      if (!valid) throw new Error('布局包含错误归属或无效引用');
    }
    if (layout.hidden.some(key => !layout.order.includes(key) || (!key.startsWith('widget:') && !key.startsWith('plugin:')))) throw new Error('隐藏组件引用不正确');
    if (layout.sizes !== undefined && (!layout.sizes || typeof layout.sizes !== 'object' || Array.isArray(layout.sizes) || Object.entries(layout.sizes).some(([key, size]) => !layout.order.includes(key as TileKey) || !validTileSize(size)))) throw new Error('磁贴尺寸或引用不正确');
    const required = [...BUILTIN_WIDGETS.map(id => `widget:${id}`), ...state.folders.filter(f => f.category === category.id).map(f => `folder:${f.id}`), ...state.links.filter(l => l.category === category.id && !l.folder).map(l => `link:${l.id}`)];
    if (required.some(key => !layout.order.includes(key as TileKey))) throw new Error('布局缺少磁贴');
  }
}
export interface Backup {
  format: "ztab";
  version: 1;
  exportedAt: string;
  data: AppState;
  widgets: unknown;
}
export function parseBackup(raw: string): Backup {
  if (new TextEncoder().encode(raw).byteLength > 35_000_000)
    throw new Error("备份超过 35 MB 限制");
  const b = JSON.parse(raw);
  if (b?.format !== "ztab" || b.version !== 1)
    throw new Error("不是受支持的 zTab v1 备份");
  const data = validateState(b.data);
  if (
    b.widgets !== null &&
    (typeof b.widgets !== "object" || Array.isArray(b.widgets))
  )
    throw new Error("组件备份必须为对象或 null");
  if (
    new TextEncoder().encode(JSON.stringify(b.widgets)).byteLength > 2_000_000
  )
    throw new Error("组件备份过大");
  if (data.layouts) {
    const plugins = new Set(Array.isArray(b.widgets?.plugins) ? b.widgets.plugins.map((p: { id: string }) => p.id) : []);
    for (const layout of Object.values(data.layouts)) if (layout.order.some(key => key.startsWith('plugin:') && !plugins.has(key.slice(7)))) throw new Error('布局引用未安装的插件');
  }
  return { ...b, data };
}
