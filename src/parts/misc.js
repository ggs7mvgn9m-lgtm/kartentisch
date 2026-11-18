// ---------- Werkzeugleiste (Stift, Marker, Radierer, Farben, Größen) ----------
function inkStyleControls(tool, after) {
  if (tool === true || tool === false) tool = tool ? 'hl' : 'pen';
  const frag = document.createDocumentFragment(); const I = UI.ink;
  const set = (fn) => () => { fn(); saveUiPrefs(); after(); };
  const sep = () => frag.append(h('span', { class: 'tb-sep' }));
  const pick = (title, val, on, html, active) => { const b = h('button', { class: 'pal-btn' + (active ? ' active' : ''), type: 'button', title, 'aria-label': title, 'aria-pressed': active ? 'true' : 'false', html, onclick: set(on) }); return b; };
  if (tool === 'eraser') {
    frag.append(pick('Ganze Striche löschen', 'stroke', () => { I.eraserMode = 'stroke'; }, '<span class="pal-txt">Strich</span>', I.eraserMode !== 'part'));
    frag.append(pick('Nur den berührten Teil löschen', 'part', () => { I.eraserMode = 'part'; }, '<span class="pal-txt">Teil</span>', I.eraserMode === 'part'));
    sep();
    [0, 1, 2].forEach(si => { const b = pick('Radierer ' + ['klein', 'mittel', 'groß'][si], si, () => { I.eraserSize = si; }, '', (I.eraserSize ?? 1) === si); b.classList.add('size'); const i = h('i'); const d = [6, 10, 16][si]; i.style.width = i.style.height = d + 'px'; i.style.background = 'transparent'; i.style.border = '1.5px solid var(--text)'; b.append(i); frag.append(b); });
    sep();
    frag.append(pick('Nur Textmarker radieren', 'hl', () => { I.eraserHl = !I.eraserHl; }, icon('hl', 18), !!I.eraserHl));
    return frag;
  }
  const hl = tool === 'hl';
  if (!hl) {
    for (const [k, ic, name] of [['f', 'fountain', 'Füller'], ['b', 'ballpen', 'Kugelschreiber'], ['p', 'brush', 'Pinsel']]) frag.append(pick(name, k, () => { I.penKind = k; }, icon(ic, 19), (I.penKind || 'f') === k));
    sep();
  }
  const favKey = hl ? 'hlFav' : 'penFav', curKey = hl ? 'hlColor' : 'penColor';
  const favs = I[favKey] || (hl ? ['y', 'g', 'p'] : ['k', 'b', 'r']);
  const names = hl ? HL_NAMES : PEN_NAMES;
  let activeIdx = favs.indexOf(I[curKey]); if (activeIdx < 0) activeIdx = 0;
  favs.forEach((c, idx) => {
    const b = h('button', { class: 'swatch' + (I[curKey] === c ? ' active' : ''), type: 'button', title: (isHex(c) ? 'Eigene Farbe' : names[c] || c) + ' – nochmal tippen zum Ändern', 'aria-label': (hl ? 'Marker ' : 'Stift ') + (isHex(c) ? 'eigene Farbe' : names[c] || c),
      onclick: () => { if (I[curKey] === c) { openPicker(idx); return; } I[curKey] = c; saveUiPrefs(); after(); } });
    const i = h('i'); i.style.background = inkColor(c, hl); b.append(i); frag.append(b);
  });
  const input = h('input', { type: 'color', class: 'pal-color', 'aria-label': 'Farbe wählen', tabindex: '-1' });
  const openPicker = idx => {
    const cur = favs[idx]; input.value = isHex(cur) ? cur : (getComputedStyle(document.documentElement).getPropertyValue(`--${hl ? 'hl' : 'ink'}-${cur}`).trim() || '#000000').slice(0, 7);
    input.onchange = () => { const v = input.value.toLowerCase(); const nf = favs.slice(); nf[idx] = v; I[favKey] = nf; I[curKey] = v; saveUiPrefs(); after(); };
    input.click();
  };
  frag.append(h('button', { class: 'pal-btn pal-picker', type: 'button', title: 'Eigene Farbe für das gewählte Feld', 'aria-label': 'Eigene Farbe wählen', html: icon('pipette', 18), onclick: () => openPicker(activeIdx) }), input);
  sep();
  const curS = hl ? I.hlSize : I.penSize;
  [0, 1, 2].forEach(si => {
    const b = h('button', { class: 'size' + (si === curS ? ' active' : ''), type: 'button', title: ['Fein', 'Mittel', 'Breit'][si], 'aria-label': 'Strichstärke ' + ['fein', 'mittel', 'breit'][si],
      onclick: () => { if (hl) I.hlSize = si; else I.penSize = si; saveUiPrefs(); after(); } });
    const i = h('i'); const d = [4, 7, 11][si]; i.style.width = i.style.height = d + 'px'; b.append(i); frag.append(b);
  });
  if (!hl) { sep(); frag.append(pick('Formen gerade ziehen: Stift am Ende kurz halten', 'shapes', () => { I.shapes = I.shapes === false; }, icon('shapes', 19), I.shapes !== false)); }
  return frag;
}
// Stiftleiste im Kartenpanel
function inkPalette() {
  const frag = document.createDocumentFragment();
  const tool = UI.editorTool;
  const setTool = t => { UI.editorTool = t; saveUiPrefs(); rerenderPalettes(); };
  for (const [t, label] of [['pen', 'Stift'], ['hl', 'Textmarker'], ['eraser', 'Radierer']]) frag.append(iconBtn(t, label, () => setTool(t), tool === t ? 'active' : ''));
  frag.append(h('span', { class: 'tb-sep' })); frag.append(inkStyleControls(tool, rerenderPalettes));
  frag.append(h('span', { class: 'tb-sep' }));
  const u = iconBtn('undo', 'Rückgängig (⌘Z)', () => Undo.undo()); u.dataset.act = 'undo';
  const r = iconBtn('redo', 'Wiederholen (⇧⌘Z)', () => Undo.redo()); r.dataset.act = 'redo';
  frag.append(u, r);
  return frag;
}
function rerenderPalettes() {
  if (BV.root) BV.renderFlyout();
  Editor.renderInkTools();
  refreshUndoButtons();
}
function currentStrokeStyle(tool) {
  if (tool === 'hl') return { t: 'hl', c: UI.ink.hlColor, w: HL_SIZES[UI.ink.hlSize] || 20 };
  const k = UI.ink.penKind || 'f';
  return { t: 'pen', c: UI.ink.penColor, w: (PEN_SIZES[UI.ink.penSize] || 3) * (k === 'p' ? 1.6 : k === 'b' ? 0.85 : 1), k };
}

