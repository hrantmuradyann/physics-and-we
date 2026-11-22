# HTML class reference — Physics and We

This file explains **every class that appears in the site's HTML**: what it
means, how it looks on screen, and which CSS sits behind it.

How to use it: you find a `class="..."` you do not recognise in `sections/*.html`
and you look it up here.

The rule of the whole project: **there is no text and no styling in the HTML.**
The text comes from `data/*.json`, the look comes entirely from four CSS files.
A class in the markup is only a name that CSS uses to find the element.

---

## Contents

1. [How the markup is put together](#1-how-the-markup-is-put-together)
2. [The naming convention (BEM)](#2-the-naming-convention-bem)
3. [The frame of a page](#3-the-frame-of-a-page)
4. [Header, menu, footer](#4-header-menu-footer)
5. [Text classes](#5-text-classes)
6. [Buttons](#6-buttons)
7. [The page heading `.page-head`](#7-the-page-heading-page-head)
8. [Bands `.band`](#8-bands-band)
9. [Grids `.grid`](#9-grids-grid)
10. [Cards `.card`](#10-cards-card)
11. [Numbers `.stat`](#11-numbers-stat)
12. [Numbered steps `.steps`](#12-numbered-steps-steps)
13. [The day-by-day list `.timeline`](#13-the-day-by-day-list-timeline)
14. [Questions and answers `.faq`](#14-questions-and-answers-faq)
15. [A picture beside text `.showcase`](#15-a-picture-beside-text-showcase)
15b. [The story rows `.story-year`](#15b-the-story-rows-story-year)
16. [The closing invitation `.cta`](#16-the-closing-invitation-cta)
17. [The opening screen of the home page `.hero`](#17-the-opening-screen-of-the-home-page-hero)
18. [News: the feed and the item page](#18-news-the-feed-post-card-and-the-item-page-post)
18b. [The laser lab `.laser-*` and its banner `.lab-feature`](#18b-the-laser-lab-laser--and-its-banner-lab-feature)
19. [The appearing animation `.reveal`](#19-the-appearing-animation-reveal)
20. [Admin panel classes `/admin/`](#20-admin-panel-classes-admin)
21. [`data-*` attributes (not classes, but important)](#21-data--attributes-not-classes-but-important)
22. [CSS variables (colours and sizes)](#22-css-variables-colours-and-sizes)
23. [Responsive: what changes on a phone](#23-responsive-what-changes-on-a-phone)

---

## 1. How the markup is put together

| File | What is in it |
|---|---|
| [index.html](index.html) | The "shell": loads the CSS and JS and contains three empty places — `#site-header`, `#app`, `#site-footer`. No content. |
| [sections/](sections/) | One file per page — the structure of the blocks only, no text. |
| [data/](data/) | The text in both languages (hy / en). |
| [css/style.css](css/style.css) | Reset, the colour variables, header, footer. Shared by the site and the admin panel. |
| [css/site.css](css/site.css) | The look of every public page. |
| [css/home.css](css/home.css) | Only the opening block of the home page (`.hero`). |
| [css/simple.css](css/simple.css) | Linked last: the site's plain look (serif type, square corners, no shadows, lifts or fade-ins). |
| [css/labs.css](css/labs.css) | The labs pages: one lab, and the `.line-art` wrapper. |
| [css/laser.css](css/laser.css) | The laser lab (`?view=laser`) and the banner on the Labs page that leads to it. |
| [css/admin.css](css/admin.css) | Only the admin panel `/admin/` (always light). |

One important point: almost all of `site.css` is written as `body.site .something`.
The `site` class sits on `<body class="site home">` in [index.html](index.html#L34).
That is why the site's look applies only to the public pages, and the admin panel
keeps its own.

**One look.** The public site looks like an old scientific website: white
paper, black serif type, thin black rules and one red. (Until 2026-11-22 it
also had a dark and a light theme with a button in the header; the owner kept
only this look.) Nothing in the CSS names a colour directly: it uses the
variables in [section 22](#22-css-variables-colours-and-sizes), so a colour is
changed in one place. [css/simple.css](css/simple.css), linked last, takes
away the rounded corners, shadows, hover lifts and fade-ins that
[css/site.css](css/site.css) still describes for its blocks. If a new block
has its own shadow, rounded corners or animation, add a line for it there too.

---

## 2. The naming convention (BEM)

```
.card            ← block     (a thing that stands on its own)
.card__title     ← element   (a part inside it, two underscores)
.card--link      ← modifier  (a variant of the block, two hyphens)
```

* `__` means "a part of something". `.hero__title` is the heading inside `.hero`.
* `--` means "the same, but different". `.band--alt` is the same band, but lighter.
* A modifier is **never used on its own**, always together with the base class:
  `class="btn btn--primary"`, not `class="btn--primary"`.

---

## 3. The frame of a page

```html
<body class="site home">
  <header id="site-header"></header>
  <main id="app">
    <section class="view active" id="view-home">
      <section class="band">
        <div class="container"> ... </div>
      </section>
    </section>
  </main>
  <footer id="site-footer"></footer>
</body>
```

### `site` (on `<body>`)
**What it is:** a marker meaning "this is a public page of the site, not the admin panel".
**How it looks:** a white background `#ffffff` and near-black text `#1a1a1a`, in a serif type.
**CSS:** [css/site.css:23](css/site.css#L23)

```css
body.site {
  --header-h: 4.6rem;          /* header height, used as the top offset */
  background-color: var(--bg);
  color: var(--text);
}
```

### `home` (on `<body>`)
**What it is:** a marker meaning "the home page is open right now".
**How it looks:** the header becomes transparent and "floats" over the opening screen; `#app` loses its top padding so the hero can run underneath the header.
**CSS:** [css/site.css:39](css/site.css#L39), [css/site.css:73](css/site.css#L73)

```css
body.site:not(.home) #app { padding-top: var(--header-h); }  /* inner pages */
body.site.home #site-header { background: transparent; }     /* home page */
```

### `.container` ⭐ the most common class
**What it is:** a wrapper that keeps the content centred and stops lines from stretching across the whole monitor.
**How it looks:** an invisible box at most **1100 px** wide, pinned to the centre of the screen, with 1.5rem (24 px) of padding left and right so the text does not stick to the edges on a phone. It draws no background and no border of its own — it only aligns.
**Where:** inside almost every `<section>` — the section itself runs edge to edge (background, gradient) and the `.container` inside brings the text back into the shared column.
**CSS:** [css/site.css:43](css/site.css#L43)

```css
.container {
  max-width: var(--max-width);   /* 1100px, set in style.css */
  margin: 0 auto;                /* centring */
  padding: 0 1.5rem;             /* side padding */
  width: 100%;
}
```

### `.container--narrow`
**What it is:** the same container, but narrower.
**How it looks:** at most **780 px** wide — long text reads more easily when the line is not too long.
**Where:** the About and FAQ pages.
**CSS:** [css/site.css:50](css/site.css#L50)

```css
.container--narrow { max-width: 780px; }
```

### `.view` / `.view.active`
**What it is:** the wrapper of one page. It is not written by hand but created by [js/router.js](js/router.js#L57).
**How it looks:** `.view` is completely hidden (`display: none`); only the one carrying `active` is visible. That is how moving between pages works without the browser reloading.
**CSS:** [css/style.css:160](css/style.css#L160)

```css
.view        { display: none; }
.view.active { display: block; }
```

### `.line-art`
**What it is:** a wrapper around a whole page, written by hand as the first and last thing in the fragment. It used to put faint silver lines behind that page; since 2026-11-22 they are off (one commented rule in [css/labs.css](css/labs.css) brings back [images/lab-lines.svg](images/lab-lines.svg)). Inside it the bands are see-through and cards keep a solid colour.
**Where:** the Labs page ([sections/labs.html](sections/labs.html)), the page of one lab ([sections/lab.html](sections/lab.html)) and the laser lab ([sections/laser.html](sections/laser.html)).
**CSS:** [css/labs.css](css/labs.css)

```html
<div class="line-art">
  <section class="band"> ... </section>
</div>
```

### `.header-tools`
**What it is:** the box on the right of the header that holds the language buttons. Built by [js/main.js](js/main.js) — you never write it. (It also held the theme button until 2026-11-22.)
**CSS:** [css/site.css](css/site.css)

### `.page__error`
**What it is:** the message shown if a page failed to load.
**How it looks:** muted grey text in the centre, with large padding above and below (6rem).
**CSS:** [css/site.css:781](css/site.css#L781)

---

## 4. Header, menu, footer

The header and footer are **not written in HTML** — [js/main.js](js/main.js#L52) builds them from `data/site.json`.
But the classes in them are the same as everywhere else.

| Class | How it looks | CSS |
|---|---|---|
| `#site-header` | A bar pinned to the top of the screen (`position: fixed`), a semi-transparent dark blue background `rgba(8,11,26,.82)` plus a blur of whatever is behind it (`backdrop-filter: blur(14px)`), and a thin line underneath. | [css/site.css:57](css/site.css#L57) |
| `#site-header.scrolled` | Added by the script once the page has been scrolled. On the home page the header goes from transparent to frosted, shrinks slightly in height and gains a shadow. | [css/site.css:81](css/site.css#L81) |
| `.logo` | The site name on the left. Larger than ordinary text (1.3rem) and bold (700). | [css/style.css:99](css/style.css#L99) |
| `nav a` | A menu item. White, slightly transparent (0.9), fully white on hover. | [css/style.css:110](css/style.css#L110) |
| `nav a.current` | The item for the current page: fully white and bold. | [css/style.css:123](css/style.css#L123) |
| `nav a::after` | Not a class but a pseudo-element: a 2 px red underline (`--accent`). On hover it **slides in from left to right** over 0.28 s. | [css/site.css:96](css/site.css#L96) |
| `.lang-switcher` | The two language buttons on the right, in a row with a 0.4rem gap. | [css/style.css:129](css/style.css#L129) |
| `.lang-switcher button` | A transparent button with a border in the text colour, 6 px rounding, slightly transparent (0.75). | [css/style.css:134](css/style.css#L134) |
| `.active-lang` | The active language: white background, dark blue text, bold — it looks like a pressed button. | [css/style.css:150](css/style.css#L150) |
| `.footer__links` | The row of links in the footer, centred, wrapping onto a new line when there is not enough room. | [css/site.css:958](css/site.css#L958) |
| `.footer__text` | The copyright line, small (0.88rem), in a muted colour. | [css/site.css:975](css/site.css#L975) |

---

## 5. Text classes

### `.eyebrow`
**What it is:** the small caption **above** a heading (the "eyebrow").
**How it looks:** small (0.75rem) CAPITAL letters in light blue `#7ea8ff` with very wide spacing between the letters (`letter-spacing: .3em`). It reads like a section label: `R E S E A R C H`.
**CSS:** [css/site.css:120](css/site.css#L120)

```css
.eyebrow {
  letter-spacing: 0.3em;
  font-size: 0.75rem;
  color: var(--accent-soft);
  text-transform: uppercase;
  font-weight: 600;
}
```

### `.section-title`
**What it is:** the heading of a block inside a page (`<h2>`).
**How it looks:** large black bold text. The size is fluid — from 1.6rem on a phone to 2.2rem on a big screen. It is limited to 34 characters wide (`max-width: 34ch`), so a long heading wraps into a neat column instead of stretching across the whole screen.
**CSS:** [css/site.css:128](css/site.css#L128)

```css
.section-title {
  font-size: clamp(1.8rem, 3.4vw, 2.7rem);  /* minimum, preferred, maximum */
  font-weight: 800;
  color: #fff;
  line-height: 1.14;
  margin: 0.7rem 0 2.4rem;
  max-width: 34ch;
}
```

### `.lead`
**What it is:** the introductory paragraph under a heading.
**How it looks:** slightly larger than ordinary text (1.08rem), a muted grey-blue `#9aa6c4`, no wider than 52 characters.
**CSS:** [css/site.css:138](css/site.css#L138)

### `.prose`
**What it is:** the container for a long text of several paragraphs (filled in through `data-rich`).
**How it looks:** grey text at 1.05rem with generous line spacing of 1.8, up to 62 characters wide. Paragraphs are automatically spaced 1.1rem apart, and words marked `**bold**` in the JSON turn white.
**CSS:** [css/site.css:145](css/site.css#L145)

```css
.prose        { color: var(--muted); line-height: 1.8; max-width: 62ch; }
.prose p + p  { margin-top: 1.1rem; }   /* space between neighbouring paragraphs */
.prose strong { color: #fff; }          /* **bold** becomes white */
```

### `.link`
**What it is:** a link inside a text. The class is added automatically when someone writes `[text](address)` in the JSON.
**How it looks:** light blue, underlined, with the underline pushed 3 px away from the letters.
**CSS:** [css/site.css:161](css/site.css#L161)

---

## 6. Buttons

```html
<a class="btn btn--primary">Primary</a>
<a class="btn btn--ghost">Secondary</a>
<a class="btn btn--primary btn--lg">Large</a>
```

### `.btn` — the base
**How it looks:** a "pill" — fully rounded ends (`border-radius: 999px`), 0.9rem × 1.7rem of inner padding, semi-bold text. On its own it is transparent: the colour comes from the modifier.
**CSS:** [css/site.css:170](css/site.css#L170)

### `.btn--primary`
**How it looks:** flat red (`--accent`, the gradient in css/site.css runs from red to the same red), white text, square corners, no shadow; on hover it turns black (css/simple.css).
**CSS:** [css/site.css:184](css/site.css#L184)

```css
.btn--primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 12px 34px -10px rgba(47,128,237,.7);
}
.btn--primary:hover { transform: translateY(-3px); }
```

### `.btn--ghost`
**How it looks:** a "ghost" — an almost transparent background (white at 4 %), a light border, white text. On hover the background brightens to 12 % and the button lifts in the same way.
**CSS:** [css/site.css:195](css/site.css#L195)

### `.btn--lg`
**How it looks:** the same button, but bigger — 1.05rem × 2.5rem of padding, 1.05rem type. Used in the `.cta` block at the bottom of pages.
**CSS:** [css/site.css:207](css/site.css#L207)

---

## 7. The page heading `.page-head`

The first block of every page except the home page.

```html
<header class="page-head">
  <div class="container">
    <p class="eyebrow reveal" data-text="page.eyebrow"></p>
    <h1 class="page-head__title reveal" data-text="page.title"></h1>
    <p class="lead reveal" data-text="page.lead"></p>
  </div>
</header>
```

### `.page-head`
**How it looks:** a large page header with **three layered backgrounds**: a blue glow from the top left corner, a violet one from the top right, and a vertical gradient from `#070b1a` to `#0a1024`. The padding is fluid: 3.5–6rem at the top.
**CSS:** [css/site.css:215](css/site.css#L215)

```css
.page-head {
  padding: clamp(3.5rem, 8vw, 6rem) 0 clamp(2.5rem, 5vw, 4rem);
  overflow: hidden;
  background:
    radial-gradient(900px 460px at 20% 0%,  rgba(47,128,237,.22), transparent 62%),
    radial-gradient(700px 400px at 88% 20%, rgba(111,92,255,.18), transparent 60%),
    linear-gradient(180deg, var(--bg), var(--bg-3));
}
```

### `.page-head__title`
**How it looks:** the largest heading on a page (`<h1>`) — from 2.2rem to 3.6rem, white, very bold (800), with lines pressed close together (1.08) and a width of up to 18 characters.
**CSS:** [css/site.css:225](css/site.css#L225)

---

## 8. Bands `.band`

A page is built from horizontal bands. Alternating `.band` / `.band--alt` gives a visible rhythm.

| Class | How it looks | CSS |
|---|---|---|
| `.band` | A band across the full width of the screen, background `#0a1024`, with fluid vertical padding — from 3.5rem on a phone to 6rem on a desktop. | [css/site.css:240](css/site.css#L240) |
| `.band--alt` | The same, but with a slightly lighter background (`#0b1228`) plus thin lines above and below. That is what separates neighbouring bands visually. | [css/site.css:245](css/site.css#L245) |
| `.band--tight` | The same, but with reduced padding (2.5–3.5rem). For the block of numbers, which should not take up a whole screen. | [css/site.css:251](css/site.css#L251) |

```css
.band       { padding: clamp(3.5rem, 8vw, 6rem) 0; background: var(--bg-3); }
.band--alt  { background: var(--bg-2); border-top: 1px solid var(--line);
                                            border-bottom: 1px solid var(--line); }
.band--tight{ padding: clamp(2.5rem, 5vw, 3.5rem) 0; }
```

---

## 9. Grids `.grid`

| Class | How it looks | CSS |
|---|---|---|
| `.grid` | The base: a CSS Grid with a 1.3rem gap between items. | [css/site.css:258](css/site.css#L258) |
| `.grid--cards` | A row of cards that **works out for itself how many columns fit**: no column is narrower than 255 px. On a wide screen that is 4 across, on a tablet 2, on a phone 1. Nothing needs to be added. | [css/site.css:263](css/site.css#L263) |
| `.grid--stats` | The same for numbers, with a minimum column of 180 px and a 1.4rem gap. | [css/site.css:267](css/site.css#L267) |

```css
.grid--cards { grid-template-columns: repeat(auto-fit, minmax(255px, 1fr)); }
.grid--stats { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.4rem; }
```

`auto-fit` + `minmax` is the entire "responsiveness" of the cards: they need no media queries.

---

## 10. Cards `.card`

```html
<article class="card reveal">
  <span class="card__icon" data-icon="icon"></span>
  <h3 class="card__title" data-text="title"></h3>
  <p  class="card__text"  data-text="text"></p>
  <p  class="card__meta"  data-text="meta"></p>
</article>
```

### `.card`
**How it looks:** a rectangle with 18 px rounding and 2rem × 1.7rem of inner padding. The background is a barely visible gradient of translucent white (5.5 % → 2 %), which makes the card look slightly lighter than the dark background, like frosted glass. A thin light border. **On hover** it lifts 6 px, the border turns blue and a deep shadow appears — the card "floats up". The animation is smooth, 0.4 s.
**CSS:** [css/site.css:273](css/site.css#L273)

```css
.card {
  padding: 2rem 1.7rem;
  border-radius: 18px;
  background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.02));
  border: 1px solid var(--line);
  transition: transform .4s cubic-bezier(.2,.7,.2,1), border-color .4s, box-shadow .4s;
}
.card:hover {
  transform: translateY(-6px);
  border-color: rgba(47,128,237,.5);
  box-shadow: 0 26px 55px -22px rgba(0,0,0,.85);
}
```

### `.card--link`
**What it is:** the variant of the card that is a link in its entirety (`<a class="card card--link">`).
**How it looks:** visually no different, but on hover it animates the arrow at the bottom (see `.card__arrow`).
**CSS:** [css/site.css:355](css/site.css#L355)

### The parts of a card

| Class | How it looks | CSS |
|---|---|---|
| `.card__icon` | A 48×48 square with 13 px rounding, a translucent blue-violet fill and the icon centred inside it (24×24, drawn as SVG by the script). 1.2rem of space underneath. | [css/site.css:294](css/site.css#L294) |
| `.card__title` | The card heading: white, 1.2rem, bold (700). | [css/site.css:310](css/site.css#L310) |
| `.card__text` | The description: grey-blue `#9aa6c4`, 0.95rem, line height 1.65. | [css/site.css:318](css/site.css#L318) |
| `.card__meta` | The small caption at the bottom (for example "grade 10 · 2 hours"): 0.82rem, light blue, slightly transparent, 1.1rem of space above it. | [css/site.css:324](css/site.css#L324) |
| `.card__meta--top` | The same caption, but **above** the heading, in CAPITALS, smaller still (0.72rem) with wide `letter-spacing`. Used on the sponsors page for the role. | [css/site.css:332](css/site.css#L332) |
| `.card__arrow` | The "Learn more →" line. Light blue, semi-bold. The `→` arrow is **not written in the HTML** — CSS draws it with `::after`. On hovering the card the gap between the text and the arrow grows from 0.4 to 0.7rem, and the arrow itself slides 3 px to the right. | [css/site.css:340](css/site.css#L340) |

```css
.card__arrow::after { content: "→"; transition: transform .25s ease; }
.card--link:hover .card__arrow          { gap: 0.7rem; }
.card--link:hover .card__arrow::after   { transform: translateX(3px); }
```

---

## 11. Numbers `.stat`

```html
<div class="stat reveal">
  <span class="stat__num" data-number="number" data-suffix="suffix">0</span>
  <span class="stat__label" data-text="label"></span>
</div>
```

| Class | How it looks | CSS |
|---|---|---|
| `.stat` | A tile with centred text, a thin border, 16 px rounding and an almost transparent white background (2 %). On hover it lifts 4 px and the border turns blue. | [css/site.css:368](css/site.css#L368) |
| `.stat__num` | The number itself. Very large (2.1–3.1rem) and extra bold. Solid, in the heading colour (it used to be gradient-filled text, which reads as machine-made, so it was made plain). The value counts up from zero, driven by [js/anim.js](js/anim.js#L46) when the block comes into view. | [css/site.css:382](css/site.css#L382) |
| `.stat__label` | The caption under the number: grey, 0.92rem, 0.6rem of space above. | [css/site.css:393](css/site.css#L393) |

```css
.stat__num {
  font-size: clamp(2.1rem, 4vw, 3.1rem);
  font-weight: 800;
  color: var(--heading);   /* solid black */
}
```

---

## 12. Numbered steps `.steps`

```html
<ol class="steps" data-list="steps.items">
  <li class="step reveal">
    <h3 class="step__title"></h3>
    <p  class="step__text"></p>
  </li>
</ol>
```

**The numbers 1 2 3 4 are not written in the HTML** — a CSS counter puts them there.

| Class | How it looks | CSS |
|---|---|---|
| `.steps` | A grid of columns no narrower than 230 px, with a 1.6rem gap. This is also where the counter is reset: `counter-reset: step`. | [css/site.css:403](css/site.css#L403) |
| `.step` | One step. 3.2rem of padding at the top, which is where the numbered circle sits. Each step increases the counter by 1. | [css/site.css:410](css/site.css#L410) |
| `.step::before` | The numbered circle: 2.4rem, perfectly round, red, with the white bold digit centred inside. | [css/site.css:414](css/site.css#L414) |
| `.step::after` | A thin horizontal line running from the circle to the right, towards the next step. Hidden on the last step, and hidden on all of them on a narrow screen. | [css/site.css:430](css/site.css#L430) |
| `.step__title` | The white heading of the step, 1.1rem, bold. | [css/site.css:446](css/site.css#L446) |
| `.step__text` | The grey description, 0.95rem. | [css/site.css:453](css/site.css#L453) |

```css
.steps { counter-reset: step; }
.step  { counter-increment: step; padding-top: 3.2rem; position: relative; }
.step::before {
  content: counter(step);                      /* 1, 2, 3 … goes in here */
  position: absolute; top: 0; left: 0;
  width: 2.4rem; height: 2.4rem; border-radius: 50%;
  display: grid; place-items: center;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
```

---

## 13. The day-by-day list `.timeline`

The vertical "day after day" list on the camp page.

| Class | How it looks | CSS |
|---|---|---|
| `.timeline` | The list, with 1.8rem of padding on the left and a 1.6rem gap. | [css/site.css:462](css/site.css#L462) |
| `.timeline::before` | A 1 px vertical line running the length of the list, in a gradient from blue at the top to transparent at the bottom — as if the line dissolves. | [css/site.css:467](css/site.css#L467) |
| `.timeline__item` | One day. | [css/site.css:479](css/site.css#L479) |
| `.timeline__item::before` | A 0.7rem blue dot on the line, with a soft translucent halo around it (`box-shadow: 0 0 0 4px`). | [css/site.css:481](css/site.css#L481) |
| `.timeline__label` | "DAY 1" — small light blue capitals with wide `letter-spacing: .18em`. | [css/site.css:495](css/site.css#L495) |
| `.timeline__title` | The white heading of the day, 1.15rem, bold. | [css/site.css:503](css/site.css#L503) |
| `.timeline__text` | The grey description, up to 62 characters wide. | [css/site.css:510](css/site.css#L510) |

---

## 14. Questions and answers `.faq`

Built on the standard `<details>` / `<summary>` tags — **without a single line of JavaScript**.

```html
<div class="faq" data-list="questions">
  <details class="faq__item reveal">
    <summary class="faq__question" data-text="q"></summary>
    <div class="faq__answer" data-rich="a"></div>
  </details>
</div>
```

| Class | How it looks | CSS |
|---|---|---|
| `.faq` | The list of questions, with a 0.8rem gap. | [css/site.css:520](css/site.css#L520) |
| `.faq__item` | A rectangle with a border, 14 px rounding, slightly lighter than the background. | [css/site.css:525](css/site.css#L525) |
| `.faq__item[open]` | Not a class but a state: when a question is **open**, the border turns blue and the background takes on a blue tint. | [css/site.css:530](css/site.css#L530) |
| `.faq__question` | The question itself, clickable (`cursor: pointer`), white and semi-bold, 1.15rem of padding, with 3rem left free on the right for the "+" sign. | [css/site.css:537](css/site.css#L537) |
| `.faq__question::after` | The **+** sign on the right. When the question is open it **rotates 45°** and becomes an ×. The browser's default triangle is hidden. | [css/site.css:550](css/site.css#L550) |
| `.faq__answer` | The answer: grey text, line height 1.75, 1.3rem of space below. | [css/site.css:568](css/site.css#L568) |

```css
.faq__question::after { content: "+"; transition: transform .3s ease; }
.faq__item[open] .faq__question::after { transform: translateY(-50%) rotate(45deg); }
.faq__question::-webkit-details-marker { display: none; }  /* remove the triangle */
```

---

## 15. A picture beside text `.showcase`

| Class | How it looks | CSS |
|---|---|---|
| `.showcase` | A section with a vertical gradient from `#0b1228` to `#0a1024` and large 4–7rem padding. | [css/site.css:581](css/site.css#L581) |
| `.showcase__inner` | Two columns: the picture slightly wider than the text (`1.05fr 1fr`), vertically centred against each other. Below 860 px it becomes a single column. | [css/site.css:586](css/site.css#L586) |
| `.showcase__media` | The wrapper around the picture. It **slowly floats up and down** — the `float` animation, 6.5 s, infinite, over a range of 14 px. | [css/site.css:593](css/site.css#L593) |
| `.showcase__media img` | 18 px rounding, a light border, a deep shadow underneath. | [css/site.css:601](css/site.css#L601) |
| `.showcase__media::after` | A blue-violet patch **behind** the picture with a 34 px blur — the glow that seems to come out from under the photo. | [css/site.css:609](css/site.css#L609) |
| `.showcase__text` | The right column with the text and the button. The `.lead` inside it has 1.9rem of space below. | [css/site.css:620](css/site.css#L620) |

```css
.showcase__inner { display: grid; grid-template-columns: 1.05fr 1fr; align-items: center; }
.showcase__media { animation: float 6.5s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
```

---

## 15b. The story rows `.story-year`

Used only on the **our story** page: one row per year, the picture changing
side every second year.

| Class | How it looks | CSS |
|---|---|---|
| `.story` | The column holding all the years, with a big 3–5.5rem gap between them. It is the `data-list="years"` host, so it also keeps the `<template>` — that is why the rule below counts with `nth-of-type`, not `nth-child`. | [css/site.css:684](css/site.css#L684) |
| `.story-year` | One year: two equal columns (picture, text), vertically centred. Below 860 px it becomes a single column with the picture on top. | [css/site.css:689](css/site.css#L689) |
| `.story-year__media` | The frame the picture sits in: 4:3, 18 px rounding. While that year has no picture yet it is an empty **dashed** frame; as soon as `image` in `data/story.json` is filled in, the frame turns into an ordinary photo border with a deep shadow. | [css/site.css:702](css/site.css#L702) |
| `.story-year__media img` | Fills the frame (`object-fit: cover`). An `<img>` with no file named is hidden, which is what leaves the empty frame visible. | [css/site.css:717](css/site.css#L717) |
| `.story-year__text` | The year, the heading, the text and the album button. | — |
| `.story-year__link` | The button linking to that year's photo album, 1.6rem below the text. It disappears by itself while the address in `data/story.json` is still empty. | [css/site.css:712](css/site.css#L712) |

```css
.story-year { display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
.story-year:nth-of-type(even) .story-year__media { order: 2; }   /* picture on the right */
.story-year__media { border: 2px dashed rgba(255,255,255,.22); }  /* empty frame */
.story-year__media:has(img[src]) { border: 1px solid rgba(255,255,255,.12); }  /* has a photo */
```

---

## 16. The closing invitation `.cta`

CTA = call to action. The last block on most pages.

| Class | How it looks | CSS |
|---|---|---|
| `.cta` | A section with centred text and large 4–7rem padding. The background: a blue glowing patch at the top centre plus a gradient down to the darkest colour at the bottom. | [css/site.css:629](css/site.css#L629) |
| `.cta::before` | An enormous round violet patch (50vw × 50vw) that **pulses slowly** — the `pulseGlow` animation over 7 s: opacity 0.5 → 1, scale 1 → 1.12. It does not block clicks (`pointer-events: none`). | [css/site.css:637](css/site.css#L637) |
| `.cta__inner` | The content sitting above the glow (`z-index: 2`), at most 720 px wide. Used together with `.container`. | [css/site.css:658](css/site.css#L658) |
| `.cta__title` | A large black heading, 1.6–2.3rem, bold. | [css/site.css:664](css/site.css#L664) |
| `.cta__text` | Grey text at 1.1rem with 2rem of space below — the `.btn--lg` button sits underneath it. | [css/site.css:672](css/site.css#L672) |

---

## 17. The opening block of the home page `.hero`

All of this lives in its own file, [css/home.css](css/home.css), and is used only on the home page. (Until 2026-11-22 it filled the screen, with moving stars drawn by js/home.js, glows and a "scroll down" hint; the owner chose the plain look.)

| Class | How it looks | CSS |
|---|---|---|
| `.hero` | A plain white block with 3rem of space above and 4rem below, and a thin black rule under it. | [css/home.css](css/home.css) |
| `.hero__content` | The text block, with 6rem of padding at the top so it does not run under the header. Used together with `.container`. | [css/home.css](css/home.css) |
| `.hero .eyebrow` | The section label, with 1.3rem of space below. | [css/home.css](css/home.css) |
| `.hero__title` | The largest text on the site: from 2rem up to **3.3rem**, black, bold, with lines almost touching (1.03) and a width of up to 24 characters. | [css/home.css](css/home.css) |
| `.hero__subtitle` | The subtitle, 1.05–1.3rem, grey, up to 48 characters wide. | [css/home.css](css/home.css) |
| `.hero__actions` | The row of two buttons, 1rem gap, wrapping on a phone. | [css/home.css](css/home.css) |

---

## 18. News: the feed `.post-card` and the item page `.post`

News works the way a social feed does: **a feed of cards** and **a separate page for each item**.

| Page | Address | Markup file | Where everything is inserted |
|---|---|---|---|
| The feed | `?view=news` | [sections/news.html](sections/news.html) | `<div id="news-list">` |
| One item | `?view=post&id=<address>` | [sections/post.html](sections/post.html) | `<div id="news-post">` |

The markup for news is **not written by hand** — [js/news.js](js/news.js) builds all of it from `news.json`.
The section files hold nothing but empty boxes:

```html
<!-- sections/news.html -->
<div id="news-list" class="news-list"></div>

<!-- sections/post.html -->
<div id="news-post" class="news-post"></div>
```

The `post` route is hidden from the menu: in [data/site.json](data/site.json) it carries `"hidden": true`,
so it does not appear in the header, but it can still be opened by link.

### The container wrappers

| Class | How it looks | CSS |
|---|---|---|
| `.container--feed` | A column at most **720 px** wide — a single-column feed, like a social network. | [css/site.css:689](css/site.css#L689) |
| `.container--reading` | A column at most **760 px** wide — a comfortable line length for reading an article. | [css/site.css:693](css/site.css#L693) |
| `.band--feed` | A band with reduced top padding — the feed begins immediately under the page heading. | [css/site.css:697](css/site.css#L697) |
| `.band--article` | The band the article sits in. | [css/site.css:701](css/site.css#L701) |
| `.news-list` | A single-column grid with a 1.6rem gap between cards. | [css/site.css:706](css/site.css#L706) |

### A card in the feed

```html
<article class="post-card reveal">
  <a class="post-card__link" href="?view=post&id=…" data-goto="post" data-id="…">
    <div class="post-card__media"><img …></div>
    <div class="post-card__body">
      <div class="post-card__meta"><time class="post-card__date">…</time></div>
      <h3 class="post-card__title">…</h3>
      <p class="post-card__excerpt">…</p>
      <span class="post-card__more">Read more</span>
    </div>
  </a>
</article>
```

| Class | How it looks | CSS |
|---|---|---|
| `.post-card` | A card with 20 px rounding and `overflow: hidden` so the photograph is clipped to the rounding. The same "glassy" gradient as `.card`. On hover it lifts 4 px, the border turns blue and a shadow appears. | [css/site.css:713](css/site.css#L713) |
| `.post-card__link` | A link covering the whole card (`display: block`) — a tap anywhere opens the item. The `data-goto="post"` and `data-id="<address>"` attributes are intercepted by [js/router.js](js/router.js), so the move happens without a reload. | [css/site.css:729](css/site.css#L729) |
| `.post-card__media` | The photo frame with a fixed **16:9** aspect ratio — cards are the same height whatever the size of the picture. | [css/site.css:734](css/site.css#L734) |
| `.post-card__media img` | `object-fit: cover` — the photograph fills the frame without distortion and the excess is cropped. On hovering the card it **smoothly grows by 4 %** over 0.6 s. | [css/site.css:739](css/site.css#L739) |
| `.post-card__body` | The text part under the photograph, 1.5rem × 1.7rem of padding. | [css/site.css:753](css/site.css#L753) |
| `.post-card__meta` | The line above the heading (at present it holds only the date), flex with a 0.6rem gap. | [css/site.css:757](css/site.css#L757) |
| `.post-card__date` | The date: small (0.78rem), light blue, in CAPITALS, with wide `letter-spacing`. | [css/site.css:764](css/site.css#L764) |
| `.post-card__title` | The heading of the item: white, 1.4rem, bold. | [css/site.css:771](css/site.css#L771) |
| `.post-card__excerpt` | The short description: grey, 1rem. If it was left empty in the admin panel, the opening of the text is used instead, cut at a word boundary at about 180 characters. | [css/site.css:779](css/site.css#L779) |
| `.post-card__more` | "Read more →". The arrow is drawn with `::after`; on hovering the card the gap grows and the arrow slides right. | [css/site.css:785](css/site.css#L785) |
| `.news-empty` | An italic grey line shown when there is no news. | [css/site.css:804](css/site.css#L804) |

### The page of one item

| Class | How it looks | CSS |
|---|---|---|
| `.post__head` | The head of the article: the back link, the date, the heading and the lead. 2rem of space below. | [css/site.css:813](css/site.css#L813) |
| `.post__back` | "← All news". Light blue, semi-bold. On hover it turns white and **shifts 3 px to the left** — towards where it leads. It appears twice: at the top and at the end of the article. | [css/site.css:818](css/site.css#L818) |
| `.post__date` | The date above the heading: small, light blue, in CAPITALS. | [css/site.css:832](css/site.css#L832) |
| `.post__title` | The heading of the article: from 1.9rem to 3rem, white, extra bold. | [css/site.css:841](css/site.css#L841) |
| `.post__lead` | The short description under the heading: grey, 1.15rem. | [css/site.css:850](css/site.css#L850) |
| `.post__media` | The large photograph: 18 px rounding, a light border, a deep shadow. Unlike the card, the height is **not** cropped — the picture is seen in full. | [css/site.css:857](css/site.css#L857) |
| `.post__caption` | The caption under the photograph, on a slightly lighter backing. Shown only if a description of the picture was filled in through the admin panel. | [css/site.css:870](css/site.css#L870) |
| `.post__body` | The text of the article: 1.08rem, line height 1.85, 1.2rem between paragraphs. A blank line in the admin panel means a new paragraph. | [css/site.css:878](css/site.css#L878) |
| `.post__foot` | The foot of the article: ruled off with a line above, and the back link again. | [css/site.css:888](css/site.css#L888) |
| `.post-related` | The "More news" block under the article, separated by a line. | [css/site.css:900](css/site.css#L900) |
| `.post-related__grid` | The grid for the cards in that block. Inside it `.post-card` **shrinks**: a 2:1 photo, smaller type and padding — it is a footnote, not the main block. | [css/site.css:913](css/site.css#L913) |
| `.post-missing` | The "this news item no longer exists" message, shown when the address names an `id` that does not exist. Centred, with a button to go back. | [css/site.css:927](css/site.css#L927) |

> **About security.** All the text from `news.json` is inserted with `textContent`
> rather than `innerHTML` — so nothing typed into the admin panel can become working
> code on the page. The address of a picture is checked as well: only `https://…`
> and files inside the site get through, and everything else (`javascript:`, `data:`,
> `//someone-elses-site`) is thrown away.

---

## 18b. The laser lab `.laser-*` and its banner `.lab-feature`

The laser lab is one big lab with a page of its own, `?view=laser`
([sections/laser.html](sections/laser.html), words in [data/laser.json](data/laser.json)).
It is not built by `js/labs.js`; its pictures are drawn by the scripts in `js/laser/`.
It is still being built, stage by stage (`docs/laser-plan.md`). The sliders and numbers
use the labs' own `.lab__panel`, `.lab-control` and `.lab-readout` (from [css/labs.css](css/labs.css)), arranged by the `.laser-*` classes below.
The page follows a drawing by the site's owner, described in `docs/laser-plan.md` ("Stage 6b").

```html
<div class="line-art">
  <div class="page-head laser-head">            <!-- a <div>: a <header> would get the site's header bar -->
    <div class="container container--laser">
      <a class="lab__back" …>← All labs</a>
      … eyebrow, title, lead …
      <p class="laser-status">This lab is still being built …</p>
    </div>
  </div>
  <section class="band band--laser">
    <div class="container container--laser">
      <div class="laser-stage">
        <div class="laser-stage__more"><button class="btn btn--primary" data-laser-action="learn">Dig deeper …</button></div>
        <div class="laser-stage__bench laser-bench">
          <canvas class="laser-bench__canvas" data-laser-canvas="bench" role="img"></canvas>
          <div class="laser-under" data-laser-under hidden>   <!-- right under the drawing -->
            <button class="btn btn--primary laser-fire" data-laser-action="fire" data-ready="false" hidden>
              <svg class="laser-fire__bolt" aria-hidden="true">…</svg><span>Fire the flash</span>
            </button>
            <div class="laser-switch" data-laser-switch hidden>
              <span class="laser-switch__name" id="laser-switch-name">Q-switch (bleachable filter)</span>
              <button class="laser-switch__toggle" role="switch" aria-checked="false" aria-labelledby="laser-switch-name" data-laser-action="qSwitch">
                <span class="laser-switch__track"><span class="laser-switch__knob"></span></span>
                <span class="laser-switch__word" data-laser-name="qSwitchState">Off</span>
              </button>
            </div>
          </div>
        </div>
        <div class="laser-stage__controls lab__panel">
          <div class="laser-choose">
            <div class="laser-choose__item">
              <label class="lab-control__name" for="laser-medium">Medium</label>
              <select class="laser-choose__select" id="laser-medium" data-laser-choose="medium"></select>
            </div>
            … the same for the pump (data-laser-choose="pump") …
          </div>
          <div class="lab__controls">
            <div class="lab-control">
              <div class="lab-control__label">
                <label class="lab-control__name" for="laser-pump" id="laser-pump-name" data-laser-name="pump"></label>
                <span class="laser-field">
                  <input class="laser-field__input" type="text" inputmode="decimal" aria-labelledby="laser-pump-name" data-laser-input="pump">
                  <span class="laser-field__unit" data-laser-unit="pump">W</span>
                </span>
              </div>
              <input class="lab-control__input" id="laser-pump" type="range" data-laser-control="pump">
            </div>
            … the output mirror's slider, then each mirror's shapes: …
            <div class="laser-mirror" data-laser-mirror="mirror1">
              <span class="lab-control__name" id="laser-mirror1-name">Back mirror</span>
              <div class="laser-shapes" role="group" aria-labelledby="laser-mirror1-name">
                <button class="laser-shape" type="button" aria-pressed="false" data-laser-shape="flat">
                  <svg class="laser-shape__icon" aria-hidden="true">…</svg><span>Flat</span>
                </button>
                … concave, convex …
              </div>
            </div>
            <div class="lab-control" data-laser-slider="Rc1" hidden> … its radius slider, like the pump's … </div>
            … the same for the output mirror (mirror2, Rc2), the filter's slider, and the slow motion, which has <p class="laser-hint" data-laser-value="slowMotion"> under it …
          </div>
          <div class="lab__buttons"> … Play (data-laser-action="play"), Reset … </div>
          <p class="laser-note" data-laser-note="behind" hidden>…</p>
        </div>
        <div class="laser-stage__side">
          <div class="laser-side__chart laser-bench"><canvas class="laser-bench__canvas laser-bench__canvas--chart" data-laser-canvas="power" role="img"></canvas></div>
          <div class="laser-side__stability laser-bench"><canvas class="laser-bench__canvas" data-laser-canvas="stability" role="img"></canvas></div>
          <div class="laser-side__numbers lab__panel"><div class="lab__readouts laser-readouts"> … one .lab-readout data-laser-row="…" per number … </div></div>
        </div>
        <div class="laser-stage__photons">
          <div class="laser-bench"><canvas class="laser-bench__canvas" data-laser-canvas="photons" role="img"></canvas></div>
          <div class="laser-bench"><canvas class="laser-bench__canvas" data-laser-canvas="atoms" role="img"></canvas></div>
        </div>
      </div>
    </div>
  </section>
  <section class="band laser-learn" data-laser-learn>
    <div class="container container--narrow">
      <h2 class="section-title">How a laser works</h2>
      <div class="laser-chapters" data-list="learn.chapters">
        <template><article class="laser-chapter"><h3 class="laser-chapter__title"></h3><div class="prose"></div></article></template>
      </div>
    </div>
  </section>
</div>
```

| Class | How it looks | CSS |
|---|---|---|
| `.container--laser` | The laser page's own container: up to 1480 px wide (the other labs' is 960 px), because its blocks stand in three columns. | [css/laser.css](css/laser.css) |
| `.laser-head` | The title block of the laser page. It is a `.page-head` (the same big title as every inner page); this class only spaces the back link above the eyebrow. | [css/laser.css](css/laser.css) |
| `.laser-status` | The small note under the lead that says the lab is still being built: muted text in a lightly filled box with a thin border and rounded corners. Delete its words in `data/laser.json` and it disappears. | [css/laser.css](css/laser.css) |
| `.band--laser` | The stripe the bench sits in. Less padding on top than an ordinary `.band`, so the bench is on the first screen. | [css/laser.css](css/laser.css) |
| `.laser-stage` | The grid of the page's main blocks. Wide screens (1100 px and up): three columns, with the bench over the first two, the controls and the photon picture under it, and the chart with the numbers down the third. From 760 px: two columns (controls beside photons; the chart beside its numbers). Narrower: one column, in the order the blocks are written. | [css/laser.css](css/laser.css) |
| `.laser-stage__more` | The row with the "dig deeper" button, centred over the bench. | [css/laser.css](css/laser.css) |
| `.laser-stage__bench`, `__controls`, `__photons`, `__side` | Where each block goes in the grid. `__side` holds the big chart, the mirrors' stability diagram and the panel of numbers. | [css/laser.css](css/laser.css) |
| `.laser-side__chart`, `__stability`, `__numbers` | The three blocks of the side column. On a wide screen (1100 px and up) they stand one under the other beside the bench: the chart, the stability diagram right under it (to watch while the laser runs), the numbers. From 760 px the chart and the diagram stand on the left with the numbers beside them. | [css/laser.css](css/laser.css) |
| `.laser-mirror` | One mirror's name and its three shape buttons, on one line (wrapping on a narrow panel). | [css/laser.css](css/laser.css) |
| `.laser-shapes` | The group of the three buttons (`role="group"`, named by the mirror's name). | [css/laser.css](css/laser.css) |
| `.laser-shape` | One shape: a small button with a picture of the mirror's face (`.laser-shape__icon`, drawn in the text colour) and its word. The chosen one (`aria-pressed="true"`, set by `js/laser/page.js`) has an accent border, bold words and an accent picture. | [css/laser.css](css/laser.css) |
| `.laser-bench` | The box around a picture of the lab (the bench, the chart, the photons): rounded corners, a thin border, a soft glow at the top and a deep shadow — the same look as the frame of the other labs. It sets the width of the canvas inside it. | [css/laser.css](css/laser.css) |
| `.laser-bench__canvas` | A canvas the lab draws on, as wide as its box. Its height is set by `js/laser/ui/loop.js`. | [css/laser.css](css/laser.css) |
| `.laser-bench__canvas--chart` | The chart of the output power: the mouse pointer is a crosshair, and on a touch screen a sideways drag moves the chart's crosshair while an up-and-down drag still scrolls the page (`touch-action: pan-y`). | [css/laser.css](css/laser.css) |
| `.laser-under` | The row right under the drawing of the laser, inside the bench's box, with a thin line above it: the Q-switch on the left (under the drawn filter), Fire in the middle (under the drawn lamp, which is centred). On a screen under 760 px wide the two go one under the other, Fire first. It starts `hidden`; `js/laser/page.js` shows it on a laser that has Fire or the Q-switch. | [css/laser.css](css/laser.css) |
| `.laser-fire` | Fire (also a `.btn .btn--primary`): a big pill with a lightning bolt (`.laser-fire__bolt`) and its word, white on the accent gradient. While the lamp is dark (`data-ready="true"`, set by `js/laser/page.js`) a ring of light keeps swelling out of it and the bolt pulses, so a visitor who does not know what it is still wants to press it; while a flash is lit it waits. For a visitor who asks for less motion the ring stands still. | [css/laser.css](css/laser.css) |
| `.laser-switch` | The Q-switch's group in that row: its name (`.laser-switch__name`) over the On/Off (beside it on a narrow screen). Starts `hidden`; shown on a laser that can have the filter. | [css/laser.css](css/laser.css) |
| `.laser-switch__toggle` | The On/Off: a button with `role="switch"`, a rounded track (`__track`) that fills with the accent gradient when on, while its knob (`__knob`) slides right, and the word On or Off (`__word`, written by `js/laser/page.js`). | [css/laser.css](css/laser.css) |
| `.laser-choose` | The two dropdowns that choose the laser (the medium, then its pump), at the top of the controls, with a thin line under them. Side by side when the panel is wide enough, one under the other when it is not: a column is at least 15rem, so the longest Armenian name is not cut. | [css/laser.css](css/laser.css) |
| `.laser-choose__item` | One dropdown with its name above it. The name is a `.lab-control__name`, like a slider's. | [css/laser.css](css/laser.css) |
| `.laser-choose__select` | The dropdown itself: as wide as its column, bold, on the page's second background colour with a thin border. Its options are made by `js/laser/page.js` (the names are `media.*` and `pumps.*` in `data/laser.json`); a medium that cannot be simulated yet is greyed out, with "(coming later)" after its name. | [css/laser.css](css/laser.css) |
| `.laser-field` | A number box with its unit, on the same line as a slider's name. | [css/laser.css](css/laser.css) |
| `.laser-field__input` | The number box: small, right-aligned bold figures on a lightly filled background with a thin border. It is a text box (`type="text" inputmode="decimal"`), not `type="number"`, so a decimal comma ("13,5") works in every browser; the page reads the number itself. | [css/laser.css](css/laser.css) |
| `.laser-field__unit` | The unit after the box ("W", "%", "×"), in the accent colour. Written by `js/laser/page.js`. | [css/laser.css](css/laser.css) |
| `.laser-hint` | The small muted line under the slow-motion slider ("1 s = 100 µs"). | [css/laser.css](css/laser.css) |
| `.laser-readouts` | The numbers (also a `.lab__readouts`), in a panel of their own, so without the line the labs draw above them. | [css/laser.css](css/laser.css) |
| `.laser-note` | A small note in the accent colour under the buttons. It starts `hidden`; `js/laser/page.js` shows it only while the computer cannot keep up with the chosen slow motion. Do not give it a `display` rule, or `hidden` stops working. | [css/laser.css](css/laser.css) |
| `.laser-learn` | The theory section at the bottom, where the "dig deeper" button scrolls to. | [css/laser.css](css/laser.css) |
| `.laser-chapters`, `.laser-chapter`, `.laser-chapter__title` | The list of chapters; one chapter, a rounded panel with a solid colour under it (so the silver lines do not run through the words); its heading. The text inside is a `.prose`. | [css/laser.css](css/laser.css) |
| `.lab-feature` | The big banner on the Labs page that leads to the laser lab. It is also a `.card .card--link`, so it answers the mouse like the other cards (border, shadow, the arrow moving); it is larger, has a blue-to-violet stripe down its left edge (red now: `--accent`), and sits above the grid of the other labs. It is the one item of the list `featured.items` in `data/labs.json`: deleting that item removes the whole banner. Where it leads is written in the layout. | [css/laser.css](css/laser.css) |
| `.lab-feature__title` | The banner's heading: larger than a card title (1.5–2.1rem), extra bold. | [css/laser.css](css/laser.css) |
| `.lab-feature__text` | The banner's sentence: muted, 1.02rem, at most 62 characters wide. | [css/laser.css](css/laser.css) |

---

## 19. The appearing animation `.reveal`

The most general class of all: it can be added **to anything**.

**How it looks:** the element starts invisible (`opacity: 0`) and shifted 26 px down. When scrolling brings it into view, [js/anim.js](js/anim.js#L20) adds the class `is-visible` and over 0.8 s the element smoothly **fades in and rises into place**.

The items in a row do **not** appear all at once but one after another: the script sets a `--i` variable on each (its position in the row) and the delay is worked out as `--i × 0.09s`.

**CSS:** [css/site.css:766](css/site.css#L766)

```css
.reveal {
  opacity: 0;
  transform: translateY(26px);
  transition: opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1);
  transition-delay: calc(var(--i, 0) * 0.09s);   /* the "wave" effect */
}
.reveal.is-visible { opacity: 1; transform: none; }
```

If the visitor has asked their system to "reduce motion", all of this is switched off — [css/site.css:835](css/site.css#L835):

```css
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
}
```

> Forgetting `reveal` simply means the block is visible straight away — nothing breaks.
> Adding `reveal` when the JS does not run means the block stays **invisible**.

---

## 20. Admin panel classes `/admin/`

For [admin/index.html](admin/index.html) and [admin/login.html](admin/login.html).
The admin panel is always **light**: a white background and dark blue headings. The public site does not load these styles.

> These pages cannot be reached without logging in: [functions/admin/_middleware.js](functions/admin/_middleware.js)
> checks the session **on the server**, before the file is handed over at all. The only exception
> is the login page itself.

### The login screen

| Class | How it looks | CSS |
|---|---|---|
| `.login-page` (on `<body>`) | A light grey background `#f7f9fc` instead of white. | [css/admin.css:191](css/admin.css#L191) |
| `.login` | A full-height wrapper with the content dead centre (`display: grid; place-items: center`). | [css/admin.css:155](css/admin.css#L155) |
| `.login__card` | A white card up to 380 px wide: a border, 16 px rounding, a soft shadow. The fields stack in a column with a 1rem gap. | [css/admin.css:162](css/admin.css#L162) |
| `.login__title` | "Ադմին վահանակ" — dark blue, 1.4rem. | [css/admin.css:174](css/admin.css#L174) |
| `.login__subtitle` | The grey explanatory line under the heading, with negative space above so it sits close to the heading. | [css/admin.css:180](css/admin.css#L180) |
| `.login__submit` | The log-in button, the full width of the card. | [css/admin.css:186](css/admin.css#L186) |
| `.login__foot` | The "← Back to the site" link, centred at the bottom. | [css/admin.css:192](css/admin.css#L192) |

Errors and hints are shown in the same `.admin-status` as on the main admin page.

### The header: who is logged in

| Class | How it looks | CSS |
|---|---|---|
| `.admin-session` | The right corner of the header: the name of whoever is logged in plus the log-out button, in a row. | [css/admin.css:206](css/admin.css#L206) |
| `.admin-user` | The name of whoever is logged in: small, white, slightly transparent. | [css/admin.css:136](css/admin.css#L136) |
| `.admin-user.bad` | The same, but in pale red — shown if logging in failed. | [css/admin.css:142](css/admin.css#L142) |
| `.admin-logout` | "Դուրս գալ": a transparent pill button with a white border that brightens on hover. | [css/admin.css:212](css/admin.css#L212) |

### The form and the language switch

Both languages are edited **at the same time** and saved together — the tabs only
change which one is shown in the fields. Nothing typed is lost.

| Class | How it looks | CSS |
|---|---|---|
| `.admin-langs` | The row of tabs above the form, ruled off with a line underneath. | [css/admin.css:234](css/admin.css#L234) |
| `.admin-lang` | A language tab: a grey-blue pill. | [css/admin.css:242](css/admin.css#L242) |
| `.admin-lang.is-active` | The current tab: blue background, white text. | [css/admin.css:259](css/admin.css#L259) |
| `.admin-lang.is-filled` | A 6 px green dot in the top right corner — a heading has already been written in that language. On the active tab the dot is white. | [css/admin.css:307](css/admin.css#L307) |
| `.admin-langs__hint` | The grey hint on the right, pushed to the edge with `margin-left: auto`. | [css/admin.css:281](css/admin.css#L281) |
| `.admin-field__lang` | The small "ՀՅ / EN" tag beside a field label — a reminder of which language you are typing in. | [css/admin.css:288](css/admin.css#L288) |
| `.admin-field__hint` | The hint under a field in a monospace font — it shows the address the page will get. | [css/admin.css:299](css/admin.css#L299) |
| `.admin-row` | Two fields in a row (the date and the address), which rearrange themselves into a column on a narrow screen. | [css/admin.css:306](css/admin.css#L306) |
| `.admin-hidden` | `display: none !important` — hides the "Cancel" button until you are editing an existing item. | [css/admin.css:312](css/admin.css#L312) |
| `.admin-intro` | The explanatory paragraph: grey, up to 62 characters wide. | [css/admin.css:6](css/admin.css#L6) |
| `.admin-form` | The form card: white background, a border, 14 px rounding, a soft shadow, fields in a column. | [css/admin.css:12](css/admin.css#L12) |
| `.admin-field` | One field: the label on top, the input underneath, a 0.35rem gap. | [css/admin.css:23](css/admin.css#L23) |
| `.admin-field label` | The label: small (0.85rem), semi-bold, dark blue. | [css/admin.css:28](css/admin.css#L28) |
| `.admin-field input/select/textarea` | A full-width input, border `#cfd8e6`, 8 px rounding. On focus the border turns blue and a light blue ring appears. | [css/admin.css:34](css/admin.css#L34) |
| `.btn-admin` | A blue pill button with white text. On hover it darkens and lifts 1 px. | [css/admin.css:59](css/admin.css#L59) |
| `.btn-admin--ghost` | The same button, but transparent with blue text — for the secondary action. | [css/admin.css:76](css/admin.css#L76) |
| `.admin-actions` | The row of buttons under the form, with a 0.8rem gap. | [css/admin.css:85](css/admin.css#L85) |
| `.admin-status` | The result line. It always occupies 1.2em of height so the page does not jump. | [css/admin.css:92](css/admin.css#L92) |
| `.admin-status.ok` / `.error` / `.info` | The colour of the message: green `#1a7f37` / red `#c0392b` / blue. | [css/admin.css:99](css/admin.css#L99) |

### The main photograph of an item

| Class | How it looks | CSS |
|---|---|---|
| `.admin-photo` | Two columns: a 200 px preview on the left, the controls on the right. On a phone, a column. | [css/admin.css:320](css/admin.css#L320) |
| `.admin-photo__preview` | A 16:9 frame with a **dashed** border — it is immediately obvious that this is the place for a photo. Inside it the picture uses `object-fit: cover`. | [css/admin.css:327](css/admin.css#L327) |
| `.admin-photo__empty` | The grey "Լուսանկար չկա" text in the centre of an empty frame. An error is shown here too if a file failed to upload. | [css/admin.css:344](css/admin.css#L344) |
| `.admin-photo__controls` | A column: the file picker, a field for typing a path by hand, the "Հեռացնել" button, and an explanation. | [css/admin.css:351](css/admin.css#L351) |
| `.admin-photo__clear` | The red outline button for removing the photo. | [css/admin.css:360](css/admin.css#L360) |
| `.admin-photo__note` | The small grey hint about formats and size. | [css/admin.css:375](css/admin.css#L375) |

### The list of what is already published

| Class | How it looks | CSS |
|---|---|---|
| `.admin-existing` | The "Առկա նորությունները" heading: dark blue, 1.4rem. | [css/admin.css:384](css/admin.css#L384) |
| `.admin-count` | The number of items beside the heading, in a normal weight and grey. | [css/admin.css:413](css/admin.css#L413) |
| `.admin-news-list` | The list of rows, 0.6rem gap, up to 820 px wide. | [css/admin.css:419](css/admin.css#L419) |
| `.admin-item` | One row: a three-column grid — a 76 px thumbnail, the text, the buttons. | [css/admin.css:426](css/admin.css#L426) |
| `.admin-item.is-editing` | The row you are editing right now: a blue border and a light blue ring around it. | [css/admin.css:438](css/admin.css#L438) |
| `.admin-item__thumb` | A 16:10 thumbnail of the photograph with 6 px rounding. | [css/admin.css:443](css/admin.css#L443) |
| `.admin-item__thumb.is-empty` | A dashed rectangle instead of a picture — this item has no photo. | [css/admin.css:458](css/admin.css#L458) |
| `.admin-item__label` | The heading of the item, semi-bold. A long one is cut with an ellipsis (`text-overflow: ellipsis`). | [css/admin.css:468](css/admin.css#L468) |
| `.admin-item__meta` | The second line: the date, the page address and which languages are filled in. Small and grey. | [css/admin.css:477](css/admin.css#L477) |
| `.admin-item__actions` | The three buttons on the right, in a row. | [css/admin.css:482](css/admin.css#L482) |
| `.admin-item__link` | "Դիտել" — opens the page of the item in a new tab. | [css/admin.css:488](css/admin.css#L488) |
| `.admin-item__edit` | "Խմբագրել" — loads the item back into the form. | [css/admin.css:489](css/admin.css#L489) |
| `.admin-item__del` | "Ջնջել": a red outline button with a pale red background on hover. | [css/admin.css:397](css/admin.css#L397) |
| `.news-empty` | The italic "Դեռ նորություններ չկան։". In the admin panel it has **its own** light version, because `css/site.css` is not loaded here. | [css/admin.css:392](css/admin.css#L392) |

---

## 21. `data-*` attributes (not classes, but important)

Classes are responsible for **the look**, and `data-*` attributes for **the content**. They are read by [js/content.js](js/content.js#L143).

| Attribute | What it does |
|---|---|
| `data-text="hero.title"` | Puts in plain text from the JSON, in the visitor's language. |
| `data-rich="story.text"` | The same, but a blank line in the JSON means a new paragraph, and `**bold**` and `[link](address)` are supported. |
| `data-list="cards"` | Repeats the `<template>` inside it once for every item in the JSON list. Inside the template the names are short: `data-text="title"`. |
| `data-icon="icon"` | Draws an SVG icon by the name given in the JSON. |
| `data-image="showcase.image"` | Puts the image file name into `src`. |
| `data-alt="showcase.imageAlt"` | Puts the description of the picture into `alt`. |
| `data-route="cta.button.route"` | Turns the element into a link to another page of the site. |
| `data-number="number"` + `data-suffix="suffix"` | A number that counts up from zero when scrolled to, plus whatever follows it (`+`, `%`). |
| `data-ui="learnMore"` | A word shared by every page (taken from `data/site.json`). |
| `data-goto="labs"` | Set by the script; [js/router.js](js/router.js) uses it to catch the click and change page without a reload. It can also be written in the layout, when where a link leads is part of the layout (the lab cards, the laser banner). |
| `data-laser-canvas="bench"` | Marks a canvas of the laser lab and what [js/laser/page.js](js/laser/page.js) draws on it: `bench`, `power` (the chart of the output power), or `photons` (the cartoon of atoms and photons). |
| `data-laser-choose="medium"` | A dropdown that chooses the laser: `medium` or `pump`. It is empty in the layout; `page.js` fills in its options and reads the choice. |
| `data-laser-control="pump"` | A slider of the laser lab (`pump`, `coupler`, `slowMotion`). `page.js` sets its range and reads it; the pump slider's range changes with the chosen laser. |
| `data-laser-name="pump"` | The pump slider's name. `page.js` writes it for the chosen pump (`controls.pump.*` in `data/laser.json`: "Pump power (absorbed)", "Flash energy (electrical)", "Discharge current"). |
| `data-laser-input="pump"` | The number box of the slider of the same name: it shows the slider's value, and a number typed into it sets the slider. |
| `data-laser-unit="pump"` | Where `page.js` writes the unit of that number box. |
| `data-laser-value="slowMotion"` | Where the meaning of the slow motion is written ("1 s = 100 µs"). |
| `data-laser-readout="P_out"` | Where one number of the laser lab is written; the names are the keys of `readouts` in `data/laser.json`. |
| `data-laser-row="P_out"` | The row around that number, with its name. `page.js` hides the rows the chosen laser does not have (a flashlamp has no steady output power, a discharge's threshold is a current). |
| `data-laser-action="play"` | A button of the laser lab: `play` (Play / Pause), `reset`, `learn` (scrolls to the theory), or `fire` (fires the flashlamp; it starts `hidden`, and `page.js` shows it only when the pump is a flashlamp). |
| `data-laser-learn` | The theory section the `learn` button scrolls to. |
| `data-laser-note="behind"` | The note `page.js` shows while the simulation cannot keep up. |
| `data-running="true"` / `"false"` | Set by the laser lab's drawing loop on each of its canvases: whether that picture is being redrawn frame after frame right now. It is `false` while the page is hidden, while that canvas is scrolled away, and while the lab is paused. Useful for checking in the browser that nothing runs in the background. |
| `data-keep` | Keep the wrapper visible even when there is no text for it in the JSON. On a `data-link` the wording stays visible too, as a button that does nothing until the address is written in — that is how the photo-album buttons on the our story page work. |

If there is no text in the JSON for an element, the script **hides it by itself** so no empty holes are left on the page ([js/content.js:242](js/content.js#L242)).

---

## 22. CSS variables (colours and sizes)

All the colours are gathered in one place — [css/style.css:19](css/style.css#L19). Change them here and they change across the whole site.

The public site has **one set of colours**, in `:root`: white paper, black ink and one red, `--red` (#d40000, which the laser intro's beam uses too). `--accent`, `--accent-2` and `--accent-soft` are all that red, so every gradient in css/site.css comes out flat red, and the glows and shadows are `transparent`. (Until 2026-11-22 there were also a dark and a light theme.)

```css
:root {
  /* Admin colours — the admin panel only */
  --color-primary:    #1a3c6e;   /* dark blue: admin header, headings */
  --color-secondary:  #2f80ed;   /* blue: buttons, focus */
  --color-accent:     #f2994a;   /* orange accent */
  --color-bg:         #ffffff;
  --color-bg-alt:     #f7f9fc;
  --color-text:       #1c1c1c;
  --color-text-light: #666666;

  /* The public site */
  --bg, --bg-2, --bg-3: #ffffff;   /* white paper: hero, bands, footer */
  --heading:     #000000;   /* titles */
  --text:        #1a1a1a;   /* the main text */
  --muted:       #4d4d4d;   /* muted: .lead, .card__text */
  --line:        rgba(0,0,0,.22);  /* every thin border */
  --frame-line:  rgba(0,0,0,.3);   /* the border round a photo */
  --accent, --accent-2, --accent-soft, --icon: var(--red);  /* buttons, links, .eyebrow, icons */
  --card-bg, --faint-bg     /* white */
  --shadow, --glow-1, --glow-2, --vignette, --button-glow, --accent-ring  /* transparent */
  --header-bg               /* the header bar: white */
  --hover-line              /* a card's border under the mouse, an open FAQ: red */
  --ghost-bg, --ghost-border, --ghost-bg-hover, --ghost-border-hover  /* .btn--ghost: white, black, red */
  --canvas-line, --canvas-grid, --canvas-faint, --canvas-glow  /* the interactive labs' drawings */
  --laser-...               /* the laser lab's own colours, see css/laser.css */

  --font-main:  "Segoe UI", Roboto, Helvetica, Arial, sans-serif;  /* the laser lab */
  --font-serif: "Times New Roman", Times, serif;   /* the site's text: plain Times */
  --red:        #d40000;         /* the one red: 5.5:1 on white */
  --max-width:  1100px;          /* the width of .container */
  --radius:     16px;
  --radius-sm:  10px;
}
```

A few things keep their own colour on purpose: white text on the red `.btn--primary` and on the step numbers, the white logo tiles of partners, the dark full-screen photo viewer, and the laser lab.

One more variable is set on `body.site`: `--header-h: 4.6rem`, the height of the header. The top padding of the inner pages depends on it.

---

## 23. Responsive: what changes on a phone

There are not many media queries in the project, because the grids adapt by themselves (`auto-fit`).

**Below 860 px** — [css/site.css:790](css/site.css#L790)
* `.showcase__inner` — from two columns to one, with the picture moving to the top (`order: -1`).
* `.step::after` — the connecting lines between steps disappear.

**Below 720 px** — [css/home.css:125](css/home.css#L125)
* `.hero__content` — the top padding grows to 7rem.

**Below 640 px** — [css/site.css:804](css/site.css#L804), [css/home.css:137](css/home.css#L137), [css/style.css:193](css/style.css#L193)
* The header stops being pinned to the top (`position: static`) — on a phone the menu wraps onto several lines and would cover half the screen.
* `body.site:not(.home) #app` — the top padding is removed, as it is no longer needed.
* `.hero` — the height drops to 82vh.
* `.card` — the inner padding shrinks to 1.7rem × 1.4rem.
* `header` — the logo, the menu and the languages stack into a column.

**`prefers-reduced-motion`** — [css/site.css:835](css/site.css#L835), [css/home.css:148](css/home.css#L148)
If "reduce motion" is switched on in the system, these are turned off: the `.reveal` entrance, the floating picture, the pulsing glow in `.cta`, the drifting patch and the pulsing line in `.hero`.

---

## Cheat sheet: how to build a new block

```html
<!-- An ordinary band with a heading and cards -->
<section class="band band--alt">
  <div class="container">
    <p class="eyebrow reveal" data-text="block.eyebrow"></p>
    <h2 class="section-title reveal" data-text="block.title"></h2>

    <div class="grid grid--cards" data-list="block.items">
      <template>
        <article class="card reveal">
          <span class="card__icon" data-icon="icon"></span>
          <h3 class="card__title" data-text="title"></h3>
          <p  class="card__text"  data-text="text"></p>
        </article>
      </template>
    </div>
  </div>
</section>
```

The order of nesting, repeated across the whole site:

```
section.band          → background and vertical padding, full width
  div.container       → the 1100 px width limit and centring
    p.eyebrow         → the section label
    h2.section-title  → the heading
    div.grid--cards   → the grid
      article.card    → the card
```

Three rules are enough:

1. The background and vertical padding come from `.band` (or `.page-head`, `.cta`, `.showcase`).
2. The width of the content is **always** set by a `.container` inside the section.
3. Anything that should appear on scroll gets `reveal`.
