# The laser simulator: what is done and what is left

*Last updated: 15 November 2026, at the end of stage 7b.*

This page explains, in plain words, how far the laser simulator has got. The technical details are in `docs/laser-plan.md` (the build plan) and `docs/laser-physics.md` (the physics).

## What we are building

The site will have a "virtual laser bench": a page where a visitor builds a laser from parts, switches it on and watches what happens. They pick a material that makes the light, a way to "pump" energy into it (lamps, electricity, another laser), and mirrors. Then they see the light build up between the mirrors, come out as a beam, and change as the settings change. Under the bench, a "learn" section explains the physics in steps, with buttons that set the bench up to show each idea.

The physics comes from Sivukhin's *Optics* (§§119–126), plus standard laser textbooks where the book only describes things in words.

The page lives at the hidden address `?view=laser`. A banner on the Labs page links to it.

## How the work is done

The work is split into numbered **stages**. Each stage adds one piece, and is not counted as finished until it passes four checks:

1. **Automatic tests.** Small programs that check every formula against numbers from the book or worked out by hand. There are now 533 of them, and all of them pass.
2. **Deliberate mistakes.** A tool makes about 515 small errors in the code on purpose, one at a time: a sign flipped, a factor of 2 dropped, a wrong unit. Each time, at least one test must notice. If none does, a test is missing, and it is added.
3. **A code review.** A separate careful reading of the whole change, looking for bugs. What it finds is fixed before the stage is finished.
4. **A check in the browser**, for stages that change the page: both themes, both languages, a phone-sized screen, no errors.

Each finished stage is saved as one commit on the `feature/laser` branch. **Nothing has been published to the live site yet**, and nothing is pushed to GitHub without asking first.

The simulator has two halves:
- the **engine**, which does the physics: numbers in, numbers out, no drawing;
- the **page**, which draws the bench and the charts and holds the sliders and buttons.

## Done so far

| Stage | What it added, in plain words |
|---|---|
| 1 | A table of laser materials (ruby, Nd:YAG, helium-neon, CO₂, dye, and others) with their physical properties, and the physical constants. |
| 1b | The safety tools: the "deliberate mistakes" checker described above. |
| 2 | The formulas for the space between the two mirrors (the cavity): how much light is lost per trip, how strong the material must be for the laser to start (the *threshold*), how long light stays inside, how much power comes out, and which output mirror gives the most power. |
| 3 | A "time-stepper": the part that moves the simulation forward in time, small step by small step, taking smaller steps when things change fast. |
| 4 | The equations of a laser with four energy levels (like Nd:YAG): how the excited atoms and the light in the cavity feed each other. They give the steady output power and the flickering ("spikes") when the laser switches on. |
| 5 | The page itself: its address, the banner on the Labs page, the drawing loop, and the words in Armenian and English. |
| 6 | **The first laser you can play with:** Nd:YAG pumped by laser diodes, running continuously. Sliders for the pump power, the output mirror and the slow-motion speed; Play/Pause and Reset; live numbers; charts of the output power and of the excited atoms. |
| 6b | The page in the owner's design: mirrors that look like mirrors, separate light rays, a cartoon of atoms and photons, a large scientific chart, a number box beside each slider, and a "dig deeper" button that scrolls down to a short explanation. |
| 7a | A sturdier time-stepper for "stiff" cases, where some things happen a million times faster than others (ruby is like this). The old one would have needed far too many steps per frame. |
| 7b | **The engine for every other material and pump** (see below). |

### What you can see on the page today

Only the Nd:YAG laser with diodes. You can change the pump power, the output mirror and the slow motion. You can see the laser start up with a few spikes and settle, see it stop below threshold, and find the output mirror that gives the most power. The light and dark themes and both languages work, on a phone too.

### Stage 7b, just finished

This stage teaches the **engine** every other material and pump. The page does not show them yet; that is stage 7c.

- **Ruby, Nd:glass and Nd:YAG with a flashlamp:** one flash of about 1 ms. Ruby is a *three-level* material: it needs more than half of its atoms excited before it gives any light, so it needs a big flash. The engine works out the smallest flash that makes each one lase: about 640 J for ruby, 1.3 J for Nd:YAG and 29 J for Nd:glass. With a 1000 J flash, ruby first lights up after about half a millisecond and then fires a train of spikes about 6 microseconds apart. This matches the book.
- **Helium-neon, argon-ion and CO₂ lasers, pumped by an electric current:** the gain rises with the current and, for helium-neon and CO₂, falls again past a best current (§6.4 of the physics doc). Argon gains as the square of the current, up to the tube's rated current.
- **Dye and titanium-sapphire lasers, pumped by another laser.**
- **The "two-level atom",** a teaching example: whatever you do to it, it never gets more atoms up than down, so it never lases. This is the reason real lasers need three or four levels.

The code review found 14 things to improve, and all 14 were fixed. The two that matter most for the page: ruby's output mirror (it lets out 50 % of the light) did not fit the old mirror slider, which stopped at 30 %; and a flash already fired changed when a slider was moved, instead of only the next flash.

## What is left

| Stage | What it will add |
|---|---|
| 7c | **Choosing the laser on the page** (being started): a dropdown for the material; a second dropdown showing only the pumps that material can use; with a flashlamp, a flash-energy slider and a "Fire" button; with a gas laser, an electric-current slider; the slow motion set to suit each laser; the numbers under the chart chosen for each kind of pump; all new words in Armenian and English. The small chart of the inversion goes (the owner's choice): the level picture already shows it. CaF₂:Dy and the semiconductor diode laser will be listed as "coming later". |
| 7d | **The drawings for the new lasers:** each pump drawn as itself on the bench (diodes, a flashlamp beside the rod, a gas tube with electrodes, a pump laser's beam), and the energy-level picture and the atoms cartoon for three and two levels. Until then ruby is drawn with diodes and four levels. |
| 8 | **Q-switching:** a shutter between the mirrors that stores energy and then releases it as one giant, very short pulse. Rotating prism, electro-optic shutter, and a dye that bleaches. |
| 9 | **Several laser frequencies at once,** with a spectrum panel showing which ones lase. |
| 10 | **Mirror shapes:** curved mirrors, and which mirror pairs keep the light inside (stable) or lose it (unstable); the width of the beam. |
| 11 | **Lenses outside the laser:** focusing the beam, tracing rays through glass, and the beam's colour from its wavelength. |
| 12 | **The "learn" section:** chapters in both languages, each with a "try it on the bench" button that sets up the right example. |
| 13 | **Extras,** one at a time: polarisation and Brewster windows; doubling the frequency (green light from infrared); heat in the rod acting as a lens; mode-locking (very short pulses); self-focusing; the semiconductor diode laser; and the pump in more detail (lamp reflectors, discharge). |
| 14 | A final pass over all the documentation. |

## Things to know or check before going public

- **Most of the material numbers are textbook values not yet checked against printed sources.** Some choices were made where the sources disagree or say nothing; the plan marks each one "not verified". Examples: how much of the flash light reaches ruby's upper level (0.7), and the square law for argon. A physicist should look these over.
- **Ruby's spikes only partly match a real ruby laser.** With a flash a little above threshold (700–1000 J), the simulated ruby spikes for as long as it gives light, as the book describes. With a much stronger flash (2000 J or more), the spikes smooth out into a steady glow within about 0.3 ms, while a real ruby laser keeps spiking irregularly. Getting that right needs several frequencies and the heating of the rod, which this model leaves out. This is a known limit, not a bug.
- **The CO₂ laser gives about 8 W**, while a real tube of that size gives 40–60 W, because the model spreads the light evenly across the tube. This is fine for showing how it works, but the number should not be presented as realistic.
- **The Armenian text should be read by a fluent speaker** before the page goes public.
- The code is saved on the `feature/laser` branch, stage by stage. Nothing has been pushed or published.
