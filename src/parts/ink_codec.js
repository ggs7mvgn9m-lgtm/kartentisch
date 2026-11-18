const isHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
function encStroke(st) {
  const a = []; let px = 0, py = 0, pp = 0;
  for (let i = 0; i < st.pts.length; i += 3) {
    const x = Math.round(st.pts[i] * 4), y = Math.round(st.pts[i + 1] * 4), p = Math.round(st.pts[i + 2] * 15);
    a.push(x - px, y - py, p - pp); px = x; py = y; pp = p;
  }
  const o = { c: st.c, w: st.w, t: st.t, s: encInts(a) };
  if (st.k && st.k !== 'f') o.k = st.k;
  return o;
}
function decStroke(o) {
  if (!o || typeof o.s !== 'string') return null;
  const a = decInts(o.s); const pts = []; let x = 0, y = 0, p = 0;
  for (let i = 0; i + 2 < a.length; i += 3) { x += a[i]; y += a[i + 1]; p += a[i + 2]; pts.push(x / 4, y / 4, p / 15); }
  if (!pts.length) return null;
  const t = o.t === 'hl' ? 'hl' : 'pen';
  const pal = t === 'hl' ? HL_COLORS : PEN_COLORS;
  const st = { c: pal.includes(o.c) || isHex(o.c) ? o.c : pal[0], w: clamp(+o.w || 3, 0.5, 60), t, pts };
  if (t === 'pen' && (o.k === 'b' || o.k === 'p')) st.k = o.k;
  return finishStroke(st);
}
