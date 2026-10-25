import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const load = async name => {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { cleanHistory, addHistory, readHistory, writeHistory, matchSites, HISTORY_KEY } = await load('searchHistory');
const { defaults, validateState, parseBackup, safeUrl } = await load('model');
test('history trims, deduplicates case-insensitively, moves newest first and bounds 30/200', () => {
  assert.deepEqual(cleanHistory([' A ', 'a', null, '', 'x'.repeat(201), 'b']), ['A', 'b']);
  assert.deepEqual(addHistory(['A', 'b'], ' a '), ['a', 'b']);
  assert.equal(cleanHistory(Array.from({length: 40}, (_, i) => String(i))).length, 30);
  assert.equal(addHistory([], 'x'.repeat(200))[0].length, 200);
  assert.deepEqual(addHistory(['a'], 'x'.repeat(201)), ['a']);
});
test('history handles corrupt JSON and inaccessible storage without throwing or fake success', () => {
  assert.ok(readHistory({ getItem() { return '{'; } }).error);
  assert.ok(readHistory({ getItem() { throw Error('denied'); } }).error);
  assert.equal(writeHistory([], { setItem() { throw Error('full'); } }), false);
  let saved;
  assert.equal(writeHistory([' A ', 'a'], { setItem(key, value) { assert.equal(key, HISTORY_KEY); saved = value; } }), true);
  assert.deepEqual(JSON.parse(saved), ['A']);
});
test('local matching includes all categories/folders and sorts prefix, name, URL with eight visible', () => {
  const state = { categories: [{id:'other',name:'其他'}], folders:[{id:'f',name:'文件夹'}], links: [
    {id:'url',title:'Else',url:'https://test.example',category:'other'},
    {id:'contains',title:'My Test',url:'https://example.com',category:'other'},
    {id:'prefix',title:'Test first',url:'https://example.com',category:'other',folder:'f'},
  ] };
  assert.deepEqual(matchSites(state, ' test ').map(hit => hit.item.id), ['prefix','contains','url']);
  assert.equal(matchSites(state, 'test')[0].path, '其他 / 文件夹');
  assert.deepEqual(matchSites(state, ''), []);
  state.links = Array.from({length:12}, (_,i) => ({id:String(i),title:'Test',url:'https://example.com'}));
  assert.equal(matchSites(state, 'test').length, 8);
});
test('history preference migrates and survives backup but independent words never enter state', () => {
  const state = defaults(); delete state.settings.searchHistoryEnabled;
  assert.equal(validateState(state).settings.searchHistoryEnabled, true);
  state.settings.searchHistoryEnabled = false;
  const restored = parseBackup(JSON.stringify({format:'ztab',version:1,data:state,widgets:null}));
  assert.equal(restored.data.settings.searchHistoryEnabled, false);
  assert.equal(JSON.stringify(restored).includes(HISTORY_KEY), false);
  state.settings.searchHistoryEnabled = 'true'; assert.throws(() => validateState(state));
  const term = '中文 &?#/';
  assert.ok(safeUrl(`https://example.com/?q=${encodeURIComponent(term)}`).includes(encodeURIComponent(term)));
});
test('site candidates honor each icon opening preference for mouse and keyboard while searches stay independent', async () => {
  const source = await readFile(new URL('../src/components/SearchBar.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const nodes = tree => [tree, ...tree.children.filter(node => node && typeof node === 'object').flatMap(nodes)];
  for (const global of [true, false]) for (const newTab of [undefined, true, false]) {
    const navigations = [], errors = [], mod = { exports: {} };
    const state = defaults();
    state.settings.siteNewTab = global;
    state.settings.searchNewTab = !global;
    state.settings.searchHistoryEnabled = false;
    const values = ['GitHub', true, 0, []];
    let hook = 0;
    vm.runInNewContext(code, {
      exports: mod.exports,
      React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
      useState: () => [values[hook++], () => {}], useRef: value => ({ current: value }), useId: () => 'search', useEffect() {},
      matchSites: () => [{ item: { id: 'site', title: 'GitHub', url: 'https://example.com/', newTab }, path: '日常' }],
      safeUrl, URL, Select: 'Select', SiteIcon: 'SiteIcon', SearchHistoryControls: 'SearchHistoryControls', Search: 'svg', X: 'svg',
      window: { open: (...args) => navigations.push({ newTab: true, args }), location: { assign: url => navigations.push({ newTab: false, url }) } },
    });
    const tree = mod.exports.SearchBar({ state, tell: error => errors.push(error) });
    nodes(tree).find(node => node.props.role === 'option').props.onClick();
    const input = nodes(tree).find(node => node.type === 'input');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} });
    assert.equal(navigations.length, 2);
    for (const result of navigations) {
      assert.equal(result.newTab, newTab ?? global);
      if (result.newTab) assert.equal(result.args[2], 'noopener,noreferrer');
    }
    tree.props.onSubmit({ preventDefault() {} });
    assert.equal(navigations[2].newTab, !global);
    assert.deepEqual(errors, []);
  }
});

test('search input focus stays borderless without disabling other control focus indicators', async () => {
  const css = await readFile(new URL('../src/components/search-bar.css', import.meta.url), 'utf8');
  const globalCss = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /:root \.app \.search > input:focus-visible\s*\{\s*outline: none;\s*box-shadow: none;\s*\}/);
  assert.match(globalCss, /:root :is\(button,input,textarea,select,\[tabindex\]\):focus-visible,[\s\S]*?box-shadow: inset 0 0 0 2px var\(--focus\)/);
});

test('search wiring guards IME, mutual exclusion, full region wheel, plain enter and custom confirmation', async () => {
  const component = await readFile(new URL('../src/components/SearchBar.tsx',import.meta.url),'utf8');
  const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  for (const fragment of ['event.nativeEvent.isComposing', 'event.keyCode === 229', 'onCompositionStart', 'onOpenChange', 'aria-activedescendant', "event.key === 'Tab'", 'else search(query)', 'event.preventDefault()']) assert.ok(component.includes(fragment),fragment);
  assert.ok(component.includes("current < 0 ? (event.key === 'ArrowDown' ? 0 : actions.length - 1)"));
  const css = await readFile(new URL('../src/components/search-bar.css', import.meta.url), 'utf8');
  assert.ok(css.includes('background: rgb(var(--search-rgb) / var(--search-alpha))'));
  assert.ok(css.includes('backdrop-filter: blur(36px)'));
  assert.ok(css.includes('top: calc(100% + 8px)'));
  assert.ok(css.includes('.search-candidate-row:focus-within > button'));
  assert.ok(component.includes("else if (event.key === 'Tab') setActive(-1)"));
  assert.ok(css.includes('overscroll-behavior: contain'));
  assert.ok(app.includes("target.closest('.search, input"));
  const controls = await readFile(new URL('../src/components/SearchHistoryControls.tsx',import.meta.url),'utf8');
  assert.ok(controls.includes('role="alertdialog"')); assert.ok(!controls.includes('confirm('));
});
