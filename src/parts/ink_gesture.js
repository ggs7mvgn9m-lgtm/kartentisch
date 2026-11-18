// Strich gleichmäßig nachpunkten (für Teil-Radierer und Kritzel-Erkennung)
function resampleStroke(pts, step) {
  const out = [pts[0], pts[1], pts[2]];
  for (let i = 3; i < pts.length; i += 3) {
    const ax = pts[i - 3], ay = pts[i - 2], ap = pts[i - 1], bx = pts[i], by = pts[i + 1], bp = pts[i + 2];
    const d = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(d / step));
    for (let j = 1; j <= k; j++) { const t = j / k; out.push(ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t); }
  }
  return out;
}
// Teile eines Strichs, die außerhalb des Radierkreises liegen
function splitStroke(st, x, y, r) {
  const pts = resampleStroke(st.pts, Math.max(1, r / 3)); const m = r + st.w / 2; const out = []; let cur = [];
  for (let i = 0; i < pts.length; i += 3) {
    if (Math.hypot(pts[i] - x, pts[i + 1] - y) > m) cur.push(pts[i], pts[i + 1], pts[i + 2]);
    else { if (cur.length >= 6) out.push(cur); cur = []; }
  }
  if (cur.length >= 6) out.push(cur);
  return out.map(p => finishStroke(Object.assign({ t: st.t, c: st.c, w: st.w }, st.k ? { k: st.k } : {}, { pts: simplify(p, 0.25) })));
}
// Hin-und-her-Kritzeln erkennen
function isScribble(pts, scale) {
  if (pts.length < 30) return false;
  const s = simplify(pts, 2.5 * scale); const n = s.length / 3; if (n < 6) return false;
  let turns = 0, len = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = s[i * 3], y = s[i * 3 + 1]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let i = 1; i < n; i++) len += Math.hypot(s[i * 3] - s[i * 3 - 3], s[i * 3 + 1] - s[i * 3 - 2]);
  for (let i = 1; i < n - 1; i++) {
    const ax = s[i * 3] - s[i * 3 - 3], ay = s[i * 3 + 1] - s[i * 3 - 2], bx = s[i * 3 + 3] - s[i * 3], by = s[i * 3 + 4] - s[i * 3 + 1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (!la || !lb) continue;
    if ((ax * bx + ay * by) / (la * lb) < -0.55) turns++;
  }
  const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
  return turns >= 4 && len > 2.6 * diag;
}
// Formen gerade ziehen: Linie, Linienzug (z. B. Pfeil), Dreieck, Rechteck, Kreis/Ellipse, Vieleck
function recognizeShape(pts, scale) {
  const n = pts.length / 3; if (n < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0; const ps = [];
  for (let i = 0; i < n; i++) { const x = pts[i * 3], y = pts[i * 3 + 1]; ps.push(pts[i * 3 + 2]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); if (i) len += Math.hypot(x - pts[i * 3 - 3], y - pts[i * 3 - 2]); }
  const D = Math.hypot(x1 - x0, y1 - y0); if (D < 14 * scale) return null;
  ps.sort((a, b) => a - b); const p = ps[Math.floor(ps.length / 2)] || 0.5;
  const step = 2.5 * scale;
  const poly = (vs, close) => { const out = []; const all = close ? [...vs, vs[0]] : vs; for (let i = 0; i < all.length - 1; i++) { const [ax, ay] = all[i], [bx, by] = all[i + 1]; const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step)); for (let j = i ? 1 : 0; j <= k; j++) out.push(ax + (bx - ax) * j / k, ay + (by - ay) * j / k, p); } return out; };
  const sx = pts[0], sy = pts[1], ex = pts[(n - 1) * 3], ey = pts[(n - 1) * 3 + 1];
  const closed = Math.hypot(ex - sx, ey - sy) < Math.max(0.22 * D, 14 * scale) && len > 1.6 * D;
  if (!closed) {
    const v = simplify(pts, Math.max(0.07 * D, 5 * scale)); const m = v.length / 3;
    if (m <= 6) { const vs = []; for (let i = 0; i < m; i++) vs.push([v[i * 3], v[i * 3 + 1]]); return poly(vs, false); }
    return null;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1, (x1 - x0) / 2), ry = Math.max(1, (y1 - y0) / 2);
  let err = 0; for (let i = 0; i < n; i++) err += Math.abs(Math.hypot((pts[i * 3] - cx) / rx, (pts[i * 3 + 1] - cy) / ry) - 1); err /= n;
  const v = simplify(pts.slice(0, -3).concat([sx, sy, p]), 0.1 * D); let m = v.length / 3 - 1;
  const vs = []; for (let i = 0; i < m; i++) vs.push([v[i * 3], v[i * 3 + 1]]);
  if (m === 3) return poly(vs, true);
  if (m === 4 && err > 0.09) {
    // fast achsparallel? dann sauberes Rechteck
    const ang = Math.atan2(vs[1][1] - vs[0][1], vs[1][0] - vs[0][0]) % (Math.PI / 2);
    if (Math.abs(ang) < 0.2 || Math.abs(Math.abs(ang) - Math.PI / 2) < 0.2) return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
    return poly(vs, true);
  }
  if (err < 0.2) {
    const circ = Math.abs(rx - ry) / Math.max(rx, ry) < 0.14; const R = (rx + ry) / 2;
    const a0 = Math.atan2(sy - cy, sx - cx); const k = Math.max(48, Math.ceil(2 * Math.PI * Math.max(rx, ry) / step)); const out = [];
    for (let j = 0; j <= k; j++) { const a = a0 + 2 * Math.PI * j / k; out.push(cx + (circ ? R : rx) * Math.cos(a), cy + (circ ? R : ry) * Math.sin(a), p); }
    return out;
  }
  if (m >= 5 && m <= 8) return poly(vs, true);
  return null;
}
class InkGesture {
  constructor({ tool, layer, strokes, scale, target, onDone }) {
    this.tool = tool; this.layer = layer; this.strokes = strokes; this.scale = scale; this.target = target; this.onDone = onDone;
    this.removed = []; this.added = [];
    if (tool === 'eraser') {
      this.er = [5, 11, 24][UI.ink.eraserSize] || 11; this.part = UI.ink.eraserMode === 'part'; this.onlyHl = !!UI.ink.eraserHl;
    } else { Object.assign(this, currentStrokeStyle(tool)); this.pts = []; this.el = null; this.shapes = tool === 'pen' && UI.ink.shapes !== false; }
  }
  add(x, y, p) {
    if (this.tool === 'eraser') { this.erase(x, y); return; }
    if (this.snapped) return;
    const pts = this.pts, n = pts.length;
    if (this.shapes) {
      if (!this.anchor || Math.hypot(x - this.anchor[0], y - this.anchor[1]) > 5 * this.scale) { this.anchor = [x, y]; clearTimeout(this.holdT); this.holdT = setTimeout(() => this.snap(), 600); }
    }
    if (n) {
      const lx = pts[n - 3], ly = pts[n - 2], dx = x - lx, dy = y - ly;
      if (dx * dx + dy * dy < (0.7 * this.scale) ** 2) return;
      x = lx + dx * 0.62; y = ly + dy * 0.62; p = pts[n - 1] + (p - pts[n - 1]) * 0.35;
    }
    pts.push(x, y, p); this.draw();
  }
  snap() {
    if (this.snapped || !this.pts || this.pts.length < 12) return;
    const shape = recognizeShape(this.pts, this.scale); if (!shape) return;
    this.pts = shape; this.snapped = true; this.draw();
    if (this.el) { this.el.classList.add('snap-flash'); }
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  }
  draw() {
    const st = { t: this.t, c: this.c, w: this.w, k: this.k, pts: this.pts };
    const d = this.t === 'hl' ? centerPath(this.pts) : outlinePath(this.pts, this.w, this.k);
    if (!this.el) { this.el = strokeEl(Object.assign(st, { d })); this.layer.append(this.el); }
    else this.el.setAttribute('d', d);
  }
  erase(x, y) {
    const r = this.er * this.scale;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const st = this.strokes[i];
      if (this.onlyHl && st.t !== 'hl') continue;
      if (!strokeHit(st, x, y, r)) continue;
      const parent = st._el && st._el.parentNode;
      this.strokes.splice(i, 1); if (st._el) st._el.remove();
      const ai = this.added.indexOf(st); if (ai >= 0) this.added.splice(ai, 1); else this.removed.push(st);
      if (this.part) for (const f of splitStroke(st, x, y, r)) { this.strokes.push(f); this.added.push(f); const el = strokeEl(f); f._el = el; if (parent) parent.append(el); }
    }
  }
  end(x, y) {
    clearTimeout(this.holdT);
    if (this.tool === 'eraser') {
      if (this.added.length) { Undo.push({ target: this.target, op: 'swap', removed: this.removed, added: this.added }); this.onDone && this.onDone(); }
      else if (this.removed.length) { Undo.push({ target: this.target, op: 'remove', strokes: this.removed }); this.onDone && this.onDone(); }
      return;
    }
    if (!this.snapped && x != null && this.pts.length) { const n = this.pts.length; this.pts[n - 3] = x; this.pts[n - 2] = y; }
    if (!this.pts.length) return;
    // Kritzeln zum Löschen
    if (this.tool === 'pen' && !this.snapped && isScribble(this.pts, this.scale)) {
      const probe = resampleStroke(this.pts, 3 * this.scale); const hits = [];
      for (const st of this.strokes) { for (let i = 0; i < probe.length; i += 3) if (strokeHit(st, probe[i], probe[i + 1], 1.5 * this.scale)) { hits.push(st); break; } }
      if (hits.length) {
        if (this.el) this.el.remove();
        for (const st of hits) { const i = this.strokes.indexOf(st); if (i >= 0) this.strokes.splice(i, 1); if (st._el) { const el = st._el; el.classList.add('erasing'); setTimeout(() => el.remove(), 220); } }
        Undo.push({ target: this.target, op: 'remove', strokes: hits });
        this.onDone && this.onDone();
        return;
      }
    }
    const base = { t: this.t, c: this.c, w: this.w, pts: this.snapped ? this.pts : simplify(this.pts, 0.28 * this.scale) };
    if (this.t === 'pen' && this.k && this.k !== 'f') base.k = this.k;
    const st = finishStroke(base);
    if (this.el) this.el.remove();
    this.strokes.push(st);
    Undo.push({ target: this.target, op: 'add', strokes: [st] });
    this.onDone && this.onDone(st);
  }
  cancel() {
    clearTimeout(this.holdT);
    if (this.el) this.el.remove();
    for (const f of this.added) { const i = this.strokes.indexOf(f); if (i >= 0) this.strokes.splice(i, 1); if (f._el) f._el.remove(); }
    if (this.removed.length || this.added.length) { this.strokes.push(...this.removed); this.onDone && this.onDone(); }
  }
}
