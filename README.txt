RICE ON THE BOIL - Heat and water transport in cooking rice
MS2280 Transport Phenomena in Materials Processing - Project choice 19
=====================================================================

Group members (fill in):
  1. Name ____________________  Roll number ____________
  2. Name ____________________  Roll number ____________
  3. Name ____________________  Roll number ____________


1. WHAT IS IN THIS FOLDER
-------------------------
Model/index.html        The interactive learning tool (open it in a browser). Seven guided stages.
Model/physics.js        The physics engine: every number on the page is calculated here.
Model/plots.js          Figure builder used both by the page and by the results script.
Code/checks.html        Independent verification suite - open in a browser, runs in ~1 s.
Code/checks.js          The same checks for the command line (macOS JavaScriptCore).
Code/make_results.sh    Regenerates every figure and table in Results/ (macOS).
Code/make_results.js    The script that make_results.sh runs.
Code/analytical_check.py  Second-language cross-check (Python standard library only).
Results/fig*.svg        Labelled figures for the report (open in any browser; insert into Word as SVG).
Results/*.csv           Data behind every figure and every check.
README.txt              This file.

Still to be added by the group: Report.pdf + editable source, Video.mp4 (45 min),
Video_Transcript.pdf, AI_Chats.pdf, AI_Declaration.pdf (signed), any kitchen
recordings/photos (see section 7).


2. HOW TO OPEN THE MODEL (no installation, no internet)
-------------------------------------------------------
Double-click Model/index.html (Chrome, Edge, Firefox or Safari). Keep the Model/
folder together: index.html loads physics.js and plots.js from the same folder.

  * The timeline at the top moves between the seven stages:
      1 Heat the pot   2 Into the grain   3 Soak   4 The race
      5 Cook a grain   6 The whole pot    7 Verdict
  * Each stage: "Predict first" card -> animated stage (press play, drag the time
    scrubber) -> live readouts -> "What this shows" -> lab bench (presets, sliders,
    model ladder) -> tabs: Plots | Balances & checks | Equations & assumptions |
    Definitions & units | Questions, notes & trials.
  * Every plot has SVG / PNG / CSV export buttons (for the report).
  * "Notebook" (top right) exports predictions, notes, recorded trials and any
    kitchen data as a text file.
  * Useful links for the video: Model/index.html?theme=light#cook opens stage 5 in
    the light theme (keys: pot, conduct, soak, race, cook, pot2, verdict).
  * Labels on every scene say what is CALCULATED, ILLUSTRATIVE or OBSERVED.


3. HOW TO REPRODUCE THE RESULTS AND CHECKS
------------------------------------------
Any computer:  open Code/checks.html in a browser -> 33 checks run (expected: all
               PASS or INFO, 0 FAIL). CSV tables can be downloaded from that page.

macOS terminal, from this folder:
   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc Model/physics.js Code/checks.js
       -> prints the 33 checks
   sh Code/make_results.sh
       -> rewrites Results/ (16 figures, 14 tables) in about 1 s
   python3 -I Code/analytical_check.py
       -> independent series solutions in Python; expected "ALL CROSS-CHECKS PASSED"

Software: a web browser. Optional: macOS (built-in JavaScriptCore), Python 3.
No packages, no internet. Code used: JavaScript (model, checks), Python (cross-check).


4. THE MODEL IN ONE PAGE
------------------------
Control volumes
  A  free liquid water in the pot (+ vessel), lumped temperature, boiling cap T <= T_b(p)
  B  each rice grain: a control volume whose boundary MOVES (it swells)
  Steam leaves A through the free surface.

Grain (1D radial finite volumes that follow the dry solid; sphere/cylinder/slab
with the grain's volume-to-surface ratio):
  water   d(rho_d X)/dt = -div j,  j = -rho_d D grad X   (flux relative to the solid;
          follows from the slides' j_A = -rho D grad w_A with w = X/(1+X))
  energy  conduction + enthalpy carried by water - gelatinization enthalpy
  starch  dG/dt = k_g(T) f(X) (1 - G)   (needs T > ~68 C AND enough water)
  surface X = X_nat + G_s (X_gel - X_nat);  -k dT/dr = h (T - T_water)
  swelling shell volume = m_s (1/rho_s + X/rho_w)   (volume additivity)
  D = [D_nat(1-G) + D_gel G] exp[-Ea/R (1/T - 1/T_ref)]
Pot: d/dt[(M c_w + C_v)T] = P - UA(T - T_amb) - N(Q_g + m_g c_w T) - m_ev(c_w T + h_fg)
Model ladder (stage 5): L1 textbook Fick -> L2 + starch state -> L3 + swelling -> L4 + D(T).

Main parameters and sources (all listed with units in the page, tab "Definitions & units")
  D_nat = 3.6e-10, D_gel = 2.8e-10 m2/s   Briffaz et al. (2014) J. Food Eng. 121:143-151
  Ea = 32.5 kJ/mol                        Bello et al. (rice soaking, swelling sphere)
  brown rice D x 0.58                     Briffaz et al. (2014) J. Food Eng. 141:99-106
  k, c of solid                           Choi & Okos (1986) composition model
  X0 = 0.14, X_nat = 0.40, X_gel = 2.6 kg/kg dry basis; T_on = 68 C;
  k_g = 0.05 1/s at 95 C, E_g = 120 kJ/mol; f(X) ramps 0.30 -> 0.80
                                          illustrative, inside ranges of Lund (1984), Donovan (1979)
  Boiling point: Antoine equation + standard atmosphere; latent heat: Watson correlation.
The model is NOT fitted to cooking-time data.


5. KEY RESULTS (all reproducible with section 3)
------------------------------------------------
  * Heat is fast: a medium grain's centre is within 1 K of boiling water after 8.6 s
    (R^2/alpha = 11.8 s; Bi = h R / k = 5.6 with h = 1500 W/m2K, so a lumped model is not valid).
  * Water is slow: Lewis number alpha/D ~ 355; the centre water front needs minutes.
  * Soaking at 25 C: mean X = 0.354 kg/kg after 2 h (26 % wet basis); time scales with R^2
    (curves for three grain sizes collapse when plotted against Fo = Dt/R^2).
  * Cooking (L4, medium grain, unsoaked, 100 C): core gelatinized (G >= 0.9) after 10.0 min;
    radius grows to 1.53 R0 (volume x 3.6); mean moisture ~ 2.2-2.5 kg/kg (69-72 % wb).
  * Which assumption matters (core time): L1 6.2 min, L2 6.4, L3 11.3 (swelling!), L4 10.0.
  * No universal cooking time: 5.0 min (pressure cooker, 120 C) to 16.2 min (brown rice);
    3000 m (90 C) 14.8; short bold 13.3; long slender 8.4; presoak 30 min 9.2, 2 h 7.5;
    same grain as a cylinder 7.1. R^2/alpha is 18-180 x too short.
  * Absorption method (200 g rice, 400 g water, lid on, 300 W simmer): 371 g ends up in the
    rice, 29 g as steam; core done at 11.7 min, free water gone at 32.1 min.

Independent checks (Code/checks.html, 33 checks, 0 failures):
  A  model vs exact series: heat (convective sphere) and water uptake (sphere, cylinder,
     slab) agree within 0.0012; early-time sqrt(t) law; grid convergence order 1.8.
  B  water, energy, dry solid and volume conserved to 1e-13 relative or better,
     for one grain and for the whole pot.
  C  limits: Bi -> infinity, Bi -> 0 (lumped), boiling points 100.0 / 90.0 / 120.5 C,
     equilibrium stays at equilibrium, D = 0 gives no uptake.
  D  scaling: constant-D time ~ R^2.00; Peclet number of water-carried enthalpy 0.04
     (conduction dominates); gelatinization enthalpy ~1 % of energy absorbed;
     halving grid and time step changes the core time by 0.1 %.
  E  sources: D(45 C) = 6.8e-11 vs ~8.8e-11 m2/s reported for white rice soaking;
     core time 10 min vs ~15 min glass-plate cooking times (same order, not fitted).


6. LIMITATIONS AND HONEST DISCREPANCIES (discuss in the report)
---------------------------------------------------------------
  * 1D equivalent geometry; sphere vs cylinder for the same grain differ by ~30 %.
  * Model core time (~10 min) is shorter than typical glass-plate cooking times (~15 min).
  * Presoaking shortens the model's core time less than several studies report
    (e.g. 30 min soak: -8 % here). Candidate reasons, testable in stage 5: soaking cracks,
    D rising with moisture (slider b), or a lower water need for the core to turn translucent.
  * Not modelled: cracks/fissures, leaching of amylose, further slow uptake after cooking,
    grain-to-grain spread, pot stratification and hot-base contact, retrogradation.
  * Illustrative parameters (T_on, k_g, E_g, X_gel, f(X) limits, h, UA, k_m) are within
    published ranges but not measured for one variety.


7. OPTIONAL KITCHEN CHECK (OBSERVED data; panels are inside stages 3 and 5)
--------------------------------------------------------------------------
  Soaking: weigh ~20 g raw rice; soak; at 5, 10, 15, 20, 30, 45, 60, 90, 120 min drain,
  blot 30 s, weigh, return. Enter (time, mass) in stage 3 -> X = (m/m0)(1+X0) - 1 is
  plotted on the model curve; "Fit D to my data" compares your D with the model/literature.
  Cooking (glass-plate, ISO 14864): every 2 min press 10 grains between glass plates and
  count white cores; enter % in stage 5; compare the 10 % time with the model.
  Keep raw photos/videos and a table of readings in Results/ (label them OBSERVED).


8. SUGGESTED VIDEO PLAN (45 min, ~15 min each)
----------------------------------------------
  Member 1 (heat): stage 1 (temperature vs stored energy vs heat rate; boiling cap,
    altitude, pressure cooker), stage 2 (Biot number, lumped vs spatial, series check),
    stage 4 first half (why heat is not the slow step).
  Member 2 (water): stage 3 (Fick, sqrt(t), R^2 scaling, two control volumes), stage 4
    second half (Le, where the analogy fails), kitchen soaking check, Code/checks.html.
  Member 3 (cooking): stage 5 (gelatinization, swelling, moving boundary, model ladder),
    stage 6 (water and energy ledgers, absorption method), stage 7 (no universal time),
    limitations.


9. AI USE (for the group's AI declaration)
------------------------------------------
The code, figures and this README were produced with the help of an AI assistant
(Claude, Anthropic) on 17 Nov 2026, working from the course slides and the project
brief. Every result was checked by the independent checks listed above (analytical
solutions, conservation residuals, limiting cases, second-language cross-check) and
the parameter values were traced to the cited sources. The group must still include
the full chat transcripts (AI_Chats.pdf) and a signed declaration, and should verify
the cited papers themselves before submission.
