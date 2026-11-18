// Umriss eines Strichs; Stifttyp: f = Füller, b = Kugelschreiber, p = Pinsel
function outlinePath(pts, size, kind) {
  const n = pts.length / 3;
  const rad = kind === 'b' ? (() => (size / 2) * 0.95)
    : kind === 'p' ? (p => (size / 2) * (0.12 + 2.3 * Math.pow(clamp(p, 0.05, 1), 1.25)))
    : (p => (size / 2) * (0.4 + 1.2 * clamp(p, 0.05, 1)));
  if (n === 1 || (n === 2 && Math.hypot(pts[3] - pts[0], pts[4] - pts[1]) < 0.5)) {
    const r = rad(pts[2]), x = pts[0], y = pts[1];
    return `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
  }
  const L = [], R = [], rs = [];
  const t0 = kind === 'b' ? 0.85 : kind === 'p' ? 0.2 : 0.55, t1 = kind === 'b' ? 0.08 : kind === 'p' ? 0.11 : 0.15;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = pts[i1 * 3] - pts[i0 * 3], ty = pts[i1 * 3 + 1] - pts[i0 * 3 + 1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx;
    const taper = Math.min(1, t0 + t1 * Math.min(i, n - 1 - i));
    const r = rad(pts[i * 3 + 2]) * taper; rs.push(r);
    const x = pts[i * 3], y = pts[i * 3 + 1];
    L.push([x + nx * r, y + ny * r]); R.push([x - nx * r, y - ny * r]);
  }
  const side = arr => {
    let d = '';
    for (let i = 1; i < arr.length - 1; i++) {
      const [x, y] = arr[i], [nx, ny] = arr[i + 1];
      d += `Q${f1(x)} ${f1(y)} ${f1((x + nx) / 2)} ${f1((y + ny) / 2)}`;
    }
    const last = arr[arr.length - 1];
    return d + `L${f1(last[0])} ${f1(last[1])}`;
  };
  const re = rs[n - 1], rb = rs[0];
  const Rr = R.slice().reverse();
  return `M${f1(L[0][0])} ${f1(L[0][1])}` + side(L) +
    `A${f1(re)} ${f1(re)} 0 0 0 ${f1(Rr[0][0])} ${f1(Rr[0][1])}` + side(Rr) +
    `A${f1(rb)} ${f1(rb)} 0 0 0 ${f1(L[0][0])} ${f1(L[0][1])}Z`;
}
const inkColor = (c, hl) => isHex(c) ? c : `var(--${hl ? 'hl' : 'ink'}-${c})`;
function strokeEl(st) {
  if (st.t === 'hl') {
    if (!st.d) st.d = centerPath(st.pts);
    const p = sv('path', { d: st.d, class: 'hl', 'stroke-width': st.w });
    p.style.stroke = inkColor(st.c, true);
    return p;
  }
  if (!st.d) st.d = outlinePath(st.pts, st.w, st.k);
  const p = sv('path', { d: st.d });
  p.style.fill = inkColor(st.c, false);
  return p;
}
