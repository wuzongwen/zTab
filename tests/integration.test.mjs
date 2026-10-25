import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

test('shared switches retain controlled native semantics and settings wiring', async () => {
  const source = await readFile(new URL('../src/components/Switch.tsx', import.meta.url), 'utf8');
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  vm.runInNewContext(ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, { exports: mod.exports, React });
  const changes = [];
  const render = (checked, disabled = false) => mod.exports.Switch({ checked, disabled, 'aria-label': '测试', onCheckedChange: value => changes.push(value) }).children[0];
  const input = render(false);
  assert.equal(input.type, 'input');
  assert.equal(input.props.type, 'checkbox');
  assert.equal(input.props.role, 'switch');
  assert.equal(input.props['aria-label'], '测试');
  input.props.onChange({ currentTarget: { checked: true } });
  assert.deepEqual(changes, [true]);
  assert.equal(render(false).props.checked, false);
  assert.equal(render(true).props.checked, true);
  render(true, true).props.onChange({ currentTarget: { checked: false } });
  assert.deepEqual(changes, [true]);
  const panel = await readFile(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
  const drawer = await readFile(new URL('../src/components/SettingsDrawer.tsx', import.meta.url), 'utf8');
  assert.match(panel, /<Switch checked=\{p\[key\] as boolean\} onCheckedChange=\{checked=>void update\(\{\[key\]:checked\}\)\}/);
  assert.match(drawer, /onCheckedChange=\{checked => void updateSettings\(\{ showWidgets: checked \}\)\}/);
  assert.match(panel, /update\(\{ sidebarPosition: side \}\)/);
  assert.doesNotMatch(panel + drawer, /type="checkbox"/);
});

test('settings dialog contains scrolling content and resets only its scroll on group change', async () => {
  const drawer = await readFile(new URL('../src/components/SettingsDrawer.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const effects = [];
  const content = { scrollTop: 240 };
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  vm.runInNewContext(ts.transpileModule(drawer.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
    exports: mod.exports, React, useRef: () => ({ current: content }), useLayoutEffect: (effect, deps) => effects.push({ effect, deps }),
    Settings: 'svg', ShieldCheck: 'svg', Check: 'svg', Trash2: 'svg', SettingsPanel: 'SettingsPanel', settingGroups: [['search', '搜索栏'], ['about', '关于']],
  });
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  const groups = [];
  const render = tab => mod.exports.SettingsDrawer({ state: { engines: [{ id: 'e' }], settings: { engine: 'e' } }, tab, setTab: id => groups.push(id) });
  const tree = render('search');
  const scroll = nodes(tree).find(node => node.props.className === 'settings-scroll');
  assert.ok(nodes(scroll).some(node => node.type === 'SettingsPanel'));
  assert.ok(!nodes(scroll).some(node => node.props.className === 'settings-bottom'));
  assert.equal(nodes(tree).find(node => node.props.className === 'settings-bottom').props.role, 'status');
  const buttons = nodes(tree).filter(node => node.type === 'button');
  assert.equal(buttons[0].props['aria-current'], 'page');
  buttons[1].props.onClick();
  assert.deepEqual(groups, ['about']);
  effects[0].effect();
  assert.equal(content.scrollTop, 0);
  content.scrollTop = 180;
  render('about');
  assert.equal(effects[1].deps[0], 'about');
  effects[1].effect();
  assert.equal(content.scrollTop, 0);
  assert.doesNotMatch(drawer, /\.focus\(|createPortal|onKeyDown/);
  assert.match(css, /width: 1000px; height: min\(780px, calc\(100dvh - 48px\)\)/);
  assert.match(css, /grid-template-columns: 180px minmax\(0, 1fr\)/);
  assert.match(css, /\.settings-scroll \{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.doesNotMatch(css, /drawer-in|inset: 0 0 0 auto/);
  assert.match(app, /if \(dismissSelectOnEscape\(event, panel\)\) return/);
  assert.match(app, /e.target === e.currentTarget && !busy/);
});

test('opening settings move to search and custom icons without leaving an empty default tab', async () => {
  const source = await readFile(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  vm.runInNewContext(ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
    exports: mod.exports, React, useSystemDark: () => false, Switch: 'Switch', SearchHistoryControls: 'SearchHistoryControls',
  });
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  const updates = [];
  const tree = mod.exports.SettingsPanel({ settings: { searchNewTab: false }, group: 'search', update: patch => updates.push(patch) });
  const toggle = nodes(tree).find(node => node.props.key === 'searchNewTab');
  assert.ok(toggle.children.includes('在新标签页打开搜索结果'));
  const control = nodes(toggle).find(node => node.type === 'Switch');
  assert.equal(control.props.checked, false);
  control.props.onCheckedChange(true);
  assert.equal(updates[0].searchNewTab, true);
  assert.ok(!mod.exports.settingGroups.some(([id]) => id === 'opening'));
  assert.equal(mod.exports.settingGroups[0][0], 'search');
  assert.doesNotMatch(source, /toggle\('siteNewTab'/);
  assert.match(app, /\[tab, setTab\] = useState\("search"\)/);
});

test('icon editor initializes and saves individual opening preferences without changing other links', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('function LinkEditor('));
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  for (const global of [true, false]) for (const preference of [undefined, true, false]) for (const editing of [false, true]) {
    const values = [];
    let hook = 0;
    const errors = [], saved = [];
    let succeeds = true;
    const state = { settings: { siteNewTab: global }, categories: [{ id: 'daily', name: '日常' }], folders: [], links: [{ id: 'other', newTab: !global }] };
    const item = editing ? { id: 'edited', title: '网站', url: 'https://example.com/', category: 'daily', color: '#ffffff', newTab: preference } : undefined;
    const original = JSON.stringify({ state, item });
    const context = vm.createContext({
      React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
      useState(initial) { const index = hook++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = value; }]; },
      defaults: () => ({ links: [] }), palette: ['#ffffff'], LinkIcon: 'svg', Select: 'Select', Switch: 'Switch', SiteIcon: 'SiteIcon', ColorPicker: 'ColorPicker', Upload: 'svg',
      FormData: class { get(name) { return name === 'title' ? '新网站' : 'https://example.com/'; } }, safeUrl: value => value, uid: () => 'new-link',
    });
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText, context);
    const render = (busy = false) => { hook = 0; return context.LinkEditor({ state, item, active: 'daily', busy, continuous: true, onError: error => errors.push(error), onSave: async (link, keepOpen) => { saved.push({ link, keepOpen }); return succeeds; } }); };
    let tree = render();
    const control = () => nodes(tree).find(node => node.type === 'Switch');
    const initial = item?.newTab ?? global;
    assert.equal(control().props.checked, initial);
    assert.equal(saved.length, 0);
    const submit = keepOpen => tree.props.onSubmit({ preventDefault() {}, nativeEvent: { submitter: { getAttribute: () => keepOpen ? 'continue' : null } } });
    await submit(false);
    assert.equal(saved[0].link.newTab, initial);
    assert.equal(saved[0].link.id, editing ? 'edited' : 'new-link');
    control().props.onCheckedChange(!initial);
    tree = render();
    await submit(true);
    assert.equal(saved[1].link.newTab, !initial);
    assert.equal(saved[1].keepOpen, true);
    tree = render();
    assert.equal(control().props.checked, !initial);
    assert.equal(nodes(tree).find(node => node.props.name === 'title').props.value, '');
    nodes(tree).find(node => node.props.name === 'title').props.onChange({ target: { value: '失败后保留' } });
    succeeds = false;
    await submit(true);
    tree = render();
    assert.equal(nodes(tree).find(node => node.props.name === 'title').props.value, '失败后保留');
    tree = render(true);
    assert.equal(control().props.disabled, true);
    assert.equal(JSON.stringify({ state, item }), original);
    assert.deepEqual(errors, []);
  }
});

test('desktop and folder links apply per-icon targets and retain the legacy fallback', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('  function renderLinks('), app.indexOf('  useEffect(() => {', app.indexOf('  function renderLinks(')));
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  for (const global of [true, false]) for (const newTab of [undefined, true, false]) for (const desktop of [true, false]) {
    const context = vm.createContext({
      React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
      state: { settings: { siteNewTab: global } }, manage: false, tileStyle: () => ({}), SiteIcon: 'SiteIcon',
    });
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText, context);
    const [tree] = context.renderLinks([{ id: 'link', title: '网站', url: 'https://example.com/', newTab }], {}, desktop);
    const anchor = nodes(tree).find(node => node.type === 'a');
    assert.equal(anchor.props.target, (newTab ?? global) ? '_blank' : '_self');
    assert.equal(anchor.props.rel, 'noopener noreferrer');
  }
});

test('settings reuse the add-icon overlay backdrop and full transition lifecycle', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const addIcon = await readFile(new URL('../src/components/AddIconPanel.tsx', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../src/components/AnimatedOverlay.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /<AnimatedOverlay open=\{modal === 'settings'\}[^\n]*closeDisabled=\{busy\}[^\n]*className="modal settings-modal">\s*<SettingsDrawer/);
  assert.match(app, /modal && modal !== 'settings' && createPortal/);
  assert.match(app, /if \(!modal \|\| modal === 'settings'\) return/);
  assert.match(addIcon, /<AnimatedOverlay open onClose=\{onClose\}/);
  assert.match(overlay, /setTimeout\(\(\) => setPresent\(false\), 300\)/);
  assert.match(css, /\.animated-overlay \{[^}]*background: rgb\(0 0 0 \/ 50%\);[^}]*transition: opacity 300ms ease/);
  assert.match(css, /\.animated-overlay-panel \{[^}]*transform: translateY\(-20px\);[^}]*transition: transform 300ms ease/);
  assert.match(css, /\.modal:not\(\.animated-overlay-panel\)[^}]*transition: background-color/);
  assert.doesNotMatch(css, /settings-in/);
});

test('shared overlay blocks all dismissal paths while settings are saving', async () => {
  const source = await readFile(new URL('../src/components/AnimatedOverlay.tsx', import.meta.url), 'utf8');
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  const listeners = new Map();
  let refs = [], effects = [], closed = 0;
  const element = { focus() {}, contains: () => false };
  const document = { body: { style: { overflow: '' } }, querySelector: () => null,
    addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
  vm.runInNewContext(ts.transpileModule(source.replace(/^import .*$/gm, ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, {
    exports: mod.exports, React, X: 'svg', document, createPortal: tree => tree,
    useState: value => [value, () => {}], useRef: value => ({ current: refs.shift() ?? value }),
    useLayoutEffect() {}, useEffect: effect => effects.push(effect), dismissSelectOnEscape: () => false,
    window: { matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }) },
  });
  for (const disabled of [true, false]) {
    refs = [element]; effects = [];
    const tree = mod.exports.AnimatedOverlay({ open: true, closeDisabled: disabled, label: '桌面设置', onClose: () => closed++ });
    const cleanup = effects.map(effect => effect());
    const before = closed;
    tree.props.onPointerDown({ target: element, currentTarget: element });
    listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(closed - before, disabled ? 0 : 2);
    assert.equal(tree.children[0].children[0].props.disabled, disabled);
    cleanup.reverse().forEach(fn => fn?.());
    assert.equal(document.body.style.overflow, '');
    assert.equal(listeners.size, 0);
  }
});

test('category wheel listener is opt-in and detached when disabled', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const effect = app.slice(app.lastIndexOf('  useEffect(() => {', app.indexOf('    const onWheel =')), app.indexOf('  const background ='));
  assert.ok(effect.length > 0);
  assert.match(effect, /state.settings.wheelCategories, state.settings.categoryTransition/);
  for (const enabled of [false, true]) {
    const listeners = [];
    const body = effect.slice(effect.indexOf('{') + 1, effect.lastIndexOf('}, ['));
    const cleanup = new Function('ready', 'state', 'document', 'wheelGesture', ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(true, { settings: { wheelCategories: enabled } }, { addEventListener: (...args) => listeners.push(args), removeEventListener: (...args) => listeners.push(args) }, { current: {} });
    assert.equal(listeners.length, enabled ? 1 : 0);
    if (enabled) { cleanup(); assert.equal(listeners.length, 2); assert.equal(listeners[0][1], listeners[1][1]); }
  }
});

test('category wheel treats inertia as one gesture and preserves excluded scrolling', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const effect = app.slice(app.lastIndexOf('  useEffect(() => {', app.indexOf('    const onWheel =')), app.indexOf('  const background ='));
  const body = effect.slice(effect.indexOf('{') + 1, effect.lastIndexOf('}, ['));
  let now = 0, handler;
  const selected = [];
  class Element { constructor(excluded = false, outside = false) { this.excluded = excluded; this.outside = outside; } closest(selector) { return selector === '.app' ? !this.outside : this.excluded; } }
  const context = vm.createContext({ ready: true, state: { settings: { wheelCategories: true }, categories: ['a', 'b', 'c', 'd'].map(id => ({ id })) },
    document: { addEventListener: (_name, fn) => { handler = fn; }, removeEventListener() {} }, window: { innerHeight: 800 }, Element,
    wheelGesture: { current: { lastTime: -Infinity, distance: 0, locked: false } }, Date: { now: () => now },
    modal: null, adding: false, folder: null, siteMenu: null, tileMenu: null, categoryMenu: null, busy: false, desktopDrag: {},
    requestedCategory: { current: 'a' }, selectCategory(id) { selected.push(id); context.requestedCategory.current = id; },
  });
  vm.runInContext(`(() => { ${ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText} })()`, context);
  const wheel = (deltaY, gap = 16, extra = {}) => { now += gap; let prevented = false; handler({ target: new Element(), deltaY, deltaX: 0, deltaMode: 0, preventDefault() { prevented = true; }, ...extra }); return prevented; };
  assert.equal(wheel(30), true);
  for (let i = 0; i < 100; i++) assert.equal(wheel(i < 20 ? 12 : 0.2), true);
  assert.deepEqual(selected, ['b']);
  wheel(-2); wheel(-10);
  assert.deepEqual(selected, ['b']);
  wheel(30, 201);
  assert.deepEqual(selected, ['b', 'c']);
  for (let i = 0; i < 6; i++) wheel(4, i ? 16 : 201);
  assert.equal(selected.at(-1), 'd');
  wheel(2, 201, { deltaMode: 1 });
  assert.equal(selected.at(-1), 'a');
  wheel(-1, 201, { deltaMode: 2 });
  assert.equal(selected.at(-1), 'd');
  const count = selected.length;
  for (const extra of [{ target: new Element(true) }, { target: new Element(false, true) }, { ctrlKey: true }, { metaKey: true }, { defaultPrevented: true }, { deltaX: 50 }]) assert.equal(wheel(30, 201, extra), false);
  for (const flag of ['modal', 'adding', 'folder', 'siteMenu', 'tileMenu', 'categoryMenu', 'busy']) { context[flag] = true; assert.equal(wheel(30, 201), false); context[flag] = false; }
  context.desktopDrag.dragging = 'link'; assert.equal(wheel(30, 201), false);
  assert.equal(selected.length, count);
});

test('category animations resume their visual state and ignore superseded completions', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const helper = app.slice(app.indexOf('function categoryFrames'), app.indexOf('type Modal ='));
  const functions = app.slice(app.indexOf('  function cancelCategoryAnimation('), app.indexOf('  useLayoutEffect(() => {', app.indexOf('  function selectCategory(')));
  const animations = [], committed = [];
  const sample = { opacity: '0.35', transform: 'matrix(1, 0, 0, 1, 0, -5)', filter: 'blur(2px)' };
  const context = vm.createContext({ desktopDrag: {}, state: { categories: ['a', 'b', 'c'].map(id => ({ id })), settings: { categoryTransition: 'slide', categoryTransitionDuration: 1000 } },
    active: 'a', requestedCategory: { current: 'a' }, transitionSequence: { current: 0 }, pendingEntrance: { current: null }, categoryAnimation: { current: null },
    sectionRef: { current: { animate(frames, options) { let resolve; const animation = { frames, options, finished: new Promise(done => { resolve = done; }), finish() { resolve(); }, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; } } },
    window: { matchMedia: () => ({ matches: false }) }, getComputedStyle: () => sample, setFolder() {}, setActive: id => committed.push(id), setTransitionCommit() {},
  });
  vm.runInContext(ts.transpileModule(helper + functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.selectCategory('b');
  context.selectCategory('b');
  assert.equal(animations.length, 1);
  assert.equal(animations[0].options.duration, 500);
  context.selectCategory('c');
  assert.equal(animations[0].cancelled, true);
  assert.equal(animations[1].frames[0].opacity, sample.opacity);
  assert.equal(animations[1].frames[0].transform, sample.transform);
  context.selectCategory('a');
  assert.equal(animations[2].frames[0].opacity, sample.opacity);
  assert.equal(animations[2].frames[1].opacity, 1);
  animations.forEach(animation => animation.finish());
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(committed, []);
  assert.equal(context.categoryAnimation.current, null);
  context.selectCategory('b'); animations.at(-1).finish();
  await Promise.resolve();
  assert.deepEqual(committed, ['b']);
  assert.equal(context.pendingEntrance.current.sequence, context.transitionSequence.current);
});

test('shared colors validate native and preset changes and stay controlled on rollback', async () => {
  const source = await readFile(new URL('../src/components/ColorPicker.tsx', import.meta.url), 'utf8');
  const mod = { exports: {} };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  vm.runInNewContext(ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, { exports: mod.exports, React, Palette: 'svg', useId: () => 'hint' });
  const { ColorPicker, isHexColor } = mod.exports;
  for (const value of ['#000000', '#ffffff', '#AbC123']) assert.equal(isHexColor(value), true);
  for (const value of ['', '#fff', 'abcdef', '#abcdef00', '#abcdeg', 'red', '#123456\n']) assert.equal(isHexColor(value), false);
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  const changes = [];
  const render = (value, disabled = false) => nodes(ColorPicker({ value, label: '颜色', disabled, presets: ['#abcdef'], onValueChange: value => changes.push(value) }));
  let tree = render('#123456');
  const input = tree.find(node => node.type === 'input');
  assert.equal(input.props.value, '#123456');
  for (const value of ['#123', 'red', '#123456']) input.props.onChange({ currentTarget: { value } });
  assert.deepEqual(changes, []);
  input.props.onChange({ currentTarget: { value: '#ABCDEF' } });
  assert.deepEqual(changes, ['#ABCDEF']);
  tree = render('#ABCDEF');
  assert.equal(tree.find(node => node.type === 'button').props['aria-pressed'], true);
  tree = render('#123456'); // parent rollback is the sole displayed source
  assert.equal(tree.find(node => node.type === 'strong').children[0], '#123456');
  tree.find(node => node.type === 'button').props.onClick();
  assert.equal(changes.at(-1), '#abcdef');
  for (const node of render('#123456', true).filter(node => ['input', 'button'].includes(node.type))) {
    assert.equal(node.props.disabled, true);
    if (node.type === 'button') node.props.onClick();
    else node.props.onChange({ currentTarget: { value: '#000000' } });
  }
  assert.equal(changes.length, 2);
  const panel = await readFile(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
  for (const key of ['accent', 'nameColor', 'timeColor']) assert.ok(panel.includes(`color('${key}'`));
  assert.match(panel, /<ColorPicker label=\{label\} value=\{p\[key\]\} onValueChange=\{value=>void update\(\{\[key\]:value\}\)\}/);
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<ColorPicker label="图标颜色" value=\{color\} onValueChange=\{setColor\} presets=\{palette\} disabled=\{busy \|\| uploading\}/);
  assert.doesNotMatch(panel + app, /type="color"|className="color-options"/);
});

test('desktop entrances, hidden scrolling and icon column controls stay scoped', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const drawer = await readFile(new URL('../src/components/SettingsDrawer.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/AddIconPanel.tsx', import.meta.url), 'utf8');
  const drag = await readFile(new URL('../src/useTileDrag.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /本地空间|自定义桌面|className="section-actions"/);
  assert.match(app, /className="add-tile"/);
  assert.match(app, /编辑文件夹/);
  assert.match(app, /进入编辑/);
  assert.match(app, /new ResizeObserver/);
  assert.match(app, /Math\.min\(state\.settings\.columns, fittingColumns\)/);
  assert.match(css, /\.desktop::\-webkit-scrollbar \{ display: none; \}/);
  assert.match(css, /height: 100dvh;\s*min-height: 0;\s*overflow: auto;\s*scrollbar-width: none/);
  assert.match(drag, /closest<HTMLElement>\('\.animated-overlay-panel, \.desktop'\)/);
  assert.match(drawer, /aria-label="每行图标数量"[\s\S]*?max="20"/);
  assert.match(panel, /disabled=\{pending\} onClick=\{\(\) => pluginInput\.current\?\.click\(\)\}/);
  assert.match(panel, /ref=\{pluginInput\} hidden/);
  assert.match(panel, /perform\(\(\) => importPlugin\(file\)/);
});

test('desktop focus stays borderless without removing keyboard context menu support', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /<main className="desktop" tabIndex=\{-1\}[^\n]*onKeyDown=/);
  assert.match(css, /:root \.desktop:focus-visible\s*\{\s*outline: none;\s*box-shadow: none;\s*\}/);
  assert.ok(css.indexOf(':root .desktop:focus-visible') > css.indexOf(':root :is(button,input,textarea,select,[tabindex]):focus-visible'));
  assert.match(css, /:root :is\(button,input,textarea,select,\[tabindex\]\):focus-visible,[\s\S]*?box-shadow: inset 0 0 0 2px var\(--focus\)/);
});

test('appreciation replaces appearance shortcut and preserves the original local QR image', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/components/AppreciationPopover.tsx', import.meta.url), 'utf8');
  const image = await readFile(new URL('../public/wechat-appreciation.jpeg', import.meta.url));
  assert.equal(createHash('sha256').update(image).digest('hex'), 'c19265de3c9750d55c20dc83c2cc4626772da012cafa546c7c8f6240f6309384');
  assert.match(app, /<AppreciationPopover open=\{appreciating\} onOpenChange=\{setAppreciating\} side=\{state.settings.sidebarPosition\}/);
  assert.match(app, /categoryMenu \|\| appreciating \? 'sidebar-pinned'/);
  assert.match(app, /if \(modal \|\| adding \|\| folder \|\| siteMenu \|\| tileMenu \|\| categoryMenu \|\| deleting\) setAppreciating\(false\)/);
  assert.match(app, /title="桌面设置"/);
  assert.doesNotMatch(app, /title="外观设置"/);
  assert.match(source, /import.meta.env.BASE_URL\}wechat-appreciation.jpeg/);
  assert.doesNotMatch(source, /fetch\(|window.open|location.href|aria-modal|preventDefault\(\).*Tab/);
});

test('appreciation popover toggles, closes safely, positions in the viewport and removes listeners', async () => {
  const source = await readFile(new URL('../src/components/AppreciationPopover.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/appreciation-popover.css', import.meta.url), 'utf8');
  assert.match(css, /grid-auto-rows: max-content;/);
  assert.match(css, /overflow-y: auto;/);
  assert.match(css, /overscroll-behavior: contain;/);
  const code = ts.transpileModule(source.replace(/^import .*$/gm, '').replaceAll('import.meta.env.BASE_URL', '"/ztab/"'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  for (const [side, width, height] of [['left', 1200, 800], ['right', 1200, 800], ['left', 240, 320], ['left', 320, 220], ['right', 320, 200]]) {
    const changes = [], effects = [], targets = [];
    const eventTarget = () => {
      const listeners = new Map();
      const target = {
        listeners,
        addEventListener(name, handler) { assert.ok(!listeners.has(name)); listeners.set(name, handler); },
        removeEventListener(name, handler) { assert.equal(listeners.get(name), handler); listeners.delete(name); },
      };
      targets.push(target);
      return target;
    };
    const sidebar = eventTarget();
    const button = {
      contains: node => node === button,
      closest: () => sidebar,
      focus() { button.focused = true; },
      getBoundingClientRect: () => ({ left: side === 'left' ? 10 : width - 38, right: side === 'left' ? 38 : width - 10, bottom: height - 50 }),
    };
    const popup = {
      style: {}, contains: node => node === popup,
      getBoundingClientRect() {
        const width = parseFloat(popup.style.width);
        const lines = Math.ceil(10 / Math.max(1, Math.floor((width - 26) / 12)));
        const contentHeight = width + 42 + 18 * lines;
        return { width, height: Math.min(contentHeight, parseFloat(popup.style.maxHeight) || Infinity) };
      },
    };
    const viewport = { ...eventTarget(), offsetLeft: 0, offsetTop: 0, width, height };
    const window = { ...eventTarget(), visualViewport: viewport, innerWidth: width, innerHeight: height };
    const document = { ...eventTarget(), body: {} };
    const refs = [button, popup];
    let observed = [], disconnected = false;
    const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
    const mod = { exports: {} };
    vm.runInNewContext(code, {
      exports: mod.exports, React, Heart: 'Heart', X: 'X', window, document,
      useId: () => 'appreciation', useRef: () => ({ current: refs.shift() }),
      useLayoutEffect: effect => effects.push(effect), createPortal: tree => tree,
      ResizeObserver: class { observe(node) { observed.push(node); } disconnect() { disconnected = true; } },
    });
    const tree = mod.exports.AppreciationPopover({ open: true, onOpenChange: value => changes.push(value), side });
    const trigger = tree.children[0], panel = tree.children[1];
    assert.equal(trigger.props['aria-expanded'], true);
    assert.equal(trigger.props['aria-controls'], panel.props.id);
    assert.equal(panel.props.role, 'dialog');
    assert.equal(panel.props['aria-modal'], undefined);
    assert.equal(panel.children[1].props.src, '/ztab/wechat-appreciation.jpeg');
    trigger.props.onClick();
    assert.deepEqual(changes, [false]);
    const cleanup = effects[0]();
    assert.deepEqual(observed, [button, popup]);
    const left = parseFloat(popup.style.left), top = parseFloat(popup.style.top);
    const size = popup.getBoundingClientRect();
    assert.ok(left >= 8 && left + size.width <= width - 8);
    assert.ok(top >= 8 && top + size.height <= height - 8);
    if (width === 1200) assert.ok(side === 'left' ? left > button.getBoundingClientRect().right : left + size.width < button.getBoundingClientRect().left);
    document.listeners.get('pointerdown')({ target: button });
    document.listeners.get('pointerdown')({ target: popup });
    assert.equal(changes.length, 1);
    document.listeners.get('pointerdown')({ target: {} });
    assert.equal(changes.length, 2);
    assert.equal(button.focused, undefined);
    let prevented = false, stopped = false;
    document.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
    assert.equal(button.focused, true);
    assert.ok(prevented && stopped);
    viewport.width = 220;
    window.listeners.get('resize')();
    assert.ok(parseFloat(popup.style.left) + parseFloat(popup.style.width) <= 212);
    cleanup();
    assert.equal(disconnected, true);
    assert.ok(targets.every(target => target.listeners.size === 0));
  }
});

test('category frames and two-phase snapshots preserve cancellation wiring', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
  const helper = app.slice(app.indexOf('function categoryFrames'), app.indexOf('type Modal ='));
  const context = {}; vm.createContext(context);
  vm.runInContext(ts.transpileModule(helper, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  for (const effect of ['fade','slide','slide-horizontal','zoom','blur']) for (const direction of [-1,1]) {
    const out = context.categoryFrames(effect,direction,false), into = context.categoryFrames(effect,direction,true);
    assert.equal(out[0].opacity,1); assert.equal(out[1].opacity,0);
    assert.equal(into[0].opacity,0); assert.equal(into[1].opacity,1);
    if (effect === 'slide-horizontal') assert.equal(into[0].transform,`translateX(${direction * 10}px)`);
    if (effect === 'slide') assert.equal(out[1].transform,`translateY(${-direction * 10}px)`);
    if (effect === 'zoom') { assert.equal(out[1].transform,'scale(1.03)'); assert.equal(into[0].transform,'scale(0.97)'); }
    if (effect === 'blur') assert.equal(into[0].filter,'blur(4px)');
  }
  assert.match(app,/categoryTransitionDuration \/ 2/);
  assert.match(app,/pendingEntrance.current = \{ sequence, direction, effect, duration \}/);
  assert.match(app,/categoryFrames\(pending.effect, pending.direction, true\)/);
  assert.match(app,/duration: pending.duration/);
  assert.match(app,/sequence !== transitionSequence.current/);
  assert.match(app,/categoryTransitionDuration, categoryIds\]/);
  assert.match(app,/onStart: \(\) => \{ switchCategoryImmediately\(active\)/);
  assert.match(panel,/disabled=\{p.categoryTransition === 'none'\}/);
  assert.match(panel,/越小越快/);
});

test('settings ranges wire bounded visual progress without changing native values or save handlers', async () => {
  const panel = await readFile(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
  const drawer = await readFile(new URL('../src/components/SettingsDrawer.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const helper = panel.slice(panel.indexOf('export function rangeStyle'), panel.indexOf('export const settingGroups'));
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: mod.exports });
  for (const [value, min, max, expected] of [[42,42,80,'0%'], [61,42,80,'50%'], [80,42,80,'100%'], [12,4,20,'50%'], [30,0,60,'50%'], [-1,0,60,'0%'], [100,0,60,'100%'], [5,5,5,'0%']]) {
    assert.equal(mod.exports.rangeStyle(value, min, max)['--range-progress'], expected);
  }
  assert.match(panel, /style=\{rangeStyle\(p\[key\] as number, min, max\)\}/);
  assert.match(panel, /onChange=\{e=>void update\(\{\[key\]:Number\(e.target.value\)\}\)\}/);
  for (const [key, min, max] of [['dim',0,60], ['columns',4,20], ['size',42,80]]) {
    assert.ok(drawer.includes(`style={rangeStyle(state.settings.${key}, ${min}, ${max})}`));
    assert.ok(drawer.includes(`updateSettings({ ${key}: Number(e.target.value) })`));
  }
  const rangeFields = [...(panel + drawer).matchAll(/<label className="range-field"[\s\S]*?<\/label>/g)];
  assert.equal(rangeFields.length, 5);
  for (const [field] of rangeFields) assert.doesNotMatch(field, /onKeyDown|preventDefault|step=/);
  for (const pseudo of ['::-webkit-slider-runnable-track', '::-webkit-slider-thumb', '::-moz-range-track', '::-moz-range-progress', '::-moz-range-thumb', ':disabled', ':focus-visible', ':not(:disabled):active']) {
    assert.ok(css.includes(`.settings-shell .range-field input[type=range]${pseudo}`));
  }
  assert.match(css, /linear-gradient\(to right, var\(--accent\) 0 var\(--range-progress/);
  assert.match(css, /:root \.settings-shell \.range-field input\[type=range\]:focus-visible \{\s*outline: none;\s*box-shadow: none;/);
});

test('tile names stay outside size-contained bodies and respect name preferences', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const widgets = await readFile(new URL('../src/components/Widgets.tsx', import.meta.url), 'utf8');
  const widgetCss = await readFile(new URL('../src/components/widgets.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /data-names=\{state.settings.showNames\}/);
  assert.match(app, /'--name-color': state.settings.nameColor/);
  assert.match(css, /\.site\[data-sort-id\] > \.site-label \{[^}]*position: absolute; top: 100%/);
  assert.match(css, /\.ztab-widget-card\[data-sort-id\]:not\(\.ztab-widget-plugin\) \{ overflow: visible/);
  assert.match(css, /\.ztab-widget-summary \{[^}]*overflow: hidden/);
  assert.match(css, /\.ztab-widget-card > \.ztab-widget-summary-label \{ display: block; font-size: var\(--name-size\); color: var\(--name-color\)/);
  for (const selector of ['.site-label', '.ztab-widget-summary-label']) {
    assert.ok(css.includes(`.app[data-names=false] ${selector} { visibility: hidden; }`));
  }
  assert.match(widgets, /\{summary\}\s*<span className="ztab-widget-summary-label">\{label\}<\/span>/);
  assert.doesNotMatch(widgets, /summary-label">\{LABELS\[key\]\}/);
  assert.match(widgetCss, /:not\(\.ztab-widget-summary\):not\(\.ztab-widget-summary-label\)\{display:none\}/);
});

test('navigation category context menu reuses category editing and safe removal', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /showCategoryMenu\(c.id, event.currentTarget, event.clientX, event.clientY\)/);
  assert.match(app, /showCategoryMenu\(c.id, event.currentTarget, rect.left, rect.bottom\)/);
  assert.match(app, /categoryMenu \? categoryMenuRef.current/);
  assert.match(app, /setCategoryEditTarget\(categoryMenu.id\)/);
  assert.match(app, /input\?\.scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(app, /input\?\.select\(\)/);
  assert.match(app, /disabled=\{busy \|\| state.categories.length === 1\}/);
  assert.match(app, /requestCategoryDelete\(categoryMenu.id, trigger\)/);
  assert.match(css, /\.category-context-menu \{[^}]*backdrop-filter: blur\(20px\)/);
});

test('category deletion shares confirmation and only moves contents after a successful save', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /onClick=\{event => requestCategoryDelete\(c.id, event.currentTarget\)\}/);
  assert.doesNotMatch(app, /confirm\(\s*`删除「/);
  assert.match(app, /inert=\{!!deleting\}/);
  assert.match(app, /\[data-cancel\].*\?\.focus\(\)/);
  assert.match(app, /if \(document.querySelector\('\.delete-backdrop'\)\) return/);
  assert.match(app, /modal === 'category' \? '\.category-modal \.modal-close'/);
  const body = app.slice(app.indexOf('  async function executeDelete('), app.indexOf('  function removeLink('));
  const code = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const saves of [false, true]) {
    const current = { categories: [{ id: 'source' }, { id: 'target' }], folders: [{ id: 'f', category: 'source' }], links: [{ id: 'nested', category: 'source', folder: 'f' }, { id: 'loose', category: 'source' }, { id: 'other', category: 'target' }] };
    const original = JSON.stringify(current);
    let next, closed = false, error = '', switched;
    const context = { deleting: { key: 'category:source', category: 'source', target: 'target' }, deletePending: { current: false }, stateRef: { current }, folder: 'f', setDeleteError: value => { error = value; }, commit: async value => { next = value; return saves; }, setDeleting: () => { closed = true; }, setFolder() {}, switchCategoryImmediately: value => { switched = value; } };
    vm.createContext(context);
    vm.runInContext(code, context);
    await context.executeDelete();
    assert.equal(JSON.stringify(current), original);
    assert.equal(next.categories.length, 1);
    assert.equal(next.folders[0].category, 'target');
    assert.equal(next.links.length, 3);
    assert.ok(next.links.every(link => link.category === 'target'));
    assert.equal(next.links[0].folder, 'f');
    assert.equal(closed, saves);
    assert.equal(switched, saves ? 'target' : undefined);
    assert.equal(!!error, !saves);
    assert.equal(context.deletePending.current, false);
  }
});

test('all business selects share accessible portalled control and layer ownership', async () => {
  for (const path of ['../src/App.tsx', '../src/components/AddIconPanel.tsx', '../src/components/SettingsPanel.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /<select\b/);
    assert.match(source, /<Select\b/);
  }
  const source = await readFile(new URL('../src/components/Select.tsx', import.meta.url), 'utf8');
  assert.match(source, /type="button" role="combobox"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /option.value !== value/);
  assert.match(source, /createPortal/);
  assert.doesNotMatch(source, /data-theme=|matchMedia/);
  const styles = await readFile(new URL('../src/components/select.css', import.meta.url), 'utf8');
  assert.match(styles, /--select-bg:var\(--input-bg\)/);
  assert.doesNotMatch(styles, /prefers-color-scheme/);
  const layerSource = await readFile(new URL('../src/components/selectLayers.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(layerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  class Node { constructor(parent) { this.parent = parent; } contains(target) { return target === this || !!target?.parent && this.contains(target.parent); } }
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, Node });
  const owner = new Node(); const trigger = new Node(owner); const popup = new Node(); const option = new Node(popup);
  let closed = 0;
  const unregister = mod.exports.registerSelectLayer(trigger, popup, () => closed++);
  assert.equal(mod.exports.ownsFloatingTarget(owner, option), true);
  assert.equal(mod.exports.ownsFloatingTarget(new Node(), option), false);
  const event = { key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} };
  assert.equal(mod.exports.dismissSelectOnEscape(event, owner), true);
  assert.equal(closed, 1);
  unregister();
  assert.equal(mod.exports.dismissSelectOnEscape(event, owner), false);
});

const widgetSource = await readFile(new URL('../src/components/Widgets.tsx', import.meta.url), 'utf8');
const widgetCode = ts.transpileModule(widgetSource.replace(/^import .*$/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const widgetModule = { exports: {} };
vm.runInNewContext(widgetCode, { exports: widgetModule.exports, Date, Set });
const { validateWidgetBackup, parseWidgetState, nextPayday, weatherLabel } = widgetModule.exports;
const widgetState = () => ({ version: 1, visible: { calendar: true, memo: false, anniversary: true, work: true }, memo: 'private note', anniversaries: [{ id: 'leap', title: 'Leap day', date: '2024-02-29' }], work: { time: '18:30', days: [1, 2, 3, 4, 5] } });

test('plugin packages validate limits, preserve backups and enforce iframe isolation', () => {
  const make = () => ({ format: 'ztab-widget', schemaVersion: 1, id: 'example.clock', name: '时钟', version: '1.0', html: '<h2>时钟</h2><script>document.body.dataset.ready="yes"</script>' });
  const plugin = widgetModule.exports.parseWidgetPlugin(make());
  assert.equal(plugin.visible, true);
  const state = { ...widgetState(), plugins: [plugin] };
  assert.equal(validateWidgetBackup(state), true);
  assert.equal(parseWidgetState(state).plugins[0].html, plugin.html);
  assert.equal(parseWidgetState(widgetState()).plugins.length, 0);
  for (const patch of [{ format: 'other' }, { schemaVersion: 2 }, { id: '../bad' }, { html: 'x'.repeat(100001) }, { name: '' }]) {
    assert.throws(() => widgetModule.exports.parseWidgetPlugin({ ...make(), ...patch }));
  }
  assert.equal(validateWidgetBackup({ ...state, plugins: [plugin, plugin] }), false);
  assert.equal(validateWidgetBackup({ ...state, plugins: [{ ...plugin, visible: 'yes' }] }), false);
  assert.match(widgetSource, /sandbox="allow-scripts"/);
  assert.doesNotMatch(widgetSource, /sandbox="[^"]*allow-same-origin/);
  assert.match(widgetSource, /connect-src 'none'/);
  assert.match(widgetSource, /form-action 'none'/);
  assert.match(widgetSource, /export async function importPlugin/);
  assert.match(widgetSource, /file.size > 150000/);
  assert.doesNotMatch(widgetSource, /禁止联网、访问桌面存储、弹窗和跳转/);
});

test('payday countdown uses natural days, short months and year rollover', () => {
  for (const [now, payday, date, days] of [
    ['2026-12-25T23:59:59', 10, '2027-01-10', 16],
    ['2024-02-01T08:00:00', 31, '2024-02-29', 28],
    ['2025-02-01T08:00:00', 31, '2025-02-28', 27],
    ['2026-04-30T23:59:59', 31, '2026-04-30', 0],
    ['2026-04-16T12:00:00', 15, '2026-05-15', 29],
    ['2024-01-31T23:59:59', 30, '2024-02-29', 29],
    ['2026-03-07T23:59:59', 10, '2026-03-10', 3],
  ]) {
    const input = new Date(now);
    const before = input.getTime();
    const result = nextPayday(input, payday);
    assert.equal(result.date, date);
    assert.equal(result.days, days);
    assert.equal(input.getTime(), before);
  }
  for (const payday of [0, 32, 1.5, NaN]) assert.throws(() => nextPayday(new Date(), payday));
  assert.throws(() => nextPayday(new Date('invalid'), 10));
  assert.match(widgetSource, /发薪还有 \$\{pay.days\} 天/);
});

test('widget import validates leap dates, limits, visibility and working times', () => {
  assert.equal(validateWidgetBackup(widgetState()), true);
  const hidden = widgetState();
  for (const key of Object.keys(hidden.visible)) hidden.visible[key] = false;
  assert.equal(validateWidgetBackup(hidden), true);
  for (const mutate of [
    s => { s.anniversaries[0].date = '2023-02-29'; },
    s => { s.anniversaries[0].date = '2024-04-31'; },
    s => { s.anniversaries.push({ ...s.anniversaries[0] }); },
    s => { s.anniversaries[0].title = ' '; },
    s => { s.work.days = []; },
    s => { s.work.days = [7]; },
    s => { s.work.time = '24:00'; },
    s => { s.memo = 'x'.repeat(20001); },
    s => { delete s.visible.memo; },
  ]) {
    const value = widgetState();
    mutate(value);
    const before = JSON.stringify(value);
    assert.equal(validateWidgetBackup(value), false);
    assert.equal(JSON.stringify(value), before);
  }
  for (const value of [null, [], {}, 'not-json']) assert.equal(validateWidgetBackup(value), false);
});

test('anniversary creation sentinel cannot collide with accepted backup identifiers', () => {
  const state = widgetState();
  state.anniversaries[0].id = 'new';
  assert.equal(validateWidgetBackup(state), true);
  state.anniversaries[0].id = '';
  assert.equal(validateWidgetBackup(state), false);
  assert.match(widgetSource, /setEditing\(item\?\.id \?\? ''\)/);
  assert.doesNotMatch(widgetSource, /editing === 'new'/);
});

test('legacy widget data retains free text and gains non-destructive local defaults', () => {
  const legacy = widgetState();
  const before = JSON.stringify(legacy);
  const parsed = parseWidgetState(legacy);
  assert.equal(parsed.memo, legacy.memo);
  assert.equal(parsed.notes.length, 0);
  assert.equal(parsed.compact, true);
  assert.equal(JSON.stringify(parsed.order), JSON.stringify(['calendar', 'memo', 'anniversary', 'work', 'weather', 'movie']));
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(validateWidgetBackup(parsed), true);
});

test('extended widget backup validates notes, ordering and optional salary settings', () => {
  const extended = () => ({ ...widgetState(), compact: false, order: ['work', 'memo', 'calendar', 'anniversary'], notes: [{ id: 'note-1', text: 'local task', done: true }], work: { time: '00:00', days: [0], salary: 0, payday: 31 } });
  const parsed = parseWidgetState(extended());
  assert.equal(parsed.notes[0].done, true);
  assert.equal(parsed.order[0], 'work');
  assert.equal(parsed.work.payday, 31);
  assert.equal(validateWidgetBackup(parsed), true);
  for (const mutate of [
    s => { s.order = ['work', 'work', 'calendar', 'memo']; },
    s => { s.order = ['work']; },
    s => { s.compact = 'yes'; },
    s => { s.notes.push({ ...s.notes[0] }); },
    s => { s.notes[0].text = ' '; },
    s => { s.notes[0].done = 1; },
    s => { s.notes[0].text = 'x'.repeat(2001); },
    s => { s.work.salary = -1; },
    s => { s.work.salary = Infinity; },
    s => { s.work.payday = 0; },
    s => { s.work.payday = 32; },
    s => { s.work.payday = 1.5; },
  ]) {
    const state = extended(); mutate(state);
    assert.equal(validateWidgetBackup(state), false);
  }
});

test('optional weather and personal movie migrate old v1 without remote data', () => {
  assert.equal(weatherLabel(0), '晴');
  assert.equal(weatherLabel(63), '雨');
  assert.equal(weatherLabel(99), '雷暴');
  assert.equal(weatherLabel(999), 'WMO 天气代码 999');
  const old = widgetState();
  old.order = ['work', 'calendar', 'memo', 'anniversary'];
  const migrated = parseWidgetState(old);
  assert.equal(migrated.visible.weather, false);
  assert.equal(migrated.visible.movie, false);
  assert.equal(migrated.order.join(','), 'work,calendar,memo,anniversary,weather,movie');
  const fresh = () => ({ ...migrated, visible: { ...migrated.visible, weather: true, movie: true }, weather: { city: '北京' }, movie: { title: '我的电影', quote: '自己的台词' } });
  assert.equal(validateWidgetBackup(fresh()), true);
  for (const mutate of [
    s => { s.visible.weather = 'true'; },
    s => { s.visible.movie = null; },
    s => { s.weather.city = 42; },
    s => { s.weather.city = 'x'.repeat(101); },
    s => { s.movie.title = 'x'.repeat(101); },
    s => { s.movie.quote = 'x'.repeat(2001); },
    s => { s.order = ['calendar', 'memo', 'anniversary', 'work', 'weather']; },
    s => { s.order = ['calendar', 'memo', 'anniversary', 'work', 'weather', 'weather']; },
    s => { s.order = ['calendar', 'memo', 'anniversary', 'work', 'weather', 'unknown']; },
  ]) {
    const state = fresh(); mutate(state);
    assert.equal(validateWidgetBackup(state), false);
  }
  const raw = fresh(); raw.weather.temperature = 99;
  assert.equal(JSON.stringify(parseWidgetState(raw).weather), JSON.stringify({ city: '北京' }));
  assert.match(widgetSource, /new AbortController\(\)/);
  assert.match(widgetSource, /encodeURIComponent\(query\)/);
  assert.match(widgetSource, /天气查询超时/);
  assert.match(widgetSource, /clearTimeout\(timeout\)/);
  assert.doesNotMatch(widgetSource, /navigator\.geolocation/);
});

test('compact widget tiles use native summary buttons and preserve full detail editors', async () => {
  const css = await readFile(new URL('../src/components/widgets.css', import.meta.url), 'utf8');
  assert.match(widgetSource, /className=\{`ztab-widget-summary ztab-widget-summary-\$\{key\}`\}/);
  assert.match(widgetSource, /aria-label=\{`打开\$\{LABELS\[key\]\}详情`\} aria-expanded=\{expanded === key\}/);
  assert.match(widgetSource, /aria-controls=\{`ztab-widget-detail-\$\{key\}`\}/);
  assert.match(widgetSource, /<AnimatedOverlay open=\{expanded\}/);
  for (const key of ['calendar', 'memo', 'anniversary', 'work', 'weather', 'movie']) {
    assert.ok(widgetSource.includes(`{summary('${key}')}`));
    assert.ok(widgetSource.includes(`setExpanded(expanded === '${key}' ? null : '${key}')`));
  }
  assert.match(widgetSource, /className="ztab-widget-summary-label"/);
  assert.match(css, /:not\(\.ztab-widget-plugin\):not\(\[data-expanded=true\]\)>:not\(\.ztab-widget-summary\):not\(\.ztab-widget-summary-label\)\{display:none\}/);
  assert.match(css, /overflow:visible/);
  assert.match(css, /width:150px;height:150px/);
  assert.match(css, /width:330px;grid-column:span 2/);
  assert.match(widgetSource, /id="ztab-widget-memo"/);
  assert.match(widgetSource, /id="ztab-new-note"/);
});

const workerBuilder = await readFile(new URL('../scripts/service-worker.mjs', import.meta.url), 'utf8');
let workerCode;
await vm.runInNewContext(`(async () => {${workerBuilder.replace(/^import .*$/gm, '')}\n})()`, {
  createHash,
  readdir: async path => path === 'dist' ? [
    { name: 'index.html', isDirectory: () => false },
    { name: 'assets', isDirectory: () => true },
    { name: 'sw.js', isDirectory: () => false },
  ] : [{ name: 'app.js', isDirectory: () => false }],
  readFile: async path => Buffer.from(path),
  writeFile: async (_path, content) => { workerCode = content; },
  console: { log() {} },
});

function workerHarness() {
  const handlers = {};
  const hits = [];
  const responses = [];
  const cache = { match: async key => { hits.push(key); return `cached:${key}`; } };
  vm.runInNewContext(workerCode, {
    URL,
    self: { registration: { scope: 'https://local.test/ztab/' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache },
    fetch: async () => { throw new Error('offline'); },
  });
  return { handlers, hits, responses, request(url, mode = 'cors', method = 'GET') {
    handlers.fetch({ request: { url, mode, method }, respondWith: value => responses.push(value) });
  } };
}
test('offline worker handles only same-origin scoped app allowlist', async () => {
  const h = workerHarness();
  h.request('https://external.test/ztab/assets/app.js');
  h.request('https://local.test/other/assets/app.js');
  h.request('https://local.test/ztab/api/private');
  h.request('https://local.test/ztab/assets/app.js', 'cors', 'POST');
  assert.equal(h.responses.length, 0);
  h.request('https://local.test/ztab/assets/app.js');
  assert.equal(await h.responses[0], 'cached:./assets/app.js');
  h.request('https://local.test/ztab/', 'navigate');
  assert.equal(await h.responses[1], 'cached:./index.html');
  assert.deepEqual(h.hits, ['./assets/app.js', './index.html']);
});

test('rendered direct links and drag lifecycle retain privacy and compatibility guards', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /href=\{l\.url\}/);
  assert.match(app, /rel="noopener noreferrer"/);
  assert.match(app, /controller.onPointerDown\(event, desktop \? `link:\$\{l.id\}` : l.id\)/);
  assert.match(app, /onDragStart=\{event => event.preventDefault\(\)\}/);
  assert.doesNotMatch(app, /dataTransfer|draggable=\{!busy\}/);
  assert.doesNotMatch(app, /sendBeacon|XMLHttpRequest|fetch\(/);
});
