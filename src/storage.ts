import { defaults, validateState, type AppState } from "./model";
const openDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ztab-desktop", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("desktop");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function loadState(): Promise<AppState> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("desktop");
      const r = tx.objectStore("desktop").get("state");
      r.onsuccess = () => {
        try {
          resolve(r.result ? validateState(r.result) : defaults());
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveState(state: AppState) {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("desktop", "readwrite");
      tx.objectStore("desktop").put(state, "state");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("存储事务已取消"));
    });
  } finally {
    db.close();
  }
}
export async function readImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("请选择 PNG、JPEG、WebP 或 GIF 图片");
  if (file.size > 5_000_000) throw new Error("图片不能超过 5 MB");
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("图片读取失败"));
    r.readAsDataURL(file);
  });
}
