import asyncio, json, os, http.server, threading, base64, io
from playwright.async_api import async_playwright

ROOT = '/home/claude/kartentisch'; OUT = '/home/claude/tests/out2'; os.makedirs(OUT, exist_ok=True)
BLOBS = {}
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); data = self.rfile.read(n)
        bid = self.path.split('id=')[1]; BLOBS[bid] = (data, self.headers.get('Content-Type', 'application/octet-stream'))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def do_GET(self):
        if self.path.startswith('/_blob/'):
            bid = self.path[7:]
            if bid in BLOBS:
                d, t = BLOBS[bid]; self.send_response(200); self.send_header('Content-Type', t); self.send_header('Content-Length', str(len(d))); self.end_headers(); self.wfile.write(d); return
            self.send_response(404); self.end_headers(); return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()

MOCK = r"""
(function(){
  const store = new Map(Object.entries(window.__SEED__ || {})); const ls = new Set();
  const notify = () => setTimeout(() => ls.forEach(l => l()), 10);
  const db = { collection(path) { return { path,
    doc(id) { const full = path + '/' + id; return { id, async set(d) { const j = JSON.stringify(d); if (new TextEncoder().encode(j).length > 262144) throw { code: 'invalid_argument' }; store.set(full, JSON.parse(j)); notify(); }, async delete() { store.delete(full); notify(); } }; },
    onSnapshot(next) { const l = () => { const docs = [...store].filter(([p]) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).map(([p, d]) => ({ id: p.slice(path.length + 1), exists: true, data: () => d })); next({ docs, metadata: { fromCache: false } }); }; ls.add(l); setTimeout(l, 60); return () => ls.delete(l); } }; } };
  const assets = { async upload(blob, opts) { const id = 'a' + Math.random().toString(36).slice(2, 14) + 'xyzxyz'; await fetch('/_upload?id=' + id, { method: 'POST', body: blob, headers: { 'Content-Type': (opts && opts.type) || blob.type } }); window.__uploads = (window.__uploads || []).concat([{ id, type: opts && opts.type, size: blob.size }]); return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: opts && opts.type }; } };
  window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_t' } : n === 'assets' ? assets : null };
  window.__dump = () => Object.fromEntries(store);
})();
"""
PNG = open('/home/claude/tests/valid.png','rb').read()
errors = []
def watch(pg, tag):
    pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'{tag} console: {m.text}') if m.type == 'error' and 'favicon' not in m.text and '404' not in m.text else None)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await br.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.add_init_script(MOCK)
        pg = await ctx.new_page(); watch(pg, 'A')
        await pg.goto('http://127.0.0.1:8766/index.html'); await pg.wait_for_selector('.bitem', timeout=10000); await pg.wait_for_timeout(1200)
        print('mode', await pg.evaluate("Persist.mode"), 'assets', await pg.evaluate("!!Files.assets"), 'host claude', await pg.evaluate("HOST.claude"))
        vp = await (await pg.query_selector('#viewport')).bounding_box()
        # --- Neue Karte, "/"-Menü, To-do ---
        ex, ey = vp['x'] + vp['width'] * 0.45, vp['y'] + vp['height'] * 0.86
        await pg.mouse.dblclick(ex, ey); await pg.wait_for_timeout(200)
        await pg.keyboard.type('Bausteine-Test'); await pg.keyboard.press('Enter')
        await pg.keyboard.type('/'); await pg.wait_for_timeout(100)
        print('slash menu open', await pg.evaluate("!!Slash.el"), await pg.evaluate("Slash.items.length"))
        await pg.keyboard.type('todo'); await pg.wait_for_timeout(100)
        print('slash filtered', await pg.evaluate("Slash.items.map(i=>i.k)"))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
        await pg.keyboard.type('Erste Aufgabe'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
        await pg.keyboard.type('Zweite Aufgabe'); await pg.wait_for_timeout(600)
        cid = await pg.evaluate("BV.editingId")
        print('blocks', await pg.evaluate(f"S.cards.get('{cid}').blocks.map(b=>b.type+(b.items?':'+b.items.map(i=>htmlToText(i.html)).join('|'):''))"))
        # Kürzel im Textblock nach dem To-do
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
        print('left todo, focus in', await pg.evaluate("document.activeElement.className"), await pg.evaluate(f"S.cards.get('{cid}').blocks.map(b=>b.type+(b.items?':'+b.items.length:''))"))
        await pg.keyboard.type('# Überschrift'); await pg.keyboard.press('Enter'); await pg.keyboard.type('- Punkt eins'); await pg.wait_for_timeout(100)
        await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('>> '); await pg.wait_for_timeout(250)
        await pg.keyboard.type('Lösung'); await pg.wait_for_timeout(100)
        body = await pg.query_selector(f'.bitem[data-ref="{cid}"] .tgl-body'); await body.click(); await pg.keyboard.type('Geheime Antwort'); await pg.wait_for_timeout(600)
        print('after shortcuts', await pg.evaluate(f"S.cards.get('{cid}').blocks.map(b=>b.type==='text'?'text:'+b.html.slice(0,60):b.type)"))
        # [[ Verlinkung
        last = await pg.query_selector_all(f'.bitem[data-ref="{cid}"] .blk-text .ie-text'); await last[-1].click(); await pg.keyboard.press('End')
        await pg.keyboard.type('Siehe [['); await pg.wait_for_selector('.modal .search'); await pg.wait_for_timeout(150)
        await pg.keyboard.type('Handschrift'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(700)
        hand = await pg.evaluate("[...S.cards.values()].find(c=>c.title==='Handschrift').id")
        print('link inserted', await pg.evaluate(f"cardHtmlAll(S.cards.get('{cid}')).includes('data-card=\"{hand}\"')"), 'backlinks', await pg.evaluate(f"backlinksOf('{hand}').map(c=>c.title)"))
        await pg.screenshot(path=f'{OUT}/01_inline_blocks.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # --- Bild über "/"-Menü im Panel (Upload über Mock) ---
        await pg.evaluate(f"Editor.open('{cid}')"); await pg.wait_for_timeout(300)
        t = await pg.query_selector_all('#editor .ed-text'); await t[-1].click(); await pg.keyboard.press('End'); await pg.keyboard.press('Enter')
        async with pg.expect_file_chooser() as fc:
            await pg.keyboard.type('/bild'); await pg.wait_for_timeout(100); await pg.keyboard.press('Enter')
        ch = await fc.value; await ch.set_files(files=[{'name': 'foto.png', 'mimeType': 'image/png', 'buffer': PNG}])
        await pg.wait_for_timeout(1000)
        print('image block', await pg.evaluate(f"S.cards.get('{cid}').blocks.filter(b=>b.type==='image').map(b=>({{asset:!!b.asset, src:!!b.src}}))"), 'uploads', await pg.evaluate("(window.__uploads||[]).map(u=>u.type)"))
        print('img loaded', await pg.evaluate("[...document.querySelectorAll('#editor .blk-img img')].map(i=>i.naturalWidth)"))
        # Video-Link über Knopf
        await pg.click('#editor .ed-add button:has-text("Link / Video")'); await pg.wait_for_selector('.modal .m-input'); await pg.wait_for_timeout(150)
        await pg.keyboard.type('https://youtu.be/dQw4w9WgXcQ'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        print('embed', await pg.evaluate(f"S.cards.get('{cid}').blocks.filter(b=>b.type==='embed').map(b=>b.provider+':'+b.vid)"), 'iframe in panel', await pg.evaluate("!!document.querySelector('#editor .embed iframe')"), 'tile', await pg.evaluate("!!document.querySelector('#editor .embed-tile')"))
        # PDF-Datei
        async with pg.expect_file_chooser() as fc:
            await pg.click('#editor .ed-add button:has-text("Bild / Datei")')
        ch = await fc.value; await ch.set_files(files=[{'name': 'Arbeitsblatt.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 test'}, {'name': 'Notizen.docx', 'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'buffer': b'PK test'}])
        await pg.wait_for_timeout(1200)
        print('files', await pg.evaluate(f"S.cards.get('{cid}').blocks.filter(b=>b.type==='file').map(b=>b.name+':'+(b.asset?'asset':b.local?'local':'?'))"))
        print('meta backlinks shown', await pg.evaluate("document.querySelector('#editor .ed-meta').innerText.slice(0,80)"))
        await pg.screenshot(path=f'{OUT}/02_panel.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # Block löschen + Undo im Panel
        await pg.evaluate(f"Editor.open('{cid}')"); await pg.wait_for_timeout(200)
        n0 = await pg.evaluate(f"S.cards.get('{cid}').blocks.length")
        await pg.hover('#editor .blk-divider, #editor .blk-todo'); await pg.click('#editor .blk-todo .blk-ctrl button[aria-label="Baustein löschen"]'); await pg.wait_for_timeout(200)
        n1 = await pg.evaluate(f"S.cards.get('{cid}').blocks.length")
        await pg.mouse.click(vp['x'] + 400, vp['y'] + 20); await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(300)
        print('block delete/undo', n0, n1, await pg.evaluate(f"S.cards.get('{cid}').blocks.length"))
        await pg.keyboard.press('Escape')
        # --- Einfügen: URL und Bild auf das Board ---
        await pg.mouse.click(vp['x'] + 150, vp['y'] + vp['height'] - 40)
        n = await pg.evaluate("S.cards.size")
        await pg.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'https://vimeo.com/76979871'); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }""")
        await pg.wait_for_timeout(300)
        await pg.evaluate("""async () => { const b64 = '%s'; const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const f = new File([bin], 'paste.png', { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(f); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }""" % base64.b64encode(PNG).decode())
        await pg.wait_for_timeout(1000)
        print('paste cards', n, '->', await pg.evaluate("S.cards.size"), await pg.evaluate("[...S.cards.values()].slice(-2).map(c=>c.blocks.map(b=>b.type).join(','))"))
        # --- Undo: Karte vom Board entfernen ---
        b0 = await pg.evaluate("BV.board().items.length")
        await pg.keyboard.press('Delete'); b1 = await pg.evaluate("BV.board().items.length")
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200); b2 = await pg.evaluate("BV.board().items.length")
        await pg.keyboard.press('Control+Shift+z'); await pg.wait_for_timeout(200); b3 = await pg.evaluate("BV.board().items.length")
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200)
        print('remove/undo/redo', b0, b1, b2, b3)
        # --- Auswahlrahmen + Gruppe verschieben + Abschnitt ---
        await pg.click('button[aria-label="Alles zeigen"]'); await pg.wait_for_timeout(300)
        r1 = await pg.evaluate("(()=>{const ids=BV.board().items.filter(i=>i.cardId).slice(0,2).map(i=>i.cardId);const rs=ids.map(id=>document.querySelector(`.bitem[data-ref=\"${id}\"]`).getBoundingClientRect());return {ids, x0:Math.min(...rs.map(r=>r.left))-10, y0:Math.min(...rs.map(r=>r.top))-10, x1:Math.max(...rs.map(r=>r.right))+10, y1:Math.max(...rs.map(r=>r.bottom))+10}})()")
        await pg.mouse.move(r1['x0'], r1['y0']); await pg.mouse.down(); await pg.mouse.move(r1['x1'], r1['y1'], steps=8); await pg.mouse.up()
        print('marquee selection', await pg.evaluate("UI.sel && UI.sel.type"), await pg.evaluate("BV.selIds().length"))
        await pg.screenshot(path=f'{OUT}/03_marquee.png')
        pos0 = await pg.evaluate("BV.selIds().map(id=>[BV.itemOf(id).x,BV.itemOf(id).y])")
        first = await pg.evaluate("BV.selIds()[0]"); fb = await (await pg.query_selector(f'.bitem[data-ref="{first}"]')).bounding_box()
        await pg.mouse.move(fb['x'] + 40, fb['y'] + 20); await pg.mouse.down(); await pg.mouse.move(fb['x'] + 100, fb['y'] + 60, steps=6); await pg.mouse.up()
        pos1 = await pg.evaluate("BV.selIds().map(id=>[BV.itemOf(id).x,BV.itemOf(id).y])")
        print('group move', pos0, '->', pos1)
        await pg.keyboard.press('s'); await pg.wait_for_selector('.modal .m-input'); await pg.wait_for_timeout(150)
        await pg.keyboard.press('Control+a'); await pg.keyboard.type('Funktionen'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        sec = await pg.evaluate("BV.board().sections.map(s=>[s.title,s.x,s.y,s.w,s.h])"); print('sections', sec)
        tb = await (await pg.query_selector('.bsec-title')).bounding_box()
        before = await pg.evaluate("BV.board().items.filter(i=>i.cardId).slice(0,2).map(i=>i.x)")
        await pg.mouse.move(tb['x'] + 20, tb['y'] + 10); await pg.mouse.down(); await pg.mouse.move(tb['x'] + 120, tb['y'] + 10, steps=6); await pg.mouse.up()
        after = await pg.evaluate("BV.board().items.filter(i=>i.cardId).slice(0,2).map(i=>i.x)")
        print('section drag moves contents', before, '->', after)
        await pg.screenshot(path=f'{OUT}/04_section.png')
        # --- Suche ---
        await pg.keyboard.press('Control+k'); await pg.wait_for_selector('.search-modal'); await pg.keyboard.type('Geheime'); await pg.wait_for_timeout(150)
        print('search debug', await pg.evaluate("[...S.cards.values()].filter(c=>cardText(c).toLowerCase().includes('geheime')).map(c=>[c.id, c.title, c.blocks.map(b=>b.type).join(',')])"))
        print('search rows', await pg.evaluate("[...document.querySelectorAll('.search-modal .pick-row b')].map(b=>b.textContent)"))
        await pg.screenshot(path=f'{OUT}/05_search.png')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('search opened card', await pg.evaluate("Editor.cardId && Editor.card().title"))
        await pg.keyboard.press('Escape')
        # --- Präsentation mit Toggle ---
        await pg.evaluate(f"(()=>{{const p=newPres('Test'); p.cardIds=['{cid}']; setEntity(p); touch(p); Presenter.start(p.id,0);}})()"); await pg.wait_for_timeout(500)
        print('toggle body hidden', await pg.evaluate("!document.querySelector('#present .tgl.open')"))
        await pg.click('#present .tgl-head'); await pg.wait_for_timeout(300)
        print('toggle revealed', await pg.evaluate("!!document.querySelector('#present .tgl.open')"), 'still slide', await pg.evaluate("Presenter.idx"))
        await pg.screenshot(path=f'{OUT}/06_present.png')
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(1500)
        dump = await pg.evaluate("window.__dump()")
        # --- Zweites Gerät ---
        ctx2 = await br.new_context(viewport={'width': 1180, 'height': 820})
        await ctx2.add_init_script('window.__SEED__ = ' + json.dumps(dump) + ';' + MOCK)
        p2 = await ctx2.new_page(); watch(p2, 'B')
        await p2.goto('http://127.0.0.1:8766/index.html'); await p2.wait_for_selector('.bitem', timeout=10000); await p2.wait_for_timeout(1200)
        c2 = await p2.evaluate(f"(()=>{{const c=S.cards.get('{cid}'); return c && c.blocks.map(b=>b.type)}})()")
        print('B card blocks', c2, 'sections', await p2.evaluate("[...S.boards.values()].map(b=>b.sections.length)"))
        await p2.evaluate(f"Editor.open('{cid}')"); await p2.wait_for_timeout(800)
        print('B image loaded', await p2.evaluate("[...document.querySelectorAll('#editor .blk-img img')].map(i=>i.naturalWidth)"))
        await p2.screenshot(path=f'{OUT}/07_device_b.png')
        await br.close()
    srv.shutdown()
    print('ERRORS', errors or 'none')
asyncio.run(main())
