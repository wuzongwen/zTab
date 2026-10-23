import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

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
  assert.match(source, /data-theme=\{theme\}/);
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
  assert.match(css, /:not\(\.ztab-widget-plugin\):not\(\[data-expanded=true\]\)>:not\(\.ztab-widget-summary\)\{display:none\}/);
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
