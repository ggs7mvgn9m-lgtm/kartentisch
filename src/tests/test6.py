import asyncio, os, math
src = open('/home/claude/tests/test3.py').read(); exec(src.split('errors = []')[0])
from playwright.async_api import async_playwright
OUT = '/home/claude/tests/out6'; os.makedirs(OUT, exist_ok=True); errors = []
async def stroke(pg, pts, hold=0):
    await pg.mouse.move(*pts[0]); await pg.mouse.down()
    for p in pts[1:]: await pg.mouse.move(*p, steps=2)
    if hold: await pg.wait_for_timeout(hold)
    await pg.mouse.up(); await pg.wait_for_timeout(150)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await br.new_context(viewport={'width': 1366, 'height': 900})
        await ctx.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await pg.goto('http://127.0.0.1:8770/'); await pg.wait_for_selector('#auth:not([hidden]) .auth-card')
        await pg.fill('#authEmail', 'lehrer@test.de'); await pg.fill('#authPw', 'geheim123'); await pg.click('.auth-form button[type=submit]')
        await pg.wait_for_selector('.bitem.bcard', timeout=10000); await pg.wait_for_timeout(600)
        # leeres Board
        await pg.evaluate("(()=>{const b=newBoard({name:'Stifttest'}); setEntity(b); touch(b); navigate({type:'board', id:b.id});})()"); await pg.wait_for_timeout(600)
        await pg.evaluate("BV.setTool('pen')"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{OUT}/1_pen_flyout.png')
        n = lambda: pg.evaluate("S.boards.get(UI.view.id).ink.length")
        for kind, y in [('f', 200), ('b', 260), ('p', 320)]:
            await pg.evaluate(f"UI.ink.penKind='{kind}'; UI.ink.shapes=false")
            await stroke(pg, [(500 + i * 12, y + 10 * math.sin(i / 2)) for i in range(30)])
        print('kinds', await pg.evaluate("S.boards.get(UI.view.id).ink.map(s=>s.k||'f')"))
        # Form: Kreis mit Halten
        await pg.evaluate("UI.ink.penKind='f'; UI.ink.shapes=true")
        circ = [(800 + 80 * math.cos(a / 20 * math.pi) + (5 if a % 3 == 0 else -3), 300 + 70 * math.sin(a / 20 * math.pi)) for a in range(0, 41)]
        await stroke(pg, circ, hold=800)
        st = await pg.evaluate("(()=>{const s=S.boards.get(UI.view.id).ink.at(-1); const n=s.pts.length/3; let cx=0,cy=0; for(let i=0;i<n;i++){cx+=s.pts[i*3];cy+=s.pts[i*3+1];} cx/=n;cy/=n; const r=[]; for(let i=0;i<n;i++) r.push(Math.hypot(s.pts[i*3]-cx,s.pts[i*3+1]-cy)); const m=r.reduce((a,b)=>a+b)/n; return {n, sd: Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/n)/m};})()")
        print('circle snapped', st)
        # Linie ohne Halten bleibt krumm, mit Halten gerade
        await stroke(pg, [(450 + i * 10, 450 + (6 if i % 2 else 0)) for i in range(30)], hold=800)
        print('line points', await pg.evaluate("(()=>{const s=S.boards.get(UI.view.id).ink.at(-1); let m=0; for(let i=0;i<s.pts.length;i+=3) m=Math.max(m, Math.abs(s.pts[i+1]-s.pts[1])); return m;})()"))
        # Kritzeln über die erste Welle
        before = await n()
        await pg.evaluate("UI.ink.shapes=false")
        await stroke(pg, [(520 + (i % 2) * 60 + i * 3, 195 + (i % 4) * 3) for i in range(16)])
        print('scribble', before, '->', await n())
        await pg.screenshot(path=f'{OUT}/2_after_scribble.png')
        # Teil-Radierer
        await pg.evaluate("UI.ink.shapes=false; UI.ink.penKind='b'")
        await stroke(pg, [(500 + i * 10, 600) for i in range(40)])
        cnt = await n()
        await pg.evaluate("UI.ink.eraserMode='part'; BV.setTool('eraser')"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{OUT}/3_eraser_flyout.png')
        await stroke(pg, [(690, 570 + i * 4) for i in range(16)])
        print('part erase', cnt, '->', await n())
        await pg.evaluate("Undo.undo()"); print('after undo', await n())
        await pg.evaluate("Undo.redo()"); print('after redo', await n())
        # eigene Farbe + Speichern/Laden
        await pg.evaluate("UI.ink.penColor='#12a4c8'; BV.setTool('pen')")
        await stroke(pg, [(500 + i * 10, 700) for i in range(20)])
        rt = await pg.evaluate("(()=>{const b=S.boards.get(UI.view.id); const e=deser(JSON.parse(JSON.stringify(ser(b)))); return e.ink.map(s=>[s.c,s.k||'f']).slice(-3);})()")
        print('roundtrip', rt)
        await pg.screenshot(path=f'{OUT}/4_board.png')
        # Papier in Karte
        cid = await pg.evaluate("(()=>{const c=newCard({title:'Papier', blocks:[{id:newId(),type:'ink',h:300,strokes:[]}]}); setEntity(c); touch(c); Editor.open(c.id); return c.id;})()")
        await pg.wait_for_timeout(600)
        await pg.hover('#editor [aria-label="Handschrift-Feld"]'); await pg.click('#editor .blk-ctrl button[aria-label="Hintergrund und Papier"]', force=True); await pg.wait_for_timeout(200)
        print('paper menu', await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.textContent.trim())"))
        await pg.click('.menu button:has-text("Kariert")'); await pg.wait_for_timeout(300)
        await pg.click('#editor .blk-ctrl button[aria-label="Hintergrund und Papier"]', force=True); await pg.wait_for_timeout(200)
        await pg.click('.menu button:has-text("Creme")'); await pg.wait_for_timeout(300)
        print('ink block', await pg.evaluate(f"(()=>{{const b=S.cards.get('{cid}').blocks[0]; return [b.bg,b.paper, document.querySelector('#editor [aria-label=Handschrift-Feld]').className];}})()"))
        await pg.evaluate("UI.editorTool='pen'; UI.ink.penKind='p'; Editor.renderInkTools()")
        bx = await pg.locator('#editor [aria-label="Handschrift-Feld"]').bounding_box()
        await stroke(pg, [(bx['x'] + 40 + i * 8, bx['y'] + 80 + 20 * math.sin(i / 3)) for i in range(30)])
        await pg.screenshot(path=f'{OUT}/5_card_paper.png')
        await br.close()
    print('ERRORS', errors or 'none')
asyncio.run(main())
