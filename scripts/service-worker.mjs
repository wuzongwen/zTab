import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [];
async function walk(dir, prefix = "") {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(`${dir}/${e.name}`, `${prefix}${e.name}/`);
    else if (e.name !== "sw.js") files.push(`${prefix}${e.name}`);
  }
}
await walk("dist");
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(`dist/${f}`));
const cache = `ztab-app-${hash.digest("hex").slice(0, 12)}`;
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)};
const ASSETS=${JSON.stringify(files.map((f) => "./" + f))};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ztab-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);const scope=new URL(self.registration.scope);if(e.request.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('./index.html'))));return;}
const relative='./'+u.pathname.slice(scope.pathname.length);if(!ASSETS.includes(relative))return;
e.respondWith(caches.open(CACHE).then(c=>c.match(relative)).then(hit=>hit||fetch(e.request)));});
`,
);
console.log(`PWA: precached ${files.length} app resources (${cache}).`);
