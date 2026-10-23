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
const { defaults, validateState, safeUrl, parseBackup, imageValid, reconcileLayouts, mergeVisibleOrder, defaultWidgetSeed } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
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
test('category transitions validate, migrate and survive backup roundtrip', () => {
  assert.equal(defaults().settings.categoryTransition, 'fade');
  const legacy = defaults();
  delete legacy.settings.categoryTransition;
  assert.equal(validateState(legacy).settings.categoryTransition, 'fade');
  assert.equal(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: legacy, widgets: null })).data.settings.categoryTransition, 'fade');
  assert.equal(Object.hasOwn(legacy.settings, 'categoryTransition'), false);
  for (const categoryTransition of ['none', 'fade', 'slide']) {
    const s = defaults();
    s.settings.categoryTransition = categoryTransition;
    assert.equal(validateState(s).settings.categoryTransition, categoryTransition);
    assert.equal(parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: null })).data.settings.categoryTransition, categoryTransition);
  }
  for (const categoryTransition of ['zoom', '', null, false, 1, [], {}]) {
    const s = defaults();
    s.settings.categoryTransition = categoryTransition;
    assert.throws(() => validateState(s));
    assert.throws(() => parseBackup(JSON.stringify({ format: 'ztab', version: 1, data: s, widgets: null })));
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
