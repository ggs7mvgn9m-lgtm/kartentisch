// ---------- Werkzeugleiste (Stift, Marker, Radierer, Farben, Größen) ----------
function inkStyleControls(hl, after) {
  const frag = document.createDocumentFragment();
  const colors = hl ? HL_COLORS : PEN_COLORS, names = hl ? HL_NAMES : PEN_NAMES;
  const cur = hl ? UI.ink.hlColor : UI.ink.penColor;
  for (const c of colors) {
    const b = h('button', { class: 'swatch' + (c === cur ? ' active' : ''), type: 'button', title: names[c], 'aria-label': (hl ? 'Marker ' : 'Stift ') + names[c],
      onclick: () => { if (hl) UI.ink.hlColor = c; else UI.ink.penColor = c; saveUiPrefs(); after(); } });
    const i = h('i'); i.style.background = `var(--${hl ? 'hl' : 'ink'}-${c})`; b.append(i); frag.append(b);
  }
  frag.append(h('span', { class: 'tb-sep' }));
  const curS = hl ? UI.ink.hlSize : UI.ink.penSize;
  [0, 1, 2].forEach(si => {
    const b = h('button', { class: 'size' + (si === curS ? ' active' : ''), type: 'button', title: ['Fein', 'Mittel', 'Breit'][si], 'aria-label': 'Strichstärke ' + ['fein', 'mittel', 'breit'][si],
      onclick: () => { if (hl) UI.ink.hlSize = si; else UI.ink.penSize = si; saveUiPrefs(); after(); } });
    const i = h('i'); const d = [4, 7, 11][si]; i.style.width = i.style.height = d + 'px'; b.append(i); frag.append(b);
  });
  return frag;
}
// Stiftleiste im Kartenpanel
function inkPalette() {
  const frag = document.createDocumentFragment();
  const tool = UI.editorTool;
  const setTool = t => { UI.editorTool = t; saveUiPrefs(); rerenderPalettes(); };
  for (const [t, label] of [['pen', 'Stift'], ['hl', 'Textmarker'], ['eraser', 'Radierer']]) frag.append(iconBtn(t, label, () => setTool(t), tool === t ? 'active' : ''));
  if (tool === 'pen' || tool === 'hl') { frag.append(h('span', { class: 'tb-sep' })); frag.append(inkStyleControls(tool === 'hl', rerenderPalettes)); }
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
  return { t: 'pen', c: UI.ink.penColor, w: PEN_SIZES[UI.ink.penSize] || 3 };
}

