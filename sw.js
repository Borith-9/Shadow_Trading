// Shadow のオフライン用 Service Worker（PWA）
// ・初めて開いたときに、ページ一式（index.html・アイコン・ETHのデータ）を端末に保存する → 以降はネットなしでも遊べる
// ・index.html はネット優先：つながれば最新版を取って保存し直す。つながらなければ保存した版
// ・data/・アイコン・manifest は保存した版を優先。中身を差し替えたときは VERSION を上げる（全部取り直す）
// ・フォント（Google Fonts）は一度使った分だけ保存。保存がなければ端末の標準フォントになる
const VERSION = 'v1';
const CORE = 'shadow-core-' + VERSION;
const FONTS = 'shadow-fonts';
const CORE_FILES = [
  './index.html',
  './manifest.json',
  './icons/favicon.ico', './icons/favicon-32.png', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/logo.png',
  './data/ETHUSDT_5m.json', './data/ETHUSDT_5m.bin',
];
const PAGE = new URL('./index.html', self.registration.scope).href;
const SCOPE_PATH = new URL(self.registration.scope).pathname;

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CORE).then(c=>c.addAll(CORE_FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith('shadow-core-') && k!==CORE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === location.origin){
    if(!url.pathname.startsWith(SCOPE_PATH)) return;
    if(req.mode === 'navigate' || url.origin + url.pathname === PAGE) e.respondWith(pageFirst(req));
    else e.respondWith(cacheFirst(req, CORE, true));
  }else if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(cacheFirst(req, FONTS, false));
  }
  // それ以外（Binance の API など）は今までどおりネットへ
});

// ページ：ネット優先。保存した版があるときは、4秒つながらなければ保存した版を出す
async function pageFirst(req){
  const cache = await caches.open(CORE);
  const saved = await cache.match(PAGE);
  const ctl = new AbortController();
  const timer = saved ? setTimeout(()=>ctl.abort(), 4000) : 0;
  try{
    const res = await fetch(req.url, {cache:'no-cache', signal:ctl.signal});
    clearTimeout(timer);
    if(res.ok && !res.redirected){ cache.put(PAGE, res.clone()); return res; }
    return saved || res;
  }catch(err){
    clearTimeout(timer);
    if(saved) return saved;
    throw err;
  }
}

// データ・アイコン・フォント：保存した版を優先。なければネットから取って保存
async function cacheFirst(req, name, ignoreSearch){
  const cache = await caches.open(name);
  const hit = await cache.match(req, {ignoreSearch});
  if(hit) return hit;
  const res = await fetch(req);
  if(res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
