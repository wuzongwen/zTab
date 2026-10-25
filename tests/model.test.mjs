import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/model.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { defaults, validateState, safeUrl, parseBackup, imageValid, reconcileLayouts, mergeVisibleOrder, groupLinksIntoFolder, defaultWidgetSeed } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
test('theme preferences and accent survive validation and backup without resolving system', () => {
  for (const theme of ['light', 'dark', 'system']) {
    const state = defaults();
    state.settings.theme = theme; state.settings.accent = '#e4bd32';
    const restored = parseBackup(JSON.stringify({format:'ztab',version:1,data:state,widgets:null})).data;
    assert.equal(restored.settings.theme, theme);
    assert.equal(restored.settings.accent, '#e4bd32');
  }
});
test('single theme source resolves explicit preference and cleans up system listener', async () => {
  const source = await readFile(new URL('../src/theme.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source.replace(/import .* from .*;\n/g, ''), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const { resolveTheme } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  for (const dark of [true,false]) {
    assert.equal(resolveTheme('light',dark),'light'); assert.equal(resolveTheme('dark',dark),'dark');
    assert.equal(resolveTheme('system',dark),dark ? 'dark' : 'light');
  }
  assert.match(source, /removeEventListener\('change', onChange\)/);
  assert.match(source, /root\.dataset\.theme = resolved/);
  assert.doesNotMatch(source, /localStorage|saveState/);
});
test('category symbols preserve legacy and bounded lucide IDs through backups', () => {
  for (const symbol of ['⌂', '😀', 'abcde', 'lucide:house', 'lucide:unknown-future-icon', `lucide:${'a'.repeat(64)}`]) {
    const state = defaults(); state.categories[0].symbol = symbol;
    assert.equal(validateState(state).categories[0].symbol, symbol);
    assert.equal(parseBackup(JSON.stringify({format:'ztab',version:1,data:state,widgets:null})).data.categories[0].symbol, symbol);
  }
  for (const symbol of ['', 'abcdef', 'lucide:', 'lucide:House', 'lucide:-house', 'lucide:house-', 'lucide:house--key', 'lucide:house/key', 'lucide:house key', `lucide:${'a'.repeat(65)}`, null]) {
    const state = defaults(); state.categories[0].symbol = symbol;
    assert.throws(() => validateState(state));
  }
});
test('tile sizes validate strictly, survive backups and reconcile stale references', () => {
  const s = reconcileLayouts(defaults());
  s.layouts.daily.sizes = { 'link:site-0': '4x2', 'widget:memo': '1x1' };
  assert.deepEqual(reconcileLayouts(s).layouts.daily.sizes, s.layouts.daily.sizes);
  assert.deepEqual(parseBackup(JSON.stringify({format:'ztab',version:1,data:s,widgets:null})).data.layouts.daily.sizes, s.layouts.daily.sizes);
  for (const sizes of [{ 'link:site-0': '2x4' }, { 'link:missing': '1x1' }, [], null]) assert.throws(() => validateState({...s, layouts:{...s.layouts,daily:{...s.layouts.daily,sizes}}}));
  const moved = reconcileLayouts({...s, links:s.links.map(l => l.id === 'site-0' ? {...l,folder:'tools'} : l)});
  assert.deepEqual(moved.layouts.daily.sizes, {'widget:memo':'1x1'});
  const hidden = reconcileLayouts({...s,layouts:{...s.layouts,daily:{...s.layouts.daily,hidden:['widget:memo']}}});
  assert.deepEqual(hidden.layouts.daily.sizes, s.layouts.daily.sizes);
});
test('grouping desktop links is atomic and replaces the target slot without disturbing other layouts', () => {
  for (const [source, target] of [['site-0', 'site-2'], ['site-2', 'site-0']]) {
    const state = reconcileLayouts(defaults());
    state.layouts.daily.hidden = ['widget:memo'];
    state.layouts.daily.sizes = { 'link:site-0': '2x1', 'link:site-2': '2x2', 'widget:memo': '1x1', 'link:site-3': '4x2' };
    const original = JSON.stringify(state);
    const visible = state.layouts.daily.order.filter(key => !state.layouts.daily.hidden.includes(key));
    const reordered = [...visible];
    const item = reordered.splice(reordered.indexOf('link:site-4'), 1)[0];
    reordered.splice(reordered.indexOf(`link:${target}`), 0, item);
    const expected = mergeVisibleOrder(state.layouts.daily.order, reordered).filter(key => key !== `link:${source}`).map(key => key === `link:${target}` ? 'folder:grouped' : key);
    const result = groupLinksIntoFolder(state, source, target, 'grouped', reordered);
    assert.equal(JSON.stringify(state), original);
    assert.deepEqual(result.layouts.daily.order, expected);
    assert.deepEqual(result.layouts.daily.hidden, ['widget:memo']);
    assert.deepEqual(result.layouts.daily.sizes, { 'widget:memo': '1x1', 'link:site-3': '4x2' });
    assert.equal(result.layouts.work, state.layouts.work);
    assert.equal(result.links.find(link => link.id === source).folder, 'grouped');
    assert.equal(result.links.find(link => link.id === target).folder, 'grouped');
    assert.equal(result.links.find(link => link.id === 'site-3'), state.links.find(link => link.id === 'site-3'));
    assert.deepEqual(result.folders.at(-1), { id: 'grouped', name: '新建文件夹', category: 'daily' });
    const restored = parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: result, widgets: null })).data;
    assert.deepEqual(restored.layouts, result.layouts);
    assert.deepEqual(restored.links.filter(link => link.folder === 'grouped').map(link => link.id).sort(), [source, target].sort());
  }
});

test('grouping rejects invalid or stale desktop links and folder limits without changing data', () => {
  for (const mode of ['same', 'missing', 'nested', 'category', 'duplicate-folder', 'stale', 'duplicate-order', 'limit']) {
    const state = reconcileLayouts(defaults());
    let source = 'site-0', target = 'site-1', folder = 'grouped';
    if (mode === 'same') target = source;
    if (mode === 'missing') source = 'missing';
    if (mode === 'nested') state.links[0].folder = 'tools';
    if (mode === 'category') state.links[1].category = 'work';
    if (mode === 'duplicate-folder') folder = 'tools';
    if (mode === 'limit') state.folders = Array.from({ length: 100 }, (_, i) => ({ id: `folder-${i}`, name: '文件夹', category: 'daily' }));
    const order = state.layouts.daily.order.filter(key => mode !== 'stale' || key !== 'link:site-0');
    if (mode === 'duplicate-order') order.push(order[0]);
    const original = JSON.stringify(state);
    assert.throws(() => groupLinksIntoFolder(state, source, target, folder, order));
    assert.equal(JSON.stringify(state), original);
  }
});

test('legacy settings migrate independently and invalid new values are rejected', () => {
  const s = defaults();
  s.settings = {engine:'bing',columns:8,size:58,wallpaper:'aurora',dim:12,greeting:'test',newTab:false,showWidgets:true};
  const migrated = validateState(s);
  assert.equal(migrated.settings.searchNewTab, false);
  assert.equal(migrated.settings.siteNewTab, false);
  assert.equal(migrated.settings.sidebarPosition, 'left');
  for (const patch of [{theme:'unknown'}, {iconOpacity:101}, {accent:'red'}, {showTime:null}, {searchHeight:NaN}]) {
    assert.throws(() => validateState({...migrated,settings:{...migrated.settings,...patch}}));
  }
  const backup = {format:'ztab',version:1,data:migrated,widgets:null};
  assert.deepEqual(parseBackup(JSON.stringify(backup)).data.settings,migrated.settings);
});
test('per-link opening preferences are optional booleans and survive backups without changing legacy settings', () => {
  for (const global of [true, false]) for (const newTab of [undefined, true, false]) {
    const state = defaults();
    state.settings.siteNewTab = global;
    if (newTab !== undefined) state.links[0].newTab = newTab;
    const original = JSON.stringify(state);
    const validated = validateState(state);
    const restored = parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: state, widgets: null })).data;
    for (const result of [validated, restored]) {
      assert.equal(result.links[0].newTab, newTab);
      assert.equal(result.settings.siteNewTab, global);
      assert.equal(result.links[1].newTab, undefined);
    }
    assert.equal(JSON.stringify(state), original);
  }
  for (const newTab of [null, 'true', 'false', 0, 1, [], {}]) {
    const state = defaults();
    state.links[0].newTab = newTab;
    assert.throws(() => validateState(state));
    assert.throws(() => parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: state, widgets: null })));
  }
});

test('category transitions validate, migrate and survive backup roundtrip', () => {
  assert.equal(defaults().settings.categoryTransition, 'fade');
  const legacy = defaults();
  delete legacy.settings.categoryTransition;
  assert.equal(validateState(legacy).settings.categoryTransition, 'fade');
  assert.equal(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: legacy, widgets: null })).data.settings.categoryTransition, 'fade');
  assert.equal(Object.hasOwn(legacy.settings, 'categoryTransition'), false);
  for (const categoryTransition of ['none', 'fade', 'slide', 'slide-horizontal', 'zoom', 'blur']) {
    const s = defaults();
    s.settings.categoryTransition = categoryTransition;
    assert.equal(validateState(s).settings.categoryTransition, categoryTransition);
    assert.equal(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: null })).data.settings.categoryTransition, categoryTransition);
  }
  for (const categoryTransition of ['unknown', '', null, false, 1, [], {}]) {
    const s = defaults();
    s.settings.categoryTransition = categoryTransition;
    assert.throws(() => validateState(s));
    assert.throws(() => parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: null })));
  }
});
test('transition duration migrates, validates boundaries and survives backup', () => {
  const legacy = defaults(); delete legacy.settings.categoryTransitionDuration;
  assert.equal(validateState(legacy).settings.categoryTransitionDuration, 200);
  assert.equal(Object.hasOwn(legacy.settings, 'categoryTransitionDuration'), false);
  for (const value of [100, 200, 1000]) {
    const s = defaults(); s.settings.categoryTransitionDuration = value;
    assert.equal(validateState(s).settings.categoryTransitionDuration, value);
    assert.equal(parseBackup(JSON.stringify({format:'ztab',version:1,data:s,widgets:null})).data.settings.categoryTransitionDuration, value);
  }
  for (const value of [99,1001,NaN,Infinity,-Infinity,'200',null,false,[],{}]) {
    const s = defaults(); s.settings.categoryTransitionDuration = value;
    assert.throws(() => validateState(s));
    assert.throws(() => parseBackup(JSON.stringify({format:'ztab',version:1,data:s,widgets:null})));
  }
});
test('icon columns accept 4 through 20 and survive backup roundtrip', () => {
  for (const columns of [4, 10, 11, 20]) {
    const s = defaults();
    s.settings.columns = columns;
    assert.equal(validateState(s).settings.columns, columns);
    assert.equal(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: null })).data.settings.columns, columns);
  }
  for (const columns of [3, 21, 10.5, NaN]) {
    const s = defaults();
    s.settings.columns = columns;
    assert.throws(() => validateState(s));
  }
});
test("default state passes validation and deep clone", () => {
  const s = defaults();
  assert.deepEqual(validateState(s), s);
  assert.notEqual(validateState(s), s);
});
test("direct URLs permit only HTTP(S) without embedded credentials", () => {
  assert.equal(
    safeUrl("https://example.com/path?q=hello"),
    "https://example.com/path?q=hello",
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///secret",
    "ftp://example.com",
    "https://user:pass@example.com",
  ])
    assert.throws(() => safeUrl(url));
});
test("backup roundtrip retains links folders wallpaper and widget state", () => {
  const s = defaults();
  s.settings.wallpaper = "data:image/png;base64,aGVsbG8=";
  s.links[0].icon = "data:image/webp;base64,aGVsbG8=";
  const b = {
    format: "ztab",
    version: 1,
    data: s,
    widgets: { note: "private" },
    exportedAt: "2026-10-22",
  };
  assert.deepEqual(parseBackup(JSON.stringify(b)), b);
});
test("reject broken reference and duplicate identifiers", () => {
  const a = defaults();
  a.links[0].folder = "missing";
  assert.throws(() => validateState(a));
  const b = defaults();
  b.categories[1].id = b.categories[0].id;
  assert.throws(() => validateState(b));
});
test("reject invalid search templates, protocol and grid configuration", () => {
  for (const edit of [
    (s) => (s.engines[0].template = "https://example.com"),
    (s) => (s.engines[0].template = "javascript:{query}"),
    (s) => (s.settings.columns = 40),
    (s) => (s.links[0].url = "javascript:alert(1)"),
    (s) => (s.settings.wallpaper = "https://tracking.example/image"),
  ]) {
    const s = defaults();
    edit(s);
    assert.throws(() => validateState(s));
  }
});
test("reject incompatible and malformed backups without changing source", () => {
  const s = defaults(),
    copy = structuredClone(s);
  for (const b of [
    { format: "other", version: 1, data: s },
    { format: "ztab", version: 2, data: s },
    { format: "ztab", version: 1, data: s, widgets: [] },
    { format: "ztab", version: 1, data: null, widgets: null },
  ])
    assert.throws(() => parseBackup(JSON.stringify(b)));
  assert.deepEqual(s, copy);
});
test("aggregate uploaded images remain within recoverable backup size", () => {
  const s = defaults();
  const image = "data:image/png;base64," + "A".repeat(6_000_000);
  s.links.slice(0, 4).forEach((link) => {
    link.icon = image;
  });
  assert.doesNotThrow(() => validateState(s));
  const backup = JSON.stringify({
    format: "ztab",
    version: 1,
    data: s,
    widgets: null,
  });
  assert.doesNotThrow(() => parseBackup(backup));
  s.links[4].icon = image;
  assert.throws(() => validateState(s), /30 MB/);
});

test('category migration preserves legacy visibility, mixed order and hidden positions', () => {
  const seed = defaultWidgetSeed(); seed.order.reverse(); seed.plugins = [{ id: 'example.clock', visible: false }];
  const s = reconcileLayouts(defaults(), seed);
  assert.equal(s.layouts.daily.order[0], 'widget:movie');
  assert.ok(s.layouts.work.hidden.includes('plugin:example.clock'));
  const original = [...s.layouts.work.order];
  s.layouts.daily.order = mergeVisibleOrder(s.layouts.daily.order, ['link:site-0', 'widget:memo']);
  assert.deepEqual(s.layouts.work.order, original);
  assert.equal(s.layouts.daily.order.indexOf('widget:movie'), 0);
  assert.deepEqual(validateState(s), s);
  assert.deepEqual(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: { plugins: seed.plugins } })).data.layouts, s.layouts);
});
test('layouts reject duplicate, wrong-category, nested and hidden site references', () => {
  for (const edit of [s => s.layouts.daily.order.push('widget:memo'), s => s.layouts.work.order.push('link:site-0'), s => s.layouts.daily.hidden.push('link:site-0'), s => { s.links[0].folder = 'tools' }]) {
    const s = reconcileLayouts(defaults()); edit(s); assert.throws(() => validateState(s));
  }
});
test('entity reconciliation moves folders and children atomically and retains shared widget placement', () => {
  let s = reconcileLayouts(defaults()); s.links[0].folder = 'tools'; s = reconcileLayouts(s);
  s.folders[0].category = 'work'; s.links[0].category = 'work'; s = reconcileLayouts(s);
  assert.ok(!s.layouts.daily.order.includes('folder:tools')); assert.ok(s.layouts.work.order.includes('folder:tools')); assert.ok(!s.layouts.work.order.includes('link:site-0'));
  s.folders = []; s.links[0].folder = undefined; s = reconcileLayouts(s);
  assert.ok(s.layouts.work.order.includes('link:site-0')); assert.doesNotThrow(() => validateState(s));
});
test("image data cannot be remote or SVG active content", () => {
  assert.equal(imageValid("https://example.com/image.png"), false);
  assert.equal(imageValid("data:image/svg+xml;base64,aGVsbG8="), false);
  assert.equal(imageValid("data:image/png;base64,aGVsbG8="), true);
});
