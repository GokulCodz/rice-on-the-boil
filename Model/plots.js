/* =====================================================================
   Rice on the Boil — SVG figure builder (no DOM; returns SVG strings).
   Used by the interactive page and by Code/make_results.js so that the
   figures in Results/ come from the same code as the figures on screen.
   ===================================================================== */
(function (root) {
'use strict';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const THEMES = {
  light: { bg: '#fffdf8', ink: '#2b2622', muted: '#776b5f', grid: '#ece4d6', axis: '#b5a893', panel: '#f6f0e4',
    series: ['#b8700f', '#2f7fb5', '#c2412d', '#4f8a3c', '#8a4f8a', '#4c5b6a'] },
  dark:  { bg: '#1f1c19', ink: '#efe7da', muted: '#a99d8f', grid: '#34302b', axis: '#5e554b', panel: '#28241f',
    series: ['#e6a23c', '#6db3e3', '#ef7a62', '#86c26f', '#c58ac5', '#a3b3c2'] }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => (Math.round(v * 100) / 100);

/* ---------- colour maps ---------- */
function lerpColor(stops, t) {
  t = Math.min(1, Math.max(0, t));
  const k = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(k)), f = k - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return '#' + [0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * f).toString(16).padStart(2, '0')).join('');
}
function hex(c) { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }
const CMAPS = {
  heat: ['#24306e', '#563b9a', '#9b3d8e', '#d2524a', '#f08a2c', '#f9d45c'],          // cool → hot
  moisture: ['#f1e4c6', '#d5dcb4', '#9fcbbf', '#5aa5bd', '#2e75a8', '#1d4677'],      // dry → wet
  gel: ['#ffffff', '#ffffff']
};
function colorFor(cmap, v, vmin, vmax) { return lerpColor(CMAPS[cmap], (v - vmin) / (vmax - vmin)); }
/* moisture is shown on a wet-basis scale (w = X/(1+X)) so that the dry and soaked range stays readable */
function moistColor(X) { const w = X / (1 + X); return lerpColor(CMAPS.moisture, (w - 0.10) / (0.75 - 0.10)); }
function heatColor(T, Tmin, Tmax) { return lerpColor(CMAPS.heat, (T - Tmin) / (Tmax - Tmin)); }

/* ---------- ticks ---------- */
function niceTicks(a, b, n) {
  if (!(b > a)) { b = a + 1; }
  const span = b - a, step0 = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag, step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const t = []; for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return t;
}
function fmtTick(v) {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e4 || a < 1e-3) { const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e); return (Math.abs(m - 1) < 1e-9 ? '' : (+m.toFixed(1)) + '×') + '10' + sup(e); }
  return String(+v.toPrecision(4));
}
function sup(e) { const m = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }; return String(e).split('').map(c => m[c]).join(''); }

/* ---------- line plot ----------
   o: {w, h, title, xLabel, yLabel, xLog, yLog, xMin, xMax, yMin, yMax, series:[{name, x, y, color, width, dash, area, points, opacity}],
       vlines:[{x, label, color, dash}], hlines:[{y, label, color, dash}], cursorX, legend: 'top'|'right'|false, theme, note, id} */
function linePlot(o) {
  const th = THEMES[o.theme || 'light'], W = o.w || 640, H = o.h || 300;
  const legendRight = o.legend === 'right';
  const m = { l: 62, r: legendRight ? legendWidth(o.series) : 20, t: o.title ? 34 : 16, b: o.note ? 58 : 46 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const all = (key) => o.series.flatMap(s => s[key].filter((v, i) => v != null && isFinite(v) && s.y[i] != null && isFinite(s.y[i]) && s.x[i] != null && isFinite(s.x[i])));
  let xMin = o.xMin, xMax = o.xMax, yMin = o.yMin, yMax = o.yMax;
  const xs = all('x'), ys = all('y');
  if (xMin == null) xMin = Math.min(...xs); if (xMax == null) xMax = Math.max(...xs);
  if (yMin == null) yMin = Math.min(...ys); if (yMax == null) yMax = Math.max(...ys);
  if (!(xMax > xMin)) xMax = xMin + 1; if (!(yMax > yMin)) { yMax = yMin + 1; }
  if (o.yPad !== false && o.yMin == null) { const pad = (yMax - yMin) * 0.06; yMin -= pad; yMax += pad; }
  const lx = v => Math.log10(Math.max(v, 1e-300));
  const sx = o.xLog ? v => m.l + pw * (lx(v) - lx(xMin)) / (lx(xMax) - lx(xMin)) : v => m.l + pw * (v - xMin) / (xMax - xMin);
  const sy = o.yLog ? v => m.t + ph * (1 - (lx(v) - lx(yMin)) / (lx(yMax) - lx(yMin))) : v => m.t + ph * (1 - (v - yMin) / (yMax - yMin));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="${esc(o.title || o.yLabel || 'plot')}"` +
    ` data-plot='${JSON.stringify({ l: m.l, t: m.t, pw, ph, xMin, xMax, yMin, yMax, xLog: !!o.xLog, yLog: !!o.yLog, W, H })}'>`;
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="${th.bg}"/>`;
  if (o.title) s += `<text x="${m.l}" y="20" font-size="14" font-weight="600" fill="${th.ink}">${esc(o.title)}</text>`;
  // grid + ticks
  const xt = o.xLog ? logTicks(xMin, xMax) : niceTicks(xMin, xMax, Math.max(3, Math.round(pw / 90)));
  const yt = o.yLog ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, Math.max(3, Math.round(ph / 55)));
  s += `<g font-size="11" fill="${th.muted}">`;
  for (const v of xt) { const X = n2(sx(v)); if (X < m.l - 0.5 || X > m.l + pw + 0.5) continue; s += `<line x1="${X}" y1="${m.t}" x2="${X}" y2="${m.t + ph}" stroke="${th.grid}"/><text x="${X}" y="${m.t + ph + 16}" text-anchor="middle">${fmtTick(v)}</text>`; }
  for (const v of yt) { const Y = n2(sy(v)); if (Y < m.t - 0.5 || Y > m.t + ph + 0.5) continue; s += `<line x1="${m.l}" y1="${Y}" x2="${m.l + pw}" y2="${Y}" stroke="${th.grid}"/><text x="${m.l - 7}" y="${Y + 4}" text-anchor="end">${fmtTick(v)}</text>`; }
  s += `</g><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${th.axis}"/>`;
  if (o.xLabel) s += `<text x="${m.l + pw / 2}" y="${m.t + ph + 36}" font-size="12" text-anchor="middle" fill="${th.ink}">${esc(o.xLabel)}</text>`;
  if (o.yLabel) s += `<text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${th.ink}">${esc(o.yLabel)}</text>`;
  if (o.note) s += `<text x="${m.l}" y="${H - 8}" font-size="10.5" fill="${th.muted}">${esc(o.note)}</text>`;
  s += `<defs><clipPath id="cp-${o.id || 'p'}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#cp-${o.id || 'p'})">`;
  // horizontal / vertical guide lines
  for (const hl of o.hlines || []) { const Y = n2(sy(hl.y)); s += `<line x1="${m.l}" y1="${Y}" x2="${m.l + pw}" y2="${Y}" stroke="${hl.color || th.muted}" stroke-dasharray="${hl.dash || '5 4'}" stroke-width="1.2"/>` + (hl.label ? `<text x="${m.l + pw - 6}" y="${Y - 5}" font-size="10.5" text-anchor="end" fill="${hl.color || th.muted}">${esc(hl.label)}</text>` : ''); }
  // series
  o.series.forEach((se, k) => {
    const col = se.color || th.series[k % th.series.length];
    const segs = []; let cur = [];
    for (let i = 0; i < se.x.length; i++) {
      const ok = se.x[i] != null && se.y[i] != null && isFinite(se.x[i]) && isFinite(se.y[i]) && (!o.xLog || se.x[i] > 0) && (!o.yLog || se.y[i] > 0);
      if (ok) cur.push([n2(sx(se.x[i])), n2(sy(se.y[i]))]); else if (cur.length) { segs.push(cur); cur = []; }
    }
    if (cur.length) segs.push(cur);
    if (se.area) for (const g of segs) s += `<path d="M${g[0][0]},${n2(sy(Math.max(yMin, se.areaBase || 0)))}L${g.map(p => p.join(',')).join('L')}L${g[g.length - 1][0]},${n2(sy(Math.max(yMin, se.areaBase || 0)))}Z" fill="${col}" opacity="${se.areaOpacity || 0.15}"/>`;
    if (!se.points || se.line) for (const g of segs) s += `<polyline points="${g.map(p => p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${se.width || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" opacity="${se.opacity || 1}"/>`;
    if (se.points) for (const g of segs) for (const p of g) s += se.points === 'square' ? `<rect x="${p[0] - 4}" y="${p[1] - 4}" width="8" height="8" fill="${th.bg}" stroke="${col}" stroke-width="2"/>` : `<circle cx="${p[0]}" cy="${p[1]}" r="${se.r || 3.6}" fill="${se.hollow ? th.bg : col}" stroke="${col}" stroke-width="1.6"/>`;
  });
  for (const vl of o.vlines || []) { if (vl.x == null || !isFinite(vl.x) || (o.xLog && vl.x <= 0)) continue; const X = n2(sx(vl.x)); s += `<line x1="${X}" y1="${m.t}" x2="${X}" y2="${m.t + ph}" stroke="${vl.color || th.muted}" stroke-dasharray="${vl.dash || '4 4'}" stroke-width="1.3"/>` + (vl.label ? `<text x="${X > m.l + pw - 90 ? X - 4 : X + 4}" ${X > m.l + pw - 90 ? 'text-anchor="end"' : ''} y="${vl.top ? m.t + 12 + (vl.row || 0) * 13 : m.t + ph - 7 - (vl.row || 0) * 13}" font-size="10.5" fill="${vl.color || th.muted}" paint-order="stroke" stroke="${th.bg}" stroke-width="3">${esc(vl.label)}</text>` : ''); }
  if (o.cursorX != null && isFinite(o.cursorX)) { const X = n2(sx(o.cursorX)); s += `<line x1="${X}" y1="${m.t}" x2="${X}" y2="${m.t + ph}" stroke="${th.ink}" stroke-width="1" opacity=".55"/>`; }
  s += `</g>`;
  // legend
  if (o.legend !== false) {
    const items = o.series.filter(se => se.name);
    if (legendRight) {
      items.forEach((se, k) => { const y = m.t + 8 + k * 18, col = se.color || th.series[o.series.indexOf(se) % th.series.length]; s += legendKey(m.l + pw + 12, y, col, se, th) + `<text x="${m.l + pw + 40}" y="${y + 4}" font-size="11" fill="${th.ink}">${esc(se.name)}</text>`; });
    } else {
      let x = m.l + 8, y = m.t + 14;
      const bg = []; let txt = '';
      items.forEach(se => { const col = se.color || th.series[o.series.indexOf(se) % th.series.length]; const wTxt = 7 * se.name.length + 34; if (x + wTxt > m.l + pw - 4) { x = m.l + 8; y += 17; } txt += legendKey(x, y, col, se, th) + `<text x="${x + 26}" y="${y + 4}" font-size="11" fill="${th.ink}">${esc(se.name)}</text>`; x += wTxt; });
      if (o.legendBox !== false && items.length) s += `<rect x="${m.l + 3}" y="${m.t + 3}" width="${Math.min(pw - 6, y === m.t + 14 ? x - m.l - 2 : pw - 6)}" height="${y - m.t + 9}" rx="4" fill="${th.bg}" opacity=".86"/>`;
      s += txt;
    }
  }
  return s + '</svg>';
}
function legendWidth(series) { const L = Math.max(8, ...series.filter(se => se.name).map(se => se.name.length)); return Math.min(300, Math.max(120, Math.round(6.4 * L + 48))); }
function legendKey(x, y, col, se, th) {
  if (se.points && !se.line) return se.points === 'square' ? `<rect x="${x + 5}" y="${y - 4}" width="8" height="8" fill="${th.bg}" stroke="${col}" stroke-width="2"/>` : `<circle cx="${x + 9}" cy="${y}" r="3.8" fill="${se.hollow ? th.bg : col}" stroke="${col}" stroke-width="1.6"/>`;
  return `<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}" stroke="${col}" stroke-width="${se.width || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
}
function logTicks(a, b) { const t = []; for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) t.push(v); } return t; }

/* ---------- grain cross-section ----------
   o: {cx, cy, a (px, semi-axis at current size), b, rings: [{f: outer radius fraction, color, chalk (0–1)}],
       outline0: fraction of current radius for the original size (dashed), split: {left: rings, right: rings}, uid, theme, stroke} */
/* Rice-grain outline: a flattened superellipse, slightly tapered towards one end, with a small
   embryo notch at the blunt end. Display shape only (illustrative); size comes from the model. */
function ricePath(cx, cy, a, b) {
  const n = 72, e = 2 / 2.25, pts = [];
  for (let k = 0; k < n; k++) {
    const th = 2 * Math.PI * k / n, c = Math.cos(th), s = Math.sin(th);
    let x = a * Math.sign(c) * Math.pow(Math.abs(c), e), y = b * Math.sign(s) * Math.pow(Math.abs(s), e) * (1 - 0.07 * c);
    const d = th - 2.75, notch = 1 - 0.06 * Math.exp(-(d * d) / 0.02);              // small embryo notch, lower blunt end
    pts.push([cx + x * notch, cy + y * notch]);
  }
  return 'M' + pts.map(p => n2(p[0]) + ',' + n2(p[1])).join('L') + 'Z';
}
function annulus(cx, cy, a, b, f0, f1) {
  return ricePath(cx, cy, a * f1, b * f1) + (f0 > 1e-6 ? ricePath(cx, cy, a * f0, b * f0) : '');
}
function ringsSVG(cx, cy, a, b, rings, extra) {
  let s = '', f0 = 0;
  for (const r of rings) { s += `<path d="${annulus(cx, cy, a, b, f0, r.f)}" fill="${r.color}" stroke="${r.color}" stroke-width=".6" fill-rule="evenodd" ${extra || ''}/>`; f0 = r.f; }
  return s;
}
function chalkSVG(cx, cy, a, b, rings) {
  let s = '', f0 = 0;
  for (const r of rings) { if (r.chalk > 0.01) s += `<path d="${annulus(cx, cy, a, b, f0, r.f)}" fill="#fbfaf6" fill-rule="evenodd" opacity="${n2(0.92 * r.chalk)}"/>`; f0 = r.f; }
  return s;
}
function grainSection(o) {
  const th = THEMES[o.theme || 'light'], uid = o.uid || 'g';
  let s = '';
  if (o.split) {
    s += `<defs><clipPath id="L-${uid}"><rect x="${o.cx - o.a - 4}" y="${o.cy - o.b - 4}" width="${o.a + 4}" height="${2 * o.b + 8}"/></clipPath><clipPath id="R-${uid}"><rect x="${o.cx}" y="${o.cy - o.b - 4}" width="${o.a + 4}" height="${2 * o.b + 8}"/></clipPath></defs>`;
    s += `<g clip-path="url(#L-${uid})">${ringsSVG(o.cx, o.cy, o.a, o.b, o.split.left)}</g><g clip-path="url(#R-${uid})">${ringsSVG(o.cx, o.cy, o.a, o.b, o.split.right)}</g>`;
    s += `<line x1="${o.cx}" y1="${o.cy - o.b - 6}" x2="${o.cx}" y2="${o.cy + o.b + 6}" stroke="${th.ink}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  } else {
    s += ringsSVG(o.cx, o.cy, o.a, o.b, o.rings);
    if (o.chalk) s += chalkSVG(o.cx, o.cy, o.a, o.b, o.rings);
  }
  // surface realism (illustrative): specular highlight that grows glossier as the grain cooks, edge shading, shallow grooves
  const gloss = o.gloss != null ? Math.min(1, Math.max(0, o.gloss)) : 0.35, outer = ricePath(o.cx, o.cy, o.a, o.b);
  s += `<defs><radialGradient id="hl-${uid}" cx=".33" cy=".27" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity="${n2(0.12 + 0.5 * gloss)}"/><stop offset=".38" stop-color="#ffffff" stop-opacity="${n2(0.04 + 0.12 * gloss)}"/><stop offset=".72" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".22"/></radialGradient></defs>`;
  s += `<path d="${outer}" fill="url(#hl-${uid})"/>`;
  const gr = (k) => `M${n2(o.cx - 0.82 * o.a)},${n2(o.cy + k * o.b)}Q${n2(o.cx)},${n2(o.cy + (k - 0.12 * Math.sign(k)) * o.b * 1.05)} ${n2(o.cx + 0.8 * o.a)},${n2(o.cy + k * 0.85 * o.b)}`;
  s += `<path d="${gr(-0.42)}" fill="none" stroke="#ffffff" stroke-opacity="${n2(0.18 + 0.2 * gloss)}" stroke-width="1.4"/><path d="${gr(0.4)}" fill="none" stroke="#000000" stroke-opacity=".08" stroke-width="1.4"/>`;
  if (o.front != null && o.front > 0.01) s += `<path d="${annulus(o.cx, o.cy, o.a, o.b, 0, o.front)}" fill="none" stroke="${o.frontColor || '#c2412d'}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  s += `<path d="${outer}" fill="none" stroke="${o.stroke || th.ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
  if (o.outline0 && Math.abs(o.outline0 - 1) > 0.01) s += `<path d="${annulus(o.cx, o.cy, o.a, o.b, 0, o.outline0)}" fill="none" stroke="${th.muted}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  return s;
}
/* Turn a radial profile into display rings (coarsened to at most nMax rings). */
function profileRings(prof, valueToColor, chalkOf, nMax) {
  const N = prof.r.length, step = Math.max(1, Math.ceil(N / (nMax || 40))), R = prof.R, rings = [];
  for (let i = 0; i < N; i += step) {
    const j = Math.min(N - 1, i + step - 1), mid = Math.floor((i + j) / 2);
    rings.push({ f: prof.rf[j + 1] / R, color: valueToColor(prof, mid), chalk: chalkOf ? chalkOf(prof, mid) : 0 });
  }
  return rings;
}

/* ---------- colour bar ---------- */
function colorbar(o) {
  const th = THEMES[o.theme || 'light'], x = o.x, y = o.y, w = o.w || 160, h = o.h || 10, uid = o.uid || 'cb';
  const stops = o.stops || CMAPS[o.cmap];
  let s = `<defs><linearGradient id="lg-${uid}" x1="0" x2="1" y1="0" y2="0">${stops.map((c, i) => `<stop offset="${(100 * i / (stops.length - 1)).toFixed(1)}%" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#lg-${uid})" stroke="${th.axis}" stroke-width=".6"/>`;
  s += `<text x="${x}" y="${y + h + 13}" font-size="10.5" fill="${th.muted}">${esc(o.minLabel)}</text><text x="${x + w}" y="${y + h + 13}" font-size="10.5" text-anchor="end" fill="${th.muted}">${esc(o.maxLabel)}</text>`;
  if (o.label) s += `<text x="${x}" y="${y - 5}" font-size="11" fill="${th.ink}">${esc(o.label)}</text>`;
  return s;
}

/* ---------- horizontal bars with markers (log x allowed) ---------- */
function barChart(o) {
  const th = THEMES[o.theme || 'light'], W = o.w || 720, rowH = o.rowH || 30, m = { l: o.labelW || 270, r: 24, t: o.title ? 40 : 18, b: 58 };
  const H = m.t + m.b + rowH * o.rows.length, pw = W - m.l - m.r;
  const lx = v => Math.log10(v), xMin = o.xMin, xMax = o.xMax;
  const sx = o.xLog ? v => m.l + pw * (lx(v) - lx(xMin)) / (lx(xMax) - lx(xMin)) : v => m.l + pw * (v - xMin) / (xMax - xMin);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="${esc(o.title || 'bar chart')}"><rect width="${W}" height="${H}" fill="${th.bg}"/>`;
  if (o.title) s += `<text x="16" y="22" font-size="14" font-weight="600" fill="${th.ink}">${esc(o.title)}</text>`;
  const ticks = o.ticks || (o.xLog ? logTicks(xMin, xMax) : niceTicks(xMin, xMax, 6));
  for (const v of ticks) { const X = n2(sx(v)); s += `<line x1="${X}" y1="${m.t}" x2="${X}" y2="${m.t + rowH * o.rows.length}" stroke="${th.grid}"/><text x="${X}" y="${m.t + rowH * o.rows.length + 15}" font-size="11" text-anchor="middle" fill="${th.muted}">${esc(o.tickFmt ? o.tickFmt(v) : fmtTick(v))}</text>`; }
  if (o.xLabel) s += `<text x="${m.l + pw / 2}" y="${m.t + rowH * o.rows.length + 34}" font-size="12" text-anchor="middle" fill="${th.ink}">${esc(o.xLabel)}</text>`;
  o.rows.forEach((r, i) => {
    const y = m.t + i * rowH, x0 = sx(xMin);
    s += `<text x="${m.l - 10}" y="${y + rowH / 2 + 4}" font-size="11.5" text-anchor="end" fill="${th.ink}">${esc(r.label)}</text>`;
    if (r.value != null && isFinite(r.value)) { const X = sx(Math.max(r.value, xMin)); s += `<rect x="${x0}" y="${y + 6}" width="${n2(Math.max(1, X - x0))}" height="${rowH - 12}" rx="3" fill="${r.color || th.series[0]}" opacity=".9"/><text x="${n2(X + 5)}" y="${y + rowH / 2 + 4}" font-size="11" fill="${th.ink}">${esc(r.valueLabel || '')}</text>`; }
    for (const mk of r.markers || []) { if (mk.x == null || !isFinite(mk.x)) continue; const X = n2(sx(mk.x)); s += mk.shape === 'diamond' ? `<path d="M${X},${y + 5}l6,${rowH / 2 - 5}l-6,${rowH / 2 - 5}l-6,${-(rowH / 2 - 5)}Z" fill="${mk.color}" stroke="${th.bg}" stroke-width="1"/>` : `<rect x="${X - 2}" y="${y + 3}" width="4" height="${rowH - 6}" fill="${mk.color}"/>`; }
  });
  if (o.legend) { let x = 16; const y = H - 12; for (const L of o.legend) { s += (L.shape === 'diamond' ? `<path d="M${x + 6},${y - 9}l6,6l-6,6l-6,-6Z" fill="${L.color}"/>` : L.shape === 'tick' ? `<rect x="${x + 4}" y="${y - 10}" width="4" height="14" fill="${L.color}"/>` : `<rect x="${x}" y="${y - 8}" width="14" height="10" rx="2" fill="${L.color}"/>`) + `<text x="${x + 20}" y="${y}" font-size="11" fill="${th.ink}">${esc(L.label)}</text>`; x += 26 + 6.3 * L.label.length; } }
  return s + '</svg>';
}

/* ---------- stacked areas ---------- */
function stackedArea(o) {
  const series = o.series, n = o.x.length, cum = series.map(() => new Array(n).fill(0)), th = THEMES[o.theme || 'light'];
  for (let i = 0; i < n; i++) { let acc = 0; series.forEach((se, k) => { acc += Math.max(0, se.y[i] || 0); cum[k][i] = acc; }); }
  const top = Math.max(...cum[cum.length - 1], ...(o.overlay ? o.overlay.y.filter(isFinite) : [0]));
  const yMax = o.yMax != null ? o.yMax : top * 1.05;
  const lines = series.map((se, k) => ({ name: se.name, x: o.x, y: cum[k], color: se.color, width: 1.2 }))
    .concat(o.overlay ? [{ name: o.overlay.name, x: o.x, y: o.overlay.y, color: th.ink, dash: '4 3', width: 1.7 }] : []);
  const base = { ...o, yMin: 0, yMax, yPad: false, series: lines };
  let svg = linePlot(base);
  // filled bands, drawn with the same scales, inserted just after the clip group opens
  const W = o.w || 640, H = o.h || 300, legendRight = o.legend === 'right';
  const m = { l: 62, r: legendRight ? legendWidth(lines) : 20, t: o.title ? 34 : 16, b: o.note ? 58 : 46 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xMin = o.xMin != null ? o.xMin : Math.min(...o.x), xMax = o.xMax != null ? o.xMax : Math.max(...o.x);
  const sx = v => m.l + pw * (v - xMin) / (xMax - xMin), sy = v => m.t + ph * (1 - v / yMax);
  let bands = '';
  series.forEach((se, k) => {
    const top = o.x.map((x, i) => `${n2(sx(x))},${n2(sy(cum[k][i]))}`), bot = o.x.map((x, i) => `${n2(sx(x))},${n2(sy(k ? cum[k - 1][i] : 0))}`).reverse();
    bands += `<polygon points="${top.concat(bot).join(' ')}" fill="${se.color}" opacity="${se.opacity || 0.55}"/>`;
  });
  return svg.replace(/(<g clip-path="url\(#cp-[^"]*\)">)/, '$1' + bands);
}

/* ---------- simple flow (Sankey-style) diagram: one source split into sinks ---------- */
function flowDiagram(o) {
  const th = THEMES[o.theme || 'light'], W = o.w || 360, H = o.h || 200, x0 = o.x || 0, y0 = o.y || 0;
  const tot = o.sinks.reduce((a, s) => a + Math.max(0, s.value), 0) || 1, gap = 6, usable = H - 30 - gap * (o.sinks.length - 1);
  let s = '', yS = y0 + 20, yT = y0 + 20, lastLab = -1e9;
  const srcH = usable;
  s += `<rect x="${x0}" y="${y0 + 20}" width="12" height="${n2(srcH + gap * (o.sinks.length - 1))}" rx="3" fill="${o.sourceColor || th.series[0]}"/>`;
  s += `<text x="${x0}" y="${y0 + 12}" font-size="11.5" font-weight="600" fill="${th.ink}">${esc(o.source)}</text>`;
  const xr = x0 + W - 150;
  o.sinks.forEach((k) => {
    const hgt = Math.max(1.5, usable * Math.max(0, k.value) / tot);
    s += `<path d="M${x0 + 12},${n2(yS)}C${n2((x0 + xr) / 2)},${n2(yS)} ${n2((x0 + xr) / 2)},${n2(yT)} ${xr},${n2(yT)}L${xr},${n2(yT + hgt)}C${n2((x0 + xr) / 2)},${n2(yT + hgt)} ${n2((x0 + xr) / 2)},${n2(yS + hgt)} ${x0 + 12},${n2(yS + hgt)}Z" fill="${k.color}" opacity=".55"/>`;
    s += `<rect x="${xr}" y="${n2(yT)}" width="8" height="${n2(hgt)}" fill="${k.color}"/>`;
    const ly = Math.max(yT + hgt / 2 + 4, lastLab + 14); lastLab = ly;
    s += `<text x="${xr + 14}" y="${n2(ly)}" font-size="11" fill="${th.ink}">${esc(k.label)}</text>`;
    yS += hgt; yT += hgt + gap;
  });
  return s;
}

/* ---------- wrap fragments as a standalone SVG ---------- */
function wrap(inner, W, H, theme, title) {
  const th = THEMES[theme || 'light'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">` +
    `<rect width="${W}" height="${H}" fill="${th.bg}"/>` + (title ? `<text x="16" y="22" font-size="14" font-weight="600" fill="${th.ink}">${esc(title)}</text>` : '') + inner + '</svg>';
}

const api = { THEMES, CMAPS, lerpColor, colorFor, moistColor, heatColor, niceTicks, fmtTick, linePlot, grainSection, ricePath, profileRings, colorbar, barChart, stackedArea, flowDiagram, wrap, esc };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RicePlots = api;
})(typeof window !== 'undefined' ? window : globalThis);
