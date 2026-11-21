/* =====================================================================
   Rice on the Boil — physics engine (no DOM).
   MS2280 Transport Phenomena in Materials Processing, Project 19.

   SI units throughout unless a name says otherwise (TC = degrees C).
   Moisture content X is on a DRY BASIS: kg water per kg dry solid.

   Contents
     1. Parameters with sources
     2. Water / steam properties (Antoine, Watson, standard atmosphere)
     3. Grain geometry (ellipsoid -> equivalent radius)
     4. Grain model: radial finite volumes that follow the dry solid
        - water: d(m_s X)/dt = sum of face flows, flux relative to solid
          j = -rho_d D dX/dr  (derived from the slides' j = -rho D dw/dr)
        - energy: conduction + enthalpy carried by water + gelatinization sink
        - gelatinization: first-order, needs heat (T > T_onset) and water
        - swelling: shell volume = m_s (1/rho_s + X/rho_w)  (volume additivity)
     5. Pot model: lumped liquid water + vessel, boiling cap, evaporation,
        optionally coupled to N identical grains
     6. Analytical reference solutions used by the checks
     7. Small utilities (fitting kitchen data)
   ===================================================================== */
(function (root) {
'use strict';

/* ---------------------------------------------------------------------
   1. PARAMETERS
   Every value carries its source. "illustrative" means: chosen inside the
   range reported in the literature, not measured for a specific rice.
   --------------------------------------------------------------------- */
const PARAMS = {
  rho_w:  { v: 1000,    unit: 'kg/m³',  src: 'Water density used for volume additivity (constant; 958 kg/m³ at 100 °C is a 4 % change, neglected).' },
  c_w:    { v: 4180,    unit: 'J/(kg·K)', src: 'Specific heat of liquid water.' },
  k_w:    { v: 0.60,    unit: 'W/(m·K)', src: 'Thermal conductivity of water used inside the grain (0.60–0.68 W/m·K between 25 and 100 °C).' },
  rho_s:  { v: 1500,    unit: 'kg/m³',  src: 'True density of rice dry matter (≈1.45–1.52 g/cm³); illustrative.' },
  c_s:    { v: 1600,    unit: 'J/(kg·K)', src: 'Carbohydrate specific heat, Choi & Okos (1986) composition model at ≈50 °C.' },
  k_s:    { v: 0.25,    unit: 'W/(m·K)', src: 'Carbohydrate thermal conductivity, Choi & Okos (1986) composition model at ≈50 °C.' },
  X0:     { v: 0.14,    unit: 'kg/kg db', src: 'Milled rice at ≈12 % wet basis storage moisture.' },
  Xnat:   { v: 0.40,    unit: 'kg/kg db', src: 'Soaking plateau of ungelatinized (native) grain, ≈28–30 % wet basis; Bello et al. (2004, 2007) report plateaus of this order.' },
  Xgel:   { v: 2.6,     unit: 'kg/kg db', src: 'Water held by fully cooked rice in excess water, ≈72 % wet basis (cooked rice is typically 65–75 % wb); illustrative.' },
  D_nat:  { v: 3.6e-10, unit: 'm²/s',  src: 'Apparent water diffusivity in native (ungelatinized) starch, Briffaz et al. (2014) J. Food Eng. 121:143–151; taken here as the value at T_ref.' },
  D_gel:  { v: 2.8e-10, unit: 'm²/s',  src: 'Apparent water diffusivity in gelatinized starch, Briffaz et al. (2014) J. Food Eng. 121:143–151; taken here as the value at T_ref.' },
  D_const:{ v: 3.0e-10, unit: 'm²/s',  src: 'Single constant diffusivity for the simplest model rung (between the two Briffaz values).' },
  T_ref:  { v: 95,      unit: '°C',    src: 'Reference temperature for the diffusivities and the gelatinization rate (Briffaz et al. cooked at up to 95 °C).' },
  Ea_D:   { v: 32500,   unit: 'J/mol', src: 'Activation energy for water diffusion in rice, Bello et al. (soaking, swelling-sphere model, 32.5 kJ/mol). Cross-check: gives D ≈ 6.8×10⁻¹¹ m²/s at 45 °C, close to the ≈8.8×10⁻¹¹ m²/s average reported for white-rice soaking at 25–65 °C.' },
  brownFactor: { v: 0.58, unit: '–', src: 'Brown rice: apparent D ≈ 1.9×10⁻¹⁰ vs ≈3.3×10⁻¹⁰ m²/s for milled rice, Briffaz et al. (2014) J. Food Eng. 141:99–106 (ratio 0.58).' },
  bX:     { v: 0,       unit: 'kg dry/kg water', src: 'Optional moisture dependence D ∝ exp[b (X − X₀)] (Bello et al. report D varying with moisture). Off (0) by default; used only to explore a hypothesis.' },
  T_on:   { v: 68,      unit: '°C',    src: 'Onset of rice-starch gelatinization in excess water (≈65–75 °C); illustrative.' },
  kg_ref: { v: 0.05,    unit: '1/s',   src: 'First-order gelatinization rate constant at T_ref; illustrative, inside the range reviewed by Lund (1984) Crit. Rev. Food Sci. Nutr. 20:249.' },
  Ea_g:   { v: 120000,  unit: 'J/mol', src: 'Activation energy of gelatinization; illustrative (reported values ≈ 70–250 kJ/mol, Lund 1984).' },
  X_lo:   { v: 0.30,    unit: 'kg/kg db', src: 'Below this water content gelatinization does not proceed (water-limited); illustrative; must be below X_nat.' },
  X_hi:   { v: 0.80,    unit: 'kg/kg db', src: 'Above this water content gelatinization is not water-limited; illustrative. Starch needs substantial water to gelatinize fully (Donovan 1979, Biopolymers 18:263). Constraint: X_lo must stay below X_nat, otherwise gelatinization can never start.' },
  dH_gel: { v: 11000,   unit: 'J/kg dry', src: 'Gelatinization enthalpy of rice starch ≈10–13 J/g (DSC); used as an energy sink.' },
  h:      { v: 1500,    unit: 'W/(m²·K)', src: 'Water-to-grain heat-transfer coefficient; Nu ≥ 2 gives h ≥ k_w/R ≈ 600–700 W/m²K for a 1 mm grain; natural convection gives ≈2000–3000.' },
  G_done: { v: 0.90,    unit: '–',     src: 'Chosen criterion: the core counts as gelatinized when G at the centre reaches 0.9 (a definition, not a universal cooking time).' },
  R_gas:  { v: 8.314,   unit: 'J/(mol·K)', src: 'Gas constant.' },
  M_w:    { v: 0.018015,unit: 'kg/mol', src: 'Molar mass of water.' },
  g:      { v: 9.81,    unit: 'm/s²',  src: 'Gravitational acceleration.' }
};
function defaults() { const o = {}; for (const k in PARAMS) o[k] = PARAMS[k].v; return o; }

/* Grain presets: typical milled-rice dimensions (length × width × thickness, mm).
   Long-slender ≈ Basmati type (L/B > 3), medium ≈ Sona Masoori type, short-bold ≈ Ponni/Japonica type. Illustrative. */
const GRAIN_PRESETS = {
  long:   { name: 'Long slender', L: 7.0, B: 1.8, Tk: 1.6 },
  medium: { name: 'Medium',       L: 5.5, B: 2.2, Tk: 1.7 },
  short:  { name: 'Short bold',   L: 5.0, B: 2.8, Tk: 2.0 }
};

/* ---------------------------------------------------------------------
   2. WATER AND STEAM PROPERTIES
   --------------------------------------------------------------------- */
const K0 = 273.15;
/* Antoine equation for water (p in mmHg, T in °C). Two published constant sets. */
function psat(TC) {
  const set = TC <= 100 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  return Math.pow(10, set[0] - set[1] / (set[2] + TC)) * 133.322368;
}
function boilingPoint(p) {
  const mm = p / 133.322368;
  const set = mm <= 760.1 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  return set[1] / (set[0] - Math.log10(mm)) - set[2];
}
/* Clausius–Clapeyron with constant h_fg — used only as an independent cross-check. */
function boilingPointCC(p) {
  const L = 2.257e6, M = 0.018015, R = 8.314;
  return 1 / (1 / 373.124 - R * Math.log(p / 101325) / (L * M)) - K0;
}
/* Watson correlation for latent heat (J/kg). */
function hfg(TC) {
  const Tc = 647.096, T = TC + K0;
  return 2.2565e6 * Math.pow(Math.max(0, (Tc - T) / (Tc - 373.15)), 0.38);
}
/* International standard atmosphere, troposphere. */
function pressureAtAltitude(z) { return 101325 * Math.pow(1 - 2.25577e-5 * z, 5.25588); }
function vapourDensity(TC, RH) { return (RH == null ? 1 : RH) * psat(TC) * 0.018015 / (8.314 * (TC + K0)); }
/* Liquid water: density (approximation good to ~0.2 % for 0–100 °C), viscosity (Vogel), conductivity (fit). */
function waterRho(TC) { return 1000 - 0.0178 * Math.pow(Math.abs(TC - 4), 1.7); }
function waterMu(TC) { return 2.414e-5 * Math.pow(10, 247.8 / (TC + K0 - 140)); }
function waterK(TC) { return 0.5706 + 1.756e-3 * TC - 6.46e-6 * TC * TC; }
/* Natural convection from a sphere, Churchill (1983): Nu = 2 + 0.589 Ra^¼ / [1 + (0.469/Pr)^(9/16)]^(4/9). */
function hSphereNatural(Rg, Tsurf, Twater) {
  const Tf = (Tsurf + Twater) / 2, dT = Math.abs(Twater - Tsurf);
  const rho = waterRho(Tf), mu = waterMu(Tf), k = waterK(Tf), c = 4180;
  const beta = -(waterRho(Tf + 0.5) - waterRho(Tf - 0.5)) / rho;
  const nu = mu / rho, alpha = k / (rho * c), D = 2 * Rg, Pr = nu / alpha;
  const Ra = 9.81 * Math.max(beta, 1e-6) * dT * D * D * D / (nu * alpha);
  const Nu = 2 + 0.589 * Math.pow(Ra, 0.25) / Math.pow(1 + Math.pow(0.469 / Pr, 9 / 16), 4 / 9);
  return { h: Nu * k / D, Nu, Ra, Pr, hMin: 2 * k / D, k };
}

/* ---------------------------------------------------------------------
   3. GEOMETRY
   Shape exponent m: 0 slab (per unit face area), 1 cylinder (per unit length), 2 sphere.
   --------------------------------------------------------------------- */
const GEOM = { slab: 0, cylinder: 1, sphere: 2 };
const GM = [1, Math.PI, 4 * Math.PI / 3];
function volTo(r, m) { return GM[m] * Math.pow(r, m + 1); }
function areaAt(r, m) { return (m + 1) * GM[m] * Math.pow(r, m); }
function radiusOfVol(V, m) { return Math.pow(V / GM[m], 1 / (m + 1)); }
/* Ellipsoid with full dimensions L × B × T (mm). Surface area: Knud Thomsen approximation (≈1 % error). */
function ellipsoid(Lmm, Bmm, Tmm) {
  const a = Lmm / 2e3, b = Bmm / 2e3, c = Tmm / 2e3, p = 1.6075;
  const V = 4 / 3 * Math.PI * a * b * c;
  const S = 4 * Math.PI * Math.pow((Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3, 1 / p);
  return { a, b, c, V, S, Rsphere: 3 * V / S, Rcyl: 2 * V / S, Lslab: V / S, minHalf: Math.min(a, b, c) };
}
/* Equivalent size with the same volume-to-surface ratio as the grain: R = (m+1) V/S. */
function equivalentSize(preset, geom) {
  const e = ellipsoid(preset.L, preset.B, preset.Tk);
  return (GEOM[geom] + 1) * e.V / e.S;
}

/* ---------------------------------------------------------------------
   4. GRAIN MODEL
   --------------------------------------------------------------------- */
const LEVELS = {
  1: { DT: false, gelCap: false, Dstate: false, swell: false, short: 'L1 Fick', name: 'L1 · Textbook Fick: one constant D, fixed size, surface at the final water capacity from t = 0' },
  2: { DT: false, gelCap: true,  Dstate: true,  swell: false, short: 'L2 + starch', name: 'L2 · + Starch state: water capacity and D change only where starch has gelatinized (needs heat and water)' },
  3: { DT: false, gelCap: true,  Dstate: true,  swell: true,  short: 'L3 + swelling', name: 'L3 · + Swelling: shells grow as they take up water, so the grain boundary moves' },
  4: { DT: true,  gelCap: true,  Dstate: true,  swell: true,  short: 'L4 + D(T)', name: 'L4 · + Temperature: D follows an Arrhenius law with the local temperature' }
};
function specVol(X, p) { return 1 / p.rho_s + X / p.rho_w; }           // m³ per kg dry solid
function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
/* D(T, G, X): starch state sets the reference value, temperature scales it (Arrhenius), moisture optionally. */
function diffusivity(TC, p, fl, G, X) {
  fl = fl || LEVELS[4];
  let D = fl.Dstate ? p.D_nat * (1 - (G || 0)) + p.D_gel * (G || 0) : p.D_const;
  if (fl.DT) D *= Math.exp(-p.Ea_D / p.R_gas * (1 / (TC + K0) - 1 / (p.T_ref + K0)));
  if (p.bX) D *= Math.exp(p.bX * ((X == null ? p.X0 : X) - p.X0));
  return D * (p.Dfactor || 1);
}
function gelRate(TC, X, p) {
  const sT = 1 / (1 + Math.exp(-(TC - p.T_on) / 1.5));           // smooth onset over ≈±3 K
  const kT = p.kg_ref * Math.exp(-p.Ea_g / p.R_gas * (1 / (TC + K0) - 1 / (p.T_ref + K0)));
  return kT * sT * smooth01((X - p.X_lo) / (p.X_hi - p.X_lo));
}
function cellK(X, p) {                                            // parallel (volume-weighted) estimate
  const phi = (X / p.rho_w) / specVol(X, p);
  return phi * p.k_w + (1 - phi) * p.k_s;
}
function thomas(a, b, c, d, n) {                                   // a: sub, b: diag, c: super
  const cp = new Float64Array(n), dp = new Float64Array(n), x = new Float64Array(n);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const den = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / den; dp[i] = (d[i] - a[i] * dp[i - 1]) / den;
  }
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/* Create a grain. o: {geom, R0 (m), N, X0, T0 (°C), level (1–4), flags (override), params (override),
   water: true/false (solve water), heat: true/false (solve heat)} */
function createGrain(o) {
  const p = Object.assign(defaults(), o.params || {});
  const fl = Object.assign({}, LEVELS[o.level || 4], o.flags || {});
  const m = GEOM[o.geom || 'sphere'], N = o.N || 60, R0 = o.R0;
  const X0 = o.X0 != null ? o.X0 : p.X0, T0 = o.T0 != null ? o.T0 : 25;
  const rf = new Float64Array(N + 1), ms = new Float64Array(N);
  for (let i = 0; i <= N; i++) rf[i] = R0 * i / N;
  const v0 = specVol(X0, p);
  for (let i = 0; i < N; i++) ms[i] = (volTo(rf[i + 1], m) - volTo(rf[i], m)) / v0;
  const s = {
    m, N, p, fl, ms, rf, R0, geom: o.geom || 'sphere',
    X: new Float64Array(N).fill(X0), T: new Float64Array(N).fill(T0), G: new Float64Array(N),
    solveWater: o.water !== false, solveHeat: o.heat !== false,
    t: 0, ledger: { waterIn: 0, heatCond: 0, enthalpyIn: 0, gelHeat: 0 }, last: {}
  };
  s.msTot = ms.reduce((a, b) => a + b, 0);
  s.W0 = waterMass(s); s.E0 = energy(s);
  return s;
}
function waterMass(s) { let w = 0; for (let i = 0; i < s.N; i++) w += s.ms[i] * s.X[i]; return w; }
/* Stored energy relative to 0 °C: sensible heat of solid + water, plus gelatinization enthalpy already absorbed. */
function energy(s) {
  const p = s.p; let e = 0;
  for (let i = 0; i < s.N; i++) e += s.ms[i] * ((p.c_s + s.X[i] * p.c_w) * s.T[i] + p.dH_gel * s.G[i]);
  return e;
}
function centres(s) { const rc = new Float64Array(s.N); for (let i = 0; i < s.N; i++) rc[i] = (s.rf[i] + s.rf[i + 1]) / 2; return rc; }
function grainVolumeFromShells(s) { let v = 0; for (let i = 0; i < s.N; i++) v += s.ms[i] * specVol(s.X[i], s.p); return v; }
function surfaceXeq(s, bath) {
  const p = s.p;
  if (s.fl.gelCap) return p.Xnat + s.G[s.N - 1] * (p.Xgel - p.Xnat);
  return bath.Xeq != null ? bath.Xeq : p.Xgel;
}
/* Advance one implicit step.
   bath: {T: °C, wet: bool (liquid water at the surface), Xeq: surface capacity when gelCap is off, h} */
function stepGrain(s, dt, bath) {
  const { N, m, p, fl, ms, rf, X, T, G } = s;
  const rc = centres(s);
  const V = new Float64Array(N), rhod = new Float64Array(N), D = new Float64Array(N), k = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    V[i] = volTo(rf[i + 1], m) - volTo(rf[i], m);
    rhod[i] = ms[i] / V[i];
    D[i] = diffusivity(T[i], p, fl, G[i], X[i]);
    k[i] = cellK(X[i], p);
  }
  const R = rf[N], AR = areaAt(R, m), hS = bath.h != null ? bath.h : p.h;
  const wet = bath.wet !== false;

  /* ---- water: m_s,i (X_i' − X_i)/dt = a_{i−½}(X_{i−1}' − X_i') + a_{i+½}(X_{i+1}' − X_i') ---- */
  const af = new Float64Array(N);                // face i+½ between cell i and i+1; af[N-1] = surface
  for (let i = 0; i < N - 1; i++) {
    const Af = areaAt(rf[i + 1], m), dr = rc[i + 1] - rc[i];
    af[i] = 0.5 * (D[i] + D[i + 1]) * 0.5 * (rhod[i] + rhod[i + 1]) * Af / dr;
  }
  const Xs = surfaceXeq(s, bath);
  af[N - 1] = wet ? D[N - 1] * rhod[N - 1] * AR / (R - rc[N - 1]) : 0;
  let Xn = X;
  if (s.solveWater) {
    const A = new Float64Array(N), B = new Float64Array(N), C = new Float64Array(N), Rh = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const aw = i > 0 ? af[i - 1] : 0, ae = af[i];
      A[i] = -aw; C[i] = i < N - 1 ? -ae : 0;
      B[i] = ms[i] / dt + aw + ae;
      Rh[i] = ms[i] / dt * X[i] + (i === N - 1 ? ae * Xs : 0);
    }
    Xn = thomas(A, B, C, Rh, N);
  }
  /* outward water flow through each face (kg/s), from cell i towards i+1 (surface: out of the grain) */
  const Wf = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) Wf[i] = s.solveWater ? -af[i] * (Xn[i + 1] - Xn[i]) : 0;
  Wf[N - 1] = s.solveWater ? -af[N - 1] * (Xs - Xn[N - 1]) : 0;

  /* ---- gelatinization: exact first-order update with frozen rate ---- */
  const dG = new Float64Array(N), Gn = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const kr = gelRate(T[i], Xn[i], p);
    Gn[i] = 1 - (1 - G[i]) * Math.exp(-kr * dt);
    dG[i] = Gn[i] - G[i];
  }

  /* ---- energy: (C_i' T_i' − C_i T_i)/dt = conduction + c_w·(enthalpy carried by water) − gel sink ---- */
  let Tn = T;
  const bf = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) {
    const Af = areaAt(rf[i + 1], m);
    bf[i] = Af / ((rf[i + 1] - rc[i]) / k[i] + (rc[i + 1] - rf[i + 1]) / k[i + 1]);
  }
  bf[N - 1] = AR / (1 / hS + (R - rc[N - 1]) / k[N - 1]);
  const Tb = bath.T;
  if (s.solveHeat) {
    const A = new Float64Array(N), B = new Float64Array(N), C = new Float64Array(N), Rh = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const Cold = ms[i] * (p.c_s + X[i] * p.c_w), Cnew = ms[i] * (p.c_s + Xn[i] * p.c_w);
      B[i] = Cnew / dt; Rh[i] = Cold / dt * T[i] - ms[i] * p.dH_gel * dG[i] / dt;
      if (i > 0) {                                      // west face (i−½), outward flow from i−1 into i is Wf[i−1]
        const w = Wf[i - 1], b = bf[i - 1];
        B[i] += b; A[i] = -b;
        if (w >= 0) A[i] -= p.c_w * w; else B[i] += p.c_w * (-w);
      }
      if (i < N - 1) {                                  // east face (i+½)
        const w = Wf[i], b = bf[i];
        B[i] += b; C[i] = -b;
        if (w >= 0) B[i] += p.c_w * w; else C[i] -= p.c_w * (-w);
      } else {                                          // surface face
        const w = Wf[i], b = bf[i];
        B[i] += b; Rh[i] += b * Tb;
        if (w >= 0) B[i] += p.c_w * w; else Rh[i] += p.c_w * (-w) * Tb;
      }
    }
    Tn = thomas(A, B, C, Rh, N);
  }
  /* ledgers (all exact for the discrete scheme) */
  const wIn = -Wf[N - 1] * dt;
  const qCond = bf[N - 1] * (Tb - Tn[N - 1]) * dt;
  const hIn = (Wf[N - 1] < 0 ? -Wf[N - 1] * Tb : -Wf[N - 1] * Tn[N - 1]) * p.c_w * dt;
  let gelH = 0; for (let i = 0; i < N; i++) gelH += ms[i] * p.dH_gel * dG[i];
  s.ledger.waterIn += wIn; s.ledger.heatCond += qCond; s.ledger.enthalpyIn += hIn; s.ledger.gelHeat += gelH;
  s.X = Float64Array.from(Xn); s.T = Float64Array.from(Tn); s.G = Gn;
  /* swelling: move the faces so that each shell holds m_s (1/ρ_s + X/ρ_w) of volume */
  if (fl.swell) {
    let cum = 0;
    for (let i = 0; i < N; i++) { cum += ms[i] * specVol(s.X[i], p); s.rf[i + 1] = radiusOfVol(cum, m); }
  }
  s.t += dt;
  s.last = { dt, wIn, qCond, hIn, gelH, Xs, Tb, Dsurf: D[N - 1], h: hS };
  return s;
}

/* Bulk quantities of a grain state. */
function grainSummary(s) {
  const { N, ms, p } = s;
  let W = 0, Tm = 0, Gm = 0;
  for (let i = 0; i < N; i++) { W += ms[i] * s.X[i]; Tm += ms[i] * (p.c_s + s.X[i] * p.c_w) * s.T[i]; Gm += ms[i] * s.G[i]; }
  let Cs = 0; for (let i = 0; i < N; i++) Cs += ms[i] * (p.c_s + s.X[i] * p.c_w);
  const Vgeom = volTo(s.rf[N], s.m), Vshell = grainVolumeFromShells(s);
  return {
    t: s.t, R: s.rf[N], Xmean: W / s.msTot, Xc: s.X[0], Xs: s.X[N - 1],
    Tc: s.T[0], Ts: s.T[N - 1], Tmean: Tm / Cs, Gc: s.G[0], Gmean: Gm / s.msTot, Gs: s.G[N - 1],
    water: W, waterIn: s.ledger.waterIn, waterResidual: W - s.W0 - s.ledger.waterIn,
    energy: energy(s), energyIn: s.ledger.heatCond + s.ledger.enthalpyIn,
    energyResidual: energy(s) - s.E0 - s.ledger.heatCond - s.ledger.enthalpyIn,
    heatCond: s.ledger.heatCond, enthalpyIn: s.ledger.enthalpyIn, gelHeat: s.ledger.gelHeat,
    dryMass: s.msTot, Vgeom, Vshell, wb: (W / s.msTot) / (1 + W / s.msTot)
  };
}
function profile(s) {
  const rc = centres(s);
  return { r: Array.from(rc), R: s.rf[s.N], T: Array.from(s.T), X: Array.from(s.X), G: Array.from(s.G), rf: Array.from(s.rf) };
}

/* Time-step rule: small steps just after a change (accuracy), larger steps later (speed). */
function nextDt(tLocal, opt) {
  return Math.min(opt.dtMax, Math.max(opt.dtMin, opt.frac * tLocal));
}

/* Run a grain through a schedule of baths.
   cfg: {grain: createGrain options, presoak: {TC, t} | null, bath: {TC, Xeq, h}, tEnd, nOut, logOut, dtMax, keepProfiles}
   The presoak phase (if any) is run first; time t = 0 is the start of the main bath. */
function runGrain(cfg) {
  const s = createGrain(cfg.grain);
  const p = s.p;
  const opt = { dtMin: cfg.dtMin || 2e-3, dtMax: cfg.dtMax || 1, frac: cfg.frac || 0.02 };
  let soakInfo = null;
  if (cfg.presoak && cfg.presoak.t > 0) {
    const T0 = cfg.presoak.TC;
    s.T.fill(T0); s.E0 = energy(s);
    let tl = 0;
    const bath = { T: T0, wet: true, Xeq: p.Xnat, h: cfg.bath.h };
    while (tl < cfg.presoak.t - 1e-9) {
      const dt = Math.min(nextDt(tl, { dtMin: opt.dtMin, dtMax: Math.max(opt.dtMax, 5), frac: opt.frac }), cfg.presoak.t - tl);
      stepGrain(s, dt, bath); tl += dt;
    }
    soakInfo = { Xmean: grainSummary(s).Xmean, R: s.rf[s.N], waterIn: s.ledger.waterIn };
    // keep ledgers continuous but re-zero the clock
    s.t = 0;
  }
  const out = { t: [], Tc: [], Ts: [], Tmean: [], Xc: [], Xs: [], Xmean: [], Gc: [], Gmean: [], R: [], waterIn: [], energyIn: [],
    waterResidual: [], energyResidual: [], profiles: [], soakInfo, grain: s };
  const tEnd = cfg.tEnd, nOut = cfg.nOut || 240;
  const outTimes = [];
  if (cfg.logOut) {
    const t0 = cfg.logStart || 0.05;
    outTimes.push(0);
    for (let i = 0; i < nOut; i++) outTimes.push(t0 * Math.pow(tEnd / t0, i / (nOut - 1)));
  } else for (let i = 0; i <= nOut; i++) outTimes.push(tEnd * i / nOut);
  const record = () => {
    const g = grainSummary(s);
    out.t.push(s.t); out.Tc.push(g.Tc); out.Ts.push(g.Ts); out.Tmean.push(g.Tmean); out.Xc.push(g.Xc); out.Xs.push(g.Xs);
    out.Xmean.push(g.Xmean); out.Gc.push(g.Gc); out.Gmean.push(g.Gmean); out.R.push(g.R); out.waterIn.push(g.waterIn);
    out.energyIn.push(g.energyIn); out.waterResidual.push(g.waterResidual); out.energyResidual.push(g.energyResidual);
    if (cfg.keepProfiles !== false) out.profiles.push(profile(s));
  };
  const bathAt = typeof cfg.bath === 'function' ? cfg.bath : () => ({ T: cfg.bath.TC, wet: true, Xeq: cfg.bath.Xeq, h: cfg.bath.h });
  s.t = 0; record();
  let k = 1, tl = 0;
  while (k < outTimes.length) {
    const target = outTimes[k];
    while (s.t < target - 1e-12) {
      const dt = Math.min(nextDt(tl, opt), target - s.t);
      stepGrain(s, dt, bathAt(s.t)); tl += dt;
    }
    record(); k++;
  }
  out.events = grainEvents(out, cfg, p);
  out.final = grainSummary(s);
  return out;
}
function crossTime(t, y, level) {                                  // first time y reaches level (linear interpolation)
  if (!y.length || y[0] == null) return null;
  if (y[0] === level) return t[0];
  for (let i = 1; i < y.length; i++) {
    if (y[i] == null || y[i - 1] == null) continue;
    const a = y[i - 1] - level, b = y[i] - level;
    if (a * b < 0 || b === 0) return t[i - 1] + (level - y[i - 1]) * (t[i] - t[i - 1]) / (y[i] - y[i - 1]);
  }
  return null;
}
function grainEvents(out, cfg, p) {
  const TbT = typeof cfg.bath === 'function' ? null : cfg.bath.TC;
  const e = {};
  if (TbT != null) {
    const T0 = out.Tc[0];
    if (Math.abs(TbT - T0) > 1) e.tCentreWithin1K = crossTime(out.t, out.Tc.map(v => Math.abs(TbT - v)), 1);
    e.tCentre99 = Math.abs(TbT - T0) > 1e-9 ? crossTime(out.t, out.Tc.map(v => (v - T0) / (TbT - T0)), 0.99) : null;
  }
  e.tCoreGel = crossTime(out.t, out.Gc, p.G_done);
  const X0 = out.Xc[0];
  return e;
}

/* ---------------------------------------------------------------------
   5. POT MODEL
   Control volume A: the free liquid water in the pot plus the vessel (lumped temperature Tp).
   Control volume B: the grains (N identical representative grains, each a moving-boundary CV).
   Steam leaves CV A through the free surface.
   Energy of CV A:  d/dt[(M c_w + C_v) Tp] = P − UA(Tp − T_amb) − Q_grains − ṁ_g c_w Tp − ṁ_ev (c_w Tp + h_fg)
   Mass of CV A:    dM/dt = −ṁ_g − ṁ_ev
   At the boiling point Tp is capped and the surplus energy boils water off.
   --------------------------------------------------------------------- */
function potDefaults() {
  return {
    water: 1.0, Cv: 0.6 * 900, area: Math.PI * 0.09 * 0.09, Tamb: 25, T0: 25, RH: 0.5,
    Pboil: 1500, Psim: 400, simmerAfterBoil: false, simmerDelay: 0,
    lid: true, UA_lid: 3.5, UA_open: 6.0, km_lid: 4e-4, km_open: 4e-3,
    altitude: 0, cookerGauge: 0, tEnd: 1800, dt: 0.5,
    rice: null    // {massRaw, grain: createGrain options, addAt: 'start'|'boil', presoak:{TC,t}, restTime}
  };
}
function runPot(cfgIn) {
  const c = Object.assign(potDefaults(), cfgIn);
  const p = defaults();
  const pAbs = pressureAtAltitude(c.altitude) + c.cookerGauge;
  const Tb = boilingPoint(pAbs), sealed = c.cookerGauge > 0;
  const km = sealed ? 0 : (c.lid ? c.km_lid : c.km_open);
  const UA = (c.lid || sealed) ? c.UA_lid : c.UA_open;
  let Tp = c.T0, M = c.water, t = 0, boiled = false, tBoil = null;
  let added = !c.rice || c.rice.addAt !== 'boil', tAdded = added ? 0 : null;
  let dry = false, tDry = null, Mevap = 0, scorchMax = c.T0;
  const led = { Pin: 0, loss: 0, latent: 0, steamEnth: 0, toGrains: 0, waterToGrains: 0 };
  let grain = null, Ng = 0;
  if (c.rice) {
    const g = Object.assign({}, c.rice.grain);
    const soaked = c.rice.presoak && c.rice.presoak.t > 0;
    g.T0 = soaked ? c.rice.presoak.TC : c.Tamb;
    grain = createGrain(g);
    if (soaked) {                                    // soaking happens before (and outside) the pot control volume
      let tl = 0; const bath = { T: c.rice.presoak.TC, wet: true, Xeq: grain.p.Xnat };
      while (tl < c.rice.presoak.t - 1e-9) {
        const dt = Math.min(nextDt(tl, { dtMin: 2e-3, dtMax: 5, frac: 0.02 }), c.rice.presoak.t - tl);
        stepGrain(grain, dt, bath); tl += dt;
      }
      grain.ledger = { waterIn: 0, heatCond: 0, enthalpyIn: 0, gelHeat: 0 };
      grain.W0 = waterMass(grain); grain.E0 = energy(grain); grain.t = 0;
    }
    const X0 = c.rice.grain.X0 != null ? c.rice.grain.X0 : p.X0;
    Ng = (c.rice.massRaw / (1 + X0)) / grain.msTot;  // number of identical grains carrying the dry mass of the rice
  }
  const gW = () => grain ? Ng * waterMass(grain) : 0;
  const water0 = M + gW();
  const Epot = () => (M * p.c_w + c.Cv) * Tp;
  const Egr = () => grain ? Ng * energy(grain) : 0;
  const E0 = Epot() + Egr();                         // grains count from t = 0 even if they wait beside the pot
  const out = { t: [], Tp: [], M: [], Mgrain: [], Mevap: [], evapRate: [], power: [], loss: [], toGrains: [], waterToGrains: [],
    Xmean: [], Gc: [], Xc: [], Tc: [], R: [], Vgrains: [], energyResidual: [], waterResidual: [], phase: [], profiles: [],
    cumPin: [], cumLoss: [], cumLatent: [], cumToGrains: [], sensible: [],
    Tb, pAbs, Ng, UA, km };
  const Epot0 = (c.water * 4180 + c.Cv) * c.T0;
  const nOut = c.nOut || 360, dtOut = c.tEnd / nOut;
  const restTime = c.rice && c.rice.restTime ? c.rice.restTime : 0;
  let rates = { evap: 0, P: 0, loss: 0, toGrains: 0, waterToGrains: 0 };
  const record = () => {
    const gs = grain ? grainSummary(grain) : null;
    out.t.push(t); out.Tp.push(Tp); out.M.push(M); out.Mgrain.push(gs ? Ng * gs.water : 0); out.Mevap.push(Mevap);
    out.evapRate.push(rates.evap); out.power.push(rates.P); out.loss.push(rates.loss); out.toGrains.push(rates.toGrains); out.waterToGrains.push(rates.waterToGrains);
    out.Xmean.push(gs ? gs.Xmean : null); out.Gc.push(gs ? gs.Gc : null); out.Xc.push(gs ? gs.Xc : null); out.Tc.push(gs ? gs.Tc : null); out.R.push(gs ? gs.R : null);
    out.Vgrains.push(gs ? Ng * gs.Vshell : 0);
    out.energyResidual.push(Epot() + Egr() - E0 - (led.Pin - led.loss - led.latent - led.steamEnth));
    out.waterResidual.push(M + gW() + Mevap - water0);
    out.phase.push(dry ? (grain ? 'rest' : 'dry') : boiled ? 'boiling' : 'heating');
    out.cumPin.push(led.Pin); out.cumLoss.push(led.loss); out.cumLatent.push(led.latent + led.steamEnth); out.cumToGrains.push(led.toGrains);
    out.sensible.push(Epot() - Epot0);
    if (grain && c.keepProfiles !== false) out.profiles.push(profile(grain));
  };
  record();
  let nextOut = dtOut;
  while (t < c.tEnd - 1e-9) {
    let dt = c.dt;
    if (grain && added) dt = Math.min(dt, nextDt(t - tAdded, { dtMin: 2e-3, dtMax: c.dt, frac: 0.02 }));
    const draw = rates.evap + rates.waterToGrains;               // shrink the step as the free water runs out
    if (!dry && draw > 0 && M < 2 * draw * dt) dt = Math.max(1e-3, 0.5 * M / draw);
    dt = Math.min(dt, nextOut - t, c.tEnd - t);
    const resting = dry;
    const P = resting ? 0 : ((c.simmerAfterBoil && boiled && t >= tBoil + c.simmerDelay) ? c.Psim : c.Pboil);
    const loss = UA * (Tp - c.Tamb);
    let Qg = 0, mg = 0;
    if (grain && added) {                            // the grains see the liquid at Tp (or steam while resting)
      const bath = resting ? { T: Tp, wet: false, h: 100 } : { T: Tp, wet: true };
      const l0 = Object.assign({}, grain.ledger);
      stepGrain(grain, dt, bath);
      Qg = Ng * (grain.ledger.heatCond - l0.heatCond) / dt;
      mg = Ng * (grain.ledger.waterIn - l0.waterIn) / dt;
      if (!resting) led.toGrains += Ng * (grain.ledger.heatCond - l0.heatCond + grain.ledger.enthalpyIn - l0.enthalpyIn);
      else led.toGrains += Qg * dt;
    }
    /* sub-boiling evaporation through the free surface: ṁ = k_m A (ρ_v,sat(Tp) − ρ_v,room); k_m illustrative */
    const mev = resting ? 0 : Math.max(0, km * c.area * (vapourDensity(Tp, 1) - vapourDensity(c.Tamb, c.RH)));
    const Mnew0 = M - dt * (mg + mev);
    const S = P - loss - Qg - mg * p.c_w * Tp - mev * (p.c_w * Tp + hfg(Tp));
    const Ecand = Epot() + dt * S;
    let Tn = Ecand / (Mnew0 * p.c_w + c.Cv), mb = 0;
    if (!resting && Tn > Tb && Mnew0 > 1e-9) {
      const L = hfg(Tb);
      mb = (Ecand - (Mnew0 * p.c_w + c.Cv) * Tb) / (dt * (L + p.c_w * (Tp - Tb)));
      if (mb * dt >= Mnew0) { mb = Mnew0 / dt; Tn = (Ecand - dt * mb * (p.c_w * Tp + L)) / c.Cv; }
      else Tn = Tb;
      if (!boiled) { boiled = true; tBoil = t + dt; }
    }
    led.Pin += P * dt; led.loss += loss * dt;
    led.latent += (mev * hfg(Tp) + mb * hfg(Tb)) * dt;
    led.steamEnth += (mev + mb) * p.c_w * Tp * dt;
    led.waterToGrains += mg * dt;
    Mevap += (mev + mb) * dt;
    M = Mnew0 - dt * mb; Tp = Tn; t += dt;
    scorchMax = Math.max(scorchMax, Tp);
    rates = { evap: mev + mb, P, loss, toGrains: Qg, waterToGrains: mg };
    if (!added && boiled) { added = true; tAdded = t; }
    if (M <= 1e-6 && !dry) { dry = true; tDry = t; }
    if (dry && !grain) { record(); break; }
    if (dry && grain && t - tDry >= restTime - 1e-9) { record(); break; }
    if (t >= nextOut - 1e-9) { record(); nextOut += dtOut; }
  }
  out.events = { tBoil, tDry, tAdded, tCoreGel: grain ? crossTime(out.t, out.Gc, p.G_done) : null };
  out.ledger = led; out.final = { M, Mevap, Tp, t, scorchMax };
  out.cfg = c;
  return out;
}
/* Pot energy bookkeeping helper for simple (no rice) runs: returns the energy split in J. */
function potEnergySplit(out) {
  const c = out.cfg, p = defaults();
  const i = out.t.length - 1;
  const sensible = (out.M[i] * p.c_w + c.Cv) * out.Tp[i] - (out.M[0] * p.c_w + c.Cv) * out.Tp[0];
  return { Pin: out.ledger.Pin, sensible, latent: out.ledger.latent, steamEnthalpy: out.ledger.steamEnth, losses: out.ledger.loss, toGrains: out.ledger.toGrains };
}

/* ---------------------------------------------------------------------
   6. ANALYTICAL REFERENCE SOLUTIONS (Crank, The Mathematics of Diffusion; Carslaw & Jaeger)
   --------------------------------------------------------------------- */
const J0_ZEROS = [2.404825557695773, 5.520078110286311, 8.653727912911013, 11.79153443901428, 14.93091770848779,
  18.07106396791092, 21.21163662987926, 24.35247153074930, 27.49347913204025, 30.63460646843198];
function j0zero(n) {                                              // n = 1, 2, ...  (McMahon expansion beyond the table)
  if (n <= J0_ZEROS.length) return J0_ZEROS[n - 1];
  const b = (n - 0.25) * Math.PI;
  return b + 1 / (8 * b) - 124 / (3 * Math.pow(8 * b, 3));
}
/* Fractional uptake M_t/M_inf for constant surface concentration and constant D (Fo = D t / R²). */
function uptakeFraction(geom, Fo, nTerms) {
  nTerms = nTerms || 400;
  if (Fo <= 0) return 0;
  let s = 0;
  if (geom === 'sphere') { for (let n = 1; n <= nTerms; n++) s += Math.exp(-n * n * Math.PI * Math.PI * Fo) / (n * n); return 1 - 6 / (Math.PI * Math.PI) * s; }
  if (geom === 'slab') { for (let n = 0; n < nTerms; n++) { const q = (2 * n + 1) * Math.PI / 2; s += Math.exp(-q * q * Fo) / (q * q); } return 1 - 2 * s; }
  for (let n = 1; n <= nTerms; n++) { const b = j0zero(n); s += Math.exp(-b * b * Fo) / (b * b); } return 1 - 4 * s;
}
/* Fraction of the surface step reached at radius r/R (sphere and slab). */
function uptakeProfile(geom, rStar, Fo, nTerms) {
  nTerms = nTerms || 400; let s = 0;
  if (geom === 'sphere') {
    if (rStar < 1e-9) { for (let n = 1; n <= nTerms; n++) s += Math.pow(-1, n) * Math.exp(-n * n * Math.PI * Math.PI * Fo); return 1 + 2 * s; }
    for (let n = 1; n <= nTerms; n++) s += Math.pow(-1, n) / n * Math.sin(n * Math.PI * rStar) * Math.exp(-n * n * Math.PI * Math.PI * Fo);
    return 1 + 2 / (Math.PI * rStar) * s;
  }
  if (geom === 'slab') {
    for (let n = 0; n < nTerms; n++) { const q = (2 * n + 1) * Math.PI / 2; s += Math.pow(-1, n) / (2 * n + 1) * Math.cos(q * rStar) * Math.exp(-q * q * Fo); }
    return 1 - 4 / Math.PI * s;
  }
  return null;
}
/* Sphere with convective surface: eigenvalues of λ cos λ + (Bi − 1) sin λ = 0 (i.e. 1 − λ cot λ = Bi). */
function sphereEigen(Bi, n) {
  const roots = [];
  for (let k = 1; k <= n; k++) {
    let a = (k - 1) * Math.PI + 1e-9, b = k * Math.PI - 1e-9;
    const f = x => x * Math.cos(x) + (Bi - 1) * Math.sin(x);
    let fa = f(a);
    for (let it = 0; it < 200; it++) { const mid = (a + b) / 2, fm = f(mid); if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; } }
    roots.push((a + b) / 2);
  }
  return roots;
}
/* θ = (T − T_bath)/(T0 − T_bath) at r/R for Fo = α t / R². */
function sphereConvective(Bi, rStar, Fo, nTerms) {
  nTerms = nTerms || 120;
  const lam = sphereEigen(Bi, nTerms); let s = 0;
  for (const l of lam) {
    const Cn = 4 * (Math.sin(l) - l * Math.cos(l)) / (2 * l - Math.sin(2 * l));
    const sh = rStar < 1e-9 ? 1 : Math.sin(l * rStar) / (l * rStar);
    s += Cn * Math.exp(-l * l * Fo) * sh;
  }
  return s;
}
/* Short-time uptake for a sphere: M_t/M_inf ≈ 6 √(Fo/π) − 3 Fo. */
function sphereShortTime(Fo) { return 6 * Math.sqrt(Fo / Math.PI) - 3 * Fo; }

/* ---------------------------------------------------------------------
   7. UTILITIES
   --------------------------------------------------------------------- */
/* Kitchen soaking data: convert drained masses to dry-basis moisture. */
function moistureFromMass(m, m0, X0) { return (m / m0) * (1 + X0) - 1; }
/* Fit D (and optionally X_eq) to mean-moisture data using the constant-D, fixed-size sphere series. */
function fitSoaking(data, R, X0, XeqFixed) {
  const pts = data.filter(d => isFinite(d.t) && isFinite(d.X) && d.t > 0);
  if (pts.length < 2) return null;
  const sse = (D, Xeq) => pts.reduce((a, d) => { const f = uptakeFraction('sphere', D * d.t / (R * R), 200); const r = X0 + (Xeq - X0) * f - d.X; return a + r * r; }, 0);
  const bestD = (Xeq) => {
    let lo = Math.log(1e-13), hi = Math.log(1e-8);
    const gr = (Math.sqrt(5) - 1) / 2;
    let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo), f1 = sse(Math.exp(c1), Xeq), f2 = sse(Math.exp(c2), Xeq);
    for (let i = 0; i < 80; i++) { if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = sse(Math.exp(c1), Xeq); } else { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = sse(Math.exp(c2), Xeq); } }
    const D = Math.exp((lo + hi) / 2); return { D, Xeq, sse: sse(D, Xeq) };
  };
  if (XeqFixed != null) return Object.assign(bestD(XeqFixed), { n: pts.length });
  let best = null;
  const Xmax = Math.max(...pts.map(d => d.X));
  for (let Xeq = Math.max(X0 + 0.02, Xmax); Xeq <= Math.max(Xmax * 1.6, X0 + 0.5); Xeq += 0.005) {
    const r = bestD(Xeq); if (!best || r.sse < best.sse) best = r;
  }
  return Object.assign(best, { n: pts.length, rms: Math.sqrt(best.sse / pts.length) });
}

/* ---------------------------------------------------------------------
   8. SCENARIO MATRIX (stage 7 and Results/scenario_times.csv)
   --------------------------------------------------------------------- */
const SCENARIOS = [
  { id: 'base',    name: 'Medium grain · unsoaked · 100 °C (sea level)', preset: 'medium', geom: 'sphere', presoak: 0,   place: 'sea' },
  { id: 'soak30',  name: 'Presoaked 30 min at 25 °C',                     preset: 'medium', geom: 'sphere', presoak: 30,  place: 'sea' },
  { id: 'soak120', name: 'Presoaked 2 h at 25 °C',                        preset: 'medium', geom: 'sphere', presoak: 120, place: 'sea' },
  { id: 'long',    name: 'Long slender grain',                            preset: 'long',   geom: 'sphere', presoak: 0,   place: 'sea' },
  { id: 'short',   name: 'Short bold grain',                              preset: 'short',  geom: 'sphere', presoak: 0,   place: 'sea' },
  { id: 'alt',     name: 'Open pot at 3000 m (water boils ≈ 90 °C)',      preset: 'medium', geom: 'sphere', presoak: 0,   place: 'alt3000' },
  { id: 'cooker',  name: 'Pressure cooker, 1 bar gauge (≈ 120 °C)',       preset: 'medium', geom: 'sphere', presoak: 0,   place: 'cooker' },
  { id: 'brown',   name: 'Brown rice (bran layer, lower D)',              preset: 'medium', geom: 'sphere', presoak: 0,   place: 'sea', brown: true },
  { id: 'cyl',     name: 'Shape check: same grain as a long cylinder',    preset: 'medium', geom: 'cylinder', presoak: 0, place: 'sea' }
];
const PLACES = {
  sea:     { name: 'Sea level',            altitude: 0,    gauge: 0 },
  hyd:     { name: 'Hyderabad (≈540 m)',   altitude: 540,  gauge: 0 },
  shimla:  { name: 'Shimla (≈2200 m)',     altitude: 2200, gauge: 0 },
  alt3000: { name: '3000 m',               altitude: 3000, gauge: 0 },
  leh:     { name: 'Leh (≈3500 m)',        altitude: 3500, gauge: 0 },
  cooker:  { name: 'Pressure cooker (1 bar gauge)', altitude: 0, gauge: 1.0e5 }
};
function placeBoilingPoint(key) { const pl = PLACES[key]; return boilingPoint(pressureAtAltitude(pl.altitude) + pl.gauge); }
function grainAlpha(X, p) { p = p || defaults(); const rho = (1 + X) / specVol(X, p), c = (p.c_s + X * p.c_w) / (1 + X); return cellK(X, p) / (rho * c); }
function runScenario(sc, opt) {
  opt = opt || {};
  const p = defaults();
  const R = equivalentSize(GRAIN_PRESETS[sc.preset], sc.geom);
  const TC = placeBoilingPoint(sc.place);
  const params = Object.assign({}, sc.brown ? { Dfactor: p.brownFactor } : {}, opt.params || {});
  const r = runGrain({ grain: { geom: sc.geom, R0: R, N: opt.N || 50, level: opt.level || 4, T0: 25, params },
    presoak: sc.presoak ? { TC: 25, t: sc.presoak * 60 } : null, bath: { TC }, tEnd: opt.tEnd || 3600, nOut: 360, dtMax: opt.dtMax || 1, keepProfiles: false });
  const pp = Object.assign(defaults(), params);
  const alpha = grainAlpha(p.X0, pp), Dw = diffusivity(TC, pp, LEVELS[4], 1, pp.Xgel);
  return { sc, R, TC, tCoreGel: r.events.tCoreGel, tHeat: r.events.tCentreWithin1K,
    naiveHeat: R * R / alpha, naiveWater: R * R / Dw, alpha, D: Dw, Xfinal: r.final.Xmean, run: r };
}

const api = {
  PARAMS, defaults, GRAIN_PRESETS, LEVELS, GEOM, K0,
  psat, boilingPoint, boilingPointCC, hfg, pressureAtAltitude, vapourDensity, waterRho, waterMu, waterK, hSphereNatural,
  volTo, areaAt, ellipsoid, equivalentSize, specVol, diffusivity, gelRate, cellK,
  createGrain, stepGrain, grainSummary, profile, runGrain, crossTime, waterMass, energy, grainVolumeFromShells,
  runPot, potDefaults, potEnergySplit,
  uptakeFraction, uptakeProfile, sphereEigen, sphereConvective, sphereShortTime, j0zero,
  moistureFromMass, fitSoaking,
  SCENARIOS, PLACES, placeBoilingPoint, grainAlpha, runScenario
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RicePhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
