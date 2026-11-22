/* =============================================================================
   Rice on the Boil — regenerate Results/ (figures fig01…fig09 + CSV tables)
   Run:  sh Code/make_results.sh
   (= jsc Model/physics.js Model/plots.js Code/checks.js Code/make_results.js -- --quiet,
      output split on "@@FILE name" markers by awk)
   ============================================================================= */
(function (root) {
  'use strict';
  var P = root.RicePhysics, PL = root.RicePlots, CK = root.RiceChecks;
  var TH = 'light', th = PL.THEMES.light, S = th.series;
  function emit(name, text) { root.print('@@FILE ' + name); root.print(String(text).replace(/\n$/, '')); }
  function log(msg) { root.print('@@LOG ' + msg); }
  function csv(name, header, rows) { emit(name, CK.toCSV(header, rows)); }
  function col(a, k) { return a.map(function (r) { return r[k]; }); }
  var min = function (t) { return t / 60; };
  var key = [];   // key_results.csv rows
  function K(name, value, unit, note) { key.push([name, value, unit, note || '']); }

  /* ---------- fig01: pot temperature, four cases ---------- */
  var potCases = [
    { name: 'Sea level, lid on', c: { lid: true, place: 'sea' } },
    { name: 'Sea level, lid off', c: { lid: false, place: 'sea' } },
    { name: '3000 m, lid on', c: { lid: true, place: 'alt3000' } },
    { name: 'Pressure cooker', c: { lid: true, place: 'cooker' } }
  ];
  var potRows = [], potSeries = [], hl = [];
  potCases.forEach(function (pc, i) {
    var c = { water: 1.0, Pboil: 1500, duration: 1200, recordEvery: 5 };
    for (var k in pc.c) c[k] = pc.c[k];
    var r = P.runPot(c), h = r.hist;
    potSeries.push({ name: pc.name, x: h.t.map(min), y: h.T, color: S[i] });
    hl.push({ y: r.Tb, label: 'T_b = ' + r.Tb.toFixed(1) + ' °C', color: S[i] });
    h.t.forEach(function (t, j) { potRows.push([pc.name, t, h.T[j], h.M[j], h.steam[j], r.Tb]); });
    K('Boiling point: ' + pc.name, r.Tb, '°C'); K('Time to boil: ' + pc.name, r.tBoil, 's');
    K('Boiled off in 20 min: ' + pc.name, h.steam[h.steam.length - 1], 'kg');
  });
  hl = hl.filter(function (x, i) { return i !== 1; });
  emit('fig01_pot_temperature.svg', PL.linePlot({ theme: TH, title: 'Stage 1 — water temperature in the pot (1.0 kg, 1500 W)', xlabel: 'time (min)', ylabel: 'water temperature (°C)',
    series: potSeries, hlines: hl, legend: 'top', ymin: 20, ymax: 128,
    note: 'CALCULATED: lumped energy and mass balance; temperature is capped at T_b(p) and the surplus power boils water off.' }));
  csv('fig01_pot_temperature.csv', ['case', 't_s', 'T_C', 'M_kg', 'steam_kg', 'Tb_C'], potRows);

  /* ---------- fig02: heat conduction into the grain (water uptake off) ---------- */
  var p = P.defaults(), R = P.equivalentSize('medium', 'sphere'), kX = P.cellK(p.X0, p), al = P.grainAlpha(p.X0, p);
  var Bi = p.h * R / kX, tR = R * R / al;
  var snaps = [0.5, 1, 2, 4, 8], SQ5 = PL.seqColors(5, TH);
  var hr = P.runGrain({ mode: 'heat', R: R, TC: 100, T0: 25, h: p.h, duration: 30, outputs: { n: 300, extra: snaps }, dtMax: 0.01, dtFrac: 0.005, dtMin: 1e-4 });
  var f2s = [], f2rows = [];
  snaps.forEach(function (ts, i) {
    var pr = hr.profiles.filter(function (q) { return Math.abs(q.t - ts) < 1e-6; })[0];
    var Fo = ts / tR;
    f2s.push({ name: 't = ' + ts + ' s', x: pr.rc.map(function (r) { return r * 1e3; }), y: pr.T, color: SQ5[i] });
    var xs = [], ys = [];
    for (var j = 0; j <= 10; j++) { var rs = j / 10; xs.push(rs * R * 1e3); ys.push(100 - 75 * P.sphereConvective(Bi, Fo, rs)); }
    f2s.push({ name: 'series ' + ts + ' s', x: xs, y: ys, type: 'points', marker: 'circle', color: SQ5[i], noLegend: true });
    pr.rc.forEach(function (r, j) { f2rows.push([ts, r / pr.R, pr.T[j], 100 - 75 * P.sphereConvective(Bi, Fo, r / pr.R), Bi, Fo]); });
  });
  emit('fig02_grain_T_profiles.svg', PL.linePlot({ theme: TH, title: 'Stage 2 — temperature inside the grain (Bi = ' + Bi.toFixed(2) + ')', xlabel: 'radius r (mm)', ylabel: 'temperature (°C)',
    series: f2s, legend: 'top', ymin: 20, ymax: 102, xmin: 0, xmax: R * 1e3,
    note: 'CALCULATED: lines = finite-volume model, circles = Carslaw–Jaeger series for a sphere with a convective surface. Water uptake switched off.' }));
  csv('fig02_grain_T_profiles.csv', ['t_s', 'r_over_R', 'T_model_C', 'T_series_C', 'Bi', 'Fo'], f2rows);
  var lumpK = p.h * 3 / R / ((p.c_s + p.X0 * p.c_w) / P.specVol(p.X0, p));
  var lump = hr.hist.t.map(function (t) { return 100 - 75 * Math.exp(-lumpK * t); });
  emit('fig02b_centre_vs_lumped.svg', PL.linePlot({ theme: TH, title: 'Stage 2 — centre and surface vs the lumped model', xlabel: 'time (s)', ylabel: 'temperature (°C)',
    series: [{ name: 'surface cell', x: hr.hist.t, y: hr.hist.Ts }, { name: 'centre', x: hr.hist.t, y: hr.hist.Tc },
      { name: 'lumped (Bi ≪ 1 assumption)', x: hr.hist.t, y: lump, type: 'dash' }],
    vlines: [{ x: hr.events.tCentreWithin1K, label: 'centre within 1 K: ' + hr.events.tCentreWithin1K.toFixed(1) + ' s' }, { x: tR, label: 'R²/α = ' + tR.toFixed(1) + ' s' }],
    legend: 'top', ymin: 20, ymax: 102, note: 'CALCULATED: Bi ≈ ' + Bi.toFixed(1) + ' > 0.1, so the centre lags the surface and the lumped model is wrong — but only for seconds.' }));
  csv('fig02b_centre_vs_lumped.csv', ['t_s', 'T_centre_C', 'T_surface_C', 'T_mean_C', 'T_lumped_C'], hr.hist.t.map(function (t, i) { return [t, hr.hist.Tc[i], hr.hist.Ts[i], hr.hist.Tm[i], lump[i]]; }));
  K('Equivalent sphere radius (medium)', R, 'm'); K('Biot number', Bi, '-'); K('Thermal diffusivity alpha(X0)', al, 'm2/s');
  K('R^2/alpha', tR, 's'); K('Centre within 1 K (heat only)', hr.events.tCentreWithin1K, 's'); K('Centre 99 % (heat only)', hr.events.tCentre99, 's');

  /* ---------- fig03: soaking ---------- */
  var sizes = ['long', 'medium', 'short'], soakRuns = {}, f3s = [], f3b = [], f3rows = [];
  sizes.forEach(function (g, i) {
    var r = P.runGrain({ mode: 'soak', grain: g, TC: 25, T0: 25, duration: 3 * 3600, outputs: { n: 180 }, profiles: g === 'medium' });
    soakRuns[g] = r;
    var D25 = P.diffusivity(25, p, P.levelFlags(4), 0, p.X0);
    f3s.push({ name: P.GRAIN_PRESETS[g].name + ' (R = ' + (r.R0 * 1e3).toFixed(2) + ' mm)', x: r.hist.t.map(min), y: r.hist.Xm, color: S[i] });
    f3b.push({ name: P.GRAIN_PRESETS[g].name, x: r.hist.t.map(function (t) { return D25 * t / (r.R0 * r.R0); }), y: r.hist.Xm.map(function (X) { return (X - p.X0) / (p.Xnat - p.X0); }), color: S[i] });
    r.hist.t.forEach(function (t, j) { f3rows.push([g, r.R0, t, D25 * t / (r.R0 * r.R0), r.hist.Xm[j], r.hist.Xc[j], r.hist.RR0[j]]); });
  });
  var ms = soakRuns.medium;
  emit('fig03_soaking_uptake.svg', PL.linePlot({ theme: TH, title: 'Stage 3 — soaking at 25 °C: mean moisture of three grain sizes', xlabel: 'time (min)', ylabel: 'mean moisture ⟨X⟩ (kg/kg dry)',
    series: f3s, hlines: [{ y: p.Xnat, label: 'X_nat = 0.40 (raw starch capacity)' }], legend: 'top', ymin: 0.1, ymax: 0.42,
    note: 'CALCULATED: Fick diffusion relative to the solid, D(25 °C) from Arrhenius scaling of D_nat; thin grains (high S/V) soak faster.' }));
  var FoC = [], FC = [];
  for (var q = 0; q <= 120; q++) { var Fo = Math.pow(10, -3 + 3 * q / 120); FoC.push(Fo); FC.push(P.uptakeFraction('sphere', Fo)); }
  f3b.push({ name: 'Crank series (fixed sphere)', x: FoC, y: FC, type: 'dash', color: th.ink });
  emit('fig03b_soaking_scaled.svg', PL.linePlot({ theme: TH, title: 'Stage 3 — scaled uptake collapses onto one curve', xlabel: 'Fourier number Fo = D t / R0²', ylabel: 'fractional uptake (⟨X⟩ − X0)/(X_nat − X0)',
    series: f3b, xlog: true, xmin: 1e-3, xmax: 1, ymin: 0, ymax: 1.05, legend: 'top',
    note: 'CALCULATED: time ∝ size² — once time is scaled by R0²/D the three sizes coincide; small offset = swelling (moving boundary).' }));
  csv('fig03b_soaking_scaled.csv', ['grain', 'R0_m', 'Fo', 'fractional_uptake', 'crank_series'], f3rows.map(function (r) { var F = (r[4] - p.X0) / (p.Xnat - p.X0); return [r[0], r[1], r[3], F, P.uptakeFraction('sphere', r[3])]; }));
  csv('fig03_soaking_uptake.csv', ['grain', 'R0_m', 't_s', 'Fo', 'X_mean', 'X_centre', 'R_over_R0'], f3rows);
  var f3c = [], f3crows = [];
  var SQ6 = PL.seqColors(6, TH);
  [5, 15, 30, 60, 120, 180].forEach(function (tm, i) {
    var pr = ms.profiles.reduce(function (b, q) { return Math.abs(q.t - tm * 60) < Math.abs(b.t - tm * 60) ? q : b; });
    f3c.push({ name: tm + ' min', x: pr.rc.map(function (r) { return r * 1e3; }), y: pr.X, color: SQ6[i] });
    pr.rc.forEach(function (r, j) { f3crows.push([pr.t, r, pr.X[j]]); });
  });
  emit('fig03c_soaking_profiles.svg', PL.linePlot({ theme: TH, title: 'Stage 3 — moisture profiles while soaking (medium grain, 25 °C)', xlabel: 'radius r (mm)', ylabel: 'moisture X (kg/kg dry)',
    series: f3c, legend: 'top', ymin: 0.1, ymax: 0.42, xmin: 0,
    note: 'CALCULATED: the surface saturates at once and a wet front moves inward; the grain swells slightly (R/R0 ≈ ' + ms.final.RR0.toFixed(3) + ' after 3 h).' }));
  csv('fig03c_soaking_profiles.csv', ['t_s', 'r_m', 'X'], f3crows);
  K('Soak 25 C: mean X at 30 min', P.interp(ms.hist.t, ms.hist.Xm, 1800), 'kg/kg db'); K('Soak 25 C: mean X at 2 h', P.interp(ms.hist.t, ms.hist.Xm, 7200), 'kg/kg db');
  K('Soak 25 C: R/R0 after 3 h', ms.final.RR0, '-');
  K('D(25 C)', P.diffusivity(25, p, P.levelFlags(4), 0, p.X0), 'm2/s'); K('D(45 C)', P.diffusivity(45, p, P.levelFlags(4), 0, p.X0), 'm2/s');

  /* ---------- fig04: the race ---------- */
  var race = P.runGrain({ level: 4, TC: 100, T0: 25, duration: 1e4, outputs: { n: 220, log: true, tmin: 0.02 }, profiles: false });
  var hp = race.hist.Tc.map(function (T) { return 100 * (T - 25) / 75; });
  var wp = race.hist.Xc.map(function (X) { return 100 * (X - p.X0) / (p.Xgel - p.X0); });
  var Dg = P.DgelAt(100, p), Le = al / Dg;
  var t50w = P.crossingTime(race.hist.t, wp, 50);
  emit('fig04_race.svg', PL.linePlot({ theme: TH, title: 'Stage 4 — the race: heat vs water at the grain centre (100 °C)', xlabel: 'time (s, log scale)', ylabel: 'progress at the centre (%)',
    series: [{ name: 'heat: (T_c − T0)/(T_w − T0)', x: race.hist.t, y: hp, color: S[2] }, { name: 'water: (X_c − X0)/(X_gel − X0)', x: race.hist.t, y: wp, color: S[1] }],
    xlog: true, xmin: 0.02, xmax: 1e4, ymin: 0, ymax: 105, legend: 'top',
    vlines: [{ x: tR, label: 'R²/α = ' + tR.toFixed(0) + ' s', color: S[2] }, { x: R * R / Dg, label: 'R²/D = ' + (R * R / Dg / 60).toFixed(0) + ' min', color: S[1] }],
    note: 'CALCULATED: full model (L4). Le = α/D ≈ ' + Le.toFixed(0) + ': heat wins by more than two orders of magnitude, so water transport sets the cooking time.' }));
  csv('fig04_race.csv', ['t_s', 'heat_progress_pct', 'water_progress_pct', 'T_centre_C', 'X_centre'], race.hist.t.map(function (t, i) { return [t, hp[i], wp[i], race.hist.Tc[i], race.hist.Xc[i]]; }));
  K('Lewis number Le = alpha/D_gel(100 C)', Le, '-'); K('D_gel(100 C)', Dg, 'm2/s'); K('Heat 99 % at centre (full model)', race.events.tCentre99, 's');
  K('Water 50 % at centre (full model)', t50w, 's'); K('Ratio water50 / heat99', t50w / race.events.tCentre99, '-');

  /* ---------- fig05: cooking a grain ---------- */
  var ck = P.runGrain({ level: 4, TC: 100, T0: 25, duration: 1500, outputs: { n: 300, extra: [60, 120, 240, 360, 480, 600, 720, 840] } });
  var f5 = [], f5d = [], f5rows = [];
  var SQ7 = PL.seqColors(7, TH);
  [1, 2, 4, 6, 8, 10, 14].forEach(function (tm, i) {
    var pr = ck.profiles.filter(function (q) { return Math.abs(q.t - tm * 60) < 1e-6; })[0];
    f5.push({ name: tm + ' min', x: pr.rc.map(function (r) { return r * 1e3; }), y: pr.X, color: SQ7[i] });
    f5d.push({ name: tm + ' min', x: pr.rc.map(function (r) { return r * 1e3; }), y: pr.G, color: SQ7[i] });
    pr.rc.forEach(function (r, j) { f5rows.push([tm * 60, r, pr.X[j], pr.G[j], pr.T[j], pr.R]); });
  });
  emit('fig05_cook_profiles.svg', PL.linePlot({ theme: TH, title: 'Stage 5 — moisture inside a cooking grain (medium, 100 °C, L4)', xlabel: 'radius r (mm) — the grain swells', ylabel: 'moisture X (kg/kg dry)',
    series: f5, legend: 'top', xmin: 0, ymin: 0, ymax: 2.8, hlines: [{ y: p.Xgel, label: 'X_gel = 2.6' }, { y: p.Xnat, label: 'X_nat = 0.40' }],
    note: 'CALCULATED: surface capacity rises from X_nat to X_gel as the surface gelatinizes; shells follow the dry solid so the outer radius grows.' }));
  emit('fig05d_G_profiles.svg', PL.linePlot({ theme: TH, title: 'Stage 5 — gelatinized fraction G(r): the white core shrinks outside-in', xlabel: 'radius r (mm)', ylabel: 'gelatinized fraction G',
    series: f5d, legend: 'top', xmin: 0, ymin: 0, ymax: 1.05, hlines: [{ y: 0.5, label: 'front (G = 0.5)' }],
    note: 'CALCULATED: first-order kinetics with Arrhenius k_g(T) and water availability f(X); the core is "cooked" when G_c ≥ 0.9 (a chosen criterion).' }));
  csv('fig05_cook_profiles.csv', ['t_s', 'r_m', 'X', 'G', 'T_C', 'R_m'], f5rows);
  csv('fig05d_G_profiles.csv', ['t_s', 'r_m', 'G'], f5rows.map(function (r) { return [r[0], r[1], r[3]]; }));
  // cross-section strip
  var stripT = [0, 2, 4, 6, 8, 10, 12, 14], Wd = 900, Hd = 250, s5 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wd + ' ' + Hd + '" width="' + Wd + '" height="' + Hd + '" font-family="' + PL.esc(PL.FONT) + '"><rect width="' + Wd + '" height="' + Hd + '" fill="' + th.bg + '"/>';
  s5 += '<text x="14" y="22" font-family="' + PL.esc(PL.SERIF) + '" font-size="15" font-weight="600" fill="' + th.ink + '">Stage 5 — grain cross-section every 2 min (medium, 100 °C, L4)</text>' + PL.tagBadge(Wd - 10, 8, 'CALCULATED', th, true);
  var cks = P.runGrain({ level: 4, TC: 100, T0: 25, duration: 900, outputs: { n: 15, extra: stripT.map(function (x) { return x * 60; }) } });
  stripT.forEach(function (tm, i) {
    var pr = cks.profiles.filter(function (q) { return Math.abs(q.t - tm * 60) < 1e-6; })[0];
    var gm = 0; pr.G.forEach(function (g) { gm += g; }); gm /= pr.G.length;
    var cx = 62 + i * 111;
    s5 += PL.grainSection({ cx: cx, cy: 118, R0px: 19, R0: cks.R0, profile: pr, mode: 'moisture', chalk: true, front: true, rawOutline: true, gloss: gm, aspect: 1.65, rot: -Math.PI / 2, theme: TH, shadow: false });
    s5 += '<text x="' + cx + '" y="198" font-size="12" fill="' + th.ink + '" text-anchor="middle">' + tm + ' min</text>';
    s5 += '<text x="' + cx + '" y="213" font-size="10.5" fill="' + th.muted + '" text-anchor="middle">G_c ' + pr.G[0].toFixed(2) + ' · R/R0 ' + (pr.R / cks.R0).toFixed(2) + '</text>';
  });
  s5 += '<text x="14" y="240" font-size="10.5" fill="' + th.muted + '">CALCULATED fields (moisture colour on wet basis, white = ungelatinized, red dash = G = 0.5 front, grey dash = raw size) drawn on an ILLUSTRATIVE grain outline.</text></svg>';
  emit('fig05b_cross_section_strip.svg', s5);
  var s5rows = [];
  stripT.forEach(function (tm) { var pr = cks.profiles.filter(function (q) { return Math.abs(q.t - tm * 60) < 1e-6; })[0]; pr.rc.forEach(function (r, j) { s5rows.push([tm * 60, r, pr.X[j], pr.G[j], pr.R]); }); });
  csv('fig05b_cross_section_strip.csv', ['t_s', 'r_m', 'X', 'G', 'R_m'], s5rows);
  // ladder
  var lad = [], ladRows = [];
  for (var L = 1; L <= 4; L++) {
    var lr = P.runGrain({ level: L, TC: 100, T0: 25, duration: 1500, outputs: { n: 250 }, profiles: false });
    lad.push({ name: P.LEVELS[L].short + ' ' + P.LEVELS[L].name + ' — ' + (lr.events.tCoreGel / 60).toFixed(1) + ' min', x: lr.hist.t.map(min), y: lr.hist.Gc, color: S[L - 1] });
    lr.hist.t.forEach(function (t, j) { ladRows.push([L, t, lr.hist.Gc[j], lr.hist.Xc[j], lr.hist.RR0[j]]); });
    K('Ladder ' + P.LEVELS[L].short + ' core time', lr.events.tCoreGel / 60, 'min', P.LEVELS[L].name);
  }
  emit('fig05c_ladder.svg', PL.linePlot({ theme: TH, title: 'Stage 5 — model ladder: which assumption changes the answer?', xlabel: 'time (min)', ylabel: 'gelatinized fraction at the centre G_c',
    series: lad, legend: 'top', ymin: 0, ymax: 1.05, hlines: [{ y: p.G_done, label: 'cooked criterion G_c = 0.9' }],
    note: 'CALCULATED: adding swelling (L3) changes the core time most; Arrhenius D(T) at 100 °C (L4) brings it back slightly.' }));
  csv('fig05c_ladder.csv', ['level', 't_s', 'G_centre', 'X_centre', 'R_over_R0'], ladRows);
  [0, 1800, 7200].forEach(function (ps) {
    var r = P.runGrain({ level: 4, TC: 100, duration: 1500, outputs: { n: 10 }, profiles: false, stopAtGel: true, presoak: ps ? { time: ps, TC: 25 } : null });
    K('Core time, presoak ' + ps / 60 + ' min', r.events.tCoreGel / 60, 'min');
  });
  K('Cooked grain R/R0 (25 min)', ck.final.RR0, '-'); K('Cooked grain volume ratio (25 min)', Math.pow(ck.final.RR0, 3), '-');

  /* ---------- fig06: the whole pot ---------- */
  var pot = P.runPot({ water: 0.4, Pboil: 1500, Psim: 300, simmerAfterBoil: true, lid: true, duration: 2700, recordEvery: 5,
    rice: { massRaw: 0.2, grain: 'medium', addAt: 'start', restTime: 600 } });
  var ph = pot.hist;
  emit('fig06_pot_water_partition.svg', PL.stackedArea({ theme: TH, title: 'Stage 6 — where does the water go? (200 g rice, 400 g water, lid on)', xlabel: 'time (min)', ylabel: 'water (g)',
    x: ph.t.map(min), layers: [{ name: 'absorbed by grains', y: ph.absorbed.map(function (v) { return v * 1e3; }), color: S[1] },
      { name: 'free water in pot', y: ph.M.map(function (v) { return v * 1e3; }), color: '#9fcbbf' }, { name: 'left as steam', y: ph.steam.map(function (v) { return v * 1e3; }), color: S[0] }],
    vlines: [{ x: pot.tCoreGel / 60, label: 'core cooked ' + (pot.tCoreGel / 60).toFixed(1) + ' min' }, { x: pot.tDry / 60, label: 'free water gone ' + (pot.tDry / 60).toFixed(1) + ' min' }],
    legend: 'top', note: 'CALCULATED: two control volumes (free water, N grains); the stack is constant = 400 g, i.e. water is conserved exactly.' }));
  emit('fig06b_pot_T_grain.svg', PL.linePlot({ theme: TH, title: 'Stage 6 — pot temperature and the representative grain', xlabel: 'time (min)', ylabel: 'temperature (°C) / centre gelatinized (%)',
    series: [{ name: 'pot water T', x: ph.t.map(min), y: ph.T }, { name: 'grain centre T', x: ph.t.map(min), y: ph.Tc, type: 'dash' },
      { name: 'G_c × 100', x: ph.t.map(min), y: ph.Gc.map(function (g) { return g * 100; }) }, { name: 'mean moisture ⟨X⟩ × 40', x: ph.t.map(min), y: ph.Xm.map(function (x) { return x * 40; }) }],
    legend: 'top', ymin: 0, ymax: 110, vlines: [{ x: pot.tDry / 60, label: 'heater off, rest' }],
    note: 'CALCULATED: 1500 W to boil, then 300 W simmer; at dry-out the heater is switched off and the lidded pot rests (h = 100 W/m²K).' }));
  csv('fig06_pot_water_partition.csv', ['t_s', 'T_C', 'free_water_kg', 'absorbed_kg', 'steam_kg', 'X_mean', 'G_centre', 'T_centre_C', 'R_m', 'Pin_J', 'sensible_J', 'toGrains_J', 'steam_enthalpy_J', 'loss_J', 'energy_residual', 'water_residual', 'phase'],
    ph.t.map(function (t, i) { return [t, ph.T[i], ph.M[i], ph.absorbed[i], ph.steam[i], ph.Xm[i], ph.Gc[i], ph.Tc[i], ph.R[i], ph.Pin[i], ph.sensible[i], ph.toGrains[i], ph.latent[i], ph.loss[i], ph.energyResidual[i], ph.waterResidual[i], ph.phase[i]]; }));
  csv('fig06b_pot_T_grain.csv', ['t_s', 'T_pot_C', 'T_centre_C', 'G_centre', 'X_mean', 'phase'], ph.t.map(function (t, i) { return [t, ph.T[i], ph.Tc[i], ph.Gc[i], ph.Xm[i], ph.phase[i]]; }));
  var Lp = ph.t.length - 1;
  K('Pot: water into rice', ph.absorbed[Lp] * 1e3, 'g'); K('Pot: steam', ph.steam[Lp] * 1e3, 'g'); K('Pot: core cooked', pot.tCoreGel / 60, 'min');
  K('Pot: free water gone', pot.tDry / 60, 'min'); K('Pot: number of grains N', pot.rice.N, '-');

  /* ---------- fig07: scenarios ---------- */
  var scen = P.SCENARIOS.map(function (sc) { return P.runScenario(sc); });
  var items = scen.map(function (o, i) {
    return { label: o.sc.name + ' (' + o.Tb.toFixed(1) + ' °C)', value: o.tCoreGel / 60, valueLabel: (o.tCoreGel / 60).toFixed(1) + ' min', color: i === 0 ? S[0] : S[1],
      markers: [{ v: o.naiveHeat / 60, shape: 'tick', color: S[2] }, { v: o.naiveWater / 60, shape: 'diamond', color: S[3] }] };
  });
  emit('fig07_scenarios.svg', PL.barChart({ theme: TH, title: 'Stage 7 — no universal cooking time', xlabel: 'time (min, log scale)', items: items, xmin: 0.05, xmax: 200,
    ticks: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200], width: 820,
    legendItems: [{ name: 'model core time (L4, G_c ≥ 0.9)', color: S[1] }, { name: 'R²/α (thermal estimate)', shape: 'tick', color: S[2] }, { name: 'R²/D_gel(T_b) (water time scale)', shape: 'diamond', color: S[3] }],
    note: 'CALCULATED: same physics, nine situations. The thermal estimate R²/α is too short by one to two orders of magnitude; R²/D is a scale, not a cooking time.' }));
  csv('fig07_scenarios.csv', ['scenario', 'grain', 'geometry', 'place', 'Tb_C', 'R_m', 'presoak_s', 'brown', 't_core_min', 't_centre_within_1K_s', 'R2_over_alpha_s', 'R2_over_Dgel_s', 'too_short_factor'],
    scen.map(function (o) { return [o.sc.id, o.sc.grain, o.sc.geom, o.sc.place, o.Tb, o.R, o.sc.presoak, o.sc.brown ? 1 : 0, o.tCoreGel / 60, o.tHeat, o.naiveHeat, o.naiveWater, o.tCoreGel / o.naiveHeat]; }));
  scen.forEach(function (o) { K('Scenario ' + o.sc.id + ' core time', o.tCoreGel / 60, 'min', o.sc.name); });

  /* ---------- fig08: FV vs series (uptake, three geometries) ---------- */
  var f8 = [], f8rows = [];
  ['sphere', 'cylinder', 'slab'].forEach(function (g, i) {
    var Rg = P.equivalentSize('medium', g), D = p.D_const, tRg = Rg * Rg / D;
    var r = P.runGrain({ level: 1, geom: g, R: Rg, mode: 'soak', Xeq: p.Xnat, TC: 25, T0: 25, duration: 0.6 * tRg, outputs: { n: 60, log: true, tmin: 1e-3 * tRg }, profiles: false, dtFrac: 0.005, dtMax: 2 });
    var Fo = r.hist.t.map(function (t) { return t / tRg; }), F = r.hist.Xm.map(function (X) { return (X - p.X0) / (p.Xnat - p.X0); });
    var Fs = Fo.map(function (f) { return P.uptakeFraction(g, f); });
    f8.push({ name: g + ' (model)', x: Fo.slice(1), y: F.slice(1), type: 'points', color: S[i] });
    var FoL = [], FsL = [];
    for (var q = 0; q <= 100; q++) { var ff = Math.pow(10, -3 + Math.log10(600) * q / 100); FoL.push(ff); FsL.push(P.uptakeFraction(g, ff)); }
    f8.push({ name: g + ' (Crank series)', x: FoL, y: FsL, color: S[i], noLegend: true });
    for (var j = 1; j < Fo.length; j++) f8rows.push([g, Rg, Fo[j], F[j], Fs[j]]);
  });
  emit('fig08_uptake_fv_vs_series.svg', PL.linePlot({ theme: TH, title: 'Independent check — finite volumes vs Crank series (constant D)', xlabel: 'Fourier number Fo = D t / R²', ylabel: 'fractional uptake M_t/M∞',
    series: f8, xlog: true, xmin: 1e-3, xmax: 0.6, ymin: 0, ymax: 1.02, legend: 'top', note: 'CALCULATED: squares = model (60 shells), lines = analytical series; slab ≤ cylinder ≤ sphere at equal Fo because S/V rises.' }));
  csv('fig08_uptake_fv_vs_series.csv', ['geometry', 'R_m', 'Fo', 'F_model', 'F_series'], f8rows);

  /* ---------- checks (also used by fig09) ---------- */
  var res = CK.runAll();
  emit('checks_summary.csv', CK.summaryCSV(res));
  res.forEach(function (r) { if (r.csv) emit(CK.csvName(r), CK.toCSV(r.csv.header, r.csv.rows)); });
  var a7 = res.filter(function (r) { return r.id === 'A7'; })[0];
  var Ns = a7.csv.rows.map(function (r) { return r[0]; }), errs = a7.csv.rows.map(function (r) { return r[1]; });
  var refl = Ns.map(function (n) { return errs[0] * Math.pow(Ns[0] / n, 2); });
  emit('fig09_grid_convergence.svg', PL.linePlot({ theme: TH, title: 'Independent check — grid convergence (sphere uptake profile, Fo = 0.05)', xlabel: 'number of shells N', ylabel: 'max |error| vs series',
    series: [{ name: 'model error', x: Ns, y: errs, type: 'points' }, { name: 'model error ', x: Ns, y: errs, noLegend: true, noHover: true }, { name: 'slope −2 reference', x: Ns, y: refl, type: 'dash', color: th.muted }],
    xlog: true, ylog: true, xmin: 15, xmax: 100, xticks: [20, 40, 80], legend: 'top',
    note: 'CALCULATED: observed order ' + a7.value.toFixed(2) + ' (second-order finite volumes; time step kept tiny so the spatial error dominates).' }));
  csv('fig09_grid_convergence.csv', ['N_shells', 'max_abs_error', 'slope2_reference'], Ns.map(function (n, i) { return [n, errs[i], refl[i]]; }));
  var c = CK.counts(res);
  K('Verification checks passed', c.PASS, 'of ' + res.length); K('Verification checks INFO', c.INFO, ''); K('Verification checks failed', c.FAIL, '');
  csv('key_results.csv', ['quantity', 'value', 'unit', 'note'], key);
  log('checks: ' + c.PASS + ' pass, ' + c.INFO + ' info, ' + c.FAIL + ' fail');
  log('key results: ' + key.length + ' rows');
})(typeof globalThis !== 'undefined' ? globalThis : this);
