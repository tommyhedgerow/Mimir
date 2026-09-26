---
date: {{date}}
type: session
topic:
subjects: []
nodes: {}               # plan node id → the concept note it became, once taught
graph:                  # the plan's spine; Tools/vault-chart.mjs draws it as SVG
  foundations:
    - "R1 | an unconditional truth already held"
  nodes:
    - "N1 | the first node"
  goal: "G | the goal"
  edges:
    - R1 -> N1
    - N1 -> G
tags:
  - learn
  - session
status: draft
probe_checks:           # how many were asked in the probe
probe_correct:          # how many I got
teach_checks:           # how many node checks were put to me
teach_correct:          # how many I got
books: []               # max 2 per session — copied into Learn/Reading List.md
terms: []               # niche words this session used — one note each in Learn/Glossary/
published:
---

# {{topic}}

> [[🌱 Learn Index]] · goal made concrete in the probe · plan approved before teaching started

_The lesson itself is read in the conversation, on the board. This note is the record of it._

## 🎯 Goal

_(What I wanted, made concrete during the probe — in my words, not the teacher's.)_

## 🧭 Probe — where I actually was

_(What was checked, what held, where it ran out. The edge, bracketed.)_

| Strand | Checked with | Result | Reading |
| --- | --- | --- | --- |
|  |  |  |  |

## 🗺 Plan — the dependency map

_(Approved before any teaching: roots at the top, the goal at the bottom. This map is the teaching order. The spine is the `graph:` block in this note's frontmatter — fill that in, run `node Tools/vault-chart.mjs`, and embed the SVG it writes into `Learn/Viz/`.)_

![[<filename-slug>-graph.svg]]

## 📖 Nodes

_Each node is published to the board as it is taught — `mimir_board`, once per node, carrying the spine, the question, the hint and whichever drawings this node turns on. The board is where the lesson is read; this section is where it is written down._

### Node 1 — _name_

- **Motivate** — why this node, now
- **Establish** — the truth at face value, or the derived step and the move that produces it
- **Connect** — what it hangs off
- **Check** — how it was confirmed, and how it went

### Node 2 — _name_

- **Motivate** —
- **Establish** —
- **Connect** —
- **Check** —

## ✅ Checks

| # | Question (bare claims) | My pick | ✓/✗ | What it revealed | Repair |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |

## 🧩 Where it lives now

- Concept notes created or extended: 
- Glossary terms added: _(_ niche words this session leaned on; see [[Glossary]]_)_
- Map updated: 
- Diagram: 
- Review entries filed, first due: 
- Cards written: _(_ facts, names, dates and characters this session introduced — they go in `## 🃏 Cards` below, and `Tools/anki-cards.mjs` collects them_)_

## 🃏 Cards

_What Anki can hold, and nothing else. **Two shapes, and the sentence decides which.** Collect with `node Tools/anki-cards.mjs --all`._

_**A question, or a wrong claim to judge** — `front :: back :: kind` (kind optional; `trap`, `name`, `date`, `species`, `fact`):_

- _A plausible wrong claim I might believe? — does that hold? :: **No** — and the reason, in one or two sentences._ :: trap
- _A question with a short, checkable answer._ :: _The answer._
- _A species to tell apart._ :: _The characters that do it, and the lookalikes it is confused with — a name alone is refused._ :: species

_**A cloze card** — one missing token inside a true sentence. Put `{{c1::…}}` around the token and it goes to a note type of its own. Its kind is required, and a caveat goes in the middle: `sentence :: caveat :: kind`. Anki makes **one card per `{{cN::}}`**, so two gaps are two cards — worth it only when the facts are genuinely separate, since each gap is visible on the other's card._

- _The First Emperor unified China in {{c1::221 BCE}}._ :: date
- _{{c1::Gelasius I}} put the two-powers distinction to Anastasius in 494._ :: _Forty years before Justinian; the Latin West made the claim first._ :: name

**And what does not go here at all.** A **derivation** — "why must this be so" — because a card converts reconstruction into recognition, which the `reviewing` skill calls worse than no review; those stay on [[Review Queue]]. A **cloze trap** is refused outright: a claim to be judged has to be stated in full. And a "fact" card with a *why* bolted onto it is a derivation wearing a fact's label — if the answer is a sentence of reasoning, it belongs on the queue.

_Anything that does not fit one of those shapes is refused rather than silently mis-split._

## 📚 Reading

_At most **two** books per session — only ones that extend what was actually taught. Better one that fits than two that pad. Done at the end of the session, never during it._

- **[Title]** — Author (year) · [link] — one line on what it adds that the session could not.

Full list: [[Reading List]]. Link and format notes in [[How We Learn]] → *Reading list*.

## 🌐 Sources

- [name](https://en.wikipedia.org/wiki/…) — why it is here

## 🧭 Updates

- **Profile**: floors confirmed, edges found, misconceptions dealt with
- **Backlog**: ticked, added
- **Next time**: what to build on top, and what is still fragile
- **Publish**: when this is `status: done`, publish it to your library vault
