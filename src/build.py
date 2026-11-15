import os, shutil, json
from PIL import Image, ImageDraw
SRC='/home/claude/kartentisch/index.html'; OUT='/home/claude/kartentisch/dist'; SB='supabase-2.118.0.js'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
s=open(SRC,encoding='utf-8').read()
head_extra='''<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<meta name="theme-color" content="#f7f7f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1c1e" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="mobile-web-app-capable" content="yes">
'''
assert s.count('<title>Kartentisch</title>')==1 and s.count('\n<script>')==1
s=s.replace('<title>Kartentisch</title>','<title>Kartentisch</title>\n'+head_extra)
s=s.replace('\n<script>', f'\n<script src="{SB}"></script>\n<script>')
open(f'{OUT}/index.html','w',encoding='utf-8').write(s)
shutil.copy(f'/home/claude/vendor/{SB}', f'{OUT}/{SB}')
# App-Symbol: zwei Karten mit Handschrift-Schwung
def icon(size, pad_ratio=0.0, path=None):
    S=size*4; im=Image.new('RGBA',(S,S),(47,111,237,255)); d=ImageDraw.Draw(im)
    p=int(S*(0.18+pad_ratio)); w=S-2*p
    d.rounded_rectangle([p, p+int(w*0.18), p+int(w*0.62), p+w], radius=int(w*0.09), fill=(214,226,252,255))
    d.rounded_rectangle([p+int(w*0.34), p, p+w, p+int(w*0.82)], radius=int(w*0.09), fill=(255,255,255,255))
    x0=p+int(w*0.46); y0=p+int(w*0.42); pts=[]
    import math
    for i in range(41):
        t=i/40; pts.append((x0+t*w*0.44, y0+math.sin(t*math.pi*2.4)*w*0.07-t*w*0.02))
    d.line(pts, fill=(47,111,237,255), width=max(2,int(w*0.055)), joint='curve')
    im=im.resize((size,size), Image.LANCZOS); im.save(path)
icon(192,0,f'{OUT}/icon-192.png'); icon(512,0,f'{OUT}/icon-512.png'); icon(512,0.06,f'{OUT}/icon-maskable-512.png'); icon(180,0,f'{OUT}/apple-touch-icon.png')
json.dump({"name":"Kartentisch","short_name":"Kartentisch","description":"Karten, Whiteboards, Handschrift und Präsentationen","lang":"de","start_url":"./","scope":"./","display":"standalone","background_color":"#efeff1","theme_color":"#f7f7f8",
 "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},
 open(f'{OUT}/manifest.webmanifest','w',encoding='utf-8'), ensure_ascii=False, indent=1)
import hashlib
ver=hashlib.sha1(s.encode()).hexdigest()[:10]
open(f'{OUT}/sw.js','w').write(f"""// Offline-Start: App-Dateien zwischenspeichern, Daten kommen immer frisch von Supabase
const CACHE = 'kartentisch-{ver}';
const SHELL = ['./', './index.html', './{SB}', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (req.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('/index.html')) {{
    e.respondWith(fetch(req).then(r => {{ const c = r.clone(); caches.open(CACHE).then(ca => ca.put('./index.html', c)); return r; }}).catch(() => caches.match('./index.html')));
    return;
  }}
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
}});
""")
open(f'{OUT}/_headers','w').write("""/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
""")
print('built', sorted(os.listdir(OUT)), 'sw', ver)
