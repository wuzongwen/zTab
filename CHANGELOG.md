# zTab 更新记录 / Changelog

## 2026-10-24

### 中文

#### 新增与改进

- **拖拽创建文件夹**：将同一分类内的一个网站图标拖到另一个图标中心，稳定停留约 450ms，出现“松开创建文件夹”提示后松手，即可创建包含两个图标的“新建文件夹”。文件夹替换目标图标位置，可通过现有入口重命名。
- **保留排序与移动**：图标边缘拖动及快速经过仍用于排序；支持拖入已有文件夹、从文件夹移出，以及按 Esc 取消拖拽。成组操作一次性保存，保存失败不会发布部分修改。
- **本地搜索与历史**：搜索已收藏网站的名称和网址，并展示所属分类或文件夹；提供键盘选择、中文输入法保护和搜索引擎切换。历史仅在本机保存最近 30 条搜索词，支持单条删除、确认清空和关闭记录，不随完整备份导出，不提供联网建议。
- **赞赏入口**：侧栏原外观设置图标替换为爱心“赞赏”按钮，点击后在旁边悬浮展示完整微信赞赏码。支持再次点击、点击外部、Esc 和关闭按钮收起；兼容左右侧栏、自动隐藏和短屏。仅展示图片，不执行付款。
- **设置与主题**：设置改为居中面板和独立内容滚动区，调整侧栏预览、开关、颜色选择器及滑块样式。统一浅色、深色和跟随系统的主题状态，使弹窗与悬浮层同步主题。
- **分类切换与布局**：增加左右滑动、缩放和模糊切换效果，支持 100–1000ms 过渡时长；滚轮切换分类遵循设置开关。调整添加图标面板及图标、组件名称展示。
- 网站右键菜单“编辑网站”改为“编辑图标”。

#### 修复

- 修复点击桌面后刷新出现四周焦点边框，以及搜索输入框聚焦时出现矩形边框的问题；保留其他控件的键盘焦点提示。
- 修复删除文件夹并保留图标后，旧布局快照干扰后续拖拽成组的问题，无需刷新即可连续解散和重新成组。
- 移除弹窗对根页面滚动条槽的强制预留，消除页面最右侧空白条，同时保留弹层滚动锁、退出动画和焦点恢复。
- 修复赞赏浮层在极短窗口下因文字换行导致底部越界的问题，超长内容可在浮层内滚动。

#### 验证

- 全部 **74 项自动化测试通过**。
- TypeScript 严格检查通过，生产构建成功。
- 浏览器使用独立来源的测试桌面验证了拖拽成组、刷新持久化、边缘排序、拖入已有文件夹，以及取消操作。
- 连续三轮验证“删除并保留图标 → 重新成组”，覆盖夹内删除与右键删除，全程无需刷新。
- 验证了搜索焦点样式、赞赏浮层开关与视口边界，以及弹窗打开前后根页面宽度不变。
- 构建的离线资源清单包含赞赏码；图片保持上传原图字节不变。

#### 使用说明

1. 成组时请对准目标图标中心，等待提示后再松手；沿边缘拖动可调整顺序。
2. 打开文件夹后可重命名；选择“删除并保留图标”仅解散文件夹，图标回到原分类桌面。
3. 赞赏码仅供使用微信扫描，页面不会自动支付。
4. 搜索历史独立存储；关闭记录会隐藏历史并停止新增，已有记录需通过“清空搜索历史”单独删除。

### English

#### Features and improvements

- **Drag to create folders:** Drag a website icon onto the center of another website icon in the same category, hold it steady for approximately 450ms, and release after the grouping hint appears. A new folder containing both icons replaces the target icon's position and can be renamed using the existing controls.
- **Sorting and moving remain available:** Edge drops and quick passes still reorder icons. Moving icons into existing folders, moving them out, and cancelling a drag with Esc remain supported. Grouping is saved atomically; failed saves do not publish partial changes.
- **Local search and history:** Match saved websites by title or URL and display their category or folder. Support keyboard selection, Chinese IME input, and search engine switching. History keeps the latest 30 search terms on this device, supports individual deletion and confirmed clearing, and can be disabled. Search terms are excluded from full backups, and no online suggestions are provided.
- **Appreciation popover:** Replace the sidebar appearance shortcut with a heart-shaped appreciation button that displays the complete WeChat appreciation code beside it. Toggle it with the button, click outside, press Esc, or use the close button. Support either sidebar position, auto-hide, and short viewports. The popover only displays an image and does not initiate payment.
- **Settings and themes:** Use a centered settings panel with an independently scrolling content area. Refine sidebar previews, switches, color pickers, and range sliders. Share a single light, dark, or system theme state across dialogs and floating layers.
- **Category transitions and layout:** Add horizontal slide, zoom, and blur transitions with a configurable duration of 100–1000ms. Respect the mouse-wheel category switching preference. Refine the add-icon panel and icon/widget labels.
- Rename the website context-menu action from “Edit website” to “Edit icon” in the Chinese interface.

#### Fixes

- Remove unintended focus borders around the desktop after refresh and around the focused search input, while preserving keyboard focus indicators on other controls.
- Clear stale layout snapshots left by ordinary clicks so that icons released by dissolving a folder can be grouped again without refreshing the page.
- Stop forcing a root scrollbar gutter when opening overlays, removing the blank strip at the page's right edge while retaining scroll locks, exit animations, and focus restoration.
- Constrain the appreciation popover to the viewport when its caption wraps on very short screens, allowing overflowing content to scroll inside the popover.

#### Verification

- All **74 automated tests passed**.
- Strict TypeScript checking and the production build passed.
- Browser checks on an isolated test origin covered grouping, persistence after refresh, edge reordering, moving into existing folders, and cancellation.
- Three consecutive dissolve-and-regroup cycles passed without refreshing, including deletion from inside a folder and from its context menu.
- Browser checks covered search focus styling, appreciation popover controls and viewport bounds, and unchanged root page width while overlays are open.
- The generated offline resource list includes the appreciation image, whose bytes remain identical to the supplied original.

#### Usage

1. To group icons, aim at the target icon's center and wait for the hint before releasing. Drag along the edges to reorder instead.
2. Rename a folder after opening it. “Delete and keep icons” dissolves the folder and returns its icons to their original category desktop.
3. Scan the appreciation image with WeChat if desired; the page does not make payments automatically.
4. Search history is stored separately. Disabling it hides existing terms and stops recording new ones; use the dedicated clear-history action to delete saved terms.

### 开发验证命令 / Development verification commands

```bash
npm test
npm run build
node node_modules/typescript/bin/tsc -p tsconfig.json --strict --noEmit --incremental false
```
