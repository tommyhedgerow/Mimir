# Changelog

Notable changes to the Mimir vault, the Mimir Tutor preset, and the pieces that
ship with them. The three Obsidian plugins and the theme are versioned in their
own repositories.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-17

First public release.

### The preset

- Nine method skills: `mimir-teaching`, `vault-craft`, `specialists`, `sourcing`,
  `reviewing`, `visualize`, `playbooks-humanities`, `playbooks-natural-world`,
  `language-learning`.
- Six specialist sub-agents, one per role, each with its own persona and a tool
  allow-list: verifier, cartographer, diagram maker, examiner, sophist, librarian.
  Every specialist is `maxDepth: 1`, so a fact-check cannot become a recursive
  tree of agents.
- The verifier is the only specialist that cannot be backgrounded, and the only
  one with a hard call budget. That is deliberate: an unbounded fact-check was
  measured at 18–46 steps and up to six minutes per call before it was fenced in.
- Plan mode, goals, compaction and a tool-result pruner are wired for long study
  arcs rather than single answers.
- The Lesson pane: a docked right-hand column carrying the question, the vault's
  drawings, the lesson spine and a scratch page, so the reading column keeps its
  full height. It is a separate profile bundle, because a preset row loads a host
  half and produces no browser bundle at all.

### The vault

- Session, concept and map templates, each carrying the frontmatter the
  generators read.
- A spaced-review queue with retrieval-first intervals, and a rule that a concept
  is retired after four clean retrievals.
- A glossary that grows only from words a lesson actually needed, never in
  advance, and a reading list capped at two books per session.
- `Learner Profile.md` and `Backlog.md` as blank forms with the section headings
  and prompts intact, so the learner can see what is being recorded about them.
- `AGENTS.md`, the vault's standing instructions, which outrank the preset.

### The generators

- `Tools/vault-map.mjs` validates the `graph:` spines in the maps and session
  notes; `Tools/vault-chart.mjs` draws every SVG in `Learn/Viz` from those spines,
  measuring label widths with the system text engine rather than counting
  characters, and refusing to write a drawing whose text does not fit its box;
  `Tools/check-tokens.mjs` fails if the theme, the chart generator, the Lesson
  pane and the plugin disagree about the palette.
- `Tools/publish-to-library.sh` mirrors a finished note, and every file it
  embeds, into a second vault at the same relative path, so wikilinks still
  resolve there.
- `Tools/build-lesson-pane.mjs` wraps the pane's browser half into the module
  format the page expects. It is a wrapper, not a compiler: React comes off the
  page's own module table, so nothing is installed.

### The Obsidian pieces

- **Mimir**, a theme in warm paper and sage, with a serif for what is read and a
  monospace for what is furniture. No remote assets: system fonts and local CSS,
  so it works offline.
- **Mimir Controls** — reading size and light/dark from the note header.
- **Mimir Splash** — the startup animation, played once over the vault.
- **Lesson Publisher** — the one-click version of the publish script.

### Artwork

- Procedurally rendered from the theme's own palette: the banner, the social
  card, three icon marks with light-mode twins, a divider rule and a badge strip,
  plus the startup animation in GIF, MP4 and WebM.
- The one supplied illustration the project used while it was private is **not**
  included. Its rights were never established, so it was left out rather than
  shipped with a question mark over it.

[1.0.0]: https://github.com/tommyhedgerow/Mimir/releases/tag/v1.0.0
