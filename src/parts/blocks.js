// ---------- Block-Editor (Kartenpanel und direkt auf dem Board) ----------
function placeCaretEnd(el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
function pickFiles(accept, multiple) {
  return new Promise(res => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept || ''; inp.multiple = !!multiple;
    inp.onchange = () => res(Array.from(inp.files || []));
    inp.click();
  });
}
async function filesToBlocks(files) {
  const out = [];
  const big = files.some(f => f.size > 1e6); if (big) toast('Lädt hoch …');
  for (const f of files.slice(0, 12)) {
    try { const b = await Files.toBlock(f); b.id = newId(); out.push(b); }
    catch (e) { toast(`${f.name || 'Datei'} konnte nicht gespeichert werden.`); }
  }
  return out;
}
async function promptUrlBlock(kindHint) {
  const raw = await promptDialog(kindHint === 'embed' ? 'Video-Link einfügen' : 'Link einfügen', '', 'Einfügen', kindHint === 'embed' ? 'https://www.youtube.com/watch?v=…' : 'https://…');
  if (!raw) return null;
  const url = safeUrl(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  if (!url) { toast('Das ist keine gültige Webadresse.'); return null; }
  const v = parseVideoUrl(url);
  if (v) return { id: newId(), type: 'embed', url: v.url, provider: v.provider, vid: v.vid, title: '' };
  if (kindHint === 'embed') toast('Kein YouTube- oder Vimeo-Link erkannt. Ich füge ihn als normalen Link ein.');
  return { id: newId(), type: 'link', url, title: '' };
}
// Losen Text im Textfeld in Absätze packen (Chrome legt die erste Zeile ohne <p> an)
const BLOCK_TAGS = /^(P|DIV|H1|H2|H3|UL|OL|BLOCKQUOTE)$/;
function wrapBareText(el) {
  const bare = n => n.nodeType === 3 ? n.textContent.length > 0 : (n.nodeType === 1 && !BLOCK_TAGS.test(n.tagName));
  if (![...el.childNodes].some(bare)) return;
  const s = getSelection(); const r = s.rangeCount ? s.getRangeAt(0) : null;
  const sn = r && r.startContainer, so = r && r.startOffset;
  let p = null;
  for (const n of [...el.childNodes]) {
    if (n.nodeType === 3 && !n.textContent.length) continue;
    if (bare(n)) { if (!p) { p = document.createElement('p'); el.insertBefore(p, n); } p.append(n); if (n.nodeType === 1 && n.tagName === 'BR') p = null; }
    else p = null;
  }
  if (sn && sn !== el && el.contains(sn)) { const nr = document.createRange(); nr.setStart(sn, Math.min(so, sn.nodeType === 3 ? sn.length : sn.childNodes.length)); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); }
}
// Nächster Absatz (p, h1 …, li) um eine Textstelle
function paraOf(node, root) {
  let p = node && node.nodeType === 3 ? node.parentNode : node;
  while (p && p !== root && !/^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/.test(p.tagName)) p = p.parentNode;
  return p && p !== root ? p : root;
}
const SLASH_ITEMS = [
  { k: 'text', label: 'Text', ic: 'text', kw: 'text absatz paragraph' },
  { k: 'h1', label: 'Überschrift 1', hint: '#', ic: 'h1', kw: 'ueberschrift heading titel h1' },
  { k: 'h2', label: 'Überschrift 2', hint: '##', ic: 'h2', kw: 'ueberschrift heading h2' },
  { k: 'h3', label: 'Überschrift 3', hint: '###', ic: 'h3', kw: 'ueberschrift heading h3' },
  { k: 'ul', label: 'Aufzählung', hint: '-', ic: 'list', kw: 'liste bullet aufzaehlung' },
  { k: 'ol', label: 'Nummerierte Liste', hint: '1.', ic: 'olist', kw: 'liste nummer numbered' },
  { k: 'todo', label: 'To-do-Liste', hint: '[]', ic: 'todo', kw: 'todo aufgabe checkliste checkbox' },
  { k: 'toggle', label: 'Toggle (aufklappbar)', hint: '>>', ic: 'toggle', kw: 'toggle aufklappen einklappen' },
  { k: 'quote', label: 'Zitat', hint: '>', ic: 'quote', kw: 'zitat quote' },
  { k: 'divider', label: 'Trennlinie', hint: '---', ic: 'divider', kw: 'trennlinie linie divider' },
  { k: 'cardlink', label: 'Karte verlinken', hint: '[[', ic: 'cardlink', kw: 'karte link verweis mention' },
  { k: 'image', label: 'Bild', ic: 'image', kw: 'bild foto image' },
  { k: 'file', label: 'Datei (PDF …)', ic: 'file', kw: 'datei pdf anhang file' },
  { k: 'video', label: 'Video-Datei', ic: 'video', kw: 'video film mp4' },
  { k: 'audio', label: 'Audio', ic: 'audio', kw: 'audio ton sprachmemo' },
  { k: 'embed', label: 'Video-Link (YouTube, Vimeo)', ic: 'play', kw: 'youtube vimeo video link einbetten embed' },
  { k: 'link', label: 'Link', ic: 'link', kw: 'link url webseite' },
  { k: 'ink', label: 'Handschrift', ic: 'pen', kw: 'handschrift zeichnen stift pencil' }
];
const isRichField = el => el.dataset.field === 'html' && !el.dataset.item;
const FORMAT_KINDS = new Set(['text', 'h1', 'h2', 'h3', 'ul', 'ol', 'quote']);
// Das „/“-Menü
const Slash = {
  el: null, ed: null, field: null, start: null, idx: 0, items: [],
  open(ed, field, startNode, startOffset) {
    this.close(); this.ed = ed; this.field = field; this.start = { node: startNode, offset: startOffset }; this.idx = 0;
    this.el = h('div', { class: 'slash-menu', role: 'listbox', 'aria-label': 'Bausteine' });
    document.body.append(this.el); this.update();
  },
  query() {
    const s = getSelection(); if (!s.rangeCount || !this.start) return null;
    const r = s.getRangeAt(0); const q = document.createRange();
    try { q.setStart(this.start.node, this.start.offset); q.setEnd(r.startContainer, r.startOffset); } catch (e) { return null; }
    const t = q.toString(); if (!t.startsWith('/')) return null;
    return t.slice(1);
  },
  update() {
    if (!this.el) return;
    const q = this.query();
    if (q == null || /\s/.test(q) || q.length > 24) { this.close(); return; }
    const isHtml = isRichField(this.field);
    const nq = q.toLowerCase().replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c]));
    this.items = SLASH_ITEMS.filter(it => (isHtml || !FORMAT_KINDS.has(it.k)) && (!nq || (it.label.toLowerCase() + ' ' + it.kw).replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c])).includes(nq)));
    if (!this.items.length) { this.close(); return; }
    this.idx = clamp(this.idx, 0, this.items.length - 1);
    this.el.replaceChildren(h('div', { class: 'slash-head', text: 'Bausteine' }), ...this.items.map((it, i) => h('button', { class: 'slash-item' + (i === this.idx ? ' on' : ''), type: 'button', role: 'option',
      onpointerdown: e => e.preventDefault(), onclick: () => this.choose(i) },
      h('span', { class: 'si-ic', html: icon(it.ic, 16) }), h('span', { text: it.label }), it.hint ? h('small', { text: it.hint }) : null)));
    const s = getSelection(); let rect = null;
    if (s.rangeCount) { rect = s.getRangeAt(0).getBoundingClientRect(); if (!rect.width && !rect.height) rect = null; }
    if (!rect) rect = this.field.getBoundingClientRect();
    const mh = Math.min(340, this.el.offsetHeight || 340);
    const below = rect.bottom + 6 + mh < innerHeight;
    this.el.style.left = clamp(rect.left, 8, innerWidth - 290) + 'px';
    this.el.style.top = (below ? rect.bottom + 6 : Math.max(8, rect.top - mh - 6)) + 'px';
    const on = this.el.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  },
  key(e) {
    if (!this.el) return false;
    if (e.key === 'ArrowDown') { this.idx = (this.idx + 1) % this.items.length; this.update(); return true; }
    if (e.key === 'ArrowUp') { this.idx = (this.idx - 1 + this.items.length) % this.items.length; this.update(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { this.choose(this.idx); return true; }
    if (e.key === 'Escape') { this.close(); return true; }
    return false;
  },
  choose(i) {
    const it = this.items[i]; const ed = this.ed, field = this.field;
    const s = getSelection();
    if (s.rangeCount && this.start) { const r = document.createRange(); try { r.setStart(this.start.node, this.start.offset); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); r.deleteContents(); } catch (e) {} }
    this.close();
    if (it && ed) ed.command(it.k, field);
  },
  close() { if (this.el) this.el.remove(); this.el = null; this.start = null; }
};
document.addEventListener('pointerdown', e => { if (Slash.el && !Slash.el.contains(e.target)) Slash.close(); }, true);

class BlockEditor {
  constructor(cardId, root, opts) {
    this.cardId = cardId; this.root = root; this.opts = opts || {}; this.active = null;
    this.saveSoon = debounce(() => this.flush(), 400);
    root.addEventListener('dragover', e => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); } });
    root.addEventListener('drop', e => { const fs = e.dataTransfer && Array.from(e.dataTransfer.files || []); if (fs && fs.length) { e.preventDefault(); e.stopPropagation(); this.insertFiles(fs, this.active); } });
    this.render();
  }
  get card() { return S.cards.get(this.cardId); }
  render() {
    const c = this.card; if (!c) return;
    if (!c.blocks.length) c.blocks.push({ id: newId(), type: 'text', html: '' });
    const inline = this.opts.inline, nodes = [];
    const t = h('input', { class: inline ? 'ie-title' : 'ed-title', placeholder: 'Titel', value: c.title, maxlength: '300', 'aria-label': 'Titel der Karte' });
    t.addEventListener('input', () => this.saveSoon());
    t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.focusFirstText(); } });
    this.titleEl = t; nodes.push(t);
    this.blocksEl = h('div', { class: 'ed-blocks' });
    c.blocks.forEach((b, i) => this.blocksEl.append(this.blockEl(b, i, c.blocks.length)));
    nodes.push(this.blocksEl);
    if (!inline) nodes.push(h('div', { class: 'ed-add' },
      h('button', { class: 'btn', type: 'button', html: icon('text', 17) + '<span>Text</span>', onclick: () => this.addAtEnd('text') }),
      h('button', { class: 'btn', type: 'button', html: icon('pen', 17) + '<span>Handschrift</span>', onclick: () => this.addAtEnd('ink') }),
      h('button', { class: 'btn', type: 'button', html: icon('image', 17) + '<span>Bild / Datei</span>', onclick: () => this.addAtEnd('anyfile') }),
      h('button', { class: 'btn', type: 'button', html: icon('link', 17) + '<span>Link / Video</span>', onclick: () => this.addAtEnd('embed') }),
      h('span', { class: 'ed-tip', text: 'Tipp: „/“ im Text öffnet alle Bausteine' })));
    this.root.replaceChildren(...nodes);
  }
  focusFirstText() { const f = this.root.querySelector('[data-field]'); if (f) placeCaretEnd(f); }
  setActive(id) { this.active = id; for (const el of $$('.blk', this.blocksEl)) el.classList.toggle('active', el.dataset.block === id); }
  rich(b, field, cls, ph, item) {
    const el = h('div', { class: cls, contenteditable: 'true', role: 'textbox', 'aria-multiline': field === 'html' ? 'true' : 'false', 'aria-label': ph, 'data-ph': ph, 'data-block': b.id, 'data-field': field });
    if (item) el.dataset.item = item.id;
    el.innerHTML = (item || b)[field] || ''; hydrateLinks(el, true);
    el.addEventListener('input', e => this.onInput(el, e));
    el.addEventListener('keydown', e => this.onKey(el, e, b, item));
    el.addEventListener('paste', e => {
      const fs = e.clipboardData && Array.from(e.clipboardData.files || []);
      if (fs && fs.length) { e.preventDefault(); this.insertFiles(fs, b.id); return; }
      pastePlain(e);
    });
    el.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.clink'); if (a && !a.classList.contains('missing')) { e.preventDefault(); Editor.open(a.getAttribute('data-card')); } });
    return el;
  }
  blockEl(b, i, n) {
    const wrap = h('div', { class: 'blk blk-' + b.type, 'data-block': b.id });
    wrap.addEventListener('focusin', () => this.setActive(b.id));
    wrap.addEventListener('pointerdown', () => this.setActive(b.id));
    const ctrl = h('div', { class: 'blk-ctrl' },
      iconBtn('up', 'Baustein nach oben', () => this.move(b.id, -1)), iconBtn('down', 'Baustein nach unten', () => this.move(b.id, 1)));
    if (b.type === 'link' || b.type === 'embed') ctrl.append(iconBtn('pen', 'Titel ändern', () => this.editLink(b.id)));
    ctrl.append(iconBtn('trash', 'Baustein löschen', () => this.remove(b.id)));
    ctrl.children[0].disabled = i === 0; ctrl.children[1].disabled = i === n - 1;
    const inline = this.opts.inline;
    switch (b.type) {
      case 'text': wrap.append(this.rich(b, 'html', 'ed-text' + (inline ? ' ie-text' : ''), i === 0 && n === 1 ? 'Schreibe oder tippe „/“ für Bausteine …' : 'Text oder „/“ …')); break;
      case 'todo': {
        const ul = h('ul', { class: 'todo edit' });
        for (const it of b.items) {
          const li = h('li', { class: it.done ? 'done' : '' });
          li.append(h('button', { class: 'chk', type: 'button', 'aria-label': it.done ? 'Als offen markieren' : 'Als erledigt markieren', html: it.done ? icon('check', 13) : '',
            onclick: () => this.mutate(c => { const x = c.blocks.find(y => y.id === b.id); const t = x && x.items.find(y => y.id === it.id); if (t) t.done = !t.done; }) }),
            this.rich(b, 'html', 'tt', 'To-do', it));
          ul.append(li);
        }
        wrap.append(ul); break;
      }
      case 'toggle': {
        const tg = h('div', { class: 'tgl' + (b.open ? ' open' : '') });
        tg.append(h('div', { class: 'tgl-head' },
          h('button', { class: 'tgl-arrow', type: 'button', 'aria-label': b.open ? 'Zuklappen' : 'Aufklappen', 'aria-expanded': b.open ? 'true' : 'false', html: icon('chev', 14),
            onclick: () => this.mutate(c => { const x = c.blocks.find(y => y.id === b.id); if (x) x.open = !x.open; }, null, true) }),
          this.rich(b, 'title', 'tgl-title', 'Toggle-Überschrift')),
          this.rich(b, 'html', 'tgl-body ed-text' + (inline ? ' ie-text' : ''), 'Inhalt, der aufgeklappt erscheint …'));
        wrap.append(tg); break;
      }
      case 'divider': wrap.append(h('hr', { class: 'cc-hr' })); break;
      case 'ink': {
        const box = h('div', { class: 'blk-ink', 'aria-label': 'Handschrift-Feld' });
        const svg = sv('svg', { viewBox: `0 0 ${INK_W} ${b.h}` }); const g = sv('g'), live = sv('g'); svg.append(g, live); box.append(svg);
        for (const st of b.strokes) { const p = strokeEl(st); st._el = p; g.append(p); }
        const grow = h('div', { class: 'ink-grow', text: 'Ziehen für mehr Platz' });
        bindInkSurface(box, svg, g, live, b, this.cardId, () => { const c = this.card; if (c) { touch(c); this.changed(); } });
        bindInkGrow(grow, svg, b, () => { const c = this.card; if (c) { touch(c); this.changed(); } });
        wrap.append(box, grow); break;
      }
      case 'image': { const img = h('img', { alt: '', draggable: 'false' }); Files.bind(img, 'src', b); wrap.append(h('div', { class: 'blk-img' }, img)); break; }
      case 'file': wrap.append(fileTile(b, 'a')); break;
      case 'video': { const v = h('video', { class: 'cc-video', controls: true, playsinline: true, preload: 'metadata' }); Files.bind(v, 'src', b); wrap.append(v); break; }
      case 'audio': { const a = h('audio', { class: 'cc-audio', controls: true, preload: 'metadata' }); Files.bind(a, 'src', b); wrap.append(h('div', { class: 'audio-wrap' }, h('div', { class: 'audio-name', text: b.name || 'Audio' }), a)); break; }
      case 'link': wrap.append(linkTile(b, 'a')); break;
      case 'embed': wrap.append(embedEl(b, 'edit')); break;
    }
    wrap.append(ctrl);
    return wrap;
  }
  onInput(el, e) {
    if (el.innerHTML === '<br>') el.innerHTML = '';
    if (Slash.el) Slash.update();
    else this.shortcuts(el, e);
    this.saveSoon();
  }
  shortcuts(el, e) {
    if (!e || e.inputType !== 'insertText') return;
    if (isRichField(el) && (e.data === ' ' || e.data === '-' || e.data === '/' || e.data === '[')) wrapBareText(el);
    const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0); if (!r.collapsed) return;
    const para = paraOf(r.startContainer, el);
    const rr = document.createRange(); try { rr.setStart(para, 0); rr.setEnd(r.startContainer, r.startOffset); } catch (err) { return; }
    const pre = rr.toString().replace(/ /g, ' ');
    const isHtml = isRichField(el);
    if (e.data === '/' && (pre === '/' || /\s\/$/.test(pre))) {
      const node = r.startContainer, off = r.startOffset - 1;
      if (node.nodeType === 3 && off >= 0) Slash.open(this, el, node, off);
      return;
    }
    if (pre.endsWith('[[')) {
      const d = document.createRange(); d.setStart(r.startContainer, Math.max(0, r.startOffset - 2)); d.setEnd(r.startContainer, r.startOffset);
      if (r.startContainer.nodeType === 3 && r.startOffset >= 2) { d.deleteContents(); this.command('cardlink', el); }
      return;
    }
    if (!isHtml) return;
    const del = () => {
      rr.deleteContents();
      if (para !== el && !para.textContent && !para.querySelector('br')) para.append(document.createElement('br'));
      const nr = document.createRange(); nr.setStart(para, 0); nr.collapse(true); const ss = getSelection(); ss.removeAllRanges(); ss.addRange(nr);
    };
    if (e.data === '-' && pre === '---') { del(); this.command('divider', el); return; }
    if (e.data !== ' ') return;
    const marker = pre.slice(0, -1);
    const map = { '#': 'h1', '##': 'h2', '###': 'h3', '>': 'quote', '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'todo', '[ ]': 'todo', '>>': 'toggle' };
    const k = map[marker]; if (!k) return;
    if (para.tagName === 'LI' && (k === 'ul' || k === 'ol')) return;
    del(); this.command(k, el);
  }
  onKey(el, e, b, item) {
    if (Slash.key(e)) { e.preventDefault(); return; }
    if (item && e.key === 'Enter' && !e.shiftKey && !el.textContent.trim() && !el.querySelector('a[data-card]')) {
      // Leere Zeile + Enter: Liste verlassen, normaler Text darunter
      e.preventDefault();
      const tid = newId();
      this.mutate(c => {
        const x = c.blocks.find(y => y.id === b.id); const bi = c.blocks.indexOf(x);
        if (x.items.length > 1) x.items = x.items.filter(y => y.id !== item.id);
        const next = c.blocks[bi + 1];
        if (next && next.type === 'text' && isEmptyHtml(next.html)) next.id = tid; else c.blocks.splice(bi + 1, 0, { id: tid, type: 'text', html: '' });
      }, () => this.focusBlock(tid), true);
      return;
    }
    if (item && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const nid = newId();
      this.mutate(c => { const x = c.blocks.find(y => y.id === b.id); const i = x.items.findIndex(y => y.id === item.id); x.items.splice(i + 1, 0, { id: nid, html: '', done: false }); }, () => { const f = this.root.querySelector(`[data-item="${nid}"]`); if (f) f.focus(); }, true);
      return;
    }
    if (e.key === 'Backspace' && !el.textContent && !el.querySelector('a[data-card]')) {
      if (item) {
        e.preventDefault();
        const x = this.card.blocks.find(y => y.id === b.id); const i = x.items.findIndex(y => y.id === item.id);
        const prev = x.items[i - 1];
        if (x.items.length === 1) { this.remove(b.id, true); return; }
        this.mutate(c => { const y = c.blocks.find(z => z.id === b.id); y.items.splice(i, 1); }, () => { const f = prev && this.root.querySelector(`[data-item="${prev.id}"]`); if (f) placeCaretEnd(f); }, true);
        return;
      }
      if (b.type === 'text' && this.card.blocks.length > 1) { e.preventDefault(); this.remove(b.id, true); }
    }
  }
  // Ausgeführter Baustein aus „/“-Menü oder Kürzel
  async command(k, el) {
    el.focus();
    if (FORMAT_KINDS.has(k)) {
      if (!isRichField(el)) return;
      if (k === 'ul') document.execCommand('insertUnorderedList');
      else if (k === 'ol') document.execCommand('insertOrderedList');
      else document.execCommand('formatBlock', false, { text: '<p>', h1: '<h1>', h2: '<h2>', h3: '<h3>', quote: '<blockquote>' }[k]);
      this.saveSoon(); return;
    }
    if (k === 'cardlink') { this.pickLink(el); return; }
    const s = getSelection(); const saved = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    let blocks = null;
    if (k === 'todo') blocks = [{ id: newId(), type: 'todo', items: [{ id: newId(), html: '', done: false }] }];
    else if (k === 'toggle') blocks = [{ id: newId(), type: 'toggle', title: '', html: '', open: true }];
    else if (k === 'divider') blocks = [{ id: newId(), type: 'divider' }];
    else if (k === 'ink') blocks = [{ id: newId(), type: 'ink', h: 300, strokes: [] }];
    else if (k === 'link' || k === 'embed') { const b = await promptUrlBlock(k); if (b) blocks = [b]; }
    else { const acc = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '' }[k]; const fs = await pickFiles(acc, k === 'image' || k === 'file'); if (fs.length) blocks = await filesToBlocks(fs); }
    if (!blocks || !blocks.length) return;
    this.insertAt(el, saved, blocks);
  }
  // Blöcke an der Cursorstelle einfügen: Textblock wird dort geteilt
  insertAt(el, range, blocks) {
    const blockId = el.dataset.block; const c = this.card; if (!c) return;
    const cur = c.blocks.find(x => x.id === blockId);
    let afterHtml = '';
    if (cur && cur.type === 'text' && el.dataset.field === 'html' && range && el.contains(range.startContainer)) {
      const tail = document.createRange(); tail.setStart(range.startContainer, range.startOffset); tail.setEnd(el, el.childNodes.length);
      const frag = tail.extractContents(); const tmp = document.createElement('div'); tmp.append(frag);
      afterHtml = sanitizeHtml(tmp.innerHTML); if (isEmptyHtml(afterHtml)) afterHtml = '';
      const last = el.lastElementChild; if (last && !last.textContent && !last.querySelector('a[data-card],br + *')) last.remove();
    }
    const firstNew = blocks[0];
    this.mutate(card => {
      const i = card.blocks.findIndex(x => x.id === blockId);
      const curB = card.blocks[i];
      const replace = curB && curB.type === 'text' && isEmptyHtml(curB.html);
      const at = i < 0 ? card.blocks.length : (replace ? i : i + 1);
      card.blocks.splice(at, replace ? 1 : 0, ...blocks);
      const endAt = at + blocks.length;
      if (afterHtml) card.blocks.splice(endAt, 0, { id: newId(), type: 'text', html: afterHtml });
      else if (endAt >= card.blocks.length && !['todo', 'toggle'].includes(blocks[blocks.length - 1].type)) card.blocks.push({ id: newId(), type: 'text', html: '' });
    }, () => this.focusBlock(firstNew.id));
  }
  focusBlock(id) {
    const wrap = this.root.querySelector(`.blk[data-block="${id}"]`); if (!wrap) return;
    this.setActive(id);
    const f = wrap.querySelector('[data-field]');
    if (f) { if (f.classList.contains('tgl-title') || f.dataset.item) f.focus(); else placeCaretEnd(f); }
    else { const next = wrap.nextElementSibling && wrap.nextElementSibling.querySelector('[data-field]'); if (next) placeCaretEnd(next); }
    wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async pickLink(el) {
    const s = getSelection(); const saved = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    const ids = await pickCards({ title: 'Karte verlinken', multi: false, exclude: new Set([this.cardId]), okLabel: 'Verlinken', allowNew: true });
    if (!ids || !ids.length) { el.focus(); return; }
    el.focus();
    if (saved && el.contains(saved.startContainer)) { const ss = getSelection(); ss.removeAllRanges(); ss.addRange(saved); } else placeCaretEnd(el);
    const target = S.cards.get(ids[0]); const label = target ? (target.title.trim() || 'Ohne Titel') : 'Karte';
    const tmp = h('span'); tmp.textContent = label;
    document.execCommand('insertHTML', false, `<a data-card="${ids[0]}" class="clink" contenteditable="false">${tmp.innerHTML}</a>&nbsp;`);
    this.saveSoon();
  }
  async insertFiles(files, afterId) {
    const blocks = await filesToBlocks(files); if (!blocks.length) return;
    this.mutate(c => { let i = afterId ? c.blocks.findIndex(x => x.id === afterId) : -1; if (i < 0) i = c.blocks.length - 1; c.blocks.splice(i + 1, 0, ...blocks); }, () => this.focusBlock(blocks[0].id));
  }
  async addAtEnd(kind) {
    let blocks;
    if (kind === 'text') blocks = [{ id: newId(), type: 'text', html: '' }];
    else if (kind === 'ink') blocks = [{ id: newId(), type: 'ink', h: 300, strokes: [] }];
    else if (kind === 'embed') { const b = await promptUrlBlock('embed'); if (!b) return; blocks = [b]; }
    else { const fs = await pickFiles('', true); if (!fs.length) return; blocks = await filesToBlocks(fs); }
    if (!blocks.length) return;
    this.mutate(c => c.blocks.push(...blocks), () => this.focusBlock(blocks[0].id));
    if (kind === 'ink' && UI.editorTool === 'eraser') { UI.editorTool = 'pen'; saveUiPrefs(); rerenderPalettes(); }
  }
  async editLink(id) {
    const b = this.card.blocks.find(x => x.id === id); if (!b) return;
    const t = await promptDialog('Titel für den Link', b.title || '', 'Speichern', domainOf(b.url));
    if (t == null) return;
    this.mutate(c => { const x = c.blocks.find(y => y.id === id); if (x) x.title = t; });
  }
  move(id, d) { this.mutate(c => { const i = c.blocks.findIndex(b => b.id === id); const j = i + d; if (i < 0 || j < 0 || j >= c.blocks.length) return; const [b] = c.blocks.splice(i, 1); c.blocks.splice(j, 0, b); }, () => this.setActive(id)); }
  async remove(id, quiet) {
    const c = this.card; const b = c.blocks.find(x => x.id === id); if (!b) return;
    const idx = c.blocks.indexOf(b); const prev = c.blocks[idx - 1];
    this.mutate(card => { card.blocks = card.blocks.filter(x => x.id !== id); if (!card.blocks.length) card.blocks.push({ id: newId(), type: 'text', html: '' }); },
      () => { const ps = prev ? this.root.querySelectorAll(`.blk[data-block="${prev.id}"] [data-field]`) : []; const p = ps[ps.length - 1]; if (p) placeCaretEnd(p); });
    if (!quiet && !(b.type === 'text' && isEmptyHtml(b.html))) toast('Baustein gelöscht. ⌘Z macht es rückgängig.');
  }
  // Strukturänderung mit Rückgängig, danach neu zeichnen
  mutate(fn, after, noUndo) {
    const c = this.card; if (!c) return;
    this.saveSoon.cancel(); this.flush();
    const run = () => { fn(c); touch(c); };
    if (noUndo) run(); else Undo.snap(['c_' + c.id], run);
    this.render(); this.changed();
    if (after) setTimeout(after, 0);
  }
  changed() { if (this.opts.onChange) this.opts.onChange(); }
  flush() {
    const c = this.card; if (!c) return false;
    let changed = false;
    if (this.titleEl && this.titleEl.value !== c.title) { c.title = this.titleEl.value; changed = true; }
    for (const el of this.root.querySelectorAll('[data-field]')) {
      const b = c.blocks.find(x => x.id === el.dataset.block); if (!b) continue;
      let target = b; if (el.dataset.item) { target = (b.items || []).find(i => i.id === el.dataset.item); if (!target) continue; }
      const html = sanitizeHtml(el.innerHTML); if (html !== (target[el.dataset.field] || '')) { target[el.dataset.field] = html; changed = true; }
    }
    if (changed) { touch(c); this.changed(); }
    return changed;
  }
  rerenderInk(blockId) {
    const c = this.card; const b = c && c.blocks.find(x => x.id === blockId); const g = this.root.querySelector(`.blk[data-block="${blockId}"] svg g`);
    if (!b || !g) return; g.replaceChildren(); for (const st of b.strokes) { const p = strokeEl(st); st._el = p; g.append(p); }
  }
}
function bindInkSurface(box, svg, g, live, block, cardId, onChange) {
  let gest = null, pid = null;
  const local = e => { const r = svg.getBoundingClientRect(); const k = INK_W / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, k]; };
  // Stift soll nicht scrollen, Finger schon (außer „Mit Finger zeichnen“)
  box.addEventListener('touchstart', e => { const t = e.touches[0]; if (UI.fingerDraw || (t && t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });
  box.addEventListener('touchmove', e => { if (gest) e.preventDefault(); }, { passive: false });
  box.addEventListener('pointerdown', e => {
    if (gest || !pointerMayDraw(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    if (document.activeElement && document.activeElement.blur && box.closest('.editor, .bitem') && !box.contains(document.activeElement)) { /* Textfokus bleibt erhalten */ }
    try { box.setPointerCapture(e.pointerId); } catch (err) {}
    const [x, y, k] = local(e);
    gest = new InkGesture({ tool: UI.editorTool, layer: live, strokes: block.strokes, scale: k, target: { kind: 'block', cardId, blockId: block.id },
      onDone: st => {
        if (st) { const p = strokeEl(st); st._el = p; g.append(p); if (st.bb[3] > block.h - 70) { block.h = Math.min(6000, block.h + 220); svg.setAttribute('viewBox', `0 0 ${INK_W} ${block.h}`); } }
        onChange();
      } });
    pid = e.pointerId; gest.add(x, y, penPressure(e));
  });
  box.addEventListener('pointermove', e => {
    if (!gest || e.pointerId !== pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of (evs && evs.length ? evs : [e])) { const [x, y] = local(ev); gest.add(x, y, penPressure(ev)); }
  });
  const end = (e, cancel) => { if (!gest || e.pointerId !== pid) return; const gg = gest; gest = null; if (cancel) gg.cancel(); else { const [x, y] = local(e); gg.end(x, y); } };
  box.addEventListener('pointerup', e => end(e, false));
  box.addEventListener('pointercancel', e => end(e, true));
}
function bindInkGrow(grow, svg, block, onChange) {
  let st = null;
  grow.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { grow.setPointerCapture(e.pointerId); } catch (err) {} st = { y: e.clientY, h: block.h, k: INK_W / svg.getBoundingClientRect().width }; });
  grow.addEventListener('pointermove', e => { if (!st) return; block.h = Math.round(clamp(st.h + (e.clientY - st.y) * st.k, 80, 6000)); svg.setAttribute('viewBox', `0 0 ${INK_W} ${block.h}`); });
  const end = () => { if (!st) return; st = null; onChange(); };
  grow.addEventListener('pointerup', end); grow.addEventListener('pointercancel', end);
}

// ---------- Kartenpanel rechts ----------
const Editor = {
  cardId: null, be: null, stale: false,
  card() { return S.cards.get(this.cardId); },
  open(cardId, opts = {}) {
    if (!S.cards.has(cardId)) return;
    if (BV.editingId) BV.endInlineEdit(true);
    if (this.cardId && this.cardId !== cardId) this.flushText();
    this.cardId = cardId;
    $('#editor').hidden = false;
    this.render();
    if (opts.focusTitle) setTimeout(() => { const t = $('#editor .ed-title'); if (t) t.focus(); }, 30);
    if (BV.root) requestAnimationFrame(() => BV.positionSelbar());
  },
  close() {
    if (!this.cardId) return;
    const id = this.cardId; this.flushText();
    this.cardId = null; this.be = null; $('#editor').hidden = true; $('#editor').replaceChildren();
    if (S.cards.has(id)) refreshCardEverywhere(id);
    if (BV.root) requestAnimationFrame(() => BV.positionSelbar());
  },
  render() {
    const c = this.card(); const ed = $('#editor'); if (!c) { this.close(); return; }
    const colors = h('div', { class: 'ed-colors', role: 'group', 'aria-label': 'Kartenfarbe' });
    for (const col of CARD_COLORS) {
      const b = h('button', { class: 'swatch' + (c.color === col ? ' active' : ''), type: 'button', title: 'Farbe ' + CARD_NAMES[col], 'aria-label': 'Kartenfarbe ' + CARD_NAMES[col],
        onclick: () => { this.flushText(); Undo.snap(['c_' + c.id], () => { c.color = col; touch(c); }); refreshCardEverywhere(c.id); this.render(); } });
      const i = h('i'); i.style.background = `var(--card-${col})`; b.append(i); colors.append(b);
    }
    const head = h('header', { class: 'ed-head' }, colors, h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', type: 'button', html: icon('present', 18) + '<span class="hide-narrow">Zur Präsentation</span>', title: 'Zur Präsentation hinzufügen', 'aria-label': 'Zur Präsentation hinzufügen', onclick: () => addCardsToPresentation([c.id]) }),
      iconBtn('trash', 'Karte löschen', () => deleteCardEverywhere(c.id)),
      iconBtn('close', 'Schließen (Esc)', () => this.close()));
    const fmt = (label, title, cmd) => h('button', { class: 'fmt', type: 'button', title, 'aria-label': title, html: label, onpointerdown: e => e.preventDefault(), onclick: () => this.format(cmd) });
    this.inkTools = h('div', { style: 'display:contents' });
    const tools = h('div', { class: 'ed-tools', role: 'toolbar', 'aria-label': 'Format und Stift' },
      fmt('<b>F</b>', 'Fett (⌘B)', 'bold'), fmt('<i>K</i>', 'Kursiv (⌘I)', 'italic'), fmt('<u>U</u>', 'Unterstrichen (⌘U)', 'underline'), fmt('H', 'Überschrift', 'heading'),
      fmt(icon('list', 18), 'Aufzählung', 'insertUnorderedList'), fmt(icon('olist', 18), 'Nummerierte Liste', 'insertOrderedList'), fmt(icon('cardlink', 18), 'Karte verlinken ([[)', 'cardlink'),
      h('span', { class: 'tb-sep' }), this.inkTools);
    const body = h('div', { class: 'ed-body' });
    this.meta = h('div', { class: 'ed-meta' });
    const scroll = h('div', { class: 'ed-scroll' }, body, this.meta);
    ed.replaceChildren(head, tools, scroll);
    this.be = new BlockEditor(c.id, body, { inline: false, onChange: () => this.changed() });
    this.renderMeta(); this.renderInkTools(); refreshUndoButtons();
  },
  renderInkTools() { if (this.inkTools && this.cardId) this.inkTools.replaceChildren(inkPalette()); },
  renderMeta() {
    const c = this.card(); if (!c || !this.meta) return; this.meta.replaceChildren();
    const bs = boardsWithCard(c.id), ps = presWithCard(c.id), bl = backlinksOf(c.id);
    const row = (label, items, onPick, nameOf) => h('div', {}, h('div', { text: label }), h('div', { class: 'links' }, items.length ? items.map(x => h('button', { class: 'chip', type: 'button', text: nameOf ? nameOf(x) : x.name, onclick: () => onPick(x) })) : h('span', { text: '–' })));
    this.meta.append(
      row('Wird erwähnt in', bl, x => this.open(x.id), x => cardTitle(x)),
      row('Liegt auf Whiteboards', bs, b => { navigate({ type: 'board', id: b.id }); requestAnimationFrame(() => { BV.select({ type: 'card', id: c.id }); BV.centerOn(c.id); }); }),
      row('In Präsentationen', ps, p => navigate({ type: 'pres', id: p.id })));
    if (UI.view && UI.view.type === 'board' && BV.root && !bs.some(b => b.id === UI.view.id)) {
      this.meta.append(h('div', {}, h('button', { class: 'btn', type: 'button', text: 'Auf das aktuelle Whiteboard legen', onclick: () => { BV.placeCardOnBoard(c.id); this.renderMeta(); } })));
    }
  },
  flushText() { return this.be ? this.be.flush() : false; },
  format(cmd) {
    const sel = document.getSelection(); const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement).closest('[data-field]');
    if (!el || !$('#editor').contains(el)) { toast('Setze zuerst den Cursor in einen Text.'); return; }
    if (cmd === 'cardlink') { this.be.pickLink(el); return; }
    if (cmd === 'heading') {
      if (el.dataset.field !== 'html') return;
      const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, cur === 'h2' ? '<p>' : '<h2>');
    } else if (cmd.startsWith('insert') && el.dataset.field !== 'html') return;
    else document.execCommand(cmd, false, null);
    el.dispatchEvent(new Event('input'));
  },
  rerenderInk(cardId, blockId) {
    if (this.cardId === cardId && this.be) this.be.rerenderInk(blockId);
    if (BV.editingId === cardId && BV.inlineEd) BV.inlineEd.rerenderInk(blockId);
  },
  onRemoteChange() {
    if (!this.cardId) return;
    if (!S.cards.has(this.cardId)) { this.close(); toast('Diese Karte wurde gelöscht.'); return; }
    const ae = document.activeElement; if (ae && $('#editor').contains(ae) && (ae.isContentEditable || ae.tagName === 'INPUT')) { this.stale = true; return; }
    this.render();
  }
};
Editor.changed = debounce(() => { if (Editor.cardId) { refreshCardEverywhere(Editor.cardId, true); Editor.renderMeta(); } }, 300);

