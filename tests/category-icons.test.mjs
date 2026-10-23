import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const source = await readFile(new URL('../src/components/categoryIcons.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll("'lucide-react'", JSON.stringify(import.meta.resolve('lucide-react')));
const { CATEGORY_ICONS, ICON_GROUPS, CategoryIcon } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('curated catalog uses unique valid static icons with Chinese and English search', () => {
  assert.equal(CATEGORY_ICONS.length, 240);
  assert.equal(new Set(CATEGORY_ICONS.map(x => x.id)).size, CATEGORY_ICONS.length);
  for (const entry of CATEGORY_ICONS) {
    assert.match(entry.id, /^lucide:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.ok(ICON_GROUPS.includes(entry.group));
    assert.ok(entry.keywords.includes(entry.id.slice(7)));
    assert.match(entry.name, /[\u4e00-\u9fff]/);
    assert.match(renderToStaticMarkup(createElement(CategoryIcon, {symbol:entry.id})), /<svg/);
  }
  assert.ok(CATEGORY_ICONS.some(x => x.keywords.includes('咖啡')));
  assert.ok(CATEGORY_ICONS.some(x => x.keywords.includes('coffee')));
  assert.doesNotMatch(source, /import\s*\*|dynamicIconImports|DynamicIcon/);
});
test('unknown IDs render generic SVG while custom legacy characters remain intact', () => {
  const unknown = renderToStaticMarkup(createElement(CategoryIcon, {symbol:'lucide:unknown-future'}));
  assert.match(unknown, /<svg/);
  assert.doesNotMatch(unknown, /unknown-future/);
  assert.match(renderToStaticMarkup(createElement(CategoryIcon, {symbol:'⌂'})), /<svg/);
  assert.match(renderToStaticMarkup(createElement(CategoryIcon, {symbol:'自定义'})), /自定义/);
});
test('picker portals a viewport-bounded keyboard grid with parent layer ownership', async () => {
  const picker = await readFile(new URL('../src/components/CategoryIconPicker.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(picker, /registerSelectLayer\(button, popup, close\)/);
  assert.match(picker, /button\.focus\(\{ preventScroll: true \}\)/);
  assert.match(picker, /search.current\?\.focus/);
  assert.match(picker, /ArrowLeft/);
  assert.match(picker, /aria-pressed/);
  assert.match(picker, /createPortal\(/);
  assert.match(picker, /visualViewport/);
  assert.match(picker, /const upward = below/);
  assert.match(picker, /event.key === 'Tab'/);
  assert.match(picker, /await onChange\(symbol\) !== false/);
  assert.match(app, /ownsFloatingTarget\(panel, event.target\)\) return/);
  assert.match(app, /className="category-modal-scroll"/);
  assert.match(css, /\.category-modal-scroll \{[^}]*overflow-y: auto/);
});
