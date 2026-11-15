import asyncio, json, os, time, sys
sys.path.insert(0, '/home/claude/tests')
import importlib.util
spec = importlib.util.spec_from_file_location('t3', '/home/claude/tests/test3.py')
src = open('/home/claude/tests/test3.py').read()
# nur Server + Mocks aus test3 übernehmen
pre = src.split('errors = []')[0]
exec(pre)
from playwright.async_api import async_playwright
HEP = '/mnt/user-data/uploads/Heptabase-Data-Backup-2026-11-15T20-25-13-310Z/All-Data.json'
OUT = '/home/claude/tests/out4'; os.makedirs(OUT, exist_ok=True)
errors = []
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await br.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.route('**/supabase-2.118.0.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SBMOCK))
        png = open('/home/claude/tests/valid.png','rb').read()
        hits = {'n': 0}
        async def media(route):
            hits['n'] += 1
            if hits['n'] % 7 == 0: await route.fulfill(status=403, body='no')
            else: await route.fulfill(status=200, content_type='image/png', body=png, headers={'Access-Control-Allow-Origin': '*'})
        await ctx.route('https://media.heptabase.com/**', media)
        await ctx.route('https://i.imgur.com/**', media)
        await ctx.route(lambda u: u.startswith('https://') and 'media.heptabase' not in u and 'imgur' not in u, lambda r: r.fulfill(status=404, body=''))
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' and '404' not in m.text and '403' not in m.text and 'Failed to load resource' not in m.text else None)
        await pg.goto('http://127.0.0.1:8770/'); await pg.wait_for_selector('#auth:not([hidden]) .auth-card', timeout=10000)
        await pg.fill('#authEmail', 'lehrer@test.de'); await pg.fill('#authPw', 'geheim123'); await pg.click('.auth-form button[type=submit]')
        await pg.wait_for_selector('.bitem', timeout=10000); await pg.wait_for_timeout(1200)
        t0 = time.time()
        async with pg.expect_file_chooser() as fc:
            await pg.click('#importBtn')
        ch = await fc.value; await ch.set_files(HEP)
        await pg.wait_for_selector('.modal', timeout=20000)
        print('dialog', (await pg.inner_text('.modal'))[:600].replace('\n', ' | '), 'after', round(time.time()-t0,1), 's')
        await pg.screenshot(path=f'{OUT}/01_confirm.png')
        await pg.click('.modal button.primary, .modal .btn.primary'); t1 = time.time()
        await pg.wait_for_timeout(3000)
        st = await pg.evaluate("({cards:S.cards.size, boards:S.boards.size, folders:S.folders.size, view:UI.view, dirty:Persist.dirty.size})")
        print('after import', st, round(time.time()-t1,1),'s')
        await pg.screenshot(path=f'{OUT}/02_board.png')
        # warten bis Bilder + Sync durch
        for i in range(120):
            s = await pg.evaluate("({running:HepImages.running, dirty:Persist.dirty.size, prog:(document.querySelector('.hep-progress')||{}).textContent||''})")
            if not s['running'] and s['dirty'] == 0 and i > 3: break
            if i % 10 == 0: print('  ', s)
            await pg.wait_for_timeout(1000)
        print('final', await pg.evaluate("({dirty:Persist.dirty.size, writes:window.__writes, uploads:(window.__sbUploads||[]).length, rows:Object.keys(window.__dumpSB()).length, sync:document.querySelector('#syncText').textContent})"))
        stats = await pg.evaluate("""(()=>{let url=0,sb=0,ref=0; for(const c of S.cards.values()) for(const b of c.blocks) if(b.type==='image'){ if(b.sb) sb++; else if(b.url) url++; else if(b.ref) ref++; } return {url,sb,ref, colors:[...S.cards.values()].reduce((m,c)=>(m[c.color]=(m[c.color]||0)+1,m),{})};})()""")
        print('images', stats)
        await pg.evaluate("navigate({type:'board', id:'he490e40c061b4f22980ae3e28a316546'})"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/03_ideabox.png')
        bid = await pg.evaluate("[...S.boards.values()].filter(b=>b.arrows.length&&b.sections.length).sort((a,b)=>b.arrows.length-a.arrows.length)[0].id")
        await pg.evaluate(f"navigate({{type:'board', id:'{bid}'}})"); await pg.wait_for_timeout(2000)
        print('arrow board', await pg.evaluate(f"(()=>{{const b=S.boards.get('{bid}'); return {{name:b.name, items:b.items.length, arrows:b.arrows.length, sections:b.sections.length}}}})()"))
        await pg.screenshot(path=f'{OUT}/04_arrows.png')
        cid = await pg.evaluate("[...S.cards.values()].find(c=>c.blocks.some(b=>b.type==='todo')&&c.blocks.some(b=>b.type==='text'&&/<table|<a href/.test(b.html))||c.blocks.some(b=>b.type==='text'&&/<table/.test(b.html))).id")
        await pg.evaluate(f"Editor.open('{cid}')"); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{OUT}/05_card.png')
        await br.close()
    print('ERRORS', errors[:10] or 'none')
asyncio.run(main())
