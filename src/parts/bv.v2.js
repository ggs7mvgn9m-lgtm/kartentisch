// ---------- Whiteboard-Ansicht ----------
function boardChain(b) {
  const chain = []; const seen = new Set([b.id]); let cur = b;
  while (cur.parentId && S.boards.has(cur.parentId) && !seen.has(cur.parentId)) { seen.add(cur.parentId); cur = S.boards.get(cur.parentId); chain.unshift(cur); }
  return chain;
}
function rootOf(b) { const c = boardChain(b); return c.length ? c[0] : b; }
function cardIsEmpty(c) { return !c.title.trim() && c.blocks.every(b => b.type === 'text' && isEmptyHtml(b.html)); }
function pastePlain(e) { const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (t != null) { e.preventDefault(); document.execCommand('insertText', false, t); } }
function clipToRect(c, t, r, gap) {
  const dx = t[0] - c[0], dy = t[1] - c[1];
  if (!dx && !dy) return c;
  const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy); const len = Math.hypot(dx, dy);
  return [c[0] + dx * s + (dx / len) * gap, c[1] + dy * s + (dy / len) * gap];
}
// Geschwungene Verbindung von Kante zu Kante (wie in Heptabase)
function connPath(ra, rb) {
  const gapX = rb.x > ra.x + ra.w ? rb.x - (ra.x + ra.w) : ra.x > rb.x + rb.w ? ra.x - (rb.x + rb.w) : -1;
  const gapY = rb.y > ra.y + ra.h ? rb.y - (ra.y + ra.h) : ra.y > rb.y + rb.h ? ra.y - (rb.y + rb.h) : -1;
  let p1, p2, c1, c2;
  if (gapX >= 0 && (gapY < 0 || gapX >= gapY)) {
    const s = rb.x > ra.x ? 1 : -1;
    p1 = [s > 0 ? ra.x + ra.w : ra.x, ra.y + ra.h / 2]; p2 = [s > 0 ? rb.x : rb.x + rb.w, rb.y + rb.h / 2];
    const o = Math.max(24, Math.abs(p2[0] - p1[0]) / 2); c1 = [p1[0] + s * o, p1[1]]; c2 = [p2[0] - s * o, p2[1]];
  } else if (gapY >= 0) {
    const s = rb.y > ra.y ? 1 : -1;
    p1 = [ra.x + ra.w / 2, s > 0 ? ra.y + ra.h : ra.y]; p2 = [rb.x + rb.w / 2, s > 0 ? rb.y : rb.y + rb.h];
    const o = Math.max(24, Math.abs(p2[1] - p1[1]) / 2); c1 = [p1[0], p1[1] + s * o]; c2 = [p2[0], p2[1] - s * o];
  } else {
    const ca = [ra.x + ra.w / 2, ra.y + ra.h / 2], cb = [rb.x + rb.w / 2, rb.y + rb.h / 2];
    p1 = clipToRect(ca, cb, ra, 4); p2 = clipToRect(cb, ca, rb, 4); c1 = p1; c2 = p2;
  }
  const mid = [(p1[0] + 3 * c1[0] + 3 * c2[0] + p2[0]) / 8, (p1[1] + 3 * c1[1] + 3 * c2[1] + p2[1]) / 8];
  return { d: `M${f1(p1[0])} ${f1(p1[1])}C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`, mid };
}
function boardTile(sub) {
  const nCards = sub.items.filter(i => i.cardId && S.cards.has(i.cardId)).length;
  const nBoards = sub.items.filter(i => i.boardId && S.boards.has(i.boardId)).length;
  const head = h('div', { class: 'bb-head' }, h('span', { class: 'tile t-board', html: icon('board', 15) }), h('span', { class: 'bb-name', text: sub.name || 'Ohne Namen' }));
  const thumb = sv('svg', { class: 'bb-thumb', preserveAspectRatio: 'xMidYMid meet' });
  const rects = sub.items.filter(i => (i.cardId && S.cards.has(i.cardId)) || (i.boardId && S.boards.has(i.boardId))).map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h || (i.boardId ? 170 : 150) }));
  if (rects.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const pad = Math.max(40, (x1 - x0) * 0.06);
    thumb.setAttribute('viewBox', `${f1(x0 - pad)} ${f1(y0 - pad)} ${f1(x1 - x0 + pad * 2)} ${f1(y1 - y0 + pad * 2)}`);
    for (const r of rects) thumb.append(sv('rect', { x: f1(r.x), y: f1(r.y), width: f1(r.w), height: f1(r.h), rx: '12' }));
  }
  const meta = h('div', { class: 'bb-meta', text: [nCards ? (nCards === 1 ? '1 Karte' : `${nCards} Karten`) : '', nBoards ? (nBoards === 1 ? '1 Whiteboard' : `${nBoards} Whiteboards`) : ''].filter(Boolean).join(' · ') || 'Noch leer' });
  return h('div', { class: 'bb' }, head, thumb, meta);
}

const BV = {
  boardId: null, root: null, wrap: null, vp: null, world: null, itemsLayer: null, arrowsG: null, inkG: null, liveG: null,
  els: new Map(), pointers: new Map(), gesture: null, lastTap: null, connectFrom: null, selbar: null, gestureZoom: null,
  editingId: null, editingNew: false, ro: null, mmT: null, mmDrag: false, _raf: 0, _mmRaf: 0,
  board() { return S.boards.get(this.boardId); },
  view() { return UI.views[this.boardId] || (UI.views[this.boardId] = { x: 120, y: 80, z: 1 }); },
  itemOf(ref) { const b = this.board(); return b ? b.items.find(i => (i.cardId || i.boardId) === ref) : null; },

  mount(id) {
    this.endInlineEdit();
    this.boardId = id; this.els.clear(); this.pointers.clear(); this.gesture = null; this.connectFrom = null; UI.sel = null;
    const hadView = !!UI.views[id];
    if (this.ro) this.ro.disconnect();
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.layoutSoon()) : null;
    const head = h('header', { class: 'view-head' }, menuButton(), this.breadcrumb(), h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', type: 'button', html: icon('present', 18) + '<span class="hide-narrow">Präsentation</span>', title: 'Präsentation aus diesem Whiteboard erstellen', 'aria-label': 'Präsentation aus diesem Whiteboard erstellen', onclick: () => this.makePresentation() }),
      iconBtn('more', 'Weitere Aktionen', ev => this.moreMenu(ev.currentTarget)));
    this.vp = h('div', { class: 'viewport', id: 'viewport', tabindex: '-1' });
    this.world = h('div', { class: 'world' });
    const arrowsSvg = sv('svg', { class: 'layer-svg' });
    const defs = sv('defs');
    const mk = sv('marker', { id: 'ah', viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    const mp = sv('path', { d: 'M0 0L10 5L0 10z' }); mp.style.fill = 'var(--conn)'; mk.append(mp);
    const mk2 = mk.cloneNode(true); mk2.setAttribute('id', 'ahs'); mk2.firstChild.style.fill = 'var(--accent)';
    defs.append(mk, mk2); arrowsSvg.append(defs); this.arrowsG = sv('g'); arrowsSvg.append(this.arrowsG);
    this.itemsLayer = h('div');
    const inkSvgEl = sv('svg', { class: 'layer-svg' }); this.inkG = sv('g'); this.liveG = sv('g'); inkSvgEl.append(this.inkG, this.liveG);
    this.world.append(arrowsSvg, this.itemsLayer, inkSvgEl);
    this.hint = h('div', { class: 'board-hint', hidden: true, html: '<b>Ein leeres Whiteboard</b>Doppelklick oder Doppeltipp auf die Fläche legt eine Karte an. Links findest du Stift, Bibliothek und Unter-Whiteboards.' });
    this.vp.append(this.world, this.hint);
    this.vtool = h('div', { class: 'vtool', role: 'toolbar', 'aria-label': 'Werkzeuge', 'aria-orientation': 'vertical' });
    this.flyout = h('div', { class: 'vflyout', hidden: true });
    this.selbar = h('div', { class: 'selbar', hidden: true });
    this.zoomLabel = h('button', { class: 'pct', type: 'button', title: 'Auf 100 % setzen', onclick: () => this.zoomTo(1) });
    const zoombar = h('div', { class: 'zoombar' },
      iconBtn('zout', 'Verkleinern', () => this.zoomBy(1 / 1.25)), this.zoomLabel, iconBtn('zin', 'Vergrößern', () => this.zoomBy(1.25)),
      iconBtn('fit', 'Alles zeigen', () => this.fit()));
    this.mmCanvas = h('canvas', { class: 'mm-canvas' });
    this.minimap = h('div', { class: 'minimap', title: 'Übersicht: tippen oder ziehen zum Springen', role: 'img', 'aria-label': 'Übersichtskarte des Whiteboards' }, this.mmCanvas);
    this.wrap = h('div', { class: 'vp-wrap' }, this.vp, this.vtool, this.flyout, this.minimap, zoombar, this.selbar);
    const root = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, head, this.wrap);
    $('#main').replaceChildren(root); this.root = root;
    this.renderToolbar();
    this.bindEvents(); this.bindMinimap();
    this.syncToolClass();
    this.renderAll();
    if (!hadView) requestAnimationFrame(() => this.fit(true)); else this.applyView();
    refreshUndoButtons();
  },
  unmount() { if (this.ro) this.ro.disconnect(); this.boardId = null; this.root = null; this.els.clear(); },
  breadcrumb() {
    const b = this.board(); const chain = boardChain(b);
    const wrap = h('nav', { class: 'crumbs', 'aria-label': 'Pfad' }, h('span', { class: 'crumb-ic', html: icon('board', 18) }));
    const folder = S.folders.get(rootOf(b).folderId);
    const parts = [];
    if (folder) parts.push(h('span', { class: 'crumb muted', text: folder.name }));
    const shown = chain.length > 2 ? [chain[0], null, chain[chain.length - 1]] : chain;
    for (const a of shown) parts.push(a ? h('button', { class: 'crumb', type: 'button', text: a.name || 'Ohne Namen', title: 'Zu „' + (a.name || 'Ohne Namen') + '“', onclick: () => navigate({ type: 'board', id: a.id }) }) : h('span', { class: 'crumb muted', text: '…' }));
    const name = h('input', { class: 'crumb-input', id: 'boardName', 'aria-label': 'Name des Whiteboards', value: b.name, maxlength: '120', size: String(Math.max(6, b.name.length + 1)) });
    name.addEventListener('input', () => { const bb = this.board(); if (!bb) return; bb.name = name.value; name.size = Math.max(6, name.value.length + 1); touch(bb); renderSidebarSoon(); });
    name.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); name.blur(); } });
    parts.push(name);
    parts.forEach((p, i) => { if (i) wrap.append(h('span', { class: 'crumb-sep' + (i === 1 && folder ? ' fold' : ''), text: '/' })); wrap.append(p); });
    return wrap;
  },
  refreshBreadcrumb() {
    const old = this.root && $('.crumbs', this.root); const n = $('#boardName');
    if (old && this.board() && document.activeElement !== n) old.replaceWith(this.breadcrumb());
  },

  // --- Werkzeuge ---
  renderToolbar() {
    if (!this.vtool) return;
    const t = UI.tool;
    const tb = (name, label, on, active) => { const b = iconBtn(name, label, on, active ? 'active' : ''); b.dataset.tool = name; b.setAttribute('aria-pressed', active ? 'true' : 'false'); return b; };
    const u = iconBtn('undo', 'Rückgängig (⌘Z)', () => Undo.undo()); u.dataset.act = 'undo';
    const r = iconBtn('redo', 'Wiederholen (⇧⌘Z)', () => Undo.redo()); r.dataset.act = 'redo';
    this.vtool.replaceChildren(
      tb('select', 'Auswählen (V)', () => this.setTool('select'), t === 'select'),
      iconBtn('card', 'Neue Karte (N)', () => this.addNewCard()),
      iconBtn('cards', 'Karte aus der Bibliothek', () => this.addFromLibrary()),
      iconBtn('subboard', 'Neues Whiteboard in diesem Whiteboard', () => this.addSubBoard()),
      h('span', { class: 'vsep' }),
      tb('pen', 'Stift (P)', () => this.setTool('pen'), t === 'pen'),
      tb('hl', 'Textmarker (H)', () => this.setTool('hl'), t === 'hl'),
      tb('eraser', 'Radierer (E)', () => this.setTool('eraser'), t === 'eraser'),
      tb('connect', 'Verbinden (C)', () => this.setTool('connect'), t === 'connect'),
      h('span', { class: 'vsep' }), u, r);
    refreshUndoButtons();
    this.renderFlyout();
  },
  renderFlyout() {
    const t = UI.tool, fl = this.flyout; if (!fl) return;
    if (t !== 'pen' && t !== 'hl') { fl.hidden = true; return; }
    fl.replaceChildren(inkStyleControls(t === 'hl', () => this.renderFlyout()));
    fl.hidden = false;
    const btn = this.vtool.querySelector(`[data-tool="${t}"]`); if (!btn) return;
    const wr = this.wrap.getBoundingClientRect(), br = btn.getBoundingClientRect();
    fl.style.left = (br.right - wr.left + 12) + 'px'; fl.style.top = (br.top - wr.top + br.height / 2) + 'px';
  },
  setTool(t) {
    this.endInlineEdit();
    UI.tool = t; this.cancelConnect(); if (t !== 'select') this.select(null);
    this.syncToolClass(); saveUiPrefs(); this.renderToolbar();
    if (t === 'connect') toast('Erst die Startkarte antippen, dann die Zielkarte');
  },
  syncToolClass() { if (this.vp) this.vp.className = 'viewport tool-' + UI.tool; },

  // --- Darstellung ---
  renderAll() { this.renderItems(); this.renderInk(); this.renderHint(); this.layoutSoon(); },
  renderHint() { const b = this.board(); if (this.hint) this.hint.hidden = !!(b && (b.items.length || b.ink.length)); },
  classFor(it, kind, ent) {
    const ref = it.cardId || it.boardId;
    return 'bitem ' + (kind === 'card' ? 'bcard ' + colorClass(ent.color) : 'bboard') + (it.h ? '' : ' auto') +
      (UI.sel && UI.sel.id === ref ? ' sel' : '') + (ref === this.editingId ? ' editing' : '') + (this.connectFrom === ref ? ' connect-src' : '');
  },
  renderItems() {
    const b = this.board(); if (!b || !this.itemsLayer) return;
    const seen = new Set(); const order = [];
    for (const it of b.items) {
      const ref = it.cardId || it.boardId, kind = it.cardId ? 'card' : 'board';
      const ent = kind === 'card' ? S.cards.get(ref) : S.boards.get(ref);
      if (!ent || seen.has(ref)) continue;
      seen.add(ref);
      let el = this.els.get(ref);
      if (!el) {
        el = h('div', { 'data-ref': ref, 'data-kind': kind }, h('div', { class: 'bc-body' }), h('div', { class: 'fade' }), h('div', { class: 'bcard-resize', title: 'Größe ändern' }));
        this.itemsLayer.append(el); this.els.set(ref, el); el._ver = null;
        if (this.ro) this.ro.observe(el);
      }
      order.push(el);
      this.placeItem(el, it);
      const wasDragging = el.classList.contains('dragging');
      el.className = this.classFor(it, kind, ent); if (wasDragging) el.classList.add('dragging');
      const ver = kind === 'card' ? String(ent.v) : ent.v + ':' + ent.items.length;
      if (ref === this.editingId) { el._ver = ver; continue; }
      if (el._ver !== ver) { el._ver = ver; el.firstChild.replaceChildren(kind === 'card' ? renderCardContent(ent) : boardTile(ent)); }
      this.updateClip(el);
    }
    for (const [ref, el] of this.els) if (!seen.has(ref)) { if (this.ro) this.ro.unobserve(el); el.remove(); this.els.delete(ref); }
    // Reihenfolge nur anfassen, wenn sie abweicht (sonst verliert ein Textfeld den Fokus)
    const kids = this.itemsLayer.children; let same = kids.length === order.length;
    if (same) for (let i = 0; i < order.length; i++) if (kids[i] !== order[i]) { same = false; break; }
    if (!same) for (const el of order) this.itemsLayer.append(el);
    this.layoutSoon();
  },
  placeItem(el, it) { el.style.transform = `translate(${it.x}px,${it.y}px)`; el.style.width = it.w + 'px'; el.style.height = it.h ? it.h + 'px' : ''; },
  updateClip(el) { if (el.classList.contains('editing')) { el.classList.remove('clip'); return; } el.classList.toggle('clip', el.firstChild.scrollHeight > el.clientHeight + 2); },
  layoutSoon() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; if (!this.root) return; this.renderArrows(); this.positionSelbar(); for (const el of this.els.values()) this.updateClip(el); this.renderMinimap(); });
  },
  renderInk() {
    const b = this.board(); if (!b || !this.inkG) return;
    this.inkG.replaceChildren();
    for (const st of b.ink) { const p = strokeEl(st); st._el = p; this.inkG.append(p); }
    this.renderHint(); this.minimapSoon();
  },
  itemRect(ref) {
    const it = this.itemOf(ref); if (!it) return null;
    const el = this.els.get(ref); return { x: it.x, y: it.y, w: it.w, h: el ? el.offsetHeight : (it.h || 160) };
  },
  cardRect(ref) { return this.itemRect(ref); },
  renderArrows() {
    const b = this.board(); if (!b || !this.arrowsG) return;
    this.arrowsG.replaceChildren(); this.arrowMid = {};
    for (const a of b.arrows) {
      const ra = this.itemRect(a.from), rb = this.itemRect(a.to); if (!ra || !rb) continue;
      const { d, mid } = connPath(ra, rb); this.arrowMid[a.id] = mid;
      const sel = UI.sel && UI.sel.type === 'arrow' && UI.sel.id === a.id;
      const g = sv('g', { class: 'arrow' + (sel ? ' sel' : '') });
      const line = sv('path', { d, class: 'arrow-line' }); if (a.head) line.setAttribute('marker-end', sel ? 'url(#ahs)' : 'url(#ah)');
      g.append(line, sv('path', { d, class: 'arrow-hit', 'data-arrow': a.id }));
      this.arrowsG.append(g);
    }
  },
  applyView() {
    const v = this.view(); if (!this.world) return;
    this.world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
    if (this.zoomLabel) this.zoomLabel.textContent = Math.round(v.z * 100) + ' %';
    this.positionSelbar(); this.minimapSoon();
    saveUiPrefs();
  },
  toWorld(cx, cy) { const r = this.vp.getBoundingClientRect(), v = this.view(); return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z]; },
  zoomAt(z, cx, cy) {
    const v = this.view(), r = this.vp.getBoundingClientRect();
    z = clamp(z, 0.08, 4); const sx = cx - r.left, sy = cy - r.top;
    const wx = (sx - v.x) / v.z, wy = (sy - v.y) / v.z;
    v.z = z; v.x = sx - wx * z; v.y = sy - wy * z; this.applyView();
  },
  zoomBy(f) { const r = this.vp.getBoundingClientRect(); this.zoomAt(this.view().z * f, r.left + r.width / 2, r.top + r.height / 2); },
  zoomTo(z) { const r = this.vp.getBoundingClientRect(); this.zoomAt(z, r.left + r.width / 2, r.top + r.height / 2); },
  contentBounds() {
    const b = this.board(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of b.items) { const rc = this.itemRect(it.cardId || it.boardId); if (!rc || !this.els.has(it.cardId || it.boardId)) continue; x0 = Math.min(x0, rc.x); y0 = Math.min(y0, rc.y); x1 = Math.max(x1, rc.x + rc.w); y1 = Math.max(y1, rc.y + rc.h); }
    for (const st of b.ink) { x0 = Math.min(x0, st.bb[0]); y0 = Math.min(y0, st.bb[1]); x1 = Math.max(x1, st.bb[2]); y1 = Math.max(y1, st.bb[3]); }
    return isFinite(x0) ? { x0, y0, x1, y1 } : null;
  },
  fit(initial) {
    const b = this.board(); if (!b || !this.vp) return;
    const bb = this.contentBounds(); const r = this.vp.getBoundingClientRect(); const v = this.view();
    if (!bb) { v.x = r.width / 2; v.y = r.height / 2; v.z = 1; this.applyView(); return; }
    const { x0, y0, x1, y1 } = bb;
    const left = r.width < 600 ? 60 : 80, right = r.width < 600 ? 16 : 40, top = 30, bottom = 40;
    const z = clamp(Math.min((r.width - left - right) / (x1 - x0), (r.height - top - bottom) / (y1 - y0)), initial ? 0.5 : 0.08, initial ? 1 : 2);
    v.z = z;
    v.x = (x1 - x0) * z > r.width - left - right ? left - x0 * z : left + (r.width - left - right - (x1 - x0) * z) / 2 - x0 * z;
    v.y = (y1 - y0) * z > r.height - top - bottom ? top - y0 * z : top + (r.height - top - bottom - (y1 - y0) * z) / 2 - y0 * z;
    this.applyView();
  },
  viewCenter() { const r = this.vp.getBoundingClientRect(); return this.toWorld(r.left + r.width / 2, r.top + r.height / 2); },
  centerOn(ref) {
    const rc = this.itemRect(ref); if (!rc) return; const v = this.view(); const r = this.vp.getBoundingClientRect();
    v.x = r.width / 2 - (rc.x + rc.w / 2) * v.z; v.y = r.height / 2 - (rc.y + rc.h / 2) * v.z; this.applyView();
  },

  // --- Minikarte ---
  minimapSoon() { if (this._mmRaf) return; this._mmRaf = requestAnimationFrame(() => { this._mmRaf = 0; this.renderMinimap(); }); },
  renderMinimap() {
    const mm = this.minimap, cv = this.mmCanvas; if (!mm || !this.root || mm.offsetParent === null) return;
    const W = mm.clientWidth, H = mm.clientHeight; if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const b = this.board(); const v = this.view(), r = this.vp.getBoundingClientRect();
    const vw = { x: -v.x / v.z, y: -v.y / v.z, w: r.width / v.z, h: r.height / v.z };
    if (!this.mmDrag || !this.mmT) {
      let x0 = vw.x, y0 = vw.y, x1 = vw.x + vw.w, y1 = vw.y + vw.h;
      const cb = this.contentBounds(); if (cb) { x0 = Math.min(x0, cb.x0); y0 = Math.min(y0, cb.y0); x1 = Math.max(x1, cb.x1); y1 = Math.max(y1, cb.y1); }
      const pad = 8; const s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
      this.mmT = { s, ox: pad + ((W - pad * 2) - (x1 - x0) * s) / 2 - x0 * s, oy: pad + ((H - pad * 2) - (y1 - y0) * s) / 2 - y0 * s };
    }
    const { s, ox, oy } = this.mmT; const cs = getComputedStyle(this.root);
    ctx.fillStyle = cs.getPropertyValue('--mm-item').trim() || '#ccc';
    for (const it of b.items) { const rc = this.itemRect(it.cardId || it.boardId); if (!rc || !this.els.has(it.cardId || it.boardId)) continue; ctx.fillRect(ox + rc.x * s, oy + rc.y * s, Math.max(1.5, rc.w * s), Math.max(1.5, rc.h * s)); }
    ctx.strokeStyle = cs.getPropertyValue('--accent').trim() || '#2f6fed'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + vw.x * s, oy + vw.y * s, vw.w * s, vw.h * s);
  },
  bindMinimap() {
    const go = e => {
      const t = this.mmT; if (!t) return; const r = this.mmCanvas.getBoundingClientRect();
      const wx = (e.clientX - r.left - t.ox) / t.s, wy = (e.clientY - r.top - t.oy) / t.s;
      const v = this.view(), vr = this.vp.getBoundingClientRect(); v.x = vr.width / 2 - wx * v.z; v.y = vr.height / 2 - wy * v.z; this.applyView();
    };
    this.minimap.addEventListener('pointerdown', e => { e.preventDefault(); this.mmDrag = true; try { this.minimap.setPointerCapture(e.pointerId); } catch (err) {} go(e); });
    this.minimap.addEventListener('pointermove', e => { if (this.mmDrag) go(e); });
    const up = () => { this.mmDrag = false; this.minimapSoon(); };
    this.minimap.addEventListener('pointerup', up); this.minimap.addEventListener('pointercancel', up);
  },

  // --- Auswahl ---
  select(sel) {
    UI.sel = sel;
    for (const [ref, el] of this.els) el.classList.toggle('sel', !!(sel && sel.id === ref));
    this.renderArrows(); this.renderSelbar();
  },
  renderSelbar() {
    const bar = this.selbar; if (!bar) return;
    const sel = UI.sel; bar.replaceChildren();
    if (!sel) { bar.hidden = true; return; }
    const b = this.board();
    const btn = (ic, label, onclick, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', html: (ic ? icon(ic, 16) : '') + '<span>' + label + '</span>', onclick });
    if (sel.type === 'arrow') {
      const a = b.arrows.find(x => x.id === sel.id); if (!a) { bar.hidden = true; return; }
      bar.append(btn('right', a.head ? 'Pfeilspitze entfernen' : 'Pfeilspitze zeigen', () => { a.head = !a.head; touch(b); this.renderArrows(); this.renderSelbar(); }),
        btn('trash', 'Verbindung löschen', () => this.deleteSelection(), 'danger'));
    } else if (sel.type === 'board') {
      const sub = S.boards.get(sel.id); if (!sub) { bar.hidden = true; return; }
      bar.append(btn('open', 'Öffnen', () => navigate({ type: 'board', id: sub.id })),
        btn('', 'Herauslösen', () => detachBoard(sub)),
        btn('trash', 'Whiteboard löschen', () => deleteBoard(sub), 'danger'));
    } else {
      const card = S.cards.get(sel.id); if (!card) { bar.hidden = true; return; }
      const it = this.itemOf(sel.id);
      if (this.editingId === sel.id) {
        bar.append(btn('open', 'Im Seitenpanel öffnen', () => Editor.open(sel.id)), btn('check', 'Fertig', () => this.endInlineEdit()));
      } else {
        bar.append(btn('pen', 'Bearbeiten', () => this.startInlineEdit(sel.id)), btn('open', 'Seitenpanel', () => Editor.open(sel.id)));
        for (const c of CARD_COLORS) {
          const s = h('button', { class: 'swatch' + (card.color === c ? ' active' : ''), type: 'button', title: 'Farbe ' + CARD_NAMES[c], 'aria-label': 'Kartenfarbe ' + CARD_NAMES[c],
            onclick: () => { card.color = c; touch(card); refreshCardEverywhere(card.id); this.renderSelbar(); } });
          const i = h('i'); i.style.background = `var(--card-${c})`; s.append(i); bar.append(s);
        }
        bar.append(btn('present', 'Zur Präsentation', () => addCardsToPresentation([sel.id])));
        if (it && it.h) bar.append(btn('', 'Höhe automatisch', () => { it.h = null; touch(b); this.renderItems(); this.renderSelbar(); }));
        bar.append(btn('', 'Vom Whiteboard entfernen', () => this.deleteSelection(), 'danger'));
      }
    }
    bar.hidden = false; this.positionSelbar();
  },
  positionSelbar() {
    const bar = this.selbar, sel = UI.sel; if (!bar || bar.hidden || !sel || !this.vp) return;
    const v = this.view(); const vr = this.vp.getBoundingClientRect();
    let x, y, y2;
    if (sel.type === 'arrow') { const m = this.arrowMid && this.arrowMid[sel.id]; if (!m) return; x = v.x + m[0] * v.z; y = v.y + m[1] * v.z; y2 = y + 16; }
    else { const rc = this.itemRect(sel.id); if (!rc) return; x = v.x + (rc.x + rc.w / 2) * v.z; y = v.y + rc.y * v.z; y2 = v.y + (rc.y + rc.h) * v.z; }
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let top = y - bh - 12; if (top < 8) top = Math.min(y2 + 12, vr.height - bh - 8);
    bar.style.left = clamp(x - bw / 2, 8, Math.max(8, vr.width - bw - 8)) + 'px'; bar.style.top = Math.max(8, top) + 'px';
  },
  deleteSelection() {
    const b = this.board(), sel = UI.sel; if (!b || !sel) return;
    if (sel.type === 'arrow') b.arrows = b.arrows.filter(a => a.id !== sel.id);
    else if (sel.type === 'board') { const sub = S.boards.get(sel.id); if (sub) { detachBoard(sub); return; } }
    else {
      if (this.editingId === sel.id) this.endInlineEdit(true);
      b.items = b.items.filter(i => i.cardId !== sel.id); b.arrows = b.arrows.filter(a => a.from !== sel.id && a.to !== sel.id);
    }
    touch(b); this.select(null); this.renderItems(); this.renderHint(); renderSidebarSoon();
  },
  cancelConnect() { if (this.connectFrom) { const el = this.els.get(this.connectFrom); if (el) el.classList.remove('connect-src'); } this.connectFrom = null; },

  // --- Karten direkt auf dem Board bearbeiten ---
  startInlineEdit(cardId, isNew) {
    if (this.editingId === cardId) return;
    this.endInlineEdit();
    const card = S.cards.get(cardId), el = this.els.get(cardId); if (!card || !el) return;
    if (Editor.cardId === cardId) Editor.close();
    if (UI.tool !== 'select') { UI.tool = 'select'; this.cancelConnect(); this.syncToolClass(); this.renderToolbar(); saveUiPrefs(); }
    this.editingId = cardId; this.editingNew = !!isNew;
    if (!card.blocks.some(b => b.type === 'text')) card.blocks.unshift({ id: newId(), type: 'text', html: '' });
    const title = h('input', { class: 'ie-title', placeholder: 'Titel', value: card.title, maxlength: '300', 'aria-label': 'Titel der Karte' });
    title.addEventListener('input', () => this.inlineSave());
    title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const t = $('.ie-text', el); if (t) placeCaretEnd(t); } });
    const parts = [title];
    for (const b of card.blocks) {
      if (b.type === 'text') {
        const t = h('div', { class: 'ie-text', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Text', 'data-block': b.id, 'data-ph': 'Schreibe hier …' });
        t.innerHTML = b.html;
        t.addEventListener('input', () => { if (t.innerHTML === '<br>') t.innerHTML = ''; this.inlineSave(); });
        t.addEventListener('paste', pastePlain);
        parts.push(t);
      } else if (b.type === 'ink') parts.push(b.strokes.length ? inkSvg(b, true) : h('div', { class: 'ie-note', text: 'Leeres Handschrift-Feld: im Seitenpanel beschreiben' }));
      else if (b.type === 'image') parts.push(h('img', { class: 'cc-img', src: b.src, alt: '', draggable: 'false' }));
    }
    const expand = h('button', { class: 'ie-expand icon-btn', type: 'button', title: 'Im Seitenpanel öffnen (Handschrift, Bilder)', 'aria-label': 'Im Seitenpanel öffnen', html: icon('open', 15), onclick: () => Editor.open(cardId) });
    el.firstChild.replaceChildren(h('div', { class: 'bc-grip', title: 'Hier ziehen zum Verschieben' }), h('div', { class: 'ie' }, ...parts), expand);
    el.className = this.classFor(this.itemOf(cardId), 'card', card);
    this.select({ type: 'card', id: cardId });
    setTimeout(() => {
      if (this.editingId !== cardId) return;
      if (isNew || !card.title) title.focus({ preventScroll: true });
      else { const t = $('.ie-text', el); if (t) placeCaretEnd(t); else title.focus({ preventScroll: true }); }
    }, 0);
  },
  inlineSave: null,
  flushInline() {
    const id = this.editingId; if (!id) return;
    const card = S.cards.get(id), el = this.els.get(id); if (!card || !el) return;
    let changed = false;
    const ti = $('.ie-title', el); if (ti && ti.value !== card.title) { card.title = ti.value; changed = true; }
    for (const t of $$('.ie-text', el)) {
      const b = card.blocks.find(x => x.id === t.dataset.block); if (!b) continue;
      const html = sanitizeHtml(t.innerHTML); if (html !== b.html) { b.html = html; changed = true; }
    }
    if (changed) { touch(card); el._ver = String(card.v); renderSidebarSoon(); }
  },
  endInlineEdit(keep) {
    const id = this.editingId; if (!id) return;
    if (this.inlineSave) this.inlineSave.cancel();
    this.flushInline();
    const el = this.els.get(id);
    if (el && document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    this.editingId = null; const wasNew = this.editingNew; this.editingNew = false;
    const card = S.cards.get(id);
    if (card && wasNew && !keep && cardIsEmpty(card)) {
      const b = this.board(); if (b) { b.items = b.items.filter(i => i.cardId !== id); b.arrows = b.arrows.filter(a => a.from !== id && a.to !== id); touch(b); }
      if (Persist.dirty.has('c_' + id) || Persist.remoteV.has('c_' + id)) { removeEntityLocal('c_' + id, stamp()); Persist.mark('c_' + id); }
      else S.cards.delete(id);
      if (UI.sel && UI.sel.id === id) UI.sel = null;
      renderSidebarSoon();
    }
    if (el) el._ver = null;
    if (this.root) { this.renderItems(); this.renderHint(); this.renderSelbar(); }
  },

  // --- Inhalte hinzufügen ---
  placeCardOnBoard(cardId, at) {
    const b = this.board(); if (!b) return false;
    if (b.items.some(i => i.cardId === cardId)) { this.select({ type: 'card', id: cardId }); this.centerOn(cardId); return false; }
    const [cx, cy] = at || this.viewCenter();
    b.items.push({ cardId, x: Math.round(cx - 150), y: Math.round(cy - 60), w: 300, h: null });
    touch(b); this.renderItems(); this.renderHint(); renderSidebarSoon();
    return true;
  },
  addNewCard(at) {
    this.endInlineEdit();
    if (UI.tool !== 'select') { UI.tool = 'select'; this.cancelConnect(); this.syncToolClass(); this.renderToolbar(); saveUiPrefs(); }
    const c = newCard(); setEntity(c);
    let x, y; if (at) { x = at[0] - 24; y = at[1] - 18; } else { const [cx, cy] = this.viewCenter(); x = cx - 150; y = cy - 60; }
    const b = this.board(); b.items.push({ cardId: c.id, x: Math.round(x), y: Math.round(y), w: 300, h: null }); touch(b);
    this.renderItems(); this.renderHint();
    this.startInlineEdit(c.id, true);
  },
  async addFromLibrary() {
    this.endInlineEdit();
    const b = this.board(); const onBoard = new Set(b.items.map(i => i.cardId).filter(Boolean));
    const ids = await pickCards({ title: 'Karten auf das Whiteboard legen', multi: true, exclude: onBoard, okLabel: 'Hinzufügen' });
    if (!ids || !ids.length) return;
    let [cx, cy] = this.viewCenter(); cx -= (ids.length - 1) * 15; cy -= (ids.length - 1) * 15;
    ids.forEach((id, i) => this.placeCardOnBoard(id, [cx + i * 30, cy + i * 30]));
  },
  addSubBoard() {
    this.endInlineEdit();
    const b = this.board(); const nb = newBoard('Neues Whiteboard', { parentId: b.id }); setEntity(nb); touch(nb);
    const [cx, cy] = this.viewCenter();
    b.items.push({ boardId: nb.id, x: Math.round(cx - 130), y: Math.round(cy - 80), w: 260, h: null }); touch(b);
    UI.collapsed = UI.collapsed.filter(x => x !== b.id);
    this.renderItems(); this.renderHint(); this.select({ type: 'board', id: nb.id }); renderSidebarSoon();
    toast('Doppelklick öffnet das neue Whiteboard');
  },
  makePresentation() {
    const b = this.board();
    const rows = b.items.filter(i => i.cardId && S.cards.has(i.cardId)).map(i => ({ id: i.cardId, x: i.x, y: i.y }));
    if (!rows.length) { toast('Auf diesem Whiteboard liegen noch keine Karten.'); return; }
    rows.sort((a, c) => (Math.abs(a.y - c.y) < 120 ? a.x - c.x : a.y - c.y));
    const p = newPres(b.name); p.cardIds = rows.map(r => r.id); setEntity(p); touch(p);
    navigate({ type: 'pres', id: p.id }); toast(`Präsentation mit ${p.cardIds.length} Karten erstellt. Reihenfolge links anpassen.`);
  },
  moreMenu(anchor) {
    const b = this.board();
    const items = [{ label: 'Präsentation aus diesem Whiteboard', onClick: () => this.makePresentation() }];
    if (!b.parentId || !S.boards.has(b.parentId)) items.push({ label: 'In Ordner verschieben …', onClick: () => moveBoardToFolder(b) });
    else items.push({ label: 'Aus dem übergeordneten Whiteboard herauslösen', onClick: () => detachBoard(b) });
    items.push({ label: 'Handschrift auf dem Whiteboard löschen', onClick: () => { if (!b.ink.length) return; const strokes = b.ink.slice(); b.ink.length = 0; Undo.push({ target: { kind: 'board', id: b.id }, op: 'remove', strokes }); touch(b); this.renderInk(); } });
    items.push({ label: 'Whiteboard löschen', danger: true, onClick: () => deleteBoard(b) });
    openMenu(anchor, items);
  },

  // --- Zeiger-Ereignisse ---
  bindEvents() {
    const vp = this.vp;
    vp.addEventListener('pointerdown', e => this.onDown(e));
    vp.addEventListener('pointermove', e => this.onMove(e));
    vp.addEventListener('pointerup', e => this.onUp(e));
    vp.addEventListener('pointercancel', e => this.onUp(e, true));
    vp.addEventListener('lostpointercapture', e => { if (this.pointers.has(e.pointerId)) this.onUp(e, true); });
    vp.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    vp.addEventListener('contextmenu', e => { if (!e.target.closest('.editing')) e.preventDefault(); });
    // Safari (Mac-Trackpad): Pinch kommt als gesture-Ereignis
    vp.addEventListener('gesturestart', e => { e.preventDefault(); if (this.touchCount()) return; this.gestureZoom = { z: this.view().z }; });
    vp.addEventListener('gesturechange', e => { e.preventDefault(); if (!this.gestureZoom || this.touchCount()) return; this.zoomAt(this.gestureZoom.z * e.scale, e.clientX, e.clientY); });
    vp.addEventListener('gestureend', e => { e.preventDefault(); this.gestureZoom = null; });
  },
  touchCount() { let n = 0; for (const p of this.pointers.values()) if (p.type === 'touch') n++; return n; },
  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    // Klick in eine gerade bearbeitete Karte: normales Textverhalten
    const editEl = e.target.closest('.bitem.editing');
    if (editEl && !e.target.closest('.bcard-resize, .bc-grip')) return;
    // Handballen ignorieren, solange der Stift zeichnet
    if (e.pointerType === 'touch' && this.gesture && this.gesture.pointerType === 'pen') return;
    if (this.editingId && !editEl) this.endInlineEdit();
    try { this.vp.setPointerCapture(e.pointerId); } catch (err) {}
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'touch' && this.touchCount() >= 2) { this.abortGesture(); this.startPinch(); return; }
    if (this.gesture) {
      if (e.pointerType === 'pen' && this.gesture.pointerType === 'touch') this.abortGesture();
      else return;
    }
    const tool = UI.tool, drawTool = tool === 'pen' || tool === 'hl' || tool === 'eraser';
    if (e.button === 1) { this.startPan(e); return; }
    if (drawTool) { if (pointerMayDraw(e)) this.startInk(e); else this.startPan(e); return; }
    const itemEl = e.target.closest('.bitem'); const ref = itemEl && itemEl.dataset.ref, kind = itemEl && itemEl.dataset.kind;
    const arrowId = e.target.getAttribute && e.target.getAttribute('data-arrow');
    if (tool === 'connect') { if (ref && this.els.has(ref)) this.connectTap(ref); else { this.cancelConnect(); this.startPan(e); } return; }
    if (itemEl && e.target.closest('.bcard-resize')) { this.startResize(e, ref); return; }
    if (itemEl) { this.startItemDrag(e, ref, kind); return; }
    if (arrowId) { this.select({ type: 'arrow', id: arrowId }); this.gesture = { type: 'none', id: e.pointerId, pointerType: e.pointerType }; return; }
    this.startPan(e, true);
  },
  onMove(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const g = this.gesture; if (!g) return;
    if (g.type === 'pinch') { this.updatePinch(); return; }
    if (g.id !== e.pointerId) return;
    if (g.type === 'ink') {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      for (const ev of (evs && evs.length ? evs : [e])) { const [x, y] = this.toWorld(ev.clientX, ev.clientY); g.ink.add(x, y, penPressure(ev)); }
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) > 4) g.moved = true;
    const v = this.view();
    if (g.type === 'pan') { if (g.moved) { v.x = g.vx + dx; v.y = g.vy + dy; this.vp.classList.add('panning'); this.applyView(); } }
    else if (g.type === 'drag' && g.moved) {
      g.it.x = Math.round(g.ox + dx / v.z); g.it.y = Math.round(g.oy + dy / v.z);
      this.placeItem(g.el, g.it); g.el.classList.add('dragging'); this.renderArrows(); this.positionSelbar(); this.minimapSoon();
    }
    else if (g.type === 'resize' && g.moved) {
      g.it.w = Math.round(clamp(g.ow + dx / v.z, 180, 1200)); g.it.h = Math.round(clamp(g.oh + dy / v.z, 80, 4000));
      this.placeItem(g.el, g.it); g.el.classList.remove('auto'); this.updateClip(g.el); this.renderArrows(); this.positionSelbar();
    }
  },
  onUp(e, cancelled) {
    const had = this.pointers.delete(e.pointerId);
    const g = this.gesture; if (!g) return;
    if (g.type === 'pinch') { if (this.touchCount() < 2) this.gesture = null; return; }
    if (g.id !== e.pointerId) return;
    this.gesture = null; this.vp.classList.remove('panning');
    if (!had && !cancelled) return;
    if (g.type === 'ink') { if (cancelled) g.ink.cancel(); else { const [x, y] = this.toWorld(e.clientX, e.clientY); g.ink.end(x, y); } return; }
    if (g.type === 'pan') {
      if (!g.moved && g.empty && !cancelled) {
        this.select(null);
        const t = performance.now(), lt = this.lastTap;
        if (lt && lt.empty && t - lt.t < 420 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 28) { this.lastTap = null; this.addNewCard(this.toWorld(e.clientX, e.clientY)); }
        else this.lastTap = { empty: true, t, x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (g.type === 'drag') {
      g.el.classList.remove('dragging');
      if (g.moved) { touch(this.board()); this.layoutSoon(); return; }
      if (cancelled) return;
      const t = performance.now(), lt = this.lastTap;
      if (lt && lt.ref === g.ref && t - lt.t < 420) {
        this.lastTap = null;
        if (g.kind === 'card') this.startInlineEdit(g.ref); else navigate({ type: 'board', id: g.ref });
        return;
      }
      this.lastTap = { ref: g.ref, t };
      if (this.editingId !== g.ref) this.select({ type: g.kind, id: g.ref });
      return;
    }
    if (g.type === 'resize' && g.moved) { touch(this.board()); this.layoutSoon(); }
  },
  abortGesture() {
    const g = this.gesture; if (!g) return;
    if (g.type === 'ink') g.ink.cancel();
    if (g.type === 'drag' && g.moved) { g.it.x = g.ox; g.it.y = g.oy; this.placeItem(g.el, g.it); g.el.classList.remove('dragging'); this.renderArrows(); }
    this.gesture = null; this.vp.classList.remove('panning');
  },
  startPan(e, empty) { const v = this.view(); this.gesture = { type: 'pan', id: e.pointerId, pointerType: e.pointerType, sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false, empty: !!empty }; },
  startInk(e) {
    const b = this.board(); const v = this.view();
    const ink = new InkGesture({ tool: UI.tool, layer: this.liveG, strokes: b.ink, scale: 1 / v.z, target: { kind: 'board', id: b.id },
      onDone: st => { if (st) { const p = strokeEl(st); st._el = p; this.inkG.append(p); } touch(b); this.renderHint(); this.minimapSoon(); } });
    this.gesture = { type: 'ink', id: e.pointerId, pointerType: e.pointerType, ink };
    const [x, y] = this.toWorld(e.clientX, e.clientY); ink.add(x, y, penPressure(e));
  },
  startItemDrag(e, ref, kind) {
    const b = this.board(); const idx = b.items.findIndex(i => (i.cardId || i.boardId) === ref); if (idx < 0) return;
    const it = b.items[idx]; const el = this.els.get(ref);
    if (idx !== b.items.length - 1) { b.items.splice(idx, 1); b.items.push(it); if (!el.classList.contains('editing')) this.itemsLayer.append(el); }
    this.gesture = { type: 'drag', id: e.pointerId, pointerType: e.pointerType, ref, kind, it, el, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
  },
  startResize(e, ref) {
    const it = this.itemOf(ref); const el = this.els.get(ref);
    this.gesture = { type: 'resize', id: e.pointerId, pointerType: e.pointerType, ref, it, el, sx: e.clientX, sy: e.clientY, ow: it.w, oh: it.h || el.offsetHeight, moved: false };
  },
  startPinch() {
    const ts = [...this.pointers.values()].filter(p => p.type === 'touch').slice(0, 2);
    const v = this.view();
    this.gesture = { type: 'pinch', d0: Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y) || 1, m0: [(ts[0].x + ts[1].x) / 2, (ts[0].y + ts[1].y) / 2], v0: { ...v } };
  },
  updatePinch() {
    const g = this.gesture; const ts = [...this.pointers.values()].filter(p => p.type === 'touch').slice(0, 2); if (ts.length < 2) return;
    const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y) || 1; const m = [(ts[0].x + ts[1].x) / 2, (ts[0].y + ts[1].y) / 2];
    const r = this.vp.getBoundingClientRect(); const v = this.view();
    const z = clamp(g.v0.z * d / g.d0, 0.08, 4);
    const wx = (g.m0[0] - r.left - g.v0.x) / g.v0.z, wy = (g.m0[1] - r.top - g.v0.y) / g.v0.z;
    v.z = z; v.x = m[0] - r.left - wx * z; v.y = m[1] - r.top - wy * z; this.applyView();
  },
  connectTap(ref) {
    if (!this.connectFrom) { this.connectFrom = ref; const el = this.els.get(ref); if (el) el.classList.add('connect-src'); return; }
    const from = this.connectFrom; this.cancelConnect();
    if (from === ref) return;
    const b = this.board();
    if (b.arrows.some(a => (a.from === from && a.to === ref) || (a.from === ref && a.to === from))) { toast('Diese Verbindung gibt es schon'); return; }
    b.arrows.push({ id: newId(), from, to: ref, head: false }); touch(b); this.renderArrows();
  },
  onWheel(e) {
    if (e.target.closest('.bitem.editing') && !(e.ctrlKey || e.metaKey)) { const body = e.target.closest('.bc-body'); if (body && body.scrollHeight > body.clientHeight) return; }
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) { if (this.gestureZoom) return; this.zoomAt(this.view().z * Math.exp(-e.deltaY * k * 0.01), e.clientX, e.clientY); }
    else { const v = this.view(); v.x -= e.deltaX * k; v.y -= e.deltaY * k; this.applyView(); }
  },
  onKey(e) {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) Undo.redo(); else Undo.undo(); return true; }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (UI.sel) { e.preventDefault(); this.deleteSelection(); return true; } }
    if (e.key === 'Escape') { this.cancelConnect(); this.select(null); return true; }
    if (e.key === 'Enter' && UI.sel && UI.sel.type === 'card') { e.preventDefault(); this.startInlineEdit(UI.sel.id); return true; }
    if (e.key === 'Enter' && UI.sel && UI.sel.type === 'board') { navigate({ type: 'board', id: UI.sel.id }); return true; }
    if (k === 'n') { e.preventDefault(); this.addNewCard(); return true; }
    const map = { v: 'select', p: 'pen', h: 'hl', e: 'eraser', c: 'connect' };
    if (map[k]) { this.setTool(map[k]); return true; }
    if (k === '+' || k === '=') { this.zoomBy(1.25); return true; }
    if (k === '-') { this.zoomBy(0.8); return true; }
    if (k === '0') { this.fit(); return true; }
    return false;
  },
  refreshCard(cardId) {
    const b = this.board(); if (!b || !b.items.some(i => i.cardId === cardId)) return;
    this.renderItems();
    if (UI.sel && UI.sel.id === cardId) this.renderSelbar();
  }
};
BV.inlineSave = debounce(() => BV.flushInline(), 400);

// ---------- Whiteboards und Ordner verwalten ----------
async function deleteBoard(b) {
  const kids = sortedBoards().filter(x => x.parentId === b.id);
  const ok = await confirmDialog(`„${b.name || 'Ohne Namen'}“ löschen?`, 'Die Karten bleiben in der Bibliothek.' + (kids.length ? ` ${kids.length === 1 ? 'Das Unter-Whiteboard bleibt' : 'Die ' + kids.length + ' Unter-Whiteboards bleiben'} erhalten und rücken eine Ebene nach oben.` : ''), 'Whiteboard löschen');
  if (!ok) return;
  const parent = b.parentId && S.boards.get(b.parentId);
  const folderId = rootOf(b).folderId || null;
  let at = null;
  if (parent) {
    const it = parent.items.find(i => i.boardId === b.id); if (it) at = { x: it.x, y: it.y };
    parent.items = parent.items.filter(i => i.boardId !== b.id); parent.arrows = parent.arrows.filter(a => a.from !== b.id && a.to !== b.id); touch(parent);
  }
  kids.forEach((k, i) => {
    k.parentId = parent ? parent.id : null; k.folderId = parent ? null : folderId; touch(k);
    if (parent) parent.items.push({ boardId: k.id, x: (at ? at.x : 0) + i * 30, y: (at ? at.y : 0) + i * 30, w: 260, h: null });
  });
  if (parent && kids.length) touch(parent);
  removeEntityLocal(keyOf(b), stamp()); Persist.mark(keyOf(b));
  if (UI.view && UI.view.type === 'board' && UI.view.id === b.id) {
    const next = parent || sortedBoards()[0]; navigate(next ? { type: 'board', id: next.id } : { type: 'library' });
  } else onDataChanged(null);
}
function detachBoard(sub) {
  const parent = sub.parentId && S.boards.get(sub.parentId);
  const folderId = parent ? rootOf(parent).folderId || null : sub.folderId;
  if (parent) { parent.items = parent.items.filter(i => i.boardId !== sub.id); parent.arrows = parent.arrows.filter(a => a.from !== sub.id && a.to !== sub.id); touch(parent); }
  sub.parentId = null; sub.folderId = folderId; touch(sub);
  if (UI.sel && UI.sel.id === sub.id) UI.sel = null;
  toast(`„${sub.name}“ ist jetzt ein eigenständiges Whiteboard`);
  onDataChanged(null); if (BV.root) BV.refreshBreadcrumb();
}
async function moveBoardToFolder(b) {
  const opts = [...sortedFolders().map(f => ({ value: f.id, label: f.name, sub: f.id === b.folderId ? 'aktueller Ordner' : '' })), { value: '__none', label: 'Ohne Ordner', sub: '' }, { value: '__new', label: '+ Neuer Ordner …', sub: '' }];
  const choice = await chooseDialog(`„${b.name}“ verschieben nach`, opts); if (!choice) return;
  let fid = choice === '__none' ? null : choice;
  if (choice === '__new') { const f = await createFolder(); if (!f) return; fid = f.id; }
  b.folderId = fid; touch(b); UI.collapsed = UI.collapsed.filter(x => x !== fid);
  renderSidebar(); if (BV.root) BV.refreshBreadcrumb();
}
async function createFolder() {
  const name = await promptDialog('Neuer Ordner', '', 'Anlegen', 'Name des Ordners, z. B. Kunstunterricht'); if (!name) return null;
  const f = newFolder(name); setEntity(f); touch(f); renderSidebar(); return f;
}
async function renameEntity(e, label) {
  const name = await promptDialog(label, e.name, 'Umbenennen'); if (!name) return;
  e.name = name; touch(e); renderSidebar();
  if (BV.root) BV.refreshBreadcrumb();
  if (e.kind === 'board' && BV.root) BV.renderItems();
  if (e.kind === 'pres' && PresView.presId === e.id) PresView.mount(e.id);
}
async function deleteFolder(f) {
  const inside = sortedBoards().filter(b => b.folderId === f.id && !b.parentId);
  if (!(await confirmDialog(`Ordner „${f.name}“ löschen?`, inside.length ? `Die ${inside.length === 1 ? 'Whiteboard bleibt' : inside.length + ' Whiteboards bleiben'} erhalten und stehen danach ohne Ordner in der Liste.` : 'Der Ordner ist leer.', 'Ordner löschen'))) return;
  for (const b of inside) { b.folderId = null; touch(b); }
  for (const b of S.boards.values()) if (b.folderId === f.id && !inside.includes(b)) { b.folderId = null; touch(b); }
  removeEntityLocal(keyOf(f), stamp()); Persist.mark(keyOf(f));
  renderSidebar(); if (BV.root) BV.refreshBreadcrumb();
}
