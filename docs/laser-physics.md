# Laser Physics for an Interactive Simulator

Based on D. V. Sivukhin, *General Course of Physics*, Vol. IV *Optics*, §§119–126 · 13 Nov 2026

## 0. What we model and how the simulator is structured

The simulator is a chain of four coupled blocks: pump → gain medium → resonator → beam optics. The user changes the medium, mirrors, lenses and pump, and each block is recomputed from its own equations (Sections 1–10). All the physics comes from §§119–126 of Sivukhin, supplemented with standard laser-physics formulas where the book stays qualitative.

### An important correction about lenses

A lens does not turn lamp light into a laser beam. Pump light is absorbed by the medium and only creates a population inversion. The laser beam itself grows from a random spontaneous photon travelling along the axis and is amplified, avalanche-like, by stimulated emission between the mirrors (§120, items 2–4).

So optical elements appear in four places in the simulator, each with its own role:

1. **Pump optics** — elliptical reflector around the lamp, focusing lens for diode pumping. Decides how much pump power reaches the medium.
2. **Resonator mirrors** — plane, spherical, confocal. Decide whether lasing happens at all and set the beam shape (the mode).
3. **Intracavity elements** — Brewster windows, Q-switch (rotating prism, Pockels cell, saturable absorber), thermal lens in the rod, Kerr (nonlinear) lens.
4. **Output optics** — converging and diverging lenses, collimator, cylindrical lenses, telescope. They change the size, divergence and focus of the finished beam, but they cannot make light coherent.

This is exactly what is worth showing visually: the same lamp beam through the same lens stays an incoherent blur, while the laser beam focuses to a spot of order λ.

### Model layers

| Layer | What it computes | State variables | Section |
| --- | --- | --- | --- |
| Quantum | Transition probabilities, cross section, lineshape | A₂₁, B₂₁, σ(ν), ĝ(ν) | 1 |
| Medium kinetics | Level populations vs. time | N₁, N₂, N₃ … (or carrier density N for a diode) | 2, 4, 5 |
| Resonator | Threshold, power, modes, pulses | photon number φ, losses γ, τ_c | 3, 4 |
| Pump | Excitation rate | W_p, R_p, current I | 6 |
| Beam geometry | Rays and Gaussian beam through mirrors and lenses | q(z), w(z), R(z), rays (y, θ) | 7, 8 |
| Polarization | Losses at windows and in the Q-switch | Jones vector, angle | 9 |
| Nonlinear optics | Second harmonic, self-focusing, OPO | I(2ω), Δk, P_cr | 10 |

### Units and notation

All formulas below are in SI so that they can go straight into code. Sivukhin writes in Gaussian (CGS) units; the conversion is in Section 13. Formulas taken from the book unchanged carry the book's equation number, e.g. (120.2).

English-language textbooks (Svelto, Siegman, Koechner) reuse the letters g and R for several quantities. This document follows that convention; the meaning is always clear from the section, and the "code name" column keeps the quantities apart in the program.

| Symbol | Meaning | SI unit | Code name |
| --- | --- | --- | --- |
| N₁, N₂ | population densities of the lower and upper laser levels | m⁻³ | `N1`, `N2` |
| N_t | total density of active atoms or ions | m⁻³ | `N_t` |
| φ | number of photons in the laser mode, in the whole cavity (Sections 4, 11) | — | `phi` |
| S = φ/V | photon density of the laser mode, V = mode volume (Sections 2, 5.7, 9.4) | m⁻³ | `S` |
| g₁, g₂ (Sections 1–2) | level degeneracies | — | `deg1`, `deg2` |
| ΔN = N₂ − (g₂/g₁)N₁ | population inversion | m⁻³ | `dN` |
| λ, ν, ω = 2πν | wavelength, frequency, angular frequency | m, Hz, rad/s | `lam`, `nu`, `omega` |
| n | refractive index | — | `n` |
| n_g | group index: sets the round-trip time; differs noticeably from n only in a semiconductor | — | `ng` (given only where it differs); `nGroup` = n_g where given, otherwise n |
| σ | stimulated-emission cross section | m² | `sigma` |
| A₂₁ = 1/τ_rad | spontaneous-emission rate | s⁻¹ | `A21` |
| τ | upper-laser-level lifetime | s | `tau` |
| ĝ(ν) | normalized lineshape (often written g(ν)) | Hz⁻¹ | `lineshape` |
| ν₀, Δν | centre and full width at half maximum of the gain line | Hz | `nu0`, `dnu` |
| Δν_D | Doppler width (full width at half maximum) | Hz | `dnuD` |
| M | mass of the emitting atom or molecule | kg | `M` |
| g, g₀, g_th | gain coefficient: saturated, small-signal, threshold | m⁻¹ | `gain`, `g0`, `gth` |
| α | distributed internal loss coefficient | m⁻¹ | `alpha_i` |
| l | length of the gain medium | m | `l_g` |
| L | cavity length (mirror separation) | m | `L` |
| L_e = L + (n_g − 1)l | effective (optical) cavity length (n_g ≈ n except in a semiconductor, see 3.2) | m | `L_e` |
| R₁, R₂ (Sections 3–4) | mirror power reflectivities | — | `refl1`, `refl2` |
| T = 1 − R₂ | output-coupler transmission | — | `T_oc` |
| L_i | all other losses per round trip, as a fraction | — | `L_i` |
| γ | single-pass logarithmic loss | — | `gamma` |
| x = g₀/g_th | how many times the pump exceeds threshold; for a four-level medium also R_p/R_c (Section 4.1) | — | `x` |
| N_c = γ/(σl) | threshold inversion of the rate equations, the same as ΔN_th of Section 3.1 | m⁻³ | `N_c` |
| R_p, R_c = N_c/τ | pump rate into the upper laser level, and its value at threshold | m⁻³ s⁻¹ | `R_p`, `R_c` |
| V = A·L_e, V_a = A·l | mode volume of the cavity, active (gain) volume | m³ | `V`, `V_a` |
| B = σc/V (Sections 4, 11) | stimulated-emission rate per photon per unit inversion. Not the Einstein coefficients B₁₂, B₂₁ of Section 1, which the code does not use | s⁻¹ | `B` |
| β (Section 4) | fraction of spontaneous emission that goes into the laser mode | — | `beta` |
| t′ = t/τ, y = N/N_c, p = Bτφ, s = ln p (Section 11.2) | dimensionless time, inversion and photon number, and the logarithm the integrator uses | — | `tPrime`, `y`, `p`, `s` |
| ε = τ_c/τ (Section 11.2) | how stiff the equations are. ε also stands for the permittivity (Section 13) and a mirror tilt angle (Section 7.5); those get other code names | — | `eps` |
| ω_R, t_damp | relaxation-oscillation angular frequency, damping time | rad/s, s | `omegaR`, `t_damp` |
| R₁, R₂ (Section 7) | mirror radii of curvature | m | `Rc1`, `Rc2` |
| g₁, g₂ (Section 7) | resonator g-parameters, 1 − L/R | — | `g1`, `g2` |
| τ_c | cavity photon lifetime | s | `tau_c` |
| Q, Δν_c | quality factor and linewidth of the empty (cold) cavity | —, Hz | `Q`, `dnu_c` |
| Δν_FSR | free spectral range, the spacing of the longitudinal modes | Hz | `fsr` |
| F | finesse | — | `finesse` |
| I, I_sat | intensity, saturation intensity | W/m² | `I`, `I_sat` |
| A | mode area: cross-section of the beam in the gain medium | m² | `area` |
| P_out | output power | W | `P_out` |
| w, w₀, z_R | Gaussian beam radius, waist radius, Rayleigh range | m | `w`, `w0`, `zR` |
| q | complex beam parameter | m | `q` |

## 1. Spontaneous and stimulated emission (§119)

A stimulated photon is a copy of the incident one: same frequency, phase, polarization and direction (§120, item 1). All of laser physics rests on Einstein's three processes between levels E₁ < E₂ with hν = E₂ − E₁ (Bohr frequency condition, Eq. 119.5).

| Process | Transitions per unit volume per second | What happens to the photon |
| --- | --- | --- |
| Spontaneous emission 2→1 | A₂₁N₂ | random direction, phase, polarization |
| Stimulated emission 2→1 | B₂₁ρ(ν)N₂ | copy of the incident photon |
| Absorption 1→2 | B₁₂ρ(ν)N₁ | photon disappears |

Here ρ(ν) is the spectral energy density of radiation (J m⁻³ Hz⁻¹) and A₂₁ = 1/τ_rad is the spontaneous-emission rate. Sivukhin writes the energy density as u(ω).

### Relations between the coefficients

Detailed balance (119.1) together with Planck's law gives two relations. The first is (119.3) in the book; the second is written here for frequency ν in a medium of index n:

```latex
g_1 B_{12} = g_2 B_{21}, \qquad \frac{A_{21}}{B_{21}} = \frac{8\pi h \nu^3 n^3}{c^3}
```

Sivukhin writes the same relation in angular frequency: A/B = ħω³/(π²c³). The factor differs because ρ(ω) and ρ(ν) refer to different spectral intervals. Without stimulated emission one would get Wien's law instead of Planck's — this is how the book shows that stimulated emission must exist.

### Why an ordinary light source is not a laser

In thermal equilibrium the ratio of stimulated to spontaneous emission is 1/(exp(hν/kT) − 1). It exceeds one only when hν < kT·ln 2 (Problems 4–5 to §119):

```latex
\lambda > \frac{hc}{kT\ln 2} \approx 69\ \mu\text{m at } T = 300\ \text{K}; \qquad T > \frac{hc}{k\lambda \ln 2} \approx 3.8\times 10^{4}\ \text{K at } \lambda = 550\ \text{nm}
```

In the visible, every thermal source is dominated by spontaneous emission. To make stimulated emission win you need a population inversion (Section 2) and feedback through mirrors (Section 3).

### Stimulated-emission cross section — the key parameter for the code

In the simulator the cross section σ(ν) is more convenient than B₂₁: the stimulated transition rate per atom is W = σ·I/(hν), where I/(hν) is the photon flux.

```latex
\sigma(\nu) = \frac{A_{21}\,\lambda_0^{2}}{8\pi n^{2}}\; \hat g(\nu), \qquad W_{21} = \frac{\sigma(\nu)\, I}{h\nu}
```

λ₀ is the vacuum wavelength; ĝ(ν) is the normalized lineshape (its integral over ν equals 1, unit 1/Hz). Check for ruby at line centre, with the Lorentzian peak ĝ(ν₀) = 2/(πΔν) from below: λ₀ = 694.3 nm, n = 1.76, τ = 3 ms and Δν ≈ 330 GHz give σ ≈ 4×10⁻²⁴ m²; the measured value is ≈ 2.5×10⁻²⁴ m². The simulator uses measured values from the table in Section 5 and this formula for the spectral shape σ(ν).

### Lineshape and linewidth

The line has a finite width (§120, item 5), and its shape decides how many longitudinal modes the laser will run on. Two limiting cases:

**Homogeneous broadening** (all atoms identical: natural width, collisions, phonons in a crystal — ruby, Nd:YAG, semiconductors) — a Lorentzian:

```latex
\hat g_L(\nu) = \frac{\Delta\nu/2\pi}{(\nu-\nu_0)^2 + (\Delta\nu/2)^2}, \qquad \hat g_L(\nu_0) = \frac{2}{\pi\,\Delta\nu}, \qquad \Delta\nu_{\text{nat}} = \frac{1}{2\pi\tau}
```

**Inhomogeneous broadening** (atoms emit at different frequencies: Doppler broadening in gases — He-Ne, Ar⁺; site-to-site variation in glass — Nd:glass) — a Gaussian:

```latex
\hat g_G(\nu) = \frac{2}{\Delta\nu_D}\sqrt{\frac{\ln 2}{\pi}}\; e^{-4\ln 2\,(\nu-\nu_0)^2/\Delta\nu_D^2}, \qquad \Delta\nu_D = \nu_0\sqrt{\frac{8kT\ln 2}{Mc^2}}
```

Check: neon (M = 20 u), T ≈ 400 K, λ = 632.8 nm give Δν_D ≈ 1.5 GHz. At line centre ĝ_G(ν₀) ≈ 0.939/Δν_D. When both mechanisms matter the lineshape is their convolution (Voigt profile); for a visual simulator it is enough to pick the dominant one.

The difference shows up in saturation. With homogeneous broadening a strong mode depletes the gain across the whole line and suppresses its neighbours. With inhomogeneous broadening each mode burns its own "hole", and several modes coexist:

```latex
g_{\text{hom}}(I) = \frac{g_0}{1 + I/I_{\text{sat}}}, \qquad g_{\text{inh}}(I) = \frac{g_0}{\sqrt{1 + I/I_{\text{sat}}}}
```

### Gain coefficient

From (120.1), the number of photons in the beam grows in proportion to N₂/g₂ − N₁/g₁. In terms of the cross section this is the Beer–Lambert law with negative absorption:

```latex
\frac{dI}{dz} = g(\nu)\, I, \qquad g(\nu) = \sigma(\nu)\Big[N_2 - \frac{g_2}{g_1}N_1\Big], \qquad I(z) = I_0\, e^{g z}
```

g > 0 means amplification, g < 0 ordinary absorption. In Boltzmann equilibrium N₂/N₁ = (g₂/g₁)·exp(−hν/kT): for λ = 694 nm at 300 K that is about 10⁻³⁰, so the medium always absorbs. In the simulator the sign of g is a good indicator: colour the rod as absorbing or amplifying.

## 2. Population inversion: why 3 or 4 levels are needed (§§120–121)

A medium amplifies only if n₂ > n₁, where nᵢ = Nᵢ/gᵢ is the population of a single sublevel (120.3). With optical pumping this cannot be achieved on two levels; ruby works as a three-level system, neodymium and dysprosium as four-level systems (§121, items 2 and 10). Below g₁ = g₂ throughout (otherwise replace Nᵢ by Nᵢ/gᵢ); W_p is the pump rate per atom, s⁻¹.

### 2.1 Two levels — no inversion possible

The pump drives 1→2 and 2→1 transitions with equal probability (119.2), and spontaneous decay empties the upper level:

```latex
\frac{dN_2}{dt} = W_p(N_1 - N_2) - \frac{N_2}{\tau} \;\Rightarrow\; \frac{N_2}{N_1}\Big|_{\text{steady}} = \frac{W_p\tau}{1 + W_p\tau} < 1
```

Even for W_p → ∞ the populations only equalize and the medium becomes transparent. This is not useless: it is exactly how the bleachable filter (saturable absorber) — the passive Q-switch of §121, item 8 — works (Section 9). The simulator should keep a "2 levels" mode to show why it never lases.

### 2.2 Three levels (ruby)

Level 1 is the ground state, 3 is a broad pump band, 2 is the metastable upper laser level. From band 3 the ion relaxes non-radiatively to level 2 in ~10⁻⁸ s (the energy goes into lattice vibrations) and stays on level 2 for ~3×10⁻³ s. Hence N₃ ≈ 0 and N₁ + N₂ = N_t:

```latex
\frac{dN_2}{dt} = W_p N_1 - \frac{N_2}{\tau} - \frac{c}{n}\sigma (N_2 - N_1)\,S, \qquad N_1 = N_t - N_2
```

S is the photon density of the laser mode (m⁻³). Section 4 counts photons instead: φ = S·V, the total number in the mode. Without lasing (S = 0), in steady state:

```latex
\Delta N = N_2 - N_1 = N_t\,\frac{W_p\tau - 1}{W_p\tau + 1}
```

Inversion starts at W_pτ > 1, i.e. when more than half of the ions are on level 2 — exactly the requirement in §121, item 2. This gives the book's estimate of the minimum pump power per unit volume (§121, item 3):

```latex
\frac{P_{\min}}{V} \approx \frac{(N_t/2)\, h\nu_p}{\tau} = \frac{0.5\times 10^{19}\ \text{cm}^{-3}\times 4.4\times 10^{-19}\ \text{J}}{10^{-3}\ \text{s}} \approx 2.2\ \text{kW/cm}^3
```

Since the rod absorbs 10–15% of the lamp radiation, the lamp needs ~20 kW/cm³, i.e. ~200 kW for a 10 cm³ rod. For a ~1 ms flash that is ~200 J = CU²/2, so at U = 2 kV the capacitance must be C ≥ 100 µF (in practice the book quotes ~1000 µF). The saturation intensity of a three-level medium under weak pumping is I_sat ≈ hν/(2στ): one emission event changes ΔN by 2.

### 2.3 Four levels (Nd, CaF₂:Dy)

Level 0 is the ground state, 3 the pump band, 2 the upper laser level (lifetime τ), 1 the lower laser level (lifetime τ₁ ≪ τ). Level 1 lies E₁ ≫ kT above the ground state and is almost empty (§121, item 10):

```latex
\frac{dN_2}{dt} = W_p N_0 - \frac{N_2}{\tau} - \frac{c}{n}\sigma (N_2 - N_1)\,S, \qquad \frac{dN_1}{dt} = \frac{N_2}{\tau} + \frac{c}{n}\sigma (N_2 - N_1)\,S - \frac{N_1}{\tau_1}
```

Without lasing: N₂ ≈ W_pτ·N_t (for W_pτ ≪ 1) and N₁ ≈ N₂·τ₁/τ ≈ 0. There is inversion at arbitrarily weak pumping — which is why the CaF₂:Dy laser runs CW from a lamp of only 15–20 W, while ruby needs kilowatts and pulsed operation. Saturation intensity I_sat = hν/(στ).

Temperature enters through the thermal population of the lower level — a good control for the simulator:

```latex
\frac{N_1^{\text{th}}}{N_0} = \frac{g_1}{g_0}\, e^{-E_1/kT}
```

For Nd:YAG E₁ ≈ 2000 cm⁻¹, and at 300 K the factor is ≈ 10⁻⁴ — a clean four-level system. In CaF₂:Dy the lower level is closer, and the book stresses that its population is practically zero only at liquid-nitrogen temperature (77 K).

*Figure: level schemes side by side.*

```
  TWO-LEVEL              THREE-LEVEL (ruby)            FOUR-LEVEL (Nd, Dy)

                         ######### E3 pump bands       ######### E3 pump band
                          ^      :  non-radiative,      ^      :  fast
                          |      v  ~1e-8 s             |      v
  --------- E2            |  --------- E2 (tau=3 ms)    |  --------- E2 upper laser level
   ^      |               |        ||                   |        ||  1064 nm
   |      | emission      |        ||  694 nm           |        vv
  pump    |               |        vv                   |  --------- E1 lower laser level
   |      v               |                             |        :   empties fast
  --------- E1         ---+----------- E1 (ground)   ---+----------- E0 (ground)

  pump only equalizes    more than half the ions       inversion at any,
  N1 and N2: no gain     must be lifted to E2          even weak, pump
```

### 2.4 A universal level scheme for the code

To make every medium a data set rather than separate code, describe it as a list of levels and transitions. One equation covers 2-, 3- and 4-level schemes and He-Ne with energy transfer:

```latex
\frac{dN_i}{dt} = \sum_{j\ne i}\big(k_{ji}N_j - k_{ij}N_i\big) \;\pm\; \frac{c}{n}\,\sigma\Big(N_u - \frac{g_u}{g_l}N_l\Big)S\,\delta_{i\in\{u,l\}}, \qquad \sum_i N_i = N_t
```

k_ij is the i→j transition rate (s⁻¹). It includes spontaneous rates A_ij, non-radiative rates, the pump W_p (plus the reverse stimulated rate W_p·g_l/g_u for a narrow pumped level), and collisional transfer k_tr·N_partner. u and l are the upper and lower laser levels: the stimulated term enters the equation for u with a minus sign and the equation for l with a plus sign. The semiconductor is described separately, through the carrier density (Section 5).

### 2.5 Where the pump energy goes

The quantum efficiency η_q = λ_p/λ_l is the fraction of the pump-photon energy that can end up in a laser photon; the rest (1 − η_q, the quantum defect) heats the medium. Ruby pumped at ~450 nm: 450/694 ≈ 0.65; Nd:YAG diode-pumped at 808 nm: 808/1064 ≈ 0.76. The book notes that more than 50% of the energy absorbed by ruby goes into heat and lasing stops above ~1000 K; in practice the ruby threshold rises noticeably as soon as it is heated above room temperature, because the line broadens and σ drops. In the simulator, rod heating = (1 − η_q)·P_abs + non-radiative losses; the same heat creates the thermal lens (Section 8).

## 3. Resonator: threshold, modes, monochromaticity, power (§120, items 4–7)

Lasing starts when the round-trip gain compensates all losses: a beam leaving S₁ must return to S₁ with no less intensity (§120, item 7). The resonator is a Fabry–Perot interferometer filled with the gain medium; it provides feedback, collimates the light and makes it monochromatic.

### 3.1 Lasing threshold

Gain element of length l, mirrors with reflectivities R₁ and R₂, internal loss α (scattering, absorption, diffraction, windows):

```latex
R_1R_2\,e^{2(g_{th}-\alpha)l} = 1 \;\Rightarrow\; g_{th} = \alpha + \frac{1}{2l}\ln\frac{1}{R_1R_2}, \qquad \Delta N_{th} = \frac{g_{th}}{\sigma}
```

For a four-level medium the threshold pump rate is R_th = ΔN_th/τ (m⁻³s⁻¹) and the threshold power P_th = R_th·V·hν_p/η_p, where η_p is the fraction of the pump power actually absorbed in the mode volume. For a three-level medium: N₂,th = (N_t + ΔN_th)/2.

Two examples for testing the code:

- **He-Ne**: R₁ = 0.99, R₂ = 0.98 (as in §122), l = 0.3 m, α ≈ 0 → g_th ≈ 0.05 m⁻¹. Neon gain is only ~0.1 m⁻¹, so a He-Ne laser does not start without nearly perfect mirrors.
- **Ruby**: R₁ = 1, R₂ = 0.5, l = 0.1 m → g_th ≈ 3.5 m⁻¹, ΔN_th = g_th/σ ≈ 1.4×10¹⁸ cm⁻³. That is only ~9% of N_t ≈ 1.6×10¹⁹ cm⁻³: the main cost of the threshold is emptying half of the ground state.

### 3.2 Photon lifetime and Q factor

Single-pass logarithmic loss γ = αl + ½·ln(1/(R₁R₂)) (equivalently γ = γ_i + (γ₁ + γ₂)/2 with γ₁,₂ = −ln R₁,₂). Effective cavity length L_e = L + (n − 1)l. Strictly, the n here is the group index n_g, because L_e stands for the round-trip time; the two differ noticeably only in a semiconductor (n = 3.6, n_g ≈ 4, see 3.3).

```latex
\tau_c = \frac{L_e}{c\,\gamma}, \qquad Q = 2\pi\nu\,\tau_c, \qquad \Delta\nu_c = \frac{1}{2\pi\tau_c}
```

For the He-Ne example above (L = 0.3 m, γ = 0.0151): τ_c ≈ 66 ns, Δν_c ≈ 2.4 MHz, Q ≈ 2.0×10⁸. τ_c sets the time scale of pulse build-up in Section 4.

### 3.3 Longitudinal modes

Only waves for which an integer number of half-wavelengths fits into the cavity are amplified: 2L = mλ (§120, item 5). Neighbouring wavelengths differ by Δλ = λ/m — the free spectral range of a Fabry–Perot interferometer:

```latex
\nu_q = q\,\frac{c}{2L_e}, \qquad \Delta\nu_{\text{FSR}} = \frac{c}{2L_e}, \qquad \Delta\lambda = \frac{\lambda^2}{2L_e}
```

Modes lase if their small-signal gain g₀(ν) exceeds g_th. Let x = g₀(ν₀)/g_th be how many times the pump exceeds threshold. Width of the oscillating band and number of modes in it:

```latex
\Delta\nu_{\text{osc}}^{L} = \Delta\nu\,\sqrt{x-1}, \qquad \Delta\nu_{\text{osc}}^{G} = \Delta\nu_D\,\sqrt{\frac{\ln x}{\ln 2}}, \qquad N_{\text{modes}} \approx \frac{\Delta\nu_{\text{osc}}}{\Delta\nu_{\text{FSR}}}
```

| Laser | L_e | Δν_FSR | Gain linewidth | Modes under the gain curve |
| --- | --- | --- | --- | --- |
| He-Ne | 0.3 m | 500 MHz | 1.5 GHz (Doppler) | ~3 |
| Ruby, 10 cm rod in a 0.5 m cavity | 0.58 m | 260 MHz | ~330 GHz | ~10³ |
| Semiconductor, 300 µm, n_g ≈ 4 | 1.2 mm | ~125 GHz | ~10 THz | ~10² |

With homogeneous broadening the modes compete and the one closest to line centre wins (in practice the standing wave burns spatial holes and gives neighbours a chance). With inhomogeneous broadening all N_modes lase — the case the book describes as "several closely spaced lines".

### 3.4 Monochromaticity

After N round trips, N wave trains at a wavelength λ′ ≠ λ cancel each other, and the line narrows to δλ ≈ λ/(Nm) (§120, item 5). The effective N is set by the mirror reflectivities — it is the finesse F of the Fabry–Perot interferometer:

```latex
F = \frac{\pi\,(R_1R_2)^{1/4}}{1-\sqrt{R_1R_2}}, \qquad \Delta\nu_c \approx \frac{\Delta\nu_{\text{FSR}}}{F}
```

Above threshold the gain compensates the losses and the line becomes even narrower than the cold-cavity resonance. The fundamental limit (Schawlow–Townes formula, in the form used by Svelto):

```latex
\Delta\nu_{\text{laser}} \approx \frac{N_2}{N_2-N_1}\cdot\frac{2\pi h\nu\,(\Delta\nu_c)^2}{P_{\text{out}}}
```

For He-Ne at P = 1 mW this is ~10⁻² Hz, but the real linewidth is ~10³–10⁶ Hz: it is set by vibrations and thermal drift of the cavity length, since δν/ν = δL/L. The book uses δν ≈ 10⁴ Hz in Problem 2 to §121.

### 3.5 Collimation

Oblique rays hit the side wall after a few reflections, and only rays along the axis survive (§120, item 4). The divergence is diffraction-limited: δθ ≈ λ/D, where D is the beam width. He-Ne typically gives 1–2′, at best the diffraction limit of ~20″ (§122). The exact beam shape depends on the mirror shapes — see Section 7. Waves at a small angle φ to the axis can also be amplified if 2L·cos φ = mλ; these are transverse modes with dark nodal lines across the beam (§120, item 6).

### 3.6 Output power and the optimum output coupler

Gain cannot grow indefinitely: as intensity rises the upper level is depleted (§120, item 7), and in steady state the saturated gain equals the threshold exactly. For low gain (He-Ne, CO₂, most CW lasers) use the Rigrod formula; T is the output-coupler transmission, L_i all other round-trip losses, A the mode area. For small losses the single-pass loss of 3.2 is γ ≈ (T + L_i)/2:

```latex
P_{\text{out}} = A\,\frac{T\,I_{\text{sat}}}{2}\left(\frac{2g_0 l}{T+L_i} - 1\right), \qquad T_{\text{opt}} = \sqrt{2g_0 l\,L_i} - L_i
```

For high gain and low reflectivity (ruby with R₂ = 0.5; a semiconductor with cleaved facets, R ≈ 0.3) use the exact Rigrod formula (for α = 0):

```latex
I_{\text{out}} = \frac{(1-R_2)\sqrt{R_1}}{(\sqrt{R_1}+\sqrt{R_2})(1-\sqrt{R_1R_2})}\; I_{\text{sat}}\left[g_0 l + \ln\sqrt{R_1R_2}\right]
```

For small T it reduces to the previous one. Both formulas give zero output below threshold (where the bracket would be negative), and T_opt is zero when 2g₀l ≤ L_i: then the laser cannot start at any T. Both are derived for a homogeneous line, whose gain saturates as g₀/(1 + I/I_sat). He-Ne and CO₂ are inhomogeneous (Doppler), where the gain falls more slowly (Section 1), so for them the formulas are an estimate, which is enough for the simulator. In practical form the output power is linear in pump power above threshold:

```latex
P_{\text{out}} = \eta_s\,(P_p - P_{th}), \qquad \eta_s = \eta_p\,\eta_q\,\eta_c\,\eta_t, \qquad \eta_c = \frac{T}{T+L_i}
```

η_p is the fraction of pump absorbed in the medium; η the fraction of absorbed pump photons that reach the upper laser level (the η of Section 6.3, ≈ 0.9 for Nd:YAG at 808 nm); η_q = λ_p/λ_l; η_c the fraction of the losses that is useful output; η_t the overlap between the mode and the pumped volume. So in full η_s = η_p·η·η_q·η_c·η_t; the formula above leaves η out, as if every absorbed photon reached the upper level. In the rate equations of Section 4.1 with the pump spread evenly over the mode (η_p = η_t = 1 when P_p is the absorbed power) the slope is exactly η·η_q·γ₂/(2γ), and γ₂/(2γ) ≈ T/(T + L_i) for small losses. The simulator should show the curve P_out(T) with its maximum at T_opt: at T → 0 the light is trapped inside, at large T the laser goes out.

## 4. Dynamics: CW operation, spiking, giant pulse, mode locking (§121, items 5–9)

All the time-domain regimes in the book follow from two coupled equations — one for the inversion and one for the number of photons in the cavity. By changing only the pump and the losses over time, the simulator will show CW lasing, ruby spiking (~10⁻⁶ s), the giant pulse (~10⁻⁸ s) and ultrashort pulses (10⁻¹¹–10⁻¹² s).

### 4.1 Rate equations

Variables: N — inversion in the active volume V_a = A·l (m⁻³); φ — total number of photons in the laser mode (Svelto's notation; not the photon density S of Section 2 — φ = S·V). For a four-level medium:

```latex
\frac{dN}{dt} = R_p(t) - \frac{N}{\tau} - B N \phi, \qquad \frac{d\phi}{dt} = V_a B N \phi - \frac{\phi}{\tau_c(t)} + \beta\,\frac{V_a N}{\tau}, \qquad B = \frac{\sigma c}{V}
```

V = A·L_e is the mode volume in the cavity, τ_c from Section 3.2. For a three-level medium the first equation becomes (and N → ΔN in the second):

```latex
\frac{d\Delta N}{dt} = W_p\,(N_t - \Delta N) - \frac{N_t + \Delta N}{\tau} - 2B\,\Delta N\,\phi
```

The term β·V_aN/τ is the fraction of spontaneous emission that goes into the mode (β ≈ 10⁻⁸–10⁻⁴). Without it, φ = 0 stays zero forever in the code: physically this is the "first spontaneous photon" that starts the avalanche.

The equations give the same threshold as Section 3: N_c = 1/(V_aBτ_c) = γ/(σl). Above threshold the steady-state inversion is clamped at N_c, and all excess pump goes into photons:

```latex
N_0 = N_c, \qquad \phi_0 = \tau_c V_a\,(R_p - R_c), \quad R_c = \frac{N_c}{\tau}, \qquad P_{\text{out}} = \frac{c\,\gamma_2}{2L_e}\; h\nu\,\phi_0
```

γ₂ = −ln R₂ is the logarithmic loss of the output coupler. A useful number for the interface is x = R_p/R_c, "how many times above threshold". With I_sat = hν/(στ) the output power is also P_out = (γ₂/2)·A·I_sat·(x − 1); for small losses (γ₂ ≈ T, γ ≈ (T + L_i)/2) this is the low-gain Rigrod formula of Section 3.6, which differs from it by a relative T/(2(x − 1)) when R₁ = 1 and L_i = 0.

### 4.2 Spiking and relaxation oscillations

The book describes the ruby output as a train of spikes ~10⁻⁶ s long, separated by microseconds (§121, item 5). These are damped oscillations of the "inversion ↔ photons" system around steady state; linearization gives:

```latex
\omega_R = \sqrt{\frac{x-1}{\tau\,\tau_c}}, \qquad t_{\text{damp}} = \frac{2\tau}{x}
```

ω_R is the small-ε limit. Exactly, the linearized equations oscillate at ω = √(ω_R² − (x/2τ)²) and decay at the rate x/2τ; for ruby the two frequencies agree to 10⁻⁶, for He-Ne they do not. The formulas hold for small oscillations only: a disturbance δy of the inversion is small when δy ≪ √(ε(x − 1)) (about 2×10⁻³ for ruby); a larger one gives full spikes, whose spacing is longer.

Ruby: τ = 3 ms, τ_c ≈ 5 ns, x = 3 → period 2π/ω_R ≈ 17 µs, damping ~2 ms — longer than the whole flash: about 116 oscillations while the amplitude falls by a factor e, and about 535 before it falls to 1 %. So ruby spikes never die out, while He-Ne shows no oscillation that can be seen: with τ ≈ 10⁻⁷ s and τ_c ≈ 66 ns (ε ≈ 0.66) at x = 2 it is formally underdamped (ω ≈ 0.72/τ), but it loses a factor e^8.8 ≈ 6500 in amplitude per period. A good contrast for the simulator. The simulator must reproduce spiking on its own from the equations of 4.1; the formula is for checking.

### 4.3 Q-switching: the giant pulse

The idea from §121, items 5–6: while pumping, feedback is switched off and inversion builds up far above threshold. Then the shutter opens and all the stored energy comes out in ~10⁻⁸ s. In code this is simply τ_c(t): small before opening, normal after.

**Pumping phase** (shutter closed, φ ≈ 0): N(t) = R_pτ·(1 − e^{−t/τ}). It makes sense to open the shutter after ~τ (for ruby ~2 ms, as in the book): beyond that the inversion stops growing and is lost to spontaneous decay.

**Pulse phase** (shutter open; pumping and spontaneous decay are negligible over 10⁻⁸ s). Let N_i be the initial inversion, N_p the threshold with the shutter open, x = N_i/N_p, γ the single-pass loss. The energy-utilization factor η_E is found from a transcendental equation (solve numerically):

```latex
x\,\eta_E = -\ln(1-\eta_E)
```

```latex
E_{\text{out}} = \frac{\gamma_2}{2\gamma}\,\eta_E\,N_i V_a\,h\nu, \qquad P_{\text{peak}} = \frac{\gamma_2}{2\gamma}\,\frac{h\nu\,V_a N_p}{\tau_c}\,(x - 1 - \ln x), \qquad \Delta\tau_p \approx \tau_c\,\frac{x\,\eta_E}{x-1-\ln x}
```

For a three-level medium (ruby) the energy is half as large: each photon reduces ΔN by 2. Pulse build-up time from noise: t_d ≈ τ_c·ln(φ_peak/φ_noise)/(x − 1), where the logarithm is typically 30–40. Check: τ_c = 5 ns and x = 3 give η_E ≈ 0.94 and Δτ_p ≈ 16 ns — the book's ~10⁻⁸ s. With 1–2 J of energy that is 10–200 MW (§121, item 9).

How feedback is switched on and off — three options from the book; their models are in Section 9:

| Q-switch | How it works | Switching time | Loss in the code |
| --- | --- | --- | --- |
| Rotating total-internal-reflection prism, ~500 rev/s | The cavity is aligned only at one angular position | fractions of a microsecond | R_eff(θ) = R·exp(−(θ/θ_tol)²), θ = Ωt |
| Kerr or Pockels cell + polarizer | Rotates the polarization by 90° in a double pass; the polarizer blocks it | ~nanoseconds | round-trip transmission cos²(πV/(2V_λ/4)) |
| Bleachable filter (saturable absorber) | Becomes transparent by itself at high intensity | automatic | its own population equation for the absorber |

The prism has a subtlety described in the book: the rod end faces themselves reflect (n − 1)²/(n + 1)² ≈ 7.6% and can give parasitic feedback. That is why the faces are cut at Brewster's angle (Section 9). In the simulator, unangled faces should add a second, weak cavity with R ≈ 0.076.

### 4.4 Amplifiers: a cascade of rods

The book describes an "oscillator + amplifiers" cascade: a 2×10⁻⁹ s pulse, ~20 J, ~10⁴ MW (§121, item 9). The leading edge depletes the inversion and the pulse gets shorter. Amplifier energetics is given by the Frantz–Nodvik formula for fluence F (J/m²):

```latex
F_{\text{out}} = F_{\text{sat}}\,\ln\!\Big[1 + G_0\big(e^{F_{\text{in}}/F_{\text{sat}}} - 1\big)\Big], \qquad G_0 = e^{g_0 l}, \qquad F_{\text{sat}} = \frac{h\nu}{\sigma}\ \ (\text{3-level: } \tfrac{h\nu}{2\sigma})
```

Ruby: F_sat ≈ 5.7 J/cm². For a weak input the gain is G₀; for a strong input the amplifier delivers all of its stored energy g₀l·F_sat.

### 4.5 Mode locking: picosecond pulses

The book mentions that the pulse of a laser with a bleachable filter consists of 10⁻¹¹–10⁻¹² s pulses. This is mode locking of the longitudinal modes. The output field is the sum of N modes spaced by Δω = πc/L_e:

```latex
E(t) = \sum_{q=0}^{N-1} E_q\, e^{\,i[(\omega_0 + q\Delta\omega)t + \psi_q]}, \qquad I(t)\big|_{\psi_q = 0} = E_0^2\,\frac{\sin^2(N\Delta\omega t/2)}{\sin^2(\Delta\omega t/2)}
```

With random phases ψ_q the intensity is noise with mean N·E₀². With equal phases it is a pulse train with period T_R = 2L_e/c, peak N²·E₀² and duration Δτ_p ≈ T_R/N ≈ 1/Δν_osc (for a Gaussian spectrum Δτ_p = 0.441/Δν). Ruby with Δν ≈ 330 GHz gives ~1 ps — exactly the book's 10⁻¹² s. This is one of the most striking scenes for the simulator: a "random phases / locked phases" switch and an N slider.

## 5. Gain media

In the simulator each medium is a set of numbers for the equations of Sections 1–4 plus its own special effects. The book discusses ruby (§121) and He-Ne (§122) in detail and Nd:glass, CaF₂:Dy, CO₂ and Ar⁺ briefly. The semiconductor, Nd:YAG, dye and Ti:sapphire are added from standard reference data.

### 5.1 Summary table of parameters

Values are typical and rounded; real values depend on concentration, temperature and pressure. σ is given in cm², as is customary in handbooks (1 cm² = 10⁻⁴ m²). The code computes the saturation intensity itself: I_sat = hν/(στ) for a four-level medium and hν/(2στ) for ruby, the three-level one (Section 2.2).

| Medium | Scheme | λ | σ, cm² | Upper-level lifetime τ | Linewidth | n | Pump | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ruby, Cr³⁺:Al₂O₃ | 3-level | 694.3 nm | 2.5×10⁻²⁰ | 3 ms | ~330 GHz, homogeneous | 1.76 | flashlamp | pulsed |
| Nd:glass | 4-level | 1.06 µm | ~3×10⁻²⁰ | ~0.3 ms | 20–30 nm, inhomogeneous | ~1.5 | flashlamp | pulsed |
| Nd:YAG | 4-level | 1064 nm | 2.8×10⁻¹⁹ | 230 µs | ~120 GHz, homogeneous | 1.82 | flashlamp or 808 nm diode | CW and pulsed |
| CaF₂:Dy²⁺ | 4-level | 2.36 µm | — | 10–50 ms | strongly T-dependent | 1.43 | lamp, cooled to 77 K | CW |
| He-Ne | 4-level + He→Ne transfer | 632.8 nm (also 1.15 and 3.39 µm) | ~3×10⁻¹³ | ~0.1 µs | ~1.5 GHz, Doppler | 1 | glow discharge | CW |
| Ar⁺ | 4-level (ion) | 488 and 514.5 nm | ~2.5×10⁻¹² | ~10 ns | ~3.5 GHz, Doppler | 1 | arc discharge | CW |
| CO₂ | 4-level + N₂→CO₂ transfer | 10.6 µm (also 9.6) | ~3×10⁻¹⁸ | ~0.1–1 ms (collisional) | ~50 MHz at low pressure | 1 | discharge | CW and pulsed |
| Semiconductor, GaAs/AlGaAs | bands | 780–870 nm | a ≈ (2–5)×10⁻¹⁶ (differential gain) | 2–4 ns (carriers) | ~10 THz | 3.6 | current through p-n junction | CW |
| Rhodamine 6G in ethanol | 4-level (molecule) | 560–640 nm, tunable | ~2×10⁻¹⁶ | ~5 ns | ~30 THz | 1.36 | another laser (Ar⁺, 532 nm) | CW and pulsed |
| Ti:sapphire | 4-level (vibronic) | 660–1100 nm, peak ~800 | 3.9×10⁻¹⁹ | 3.2 µs | ~100 THz | 1.76 | another laser, 532 nm | CW and femtosecond |

Sources of the verified numbers: for CO₂, a measured saturation flux of 22 W/cm² gives σ ≈ 3×10⁻¹⁸ cm² ([Appl. Phys. Lett., 1967](https://scilit.net/publications/6975397fb93c07490d020427bd3be7be)); for CaF₂:Dy²⁺, a lifetime of 10–50 ms depending on concentration and a linewidth from 4 cm⁻¹ (200 K) down to 0.024 cm⁻¹ (4.2 K) ([Pressley, Wittke, IEEE JQE 1967](https://manuscript.isc.ac/Inventory/49/1124735.htm)); for He-Ne, a measured gain of 15.5%/m ([Stanford](https://web.stanford.edu/~edwin98/HeNe.pdf)). The rest are standard values from laser textbooks (Svelto, Koechner) that have not yet been checked against the printed sources.

### 5.2 Ruby (§121)

- **Levels:** ground state E₁; narrow metastable levels E₂ (lines 694.3 and 692.9 nm; only the stronger 694.3 nm line lases); broad bands E₃ (green, ~550 nm) and E₄ (blue, ~400 nm). From the bands the ion relaxes to E₂ non-radiatively in ~10⁻⁸ s.
- **Concentration:** ~0.05% of Al atoms replaced by chromium, N_t ~ 10¹⁹ cm⁻³ (the book's round figure). The simulator uses N_t = 1.6×10¹⁹ cm⁻³: the usual handbook value for 0.05% Cr₂O₃ by weight, and the one the 9% estimate of Section 3.1 needs. Like the other numbers in 5.1, it still has to be checked against a printed source. Rod diameter 0.1–2 cm, length 2–20 cm.
- **Pumping:** xenon flashlamp, ~1 ms, capacitor bank at 2–3 kV. 10–15% of the lamp radiation goes into exciting the bands — precisely because the bands are broad.
- **Polarization:** ruby is uniaxial (n_o = 1.7653, n_e = 1.7573 at 656 nm). If the optic axis is tilted by 60–90° to the rod axis, the output is fully linearly polarized (Section 9).
- **Output per the book:** free-running — tens of kW peak for a 20–30 cm × 1.5 cm rod; Q-switched — 1–2 J in 10⁻⁸ s, 10–200 MW. Damage threshold: (3–4)×10³ MW per cm² of cross section.
- **What to show:** the delay before lasing starts (half the ground state must be emptied first), spiking, rod heating.

### 5.3 Neodymium (glass and YAG)

- Four-level Nd³⁺ scheme: the lower laser level lies ~2000 cm⁻¹ above the ground state, so the threshold is tens of times lower than for ruby.
- **Glass** (from the book): rods up to 0.5–1 m long and 5 cm in diameter, broader bands than ruby (higher efficiency), but lower damage resistance: (1–1.5)×10³ MW/cm². Broad inhomogeneous line and poor thermal conductivity: good for high-energy pulses, poor for CW.
- **YAG** (crystal): homogeneous line, high thermal conductivity (~14 W/(m·K)), runs CW. 1% doping → N_t ≈ 1.4×10²⁰ cm⁻³. 808 nm diode pumping hits the absorption band precisely.
- **What to show:** threshold compared with ruby; an invisible IR beam (draw it in false colour); frequency doubling 1064 → 532 nm in a KDP crystal (Section 10).

### 5.4 CaF₂:Dy²⁺ (§121, item 10)

- A four-level scheme whose lower level is empty only when cooled with liquid nitrogen. According to the book, a lamp of ~15–20 W is enough for CW operation, and Q-switched it gives 1–2 MW pulses at up to several kHz.
- **What to show:** a temperature slider. At 300 K the lower level is thermally populated per Boltzmann and the laser is silent; at 77 K it is empty and the laser runs.

### 5.5 Helium–neon laser (§122)

- **Design:** tube from tens of centimetres up to 1.5–2 m long, 7–10 mm bore; He ~1 mm Hg, Ne ~0.1 mm Hg; 1–2 kV, tens of mA. Brewster windows; spherical multilayer dielectric mirrors with 2% and <1% transmission.
- **Mechanism:** discharge electrons excite the helium metastables at 19.82 and 20.61 eV. In collisions with neon the energy is transferred resonantly to nearby neon levels, multiplying their population several times. In the equation of 2.4 this is the term k_tr·N_He*·N_Ne.
- **Role of the walls:** a long-lived neon level is emptied by wall collisions; otherwise it refills the lower laser level. That is why the power peaks at a bore of ~7 mm and falls for larger bores, even though the gas volume grows as D². Simple model for the code: g₀ ∝ 1/D.
- **Line competition:** the 3.39 µm line shares its upper level with 632.8 nm and has much higher gain. If the mirrors reflect in the IR it eats the inversion and the red output disappears. A nice "mirror coating" switch.
- **Output per the book:** divergence 1–2′ (best ~20″), negligible relative linewidth, power from tens to hundreds of mW.

### 5.6 Ar⁺ and CO₂ (§122, item 1)

- **Ar⁺:** lases on argon ions in an arc-discharge plasma, visible lines at 488 nm (blue) and 514.5 nm (green). Per the book, up to ~1 kW CW. Efficiency is very low (~0.1%): ionizing and exciting the atom takes ~35 eV, while the photon carries 2.4 eV.
- **CO₂:** vibrational levels of the molecule, transition 00⁰1 → 10⁰0 (10.6 µm). Nitrogen plays the same role as helium in He-Ne: it stores vibrational energy and transfers it resonantly to CO₂. Quantum efficiency ~41%, real efficiency 10–30%; per the book, up to 10 kW CW.
- **What to show:** efficiency compared through η_q = hν_laser/E_excitation — large for CO₂, tiny for Ar⁺; an invisible CO₂ beam burning a target.

### 5.7 Semiconductor laser

Here the inversion consists of electrons in the conduction band and holes in the valence band, injected by current through a p-n junction. There is gain only for photons with energy between the band gap and the separation of the quasi-Fermi levels (Bernard–Duraffourg condition):

```latex
E_g < h\nu < E_{Fc} - E_{Fv}, \qquad \lambda\,[\text{nm}] \approx \frac{1240}{E_g\,[\text{eV}]}
```

GaAs: E_g = 1.42 eV → ~870 nm. Materials for the selector: InGaN 405/450 nm, AlGaInP 635–670 nm, AlGaAs 780–850 nm, InGaAs 980 nm, InGaAsP 1310/1550 nm.

Instead of levels — the carrier density N and photon density S in an active layer of volume V:

```latex
\frac{dN}{dt} = \frac{\eta_i I}{qV} - \frac{N}{\tau_e} - v_g\, g(N)\, S, \qquad \frac{dS}{dt} = \Gamma v_g\, g(N)\, S - \frac{S}{\tau_p} + \Gamma\beta\frac{N}{\tau_e}, \qquad g(N) = a\,(N - N_{tr})
```

v_g = c/n_g is the group velocity; Γ ≈ 0.02–0.5 the confinement factor (fraction of the mode in the active layer); N_tr ≈ (1–2)×10¹⁸ cm⁻³ the transparency density; τ_p the photon lifetime. The mirrors are the cleaved crystal facets with R = ((n − 1)/(n + 1))² ≈ 0.32. Threshold and light–current characteristic:

```latex
\Gamma g_{th} = \alpha_i + \alpha_m, \quad \alpha_m = \frac{1}{2L}\ln\frac{1}{R_1R_2}; \qquad I_{th} = \frac{qV}{\eta_i\tau_e}\Big(N_{tr} + \frac{g_{th}}{a}\Big); \qquad P = \eta_i\,\frac{\alpha_m}{\alpha_i+\alpha_m}\,\frac{h\nu}{q}\,(I - I_{th})
```

Typical: L = 300 µm, I_th = 10–30 mA, slope efficiency ~0.5–1 W/A. The wavelength drifts with temperature by ~0.3 nm/K with mode hops. It emits from a ~1 µm × 3–100 µm stripe, so the beam is elliptical and strongly diverging: ~30–40° perpendicular to the junction and ~6–10° parallel to it. Without a collimating lens it looks nothing like a "laser beam" — the best example for the lens scene (Section 8).

### 5.8 Tunable media: dye and Ti:sapphire

- Both have a very broad gain band and are pumped by another laser. The wavelength is selected by a tuning element in the cavity (prism, grating, birefringent filter). In code this is a loss filter T(ν) multiplied by the gain curve; lasing occurs at the maximum of the product.
- **Dye:** molecules accumulate in a long-lived triplet state and absorb the laser light, so the solution is circulated as a jet.
- **Ti:sapphire:** the broadest band, so mode locking gives pulses of a few femtoseconds (Section 4.5). It relies on Kerr-lens mode locking — the same self-focusing as in §125 (Section 10).
- Another route to tunable output described in the book is the optical parametric oscillator (§126, Section 10).

## 6. Pumping

The pump sets one number in the equations of Section 4 — the rate W_p (or R_p, or current I) — but this is where most of the laser's overall efficiency is lost. Total efficiency is the product of a chain:

```latex
\eta_{\text{tot}} = \eta_{\text{source}}\cdot\eta_{\text{transfer}}\cdot\eta_{\text{abs}}\cdot\eta_q\cdot\eta_{\text{extr}}
```

Source (electricity → lamp or diode light), transfer (fraction of the light reaching the rod — this is where the reflector and lenses work), absorption (overlap of the spectrum with the absorption bands), quantum efficiency (Section 2.5) and extraction from the resonator (Section 3.6). The interface could show this chain as a "waterfall" of losses.

### 6.1 Flashlamp (ruby, Nd:glass)

A xenon lamp radiates roughly as a blackbody at T ~ 6000–10 000 K ("light close to white", §121). The spectrum is Planck's law; the absorbed fraction is the overlap of the spectrum with the absorption bands of a rod of diameter D:

```latex
M_\lambda(T) = \frac{2\pi h c^2}{\lambda^5}\,\frac{1}{e^{hc/\lambda kT}-1}, \qquad \eta_{\text{abs}} = \frac{\int M_\lambda\,\big(1 - e^{-\alpha(\lambda)D}\big)\,d\lambda}{\int M_\lambda\,d\lambda}, \qquad \alpha(\lambda) = \sigma_a(\lambda)\,N_t
```

For ruby the bands can be modelled as two Gaussians centred near 400 and 550 nm, each 50–100 nm wide. Calibrate against the book: 10–15% of the radiation goes into the bands. The pump rate per atom is W_p = ∫σ_a(λ)·Φ_λ(λ)dλ, where Φ_λ is the spectral photon flux at the rod.

Pulse shape: a capacitor C charged to U discharges through the lamp and an inductor L. Energy E = CU²/2, duration ~3√(LC); for visualization P(t) = P₀·(t/t_p)·e^{1 − t/t_p} with t_p ~ 0.3–1 ms, normalized so that ∫P dt = E, is enough. Per the book: 2–3 kV, ~1000 µF, ~1 ms flash.

### 6.2 Elliptical reflector — the simulator's first "lens"

The book (Fig. 347) shows two options: a helical lamp around the rod, or a straight lamp in a mirrored elliptical cylinder. The lamp sits on one focal line, the rod on the other: every ray from focus F₁ arrives at F₂ after reflection. This is an ideal scene for 2D ray tracing:

```latex
\frac{x^2}{a^2} + \frac{y^2}{b^2} = 1, \quad F_{1,2} = (\mp c,\,0),\ c = \sqrt{a^2-b^2}; \qquad \hat n \propto \Big(\frac{x}{a^2},\,\frac{y}{b^2}\Big); \qquad \vec d\,' = \vec d - 2(\vec d\cdot\hat n)\,\hat n
```

Algorithm: ray p + t·d from a random point of the lamp cross-section in a random direction → intersection with the ellipse (quadratic in t) → reflection with R_mirror ≈ 0.9 → check whether it hits the rod circle. The fraction of rays that hit is η_transfer. A point lamp gives 100%; a lamp of finite diameter is imaged at F₂ with an angle-dependent magnification, and some rays miss. Sliders: eccentricity e = c/a, lamp and rod diameters. A small e (nearly a circle) is usually better.

### 6.3 Diode end-pumping through a lens (Nd:YAG)

The output of an 808 nm laser diode is collimated and focused by a lens into the rod along the cavity axis, into a spot of radius w_p (Section 8). Absorption along the rod: P_abs(z) = P₀(1 − e^{−αz}); for 1% Nd:YAG at 808 nm α ~ 5–10 cm⁻¹. The threshold depends on how well the pump spot matches the laser mode of radius w_L (both Gaussian) — the Fan–Byer formula:

```latex
P_{th} = \frac{\pi\,h\nu_p\,(w_L^2 + w_p^2)\,(T + L_i)}{4\,\sigma\,\tau\,\eta}
```

η is the fraction of absorbed pump that reaches the upper level; T + L_i the round-trip loss. Example: w_L = w_p = 200 µm, T + L_i = 5%, η = 0.9 → P_th ≈ 0.13 W. The lesson for the simulator: the tighter the lens focuses the pump, the lower the threshold. But if it focuses too tightly the spot spreads out before the end of the rod: the pump Rayleigh range is z_R = πw_p²n/(M²λ), and a diode has M² ~ 10–100 along the junction.

### 6.4 Gas discharge (He-Ne, Ar⁺, CO₂)

Atoms are excited by electron impact; the electron density is proportional to the current, so W_p ∝ I. In He-Ne helium is excited and neon receives the energy through collisions (Section 5.5). The upper neon level saturates as the current rises, while the lower one grows linearly, so there is an optimum current. A simple phenomenological model:

```latex
N_2 = \frac{a I}{1 + I/I_{\text{sat}}}, \qquad N_1 = b I, \qquad \Delta N(I) = N_2 - N_1 \to \max \text{ at } I_{\text{opt}} = I_{\text{sat}}\Big(\sqrt{a/b} - 1\Big)
```

Choose a, b, I_sat so that I_opt is tens of mA and the peak g₀ is ~0.1 m⁻¹ at D = 7 mm (g₀ ∝ 1/D).

### 6.5 Current injection (semiconductor)

The pump is simply the term η_i·I/(qV) in the carrier equation (Section 5.7), η_i ≈ 0.8–1. This is the most efficient method: electrons turn into photons with practically no intermediaries, and the wall-plug efficiency reaches 50–70%.

## 7. Resonator mirrors: stability and beam shape (§120, item 6)

The mirror shape decides whether the resonator keeps a ray near the axis. If the g-parameters satisfy 0 ≤ g₁g₂ ≤ 1, a ray bounces back and forth indefinitely; otherwise it walks off the mirror edge after a few passes. The book notes that long-radius spherical and confocal mirrors reduce losses and simplify alignment — exactly what the simulator should show.

### 7.1 Stability criterion

In this section R₁, R₂ are the mirror radii of curvature (positive for a concave mirror facing the cavity, ∞ for a plane mirror), not the reflectivities of Section 3; g₁, g₂ are the resonator g-parameters, unrelated to the level degeneracies of Section 1:

```latex
g_1 = 1 - \frac{L}{R_1}, \qquad g_2 = 1 - \frac{L}{R_2}, \qquad 0 \le g_1g_2 \le 1
```

| Resonator type | R₁, R₂ | g₁g₂ | What the simulator shows |
| --- | --- | --- | --- |
| Plane-parallel (Fabry–Perot, Fig. 345) | ∞, ∞ | 1, boundary | large mode volume, diffraction losses, extremely sensitive to tilt |
| Long-radius | R ≫ L | just below 1 | large mode volume, already stable |
| Confocal (foci at the centre) | L, L | 0 | smallest spot on the mirrors, least sensitive to tilt |
| Hemispherical | ∞, L | 0, boundary | focal point on the plane mirror, common in He-Ne |
| Concentric | L/2, L/2 | 1, boundary | point-like waist at the centre, very sensitive |
| Unstable (e.g. a convex mirror) | — | > 1 or < 0 | rays walk off; only for very high-gain media |

The simulator can draw a stability diagram: the (g₁, g₂) plane, the stable region between the hyperbola g₁g₂ = 1 and the axes, and a point for the current resonator that moves with the L, R₁, R₂ sliders.

### 7.2 Gaussian mode of a stable resonator

A stable resonator forms a Gaussian beam whose wavefronts match the mirror surfaces. Waist radius w₀, spot radii on the mirrors w₁, w₂, and waist position z₁ (measured from mirror 1):

```latex
w_0^2 = \frac{\lambda L}{\pi}\sqrt{\frac{g_1g_2(1-g_1g_2)}{(g_1+g_2-2g_1g_2)^2}}, \qquad w_{1}^2 = \frac{\lambda L}{\pi}\sqrt{\frac{g_2}{g_1(1-g_1g_2)}}, \qquad w_{2}^2 = \frac{\lambda L}{\pi}\sqrt{\frac{g_1}{g_2(1-g_1g_2)}}, \qquad z_1 = \frac{L\,g_2(1-g_1)}{g_1+g_2-2g_1g_2}
```

For the confocal resonator the formulas simplify: w₀ = √(λL/2π), w = √(λL/π) on the mirrors, divergence θ = λ/(πw₀). He-Ne example, L = 1 m: w₀ ≈ 0.32 mm, θ ≈ 0.6 mrad ≈ 2′ — the 1–2′ of §122. At the boundary points (g₁g₂ = 0 or 1) the formulas give 0 or ∞ — the code needs a guard, and the interface a warning "resonator at the stability boundary".

### 7.3 General method: ABCD matrices

If the cavity contains a lens (thermal, Kerr) or a rod with n ≠ 1, the simplest approach is to multiply the element matrices over a full round trip. A ray is described by its height y and angle θ:

```latex
\begin{pmatrix} y' \\ \theta' \end{pmatrix} = \begin{pmatrix} A & B \\ C & D \end{pmatrix}\begin{pmatrix} y \\ \theta \end{pmatrix}; \quad \text{free space } d:\ \begin{pmatrix} 1 & d \\ 0 & 1 \end{pmatrix}; \quad \text{thin lens } f:\ \begin{pmatrix} 1 & 0 \\ -1/f & 1 \end{pmatrix}; \quad \text{mirror } R:\ f = R/2
```

A slab of medium of length l and index n is replaced in the beam formulas by free space d = l/n. The round-trip matrix M immediately gives the stability and the mode parameters at the chosen reference plane:

```latex
m = \frac{A+D}{2}, \quad |m| < 1; \qquad \frac{1}{q} = \frac{D-A}{2B} - i\,\frac{\sqrt{1-m^2}}{|B|}; \qquad w^2 = \frac{\lambda\,|B|}{\pi\sqrt{1-m^2}}, \qquad R_{\text{wf}} = \frac{2B}{D-A}
```

q is the complex beam parameter (Section 8.4), R_wf the wavefront radius of curvature. For an empty two-mirror resonator m = 2g₁g₂ − 1, and the condition |m| < 1 coincides with 7.1 — a good test for the code. In the two planes (x and y) the matrices may differ: cylindrical lens, a spherical mirror at an angle, Brewster windows.

### 7.4 Transverse modes: bright spots and dark lines

The book describes the beam cross-section as "a system of bright spots separated by dark nodal lines". For spherical mirrors these are the Hermite–Gaussian modes TEM_mn:

```latex
I_{mn}(x,y) \propto \Big[H_m\!\Big(\tfrac{\sqrt2\,x}{w}\Big)\,e^{-x^2/w^2}\Big]^2\Big[H_n\!\Big(\tfrac{\sqrt2\,y}{w}\Big)\,e^{-y^2/w^2}\Big]^2, \qquad H_0 = 1,\ H_1 = 2u,\ H_2 = 4u^2-2,\ H_3 = 8u^3-12u
```

```latex
\nu_{qmn} = \frac{c}{2L}\Big[q + (m+n+1)\,\frac{\arccos\big(\pm\sqrt{g_1g_2}\big)}{\pi}\Big]
```

The "+" sign for g₁, g₂ > 0, "−" for g₁, g₂ < 0. TEM_mn modes are wider than TEM₀₀, so an aperture of radius a clips them more. For TEM₀₀ the fractional loss at the aperture per pass is exp(−2a²/w²); for higher modes integrate the profile numerically. The modes that lase are those whose gain exceeds their losses including the aperture. An aperture slider visibly turns a "spotty" beam into a clean TEM₀₀. The measure of diffraction loss is the Fresnel number N_F = a²/(λL): for N_F ≫ 1 the losses are small.

### 7.5 Mirror tilt (alignment)

Tilting mirror 2 by an angle ε shifts the mode axis. The displacements at the mirrors are:

```latex
\Delta x_1 = \frac{\varepsilon L}{1 - g_1g_2}, \qquad \Delta x_2 = \frac{\varepsilon L\,g_1}{1 - g_1g_2}
```

For a plane-parallel resonator (g₁g₂ → 1) the displacement goes to infinity: the slightest tilt sends the beam into the wall. For the confocal one (g₁g₂ = 0) it is minimal — which is why the book says such mirrors "simplify alignment". When the displacement becomes comparable to the aperture radius, the simulator increases the losses and lasing stops.

### 7.6 Physical mode: Fox–Li iteration

For plane mirrors the Gaussian formula does not apply. The honest approach is Fox–Li iteration. Take an arbitrary initial field E₀(x, y) on a mirror and repeat: clip with the aperture, multiply by the mirror phase exp(−ik·r²/R), propagate over L with the angular-spectrum method (FFT → multiply → inverse FFT):

```latex
E(x,y,z+L) = \mathcal F^{-1}\Big\{\mathcal F\{E(x,y,z)\}\cdot e^{\,iL\sqrt{k^2 - k_x^2 - k_y^2}}\Big\}
```

After tens to hundreds of passes the profile converges to the lowest-loss mode, and the power ratio between successive passes gives the diffraction loss. In a browser this is feasible on a 128×128 grid or for a 1D cross-section. It is the most honest illustration of the book's statement that the resonator "collimates" the light: a clean mode grows out of noise.

## 8. Lenses and beam optics

Lenses in the simulator are computed with two models: a ray model (exact Snell's-law ray tracing, which shows aberrations) and a wave model (Gaussian beam, which shows the waist and the diffraction limit). Lamp light is treated only as rays; the laser beam both ways. The difference between the two is exactly what shows how laser light differs from ordinary light.

### 8.1 Lens catalogue for the selector

The focal length of any spherical lens of thickness d with surface radii R₁, R₂ (positive if the centre of curvature lies to the right of the surface) is given by the lensmaker's equation (§§10–12 of the book):

```latex
\frac{1}{f} = (n-1)\left[\frac{1}{R_1} - \frac{1}{R_2} + \frac{(n-1)\,d}{n\,R_1R_2}\right], \qquad \frac{1}{s} + \frac{1}{s'} = \frac{1}{f}
```

| Lens | R₁, R₂ | f | Role in the simulator |
| --- | --- | --- | --- |
| Biconvex | R₁ > 0, R₂ < 0 | > 0 | basic converging lens, focusing on a target |
| Plano-convex | R₁ > 0, R₂ = ∞ | > 0 | focusing a laser beam with minimum spherical aberration (curved side towards the collimated beam) |
| Biconcave, plano-concave | R₁ < 0, R₂ > 0 | < 0 | diverging lens; first lens of a Galilean telescope |
| Meniscus | R₁, R₂ of the same sign | any | aberration correction, weak-power windows |
| Thick lens (§12) | any + d | from the formula above | principal planes shifted inside the lens |
| Asphere | conic constant k + coefficients A₄, A₆ | > 0 | collimating a diode with no spherical aberration |
| Cylindrical | curved in one plane only | f_x or f_y | correcting the elliptical, astigmatic diode beam |
| Spherical mirror | R | R/2 | resonator mirrors (Section 7), no chromatic aberration |
| Keplerian / Galilean telescope | two lenses separated by f₁ + f₂ | ∞ (afocal) | beam expander, spatial filter |
| Thermal lens of the rod | index gradient n(r) | depends on pump | changes resonator stability (8.7) |
| Kerr (nonlinear) lens | n = n₀ + n₂I | depends on power | self-focusing (Section 10) |

Matrix of a refracting surface for a ray (y, θ) going from medium n₁ into n₂; a thick lens is the product S₂·T(d)·S₁:

```latex
S = \begin{pmatrix} 1 & 0 \\ \dfrac{n_1 - n_2}{n_2 R} & \dfrac{n_1}{n_2} \end{pmatrix}, \qquad T(d) = \begin{pmatrix} 1 & d \\ 0 & 1 \end{pmatrix}
```

### 8.2 Exact ray tracing

ABCD matrices are valid only for small angles. To show the aberrations of §§15–16, every ray must be traced exactly. Intersection of a ray p + t·d with a sphere of centre C: |p + td − C|² = R² (a quadratic equation). Refraction uses the vector form of Snell's law (î the unit ray direction, n̂ the surface normal facing the ray):

```latex
\eta = \frac{n_1}{n_2},\quad c_1 = -\hat n\cdot\hat\imath,\quad c_2 = \sqrt{1 - \eta^2(1-c_1^2)}; \qquad \hat t = \eta\,\hat\imath + (\eta c_1 - c_2)\,\hat n
```

A negative number under the root means total internal reflection (it is also what works in the rotating prism of §121). Reduce the ray's intensity by the Fresnel reflection (Section 9). An aspheric surface is given by its sag; the intersection is found by Newton's method:

```latex
z(r) = \frac{r^2/R}{1 + \sqrt{1 - (1+k)\,r^2/R^2}} + A_4 r^4 + A_6 r^6
```

Chromatic aberration (§16): the refractive index of the glass is given by the Sellmeier equation (λ in µm):

```latex
n^2(\lambda) = 1 + \sum_{i=1}^{3}\frac{B_i\lambda^2}{\lambda^2 - C_i}
```

| Glass | B₁ | B₂ | B₃ | C₁, µm² | C₂, µm² | C₃, µm² |
| --- | --- | --- | --- | --- | --- | --- |
| N-BK7 | 1.03961212 | 0.231792344 | 1.01046945 | 0.00600069867 | 0.0200179144 | 103.560653 |
| Fused silica | 0.6961663 | 0.4079426 | 0.8974794 | 0.0046791 | 0.0135121 | 97.934003 |

White lamp light fans out into colours behind a lens: blue focuses closer than red. The laser beam is monochromatic and shows no colour fringes. Spherical aberration appears automatically: marginal rays cross the axis closer than paraxial ones, and the caustic becomes visible (§14). Flipping a plano-convex lens so that its flat side faces the beam makes the aberration noticeably larger — a good visual experiment.

### 8.3 Why a lens cannot make a laser out of a lamp

Passive optics cannot increase the radiance of a source (§23). Equivalently, the product of beam area and solid angle (the étendue) is conserved:

```latex
G = n^2 A\,\Omega = \text{const}, \qquad G_{\text{laser}} \approx (M^2\lambda)^2, \qquad G_{\text{lamp}} \approx A_{\text{lamp}}\cdot 2\pi
```

A lamp can be focused only into its own image (filament size × s′/s), and an attempt to collimate its light gives a wide, diverging beam. A laser focuses to a spot of order λ. The measure of the difference is the effective (brightness) temperature of the radiation (Problem 2 to §121) — the temperature of a blackbody with the same spectral radiance:

```latex
T_{\text{eff}} = \frac{c^2\,W}{2k\,\nu^2\,\delta\nu\;\delta\Omega\;S} \;\xrightarrow{\;S\,\delta\Omega\,\approx\,\lambda^2\;}\; \frac{W}{2k\,\delta\nu}
```

Sivukhin does not write out the area S, and for He-Ne (W = 10 mW, δν = 10⁴ Hz, δθ = 1′) he gets ~10¹⁵ K. That corresponds to S ≈ 1 cm²; for a diffraction-limited beam the right-hand formula gives ~4×10¹⁶ K. Either way it is 10¹¹–10¹² times hotter than the Sun. A good indicator for the interface: a lamp's brightness temperature is ~10⁴ K versus ~10¹⁵ K for the laser, and no lens can raise the former.

### 8.4 The Gaussian beam and how a lens transforms it

A TEM₀₀ laser beam in a medium of index n (λ is the vacuum wavelength; M² = 1 for an ideal beam):

```latex
w(z) = w_0\sqrt{1 + \Big(\frac{z}{z_R}\Big)^2}, \quad z_R = \frac{\pi w_0^2 n}{M^2\lambda}, \quad R(z) = z\Big[1 + \Big(\frac{z_R}{z}\Big)^2\Big], \quad \theta = \frac{M^2\lambda}{\pi n w_0}, \quad \zeta(z) = \arctan\frac{z}{z_R}
```

It is most convenient to work with the complex beam parameter q = z + i·z_R. It passes through any optics by the same ABCD matrix as the rays:

```latex
q_2 = \frac{A q_1 + B}{C q_1 + D}, \qquad \frac{1}{q} = \frac{1}{R} - i\,\frac{M^2\lambda}{\pi n w^2}
```

Waist behind a thin lens f, if the input waist w₀₁ is at a distance s in front of the lens (Self's formula):

```latex
M_{\text{mag}} = \frac{f}{\sqrt{(s-f)^2 + z_{R1}^2}}, \qquad w_{02} = M_{\text{mag}}\,w_{01}, \qquad s' - f = M_{\text{mag}}^2\,(s - f)
```

The key visual consequence: a Gaussian beam focuses neither to a point nor at the geometric focus. If the input waist sits at the front focal point (s = f), the output waist ends up at the back focal point. A collimated beam of radius w is focused to:

```latex
w_f \approx \frac{M^2\lambda f}{\pi w}, \qquad 2z_{R,f} = \frac{2\pi w_f^2}{M^2\lambda} \quad (\text{depth of focus})
```

For a uniform circular beam of radius r (as in Problem 1 to §121) the result is instead an Airy disk of radius 0.61·fλ/r. Typical M²: He-Ne 1.0–1.1; CO₂ 1.1–2; Nd:YAG in TEM₀₀ ~1.1, multimode 10–50; free-running ruby tens and more; diode ~1 perpendicular to the junction and 10–30 parallel to it (for a broad-area emitter).

### 8.5 Telescope, beam expander and spatial filter

Two lenses separated by f₁ + f₂. In a Keplerian telescope both lenses are converging and there is a focus inside; in a Galilean telescope f₁ < 0 and there is no internal focus (important for high-power pulses — no air breakdown):

```latex
|M| = \Big|\frac{f_2}{f_1}\Big|, \qquad w_{\text{out}} = |M|\,w_{\text{in}}, \qquad \theta_{\text{out}} = \frac{\theta_{\text{in}}}{|M|}, \qquad w\,\theta = \frac{M^2\lambda}{\pi} = \text{const}
```

Expanding the beam 10× reduces the divergence 10× (and allows focusing to a 10× smaller spot), but the product w·θ does not change. A pinhole of ~1.5–2 times the spot diameter 2w_f can be placed at the focus of a Keplerian telescope. This is a spatial filter: it removes high spatial frequencies and cleans up the beam profile.

### 8.6 Collimating a semiconductor laser

From a ~1 µm stripe the light diverges by θ⊥ ≈ 30–40° (the "fast axis"); from a stripe several microns wide, by θ∥ ≈ 6–10° (the "slow axis"). After an aspheric lens of focal length f the beam is parallel but elliptical:

```latex
D_\perp \approx 2f\tan\frac{\theta_\perp}{2}, \qquad D_\parallel \approx 2f\tan\frac{\theta_\parallel}{2}, \qquad \frac{D_\perp}{D_\parallel} \approx 3\text{–}4
```

A spherical lens cannot make the beam round — it acts on both axes equally. You need a cylindrical telescope magnifying one axis by D⊥/D∥ (or an anamorphic prism pair). In addition, the virtual sources for the two axes are separated by the astigmatic distance (a few to tens of microns), and a single lens cannot collimate both at once. In code, rays and q-parameters are computed separately in the x and y planes, and the profile is drawn as a w_x × w_y ellipse.

### 8.7 Thermal lens in the gain medium

More than half of the energy absorbed by ruby turns into heat (§121, item 3). The rod is cooled from its side surface, so the centre is hotter than the edge and the refractive index falls off parabolically towards the edge. The rod becomes a converging lens. For uniform heating with power P_h of a rod with cross-section A and thermal conductivity K:

```latex
\Delta T(r) = \frac{Q\,(r_0^2 - r^2)}{4K},\quad Q = \frac{P_h}{A\,l}; \qquad f_{\text{th}} \approx \frac{2KA}{P_h\,(dn/dT)}
```

This is only the main (thermo-optic) contribution; stress and end-face bulging strengthen the lens by another ~20–30%. Example: Nd:YAG rod 6 mm in diameter, K ≈ 14 W/(m·K), dn/dT ≈ 7.3×10⁻⁶ K⁻¹, P_h = 100 W → f ≈ 1 m. For end pumping with spot radius w_p: f ≈ πKw_p²/(P_h·dn/dT). In the simulator the thermal lens is inserted into the cavity round-trip matrix (Section 7.3). As pump power rises the resonator can leave the stability region, and the laser goes out precisely when it is "pumped harder" — a nice counter-intuitive effect.

### 8.8 Focusing on a target: field and radiation pressure

Problem 1 to §121 is a ready-made test for the "laser + lens + target" scene. In SI (I is intensity, E₀ the field amplitude; Sivukhin gives the rms value E₀/√2):

```latex
I = \frac{W}{S}, \qquad E_0 = \sqrt{\frac{2I}{c\,\varepsilon_0\,n}}, \qquad p_{\text{rad}} = \frac{I}{c}\ (\text{absorber}),\ \ \frac{2I}{c}\ (\text{mirror})
```

Ruby, 100 MW on 1 cm²: E_rms ≈ 1.94×10⁵ V/cm, pressure ≈ 0.033 atm. After a lens with f = 5 cm (Airy disk): E ≈ 2.9×10⁸ V/cm, pressure ≈ 7.4×10⁴ atm. Matter at the focus vaporizes instantly and turns into plasma. The simulator can show this as a threshold: if the focal intensity exceeds ~10⁹–10¹¹ W/cm² (depending on material and pulse duration), draw a plasma flash.

## 9. Polarization and Q-switches (§121, items 4, 6–8; §122)

A laser is polarized only if the cavity contains an element with different losses or different gain for the two polarizations. The polarization that reaches threshold first lases; saturation then suppresses the other one. In code two photon variables φ_p and φ_s with their own losses and cross sections and a shared inversion are enough.

### 9.1 Reflection at an interface and Brewster windows

Fresnel equations (§65) for the amplitudes of s-polarization (E perpendicular to the plane of incidence) and p-polarization (E in the plane of incidence); power reflectance R = r²:

```latex
r_s = \frac{n_1\cos\theta_i - n_2\cos\theta_t}{n_1\cos\theta_i + n_2\cos\theta_t}, \qquad r_p = \frac{n_2\cos\theta_i - n_1\cos\theta_t}{n_2\cos\theta_i + n_1\cos\theta_t}, \qquad \tan\theta_B = \frac{n_2}{n_1}
```

At normal incidence R = ((n − 1)/(n + 1))²: 7.6% for ruby, as in the book. At Brewster's angle r_p = 0: the p-wave passes without loss, while the s-wave loses R_s at each surface. For glass with n = 1.5: θ_B = 56.3°, R_s ≈ 0.15. In a He-Ne laser with two windows there are 8 surfaces per round trip, and the s-wave keeps (0.85)⁸ ≈ 0.28 of its power. With gain of a few percent it never reaches threshold, so the laser emits linear polarization in the plane of incidence (§122). For a ruby rod with angled end faces, the internal Brewster angle is arctan(1/1.76) ≈ 30°, as in §121, item 6.

For an accurate treatment of polarization in any layout, use Jones vectors and matrices:

```latex
\vec E = \begin{pmatrix} E_x \\ E_y \end{pmatrix}; \quad P_x = \begin{pmatrix} 1 & 0 \\ 0 & 0 \end{pmatrix}; \quad W(\Gamma) = \begin{pmatrix} e^{-i\Gamma/2} & 0 \\ 0 & e^{i\Gamma/2} \end{pmatrix}; \quad R(\alpha) = \begin{pmatrix} \cos\alpha & \sin\alpha \\ -\sin\alpha & \cos\alpha \end{pmatrix}
```

An element rotated by an angle α is R(−α)·J·R(α). A Brewster plate in amplitude: diag(1, 1 − R_s) per pass through the plate (two surfaces).

### 9.2 Polarization of the ruby laser

Observations from the book: if the crystal's optic axis coincides with the rod axis, the light is unpolarized; at an angle of 60–90° the polarization is complete, with E perpendicular to the optic axis. The book explains this by the extraordinary ray travelling at an angle to the wave normal (walk-off) and leaving through the side wall. The walk-off angle ρ for a wave normal at an angle θ to the optic axis (§81):

```latex
\tan(\theta + \rho) = \frac{n_o^2}{n_e^2}\,\tan\theta
```

In ruby the walk-off is small (ρ ≤ 0.3°) and is zero at θ = 90°, which is exactly where the polarization is strongest. So in the model it is more reliable to rely on another fact, standard in laser physics: the cross section of the 694.3 nm line for E ⊥ c (σ-polarization) is about twice that for E ∥ c (π-polarization). For the c-axis at an angle ψ to the rod axis:

```latex
\sigma_{\text{o}} = \sigma_\perp, \qquad \sigma_{\text{e}}(\psi) = \sigma_\perp\cos^2\psi + \sigma_\parallel\sin^2\psi, \qquad \sigma_\perp \approx 2\,\sigma_\parallel
```

At ψ = 0 both polarizations are equivalent — the light is unpolarized. As ψ → 90° the ordinary wave wins on gain and suppresses the extraordinary one. This reproduces all of the book's observations. Walk-off can be kept as an additional small loss for the e-wave.

### 9.3 Pockels and Kerr cells

Layout of Fig. 349: the polarizer passes the rod's polarization, the cell is rotated by 45°. The cell introduces a phase retardation Γ between its axes; over a double pass 2Γ = π rotates the polarization by 90°, and the polarizer blocks it:

```latex
\text{Pockels: } \Gamma = \pi\,\frac{V}{V_\pi},\ \ V_\pi = \frac{\lambda}{2n_o^3 r_{63}}; \qquad \text{Kerr: } \Gamma = 2\pi K\,l\,\frac{V^2}{d^2}; \qquad T_{\text{round trip}} = \cos^2\Gamma
```

The Pockels cell is linear in voltage (§91), the Kerr cell quadratic (§90; K is the Kerr constant). The shutter is closed at Γ = π/2, i.e. at the quarter-wave voltage V_λ/4 = V_π/2; for a KD*P crystal at 1064 nm that is a few kV. It is opened by removing the voltage within nanoseconds. In the rate equations this is an additional round-trip loss −ln T_round trip(t).

### 9.4 Bleachable filter (saturable absorber)

This is the very two-level system of Section 2.1: at high intensity the populations equalize and the filter becomes transparent (§89, item 6). For the code — one more equation for the density of absorbing molecules in the ground state N_g (out of a total density N_a, both in m⁻³) and a loss in the photon equation:

```latex
\frac{dN_g}{dt} = \frac{N_a - N_g}{\tau_a} - \frac{c}{n}\,\sigma_a N_g\,S, \qquad \gamma_a(t) = \sigma_a N_g(t)\,l_a, \qquad \alpha(I) = \frac{\alpha_0}{1 + I/I_{\text{sat},a}},\ \ I_{\text{sat},a} = \frac{h\nu}{\sigma_a\tau_a}
```

Condition for it to work as a Q-switch: the absorber must saturate more easily than the gain medium, i.e. σ_a/A_a ≫ σ/A (A is the beam area in each element). Under a continuous flash the model by itself produces a train of pulses, as in the book: after each pulse the filter darkens again within τ_a, the inversion builds up, and everything repeats.

### 9.5 Rotating prism

A total-internal-reflection prism replaces a mirror (Fig. 348); rotation angle θ(t) = Ωt, Ω = 2π·500 s⁻¹. The cavity is "aligned" only while θ is smaller than a tolerance θ_tol ~ the beam divergence (~1 mrad). The effective reflectivity can be modelled phenomenologically: R_eff(t) = R·exp(−(Ωt/θ_tol)²). The opening window is ~θ_tol/Ω ≈ 0.3 µs, while the pulse builds up in ~10⁻⁸ s. So the prism, as the book says, "has no time to move". If the simulator slows the rotation down by a factor of hundreds, several weak pulses appear instead of one giant pulse.

## 10. Nonlinear optics: frequency doubling, self-focusing, parametric oscillator (§§123–126)

In a high-power beam the polarization of the medium is no longer linear in the field, and this gives three modules for the simulator. A doubling crystal turns the red ruby beam into UV and the infrared neodymium beam into green. Self-focusing gives a lens whose strength depends on power. A parametric oscillator changes colour smoothly as the crystal is rotated.

### 10.1 Nonlinear polarization

The book's formula (123.2), in Gaussian units, and its SI form via susceptibilities (d_eff = χ⁽²⁾/2):

```latex
P = \alpha E + \alpha_2 E^2 + \alpha_3 E^3 + \ldots \qquad\Longleftrightarrow\qquad P = \varepsilon_0\big(\chi^{(1)}E + \chi^{(2)}E^2 + \chi^{(3)}E^3 + \ldots\big)
```

In a centrosymmetric medium (glass, liquids, gases) all even-order terms vanish and there is no second harmonic (§123). So in the simulator a doubler can only be a non-centrosymmetric crystal (KDP, quartz, LiNbO₃), while self-focusing works in any medium.

### 10.2 Second harmonic and phase matching (§124)

The quadratic term gives a static polarization (optical rectification) and a wave at 2ω (124.1). The driven and free waves at 2ω travel at different speeds, and energy is periodically pumped back and forth (124.4–124.6):

```latex
I_{2\omega}(x) \propto I_\omega^2\,x^2\Big(\frac{\sin\beta}{\beta}\Big)^2, \qquad \beta = \frac{\Delta k\,x}{2},\ \ \Delta k = 2k(\omega) - k(2\omega), \qquad L_{\text{coh}} = \frac{\lambda}{4\,|n(\omega) - n(2\omega)|}
```

For the absolute efficiency in SI (crystal length L, λ_ω the fundamental wavelength). The second formula accounts for depletion of the fundamental at phase matching and keeps the code from returning more than 100% — the book states explicitly that at large x the first approximation breaks down:

```latex
\eta_0 = \frac{8\pi^2 d_{\text{eff}}^2 L^2 I_\omega}{n_\omega^2\, n_{2\omega}\,\varepsilon_0\, c\,\lambda_\omega^2}\,\mathrm{sinc}^2\Big(\frac{\Delta k L}{2}\Big), \qquad \eta \approx \tanh^2\sqrt{\eta_0}\ \ (\Delta k = 0)
```

In an isotropic medium n(ω) < n(2ω), L_coh is tens of microns, and in Franken's experiment (1961, ruby → 347 nm in quartz) ~10⁻⁸ of the energy went into the harmonic. The fix is phase matching between the ordinary wave at ω and the extraordinary wave at 2ω in a uniaxial crystal (Fig. 353). The condition n_e(2ω, θ) = n_o(ω) gives the phase-matching angle (type I, o + o → e, negative uniaxial crystal):

```latex
\frac{1}{n_e^2(\theta)} = \frac{\cos^2\theta}{n_o^2} + \frac{\sin^2\theta}{n_e^2}, \qquad \sin^2\theta_m = \frac{n_o^{-2}(\omega) - n_o^{-2}(2\omega)}{n_e^{-2}(2\omega) - n_o^{-2}(2\omega)}
```

Refractive indices of KDP at any wavelength (λ in µm; Zernike's Sellmeier fit):

```latex
n_o^2 = 2.259276 + \frac{0.01008956}{\lambda^2 - 0.012942625} + \frac{13.00522\,\lambda^2}{\lambda^2 - 400}, \qquad n_e^2 = 2.132668 + \frac{0.008637494}{\lambda^2 - 0.012281043} + \frac{3.2279924\,\lambda^2}{\lambda^2 - 400}
```

Check: n_o(1064) = 1.4938, n_e(1064) = 1.4599, n_o(532) = 1.5124, n_e(532) = 1.4705 → θ_m ≈ 41°. The book gives 41°35′ — agreement within the accuracy of the data. For the current crystal angle the simulator computes Δk(θ) = (4π/λ_ω)·[n_o(ω) − n_e(2ω, θ)] and plugs it into sinc². This reproduces the demonstration from the book: the crystal is rotated slowly, and within a narrow range of angles the invisible 1060 nm beam produces a "dazzlingly bright green beam" at 530 nm. d_eff for KDP is of order 0.3–0.4 pm/V.

The same mechanism gives sum and difference frequencies ω₁ ± ω₂ (down to 80 nm in the UV, §124, item 5) and the third harmonic via α₃ (ruby → 231.3 nm in calcite, §125). In the photon picture two photons ħω merge into one at 2ω (§126, item 3).

### 10.3 Self-focusing — the "nonlinear lens" (§125)

The cubic term changes the refractive index in proportion to intensity (electrostriction, the high-frequency Kerr effect and heating do the same). For n₂ > 0 the centre of the beam is optically denser than its edges, and the medium itself becomes a converging lens:

```latex
n = n_0 + n_2 A^2\ \ (\text{book, Gaussian units}) \qquad n = n_0 + n_2^{I}\,I\ \ (\text{SI}), \qquad n_2^{I} = \frac{8\pi\,n_2}{c\,n_0}
```

Threshold: the diffraction divergence equals the angle of total internal reflection from the beam's "wall" (Fig. 354). The book's formulas (125.3) and (125.4), and the more accurate ones for a Gaussian beam (Marburger):

```latex
P_{\text{th}} \approx c\,\frac{(0.61\lambda)^2}{16\,n_2},\quad l_{\text{sf}} \approx \frac{n_0 D^2}{2.44\,\lambda}; \qquad P_{\text{cr}} = \frac{3.77\,\lambda^2}{8\pi n_0 n_2^{I}}, \quad z_{\text{sf}} = \frac{0.367\,z_R}{\sqrt{\big(\sqrt{P/P_{\text{cr}}} - 0.852\big)^2 - 0.0219}}
```

Check against the book: CS₂ (n₂ = 2×10⁻¹¹ esu, n₀ = 1.62), ruby: P_th ≈ 17 kW, and for D = 1 mm l_sf ≈ 96 cm. By Marburger, fused silica at 1064 nm (n₂ ≈ 2.7×10⁻²⁰ m²/W) gives P_cr ≈ 4 MW.

Below threshold a thin layer of nonlinear medium is just a thin lens whose focal length depends on the beam power. This is how it should be added to the lens selector (thin-lens matrix from 7.3):

```latex
\frac{1}{f_{\text{Kerr}}} = \frac{4\,n_2^{I} I_0\,l}{w^2} = \frac{8\,n_2^{I} P\,l}{\pi w^4}
```

Kerr-lens mode locking of Ti:sapphire works this way: a pulse with high peak power focuses itself through an aperture and loses less than weak CW light.

### 10.4 Optical parametric oscillator (§126)

A strong pump wave at ω_p splits into two waves, the signal ω_s and the idler ω_i (one photon splits into two). This requires energy conservation (126.1) and phase matching (126.3):

```latex
\omega_p = \omega_s + \omega_i, \qquad \vec k_p = \vec k_s + \vec k_i \;\xrightarrow{\text{collinear}}\; \frac{n_e(\lambda_p,\theta)}{\lambda_p} = \frac{n_o(\lambda_s)}{\lambda_s} + \frac{n_o(\lambda_i)}{\lambda_i}, \quad \frac{1}{\lambda_i} = \frac{1}{\lambda_p} - \frac{1}{\lambda_s}
```

In an isotropic medium with normal dispersion this is impossible: k_p is always larger than k_s + k_i (§126, item 2). In a crystal phase matching is achieved between an extraordinary pump and ordinary signal and idler waves (case 2 of (126.4), suitable both for KDP and for LiNbO₃). Tuning-curve algorithm: for each angle θ find the root λ_s ∈ (λ_p, 2λ_p] of the equation above by bisection; the idler follows from energy conservation. The point λ_s = λ_i = 2λ_p is the degenerate regime. Single-pass gain at Δk = 0:

```latex
G = \cosh^2(\Gamma L), \qquad \Gamma^2 = \frac{8\pi^2 d_{\text{eff}}^2\, I_p}{n_p\, n_s\, n_i\,\varepsilon_0\, c\,\lambda_s\lambda_i}
```

Oscillation starts when G per cavity round trip exceeds the losses — the same logic as for the laser in Section 3, and it also starts from noise. The pump is the second or third harmonic of a ruby or neodymium laser. Per the book, efficiency reaches several percent at output powers of tens to hundreds of kW. Rotating the crystal sweeps through the whole visible range and far into the IR.

## 11. From physics to simulation

This is not code yet, but the logic to agree on before writing code. The main difficulty is the scales: times from 10⁻¹² s (a mode-locked pulse) to 10⁻³ s (a flash), photon numbers from 1 to 10¹⁸.

### 11.1 Simulation state

| Part | What it stores | When it is recomputed |
| --- | --- | --- |
| Medium config | levels, transitions, σ(ν), τ, n, thermal properties (table 5.1) | when the medium is changed; dynamics reset |
| Resonator config | L, R₁, R₂ (radii), mirror reflectivities, aperture, list of elements with positions | on any change → stability, w, τ_c, g_th |
| Pump config | type, P(t) or I(t), spectrum, pump optics | continuously |
| Dynamics | populations Nᵢ (or N for a diode), photons φ per mode and polarization, absorber N_g, rod temperature | every integrator step |
| Output optics | list of lenses, crystals, targets with positions | on change → recompute rays and q(z) |

A key principle: every optical element implements the same set of methods — ABCD matrices for x and y, exact surface geometry for ray tracing, transmission for each polarization, and wavelength dependence. Then a lens, a mirror, a Brewster window and a Kerr lens are interchangeable, and the lens selector is simply replacing one object in a list.

*Figure: how the simulator modules pass quantities to each other.*

```
[Pump] --W_p, I--> [Gain medium] --g0(nu), heat--> [Resonator]
                          ^                              |
                          +--------- photons phi --------+
                                                         |  P_out, beam q
                                                         v
[Screen & plots] <--light-- [Nonlinear crystal] <--I, lambda-- [Beam optics]
```

The only feedback loop is that resonator photons deplete the inversion of the medium; in addition, heating of the medium puts a thermal lens into the resonator (8.7). Everything else is computed along the chain from left to right and top to bottom.

### 11.2 Dimensionless equations for the integrator

It is convenient to bring the equations of 4.1 to dimensionless form. Let y = N/N_c (inversion in units of threshold), p = Bτ·φ (photons in saturation units), t′ = t/τ, x = R_pτ/N_c, ε = τ_c/τ. Then the whole dynamics of a four-level laser depends only on x(t), ε and β:

```latex
\frac{dy}{dt'} = x - y - y\,p, \qquad \varepsilon\,\frac{dp}{dt'} = (y-1)\,p + \beta\, y; \qquad \text{steady state: } y = 1,\ p = x - 1
```

Dimensional quantities are restored only for display (P_out from the formula in 4.1). Q-switching is simply a time-dependent threshold: the term (y − 1) becomes (y − γ(t)/γ₀).

### 11.3 Numerical scheme

- **Stiffness.** ε = τ_c/τ is ~10⁻⁶ for ruby, ~10⁻³ for a diode, ~1 for He-Ne. A fixed-step Runge–Kutta will either blow up or be very slow. Use an adaptive step (Dormand–Prince RK45) or an implicit scheme (Rosenbrock). The adaptive step shrinks during a pulse and grows where the photon number changes slowly, but an explicit method like RK45 has a stability limit: while the photon number sits at its spontaneous-emission level (below threshold, or while the inversion builds up before the first spike), ∂ṡ/∂s = −(1 − y)/ε, so the step cannot grow past about 3.3ε/(1 − y) in t′, a few τ_c. It stays correct but pays many steps: for ε = 10⁻⁶ and x = 0.5, 3τ of pumping takes about 6×10⁵ steps. An implicit scheme has no such limit. Measured in build stage 7 (`docs/laser-plan.md`): before ruby's first spike the explicit step uses almost all of a frame's budget, so the simulator integrates with an L-stable Rosenbrock 2(3) pair (Shampine and Reichelt 1997, the method of MATLAB's ode23s): the same 3τ take about 1200 steps. Being implicit, it differentiates the right-hand side, which must therefore be smooth where it runs (see the seed floor below).
- **Dynamic range.** It is convenient to integrate s = ln p: ds/dt′ = [(y − 1) + βy·e^(−s)]/ε. Then growth from one photon to 10¹⁸ is linear growth of s, with no overflow and no loss of precision. Start from one photon, p = Bτ (s ≈ −26 for a small Nd:YAG laser), since s = ln 0 does not exist. Compute the seed βy·e^(−s) as one exponential, e^(ln β + ln y − s): it is about 1 at the seed level, but e^(−s) on its own overflows once s < −709, which happens with a tiny β, and would happen with the pump off if the seed followed y all the way down (see the floor below). With β = 0 the seed is simply 0 (written as β·y·e^(−s) it would be 0·∞ = NaN): below threshold s then falls without limit (one photon decays; for Nd:YAG to s ≈ −1600 before threshold is reached).
- **Photons far below the seed.** ln p has its own trap: when p ≪ βy, ds/dt′ ≈ βy/(εp) is huge and changes as fast as p does, so the step must shrink below what floating-point time can hold and the solver gives up. A real laser leaves that state within about τ_c (spontaneous emission alone gives p ≈ βy after one τ_c), so the code may skip it: before each run, raise s to at least ln(β·(max(y, 0) + 10⁻¹²)). The moment that needs it is β turned on after a run with β = 0 (s may be −300). The right-hand side adds 10⁻¹² to y in the seed too, β·(max(y, 0) + 10⁻¹²)·e^(−s): with the pump off, y falls past 10⁻³⁰⁰ within 700τ, and a seed that followed it made the photons climb hundreds of e-folds when the pump came back; worse, with no seed at y ≤ 0 the seed's slope just above y = 0, β·e^(−s), grew past 10³³ and stopped the implicit solver. The floor is added, not taken as max(y, 10⁻¹²): that form has a corner at y = 10⁻¹², which the solver's difference in y (about 5×10⁻¹¹) reaches across, and frames with the pump off cost up to 580 steps; the corner of max(y, 0) is at y = 0, which a decaying y never crosses. With the floor the photons settle at p ≈ β·10⁻¹², a light of about 10⁻¹² of the seed at threshold.
- **On-screen time.** Real time cannot be shown. You need a "slow-motion" slider (10³–10¹² times) and logarithmic time axes on the plots. Otherwise a 1 ms flash and a 10 ns pulse cannot be seen on one plot.
- **Multiple modes.** Each longitudinal mode q has its own φ_q and its own gain g(ν_q) = σ(ν_q)ΔN. With homogeneous broadening all modes share one ΔN, and competition comes out by itself. With inhomogeneous broadening ΔN is split into spectral classes (velocity classes for a gas); each mode burns its own classes, producing "holes" in the gain curve.
- **Mode locking** does not enter the rate equations (they have no phases). It is easier to show as a separate scene using the formula of 4.5, with mode amplitudes taken from the gain curve.

### 11.4 Ray tracing and the beam

- **Lamp and other incoherent sources:** 50–500 rays with random points, directions and wavelengths (wavelengths drawn from the Planck spectrum), exact ray tracing (8.2).
- **Laser:** q(z) through the ABCD chain (8.4); draw the ±w(z) envelope, wavefront arcs R(z) and the cross-section profile. Where the beam is tightly focused, check the breakdown and self-focusing thresholds.
- **Inside the resonator:** the mode from the round-trip matrix (7.3). If |m| ≥ 1, show the rays walking off and stop lasing by adding large losses.
- **"Photons as balls" animation** (§120, item 3) — only an illustration: their number on screen is the logarithm of φ. The book itself warns that the ball-avalanche picture does not explain how a plane wave forms. So it is worth showing the wave picture next to it: wavefronts that keep their phase and grow in amplitude.

### 11.5 Colour from wavelength

The visible range 380–780 nm is converted to RGB by a piecewise-linear approximation of the colour-matching functions (the well-known Bruton scheme), with attenuation at the edges of visibility. IR (Nd 1064 nm, CO₂ 10.6 µm, Dy 2.36 µm) and UV (ruby second harmonic, 347 nm) are drawn in false colour labelled "invisible" — otherwise the user will think the laser is not working. On-screen beam brightness should be the logarithm of intensity, because intensities differ by tens of orders of magnitude.

### 11.6 Indicators that explain the physics

1. Level diagram of the medium with population bars and animated transition arrows (thickness = rate).
2. A "round-trip gain / round-trip loss" gauge with a threshold line.
3. Spectrum: gain curve g₀(ν), the comb of longitudinal modes and the threshold line; modes above threshold highlighted.
4. Stability diagram (g₁, g₂) with a point for the current resonator.
5. Plots of P_out(t), N(t) and pump(t) on one time axis.
6. Beam profile in cross-section (TEM_mn, diode ellipse) and at the lens focus.
7. The efficiency "waterfall" from Section 6.

## 12. Test values for the simulator

Each row is a ready-made test: feed in the inputs and compare with the expected result. For the book's numbers agreement in order of magnitude is enough; for the formula checks it must be exact.

| What is checked | Input | Expected | Source |
| --- | --- | --- | --- |
| Stimulated emission stronger than spontaneous | T = 300 K; λ = 550 nm | λ > 69 µm; T > 3.8×10⁴ K | Problems 4–5 to §119 |
| Ruby pump power | N_t ~ 10¹⁹ cm⁻³, λ_p ≈ 450 nm, time 10⁻³ s | 2.2 kW/cm³ into the rod, ~20 kW/cm³ from the lamp, ~200 kW for 10 cm³ | §121, item 3 |
| Flashlamp capacitors | 200 J at 2 kV | C ≥ 100 µF | §121, item 3 |
| Reflection from a ruby end face | n = 1.76, normal incidence | 7.6%; internal Brewster angle ≈ 30° | §121, item 6 |
| Free-running ruby | rod 20–30 cm × 1.5 cm, 1 ms flash | spikes ~10⁻⁶ s separated by microseconds, tens of kW | §121, item 5 |
| Q-switching | rod 20 × 1.5 cm | 10⁻⁸ s pulse, 1–2 J, 10–200 MW | §121, item 9 |
| Giant-pulse formulas | τ_c = 5 ns, x = 3 | η_E ≈ 0.94, Δτ_p ≈ 16 ns | Section 4.3 |
| Amplifier cascade | oscillator + amplifiers | 2×10⁻⁹ s, ~20 J, ~10⁴ MW | §121, item 9 |
| Field and pressure in the beam | 100 MW on 1 cm², λ = 694.3 nm | E_rms = 1.94×10⁵ V/cm, 0.033 atm | Problem 1 to §121 |
| Same at the focus | lens f = 5 cm | 2.9×10⁸ V/cm, 7.4×10⁴ atm | Problem 1 to §121 |
| He-Ne effective temperature | 10 mW, δν = 10⁴ Hz, δθ = 1′ | ~10¹⁵ K (for S = 1 cm²) | Problem 2 to §121 |
| He-Ne divergence | confocal, L = 1 m | w₀ ≈ 0.32 mm, θ ≈ 2′ (book: 1–2′, limit ~20″) | §122 + Section 7.2 |
| Optimum He-Ne bore | scan over D | maximum power at ~7 mm | §122, item 3 |
| He-Ne threshold | R = 0.99 and 0.98, l = 0.3 m | g_th ≈ 0.05 m⁻¹ | Section 3.1 |
| Free spectral range | L = 0.3 m | Δν = 500 MHz, Δλ = λ²/2L | §120, item 5 |
| CW CaF₂:Dy | lamp, 77 K | threshold ~15–20 W; Q-switched 1–2 MW at up to several kHz | §121, item 10 |
| High-power gas lasers | CO₂, Ar⁺ | up to 10 kW and up to ~1 kW CW | §122, item 1 |
| KDP phase-matching angle | 1064 → 532 nm, type I (ooe) | ≈ 41° (book: 41°35′) | §124, item 4 |
| SHG without phase matching | ruby in quartz | η ~ 10⁻⁸; with phase matching, more than 50% | §124, item 4 |
| Ruby third harmonic | 694.3/3 | 231.3 nm | §125, item 1 |
| Self-focusing in CS₂ | n₂ = 2×10⁻¹¹ esu, n₀ = 1.62, ruby, D = 1 mm | P_th ≈ 17 kW, l_sf ≈ 96 cm | §125, item 3 |
| Stability via ABCD | empty two-mirror resonator | (A + D)/2 = 2g₁g₂ − 1 | Section 7.3 |
| Rigrod formula | R₁ = 1, R₂ = 1 − T, T → 0 | exact formula → low-gain formula | Section 3.6 |
| Steady state of the rate equations | x = 2 | y → 1, p → 1 | Section 11.2 |
| Two-level scheme | any pump | N₂ < N₁ always, no lasing | §121, item 2 |

## 13. Constants and Gaussian ↔ SI conversion

The code uses SI throughout; Sivukhin's formulas are written in Gaussian units and are converted using the tables below.

| Quantity | Value |
| --- | --- |
| h | 6.62607×10⁻³⁴ J·s |
| ħ = h/2π | 1.05457×10⁻³⁴ J·s |
| c | 2.99792×10⁸ m/s |
| k | 1.38065×10⁻²³ J/K |
| e | 1.60218×10⁻¹⁹ C |
| ε₀ | 8.85419×10⁻¹² F/m |
| 1 u (atomic mass unit) | 1.66054×10⁻²⁷ kg |
| Energy ↔ wavelength | λ [nm] = 1239.84 / E [eV] |
| Wavenumber | 1 cm⁻¹ = 1.2398×10⁻⁴ eV ≈ 30 GHz; kT at 300 K ≈ 0.0259 eV ≈ 208 cm⁻¹ |
| Linewidth | Δν = c·Δλ/λ² |
| Pressure | 1 mm Hg = 133.3 Pa; 1 atm = 1.013×10⁵ Pa = 1.013×10⁶ dyn/cm² |

| What | Gaussian (as in the book) | SI (for the code) |
| --- | --- | --- |
| Energy, power | 1 erg = 10⁻⁷ J; 1 erg/s = 10⁻⁷ W | J, W |
| Electric field | 1 statvolt/cm = 300 V/cm = 3×10⁴ V/m | V/m |
| Intensity from amplitude A | I = c·n·A²/(8π) | I = c·n·ε₀·E₀²/2 |
| Displacement and polarization | D = E + 4πP, ε = 1 + 4πα | D = ε₀E + P, ε = 1 + χ |
| Nonlinear index | n = n₀ + n₂A² | n = n₀ + n₂ᴵ·I, n₂ᴵ = 8π·n₂/(c·n₀) [cm²·s/erg], ×10³ → m²/W |
| Radiation pressure | dyn/cm² | 1 dyn/cm² = 0.1 Pa |

## Sources

- D. V. Sivukhin, *General Course of Physics*, Vol. IV *Optics*, §§119–126, plus the cited sections on lenses, aberrations, polarization and crystal optics (§§10–25, 65, 81, 89–91) — the main source.
- [Gain saturation flux and stimulated emission cross section for the 10.6 µ line of CO₂, Appl. Phys. Lett. 11, 60 (1967)](https://scilit.net/publications/6975397fb93c07490d020427bd3be7be) — σ ≈ 3×10⁻¹⁸ cm² for CO₂.
- [Pressley, Wittke, CaF₂:Dy²⁺ lasers, IEEE J. Quantum Electron. 3, 116 (1967)](https://manuscript.isc.ac/Inventory/49/1124735.htm) — lifetime and linewidth of CaF₂:Dy²⁺.
- [HeNe laser lab report, Stanford](https://web.stanford.edu/~edwin98/HeNe.pdf) — measured He-Ne gain of 15.5%/m.
- [RP Photonics, YAG lasers](https://www.rp-photonics.com/yag_lasers.html) and [Precision Micro-Optics, Nd:YAG](https://pmoptics.com/neodymium_doped_yag.html) — Nd:YAG (1 at.%) at 1064 nm: σ = 2.8×10⁻¹⁹ cm², τ ≈ 230 µs, n = 1.82 (1.8169), as in table 5.1 (checked for build stage 6, the first stage that shows Nd:YAG). One vendor sheet gives 7×10⁻²¹ cm², far from every other source; not used.
- Other medium parameters, the Rigrod, Self, Marburger and Fan–Byer formulas, and the Sellmeier coefficients (Schott N-BK7, Malitson for fused silica, Zernike for KDP) are standard values from textbooks and handbooks (Svelto *Principles of Lasers*, Koechner *Solid-State Laser Engineering*, Siegman *Lasers*, Boyd *Nonlinear Optics*). They have not yet been checked against the printed sources and should be before the site is published.
