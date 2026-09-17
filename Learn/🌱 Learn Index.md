---
type: index
tags:
  - learn
  - moc
---

# 🌱 Learn — home

> This is the vault's front door. `How We Learn.md` is the method; `Learner Profile.md` is where you stand; `Backlog.md` is where you are going; [[Dashboard]] is the state of all of it, read live out of the notes.
>
> **Standing format:** the session note is created and opened in Obsidian at the start of a session and written live. **A diagram must fit the column and read in one look** — strand maps are generated SVG in `Learn/Viz/`, not mermaid.

## Start here

Nothing has been taught yet, so most of this vault is empty on purpose. The shape is the point: it is the shape that fills in.

1. **Open this folder in DSH** and pick the **Mimir Tutor** preset for the session. That combination is what makes it a teacher rather than a chatbot — the preset carries the method as skills, six specialists, and the standing rules about verifying facts and writing the vault back. `INSTALL.md` at the repo root walks through it.
2. **Say what you want to learn.** "Teach me plate tectonics." "I want to understand what Kant actually did." "Explain mycorrhiza." The teacher probes what you already hold, proposes a dependency map, waits for your go-ahead, and then builds the topic one node at a time.
3. **Read along here, in Obsidian.** Everything the teacher writes lands in this vault as notes, and the diagrams render where the prose is.
4. **Review when things come due.** Ask for a review session and it works [[Review Queue]] — retrieval first, repair on a miss, and the next date set by how well it went.

## In flight

_Nothing yet. When a session is paused rather than finished, it is listed here with the exact node to resume at, so a new session can pick it up without re-reading everything._

## Maps

_One note per strand in `Learn/Maps/`, each holding the dependency order and the current frontier. The first one appears when you ask for your first subject._

## Concepts

_Atomic notes in `Learn/Concepts/`, one idea each, wikilinked into a graph. The concepts are the knowledge; the sessions are the record of acquiring it. They fill in as sessions complete nodes._

## Recent sessions

_One dated note per session in `Learn/Sessions/`, from `Templates/Session.md`._

## Reviews

- [[Review Queue]] — empty. The queue is a promise, not a wish list: a concept that was taught and checked earns an entry with a due date.

## Vocabulary & reading

- [[Glossary]] — the vault's niche vocabulary, one note per term with its field. Grown only from words a session actually used, never speculatively.
- [[Reading List]] — what to read next, by strand. At most one or two books per session.

## How this vault works

- **Sessions** live in `Learn/Sessions/`, one dated note each, from the templates in `Learn/Templates/` (`Session`, `Concept`, `Map`).
- **Concepts** live in `Learn/Concepts/`, one idea per note, wikilinked into a graph.
- **Maps** live in `Learn/Maps/`, one per strand, holding the dependency order and the current frontier.
- **Reviews** live in `Learn/Reviews/`.
- **Sources** live in `Learn/Sources/`; **diagrams** in `Learn/Viz/`.
- **Views** live in `Learn/Dashboard.base`, embedded in [[Dashboard]] — what is due, what is fragile, where each strand stands. They read the frontmatter, so they cannot drift from the notes.
- Finished work is **published** to a second, library vault, one note at a time — see `Tools/publish-to-library.sh`.

## The generators

Three scripts do the work that a hand cannot be trusted to keep current. Run them from the vault root:

```sh
node Tools/vault-map.mjs        # validates the spines in the maps and session notes
node Tools/vault-chart.mjs      # redraws every SVG in Learn/Viz from those spines
node Tools/check-tokens.mjs     # fails if the theme and the charts disagree on the palette
```

`vault-chart.mjs` measures its label widths with the system text engine rather than counting characters, and refuses to write a drawing whose text does not fit its boxes.
