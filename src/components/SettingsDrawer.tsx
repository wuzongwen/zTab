import { useLayoutEffect, useRef } from 'react';
import { Settings, Check, Upload, Trash2, Download, ShieldCheck, CloudOff } from "lucide-react";
import { defaults, safeUrl, uid, type AppState } from "../model";
import { readImage } from "../storage";
import { SettingsPanel, settingGroups, rangeStyle } from "./SettingsPanel";
import { Switch } from './Switch';
export function SettingsDrawer({state,tab,setTab,busy,storageFailed,updateSettings,commit,tell,exportData,importData,reset}: { state:AppState; tab:string; setTab:(s:string)=>void; busy:boolean; storageFailed:boolean; updateSettings:(p:Partial<AppState["settings"]>)=>Promise<boolean>; commit:(s:AppState)=>Promise<boolean>; tell:(s:string)=>void; exportData:()=>void; importData:(f:File)=>void; reset:()=>void }) {
const contentRef = useRef<HTMLDivElement>(null);
useLayoutEffect(() => {
  if (contentRef.current) contentRef.current.scrollTop = 0;
}, [tab]);
const engine=state.engines.find(e=>e.id===state.settings.engine) ?? state.engines[0];
return <div className="settings-shell">
                <div className="settings-title">
                  <span className="modal-icon">
                    <Settings />
                  </span>
                  <div>
                    <h2>让桌面，更像你</h2>
                    <p className="muted">简单设置，创造属于自己的舒适区。</p>
                  </div>
                </div>
                <nav className="settings-tabs" aria-label="设置分组">
                  {settingGroups.map(([id, label]) => (
                    <button
                      className={tab === id ? "active" : ""}
                      key={id}
                      type="button"
                      aria-current={tab === id ? 'page' : undefined}
                      aria-controls="settings-scroll-content"
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="settings-scroll" id="settings-scroll-content" ref={contentRef}>
                <SettingsPanel settings={state.settings} group={tab} update={updateSettings} />
                {tab === "reset" && <div className="settings-card"><button disabled={busy} onClick={() => { if (confirm("仅重置设置，保留网站分类和组件？")) void updateSettings({...defaults().settings, engine: state.engines[0].id}); }}>仅重置设置</button><button disabled={busy} onClick={reset}>清空并恢复初始桌面</button></div>}
                {tab === "theme" && (
                  <div className="settings-content">
                    <h3>桌面壁纸</h3>
                    <div className="wallpaper-options">
                      {[
                        ["aurora", "暮光蓝"],
                        ["dusk", "落日粉"],
                        ["forest", "远山绿"],
                      ].map(([id, name]) => (
                        <button
                          key={id}
                          className={`wallpaper-${id} ${state.settings.wallpaper === id ? "chosen" : ""}`}
                          onClick={() => updateSettings({ wallpaper: id })}
                        >
                          <span>{name}</span>
                          {state.settings.wallpaper === id && (
                            <Check size={18} />
                          )}
                        </button>
                      ))}
                      <label className="upload-wallpaper">
                        <Upload size={21} />
                        <span>上传图片</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              await updateSettings({
                                wallpaper: await readImage(f),
                              });
                            } catch (err) {
                              tell((err as Error).message);
                            }
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <p className="fine muted">
                      仅存储在本机，支持 PNG / JPEG / WebP / GIF，最大 5 MB。
                    </p>
                    <label className="range-field">
                      壁纸遮罩 <span>{state.settings.dim}%</span>
                      <input
                        aria-label="壁纸遮罩"
                        type="range"
                        min="0"
                        max="60"
                        style={rangeStyle(state.settings.dim, 0, 60)}
                        value={state.settings.dim}
                        onChange={(e) =>
                          updateSettings({ dim: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                )}
                {tab === "layout" && <div className="settings-content">                    <label className="range-field">
                      每行图标数量 <span>{state.settings.columns} 列</span>
                      <input
                        aria-label="每行图标数量"
                        type="range"
                        min="4"
                        max="20"
                        style={rangeStyle(state.settings.columns, 4, 20)}
                        value={state.settings.columns}
                        onChange={(e) =>
                          updateSettings({ columns: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="range-field">
                      图标大小 <span>{state.settings.size}px</span>
                      <input
                        aria-label="图标大小"
                        type="range"
                        min="42"
                        max="80"
                        style={rangeStyle(state.settings.size, 42, 80)}
                        value={state.settings.size}
                        onChange={(e) =>
                          updateSettings({ size: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="toggle-field">
                      显示桌面小组件
                      <Switch
                        checked={state.settings.showWidgets}
                        onCheckedChange={checked => void updateSettings({ showWidgets: checked })}
                      />
                    </label>
</div>}
                {tab === "search" && (
                  <div className="settings-content">
                    <h3>我的搜索引擎</h3>
                    {state.engines.map((en) => (
                      <div className="engine-row" key={en.id}>
                        <button
                          className={
                            engine.id === en.id
                              ? "engine-check active"
                              : "engine-check"
                          }
                          title="设为默认引擎"
                          onClick={() => updateSettings({ engine: en.id })}
                        >
                          <Check size={15} />
                        </button>
                        <div>
                          <strong>{en.name}</strong>
                          <small>{en.template}</small>
                        </div>
                        <button
                          title="删除搜索引擎"
                          disabled={state.engines.length === 1 || busy}
                          onClick={() => {
                            if (!confirm(`删除搜索引擎「${en.name}」？`))
                              return;
                            const engines = state.engines.filter(
                              (e) => e.id !== en.id,
                            );
                            commit({
                              ...state,
                              engines,
                              settings: {
                                ...state.settings,
                                engine:
                                  engine.id === en.id
                                    ? engines[0].id
                                    : engine.id,
                              },
                            });
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <h3>添加自定义引擎</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const fd = new FormData(form);
                        const name = String(fd.get("name")).trim(),
                          template = String(fd.get("template")).trim();
                        try {
                          if (!template.includes("{query}"))
                            throw new Error("搜索地址需包含 {query} 占位符");
                          safeUrl(template.replaceAll("{query}", "test"));
                          if (state.engines.length >= 20)
                            throw new Error("最多支持20个搜索引擎");
                          if (
                            await commit({
                              ...state,
                              engines: [
                                ...state.engines,
                                { id: uid(), name, template },
                              ],
                            })
                          )
                            form.reset();
                        } catch (err) {
                          tell((err as Error).message);
                        }
                      }}
                    >
                      <label className="field">
                        引擎名称
                        <input
                          name="name"
                          required
                          maxLength={20}
                          placeholder="例如：DuckDuckGo"
                        />
                      </label>
                      <label className="field">
                        搜索地址
                        <input
                          name="template"
                          required
                          maxLength={4000}
                          placeholder="https://duckduckgo.com/?q={query}"
                        />
                      </label>
                      <p className="fine muted">
                        用 {"{query}"} 表示搜索词。仅允许 HTTP /
                        HTTPS，搜索直达原始地址。
                      </p>
                      <button className="primary" disabled={busy}>
                        添加搜索引擎
                      </button>
                    </form>
                  </div>
                )}
                {tab === "backup" && (
                  <div className="settings-content">
                    <div className="privacy-card">
                      <ShieldCheck size={28} />
                      <div>
                        <h3>你的数据，始终属于你</h3>
                        <p>
                          无账号、无追踪、无推广跳转。网站图标不请求外部服务。配置与图片保存在本机
                          IndexedDB，组件保存在本地存储中。
                        </p>
                      </div>
                    </div>
                    <h3>备份与迁移</h3>
                    <p className="muted">
                      JSON
                      备份包含全部分类、链接、文件夹、设置、图片与组件内容。请妥善保管，备份可能含有私人信息。
                    </p>
                    <div className="data-actions">
                      <button onClick={exportData}>
                        <Download size={18} /> 导出完整备份
                      </button>
                      <label>
                        <Upload size={18} /> 导入备份
                        <input
                          type="file"
                          accept="application/json,.json"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importData(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <div className="offline-note">
                      <CloudOff size={19} />
                      <p>
                        <strong>离线也能打开桌面</strong>
                        <br />
                        生产构建首次联网访问后，本应用资源可离线使用；外部网站与网络搜索仍需联网。不缓存外站，不读取浏览器书签或历史。安装能力取决于浏览器，开发服务器不启用离线缓存。
                      </p>
                    </div>
                    <div className="danger-zone">
                      <div>
                        <strong>恢复初始桌面</strong>
                        <p>清空自定义内容，恢复默认设置。</p>
                      </div>
                      <button disabled={busy} onClick={reset}>
                        清空并重置
                      </button>
                    </div>
                  </div>
                )}
                </div>
                <div className="settings-bottom" role="status">
                  <ShieldCheck size={13} />{" "}
                  {busy
                    ? "正在安全保存…"
                    : storageFailed
                      ? "本地存储不可用 · 修改已停用"
                      : "更改自动保存于此设备"}
                </div>
</div>;
}
