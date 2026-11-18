import asyncio, os, sys
src = open('/home/claude/tests/test3.py').read(); exec(src.split('errors = []')[0])
from playwright.async_api import async_playwright
OUT = '/home/claude/tests/out5'; os.makedirs(OUT, exist_ok=True); errors = []
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for vp, tag in [({'width': 1366, 'height': 900}, 'mac'), ({'width': 1180, 'height': 820}, 'ipad')]:
            ctx = await br.new_context(viewport=vp, has_touch=(tag=='ipad'))
            await ctx.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
            pg.on('console', lambda m: errors.append(f'{tag} console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
            await pg.goto('http://127.0.0.1:8770/'); await pg.wait_for_selector('#auth:not([hidden]) .auth-card')
            await pg.fill('#authEmail', 'lehrer@test.de'); await pg.fill('#authPw', 'geheim123'); await pg.click('.auth-form button[type=submit]')
            await pg.wait_for_selector('.bitem.bcard', timeout=10000); await pg.wait_for_timeout(800)
            # Karte zusätzlich auf zweites Board legen
            cid = await pg.evaluate("""(()=>{const b=S.boards.get(UI.view.id); const it=b.items.find(i=>i.cardId); const other=[...S.boards.values()].find(x=>x.id!==b.id); other.items.push({cardId:it.cardId,x:40,y:40,w:300,h:null}); touch(other); BV.renderItems(); return it.cardId;})()""")
            print(tag, 'mirror badge', await pg.evaluate(f"(document.querySelector('[data-ref=\"{cid}\"] .mirror')||{{}}).textContent||null"))
            await pg.screenshot(path=f'{OUT}/{tag}_1_board.png')
            box = await pg.locator(f'[data-ref="{cid}"]').bounding_box(); before = (round(box['width']), round(box['height']))
            await pg.dblclick(f'[data-ref="{cid}"] .bc-body', position={'x': 40, 'y': 60}); await pg.wait_for_timeout(500)
            box = await pg.locator(f'[data-ref="{cid}"]').bounding_box()
            z = await pg.evaluate("BV.view().z")
            print(tag, 'editing', await pg.evaluate("BV.editingId"), 'size before', before, 'after', (round(box['width']), round(box['height'])), 'zoom', z)
            # Text auswählen und formatieren
            ok = await pg.evaluate(f"""(()=>{{const f=document.querySelector('[data-ref="{cid}"] [data-field="html"]'); if(!f) return 'nofield'; f.focus(); const p=f.querySelector('p')||f; const r=document.createRange(); r.selectNodeContents(p); const s=getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); return p.textContent.slice(0,40);}})()""")
            await pg.wait_for_timeout(400)
            print(tag, 'selected', ok, 'textbar', await pg.evaluate("!!document.querySelector('.textbar')"))
            await pg.screenshot(path=f'{OUT}/{tag}_2_textbar.png')
            await pg.select_option('.textbar .tb-sel', 'hand'); await pg.wait_for_timeout(200)
            await pg.click('.textbar .tb-size >> text=L'); await pg.wait_for_timeout(200)
            await pg.click('.textbar button[aria-label="Textfarbe und Markierung"]'); await pg.wait_for_timeout(150)
            await pg.click('.textbar button[aria-label="Textfarbe: Blau"]'); await pg.wait_for_timeout(150)
            await pg.click('.textbar button[aria-label="Markierung: Gelb"]'); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{OUT}/{tag}_3_formatted.png')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
            html = await pg.evaluate(f"S.cards.get('{cid}').blocks.filter(b=>b.type==='text').map(b=>b.html).join('')")
            import re
            print(tag, 'classes saved', sorted(set(re.findall(r'class="([^"]+)"', html))))
            box = await pg.locator(f'[data-ref="{cid}"]').bounding_box()
            print(tag, 'textbar after esc', await pg.evaluate("!!document.querySelector('.textbar')"))
            print(tag, 'after edit size', (round(box['width']), round(box['height'])))
            await pg.screenshot(path=f'{OUT}/{tag}_4_after.png')
            # Spiegel-Menü
            await pg.click(f'[data-ref="{cid}"] .mirror'); await pg.wait_for_timeout(300)
            print(tag, 'mirror menu', await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.textContent)"))
            await pg.keyboard.press('Escape')
            await ctx.close()
        await br.close()
    print('ERRORS', errors or 'none')
asyncio.run(main())
