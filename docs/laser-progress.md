# The laser simulator: what is done and what is left

*Last updated: 20 November 2026, after your requests of 20 November; stage 11 started.*

This page explains, in plain words, how far the laser simulator has got. The technical details are in `docs/laser-plan.md` (the build plan) and `docs/laser-physics.md` (the physics).

## What we are building

The site will have a "virtual laser bench": a page where a visitor builds a laser from parts, switches it on and watches what happens. They pick a material that makes the light, a way to "pump" energy into it (lamps, electricity, another laser), and mirrors. Then they see the light build up between the mirrors, come out as a beam, and change as the settings change. Under the bench, a "learn" section explains the physics in steps, with buttons that set the bench up to show each idea.

The physics comes from Sivukhin's *Optics* (§§119–126), plus standard laser textbooks where the book only describes things in words.

The page lives at the hidden address `?view=laser`. A banner on the Labs page links to it.

## How the work is done

The work is split into numbered **stages**. Each stage adds one piece, and is not counted as finished until it passes four checks:

1. **Automatic tests.** Small programs that check every formula against numbers from the book or worked out by hand. There are now 739 of them, and all of them pass.
2. **Deliberate mistakes.** A tool makes 922 small errors in the code on purpose, one at a time: a sign flipped, a factor of 2 dropped, a wrong unit. Each time, at least one test must notice. If none does, a test is missing, and it is added. A full run takes about 6 minutes (it took 25 before stage 7c made it faster; see below).
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
| 10a | **Mirror physics in the engine** (see below): flat, concave and convex mirrors, which pairs keep the light, the beam's width, the focal points, and the light the mirrors lose. Each laser now has its real mirrors. Not on the page yet. |
| — | **The energy-levels picture removed**, as you asked (19 November): the levels and the gain gauge under the laser. The theory chapter about the giant pulse now tells the visitor to watch the power chart instead. |
| 10b | **The mirrors on the page** (see below): each mirror flat, concave or convex, the light's path bounce by bounce, the focal points, and a stability diagram beside the chart. |
| 10c1 | **Each laser in its real colours** (see below): the crystals, the dye and the glowing gases as they look, and the beam in the colour of its light. |
| 10c2 | **The pump you can see working** (see below): the diodes end-pumped through a lens, the green pump laser, pump light travelling into the material, atoms drifting in the gas tubes. |
| — | **Your requests of 20 November (saved):** one plain near-white background for the whole lab in both themes, with charcoal controls and a silver flashlamp; mirrors drawn as real ones (green-edged glass, a silver coating, a metal mount with adjusting knobs), each curved face drawn deeper the smaller its radius, and each mirror's shape buttons and radius slider moved next to it, beside the drawing; and **"inside one atom"**, a new picture under the cartoon: the chosen material's real energy levels (ruby three, neodymium four, helium-neon and CO₂ pumped through helium and nitrogen, dye and titanium-sapphire with broad bands, the two-level atom two), with a row of atoms acting out what the simulation does: the pump lifts them, they fall to the upper laser level as heat, and each step down sends out a laser photon in the beam's colour. Unlike the levels picture removed on 19 November, it has no gauge or numbers: it only shows what happens inside an atom. |

### What you can see on the page today

Every laser the engine can run. Two dropdowns at the top of the controls choose it: first the material, then its pump (the second list shows only the pumps that material can use). CaF₂:Dy and the semiconductor diode laser are listed but greyed out, "coming later".

For each laser the page sets itself up to suit it:
- **the pump slider** becomes pump power (W), flash energy (J) or electric current (A, or mA for small currents);
- **a "Fire" button** appears with a flashlamp, right under the drawing of the laser: each press fires one flash, and the chart shows the light it makes, spikes and all;
- **a Q-switch On/Off switch** sits beside it on the four lasers that can have one (ruby, Nd:glass, and Nd:YAG with a flashlamp or with diodes). See stage 8b below;
- **the slow motion** starts at a speed that suits the laser: one second on screen is 1 ms of the two-level atom, 100 µs of ruby, but only 100 ns of the argon and dye lasers, which change within nanoseconds;
- **the numbers under the chart** are the ones that laser has: a flashlamp shows the smallest flash that makes it lase and the highest output since Fire; a gas laser shows its threshold current; the two-level atom says its threshold is "never reached";
- **the two mirrors** can each be made flat, concave or convex, and a curved one gets a slider for its radius (stage 10b, below).

Ruby fired with a 1000 J flash lights up after a fraction of a millisecond and fires spikes reaching about 460 kW, as in stage 7b. The light and dark themes and both languages work, and the dropdowns fit on a 320 px phone.

### Stage 10c2, just finished: the pump you can see working

**What you can see now:**
- **the diodes are end-pumped**, as you chose: a diode module with cooling fins stands on the bench, a fibre runs from it to a small lens behind the back mirror, and a cone of pump light shines through the back mirror into the rod. It narrows to a point just inside the rod and fades along it as the crystal absorbs it;
- **the pump laser** of the dye and titanium-sapphire lasers now shines **green** (532 nm), as real ones do, and, as you asked, it pumps **along the laser's axis**, as in a real titanium-sapphire laser: its beam runs along the bench to two small mirrors at the left edge (a periscope), which lift it to the axis and send it through a lens and the back mirror into the crystal or the dye;
- **pump photons**: small dots travel from the pump into the material, and each vanishes where it is absorbed, with a little white spark where it lights an atom. The stronger the pump, the more photons. This works for the diodes, the pump laser and the flashlamp;
- **the gas tubes have atoms** drifting in them, and the stronger the current, the more of them light up;
- the note under the bench now names the pump's invisible light too: "808 nm, 1.06 µm · infrared, invisible";
- visitors whose computer asks for less motion see the photons and atoms standing still.

**What you asked for after your first look:** with the bleachable filter on, the pump's photons went through it and the laser light went through it "like nothing is there". Now:
- on the diode-pumped Nd:YAG the filter stands between the crystal and the output mirror, where real end-pumped lasers have it, so the pump light never reaches it. Its name moved under the bench, on the right;
- on every laser the filter is drawn over the light, and while it is dark the light beyond it is dimmed as much as the filter is dark. As the laser's own light bleaches it, the light beyond it comes back.

**What the review caught** (and I fixed): the white sparks almost vanished on the light theme (they now have a dark ring there); the diodes' invisible light and the laser's invisible light were the same pink (the pump's is now a paler pink); at a weak pump the few photons travelled in a clump, which made a steady pump look like bursts; the unlit gas atoms were drawn in the glow's colour even with the current off (they are now plain grey dots).

The review ran at "xhigh" effort, not the "medium" you set: my notes from earlier stages said xhigh. They now say medium.

**Choices I made without asking you** (in the plan's 10c2 notes, easy to change):
- **how deep the pump light goes is drawn, not calculated.** A real Nd:YAG crystal absorbs the diode light within about a millimetre, so on our 5 cm rod the cone would vanish at the very start. I drew it fading over the first third of the rod, so you can see it. The physics notes say so;
- the back mirror lets the pump light through. Real ones are made to do this, but I didn't write a label on it, to keep the top of the picture uncluttered;
- no water jacket on the CO₂ tube, and no ceramic tube inside the argon one.

**Checks:** 739 automatic tests pass, and the deliberate-mistakes checker makes 922 mistakes and catches every one. In Chrome I looked at Nd:YAG with its diodes (and with the filter on, in both themes), titanium-sapphire with the green pump, argon on the dark theme and helium-neon on the light one. At first the pump photons disappeared into the pink beam of the same colour, and most of the atoms hid behind the rays. Now they are drawn on top, each with a thin outline.

### Stage 10c1: each laser in its real colours

Stage 10c ("a bench that looks real") is done in two parts. This is the first; the second (10c2) is the end-pumped diodes you chose, the green pump laser, and the pump light travelling into the material.

**What you can see now:**
- **the rods look like crystals in their real colours:** ruby pink-red, Nd:YAG pale lilac, Nd:glass pale purple, titanium-sapphire pink. Each is drawn as a cylinder, with a bright strip of reflected light along its top, a shade along its bottom and a polished oval face at each end;
- **the dye is an orange liquid in a glass cell**, with a pipe in and a pipe out under it (in a real dye laser the dye flows, so it does not wear out);
- **the gas tubes are glass**, and the gas glows in its own colour while the current flows: helium-neon salmon-red, argon blue-violet, CO₂ pink-violet;
- **the beam is the colour of its light**, worked out from its wavelength: helium-neon red-orange, ruby deep red, argon green, the dye yellow-orange;
- **light the eye cannot see** (Nd:YAG and Nd:glass at 1.06 µm, CO₂ at 10.6 µm, titanium-sapphire at 0.8 µm) is drawn in a hot pink that no real beam has, and the drawing says so under the pump's name: "1.06 µm · infrared, invisible". Without the note a visitor might think the laser does not work;
- **every colour stays visible on both themes**: a colour too pale for the cream theme is darkened a little, one too dark for the dark theme lightened, until it stands out clearly. A test checks every colour against both backgrounds. The rays also have a thin dark (or cream) edge, so a red beam still shows over the red ruby.

**Where the colours come from:** photographs and descriptions of each material, collected with their sources in the physics notes (§5.10). Two are only from hobbyists' descriptions and marked "not checked": the argon and the CO₂ glow.

**Choices I made without asking you** (in the plan's 10c1 notes, easy to change):
- the dye's yellow-orange beam turns brown-orange on the cream theme, where it is darkened to be seen;
- the hot pink for invisible light;
- the dye cell is a box with two pipes, not a jet of dye;
- the two-level atom, which is not a real material, keeps the site's colours.

**What the review caught** (and I fixed): the beam could all but vanish over a material of its own colour (the false colour over the lilac Nd:YAG, red over ruby), now fixed by the rays' thin edge; the "infrared, invisible" note was squeezed beside the pump's name on a phone, and now has a row of its own; the rod's lower shade made it lighter, not darker, on the dark theme; the false colour was too close to violet light; ultraviolet light would have been called infrared (no laser here is ultraviolet yet). The beam's shaded hourglass is still faint over a material of the same colour: I left it, since the rays over it show the beam clearly.

**Checks:** 725 automatic tests pass. The deliberate-mistakes checker makes 893 mistakes (32 new) and catches every one. I looked at Nd:YAG, ruby during a flash, helium-neon and the dye in Chrome, in both themes.

### Stage 10b: the mirrors on the page

**What you can try now:**
- under the output mirror's slider, each mirror has **three buttons**, Flat, Concave and Convex, each with a little picture of the mirror's face. A curved mirror also gets a **slider for its radius** (from a quarter of the laser's length to 50 m) with a box to type it in metres. Changing a mirror does not restart the laser: the chart carries on, so you see what the change does;
- the drawing now shows **the beam's real shape**: between stable mirrors it narrows to a "waist" and widens again, like an hourglass (shaded). Over it, four **light rays bounce from mirror to mirror** in straight lines, each bounce a little fainter. The rays are drawn faintly even when the laser is dark, to show the path light would take;
- the beam is far thinner than the laser is long, so the picture draws the widths larger than the lengths. A note at the bottom left says by how much ("Widths × 26" for the Nd:YAG laser);
- each curved mirror's **focal point F** is marked on the axis: a solid dot in front of a concave mirror, a hollow dashed one behind a convex one (an imaginary focus). When it lies outside the picture, an arrow at the edge shows which way and how far ("F 500 mm");
- **bend a mirror too far** and the rays walk out past the mirror's edge, and the laser dims or stops. For example, make the Nd:YAG laser's output mirror convex: its light goes out at once. He-Ne stops too when its output mirror's radius goes under its 30 cm tube;
- three **new numbers** under the chart, for every laser: whether the mirror pair keeps the light (stable, unstable, or "on the edge of stable", which is where two flat mirrors sit, like the first ruby laser's), the beam's narrowest radius, and how much light the mirrors lose per round trip;
- the **stability diagram**, as you asked, sits right under the power chart, so you can watch both while the laser runs. Each mirror pair is a point on it; the shaded area is where the mirrors keep the light. The dot moves as you bend a mirror.

**Choices I made without asking you** (all listed in the plan's 10b notes, easy to change):
- the radius slider runs from a quarter of the laser's length to 50 m;
- the rays are always drawn, faintly when the laser is dark;
- a ray that walks out is drawn only a short way past the mirror. In the browser I saw that, drawn all the way to the edge, it ran steeply across the whole picture and its words;
- the shape buttons are plain buttons that light up when chosen.

**What the review caught** (and I fixed): the little Concave and Convex pictures on the buttons were the wrong way round; the "narrowest beam" number could show a width the beam never has inside the laser (with a convex mirror); the beam was drawn wider than the gas tube of He-Ne, CO₂ and argon; and an F outside the picture was written over a mirror's stand and did not say which mirror it belonged to. Now they read F₁ (back mirror) and F₂ (output mirror), like g₁ and g₂ on the diagram, with a filled arrow for a real focus and an outlined one for an imaginary one.

**Checks:** 708 automatic tests pass. The deliberate-mistakes checker makes 861 mistakes (54 new for this stage) and catches every one. I looked at the page in Chrome, in both themes. Not yet seen on screen: the middle layout (a screen 760 to 1100 px wide, where the diagram sits under the chart beside the numbers) and a 320 px phone.

### Stage 10a: the mirrors, in the engine

This stage is all physics behind the scenes: the page looks the same until stage 10b puts the mirror choices on it.

**What the simulator now knows about mirrors:**
- each mirror can be **flat, concave or convex**, with any radius of curvature;
- whether a pair of mirrors **keeps the light** between them (a "stable" pair) or lets it **walk out** sideways after a few bounces (an "unstable" pair);
- the **beam's shape** between stable mirrors: it narrows to a "waist" and widens again, and its width at every point;
- each curved mirror's **focal point F**: half its radius in front of a concave mirror, and behind a convex one (an imaginary focus);
- the path of a single **ray**, bounce by bounce: straight between the mirrors, turning only at them. This is what stage 10b will draw;
- **how much light the mirrors lose**, and so how much harder the laser has to work.

**The light the mirrors lose** comes from two things. A beam wider than the rod (or the gas tube) has its edges cut off at every bounce; and with unstable mirrors the light walks out past the edge. The textbooks give formulas for each case separately, but they disagree badly right at the border between "stable" and "unstable", where a real laser works fine (the very first laser had two flat mirrors, which sit exactly on that border). I found the published calculations (Kogelnik and Li, 1966, and Siegman, 1965), checked the formulas against their graphs, and joined them so the loss changes smoothly as a mirror is bent from one side of the border to the other. The way they are joined is my own choice, not a textbook formula, and the physics notes say so.

**Each laser now has its real mirrors** (from the history and from catalogues where I could find them; the rest are typical values, marked "not checked"):
- ruby and Nd:glass: two flat mirrors, like Maiman's first laser in 1960, whose ruby rod had flat silvered ends;
- helium-neon: a flat mirror and a concave one a little longer than the tube, as in most real tubes;
- CO₂ and argon: a long-radius concave back mirror (20 m and 5 m) and a flat output mirror;
- Nd:YAG pumped by diodes: a flat back mirror (the pump light goes in through it) and a concave output mirror.

With these mirrors almost nothing changes on the page: a fraction of a percent here and there (ruby's smallest flash went from 638.7 J to 638.8 J). Only CO₂ changed noticeably, about 4 % less power, because its wide beam is clipped a little by the tube.

**What you will be able to try in stage 10b:**
- bend helium-neon's output mirror a little too much and the laser **stops completely**: its light is so weak that losing half of it per bounce kills it;
- give ruby a convex output mirror (an unstable pair) and it **still lases**: its smallest flash rises only from 639 J to 803 J. Real high-power lasers use unstable mirrors on purpose.

**One choice I made without asking you** (the plan proposed it as the simple default): the mirrors change only how much light is lost, not how strongly the material amplifies. A narrower beam does not make the laser start more easily.

**A mistake the review caught:** I first read one formula in the 1966 paper wrongly (a number in it must be squared; the scan made it look unsquared), so the flat mirrors' loss came out about a sixth too small. The review found it by checking the formula against two other results in the same paper. It is fixed; it changed only the two flat-mirror lasers, ruby and Nd:glass, and only in the fifth digit.

**Checks:** 700 automatic tests pass (28 new ones). The deliberate-mistakes checker now makes 854 mistakes, 47 of them new for the mirrors, and catches every one.

### Stage 8b: the Q-switch on the page

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

### Stage 12: the study page

As you asked, the menu has a new item, **Study materials** («Ուսումնական նյութեր»), right after Interactive Labs. It is a page of posters, like the Labs page; for now it has one, **The laser**, a book. The book has:

- at the top, a short introduction and an **Open the laser simulator** button;
- the **contents**, one link per chapter, as in a real book; each chapter ends with a "Contents ↑" link back, and wherever the text says "see chapter 12" that is a link too;
- then the 13 easy chapters from your guide, in Armenian and English: light that makes more light, the pump and the inversion, two mirrors and the threshold, how a laser starts, the flashlamp, laser diodes, gas discharge, the history from Einstein to 1960, ruby, Nd:YAG, helium–neon, pulses, and safety;
- at the end of each chapter a **Dig deeper** button opens the full version right under it, with the derivations and worked examples. The pairs: chapters 1–4 open their own full chapters; the flashlamp, diodes and gas discharge open theirs; the pulses chapter opens the full chapter on the giant pulse, the filter and mode locking; helium–neon opens its full chapter together with all the other materials (Nd:glass, CaF₂:Dy, argon, CO₂, the diode, dye, Ti:sapphire, the two-level atom). The history chapter has no button, since it is history already;
- the formulas are typeset as in a textbook (by KaTeX, a free maths-typesetting library you allowed me to download; it is stored with the site and is only downloaded by visitors who open this page);
- at the bottom, the list of sources with links.

What I left out of your guide, because it was meant for us and not for visitors: the references to our own developer files, the "[calc]"/"[CHECK]" marks, the "PICTURE" and "TRY IT" lines, and the last chapter ("Problems found in laser-physics.md"). Of the few facts the guide itself doubted, I left out the size of Maiman's first ruby rod, and kept three that are widely known (Gould coining the word "laser", Basov and Prokhorov's three-level idea of 1955, the spelling "Marcos"); I did not look them up again. The guide itself stays on your computer and is not saved in the project.

On the simulator page, the "Dig deeper into the physics of the laser" button now opens this page, and the old short theory at its bottom became one line with a link here.

Also in this stage, as you asked: in the cartoon of atoms and photons, a **stray photon is now drawn with a dashed wave**, so it can no longer be taken for a laser photon (the legend shows the same).

**Please check:** the Armenian translation (all of it is mine), and whether you like the "Dig deeper" boxes. The pictures your guide describes ("PICTURE") are not drawn yet; tell me if you want any of them.

### Stage 12b: the book in chapters and sections

As you asked, the book was rebuilt and rewritten. It now has **7 chapters and 34 sections**, numbered like a real book (1, 1.1, 1.2 …); the contents list every chapter with its sections under it, and every line is a link:

1. **The history of the laser**: Einstein's idea, from neon to the maser, the race to light, the first years and after.
2. **What makes laser light special** (moved right after the history, as you asked): one colour, one direction, coherence, brightness.
3. **The gain medium**: atoms and photons; absorption, spontaneous and stimulated emission; gain; two, three and four levels; then each medium: ruby, neodymium (Nd:YAG and glass), helium–neon, argon and CO₂, tunable lasers (dye, Ti:sapphire), the semiconductor laser.
4. **Pumping**: what a pump does, the flashlamp, laser diodes, the gas discharge, a laser pumping a laser.
5. **The resonator**: the threshold, the output power and the best mirror, flat and curved mirrors, modes.
6. **How a laser starts, and pulses**: the avalanche, the flickering at the start, the giant pulse, mode locking.
7. **Safety**: why the eye is the target, the laser classes, the rules.

The text is written to read more easily, with everyday comparisons (an echo between cliffs, a dam, foxes and rabbits, a guitar string). Every formula, symbol and number with a unit is now typeset by KaTeX, also in the worked examples; the tests refuse a bare "×", "=" or Greek letter left in the text. Each section still has its **Dig deeper** box with the full version (not the history).

**The pictures.** Every section has a place for a picture: a dashed box that says "Picture to come:" and describes what the picture should show. When you have a picture, put it in the project (for example in `images/study/`) and write its file name in that section's `"image"` in `data/laser-study.json`: the box disappears, and the picture shows with its caption (already written) under it. The file's `_readme` at the top explains this too.

The numbers are written by the page, so if you move a chapter or a section in the file, the numbering and the contents follow by themselves, and the links in the text keep working.

**Please check:** the new Armenian text (again all mine), and the picture descriptions: change any of them to what you want to draw.

### Stage 12c: every common pump, the choices beside their parts, and "Learn more"

As you asked:

- **More pumps.** Each gain medium now has every pump that is common in practice, with its own numbers worked out and checked by hand: **Nd:glass with diodes** (802 nm, where neodymium in glass absorbs best; it starts lasing at 0.34 W and gives 0.41 W at 1 W) and **the dye with a flashlamp** (the lamp wraps around the tube the dye flows through, as in yellow 585 nm medical lasers; a flash of about a microsecond, threshold 6.6 J). As you chose, pairs known only from research papers are left out: ruby keeps only its flashlamp, Ti:sapphire only its green pump laser, and the gases only their electric discharge (a lamp or diode cannot reach their upper levels). The book now explains each of these (the ruby section, neodymium glass, the dye laser, and "What a pump does").
- **The two-level atom is gone from the simulator**, as you asked. It is still in the book.
- **The medium's dropdown is grouped**: Crystals and glass, Gases, Liquid, Semiconductor, and inside each group in the order they were invented.
- **The dropdowns sit beside their parts**: the gain medium's right above the drawing, over the drawn medium; the pump's right under it, over the drawn pump, with Fire under it. Nothing covers the laser. (On a phone the mirror buttons come between the drawing and the pump's dropdown.)
- **"Learn more" links** beside the medium, the pump, each mirror, the output mirror's slider, the Q-switch, the power chart, the stability diagram, the cartoon and "inside one atom". Each opens the book right at its section (ruby → 3.5 Ruby, the flashlamp → 4.2, inside one atom → 3.4 Two, three and four levels, and so on), and the medium's and pump's links follow your choice. Which section each opens is written in `data/laser.json` under `more`, so it is easy to change.

### Stage 12d: Wikipedia links in the book

As you asked, I went through the whole book and linked the first mention in each chapter of every person, place, material and device a reader may not know (Fabrikant, Maiman, the neon lamp, xenon, rhodamine 6G, Bell Labs, the cornea, …): **99 names in each language**. The English text links to English Wikipedia. The Armenian text links to Armenian Wikipedia where it has the article (44 of them, e.g. Einstein, the maser, chromium), otherwise to the same English article. Every address was checked to open a real article. A Wikipedia link opens in a new tab, so the reader keeps their place in the book. Kurt Nassau (neodymium crystal, 1961) has no article, so his name stays plain text.

**To add a link yourself**, in `data/laser-study.json`, put the words in square brackets and the address right after them in round brackets, with no space between:

    [Theodore Maiman](https://en.wikipedia.org/wiki/Theodore_Maiman)

- Copy the address from the browser's address bar on the Wikipedia article.
- A space in the address is written `_`. A round bracket must be written `%28` for `(` and `%29` for `)`, because a plain `)` would end the link: `https://en.wikipedia.org/wiki/Nature_%28journal%29`. (Armenian letters can stay as they are.)
- Add the link in both `"en"` and `"hy"`, in the same paragraph. In `"hy"` use the Armenian article (`https://hy.wikipedia.org/wiki/…`) if it exists (on the English article, "Հայերեն" in the languages list), else the same English address.
- Only link a name the first time it appears in a chapter.
- Then run `node --test`: it says if a link breaks a rule (another website, a link in one language only, the same link twice in a chapter).

### Stage 13b: the green beam (done while you slept, 21 November)

The second extra, also with every choice mine (the "Stage 13b scope card" in `docs/laser-plan.md`).

**What you will see:** on the two neodymium lasers (Nd:YAG and Nd:glass, whose light is invisible infrared at 1.06 µm), the row under the drawing has one more On/Off: "Doubling crystal (green)". Turn it on and a small crystal (KDP, the one in the book) stands in the beam just outside the output mirror. Some of the light that passes it comes out green, at half the wavelength (532 nm), and one readout line says how much: "Green light now".

**The physics shows itself:** a steady beam of a few watts makes almost no green (less than a millionth of it), so nothing green shows. Turn on the Q-switch, or fire the flashlamp lasers, and each short, strong pulse makes a bright green flash: the crystal works far better on strong light (on the flashlamp Nd:YAG about 7 % of a 10 MW pulse turns green). That is why real green pointers and green pulsed lasers are built the way they are.

**The green flash now fades** (your choice, 21 November): a real pulse lasts billionths of a second, so the green now glows on and fades over about half a second, easy to see; the "Green light now" number stays the true green power at that moment.

**Kept simple:** the crystal is outside the laser, so it changes nothing in the laser itself; it is always turned to the right angle (41.2°, the angle real KDP crystals are cut at); no new slider. It is offered only on the 1.06 µm lasers: the others would give ultraviolet or a colour that is not a common doubled laser.

### Stage 13c: the heated rod becomes a lens (done while you slept, 21 November)

You asked me to go on with stage 13 without asking, so I picked the smallest extra first and made every choice myself; each is written in `docs/laser-plan.md` (the "Stage 13c scope card") for you to check.

**What you will see:** on the Nd:YAG laser pumped by diodes (the page's first laser), move the pump slider up. The pump heats the middle of the crystal, and a warm crystal bends light like a weak lens. So, the harder you pump:
- the light's hourglass between the mirrors gets narrower;
- the traced rays bend a little in the middle of the crystal;
- the dot on the stability diagram slides towards the edge;
- one new line in the readouts, "Lens of the heated rod (focal length)", says how strong the lens is: about 4 m at the threshold, 1.2 m at 5 W, 30 cm at 20 W, and "—" with the pump off.

**No new button or slider.** Nothing changes on the other lasers: the flashlamp ones fire single flashes (the heat depends on how often you fire, which the page does not have), the gases have no crystal, the dye flows, laser glass is made so it barely forms a lens, and the Ti:sapphire's straight cavity is only a stand-in for the real folded one.

**One thing I decided not to do, and you may want:** the books say a laser can go *out* when pumped harder, because the lens pushes the mirrors past the stable edge. On this laser that only happens at 37 W, and even there the laser keeps shining, because it is then 24 times over its threshold and the unstable mirrors lose only a little. So I kept the slider at 20 W rather than show a dot in the "unstable" area with a laser still shining, which would confuse. You agreed to keep it this way (21 November).

## What is left

Stage 9 (several laser frequencies at once, with a spectrum panel) was dropped at your request: it would have made everything too complex. The laser stays one frequency.

Stage 10 was rewritten on 16 November from your requests (the mirrors, the focal points, the light's path, real-looking materials and diodes) and split into three parts, each finished, checked and saved on its own. The first two parts, 10a and 10b, are done (above). One thing I will ask you at the start of 10c: the diodes pump the crystal from its end (my recommendation: it matches the physics already in the simulator, and the pump light is easy to see) or from its side.

**A note on "curved light":** light goes in straight lines between the mirrors, and it only turns at a mirror. What looks curved is the whole beam narrowing and widening. Inside a crystal heated by the pump it does bend a little: since stage 13c the page shows that too (above).

| Stage | What it will add |
|---|---|
| 10c | **A bench that looks real** (next): ruby as a red rod, Nd:YAG pale lilac, Ti:sapphire pink, dye as a coloured liquid in a glass cell, the gases in glass tubes glowing in their real colours with atoms moving inside; more realistic diodes, with the pump light visibly going into the crystal and being absorbed; the laser beam in its real colour (and the invisible infrared ones in a marked false colour). |
| 11 | ~~Lenses outside the laser~~: **dropped** at your request (20 November). The lens physics was built and then removed; the page stays as it is. |
| 12 | ~~The "learn" section~~: **done** as your study page (20 November, below). |
| 13 | **Extras,** one at a time, the five you kept (21 November): doubling the frequency (an infrared beam turned green; **done**, 13b, above), heat in the rod acting as a lens (**done**, 13c, above), ~~mode-locking~~ (**dropped**, 21 November: built as a small graph, and you found it told nothing, so it was removed), the semiconductor diode laser, and the pump in more detail (the lamp's reflector). ~~Polarisation~~ and ~~self-focusing~~ were **dropped** at your request: they would hardly show on the page, and the book already explains both. |
| 14 | A final pass over all the documentation. |

## Things to know or check before going public

- **Most of the material numbers are textbook values not yet checked against printed sources.** Some choices were made where the sources disagree or say nothing; the plan marks each one "not verified". Examples: how much of the flash light reaches ruby's upper level (0.7), and the square law for argon. A physicist should look these over.
- **Ruby's spikes only partly match a real ruby laser.** With a flash a little above threshold (700–1000 J), the simulated ruby spikes for as long as it gives light, as the book describes. With a much stronger flash (2000 J or more), the spikes smooth out into a steady glow within about 0.3 ms, while a real ruby laser keeps spiking irregularly. Getting that right needs several frequencies and the heating of the rod, which this model leaves out (several frequencies were stage 9, which you dropped). This is a known limit, not a bug.
- **The CO₂ laser gives about 8 W**, while a real tube of that size gives 40–60 W, because the model spreads the light evenly across the tube. This is fine for showing how it works, but the number should not be presented as realistic.
- **The Armenian text should be read by a fluent speaker** before the page goes public.
- The code is saved on the `feature/laser` branch, stage by stage. Nothing has been pushed or published.
