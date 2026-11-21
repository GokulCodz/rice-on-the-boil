/* =====================================================================
   Rice on the Boil — independent scientific checks.
   Runs in a browser (Code/checks.html) or with macOS JavaScriptCore:
     jsc Model/physics.js Code/checks.js
   Each check states WHAT is compared, the tolerance and PASS / FAIL / INFO.
   Groups:
     A  numerical model vs exact analytical solutions
     B  conservation (water, energy, dry solid, volume)
     C  limiting cases
     D  scaling
     E  plausibility against published sources (not fitted)
   ===================================================================== */
(function (root) {
'use strict';
const P = root.RicePhysics;

function runChecks(opt) {
  opt = opt || {};
  const results = [], tables = {};
  const add = (group, id, name, value, tol, pass, detail, kind) =>
    results.push({ group, id, name, value, tol, status: kind === 'info' ? 'INFO' : (pass ? 'PASS' : 'FAIL'), detail: detail || '' });
  const pd = P.defaults();
  const R = 1.0e-3;

  /* ---------- A. numerical vs analytical ---------- */
  // A1–A2 Heat conduction in a sphere with a convective surface (constant properties: water transport off).
  const heatRows = ['Bi,Fo,r_over_R,theta_series,theta_FV'];
  for (const Bi of [1, 10]) {
    const k = P.cellK(pd.X0, pd), alpha = P.grainAlpha(pd.X0, pd), h = Bi * k / R;
    const tau = R * R / alpha;
    const Fos = [0.05, 0.1, 0.2, 0.4];
    const s = P.createGrain({ geom: 'sphere', R0: R, N: 60, level: 1, T0: 0, water: false });
    let tl = 0, maxErr = 0;
    for (const Fo of Fos) {
      const target = Fo * tau;
      while (s.t < target - 1e-12) { const dt = Math.min(Math.max(1e-4 * tau, 0.005 * s.t), 0.002 * tau, target - s.t); P.stepGrain(s, dt, { T: 1, h, wet: false }); }
      const rc = P.profile(s).r;
      for (let i = 0; i < rc.length; i += 6) {
        const th = P.sphereConvective(Bi, rc[i] / R, Fo), fv = 1 - s.T[i];   // θ = (T − T_bath)/(T0 − T_bath) with T0=0, T_bath=1
        maxErr = Math.max(maxErr, Math.abs(th - fv));
        heatRows.push([Bi, Fo, (rc[i] / R).toPrecision(12), th.toFixed(8), fv.toFixed(8)].join(','));
      }
    }
    add('A', 'A' + (Bi === 1 ? 1 : 2), `Heat: sphere, convective surface, Bi = ${Bi}: FV vs series (max |Δθ| over r and Fo = 0.05–0.4)`, maxErr, 0.01, maxErr < 0.01, 'Carslaw & Jaeger series, roots of 1 − λ cot λ = Bi');
  }
  tables.heat_fv_vs_series = heatRows.join('\n');

  // A3–A5 Fractional water uptake for sphere, cylinder, slab (constant D, fixed size, constant surface value).
  const upRows = ['geometry,Fo,uptake_series,uptake_FV'];
  let id = 3;
  for (const geom of ['sphere', 'cylinder', 'slab']) {
    const D = pd.D_const, tau = R * R / D;
    const s = P.createGrain({ geom, R0: R, N: 60, level: 1, heat: false });
    const W0 = P.waterMass(s), Winf = s.msTot * (pd.Xgel - pd.X0);
    let maxErr = 0;
    for (const Fo of [0.002, 0.01, 0.05, 0.1, 0.2, 0.4]) {
      const target = Fo * tau;
      while (s.t < target - 1e-12) { const dt = Math.min(Math.max(1e-6 * tau, 0.005 * s.t), 0.002 * tau, target - s.t); P.stepGrain(s, dt, { T: 25, wet: true, Xeq: pd.Xgel }); }
      const fv = (P.waterMass(s) - W0) / Winf, an = P.uptakeFraction(geom, Fo);
      maxErr = Math.max(maxErr, Math.abs(fv - an));
      upRows.push([geom, Fo, an.toFixed(8), fv.toFixed(8)].join(','));
    }
    add('A', 'A' + id++, `Water uptake, ${geom}: FV vs Crank series (max |ΔM/M∞|, Fo = 0.002–0.4)`, maxErr, 0.005, maxErr < 0.005, 'Crank, The Mathematics of Diffusion, Ch. 4–6');
  }
  tables.uptake_fv_vs_series = upRows.join('\n');

  // A6 early-time √t law for the sphere
  {
    const D = pd.D_const, tau = R * R / D, s = P.createGrain({ geom: 'sphere', R0: R, N: 120, level: 1, heat: false });
    const W0 = P.waterMass(s), Winf = s.msTot * (pd.Xgel - pd.X0); let worst = 0;
    for (const Fo of [0.002, 0.005]) {
      const target = Fo * tau;
      while (s.t < target - 1e-12) { const dt = Math.min(Math.max(1e-7 * tau, 0.005 * s.t), target - s.t); P.stepGrain(s, dt, { T: 25, wet: true, Xeq: pd.Xgel }); }
      const fv = (P.waterMass(s) - W0) / Winf, st = P.sphereShortTime(Fo);
      worst = Math.max(worst, Math.abs(fv - st) / st);
    }
    add('A', 'A6', 'Early-time uptake follows 6√(Fo/π) − 3Fo (sphere, Fo = 0.002, 0.005; relative error)', worst, 0.02, worst < 0.02, 'uptake ∝ √t at short times');
  }

  // A7 grid convergence (spatial order of accuracy)
  {
    const rows = ['N,abs_error_uptake_Fo0.05'], errs = [], Ns = [10, 20, 40, 80];
    const D = pd.D_const, tau = R * R / D, Fo = 0.05, an = P.uptakeFraction('sphere', Fo);
    for (const N of Ns) {
      const s = P.createGrain({ geom: 'sphere', R0: R, N, level: 1, heat: false });
      const W0 = P.waterMass(s), Winf = s.msTot * (pd.Xgel - pd.X0), target = Fo * tau;
      while (s.t < target - 1e-12) { const dt = Math.min(Math.max(1e-7 * tau, 0.0005 * s.t), 1e-4 * tau, target - s.t); P.stepGrain(s, dt, { T: 25, wet: true, Xeq: pd.Xgel }); }
      const e = Math.abs((P.waterMass(s) - W0) / Winf - an); errs.push(e); rows.push(N + ',' + e.toExponential(4));
    }
    const order = Math.log(errs[1] / errs[3]) / Math.log(4);
    add('A', 'A7', 'Grid convergence: observed order of accuracy (N = 20 → 80)', order, '1.5–2.5', order > 1.5 && order < 2.5, 'errors: ' + errs.map(e => e.toExponential(2)).join(', '));
    tables.grid_convergence = rows.join('\n');
  }

  /* ---------- B. conservation (full coupled model, L4) ---------- */
  const Rmed = P.equivalentSize(P.GRAIN_PRESETS.medium, 'sphere');
  const cook = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 2400, nOut: 240, dtMax: 1 });
  const fin = cook.final, gS = cook.grain;
  add('B', 'B1', 'Water balance of one grain: |stored − initial − ∫ surface inflow| / water absorbed', Math.abs(fin.waterResidual) / fin.waterIn, 1e-9, Math.abs(fin.waterResidual) / fin.waterIn < 1e-9, `absorbed ${(fin.waterIn * 1e6).toFixed(3)} mg per grain`);
  add('B', 'B2', 'Energy balance of one grain (incl. gelatinization enthalpy): relative residual', Math.abs(fin.energyResidual) / Math.abs(fin.energyIn), 1e-9, Math.abs(fin.energyResidual) / Math.abs(fin.energyIn) < 1e-9, `energy in ${(fin.energyIn).toFixed(4)} J per grain`);
  const msNow = gS.ms.reduce((a, b) => a + b, 0);
  add('B', 'B3', 'Dry solid is conserved (sum of shell dry masses unchanged)', Math.abs(msNow - gS.msTot) / gS.msTot, 1e-14, Math.abs(msNow - gS.msTot) / gS.msTot < 1e-14, 'shells follow the solid');
  add('B', 'B4', 'Volume additivity: (4/3)πR³ equals Σ m_s(1/ρ_s + X/ρ_w)', Math.abs(fin.Vgeom - fin.Vshell) / fin.Vshell, 1e-12, Math.abs(fin.Vgeom - fin.Vshell) / fin.Vshell < 1e-12, `R/R₀ = ${(fin.R / Rmed).toFixed(3)}`);
  const pot1 = P.runPot({ water: 1.0, Pboil: 1500, lid: false, tEnd: 1800, nOut: 180 });
  const wr1 = Math.max(...pot1.waterResidual.map(Math.abs)), er1 = Math.max(...pot1.energyResidual.map(Math.abs)) / pot1.ledger.Pin;
  add('B', 'B5', 'Pot of water: total water (liquid + steam) conserved', wr1, 1e-12, wr1 < 1e-12, `${(pot1.final.Mevap * 1000).toFixed(1)} g boiled off`);
  add('B', 'B6', 'Pot of water: ∫P dt = Δ(stored) + losses + latent + steam enthalpy (relative)', er1, 1e-9, er1 < 1e-9, '');
  const pot2 = P.runPot({ water: 0.40, Pboil: 1500, Psim: 300, simmerAfterBoil: true, lid: true, tEnd: 2700, nOut: 270,
    rice: { massRaw: 0.2, grain: { geom: 'sphere', R0: Rmed, N: 40, level: 4 }, addAt: 'start', restTime: 600 } });
  const wr2 = Math.max(...pot2.waterResidual.map(Math.abs)) / 0.4, er2 = Math.max(...pot2.energyResidual.map(Math.abs)) / pot2.ledger.Pin;
  add('B', 'B7', 'Pot + rice (absorption method): water in pot + grains + steam conserved (relative)', wr2, 1e-9, wr2 < 1e-9, `dry-out at ${(pot2.events.tDry / 60).toFixed(1)} min`);
  add('B', 'B8', 'Pot + rice: energy balance of pot + grains (relative to heater energy)', er2, 1e-9, er2 < 1e-9, '');

  /* ---------- C. limiting cases ---------- */
  {
    const alpha = P.grainAlpha(pd.X0, pd), tau = R * R / alpha;
    const s = P.createGrain({ geom: 'sphere', R0: R, N: 60, level: 1, T0: 0, water: false });
    while (s.t < 0.1 * tau - 1e-12) { const dt = Math.min(Math.max(1e-4 * tau, 0.005 * s.t), 0.002 * tau, 0.1 * tau - s.t); P.stepGrain(s, dt, { T: 1, h: 1e9, wet: false }); }
    const dirichlet = P.uptakeProfile('sphere', 0, 0.1);           // same series: centre of a sphere with fixed surface value
    const err = Math.abs(s.T[0] - dirichlet);
    add('C', 'C1', 'Bi → ∞ (h = 10⁹ W/m²K): centre temperature equals the fixed-surface solution (Fo = 0.1)', err, 0.01, err < 0.01, '');
  }
  {
    const k = P.cellK(pd.X0, pd), alpha = P.grainAlpha(pd.X0, pd), Bi = 0.01, h = Bi * k / R, tau = R * R / alpha;
    const s = P.createGrain({ geom: 'sphere', R0: R, N: 30, level: 1, T0: 0, water: false });
    const Fo = 20; while (s.t < Fo * tau - 1e-9) { const dt = Math.min(0.02 * tau, Fo * tau - s.t); P.stepGrain(s, dt, { T: 1, h, wet: false }); }
    const lumped = 1 - Math.exp(-3 * Bi * Fo), err = Math.abs(s.T[0] - lumped) / lumped;
    add('C', 'C2', 'Bi = 0.01: centre temperature follows the lumped (uniform-temperature) model, relative error', err, 0.01, err < 0.01, 'θ = exp(−3 Bi Fo) for a sphere');
  }
  {
    const t0 = P.boilingPoint(101325), t3 = P.boilingPoint(P.pressureAtAltitude(3000)), tc = P.boilingPoint(101325 + 1e5);
    add('C', 'C3', 'Boiling point at 1 atm (Antoine)', t0, '100 ± 0.1 °C', Math.abs(t0 - 100) < 0.1, '');
    add('C', 'C4', 'Boiling point at 3000 m (standard atmosphere + Antoine)', t3, '90 ± 0.5 °C', Math.abs(t3 - 90) < 0.5, `Clausius–Clapeyron cross-check: ${P.boilingPointCC(P.pressureAtAltitude(3000)).toFixed(2)} °C`);
    add('C', 'C5', 'Boiling point in a pressure cooker at 1 bar gauge', tc, '120.5 ± 1 °C', Math.abs(tc - 120.5) < 1, `Clausius–Clapeyron: ${P.boilingPointCC(101325 + 1e5).toFixed(2)} °C`);
  }
  {
    const s = P.createGrain({ geom: 'sphere', R0: R, N: 30, level: 4, T0: 100, X0: pd.Xgel });
    s.G.fill(1); s.E0 = P.energy(s);                                 // a fully cooked grain sitting in boiling water
    for (let i = 0; i < 200; i++) P.stepGrain(s, 1, { T: 100, wet: true });
    const dev = Math.max(...Array.from(s.T).map(v => Math.abs(v - 100)), ...Array.from(s.X).map(v => Math.abs(v - pd.Xgel)));
    add('C', 'C6', 'Equilibrium stays at equilibrium (cooked grain, G = 1, at bath T and surface capacity)', dev, 1e-10, dev < 1e-10, 'no spurious transport');
  }
  {
    const s = P.createGrain({ geom: 'sphere', R0: R, N: 30, level: 1, params: { D_const: 0 } });
    for (let i = 0; i < 100; i++) P.stepGrain(s, 1, { T: 100, wet: true, Xeq: 2.6 });
    add('C', 'C7', 'D = 0: no water enters', s.ledger.waterIn, 0, s.ledger.waterIn === 0, '');
  }

  /* ---------- D. scaling ---------- */
  {
    const Rs = [0.6e-3, 0.9e-3, 1.2e-3, 1.5e-3], tHalf = [], tFull = [], rows = ['R_mm,t_centre_half_L1_s,t_coreGel_L4_s'];
    for (const Ri of Rs) {
      const r1 = P.runGrain({ grain: { geom: 'sphere', R0: Ri, N: 40, level: 1, T0: 100 }, bath: { TC: 100 }, tEnd: 2400, nOut: 600, dtMax: 0.5, keepProfiles: false });
      const th = P.crossTime(r1.t, r1.Xc.map(x => (x - pd.X0) / (pd.Xgel - pd.X0)), 0.5); tHalf.push(th);
      const r4 = P.runGrain({ grain: { geom: 'sphere', R0: Ri, N: 40, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 5400, nOut: 600, dtMax: 1, keepProfiles: false });
      tFull.push(r4.events.tCoreGel); rows.push([Ri * 1e3, th, r4.events.tCoreGel].join(','));
    }
    const slope = (ys) => { const xs = Rs.map(Math.log), y = ys.map(Math.log), n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (y[i] - my); b += (xs[i] - mx) ** 2; } return a / b; };
    const e1 = slope(tHalf), e4 = slope(tFull);
    add('D', 'D1', 'Constant-D, fixed-size model: centre-uptake time ∝ R^n, fitted n', e1, '2.00 ± 0.03', Math.abs(e1 - 2) < 0.03, 'diffusion time scale t ~ R²/D');
    add('D', 'D2', 'Full model (L4): core-gelatinization time ∝ R^n, fitted n', e4, 'information', true, 'swelling, starch state and heating change the simple R² law', 'info');
    tables.size_scaling = rows.join('\n');
  }
  {
    const alpha = P.grainAlpha(pd.X0, pd), Dw = P.diffusivity(100, pd, P.LEVELS[4], 1, pd.Xgel);
    add('D', 'D3', 'Lewis number Le = α/D at 100 °C (heat diffuses this many times faster than water)', alpha / Dw, 'information', true, `α = ${alpha.toExponential(2)} m²/s, D = ${Dw.toExponential(2)} m²/s`, 'info');
    // Péclet number for enthalpy carried by absorbed water: v = water volume flux at the surface
    let peMax = 0; const g = P.createGrain({ geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 });
    for (let i = 0; i < 400; i++) { P.stepGrain(g, 1, { T: 100, wet: true }); const flux = g.last.wIn / g.last.dt / (P.areaAt(g.rf[g.N], g.m) * pd.rho_w); peMax = Math.max(peMax, flux * g.rf[g.N] / P.grainAlpha(g.X[g.N - 1], pd)); }
    add('D', 'D4', 'Péclet number of water-carried enthalpy, Pe = vR/α (max during cooking) — convection of heat negligible?', peMax, '< 0.1', peMax < 0.1, 'justifies treating heat transport as conduction-dominated');
    const ratio = fin.gelHeat / (fin.energyIn);
    add('D', 'D5', 'Gelatinization enthalpy / total energy absorbed by the grain', ratio, '< 0.05', ratio < 0.05, 'latent effect of the starch transition is small');
  }
  {
    const t1 = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 2400, nOut: 600, dtMax: 1, keepProfiles: false }).events.tCoreGel;
    const t2 = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 120, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 2400, nOut: 600, dtMax: 0.5, frac: 0.01, keepProfiles: false }).events.tCoreGel;
    const ch = Math.abs(t2 - t1) / t2;
    add('D', 'D6', 'Resolution check: halving Δr and Δt changes the core-gelatinization time by', ch, '< 0.02', ch < 0.02, `${(t1 / 60).toFixed(2)} vs ${(t2 / 60).toFixed(2)} min`);
  }

  /* ---------- E. plausibility against sources (NOT fitted) ---------- */
  {
    const D45 = P.diffusivity(45, pd, P.LEVELS[4], 0);
    add('E', 'E1', 'D(native, 45 °C) from Briffaz value + Bello activation energy vs ≈8.8×10⁻¹¹ m²/s reported for white-rice soaking (25–65 °C)', D45, 'within ×1.5', D45 / 8.83e-11 > 1 / 1.5 && D45 / 8.83e-11 < 1.5, 'independent consistency of two sources');
    const soak = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 }, bath: { TC: 25 }, tEnd: 7200, nOut: 120, dtMax: 5, keepProfiles: false });
    add('E', 'E2', 'Mean moisture after 2 h soaking at 25 °C (kg/kg dry basis)', soak.final.Xmean, '0.30–0.42', soak.final.Xmean > 0.30 && soak.final.Xmean < 0.42, `${(100 * soak.final.Xmean / (1 + soak.final.Xmean)).toFixed(1)} % wet basis`);
    const tg = cook.events.tCoreGel / 60;
    add('E', 'E3', 'Core-gelatinization time, unsoaked medium grain at 100 °C (min)', tg, '5–25 min (glass-plate cooking times ≈ 15 min)', tg > 5 && tg < 25, 'order-of-magnitude agreement, not a fit');
    const times = [0, 30, 120].map(m => P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 50, level: 4, T0: 25 }, presoak: m ? { TC: 25, t: m * 60 } : null, bath: { TC: 100 }, tEnd: 2400, nOut: 300, dtMax: 1, keepProfiles: false }).events.tCoreGel / 60);
    add('E', 'E4', 'Presoaking shortens cooking (0, 30, 120 min soak → core time decreases)', times[0] - times[2], 'positive, monotonic', times[0] > times[1] && times[1] > times[2], times.map(t => t.toFixed(2) + ' min').join(' → ') + ' (literature reports larger reductions; see report)');
    const th = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 120, nOut: 240, logOut: true, dtMax: 0.5 }).events.tCentreWithin1K;
    add('E', 'E5', 'Grain centre comes within 1 K of boiling water (s)', th, '< 60 s', th < 60, 'heat conduction is not the slow step');
  }

  const summary = ['group,id,check,value,tolerance,status,detail'].concat(results.map(r => [r.group, r.id, '"' + r.name.replace(/"/g, "'") + '"', typeof r.value === 'number' ? r.value.toPrecision(6) : r.value, '"' + r.tol + '"', r.status, '"' + String(r.detail).replace(/"/g, "'") + '"'].join(',')));
  tables.check_summary = summary.join('\n');
  return { results, tables };
}

root.RiceChecks = { runChecks };
/* Command-line use (jsc): print a table, or the CSV bundle when the first argument is "--bundle". */
if (typeof window === 'undefined' && typeof print === 'function' && !root.__NO_AUTORUN__) {
  const args = Array.isArray(root.arguments) || (root.arguments && root.arguments.length != null) ? Array.from(root.arguments) : (typeof scriptArgs !== 'undefined' ? scriptArgs : []);
  if (args.includes('--quiet')) return;
  const t0 = Date.now(), out = runChecks();
  if (args.includes('--bundle')) {
    for (const k in out.tables) { print('@@FILE ' + k + '.csv'); print(out.tables[k]); }
  } else {
    for (const r of out.results) print(`${r.status.padEnd(4)}  ${r.id.padEnd(3)}  ${typeof r.value === 'number' ? r.value.toPrecision(4).padStart(11) : String(r.value).padStart(11)}  [${r.tol}]  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
    const nf = out.results.filter(r => r.status === 'FAIL').length;
    print(`\n${out.results.length} checks, ${nf} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
})(typeof window !== 'undefined' ? window : globalThis);
