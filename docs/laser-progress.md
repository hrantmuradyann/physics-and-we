# The laser simulator: what is done and what is left

*Last updated: 16 November 2026, at the end of stage 7d.*

This page explains, in plain words, how far the laser simulator has got. The technical details are in `docs/laser-plan.md` (the build plan) and `docs/laser-physics.md` (the physics).

## What we are building

The site will have a "virtual laser bench": a page where a visitor builds a laser from parts, switches it on and watches what happens. They pick a material that makes the light, a way to "pump" energy into it (lamps, electricity, another laser), and mirrors. Then they see the light build up between the mirrors, come out as a beam, and change as the settings change. Under the bench, a "learn" section explains the physics in steps, with buttons that set the bench up to show each idea.

The physics comes from Sivukhin's *Optics* (§§119–126), plus standard laser textbooks where the book only describes things in words.

The page lives at the hidden address `?view=laser`. A banner on the Labs page links to it.

## How the work is done

The work is split into numbered **stages**. Each stage adds one piece, and is not counted as finished until it passes four checks:

1. **Automatic tests.** Small programs that check every formula against numbers from the book or worked out by hand. There are now 584 of them, and all of them pass.
2. **Deliberate mistakes.** A tool makes 636 small errors in the code on purpose, one at a time: a sign flipped, a factor of 2 dropped, a wrong unit. Each time, at least one test must notice. If none does, a test is missing, and it is added. A full run takes under 3 minutes (it took 25 before stage 7c made it faster; see below).
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
| 7b | **The engine for every other material and pump:** ruby, Nd:glass and Nd:YAG with a flashlamp; helium-neon, argon and CO₂ with an electric current; dye and titanium-sapphire with another laser; and the "two-level atom", which never lases. |
| 7c | **Choosing the laser on the page** (see below). |
| 7d | **Each laser drawn as it really is** (see below): its own pump on the bench, and the energy-level picture for ruby and the two-level atom. |

### What you can see on the page today

Every laser the engine can run. Two dropdowns at the top of the controls choose it: first the material, then its pump (the second list shows only the pumps that material can use). CaF₂:Dy and the semiconductor diode laser are listed but greyed out, "coming later".

For each laser the page sets itself up to suit it:
- **the pump slider** becomes pump power (W), flash energy (J) or electric current (A, or mA for small currents);
- **a "Fire" button** appears with a flashlamp: each press fires one flash, and the chart shows the light it makes, spikes and all;
- **the slow motion** starts at a speed that suits the laser: one second on screen is 1 ms of the two-level atom, 100 µs of ruby, but only 100 ns of the argon and dye lasers, which change within nanoseconds;
- **the numbers under the chart** are the ones that laser has: a flashlamp shows the smallest flash that makes it lase and the highest output since Fire; a gas laser shows its threshold current; the two-level atom says its threshold is "never reached";
- **the energy-level picture** shows how strongly each material is pumped, and its gauge shows its own gain without light. For ruby it rises faster than the pump once the pump is past threshold (at the flash's peak, 8.6 times the loss for a pump 5.7 times its threshold); for the two-level atom it stays below zero: it never gains, it only absorbs less.

The small chart of the excited atoms is gone (the owner's choice): the bar in the energy-level picture shows the same thing.

Ruby fired with a 1000 J flash lights up after a fraction of a millisecond and fires spikes reaching about 460 kW, as in stage 7b. The light and dark themes and both languages work, and the dropdowns fit on a 320 px phone.

### Stage 7d, just finished

Each laser is now drawn with its own pump:
- **laser diodes** (Nd:YAG): a strip under the rod, as before;
- **a flashlamp** (ruby, Nd:glass, Nd:YAG): a glass tube under the rod with metal caps at its ends. It is dark until you press Fire, then glows and shines into the rod as strongly as the flash, and goes dark again as the flash fades;
- **an electric discharge** (helium-neon, argon, CO₂): there is no rod, because the gas tube itself is the medium. It has electrodes near its ends, wires to a power supply on the bench, and little arrows showing the current. The gas glows brighter with more current;
- **a pump laser** (dye, titanium-sapphire): a box on the bench whose beam hits a small mirror and is turned up into the medium.

The energy-level picture now shows ruby (three levels) and the two-level atom as they are:
- for ruby, the bottom level is also the lower laser level. Two bars show the share of atoms up and the share down, with a mark where the laser starts (54 % up for ruby). Before the flash every atom is down, and the gauge shows the gain below zero: the rod absorbs its own light. A line marks "Transparent", where the gain is zero;
- the two-level atom has only two levels. The pump light is drawn both up and down, because it pushes atoms down as fast as up, so the upper bar never reaches the mark.

The code review found 10 things. 9 were fixed; the ones you could see on the page:
- the helium-neon and CO₂ tubes were drawn dark, with no current, at their highest current (their gain is zero there, and the drawing went by the gain);
- the flashlamp kept looking slightly lit for half an hour after one flash;
- on a phone the foot of a post poked into the pump laser's box;
- one word of the energy-level picture ("Loss") could stick out of its frame.

The tenth was a suggestion to pass one number twice to the drawing. It was left as it is, because the two copies could then disagree; the plan explains why.

The pump laser's beam is drawn in the page's pump colour, not green: the colours of light from its wavelength come in stage 11, for every beam at once.

### Stage 7c

This stage put the choice of laser on the page (above). Two other things came with it:

- **The deliberate-mistakes check is about 10 times faster.** With 575 mistakes it had grown to 25 minutes, because each mistake ran every test. One failing test is enough to show a mistake was noticed, so the tool now runs the tests one file at a time and stops at the first file that fails, starting with the tests most likely to notice. It now takes under 3 minutes and gives exactly the same answers.
- **The code review found 13 things, and all 13 were fixed.** The ones you could see on the page:
  - the gauge's dashed line was drawn at the pump level for every material, which is only right for four-level materials like Nd:YAG;
  - dragging the output-mirror slider on a flashlamp laser stuttered, because the page worked out the smallest flash that lases at every step of the drag. Now it shows "…" while you drag and works it out once when you let go;
  - on a 320 px phone the dropdowns stuck out of their panel;
  - the drawing called the pump "pump diodes" for every laser.

## What is left

| Stage | What it will add |
|---|---|
| 8 | **Q-switching** (next): a shutter between the mirrors that stores energy and then releases it as one giant, very short pulse. Rotating prism, electro-optic shutter, and a dye that bleaches. |
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
