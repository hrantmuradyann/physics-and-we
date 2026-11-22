"""Draws images/hero-magnet.svg: the logo's horseshoe magnet with its
magnetic field lines, worked out from the physics (not drawn by hand).

Run it again after a change:  python3 docs/hero-magnet.py
It needs only Python 3, no packages.

The model: each pole face is a row of magnetic "charges" (positive on
the north face, negative on the south one). In the plane of the picture a
line charge's field falls off as 1/r, so the field at a point is the sum
of q * (r / |r|^2) over the charges. A field line starts just outside the
north face and follows the field (Runge-Kutta, 4th order) until it reaches
the south face or leaves the picture.
"""
import math

W, H = 560, 430
NAVY = "#304a6b"       # the logo's navy: the magnet, and its south pole
RED = "#d40000"        # the site's red: the north pole, the magnet's right half
LINE = "#8a9db4"       # the field lines: a quiet steel blue

# The magnet, as in the logo: an arch on two legs, S on the left, N on the right.
CX, TOP = 280, 40      # the middle of the arch, its top
R_OUT, R_IN = 110, 42  # the arch's outer and inner radius
ARCH_Y = TOP + R_OUT   # where the arch meets the legs
FOOT = 320             # the bottom of the legs: the pole faces
S_X = (CX - R_OUT, CX - R_IN)   # the south leg, left to right
N_X = (CX + R_IN, CX + R_OUT)   # the north leg

def charges(x0, x1, q, n=15):
    return [(x0 + (x1 - x0) * (i + 0.5) / n, FOOT, q / n) for i in range(n)]

CHARGES = charges(*N_X, +1.0) + charges(*S_X, -1.0)

def field(x, y):
    ex = ey = 0.0
    for cx, cy, q in CHARGES:
        dx, dy = x - cx, y - cy
        r2 = dx * dx + dy * dy + 1e-9
        ex += q * dx / r2
        ey += q * dy / r2
    return ex, ey

def direction(x, y):
    ex, ey = field(x, y)
    m = math.hypot(ex, ey) or 1.0
    return ex / m, ey / m

def reached_south(x, y):
    return S_X[0] - 2 <= x <= S_X[1] + 2 and FOOT - 2 <= y <= FOOT + 4

def inside_magnet(x, y):
    if y >= FOOT:
        return False
    if y >= ARCH_Y:
        return S_X[0] < x < S_X[1] or N_X[0] < x < N_X[1]
    r = math.hypot(x - CX, y - ARCH_Y)
    return R_IN < r < R_OUT

def trace(x, y, step=2.0, limit=6000):
    points = [(x, y)]
    for _ in range(limit):
        k1 = direction(x, y)
        k2 = direction(x + step / 2 * k1[0], y + step / 2 * k1[1])
        k3 = direction(x + step / 2 * k2[0], y + step / 2 * k2[1])
        k4 = direction(x + step * k3[0], y + step * k3[1])
        x += step / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        y += step / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        points.append((x, y))
        if reached_south(x, y):
            break
        # it may run outside the picture (the picture clips it) and come back
        if not (-W < x < 2 * W and -H < y < 2 * H):
            break
        if inside_magnet(x, y):
            break
    return points

def path(points):
    out = ["M%.1f %.1f" % points[0]]
    out += ["L%.1f %.1f" % p for p in points[1:]]
    return "".join(out)

lines = []
count = 13
for i in range(count):
    x = N_X[0] + (N_X[1] - N_X[0]) * (i + 0.5) / count
    lines.append(trace(x, FOOT + 1.5))
# a few from the corners of the north face, which swing wide round the magnet
for dx in (-1.5, 1.5):
    x0 = N_X[0] if dx < 0 else N_X[1]
    for k in range(3):
        lines.append(trace(x0 + dx * (1 + 3 * k), FOOT - 2 - 10 * k))

# the order they are drawn in: the inner, short loops first
lines.sort(key=len)

magnet = (
    "M{sl} {foot} V{ay} A{ro} {ro} 0 0 1 {nr} {ay} V{foot} H{nl} V{ay} "
    "A{ri} {ri} 0 0 0 {sr} {ay} V{foot} Z"
).format(sl=S_X[0], sr=S_X[1], nl=N_X[0], nr=N_X[1], foot=FOOT, ay=ARCH_Y,
         ro=R_OUT, ri=R_IN)

svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H)]
svg.append("""<style>
  .line { fill: none; stroke: %s; stroke-width: 1.4; stroke-linecap: round;
          stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.6s ease-out forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) { .line { animation: none; stroke-dashoffset: 0; } }
</style>""" % LINE)
# The lines fade out towards the picture's edges, so the field seems to go on
# instead of stopping at a box.
svg.append('<defs><radialGradient id="fade" cx="50%%" cy="%.0f%%" r="50%%">'
           '<stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/>'
           '</radialGradient><mask id="edges"><rect width="%d" height="%d" fill="url(#fade)"/></mask></defs>'
           % (100.0 * (FOOT - 60) / H, W, H))
svg.append('<g mask="url(#edges)">')
for i, pts in enumerate(lines):
    svg.append('<path class="line" pathLength="1" style="animation-delay:%.2fs" d="%s"/>' % (0.15 + 0.06 * i, path(pts)))
svg.append('</g>')
svg.append('<path d="%s" fill="%s"/>' % (magnet, NAVY))
# the slit at the top of the arch, as in the logo
svg.append('<rect x="%d" y="%d" width="8" height="%d" fill="#ffffff"/>' % (CX - 4, TOP - 2, R_OUT - R_IN + 4))
# The whole right half is the north pole: the same shape, red, cut at the middle.
svg.append('<clipPath id="north"><rect x="%d" y="0" width="%d" height="%d"/></clipPath>' % (CX, W - CX, H))
svg.append('<path d="%s" fill="%s" clip-path="url(#north)"/>' % (magnet, RED))
for (x0, x1), letter in ((S_X, "S"), (N_X, "N")):
    svg.append('<text x="%.1f" y="%d" text-anchor="middle" font-family="\'Noto Sans\', Arial, sans-serif" '
               'font-weight="700" font-size="34" fill="#ffffff">%s</text>' % ((x0 + x1) / 2, FOOT - 17, letter))
svg.append("</svg>")
open("images/hero-magnet.svg", "w").write("\n".join(svg) + "\n")
print(len(lines), "field lines")
