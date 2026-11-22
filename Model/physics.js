/* =============================================================================
   Rice on the Boil — physics engine (physics.js)
   Pure JavaScript, no DOM.  Exposes window.RicePhysics (browser) and
   module.exports (CommonJS); under JavaScriptCore it defines a global.
   SI units throughout; temperatures handled in °C (converted to K where
   Arrhenius or ideal-gas laws need absolute temperature); moisture X on a
   DRY BASIS (kg water / kg dry solid).
   Every equation here is taken from the project's science file ("Science
   brief", stages 1-7); see README.txt.
   ============================================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------------
     2.1 PARAMETERS — value, unit, source sentence
     --------------------------------------------------------------------------- */
  var PARAMS = {
    rho_w:   { v: 1000,    unit: 'kg/m³',  src: 'Water density (science file §8).' },
    c_w:     { v: 4180,    unit: 'J/(kg·K)', src: 'Specific heat of liquid water (science file §8).' },
    k_w:     { v: 0.60,    unit: 'W/(m·K)', src: 'Thermal conductivity of water (science file §8).' },
    rho_s:   { v: 1500,    unit: 'kg/m³',  src: 'Density of dry rice solid, Choi & Okos (1986) (science file §8).' },
    c_s:     { v: 1600,    unit: 'J/(kg·K)', src: 'Specific heat of dry rice solid, Choi & Okos (1986).' },
    k_s:     { v: 0.25,    unit: 'W/(m·K)', src: 'Thermal conductivity of dry rice solid, Choi & Okos (1986).' },
    X0:      { v: 0.14,    unit: 'kg/kg db', src: 'Initial moisture of raw milled rice (science file §3.3).' },
    Xnat:    { v: 0.40,    unit: 'kg/kg db', src: 'Moisture capacity of native (raw) starch, soaking plateau (science file §3.3).' },
    Xgel:    { v: 2.6,     unit: 'kg/kg db', src: 'Surface moisture of fully gelatinized starch (science file §5.5; illustrative, inside published range).' },
    D_nat:   { v: 3.6e-10, unit: 'm²/s',   src: 'Water diffusivity in native grain at T_ref = 95 °C, Briffaz et al. (2014).' },
    D_gel:   { v: 2.8e-10, unit: 'm²/s',   src: 'Diffusivity in gelatinized grain at T_ref; gives D_gel(100 °C) ≈ 3.23e-10 (science file §4.2).' },
    D_const: { v: 3.0e-10, unit: 'm²/s',   src: 'Constant diffusivity used in ladder rung L1 (science file §5).' },
    T_ref:   { v: 95,      unit: '°C',     src: 'Reference temperature for D and k_g (science file §3.5, §5.3).' },
    Ea_D:    { v: 32500,   unit: 'J/mol',  src: 'Activation energy of water diffusion, Bello, Tolaba & Suárez (science file §3.5).' },
    brownFactor: { v: 0.58, unit: '–',     src: 'Brown rice: bran layer lowers effective D (×0.58) (science file §7).' },
    bX:      { v: 0,       unit: '–',      src: 'Moisture dependence of D, exp[b(X−X0)]; 0 by default (science file §5.6).' },
    T_on:    { v: 68,      unit: '°C',     src: 'Gelatinization onset temperature (science file §5.3; illustrative).' },
    kg_ref:  { v: 0.05,    unit: '1/s',    src: 'Gelatinization rate constant at 95 °C (science file §5.3; illustrative, cf. Lund 1984).' },
    Ea_g:    { v: 120000,  unit: 'J/mol',  src: 'Activation energy of gelatinization (science file §5.3; illustrative, cf. Lund 1984).' },
    X_lo:    { v: 0.30,    unit: 'kg/kg db', src: 'Lower moisture limit of water availability f(X) (science file §5.3; must be < X_nat).' },
    X_hi:    { v: 0.80,    unit: 'kg/kg db', src: 'Upper moisture limit of water availability f(X) (science file §5.3).' },
    dH_gel:  { v: 11000,   unit: 'J/kg dry', src: 'Gelatinization enthalpy 11 J/g, Donovan (1979) (science file §5.4).' },
    h:       { v: 1500,    unit: 'W/(m²·K)', src: 'Water-to-grain heat-transfer coefficient (science file §2.4; illustrative).' },
    G_done:  { v: 0.90,    unit: '–',      src: '"Cooked" criterion: gelatinized fraction at the centre (a CHOSEN definition, science file §5).' },
    R_gas:   { v: 8.314,   unit: 'J/(mol·K)', src: 'Universal gas constant.' },
    M_w:     { v: 0.018015, unit: 'kg/mol', src: 'Molar mass of water.' },
    g:       { v: 9.81,    unit: 'm/s²',   src: 'Gravitational acceleration.' },
    /* pot (stage 1 / 6) */
    C_v:     { v: 540,     unit: 'J/K',    src: 'Pot heat capacity 0.6 kg × 900 J/(kg·K) (science file §1).' },
    UA_lid:  { v: 3.5,     unit: 'W/K',    src: 'Pot loss conductance, lid on (science file §1.4; illustrative).' },
    UA_open: { v: 6.0,     unit: 'W/K',    src: 'Pot loss conductance, lid off (science file §1.4; illustrative).' },
    km_lid:  { v: 4e-4,    unit: 'm/s',    src: 'Sub-boiling evaporation mass-transfer coefficient, lid on (science file §1.4; illustrative).' },
    km_open: { v: 4e-3,    unit: 'm/s',    src: 'Sub-boiling evaporation mass-transfer coefficient, lid off (science file §1.4; illustrative).' },
    potR:    { v: 0.09,    unit: 'm',      src: 'Pot radius; free surface A = π(0.09 m)² (science file §1).' },
    RH:      { v: 0.5,     unit: '–',      src: 'Kitchen relative humidity (science file §1.4).' },
    h_rest:  { v: 100,     unit: 'W/(m²·K)', src: 'Grain heat-transfer coefficient during the lid-on rest (science file §6).' }
  };
  function defaults() {
    var o = {};
    for (var k in PARAMS) o[k] = PARAMS[k].v;
    return o;
  }
  function withParams(over) {
    var p = defaults();
    if (over) for (var k in over) if (over[k] !== undefined) p[k] = over[k];
    return p;
  }

  var K0 = 273.15;
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function smoothstep(s) { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); }

  /* ---------------------------------------------------------------------------
     2.2 WATER AND STEAM
     --------------------------------------------------------------------------- */
  var ANT_LO = { A: 8.07131, B: 1730.63, C: 233.426 };   // T ≤ 100 °C
  var ANT_HI = { A: 8.14019, B: 1810.94, C: 244.485 };   // T > 100 °C
  var MMHG = 133.322368;
  function psat(TC) {
    var s = TC <= 100 ? ANT_LO : ANT_HI;
    return Math.pow(10, s.A - s.B / (s.C + TC)) * MMHG;
  }
  function boilingPoint(p) {
    var lg = Math.log10(p / MMHG);
    var T = ANT_LO.B / (ANT_LO.A - lg) - ANT_LO.C;
    if (T > 100) T = ANT_HI.B / (ANT_HI.A - lg) - ANT_HI.C;
    return T;
  }
  /* Clausius–Clapeyron, constant h_fg — cross-check only */
  function boilingPointCC(p) {
    var Rv = PARAMS.R_gas.v / PARAMS.M_w.v, hfg0 = 2.2565e6, T0 = 373.15, p0 = 101325;
    return 1 / (1 / T0 - (Rv / hfg0) * Math.log(p / p0)) - K0;
  }
  function hfg(TC) {   // Watson correlation
    var TK = TC + K0;
    return 2.2565e6 * Math.pow(Math.max(647.096 - TK, 0) / (647.096 - 373.15), 0.38);
  }
  function pressureAtAltitude(z) { return 101325 * Math.pow(1 - 2.25577e-5 * z, 5.25588); }
  function vapourDensity(TC, RH) {
    if (RH === undefined) RH = 1;
    return RH * psat(TC) * PARAMS.M_w.v / (PARAMS.R_gas.v * (TC + K0));
  }
  /* property fits used only for the natural-convection estimate */
  function waterRho(TC) {
    return 1000 * (1 - (TC + 288.9414) / (508929.2 * (TC + 68.12963)) * Math.pow(TC - 3.9863, 2));
  }
  function waterMu(TC) { return 2.414e-5 * Math.pow(10, 247.8 / (TC + K0 - 140)); } // Vogel form
  function waterK(TC) { var T = TC + K0; return -0.5752 + 6.397e-3 * T - 8.151e-6 * T * T; }
  /* Churchill (1983) natural convection from a sphere */
  function hSphereNatural(R, Ts, Tw) {
    var Tf = 0.5 * (Ts + Tw), D = 2 * R, cw = PARAMS.c_w.v, g = PARAMS.g.v;
    var rho = waterRho(Tf), mu = waterMu(Tf), k = waterK(Tf);
    var beta = -(waterRho(Tf + 0.5) - waterRho(Tf - 0.5)) / rho;
    beta = Math.max(beta, 1e-6);
    var nu = mu / rho, al = k / (rho * cw), Pr = mu * cw / k;
    var Ra = g * beta * Math.abs(Tw - Ts) * D * D * D / (nu * al);
    var Nu = 2 + 0.589 * Math.pow(Ra, 0.25) / Math.pow(1 + Math.pow(0.469 / Pr, 9 / 16), 4 / 9);
    return { h: Nu * k / D, Nu: Nu, Ra: Ra, Pr: Pr, hMin: 2 * k / D, k: k };
  }

  /* ---------------------------------------------------------------------------
     2.3 GEOMETRY
     --------------------------------------------------------------------------- */
  var GEOM = { slab: 0, cylinder: 1, sphere: 2 };
  var GEOM_NAMES = ['slab', 'cylinder', 'sphere'];
  var GM = [1, Math.PI, 4 * Math.PI / 3];
  function geomIndex(g) { return typeof g === 'number' ? g : (GEOM[g] !== undefined ? GEOM[g] : 2); }
  function volTo(r, m) { return GM[m] * Math.pow(r, m + 1); }
  function areaAt(r, m) { return (m + 1) * GM[m] * Math.pow(r, m); }
  function radiusOfVol(V, m) { return Math.pow(Math.max(V, 0) / GM[m], 1 / (m + 1)); }

  var GRAIN_PRESETS = {
    long:   { name: 'Long slender (Basmati type)', L: 7.0, B: 1.8, T: 1.6 },
    medium: { name: 'Medium (Sona Masoori type)',  L: 5.5, B: 2.2, T: 1.7 },
    short:  { name: 'Short bold',                  L: 5.0, B: 2.8, T: 2.0 }
  };
  /* dimensions in mm → V (m³), S (m²); Knud Thomsen p = 1.6075 */
  function ellipsoid(L, B, T) {
    var a = L / 2e3, b = B / 2e3, c = T / 2e3, p = 1.6075;
    var V = 4 / 3 * Math.PI * a * b * c;
    var ap = Math.pow(a, p), bp = Math.pow(b, p), cp = Math.pow(c, p);
    var S = 4 * Math.PI * Math.pow((ap * bp + ap * cp + bp * cp) / 3, 1 / p);
    return { V: V, S: S, a: a, b: b, c: c };
  }
  function equivalentSize(preset, geom) {
    var g = typeof preset === 'string' ? GRAIN_PRESETS[preset] : preset;
    var e = ellipsoid(g.L, g.B, g.T), m = geomIndex(geom);
    return (m + 1) * e.V / e.S;
  }

  /* ---------------------------------------------------------------------------
     2.4 GRAIN MODEL — radial finite volumes that follow the dry solid
     --------------------------------------------------------------------------- */
  var LEVELS = [
    null,
    { id: 1, short: 'L1', name: 'Constant D, fixed size, surface at X_gel',
      fl: { DT: false, gelCap: false, Dstate: false, swell: false } },
    { id: 2, short: 'L2', name: '+ starch state sets surface capacity and D',
      fl: { DT: false, gelCap: true, Dstate: true, swell: false } },
    { id: 3, short: 'L3', name: '+ swelling (moving boundary)',
      fl: { DT: false, gelCap: true, Dstate: true, swell: true } },
    { id: 4, short: 'L4', name: '+ D(T) Arrhenius (full model)',
      fl: { DT: true, gelCap: true, Dstate: true, swell: true } }
  ];
  function levelFlags(level) {
    if (level && typeof level === 'object') return level;
    var L = LEVELS[level || 4] || LEVELS[4];
    var f = L.fl; return { DT: f.DT, gelCap: f.gelCap, Dstate: f.Dstate, swell: f.swell };
  }
  function specVol(X, p) { return 1 / p.rho_s + X / p.rho_w; }
  function arrhenius(TC, Ea, p) { return Math.exp(-Ea / p.R_gas * (1 / (TC + K0) - 1 / (p.T_ref + K0))); }
  function diffusivity(TC, p, fl, G, X, Dfactor) {
    var base = fl.Dstate ? p.D_nat * (1 - G) + p.D_gel * G : p.D_const;
    var a = fl.DT ? arrhenius(TC, p.Ea_D, p) : 1;
    return base * a * Math.exp(p.bX * (X - p.X0)) * (Dfactor === undefined ? 1 : Dfactor);
  }
  function gelRate(TC, X, p) {
    var k = p.kg_ref * arrhenius(TC, p.Ea_g, p);
    var on = 1 / (1 + Math.exp(-(TC - p.T_on) / 1.5));
    return k * on * smoothstep((X - p.X_lo) / (p.X_hi - p.X_lo));
  }
  function cellK(X, p) {
    var phi = (X / p.rho_w) / (1 / p.rho_s + X / p.rho_w);
    return phi * p.k_w + (1 - phi) * p.k_s;
  }
  function grainAlpha(X, p) {
    p = p || defaults();
    return cellK(X, p) * specVol(X, p) / (p.c_s + X * p.c_w);
  }
  function DgelAt(TC, p, Dfactor) {
    p = p || defaults();
    return p.D_gel * arrhenius(TC, p.Ea_D, p) * (Dfactor === undefined ? 1 : Dfactor);
  }

  function makeGrain(o) {
    var p = o.p || defaults();
    var m = geomIndex(o.geom === undefined ? 'sphere' : o.geom);
    var N = o.N || 60, R0 = o.R;
    var X0 = o.X0 === undefined ? p.X0 : o.X0, T0 = o.T0 === undefined ? 25 : o.T0;
    var s = {
      p: p, m: m, N: N, R0: R0, fl: levelFlags(o.level), Dfactor: o.Dfactor === undefined ? 1 : o.Dfactor,
      ms: new Float64Array(N), X: new Float64Array(N), T: new Float64Array(N), G: new Float64Array(N),
      rf: new Float64Array(N + 1), rc: new Float64Array(N), Vg: new Float64Array(N),
      Win: new Float64Array(N + 1),      // inward water flow through face i (kg/s), last step
      waterIn: 0, heatCond: 0, enthalpyIn: 0, gelHeat: 0, t: 0, lastWs: 0, lastQs: 0
    };
    for (var i = 0; i <= N; i++) s.rf[i] = R0 * i / N;
    for (i = 0; i < N; i++) {
      s.rc[i] = 0.5 * (s.rf[i] + s.rf[i + 1]);
      s.Vg[i] = volTo(s.rf[i + 1], m) - volTo(s.rf[i], m);
      s.ms[i] = s.Vg[i] / specVol(X0, p);
      s.X[i] = X0; s.T[i] = T0; s.G[i] = o.G0 || 0;
    }
    s.msTotal = 0; for (i = 0; i < N; i++) s.msTotal += s.ms[i];
    s.water0 = grainWater(s); s.energy0 = grainEnergy(s); s.V0 = volTo(R0, m);
    return s;
  }
  function cloneGrain(s) {
    var c = {};
    for (var k in s) {
      var v = s[k];
      c[k] = (v instanceof Float64Array) ? new Float64Array(v) : v;
    }
    c.fl = { DT: s.fl.DT, gelCap: s.fl.gelCap, Dstate: s.fl.Dstate, swell: s.fl.swell };
    return c;
  }
  function grainWater(s) { var w = 0; for (var i = 0; i < s.N; i++) w += s.ms[i] * s.X[i]; return w; }
  function grainEnergy(s) {
    var p = s.p, e = 0;
    for (var i = 0; i < s.N; i++) e += s.ms[i] * ((p.c_s + s.X[i] * p.c_w) * s.T[i] + p.dH_gel * s.G[i]);
    return e;
  }
  function surfaceXeq(s, bath) {
    var p = s.p;
    if (s.fl.gelCap) return p.Xnat + s.G[s.N - 1] * (p.Xgel - p.Xnat);
    return bath.Xeq;
  }

  /* tridiagonal solver (Thomas) — a: sub, b: diag, c: super, d: rhs */
  function thomas(a, b, c, d, n, out) {
    var cp = new Float64Array(n), dp = new Float64Array(n);
    cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
    for (var i = 1; i < n; i++) {
      var den = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / den; dp[i] = (d[i] - a[i] * dp[i - 1]) / den;
    }
    out[n - 1] = dp[n - 1];
    for (i = n - 2; i >= 0; i--) out[i] = dp[i] - cp[i] * out[i + 1];
    return out;
  }

  /* one implicit step of the grain; bath = {T, wet, Xeq, h} */
  function stepGrain(s, dt, bath) {
    var p = s.p, N = s.N, m = s.m, fl = s.fl, i;
    var a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N), d = new Float64Array(N);
    var Dc = new Float64Array(N), rd = new Float64Array(N), af = new Float64Array(N + 1);
    var R = s.rf[N], AR = areaAt(R, m);
    var Xold = new Float64Array(s.X), Gold = new Float64Array(s.G);
    /* (1) water — backward Euler, Fick relative to the solid: j = −ρ_d D ∂X/∂r */
    for (i = 0; i < N; i++) {
      Dc[i] = diffusivity(s.T[i], p, fl, s.G[i], s.X[i], s.Dfactor);
      rd[i] = s.ms[i] / s.Vg[i];
    }
    for (i = 1; i < N; i++) {      // face i between cell i-1 and i
      af[i] = 0.5 * (Dc[i - 1] + Dc[i]) * 0.5 * (rd[i - 1] + rd[i]) * areaAt(s.rf[i], m) / (s.rc[i] - s.rc[i - 1]);
    }
    var Xeq = surfaceXeq(s, bath);
    var as = bath.wet ? Dc[N - 1] * rd[N - 1] * AR / (R - s.rc[N - 1]) : 0;
    af[0] = 0; af[N] = as;
    for (i = 0; i < N; i++) {
      var mt = s.ms[i] / dt;
      a[i] = -af[i]; c[i] = i < N - 1 ? -af[i + 1] : 0;
      b[i] = mt + af[i] + (i < N - 1 ? af[i + 1] : as);
      d[i] = mt * s.X[i] + (i === N - 1 ? as * Xeq : 0);
    }
    var Xn = thomas(a, b, c, d, N, new Float64Array(N));
    for (i = 1; i < N; i++) s.Win[i] = af[i] * (Xn[i] - Xn[i - 1]);   // inward through face i
    var Ws = as * (Xeq - Xn[N - 1]);
    s.Win[N] = Ws; s.Win[0] = 0;
    /* (2) gelatinization — exact first-order update with old T, new X */
    var dG = new Float64Array(N);
    for (i = 0; i < N; i++) {
      var kk = gelRate(s.T[i], Xn[i], p);
      var Gn = 1 - (1 - s.G[i]) * Math.exp(-kk * dt);
      dG[i] = Gn - s.G[i]; s.G[i] = Gn;
    }
    /* (3) energy — implicit; conduction + upwinded c_w W T + gelatinization sink */
    var kc = new Float64Array(N), Kf = new Float64Array(N + 1);
    for (i = 0; i < N; i++) kc[i] = cellK(Xn[i], p);
    for (i = 1; i < N; i++) {
      Kf[i] = areaAt(s.rf[i], m) / ((s.rf[i] - s.rc[i - 1]) / kc[i - 1] + (s.rc[i] - s.rf[i]) / kc[i]);
    }
    var hh = bath.h === undefined ? p.h : bath.h;
    var Ks = AR / ((hh > 0 ? 1 / hh : Infinity) + (R - s.rc[N - 1]) / kc[N - 1]);
    if (!(hh > 0)) Ks = 0;
    var cw = p.c_w;
    for (i = 0; i < N; i++) {
      var Cold = s.ms[i] * (p.c_s + Xold[i] * cw), Cnew = s.ms[i] * (p.c_s + Xn[i] * cw);
      a[i] = i > 0 ? -Kf[i] : 0;
      c[i] = i < N - 1 ? -Kf[i + 1] : 0;
      b[i] = Cnew / dt + (i > 0 ? Kf[i] : 0) + (i < N - 1 ? Kf[i + 1] : Ks);
      d[i] = Cold * s.T[i] / dt - s.ms[i] * p.dH_gel * dG[i] / dt;
    }
    for (i = 1; i < N; i++) {        // face i: inner cell i-1, outer cell i; w = c_w × inward flow
      var w = cw * s.Win[i];
      if (w > 0) {                   // carries T of outer cell i
        c[i - 1] -= w;               // inner gains +w T_i
        b[i] += w;                   // outer loses  w T_i
      } else {                       // outward flow carries T of inner cell i-1
        b[i - 1] -= w;               // inner loses |w| T_{i-1}
        a[i] += w;                   // outer gains |w| T_{i-1}
      }
    }
    var ws = cw * Ws, Tb = bath.T;
    if (ws > 0) d[N - 1] += ws * Tb; else b[N - 1] -= ws;
    d[N - 1] += Ks * Tb;
    var Tn = thomas(a, b, c, d, N, new Float64Array(N));
    /* (4) ledgers */
    var Qs = Ks * (Tb - Tn[N - 1]);
    var Hs = ws > 0 ? ws * Tb : ws * Tn[N - 1];
    s.heatCond += dt * Qs; s.enthalpyIn += dt * Hs; s.waterIn += dt * Ws;
    for (i = 0; i < N; i++) s.gelHeat += s.ms[i] * p.dH_gel * dG[i];
    s.lastWs = Ws; s.lastQs = Qs; s.lastHs = Hs;
    for (i = 0; i < N; i++) { s.X[i] = Xn[i]; s.T[i] = Tn[i]; }
    /* (5) swelling — faces follow the dry solid; volumes are additive */
    if (fl.swell) {
      var V = 0;
      for (i = 0; i < N; i++) {
        var Vi = s.ms[i] * specVol(s.X[i], p);
        V += Vi; s.Vg[i] = Vi; s.rf[i + 1] = radiusOfVol(V, m);
      }
      for (i = 0; i < N; i++) s.rc[i] = 0.5 * (s.rf[i] + s.rf[i + 1]);
    }
    s.t += dt;
    return s;
  }

  function grainSummary(s) {
    var p = s.p, N = s.N, i, W = 0, Ms = 0, sT = 0, sG = 0, C = 0, Vsh = 0;
    for (i = 0; i < N; i++) {
      var Ci = s.ms[i] * (p.c_s + s.X[i] * p.c_w);
      W += s.ms[i] * s.X[i]; Ms += s.ms[i]; C += Ci; sT += Ci * s.T[i]; sG += s.ms[i] * s.G[i];
      Vsh += s.ms[i] * specVol(s.X[i], p);
    }
    var E = sT + p.dH_gel * sG;
    var R = s.rf[N];
    var wres = (W - s.water0 - s.waterIn) / Math.max(s.water0, 1e-300);
    var escale = Math.max(Math.abs(s.energy0), Math.abs(s.heatCond) + Math.abs(s.enthalpyIn), 1e-300);
    var eres = (E - s.energy0 - s.heatCond - s.enthalpyIn) / escale;
    return {
      t: s.t, R: R, RR0: R / s.R0, Xm: W / Ms, Xc: s.X[0], Xs: s.X[N - 1], Tc: s.T[0], Ts: s.T[N - 1],
      Tm: sT / C, Gc: s.G[0], Gm: sG / Ms, Gs: s.G[N - 1], water: W, waterIn: s.waterIn, waterResidual: wres,
      energy: E, heatCond: s.heatCond, enthalpyIn: s.enthalpyIn, gelHeat: s.gelHeat, energyResidual: eres,
      Vgeom: volTo(R, s.m), Vshell: Vsh, msTotal: Ms, Ws: s.lastWs, Qs: s.lastQs,
      Xeq: s.fl.gelCap ? p.Xnat + s.G[N - 1] * (p.Xgel - p.Xnat) : undefined
    };
  }
  function grainProfile(s) {
    return {
      t: s.t, R: s.rf[s.N], rc: Array.prototype.slice.call(s.rc), rf: Array.prototype.slice.call(s.rf),
      X: Array.prototype.slice.call(s.X), T: Array.prototype.slice.call(s.T), G: Array.prototype.slice.call(s.G)
    };
  }
  /* radius where G crosses g (gelatinization front, outside-in); 0 if none */
  function frontRadius(prof, g) {
    var G = prof.G, rc = prof.rc, n = G.length;
    if (G[0] >= g) return 0;
    for (var i = 1; i < n; i++) {
      if (G[i] >= g) {
        var f = (g - G[i - 1]) / (G[i] - G[i - 1]);
        return rc[i - 1] + f * (rc[i] - rc[i - 1]);
      }
    }
    return prof.R;
  }

  function outputTimes(dur, out) {
    out = out || {};
    var n = out.n || 200, ts = [0], k;
    if (out.log) {
      var t0 = out.tmin || 0.02;
      for (k = 0; k < n; k++) ts.push(t0 * Math.pow(dur / t0, k / (n - 1)));
    } else {
      for (k = 1; k <= n; k++) ts.push(dur * k / n);
    }
    if (out.extra) ts = ts.concat(out.extra.filter(function (x) { return x > 0 && x < dur; }));
    ts.sort(function (x, y) { return x - y; });
    var u = [ts[0]];
    for (k = 1; k < ts.length; k++) if (ts[k] - u[u.length - 1] > 1e-9) u.push(ts[k]);
    return u;
  }

  function grainRadiusFromCfg(cfg) {
    if (cfg.R) return cfg.R;
    return equivalentSize(cfg.grain || 'medium', cfg.geom === undefined ? 'sphere' : cfg.geom);
  }

  /* run a single grain: optional presoak, then main bath */
  function runGrain(cfg) {
    cfg = cfg || {};
    var p = withParams(cfg.p);
    var geom = cfg.geom === undefined ? 'sphere' : cfg.geom;
    var R0 = grainRadiusFromCfg(cfg);
    var mode = cfg.mode || 'cook';
    var T0 = cfg.T0 === undefined ? 25 : cfg.T0;
    var TC = cfg.TC === undefined ? 100 : cfg.TC;
    var h = cfg.h === undefined ? p.h : cfg.h;
    var Dfactor = cfg.Dfactor === undefined ? 1 : cfg.Dfactor;
    var s = makeGrain({ p: p, geom: geom, R: R0, N: cfg.N || 60, level: cfg.level || 4, T0: T0, Dfactor: Dfactor });
    var dtMin = cfg.dtMin || 2e-3, dtFrac = cfg.dtFrac || 0.02;
    var soak = null;
    /* presoak phase: bath at TC_soak, Xeq = X_nat; clock reset afterwards */
    if (cfg.presoak && cfg.presoak.time > 0) {
      var Ts = cfg.presoak.TC === undefined ? T0 : cfg.presoak.TC;
      for (var i0 = 0; i0 < s.N; i0++) s.T[i0] = Ts;
      s.energy0 = grainEnergy(s);
      var tS = 0, tEnd = cfg.presoak.time, dtMaxS = cfg.presoak.dtMax || 5;
      while (tS < tEnd - 1e-9) {
        var dts = clamp(dtFrac * tS, dtMin, dtMaxS); if (tS + dts > tEnd) dts = tEnd - tS;
        stepGrain(s, dts, { T: Ts, wet: true, Xeq: p.Xnat, h: h }); tS += dts;
      }
      soak = grainSummary(s); soak.time = tEnd; soak.TC = Ts;
      soak.profile = grainProfile(s);
      s.t = 0;
    }
    var bath = { T: TC, wet: mode !== 'heat', Xeq: cfg.Xeq !== undefined ? cfg.Xeq : (mode === 'soak' ? p.Xnat : p.Xgel), h: h };
    if (cfg.wet === false) bath.wet = false;
    var dur = cfg.duration || 1500;
    var dtMax = cfg.dtMax || Math.max(0.05, Math.min(mode === 'soak' ? 5 : 1, dur / 1500));
    var times = outputTimes(dur, cfg.outputs);
    var hist = {}, keys = ['t', 'R', 'RR0', 'Xm', 'Xc', 'Xs', 'Tc', 'Ts', 'Tm', 'Gc', 'Gm', 'Gs', 'water', 'waterIn',
      'waterResidual', 'energy', 'heatCond', 'enthalpyIn', 'gelHeat', 'energyResidual', 'Vgeom', 'Vshell', 'Ws', 'Qs'];
    keys.forEach(function (k) { hist[k] = []; });
    var profiles = [], wantProf = cfg.profiles !== false;
    var T00 = s.T[0], X00 = s.X[0];
    function record() {
      var su = grainSummary(s);
      keys.forEach(function (k) { hist[k].push(su[k]); });
      if (wantProf) profiles.push(grainProfile(s));
    }
    var ev = { tCentreWithin1K: null, tCentre99: null, tCoreGel: null, tXc50: null };
    var Gdone = cfg.Gdone === undefined ? p.G_done : cfg.Gdone;
    record();
    var t = 0, k = 1, prev = { t: 0, Tc: s.T[0], Gc: s.G[0], Xc: s.X[0] };
    var Xtarget50 = X00 + 0.5 * (bath.Xeq - X00);
    var maxPe = 0;
    while (k < times.length) {
      var dt = clamp(dtFrac * t, dtMin, dtMax);
      if (t + dt > times[k] - 1e-12) dt = times[k] - t;
      stepGrain(s, dt, bath); t += dt;
      var Tc = s.T[0], Gc = s.G[0], Xc = s.X[0];
      if (ev.tCentreWithin1K === null && Math.abs(TC - Tc) <= 1 && Math.abs(TC - T00) > 1) {
        var e0 = Math.abs(TC - prev.Tc), e1 = Math.abs(TC - Tc);
        ev.tCentreWithin1K = prev.t + (e0 - 1) / (e0 - e1) * (t - prev.t);
      }
      if (ev.tCentre99 === null && Math.abs(TC - T00) > 1e-9) {
        var th1 = (Tc - T00) / (TC - T00);
        if (th1 >= 0.99) {
          var th0 = (prev.Tc - T00) / (TC - T00);
          ev.tCentre99 = prev.t + (0.99 - th0) / (th1 - th0) * (t - prev.t);
        }
      }
      if (ev.tCoreGel === null && Gc >= Gdone) {
        ev.tCoreGel = prev.t + (Gdone - prev.Gc) / (Gc - prev.Gc) * (t - prev.t);
      }
      if (ev.tXc50 === null && bath.wet && (Xc - X00) >= (Xtarget50 - X00) && Xtarget50 > X00) {
        ev.tXc50 = prev.t + (Xtarget50 - prev.Xc) / (Xc - prev.Xc) * (t - prev.t);
      }
      prev = { t: t, Tc: Tc, Gc: Gc, Xc: Xc };
      if (t >= times[k] - 1e-12) { t = times[k]; s.t = t; record(); k++; }
      if (cfg.stopAtGel && ev.tCoreGel !== null && t > ev.tCoreGel * 1.02) break;
    }
    return {
      cfg: cfg, p: p, geom: geomIndex(geom), R0: R0, bath: bath, hist: hist, profiles: profiles,
      events: ev, soak: soak, final: grainSummary(s), state: s, T0: T00, X0: X00
    };
  }

  /* interpolate the first crossing time of series y ≥ yc in a run history */
  function crossingTime(t, y, yc) {
    for (var i = 1; i < y.length; i++) {
      if (y[i] >= yc && y[i - 1] < yc) return t[i - 1] + (yc - y[i - 1]) / (y[i] - y[i - 1]) * (t[i] - t[i - 1]);
    }
    return y.length && y[0] >= yc ? t[0] : null;
  }
  function interp(t, y, tt) {
    if (tt <= t[0]) return y[0];
    for (var i = 1; i < t.length; i++) if (t[i] >= tt) {
      var f = (tt - t[i - 1]) / (t[i] - t[i - 1]); return y[i - 1] + f * (y[i] - y[i - 1]);
    }
    return y[y.length - 1];
  }

  /* ---------------------------------------------------------------------------
     2.5 POT MODEL
     --------------------------------------------------------------------------- */
  var PLACES = {
    sea:     { name: 'Sea level (0 m)',          z: 0,    gauge: 0 },
    hyd:     { name: 'Hyderabad (540 m)',        z: 540,  gauge: 0 },
    shimla:  { name: 'Shimla (2200 m)',          z: 2200, gauge: 0 },
    alt3000: { name: '3000 m',                   z: 3000, gauge: 0 },
    leh:     { name: 'Leh (3500 m)',             z: 3500, gauge: 0 },
    cooker:  { name: 'Pressure cooker (1 bar gauge, sea level)', z: 0, gauge: 1e5 }
  };
  function placePressure(key) { var P = PLACES[key] || PLACES.sea; return pressureAtAltitude(P.z) + P.gauge; }
  function placeBoilingPoint(key) { return boilingPoint(placePressure(key)); }

  function runPot(cfg) {
    cfg = cfg || {};
    var p = withParams(cfg.p);
    var c = {
      water: 1.0, Cv: p.C_v, area: Math.PI * p.potR * p.potR, Tamb: 25, RH: p.RH, Pboil: 1500, Psim: 400,
      simmerAfterBoil: false, lid: true, altitude: 0, cookerGauge: 0, dt: 0.5, duration: 1200,
      recordEvery: 5, rice: null, T0: undefined
    };
    for (var key in cfg) if (cfg[key] !== undefined && key !== 'p') c[key] = cfg[key];
    if (c.place) { var PL = PLACES[c.place] || PLACES.sea; c.altitude = PL.z; c.cookerGauge = PL.gauge; }
    var sealed = c.cookerGauge > 0;
    var UA = c.UA !== undefined ? c.UA : ((c.lid || sealed) ? p.UA_lid : p.UA_open);
    var km = c.km !== undefined ? c.km : (sealed ? 0 : (c.lid ? p.km_lid : p.km_open));
    var pres = pressureAtAltitude(c.altitude) + c.cookerGauge;
    var Tb = boilingPoint(pres), cw = p.c_w;
    var T0 = c.T0 === undefined ? c.Tamb : c.T0;
    var st = { t: 0, M: c.water, T: T0, E: (c.water * cw + c.Cv) * T0, steam: 0, Pin: 0, loss: 0, latent: 0,
      toGrains: 0, phase: 'heating', boiled: false, tBoil: null, tDry: null, tRestEnd: null, mb: 0, mev: 0, mg: 0, P: c.Pboil };
    var E0 = st.E, M0 = c.water;
    var rice = c.rice, g = null, N = 0, tAdd = null, grainW0 = 0, riceInfo = null;
    function addRice() {
      var gp = withParams(cfg.p);
      var R0 = rice.R || equivalentSize(rice.grain || 'medium', rice.geom || 'sphere');
      g = makeGrain({ p: gp, geom: rice.geom || 'sphere', R: R0, N: rice.N || 60, level: rice.level || 4,
        T0: rice.presoak ? (rice.soakTC === undefined ? c.Tamb : rice.soakTC) : c.Tamb, Dfactor: rice.Dfactor });
      var soakInfo = null;
      if (rice.presoak > 0) {
        var Ts = rice.soakTC === undefined ? c.Tamb : rice.soakTC, ts = 0;
        while (ts < rice.presoak - 1e-9) {
          var d = clamp(0.02 * ts, 2e-3, 5); if (ts + d > rice.presoak) d = rice.presoak - ts;
          stepGrain(g, d, { T: Ts, wet: true, Xeq: gp.Xnat, h: gp.h }); ts += d;
        }
        soakInfo = grainSummary(g);
        for (var i = 0; i < g.N; i++) g.T[i] = c.Tamb;   // drained grains back at kitchen temperature
        g.waterIn = 0; g.heatCond = 0; g.enthalpyIn = 0; g.gelHeat = 0;
        g.water0 = grainWater(g); g.energy0 = grainEnergy(g);
      }
      var dry = rice.massRaw / (1 + gp.X0);
      N = dry / g.msTotal;
      grainW0 = grainWater(g);
      tAdd = st.t;
      riceInfo = { N: N, dryMass: dry, R0: R0, grainDryMass: g.msTotal, soak: soakInfo, grainW0: N * grainW0 };
    }
    if (rice && (rice.addAt || 'start') === 'start') addRice();
    var keys = ['t', 'T', 'M', 'grainWater', 'absorbed', 'steam', 'mev', 'mb', 'mg', 'Xm', 'Gc', 'Xc', 'Tc', 'R', 'RR0',
      'Vgrains', 'Pin', 'loss', 'latent', 'toGrains', 'sensible', 'energyResidual', 'waterResidual', 'P', 'phase', 'boiling'];
    var hist = {}; keys.forEach(function (k) { hist[k] = []; });
    var profiles = [];
    var gEv = { tCoreGel: null };
    function waterAbsorbed() { return g ? N * (grainWater(g) - grainW0) : 0; }
    function record() {
      var su = g ? grainSummary(g) : null;
      var abs = waterAbsorbed();
      var sensible = st.E - E0;
      var eres = (sensible + st.toGrains + st.latent + st.loss - st.Pin) / Math.max(st.Pin, 1);
      var wres = (st.M + abs + st.steam - M0) / M0;
      var row = {
        t: st.t, T: st.T, M: st.M, grainWater: g ? N * grainWater(g) : 0, absorbed: abs, steam: st.steam,
        mev: st.mev, mb: st.mb, mg: st.mg, Xm: su ? su.Xm : null, Gc: su ? su.Gc : null, Xc: su ? su.Xc : null,
        Tc: su ? su.Tc : null, R: su ? su.R : null, RR0: su ? su.RR0 : null, Vgrains: su ? N * su.Vgeom : 0,
        Pin: st.Pin, loss: st.loss, latent: st.latent, toGrains: st.toGrains, sensible: sensible,
        energyResidual: eres, waterResidual: wres, P: st.P, phase: st.phase, boiling: st.mb > 0 ? 1 : 0
      };
      keys.forEach(function (k) { hist[k].push(row[k]); });
      profiles.push(g ? grainProfile(g) : null);
    }
    record();
    var nextRec = c.recordEvery, dur = c.duration, guard = 0;
    var dryThreshold = 1e-6;
    while (st.t < dur - 1e-9 && guard++ < 2e6) {
      var resting = st.phase === 'rest';
      var dt = c.dt;
      if (g && tAdd !== null) dt = Math.min(dt, Math.max(0.01, 0.02 * (st.t - tAdd)));
      var rate = st.mg + st.mev + st.mb;
      if (st.M > 0 && rate > 0 && 5 * dt * rate > st.M) dt = Math.max(1e-4, st.M / (5 * rate));
      if (st.t + dt > nextRec) dt = Math.max(nextRec - st.t, 1e-9);
      if (st.t + dt > dur) dt = dur - st.t;
      var ok = false, tries = 0, gNew = null, res;
      while (!ok && tries < 40) {
        res = potStep(dt);
        if (res) ok = true; else { dt *= 0.5; tries++; }
      }
      if (!ok) break;
      // commit
      st.t += dt;
      if (rice && !g && (rice.addAt === 'boil') && st.boiled) addRice();
      if (g && gEv.tCoreGel === null && g.G[0] >= (rice.Gdone || p.G_done)) gEv.tCoreGel = st.t;
      if (rice && g && st.M <= dryThreshold && st.tDry === null && !resting) {
        st.tDry = st.t; st.phase = 'rest'; st.tRestEnd = st.t + (rice.restTime === undefined ? 600 : rice.restTime);
      }
      if (!rice && st.M <= dryThreshold && st.phase !== 'dry') { st.phase = 'dry'; st.tDry = st.t; }
      if (st.t >= nextRec - 1e-9) { record(); nextRec += c.recordEvery; }
      if (st.phase === 'rest' && st.t >= st.tRestEnd - 1e-9) { if (hist.t[hist.t.length - 1] < st.t) record(); break; }
    }
    if (hist.t[hist.t.length - 1] < st.t - 1e-9) record();

    function potStep(dt) {
      var resting = st.phase === 'rest' || st.phase === 'dry';
      var Tp = st.T;
      var P = resting ? 0 : ((st.boiled && c.simmerAfterBoil) ? c.Psim : c.Pboil);
      var loss = UA * (Tp - c.Tamb);
      var mev = 0;
      if (st.M > 0 && km > 0) mev = Math.max(0, km * c.area * (vapourDensity(Tp, 1) - c.RH * vapourDensity(c.Tamb, 1)));
      var mg = 0, Qg = 0, gn = null;
      if (g) {
        gn = cloneGrain(g);
        var wet = st.M > dryThreshold && !resting;
        stepGrain(gn, dt, { T: Tp, wet: wet, Xeq: gn.p.Xgel, h: resting ? p.h_rest : (rice.h || gn.p.h) });
        mg = N * (gn.waterIn - g.waterIn) / dt;
        Qg = N * ((gn.heatCond + gn.enthalpyIn) - (g.heatCond + g.enthalpyIn)) / dt;
      }
      var hf = hfg(Tp);
      var S = P - loss - Qg - mev * (cw * Tp + hf);
      var Mn = st.M - dt * (mg + mev);
      if (Mn < -1e-12) return false;
      if (Mn < 0) Mn = 0;
      var Ec = st.E + dt * S, mb = 0, En, Tn;
      var Tc = Ec / (Mn * cw + c.Cv);
      if (Tc > Tb && Mn > 0) {
        var hb = hfg(Tb);
        mb = (Ec - (Mn * cw + c.Cv) * Tb) / (dt * hb);
        if (dt * mb >= Mn) {
          mb = Mn / dt; En = Ec - Mn * (cw * Tb + hb); Mn = 0; Tn = En / c.Cv;
        } else {
          Mn = Mn - dt * mb; En = Ec - dt * mb * (cw * Tb + hb); Tn = En / (Mn * cw + c.Cv);
        }
        st.latent += dt * mb * (cw * Tb + hb);
      } else { En = Ec; Tn = Tc; }
      // commit
      if (gn) { for (var kk in gn) g[kk] = gn[kk]; }
      st.latent += dt * mev * (cw * Tp + hf);
      st.steam += dt * (mev + mb);
      st.Pin += dt * P; st.loss += dt * loss; st.toGrains += dt * Qg;
      st.M = Mn; st.E = En; st.T = Tn; st.mb = mb; st.mev = mev; st.mg = mg; st.P = P;
      if (!st.boiled && mb > 0) { st.boiled = true; st.tBoil = st.t + dt; }
      if (st.phase === 'heating' && st.boiled) st.phase = 'boiling';
      return true;
    }
    return {
      cfg: c, p: p, Tb: Tb, pressure: pres, UA: UA, km: km, hist: hist, profiles: profiles, rice: riceInfo,
      tBoil: st.tBoil, tDry: st.tDry, tCoreGel: gEv.tCoreGel, final: st, grain: g, M0: M0, E0: E0
    };
  }

  /* ---------------------------------------------------------------------------
     2.6 ANALYTICAL REFERENCES (Crank 1975; Carslaw & Jaeger 1959)
     --------------------------------------------------------------------------- */
  var J0Z = [2.404825557695773, 5.520078110286311, 8.653727912911013, 11.79153443901428, 14.93091770848779,
    18.07106396791092, 21.21163662987926, 24.35247153074930, 27.49347913204025, 30.63460646843198,
    33.77582021357357, 36.91709835366404, 40.05842576462824, 43.19979171317673, 46.34118837166181,
    49.48260989739782, 52.62405184111500, 55.76551075501998, 58.90698392608094, 62.04846919022717];
  function j0zero(n) {   // n = 1, 2, ...
    if (n <= J0Z.length) return J0Z[n - 1];
    var b = (n - 0.25) * Math.PI, e = 8 * b;
    return b + 1 / e - 124 / (3 * e * e * e) + 120928 / (15 * Math.pow(e, 5));   // McMahon
  }
  function besselJ(n, x) {   // (1/2π)∫cos(nτ − x sin τ)dτ, trapezoid (exponentially convergent)
    var M = Math.max(64, Math.ceil(Math.abs(x)) + 48), s = 0;
    for (var k = 0; k < M; k++) { var tau = 2 * Math.PI * k / M; s += Math.cos(n * tau - x * Math.sin(tau)); }
    return s / M;
  }
  function nTerms(Fo) { return Math.min(4000, Math.ceil(Math.sqrt(46 / (Math.PI * Math.PI * Math.max(Fo, 1e-9)))) + 8); }
  function sphereShortTime(Fo) { return 6 * Math.sqrt(Fo / Math.PI) - 3 * Fo; }
  function uptakeFraction(geom, Fo) {
    var m = geomIndex(geom), s = 0, n;
    if (Fo <= 0) return 0;
    if (m === 2) {
      if (Fo < 0.05) return sphereShortTime(Fo);
      for (n = 1; n <= 60; n++) s += Math.exp(-n * n * Math.PI * Math.PI * Fo) / (n * n);
      return 1 - 6 / (Math.PI * Math.PI) * s;
    }
    if (m === 0) {
      if (Fo < 0.05) return 2 * Math.sqrt(Fo / Math.PI);
      for (n = 0; n <= 60; n++) { var q = (2 * n + 1) * Math.PI; s += 8 / (q * q) * Math.exp(-q * q * Fo / 4); }
      return 1 - s;
    }
    if (Fo < 1e-3) return 4 * Math.sqrt(Fo / Math.PI) - Fo - Math.pow(Fo, 1.5) / (3 * Math.sqrt(Math.PI));
    var NN = Math.max(60, nTerms(Fo));
    for (n = 1; n <= NN; n++) { var bb = j0zero(n); s += 4 / (bb * bb) * Math.exp(-bb * bb * Fo); }
    return 1 - s;
  }
  /* fractional approach to the surface value at r* = r/R */
  function uptakeProfile(geom, rs, Fo) {
    var m = geomIndex(geom), s = 0, n, NN = nTerms(Fo);
    if (Fo <= 0) return rs >= 1 ? 1 : 0;
    if (m === 2) {
      if (rs < 1e-9) { for (n = 1; n <= NN; n++) s += Math.pow(-1, n) * Math.exp(-n * n * Math.PI * Math.PI * Fo); return 1 + 2 * s; }
      for (n = 1; n <= NN; n++) s += Math.pow(-1, n) / n * Math.sin(n * Math.PI * rs) * Math.exp(-n * n * Math.PI * Math.PI * Fo);
      return 1 + 2 / (Math.PI * rs) * s;
    }
    if (m === 0) {
      for (n = 0; n <= NN; n++) {
        var q = (2 * n + 1) * Math.PI / 2;
        s += Math.pow(-1, n) / (2 * n + 1) * Math.exp(-q * q * Fo) * Math.cos(q * rs);
      }
      return 1 - 4 / Math.PI * s;
    }
    for (n = 1; n <= Math.min(NN, 400); n++) {
      var b = j0zero(n);
      s += besselJ(0, b * rs) / (b * besselJ(1, b)) * Math.exp(-b * b * Fo);
    }
    return 1 - 2 * s;
  }
  var eigenCache = {};
  function sphereEigen(Bi, n) {
    var key = Bi + ':' + n;
    if (eigenCache[key]) return eigenCache[key];
    var f = function (l) { return l * Math.cos(l) + (Bi - 1) * Math.sin(l); };
    var lo = (n - 1) * Math.PI + 1e-9, hi = n * Math.PI - 1e-12;
    if (n === 1) lo = 1e-9;
    var flo = f(lo);
    for (var it = 0; it < 200; it++) {
      var mid = 0.5 * (lo + hi), fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (eigenCache[key] = 0.5 * (lo + hi));
  }
  /* θ = (T − T∞)/(T0 − T∞) for a sphere with convective surface */
  function sphereConvective(Bi, Fo, rs) {
    var NN = Math.max(40, nTerms(Fo)), s = 0;
    for (var n = 1; n <= NN; n++) {
      var l = sphereEigen(Bi, n);
      var C = 4 * (Math.sin(l) - l * Math.cos(l)) / (2 * l - Math.sin(2 * l));
      var sh = rs < 1e-9 ? 1 : Math.sin(l * rs) / (l * rs);
      s += C * Math.exp(-l * l * Fo) * sh;
    }
    return s;
  }

  /* ---------------------------------------------------------------------------
     2.7 UTILITIES
     --------------------------------------------------------------------------- */
  function moistureFromMass(mm, m0, X0) { return (mm / m0) * (1 + X0) - 1; }
  function golden(f, a, b, tol) {
    var gr = (Math.sqrt(5) - 1) / 2, c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d);
    for (var i = 0; i < 200 && Math.abs(b - a) > tol; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    }
    return 0.5 * (a + b);
  }
  /* data: [{t (s), X}] — fits D (and plateau X∞) with the sphere series */
  function fitSoaking(data, R, X0, geom, fixPlateau) {
    geom = geom || 'sphere';
    var pts = data.filter(function (d) { return d.t > 0 && isFinite(d.X); });
    if (pts.length < 2) return null;
    function plateauFor(D) {
      if (fixPlateau !== undefined) return fixPlateau;
      var num = 0, den = 0;
      pts.forEach(function (d) { var F = uptakeFraction(geom, D * d.t / (R * R)); num += F * (d.X - X0); den += F * F; });
      return X0 + (den > 0 ? num / den : 0);
    }
    function sse(lgD) {
      var D = Math.pow(10, lgD), Xp = plateauFor(D), e = 0;
      pts.forEach(function (d) { var r = X0 + (Xp - X0) * uptakeFraction(geom, D * d.t / (R * R)) - d.X; e += r * r; });
      return e;
    }
    var lg = golden(sse, -14, -8, 1e-6), D = Math.pow(10, lg);
    return { D: D, Xinf: plateauFor(D), rms: Math.sqrt(sse(lg) / pts.length), n: pts.length };
  }

  /* ---------------------------------------------------------------------------
     2.8 SCENARIOS (science file §7)
     --------------------------------------------------------------------------- */
  var SCENARIOS = [
    { id: 'base',    name: 'Base: medium, unsoaked, sea level', grain: 'medium', geom: 'sphere', place: 'sea', presoak: 0, brown: false },
    { id: 'soak30',  name: 'Presoak 30 min',                    grain: 'medium', geom: 'sphere', place: 'sea', presoak: 1800, brown: false },
    { id: 'soak120', name: 'Presoak 2 h',                       grain: 'medium', geom: 'sphere', place: 'sea', presoak: 7200, brown: false },
    { id: 'long',    name: 'Long slender grain',                grain: 'long',   geom: 'sphere', place: 'sea', presoak: 0, brown: false },
    { id: 'short',   name: 'Short bold grain',                  grain: 'short',  geom: 'sphere', place: 'sea', presoak: 0, brown: false },
    { id: 'alt3000', name: '3000 m altitude',                   grain: 'medium', geom: 'sphere', place: 'alt3000', presoak: 0, brown: false },
    { id: 'cooker',  name: 'Pressure cooker',                   grain: 'medium', geom: 'sphere', place: 'cooker', presoak: 0, brown: false },
    { id: 'brown',   name: 'Brown rice (D × 0.58)',             grain: 'medium', geom: 'sphere', place: 'sea', presoak: 0, brown: true },
    { id: 'cyl',     name: 'Same grain as cylinder (R = 2V/S)', grain: 'medium', geom: 'cylinder', place: 'sea', presoak: 0, brown: false }
  ];
  function runScenario(sc, opts) {
    opts = opts || {};
    var p = withParams(opts.p);
    var Tb = placeBoilingPoint(sc.place);
    var Df = sc.brown ? p.brownFactor : 1;
    var R = equivalentSize(sc.grain, sc.geom);
    var run = runGrain({
      grain: sc.grain, geom: sc.geom, level: opts.level || 4, TC: Tb, T0: 25, mode: 'cook', Dfactor: Df,
      presoak: sc.presoak ? { time: sc.presoak, TC: 25 } : null, duration: opts.duration || 2400,
      outputs: { n: opts.n || 240 }, p: opts.p, profiles: opts.profiles === true, N: opts.N, dtMax: opts.dtMax
    });
    var alpha = grainAlpha(p.X0, p);
    return {
      sc: sc, Tb: Tb, R: R, run: run, tCoreGel: run.events.tCoreGel, tHeat: run.events.tCentreWithin1K,
      tHeat99: run.events.tCentre99, naiveHeat: R * R / alpha, naiveWater: R * R / DgelAt(Tb, p, Df), alpha: alpha
    };
  }

  var API = {
    PARAMS: PARAMS, defaults: defaults, withParams: withParams, clamp: clamp, smoothstep: smoothstep,
    psat: psat, boilingPoint: boilingPoint, boilingPointCC: boilingPointCC, hfg: hfg, pressureAtAltitude: pressureAtAltitude,
    vapourDensity: vapourDensity, waterRho: waterRho, waterMu: waterMu, waterK: waterK, hSphereNatural: hSphereNatural,
    GEOM: GEOM, GEOM_NAMES: GEOM_NAMES, GM: GM, geomIndex: geomIndex, volTo: volTo, areaAt: areaAt, radiusOfVol: radiusOfVol,
    ellipsoid: ellipsoid, equivalentSize: equivalentSize, GRAIN_PRESETS: GRAIN_PRESETS,
    LEVELS: LEVELS, levelFlags: levelFlags, specVol: specVol, arrhenius: arrhenius, diffusivity: diffusivity,
    gelRate: gelRate, cellK: cellK, grainAlpha: grainAlpha, DgelAt: DgelAt,
    makeGrain: makeGrain, cloneGrain: cloneGrain, stepGrain: stepGrain, grainSummary: grainSummary, grainProfile: grainProfile,
    grainWater: grainWater, grainEnergy: grainEnergy, frontRadius: frontRadius, runGrain: runGrain, outputTimes: outputTimes,
    crossingTime: crossingTime, interp: interp,
    PLACES: PLACES, placePressure: placePressure, placeBoilingPoint: placeBoilingPoint, runPot: runPot,
    j0zero: j0zero, besselJ: besselJ, uptakeFraction: uptakeFraction, uptakeProfile: uptakeProfile,
    sphereEigen: sphereEigen, sphereConvective: sphereConvective, sphereShortTime: sphereShortTime,
    moistureFromMass: moistureFromMass, fitSoaking: fitSoaking, golden: golden,
    SCENARIOS: SCENARIOS, runScenario: runScenario
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.RicePhysics = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
