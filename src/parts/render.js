// ---------- HTML bereinigen ----------
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'SPAN', 'BLOCKQUOTE', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CODE']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'LINK', 'META', 'NOSCRIPT', 'IMG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
function sanitizeHtml(html) {
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  const walk = node => {
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 1) {
        const tag = ch.tagName.toUpperCase();
        if (DROP_TAGS.has(tag)) { ch.remove(); continue; }
        walk(ch);
        if (!ALLOWED_TAGS.has(tag)) { ch.replaceWith(...Array.from(ch.childNodes)); continue; }
        if (tag === 'A') {
          const id = ch.getAttribute('data-card');
          if (!isId(id)) {
            const href = safeUrl(ch.getAttribute('href') || '');
            if (!href) { ch.replaceWith(...Array.from(ch.childNodes)); continue; }
            for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
            ch.setAttribute('href', href); ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener noreferrer');
            continue;
          }
          for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
          ch.setAttribute('data-card', id);
          continue;
        }
        for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
      } else if (ch.nodeType !== 3) ch.remove();
    }
  };
  walk(t.content);
  return t.innerHTML;
}
function htmlToText(html) { const t = document.createElement('template'); t.innerHTML = html || ''; return (t.content.textContent || '').replace(/\s+/g, ' ').trim(); }
const isEmptyHtml = html => !htmlToText(html) && !/data-card=/.test(html || '');
// Kartenverweise anzeigen: aktueller Titel, gelöschte Ziele markieren
function hydrateLinks(root, editable) {
  for (const a of root.querySelectorAll('a[data-card]')) {
    const c = S.cards.get(a.getAttribute('data-card'));
    a.className = 'clink' + (c ? '' : ' missing');
    a.textContent = c ? (c.title.trim() || 'Ohne Titel') : 'Gelöschte Karte';
    if (editable) a.setAttribute('contenteditable', 'false');
  }
}

// ---------- Dateien: claude.ai-Speicher, sonst lokal ----------
const HOST = { claude: !!window.claude || window.top !== window.self };
const LocalFiles = {
  db: null, urls: new Map(),
  async open() {
    if (this.db !== null) return this.db;
    try {
      this.db = await Promise.race([new Promise((res, rej) => {
        const r = indexedDB.open('kartentisch-files', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      }), sleep(2500).then(() => { throw new Error('timeout'); })]);
    } catch (e) { this.db = false; }
    return this.db;
  },
  async put(id, blob) {
    const db = await this.open(); if (!db) throw new Error('kein lokaler Speicher');
    await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    this.urls.set(id, URL.createObjectURL(blob));
  },
  async url(id) {
    if (this.urls.has(id)) return this.urls.get(id);
    const db = await this.open(); if (!db) return '';
    const blob = await new Promise(res => { try { const q = db.transaction('files').objectStore('files').get(id); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch (e) { res(null); } });
    if (!blob) return '';
    const u = URL.createObjectURL(blob); this.urls.set(id, u); return u;
  }
};
const Files = {
  assets: null, warnedLocal: false,
  srcOf(b) { return b.asset ? '/_blob/' + b.asset : (b.src || b.url || ''); },
  // Quelle setzen (lokale Dateien kommen asynchron)
  bind(el, attr, b) {
    if (b.sb) { Supa.url(b.sb).then(u => { if (u) el.setAttribute(attr, u); else el.classList.add('missing-file'); }); return; }
    const s = this.srcOf(b);
    if (s) { el.setAttribute(attr, s); return; }
    if (b.local) LocalFiles.url(b.local).then(u => { if (u) el.setAttribute(attr, u); else el.classList.add('missing-file'); });
    else if (b.ref) { el.classList.add('hep-missing'); el.setAttribute('alt', 'Bild aus Heptabase fehlt noch' + (b.name ? ': ' + b.name : '')); }
  },
  kindOf(file) {
    const t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
    if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|svg)$/.test(n)) return 'image';
    if (t.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/.test(n)) return 'video';
    if (t.startsWith('audio/') || /\.(m4a|mp3|wav|aac|ogg|oga|opus)$/.test(n)) return 'audio';
    return 'file';
  },
  uploadType(file, kind) {
    const t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
    if (kind === 'image') return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(t) ? t : null;
    if (kind === 'video') return t === 'video/webm' || n.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    if (kind === 'audio') { if (t === 'audio/webm' || n.endsWith('.webm')) return 'video/webm'; if (/\.(m4a|aac|mp4)$/.test(n) || /audio\/(mp4|x-m4a|aac)/.test(t)) return 'video/mp4'; return null; }
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.csv')) return 'text/csv';
    if (n.endsWith('.md')) return 'text/markdown';
    if (n.endsWith('.json')) return 'application/json';
    if (n.endsWith('.txt')) return 'text/plain';
    return null;
  },
  // Gibt einen fertigen Block zurück (ohne id)
  async toBlock(file) {
    const kind = this.kindOf(file);
    const meta = { type: kind, name: str(file.name || '', 200), size: file.size || 0, mime: str(file.type || '', 100) };
    let blob = file, w = 0, hh = 0;
    if (kind === 'image') {
      const r = await prepareImage(file); blob = r.blob; w = r.w; hh = r.h;
      Object.assign(meta, { w, h: hh, mime: r.blob.type });
    }
    if (Supa.user && !HOST.claude) {
      if (blob.size <= 50 * 1024 * 1024) {
        try { return Object.assign(meta, { sb: await Supa.upload(blob, meta.name || (kind === 'image' ? 'bild.' + ((blob.type || 'image/jpeg').split('/')[1] || 'jpg') : 'datei')) }); }
        catch (e) { toast('Hochladen hat nicht geklappt. Die Datei wird vorerst nur auf diesem Gerät gespeichert.'); }
      } else toast('Größer als 50 MB: Die Datei wird nur auf diesem Gerät gespeichert.');
    }
    if (this.assets) {
      const upType = kind === 'image' ? this.uploadType(blob, 'image') : this.uploadType(file, kind);
      if (upType) {
        try { const res = await this.assets.upload(blob, { type: upType }); return Object.assign(meta, { asset: res.id }); }
        catch (e) {
          const code = e && e.code;
          if (code === 'too_large') toast('Größer als 20 MB: Die Datei wird nur auf diesem Gerät gespeichert.');
          else if (code === 'quota_or_state') toast('Der Speicher ist voll. Die Datei wird nur auf diesem Gerät gespeichert.');
          else if (code === 'store_unavailable') { await sleep(1200); try { const res = await this.assets.upload(blob, { type: upType }); return Object.assign(meta, { asset: res.id }); } catch (e2) {} }
        }
      } else if (kind !== 'image') toast(`${file.name || 'Diese Datei'}: dieses Format kann nur auf diesem Gerät gespeichert werden.`);
    }
    if (kind === 'image' && blob.size < 1.5e6) {
      const small = blob.size > 400000 ? (await prepareImage(file, 1400, 0.8)).blob : blob;
      return Object.assign(meta, { src: await blobToDataUrl(small) });
    }
    const id = newId(); await LocalFiles.put(id, blob);
    if (!this.warnedLocal && !this.assets) { this.warnedLocal = true; toast('Dateien werden hier nur auf diesem Gerät gespeichert.'); }
    return Object.assign(meta, { local: id });
  }
};
function blobToDataUrl(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); }); }
async function prepareImage(file, max = 2200, q = 0.86) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const W = img.naturalWidth || 800, H = img.naturalHeight || 600;
    const t = (file.type || '').toLowerCase();
    const keep = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(t) && file.size <= 3e6 && Math.max(W, H) <= max;
    if (keep) return { blob: file, w: W, h: H };
    const s = Math.min(1, max / Math.max(W, H)); const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d');
    const png = t === 'image/png' && file.size < 6e6;
    if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => cv.toBlob(res, png ? 'image/png' : 'image/jpeg', q));
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}
const fmtSize = n => n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
const extOf = name => ((name || '').split('.').pop() || '').slice(0, 4).toUpperCase();

// Video-Links (YouTube, Vimeo)
function parseVideoUrl(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let m;
  if (host === 'youtu.be') { const id = u.pathname.slice(1).split('/')[0]; if (/^[\w-]{6,20}$/.test(id)) return { provider: 'youtube', vid: id, url: u.href }; }
  if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v'); if (v && /^[\w-]{6,20}$/.test(v)) return { provider: 'youtube', vid: v, url: u.href };
    if ((m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,20})/))) return { provider: 'youtube', vid: m[1], url: u.href };
  }
  if (host.endsWith('vimeo.com') && (m = u.pathname.match(/\/(\d{5,12})/))) return { provider: 'vimeo', vid: m[1], url: u.href };
  return null;
}
function embedSrc(b) {
  if (b.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${b.vid}?rel=0&playsinline=1`;
  if (b.provider === 'vimeo') return `https://player.vimeo.com/video/${b.vid}`;
  return '';
}
const canEmbed = () => !HOST.claude;
const PROVIDER = { youtube: 'YouTube', vimeo: 'Vimeo' };
function safeUrl(raw) { try { const u = new URL(String(raw).trim()); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (e) { return ''; } }
const domainOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

// ---------- Karteninhalt rendern (Board, Bibliothek, Präsentation) ----------
function inkSvg(block, crop) {
  let hgt = block.h;
  if (crop) { let maxY = 0; for (const st of block.strokes) maxY = Math.max(maxY, st.bb[3] + st.w); hgt = Math.max(30, Math.min(block.h, maxY + 14)); }
  const svg = sv('svg', { viewBox: `0 0 ${INK_W} ${r2(hgt)}`, class: 'cc-ink', preserveAspectRatio: 'xMinYMin meet' });
  const g = sv('g'); for (const st of block.strokes) g.append(strokeEl(st)); svg.append(g);
  return svg;
}
function fileTile(b, tag = 'a') {
  const el = h(tag, { class: 'file-tile', title: b.name || 'Datei' },
    h('span', { class: 'fi-ic', text: extOf(b.name) || 'DATEI' }),
    h('span', { class: 'ft-text' }, h('b', { text: b.name || 'Datei' }), h('small', { text: [fmtSize(b.size || 0), b.local ? 'nur auf diesem Gerät' : ''].filter(Boolean).join(' · ') })));
  if (tag === 'a') { Files.bind(el, 'href', b); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  return el;
}
function linkTile(b, tag = 'a') {
  const el = h(tag, { class: 'link-tile' }, h('span', { class: 'lt-ic', html: icon('link', 18) }),
    h('span', { class: 'ft-text' }, h('b', { text: b.title || domainOf(b.url) || b.url }), h('small', { text: b.url })));
  if (tag === 'a' && b.url) { el.setAttribute('href', b.url); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  return el;
}
function embedEl(b, mode) {
  if (mode !== 'board' && canEmbed() && embedSrc(b)) {
    const fr = h('iframe', { src: embedSrc(b), title: b.title || 'Video', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' });
    return h('div', { class: 'embed' }, fr);
  }
  const tag = mode === 'board' ? 'div' : 'a';
  const el = h(tag, { class: 'embed-tile' }, h('span', { class: 'play', html: icon('play', 20) }),
    h('span', { class: 'ft-text' }, h('b', { text: b.title || ('Video auf ' + (PROVIDER[b.provider] || domainOf(b.url))) }), h('small', { text: (PROVIDER[b.provider] || '') + (mode === 'board' ? '' : ' · öffnet in neuem Fenster') })));
  if (tag === 'a') { el.setAttribute('href', b.url); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  return el;
}
function richDiv(html, cls) { const d = h('div', { class: cls }); d.innerHTML = html; hydrateLinks(d, false); return d; }
// mode: 'board' | 'lib' | 'present'
function renderCardContent(card, opts = {}) {
  const mode = opts.mode || 'board';
  const wrap = h('div', { class: 'cc' });
  const t = card.title.trim();
  const hasContent = card.blocks.some(b => !(b.type === 'text' && isEmptyHtml(b.html)) && !(b.type === 'ink' && !b.strokes.length));
  if (t || !hasContent) wrap.append(h('div', { class: 'cc-title' + (t ? '' : ' empty'), text: t || 'Ohne Titel' }));
  for (const b of card.blocks) {
    if (b.type === 'text') { if (!isEmptyHtml(b.html)) wrap.append(richDiv(b.html, 'cc-text')); }
    else if (b.type === 'ink') { if (b.strokes.length) wrap.append(inkSvg(b, true)); }
    else if (b.type === 'image') { const img = h('img', { class: 'cc-img', alt: '', draggable: 'false' }); Files.bind(img, 'src', b); if (opts.onImg) img.addEventListener('load', opts.onImg); wrap.append(img); }
    else if (b.type === 'divider') wrap.append(h('hr', { class: 'cc-hr' }));
    else if (b.type === 'todo') {
      const ul = h('ul', { class: 'todo' });
      for (const it of b.items) { const li = h('li', { class: it.done ? 'done' : '' }, h('span', { class: 'chk', html: it.done ? icon('check', 13) : '' }), richDiv(it.html, 'tt')); ul.append(li); }
      wrap.append(ul);
    }
    else if (b.type === 'toggle') {
      const open = opts.openToggles ? opts.openToggles.has(b.id) : !!b.open;
      const tg = h('div', { class: 'tgl' + (open ? ' open' : ''), 'data-block': b.id },
        h('div', { class: 'tgl-head' }, h('span', { class: 'tgl-arrow', html: icon('chev', 14) }), richDiv(b.title || '', 'tgl-title')));
      if (!isEmptyHtml(b.html)) tg.append(richDiv(b.html, 'tgl-body cc-text'));
      wrap.append(tg);
    }
    else if (b.type === 'file') wrap.append(fileTile(b, mode === 'board' ? 'div' : 'a'));
    else if (b.type === 'video') { const v = h('video', { class: 'cc-video', controls: mode !== 'board', playsinline: true, preload: 'metadata' }); Files.bind(v, 'src', b); if (opts.onImg) v.addEventListener('loadedmetadata', opts.onImg); wrap.append(v); }
    else if (b.type === 'audio') { const a = h('audio', { class: 'cc-audio', controls: true, preload: 'metadata' }); Files.bind(a, 'src', b); wrap.append(mode === 'board' ? fileTile(Object.assign({}, b, { name: b.name || 'Audio' }), 'div') : a); }
    else if (b.type === 'link') wrap.append(linkTile(b, mode === 'board' ? 'div' : 'a'));
    else if (b.type === 'embed') wrap.append(embedEl(b, mode));
  }
  return wrap;
}
const colorClass = c => (c && c !== 'none' ? 'c-' + c : '');
// Text einer Karte für Suche und Rückverweise
function cardText(c) {
  const parts = [c.title];
  for (const b of c.blocks) {
    if (b.type === 'text') parts.push(htmlToText(b.html));
    else if (b.type === 'todo') parts.push(...b.items.map(i => htmlToText(i.html)));
    else if (b.type === 'toggle') parts.push(htmlToText(b.title), htmlToText(b.html));
    else if (b.type === 'link' || b.type === 'embed') parts.push(b.title || '', b.url || '');
    else if (b.type === 'file' || b.type === 'video' || b.type === 'audio') parts.push(b.name || '');
  }
  return parts.join(' ');
}
function cardHtmlAll(c) {
  return c.blocks.map(b => b.type === 'text' ? b.html : b.type === 'todo' ? b.items.map(i => i.html).join('') : b.type === 'toggle' ? (b.title || '') + (b.html || '') : '').join('');
}
function backlinksOf(cardId) {
  const needle = `data-card="${cardId}"`;
  return [...S.cards.values()].filter(c => c.id !== cardId && cardHtmlAll(c).includes(needle));
}

