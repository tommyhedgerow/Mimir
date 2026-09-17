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
