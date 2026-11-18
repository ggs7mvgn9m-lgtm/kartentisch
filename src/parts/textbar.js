// ---------- Schwebende Textleiste: Schrift, Größe, Farbe, Markierung ----------
const TEXT_FONTS = [['', 'Standard'], ['serif', 'Serif'], ['round', 'Rund'], ['hand', 'Handschrift'], ['mono', 'Schreibmaschine']];
const TEXT_SIZES = [['s', 'S'], ['', 'M'], ['l', 'L'], ['xl', 'XL']];
const TEXT_COLORS = [['', 'Standard', 'var(--text)'], ['red', 'Rot', '#d9412b'], ['orange', 'Orange', '#e07a1f'], ['green', 'Grün', '#2e9b4f'], ['blue', 'Blau', '#2f6fed'], ['violet', 'Violett', '#7c4dcc'], ['gray', 'Grau', '#8e8e93']];
const TEXT_HL_COLORS = [['', 'Keine', 'transparent'], ['yellow', 'Gelb', '#ffe680'], ['green', 'Grün', '#c4efc4'], ['blue', 'Blau', '#cfe0ff'], ['rose', 'Rosa', '#ffd0dc']];
const SPAN_CLASS = /^(f-(serif|round|hand|mono|std)|s-(s|m|l|xl)|tc-(red|orange|green|blue|violet|gray|std)|hl-(yellow|green|blue|rose|none))$/;
const TextBar = {
  el: null, range: null, field: null,
  fieldOf(node) { const el = node && (node.nodeType === 1 ? node : node.parentElement); const f = el && el.closest('[data-field]'); return f && f.isContentEditable ? f : null; },
  init() {
    document.addEventListener('selectionchange', debounce(() => this.check(), 120));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); }, true);
    setInterval(() => { if (this.el && (!this.field || !this.field.isConnected || !this.field.isContentEditable)) this.hide(); }, 400);
    document.addEventListener('pointerdown', e => { if (this.el && !this.el.contains(e.target)) setTimeout(() => this.check(), 0); }, true);
    addEventListener('resize', () => this.hide());
  },
  check() {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { if (!this.busy) this.hide(); return; }
    const f = this.fieldOf(sel.anchorNode); if (!f || f !== this.fieldOf(sel.focusNode)) { this.hide(); return; }
    this.range = sel.getRangeAt(0).cloneRange(); this.field = f; this.show();
  },
  hide() { this.busy = false; if (this.el) { this.el.remove(); this.el = null; } this.open = null; },
  show() {
    const r = this.range.getBoundingClientRect(); if (!r || (!r.width && !r.height)) return;
    if (!this.el) { this.el = h('div', { class: 'textbar', role: 'toolbar', 'aria-label': 'Text formatieren' }); this.el.addEventListener('pointerdown', e => { if (!e.target.closest('select')) e.preventDefault(); }); document.body.append(this.el); }
    this.render();
    const W = this.el.offsetWidth || 360, H = this.el.offsetHeight || 40;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), innerWidth - W - 8);
    let y = r.bottom + 10; if (y + H > innerHeight - 8) y = Math.max(8, r.top - H - 10);
    this.el.style.left = x + 'px'; this.el.style.top = y + 'px';
  },
  render() {
    const btn = (html, title, fn, cls = '') => h('button', { class: 'tb-btn ' + cls, type: 'button', title, 'aria-label': title, html, onclick: fn });
    const font = h('select', { class: 'tb-sel', 'aria-label': 'Schriftart', title: 'Schriftart' }, ...TEXT_FONTS.map(([v, n]) => h('option', { value: v, text: n })));
    font.value = this.current('f'); font.onchange = () => this.apply('f', font.value || 'std');
    const sizes = h('div', { class: 'tb-group', role: 'group', 'aria-label': 'Größe' }, ...TEXT_SIZES.map(([v, n]) => btn(n, 'Größe ' + n, () => this.apply('s', v || 'm'), (this.current('s') === v ? 'on' : '') + ' tb-size')));
    const dots = (list, kind, title) => h('div', { class: 'tb-group', role: 'group', 'aria-label': title }, ...list.map(([v, n, c]) => { const b = btn('', title + ': ' + n, () => this.apply(kind, v || (kind === 'tc' ? 'std' : 'none')), 'tb-dot' + (kind === 'hl' ? ' hl' : '') + (v === '' ? ' none' : '')); b.style.setProperty('--dot', c); return b; }));
    const toggle = this.open;
    const colorBtn = btn('<span class="tb-a">A</span>', 'Textfarbe und Markierung', () => { this.open = this.open ? null : 'color'; this.show(); }, toggle ? 'on' : '');
    this.el.replaceChildren(
      btn('<b>F</b>', 'Fett (⌘B)', () => this.cmd('bold')), btn('<i>K</i>', 'Kursiv (⌘I)', () => this.cmd('italic')), btn('<u>U</u>', 'Unterstrichen (⌘U)', () => this.cmd('underline')), btn('<s>S</s>', 'Durchgestrichen', () => this.cmd('strikeThrough')),
      h('span', { class: 'tb-sep' }), font, sizes, h('span', { class: 'tb-sep' }), colorBtn,
      toggle ? h('div', { class: 'tb-row' }, dots(TEXT_COLORS, 'tc', 'Textfarbe'), h('span', { class: 'tb-sep' }), dots(TEXT_HL_COLORS, 'hl', 'Markierung')) : null);
  },
  restore() { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(this.range); },
  cmd(c) { this.busy = true; this.restore(); document.execCommand(c, false, null); this.done(); },
  // Klasse des Elements am Anfang der Auswahl
  current(kind) {
    let n = this.range && this.range.startContainer; n = n && (n.nodeType === 1 ? n : n.parentElement);
    while (n && n !== this.field) { if (n.tagName === 'SPAN') for (const c of n.classList) if (c.startsWith(kind + '-')) { const v = c.slice(kind.length + 1); return ['std', 'm', 'none'].includes(v) ? '' : v; } n = n.parentElement; }
    return '';
  },
  apply(kind, value) {
    this.busy = true; this.restore();
    const marker = 'kt-mark-' + Math.random().toString(36).slice(2, 8);
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, marker);
    const nodes = [...this.field.querySelectorAll(`font[face="${marker}"]`)];
    let first = null, last = null;
    for (const f of nodes) {
      // gleiche Art von innen entfernen, damit die neue Wahl gilt
      for (const s of f.querySelectorAll('span')) { for (const c of [...s.classList]) if (c.startsWith(kind + '-')) s.classList.remove(c); if (!s.classList.length) s.replaceWith(...s.childNodes); }
      const span = document.createElement('span'); span.className = kind + '-' + value;
      span.append(...f.childNodes); f.replaceWith(span); first = first || span; last = span;
    }
    if (first) { const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last); this.range = r; this.restore(); }
    this.done();
  },
  done() {
    this.field.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => { this.busy = false; const sel = document.getSelection(); if (sel.rangeCount) this.range = sel.getRangeAt(0).cloneRange(); if (this.el) this.show(); }, 0);
  }
};
