// ---------- Heptabase-Import (All-Data.json aus „Export now“) ----------
const Hep = {
  COLORS: { white: 'none', black: 'gray', yellow: 'yellow', red: 'rose', green: 'green', blue: 'blue', orange: 'orange', purple: 'violet', gray: 'gray', pink: 'rose' },
  id: u => 'h' + String(u || '').replace(/[^0-9a-f]/gi, '').slice(0, 40),
  isExport: o => !!(o && Array.isArray(o.whiteBoardList) && Array.isArray(o.cardInstances) && Array.isArray(o.cardList)),
  color(c) { return this.COLORS[c] || 'none'; },
  parse(s) { if (!s) return null; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch (e) { return null; } }
};
const hesc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ProseMirror-Dokument von Heptabase in Kartentisch-Bausteine umwandeln
class HepConverter {
  constructor(ctx) { this.ctx = ctx; }
  inline(nodes) {
    let out = '';
    for (const n of nodes || []) {
      if (!n) continue;
      switch (n.type) {
        case 'text': {
          let t = hesc(n.text || '');
          let href = '';
          for (const m of n.marks || []) {
            if (m.type === 'strong') t = `<b>${t}</b>`;
            else if (m.type === 'em') t = `<i>${t}</i>`;
            else if (m.type === 'underline') t = `<u>${t}</u>`;
            else if (m.type === 'strike') t = `<s>${t}</s>`;
            else if (m.type === 'code') t = `<code>${t}</code>`;
            else if (m.type === 'link') href = safeUrl((m.attrs && m.attrs.href) || '');
          }
          out += href ? `<a href="${hesc(href)}">${t}</a>` : t; break;
        }
        case 'hard_break': out += '<br>'; break;
        case 'card': { const a = n.attrs || {}; const cid = this.ctx.cardRef(a.cardId); out += cid ? `<a data-card="${cid}">${hesc(a.cardTitle || '')}</a>` : hesc(a.cardTitle || ''); break; }
        case 'pdf_card': { const a = n.attrs || {}; const cid = this.ctx.pdfRef(a.pdfCardId); out += cid ? `<a data-card="${cid}">${hesc(a.pdfCardTitle || 'PDF')}</a>` : hesc(a.pdfCardTitle || ''); break; }
        case 'whiteboard': { const a = n.attrs || {}; out += '▦ ' + hesc(this.ctx.boardName(a.whiteboardId) || a.whiteboardName || 'Whiteboard'); break; }
        case 'date': { const a = n.attrs || {}; out += hesc(a.date || ''); break; }
        default: if (n.content) out += this.inline(n.content); else if (n.text) out += hesc(n.text);
      }
    }
    return out;
  }
  firstPara(n) { const c = n.content || []; const p = c[0] && c[0].type === 'paragraph' ? c[0] : null; return { head: p ? this.inline(p.content) : '', rest: p ? c.slice(1) : c }; }
  // Liste von Blockknoten als HTML (für Text, Toggle-Inhalt, Listenpunkte)
  html(nodes) {
    let out = '';
    const list = [];
    const flushList = () => { if (!list.length) return; const tag = list[0].type === 'numbered_list_item' ? 'ol' : 'ul'; out += `<${tag}>` + list.map(li => { const { head, rest } = this.firstPara(li); return `<li>${head || '<br>'}${this.html(rest)}</li>`; }).join('') + `</${tag}>`; list.length = 0; };
    for (const n of nodes || []) {
      if (!n) continue;
      const isList = n.type === 'bullet_list_item' || n.type === 'numbered_list_item';
      if (isList && list.length && list[0].type !== n.type) flushList();
      if (isList) { list.push(n); continue; }
      flushList();
      out += this.blockHtml(n);
    }
    flushList();
    return out;
  }
  blockHtml(n) {
    switch (n.type) {
      case 'paragraph': { const t = this.inline(n.content); return `<p>${t || '<br>'}</p>`; }
      case 'heading': { const l = Math.min(3, Math.max(1, (n.attrs && n.attrs.level) || 1)); return `<h${l}>${this.inline(n.content)}</h${l}>`; }
      case 'blockquote': return `<blockquote>${this.html(n.content)}</blockquote>`;
      case 'todo_list_item': { const { head, rest } = this.firstPara(n); return `<p>${n.attrs && n.attrs.checked ? '☑' : '☐'} ${head}</p>${this.html(rest)}`; }
      case 'toggle_list_item': { const { head, rest } = this.firstPara(n); return `<p>▸ ${head}</p>${this.html(rest)}`; }
      case 'table': return '<table><tbody>' + (n.content || []).map(r => '<tr>' + (r.content || []).map(c => { const tag = c.type === 'table_header' ? 'th' : 'td'; return `<${tag}>${(c.content || []).map(p => p.type === 'paragraph' ? this.inline(p.content) : this.html([p])).join('<br>')}</${tag}>`; }).join('') + '</tr>').join('') + '</tbody></table>';
      case 'code_block': return `<p><code>${hesc((n.content || []).map(t => t.text || '').join('')).replace(/\n/g, '<br>')}</code></p>`;
      case 'horizontal_rule': return '<p>———</p>';
      case 'image': return '<p>🖼 Bild</p>';
      case 'math_inline': case 'math_display': return `<p>${this.inline(n.content)}</p>`;
      default: return n.content ? this.html(n.content) : '';
    }
  }
  // Oberste Ebene: Bausteine bilden
  blocks(doc, title) {
    let nodes = (doc && doc.content) || [];
    const first = nodes[0];
    if (first && first.type === 'heading' && title && htmlToText(this.inline(first.content)) === title.trim()) nodes = nodes.slice(1);
    const blocks = []; let buf = []; let todo = null;
    const flush = () => {
      if (buf.length) { let html = this.html(buf).replace(/(<p><br><\/p>){2,}/g, '<p><br></p>').replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, ''); if (html) blocks.push({ id: newId(), type: 'text', html }); buf = []; }
      todo = null;
    };
    const media = (n) => {
      const a = n.attrs || {};
      if (n.type === 'image') {
        const name = a.fileId ? this.ctx.fileName(a.fileId) : '';
        if (typeof a.src === 'string' && /^https:\/\//.test(a.src)) return { id: newId(), type: 'image', url: a.src, name, ...(a.fileId ? { ref: 'hep:' + a.fileId } : {}) };
        if (typeof a.src === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(a.src)) return { id: newId(), type: 'image', src: a.src, name };
        if (a.fileId && /^[0-9a-f-]{36}$/.test(a.fileId)) { this.ctx.missing.add(a.fileId); return { id: newId(), type: 'image', ref: 'hep:' + a.fileId, name }; }
        return null;
      }
      if (n.type === 'video' && a.url) { const p = parseVideoUrl(a.url); if (p) return { id: newId(), type: 'embed', url: p.url, provider: p.provider, vid: p.vid, title: '' }; const u = safeUrl(a.url); if (u) return { id: newId(), type: 'link', url: u, title: '' }; }
      if ((n.type === 'bookmark' || n.type === 'web') && (a.url || a.href)) { const u = safeUrl(a.url || a.href); if (u) return { id: newId(), type: 'link', url: u, title: str(a.title || '', 300) }; }
      const name = a.fileId ? this.ctx.fileName(a.fileId) : (a.name || '');
      const what = { video: 'Video', audio: 'Audio', file: 'Datei' }[n.type] || 'Datei';
      return { id: newId(), type: 'text', html: `<p>📎 ${what}${name ? ': ' + hesc(name) : ''} <i>(nicht aus Heptabase übernommen)</i></p>` };
    };
    for (const n of nodes) {
      if (!n) continue;
      if (n.type === 'todo_list_item') {
        if (buf.length) flush();
        if (!todo) { todo = { id: newId(), type: 'todo', items: [] }; blocks.push(todo); }
        const walk = (it) => { const { head, rest } = this.firstPara(it); todo.items.push({ id: newId(), html: head, done: !!(it.attrs && it.attrs.checked) }); for (const r of rest) { if (r.type === 'todo_list_item') walk(r); else { const h2 = this.html([r]); if (h2) todo.items[todo.items.length - 1].html += '<br>' + htmlToText(h2); } } };
        walk(n); continue;
      }
      if (n.type === 'toggle_list_item') {
        flush(); const { head, rest } = this.firstPara(n);
        blocks.push({ id: newId(), type: 'toggle', title: head, html: this.html(rest), open: !(n.attrs && n.attrs.folded) }); continue;
      }
      if (n.type === 'horizontal_rule') { flush(); blocks.push({ id: newId(), type: 'divider' }); continue; }
      if (['image', 'video', 'audio', 'file', 'bookmark', 'web'].includes(n.type)) { flush(); const b = media(n); if (b) blocks.push(b); continue; }
      if (n.type === 'embed') { const a = n.attrs || {}; const cid = this.ctx.cardRef(a.objectId); if (cid) buf.push({ type: 'paragraph', content: [{ type: 'card', attrs: { cardId: a.objectId, cardTitle: this.ctx.cardTitle(a.objectId) } }] }); continue; }
      if (n.type === 'pdf_card' || n.type === 'card' || n.type === 'whiteboard') { buf.push({ type: 'paragraph', content: [n] }); continue; }
      if (todo) todo = null;
      buf.push(n);
    }
    flush();
    return blocks.length ? blocks : [{ id: newId(), type: 'text', html: '' }];
  }
}

// Gesamten Export in Kartentisch-Einträge umwandeln (ohne zu speichern)
function hepBuild(o) {
  const live = arr => (Array.isArray(arr) ? arr : []).filter(x => x && !x.isTrashed);
  const files = new Map((o.files || []).map(f => [f.id, f]));
  const boardsH = new Map(live(o.whiteBoardList).map(w => [w.id, w]));
  const cardsH = new Map(live(o.cardList).map(c => [c.id, c]));
  const pdfH = new Map(live(o.pdfCards).map(c => [c.id, c]));
  const out = { cards: new Map(), boards: new Map(), folder: null, missing: new Set(), skipped: { dup: 0, arrows: 0, other: 0 } };
  const ctx = {
    missing: out.missing,
    cardRef: id => cardsH.has(id) ? Hep.id(id) : null,
    cardTitle: id => (cardsH.get(id) || {}).title || '',
    pdfRef: id => pdfH.has(id) ? Hep.id(id) : null,
    boardName: id => (boardsH.get(id) || {}).name || '',
    fileName: id => (files.get(id) || {}).name || ''
  };
  const conv = new HepConverter(ctx);
  const created = ts => { const t = Date.parse(ts); return isFinite(t) ? t : Date.now(); };
  const mkCard = (id, title, blocks, ts, color) => { const c = { kind: 'card', id, title: str(title || '', 300), color: color || 'none', created: created(ts), v: 1, blocks }; out.cards.set(id, c); return c; };
  // Karten aus der Kartenbibliothek
  for (const c of cardsH.values()) mkCard(Hep.id(c.id), c.title, conv.blocks(Hep.parse(c.content), c.title || ''), c.createdTime);
  // PDF-Karten (Datei selbst wird nicht übernommen)
  for (const p of pdfH.values()) { const f = files.get(p.fileId); mkCard(Hep.id(p.id), p.title || 'PDF', [{ id: newId(), type: 'text', html: `<p>📄 PDF${f && f.name ? ': ' + hesc(f.name) : ''} <i>(Datei nicht aus Heptabase übernommen)</i></p>` }], p.createdTime); }
  // Folder für die obersten Whiteboards
  const folder = { kind: 'folder', id: 'hheptabase', name: 'Heptabase', created: Date.now(), v: 1 }; out.folder = folder;
  // Eltern der Whiteboards
  const parentOf = new Map();
  for (const wi of o.whiteboardInstances || []) if (wi && wi.containerType === 'whiteboard' && wi.isChild && boardsH.has(wi.whiteboardId) && boardsH.has(wi.containerId) && !parentOf.has(wi.whiteboardId)) parentOf.set(wi.whiteboardId, wi.containerId);
  // Zyklen auflösen
  for (const id of [...parentOf.keys()]) { const seen = new Set([id]); let p = parentOf.get(id); while (p) { if (seen.has(p)) { parentOf.delete(id); break; } seen.add(p); p = parentOf.get(p); } }
  for (const w of boardsH.values()) {
    const pid = parentOf.get(w.id);
    out.boards.set(Hep.id(w.id), { kind: 'board', id: Hep.id(w.id), name: str(w.name || 'Whiteboard', 200), created: created(w.createdTime), v: 1, items: [], arrows: [], ink: [], sections: [], parentId: pid ? Hep.id(pid) : null, folderId: pid ? null : folder.id });
  }
  const refOf = new Map(); // Heptabase-Objekt-ID -> Kartentisch-Ref
  const place = (wbId, instId, ref, x, y, w, hh, isBoard) => {
    const b = out.boards.get(Hep.id(wbId)); if (!b) { out.skipped.other++; return; }
    if (b.items.some(i => (i.cardId || i.boardId) === ref)) { out.skipped.dup++; refOf.set(instId, ref); return; }
    b.items.push(Object.assign(isBoard ? { boardId: ref } : { cardId: ref }, { x: num(x, 0), y: num(y, 0), w: clamp(num(w, 300), 160, 3000), h: hh ? clamp(hh, 80, 4000) : null }));
    refOf.set(instId, ref);
  };
  const setColor = (cid, col) => { const c = out.cards.get(cid); if (c && c.color === 'none' && col && col !== 'white') c.color = Hep.color(col); };
  for (const ci of o.cardInstances || []) {
    if (!ci || !cardsH.has(ci.cardId)) continue;
    const ref = Hep.id(ci.cardId); setColor(ref, ci.color);
    const hh = ci.isFolded ? Math.max(80, num(ci.foldedHeight, 62)) : (ci.isAutoHeight ? null : num(ci.height, 0));
    place(ci.whiteboardId, ci.id, ref, ci.x, ci.y, ci.width, hh);
  }
  for (const wi of o.whiteboardInstances || []) {
    if (!wi || wi.containerType !== 'whiteboard' || !boardsH.has(wi.whiteboardId)) continue;
    if (wi.whiteboardId === wi.containerId) continue;
    place(wi.containerId, wi.id, Hep.id(wi.whiteboardId), wi.x, wi.y, wi.width, num(wi.height, 0), true);
  }
  for (const te of o.textElements || []) {
    if (!te || !boardsH.has(te.whiteboardId)) continue;
    const id = Hep.id(te.id); mkCard(id, '', conv.blocks(Hep.parse(te.content), ''), te.createdTime, Hep.color(te.color));
    place(te.whiteboardId, te.id, id, te.x, te.y, te.width, null);
  }
  for (const me of o.mediaElements || []) {
    if (!me || !boardsH.has(me.whiteboardId)) continue;
    const f = files.get(me.fileId) || {}; const id = Hep.id(me.id);
    let blocks;
    if (me.type === 'image' && me.fileId) { out.missing.add(me.fileId); blocks = [{ id: newId(), type: 'image', ref: 'hep:' + me.fileId, name: f.name || '' }]; }
    else blocks = [{ id: newId(), type: 'text', html: `<p>📎 ${me.type === 'audio' ? 'Audio' : me.type === 'video' ? 'Video' : 'Datei'}${f.name ? ': ' + hesc(f.name) : ''} <i>(nicht aus Heptabase übernommen)</i></p>` }];
    mkCard(id, '', blocks, me.createdTime, Hep.color(me.color));
    place(me.whiteboardId, me.id, id, me.x, me.y, me.width, me.type === 'image' ? null : null);
  }
  for (const pi of o.pdfCardInstances || []) { if (pi && pdfH.has(pi.pdfCardId)) place(pi.whiteboardId, pi.id, Hep.id(pi.pdfCardId), pi.x, pi.y, pi.width, null); }
  const journals = new Map((o.journalList || []).map(j => [j.date, j]));
  for (const ji of o.journalInstances || []) {
    if (!ji || !boardsH.has(ji.whiteboardId)) continue;
    const id = 'hj' + String(ji.journalDate || '').replace(/\D/g, '');
    if (!out.cards.has(id)) { const j = journals.get(ji.journalDate); mkCard(id, 'Journal ' + new Date(ji.journalDate + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }), conv.blocks(Hep.parse(j && j.content), ''), ji.createdTime); }
    place(ji.whiteboardId, ji.id, id, ji.x, ji.y, ji.width, null);
  }
  const highlights = new Map((o.highlightElements || []).map(x => [x.id, x]));
  for (const hi of o.highlightElementInstances || []) {
    if (!hi || !boardsH.has(hi.whiteboardId)) continue;
    const id = Hep.id(hi.highlightElementId);
    if (!out.cards.has(id)) {
      const he = highlights.get(hi.highlightElementId) || {}; const hl = Hep.parse(he.highlight); const note = Hep.parse(he.note);
      const txt = hl && hl.content ? conv.html(hl.content) : (typeof he.highlight === 'string' && !hl ? `<p>${hesc(he.highlight)}</p>` : '');
      const blocks = []; if (txt) blocks.push({ id: newId(), type: 'text', html: `<blockquote>${txt}</blockquote>` });
      if (note && note.content) blocks.push(...conv.blocks(note, ''));
      mkCard(id, 'Markierung', blocks.length ? blocks : [{ id: newId(), type: 'text', html: '' }], hi.createdTime, 'yellow');
    }
    place(hi.whiteboardId, hi.id, id, hi.x, hi.y, hi.width, null);
  }
  // Mindmaps als Gliederung
  const mmNodes = new Map((o.mindMapNodes || []).map(n => [n.id, n]));
  const mmText = new Map((o.mindMapTextNodes || []).map(n => [n.id, n]));
  const mmCard = new Map((o.mindMapCardNodes || []).map(n => [n.id, n]));
  const nodeLabel = n => { const t = mmText.get(n.id); if (t) { const d = Hep.parse(t.content); return d ? conv.inline((d.content || []).flatMap(p => p.content || [])) : hesc(t.content || ''); } const c = mmCard.get(n.id); if (c) { const cid = ctx.cardRef(c.cardId); return cid ? `<a data-card="${cid}">${hesc(ctx.cardTitle(c.cardId))}</a>` : ''; } return ''; };
  const outline = n => { const kids = (n.childNodeIds || []).map(i => mmNodes.get(i)).filter(Boolean); return `<li>${nodeLabel(n) || '<br>'}${kids.length ? '<ul>' + kids.map(outline).join('') + '</ul>' : ''}</li>`; };
  for (const mi of o.mindMapInstances || []) {
    if (!mi || !boardsH.has(mi.whiteboardId)) continue;
    const id = Hep.id(mi.mindMapId);
    if (!out.cards.has(id)) { const roots = [...mmNodes.values()].filter(n => n.mindMapId === mi.mindMapId && !n.parentId); mkCard(id, 'Mindmap', [{ id: newId(), type: 'text', html: '<ul>' + roots.map(outline).join('') + '</ul>' }], mi.createdTime); }
    place(mi.whiteboardId, mi.id, id, mi.x, mi.y, mi.width, num(mi.height, 0));
  }
  const media = new Map((o.mediaCards || []).map(m => [m.id, m]));
  for (const mi of o.mediaCardInstances || []) {
    if (!mi || !boardsH.has(mi.whiteboardId)) continue;
    const m = media.get(mi.cardId); if (!m || m.isTrashed) continue; const id = Hep.id(m.id);
    if (!out.cards.has(id)) { const f = files.get(m.fileId) || {}; let blocks; if (m.type === 'image' && m.fileId) { out.missing.add(m.fileId); blocks = [{ id: newId(), type: 'image', ref: 'hep:' + m.fileId, name: f.name || '' }]; } else { const u = safeUrl(m.link || ''); const p = u && parseVideoUrl(u); blocks = [p ? { id: newId(), type: 'embed', url: p.url, provider: p.provider, vid: p.vid, title: '' } : u ? { id: newId(), type: 'link', url: u, title: m.title || '' } : { id: newId(), type: 'text', html: `<p>📎 ${hesc(f.name || m.title || 'Datei')} <i>(nicht aus Heptabase übernommen)</i></p>` }]; } mkCard(id, m.title || '', blocks, m.createdTime); }
    place(mi.whiteboardId, mi.id, id, mi.x, mi.y, mi.width, null);
  }
  const webs = new Map((o.webCards || []).map(w => [w.id, w]));
  for (const wi of o.webCardInstances || []) {
    if (!wi || !boardsH.has(wi.whiteboardId)) continue;
    const w = webs.get(wi.cardId); if (!w || w.isTrashed) continue; const id = Hep.id(w.id);
    if (!out.cards.has(id)) { const u = safeUrl(w.url || ''); mkCard(id, w.title || '', [u ? { id: newId(), type: 'link', url: u, title: w.title || '' } : { id: newId(), type: 'text', html: '' }], w.createdTime); }
    place(wi.whiteboardId, wi.id, id, wi.x, wi.y, wi.width, null);
  }
  // Abschnitte
  for (const s of o.sections || []) {
    const b = s && out.boards.get(Hep.id(s.whiteboardId)); if (!b) continue;
    b.sections.push({ id: Hep.id(s.id), x: num(s.x, 0), y: num(s.y, 0), w: clamp(num(s.width, 600), 160, 60000), h: clamp(num(s.height, 400), 100, 60000), title: str(s.title || '', 120), color: Hep.color(s.color) });
  }
  // Pfeile
  for (const c of o.connections || []) {
    const b = c && out.boards.get(Hep.id(c.whiteboardId)); if (!b) continue;
    const from = refOf.get(c.beginId), to = refOf.get(c.endId);
    if (!from || !to || from === to) { out.skipped.arrows++; continue; }
    if (b.arrows.some(a => (a.from === from && a.to === to) || (a.from === to && a.to === from))) continue;
    b.arrows.push({ id: Hep.id(c.id), from, to, head: c.endStyle !== 'none' || c.beginStyle !== 'none' });
  }
  return out;
}

// Import ausführen: nur Neues anlegen, Vorhandenes unverändert lassen
async function importHeptabase(o) {
  let built; try { built = hepBuild(o); } catch (e) { console.error(e); toast('Diese Heptabase-Datei konnte nicht gelesen werden.'); return; }
  const all = [built.folder, ...built.cards.values(), ...built.boards.values()];
  const fresh = all.filter(e => !entityByKey(keyOf(e)));
  const remote = [...built.cards.values()].reduce((n, c) => n + c.blocks.filter(b => b.type === 'image' && b.url).length, 0);
  const placed = [...built.boards.values()].reduce((n, b) => n + b.items.length, 0);
  const arrows = [...built.boards.values()].reduce((n, b) => n + b.arrows.length, 0);
  const sections = [...built.boards.values()].reduce((n, b) => n + b.sections.length, 0);
  const isRe = fresh.length < all.length;
  const ok = await confirmDialog('Heptabase importieren?',
    `${built.boards.size} Whiteboards, ${built.cards.size} Karten (${placed} auf Whiteboards platziert), ${arrows} Pfeile, ${sections} Abschnitte.` +
    (isRe ? ` Davon sind ${all.length - fresh.length} schon vorhanden und bleiben unverändert; neu: ${fresh.length}.` : '') +
    ` ${remote} Bilder werden danach vom Heptabase-Server geladen und verkleinert gespeichert. ${built.missing.size} Bilder sind nicht in der Exportdatei und erscheinen als Platzhalter.`,
    fresh.length ? 'Importieren' : 'Bilder erneut laden');
  if (!ok) return;
  let seed = []; try { seed = JSON.parse(localStorage.getItem('kt-seed') || '[]'); } catch (e) {}
  const pristine = seed.filter(x => Array.isArray(x) && entityByKey(x[0]) && localV(x[0]) === x[1]);
  for (const [k] of pristine) { removeEntityLocal(k, stamp()); Persist.mark(k); }
  try { localStorage.removeItem('kt-seed'); } catch (e) {}
  for (const raw of fresh) {
    const e = deser(ser(raw)); if (!e) continue;
    e.v = stamp(); setEntity(e); Persist.localDirty.add(keyOf(e)); Persist.dirty.add(keyOf(e));
  }
  Persist.schedule(200); updateSync(); onDataChanged(null);
  const top = [...built.boards.values()].filter(b => !b.parentId && b.items.length).sort((a, b) => b.items.length - a.items.length)[0];
  if (top && fresh.length && typeof navigate === 'function') navigate({ type: 'board', id: top.id });
  toast(fresh.length ? `${fresh.length} Einträge aus Heptabase importiert` : 'Alles war schon da');
  try { localStorage.removeItem('kt-hep-failed'); } catch (e) {}
  HepImages.run();
}

// Bilder vom Heptabase-Server holen, verkleinern, in den eigenen Speicher legen
const HepImages = {
  running: false, el: null,
  pending() {
    let failed = new Set(); try { failed = new Set(JSON.parse(localStorage.getItem('kt-hep-failed') || '[]')); } catch (e) {}
    const list = [];
    for (const c of S.cards.values()) for (const b of c.blocks) if (b.type === 'image' && b.url && !b.sb && !b.asset && !b.local && !failed.has(b.url)) list.push([c, b]);
    return list;
  },
  canStore() { return (Supa.user && !HOST.claude) || !!Files.assets; },
  async shrink(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const W = img.naturalWidth || 800, H = img.naturalHeight || 600;
      if (blob.size <= 250000 && Math.max(W, H) <= 1600 && /image\/(jpeg|png|webp|gif)/.test(blob.type)) return { blob, w: W, h: H };
      const s = Math.min(1, 1600 / Math.max(W, H)); const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const out = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.82));
      return { blob: out || blob, w, h };
    } finally { URL.revokeObjectURL(url); }
  },
  progress(done, total, failed) {
    if (!this.el) { this.el = h('div', { class: 'hep-progress', role: 'status' }); document.body.append(this.el); }
    this.el.replaceChildren(h('span', { text: `Heptabase-Bilder: ${done} von ${total}` + (failed ? ` (${failed} nicht ladbar)` : '') }), h('span', { class: 'bar' }, h('i', { style: `width:${total ? Math.round(done / total * 100) : 0}%` })));
  },
  async run() {
    if (this.running) return; const list = this.pending(); if (!list.length) return;
    if (!this.canStore()) { toast('Melde dich an, damit die Heptabase-Bilder in deinem Speicher abgelegt werden können.'); return; }
    this.running = true; let done = 0, failed = 0; const bad = [];
    this.progress(0, list.length, 0);
    const one = async ([card, b]) => {
      try {
        const r = await fetch(b.url, { mode: 'cors', credentials: 'omit' });
        if (!r.ok) throw new Error('http ' + r.status);
        const raw = await r.blob(); if (!/^image\//.test(raw.type) && raw.size < 200) throw new Error('kein Bild');
        const { blob, w, h: hh } = await this.shrink(raw);
        const name = (b.name || (b.url.split('/').pop() || 'bild').split('?')[0]).replace(/\.(png|webp|gif|avif)$/i, '.jpg');
        let nb;
        if (Supa.user && !HOST.claude) nb = { sb: await Supa.upload(blob, decodeURIComponent(name)) };
        else { const res = await Files.assets.upload(blob, { type: blob.type || 'image/jpeg' }); nb = { asset: res.id }; }
        const cur = S.cards.get(card.id); const blk = cur && cur.blocks.find(x => x.id === b.id);
        if (blk) { Object.assign(blk, nb, { w, h: hh }); delete blk.url; touch(cur); }
      } catch (e) { failed++; bad.push(b.url); }
      done++; this.progress(done, list.length, failed);
    };
    const queue = list.slice(); const workers = Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); });
    await Promise.all(workers);
    try { const prev = JSON.parse(localStorage.getItem('kt-hep-failed') || '[]'); localStorage.setItem('kt-hep-failed', JSON.stringify([...new Set([...prev, ...bad])].slice(-5000))); } catch (e) {}
    this.running = false; if (this.el) { this.el.remove(); this.el = null; }
    onDataChanged(null);
    toast(failed ? `${done - failed} Bilder übernommen. ${failed} ließen sich nicht laden und bleiben als Verweis auf Heptabase.` : `${done} Heptabase-Bilder übernommen.`);
  }
};
