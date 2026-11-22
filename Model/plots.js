/* =============================================================================
   Rice on the Boil — SVG figure builder (plots.js)
   Pure string building, no DOM. Exposes window.RicePlots and module.exports.
   Every figure carries a CALCULATED / ILLUSTRATIVE / OBSERVED tag.
   ============================================================================= */
(function (root) {
  'use strict';

  var THEMES = {
    light: { name: 'light', bg: '#fffdf8', ink: '#2b2622', muted: '#776b5f', grid: '#ece4d6', axis: '#b5a893',
      panel: '#f7f1e6', series: ['#b8700f', '#2f7fb5', '#c2412d', '#4f8a3c', '#8a4f8a', '#4c5b6a'],
      tag: { CALCULATED: '#b8700f', ILLUSTRATIVE: '#2f7fb5', OBSERVED: '#4f8a3c' } },
    dark: { name: 'dark', bg: '#1f1c19', ink: '#efe7da', muted: '#a89c8c', grid: '#36302a', axis: '#6e6356',
      panel: '#2a2622', series: ['#e3a040', '#5fa8dc', '#ec7059', '#7cba66', '#bd84bd', '#97a7b6'],
      tag: { CALCULATED: '#e3a040', ILLUSTRATIVE: '#5fa8dc', OBSERVED: '#7cba66' } }
  };
  function theme(t) { return typeof t === 'object' && t ? t : (THEMES[t] || THEMES.light); }

  var HEAT = ['#24306e', '#563b9a', '#9b3d8e', '#d2524a', '#f08a2c', '#f9d45c'];
  var MOIST = ['#f1e4c6', '#d5dcb4', '#9fcbbf', '#5aa5bd', '#2e75a8', '#1d4677'];
  var FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  var SERIF = "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif";

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function rgb2hex(c) { return '#' + c.map(function (v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function lerpColor(a, b, f) { var A = hex2rgb(a), B = hex2rgb(b); return rgb2hex([0, 1, 2].map(function (i) { return A[i] + (B[i] - A[i]) * f; })); }
  function rampColor(stops, f) {
    if (!isFinite(f)) f = 0;
    f = Math.max(0, Math.min(1, f)) * (stops.length - 1);
    var i = Math.min(Math.floor(f), stops.length - 2);
    return lerpColor(stops[i], stops[i + 1], f - i);
  }
  /* sequential colours for time snapshots (early → late) */
  var SEQ = { light: ['#e0a63a', '#c8572a', '#9b3d6e', '#5b3f8c', '#24477a'], dark: ['#f2c063', '#ee7d4e', '#d36aa0', '#9b86d6', '#6fa3dc'] };
  function seqColors(n, t) { var st = SEQ[theme(t).name] || SEQ.light; var o = []; for (var i = 0; i < n; i++) o.push(rampColor(st, n > 1 ? i / (n - 1) : 0)); return o; }
  function heatColor(T, Tmin, Tmax) { return rampColor(HEAT, (T - Tmin) / (Tmax - Tmin)); }
  /* moisture map on WET BASIS, 10–75 % */
  function wetBasis(X) { return X / (1 + X); }
  function moistureColor(X) { return rampColor(MOIST, (wetBasis(X) - 0.10) / (0.75 - 0.10)); }

  function fmt(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) { var e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e); return (Math.abs(m - Math.round(m)) < 1e-9 ? Math.round(m) : m.toFixed(1)) + 'e' + e; }
    var s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function niceStep(span, n) {
    var raw = span / Math.max(n, 1), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function niceTicks(a, b, n) {
    if (!(b > a)) { b = a + 1; }
    var st = niceStep(b - a, n || 5), t = [], v = Math.ceil(a / st - 1e-9) * st;
    for (; v <= b + st * 1e-9; v += st) t.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
    return t;
  }
  function logTicks(a, b) {
    var t = [], e0 = Math.floor(Math.log10(a)), e1 = Math.ceil(Math.log10(b)), dec = e1 - e0;
    for (var e = e0; e <= e1; e++) {
      var mult = dec <= 2 ? [1, 2, 5] : dec <= 4 ? [1, 3] : [1];
      mult.forEach(function (m) { var v = m * Math.pow(10, e); if (v >= a * (1 - 1e-9) && v <= b * (1 + 1e-9)) t.push(v); });
    }
    return t;
  }
  function wrap(text, maxChars) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function textW(s, size) { return String(s).length * (size || 12) * 0.56; }
  var uid = 0;
  function nextId(p) { uid++; return (p || 'rp') + uid; }

  function svgOpen(w, h, th, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" font-family="' + esc(FONT) + '" ' + (extra || '') + '><rect width="' + w + '" height="' + h + '" fill="' + th.bg + '"/>';
  }
  function tagBadge(x, y, tag, th, anchorRight) {
    if (!tag) return '';
    var c = th.tag[tag] || th.muted, w = String(tag).length * 7.4 + 16;
    var x0 = anchorRight ? x - w : x;
    return '<g class="tag"><rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="17" rx="8.5" fill="none" stroke="' + c +
      '" stroke-width="1.2"/><text x="' + (x0 + w / 2) + '" y="' + (y + 12) + '" font-size="10" font-weight="700" letter-spacing="0.06em" fill="' + c +
      '" text-anchor="middle">' + esc(tag) + '</text></g>';
  }
  function titleText(t, x, avail, th) {
    var size = Math.max(11, Math.min(15, avail / (String(t).length * 0.52)));
    return '<text x="' + x + '" y="22" font-family="' + esc(SERIF) + '" font-size="' + size.toFixed(1) + '" font-weight="600" fill="' + th.ink + '">' + esc(t) + '</text>';
  }
  function halo(th) { return ' stroke="' + th.bg + '" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round"'; }
  function decimate(x, y, n) {
    var L = x.length; if (L <= n) return { x: x.slice(), y: y.slice() };
    var ox = [], oy = [], st = (L - 1) / (n - 1);
    for (var i = 0; i < n; i++) { var k = Math.round(i * st); ox.push(x[k]); oy.push(y[k]); }
    return { x: ox, y: oy };
  }

  /* ---------- axes frame shared by line and stacked plots ---------- */
  function frame(spec, th) {
    var W = spec.width || 640, H = spec.height || 360;
    var legendRight = spec.legend === 'right';
    var names = (spec.series || spec.layers || []).filter(function (s) { return s.name && !s.noLegend; }).map(function (s) { return s.name; });
    if (spec.overlay && spec.overlay.name) names.push(spec.overlay.name);
    var lw = legendRight ? Math.min(220, Math.max.apply(null, names.map(function (n) { return textW(n, 11); }).concat([40])) + 34) : 0;
    var ml = spec.ml || 62, mr = (spec.mr || 18) + lw, mt = spec.title ? 42 : 30, mb = spec.note ? 78 : 46;
    var legendRows = 0, legendItems = [];
    if (spec.legend !== 'none' && !legendRight && names.length) {
      var avail = W - ml - mr - 16, xx = 0, row = 0;
      names.forEach(function (n) {
        var w = textW(n, 11) + 30;
        if (xx + w > avail && xx > 0) { row++; xx = 0; }
        legendItems.push({ name: n, x: xx, row: row }); xx += w;
      });
      legendRows = row + 1;
      mt += legendRows * 17 + 10;
    }
    return { W: W, H: H, ml: ml, mr: mr, mt: mt, mb: mb, x0: ml, x1: W - mr, y0: mt, y1: H - mb, lw: lw, legendItems: legendItems, legendRows: legendRows };
  }
  function scaler(lo, hi, p0, p1, log) {
    if (log) { var a = Math.log10(lo), b = Math.log10(hi); return function (v) { return p0 + (Math.log10(Math.max(v, 1e-300)) - a) / (b - a) * (p1 - p0); }; }
    return function (v) { return p0 + (v - lo) / (hi - lo) * (p1 - p0); };
  }
  function range(vals, log, pad) {
    var a = Infinity, b = -Infinity;
    vals.forEach(function (v) { if (isFinite(v) && (!log || v > 0)) { if (v < a) a = v; if (v > b) b = v; } });
    if (!isFinite(a)) { a = log ? 1 : 0; b = log ? 10 : 1; }
    if (b === a) { if (log) { a /= 2; b *= 2; } else { a -= 0.5; b += 0.5; } }
    if (!log && pad) { var d = (b - a) * pad; b += d; if (a !== 0) a -= d; }
    return [a, b];
  }
  function axes(spec, F, th, X, Y, xr, yr) {
    var s = '', i;
    var xt = spec.xticks || (spec.xlog ? logTicks(xr[0], xr[1]) : niceTicks(xr[0], xr[1], Math.max(3, Math.round((F.x1 - F.x0) / 90))));
    var yt = spec.yticks || (spec.ylog ? logTicks(yr[0], yr[1]) : niceTicks(yr[0], yr[1], Math.max(3, Math.round((F.y1 - F.y0) / 55))));
    s += '<g class="grid" stroke="' + th.grid + '" stroke-width="1">';
    for (i = 0; i < xt.length; i++) { var px = X(xt[i]); if (px >= F.x0 - 0.5 && px <= F.x1 + 0.5) s += '<line x1="' + px.toFixed(1) + '" y1="' + F.y0 + '" x2="' + px.toFixed(1) + '" y2="' + F.y1 + '"/>'; }
    for (i = 0; i < yt.length; i++) { var py = Y(yt[i]); if (py >= F.y0 - 0.5 && py <= F.y1 + 0.5) s += '<line x1="' + F.x0 + '" y1="' + py.toFixed(1) + '" x2="' + F.x1 + '" y2="' + py.toFixed(1) + '"/>'; }
    s += '</g><g font-size="11" fill="' + th.muted + '">';
    for (i = 0; i < xt.length; i++) { px = X(xt[i]); if (px >= F.x0 - 0.5 && px <= F.x1 + 0.5) s += '<text x="' + px.toFixed(1) + '" y="' + (F.y1 + 15) + '" text-anchor="middle">' + esc(spec.xfmt ? spec.xfmt(xt[i]) : fmt(xt[i])) + '</text>'; }
    for (i = 0; i < yt.length; i++) { py = Y(yt[i]); if (py >= F.y0 - 0.5 && py <= F.y1 + 0.5) s += '<text x="' + (F.x0 - 7) + '" y="' + (py + 4).toFixed(1) + '" text-anchor="end">' + esc(spec.yfmt ? spec.yfmt(yt[i]) : fmt(yt[i])) + '</text>'; }
    s += '</g>';
    s += '<rect x="' + F.x0 + '" y="' + F.y0 + '" width="' + (F.x1 - F.x0) + '" height="' + (F.y1 - F.y0) + '" fill="none" stroke="' + th.axis + '"/>';
    if (spec.xlabel) s += '<text x="' + ((F.x0 + F.x1) / 2) + '" y="' + (F.y1 + 33) + '" font-size="12" fill="' + th.ink + '" text-anchor="middle">' + esc(spec.xlabel) + '</text>';
    if (spec.ylabel) s += '<text transform="translate(' + 15 + ',' + ((F.y0 + F.y1) / 2) + ') rotate(-90)" font-size="12" fill="' + th.ink + '" text-anchor="middle">' + esc(spec.ylabel) + '</text>';
    return s;
  }
  function header(spec, F, th) {
    var s = '';
    if (spec.title) s += titleText(spec.title, F.x0, F.W - F.x0 - 120, th);
    s += tagBadge(F.W - 10, 8, spec.tag || 'CALCULATED', th, true);
    if (spec.note) {
      var lines = wrap(spec.note, Math.floor((F.W - 30) / 6.2)).slice(0, 2);
      lines.forEach(function (l, i) { s += '<text x="' + F.x0 + '" y="' + (F.y1 + 52 + i * 13) + '" font-size="10.5" fill="' + th.muted + '">' + esc(l) + '</text>'; });
    }
    return s;
  }
  function legend(spec, F, th, items) {
    if (spec.legend === 'none' || !items.length) return '';
    var s = '';
    function swatch(x, y, it) {
      if (it.type === 'points') return '<rect x="' + (x + 6) + '" y="' + (y - 4) + '" width="8" height="8" fill="' + it.color + '"/>';
      if (it.type === 'area') return '<rect x="' + x + '" y="' + (y - 5) + '" width="20" height="10" fill="' + it.color + '" opacity="0.8"/>';
      return '<line x1="' + x + '" y1="' + y + '" x2="' + (x + 20) + '" y2="' + y + '" stroke="' + it.color + '" stroke-width="2.4"' + (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '/>';
    }
    if (spec.legend === 'right') {
      var lx = F.x1 + 14, ly = F.y0 + 6;
      items.forEach(function (it, i) {
        var y = ly + i * 18;
        s += swatch(lx, y, it) + '<text x="' + (lx + 26) + '" y="' + (y + 4) + '" font-size="11" fill="' + th.ink + '">' + esc(it.name) + '</text>';
      });
      return s;
    }
    var bx = F.x0, by = F.y0 - F.legendRows * 17 - 12, bw = F.x1 - F.x0, bh = F.legendRows * 17 + 6;
    s += '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="5" fill="' + th.panel + '" stroke="' + th.grid + '"/>';
    F.legendItems.forEach(function (li) {
      var it = items.filter(function (q) { return q.name === li.name; })[0] || {};
      var x = bx + 8 + li.x, y = by + 12 + li.row * 17;
      s += swatch(x, y, it) + '<text x="' + (x + 25) + '" y="' + (y + 4) + '" font-size="11" fill="' + th.ink + '">' + esc(li.name) + '</text>';
    });
    return s;
  }
  function refLines(spec, F, th, X, Y) {
    var s = '';
    (spec.hlines || []).forEach(function (h) {
      var y = Y(h.y); if (!(y >= F.y0 - 1 && y <= F.y1 + 1)) return;
      var c = h.color || th.muted;
      s += '<line x1="' + F.x0 + '" y1="' + y.toFixed(1) + '" x2="' + F.x1 + '" y2="' + y.toFixed(1) + '" stroke="' + c + '" stroke-width="1.2" stroke-dasharray="' + (h.dash || '5 4') + '"/>';
      if (h.label) s += '<text x="' + (F.x1 - 6) + '" y="' + (y - 5).toFixed(1) + '" font-size="10.5" fill="' + c + '" text-anchor="end"' + halo(th) + '>' + esc(h.label) + '</text>';
    });
    var vl = (spec.vlines || []).slice().sort(function (a, b) { return a.x - b.x; }), lastY = {}, k = 0;
    vl.forEach(function (v) {
      var x = X(v.x); if (!(x >= F.x0 - 1 && x <= F.x1 + 1)) return;
      var c = v.color || th.muted;
      s += '<line x1="' + x.toFixed(1) + '" y1="' + F.y0 + '" x2="' + x.toFixed(1) + '" y2="' + F.y1 + '" stroke="' + c + '" stroke-width="1.2" stroke-dasharray="' + (v.dash || '4 3') + '"/>';
      if (v.label) {
        var flip = x > F.x0 + (F.x1 - F.x0) * 0.72;
        var ly = F.y1 - 8 - (k % 3) * 14; k++;
        s += '<text x="' + (x + (flip ? -5 : 5)).toFixed(1) + '" y="' + ly + '" font-size="10.5" fill="' + c + '" text-anchor="' + (flip ? 'end' : 'start') + '"' + halo(th) + '>' + esc(v.label) + '</text>';
      }
    });
    return s;
  }
  function pathOf(xs, ys, X, Y) {
    var d = '', pen = false;
    for (var i = 0; i < xs.length; i++) {
      var v = ys[i], u = xs[i];
      if (v === null || v === undefined || !isFinite(v) || !isFinite(u)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + X(u).toFixed(1) + ' ' + Y(v).toFixed(1);
      pen = true;
    }
    return d;
  }
  function plotData(F, xr, yr, spec, series) {
    var o = { x0: F.x0, x1: F.x1, y0: F.y0, y1: F.y1, W: F.W, H: F.H, xmin: xr[0], xmax: xr[1], ymin: yr[0], ymax: yr[1],
      xlog: !!spec.xlog, ylog: !!spec.ylog, xlabel: spec.xlabel || 'x', ylabel: spec.ylabel || 'y', xunit: spec.xunit || '', yunit: spec.yunit || '',
      series: series.filter(function (s) { return s.name && !s.noHover; }).map(function (s) {
        var d = decimate(s.x, s.y, 400);
        return { name: s.name, color: s.color, x: d.x.map(function (v) { return +(+v).toPrecision(5); }), y: d.y.map(function (v) { return v === null || !isFinite(v) ? null : +(+v).toPrecision(5); }) };
      }) };
    return esc(JSON.stringify(o));
  }

  /* ---------- line plot ---------- */
  function linePlot(spec) {
    var th = theme(spec.theme), series = (spec.series || []).map(function (s, i) {
      var c = s.color || th.series[i % th.series.length];
      return { name: s.name, x: s.x || [], y: s.y || [], type: s.type || 'line', color: c, width: s.width || 2, dash: s.type === 'dash' ? (s.dash || '6 4') : s.dash,
        opacity: s.opacity, noLegend: s.noLegend, noHover: s.noHover, marker: s.marker, base: s.base };
    });
    var F = frame(spec, th);
    var allX = [], allY = [];
    series.forEach(function (s) { allX = allX.concat(s.x); allY = allY.concat(s.y.filter(function (v) { return v !== null; })); });
    (spec.hlines || []).forEach(function (h) { if (spec.hlinesInRange !== false) allY.push(h.y); });
    var xr = range(allX, spec.xlog, 0), yr = range(allY, spec.ylog, 0.06);
    if (spec.xmin !== undefined) xr[0] = spec.xmin; if (spec.xmax !== undefined) xr[1] = spec.xmax;
    if (spec.ymin !== undefined) yr[0] = spec.ymin; if (spec.ymax !== undefined) yr[1] = spec.ymax;
    if (!spec.ylog && spec.ymin === undefined && yr[0] > 0 && yr[0] < (yr[1] - yr[0]) * 0.4) yr[0] = 0;
    var X = scaler(xr[0], xr[1], F.x0, F.x1, spec.xlog), Y = scaler(yr[0], yr[1], F.y1, F.y0, spec.ylog);
    var cid = nextId('clip');
    var s = svgOpen(F.W, F.H, th, 'class="riceplot" data-plot="' + plotData(F, xr, yr, spec, series) + '"');
    s += '<defs><clipPath id="' + cid + '"><rect x="' + F.x0 + '" y="' + F.y0 + '" width="' + (F.x1 - F.x0) + '" height="' + (F.y1 - F.y0) + '"/></clipPath></defs>';
    s += header(spec, F, th) + axes(spec, F, th, X, Y, xr, yr);
    s += '<g clip-path="url(#' + cid + ')">';
    series.forEach(function (sr) {
      if (sr.type === 'area') {
        var d = pathOf(sr.x, sr.y, X, Y);
        if (d) {
          var base = sr.base ? sr.base : null, back = '';
          if (base) { for (var i = sr.x.length - 1; i >= 0; i--) back += 'L' + X(sr.x[i]).toFixed(1) + ' ' + Y(base[i]).toFixed(1); }
          else back = 'L' + X(sr.x[sr.x.length - 1]).toFixed(1) + ' ' + Y(Math.max(yr[0], spec.ylog ? yr[0] : 0)).toFixed(1) + 'L' + X(sr.x[0]).toFixed(1) + ' ' + Y(Math.max(yr[0], spec.ylog ? yr[0] : 0)).toFixed(1);
          s += '<path d="' + d + back + 'Z" fill="' + sr.color + '" opacity="' + (sr.opacity || 0.25) + '"/>';
        }
      } else if (sr.type === 'points') {
        for (var j = 0; j < sr.x.length; j++) {
          if (!isFinite(sr.y[j]) || sr.y[j] === null) continue;
          var px = X(sr.x[j]), py = Y(sr.y[j]);
          if (sr.marker === 'circle') s += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.6" fill="' + th.bg + '" stroke="' + sr.color + '" stroke-width="1.6"/>';
          else s += '<rect x="' + (px - 3.5).toFixed(1) + '" y="' + (py - 3.5).toFixed(1) + '" width="7" height="7" fill="' + sr.color + '" stroke="' + th.bg + '" stroke-width="0.8"/>';
        }
      } else {
        s += '<path d="' + pathOf(sr.x, sr.y, X, Y) + '" fill="none" stroke="' + sr.color + '" stroke-width="' + sr.width + '"' + (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : '') +
          (sr.opacity ? ' opacity="' + sr.opacity + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>';
      }
    });
    s += '</g>' + refLines(spec, F, th, X, Y);
    if (spec.cursorX !== undefined && spec.cursorX !== null) {
      var cx = X(spec.cursorX);
      if (cx >= F.x0 && cx <= F.x1) s += '<line class="cursor" x1="' + cx.toFixed(1) + '" y1="' + F.y0 + '" x2="' + cx.toFixed(1) + '" y2="' + F.y1 + '" stroke="' + th.ink + '" stroke-width="1" opacity="0.55"/>';
    }
    s += legend(spec, F, th, series.filter(function (q) { return q.name && !q.noLegend; }));
    return s + '</svg>';
  }

  /* ---------- stacked area with optional dashed overlay on the same scale ---------- */
  function stackedArea(spec) {
    var th = theme(spec.theme), x = spec.x, layers = spec.layers.map(function (l, i) { return { name: l.name, y: l.y, color: l.color || th.series[i % th.series.length], type: 'area' }; });
    var F = frame(spec, th), cum = x.map(function () { return 0; }), tops = [];
    layers.forEach(function (l) { var b = cum.slice(); cum = cum.map(function (c, i) { return c + Math.max(0, l.y[i] || 0); }); tops.push({ base: b, top: cum.slice() }); });
    var ys = cum.slice(); if (spec.overlay) ys = ys.concat(spec.overlay.y);
    var xr = range(x, false, 0), yr = [0, range(ys, false, 0.06)[1]];
    if (spec.ymax !== undefined) yr[1] = spec.ymax;
    var X = scaler(xr[0], xr[1], F.x0, F.x1), Y = scaler(yr[0], yr[1], F.y1, F.y0);
    var hov = layers.map(function (l, i) { return { name: l.name, color: l.color, x: x, y: tops[i].top }; });
    if (spec.overlay) hov.push({ name: spec.overlay.name, color: spec.overlay.color || th.ink, x: x, y: spec.overlay.y });
    var s = svgOpen(F.W, F.H, th, 'class="riceplot" data-plot="' + plotData(F, xr, yr, spec, hov) + '"');
    s += header(spec, F, th) + axes(spec, F, th, X, Y, xr, yr);
    layers.forEach(function (l, i) {
      var d = '', j;
      for (j = 0; j < x.length; j++) d += (j ? 'L' : 'M') + X(x[j]).toFixed(1) + ' ' + Y(tops[i].top[j]).toFixed(1);
      for (j = x.length - 1; j >= 0; j--) d += 'L' + X(x[j]).toFixed(1) + ' ' + Y(tops[i].base[j]).toFixed(1);
      s += '<path d="' + d + 'Z" fill="' + l.color + '" opacity="0.82"/>';
    });
    var items = layers.map(function (l) { return { name: l.name, color: l.color, type: 'area' }; });
    if (spec.overlay) {
      var oc = spec.overlay.color || th.ink;
      s += '<path d="' + pathOf(x, spec.overlay.y, X, Y) + '" fill="none" stroke="' + oc + '" stroke-width="2" stroke-dasharray="6 4"/>';
      items.push({ name: spec.overlay.name, color: oc, dash: '6 4' });
    }
    s += refLines(spec, F, th, X, Y);
    if (spec.cursorX !== undefined && spec.cursorX !== null) { var cx = X(spec.cursorX); if (cx >= F.x0 && cx <= F.x1) s += '<line class="cursor" x1="' + cx.toFixed(1) + '" y1="' + F.y0 + '" x2="' + cx.toFixed(1) + '" y2="' + F.y1 + '" stroke="' + th.ink + '" opacity="0.55"/>'; }
    s += legend(spec, F, th, items);
    return s + '</svg>';
  }

  /* ---------- horizontal bar chart, log x ---------- */
  function barChart(spec) {
    var th = theme(spec.theme), items = spec.items, W = spec.width || 640;
    var rowH = spec.rowH || 30, labW = spec.labelWidth || Math.min(260, Math.max.apply(null, items.map(function (it) { return textW(it.label, 11.5); })) + 16);
    var mt = (spec.title ? 42 : 26) + (spec.legendItems ? 26 : 0), mb = spec.note ? 78 : 46;
    var H = spec.height || (mt + mb + items.length * rowH + 6);
    var F = { W: W, H: H, x0: labW + 10, x1: W - 22, y0: mt, y1: H - mb };
    var xr = [spec.xmin, spec.xmax];
    var X = scaler(xr[0], xr[1], F.x0, F.x1, spec.xlog !== false);
    var s = svgOpen(W, H, th, 'class="riceplot barchart"');
    if (spec.title) s += titleText(spec.title, 12, W - 140, th);
    s += tagBadge(W - 10, 8, spec.tag || 'CALCULATED', th, true);
    var ticks = spec.ticks || logTicks(xr[0], xr[1]);
    s += '<g stroke="' + th.grid + '">';
    ticks.forEach(function (t) { var x = X(t); s += '<line x1="' + x.toFixed(1) + '" y1="' + F.y0 + '" x2="' + x.toFixed(1) + '" y2="' + F.y1 + '"/>'; });
    s += '</g><g font-size="11" fill="' + th.muted + '" text-anchor="middle">';
    ticks.forEach(function (t) { s += '<text x="' + X(t).toFixed(1) + '" y="' + (F.y1 + 15) + '">' + esc(spec.tickFmt ? spec.tickFmt(t) : fmt(t)) + '</text>'; });
    s += '</g>';
    if (spec.xlabel) s += '<text x="' + ((F.x0 + F.x1) / 2) + '" y="' + (F.y1 + 33) + '" font-size="12" fill="' + th.ink + '" text-anchor="middle">' + esc(spec.xlabel) + '</text>';
    items.forEach(function (it, i) {
      var y = F.y0 + i * rowH + 4, bh = rowH - 10, c = it.color || th.series[0];
      s += '<text x="' + (F.x0 - 8) + '" y="' + (y + bh / 2 + 4) + '" font-size="11.5" fill="' + th.ink + '" text-anchor="end">' + esc(it.label) + '</text>';
      if (it.value !== null && isFinite(it.value)) {
        var xe = Math.min(F.x1, X(Math.max(it.value, xr[0])));
        s += '<rect class="bar" x="' + F.x0 + '" y="' + y + '" width="' + Math.max(0, xe - F.x0).toFixed(1) + '" height="' + bh + '" rx="3" fill="' + c + '" opacity="' + (it.opacity || 0.85) + '"/>';
        s += '<text x="' + (xe + 5).toFixed(1) + '" y="' + (y + bh / 2 + 4) + '" font-size="11" font-weight="600" fill="' + th.ink + '"' + halo(th) + '>' + esc(it.valueLabel || fmt(it.value)) + '</text>';
      }
      (it.markers || []).forEach(function (m) {
        if (!isFinite(m.v)) return;
        var mx = X(m.v), my = y + bh / 2, mc = m.color || th.ink;
        if (m.shape === 'diamond') s += '<path d="M' + mx.toFixed(1) + ' ' + (my - 6) + 'l6 6l-6 6l-6 -6Z" fill="' + mc + '" stroke="' + th.bg + '" stroke-width="1"/>';
        else s += '<line x1="' + mx.toFixed(1) + '" y1="' + (y - 2) + '" x2="' + mx.toFixed(1) + '" y2="' + (y + bh + 2) + '" stroke="' + mc + '" stroke-width="2.4"/>';
      });
    });
    s += '<line x1="' + F.x0 + '" y1="' + F.y0 + '" x2="' + F.x0 + '" y2="' + F.y1 + '" stroke="' + th.axis + '"/>';
    if (spec.legendItems) {
      var lx = 12, ly = mt - 14;
      spec.legendItems.forEach(function (li) {
        var c = li.color || th.ink;
        if (li.shape === 'diamond') s += '<path d="M' + (lx + 6) + ' ' + (ly - 6) + 'l6 6l-6 6l-6 -6Z" fill="' + c + '"/>';
        else if (li.shape === 'tick') s += '<line x1="' + (lx + 6) + '" y1="' + (ly - 7) + '" x2="' + (lx + 6) + '" y2="' + (ly + 7) + '" stroke="' + c + '" stroke-width="2.4"/>';
        else s += '<rect x="' + lx + '" y="' + (ly - 5) + '" width="14" height="10" rx="2" fill="' + c + '"/>';
        s += '<text x="' + (lx + 18) + '" y="' + (ly + 4) + '" font-size="11" fill="' + th.ink + '">' + esc(li.name) + '</text>';
        lx += textW(li.name, 11) + 34;
      });
    }
    if (spec.note) wrap(spec.note, Math.floor((W - 24) / 6.2)).slice(0, 2).forEach(function (l, i) { s += '<text x="12" y="' + (F.y1 + 52 + i * 13) + '" font-size="10.5" fill="' + th.muted + '">' + esc(l) + '</text>'; });
    return s + '</svg>';
  }

  /* ---------- colour bar fragment ---------- */
  function colorbar(o) {
    var th = theme(o.theme), id = nextId('cb'), stops = o.stops || HEAT, vert = !!o.vertical;
    var s = '<defs><linearGradient id="' + id + '" x1="0" y1="' + (vert ? 1 : 0) + '" x2="' + (vert ? 0 : 1) + '" y2="0">';
    stops.forEach(function (c, i) { s += '<stop offset="' + (i / (stops.length - 1)) + '" stop-color="' + c + '"/>'; });
    s += '</linearGradient></defs><rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" rx="3" fill="url(#' + id + ')" stroke="' + th.axis + '" stroke-width="0.8"/>';
    var ticks = o.ticks || [o.min, o.max];
    ticks.forEach(function (t) {
      var f = (t - o.min) / (o.max - o.min);
      if (vert) {
        var y = o.y + o.h * (1 - f);
        s += '<line x1="' + (o.x + o.w) + '" y1="' + y + '" x2="' + (o.x + o.w + 4) + '" y2="' + y + '" stroke="' + th.muted + '"/><text x="' + (o.x + o.w + 7) + '" y="' + (y + 4) + '" font-size="10.5" fill="' + th.muted + '">' + esc(o.fmt ? o.fmt(t) : fmt(t)) + '</text>';
      } else {
        var x = o.x + o.w * f;
        s += '<line x1="' + x + '" y1="' + (o.y + o.h) + '" x2="' + x + '" y2="' + (o.y + o.h + 4) + '" stroke="' + th.muted + '"/><text x="' + x + '" y="' + (o.y + o.h + 15) + '" font-size="10.5" fill="' + th.muted + '" text-anchor="middle">' + esc(o.fmt ? o.fmt(t) : fmt(t)) + '</text>';
      }
    });
    if (o.label) s += vert ? '<text x="' + (o.x + o.w / 2) + '" y="' + (o.y - 7) + '" font-size="10.5" fill="' + th.ink + '" text-anchor="middle">' + esc(o.label) + '</text>'
      : '<text x="' + o.x + '" y="' + (o.y - 6) + '" font-size="10.5" fill="' + th.ink + '">' + esc(o.label) + '</text>';
    return s;
  }

  /* ---------- Sankey-style flow fragment: one inflow splitting into outflows ---------- */
  function flowDiagram(o) {
    var th = theme(o.theme), total = 0, s = '';
    o.outs.forEach(function (q) { total += Math.max(0, q.value); });
    var inW = Math.max(total, 1e-12), maxBand = o.h * 0.62, xL = o.x, xR = o.x + o.w * 0.58;
    var yIn = o.y + (o.h - maxBand) / 2;
    s += '<rect x="' + xL + '" y="' + yIn + '" width="10" height="' + maxBand + '" rx="2" fill="' + (o.inColor || th.series[0]) + '"/>';
    if (o.inLabel) {
      s += '<text x="' + xL + '" y="' + (yIn - 6) + '" font-size="11" font-weight="600" fill="' + th.ink + '">' + esc(o.inLabel) + '</text>';
    }
    var yo = yIn, gap = 8, totalOutH = maxBand + gap * (o.outs.length - 1), yOutStart = o.y + (o.h - totalOutH) / 2, yR = yOutStart;
    var labels = [];
    o.outs.forEach(function (q) {
      var bh = Math.max(0, q.value) / inW * maxBand, c = q.color || th.series[1];
      if (bh > 0.2) {
        var y0 = yo, y1 = yo + bh, r0 = yR, r1 = yR + bh, xm = (xL + 10 + xR) / 2;
        s += '<path d="M' + (xL + 10) + ' ' + y0.toFixed(1) + 'C' + xm + ' ' + y0.toFixed(1) + ' ' + xm + ' ' + r0.toFixed(1) + ' ' + xR + ' ' + r0.toFixed(1) +
          'L' + xR + ' ' + r1.toFixed(1) + 'C' + xm + ' ' + r1.toFixed(1) + ' ' + xm + ' ' + y1.toFixed(1) + ' ' + (xL + 10) + ' ' + y1.toFixed(1) + 'Z" fill="' + c + '" opacity="0.55"/>';
        s += '<rect x="' + xR + '" y="' + r0.toFixed(1) + '" width="6" height="' + bh.toFixed(1) + '" fill="' + c + '"/>';
      }
      labels.push({ y: yR + bh / 2, q: q, c: c });
      yo += bh; yR += bh + gap;
    });
    for (var i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
    labels.forEach(function (l) {
      s += '<text x="' + (xR + 11) + '" y="' + (l.y + 4).toFixed(1) + '" font-size="11" fill="' + th.ink + '"><tspan fill="' + l.c + '" font-weight="700">■ </tspan>' + esc(l.q.label) +
        (l.q.valueLabel ? '<tspan fill="' + th.muted + '"> ' + esc(l.q.valueLabel) + '</tspan>' : '') + '</text>';
    });
    return s;
  }

  /* ---------- rice-grain drawing ---------- */
  function ricePath(cx, cy, a, b, rot) {
    var n = 72, pts = [], ex = 2 / 2.25, cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
    for (var k = 0; k < n; k++) {
      var th = 2 * Math.PI * k / n, c = Math.cos(th), s = Math.sin(th);
      var x = a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), ex), y = b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), ex);
      y *= 1 - 0.07 * (1 + x / a) / 2;                                            // tapered toward one end
      var dth = th - 2.75, notch = 1 - 0.09 * Math.exp(-dth * dth / (2 * 0.09 * 0.09)); // embryo notch
      x *= notch; y *= notch;
      pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    return 'M' + pts.map(function (p) { return p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join('L') + 'Z';
  }
  function annulus(cx, cy, a1, b1, a0, b0, rot) { return ricePath(cx, cy, a1, b1, rot) + ricePath(cx, cy, a0, b0, rot); }

  /* grain cross-section. o: {cx, cy, R0px (px for raw radius), profile {rc, rf, X, T, G, R}, R0 (m),
     mode 'moisture'|'heat', Tmin, Tmax, split, chalk, front, rawOutline, gloss, aspect, theme} */
  function grainSection(o) {
    var th = theme(o.theme), pr = o.profile, N = pr.X.length, id = nextId('gs');
    var scale = o.R0px / o.R0, Rpx = pr.R * scale, asp = o.aspect || 1.75, rot = o.rot || 0;
    var groups = [], step = Math.max(1, Math.ceil(N / 40));
    for (var i = 0; i < N; i += step) {
      var j = Math.min(N, i + step), X = 0, T = 0, G = 0, w = 0;
      for (var k = i; k < j; k++) { var ww = 1; X += pr.X[k] * ww; T += pr.T[k] * ww; G += pr.G[k] * ww; w += ww; }
      groups.push({ rOut: pr.rf[j] * scale, X: X / w, T: T / w, G: G / w });
    }
    var Tmin = o.Tmin === undefined ? 20 : o.Tmin, Tmax = o.Tmax === undefined ? 100 : o.Tmax;
    function rings(mode) {
      var s = '';
      for (var g = groups.length - 1; g >= 0; g--) {
        var q = groups[g], c = mode === 'heat' ? heatColor(q.T, Tmin, Tmax) : moistureColor(q.X);
        s += '<path d="' + ricePath(o.cx, o.cy, q.rOut * asp, q.rOut, rot) + '" fill="' + c + '"/>';
      }
      return s;
    }
    function chalk() {
      var s = '';
      for (var g = groups.length - 1; g >= 0; g--) {
        var q = groups[g], op = 0.92 * (1 - q.G), rin = g > 0 ? groups[g - 1].rOut : 0;
        if (op < 0.01) continue;
        s += '<path d="' + (rin > 0 ? annulus(o.cx, o.cy, q.rOut * asp, q.rOut, rin * asp, rin, rot) : ricePath(o.cx, o.cy, q.rOut * asp, q.rOut, rot)) +
          '" fill-rule="evenodd" fill="#ffffff" opacity="' + op.toFixed(3) + '"/>';
      }
      return s;
    }
    var s = '<g class="grain-section">';
    s += '<defs><clipPath id="' + id + 'L"><rect x="' + (o.cx - 4 * Rpx * asp) + '" y="' + (o.cy - 4 * Rpx) + '" width="' + (4 * Rpx * asp) + '" height="' + (8 * Rpx) + '"/></clipPath>' +
      '<clipPath id="' + id + 'R"><rect x="' + o.cx + '" y="' + (o.cy - 4 * Rpx) + '" width="' + (4 * Rpx * asp) + '" height="' + (8 * Rpx) + '"/></clipPath>' +
      '<radialGradient id="' + id + 'H" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="' + (0.12 + 0.5 * (o.gloss || 0)).toFixed(3) + '"/>' +
      '<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.04"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>';
    if (o.shadow !== false) s += '<path d="' + ricePath(o.cx + 4, o.cy + 7, Rpx * asp, Rpx, rot) + '" fill="#000" opacity="0.13" filter="' + (o.blurId ? 'url(#' + o.blurId + ')' : '') + '"/>';
    if (o.split) {
      s += '<g clip-path="url(#' + id + 'L)">' + rings('heat') + '</g><g clip-path="url(#' + id + 'R)">' + rings('moisture') + (o.chalk ? chalk() : '') + '</g>';
      s += '<line x1="' + o.cx + '" y1="' + (o.cy - Rpx - 6) + '" x2="' + o.cx + '" y2="' + (o.cy + Rpx + 6) + '" stroke="' + th.ink + '" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6"/>';
    } else {
      s += rings(o.mode || 'moisture');
      if (o.chalk) s += chalk();
    }
    var hp = ricePath(o.cx, o.cy, Rpx * asp, Rpx, rot);
    s += '<path d="' + hp + '" fill="url(#' + id + 'H)"/>';
    // faint longitudinal grooves
    s += '<path transform="rotate(' + (rot * 180 / Math.PI).toFixed(2) + ' ' + o.cx + ' ' + o.cy + ')" d="M' + (o.cx - Rpx * asp * 0.78).toFixed(1) + ' ' + (o.cy - Rpx * 0.34).toFixed(1) + 'Q' + o.cx + ' ' + (o.cy - Rpx * 0.5).toFixed(1) + ' ' + (o.cx + Rpx * asp * 0.8).toFixed(1) + ' ' + (o.cy - Rpx * 0.3).toFixed(1) +
      'M' + (o.cx - Rpx * asp * 0.75).toFixed(1) + ' ' + (o.cy + Rpx * 0.36).toFixed(1) + 'Q' + o.cx + ' ' + (o.cy + Rpx * 0.52).toFixed(1) + ' ' + (o.cx + Rpx * asp * 0.78).toFixed(1) + ' ' + (o.cy + Rpx * 0.3).toFixed(1) +
      '" fill="none" stroke="#7a6a50" stroke-width="0.9" opacity="0.22"/>';
    if (o.front) {
      var rf = 0, Gs = pr.G;
      if (Gs[0] < 0.5 && Gs[N - 1] >= 0.5) {
        for (var q = 1; q < N; q++) if (Gs[q] >= 0.5) { var f = (0.5 - Gs[q - 1]) / (Gs[q] - Gs[q - 1]); rf = pr.rc[q - 1] + f * (pr.rc[q] - pr.rc[q - 1]); break; }
        var rfp = rf * scale;
        s += '<path class="front" d="' + ricePath(o.cx, o.cy, rfp * asp, rfp, rot) + '" fill="none" stroke="#d2352b" stroke-width="1.8" stroke-dasharray="5 3"' +
          (o.split ? ' clip-path="url(#' + id + 'R)"' : '') + '/>';
      }
    }
    if (o.rawOutline && Math.abs(pr.R - o.R0) / o.R0 > 0.004) {
      s += '<path d="' + ricePath(o.cx, o.cy, o.R0px * asp, o.R0px, rot) + '" fill="none" stroke="' + th.ink + '" stroke-width="1.1" stroke-dasharray="4 4" opacity="0.6"/>';
    }
    s += '<path d="' + hp + '" fill="none" stroke="' + (o.stroke || '#8a7656') + '" stroke-width="1.4" opacity="0.85"/>';
    return s + '</g>';
  }

  var API = {
    THEMES: THEMES, theme: theme, HEAT: HEAT, MOIST: MOIST, FONT: FONT, SERIF: SERIF, esc: esc, fmt: fmt,
    lerpColor: lerpColor, rampColor: rampColor, seqColors: seqColors, heatColor: heatColor, moistureColor: moistureColor, wetBasis: wetBasis,
    niceTicks: niceTicks, logTicks: logTicks, wrap: wrap, textW: textW, tagBadge: tagBadge, titleText: titleText,
    linePlot: linePlot, stackedArea: stackedArea, barChart: barChart, colorbar: colorbar, flowDiagram: flowDiagram,
    ricePath: ricePath, annulus: annulus, grainSection: grainSection, nextId: nextId
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.RicePlots = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
