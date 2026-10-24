import { useRootTheme } from './theme';
import { SearchBar } from './components/SearchBar';
import { AppreciationPopover } from './components/AppreciationPopover';
import { CategoryIconPicker } from './components/CategoryIconPicker';
import { CategoryIcon } from './components/categoryIcons';
import { AddIconPanel } from "./components/AddIconPanel";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from 'react-dom';
import {
  Plus,
  Settings,
  X,
  Pencil,
  Trash2,
  Folder as FolderIcon,
  ArrowLeft,
  Upload,
  Check,
  LayoutGrid,
  SlidersHorizontal,
  Link as LinkIcon,
  Sun,
} from "lucide-react";
import { WidgetPanel, validateWidgetBackup, widgetLayoutSeed, parseWidgetState } from "./components/Widgets";
import {
  defaults, reconcileLayouts, mergeVisibleOrder, groupLinksIntoFolder, TILE_SIZES, tileSize, type TileSize, type TileKey, type CategoryLayout,
  uid,
  palette,
  safeUrl,
  parseBackup,
  validateState,
  WIDGET_KEY,
  type AppState,
  type LinkItem,
  type Backup,
} from "./model";
import { loadState, saveState, readImage } from "./storage";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { SiteIcon } from './components/SiteIcon';
import { AnimatedOverlay } from './components/AnimatedOverlay';
import { useTileDrag, reorderItems } from './useTileDrag';
import "./styles.css";
import { Select } from './components/Select';
import { ColorPicker } from './components/ColorPicker';
import { dismissSelectOnEscape, ownsFloatingTarget } from './components/selectLayers';

function categoryFrames(effect: AppState['settings']['categoryTransition'], direction: number, entering: boolean): Keyframe[] {
  const rest = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
  const offset = entering ? direction * 10 : -direction * 10;
  const hidden = { opacity: 0, transform: effect === 'slide' ? `translateY(${offset}px)` : effect === 'slide-horizontal' ? `translateX(${offset}px)` : effect === 'zoom' ? `scale(${entering ? 0.97 : 1.03})` : 'none', filter: effect === 'blur' ? 'blur(4px)' : 'blur(0px)' };
  return entering ? [hidden, rest] : [rest, hidden];
}

type Modal = "link" | "folder" | "category" | "settings" | null;
export default function App() {
  const [state, setState] = useState<AppState>(defaults);
  useRootTheme(state.settings.theme, state.settings.accent);
  const [ready, setReady] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [fittingColumns, setFittingColumns] = useState(4);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(([entry]) => {
      const gap = state.settings.iconGap;
      setFittingColumns(Math.max(1, Math.floor((entry.contentRect.width + gap) / (state.settings.size + gap))));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [ready, state.settings.size, state.settings.iconGap, state.settings.mode]);
  const [storageFailed, setStorageFailed] = useState(false);
  const [active, setActive] = useState("daily");
  const [folder, setFolder] = useState<string>();
  const wheelTime = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const requestedCategory = useRef(active);
  const transitionSequence = useRef(0);
  const categoryAnimation = useRef<Animation | null>(null);
  const pendingEntrance = useRef<{ sequence: number; direction: number; effect: AppState['settings']['categoryTransition']; duration: number } | null>(null);
  const categoryIds = JSON.stringify(state.categories.map(c => c.id));
  const [transitionCommit, setTransitionCommit] = useState(0);
  function cancelCategoryAnimation() {
    transitionSequence.current++;
    pendingEntrance.current = null;
    categoryAnimation.current?.cancel();
    categoryAnimation.current = null;
  }
  function switchCategoryImmediately(id: string) {
    cancelCategoryAnimation();
    requestedCategory.current = id;
    setActive(id);
  }
  function selectCategory(id: string, wheelDirection?: number) {
    if (desktopDrag.dragging || !state.categories.some(c => c.id === id)) return;
    const previous = requestedCategory.current;
    cancelCategoryAnimation();
    requestedCategory.current = id;
    setFolder(undefined);
    const element = sectionRef.current;
    const effect = state.settings.categoryTransition;
    if (id === active || effect === 'none' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element?.animate) {
      setActive(id);
      return;
    }
    const direction = wheelDirection ?? (state.categories.findIndex(c => c.id === id) >= state.categories.findIndex(c => c.id === previous) ? 1 : -1);
    const sequence = transitionSequence.current;
    const duration = state.settings.categoryTransitionDuration / 2;
    const animation = element.animate(categoryFrames(effect, direction, false), { duration, easing: 'ease-in', fill: 'forwards' });
    categoryAnimation.current = animation;
    void animation.finished.then(() => {
      if (sequence !== transitionSequence.current) return;
      pendingEntrance.current = { sequence, direction, effect, duration };
      setActive(id);
      setTransitionCommit(sequence);
    }).catch(() => { /* Cancellation is expected when a newer selection wins. */ });
  }
  useLayoutEffect(() => {
    const pending = pendingEntrance.current;
    if (!pending || pending.sequence !== transitionSequence.current) return;
    pendingEntrance.current = null;
    categoryAnimation.current?.cancel();
    const element = sectionRef.current;
    if (!element?.animate) { categoryAnimation.current = null; return; }
    const animation = element.animate(categoryFrames(pending.effect, pending.direction, true), { duration: pending.duration, easing: 'ease-out' });
    categoryAnimation.current = animation;
    void animation.finished.then(() => {
      if (pending.sequence === transitionSequence.current) {
        animation.cancel();
        categoryAnimation.current = null;
      }
    }).catch(() => { /* Superseded animation. */ });
  }, [active, transitionCommit]);
  useLayoutEffect(() => {
    const settle = () => {
      cancelCategoryAnimation();
      const id = state.categories.some(c => c.id === requestedCategory.current) ? requestedCategory.current : state.categories[0].id;
      requestedCategory.current = id;
      setActive(id);
    };
    settle();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', settle);
    return () => { media.removeEventListener('change', settle); cancelCategoryAnimation(); };
  }, [state.settings.categoryTransition, state.settings.categoryTransitionDuration, categoryIds]);
  useEffect(() => {
    if (!ready) return;
    const target = state.categories.some(c => c.id === active) ? active : state.categories[0].id;
    if (target !== active) setActive(target);
    try { if (state.settings.rememberCategory) localStorage.setItem('ztab.active-category', target); else localStorage.removeItem('ztab.active-category'); } catch { /* Optional preference; desktop persistence reports its own errors. */ }
  }, [active, ready, state.categories, state.settings.rememberCategory]);
  const [modal, setModal] = useState<Modal>(null);
  const [deleting, setDeleting] = useState<{ key: TileKey; category: string } | { key: `category:${string}`; category: string; target: string; sourceName: string; targetName: string }>();
  const [editing, setEditing] = useState<LinkItem>();
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(new Date());
  const [manage, setManage] = useState(false);
  const [tab, setTab] = useState("opening");
  const [busy, setBusy] = useState(false);
  const [siteMenu, setSiteMenu] = useState<{ item: LinkItem; x: number; y: number }>();
  const [tileMenu, setTileMenu] = useState<{ key: TileKey | 'blank'; x: number; y: number; open?: () => void }>();
  const [categoryMenu, setCategoryMenu] = useState<{ id: string; x: number; y: number }>();
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [categoryEditTarget, setCategoryEditTarget] = useState<string>();
  const categoryInputs = useRef(new Map<string, HTMLInputElement>());
  function showCategoryMenu(id: string, trigger: HTMLElement, x: number, y: number) {
    menuTrigger.current = trigger;
    setSiteMenu(undefined);
    setTileMenu(undefined);
    setCategoryMenu({ id, x, y });
  }
  useEffect(() => {
    if (modal !== 'category' || !categoryEditTarget) return;
    const input = categoryInputs.current.get(categoryEditTarget);
    input?.scrollIntoView({ block: 'nearest' });
    input?.focus({ preventScroll: true });
    input?.select();
  }, [modal, categoryEditTarget]);
  const tileMenuRef = useRef<HTMLDivElement>(null);
  function showTileMenu(key: TileKey | 'blank', trigger: HTMLElement, x: number, y: number, open?: () => void) { menuTrigger.current = trigger; setCategoryMenu(undefined); setSiteMenu(undefined); setTileMenu({ key, x, y, open }); }
  useLayoutEffect(() => {
    const element = categoryMenu ? categoryMenuRef.current : tileMenu ? tileMenuRef.current : siteMenu ? menuRef.current : null;
    if (!element) return;
    const r = element.getBoundingClientRect(); element.style.left = `${Math.max(8, Math.min(r.left, innerWidth - r.width - 8))}px`; element.style.top = `${Math.max(8, Math.min(r.top, innerHeight - r.height - 8))}px`;
    element.querySelector<HTMLElement>('button:not(:disabled),select:not(:disabled)')?.focus();
    const close = () => { setCategoryMenu(undefined); setTileMenu(undefined); setSiteMenu(undefined); const target = menuTrigger.current?.isConnected ? menuTrigger.current : document.querySelector<HTMLElement>('.add-tile'); target?.focus(); };
    const key = (e: KeyboardEvent) => { if (dismissSelectOnEscape(e, element)) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close() } else if (e.key === 'Tab') { const nodes = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')]; if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus() } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus() } } };
    const pointer = (e: PointerEvent) => { if (!ownsFloatingTarget(element, e.target)) close() };
    const reposition = () => { const r = element.getBoundingClientRect(); element.style.left = `${Math.max(8, Math.min(r.left, innerWidth - r.width - 8))}px`; element.style.top = `${Math.max(8, Math.min(r.top, innerHeight - r.height - 8))}px`; };
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', pointer);
    window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', pointer); window.removeEventListener('resize', reposition) };
  }, [tileMenu, siteMenu, categoryMenu]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const modalBusy = useRef(busy);
  modalBusy.current = busy;
  useEffect(() => {
    if (!modal) return;
    const panel = document.querySelector<HTMLElement>('.modal-backdrop .modal');
    if (!panel) return;
    const returnFocus = document.querySelector<HTMLElement>('.animated-overlay.is-visible .animated-overlay-panel') ?? document.activeElement as HTMLElement | null;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')].filter(node => node.getClientRects().length);
    if (!panel.contains(document.activeElement)) focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('.delete-backdrop')) return;
      if (dismissSelectOnEscape(event, panel)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!modalBusy.current) setModal(null);
      } else if (event.key === 'Tab') {
        if (!panel.contains(event.target as Node) && ownsFloatingTarget(panel, event.target)) return;
        const targets = focusable();
        if (event.shiftKey && (document.activeElement === targets[0] || !panel.contains(document.activeElement))) { event.preventDefault(); targets.at(-1)?.focus(); }
        else if (!event.shiftKey && (document.activeElement === targets.at(-1) || !panel.contains(document.activeElement))) { event.preventDefault(); targets[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [modal]);
  const stateRef = useRef(state);
  const operation = useRef(false);
  const tell = (s: string) => setNotice(s);
  useEffect(() => {
    loadState()
      .then((loaded) => {
        const s = reconcileLayouts(loaded, widgetLayoutSeed());
        setState(s);
        stateRef.current = s;
        let remembered: string | null = null;
        try { remembered = s.settings.rememberCategory ? localStorage.getItem('ztab.active-category') : null; } catch { /* Preference is optional. */ }
        switchCategoryImmediately(s.categories.find(c => c.id === remembered)?.id ?? s.categories[0].id);
        setReady(true);
      })
      .catch(() => {
        setStorageFailed(true);
        setReady(true);
        tell(
          "无法读取本地数据库，已进入只读安全模式。原有数据未被覆盖。请退出隐私模式或检查存储权限后刷新。",
        );
      });
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  async function commit(next: AppState) {
    if (storageFailed) {
      tell("存储不可用，为保护原有数据，未执行修改。");
      return false;
    }
    if (operation.current) {
      tell("正在保存，请稍后重试");
      return false;
    }
    operation.current = true;
    setBusy(true);
    try {
      next = reconcileLayouts(next, widgetLayoutSeed());
      next = validateState(next);
      await saveState(next);
      stateRef.current = next;
      setState(next);
      return true;
    } catch (error) {
      tell(
        `保存失败：${error instanceof Error ? error.message : "空间不足或存储不可用"}。当前数据没有更改。`,
      );
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const pendingSettings = useRef<Partial<AppState['settings']>>({});
  const settingsSaving = useRef(false);
  const updateSettings = async (patch: Partial<AppState['settings']>) => {
    if (storageFailed) { tell('本地存储不可用，未修改设置'); return false; }
    pendingSettings.current = { ...pendingSettings.current, ...patch };
    setState(current => ({ ...current, settings: { ...current.settings, ...patch } }));
    if (settingsSaving.current) return true;
    settingsSaving.current = true;
    while (Object.keys(pendingSettings.current).length) {
      if (operation.current) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); continue; }
      const changes = pendingSettings.current;
      pendingSettings.current = {};
      const ok = await commit({ ...stateRef.current, settings: { ...stateRef.current.settings, ...changes } });
      if (!ok) { pendingSettings.current = {}; setState(stateRef.current); settingsSaving.current = false; return false; }
      if (Object.keys(pendingSettings.current).length) setState({ ...stateRef.current, settings: { ...stateRef.current.settings, ...pendingSettings.current } });
    }
    settingsSaving.current = false;
    return true;
  };
  useEffect(() => {
    const sync = () => { if (!operation.current && ready) void commit(reconcileLayouts(stateRef.current, widgetLayoutSeed())) };
    window.addEventListener('ztab:plugins-change', sync);
    return () => window.removeEventListener('ztab:plugins-change', sync);
  }, [ready]);
  const category =
    state.categories.find((c) => c.id === active) ?? state.categories[0];
  const opened = state.folders.find((f) => f.id === folder);
  const lastFolder = useRef(opened);
  if (opened) lastFolder.current = opened;
  const folderContent = opened ?? lastFolder.current;
  const links = state.links.filter((l) => l.category === category.id && !l.folder);
  const folderLinks = state.links.filter((l) => l.category === category.id && l.folder === folderContent?.id);
  const folders = state.folders.filter((f) => f.category === category.id);
  async function saveOrder(ordered: LinkItem[], destination: string | undefined, source: string) {
    if (destination !== undefined) {
      const target = destination || undefined;
      if (target && !stateRef.current.folders.some(f => f.id === target && f.category === category.id)) return;
      await moveLink(source, category.id, target);
      return;
    }
    const ids = new Set(ordered.map(item => item.id));
    const current = stateRef.current;
    const existing = current.links.filter(item => ids.has(item.id));
    if (existing.length !== ordered.length) return;
    let index = 0;
    const byId = new Map(current.links.map(item => [item.id, item]));
    const next = current.links.map(item => ids.has(item.id) ? byId.get(ordered[index++].id)! : item);
    if (next.some((item, i) => item.id !== current.links[i].id)) await commit({ ...current, links: next });
  }
  const layout = reconcileLayouts(state, widgetLayoutSeed()).layouts![category.id];
  const saveLayout = (next: CategoryLayout) => { const current = stateRef.current; return commit({ ...current, layouts: { ...current.layouts, [category.id]: { ...next, sizes: current.layouts?.[category.id]?.sizes } } }); };
  function tileStyle(key: TileKey): CSSProperties { const [cols, rows] = tileSize(layout, key).split('x').map(Number); return { '--tile-cols': cols, '--tile-rows': rows } as CSSProperties; }
  function layoutButtons(key: TileKey) {
    return <div className="tile-layout"><span>布局</span><div>{TILE_SIZES.map(size => <button key={size} aria-pressed={tileSize(layout, key) === size} disabled={busy} onClick={async () => { const current = stateRef.current; const target = current.layouts?.[category.id]; if (!target) return; await commit({ ...current, layouts: { ...current.layouts, [category.id]: { ...target, sizes: { ...target.sizes, [key]: size as TileSize } } } }); }}>{size.replace('x', '×')}</button>)}</div></div>;
  }
  const desktopDrag = useTileDrag({ items: layout.order.filter(key => !layout.hidden.includes(key) && (state.settings.showWidgets || (!key.startsWith('widget:') && !key.startsWith('plugin:')))).map(id => ({ id })), scope: `desktop-${category.id}`, disabled: busy || !!modal || !!folder || !!deleting, allowFolders: true, canDrop: id => id.startsWith('link:'), canGroup: (source, target) => source.startsWith('link:') && target.startsWith('link:'), onGroup: async (source, target, items) => {
    try {
      const next = groupLinksIntoFolder(stateRef.current, source.slice(5), target.slice(5), uid(), items.map(item => item.id));
      if (await commit(next)) tell('已创建文件夹，可打开后重命名');
    } catch (error) { tell(error instanceof Error ? error.message : '创建文件夹失败，请重试'); }
  }, onStart: () => { switchCategoryImmediately(active); setSiteMenu(undefined); setTileMenu(undefined) }, onCommit: async (items, destination, source) => {
    if (destination !== undefined && source.startsWith('link:')) { await moveLink(source.slice(5), category.id, destination || undefined); return; }
    await saveLayout({ ...layout, order: mergeVisibleOrder(layout.order, items.map(item => item.id)) });
  } });
  const folderDrag = useTileDrag({ items: folderLinks, scope: `folder-${folder ?? ''}`, disabled: busy || !!modal || !!deleting || !folder, allowFolders: true, onStart: () => setSiteMenu(undefined), onCommit: saveOrder });
  const folderTileDrag = desktopDrag;
  const [adding, setAdding] = useState(false);
  const [appreciating, setAppreciating] = useState(false);
  useEffect(() => {
    if (modal || adding || folder || siteMenu || tileMenu || categoryMenu || deleting) setAppreciating(false);
  }, [modal, adding, folder, siteMenu, tileMenu, categoryMenu, deleting]);
  function openLink(item?: LinkItem) {
    if (!item) { setAdding(true); return; }
    setEditing(item);
    setModal("link");
  }
  function showSiteMenu(item: LinkItem, trigger: HTMLElement, x: number, y: number) {
    menuTrigger.current = trigger;
    setCategoryMenu(undefined);
    setTileMenu(undefined);
    setSiteMenu({ item, x: Math.max(8, Math.min(x, window.innerWidth - 272)), y: Math.max(8, Math.min(y, window.innerHeight - 360)) });
  }
  async function moveLink(id: string, category: string, folder?: string) {
    const current = stateRef.current;
    if (!current.links.some((l) => l.id === id) ||
      !current.categories.some((c) => c.id === category) ||
      (folder && !current.folders.some((f) => f.id === folder && f.category === category))) return;
    if (await commit({ ...current, links: current.links.map((l) => l.id === id ? { ...l, category, folder } : l) })) {
      tell('网站已移动并保存');
      setSiteMenu(undefined);
      menuTrigger.current?.focus();
    }
  }
  const [deleteError, setDeleteError] = useState('');
  const deleteRef = useRef<HTMLElement>(null);
  const deletePending = useRef(false);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  function requestDelete(key: TileKey, categoryId = category.id) {
    deleteTrigger.current = menuTrigger.current?.isConnected && (siteMenu || tileMenu) ? menuTrigger.current : document.activeElement as HTMLElement;
    setSiteMenu(undefined); setTileMenu(undefined); setDeleteError(''); setDeleting({ key, category: categoryId });
  }
  function requestCategoryDelete(id: string, trigger: HTMLElement) {
    const current = stateRef.current;
    const source = current.categories.find(c => c.id === id);
    const target = current.categories.find(c => c.id !== id);
    if (!source || !target || busy) return;
    deleteTrigger.current = trigger;
    setDeleteError('');
    setDeleting({ key: `category:${id}`, category: id, target: target.id, sourceName: source.name, targetName: target.name });
  }
  useEffect(() => {
    if (!deleting) return;
    const panel = deleteRef.current!;
    panel.querySelector<HTMLElement>('[data-cancel]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!deletePending.current) setDeleting(undefined); }
      if (event.key === 'Tab') {
        const nodes = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (event.shiftKey && (document.activeElement === nodes[0] || !panel.contains(document.activeElement))) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && (document.activeElement === nodes.at(-1) || !panel.contains(document.activeElement))) { event.preventDefault(); nodes[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); const target = deleteTrigger.current?.isConnected ? deleteTrigger.current : document.querySelector<HTMLElement>(modal === 'category' ? '.category-modal .modal-close' : '.animated-overlay.is-visible .animated-overlay-panel, .add-tile'); target?.focus({ preventScroll: true }); };
  }, [deleting]);
  async function executeDelete(keep = false) {
    if (!deleting || deletePending.current) return;
    deletePending.current = true; setDeleteError('');
    const current = stateRef.current;
    const { key, category: categoryId } = deleting;
    const id = key.slice(key.indexOf(':') + 1);
    let next = current;
    if ('target' in deleting) {
      if (!current.categories.some(c => c.id === categoryId) || !current.categories.some(c => c.id === deleting.target)) {
        setDeleteError('源分类或目标分类已变更，请取消后重新选择。');
        deletePending.current = false;
        return;
      }
      const target = deleting.target;
      next = {
        ...current,
        categories: current.categories.filter(c => c.id !== categoryId),
        folders: current.folders.map(f => f.category === categoryId ? { ...f, category: target } : f),
        links: current.links.map(l => l.category === categoryId ? { ...l, category: target } : l),
      };
    }
    else if (key.startsWith('link:')) next = { ...current, links: current.links.filter(l => l.id !== id) };
    else if (key.startsWith('folder:')) next = { ...current, folders: current.folders.filter(f => f.id !== id), links: keep ? current.links.map(l => l.folder === id ? { ...l, folder: undefined } : l) : current.links.filter(l => l.folder !== id) };
    else { const target = current.layouts?.[categoryId]; if (target) next = { ...current, layouts: { ...current.layouts, [categoryId]: { ...target, hidden: [...new Set([...target.hidden, key as TileKey])] } } }; }
    try {
      if (await commit(next)) {
        if ('target' in deleting) { switchCategoryImmediately(deleting.target); setFolder(undefined); }
        else if (key === `folder:${folder}`) setFolder(undefined);
        setDeleting(undefined);
      }
      else setDeleteError('删除未保存，当前数据没有更改。请检查存储权限后重试。');
    } finally { deletePending.current = false; }
  }
  function removeLink(l: LinkItem) { requestDelete(`link:${l.id}`, l.category); }
  function removeFolder() { if (opened) requestDelete(`folder:${opened.id}`, opened.category); }
  async function exportData() {
    try {
      const raw = localStorage.getItem(WIDGET_KEY);
      const backup: Backup = {
        format: "ztab",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state,
        widgets: raw ? JSON.parse(raw) : null,
      };
      const serialized = JSON.stringify(backup);
      parseBackup(serialized);
      if (backup.widgets !== null && !validateWidgetBackup(backup.widgets))
        throw new Error("组件数据损坏，未导出不可恢复的备份");
      const blob = new Blob([serialized], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ztab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      tell("完整备份已导出，包含壁纸、图标与组件数据");
    } catch (error) {
      tell(
        `备份未导出：${error instanceof Error ? error.message : "请检查本地存储"}`,
      );
    }
  }
  async function importData(file: File) {
    try {
      if (file.size > 35_000_000) throw new Error("备份不能超过 35 MB");
      const b = parseBackup(await file.text());
      const seed = b.widgets === null ? undefined : parseWidgetState(b.widgets);
      b.data = reconcileLayouts(b.data, seed);
      if (b.widgets !== null && !validateWidgetBackup(b.widgets))
        throw new Error("组件备份结构不正确");
      if (
        !confirm(
          `将用备份中的 ${b.data.links.length} 个链接、${b.data.categories.length} 个分类及组件数据替换当前桌面。建议先导出备份。是否继续？`,
        )
      )
        return;
      if (storageFailed || operation.current)
        throw new Error("本地存储不可用或正在保存，请稍后再试");
      operation.current = true;
      setBusy(true);
      const old = localStorage.getItem(WIDGET_KEY);
      try {
        if (b.widgets === null) localStorage.removeItem(WIDGET_KEY);
        else localStorage.setItem(WIDGET_KEY, JSON.stringify(b.widgets));
        try {
          await saveState(b.data);
        } catch (e) {
          if (old === null) localStorage.removeItem(WIDGET_KEY);
          else localStorage.setItem(WIDGET_KEY, old);
          throw e;
        }
        stateRef.current = b.data;
        setState(b.data);
        switchCategoryImmediately(b.data.categories[0].id);
        setFolder(undefined);
        window.dispatchEvent(new Event("ztab:widgets-import"));
        tell("导入成功，桌面已完整恢复");
      } finally {
        operation.current = false;
        setBusy(false);
      }
    } catch (e) {
      tell(
        `导入未完成：${e instanceof Error ? e.message : "文件无法读取"}。已有桌面未替换。`,
      );
    }
  }
  async function reset() {
    if (
      !confirm(
        "确定清空所有自定义链接、壁纸和组件数据，并恢复初始桌面？此操作不能撤销，请先导出备份。独立搜索历史将保留，可在搜索设置中单独清空。",
      )
    )
      return;
    const next = defaults();
    try {
      const old = localStorage.getItem(WIDGET_KEY);
      localStorage.removeItem(WIDGET_KEY);
      if (await commit(next)) {
        switchCategoryImmediately("daily");
        setFolder(undefined);
        window.dispatchEvent(new Event("ztab:widgets-import"));
        tell("已恢复初始桌面");
      } else if (old !== null) localStorage.setItem(WIDGET_KEY, old);
    } catch {
      tell("无法清空本地数据，操作未完成");
    }
  }
  function renderLinks(items: LinkItem[], controller: { dragging?: string; onPointerDown: (event: import('react').PointerEvent<HTMLElement>, id: string) => void }, desktop = false) {
    return items.map((l, i) => <div key={l.id} data-sort-id={desktop ? `link:${l.id}` : l.id}
      style={desktop ? tileStyle(`link:${l.id}`) : undefined}
      className={`site ${manage ? 'editing' : ''} ${controller.dragging === (desktop ? `link:${l.id}` : l.id) ? 'tile-drag-placeholder' : ''}`}
      onPointerDown={event => controller.onPointerDown(event, desktop ? `link:${l.id}` : l.id)}
      onDragStart={event => event.preventDefault()}
      onContextMenu={event => {
        event.preventDefault(); event.stopPropagation();
        if (!controller.dragging) showSiteMenu(l, event.currentTarget.querySelector('a')!, event.clientX, event.clientY);
      }}
      onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          showSiteMenu(l, event.target as HTMLElement, rect.left, rect.bottom);
        }
      }}>
      <a className="site-icon" style={{ background: l.color, color: l.color === '#ffffff' || l.color === '#fff' ? '#252833' : 'white' }}
        aria-label={`${manage ? '编辑' : '打开'}${l.title}`} href={l.url} draggable={false}
        target={state.settings.siteNewTab ? '_blank' : '_self'} rel="noopener noreferrer"
        onClick={event => { if (manage) { event.preventDefault(); openLink(l); } }}><SiteIcon item={l} /></a>
      <span className="site-label">{l.title}</span>
      {manage && <div className="site-controls">
        <button aria-label={`编辑${l.title}`} onClick={() => openLink(l)}><Pencil size={11} /></button>
        <button aria-label={`删除${l.title}`} onClick={() => removeLink(l)}><X size={12} /></button>
        <button disabled={busy || i === 0} aria-label={`左移${l.title}`} onClick={() => void saveOrder(reorderItems(items, l.id, items[i - 1].id), undefined, l.id)}>‹</button>
        <button disabled={busy || i === items.length - 1} aria-label={`右移${l.title}`} onClick={() => void saveOrder(reorderItems(items, l.id, items[i + 1].id), undefined, l.id)}>›</button>
      </div>}
    </div>);
  }
  useEffect(() => {
    if (!ready || !state.settings.wheelCategories) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.app') || target.closest('.search, input, textarea, select, [role="combobox"], [contenteditable="true"], .ztab-widget-card, .site-context-menu, .modal-backdrop, .animated-overlay') || modal || adding || folder || siteMenu || tileMenu || categoryMenu || busy || event.ctrlKey || event.metaKey || Math.abs(event.deltaY) < 5 || Math.abs(event.deltaX) > Math.abs(event.deltaY) || state.categories.length < 2) return;
      event.preventDefault();
      if (Date.now() - wheelTime.current < 350) return;
      wheelTime.current = Date.now();
      const direction = event.deltaY > 0 ? 1 : -1;
      const index = Math.max(0, state.categories.findIndex(item => item.id === requestedCategory.current));
      selectCategory(state.categories[(index + direction + state.categories.length) % state.categories.length].id, direction);
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, [ready, modal, adding, folder, siteMenu, tileMenu, categoryMenu, busy, state.categories, active, state.settings.wheelCategories, state.settings.categoryTransition, state.settings.categoryTransitionDuration, desktopDrag.dragging]);
  const background = state.settings.wallpaper.startsWith("data:")
    ? { backgroundImage: `url(${state.settings.wallpaper})` }
    : {};
  if (!ready)
    return (
      <div className="loading">
        <span className="brand-mark">z</span>
        <p>正在打开你的桌面…</p>
      </div>
    );
  return (
    <div
      className={`app wallpaper-${state.settings.wallpaper.startsWith("data:") ? "custom" : state.settings.wallpaper}`}
      data-theme={state.settings.theme} data-side={state.settings.sidebarPosition} data-autohide={state.settings.sidebarAutoHide} data-names={state.settings.showNames}
      style={{ ...background, '--sidebar-width': `${state.settings.sidebarWidth}px`, '--sidebar-alpha': state.settings.sidebarOpacity / 100, '--icon-radius': `${state.settings.iconRadius}px`, '--icon-opacity': state.settings.iconOpacity / 100, '--icon-gap': `${state.settings.iconGap}px`, '--name-size': `${state.settings.nameSize}px`, '--name-color': state.settings.nameColor, '--time-size': `${state.settings.timeSize}px`, '--time-weight': state.settings.timeWeight, '--time-color': state.settings.timeColor, '--search-height': `${state.settings.searchHeight}px`, '--search-radius': `${state.settings.searchRadius}px`, '--search-alpha': state.settings.searchOpacity / 100, '--accent': state.settings.accent, '--wallpaper-blur': `${state.settings.blur}px` } as unknown as CSSProperties}
    >
      <div
        className="wallpaper-shade"
        style={{ background: `rgba(12,19,49,${state.settings.dim / 100})` }}
      />
      <aside className={`sidebar ${modal || siteMenu || tileMenu || categoryMenu || appreciating ? 'sidebar-pinned' : ''}`} aria-label="本地桌面导航">
        <button
          className="logo"
          title="zTab 首页"
          onClick={() => {
            selectCategory(state.categories[0].id);
            setFolder(undefined);
          }}
        >
          z<span>Tab</span>
        </button>
        <nav aria-label="桌面分类">
          {state.categories.map((c) => (
            <button
              key={c.id}
              title={c.name}
              aria-label={c.name}
              aria-current={category.id === c.id ? 'page' : undefined}
              className={`nav-item ${category.id === c.id ? "active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={categoryMenu?.id === c.id}
              onContextMenu={event => {
                event.preventDefault(); event.stopPropagation();
                showCategoryMenu(c.id, event.currentTarget, event.clientX, event.clientY);
              }}
              onKeyDown={event => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault(); event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  showCategoryMenu(c.id, event.currentTarget, rect.left, rect.bottom);
                }
              }}
              onClick={() => {
                setCategoryMenu(undefined);
                selectCategory(c.id);
                setFolder(undefined);
              }}
            >
              <span className="nav-symbol"><CategoryIcon symbol={c.symbol} /></span>
              <span className="nav-label">{c.name}</span>
            </button>
          ))}
          <button
            className="nav-add"
            title="管理分类"
            onClick={() => { setCategoryEditTarget(undefined); setModal("category"); }}
          >
            <Plus size={20} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <AppreciationPopover open={appreciating} onOpenChange={setAppreciating} side={state.settings.sidebarPosition} />
          <button title="桌面设置" onClick={() => setModal("settings")}>
            <Settings size={21} />
          </button>
        </div>
      </aside>
      <main className="desktop" tabIndex={-1} onContextMenu={event => { if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable],a,button,[data-sort-id]')) return; event.preventDefault(); showTileMenu('blank', event.currentTarget, event.clientX, event.clientY) }} onKeyDown={event => { if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && !(event.target as HTMLElement).closest('input,textarea,select,[data-sort-id]')) { event.preventDefault(); showTileMenu('blank', event.currentTarget, 100, 100) } }}>
        <div className="topline">
          <span>
            <span className="status-dot" /> 所有美好，正在发生
          </span>
        </div>
        <header className="hero">
          <div className="clock" hidden={!state.settings.showTime} aria-label="当前时间">
            {now.toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: state.settings.hour12,
              second: state.settings.showSeconds ? '2-digit' : undefined,
            })}
          </div>
          <div className="date">
            {(state.settings.showDate || state.settings.showWeek) && now.toLocaleDateString("zh-CN", {
              month: state.settings.showDate ? "long" : undefined,
              day: state.settings.showDate ? "numeric" : undefined,
              weekday: state.settings.showWeek ? "long" : undefined,
            })}
            {state.settings.showLunar && <small>{new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {month:'long', day:'numeric'}).format(now)}</small>}
            <Sun size={15} />
          </div>
          <SearchBar state={state} updateSettings={updateSettings} tell={tell} context={JSON.stringify([active, modal, adding, folder, !!siteMenu, !!tileMenu, !!categoryMenu, !!deleting])} />
        </header>
        <div className="workspace">
          <section ref={sectionRef} className="links-section desktop-view">
            <div className="section-heading">
              <div>
                <h1>{category.name}</h1>
                <span className="heading-note">
                  {opened ? "收藏在一起的灵感" : "常用网站，触手可及"}
                </span>
              </div>
            </div>
            {manage && (
              <p className="edit-hint">
                拖动网站图标调整顺序，点击铅笔编辑，也可以用左右箭头排序。
                {!folder && (
                  <button onClick={() => setModal("folder")}>
                    ＋ 新建文件夹
                  </button>
                )}
              </p>
            )}
            <div
              className="link-grid"
              ref={gridRef}
              data-drag-scope={`desktop-${category.id}`}
              style={
                {
                  "--columns": Math.min(state.settings.columns, fittingColumns),
                  "--icon-size": `${state.settings.size}px`,
                } as CSSProperties
              }
            >
              <WidgetPanel layout={layout} onAddIcons={() => setAdding(true)} enabled={state.settings.showWidgets} onLayout={next => void saveLayout(next)} drag={desktopDrag} onMenu={(key, trigger, x, y, open) => showTileMenu(key, trigger, x, y, open)} renderTiles={(tiles) => {
                folders.forEach(f => tiles.set(`folder:${f.id}`, (
                  <div style={tileStyle(`folder:${f.id}`)} className={`site ${folderTileDrag.dragging === `folder:${f.id}` ? 'tile-drag-placeholder' : ''}`} key={f.id} data-sort-id={`folder:${f.id}`} data-link-destination={f.id}
                    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); showTileMenu(`folder:${f.id}`, event.currentTarget.querySelector('button')!, event.clientX, event.clientY) }}
                    onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); const r = event.currentTarget.getBoundingClientRect(); showTileMenu(`folder:${f.id}`, event.target as HTMLElement, r.left, r.bottom) } }}
                    onPointerDown={event => folderTileDrag.onPointerDown(event, `folder:${f.id}`)} onDragStart={event => event.preventDefault()}>
                    <button
                      className="folder-tile"
                      onClick={() => setFolder(f.id)}
                      aria-expanded={folder === f.id}
                      aria-controls="ztab-folder-dialog"
                      title={`打开文件夹 ${f.name}`}
                    >
                      <div className="folder-preview">
                        {state.links
                          .filter((l) => l.folder === f.id)
                          .slice(0, 4)
                          .map((l) => (
                            <span key={l.id} style={{ background: l.color }}>
                              <SiteIcon item={l} />
                            </span>
                          ))}
                        {!state.links.some((l) => l.folder === f.id) && (
                          <FolderIcon size={27} />
                        )}
                      </div>
                    </button>
                    <span className="site-label">{f.name}</span>
                  </div>
                )));
                links.forEach(l => tiles.set(`link:${l.id}`, renderLinks([l], desktopDrag, true)));
                return desktopDrag.items.map(item => <div key={item.id} style={{ display: 'contents' }}>{tiles.get(item.id)}</div>);
              }} />
              <div className="site add-site">
                <button
                  className="add-tile"
                  title="添加图标"
                  onClick={() => openLink()}
                >
                  <Plus size={27} strokeWidth={1.5} />
                </button>
                <span className="site-label">添加图标</span>
              </div>
            </div>
            {desktopDrag.items.length === 0 && !folder && (
              <p className="empty-note">
                这里还是一片新天地，<button onClick={() => setAdding(true)}>添加图标</button>，选择网站或小组件吧。
              </p>
            )}
          </section>
        </div>
        <div className="corner-label">
          zTab <span>·</span> Make room for inspiration.
        </div>
      </main>
      <AnimatedOverlay open={!!opened} onClose={() => setFolder(undefined)} label={folderContent?.name ?? '文件夹'} id="ztab-folder-dialog" variant="folder">
        <h2 className="folder-dialog-title">{folderContent?.name}</h2>
        <div className="folder-dialog-body">
        <div className="folder-dialog-actions">
          <button data-link-destination="" className="folder-exit-target" title="返回分类（可拖入图标移出文件夹）" onClick={() => setFolder(undefined)}><ArrowLeft size={18} />移出文件夹</button>
          <button title="重命名文件夹" onClick={() => setModal('folder')}><Pencil size={16} /></button>
          <button title="删除文件夹" onClick={removeFolder}><Trash2 size={16} /></button>
          <button title={manage ? '完成编辑' : '编辑文件夹'} onClick={() => setManage(!manage)}>{manage ? <Check size={17} /> : <SlidersHorizontal size={17} />}</button>
          <button onClick={() => openLink()}><Plus size={18} />添加</button>
        </div>
        <div className="folder-link-grid" data-drag-scope={`folder-${folder ?? ''}`} style={{ '--icon-size': `${state.settings.size}px` } as CSSProperties}>
          {renderLinks(folderDrag.items, folderDrag)}
          <div className="site add-site"><button className="add-tile" title="添加图标到文件夹" onClick={() => openLink()}><Plus size={27} strokeWidth={1.5} /></button><span className="site-label">添加图标</span></div>
        </div>
        </div>
      </AnimatedOverlay>
      {categoryMenu && createPortal(
        <div ref={categoryMenuRef} className="category-context-menu" role="menu" aria-label="分类菜单"
          style={{ left: categoryMenu.x, top: categoryMenu.y }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={event => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
            }
          }}>
          <button role="menuitem" disabled={busy} onClick={() => {
            menuTrigger.current?.focus({ preventScroll: true });
            setCategoryEditTarget(categoryMenu.id);
            setCategoryMenu(undefined);
            setModal('category');
          }}><Pencil size={16} strokeWidth={1.6} />编辑</button>
          <button role="menuitem" disabled={busy || state.categories.length === 1} onClick={() => {
            const trigger = menuTrigger.current;
            if (trigger) requestCategoryDelete(categoryMenu.id, trigger);
            setCategoryMenu(undefined);
          }}><Trash2 size={16} strokeWidth={1.6} />移除</button>
        </div>, document.body
      )}
      {siteMenu && createPortal(
        <div ref={menuRef} className="site-context-menu" role="dialog" aria-label={`${siteMenu.item.title}的网站菜单`}
          style={{ left: siteMenu.x, top: siteMenu.y }}>
          <strong>{siteMenu.item.title}</strong>
          {!siteMenu.item.folder && layoutButtons(`link:${siteMenu.item.id}`)}
          <button disabled={busy} onClick={() => { openLink(siteMenu.item); setSiteMenu(undefined); }}><Pencil size={15} /> 编辑图标</button>
          <label>移动到分类
            <Select label="移动到分类" theme={state.settings.theme} disabled={busy} value={siteMenu.item.category} onValueChange={value => void moveLink(siteMenu.item.id, value)} options={state.categories.map(c => ({ value: c.id, label: c.name }))} />
          </label>
          <label>移动到文件夹
            <Select label="移动到文件夹" theme={state.settings.theme} disabled={busy} value={siteMenu.item.folder ?? ''} onValueChange={value => void moveLink(siteMenu.item.id, siteMenu.item.category, value || undefined)} options={[{ value: '', label: '分类桌面（移出文件夹）' }, ...state.folders.filter(f => f.category === siteMenu.item.category).map(f => ({ value: f.id, label: f.name }))]} />
          </label>
          <button className="delete-site" disabled={busy} onClick={async () => { await removeLink(siteMenu.item); setSiteMenu(undefined); }}><Trash2 size={15} /> 删除</button>
          <button onClick={() => { setSiteMenu(undefined); menuTrigger.current?.focus(); }}>关闭菜单</button>
        </div>, document.body
      )}
      {adding && <AddIconPanel state={state} active={category.id} folder={folder} onClose={() => setAdding(false)}
        onLink={async (site, category, folder) => commit({ ...stateRef.current, links: [...stateRef.current.links, { ...site, id: uid(), category, folder }] })}
        onWidget={async (key, category) => { const current = reconcileLayouts(stateRef.current, widgetLayoutSeed()); const target = current.layouts![category]; return commit({ ...current, settings: { ...current.settings, showWidgets: true }, layouts: { ...current.layouts, [category]: { ...target, hidden: target.hidden.filter(k => k !== key) } } }); }}
        renderCustom={(targetCategory, targetFolder) => <LinkEditor key={`${targetCategory}-${targetFolder}`} state={state} active={targetCategory} folder={targetFolder} busy={busy} continuous onError={tell} onSave={async (link, keepOpen) => { const ok = await commit({ ...stateRef.current, links: [...stateRef.current.links, link] }); if (ok && keepOpen !== true) setAdding(false); return ok; }} />} />}
      {tileMenu && createPortal(<div ref={tileMenuRef} className="site-context-menu" role="dialog" aria-label="桌面磁贴菜单" style={{ left: tileMenu.x, top: tileMenu.y }}>
        {tileMenu.key !== 'blank' && layoutButtons(tileMenu.key)}
        {tileMenu.key === 'blank' ? <>
          <strong>桌面菜单</strong><button onClick={() => { setTileMenu(undefined); openLink() }}>添加图标</button><button onClick={() => { setFolder(undefined); setModal('folder'); setTileMenu(undefined) }}>新建文件夹</button><button onClick={() => { setManage(true); setTileMenu(undefined) }}>进入编辑</button>
        </> : tileMenu.key.startsWith('folder:') ? (() => { const f = state.folders.find(f => `folder:${f.id}` === tileMenu.key); if (!f) return null; return <><strong>{f.name}</strong><button onClick={() => { setFolder(f.id); setTileMenu(undefined) }}>打开文件夹</button><button onClick={() => { setFolder(f.id); setModal('folder'); setTileMenu(undefined) }}>重命名</button><label>移动到分类<Select label="移动文件夹到分类" theme={state.settings.theme} value={f.category} disabled={busy} onValueChange={async category => { if (await commit({ ...stateRef.current, folders: stateRef.current.folders.map(x => x.id === f.id ? { ...x, category } : x), links: stateRef.current.links.map(x => x.folder === f.id ? { ...x, category } : x) })) setTileMenu(undefined) }} options={state.categories.map(c => ({ value: c.id, label: c.name }))} /></label><button disabled={busy} onClick={() => requestDelete(`folder:${f.id}`, f.category)}>删除</button></> })() : <>
          <strong>{tileMenu.key.startsWith('plugin:') ? '插件（仅当前分类隐藏；全局卸载请使用添加图标）' : '组件菜单'}</strong><button onClick={() => { tileMenu.open?.(); setTileMenu(undefined) }}>打开详情 / 设置</button><button disabled={busy} onClick={() => requestDelete(tileMenu.key as TileKey)}>删除</button>{[-1, 1].map(direction => <button key={direction} disabled={busy || layout.order.indexOf(tileMenu.key as TileKey) + direction < 0 || layout.order.indexOf(tileMenu.key as TileKey) + direction >= layout.order.length} onClick={async () => { const order = [...layout.order]; const i = order.indexOf(tileMenu.key as TileKey); [order[i], order[i + direction]] = [order[i + direction], order[i]]; if (await saveLayout({ ...layout, order })) setTileMenu(undefined) }}>{direction < 0 ? '前移' : '后移'}</button>)}
        </>}
        <button onClick={() => { setTileMenu(undefined); menuTrigger.current?.focus() }}>关闭菜单</button>
      </div>, document.body)}
      {deleting && createPortal(<div className="modal-backdrop delete-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deletePending.current) setDeleting(undefined); }}>
        <section ref={deleteRef} className="modal delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
          <button className="modal-close" aria-label="关闭删除确认" disabled={busy} onClick={() => setDeleting(undefined)}><X size={21} /></button>
          <div className="delete-warning" aria-hidden="true">!</div>
          <h2 id="delete-title">{'target' in deleting ? '删除分类' : deleting.key.startsWith('folder:') ? '删除文件夹' : deleting.key.startsWith('link:') ? '删除网站' : '删除组件'}</h2>
          <p id="delete-description">{'target' in deleting ? `删除「${deleting.sourceName}」分类？所有链接及文件夹将移到「${deleting.targetName}」，不会丢失。` : deleting.key.startsWith('folder:') ? '确认删除此文件夹？文件夹内的图标也将一并删除。选择“删除并保留图标”则仅解散文件夹，网站移回原分类桌面。' : deleting.key.startsWith('link:') ? `确认删除「${state.links.find(l => `link:${l.id}` === deleting.key)?.title ?? '此网站'}」？` : '仅从当前分类移除，组件内容保留，可在“添加图标”中恢复。插件不会全局卸载。'}</p>
          {deleteError && <p role="alert">{deleteError}</p>}
          <div className="delete-actions"><button data-cancel disabled={busy} onClick={() => setDeleting(undefined)}>取消</button>{deleting.key.startsWith('folder:') && <button disabled={busy} onClick={() => void executeDelete(true)}>删除并保留图标</button>}<button className="delete-danger" disabled={busy} onClick={() => void executeDelete()}>确认删除</button></div>
        </section>
      </div>, document.body)}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {modal && createPortal(
        <div
          className="modal-backdrop"
          inert={!!deleting}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            data-theme={state.settings.theme}
            className={`modal ${modal === "settings" ? "settings-modal" : modal === "category" ? "category-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "settings"
                ? "桌面设置"
                : modal === "link"
                  ? "网站设置"
                  : "分类与文件夹管理"
            }
          >
            <button
              className="modal-close"
              aria-label="关闭"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={21} />
            </button>
            {modal === "link" && (
              <LinkEditor
                key={editing?.id ?? "new"}
                item={editing}
                state={state}
                active={category.id}
                folder={folder}
                busy={busy}
                onError={tell}
                onSave={async (l) => {
                  if (
                    await commit({
                      ...state,
                      links: editing
                        ? state.links.map((x) => (x.id === l.id ? l : x))
                        : [...state.links, l],
                    })
                  )
                    setModal(null);
                }}
              />
            )}
            {modal === "folder" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(
                    new FormData(e.currentTarget).get("name"),
                  ).trim();
                  if (!name) return;
                  const folders = opened
                    ? state.folders.map((f) =>
                        f.id === opened.id ? { ...f, name } : f,
                      )
                    : [
                        ...state.folders,
                        { id: uid(), name, category: category.id },
                      ];
                  if (await commit({ ...state, folders })) setModal(null);
                }}
              >
                <div className="modal-icon">
                  <FolderIcon />
                </div>
                <h2>{opened ? "重命名文件夹" : "新建文件夹"}</h2>
                <p className="muted">把相关的网站放在一起，让桌面更清爽。</p>
                <label className="field">
                  文件夹名称
                  <input
                    name="name"
                    required
                    maxLength={30}
                    defaultValue={opened?.name}
                    autoFocus
                    placeholder="例如：设计灵感"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  保存文件夹
                </button>
              </form>
            )}
            {modal === "category" && (
              <>
                <div className="modal-icon">
                  <LayoutGrid />
                </div>
                <h2>我的分类</h2>
                <p className="muted category-intro">为不同的生活场景，留一个专属空间。选择图标、编辑名称，让每个空间一目了然。</p>
                <div className="category-modal-scroll">
                <div className="category-section-heading"><strong>分类列表</strong><span>{state.categories.length} / 30</span></div>
                <div className="category-list">
                  {state.categories.map((c, i) => (
                    <div key={c.id} className={categoryEditTarget === c.id ? 'category-edit-target' : undefined}>
                      <CategoryIconPicker name={c.name} value={c.symbol} disabled={busy} onChange={symbol => commit({...stateRef.current, categories:stateRef.current.categories.map(x => x.id === c.id ? {...x,symbol} : x)})} />
                      <button aria-label={`下移分类：${c.name}`} disabled={busy || i === state.categories.length - 1} onClick={() => { const categories=[...stateRef.current.categories]; [categories[i],categories[i+1]]=[categories[i+1],categories[i]]; void commit({...stateRef.current,categories}); }}>↓</button>
                      <input
                        ref={node => { if (node) categoryInputs.current.set(c.id, node); else categoryInputs.current.delete(c.id); }}
                        aria-label={`分类${c.name}`}
                        defaultValue={c.name}
                        maxLength={20}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== c.name)
                            commit({
                              ...state,
                              categories: state.categories.map((x) =>
                                x.id === c.id ? { ...x, name } : x,
                              ),
                            });
                          else e.target.value = c.name;
                        }}
                      />
                      <button
                        disabled={i === 0 || busy}
                        title="上移分类"
                        onClick={() => {
                          const a = [...state.categories];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          commit({ ...state, categories: a });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        title="删除分类"
                        disabled={state.categories.length === 1 || busy}
                        onClick={event => requestCategoryDelete(c.id, event.currentTarget)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="category-section-heading"><strong>新增分类</strong><span>给新空间起个名字</span></div>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const name = String(new FormData(form).get("name")).trim();
                    if (!name) return;
                    if (state.categories.length >= 30) {
                      tell("最多支持30个分类");
                      return;
                    }
                    const current = stateRef.current;
                    const id = uid();
                    const seed = widgetLayoutSeed();
                    const widgetKeys: TileKey[] = [...seed.order.map(key => `widget:${key}` as TileKey), ...seed.plugins.map(plugin => `plugin:${plugin.id}` as TileKey)];
                    if (
                      await commit({
                        ...current,
                        categories: [
                          ...current.categories,
                          { id, name, symbol: "lucide:sparkles" },
                        ],
                        layouts: { ...current.layouts, [id]: { order: widgetKeys, hidden: [...widgetKeys] } },
                      })
                    )
                      form.reset();
                  }}
                >
                  <input
                    aria-label="新分类名称"
                    name="name"
                    required
                    maxLength={20}
                    placeholder="新的分类名称"
                  />
                  <button className="primary" disabled={busy}>
                    <Plus size={17} /> 添加
                  </button>
                </form>
                <p className="muted fine">修改名称后点击输入框外部保存。</p>
                </div>
              </>
            )}
            {modal === "settings" && <SettingsDrawer {...{state,tab,setTab,busy,storageFailed,updateSettings,commit,tell,exportData,importData,reset}} />}
          </section>
        </div>, document.body
      )}
    </div>
  );
}
function LinkEditor({
  item,
  state,
  active,
  folder,
  busy,
  onError,
  onSave,
  continuous = false,
}: {
  item?: LinkItem;
  state: AppState;
  active: string;
  folder?: string;
  busy: boolean;
  onError: (s: string) => void;
  onSave: (l: LinkItem, keepOpen?: boolean) => Promise<boolean | void>;
  continuous?: boolean;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(item?.category ?? active);
  const [color, setColor] = useState(item?.color ?? palette[0]);
  const [icon, setIcon] = useState(item?.icon ?? "");
  const [destination, setDestination] = useState(item?.folder ?? folder ?? "");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          const title = String(fd.get("title")).trim();
          if (!title) throw new Error("请输入网站名称");
          const keepOpen = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "continue";
          const ok = await onSave({
            id: item?.id ?? uid(),
            title,
            url: safeUrl(String(fd.get("url")).trim()),
            color,
            icon: icon || undefined,
            category,
            folder: destination || undefined,
          }, keepOpen);
          if (ok && keepOpen) { setTitle(""); setUrl(""); setIcon(""); }
        } catch (err) {
          onError((err as Error).message);
        }
      }}
    >
      <div className="modal-icon">
        <LinkIcon />
      </div>
      <h2>{item ? "编辑网站" : "收藏一个新世界"}</h2>
      <p className="muted">直接抵达你想去的地方，没有任何中间跳转。</p>
      {!item && <details className="site-library">
        <summary>从常用网站图标库选择</summary>
        <div>{defaults().links.map((site) => <button type="button" key={site.id}
          onClick={() => { setTitle(site.title); setUrl(site.url); setColor(site.color); setIcon(site.icon ?? ''); }}>
          <span style={{ background: site.color, color: site.color === '#ffffff' ? '#252833' : '#fff' }}><SiteIcon item={site} /></span>{site.title}
        </button>)}</div>
        <p className="fine muted">选择后可修改名称、图标与位置，点击添加才会保存。</p>
      </details>}
      <label className="field">
        网站名称
        <input
          name="title"
          autoFocus
          required
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="给网站起个名字"
        />
      </label>
      <label className="field">
        网站地址
        <input
          name="url"
          required
          maxLength={4000}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </label>
      <div className="field-row">
        <label className="field">
          所属分类
          <Select label="所属分类" theme={state.settings.theme} value={category} disabled={busy} onValueChange={value => { setCategory(value); setDestination(''); }} options={state.categories.map(c => ({ value: c.id, label: c.name }))} />
        </label>
        <label className="field">
          文件夹
          <Select label="文件夹" theme={state.settings.theme} value={destination} disabled={busy} onValueChange={setDestination} options={[{ value: '', label: '不放入文件夹' }, ...state.folders.filter(f => f.category === category).map(f => ({ value: f.id, label: f.name }))]} />
        </label>
      </div>
      <label className="field">
        图标文字
        <input
          value={icon.startsWith("data:") ? "" : icon}
          maxLength={8}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="留空使用网站名称首字"
        />
      </label>
      <div className="icon-live-preview" aria-label="图标实时预览">
        <div className="site-icon" style={{ background: color, color: color.toLowerCase() === '#ffffff' ? '#252833' : '#fff' }}>
          <SiteIcon item={{ icon, title, url }} />
        </div>
        <span>{title.trim() || '网站名称'}</span>
        <small>实时预览 · 保存后生效</small>
      </div>
      <div className="icon-options">
        <ColorPicker label="图标颜色" value={color} onValueChange={setColor} presets={palette} disabled={busy || uploading} />
        <label className="upload-icon">
          <Upload size={14} /> 上传图标
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="上传网站图标"
            disabled={uploading || busy}
            onChange={async (e) => {
              const input = e.currentTarget;
              const f = input.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                setIcon(await readImage(f));
              } catch (err) {
                onError((err as Error).message);
              } finally {
                setUploading(false);
                input.value = '';
              }
            }}
          />
        </label>
        {icon.startsWith("data:") && (
          <button
            type="button"
            onClick={() => setIcon("")}
            title="移除上传图标"
          >
            <img width="30" height="30" src={icon} alt="已上传图标" /> ×
          </button>
        )}
      </div>
      {continuous && <button type="submit" value="continue" disabled={busy || uploading}>保存并继续</button>}
      <button className="primary full" disabled={busy || uploading}>
        {uploading ? "正在读取图标…" : busy ? "正在保存…" : item ? "保存修改" : "保存"}
      </button>
    </form>
  );
}
