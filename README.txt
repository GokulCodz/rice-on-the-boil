RICE ON THE BOIL — heat and water transport when rice is soaked, heated and cooked
==================================================================================
MS2280 Transport Phenomena in Materials Processing — project files

Group:   [Name 1, roll no.]   [Name 2, roll no.]   [Name 3, roll no.]
Date:    [submission date]

One idea behind everything: cooking rice is two transport problems at once — heat
into the grain and water into the grain. Heat is ~355× faster (Lewis number), so
WATER transport sets the cooking time, and that time depends on size, shape,
soaking, boiling point, rice type and the definition of "cooked". There is no
universal cooking time.


1. FILE MAP
-----------
index.html                  Redirect to Model/index.html (for GitHub Pages / double-click).
Model/index.html            The interactive learning tool (7 stages). HTML + CSS + UI JavaScript.
                            Works offline from file://; no libraries, no CDN, no network.
Model/physics.js            Physics engine (pure JS, no DOM). All equations and parameters.
                            PARAMS lists every parameter with value, unit and source sentence.
Model/plots.js              SVG figure builder (pure JS, no DOM): line/stacked/bar plots,
                            colour maps, grain cross-section drawing.
Code/checks.js              Verification suite: 33 checks in groups A–E (see §5).
Code/checks.html            Runs checks.js in a browser: PASS/FAIL table + CSV downloads.
Code/make_results.js        Regenerates every figure and table in Results/.
Code/make_results.sh        Shell wrapper: runs make_results.js under macOS JavaScriptCore
                            (jsc) and splits the output on "@@FILE name" markers with awk.
Code/analytical_check.py    Independent Python (standard library only) series solutions,
                            compared with the CSV tables in Results/ (20 cross-checks).
Code/ui_selftest.js         Automated click-through of the page (loaded only with
                            Model/index.html?selftest=1); used for the headless browser test.
Results/                    fig01…fig09 (SVG) + a CSV for every figure, every check
                            (check_A1.csv … check_E5.csv, checks_summary.csv) and
                            key_results.csv (all headline numbers).
README.txt                  This file.

Every figure and scene is labelled CALCULATED (computed by physics.js), ILLUSTRATIVE
(drawing/animation that only conveys an idea) or OBSERVED (your own kitchen data).


2. HOW TO OPEN
--------------
Double-click Model/index.html (or the root index.html). Any current browser works
(Chrome, Edge, Firefox, Safari). Nothing is downloaded; everything runs locally.

  - Seven stages across the top: 1 Heat the pot · 2 Into the grain · 3 Soak ·
    4 The race · 5 Cook a grain · 6 The whole pot · 7 Verdict.
    The URL hash selects a stage, e.g. Model/index.html#cook.
  - Each stage: "Predict first" → animated scene + Lab bench controls → 8 result tiles →
    "What this shows" → Laws, equations & theorems → tabs (Plots, Balances & checks,
    Model details & assumptions, Definitions & units with the PARAMS table,
    Questions, notes & trials).
  - Playback bar: play/pause (space bar), restart, scrubber with event markers, speed.
    Speed is real model time: 1× = 1 model second per real second, 4× = 4 model
    seconds per real second, up to 1800×. Each stage starts at a sensible speed
    (e.g. 1× for heat conduction, 60× for the pot, 600× for soaking).
  - Plots: hover for values; export each plot as SVG, PNG or CSV.
  - Notebook (top bar): notes, predictions, trials and kitchen data are kept in this
    browser (localStorage) and can be exported as a .txt file.
  - Theme button, or ?theme=light / ?theme=dark in the URL.
  - Checks button → Code/checks.html.


3. HOW TO REPRODUCE
-------------------
(a) In a browser:   open Code/checks.html → 33 checks, expected 31 PASS, 2 INFO, 0 FAIL.

(b) Terminal, macOS JavaScriptCore (ships with macOS; no install):
      JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
      $JSC Model/physics.js Code/checks.js                 # prints the check table
      $JSC Model/physics.js Code/checks.js -- --bundle     # prints the check CSVs
      sh Code/make_results.sh                              # regenerates Results/ (≈ 1 s)

(c) Independent Python cross-check (standard library only, after (b)):
      python3 -I Code/analytical_check.py                  # expect: ALL CROSS-CHECKS PASSED (20)

(d) Headless browser click-through of all 7 stages (optional; Chrome):
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
        --virtual-time-budget=400000 --dump-dom "file://$PWD/Model/index.html?selftest=1" \
        | grep -o 'SELFTEST [A-Z]*: [0-9]* checks, [0-9]* failed'
    Expected: SELFTEST PASS (≈ 2260 checks, 0 failed). It presses every preset, every
    control option, the model ladder, play, scrubber, tabs, plot hover, kitchen panels,
    predictions, trials and the notebook, and fails on any JS error or NaN.
    Model/index.html?selftest=layout reports any element wider than the viewport
    (used to check the 390 px phone layout).


4. MODEL SUMMARY (science file stages 1–7)
------------------------------------------
Every equation is one conservation statement, d/dt∫C dV = −∮J·n dA + ∫S dV, plus a
transport law (Fourier for heat, Fick for water). SI units; moisture X on a dry basis.

Stage 1  Heat the pot. Lumped energy and mass balance of water + pot;
         T ≤ T_b(p) from Antoine (two coefficient sets) and the standard atmosphere;
         Watson h_fg; Newton losses UA(T − T_amb); sub-boiling evaporation by the
         heat–mass analogy. The boil-off is solved each step so energy closes exactly.
Stage 2  Into the grain. Radial heat equation (sphere/cylinder/slab, equivalent size with
         the grain's V/S) with a convective surface; Bi ≈ 5.6; water uptake off.
Stage 3  Soak. Fick diffusion relative to the solid, j = −ρ_d D ∇X, surface at
         X_nat = 0.40, Arrhenius D(T) (E_a = 32.5 kJ/mol), swelling; bath and grains as
         two control volumes.
Stage 4  The race. One full run; heat vs water at the centre; Le = α/D ≈ 355.
Stage 5  Cook a grain. Finite volumes that follow the dry solid (moving boundary,
         Reynolds transport theorem); swelling by volume additivity; first-order
         gelatinization k_g(T) f(X) (1 − G); energy with water enthalpy and a
         gelatinization sink; surface capacity X_nat + G_s (X_gel − X_nat);
         D(T, G, X). Model ladder L1–L4.
Stage 6  The whole pot. Stage 1 + stage 5 coupled: free water and N identical grains;
         heater off and lid-on rest when the free water is gone.
Stage 7  Verdict. Nine scenarios; criterion G* adjustable; comparison with R²/α and R²/D.

Numerics: 60 radial shells; implicit (backward Euler) water and energy steps with
tridiagonal (Thomas) solves; exact first-order gelatinization update; adaptive time
step Δt = clamp(0.02 t, 2 ms, Δt_max). Water, energy and dry solid are conserved to
round-off (residuals ~1e-13 relative).


5. KEY RESULTS (Results/key_results.csv; science-file value in brackets)
------------------------------------------------------------------------
Boiling point: sea level 100.0 °C · 3000 m 90.0 °C · pressure cooker 120.5 °C   [same]
Medium grain: equivalent sphere R = 1.163 mm, Bi = 5.61, R²/α = 11.8 s           [same]
Heat only: centre within 1 K of boiling water after ≈ 8.4–8.6 s                  [≈ 8.6 s]
Soak 25 °C: ⟨X⟩ = 0.269 at 30 min, 0.354 at 2 h, R/R0 = 1.089 after 3 h         [0.27, 0.354, 1.09]
D(25 °C) = 2.98e-11, D(45 °C) = 6.8e-11 m²/s                                    [same; reported ≈ 8.8e-11]
Le = α/D_gel(100 °C) = 355; water-50 % / heat-99 % at the centre = 161           [≈ 355, ≈ 160]
Model ladder (medium, 100 °C, G_c ≥ 0.9): L1 6.2 · L2 6.4 · L3 11.3 · L4 9.95 min [6.2, 6.4, 11.3, 10.0]
Presoak 30 min → 9.19 min (−8 %); 2 h → 7.53 min                                [9.2]
Cooked grain (25 min): R/R0 = 1.51, volume ×3.5                                 [×1.53, ×3.6]
Whole pot (200 g rice, 400 g water, 1500 W → 300 W, lid on): 371 g into rice,
  29 g steam, centre cooked at 11.7 min, free water gone at 32.1 min             [same]
Scenarios (L4, min): base 9.95 · presoak 30 min 9.19 · presoak 2 h 7.53 ·
  long slender 8.40 · short bold 13.28 · 3000 m 14.76 · pressure cooker 5.00 ·
  brown 16.14 · cylinder 7.11 → 5.0 to 16.1 min; R²/α is too short by 25–82×     [5.0–16.2]

Small differences from the science file: the centre-within-1 K time depends slightly
on the time step (8.4 s with Δt ≤ 0.01 s, 8.5–8.6 s with larger steps); the
Péclet number of water-carried enthalpy computed from the run is ≈ 0.02 (the science
file quotes ≈ 0.04) — both are ≪ 0.1, so the conclusion "conduction dominates" holds.


6. INDEPENDENT CHECKS
---------------------
Code/checks.js (33):  A numerics vs analytical solutions (Carslaw–Jaeger Bi = 1, 10;
  Crank sphere/cylinder/slab; √t law; grid order 1.94) · B exact conservation (grain
  water, energy, dry solid, volume additivity; pot; pot + rice) · C limits (Bi → ∞,
  Bi → 0 lumped, T_b at three pressures, equilibrium stays, D = 0) · D scaling (R²
  exponent 2.000, full-model exponent 1.75 INFO, Le INFO, Péclet, gelatinization
  enthalpy, resolution: halving Δr and Δt changes the core time by 0.15 %) ·
  E published values not used for fitting (D(45 °C), soaking plateau, glass-plate
  range, presoak monotonic, centre heating time).
Code/analytical_check.py (20): series solutions and Antoine written again in Python
  and compared with the Results/ CSVs; water and energy closure recomputed from CSV
  columns.


7. LIMITATIONS (stated honestly)
--------------------------------
- 1D equivalent geometry: sphere vs cylinder of the same grain differ by ≈ 30 %.
- Model core time ≈ 10 min vs ≈ 15 min in glass-plate tests (ISO 14864).
- Presoaking helps less in the model (−8 % for 30 min) than cooks report; missing
  physics: cracks, D rising with moisture (slider b), translucency before full
  gelatinization.
- Not modelled: leaching of solids, further slow uptake, grain-to-grain spread,
  temperature stratification, hot-base contact, retrogradation, condensate dripping
  back from the lid.
- Illustrative parameters (inside published ranges, not measured for one variety):
  T_on, k_g, E_g, X_gel, f(X) limits, h, UA, k_m.
- Lid: in the lumped pot the lid acts through lower UA and k_m. At full power the open
  pot boils off slightly LESS (more heat leaks to the kitchen); the lid saves water
  because it lets a small simmer power hold the boil (open pot at 300 W falls off the
  boil and the rice does not cook — stage 6).


8. OPTIONAL KITCHEN CHECK (OBSERVED data; panels in stages 3 and 5)
-------------------------------------------------------------------
Soaking (stage 3): weigh ≈ 20 g raw rice (m0). Soak in water at room temperature
(note T). At 10, 20, 30, 60, 90, 120 min: drain, blot on a towel for 30 s, weigh (m),
return to the water. Enter t and m; the page computes X = (m/m0)(1 + X0) − 1, plots
the points over the model and "Fit D" fits D (and the plateau) with the sphere series.
Glass-plate test (stage 5, after ISO 14864): bring water to a rolling boil, add rice.
From 6 min, every minute take 2–3 grains, squash them between two glass plates and
estimate the width of the white core as a % of the grain width. The points appear on
the "core" plot. Record water temperature/altitude, rice variety and whether presoaked.
Safety: boiling water — use tongs/spoon and a heat-proof surface.


9. VIDEO PLAN (3 parts × 15 min; adjust to the brief's limit)
--------------------------------------------------------------
Part 1 — The question and the pot (0–15 min)
  0:00  The brief and the one idea: heat vs water (open the tool, journey stepper).
  2:00  Stage 1: temperature vs energy vs rate; boiling cap; Clausius–Clapeyron;
        lid / simmer / Leh / pressure cooker (presets); energy balance closing.
  8:00  Stage 2: Biot number, centre lag, lumped model fails, but only for seconds.
 13:00  Show checks A1–A2, C1–C2 in Code/checks.html.
Part 2 — Water decides (15–30 min)
  0:00  Stage 3: soaking, √t, Fo collapse, Arrhenius; two control volumes;
        kitchen soaking data and "Fit D".
  6:00  Stage 4: the race on log time; Le ≈ 355; similar form ≠ same physics.
  9:00  Stage 5: gelatinization, swelling, model ladder L1–L4, presoak, brown rice;
        glass-plate comparison; limitations.
Part 3 — The pot and the verdict (30–45 min)
  0:00  Stage 6: where the water goes; too little water; lid off at a simmer.
  6:00  Stage 7: nine scenarios, G* slider, R²/α vs R²/D vs model; answer the brief.
 10:00  Reproducibility: make_results.sh, analytical_check.py, Results/, limitations.
 13:00  AI-use statement and contributions.
Every on-screen visual keeps its CALCULATED / ILLUSTRATIVE / OBSERVED tag.


10. AI-USE NOTE
---------------
The physics engine, verification suite, plotting code, page and this README were
drafted with an AI coding assistant (Anthropic Claude, via Claude Code) from the
group's science file ("Rice on the boil — science brief"), which fixed all equations,
parameter values and sources. The group [describe: reviewed the equations against the
course slides and textbook, ran the checks, chose the parameters, wrote the
explanations / recorded the video …]. All numbers in the page and in Results/ are
reproduced by Code/checks.js (33 checks) and the independent Code/analytical_check.py.
The idea of a guided, stage-by-stage investigation follows the course's continuity
tool; the design and code are original.
