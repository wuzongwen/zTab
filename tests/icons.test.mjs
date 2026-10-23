import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/model.ts', import.meta.url), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64')}`);
const brandSource = await readFile(new URL('../src/components/SiteIcon.tsx', import.meta.url), 'utf8');
const brandModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(brandSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports: brandModule.exports,
  require: () => ({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }),
});
const { brandFor, SiteIcon } = brandModule.exports;
test('local brand graphics match only built-in root URLs and exact default markers', () => {
  for (const [url, marker, brand] of [['https://github.com', 'GH', 'github'], ['https://www.youtube.com', '▶', 'youtube'], ['https://www.figma.com', 'F', 'figma'], ['https://www.notion.so', 'N', 'notion'], ['https://www.bilibili.com', '哔', 'bilibili']]) {
    assert.equal(brandFor(url, marker), brand);
    assert.equal(brandFor(url + '/', marker), brand);
    assert.equal(brandFor(url + '/private', marker), undefined);
    assert.equal(brandFor(url + '?track=1', marker), undefined);
    assert.equal(brandFor(url, 'custom'), undefined);
    assert.equal(SiteIcon({ item: { url, icon: marker, title: 'Custom title' } }).type, 'svg');
  }
  assert.equal(SiteIcon({ item: { url: 'https://github.com', icon: 'mine', title: 'GitHub' } }).props.children, 'mine');
  assert.equal(SiteIcon({ item: { url: 'https://github.com', icon: 'data:image/png;base64,AAAA', title: 'GitHub' } }).type, 'img');
  assert.equal((app.match(/<SiteIcon item=/g) ?? []).length, 4);
  assert.doesNotMatch(brandSource, /fetch\(|https:\/\/.*\.(svg|png)/);
});
test('desktop widgets stay mounted behind an independent folder overlay', async () => {
  const gridStart = app.indexOf('className="link-grid"');
  const widget = app.indexOf('<WidgetPanel layout=');
  const folders = app.indexOf('folders.forEach(f => tiles.set', gridStart);
  assert.ok(gridStart < widget && widget < folders);
  assert.match(app, /enabled=\{state\.settings\.showWidgets\}/);
  assert.doesNotMatch(app.slice(gridStart, widget), /!folder/);
  assert.match(app, /<AnimatedOverlay open=\{!!opened\}/);
  assert.match(app, /className="folder-link-grid"/);
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /grid-auto-flow: row;/);
  assert.match(css, /grid-auto-rows: minmax\(calc\(var\(--icon-size\) \+ 30px\), auto\)/);
  assert.doesNotMatch(css, /--icon-size: \d+px !important/);
  assert.match(css, /--responsive-columns: 4/);
  assert.match(css, /\.ztab-widget-plugin\s*\{[^}]*grid-row: span 4;[^}]*overflow: hidden/s);
  assert.match(css, /\.ztab-widget-plugin > iframe\s*\{[^}]*flex: 1 1 0;[^}]*min-height: 0/s);
  assert.match(css, /\.link-grid \.ztab-widget-grid \.ztab-widget-work\s*\{\s*grid-column: span 4/);
  assert.doesNotMatch(css, /order: 20/);
  assert.match(app, /desktopDrag\.items\.map\(item =>/);
});
const move = app.slice(app.indexOf('  async function moveLink('), app.indexOf('  const [deleteError'));
function harness(success = true) {
  const initial = model.defaults();
  let saved;
  const context = { stateRef: { current: initial }, commit: async next => { model.validateState(next); saved = next; return success; }, tell() {}, setSiteMenu() {}, menuTrigger: { current: null } };
  vm.runInNewContext(ts.transpileModule(move + '\nglobalThis.move = moveLink;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { initial, run: context.move, saved: () => saved };
}
test('icon moves into and out of folders preserve other links and valid backup references', async () => {
  const h = harness();
  await h.run('site-0', 'daily', 'tools');
  assert.equal(h.saved().links[0].folder, 'tools');
  assert.equal(h.initial.links[0].folder, undefined);
  assert.deepEqual(h.saved().links.slice(1), h.initial.links.slice(1));
  const backup = { format: 'ztab', version: 1, data: h.saved(), widgets: null };
  assert.equal(model.parseBackup(JSON.stringify(backup)).data.links[0].folder, 'tools');
  await h.run('site-0', 'work');
  assert.equal(h.saved().links[0].category, 'work');
  assert.equal(h.saved().links[0].folder, undefined);
});
test('invalid move targets and failed save never mutate existing state', async () => {
  const h = harness();
  for (const args of [['missing', 'daily'], ['site-0', 'missing'], ['site-0', 'work', 'tools']]) await h.run(...args);
  assert.equal(h.saved(), undefined);
  const failed = harness(false);
  await failed.run('site-0', 'daily', 'tools');
  assert.equal(failed.initial.links[0].folder, undefined);
});
const dragSource = await readFile(new URL('../src/useTileDrag.ts', import.meta.url), 'utf8');
const dragModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(dragSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: dragModule.exports, require: () => ({}) });
const { reorderItems } = dragModule.exports;
test('drag reorder is immutable and supports first, last and missing targets', () => {
  const original = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  assert.equal(reorderItems(original, 'a', 'a'), original);
  assert.equal(reorderItems(original, 'missing', 'a'), original);
  assert.equal(reorderItems(original, 'a', 'missing'), original);
  assert.equal(reorderItems(original, 'a', 'd').map(item => item.id).join(), 'b,c,d,a');
  assert.equal(reorderItems(original, 'd', 'a').map(item => item.id).join(), 'd,a,b,c');
  assert.equal(original.map(item => item.id).join(), 'a,b,c,d');
});
const orderSource = app.slice(app.indexOf('  async function saveOrder('), app.indexOf('  const layout ='));
function orderHarness(success = true) {
  const initial = model.defaults();
  initial.links[1].folder = 'tools';
  initial.links[3].category = 'work';
  let saved;
  const context = { stateRef: { current: initial }, category: { id: 'daily' }, commit: async next => { model.validateState(next); if (success) saved = next; return success; }, moveLink: async () => {} };
  vm.runInNewContext(ts.transpileModule(orderSource + '\nglobalThis.saveOrder = saveOrder;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { initial, save: context.saveOrder, saved: () => saved };
}
test('committing a drag preserves unrelated category and folder slots', async () => {
  const h = orderHarness();
  const visible = h.initial.links.filter(item => item.category === 'daily' && !item.folder);
  const next = reorderItems(visible, visible[0].id, visible.at(-1).id);
  await h.save(next, undefined, visible[0].id);
  assert.equal(h.saved().links[1], h.initial.links[1]);
  assert.equal(h.saved().links[3], h.initial.links[3]);
  assert.equal(h.saved().links.filter(item => item.category === 'daily' && !item.folder).map(item => item.id).join(), next.map(item => item.id).join());
  assert.equal(h.initial.links[0].id, 'site-0');
  const failed = orderHarness(false);
  await failed.save(next, undefined, visible[0].id);
  assert.equal(failed.saved(), undefined);
  assert.equal(failed.initial.links[0].id, 'site-0');
});
test('pointer lifecycle cancels safely and overlays retain accessible exit animations', async () => {
  const overlay = await readFile(new URL('../src/components/AnimatedOverlay.tsx', import.meta.url), 'utf8');
  assert.match(dragSource, /pointercancel/);
  assert.match(dragSource, /key.key === 'Escape'/);
  assert.match(dragSource, /if \(!current.valid\) \{ reset\(\); return \}/);
  assert.match(dragSource, /finally \{ saving.current = false; reset\(\) \}/);
  assert.match(dragSource, /document.removeEventListener\('pointermove', move\)/);
  assert.match(dragSource, /document.addEventListener\('click', suppressClick, true\)/);
  assert.match(dragSource, /hit\[0\]\?\.closest<HTMLElement>\('\[data-link-destination\]'\)/);
  assert.match(dragSource, /current.x = pointer.clientX\s+current.y = pointer.clientY\s+update\(\)\s+armClickGuard\(\)/);
  assert.match(overlay, /!element.parentElement\?\.inert/);
  assert.match(overlay, /hidden=\{!present\} inert=\{!open\}/);
  assert.match(overlay, /setPresent\(false\), 300/);
  assert.match(overlay, /prefers-reduced-motion/);
  assert.match(overlay, /scrollbarGutter = 'stable'/);
  assert.match(overlay, /if \(open && present && !panel.current\?\.contains\(document.activeElement\)\)/);
});
test('nested editors and menus escape the desktop stacking context', () => {
  assert.match(app, /siteMenu && createPortal\(/);
  assert.match(app, /modal && createPortal\(/);
  assert.match(app, /document.addEventListener\('keydown', keydown, true\)/);
  assert.match(app, /returnFocus\?\.focus|returnFocus.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /folder-dialog-body/);
});
test('icon interaction includes keyboard context entry, upload guard and local library', () => {
  assert.match(app, /event.key === 'ContextMenu'/);
  assert.match(app, /event.shiftKey && event.key === 'F10'/);
  assert.match(app, /<Select label="移动到文件夹"/);
  assert.match(app, /disabled=\{busy \|\| uploading\}/);
  assert.match(app, /aria-label="图标实时预览"/);
  assert.match(app, /defaults\(\).links.map/);
  assert.match(app, /data-link-destination=\{f.id\}/);
  assert.match(app, /draggable=\{false\}/);
  assert.match(app, /await moveLink\(source, category.id, target\)/);
  assert.match(app, /data-link-destination=""/);
  assert.doesNotMatch(app, /if \(manage\) drop\(l.id\)/);
  assert.doesNotMatch(app, /favicon|fetch\(/);
});
