import asyncio, json, os, http.server, threading, urllib.parse
from playwright.async_api import async_playwright

DIST = '/home/claude/kartentisch/dist'; CLAUDE = '/home/claude/kartentisch'; OUT = '/home/claude/tests/out3'; os.makedirs(OUT, exist_ok=True)
STORE = {}
def make(root, port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
        def log_message(self, *a): pass
        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0)); data = self.rfile.read(n)
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            key = qs.get('p', qs.get('id', ['?']))[0]; STORE[key] = (data, self.headers.get('Content-Type', 'application/octet-stream'))
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            if u.path in ('/_sbget',) or u.path.startswith('/_blob/'):
                key = urllib.parse.parse_qs(u.query).get('p', [''])[0] if u.path == '/_sbget' else u.path[7:]
                if key in STORE:
                    d, t = STORE[key]; self.send_response(200); self.send_header('Content-Type', t); self.send_header('Content-Length', str(len(d))); self.end_headers(); self.wfile.write(d); return
                self.send_response(404); self.end_headers(); return
            return super().do_GET()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Q); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv
s1 = make(DIST, 8770); s2 = make(CLAUDE, 8771)

SBMOCK = r"""
window.supabase = { createClient() {
  const S = window.__SB = { rows: new Map(Object.entries(window.__SBSEED || {})), users: { 'lehrer@test.de': { id: '11111111-2222-3333-4444-555555555555', password: 'geheim123' } },
    session: JSON.parse(localStorage.getItem('mock-session') || 'null'), ls: [], chans: [], t: 0 };
  const now = () => new Date(Date.UTC(2026, 10, 15, 12) + (++S.t) * 1000 + (window.__T0 || 0)).toISOString();
  const auth = {
    async getSession() { return { data: { session: S.session } }; },
    onAuthStateChange(cb) { S.ls.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ email, password }) { const u = S.users[email]; if (!u || u.password !== password) return { data: {}, error: { message: 'Invalid login credentials' } }; S.session = { user: { id: u.id, email } }; localStorage.setItem('mock-session', JSON.stringify(S.session)); S.ls.forEach(l => l('SIGNED_IN', S.session)); return { data: { session: S.session }, error: null }; },
    async signUp({ email, password }) { S.users[email] = { id: crypto.randomUUID(), password }; return { data: { user: { email }, session: null }, error: null }; },
    async signOut() { S.session = null; localStorage.removeItem('mock-session'); S.ls.forEach(l => l('SIGNED_OUT', null)); return { error: null }; },
    async resetPasswordForEmail() { return { error: null }; }, async updateUser() { return { error: null }; }
  };
  class Q { constructor() { this.f = []; } select() { return this; } order(c) { this.o = c; return this; } range(a, b) { this.r = [a, b]; return this; } in(c, a) { this.f.push(x => a.includes(x[c])); return this; } gte(c, v) { this.f.push(x => x[c] >= v); return this; } limit(n) { this.l = n; return this; }
    then(res, rej) { try { let rows = [...S.rows.values()].filter(r => S.session && r.user_id === S.session.user.id); for (const f of this.f) rows = rows.filter(f); if (this.o) rows.sort((a, b) => a[this.o] < b[this.o] ? -1 : a[this.o] > b[this.o] ? 1 : 0); if (this.r) rows = rows.slice(this.r[0], this.r[1] + 1); if (this.l) rows = rows.slice(0, this.l); res({ data: JSON.parse(JSON.stringify(rows)), error: null }); } catch (e) { rej(e); } } }
  const from = () => ({ select: () => new Q(), async upsert(input) { const rows = Array.isArray(input) ? input : [input]; for (const row of rows) { if (!S.session || row.user_id !== S.session.user.id) return { error: { message: 'rls' } }; } for (const row of rows) { const k = row.user_id + '/' + row.key; const old = S.rows.get(k); if (old && row.v < old.v) continue; S.rows.set(k, Object.assign(JSON.parse(JSON.stringify(row)), { updated_at: now() })); } window.__writes = (window.__writes || 0) + 1; window.__batches = (window.__batches || []).concat([rows.length]); setTimeout(() => S.chans.forEach(c => c()), 5); return { error: null }; } });
  const channel = () => { const ch = { on(e, f, cb) { S.chans.push(cb); return ch; }, subscribe() { return ch; } }; return ch; };
  const storage = { from: () => ({
    async upload(path, blob) { await fetch('/_sbup?p=' + encodeURIComponent(path), { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } }); window.__sbUploads = (window.__sbUploads || []).concat([path]); return { data: { path }, error: null }; },
    async createSignedUrl(path) { return { data: { signedUrl: '/_sbget?p=' + encodeURIComponent(path) }, error: null }; },
    async download(path) { const r = await fetch('/_sbget?p=' + encodeURIComponent(path)); return { data: await r.blob(), error: null }; } }) };
  window.__dumpSB = () => Object.fromEntries(S.rows);
  return { auth, from, channel, storage };
} };
"""
CLAUDEMOCK = r"""
(function(){
  const store = new Map(); const ls = new Set(); const notify = () => setTimeout(() => ls.forEach(l => l()), 10);
  const db = { collection(path) { return { path,
    doc(id) { const full = path + '/' + id; return { id, async set(d) { store.set(full, JSON.parse(JSON.stringify(d))); notify(); }, async delete() { store.delete(full); notify(); } }; },
    onSnapshot(next) { const l = () => { const docs = [...store].filter(([p]) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).map(([p, d]) => ({ id: p.slice(path.length + 1), exists: true, data: () => d })); next({ docs, metadata: { fromCache: false } }); }; ls.add(l); setTimeout(l, 60); return () => ls.delete(l); } }; } };
  const assets = { async upload(blob, opts) { const id = 'a' + Math.random().toString(36).slice(2, 14) + 'qwerty'; await fetch('/_up?id=' + id, { method: 'POST', body: blob, headers: { 'Content-Type': (opts && opts.type) || blob.type } }); return { id, url: '/_blob/' + id }; } };
  window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_t' } : n === 'assets' ? assets : null };
})();
"""
PNG = open('/home/claude/tests/valid.png', 'rb').read()
errors = []
def watch(pg, tag):
    pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'{tag} console: {m.text}') if m.type == 'error' and '404' not in m.text and 'favicon' not in m.text else None)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # 1) Alte claude.ai-Version: Karte mit Bild anlegen und exportieren
        cctx = await br.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
        await cctx.add_init_script(CLAUDEMOCK)
        cp = await cctx.new_page(); watch(cp, 'claude')
        await cp.goto('http://127.0.0.1:8771/index.html'); await cp.wait_for_selector('.bitem', timeout=10000); await cp.wait_for_timeout(1500)
        await cp.evaluate("""async () => { const bin = Uint8Array.from(atob('%s'), c => c.charCodeAt(0)); const f = new File([bin], 'tafelbild.png', { type: 'image/png' }); const b = await Files.toBlock(f); b.id = newId(); const c = newCard({ title: 'Tafelbild', blocks: [b] }); setEntity(c); touch(c); window.__cid = c.id; window.__asset = b.asset; }""" % __import__('base64').b64encode(PNG).decode())
        print('claude card asset', await cp.evaluate("window.__asset"))
        async with cp.expect_download() as dl:
            await cp.click('#exportBtn')
        d = await dl.value; exp_path = '/home/claude/tests/out3/export.json'; await d.save_as(exp_path); exp = json.load(open(exp_path))
        print('export has files', list(exp.get('files', {}).keys()), 'cards', len(exp['cards']))
        await cctx.close()

        # 2) Neue Version: Anmeldung
        ctx = await br.new_context(viewport={'width': 1366, 'height': 900})
        await ctx.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
        pg = await ctx.new_page(); watch(pg, 'A')
        await pg.goto('http://127.0.0.1:8770/'); await pg.wait_for_selector('#auth:not([hidden]) .auth-card', timeout=10000)
        print('auth shown', await pg.evaluate("Persist.mode"), await pg.eval_on_selector('#syncText', 'e=>e.textContent'))
        await pg.screenshot(path=f'{OUT}/01_login.png')
        await pg.fill('#authEmail', 'lehrer@test.de'); await pg.fill('#authPw', 'falsch'); await pg.click('.auth-form button[type=submit]'); await pg.wait_for_timeout(200)
        print('wrong pw msg', await pg.eval_on_selector('.auth-msg', 'e=>e.textContent'))
        await pg.click('.auth-links button:has-text("Konto anlegen")'); await pg.fill('#authEmail', 'neu@test.de'); await pg.fill('#authPw', 'sehrgeheim'); await pg.click('.auth-form button[type=submit]'); await pg.wait_for_timeout(200)
        print('signup msg', await pg.eval_on_selector('.auth-msg', 'e=>e.textContent'))
        await pg.fill('#authEmail', 'lehrer@test.de'); await pg.fill('#authPw', 'geheim123'); await pg.click('.auth-form button[type=submit]')
        await pg.wait_for_selector('.bitem', timeout=10000); await pg.wait_for_timeout(1500)
        print('signed in', await pg.evaluate("({mode:Persist.mode, driver:Persist.driver, merged:Persist.merged, cards:S.cards.size, writes:window.__writes||0})"), await pg.eval_on_selector('#syncText', 'e=>e.textContent'), await pg.eval_on_selector('#account', 'e=>e.innerText.replace(/\\n/g," ")'))
        await pg.screenshot(path=f'{OUT}/02_app.png')
        # 3) Import der alten Sicherung mit Dateien
        async with pg.expect_file_chooser() as fc:
            await pg.click('#importBtn')
        ch = await fc.value; await ch.set_files(exp_path); await pg.wait_for_timeout(2500)
        ib = await pg.evaluate("(()=>{const c=[...S.cards.values()].find(c=>c.title==='Tafelbild'); return c && c.blocks.map(b=>({type:b.type, sb:b.sb||null, asset:b.asset||null}))})()")
        print('imported card', ib, 'uploads', await pg.evaluate("window.__sbUploads||[]"))
        cid = await pg.evaluate("[...S.cards.values()].find(c=>c.title==='Tafelbild').id")
        await pg.evaluate(f"Editor.open('{cid}')"); await pg.wait_for_timeout(800)
        print('image loads in new app', await pg.evaluate("[...document.querySelectorAll('#editor .blk-img img')].map(i=>i.naturalWidth)"))
        # YouTube wird hier eingebettet
        await pg.evaluate(f"(()=>{{const c=S.cards.get('{cid}'); c.blocks.push({{id:newId(),type:'embed',url:'https://youtu.be/dQw4w9WgXcQ',provider:'youtube',vid:'dQw4w9WgXcQ',title:''}}); touch(c); Editor.render();}})()")
        await pg.wait_for_timeout(300)
        print('youtube iframe', await pg.evaluate("(document.querySelector('#editor .embed iframe')||{}).src || null"))
        await pg.screenshot(path=f'{OUT}/03_imported.png')
        await pg.keyboard.press('Escape')
        # Neues Bild per Upload in Supabase-Speicher
        n0 = len(await pg.evaluate("window.__sbUploads||[]"))
        await pg.evaluate("""async () => { const bin = Uint8Array.from(atob('%s'), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'neu.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }""" % __import__('base64').b64encode(PNG).decode())
        await pg.wait_for_timeout(1500)
        print('paste upload', n0, '->', len(await pg.evaluate("window.__sbUploads||[]")))
        await pg.wait_for_timeout(1500)
        print('sync', await pg.eval_on_selector('#syncText', 'e=>e.textContent'), 'dirty', await pg.evaluate("Persist.dirty.size"))
        dump = await pg.evaluate("window.__dumpSB()")
        print('server rows', len(dump), sorted(set(k.split('/')[1][:2] for k in dump)))
        # 4) Zweites Gerät
        ctx2 = await br.new_context(viewport={'width': 834, 'height': 1112}, has_touch=True, is_mobile=True)
        await ctx2.add_init_script('window.__SBSEED = ' + json.dumps(dump) + '; window.__T0 = 3600000;')
        await ctx2.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
        p2 = await ctx2.new_page(); watch(p2, 'B')
        await p2.goto('http://127.0.0.1:8770/'); await p2.wait_for_selector('#auth:not([hidden]) .auth-card', timeout=10000)
        await p2.fill('#authEmail', 'lehrer@test.de'); await p2.fill('#authPw', 'geheim123'); await p2.click('.auth-form button[type=submit]')
        await p2.wait_for_selector('.bitem', timeout=10000); await p2.wait_for_timeout(1500)
        print('B sees', await p2.evaluate("({cards:S.cards.size, boards:S.boards.size, folders:S.folders.size, tafel:!![...S.cards.values()].find(c=>c.title==='Tafelbild')})"), 'B writes', await p2.evaluate("window.__writes||0"))
        await p2.evaluate(f"Editor.open('{cid}')"); await p2.wait_for_timeout(800)
        print('B image', await p2.evaluate("[...document.querySelectorAll('#editor .blk-img img')].map(i=>i.naturalWidth)"))
        await p2.screenshot(path=f'{OUT}/04_ipad.png')
        # Änderung auf B -> Zeile mit höherer Version
        await p2.evaluate(f"(()=>{{const c=S.cards.get('{cid}'); c.title='Tafelbild (iPad)'; touch(c);}})()"); await p2.wait_for_timeout(1500)
        d2 = await p2.evaluate("window.__dumpSB()")
        print('B wrote title', [v['body']['title'] for k, v in d2.items() if k.endswith('c_' + cid)])
        # 5) Abmelden auf A
        await pg.click('#account button:has-text("Abmelden")'); await pg.wait_for_selector('#auth:not([hidden]) .auth-card', timeout=10000); await pg.wait_for_timeout(500)
        print('after signout', await pg.evaluate("({cards:S.cards.size, mode:Persist.mode})"))
        # 6) Ohne Konto
        ctx3 = await br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        await ctx3.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
        p3 = await ctx3.new_page(); watch(p3, 'C')
        await p3.goto('http://127.0.0.1:8770/'); await p3.wait_for_selector('#auth:not([hidden]) .auth-card', timeout=10000)
        await p3.screenshot(path=f'{OUT}/05_login_iphone.png')
        await p3.click('.auth-links button:has-text("Ohne Konto")'); await p3.wait_for_selector('.bitem', timeout=10000); await p3.wait_for_timeout(500)
        print('local only', await p3.evaluate("({mode:Persist.mode, cards:S.cards.size})"), await p3.eval_on_selector('#syncText', 'e=>e.textContent'))
        await br.close()
    s1.shutdown(); s2.shutdown()
    print('ERRORS', errors or 'none')
asyncio.run(main())
