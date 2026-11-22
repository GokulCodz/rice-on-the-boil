#!/usr/bin/env python3
"""
Rice on the Boil — independent analytical cross-check (Python, standard library only).

Recomputes classical results with code written separately from the JavaScript model and
compares them with the CSV tables in Results/ (regenerate those first: sh Code/make_results.sh).

  1. Boiling points (Antoine, two coefficient sets) and the standard atmosphere
  2. Equivalent-sphere radius of the medium grain (Knud Thomsen ellipsoid area)
  3. Lewis number from the mixture properties
  4. Sphere with convective surface (Carslaw & Jaeger) vs Results/fig02_grain_T_profiles.csv
  5. Crank uptake series, sphere / cylinder / slab vs Results/fig08_uptake_fv_vs_series.csv
  6. Water and energy closure of the pot + rice run, Results/fig06_pot_water_partition.csv
  7. Pot temperature never exceeds T_b, Results/fig01_pot_temperature.csv
  8. Grid-convergence order, Results/fig09_grid_convergence.csv
  9. Heat-vs-water ratio and thermal-estimate factor, Results/key_results.csv, fig07_scenarios.csv

Run:  python3 -I Code/analytical_check.py
"""
import csv
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, '..', 'Results')

# ---- parameters (science file) -------------------------------------------------
RHO_W, C_W, K_W = 1000.0, 4180.0, 0.60
RHO_S, C_S, K_S = 1500.0, 1600.0, 0.25
X0, XNAT, XGEL = 0.14, 0.40, 2.6
D_GEL_REF, T_REF, EA_D, R_GAS = 2.8e-10, 95.0, 32500.0, 8.314
H = 1500.0

results = []


def record(name, ok, detail):
    results.append((name, bool(ok), detail))


def read_csv(name):
    path = os.path.join(RES, name)
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


# ---- 1. boiling points -------------------------------------------------------------
def antoine_T(p_pa):
    mmhg = p_pa / 133.322368
    lg = math.log10(mmhg)
    T = 1730.63 / (8.07131 - lg) - 233.426
    if T > 100:
        T = 1810.94 / (8.14019 - lg) - 244.485
    return T


def p_alt(z):
    return 101325.0 * (1 - 2.25577e-5 * z) ** 5.25588


# ---- 2. ellipsoid ---------------------------------------------------------------
def eq_sphere_R(L, B, T):
    a, b, c = L / 2e3, B / 2e3, T / 2e3
    p = 1.6075
    V = 4.0 / 3.0 * math.pi * a * b * c
    S = 4 * math.pi * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p)
    return 3 * V / S


# ---- 3. properties --------------------------------------------------------------
def k_mix(X):
    phi = (X / RHO_W) / (1 / RHO_S + X / RHO_W)
    return phi * K_W + (1 - phi) * K_S


def alpha(X):
    return k_mix(X) * (1 / RHO_S + X / RHO_W) / (C_S + X * C_W)


def D_gel(TC):
    return D_GEL_REF * math.exp(-EA_D / R_GAS * (1 / (TC + 273.15) - 1 / (T_REF + 273.15)))


# ---- 4. sphere with convective surface -------------------------------------------
def sphere_roots(Bi, n):
    f = lambda l: l * math.cos(l) + (Bi - 1) * math.sin(l)
    roots = []
    for k in range(1, n + 1):
        lo, hi = (k - 1) * math.pi + 1e-10, k * math.pi - 1e-12
        flo = f(lo)
        for _ in range(100):
            mid = 0.5 * (lo + hi)
            fm = f(mid)
            if (fm > 0) == (flo > 0):
                lo, flo = mid, fm
            else:
                hi = mid
        roots.append(0.5 * (lo + hi))
    return roots


def theta_sphere(Bi, Fo, rs, roots):
    s = 0.0
    for l in roots:
        C = 4 * (math.sin(l) - l * math.cos(l)) / (2 * l - math.sin(2 * l))
        sh = 1.0 if rs < 1e-12 else math.sin(l * rs) / (l * rs)
        s += C * math.exp(-l * l * Fo) * sh
    return s


# ---- 5. Crank uptake series -------------------------------------------------------
def j0(x):
    # power series for small x, Hankel asymptotic expansion for large x
    if abs(x) < 12:
        s, term, k = 0.0, 1.0, 0
        while True:
            if k > 0:
                term *= -(x * x / 4) / (k * k)
            s += term
            k += 1
            if abs(term) < 1e-17 and k > 5:
                return s
    w = x - math.pi / 4
    P = 1 - 9 / (128 * x * x) + 3675 / (32768 * x ** 4)
    Q = -1 / (8 * x) + 75 / (1024 * x ** 3)
    return math.sqrt(2 / (math.pi * x)) * (P * math.cos(w) - Q * math.sin(w))


def j0_zeros(n):
    z = []
    for k in range(1, n + 1):
        guess = (k - 0.25) * math.pi
        lo, hi = guess - 0.6, guess + 0.6
        flo = j0(lo)
        for _ in range(80):
            mid = 0.5 * (lo + hi)
            fm = j0(mid)
            if (fm > 0) == (flo > 0):
                lo, flo = mid, fm
            else:
                hi = mid
        z.append(0.5 * (lo + hi))
    return z


J0Z = j0_zeros(400)


def uptake(geom, Fo):
    if geom == 'sphere':
        n_max = max(60, int(math.sqrt(46 / (math.pi ** 2 * Fo))) + 10)
        return 1 - 6 / math.pi ** 2 * sum(math.exp(-n * n * math.pi ** 2 * Fo) / (n * n) for n in range(1, n_max))
    if geom == 'slab':
        n_max = max(60, int(math.sqrt(46 / (math.pi ** 2 * Fo))) + 10)
        return 1 - sum(8 / ((2 * n + 1) ** 2 * math.pi ** 2) * math.exp(-(2 * n + 1) ** 2 * math.pi ** 2 * Fo / 4) for n in range(n_max))
    return 1 - sum(4 / b ** 2 * math.exp(-b * b * Fo) for b in J0Z)


def main():
    if not os.path.isdir(RES):
        print('Results/ not found — run  sh Code/make_results.sh  first')
        return 2
    key = {r['quantity']: float(r['value']) for r in read_csv('key_results.csv') if r['value'] not in ('', None)}

    # 1
    for name, z, gauge, want, tol in [('Sea level, lid on', 0, 0, 100.0, 0.05), ('3000 m, lid on', 3000, 0, 90.0, 0.5),
                                      ('Pressure cooker', 0, 1e5, 120.5, 1.0)]:
        Tb = antoine_T(p_alt(z) + gauge)
        model = key['Boiling point: ' + name]
        record('Boiling point ' + name, abs(Tb - model) < 1e-6 and abs(Tb - want) <= tol,
               'python %.4f °C, model %.4f °C (science file %.1f)' % (Tb, model, want))
    # 2
    R = eq_sphere_R(5.5, 2.2, 1.7)
    record('Equivalent sphere radius (medium)', abs(R - key['Equivalent sphere radius (medium)']) / R < 1e-12,
           'python %.6f mm, model %.6f mm' % (R * 1e3, key['Equivalent sphere radius (medium)'] * 1e3))
    # 3
    Le = alpha(X0) / D_gel(100)
    record('Lewis number', abs(Le - key['Lewis number Le = alpha/D_gel(100 C)']) / Le < 1e-10 and 300 < Le < 400,
           'python Le = %.2f, model %.2f (science file ≈ 355)' % (Le, key['Lewis number Le = alpha/D_gel(100 C)']))
    # 4
    rows = read_csv('fig02_grain_T_profiles.csv')
    Bi = float(rows[0]['Bi'])
    Bi_py = H * R / k_mix(X0)
    roots = sphere_roots(Bi, 80)
    e_model = e_series = 0.0
    for r in rows:
        th = theta_sphere(Bi, float(r['Fo']), float(r['r_over_R']), roots)
        T_py = 100 - 75 * th
        e_model = max(e_model, abs(float(r['T_model_C']) - T_py) / 75)
        e_series = max(e_series, abs(float(r['T_series_C']) - T_py))
    record('Heat: Bi from properties', abs(Bi - Bi_py) / Bi_py < 1e-10, 'Bi = %.4f' % Bi_py)
    record('Heat: model vs Carslaw–Jaeger (python)', e_model < 0.01, 'max |Δθ| = %.2e over %d points' % (e_model, len(rows)))
    record('Heat: JS series vs python series', e_series < 1e-6, 'max |ΔT| = %.2e K' % e_series)
    # 5
    rows = read_csv('fig08_uptake_fv_vs_series.csv')
    for g in ('sphere', 'cylinder', 'slab'):
        e_m = e_s = 0.0
        for r in (q for q in rows if q['geometry'] == g):
            Fo = float(r['Fo'])
            F = uptake(g, Fo)
            e_m = max(e_m, abs(float(r['F_model']) - F))
            e_s = max(e_s, abs(float(r['F_series']) - F))
        record('Uptake %s: model vs Crank (python)' % g, e_m < 0.005, 'max |Δ| = %.2e' % e_m)
        record('Uptake %s: JS series vs python series' % g, e_s < 2e-5, 'max |Δ| = %.2e' % e_s)
    # 6
    rows = read_csv('fig06_pot_water_partition.csv')
    w = max(abs(float(r['free_water_kg']) + float(r['absorbed_kg']) + float(r['steam_kg']) - 0.4) for r in rows)
    e = max(abs(float(r['sensible_J']) + float(r['toGrains_J']) + float(r['steam_enthalpy_J']) + float(r['loss_J']) - float(r['Pin_J']))
            / max(float(r['Pin_J']), 1.0) for r in rows)
    record('Pot + rice: water closure from CSV columns', w < 1e-9, 'max |free + grains + steam − 0.4 kg| = %.1e kg' % w)
    record('Pot + rice: energy closure from CSV columns', e < 1e-9, 'max relative residual = %.1e' % e)
    # 7
    rows = read_csv('fig01_pot_temperature.csv')
    over = max(float(r['T_C']) - float(r['Tb_C']) for r in rows)
    record('Pot temperature never exceeds T_b', over < 1e-9, 'max (T − T_b) = %.2e K' % over)
    # 8
    rows = read_csv('fig09_grid_convergence.csv')
    Ns = [float(r['N_shells']) for r in rows]
    es = [float(r['max_abs_error']) for r in rows]
    order = math.log(es[0] / es[-1]) / math.log(Ns[-1] / Ns[0])
    record('Grid convergence order', 1.5 <= order <= 2.5, 'observed order %.2f' % order)
    # 9
    ratio = key['Ratio water50 / heat99']
    record('Water is slower than heat by > 100×', ratio > 100, 'water-50 %% / heat-99 %% at the centre = %.0f' % ratio)
    rows = read_csv('fig07_scenarios.csv')
    fac = [float(r['too_short_factor']) for r in rows]
    tmin = min(float(r['t_core_min']) for r in rows)
    tmax = max(float(r['t_core_min']) for r in rows)
    record('R²/α underestimates every scenario by ≥ 10×', min(fac) >= 10,
           'factor %.0f–%.0f; model core times %.1f–%.1f min' % (min(fac), max(fac), tmin, tmax))

    w1 = max(len(r[0]) for r in results)
    print('Rice on the Boil — independent analytical cross-checks (python %s)' % sys.version.split()[0])
    for name, ok, detail in results:
        print('  %-6s %-*s  %s' % ('PASS' if ok else 'FAIL', w1, name, detail))
    nfail = sum(1 for r in results if not r[1])
    print()
    if nfail == 0:
        print('ALL CROSS-CHECKS PASSED (%d)' % len(results))
        return 0
    print('%d OF %d CROSS-CHECKS FAILED' % (nfail, len(results)))
    return 1


if __name__ == '__main__':
    sys.exit(main())
