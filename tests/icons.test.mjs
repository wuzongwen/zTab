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
  assert.match(dragSource, /current.x = pointer.clientX\s+current.y = pointer.clientY\s+update\('release'\)\s+armClickGuard\(\)/);
  assert.match(overlay, /!element.parentElement\?\.inert/);
  assert.match(overlay, /hidden=\{!present\} inert=\{!open\}/);
  assert.match(overlay, /setPresent\(false\), 300/);
  assert.match(overlay, /prefers-reduced-motion/);
  assert.doesNotMatch(overlay, /scrollbarGutter\s*=/);
  assert.match(overlay, /if \(open && present && !panel.current\?\.contains\(document.activeElement\)\)/);
});
test('overlay scroll locks preserve the root gutter and release only after the final exiting layer', async () => {
  const source = await readFile(new URL('../src/components/AnimatedOverlay.tsx', import.meta.url), 'utf8');
  const callbacks = new Map(), instances = [];
  let current, now = 0, sequence = 0, gutter = 'auto', gutterWrites = 0;
  const listeners = new Map();
  const document = {
    body: { style: { overflow: 'clip' } }, documentElement: { style: {} }, activeElement: null,
    querySelector: () => null,
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
  };
  Object.defineProperty(document.documentElement.style, 'scrollbarGutter', { get: () => gutter, set: value => { gutter = value; gutterWrites++; } });
  const window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), setTimeout(callback, delay) { const id = ++sequence; callbacks.set(id, { callback, at: now + delay }); return id; } };
  const effect = (callback, deps) => {
    const i = current.effectIndex++;
    if (!current.effects[i] || deps.some((value, index) => value !== current.effects[i].deps[index])) {
      const instance = current;
      instance.pending.push(() => { instance.effects[i]?.cleanup?.(); instance.effects[i] = { deps, cleanup: callback() }; });
    }
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
    exports: mod.exports, React, X: 'X', document, window, createPortal: tree => tree, dismissSelectOnEscape: () => false,
    useState(value) { const instance = current, i = instance.stateIndex++; if (!(i in instance.states)) instance.states[i] = value; return [instance.states[i], value => { if (instance.states[i] !== value) { instance.states[i] = value; instance.dirty = true; } }]; },
    useRef(value) { const i = current.refIndex++; return current.refs[i] ??= { current: i === 0 ? current.element : value }; },
    useEffect: effect, useLayoutEffect: effect,
    requestAnimationFrame: () => ++sequence, cancelAnimationFrame() {}, clearTimeout: id => callbacks.delete(id),
  });
  function render(instance, open = instance.open) {
    instance.open = open; instance.element.parentElement.inert = !open;
    do {
      current = instance; instance.stateIndex = instance.refIndex = instance.effectIndex = 0; instance.dirty = false;
      mod.exports.AnimatedOverlay({ open, onClose() {}, label: '测试', children: null });
      instance.pending.splice(0).forEach(run => run());
    } while (instance.dirty);
  }
  const create = () => {
    const instance = { states: [], refs: [], effects: [], pending: [], open: true, element: { isConnected: true, parentElement: { inert: false }, contains: () => true, focus() {}, querySelectorAll: () => [] } };
    instances.push(instance); render(instance); return instance;
  };
  const advance = ms => { now += ms; for (const [id, timer] of [...callbacks]) if (timer.at <= now) { callbacks.delete(id); timer.callback(); } instances.forEach(instance => { if (instance.dirty) render(instance); }); };
  const first = create(), second = create();
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(gutter, 'auto'); assert.equal(gutterWrites, 0);
  render(first, false); advance(299);
  assert.equal(document.body.style.overflow, 'hidden');
  advance(1); assert.equal(document.body.style.overflow, 'hidden');
  render(second, false); advance(150); render(second, true); advance(200);
  assert.equal(document.body.style.overflow, 'hidden');
  second.effects.forEach(effect => effect.cleanup?.());
  assert.equal(document.body.style.overflow, 'clip');
  assert.equal(gutterWrites, 0);
  assert.ok([...listeners.values()].every(handlers => handlers.size === 0));
});

function pointerHarness({ touch = false, canGroup = true, save = async () => {}, layoutEffects = false } = {}) {
  let now = 0, nextId = 0, hits;
  const frames = new Map(), timers = new Map(), refs = [], states = [], effects = [], layouts = [], pendingLayouts = [], animationLog = [];
  let refIndex, stateIndex, effectIndex, layoutIndex, options, controller;
  const target = () => {
    const handlers = new Map();
    return {
      handlers,
      addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(handler); },
      removeEventListener(name, handler) { handlers.get(name)?.delete(handler); },
      async dispatch(name, event = {}) { await Promise.all([...(handlers.get(name) ?? [])].map(handler => handler(event))); },
    };
  };
  const classes = () => {
    const values = new Set();
    return { add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)), contains: name => values.has(name) };
  };
  const style = () => ({ setProperty() {} });
  const rect = (left, top = 100, width = 60, height = 60) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const scroll = { scrollTop: 0, getBoundingClientRect: () => rect(0, 0, 600, 600) };
  const nodes = [];
  const root = {
    dataset: { dragScope: 'desktop-daily' },
    querySelectorAll: () => nodes,
    contains: node => node === root || nodes.includes(node),
    closest: selector => selector === '.animated-overlay-panel, .desktop' ? scroll : null,
  };
  const clone = () => ({ classList: classes(), style: style(), querySelectorAll: () => [], removeAttribute() {}, setAttribute() {}, remove() { this.removed = true; } });
  for (const [id, left] of [['link:a', 50], ['link:b', 150], ['link:c', 250], ['folder:f', 350], ['widget:memo', 450]]) {
    const node = {
      dataset: { sortId: id, ...(id === 'folder:f' ? { linkDestination: 'f' } : {}) },
      rect: rect(left), classList: classes(), style: style(),
      getBoundingClientRect() { return { ...this.rect }; },
      querySelector: selector => selector === '.site-icon' && id.startsWith('link:') ? { getBoundingClientRect: () => node.getBoundingClientRect() } : null,
      closest(selector) { return selector === '[data-drag-scope]' ? root : selector === '[data-link-destination]' && id === 'folder:f' ? node : null; },
      cloneNode: clone,
      animate(keyframes) { const animation = { playState: layoutEffects ? 'running' : 'finished', cancel() { this.playState = 'idle'; } }; animationLog.push({ id, keyframes, animation }); return animation; },
    };
    nodes.push(node);
  }
  const document = { ...target(), querySelectorAll: () => [root], body: { classList: classes(), append() {} }, elementsFromPoint: (x, y) => hits ?? [nodes.find(node => x >= node.rect.left && x <= node.rect.right && y >= node.rect.top && y <= node.rect.bottom) ?? root] };
  const window = { ...target(), scrollY: 0, matchMedia: () => ({ matches: false }), scrollBy(_x, y) { window.scrollY += y; }, setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; } };
  const mod = { exports: {} };
  const hooks = {
    useRef(value) { const i = refIndex++; return refs[i] ??= { current: value }; },
    useState(value) { const i = stateIndex++; if (!(i in states)) states[i] = value; return [states[i], value => { states[i] = value; }]; },
    useEffect(callback, deps) { const i = effectIndex++; if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: callback() }; } },
    useLayoutEffect(callback, deps) {
      const i = layoutIndex++;
      if (layoutEffects && (!layouts[i] || deps.some((value, j) => value !== layouts[i].deps[j]))) {
        layouts[i] = { deps };
        pendingLayouts.push(callback);
      }
    },
  };
  vm.runInNewContext(ts.transpileModule(dragSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: mod.exports, require: () => hooks, document, window, innerHeight: 600,
    performance: { now: () => now }, getComputedStyle: () => ({ getPropertyValue: () => '60px' }),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    clearTimeout: id => timers.delete(id),
  });
  const grouped = [], committed = [];
  options = {
    items: nodes.map(node => ({ id: node.dataset.sortId })), scope: 'desktop-daily', allowFolders: true, canDrop: id => id.startsWith('link:'),
    canGroup: canGroup ? (source, dest) => source.startsWith('link:') && dest.startsWith('link:') : undefined,
    onGroup: async (...args) => { grouped.push(args); await save(); },
    onCommit: async (...args) => { committed.push(args); await save(); },
  };
  function render(patch = {}) { options = { ...options, ...patch }; refIndex = stateIndex = effectIndex = layoutIndex = 0; controller = mod.exports.useTileDrag(options); pendingLayouts.splice(0).forEach(effect => effect()); return controller; }
  render();
  const pointer = (x, y = 130, pointerId = 1) => ({ clientX: x, clientY: y, pointerId, preventDefault() {} });
  return {
    nodes, root, scroll, document, window, frames, grouped, committed, render, animationLog,
    down(id = 'link:a') { const node = nodes.find(node => node.dataset.sortId === id); controller.onPointerDown({ ...pointer(node.rect.left + 30), target: node, currentTarget: node, button: 0, isPrimary: true, pointerType: touch ? 'touch' : 'mouse' }, id); },
    move: (x, y = 130, id = 1) => document.dispatch('pointermove', pointer(x, y, id)),
    up: (x, y = 130, id = 1) => document.dispatch('pointerup', pointer(x, y, id)),
    hit: value => { hits = value; },
    async advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } const callbacks = [...frames]; frames.clear(); callbacks.forEach(([, callback]) => callback()); },
    cleanup() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('clicking a folder before its dissolution leaves no stale FLIP snapshot for the next grouping drag', async () => {
  const h = pointerHarness({ layoutEffects: true });
  for (let round = 0; round < 2; round++) {
    h.down('folder:f'); await h.up(380); h.render();
    h.nodes[1].rect = { ...h.nodes[1].rect, left: h.nodes[1].rect.left + 90, right: h.nodes[1].rect.right + 90 };
    h.render();
    h.down(); await h.move(h.nodes[1].rect.left + 30); h.render();
    assert.equal(h.animationLog.length, 0, '未激活的点击不能触发删除前坐标的排序动画');
    await h.advance(450); await h.up(h.nodes[1].rect.left + 30); h.render();
    assert.equal(h.grouped.length, round + 1);
  }
  h.cleanup();
});

test('active sorting still measures positions and animates changed tile locations', async () => {
  const h = pointerHarness({ layoutEffects: true });
  h.down(); await h.move(152); await h.advance(120);
  h.nodes[1].rect = { ...h.nodes[1].rect, left: 50, right: 110 };
  h.render();
  assert.ok(h.animationLog.some(entry => entry.id === 'link:b' && entry.keyframes[0].transform === 'translate(100px, 0px)'));
  await h.document.dispatch('pointercancel'); h.render(); h.cleanup();
});

test('pointer grouping requires a stable center dwell and does not also commit sorting', async () => {
  const h = pointerHarness(); h.down(); await h.move(180);
  assert.ok(h.nodes[1].classList.contains('tile-group-candidate'));
  await h.advance(449);
  assert.equal(h.nodes[1].classList.contains('tile-group-ready'), false);
  await h.advance(1);
  assert.ok(h.nodes[1].classList.contains('tile-group-ready'));
  await h.up(180);
  assert.equal(h.grouped.length, 1);
  assert.deepEqual(h.grouped[0].slice(0, 2), ['link:a', 'link:b']);
  assert.equal(h.committed.length, 0);
  assert.equal(h.nodes[1].classList.contains('tile-group-candidate'), false);
  assert.equal(h.document.body.classList.contains('tiles-dragging'), false);
  h.cleanup();
});

test('quick center drops, edge drags and non-link sources remain ordinary sorting', async () => {
  for (const [source, x, delay] of [['link:a', 180, 449], ['link:a', 152, 600], ['widget:memo', 180, 600], ['folder:f', 180, 600]]) {
    const h = pointerHarness(); h.down(source); await h.move(x); await h.advance(delay); await h.up(x);
    assert.equal(h.grouped.length, 0);
    assert.equal(h.committed.length, 1);
    assert.equal(h.committed[0][0][1].id, source);
    h.cleanup();
  }
  const disabled = pointerHarness({ canGroup: false }); disabled.down(); await disabled.move(180); await disabled.advance(600); await disabled.up(180);
  assert.equal(disabled.grouped.length, 0); assert.equal(disabled.committed.length, 1); disabled.cleanup();
});

test('moving through an icon edge into its center does not move the target out from under the pointer', async () => {
  const h = pointerHarness(); h.down(); await h.move(152); await h.advance(60);
  assert.equal(h.render().items[0].id, 'link:a');
  await h.move(180); await h.advance(450); await h.up(180);
  assert.equal(h.grouped.length, 1); assert.equal(h.committed.length, 0); h.cleanup();
});

test('desktop grouping publishes a single atomic save and leaves state untouched on failure', async () => {
  const start = app.indexOf('onGroup: async (source, target, items) => {');
  const callback = app.slice(start + 'onGroup: '.length, app.indexOf('}, onStart:', start) + 1);
  for (const success of [false, true]) {
    const initial = model.reconcileLayouts(model.defaults());
    const original = JSON.stringify(initial);
    const saves = [], notices = [];
    const context = { groupLinksIntoFolder: model.groupLinksIntoFolder, stateRef: { current: initial }, uid: () => 'grouped', tell: value => notices.push(value), commit: async next => { model.validateState(next); saves.push(next); if (success) context.stateRef.current = next; return success; } };
    vm.runInNewContext(ts.transpileModule(`const group = ${callback}; globalThis.group = group;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await context.group('link:site-0', 'link:site-1', initial.layouts.daily.order.map(id => ({ id })));
    assert.equal(saves.length, 1);
    assert.equal(JSON.stringify(initial), original);
    assert.equal(context.stateRef.current === initial, !success);
    assert.equal(notices.length, success ? 1 : 0);
  }
});

test('group dwell resets after moving, leaving, switching targets or scrolling', async () => {
  for (const mode of ['move', 'leave', 'switch', 'scroll', 'layout']) {
    const h = pointerHarness(); h.down(); await h.move(180); await h.advance(400);
    let x = 180;
    if (mode === 'move') { x = 186; await h.move(x); }
    if (mode === 'leave') { await h.move(120); await h.move(180); }
    if (mode === 'switch') { x = 280; await h.move(x); }
    if (mode === 'scroll') { h.scroll.scrollTop = 10; await h.advance(16); await h.move(x); }
    if (mode === 'layout') { h.nodes[1].rect = { ...h.nodes[1].rect, left: h.nodes[1].rect.left + 5, right: h.nodes[1].rect.right + 5 }; await h.advance(16); await h.move(x); }
    await h.advance(100); await h.up(x);
    assert.equal(h.grouped.length, 0, mode); h.cleanup();
  }
});

test('existing folders take priority and cancelled or invalid drops never create a folder', async () => {
  const folder = pointerHarness(); folder.down(); await folder.move(180); await folder.advance(500); await folder.move(380); await folder.up(380);
  assert.equal(folder.grouped.length, 0); assert.equal(folder.committed[0][1], 'f'); folder.cleanup();
  for (const mode of ['escape', 'cancel', 'blur', 'disabled', 'scope', 'outside', 'unmount']) {
    const h = pointerHarness(); h.down(); await h.move(180); await h.advance(500);
    if (mode === 'escape') await h.document.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    if (mode === 'cancel') await h.document.dispatch('pointercancel');
    if (mode === 'blur') await h.window.dispatch('blur');
    if (mode === 'disabled') h.render({ disabled: true });
    if (mode === 'scope') h.render({ scope: 'desktop-other' });
    if (mode === 'outside') h.hit([{ closest: () => null }]);
    if (mode === 'unmount') h.cleanup();
    await h.up(180);
    assert.equal(h.grouped.length, 0, mode); assert.equal(h.committed.length, 0, mode);
    assert.equal(h.nodes[1].classList.contains('tile-group-ready'), false, mode); h.cleanup();
  }
});

test('touch grouping retains long press activation and saving suppresses duplicate pointer-up', async () => {
  const early = pointerHarness({ touch: true }); early.down(); await early.move(180); await early.advance(600); await early.up(180);
  assert.equal(early.grouped.length, 0); assert.equal(early.committed.length, 0); early.cleanup();
  let finish;
  const h = pointerHarness({ touch: true, save: () => new Promise(resolve => { finish = resolve; }) });
  h.down(); await h.advance(280); await h.move(180); await h.advance(450);
  const pending = h.up(180); await h.up(180);
  assert.equal(h.grouped.length, 1); finish(false); await pending;
  assert.equal(h.render().dragging, undefined); assert.equal(h.frames.size, 0); h.cleanup();
});

test('stationary frame hits never arm grouping and release revalidates the target', async () => {
  const h = pointerHarness(); h.down(); await h.move(120);
  h.nodes[1].rect = { ...h.nodes[1].rect, left: 90, right: 150 };
  await h.advance(600); await h.up(120);
  assert.equal(h.grouped.length, 0); h.cleanup();
  const stale = pointerHarness(); stale.down(); await stale.move(180); await stale.advance(500); await stale.up(280);
  assert.equal(stale.grouped.length, 0); stale.cleanup();
});

test('nested editors and menus escape the desktop stacking context', () => {
  assert.match(app, /siteMenu && createPortal\(/);
  assert.match(app, /modal && modal !== 'settings' && createPortal\(/);
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
