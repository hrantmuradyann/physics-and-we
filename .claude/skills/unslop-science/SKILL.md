---
name: "unslop-science"
description: "Unslop physics and math writing: papers, abstracts, derivations, LaTeX source, popular-science explainers and textbook pages. Keeps math, numbers and citations exact; checks facts against sources, adds verified Wikipedia links per language, translates parallel texts; audits, then rewrites in full."
---

# Unslop (science)

Make physics and math writing read like a careful scientist wrote it: precise, specific, and claiming exactly what the evidence supports.

AI tells are symptoms. In science the problems underneath are worse than in ordinary prose: vague magnitudes where a number belongs, claims stronger than the data, inflated novelty, padding around the result, and occasionally invented citations or wrong physics. Fix those, not just the words.

This is an editing tool, not a way to beat AI detectors. Never add errors or quirks to "look human". The author still has to follow their venue's AI-disclosure rules.

## Modes

- **Default:** audit, then full rewrite.
- **"audit only":** the audit and nothing else.
- **"minimal":** rewrite only sentences that contain tells; keep the rest word for word.
- **"write clean":** when drafting new text, follow these rules while writing. No audit.
- **"links":** add Wikipedia links to a text for learners (Step 6b). Can be combined with any mode.
- **"translate":** make or check a version in another language of a text that is already clean (Step 6c).

## Step 1: Identify the genre

- **A. Research writing:** paper, abstract, thesis chapter, report, derivation, solution writeup, LaTeX source.
- **B. Popular science:** explainers, website text, talks and articles for non-specialists, textbook and course pages for students.

Apply the shared rules, then the section for the genre. A text can mix both (a paper's introduction vs. a project website); judge each part.

## Step 2: Protect

Never change:
- **Math:** inline `$…$` and `\(…\)`, display `\[…\]`, `equation`/`align`/`gather`/`multline` environments, symbols in prose. Exception: Markdown-style `$$…$$` in a LaTeX file may become `\[…\]` with identical content.
- **Numbers:** values, units, uncertainties, significant figures.
- **LaTeX structure:** `\cite`, `\ref`, `\eqref`, `\label`, macros, environments, `%` comments, the preamble.
- **Citations and the reference list.** Don't remove or reorder them. You may add a verified citation (Step 5).
- **Definitions and notation,** and the mathematical content of theorems, lemmas and problem statements.
- **Evidence-tied hedges:** "to leading order", "within experimental uncertainty", "in the limit $N\to\infty$", "for $T \ll T_c$", "we conjecture", "numerically", "suggests" when the evidence is indirect.

These are normal scientific conventions, **not** slop: "we" (author-we and reader-we), passive voice in methods, "Note that", "It follows that", "Without loss of generality", "Let", "Consider", "respectively", "i.e.", "e.g.", a one-sentence roadmap at the end of an introduction, a contributions list, and "to the best of our knowledge" attached to a real novelty claim.

## Step 3: Scan

**Strong tells** get fixed on sight. **Weak tells** get fixed only when two or more cluster in one paragraph or one repeats through the text.

### Shared strong tells (both genres)

1. **Chatbot residue.** "Certainly!", "I hope this helps", "Here's a…:", "Let me know if", "Great question", knowledge-cutoff talk, placeholders ("[Author]", "INSERT_REF"), citation debris ("oaicite", "contentReference", "utm_source=chatgpt.com").
2. **Staged contrasts.** "It's not X, it's Y", "not just X but Y", "not only… but also", "No X. No Y. Just Z."
3. **Run-ups.** "Let's dive in", "Here's the thing:", "It's worth noting that", "It is important to note that" ("Note that" is fine), "When it comes to", self-answered rhetorical questions.
4. **Dodging "is" and "has".** "serves as", "stands as", "acts as" (unless physically acting), "boasts", "features".
5. **Shallow -ing tails.** ", highlighting the importance of…", ", underscoring…", ", paving the way for…", ", demonstrating the potential of…".
6. **Em dashes.** Remove every em dash (`—`, and `---` in LaTeX). Replace with a period, comma, colon or parentheses, or rebuild the sentence. **Keep en dashes** where they are correct: ranges (`pp.~10--12`, `1--2~K`) and paired names (`Navier--Stokes`, `Kramers--Kronig`, `Hartree--Fock`).
7. **Formatting by rule.** Bold on random phrases, bullets with bold labels, emoji, Title Case Headings, tables holding three facts.

### A. Research-writing strong tells

8. **Excess LLM vocabulary.** Corpus studies of scientific abstracts found these words jumped after 2023: delve(s), underscore(s), showcase/showcasing, intricate, meticulous(ly), pivotal, realm, tapestry, notably (as filler), additionally (as an opener), crucial, enhancing, insights, potential (as in "holds great potential"), garnered, invaluable, paramount, multifaceted, groundbreaking, unprecedented, holistic. Two or more in a paragraph is a strong tell.
9. **Template openers.** "In recent years, X has garnered/attracted significant attention", "X has emerged as a promising…", "With the rapid development of…", "X plays a crucial role in Y". Replace with the specific problem and why it is open, keeping the citations already there.
10. **Inflated novelty and impact.** "novel" (unless the novelty is shown), "paves the way", "opens new avenues", "sheds light on", "provides valuable insights", "a deeper understanding of", "has significant implications for", "wide-ranging applications in fields such as A, B, and C", "bridges the gap", "paradigm shift". Replace with the actual result and one specific consequence, or cut.
11. **Claims stronger than the evidence.** Use the verb ladder: *prove* (mathematical proof only) > *show, derive* > *find, obtain, observe* > *suggest, indicate* > *is consistent with*. Typical fixes: "prove" for a simulation → "show numerically"; "demonstrate" from one case → "find in this case"; "confirms" → "is consistent with"; "exact" for an approximation → "to $O(\epsilon^2)$"; "universal" or "robust" with no test → say what was tested. If unsure whether the evidence supports the claim, keep the claim and flag it.
12. **Vague magnitudes.** "significant improvement", "much faster", "highly accurate", "excellent agreement", "orders of magnitude", "a wide range of". Replace with the number, units and uncertainty (Step 5). "Significant" in a non-statistical sense always goes.
13. **Hand-waving evidence.** "Extensive experiments/simulations demonstrate", "comprehensive analysis reveals". Say which simulations and what they show.
14. **Abstract and conclusion templates.** An abstract ending "These findings have important implications for…" or "This work paves the way for future research". A conclusion that opens "In conclusion," and restates the abstract. "Future work will explore…" followed by a generic list. Replace with the specific open question, or cut.
15. **Section narration.** "In this section, we delve into…", "Having established X, we now turn our attention to…", "Let's" anywhere in a paper, "As discussed above" chains.
16. **Editorial adverbs on results.** Sentence-initial "Interestingly,", "Remarkably,", "Surprisingly,", "Crucially,", "Importantly,", "Notably,". Either say why (surprising compared with what expectation?) or delete the adverb.
17. **Markdown and chat habits in LaTeX.** `**bold**`, `##` headings, backticks, `$$…$$`, a bulleted "where:" list defining symbols, bold "Step 1:" labels in derivations, Unicode math in source (≈ ≤ → ² μ ħ ∞) instead of commands, "Final answer:". Convert: define symbols in a sentence ("where $m$ is the mass and $\omega$ the frequency"), use `\[…\]` or an `equation` environment, `\approx`, `\le`, `\hbar`.
18. **Suspicious citations.** Author-year mentions with no matching reference, `\cite` keys missing from the `.bib`, DOIs that don't resolve, "Smith et al. (2021) showed" with nothing behind it. Verify each by search when you can; flag what you can't verify. Never replace one from memory.

### A. Research-writing weak tells

- Stacked hedges ("may potentially suggest"). Different from evidence-tied hedges, which stay.
- Triads of applications, advantages or properties.
- "Furthermore", "Moreover", "Additionally" opening paragraph after paragraph.
- Filler chains: "plays a role in", "in terms of", "with respect to", "in the context of".
- Buzzwords: framework (for a method), leverage, utilize (→ use), facilitate, comprehensive (when not literal), robust (when not tested), interplay (fine in "interplay of disorder and interactions"; filler elsewhere).
- Passive voice that hides who measured or computed something, when that matters.
- "Clearly", "obviously", "trivially", "it is easy to see" before steps that aren't. Show the step or drop the word.
- **Synonym cycling.** In science this is a precision bug, not just style: "the sample… the specimen… the crystal" makes readers think there are three objects. One object, one name, throughout.

### A. Math-writing hygiene (fix while rewriting; list as "math style" in the audit)

- Displayed equations are part of sentences. Punctuate them; don't put a colon before every display.
- Don't start a sentence with a symbol.
- Define every symbol at first use. One symbol, one meaning.
- No emotional narration of equations ("this elegant expression beautifully captures…").

### B. Popular-science strong tells

19. **Wonder openers.** "Have you ever wondered…", "Imagine a world where…", "In the fascinating world of…", "Since the dawn of time", "From X to Y, Z is everywhere".
20. **Hype.** unlock the secrets, harness the power, mind-bending, mysterious, magic, revolutionize, cutting-edge, "the building blocks of the universe", "Enter: the laser."
21. **Reveal structures.** "But here's the twist:", "This is where X comes in", "The answer? …", "So what's the catch?"
22. **Analogy stacking and wrong analogies.** More than one analogy per idea, or an analogy that teaches a false picture (electrons as tiny planets, laser light as "concentrated energy", "a particle is in two places at once" stated flatly). Keep at most one analogy per concept, check that it is physically right, and say where it breaks when that matters.
23. **Hollow simplification.** "Simply put," or "In simple terms," followed by a vaguer restatement; "basically". Give the mechanism in plain words instead: what interacts with what, and what causes what.
24. **Wonder closers.** "The next time you see a rainbow, remember…", "The universe still holds many secrets", "The possibilities are endless."
25. **Sloppy physics.** Mixing up energy and power, heat and temperature, wavelength and frequency, mass and weight; "light speeds up", "energy is created". Fix each error and list it in the audit as a physics correction. If you're not sure it's an error, flag it instead.

26. **Aphorisms and quotable lines.** A sentence built to be remembered instead of to inform: "A lamp's light is a crowd; a laser's light is a column.", "Light makes light.", "The mirrors do the rest." Readers spot these at once as AI. Replace with the mechanism in a plain sentence, or cut.
27. **Paired metaphors and mirrored sentences.** Two clauses or two sentences built the same way to contrast ("The lamp scatters; the laser aims.", "One photon goes in; two come out."). One such pair in a page can stay if it states a fact; a pattern of them goes.
28. **"That is why" chains.** "That is why…", "This is why…", "That's what makes…", "And that is exactly…" opening sentence after sentence, each restating the last. Say the cause once, in the sentence that gives it.
29. **Scare quotes and coined names.** Ordinary words in quotation marks ("the 'magic' of inversion", a "light factory") or catchy names the field doesn't use. Use the standard term and define it.
30. **Closing one-liners.** A paragraph or section ending on a short punchy summary that repeats the paragraph ("Simple, but powerful.", "That is the whole secret."). Cut it; the paragraph should end on its last fact.

Model the register on how **Wikipedia, a good textbook and a good forum answer** explain the same thing: define the term, state the mechanism (what causes what), give the numbers with units, give one example, stop. When in doubt, read the topic's Wikipedia article and match its plainness (not its wording).

Popular science should keep: concrete numbers (a ruby laser emits at 694.3 nm), cause and effect, one worked example, and direct "you" address.

**A "more simply" version** (a retelling for a reader with no background, when the text has one): everyday words, no formulas, no symbols, no links; shorter than the full text; the same facts, not new ones; this is the one place where a single analogy may carry the idea. It must still be physically right: test the analogy against the mechanism and drop it if it teaches something false.

## Step 4: Diagnose

For each tell, ask what it covers up:
- vague magnitude: what is the number?
- inflated impact: what is the actual result, and what does it change?
- strong verb: what does the evidence actually establish?
- template opener: what is the open problem?
- editorial adverb: compared with what expectation?
- hype or wonder: what is the mechanism?

## Step 5: Research the missing specifics

When the rewrite needs a fact the text doesn't have, find it and write it in:

1. **The document first.** The author's own results (measured values, fitted parameters, simulation sizes, error bars) live in the results section, tables, figure captions and appendices. Search the whole document and any files the user gave before anything else.
2. **Public facts: search.** Physical constants, material properties, wavelengths, historical dates, established results. Prefer NIST/CODATA, original papers, review articles and standard textbooks, and open the page to confirm.
3. **Only the author knows it:** unpublished results, their interpretation, their motivation. Don't guess. Cut or soften the sentence and list it under "Needs your input".

**Check against more than one source.** For every fact you add or change, and for every number you are not sure of, find two independent sources (a standard reference and an original paper, or two textbooks) and open them. Then:
- they agree: write the value;
- they disagree a little: write the commonly quoted value, or a range ("10–50 ms, depending on the concentration");
- they disagree a lot (Nd:YAG's lower-level lifetime is reported from 115 ps to 11 ns): write an order of magnitude with "~" and say in the text or the notes that the measurements scatter. Never pick one value and present it as exact;
- you had to estimate (a level's energy taken midway between two measured peaks): say "about" in the text and mark it as an estimate where the author will see it (a code comment, the notes, "Needs your input").
Keep the derived numbers consistent: if the text gives a photon energy, it must equal hc/λ of the wavelength it gives; a sum must add up.

Citations you add must be verified to exist: find the paper's page or a resolving DOI. In LaTeX with BibTeX, insert `\cite{key}` in the text and give the BibTeX entry under "Added facts" for the author to paste into their `.bib`. Never cite from memory, never invent data. Every added fact goes in "Added facts" with its link. With no search tool available, skip 2 and flag instead.

## Step 6: Rewrite

- Keep every claim, number, symbol and citation, unless it was part of a tell you cut (then report it).
- Lead with the result or the point.
- One object, one name. One symbol, one meaning.
- Use plain verbs: is, has, gives, shows, find, measure, compute.
- Cut rather than replace when a phrase carried nothing.
- Keep the register: formal for papers, direct for popular science.
- In LaTeX, edit only the prose between protected spans and keep line breaks where they were when you can, so the author's diff stays readable.

Don't overcorrect. Don't strip legitimate hedges, don't turn every passive into active, don't make every sentence short.

## Step 6b: Wikipedia links (texts for learners)

When the user asks for links, or the text is a course or textbook page that already uses them:

- Link the **first mention in a chapter** (or article) of a person, place, material, device or technical term a reader may not know. Once per chapter; not every repeat, and not common words.
- **Check every link opens** and lands on an article about the same thing (not a disambiguation page, not a redirect to something broader). Fix or drop the ones that fail.
- **Per language.** Each language version links to its own Wikipedia (hy.wikipedia.org for Armenian, ru.wikipedia.org for Russian) where that article exists, else to the English one. Find the article through the English page's interlanguage links (the MediaWiki API: `action=query&prop=langlinks&titles=<Title>&lllang=ru`), never by guessing the title, and then check the target is the same concept: an interlanguage link can point to a narrower or different article (en "Optical amplifier" → ru "EDFA"); in that case keep the English link.
- The same number of links in each language for the same passage, in the same places.
- No bare addresses in the text; the link words are ordinary words, without digits. In Markdown-style links write `(` and `)` in an address as `%28` and `%29`, since a `)` ends the link.
- Only Wikipedia (and Wikimedia Commons for pictures) unless the user names other sites.

## Step 6c: Translating and other languages

The audit and the tells above are written for English. For a text in another language, say so, apply the same tells where they carry over (staged contrasts, aphorisms, hype, vague magnitudes are the same in every language), and ask before rewriting a language the user did not mention. If the user says not to touch a language, don't, not even a typo; report what you would change instead.

When making or checking a version in another language of a text:
- **Keep the parallel exact:** the same formulas character for character, in the same order; the same numbers and units; the same internal links and their targets; the same bold phrases; the same paragraphs. Only the words between them change. A decimal comma is fine in the prose of languages that use it, never inside a formula.
- **Terms:** check each technical term in at least two sources in the target language (the target-language Wikipedia article's title and a textbook or glossary). Use the established term, not a word-for-word calque.
- **Names:** spell people and places as the target-language Wikipedia does (Майман, not Мейман; Пёрселл, not Парселл).
- **Write the "more simply" version fresh** in natural target-language words rather than translating it word for word.
- Translate the meaning, keep the register: if the source was rewritten to avoid tells, the translation must not bring them back.
- Run the check script of Step 7 between the two language versions: math and references must match exactly; only prose numbers may differ (decimal commas, numbers written as words).

## Step 7: Self-audit

- Re-scan the rewrite against the strong tells. Fix anything left over or newly introduced.
- No em dashes: search for `—` and `---`. En dashes in ranges and paired names stay.
- Every number, symbol, equation and citation in the original is still there, unchanged. If you can run code, check it with the script below. Otherwise compare by eye.
- No new claims except those listed under "Added facts".
- Physics check: every sentence you touched is still correct.
- Links: every one you added opens and is about the right thing; each language version has the same count.
- No sentence written to be quoted: re-read the last line of each paragraph.

```python
# usage: python3 check.py original.tex rewrite.tex
import re, sys
from collections import Counter
MATH = re.compile(r"\$\$(.+?)\$\$|(?<!\\)\$(.+?)(?<!\\)\$|\\\[(.+?)\\\]|\\\((.+?)\\\)"
                  r"|\\begin\{(equation|align|gather|multline|eqnarray)(\*?)\}(.+?)\\end\{\5\6\}", re.S)
REFS = re.compile(r"\\(?:cite[tp]?|ref|eqref|cref|Cref|autoref|label)(?:\[[^\]]*\])?\{[^}]*\}")
def parts(t):
    math = Counter(re.sub(r"\s+", "", next(g for g in m.group(1, 2, 3, 4, 7) if g))
                   for m in MATH.finditer(t))
    prose = REFS.sub(" ", MATH.sub(" ", t))
    nums = Counter(re.findall(r"\d+(?:[.,]\d+)?", prose))
    return math, Counter(REFS.findall(t)), nums
a, b = (parts(open(f, encoding="utf-8").read()) for f in sys.argv[1:3])
for name, x, y in zip(("math", "refs/cites", "numbers in prose"), a, b):
    lost, new = x - y, y - x
    print(f"{name}: {'OK' if not (lost or new) else 'CHANGED'}")
    if lost: print("  missing from rewrite:", list(lost.elements()))
    if new:  print("  new in rewrite:", list(new.elements()))
```

New items the check reports are fine only if they are listed under "Added facts".

## Output

```
**Audit** (genre: research / popular science; slop level: heavy / moderate / light)
- <pattern> ×<n>: "<short quote>", "<short quote>"
- physics correction: "<quote>" → <what was wrong>
- ... (at most ~12 lines, strongest first)

**Rewrite**
<the full rewritten text; for LaTeX, in a code block>

**Added facts**
- <fact>: <source link>  (BibTeX entry if a citation was added)

**Needs your input**
- <what is missing, and where>

**Sources disagree / estimates**
- <value>: <the spread found, and what was written>
```

Leave out empty sections. For a `.tex` or other file, edit a copy in the same format and put the audit and lists in the reply.

For a full paper, work section by section (abstract and introduction carry the most slop; methods the least), but still deliver the whole rewrite. For text in another language, follow Step 6c.

## Examples

**Before (abstract)**
> In recent years, topological insulators have garnered significant attention due to their intriguing properties. In this work, we delve into the intricate interplay between disorder and edge states in a two-dimensional model. Extensive numerical simulations demonstrate that the edge conductance remains remarkably robust, showcasing the pivotal role of topology. Our findings pave the way for novel applications in quantum computing, spintronics, and low-power electronics.

**After** (the paper's results section gives $G = 2e^2/h$ up to $W \approx 2.5t$)
> We study how disorder affects the edge states of a two-dimensional topological insulator model. Numerical transport calculations show that the edge conductance stays quantized at $2e^2/h$ up to disorder strength $W \approx 2.5t$.

Needs your input: "showcasing the pivotal role of topology" was cut. To make that claim, say what shows it (for example, a comparison with a topologically trivial phase at the same disorder) and give that result. The closing sentence on applications was cut too; if you want one, name the single application this result bears on and say why.

**Before (popular science)**
> Have you ever wondered how a laser works? It's not just a fancy flashlight — it's a fascinating marvel of quantum physics! Simply put, a laser harnesses the power of excited atoms to unlock an incredibly focused beam of light.

**After**
> A laser makes light by stimulated emission. Energy pumped into the gain medium puts more atoms in an excited state than in the lower state. A passing photon can then make an excited atom emit a second photon with the same wavelength, direction and phase. Mirrors at both ends send the light back and forth through the medium so this repeats, and the beam that leaks out through the partly transparent mirror is narrow and nearly a single wavelength. The first laser, built by Theodore Maiman in 1960, used a ruby crystal and emitted red light at 694.3 nm.

Added facts: Maiman, 1960, ruby, 694.3 nm, each with its source link.

**Before (textbook page)**
> A lamp's light is a crowd; a laser's light is a column. That is why a laser can cut steel. The trick? Stimulated emission: light makes light. And that is exactly what the mirrors are for.

**After**
> A lamp's atoms emit independently, in all directions and at many wavelengths. In a laser, most of the light comes from stimulated emission: a photon passing an excited atom makes it emit a copy with the same wavelength, direction and phase. The mirrors send the light back through the medium many times, so the copies build up into a narrow beam. Focused to a spot about 0.1 mm wide, a few kilowatts of such a beam melt steel.

Needs your input: "a few kilowatts" and "0.1 mm" are typical of industrial cutting lasers; check they match the lasers the page discusses.
## This project: the laser book (Physics and We)

The Theory page's laser book is `data/laser-study.json`; its rules are checked by `tests/laser/study.test.js` (run `node --test` after any change) and described in its `_readme` and in `CLAUDE.md`. On top of the steps above:

- **Languages:** `en`, `hy` and `ru` for every chapter's words. The owner's rewrites so far were English only; don't change the Armenian unless asked. All three keep the same formulas, `#chapter-…`/`#section-…` links, bold and paragraphs.
- **Formulas:** every formula, symbol and number with a unit is LaTeX, `$…$` or `$$…$$`, never a bare sign in the prose (×, =, Greek letters). Units have no prefixes: a power of ten times the SI unit, the number and unit in braces, `{694.3\times10^{-9}\ \text{m}}` (the owner's choice, 2026-11-23).
- **Wikipedia links:** first mention in a chapter, en → en.wikipedia.org, hy → hy.wikipedia.org where it exists, ru → ru.wikipedia.org where it exists, else the English one; only these hosts and commons.wikimedia.org; the same count per paragraph in each language.
- **"More simply"** (`simpler.text`): every section has one; no `$`, no link, shorter than `text`.
- **The owner's taste:** they called the earlier English "AI-sounding" for exactly the tells 26–30 (the crowd/column line, "That is why" chains, closing one-liners). Write like Wikipedia or a textbook: mechanism, numbers, one example.
- Physics numbers should agree with the laser lab's engine (`js/laser/engine/media.js`) and `docs/laser-physics.md`; if they differ, say which and why.
