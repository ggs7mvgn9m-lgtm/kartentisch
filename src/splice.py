import sys
src, dst = sys.argv[1], sys.argv[2]
s=open(src,encoding='utf-8').read()
P='/home/claude/kartentisch/parts/'
def read(f): return open(P+f,encoding='utf-8').read()
def between(start, end, new):
    global s
    assert s.count(start)==1, start
    i=s.index(start); j=s.index(end, i)
    s=s[:i]+new+s[j:]
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (old[:70], s.count(old))
    s=s.replace(old,new)
between('<style>','</style>','<style>'+read('style.css')+read('add.css'))
rep('''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap" rel="stylesheet">
''','')
between('<div id="app" class="app">','<div id="present"', read('shell.html'))
between('// ---------- Werkzeugleiste (Stift','// ---------- Zeichenvorgang', read('misc.js'))
between('// ---------- Board-Ansicht ----------','// ---------- Kartenbibliothek ----------', read('bv.js')+'\n')
between('// ---------- Seitenleiste & Navigation ----------','// ---------- Export / Import ----------', read('sidebar.js'))
between('function seedExamples() {','function simplifyStroke', read('seed_boot.js'))
rep("const S = { cards: new Map(), boards: new Map(), pres: new Map(), tomb: new Map() };",
    "const S = { cards: new Map(), boards: new Map(), pres: new Map(), folders: new Map(), tomb: new Map() };")
rep("const keyOf = e => ({ card: 'c_', board: 'b_', pres: 'p_' }[e.kind]) + e.id;",
    "const keyOf = e => ({ card: 'c_', board: 'b_', pres: 'p_', folder: 'f_' }[e.kind]) + e.id;")
rep("function mapForKey(key) { return { c_: S.cards, b_: S.boards, p_: S.pres }[key.slice(0, 2)]; }",
    "function mapForKey(key) { return { c_: S.cards, b_: S.boards, p_: S.pres, f_: S.folders }[key.slice(0, 2)]; }")
rep("function newBoard(name) { return { kind: 'board', id: newId(), name: name || 'Neues Board', created: stamp(), v: stamp(), items: [], arrows: [], ink: [] }; }",
    "function newBoard(name, o = {}) { return { kind: 'board', id: newId(), name: name || 'Neues Whiteboard', created: stamp(), v: stamp(), items: [], arrows: [], ink: [], parentId: o.parentId || null, folderId: o.folderId || null }; }\nfunction newFolder(name) { return { kind: 'folder', id: newId(), name: name || 'Ordner', created: stamp(), v: stamp() }; }")
rep("""    kind: 'board', id: e.id, name: e.name, created: e.created, v: e.v,
    items: e.items.map(i => ({ cardId: i.cardId, x: r2(i.x), y: r2(i.y), w: r2(i.w), h: i.h ? r2(i.h) : null })),
    arrows: e.arrows.map(a => ({ id: a.id, from: a.from, to: a.to })),""",
"""    kind: 'board', id: e.id, name: e.name, created: e.created, v: e.v, parentId: e.parentId || null, folderId: e.folderId || null,
    items: e.items.map(i => Object.assign(i.boardId ? { boardId: i.boardId } : { cardId: i.cardId }, { x: r2(i.x), y: r2(i.y), w: r2(i.w), h: i.h ? r2(i.h) : null })),
    arrows: e.arrows.map(a => ({ id: a.id, from: a.from, to: a.to, head: !!a.head })),""")
rep("""  return { kind: 'pres', id: e.id, name: e.name, created: e.created, v: e.v, cardIds: e.cardIds.slice() };
}""","""  if (e.kind === 'folder') return { kind: 'folder', id: e.id, name: e.name, created: e.created, v: e.v };
  return { kind: 'pres', id: e.id, name: e.name, created: e.created, v: e.v, cardIds: e.cardIds.slice() };
}""")
rep("""    return { kind: 'board', ...base, name: str(o.name, 200) || 'Board',
      items: (Array.isArray(o.items) ? o.items : []).filter(i => i && isId(i.cardId)).map(i => ({ cardId: i.cardId, x: num(i.x, 0), y: num(i.y, 0), w: clamp(num(i.w, 300), 160, 1400), h: i.h ? clamp(num(i.h, 200), 80, 4000) : null })),
      arrows: (Array.isArray(o.arrows) ? o.arrows : []).filter(a => a && isId(a.from) && isId(a.to)).map(a => ({ id: isId(a.id) ? a.id : newId(), from: a.from, to: a.to })),""",
"""    return { kind: 'board', ...base, name: str(o.name, 200) || 'Whiteboard',
      parentId: isId(o.parentId) && o.parentId !== o.id ? o.parentId : null, folderId: isId(o.folderId) ? o.folderId : null,
      items: (Array.isArray(o.items) ? o.items : []).filter(i => i && (isId(i.cardId) || (isId(i.boardId) && i.boardId !== o.id))).map(i => Object.assign(isId(i.cardId) ? { cardId: i.cardId } : { boardId: i.boardId }, { x: num(i.x, 0), y: num(i.y, 0), w: clamp(num(i.w, 300), 160, 1400), h: i.h ? clamp(num(i.h, 200), 80, 4000) : null })),
      arrows: (Array.isArray(o.arrows) ? o.arrows : []).filter(a => a && isId(a.from) && isId(a.to)).map(a => ({ id: isId(a.id) ? a.id : newId(), from: a.from, to: a.to, head: !!a.head })),""")
rep("""  if (o.kind === 'pres') return""","""  if (o.kind === 'folder') return { kind: 'folder', ...base, name: str(o.name, 200) || 'Ordner' };
  if (o.kind === 'pres') return""")
rep("/^[cbp]_/","/^[cbpf]_/",2)
rep("const all = [...S.cards.values(), ...S.boards.values(), ...S.pres.values()];","const all = [...S.cards.values(), ...S.boards.values(), ...S.pres.values(), ...S.folders.values()];")
rep("function isEmptyStore() { return !S.cards.size && !S.boards.size && !S.pres.size && !S.tomb.size; }","function isEmptyStore() { return !S.cards.size && !S.boards.size && !S.pres.size && !S.folders.size && !S.tomb.size; }")
rep("const sortedPres = () => [...S.pres.values()].sort((a, b) => a.created - b.created);",
    "const sortedPres = () => [...S.pres.values()].sort((a, b) => a.created - b.created);\nconst sortedFolders = () => [...S.folders.values()].sort((a, b) => a.created - b.created);")
rep("fingerDraw: isPhone, views: {}, presTheme: 'light', narrowSidebar: false","fingerDraw: isPhone, views: {}, presTheme: 'light', collapsed: [], sbCollapsed: false")
rep("    if (o.presTheme === 'dark' || o.presTheme === 'light') UI.presTheme = o.presTheme;",
    "    if (o.presTheme === 'dark' || o.presTheme === 'light') UI.presTheme = o.presTheme;\n    if (Array.isArray(o.collapsed)) UI.collapsed = o.collapsed.filter(x => typeof x === 'string');\n    if (typeof o.sbCollapsed === 'boolean') UI.sbCollapsed = o.sbCollapsed;\n    if (UI.tool === 'connect') UI.tool = 'select';")
rep("tool: UI.tool, editorTool: UI.editorTool, presTheme: UI.presTheme }","tool: UI.tool, editorTool: UI.editorTool, presTheme: UI.presTheme, collapsed: UI.collapsed, sbCollapsed: UI.sbCollapsed }")
rep("""    if (!S.cards.has(cardId)) return;
    this.cardId = cardId; this.activeBlock = null;""","""    if (!S.cards.has(cardId)) return;
    if (BV.editingId) BV.endInlineEdit(true);
    this.cardId = cardId; this.activeBlock = null;""")
rep("row('Liegt auf Boards', bs,","row('Liegt auf Whiteboards', bs,")
rep("text: 'Auf das aktuelle Board legen'","text: 'Auf das aktuelle Whiteboard legen'")
rep("inkPalette('editor')","inkPalette()")
rep("""  const c = S.cards.get(cardId); if (!c) return;
  const nb = boardsWithCard(cardId).length""","""  const c = S.cards.get(cardId); if (!c) return;
  if (BV.editingId === cardId) BV.endInlineEdit(true);
  const nb = boardsWithCard(cardId).length""")
rep("? (nb === 1 ? '1 Board' : nb + ' Boards')","? (nb === 1 ? '1 Whiteboard' : nb + ' Whiteboards')")
rep("boards: [...S.boards.values()].map(ser), presentations: [...S.pres.values()].map(ser) };",
    "boards: [...S.boards.values()].map(ser), presentations: [...S.pres.values()].map(ser), folders: [...S.folders.values()].map(ser) };")
rep("for (const raw of [...(o.cards || []), ...(o.boards || []), ...(o.presentations || [])]) {",
    "for (const raw of [...(o.folders || []), ...(o.cards || []), ...(o.boards || []), ...(o.presentations || [])]) {")
rep("boards ? h('span', { class: 'chip', text: boards === 1 ? 'auf 1 Board' : `auf ${boards} Boards` }) : h('span', { class: 'chip lone', text: 'auf keinem Board' }),",
    "boards ? h('span', { class: 'chip', text: boards === 1 ? 'auf 1 Whiteboard' : `auf ${boards} Whiteboards` }) : h('span', { class: 'chip lone', text: 'auf keinem Whiteboard' }),")
rep("text: 'Noch keine Karten. Füge Karten aus der Bibliothek hinzu oder wähle auf einem Board „Zur Präsentation“.'",
    "text: 'Noch keine Karten. Füge Karten aus der Bibliothek hinzu oder wähle auf einem Whiteboard „Zur Präsentation“.'")
# Eingabedialog
rep("function pickCards({ title, multi, exclude, okLabel }) {","""function promptDialog(title, value, okLabel, placeholder) {
  return modal((box, done) => {
    const inp = h('input', { class: 'm-input', type: 'text', value: value || '', placeholder: placeholder || '', maxlength: '120', 'aria-label': title, 'data-autofocus': true });
    const ok = () => { const v = inp.value.trim(); done(v || null); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(); } });
    box.append(h('h2', { text: title }), inp, h('div', { class: 'm-foot' }, h('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => done(null) }), h('button', { class: 'btn primary', type: 'button', text: okLabel, onclick: ok })));
    setTimeout(() => inp.select(), 30);
  });
}
function pickCards({ title, multi, exclude, okLabel }) {""")
between('// ---------- Tastatur ----------','// ---------- Start ----------','''// ---------- Tastatur ----------
document.addEventListener('keydown', e => {
  if ($('#modalRoot').firstChild) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  if (Presenter.active()) { Presenter.onKey(e); return; }
  if (e.key === 'Escape' && BV.editingId && !Slash.el) { e.preventDefault(); BV.endInlineEdit(); return; }
  const ae = document.activeElement; const typing = ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
  if (e.key === 'Escape' && Editor.cardId) { if (typing) ae.blur(); Editor.close(); e.preventDefault(); return; }
  if (typing) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) Undo.redo(); else Undo.undo(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); Undo.redo(); return; }
  if (e.key === ' ' && UI.view && UI.view.type === 'board' && BV.root) { if (!BV.spaceDown) { BV.spaceDown = true; BV.vp.classList.add('panning'); } e.preventDefault(); return; }
  if (UI.view && UI.view.type === 'board' && BV.root) BV.onKey(e);
});

''')
between('function buildShell() {','async function boot() {','''function buildShell() {
  $('#sbCollapse').innerHTML = icon('sbleft');
  $('#sbCollapse').addEventListener('click', () => { if (isNarrow()) toggleSidebar(false); else setSidebarCollapsed(true); });
  $('#scrim').addEventListener('click', () => toggleSidebar(false));
  $('#libIcon').innerHTML = icon('cards', 16);
  $('#newBoard').innerHTML = icon('plus', 16);
  $('#newFolder').innerHTML = icon('folderplus', 16);
  $('#newPres').innerHTML = icon('plus', 16);
  if (UI.sbCollapsed) $('#app').classList.add('sb-collapsed');
  $('#navLibrary').addEventListener('click', () => navigate({ type: 'library' }));
  $('#searchIcon').innerHTML = icon('search', 16);
  $('#navSearch').addEventListener('click', () => { toggleSidebar(false); openSearch(); });
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
  document.addEventListener('keyup', e => { if (e.key === ' ' && BV.spaceDown) { BV.spaceDown = false; if (BV.vp) BV.vp.classList.remove('panning'); } });
  document.addEventListener('paste', e => {
    const t = e.target; if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if ($('#modalRoot').firstChild || Presenter.active()) return;
    if (UI.view && UI.view.type === 'board' && BV.root) BV.onPaste(e);
  });
  $('#newBoard').addEventListener('click', () => { const b = newBoard('Neues Whiteboard'); setEntity(b); touch(b); navigate({ type: 'board', id: b.id }); setTimeout(() => { const n = $('#boardName'); if (n) { n.focus(); n.select(); } }, 60); });
  $('#newFolder').addEventListener('click', () => createFolder());
  $('#newPres').addEventListener('click', () => { const p = newPres('Neue Präsentation ' + (S.pres.size + 1)); setEntity(p); touch(p); navigate({ type: 'pres', id: p.id }); });
  const fd = $('#fingerDraw'); fd.checked = UI.fingerDraw;
  document.body.classList.toggle('finger-draw', UI.fingerDraw);
  fd.addEventListener('change', () => { UI.fingerDraw = fd.checked; document.body.classList.toggle('finger-draw', UI.fingerDraw); saveUiPrefs(); toast(UI.fingerDraw ? 'Der Finger zeichnet jetzt. Mit zwei Fingern verschieben und zoomen.' : 'Nur der Apple Pencil zeichnet. Der Finger verschiebt.'); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => { const f = $('#importFile'); f.value = ''; f.click(); });
  $('#importFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importData(f); });
  addEventListener('resize', debounce(() => { if (BV.root) { BV.renderFlyout(); BV.layoutSoon(); } if (PresView.presId && UI.view.type === 'pres') PresView.render(); }, 150));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { BV.flushInline(); Editor.flushText(); Persist.flush(); } });
  addEventListener('pagehide', () => { BV.flushInline(); Editor.flushText(); Persist.flush(); });
  document.addEventListener('focusout', () => { if (Editor.stale && !$('#editor').contains(document.activeElement)) { Editor.stale = false; setTimeout(() => { if (Editor.cardId) Editor.render(); }, 0); } });
}
''')
rep("  check: '<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>',","""  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  card: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
  subboard: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><rect x="7" y="8" width="6" height="5" rx="1"/><path d="M17 12.5v5M14.5 15h5"/>',
  folder: '<path d="M3 7.5a2 2 0 012-2h4l2 2h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  folderplus: '<path d="M3 7.5a2 2 0 012-2h4l2 2h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  sbleft: '<path d="M11.5 7l-5 5 5 5M18 7l-5 5 5 5"/>',""")

between('// ---------- HTML bereinigen ----------','// ---------- Datenmodell ----------', read('render.js'))
between('// ---------- Karteninhalt rendern ----------','// ---------- Werkzeugleiste (Stift', read('history.js'))
between('// ---------- Karten-Editor ----------','// ---------- Karten löschen / Präsentation hinzufügen ----------', read('blocks.js'))
between('function pickCards({ title, multi, exclude, okLabel }) {','function openMenu(', read('search.js'))
rep("""    blocks: e.blocks.map(b => b.type === 'ink' ? { id: b.id, type: 'ink', h: Math.round(b.h), strokes: b.strokes.map(encStroke) }
      : b.type === 'image' ? { id: b.id, type: 'image', src: b.src, w: b.w, h: b.h }
      : { id: b.id, type: 'text', html: b.html })""", "    blocks: e.blocks.map(serBlock)")
rep("""    const blocks = [];
    for (const b of Array.isArray(o.blocks) ? o.blocks : []) {
      if (!b || typeof b !== 'object') continue;
      const id = isId(b.id) ? b.id : newId();
      if (b.type === 'ink') blocks.push({ id, type: 'ink', h: clamp(num(b.h, 300), 80, 6000), strokes: (Array.isArray(b.strokes) ? b.strokes : []).map(decStroke).filter(Boolean) });
      else if (b.type === 'image') { if (typeof b.src === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(b.src)) blocks.push({ id, type: 'image', src: b.src, w: num(b.w, 0), h: num(b.h, 0) }); }
      else blocks.push({ id, type: 'text', html: sanitizeHtml(str(b.html, 200000)) });
    }""", "    const blocks = (Array.isArray(o.blocks) ? o.blocks : []).slice(0, 2000).map(deserBlock).filter(Boolean);")
rep("""    arrows: e.arrows.map(a => ({ id: a.id, from: a.from, to: a.to, head: !!a.head })),""", """    arrows: e.arrows.map(a => ({ id: a.id, from: a.from, to: a.to, head: !!a.head })),
    sections: (e.sections || []).map(c => ({ id: c.id, x: r2(c.x), y: r2(c.y), w: r2(c.w), h: r2(c.h), title: c.title, color: c.color })),""")
rep("""      arrows: (Array.isArray(o.arrows) ? o.arrows : []).filter(a => a && isId(a.from) && isId(a.to)).map(a => ({ id: isId(a.id) ? a.id : newId(), from: a.from, to: a.to, head: !!a.head })),""", """      arrows: (Array.isArray(o.arrows) ? o.arrows : []).filter(a => a && isId(a.from) && isId(a.to)).map(a => ({ id: isId(a.id) ? a.id : newId(), from: a.from, to: a.to, head: !!a.head })),
      sections: (Array.isArray(o.sections) ? o.sections : []).filter(c => c && typeof c === 'object').map(c => ({ id: isId(c.id) ? c.id : newId(), x: num(c.x, 0), y: num(c.y, 0), w: clamp(num(c.w, 600), 160, 8000), h: clamp(num(c.h, 400), 100, 8000), title: str(c.title, 120), color: CARD_COLORS.includes(c.color) ? c.color : 'none' })),""")
rep("items: [], arrows: [], ink: [], parentId: o.parentId || null", "items: [], arrows: [], ink: [], sections: [], parentId: o.parentId || null")
rep("""function cardSnippet(c) {
  for (const b of c.blocks) { if (b.type === 'text') { const t = htmlToText(b.html); if (t) return t.slice(0, 120); } }
  if (c.blocks.some(b => b.type === 'ink' && b.strokes.length)) return 'Handschrift';
  if (c.blocks.some(b => b.type === 'image')) return 'Bild';
  return 'Leere Karte';
}""", """function cardSnippet(c) {
  const t = cardText(c).slice(c.title.length).trim(); if (t) return t.slice(0, 120);
  const names = { ink: 'Handschrift', image: 'Bild', video: 'Video', audio: 'Audio', file: 'Datei', embed: 'Video-Link', link: 'Link' };
  const b = c.blocks.find(x => names[x.type]); return b ? names[b.type] : 'Leere Karte';
}""")
rep("}, renderCardContent(c), meta);", "}, renderCardContent(c, { mode: 'lib' }), meta);")
rep("renderCardContent(c, { onImg: () => fitSlide(this.frame, holder, slide, false) })", "renderCardContent(c, { mode: 'present', onImg: () => fitSlide(this.frame, holder, slide, false) })")
rep("renderCardContent(c, { onImg: () => this.fit() })", "renderCardContent(c, { mode: 'present', openToggles: this.openToggles, onImg: () => this.fit() })")
rep("""    el.onpointerdown = e => { if (e.target.closest('.p-ui')) return;""", """    this.openToggles = new Set();
    el.onclick = e => { const th = e.target.closest('.tgl-head'); if (!th) return; const id = th.parentNode.dataset.block; if (this.openToggles.has(id)) this.openToggles.delete(id); else this.openToggles.add(id); const st = this.stage.scrollTop; this.render(); this.stage.scrollTop = st; };
    el.onpointerdown = e => { if (e.target.closest('.p-ui, video, audio, iframe, a, .tgl-head')) { this.swipe = null; return; }""")
rep("""      if (e.target.closest('.p-ui') || !this.swipe) return;""", """      if (e.target.closest('.p-ui, video, audio, iframe, a, .tgl-head') || !this.swipe) return;""")
rep("""if (n !== this.idx) { this.idx = n; this.render(); }""", """if (n !== this.idx) { this.idx = n; this.openToggles = new Set(); this.render(); }""")
rep("""iconBtn('close', 'Aus Präsentation entfernen', () => { const pp = this.pres(); pp.cardIds = ids.filter((_, j) => j !== i); touch(pp); this.render(); }));""",
    """iconBtn('close', 'Aus Präsentation entfernen', () => { const pp = this.pres(); Undo.snap([keyOf(pp)], () => { pp.cardIds = ids.filter((_, j) => j !== i); touch(pp); }); this.render(); }));""")
rep("""const [x] = ids.splice(i, 1); ids.splice(j, 0, x); p.cardIds = ids; this.selIdx = j; touch(p); this.render();""",
    """const [x] = ids.splice(i, 1); ids.splice(j, 0, x); Undo.snap([keyOf(p)], () => { p.cardIds = ids; touch(p); }); this.selIdx = j; this.render();""")
rep("""if (order.join() !== ids.join()) { p.cardIds = order; touch(p); }""", """if (order.join() !== ids.join()) Undo.snap([keyOf(p)], () => { p.cardIds = order; touch(p); });""")
rep("""if (!ids || !ids.length) return; const p = this.pres(); p.cardIds.push(...ids); touch(p);""", """if (!ids || !ids.length) return; const p = this.pres(); Undo.snap([keyOf(p)], () => { p.cardIds.push(...ids); touch(p); });""")
rep("""  if (choice === '__new') { p = newPres(); setEntity(p); } else p = S.pres.get(choice);
  if (!p) return;
  const add = cardIds.filter(id => !p.cardIds.includes(id));
  p.cardIds.push(...add); touch(p); renderSidebarSoon();""", """  if (choice === '__new') p = newPres(); else p = S.pres.get(choice);
  if (!p) return;
  const add = cardIds.filter(id => !p.cardIds.includes(id));
  Undo.snap([keyOf(p)], () => { setEntity(p); p.cardIds.push(...add); touch(p); }); renderSidebarSoon();""")
rep("""  for (const b of S.boards.values()) {
    if (b.items.some(i => i.cardId === cardId) || b.arrows.some(a => a.from === cardId || a.to === cardId)) {""", """  const tok = Undo.begin(['c_' + cardId, ...[...S.boards.values()].filter(b => b.items.some(i => i.cardId === cardId) || b.arrows.some(a => a.from === cardId || a.to === cardId)).map(keyOf), ...[...S.pres.values()].filter(p => p.cardIds.includes(cardId)).map(keyOf)]);
  for (const b of S.boards.values()) {
    if (b.items.some(i => i.cardId === cardId) || b.arrows.some(a => a.from === cardId || a.to === cardId)) {""")
rep("""  removeEntityLocal('c_' + cardId, stamp()); Persist.mark('c_' + cardId);
  if (Editor.cardId === cardId) Editor.close();""", """  removeEntityLocal('c_' + cardId, stamp()); Persist.mark('c_' + cardId); Undo.end(tok);
  toast('Karte gelöscht. ⌘Z macht es rückgängig.');
  if (Editor.cardId === cardId) Editor.close();""")
rep("""  if (!api) { Persist.goLocal('nohost'); return; }""", """  if (!api) { HOST.claude = false; if (Supa.available()) { Supa.start(); return; } Persist.goLocal('nohost'); return; }
  HOST.claude = true;""")
rep("""  try { [db, user] = await Promise.all([api.use('db'), api.use('user')]); } catch (e) {}""", """  try { [db, user, Files.assets] = await Promise.all([api.use('db'), api.use('user'), Promise.resolve(api.use('assets')).catch(() => null)]); } catch (e) {}""")
rep('<input type="file" id="imageFile" accept="image/*" hidden>', '<input type="file" id="filePick" hidden>')
rep("""  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',""", """  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>',
  h1: '<path d="M4 6v12M12 6v12M4 12h8"/><path d="M16.5 9.5L19 8v10"/>',
  h2: '<path d="M4 6v12M11 6v12M4 12h7"/><path d="M15 10a2.5 2.5 0 015 .5c0 1.5-1.5 2.5-5 7.5h5"/>',
  h3: '<path d="M4 6v12M11 6v12M4 12h7"/><path d="M15 8.5h4.5l-2.5 3.5a3 3 0 11-2 5"/>',
  todo: '<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="M5 7.5l1.2 1.2L8.5 6"/><rect x="3.5" y="13.5" width="6" height="6" rx="1.5"/><path d="M13 7.5h7.5M13 16.5h7.5"/>',
  toggle: '<path d="M5 6l4 3-4 3z" fill="currentColor"/><path d="M12 9h8.5M9 16h11.5"/>',
  quote: '<path d="M5 6v12"/><path d="M9 8h11M9 12h11M9 16h7"/>',
  divider: '<path d="M3 12h18"/><path d="M8 6h8M8 18h8" opacity=".35"/>',
  cardlink: '<rect x="3" y="5" width="11" height="14" rx="2"/><path d="M14 12h7M18 9l3 3-3 3"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  section: '<rect x="3" y="7" width="18" height="13" rx="2" stroke-dasharray="3 2.5"/><path d="M4 3.5h7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',""")
rep("const f = box.querySelector('[data-autofocus]') || box.querySelector('input,button'); if (f) setTimeout(() => f.focus(), 20);", "const f = box.querySelector('[data-autofocus]') || box.querySelector('input,button'); if (f) { f.focus(); setTimeout(() => { if (document.activeElement !== f && box.isConnected && !box.contains(document.activeElement)) f.focus(); }, 20); }")

between('// ---------- Export / Import ----------','// ---------- Export / Import ----------', read('cloud.js'))
rep("for (let i = 0; i < 30 && !api; i++) {", "for (let i = 0; i < (window.top !== window.self ? 30 : 2) && !api; i++) {")
rep("""  async writeKey(key) {
    const e = entityByKey(key);
    const coll = this.coll;""", """  async writeKey(key) {
    if (this.driver === 'supa') return Supa.writeKey(key);
    const e = entityByKey(key);
    const coll = this.coll;""")
rep("""    const first = this.mode === 'loading';""", """    const first = this.mode === 'loading' || this.mode === 'signedout';""")
rep("""  if (Persist.mode === 'loading') { tx.textContent = 'Verbinde …'; el.classList.add('busy'); }""", """  if (Persist.mode === 'loading') { tx.textContent = 'Verbinde …'; el.classList.add('busy'); }
  else if (Persist.mode === 'signedout') { tx.textContent = 'Nicht angemeldet'; el.classList.add('warn'); }""")
rep("""    tx.textContent = Persist.localReason === 'nohost' ?""", """    tx.textContent = Persist.localReason === 'chosen' ? 'Ohne Konto: nur auf diesem Gerät' : Persist.localReason === 'nohost' ?""")
rep("""async function exportData() {
  Editor.flushText();""", """async function exportData() {
  Editor.flushText(); BV.flushInline();
  toast('Sicherung wird erstellt …');""")
rep("""  const json = JSON.stringify(data);""", """  const fc = await collectFiles(); if (Object.keys(fc.files).length) data.files = fc.files;
  if (fc.missing) toast(`${fc.missing} Datei(en) konnten nicht mitgesichert werden.`);
  const json = JSON.stringify(data);""")
rep("""  fr.onload = () => {""", """  fr.onload = async () => {""")
rep("""      e.v = Math.max(e.v, localV(k) + 1); setEntity(e); Persist.mark(k); n++;""", """      if (e.kind === 'card' && o.files) await relinkFiles(e, o.files);
      e.v = Math.max(e.v, localV(k) + 1); setEntity(e); Persist.mark(k); n++;""")
rep("""    let n = 0;
    for (const raw of""", """    let n = 0; if (o.files) toast('Importiere, Dateien werden hochgeladen …');
    // Unveränderte Beispielinhalte dieses Geräts vorher entfernen (sonst doppelt)
    let seed = []; try { seed = JSON.parse(localStorage.getItem('kt-seed') || '[]'); } catch (e) {}
    const pristine = seed.filter(x => Array.isArray(x) && entityByKey(x[0]) && localV(x[0]) === x[1]);
    if (pristine.length && (o.cards || []).length) { for (const [k] of pristine) { removeEntityLocal(k, stamp()); Persist.mark(k); } try { localStorage.removeItem('kt-seed'); } catch (e) {} }
    for (const raw of""")
rep("""  connectCloud();
  if (document.fonts""", """  connectCloud();
  if (!window.claude && window.top === window.self && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.fonts""")

between('// ---------- Tastatur ----------','// ---------- Tastatur ----------', read('heptabase.js'))
rep("""    if (!o || o.app !== 'kartentisch') { toast('Diese Datei ist keine Kartentisch-Sicherung.'); return; }""",
    """    if (Hep.isExport(o)) { importHeptabase(o); return; }
    if (!o || o.app !== 'kartentisch') { toast('Diese Datei ist keine Kartentisch- oder Heptabase-Sicherung.'); return; }""")
rep("const CARD_COLORS = ['none', 'yellow', 'green', 'blue', 'rose', 'violet'];", "const CARD_COLORS = ['none', 'yellow', 'orange', 'green', 'blue', 'rose', 'violet', 'gray'];")
rep("const CARD_NAMES = { none: 'Weiß', yellow: 'Gelb', green: 'Grün', blue: 'Blau', rose: 'Rosa', violet: 'Violett' };", "const CARD_NAMES = { none: 'Weiß', yellow: 'Gelb', orange: 'Orange', green: 'Grün', blue: 'Blau', rose: 'Rosa', violet: 'Violett', gray: 'Grau' };")
rep("w: clamp(num(i.w, 300), 160, 1400), h: i.h ? clamp(num(i.h, 200), 80, 4000) : null", "w: clamp(num(i.w, 300), 160, 3000), h: i.h ? clamp(num(i.h, 200), 80, 6000) : null")
rep("w: clamp(num(c.w, 600), 160, 8000), h: clamp(num(c.h, 400), 100, 8000)", "w: clamp(num(c.w, 600), 160, 60000), h: clamp(num(c.h, 400), 100, 60000)")
rep("""      while (this.dirty.size && this.mode === 'cloud') {
        const key = this.dirty.values().next().value; this.dirty.delete(key);""", """      while (this.dirty.size && this.mode === 'cloud') {
        if (this.driver === 'supa' && this.dirty.size > 2) {
          const keys = [...this.dirty].slice(0, 150); keys.forEach(k => this.dirty.delete(k));
          try { await Supa.writeMany(keys); this.reachable = true; } catch (err) { keys.forEach(k => this.dirty.add(k)); this.reachable = false; updateSync(); await sleep(2500 + Math.random() * 2000); }
          continue;
        }
        const key = this.dirty.values().next().value; this.dirty.delete(key);""")
rep("""  async writeKey(key) {
    const e = entityByKey(key);
    const row = e ?""", """  rowFor(key) {
    const e = entityByKey(key);
    return e ? { user_id: this.user.id, key, v: e.v, deleted: false, body: ser(e) } : { user_id: this.user.id, key, v: S.tomb.get(key) || stamp(), deleted: true, body: null };
  },
  async writeMany(keys) {
    const rows = keys.map(k => this.rowFor(k));
    const { error } = await this.client.from('kt_docs').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw { code: 'unavailable', message: error.message };
    for (const r of rows) Persist.remoteV.set(r.key, r.v);
  },
  async writeKey(key) {
    const e = entityByKey(key);
    const row = e ?""")
rep("""      if (isEmptyStore()) seedExamples();
      Persist.schedule(300); onDataChanged(null); updateSync();""", """      if (isEmptyStore()) seedExamples();
      Persist.schedule(300); onDataChanged(null); updateSync();
      setTimeout(() => HepImages.run(), 4000);""")

rep("""function icon(name, size = 20) {""", read('icons.js') + "\n" + """function icon(name, size = 20) {""")
between('// ---------- Tastatur ----------','// ---------- Tastatur ----------', read('textbar.js'))
rep("""  connectCloud();
  if (!window.claude""", """  connectCloud(); TextBar.init();
  if (!window.claude""")
open(dst,'w',encoding='utf-8').write(s)
print('spliced', len(s))
