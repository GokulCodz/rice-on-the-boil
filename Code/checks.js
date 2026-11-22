/* =============================================================================
   Rice on the Boil — verification suite (checks.js)
   33 checks in five groups:
     A numerics vs analytical solutions     B conservation (exact discrete balances)
     C limiting cases                        D scaling / dimensionless groups
     E comparison with published sources (not fitted)
   Runs in a browser (Code/checks.html) and under macOS JavaScriptCore:
     jsc Model/physics.js Code/checks.js                 → prints the table
     jsc Model/physics.js Code/checks.js -- --bundle     → also prints CSVs (@@FILE markers)
     jsc ... Code/checks.js -- --quiet                    → defines RiceChecks, no autorun
   ============================================================================= */
(function (root) {
  'use strict';
  var P = root.RicePhysics || (typeof require !== 'undefined' ? require('../Model/physics.js') : null);
  var CHECKS = [];
  var GROUPS = {
    A: 'Numerics vs analytical solutions',
    B: 'Conservation (exact discrete balances)',
    C: 'Limiting cases',
    D: 'Scaling and dimensionless groups',
    E: 'Published sources (not fitted)'
  };
  function add(group, id, name, fn) { CHECKS.push({ group: group, id: id, name: name, fn: fn }); }
  function fx(x, n) { return x === null || x === undefined || !isFinite(x) ? String(x) : (+x).toPrecision(n || 4); }
  function maxAbs(a) { var m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; }
  function slopeLog(xs, ys) {
    var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { var x = Math.log(xs[i]), y = Math.log(ys[i]); sx += x; sy += y; sxx += x * x; sxy += x * y; }
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
  }
  var Rmed = P.equivalentSize('medium', 'sphere');

  /* ---------- helpers ---------- */
  function heatVsSeries(Bi, FoList, opt) {
    opt = opt || {};
    var p = P.defaults(), k = P.cellK(p.X0, p), al = P.grainAlpha(p.X0, p), R = Rmed;
    var h = opt.h !== undefined ? opt.h : Bi * k / R;
    var tR = R * R / al, ts = FoList.map(function (F) { return F * tR; });
    var run = P.runGrain({ mode: 'heat', R: R, TC: 100, T0: 25, h: h, duration: ts[ts.length - 1] * 1.0001,
      outputs: { n: 2, extra: ts }, dtFrac: 0.005, dtMax: 0.01, dtMin: 1e-4, N: opt.N || 60 });
    var rows = [], errs = [];
    run.profiles.forEach(function (pr) {
      var Fo = pr.t / tR;
      var hit = FoList.some(function (F) { return Math.abs(F - Fo) < 1e-6 * F; });
      if (!hit) return;
      for (var i = 0; i < pr.rc.length; i += 6) {
        var rs = pr.rc[i] / pr.R, th = (pr.T[i] - 100) / (25 - 100);
        var ref = opt.dirichlet ? 1 - P.uptakeProfile('sphere', rs, Fo) : P.sphereConvective(Bi, Fo, rs);
        rows.push([Fo, rs, th, ref, th - ref]); errs.push(th - ref);
      }
    });
    return { rows: rows, err: maxAbs(errs), run: run };
  }
  function uptakeVsSeries(geom, opt) {
    opt = opt || {};
    var p = P.defaults(), D = p.D_const, R = P.equivalentSize('medium', geom), tR = R * R / D;
    var FoEnd = opt.FoEnd || 0.6;
    var run = P.runGrain({ level: 1, geom: geom, R: R, TC: 100, T0: 25, mode: 'soak', Xeq: p.Xnat, duration: FoEnd * tR,
      outputs: { n: opt.n || 80, log: true, tmin: (opt.FoMin || 1e-3) * tR }, profiles: false,
      dtFrac: opt.dtFrac || 0.005, dtMax: opt.dtMax || 2, N: opt.N || 60 });
    var rows = [], errs = [];
    for (var i = 1; i < run.hist.t.length; i++) {
      var Fo = run.hist.t[i] / tR;
      var F = (run.hist.Xm[i] - p.X0) / (p.Xnat - p.X0), Fs = P.uptakeFraction(geom, Fo);
      rows.push([Fo, F, Fs, F - Fs]);
      if (Fo >= (opt.FoCmp || 1e-3)) errs.push(F - Fs);
    }
    return { rows: rows, err: maxAbs(errs), run: run, R: R, D: D };
  }

  /* ================= A: numerics vs analytical ================= */
  [1, 10].forEach(function (Bi, j) {
    add('A', 'A' + (j + 1), 'Heat conduction, sphere with convective surface, Bi = ' + Bi + ' vs Carslaw–Jaeger series', function () {
      var r = heatVsSeries(Bi, [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5]);
      return { value: r.err, target: 'max |Δθ| < 0.01', pass: r.err < 0.01, detail: 'max |Δθ| = ' + fx(r.err, 3),
        csv: { header: ['Fo', 'r_over_R', 'theta_model', 'theta_series', 'diff'], rows: r.rows } };
    });
  });
  [['A3', 'sphere'], ['A4', 'cylinder'], ['A5', 'slab']].forEach(function (g) {
    add('A', g[0], 'Water uptake, ' + g[1] + ', constant D, fixed surface vs Crank series', function () {
      var r = uptakeVsSeries(g[1]);
      return { value: r.err, target: 'max |ΔM/M∞| < 0.005', pass: r.err < 0.005, detail: 'max |Δ| = ' + fx(r.err, 3) + ' (Fo 1e-3 … 0.6)',
        csv: { header: ['Fo', 'F_model', 'F_series', 'diff'], rows: r.rows } };
    });
  });
  add('A', 'A6', 'Early-time uptake vs √t law 6√(Fo/π) − 3Fo (sphere)', function () {
    var r = uptakeVsSeries('sphere', { FoEnd: 0.03, FoMin: 2e-3, n: 40 });
    var rel = 0, rows = [];
    r.rows.forEach(function (row) {
      var st = P.sphereShortTime(row[0]), e = (row[1] - st) / st;
      rows.push([row[0], row[1], st, e]); if (row[0] >= 2e-3) rel = Math.max(rel, Math.abs(e));
    });
    return { value: rel, target: 'relative error < 0.02 for Fo 0.002–0.03', pass: rel < 0.02, detail: 'max rel = ' + fx(rel, 3),
      csv: { header: ['Fo', 'F_model', 'F_short_time', 'rel_err'], rows: rows } };
  });
  add('A', 'A7', 'Grid convergence order, N = 20 → 40 → 80 (sphere uptake profile at Fo = 0.05)', function () {
    var Ns = [20, 40, 80], errs = [], rows = [];
    var p = P.defaults(), R = Rmed, D = p.D_const, tR = R * R / D, Fo = 0.05;
    Ns.forEach(function (N) {
      var run = P.runGrain({ level: 1, R: R, mode: 'soak', Xeq: p.Xnat, duration: Fo * tR, outputs: { n: 1 },
        dtFrac: 2e-4, dtMax: 0.01, dtMin: 1e-5, N: N, TC: 25, T0: 25 });
      var pr = run.profiles[run.profiles.length - 1], e = 0;
      for (var i = 0; i < pr.rc.length; i++) {
        var ref = P.uptakeProfile('sphere', pr.rc[i] / pr.R, Fo);
        e = Math.max(e, Math.abs((pr.X[i] - p.X0) / (p.Xnat - p.X0) - ref));
      }
      errs.push(e); rows.push([N, e]);
    });
    var order = Math.log(errs[0] / errs[2]) / Math.log(4);
    return { value: order, target: 'observed order 1.5–2.5', pass: order >= 1.5 && order <= 2.5,
      detail: 'errors ' + errs.map(function (e) { return fx(e, 3); }).join(', ') + ' → order ' + fx(order, 3),
      csv: { header: ['N_shells', 'max_abs_error'], rows: rows } };
  });

  /* ================= B: conservation ================= */
  var cookCache = null;
  function cook() {
    if (!cookCache) cookCache = P.runGrain({ level: 4, TC: 100, T0: 25, duration: 1500, outputs: { n: 150 } });
    return cookCache;
  }
  add('B', 'B1', 'Grain water balance: Σ m_s X − W0 − ∫ṁ dt (full model, 25 min)', function () {
    var h = cook().hist, m = maxAbs(h.waterResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2),
      csv: { header: ['t_s', 'water_kg', 'waterIn_kg', 'residual'], rows: h.t.map(function (t, i) { return [t, h.water[i], h.waterIn[i], h.waterResidual[i]]; }) } };
  });
  add('B', 'B2', 'Grain energy balance: E − E0 − ∫(conduction + water enthalpy) dt', function () {
    var h = cook().hist, m = maxAbs(h.energyResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2),
      csv: { header: ['t_s', 'energy_J', 'heatCond_J', 'enthalpyIn_J', 'gelHeat_J', 'residual'],
        rows: h.t.map(function (t, i) { return [t, h.energy[i], h.heatCond[i], h.enthalpyIn[i], h.gelHeat[i], h.energyResidual[i]]; }) } };
  });
  add('B', 'B3', 'Dry solid conserved exactly (shells follow the solid)', function () {
    var s = cook().state, p = s.p, msum = 0, fromV = 0;
    for (var i = 0; i < s.N; i++) { msum += s.ms[i]; fromV += s.Vg[i] / P.specVol(s.X[i], p); }
    var e1 = Math.abs(msum - s.msTotal) / s.msTotal, e2 = Math.abs(fromV - s.msTotal) / s.msTotal, m = Math.max(e1, e2);
    return { value: m, target: '< 1e-12 relative', pass: m < 1e-12, detail: 'Σm_s drift ' + fx(e1, 2) + '; from volumes ' + fx(e2, 2),
      csv: { header: ['msTotal_kg', 'sum_ms_kg', 'from_volumes_kg'], rows: [[s.msTotal, msum, fromV]] } };
  });
  add('B', 'B4', 'Volume additivity: geometric volume = Σ m_s (1/ρ_s + X/ρ_w)', function () {
    var h = cook().hist, errs = h.t.map(function (t, i) { return (h.Vgeom[i] - h.Vshell[i]) / h.Vshell[i]; }), m = maxAbs(errs);
    return { value: m, target: '< 1e-12 relative', pass: m < 1e-12, detail: 'max |ΔV/V| = ' + fx(m, 2),
      csv: { header: ['t_s', 'V_geom_m3', 'V_shells_m3', 'rel_diff'], rows: h.t.map(function (t, i) { return [t, h.Vgeom[i], h.Vshell[i], errs[i]]; }) } };
  });
  var potCache = null, potRiceCache = null;
  function pot() { return potCache || (potCache = P.runPot({ water: 1.0, lid: false, duration: 1500 })); }
  function potRice() {
    return potRiceCache || (potRiceCache = P.runPot({ water: 0.4, Pboil: 1500, Psim: 300, simmerAfterBoil: true, lid: true,
      duration: 2700, rice: { massRaw: 0.2, grain: 'medium', addAt: 'start', restTime: 600 } }));
  }
  function potCsv(h) {
    return { header: ['t_s', 'T_C', 'M_kg', 'absorbed_kg', 'steam_kg', 'Pin_J', 'sensible_J', 'toGrains_J', 'latent_J', 'loss_J', 'energy_residual', 'water_residual'],
      rows: h.t.map(function (t, i) { return [t, h.T[i], h.M[i], h.absorbed[i], h.steam[i], h.Pin[i], h.sensible[i], h.toGrains[i], h.latent[i], h.loss[i], h.energyResidual[i], h.waterResidual[i]]; }) };
  }
  add('B', 'B5', 'Pot water balance (open pot boiling, 25 min): M + steam = M0', function () {
    var h = pot().hist, m = maxAbs(h.waterResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2), csv: potCsv(h) };
  });
  add('B', 'B6', 'Pot energy balance: ΔE + steam enthalpy + losses = ∫P dt', function () {
    var h = pot().hist, m = maxAbs(h.energyResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2), csv: potCsv(h) };
  });
  add('B', 'B7', 'Pot + rice water balance: free water + grains + steam = const', function () {
    var h = potRice().hist, m = maxAbs(h.waterResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2), csv: potCsv(h) };
  });
  add('B', 'B8', 'Pot + rice energy balance (grains as a second control volume)', function () {
    var h = potRice().hist, m = maxAbs(h.energyResidual);
    return { value: m, target: '< 1e-9 relative', pass: m < 1e-9, detail: 'max |residual| = ' + fx(m, 2), csv: potCsv(h) };
  });

  /* ================= C: limits ================= */
  add('C', 'C1', 'Bi → ∞ (h = 1e9) equals fixed-surface-temperature series', function () {
    var r = heatVsSeries(1e9, [0.02, 0.05, 0.1, 0.2, 0.4, 0.8], { h: 1e9, dirichlet: true });
    return { value: r.err, target: 'max |Δθ| < 0.01', pass: r.err < 0.01, detail: 'max |Δθ| = ' + fx(r.err, 3),
      csv: { header: ['Fo', 'r_over_R', 'theta_model', 'theta_fixed_surface', 'diff'], rows: r.rows } };
  });
  add('C', 'C2', 'Bi = 0.01 equals lumped model θ = exp(−3 Bi Fo)', function () {
    var p = P.defaults(), k = P.cellK(p.X0, p), al = P.grainAlpha(p.X0, p), R = Rmed, Bi = 0.01, tR = R * R / al;
    var run = P.runGrain({ mode: 'heat', R: R, TC: 100, T0: 25, h: Bi * k / R, duration: 60 * tR, outputs: { n: 60 },
      dtMax: 0.5, dtFrac: 0.01, profiles: false });
    var rows = [], errs = [];
    run.hist.t.forEach(function (t, i) {
      var Fo = t / tR, th = (run.hist.Tm[i] - 100) / (25 - 100), ref = Math.exp(-3 * Bi * Fo);
      rows.push([Fo, th, ref, th - ref]); errs.push(th - ref);
    });
    var m = maxAbs(errs);
    return { value: m, target: 'max |Δθ| < 0.005', pass: m < 0.005, detail: 'max |Δθ| = ' + fx(m, 3),
      csv: { header: ['Fo', 'theta_mean_model', 'theta_lumped', 'diff'], rows: rows } };
  });
  [['C3', 'sea', 100, 0.05], ['C4', 'alt3000', 90, 0.5], ['C5', 'cooker', 120.5, 1]].forEach(function (c) {
    add('C', c[0], 'Boiling point, ' + P.PLACES[c[1]].name + ' = ' + c[2] + ' ± ' + c[3] + ' °C', function () {
      var pr = P.placePressure(c[1]), Tb = P.boilingPoint(pr), Tcc = P.boilingPointCC(pr), back = P.psat(Tb);
      var ok = Math.abs(Tb - c[2]) <= c[3] && Math.abs(back - pr) / pr < 1e-9;
      return { value: Tb, target: c[2] + ' ± ' + c[3] + ' °C', pass: ok,
        detail: 'Antoine ' + fx(Tb, 5) + ' °C; Clausius–Clapeyron ' + fx(Tcc, 5) + ' °C; p = ' + fx(pr, 6) + ' Pa',
        csv: { header: ['place', 'pressure_Pa', 'Tb_Antoine_C', 'Tb_ClausiusClapeyron_C', 'psat_back_Pa'], rows: [[c[1], pr, Tb, Tcc, back]] } };
    });
  });
  add('C', 'C6', 'Cooked grain at equilibrium with the bath stays at equilibrium', function () {
    var p = P.defaults(), s = P.makeGrain({ p: p, R: Rmed, level: 4, T0: 100 });
    for (var i = 0; i < s.N; i++) { s.X[i] = p.Xgel; s.G[i] = 1; s.T[i] = 100; }
    s.water0 = P.grainWater(s); s.energy0 = P.grainEnergy(s);
    for (var n = 0; n < 600; n++) P.stepGrain(s, 1, { T: 100, wet: true, Xeq: p.Xgel, h: p.h });
    var dX = 0, dT = 0;
    for (i = 0; i < s.N; i++) { dX = Math.max(dX, Math.abs(s.X[i] - p.Xgel)); dT = Math.max(dT, Math.abs(s.T[i] - 100)); }
    var m = Math.max(dX, dT);
    return { value: m, target: 'max |ΔX|, |ΔT| < 1e-9', pass: m < 1e-9, detail: 'max |ΔX| = ' + fx(dX, 2) + ', max |ΔT| = ' + fx(dT, 2) + ' K after 10 min',
      csv: { header: ['max_abs_dX', 'max_abs_dT_K'], rows: [[dX, dT]] } };
  });
  add('C', 'C7', 'D = 0 gives no water uptake', function () {
    var run = P.runGrain({ level: 4, TC: 100, duration: 600, outputs: { n: 20 }, p: { D_nat: 0, D_gel: 0, D_const: 0 }, profiles: false });
    var m = Math.abs(run.final.waterIn) + Math.abs(run.final.Xm - P.defaults().X0);
    return { value: m, target: 'uptake = 0', pass: m < 1e-15, detail: 'waterIn = ' + fx(run.final.waterIn, 2) + ' kg, ⟨X⟩ = ' + fx(run.final.Xm, 6),
      csv: { header: ['t_s', 'Xm', 'waterIn_kg'], rows: run.hist.t.map(function (t, i) { return [t, run.hist.Xm[i], run.hist.waterIn[i]]; }) } };
  });

  /* ================= D: scaling ================= */
  var Rs = [0.8e-3, Rmed, 1.6e-3];
  add('D', 'D1', 'Constant-D centre time (X_c half-way) ∝ R²', function () {
    var ts = Rs.map(function (R) {
      return P.runGrain({ level: 1, R: R, TC: 100, duration: 3000 * Math.pow(R / Rmed, 2), outputs: { n: 10 }, profiles: false, dtMax: 1e9 }).events.tXc50;
    });
    var n = slopeLog(Rs, ts);
    return { value: n, target: 'exponent 2.00 ± 0.03', pass: Math.abs(n - 2) <= 0.03, detail: 'times ' + ts.map(function (t) { return fx(t, 4); }).join(', ') + ' s → exponent ' + fx(n, 4),
      csv: { header: ['R_m', 't_centre_half_s'], rows: Rs.map(function (R, i) { return [R, ts[i]]; }) } };
  });
  add('D', 'D2', 'Full model: core-gelatinization time exponent vs R (information)', function () {
    var ts = Rs.map(function (R) { return P.runGrain({ level: 4, R: R, TC: 100, duration: 2400, outputs: { n: 10 }, profiles: false, stopAtGel: true }).events.tCoreGel; });
    var n = slopeLog(Rs, ts);
    return { value: n, target: 'INFO (not exactly 2: kinetics and capacity add scales)', pass: 'INFO',
      detail: 'core times ' + ts.map(function (t) { return fx(t / 60, 3); }).join(', ') + ' min → exponent ' + fx(n, 3),
      csv: { header: ['R_m', 't_core_s'], rows: Rs.map(function (R, i) { return [R, ts[i]]; }) } };
  });
  add('D', 'D3', 'Lewis number Le = α/D_gel(100 °C) (information)', function () {
    var p = P.defaults(), al = P.grainAlpha(p.X0, p), D = P.DgelAt(100, p), Le = al / D;
    return { value: Le, target: 'INFO (science file ≈ 355)', pass: 'INFO', detail: 'α = ' + fx(al, 4) + ' m²/s, D = ' + fx(D, 4) + ' m²/s, Le = ' + fx(Le, 4) + ', √Le = ' + fx(Math.sqrt(Le), 3),
      csv: { header: ['alpha_m2s', 'Dgel100_m2s', 'Le', 'sqrtLe'], rows: [[al, D, Le, Math.sqrt(Le)]] } };
  });
  add('D', 'D4', 'Péclet number of water-carried enthalpy, Pe = c_w j R / k', function () {
    var run = cook(), p = run.p, h = run.hist, A0 = P.areaAt(run.R0, run.geom), rows = [], m = 0;
    h.t.forEach(function (t, i) {
      if (t < 60) return;
      var R = h.R[i], A = P.areaAt(R, run.geom), j = Math.abs(h.Ws[i]) / A;
      var k = P.cellK(h.Xs[i], p), Pe = p.c_w * j * R / k;
      rows.push([t, j, Pe]); m = Math.max(m, Pe);
    });
    return { value: m, target: 'max Pe < 0.1 (conduction dominates)', pass: m < 0.1, detail: 'max Pe (t ≥ 60 s) = ' + fx(m, 3),
      csv: { header: ['t_s', 'surface_flux_kg_m2s', 'Pe'], rows: rows } };
  });
  add('D', 'D5', 'Gelatinization enthalpy / energy absorbed by the grain', function () {
    var f = cook().final, r = f.gelHeat / (f.heatCond + f.enthalpyIn);
    return { value: r, target: '< 0.05 (sink is small)', pass: r < 0.05, detail: 'ratio = ' + fx(r, 3),
      csv: { header: ['gelHeat_J', 'heatCond_J', 'enthalpyIn_J', 'ratio'], rows: [[f.gelHeat, f.heatCond, f.enthalpyIn, r]] } };
  });
  add('D', 'D6', 'Resolution: halving Δr and Δt changes the core time by < 2 %', function () {
    var a = P.runGrain({ level: 4, TC: 100, duration: 1200, outputs: { n: 20 }, profiles: false, stopAtGel: true }).events.tCoreGel;
    var b = P.runGrain({ level: 4, TC: 100, duration: 1200, outputs: { n: 20 }, profiles: false, stopAtGel: true, N: 120, dtFrac: 0.01, dtMax: 0.5, dtMin: 1e-3 }).events.tCoreGel;
    var r = Math.abs(b - a) / a;
    return { value: r, target: '< 0.02', pass: r < 0.02, detail: 'N 60: ' + fx(a / 60, 4) + ' min; N 120, Δt/2: ' + fx(b / 60, 4) + ' min; change ' + fx(100 * r, 3) + ' %',
      csv: { header: ['case', 't_core_s'], rows: [['N60_dt', a], ['N120_halfdt', b]] } };
  });

  /* ================= E: sources ================= */
  add('E', 'E1', 'D(45 °C) vs ≈ 8.8e-11 m²/s reported for white-rice soaking (25–65 °C)', function () {
    var p = P.defaults(), D = P.diffusivity(45, p, P.levelFlags(4), 0, p.X0), r = D / 8.8e-11;
    return { value: D, target: 'within ×1.5', pass: r > 1 / 1.5 && r < 1.5, detail: 'D(45 °C) = ' + fx(D, 3) + ' m²/s (ratio ' + fx(r, 3) + ')',
      csv: { header: ['T_C', 'D_model_m2s', 'D_reported_m2s', 'ratio'], rows: [[45, D, 8.8e-11, r]] } };
  });
  add('E', 'E2', 'Mean moisture after 2 h soaking at 25 °C (raw starch holds ≈ 0.40)', function () {
    var run = P.runGrain({ mode: 'soak', TC: 25, T0: 25, duration: 7200, outputs: { n: 24 }, profiles: false });
    var X = run.final.Xm;
    return { value: X, target: '0.30–0.42', pass: X >= 0.30 && X <= 0.42, detail: '⟨X⟩ = ' + fx(X, 3) + ' (science file 0.354)',
      csv: { header: ['t_s', 'Xm'], rows: run.hist.t.map(function (t, i) { return [t, run.hist.Xm[i]]; }) } };
  });
  add('E', 'E3', 'Core-gelatinization time of medium grain at 100 °C vs glass-plate tests', function () {
    var t = cook().events.tCoreGel / 60;
    return { value: t, target: '5–25 min (ISO 14864 glass-plate ≈ 15 min)', pass: t >= 5 && t <= 25, detail: 'core time ' + fx(t, 3) + ' min',
      csv: { header: ['t_core_min'], rows: [[t]] } };
  });
  add('E', 'E4', 'Presoaking shortens the core time monotonically (0, 30, 120 min)', function () {
    var soaks = [0, 1800, 7200], ts = soaks.map(function (ps) {
      return P.runGrain({ level: 4, TC: 100, duration: 1500, outputs: { n: 10 }, profiles: false, stopAtGel: true, presoak: ps ? { time: ps, TC: 25 } : null }).events.tCoreGel;
    });
    var ok = ts[1] < ts[0] && ts[2] < ts[1];
    return { value: ts[2] / ts[0], target: 'strictly decreasing', pass: ok, detail: ts.map(function (t) { return fx(t / 60, 3); }).join(' > ') + ' min',
      csv: { header: ['presoak_s', 't_core_s'], rows: soaks.map(function (s, i) { return [s, ts[i]]; }) } };
  });
  add('E', 'E5', 'Grain centre within 1 K of boiling water (heating is fast)', function () {
    var run = P.runGrain({ mode: 'heat', TC: 100, T0: 25, duration: 60, outputs: { n: 60 }, dtMax: 0.05, profiles: false });
    var t = run.events.tCentreWithin1K;
    return { value: t, target: '< 60 s', pass: t !== null && t < 60, detail: 't = ' + fx(t, 3) + ' s (science file ≈ 8.6 s)',
      csv: { header: ['t_s', 'Tc_C', 'Ts_C'], rows: run.hist.t.map(function (tt, i) { return [tt, run.hist.Tc[i], run.hist.Ts[i]]; }) } };
  });

  /* ---------- running and reporting ---------- */
  function runOne(c) {
    var t0 = Date.now(), r;
    try { r = c.fn(); } catch (e) { r = { value: NaN, target: '', pass: false, detail: 'ERROR: ' + (e && e.message ? e.message : e) }; }
    r.status = r.pass === 'INFO' ? 'INFO' : (r.pass ? 'PASS' : 'FAIL');
    r.id = c.id; r.group = c.group; r.name = c.name; r.ms = Date.now() - t0;
    return r;
  }
  function runAll(onEach) {
    cookCache = potCache = potRiceCache = null;
    var out = [];
    CHECKS.forEach(function (c) { var r = runOne(c); out.push(r); if (onEach) onEach(r); });
    return out;
  }
  function csvCell(v) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(header, rows) {
    return [header.map(csvCell).join(',')].concat(rows.map(function (r) { return r.map(csvCell).join(','); })).join('\n') + '\n';
  }
  function summaryCSV(results) {
    return toCSV(['id', 'group', 'name', 'status', 'value', 'target', 'detail'],
      results.map(function (r) { return [r.id, r.group, r.name, r.status, r.value, r.target, r.detail]; }));
  }
  function csvName(r) { return 'check_' + r.id + '.csv'; }
  function counts(results) {
    var c = { PASS: 0, FAIL: 0, INFO: 0 };
    results.forEach(function (r) { c[r.status]++; });
    return c;
  }
  function textTable(results) {
    var lines = [], pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s.length > n ? s.slice(0, n) : s; };
    var g = null;
    results.forEach(function (r) {
      if (r.group !== g) { g = r.group; lines.push(''); lines.push(g + '  ' + GROUPS[g]); }
      lines.push('  ' + pad(r.id, 4) + pad(r.status, 6) + pad(r.name, 78) + ' ' + r.detail);
    });
    var c = counts(results);
    lines.push('');
    lines.push(results.length + ' checks: ' + c.PASS + ' passed, ' + c.INFO + ' info, ' + c.FAIL + ' failed');
    return lines.join('\n');
  }

  var API = { CHECKS: CHECKS, GROUPS: GROUPS, runAll: runAll, runOne: runOne, toCSV: toCSV, summaryCSV: summaryCSV,
    csvName: csvName, counts: counts, textTable: textTable };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.RiceChecks = API;

  /* autorun under jsc (flags come from the global "arguments", i.e. root.arguments) */
  var args = (root.arguments && root.arguments.length !== undefined) ? Array.prototype.slice.call(root.arguments) : [];
  var isShell = typeof root.window === 'undefined' && typeof root.print === 'function';
  if (isShell && args.indexOf('--quiet') < 0) {
    var res = runAll();
    if (args.indexOf('--bundle') >= 0) {
      root.print('@@FILE checks_summary.csv'); root.print(summaryCSV(res));
      res.forEach(function (r) { if (r.csv) { root.print('@@FILE ' + csvName(r)); root.print(toCSV(r.csv.header, r.csv.rows)); } });
    } else {
      root.print('Rice on the Boil — verification suite');
      root.print(textTable(res));
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
