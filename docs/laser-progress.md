# The laser simulator: what is done and what is left

*Last updated: 16 November 2026, at the end of stage 8a.*

This page explains, in plain words, how far the laser simulator has got. The technical details are in `docs/laser-plan.md` (the build plan) and `docs/laser-physics.md` (the physics).

## What we are building

The site will have a "virtual laser bench": a page where a visitor builds a laser from parts, switches it on and watches what happens. They pick a material that makes the light, a way to "pump" energy into it (lamps, electricity, another laser), and mirrors. Then they see the light build up between the mirrors, come out as a beam, and change as the settings change. Under the bench, a "learn" section explains the physics in steps, with buttons that set the bench up to show each idea.

The physics comes from Sivukhin's *Optics* (§§119–126), plus standard laser textbooks where the book only describes things in words.

The page lives at the hidden address `?view=laser`. A banner on the Labs page links to it.

## How the work is done

The work is split into numbered **stages**. Each stage adds one piece, and is not counted as finished until it passes four checks:

1. **Automatic tests.** Small programs that check every formula against numbers from the book or worked out by hand. There are now 629 of them, and all of them pass.
2. **Deliberate mistakes.** A tool makes 713 small errors in the code on purpose, one at a time: a sign flipped, a factor of 2 dropped, a wrong unit. Each time, at least one test must notice. If none does, a test is missing, and it is added. A full run takes under 4 minutes (it took 25 before stage 7c made it faster; see below).
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
| 8a | **Q-switching in the engine** (see below): the giant pulse, with three kinds of Q-switch. |
| 8b | **The Q-switch on the page** (see below): an On/Off switch right under the laser, beside a Fire button that moved there too. |

### What you can see on the page today

Every laser the engine can run. Two dropdowns at the top of the controls choose it: first the material, then its pump (the second list shows only the pumps that material can use). CaF₂:Dy and the semiconductor diode laser are listed but greyed out, "coming later".

For each laser the page sets itself up to suit it:
- **the pump slider** becomes pump power (W), flash energy (J) or electric current (A, or mA for small currents);
- **a "Fire" button** appears with a flashlamp, right under the drawing of the laser: each press fires one flash, and the chart shows the light it makes, spikes and all;
- **a Q-switch On/Off switch** sits beside it on the four lasers that can have one (ruby, Nd:glass, and Nd:YAG with a flashlamp or with diodes). See stage 8b below;
- **the slow motion** starts at a speed that suits the laser: one second on screen is 1 ms of the two-level atom, 100 µs of ruby, but only 100 ns of the argon and dye lasers, which change within nanoseconds;
- **the numbers under the chart** are the ones that laser has: a flashlamp shows the smallest flash that makes it lase and the highest output since Fire; a gas laser shows its threshold current; the two-level atom says its threshold is "never reached";
- **the energy-level picture** shows how strongly each material is pumped, and its gauge shows its own gain without light. For ruby it rises faster than the pump once the pump is past threshold (at the flash's peak, 8.6 times the loss for a pump 5.7 times its threshold); for the two-level atom it stays below zero: it never gains, it only absorbs less.

The small chart of the excited atoms is gone (the owner's choice): the bar in the energy-level picture shows the same thing.

Ruby fired with a 1000 J flash lights up after a fraction of a millisecond and fires spikes reaching about 460 kW, as in stage 7b. The light and dark themes and both languages work, and the dropdowns fit on a 320 px phone.

### Stage 8b, just finished: the Q-switch on the page

Right under the drawing of the laser there is now a row with two things you reach for most:
- **Fire the flash** (on lasers with a flashlamp), moved here from under the sliders and centred right under the drawn lamp. It is a big button with a lightning bolt, and while the lamp is dark a ring of light keeps swelling out of it, so even a visitor who does not know what it is wants to press it. While a flash is lit it stops inviting, and it starts again once the flash has faded. For visitors whose computer asks for less motion the ring stands still;
- **Q-switch (bleachable filter)** with an **On/Off switch** (on the four lasers that can have one), on the left, under the drawn filter.

**The flash is now hard to miss.** When the lamp fires, its gas burns white-hot (warm orange on the light theme) with a soft glow round it, the whole bench lights up, broad beams of light go up into the rod, which lights up too, and short streaks flicker all round the lamp. All of it is as strong as the flash, so a weak flash is a dim glow and a strong one a burst of light. On the light theme the lamp's caps and glass edge are no longer grey but a bright terracotta.

As you asked, there is only one Q-switch: the **bleachable filter**, a dark filter that the laser's own light turns clear. Nothing has to be timed. The engine still knows the other two (the electro-optic shutter and the rotating prism), but the page does not show them.

**Turning it on or off does not start anything again.** The chart, the time, a flash that is running and the "highest output" all carry on, so you can watch the change happen:
- the diode-pumped Nd:YAG shines steadily at 1.7 W. Switch the filter on and, a moment later, the steady line turns into a train of sharp pulses of 2.6 kW, one every 0.3 ms. Switch it off and it settles back to a steady beam;
- ruby with the filter gives one giant pulse of about 210 MW from a flash, against about 460 kW spikes without it.

With the filter on you also get:
- **the filter on the drawing**, between the back mirror and the rod. It is dark while closed and turns pale as the light bleaches it;
- **a slider for how dark the filter is** ("Filter transmission (unbleached)", 20 % to 99 %). A darker filter holds more energy back for a bigger pulse, but needs a stronger pump. At 20 % Nd:glass needs a 383 J flash, more than its slider goes to, so the page says "never reached";
- **two numbers**: how much more the filter loses than the open laser ("3.00 ×"), and the giant pulse the book's formula predicts if the filter bleached right now (energy, peak power, length);
- the threshold and "Pump now ÷ threshold" now count the filter: the diode laser needs 3.69 W behind it, not 1.51 W.

Checked in Chrome: in English and Armenian, light and dark, and on a phone-sized screen, where the row wraps neatly (Fire; the name; the switch).

The code review of the first version found 13 things, the review of the final version 12 more, and a last review of everything, the lamp included, 11 small ones (for example: for visitors who ask for less motion, the streaks round the lamp now stand still). All but two small parts were fixed. Those you could see on the page:
- turning the filter off and on again forgot how dark you had set it. Now each laser remembers its own setting;
- behind a very dark filter, the diode laser's threshold was shown as 69.8 W although the slider stops at 20 W. Now it says "never reached";
- the "giant pulse if the filter bleached now" readout showed silly numbers just above threshold (a "pulse" 128 seconds long). Now it shows "—" until the laser is 1 % above threshold;
- the line under the title and the theory chapter still talked about the old dropdown.

In the first review, among others: the diode laser's threshold ignored the filter, so 2 W said "above threshold" but never lased; the energy gauge stayed squeezed after the shutter opened; and a long Armenian word on the drawing was squeezed on phones. The 13th was a suggestion to save 8 thousandths of a second when the switch is clicked, at the cost of more complicated code. It was left out, as was one suggestion of the second review (removing a shortcut that saves the computer some work every frame); the plan explains both.

### Stage 8a: the giant pulse, in the engine

A **Q-switch** is a shutter between the two mirrors. While it is closed the light cannot bounce back and forth, so the laser cannot start, and the flash stores far more energy in the rod than a laser could ever hold on its own. When the shutter opens, all that energy comes out at once as one **giant pulse**, about 10 billionths of a second long. Ruby's normal spikes reach about 460 kW; its giant pulse reaches about 520 MW, over a thousand times more.

The engine now has the three Q-switches from the book:
- **an electro-optic shutter** (a Pockels cell with a polarizer): electricity turns it from closed to open in 5 billionths of a second;
- **a rotating prism** that is the back mirror: it spins 500 times a second, and the laser only works in the moment it lines up with the other mirror;
- **a dye that bleaches**: a filter that is dark, but that the light itself makes clear once it is strong enough. Nothing has to be timed.

Which lasers have them: ruby, Nd:glass and Nd:YAG with a flashlamp can have any of the three. The Nd:YAG with diodes can have the bleaching filter, and then, although its pump never stops, it gives a regular train of pulses, one every 0.3 ms. The other lasers have none (their energy cannot be stored).

What the tests check, among others:
- the closed shutter really holds the light back: the rod fills up exactly as if there were no light at all;
- the pulse from the shutter matches the book's formulas for its energy, peak power and length, to better than 0.02 %;
- the rotating prism at full speed gives one pulse. Slowed down 100 times it gives many weak ones, as the book says;
- the bleaching filter gives one giant pulse with ruby, and the diode-pumped Nd:YAG gives a train of equal pulses at a steady rate.

Some things the owner should look at (the plan marks each one "decided without the owner"):
- **The book's numbers for a big ruby are not matched.** The book says a 20 cm × 1.5 cm ruby gives 1–2 J in 10⁻⁸ s. The simulation gives the right length (19 billionths of a second) but about 13 J, several times too much. The model pumps the whole rod evenly and uses all of it, which real lasers of that time did not. I did not change the numbers to make it agree.
- **The prism gives a smaller pulse than the electro-optic shutter** (ruby: 120 MW against 520 MW), because the pulse starts while the prism is still turning into line. This is real physics, and a reason the prism was given up, but the book does not mention it.
- **The shutter's timing:** by default it opens when the rod is fullest (1 ms after the flash for ruby, 0.6 ms for Nd:glass, 0.55 ms for Nd:YAG).
- **The filters:** a dye for ruby (cryptocyanine, as in the first Q-switched ruby lasers) and a chromium-doped crystal for the neodymium lasers. Their numbers are not yet checked against printed sources.
- The engine side only. Stage 8b put the bleaching filter on the page (your choice of the three).

The code review found 9 things; 8 were fixed. Among them: the pulse's length came out as "not a number" for a laser with no output mirror; a very fast prism could make the engine run out of memory; and the "smallest flash that lases" ignored the bleaching filter, which needs a stronger flash (for Nd:glass, 182 J instead of 29 J). The ninth: the prism lines up again on every turn, also before the moment the flash is timed to, so a fast prism gives pulses during the flash. That is how a real spinning prism behaves, so it was kept, and the documents now say so.

### Stage 7d

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

Stage 9 (several laser frequencies at once, with a spectrum panel) was dropped at your request: it would have made everything too complex. The laser stays one frequency.

| Stage | What it will add |
|---|---|
| 10 | **Mirror shapes** (next): curved mirrors, and which mirror pairs keep the light inside (stable) or lose it (unstable); the width of the beam. |
| 11 | **Lenses outside the laser:** focusing the beam, tracing rays through glass, and the beam's colour from its wavelength. |
| 12 | **The "learn" section:** chapters in both languages, each with a "try it on the bench" button that sets up the right example. |
| 13 | **Extras,** one at a time: polarisation and Brewster windows; doubling the frequency (green light from infrared); heat in the rod acting as a lens; mode-locking (very short pulses); self-focusing; the semiconductor diode laser; and the pump in more detail (lamp reflectors, discharge). |
| 14 | A final pass over all the documentation. |

## Things to know or check before going public

- **Most of the material numbers are textbook values not yet checked against printed sources.** Some choices were made where the sources disagree or say nothing; the plan marks each one "not verified". Examples: how much of the flash light reaches ruby's upper level (0.7), and the square law for argon. A physicist should look these over.
- **Ruby's spikes only partly match a real ruby laser.** With a flash a little above threshold (700–1000 J), the simulated ruby spikes for as long as it gives light, as the book describes. With a much stronger flash (2000 J or more), the spikes smooth out into a steady glow within about 0.3 ms, while a real ruby laser keeps spiking irregularly. Getting that right needs several frequencies and the heating of the rod, which this model leaves out (several frequencies were stage 9, which you dropped). This is a known limit, not a bug.
- **The CO₂ laser gives about 8 W**, while a real tube of that size gives 40–60 W, because the model spreads the light evenly across the tube. This is fine for showing how it works, but the number should not be presented as realistic.
- **The Armenian text should be read by a fluent speaker** before the page goes public.
- The code is saved on the `feature/laser` branch, stage by stage. Nothing has been pushed or published.
