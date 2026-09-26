# Changelog

Notable changes to the Mimir vault, the Mimir Tutor preset, and the pieces that
ship with them. The three Obsidian plugins and the theme are versioned in their
own repositories.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-26

The method's biggest change since 1.0, and the lesson's two exits.

### A question is asked alone, after its teaching

- **The asking is now two messages, and the harness enforces it.** The teaching
  goes in one message and ends with the board; the card goes in the message after
  it and carries **no prose of any kind**. Both halves are load-bearing, and each
  kills half of a real failure. A sentence written immediately above a question is
  the sentence most likely to hand over the answer — that is what a preamble *is*,
  and with the card alone there is no preamble. And a question with no teaching
  above it has no text to be read against, which is how questions arrive that make
  no sense at all.
- **The probe into a new subject is the same shape, not an exception.** Nothing has
  been taught yet, so the message carries the line of framing where the teaching
  would be: what is being asked, and why — then the board, then the bare card.
  What the rule forbids is a card with nothing above it, never a question asked
  before the teaching exists.
- **A check must ask you to use the node, not repeat it.** If the right option is a
  sentence that was just taught, the check tests reading rather than understanding.
  The teaching teaches, the card asks, and the sorting is yours — so the prose no
  longer flags the answer either.

### Verification gets cheaper and more honest

- **The brief now carries the links.** Every claim in a verification brief arrives
  with the Wikipedia article expected to settle it, and the verifier fetches rather
  than searches. This is the single largest cost change in the preset: a search is
  three auxiliary model-turns behind the scenes, so a run that searches comes back
  with fewer pages read, for about 2.4x the money. One search remains as the whole
  run's allowance, for a claim whose article can be neither named nor constructed.
- **The verifier can be backgrounded again**, so a check that does not gate what is
  about to be said no longer freezes the lesson while it works.
- **The cartographer's budget is counted in queries, not calls**, because one call
  carrying four questions costs four model-turns either way — and its effort is
  pinned, since it was inheriting the session's.
- **An `unverified` needs a disposition before it is taught**, and there are exactly
  three: left out, taught as contested, or checked now. A verdict written in a
  Sources list is not the same as a verdict reaching the prose.

### Two exits from the vault

- **A finished lesson prints to A4**, twice: the **record**, which is the session as
  it stands, and the **study sheet**, which turns the checks into questions with the
  answers moved to an appendix. It prints through a real browser engine, so the file
  has a real text layer and can be searched, and it refuses to orphan a heading
  across a page break.
- **The card-shaped part of the vault becomes an Anki deck**, from a `## 🃏 Cards`
  section beside the knowledge it tests, in the two shapes the note type
  understands — `front :: back :: kind`, and a cloze card written `{{c1::…}}`. The
  package carries both note types, their templates and their CSS, so importing one
  file is the whole install. **A derivation never becomes a card**: a card turns
  reconstruction into recognition, and the reviewing method is explicit that this
  is worse than no review. A species card must carry the characters that tell it
  apart, and a glossary entry is carded only when its own note says `card: true`.
- Both templates gain the `## 🃏 Cards` section, in both languages, and `vault-craft`
  gains the contract — including the three refusals that are deliberate rather than
  omissions.

### A link you can look at without leaving the lesson

- **Hover card.** Rest the pointer on a link in the conversation and a card opens
  with the page's title, its opening paragraph, its lead image and its host.
  Wikipedia links get the article's own opening paragraph from Wikimedia's summary
  API rather than a scrape.
- **It has to be two halves, and the reason is worth knowing.** The conversation is
  served under `connect-src 'self'`, so the page cannot fetch Wikipedia itself, and
  an iframe is refused by `X-Frame-Options`. The host half fetches beside the
  workspace and answers one loopback route; the browser half only listens for a
  hover. The route is fenced like the server-side fetch it is — http and https only,
  no credentials, no redirect into the machine, a capped body and a hard timeout —
  and a refusal is an ordinary answer with a reason a person can read.

### Fixed

- **The probe and check scores reached no printed lesson.** The vault records them as
  bare numbers in frontmatter (`probe_checks: 6`), the ledger parser read every
  scalar as text, and the PDF's title block prints them only when they arrive as
  numbers — so every score was silently dropped from every record. A bare integer or
  decimal is now a number.
- **Two card lines were accepted that should have thrown**: a card whose front was
  empty (`- :: back :: fact` parses its front as `:: back`), and a card with an
  unrecognised kind, which was tagged into a group nothing reads.
- **The three tool suites are now self-contained.** They ran against the author's own
  vault, so a fresh clone had nothing for them to pass against. They build a small
  vault in a temporary directory, read it through the tools' new `--vault` switch,
  and delete it — the PDF suite skipping the Chrome checks out loud where there is no
  Chrome, rather than passing them silently.

[1.1.0]: https://github.com/tommyhedgerow/Mimir/releases/tag/v1.1.0

## [1.0.0] — 2026-09-19

The finished 1.0. This supersedes the 1.0.0 tagged on 2026-09-17 and replaces it as
the release to install; the earlier one still exists as a tag and is kept only as a
record of where this started. If you installed from it, install again — nothing about
the teacher's method is compatible with the old lesson surface.

### The lesson surface is the conversation

- **The Lesson pane is gone — removed, not retired.** It was a docked window that had
  to be opened, pointed at a conversation, and kept in step with it, and its whole file
  protocol (three JSON files per session, a pointer file, an outbox for answers that
  arrived while another conversation was on screen) existed to bridge a gap that only
  existed because the lesson was somewhere other than where it was read.
- **The board replaces it.** `mimir_board` publishes the lesson's shape into the
  transcript at the point the teaching happens: the spine of dependency nodes and where
  the learner is in each, the question and its options, one line of hint, and the
  drawings the lesson turns on. It is an ordinary session event, so it survives a
  reload, replays after a fork and can be scrolled back to.
- **The drawings reach the interface and never the model.** They travel as the call's
  presentation metadata while the teacher is told their names and nothing else, so a
  lesson can carry four diagrams without four thousand tokens of path data entering the
  context window. A drawing that is missing, unreadable or too large comes back named
  as missing, on screen, rather than being silently absent.
- **One package, both halves.** The board ships as `preset/mimir-skin`, installed by
  `dsh plugin --profile web add`. The host half registers the tool and reads the
  drawings; the browser half draws them. A preset row can mount the host half and
  produces no browser bundle at all, so they cannot be shipped apart.
- **The host half imports nothing at all.** It registers against the tool registry's raw
  contract — plain JSON Schema, which is what `defineTool` compiles its terse spec into.
  The import it used to have (`@deepseek-ai/dsh-tools`) is why the board could not be
  installed the ordinary way: Node resolves a symlinked package's imports from its real
  path, where no `node_modules` holds the harness' packages, so the mount died with
  `ERR_MODULE_NOT_FOUND` and the tool silently never registered.

### The palette

- **The dark half is a colder room.** Blue-black stock under cyan-and-magenta light,
  with the warm orange and the green kept for the two things that are not the accent.
  Every drawing in `Learn/Viz` is redrawn in it.
- **`--mimir-ink-3` is measured rather than guessed** — 4.84:1 on the deepest light
  stock, 6.24:1 on the darkest. The value it replaces claimed 4.5:1 and delivered 3.87:1.
- The palette now has a contrast floor it is actually held to: the board's browser half
  is checked pair by pair, in both schemes, on every push.

### The teacher

- The nine skills are tightened throughout: how a check question is built so that
  evenness is a property of its construction rather than something audited afterwards;
  what to do with a single miss (probe around it before concluding anything); the rule
  that a claim the teacher generates — a mechanism, a bridge, a one-line summary — is
  still a checkable claim, and the one this teacher actually fails on.
- A correction now propagates in the same turn it is made: the session note, any concept
  note or map carrying it, and every drawing redrawn from those notes.
- `vault-craft` gained the session ritual, the frontmatter contract and the boundary.

### Running it in a browser

- **`scripts/serve.sh`** — `dsh web` with the one Node flag the harness needs. The
  harness resolves a profile plugin by package name through Node's internal loader,
  which is only reachable under `--expose-internals`. DSH Desktop hard-codes that flag;
  the command-line `dsh` does not, and without it the plugin tree fails to load and the
  server never starts. `NODE_OPTIONS` cannot supply it either, because Electron ignores
  Node environment variables in a process it was invoked by.
- Everything else is identical on both surfaces: the same preset root, the same profile,
  the same board. `INSTALL.md` says what differs — only the `.dshpreset` import, which
  ships in the desktop shell.
- The installer materialises the board package into the profile's `node_modules` rather
  than leaving the symlink `dsh plugin add` creates, because the loader resolves the
  package from there.

### The checks

- `Tools/check-tokens.mjs` now checks the board too: every palette role it names must
  exist in both schemes, and a misspelt role — which reaches the page as the literal
  string `undefined` inside a custom property, and is ignored in silence — fails the run.
- `Tools/test-mimir-board.mjs` mounts the built host half into a stub registry and drives
  it: that it registers, that the hand-written argument check refuses what the schema says
  it refuses, that a path is flattened rather than followed, and that a missing drawing is
  named.
- `Tools/test-mimir-skin.mjs` loads the shipped browser bundle the way the page loads it.

### Removed

- `Tools/lesson-pane/`, `preset/lesson-pane/`, `Tools/build-lesson-pane.mjs`,
  `Tools/preview-lesson-pane.mjs`, `Tools/test-lesson-pane.mjs`, and `Learn/Sessions/.live/`
  with its file protocol. The vault keeps its own copy of the pane as a record; the public
  repository keeps none.

### The teacher, as it ships

- Nine method skills: `mimir-teaching`, `vault-craft`, `specialists`, `sourcing`,
  `reviewing`, `visualize`, `playbooks-humanities`, `playbooks-natural-world`,
  `language-learning`.
- Six specialist sub-agents, one per role, each with its own persona and a tool
  allow-list: verifier, cartographer, diagram maker, examiner, sophist, librarian.
  Every specialist is `maxDepth: 1`, so a fact-check cannot become a recursive tree of
  agents.
- The verifier is the only specialist that cannot be backgrounded, and the only one with
  a hard call budget. That is deliberate: an unbounded fact-check was measured at 18–46
  steps and up to six minutes per call before it was fenced in.
- Plan mode, goals, compaction and a tool-result pruner are wired for long study arcs
  rather than single answers.

### The vault

- Session, concept and map templates, each carrying the frontmatter the generators read.
- A spaced-review queue with retrieval-first intervals, and a rule that a concept is
  retired after four clean retrievals.
- A glossary that grows only from words a lesson actually needed, never in advance, and a
  reading list capped at two books per session.
- `Learner Profile.md` and `Backlog.md` as blank forms with the section headings and
  prompts intact, so the learner can see what is being recorded about them.
- `AGENTS.md`, the vault's standing instructions, which outrank the preset.

### The generators

- `Tools/vault-map.mjs` validates the `graph:` spines in the maps and session notes;
  `Tools/vault-chart.mjs` draws every SVG in `Learn/Viz` from those spines, measuring
  label widths with the system text engine rather than counting characters, and refusing
  to write a drawing whose text does not fit its box.
- `Tools/publish-to-library.sh` mirrors a finished note, and every file it embeds, into a
  second vault at the same relative path, so wikilinks still resolve there.

### The Obsidian pieces

- **Mimir**, a theme in warm paper and sage, with a serif for what is read and a monospace
  for what is furniture. No remote assets: system fonts and local CSS, so it works offline.
- **Mimir Controls** — reading size and light/dark from the note header.
- **Mimir Splash** — the startup animation, played once over the vault.
- **Lesson Publisher** — the one-click version of the publish script.

### Artwork

- Procedurally rendered from the theme's own palette: the banner, the social card, three
  icon marks with light-mode twins, a divider rule and a badge strip, plus the startup
  animation in GIF, MP4 and WebM.
- The one supplied illustration the project used while it was private is **not** included.
  Its rights were never established, so it was left out rather than shipped with a
  question mark over it.

[1.0.0]: https://github.com/tommyhedgerow/Mimir/releases/tag/v1.0.0
