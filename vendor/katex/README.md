# KaTeX (vendored)

The maths typesetting library used by the Laser study page (`?view=laser-study`,
`js/laser-study.js`) to draw its formulas. Not written for this site: do not edit
these files.

- Version: **0.19.1**, from the official release
  https://github.com/KaTeX/KaTeX/releases/download/v0.19.1/katex.tar.gz
  (sha256 `751e29ffb0c5bc184f08692a0aa905ff86a59ced07f635a27e72a7b7bc53036c`),
  downloaded 2026-11-20 with the owner's permission.
- Kept: `katex.min.js`, `katex.min.css` and the `.woff2` fonts only (every
  current browser uses woff2; the `.woff`/`.ttf` copies the stylesheet also
  names are left out to keep the site small).
- Licence: MIT, see `LICENSE` (from the same tag of the KaTeX repository).

To update: download a newer release the same way, replace these files, and
check the formulas on the Laser page in both languages.
