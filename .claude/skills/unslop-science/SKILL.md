---
name: "unslop-science"
description: "Unslop physics and math writing: papers, abstracts, derivations, LaTeX source, popular-science explainers. Keeps math, numbers and citations exact; audits, then rewrites in full."
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

## Step 1: Identify the genre

- **A. Research writing:** paper, abstract, thesis chapter, report, derivation, solution writeup, LaTeX source.
- **B. Popular science:** explainers, website text, talks and articles for non-specialists.

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

Popular science should keep: concrete numbers (a ruby laser emits at 694.3 nm), cause and effect, one worked example, and direct "you" address.

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

## Step 7: Self-audit

- Re-scan the rewrite against the strong tells. Fix anything left over or newly introduced.
- No em dashes: search for `—` and `---`. En dashes in ranges and paired names stay.
- Every number, symbol, equation and citation in the original is still there, unchanged. If you can run code, check it with the script below. Otherwise compare by eye.
- No new claims except those listed under "Added facts".
- Physics check: every sentence you touched is still correct.

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
```

Leave out empty sections. For a `.tex` or other file, edit a copy in the same format and put the audit and lists in the reply.

For a full paper, work section by section (abstract and introduction carry the most slop; methods the least), but still deliver the whole rewrite. The skill is for English; for text in another language, say so and ask before editing.

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