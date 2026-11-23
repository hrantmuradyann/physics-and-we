---
name: "unslop"
description: "Remove AI writing patterns (unslop, de-AI, humanize) from English prose: audit the tells, then rewrite in full. For physics/math papers, LaTeX or science explainers, use unslop-science."
---

# Unslop

Make the text read like a competent person wrote it for a reader they respect.

AI tells are symptoms. The real problems underneath are vagueness, padding, unearned emphasis, claims with no support, and rhythm set by formula. Fix those. Swapping "delve" for "explore" while leaving the emptiness in place only produces slop that is harder to spot.

This is an editing tool, not a way to beat AI detectors. Never add typos, random errors or fake quirks to "look human".

## Modes

- **Default:** audit, then full rewrite.
- **"audit only":** the audit and nothing else.
- **"minimal":** rewrite only the sentences that contain tells; keep every other sentence word for word.
- **"write clean":** when drafting new text, follow these rules while writing. No audit.

## Step 1: Read and protect

Read the whole text first. Work out the genre (essay, email, post, doc, web copy) and who reads it.

Never change:
- quotations, names, titles, dates, numbers, URLs, code, commands, technical terms
- what the author claims (tighten the wording, never the claim)
- the author's opinions and first-person experiences

If the user gives a sample of their own writing, match its sentence length, vocabulary level and punctuation habits. The one exception is em dashes: they always go.

## Step 2: Scan

**Strong tells** get fixed on sight. **Weak tells** get fixed only when two or more cluster in one paragraph or the same one repeats through the text; one isolated weak tell is fine.

### Strong tells

1. **Chatbot residue.** "Great question!", "Certainly!", "I hope this helps", "Let me know if", "Here's a…:", "Would you like…", "You're absolutely right". Knowledge-cutoff talk ("as of my last update", "while specific details are limited", "based on available information"). Placeholders ("[Name]", "INSERT_URL", "2025-xx-xx"). Citation debris ("oaicite", "contentReference", "utm_source=chatgpt.com").
2. **Staged contrasts.** "It's not X, it's Y", "not just X but Y", "not only… but also", "No X. No Y. Just Z.", "This isn't about X" when nobody said it was.
3. **Run-ups and announcements.** "Let's dive in", "Here's the thing:", "Here's why that matters", "The answer? …", "Simply put", "When it comes to", "It's worth noting that", "It's important to remember", "The truth is", "In today's fast-paced world", self-answered rhetorical questions.
4. **Inflated significance.** "plays a pivotal/crucial/vital role", "stands as a testament", "marks a turning point", "underscores the importance of", "reflects broader trends", "shaping the future of", "leaves an indelible mark", "game-changer", "revolutionize". Closers like "The future looks bright" or "Only time will tell".
5. **Dense AI vocabulary** (two or more in a paragraph): delve, tapestry, testament, landscape (abstract), realm, intricate, meticulous(ly), pivotal, showcase, underscore, highlight (verb), foster, garner, bolster, interplay, nuanced, multifaceted, seamless(ly), leverage, elevate, unlock, harness, navigate (abstract), embark, journey (not travel), resonate, vibrant, enduring, holistic, synergy, paradigm, ever-evolving, cutting-edge, empower.
6. **Dodging "is" and "has".** "serves as", "stands as", "functions as", "boasts", "features", "represents" where "is" or "has" works.
7. **Shallow -ing tails.** A clause tacked onto a sentence to claim meaning: ", highlighting…", ", reflecting…", ", ensuring…", ", contributing to…", ", fostering…", ", symbolizing…".
8. **Vague authority.** "Experts say", "studies show", "many believe", "critics argue", "it is widely recognized" with no named source.
9. **Sales language.** nestled, in the heart of, breathtaking, world-class, renowned, groundbreaking, state-of-the-art, a diverse array of, rich heritage, commitment to excellence.
10. **Formula endings.** "In conclusion,", "Ultimately,", "At the end of the day", "Despite these challenges, X continues to…", a last paragraph that restates everything, a one-line moral after every section.
11. **Dramatic fragments.** "And that changes everything." "Game over." Stacked short fragments used for effect.
12. **Em dashes.** Remove every one: —, and also – or " -- " when used as a dash (an en dash in a range like "20–40%" stays). Replace with a period, comma, colon or parentheses, or rebuild the sentence. Don't turn them all into colons.
13. **Formatting by rule.** Bold on random phrases. Bullets that start with a bold label and a colon. Emoji in headings or bullets. Title Case Headings. Headings on a three-paragraph text. A table holding three facts. "Key takeaways" boxes. Unicode arrows (→) in prose.

### Weak tells

- **Default triads.** Three adjectives or three parallel phrases out of habit. Use as many items as the content has.
- **Metronome rhythm.** Three or more sentences of the same length in a row; every paragraph built the same way.
- **Repeated openers.** "Additionally,", "Moreover,", "Furthermore,", "Notably,", "Importantly,", "This…" starting sentence after sentence.
- **Elegant variation.** Cycling synonyms for one thing ("the city… the metropolis… the urban hub").
- **Stacked hedges.** "may potentially", "could possibly", "arguably somewhat".
- **Intensifiers.** truly, deeply, incredibly, profoundly, significantly (non-statistical), fundamentally, really.
- **Lazy absolutes.** always, never, every, everyone, completely, entirely.
- **Hidden actors.** Passive voice that hides who did it; objects doing human verbs ("the data tells us", "the market rewards").
- **False ranges.** "from startups to Fortune 500 companies", where the two ends are not ends of one scale.
- **Talk about the text.** "This article explores", "In this post, we will", "As mentioned above", "The table below shows".
- **Generic examples.** "For example, a company might…" where a real example belongs.
- **Curly quotes in plain-text sources** (Markdown, code, config). Switch to straight quotes there; leave them alone in documents.

## Step 3: Diagnose

For each tell, ask what it covers up, and fix that:
- empty emphasis: state the concrete fact that makes the thing matter, or cut
- vague claim: find the specific (Step 4), or cut
- run-up or padding: cut it and start with the point
- staged contrast: state Y directly; keep X only if someone really holds X
- -ing tail: make it its own sentence with support, or cut
- vague authority: name the source (Step 4), or cut

## Step 4: Research the missing specifics

When a sentence needs a fact the text doesn't have (a number, a name, a date, a source), find it and write it in rather than leaving the sentence vague:

1. Look in the text itself and in any files or links the user gave.
2. If it is a public fact, search the web, open the page, and use what a reliable source says. Prefer primary sources (official sites, original reports, the organization itself) over aggregators.
3. If only the author can know it (their experience, their opinion, their own product, private data), don't guess. Cut or soften the sentence and list it under "Needs your input".

Never invent facts, quotes, anecdotes or numbers, and never state a fact from memory as if it were sourced. Every fact you add goes in "Added facts" with its link. With no search tool available, skip 2 and flag instead.

## Step 5: Rewrite

- Keep every claim, number and name from the original, unless it was part of a tell you cut (then report it).
- Lead with the point. Let sentence length vary because the content varies.
- Use plain verbs: is, has, uses, shows, makes, needs.
- Name the actor. Active voice by default; passive when the actor is unknown or doesn't matter.
- Cut rather than replace when a phrase carried nothing. Don't swap "crucial" for "very important".
- Keep the register. A rewrite 20–40% shorter than the original is normal; don't pad it back.
- Prose over bullets, unless the content really is a list (steps, options to compare, items to scan).

Don't overcorrect. Stripping every adverb, making every sentence short, or turning every dash into a colon creates a new, recognizable pattern. Don't introduce fresh tells either ("Here's what X does:").

## Step 6: Self-audit

Before answering, check the rewrite:
- Re-scan it against the strong tells. Fix anything left over or newly introduced.
- Search it for —, – and " -- ". None may remain (ranges like "20–40%" written with an en dash are fine).
- Every number, name and claim in the original is still there or is reported as cut.
- No new claims except those listed under "Added facts".
- No run of three same-length sentences.

## Output

```
**Audit** (slop level: heavy / moderate / light)
- <pattern> ×<n>: "<short quote>", "<short quote>"
- ... (at most ~10 lines, strongest first)

**Rewrite**
<the full rewritten text>

**Added facts**
- <fact>: <source link>

**Needs your input**
- <what is missing, and where>
```

Leave out "Added facts" or "Needs your input" when empty. For a file, edit a copy in the same format, change only the prose, and put the audit and lists in the reply.

If cutting the slop leaves almost nothing (common with marketing copy and speeches), say so in the audit, give the short honest version, and ask two or three concrete questions whose answers would let you write the full piece.

For long texts, work section by section, but still deliver the whole rewrite. Audit lines stay grouped by pattern, not by section.

The skill is for English. For text in another language, say so and ask before editing.

## Examples

**Before**
> In today's fast-paced digital landscape, effective communication plays a pivotal role in fostering collaboration. It's not just about sending messages — it's about building connections. Relay seamlessly integrates with your workflow, empowering teams to unlock their full potential.

**After**
> Relay is a team messaging tool that works inside the apps your team already uses.

Needs your input: which apps does Relay connect to, and what can a team do with it that it couldn't before? "Unlock their full potential" says nothing; one concrete example would replace it. (Relay is the author's own product, so research can't supply this.)

**Before**
> The Eiffel Tower stands as an enduring testament to French engineering, attracting millions of visitors each year and cementing its status as a global icon.

**After**
> The Eiffel Tower was built for the 1889 World's Fair and was the tallest structure in the world until 1930. About 6 million people visit it each year.

Added facts: build date, height record, visitor count, each with its source link. "Global icon" was cut: the visitor figure carries that point.