"""
Rice on the Boil - independent analytical cross-check in a second language.

Uses only the Python standard library (no numpy). It re-derives the exact series
solutions that Code/checks.js uses, with its OWN implementations:
  * Bessel J0 from its power series, its zeros by bisection (no lookup table),
  * the convective-sphere eigenvalues by bisection on lambda*cos(lambda) + (Bi-1)*sin(lambda),
and compares them with the finite-volume results written to Results/ by
Code/make_results.sh.

Run from the project folder:   python3 -I Code/analytical_check.py
"""
import csv
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, '..', 'Results')


def j0(x):
    """Bessel function of the first kind, order 0, from its power series (fine for x < 40)."""
    term, total, k = 1.0, 1.0, 0
    while True:
        k += 1
        term *= -(x * x / 4.0) / (k * k)
        total += term
        if abs(term) < 1e-17 * max(1.0, abs(total)) and k > 10:
            return total


def j0_zeros(n):
    zeros, x, step = [], 0.5, 0.05
    prev = j0(x)
    while len(zeros) < n:
        x2 = x + step
        cur = j0(x2)
        if prev * cur < 0:
            a, b = x, x2
            for _ in range(80):
                m = 0.5 * (a + b)
                if j0(a) * j0(m) <= 0:
                    b = m
                else:
                    a = m
            zeros.append(0.5 * (a + b))
        x, prev = x2, cur
    return zeros


BESSEL = j0_zeros(12)


def uptake(geom, fo, terms=400):
    """Fractional uptake M_t/M_inf, constant D, constant surface value (Crank 1975)."""
    if fo <= 0:
        return 0.0
    s = 0.0
    if geom == 'sphere':
        for n in range(1, terms + 1):
            s += math.exp(-n * n * math.pi ** 2 * fo) / (n * n)
        return 1 - 6 / math.pi ** 2 * s
    if geom == 'slab':
        for n in range(terms):
            q = (2 * n + 1) * math.pi / 2
            s += math.exp(-q * q * fo) / (q * q)
        return 1 - 2 * s
    for n in range(1, terms + 1):          # cylinder; McMahon asymptote beyond the computed zeros
        b = BESSEL[n - 1] if n <= len(BESSEL) else (n - 0.25) * math.pi + 1 / (8 * (n - 0.25) * math.pi)
        s += math.exp(-b * b * fo) / (b * b)
    return 1 - 4 * s


def sphere_convective(bi, rstar, fo, terms=120):
    """theta = (T - T_bath)/(T0 - T_bath) for a sphere with a convective surface (Carslaw & Jaeger)."""
    f = lambda x: x * math.cos(x) + (bi - 1) * math.sin(x)
    total = 0.0
    for k in range(1, terms + 1):
        a, b = (k - 1) * math.pi + 1e-9, k * math.pi - 1e-9
        for _ in range(100):
            m = 0.5 * (a + b)
            if f(a) * f(m) <= 0:
                b = m
            else:
                a = m
        lam = 0.5 * (a + b)
        cn = 4 * (math.sin(lam) - lam * math.cos(lam)) / (2 * lam - math.sin(2 * lam))
        shape = 1.0 if rstar < 1e-9 else math.sin(lam * rstar) / (lam * rstar)
        total += cn * math.exp(-lam * lam * fo) * shape
    return total


def read(name):
    path = os.path.join(RESULTS, name)
    if not os.path.exists(path):
        sys.exit(f'Missing {path}. Run "sh Code/make_results.sh" first.')
    with open(path, newline='') as fh:
        return list(csv.DictReader(fh))


def main():
    ok = True
    print('Bessel J0 zeros (computed here):', ', '.join(f'{z:.6f}' for z in BESSEL[:5]))

    rows = read('uptake_fv_vs_series.csv')
    worst_series, worst_fv = 0.0, 0.0
    for r in rows:
        py = uptake(r['geometry'], float(r['Fo']))
        worst_series = max(worst_series, abs(py - float(r['uptake_series'])))
        worst_fv = max(worst_fv, abs(py - float(r['uptake_FV'])))
    print(f'Uptake: Python series vs JavaScript series   max diff = {worst_series:.2e}  (expect < 1e-5)')
    print(f'Uptake: Python series vs finite volume       max diff = {worst_fv:.2e}  (expect < 5e-3)')
    ok &= worst_series < 1e-5 and worst_fv < 5e-3

    rows = read('heat_fv_vs_series.csv')
    worst_series, worst_fv = 0.0, 0.0
    for r in rows:
        py = sphere_convective(float(r['Bi']), float(r['r_over_R']), float(r['Fo']))
        worst_series = max(worst_series, abs(py - float(r['theta_series'])))
        worst_fv = max(worst_fv, abs(py - float(r['theta_FV'])))
    print(f'Heat:   Python series vs JavaScript series   max diff = {worst_series:.2e}  (expect < 1e-5)')
    print(f'Heat:   Python series vs finite volume       max diff = {worst_fv:.2e}  (expect < 1e-2)')
    ok &= worst_series < 1e-5 and worst_fv < 1e-2

    rows = read('size_scaling.csv')
    xs = [math.log(float(r['R_mm'])) for r in rows]
    ys = [math.log(float(r['t_centre_half_L1_s'])) for r in rows]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    print(f'Scaling: centre-uptake time ~ R^n, n = {slope:.3f}  (expect 2.00 for constant-D diffusion)')
    ok &= abs(slope - 2) < 0.03

    rows = read('pot_absorption.csv')
    worst_w = max(abs(float(r['water_residual_kg'])) for r in rows)
    print(f'Pot: largest total-water residual = {worst_w:.2e} kg  (expect < 1e-9)')
    ok &= worst_w < 1e-9

    print('\nALL CROSS-CHECKS PASSED' if ok else '\nSOME CROSS-CHECKS FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
