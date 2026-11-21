/* =====================================================================
   Rice on the Boil — regenerate every figure (SVG) and table (CSV) in Results/.
   Usage (macOS, no installs):   sh Code/make_results.sh
   which runs:  jsc Model/physics.js Model/plots.js Code/checks.js Code/make_results.js
   and splits the printed bundle (@@FILE markers) into files.
   The same figures can be exported one by one from the interactive page.
   ===================================================================== */
(function (root) {
'use strict';
const P = root.RicePhysics, PL = root.RicePlots, CK = root.RiceChecks;
const files = {};
const csv = (header, rows) => [header.join(',')].concat(rows.map(r => r.map(v => v == null ? '' : (typeof v === 'number' ? +v.toPrecision(7) : v)).join(','))).join('\n');
const pd = P.defaults();
const C = PL.THEMES.light.series;
const Rmed = P.equivalentSize(P.GRAIN_PRESETS.medium, 'sphere');

/* ---- 1. Pot heating: temperature cap and boiling point ---- */
{
  const runs = [
    { name: 'Sea level, lid on', cfg: { lid: true } },
    { name: 'Sea level, lid off', cfg: { lid: false } },
    { name: '3000 m, lid on', cfg: { lid: true, altitude: 3000 } },
    { name: 'Pressure cooker (1 bar gauge)', cfg: { lid: true, cookerGauge: 1e5 } }
  ].map(r => ({ ...r, out: P.runPot(Object.assign({ water: 1.0, Pboil: 1500, tEnd: 1200, nOut: 240 }, r.cfg)) }));
  files['fig01_pot_temperature.svg'] = PL.linePlot({ id: 'f1', w: 760, h: 340, title: 'Fig. 1 · Water temperature in a pot: boiling caps the temperature (calculated)',
    xLabel: 'time (min)', yLabel: 'pot water temperature (°C)', legend: 'right',
    series: runs.map((r, k) => ({ name: r.name, x: r.out.t.map(t => t / 60), y: r.out.Tp, color: C[k], dash: k === 1 ? '6 4' : null })),
    hlines: runs.filter((r, k) => k !== 1).map((r, k) => ({ y: r.out.Tb, label: `T_b = ${r.out.Tb.toFixed(1)} °C`, color: C[[0, 2, 3][k]] })),
    note: '1.0 kg water, 0.54 kJ/K vessel, 1.5 kW delivered to the pot. Temperature stops rising at T_b(p); extra heat boils water away.' });
  const rows = []; runs[0].out.t.forEach((t, i) => rows.push([t, ...runs.map(r => r.out.Tp[i]), ...runs.map(r => r.out.Mevap[i] * 1000)]));
  files['pot_temperature.csv'] = csv(['t_s', ...runs.map(r => 'T_' + r.name.replace(/[ ,()]/g, '_')), ...runs.map(r => 'evaporated_g_' + r.name.replace(/[ ,()]/g, '_'))], rows);
  const r0 = runs[1].out, sp = P.potEnergySplit(r0);
  files['pot_energy_split.csv'] = csv(['quantity_J', 'value'], [['heater energy delivered', sp.Pin], ['sensible (stored) increase', sp.sensible], ['latent heat of evaporated water', sp.latent], ['enthalpy of liquid carried by steam', sp.steamEnthalpy], ['wall and lid losses', sp.losses], ['residual', sp.Pin - sp.sensible - sp.latent - sp.steamEnthalpy - sp.losses]]);
}

/* ---- 2. Heat conduction into one grain ---- */
{
  const r = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25, water: false }, bath: { TC: 100, h: pd.h }, tEnd: 30, nOut: 300, dtMax: 0.05 });
  const times = [0.5, 1, 2, 4, 8, 16];
  const idx = t => r.t.findIndex(v => v >= t - 1e-9);
  const k = P.cellK(pd.X0, pd), alpha = P.grainAlpha(pd.X0, pd), Bi = pd.h * Rmed / k;
  const series = times.map((t, j) => { const pr = r.profiles[idx(t)]; return { name: `t = ${t} s`, x: pr.r.map(v => v / pr.R), y: pr.T, color: PL.heatColor(25 + 75 * (j + 1) / (times.length + 0.5), 25, 100), width: 2.2 }; });
  times.forEach((t, j) => { const xs = [0, 0.2, 0.4, 0.6, 0.8, 0.95]; series.push({ name: j === 0 ? 'series solution' : null, x: xs, y: xs.map(x => 100 - 75 * P.sphereConvective(Bi, x, alpha * t / (Rmed * Rmed))), points: true, hollow: true, color: '#2b2622', r: 3 }); });
  files['fig02_grain_temperature_profiles.svg'] = PL.linePlot({ id: 'f2', w: 720, h: 340, title: `Fig. 2 · Temperature inside a grain dropped into boiling water (Bi = ${Bi.toFixed(1)}, calculated)`,
    xLabel: 'radial position r/R', yLabel: 'temperature (°C)', xMin: 0, xMax: 1, yMin: 20, yMax: 102, legend: 'right', series,
    note: `Equivalent sphere R = ${(Rmed * 1e3).toFixed(2)} mm, α = ${alpha.toExponential(2)} m²/s, h = ${pd.h} W/m²K. Circles: Carslaw & Jaeger series (independent check).` });
  const lumped = r.t.map(t => 100 - 75 * Math.exp(-3 * Bi * alpha * t / (Rmed * Rmed)));
  files['fig02b_centre_vs_lumped.svg'] = PL.linePlot({ id: 'f2b', w: 720, h: 320, title: 'Fig. 2b · Grain centre vs surface vs a uniform-temperature (lumped) model',
    xLabel: 'time (s)', yLabel: 'temperature (°C)', xMin: 0, xMax: 30, legend: 'top', series: [
      { name: 'centre (spatial model)', x: r.t, y: r.Tc, color: C[2] }, { name: 'surface (spatial model)', x: r.t, y: r.Ts, color: C[0] },
      { name: 'lumped model (wrong when Bi > 0.1)', x: r.t, y: lumped, color: C[5], dash: '6 4' }],
    vlines: [{ x: r.events.tCentreWithin1K, label: `centre within 1 K: ${r.events.tCentreWithin1K.toFixed(1)} s`, color: C[2] }, { x: Rmed * Rmed / alpha, label: `R²/α = ${(Rmed * Rmed / alpha).toFixed(1)} s`, color: C[5], row: 1 }] });
  files['grain_heating.csv'] = csv(['t_s', 'T_centre_C', 'T_surface_C', 'T_lumped_C'], r.t.map((t, i) => [t, r.Tc[i], r.Ts[i], lumped[i]]));
}

/* ---- 3. Soaking: water uptake, size and scaling ---- */
{
  const sizes = ['long', 'medium', 'short'].map((k, j) => { const R = P.equivalentSize(P.GRAIN_PRESETS[k], 'sphere'); return { k, R, run: P.runGrain({ grain: { geom: 'sphere', R0: R, N: 60, level: 4, T0: 25 }, bath: { TC: 25 }, tEnd: 4 * 3600, nOut: 240, dtMax: 5, keepProfiles: j === 1 }) }; });
  const D25 = P.diffusivity(25, pd, P.LEVELS[4], 0);
  files['fig03_soaking_uptake.svg'] = PL.linePlot({ id: 'f3', w: 720, h: 330, title: 'Fig. 3 · Soaking at 25 °C: mean moisture of the grain (calculated)', xLabel: 'soaking time (min)', yLabel: '⟨X⟩ (kg water / kg dry solid)', xMin: 0, xMax: 240, legend: 'top',
    series: sizes.map((s, j) => ({ name: `${P.GRAIN_PRESETS[s.k].name} (R = ${(s.R * 1e3).toFixed(2)} mm)`, x: s.run.t.map(t => t / 60), y: s.run.Xmean, color: C[j] })),
    yMin: 0.12, yMax: 0.44, hlines: [{ y: pd.Xnat, label: 'native soaking capacity X_nat', color: C[5] }], note: `D(25 °C) = ${D25.toExponential(2)} m²/s from Briffaz et al. + Bello et al. activation energy. Swelling and D(T) included (L4).` });
  files['fig03b_soaking_scaled.svg'] = PL.linePlot({ id: 'f3b', w: 720, h: 330, title: 'Fig. 3b · The same curves against Fo = D t / R²: grain size enters through R² (scaling check)', xLabel: 'Fo = D t / R₀²', yLabel: '(⟨X⟩ − X₀)/(X_nat − X₀)', xMin: 0, xMax: 0.6, yMin: 0, yMax: 1.02, legend: 'top',
    series: sizes.map((s, j) => ({ name: P.GRAIN_PRESETS[s.k].name, x: s.run.t.map(t => D25 * t / (s.R * s.R)), y: s.run.Xmean.map(x => (x - pd.X0) / (pd.Xnat - pd.X0)), color: C[j], width: 2.5, opacity: 0.8 }))
      .concat([{ name: 'Crank series, rigid sphere, constant D', x: Array.from({ length: 121 }, (_, i) => 0.005 * i), y: Array.from({ length: 121 }, (_, i) => P.uptakeFraction('sphere', 0.005 * i)), color: '#2b2622', dash: '5 4', width: 1.5 }]),
    note: 'Curves collapse: time to soak scales with R². Small offset from the series: swelling (moving boundary) and D varying with moisture through the shell volume.' });
  const pr = sizes[1].run.profiles, ts = [0, 5, 15, 30, 60, 120, 240];
  files['fig03c_soaking_profiles.svg'] = PL.linePlot({ id: 'f3c', w: 720, h: 330, title: 'Fig. 3c · Moisture profiles during soaking (medium grain, 25 °C)', xLabel: 'radius r (mm) — grain swells, so the end point moves', yLabel: 'X (kg/kg dry basis)', yMin: 0.1, yMax: 0.42, legend: 'right',
    series: ts.map((m, j) => { const i = sizes[1].run.t.findIndex(t => t >= m * 60 - 1e-6); const p = pr[i]; return { name: `${m} min`, x: p.r.map(v => v * 1e3).concat(m ? [p.R * 1e3] : []), y: p.X.concat(m ? [pd.Xnat] : []), color: PL.lerpColor(['#d9a441', '#5aa5bd', '#1d4677'], j / (ts.length - 1)), width: 2.2 }; }),
    note: 'Calculated (L4, 25 °C). The surface sits at X_nat at once; the front moves inward and the radius grows by ≈ 9 %.' });
  files['soaking_uptake.csv'] = csv(['t_min', ...sizes.map(s => 'Xmean_' + s.k), ...sizes.map(s => 'R_mm_' + s.k)], sizes[0].run.t.map((t, i) => [t / 60, ...sizes.map(s => s.run.Xmean[i]), ...sizes.map(s => s.run.R[i] * 1e3)]));
}

/* ---- 4. The race: heat vs water ---- */
{
  const heat = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25, water: false }, bath: { TC: 100 }, tEnd: 3600, nOut: 300, logOut: true, logStart: 0.02, dtMax: 1 });
  const wat = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 2, T0: 100 }, bath: { TC: 100 }, tEnd: 3600, nOut: 300, logOut: true, logStart: 0.02, dtMax: 1 });
  const alpha = P.grainAlpha(pd.X0, pd), Dw = P.diffusivity(100, pd, P.LEVELS[4], 1);
  files['fig04_heat_vs_water.svg'] = PL.linePlot({ id: 'f4', w: 720, h: 340, title: `Fig. 4 · The race to the centre: heat vs water (Le = α/D ≈ ${Math.round(alpha / Dw)})`, xLabel: 'time (s), log scale', yLabel: 'fraction of the way to the surface value',
    xLog: true, xMin: 0.05, xMax: 1e4, yMin: 0, yMax: 1.02, legend: 'top', series: [
      { name: 'centre temperature', x: heat.t, y: heat.Tc.map(T => (T - 25) / 75), color: C[2], width: 2.5 },
      { name: 'centre moisture (L2: starch-controlled capacity)', x: wat.t, y: wat.Xc.map(x => (x - pd.X0) / (pd.Xgel - pd.X0)), color: C[1], width: 2.5 }],
    vlines: [{ x: Rmed * Rmed / alpha, label: `R²/α = ${(Rmed * Rmed / alpha).toFixed(0)} s`, color: C[2] }, { x: Rmed * Rmed / Dw, label: `R²/D = ${(Rmed * Rmed / Dw / 60).toFixed(0)} min`, color: C[1] }],
    note: 'Same grain, same boiling water: heat arrives in seconds, water needs many minutes. R²/α cannot be the cooking time.' });
  files['race.csv'] = csv(['t_s', 'theta_centre_heat', 't_s_water', 'phi_centre_water'], heat.t.map((t, i) => [t, (heat.Tc[i] - 25) / 75, wat.t[i], (wat.Xc[i] - pd.X0) / (pd.Xgel - pd.X0)]));
}

/* ---- 5. Cooking one grain: gelatinization, swelling and the model ladder ---- */
{
  const r = P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: 4, T0: 25 }, bath: { TC: 100 }, tEnd: 1800, nOut: 360, dtMax: 1 });
  const ts = [1, 3, 5, 7, 9, 12, 20];
  const at = m => r.t.findIndex(t => t >= m * 60 - 1e-6);
  const pcol = j => PL.lerpColor(['#d9a441', '#2e75a8', '#1d4677'], j / (ts.length - 1));
  files['fig05_cooking_profiles.svg'] = PL.linePlot({ id: 'f5', w: 720, h: 340, title: 'Fig. 5 · Moisture inside a grain cooking in boiling water (calculated, L4)', xLabel: 'radius r (mm) — the end of each curve is the moving surface', yLabel: 'X (kg water / kg dry solid)', legend: 'right',
    series: ts.map((m, j) => { const p = r.profiles[at(m)]; return { name: `${m} min`, x: p.r.map(v => v * 1e3), y: p.X, color: pcol(j), width: 2.2 }; }),
    vlines: [{ x: Rmed * 1e3, label: 'original surface R₀', color: '#776b5f' }],
    note: `Medium grain, 100 °C. R grows to ${(r.final.R / Rmed).toFixed(2)} R₀ as shells take up water (volume additivity).` });
  files['fig05d_gelatinization_profiles.svg'] = PL.linePlot({ id: 'f5d', w: 720, h: 320, title: 'Fig. 5d · Degree of gelatinization G inside the grain: a front moves inward', xLabel: 'radius r (mm)', yLabel: 'G (0 = native, 1 = gelatinized)', yMin: 0, yMax: 1.02, legend: 'right',
    series: ts.map((m, j) => { const p = r.profiles[at(m)]; return { name: `${m} min`, x: p.r.map(v => v * 1e3), y: p.G, color: pcol(j), width: 2.2 }; }),
    hlines: [{ y: pd.G_done, label: 'criterion G = 0.9' }],
    note: `Core gelatinized (G at centre ≥ 0.9) at ${(r.events.tCoreGel / 60).toFixed(1)} min. Gelatinization needs T > ${pd.T_on} °C and X above ≈ ${pd.X_lo}–${pd.X_hi}.` });
  // cross-section strip
  let inner = ''; const snaps = [0, 2, 4, 6, 8, 10, 14];
  snaps.forEach((m, j) => {
    const p = r.profiles[at(m)], cx = 70 + j * 100, cy = 120, scale = 26 / Rmed;
    const rings = PL.profileRings(p, (q, i) => PL.moistColor(q.X[i]), (q, i) => 1 - q.G[i], 30);
    inner += PL.grainSection({ cx, cy, a: p.R * scale * 1.5, b: p.R * scale, rings, chalk: true, outline0: Rmed / p.R, uid: 's' + j });
    inner += `<text x="${cx}" y="${cy + 70}" font-size="12" text-anchor="middle" fill="#2b2622">${m} min</text>`;
  });
  inner += PL.colorbar({ x: 40, y: 228, w: 220, cmap: 'moisture', minLabel: 'dry (10 % wb)', maxLabel: 'wet (75 % wb)', label: 'moisture colour', uid: 'cb5' });
  inner += `<rect x="330" y="226" width="16" height="14" fill="#fbfaf6" stroke="#b5a893"/><text x="352" y="238" font-size="11" fill="#2b2622">chalky white = ungelatinized starch (opacity 1 − G); dashed = original size</text>`;
  inner += `<text x="40" y="275" font-size="10.5" fill="#776b5f">Calculated 1D equivalent-sphere fields drawn on a rice-grain outline (display mapping only).</text>`;
  files['fig05b_grain_cross_sections.svg'] = PL.wrap(inner, 740, 290, 'light', 'Fig. 5b · The white core shrinks as water and gelatinization move inward (calculated)');
  const ladder = [1, 2, 3, 4].map(L => ({ L, r: P.runGrain({ grain: { geom: 'sphere', R0: Rmed, N: 60, level: L, T0: 25 }, bath: { TC: 100 }, tEnd: 1800, nOut: 360, dtMax: 1, keepProfiles: false }) }));
  files['fig05c_model_ladder.svg'] = PL.linePlot({ id: 'f5c', w: 720, h: 330, title: 'Fig. 5c · Which assumption matters? Centre gelatinization for model rungs L1–L4', xLabel: 'time in boiling water (min)', yLabel: 'G at the centre', xMin: 0, xMax: 20, yMin: 0, yMax: 1.02, legend: 'right',
    series: ladder.map((l, j) => ({ name: `${P.LEVELS[l.L].short}: ${(l.r.events.tCoreGel / 60).toFixed(1)} min`, x: l.r.t.map(t => t / 60), y: l.r.Gc, color: C[j], width: 2.4 })),
    hlines: [{ y: pd.G_done, label: 'chosen criterion G = 0.9' }] });
  files['cooking_ladder.csv'] = csv(['level', 'description', 't_core_gel_min', 'Xmean_end', 'R_end_over_R0'], ladder.map(l => [l.L, '"' + P.LEVELS[l.L].name + '"', l.r.events.tCoreGel / 60, l.r.final.Xmean, l.r.final.R / Rmed]));
  files['cooking_timeseries.csv'] = csv(['t_s', 'Xmean', 'X_centre', 'G_centre', 'R_mm', 'T_centre_C'], r.t.map((t, i) => [t, r.Xmean[i], r.Xc[i], r.Gc[i], r.R[i] * 1e3, r.Tc[i]]));
}

/* ---- 6. The whole pot: where does the water go? ---- */
{
  const cfg = { water: 0.40, Pboil: 1500, Psim: 300, simmerAfterBoil: true, lid: true, tEnd: 2700, nOut: 270, rice: { massRaw: 0.2, grain: { geom: 'sphere', R0: Rmed, N: 40, level: 4 }, addAt: 'start', restTime: 600 } };
  const o = P.runPot(cfg);
  const tm = o.t.map(t => t / 60);
  files['fig06_pot_water_partition.svg'] = PL.stackedArea({ id: 'f6', w: 720, h: 340, title: 'Fig. 6 · Absorption method (200 g rice, 400 g water, lid on): where the water goes', xLabel: 'time (min)', yLabel: 'water (g)', legend: 'right', x: tm,
    series: [{ name: 'inside the grains', y: o.Mgrain.map(v => v * 1000), color: '#2e75a8' }, { name: 'free liquid in pot', y: o.M.map(v => Math.max(0, v) * 1000), color: '#9fcbbf' }, { name: 'left as steam', y: o.Mevap.map(v => v * 1000), color: '#c9b79a' }],
    vlines: [{ x: o.events.tBoil / 60, label: 'boils' }, { x: o.events.tCoreGel / 60, label: 'core gelatinized', row: 1 }, { x: o.events.tDry / 60, label: 'free water gone → rest', row: 2 }],
    note: `Total water conserved to ${Math.max(...o.waterResidual.map(Math.abs)).toExponential(1)} kg. 1.5 kW to boil, then 300 W simmer, lid on.` });
  files['fig06b_pot_temperature_grain.svg'] = PL.linePlot({ id: 'f6b', w: 720, h: 320, title: 'Fig. 6b · Pot temperature and the representative grain during absorption cooking', xLabel: 'time (min)', yLabel: 'T (°C)  ·  100 × G_c  ·  40 × ⟨X⟩', legend: 'right', yMin: 0, yMax: 105,
    series: [{ name: 'pot water T', x: tm, y: o.Tp, color: C[2] }, { name: 'grain centre T', x: tm, y: o.Tc, color: C[0], dash: '5 3' }, { name: '100 × G at centre', x: tm, y: o.Gc.map(g => 100 * g), color: C[3] }, { name: '40 × mean X', x: tm, y: o.Xmean.map(x => 40 * x), color: C[1] }] });
  files['pot_absorption.csv'] = csv(['t_s', 'T_pot_C', 'free_water_g', 'water_in_grains_g', 'steam_g', 'Xmean', 'G_centre', 'phase', 'energy_residual_J', 'water_residual_kg'], o.t.map((t, i) => [t, o.Tp[i], o.M[i] * 1000, o.Mgrain[i] * 1000, o.Mevap[i] * 1000, o.Xmean[i], o.Gc[i], o.phase[i], o.energyResidual[i], o.waterResidual[i]]));
}

/* ---- 7. No single cooking time ---- */
{
  const res = P.SCENARIOS.map(sc => P.runScenario(sc));
  files['fig07_no_single_cooking_time.svg'] = PL.barChart({ w: 760, title: 'Fig. 7 · Same physics, different answers: core-gelatinization time across conditions', xLog: true, xMin: 1, xMax: 2e4, labelW: 300,
    xLabel: 'time, log scale', ticks: [1, 10, 60, 600, 3600, 2e4], tickFmt: v => v < 60 ? v + ' s' : v < 3600 ? (v / 60) + ' min' : (v / 3600).toFixed(1).replace('.0', '') + ' h',
    rows: res.map(r => ({ label: r.sc.name, value: r.tCoreGel, valueLabel: (r.tCoreGel / 60).toFixed(1) + ' min', color: '#2e75a8',
      markers: [{ x: r.naiveHeat, color: '#c2412d' }, { x: r.naiveWater, color: '#b8700f', shape: 'diamond' }] })),
    legend: [{ label: 'model core-gelatinization time', color: '#2e75a8' }, { label: 'thermal estimate R²/α', color: '#c2412d', shape: 'tick' }, { label: 'water estimate R²/D', color: '#b8700f', shape: 'diamond' }] });
  files['scenario_times.csv'] = csv(['scenario', 'R_eq_mm', 'geometry', 'water_T_C', 'presoak_min', 't_core_gel_min', 't_centre_within_1K_s', 'R2_over_alpha_s', 'R2_over_D_min', 'Xmean_end'],
    res.map(r => ['"' + r.sc.name + '"', r.R * 1e3, r.sc.geom, r.TC, r.sc.presoak, r.tCoreGel / 60, r.tHeat, r.naiveHeat, r.naiveWater / 60, r.Xfinal]));
}

/* ---- 8. Check tables + check figures ---- */
{
  const ck = CK.runChecks();
  for (const k in ck.tables) files[k + '.csv'] = ck.tables[k];
  const up = ck.tables.uptake_fv_vs_series.split('\n').slice(1).map(l => l.split(','));
  const geoms = ['sphere', 'cylinder', 'slab'];
  files['fig08_check_uptake_vs_series.svg'] = PL.linePlot({ id: 'f8', w: 720, h: 330, title: 'Fig. 8 · Independent check: finite-volume uptake vs exact Crank series', xLabel: 'Fo = D t / R²', yLabel: 'M_t / M_∞', xLog: true, xMin: 1e-3, xMax: 0.5, yMin: 0, yMax: 1, legend: 'right',
    series: geoms.flatMap((g, j) => { const rows = up.filter(r => r[0] === g); const xs = Array.from({ length: 80 }, (_, i) => 1e-3 * Math.pow(500, i / 79)); return [{ name: g + ' (series)', x: xs, y: xs.map(x => P.uptakeFraction(g, x)), color: C[j], width: 1.6 }, { name: g + ' (finite volume)', x: rows.map(r => +r[1]), y: rows.map(r => +r[3]), points: true, color: C[j] }]; }),
    note: 'Constant D, fixed size, constant surface value (model rung L1 with heat off). Max difference < 0.002.' });
  const gc = ck.tables.grid_convergence.split('\n').slice(1).map(l => l.split(',').map(Number));
  files['fig09_grid_convergence.svg'] = PL.linePlot({ id: 'f9', w: 560, h: 320, title: 'Fig. 9 · Grid convergence of the water solver', xLabel: 'number of shells N', yLabel: '|uptake error| at Fo = 0.05', xLog: true, yLog: true, xMin: 8, xMax: 100, yMin: 5e-5, yMax: 1e-2, legend: 'top',
    series: [{ name: 'finite volume vs series', x: gc.map(r => r[0]), y: gc.map(r => r[1]), points: true, line: true, color: C[1] }, { name: 'slope −2 reference', x: [10, 80], y: [gc[0][1], gc[0][1] / 64], color: C[5], dash: '5 4' }] });
}

for (const k in files) { print('@@FILE ' + k); print(files[k]); }
})(globalThis);
