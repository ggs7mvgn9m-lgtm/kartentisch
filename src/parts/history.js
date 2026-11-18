const INK_BGS = [['none', 'Leer'], ['lines', 'Liniert'], ['wide', 'Liniert, weit'], ['grid', 'Kariert'], ['dots', 'Punkte']];
const INK_PAPERS = [['white', 'Weiß'], ['cream', 'Creme'], ['gray', 'Grau']];
const inkBgClass = b => 'ibg-' + (b.bg || 'std') + ' ipaper-' + (b.paper || 'std');
// ---------- Bausteine speichern/laden ----------
const BLOCK_FIELDS = { text: ['html'], image: ['src', 'url', 'ref', 'asset', 'sb', 'local', 'w', 'h', 'name'], file: ['asset', 'sb', 'local', 'name', 'size', 'mime'], video: ['asset', 'sb', 'local', 'name', 'size', 'mime'], audio: ['asset', 'sb', 'local', 'name', 'size', 'mime'],
  divider: [], todo: ['items'], toggle: ['title', 'html', 'open'], link: ['url', 'title'], embed: ['url', 'provider', 'vid', 'title'] };
function serBlock(b) {
  if (b.type === 'ink') { const o = { id: b.id, type: 'ink', h: Math.round(b.h), strokes: b.strokes.map(encStroke) }; if (b.bg) o.bg = b.bg; if (b.paper) o.paper = b.paper; return o; }
  const o = { id: b.id, type: b.type };
  for (const f of BLOCK_FIELDS[b.type] || []) { if (b[f] == null) continue; o[f] = f === 'items' ? b.items.map(i => ({ id: i.id, html: i.html, done: !!i.done })) : b[f]; }
  return o;
}
const isAssetId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);
const isSbPath = v => typeof v === 'string' && /^[0-9a-f-]{36}\/[\w.-]{1,120}$/.test(v);
function deserBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const id = isId(b.id) ? b.id : newId();
  const media = () => { const o = { id, type: b.type, name: str(b.name, 200), size: num(b.size, 0), mime: str(b.mime, 100) }; if (isAssetId(b.asset)) o.asset = b.asset; else if (isSbPath(b.sb)) o.sb = b.sb; else if (isId(b.local)) o.local = b.local; else return null; return o; };
  switch (b.type) {
    case 'ink': { const o = { id, type: 'ink', h: clamp(num(b.h, 300), 80, 6000), strokes: (Array.isArray(b.strokes) ? b.strokes : []).map(decStroke).filter(Boolean) }; if (INK_BGS.some(x => x[0] === b.bg)) o.bg = b.bg; if (INK_PAPERS.some(x => x[0] === b.paper)) o.paper = b.paper; return o; }
    case 'image': {
      const o = { id, type: 'image', w: num(b.w, 0), h: num(b.h, 0), name: str(b.name, 200) };
      if (isAssetId(b.asset)) o.asset = b.asset;
      else if (isSbPath(b.sb)) o.sb = b.sb;
      else if (typeof b.src === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(b.src)) o.src = b.src;
      else if (isId(b.local)) o.local = b.local;
      else if (typeof b.url === 'string' && /^https:\/\/[^\s"'<>]{4,2000}$/.test(b.url)) o.url = b.url;
      else if (typeof b.ref === 'string' && /^hep:[0-9a-f-]{36}$/.test(b.ref)) o.ref = b.ref;
      else return null;
      if (o.url && typeof b.ref === 'string' && /^hep:[0-9a-f-]{36}$/.test(b.ref)) o.ref = b.ref;
      return o;
    }
    case 'file': case 'video': case 'audio': return media();
    case 'divider': return { id, type: 'divider' };
    case 'todo': {
      const items = (Array.isArray(b.items) ? b.items : []).filter(i => i && typeof i === 'object').slice(0, 500).map(i => ({ id: isId(i.id) ? i.id : newId(), html: sanitizeHtml(str(i.html, 20000)), done: !!i.done }));
      return { id, type: 'todo', items: items.length ? items : [{ id: newId(), html: '', done: false }] };
    }
    case 'toggle': return { id, type: 'toggle', title: sanitizeHtml(str(b.title, 20000)), html: sanitizeHtml(str(b.html, 200000)), open: !!b.open };
    case 'link': { const url = safeUrl(b.url); return url ? { id, type: 'link', url, title: str(b.title, 300) } : null; }
    case 'embed': { const p = parseVideoUrl(b.url); return p ? { id, type: 'embed', url: p.url, provider: p.provider, vid: p.vid, title: str(b.title, 300) } : null; }
    default: return { id, type: 'text', html: sanitizeHtml(str(b.html, 200000)) };
  }
}

// ---------- Rückgängig / Wiederholen (Handschrift-Striche und ganze Änderungen) ----------
const snapOf = key => { const e = entityByKey(key); return e ? JSON.stringify(ser(e)) : null; };
const Undo = {
  stack: [], redoStack: [],
  push(entry) { this.stack.push(entry); if (this.stack.length > 200) this.stack.shift(); this.redoStack = []; refreshUndoButtons(); },
  begin(keys) { return { items: [...new Set(keys)].map(key => ({ key, before: snapOf(key) })) }; },
  end(tok) {
    if (!tok) return;
    for (const it of tok.items) it.after = snapOf(it.key);
    const items = tok.items.filter(it => it.before !== it.after);
    if (items.length) this.push({ kind: 'snap', items });
  },
  snap(keys, fn) { const t = this.begin(keys); const r = fn(); this.end(t); return r; },
  undo() { const e = this.stack.pop(); if (!e) { toast('Nichts zum Rückgängigmachen'); return; } this.apply(e, true); this.redoStack.push(e); refreshUndoButtons(); },
  redo() { const e = this.redoStack.pop(); if (!e) return; this.apply(e, false); this.stack.push(e); refreshUndoButtons(); },
  apply(e, inverse) {
    if (e.kind !== 'snap') { applyInkOp(e, inverse); return; }
    if (BV.editingId) BV.endInlineEdit(true);
    for (const it of e.items) {
      const json = inverse ? it.before : it.after;
      if (json == null) { if (entityByKey(it.key)) { removeEntityLocal(it.key, stamp()); Persist.mark(it.key); } continue; }
      try { const ent = deser(JSON.parse(json)); if (ent) { ent.v = stamp(); setEntity(ent); Persist.mark(it.key); } } catch (err) {}
    }
    if (UI.sel) UI.sel = null;
    onDataChanged(null);
    if (Editor.cardId) Editor.render();
  }
};
function inkTarget(t) {
  if (t.kind === 'board') { const b = S.boards.get(t.id); return b ? { arr: b.ink, ent: b } : null; }
  const c = S.cards.get(t.cardId); if (!c) return null;
  const blk = c.blocks.find(b => b.id === t.blockId); return blk ? { arr: blk.strokes, ent: c } : null;
}
function applyInkOp(e, inverse) {
  const tg = inkTarget(e.target); if (!tg) return;
  const put = (list, add) => { for (const st of list) { const i = tg.arr.indexOf(st); if (add && i < 0) tg.arr.push(st); if (!add && i >= 0) tg.arr.splice(i, 1); } };
  if (e.op === 'swap') { put(e.removed, inverse); put(e.added, !inverse); }
  else put(e.strokes, (e.op === 'add') !== inverse);
  touch(tg.ent);
  if (e.target.kind === 'board') { if (BV.boardId === e.target.id) BV.renderInk(); }
  else { Editor.rerenderInk(e.target.cardId, e.target.blockId); refreshCardEverywhere(e.target.cardId); }
}
function refreshUndoButtons() {
  for (const b of $$('[data-act="undo"]')) b.disabled = !Undo.stack.length;
  for (const b of $$('[data-act="redo"]')) b.disabled = !Undo.redoStack.length;
}

