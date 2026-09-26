---
type: index
tags:
  - learn
  - moc
---

# 🌱 Learn — home

> **English** · [简体中文](🌱%20学习索引.md)

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

## Getting a lesson out of the vault

Two commands take a finished lesson out of the notes, and both read the notes rather than a copy of them:

```sh
node Tools/export-lesson-pdf.mjs --done --both   # A4 into Learn/Exports/
node Tools/anki-cards.mjs --all                  # a deck into Learn/Exports/anki/
```

**PDF.** `--record` is the session as it stands; `--sheet` is the same lesson with the checks turned into questions and the answers moved to an appendix, so it can be worked from rather than read. It prints through a real browser engine, which is why the file has a real text layer and can be searched. Needs Chrome, Chromium or Edge — set `CHROME=/path/to/binary` if it is somewhere unusual.

**Anki.** The card-shaped part of the vault — a name, a date, a character, a wrong claim to be judged — lives in a `## 🃏 Cards` section beside the knowledge it tests, in one of two shapes:

- `front :: back :: kind` — a question with a short answer, or a wrong claim to be judged (`trap`). Kind is optional.
- `sentence with {{c1::…}} :: kind` — one missing token in a true sentence. Anki makes one card per gap.

**A derivation never becomes a card**, because a card turns reconstruction into recognition, and `reviewing` is explicit that this is worse than no review — those stay on [[Review Queue]]. A species card must carry the characters that tell it apart, and a glossary entry is carded only when its own note says `card: true`.

`Learn/Exports/` is **derived** and is ignored by git: every file in it can be rebuilt from the notes by those two commands, and nothing is lost by leaving it out.

Either tool takes `--vault DIR` to read another vault.

## The hover card

`node Tools/build-link-preview.mjs` installs one more plugin into DSH: rest the pointer on a link in the conversation and a card opens with the page's title, its opening paragraph and its lead image. Wikipedia links get the article's own opening paragraph. It is optional — nothing else in the vault needs it — and `--check` says whether the installed copy is current.
