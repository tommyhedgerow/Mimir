<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/banner_1280x320.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/banner_light_1280x320.png">
  <img alt="Mimir's well beneath Yggdrasil: cyan roots descend into a glowing stone well, with the Futhark tree and M runes stacked on a single vertical axis." src="assets/banner_1280x320.png">
</picture>

# Mimir

**English** · [简体中文](README.zh-CN.md)

**A learning vault that teaches.** It is an [Obsidian](https://obsidian.md) vault and a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent preset, wired together so that the agent is a teacher rather than a chatbot: it probes what you already understand, plans a dependency map of the subject, waits for your approval, then builds the topic one node at a time and writes everything into the vault as it goes.

Named for Mímir's well, the well of wisdom under Yggdrasil. What you are looking at is the well; the vault is where the water goes.

<img alt="A six-second pixel-art animation on a loop: roots grow down from the top of the frame, scatter into dust, and a stone well rises through the dispersal. Two Futhark runes resolve above it." src="assets/mimir-startup-loop.gif" width="640">

---

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/divider_1280.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/divider_light_1280.png">
  <img alt="" src="assets/divider_1280.png" width="100%">
</picture>

## The problem it is built for

Reading about something and understanding it are different states, and only one of them survives a month. A pile of disconnected facts rots; facts held in place by their connections do not, because each one stays recoverable from the others.

So the goal here is not coverage. It is the moment a pile of loose facts collapses into two or three generating ideas, and stays collapsed.

Two principles do the work, and the rest of the system is downstream of them:

1. **Unconditional truths first.** Start from the few things you can accept as-is, with no caveats. Not because bottom-up is tidier, but because caveat-free facts are the only ones the mind will commit to without hedging. Where no exception-free truth exists at the level you are working at, the honest move is to say so and drop to the next solid ground: a definition, a distinction, a constraint.
2. **"How could I have discovered this?"** A fact with no visible reason to be the way it is feels arbitrary, and arbitrary facts do not stick. So every step is motivated from the problem that sent someone down that path. Nothing appears from nowhere.

The method is a port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn), rebuilt for DSH: the reference system's graded-quiz extension becomes a real selectable-question tool, its researcher and diagram steps become preset sub-agents, and its markdown log becomes an actual vault.

## What you get

| | |
| --- | --- |
| **The preset** | `Mimir Tutor` — nine method skills, six specialist sub-agents, and the standing rules about verifying facts before asserting them. This is the teacher. |
| **The board** | The lesson itself, published into the conversation: the spine of dependency nodes and where you are in each, the question, a one-line hint, and the vault's drawings. Scroll back to it, reload, fork — it is part of the transcript, so it is still there. |
| **The vault** | A working Obsidian vault: session, concept and map templates, a spaced-review queue, generated SVG dependency maps, a glossary that grows only from words a lesson actually needed, and a reading list capped at two books a session. |
| **The theme** | `Mimir` — warm paper and sage in daylight, a cold blue-black under cyan-and-magenta at night, a serif for what is read and a monospace for what is furniture. |
| **Three plugins** | Reading-size and light/dark controls, a startup animation, and a publisher that copies a finished note and its diagrams into a second library vault. |

### The board

Every lesson is published as it happens. When the teacher teaches a node it calls `mimir_board`, which puts onto the transcript:

- the **spine** — the dependency map's nodes in teaching order, each marked held, learning, fragile or planned, so you can see where you are without leaving the lesson;
- the **question** and its options, word for word the same as the card you answer;
- one line of **hint**, only when it genuinely helps;
- the **drawings** this lesson turns on, rendered at full width.

Two things about the drawings are worth knowing, because they are the reason the board exists as a tool rather than as a note. They travel to your interface and **never into the model's context** — the teacher is told their names and nothing else, so a lesson can carry four diagrams without four thousand tokens of path data entering the conversation. And a drawing that is missing, unreadable or too large comes back **named as missing**, on screen, rather than being silently absent: a lesson that refers to a picture you cannot see is worse than one that admits the picture is not there.

There is no second window to keep in step. The conversation is the lesson; the board is the part of it you read at a glance.

## Install

You need [Obsidian](https://obsidian.md) and [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

```sh
git clone https://github.com/tommyhedgerow/Mimir.git
cd Mimir
./scripts/install.sh
```

That does two things: it puts the preset in your DSH home, and it installs the board into your DSH profile. Both matter — a preset cannot carry the board's browser half, so an installation without the second step gives you a teacher who publishes to nothing.

`./scripts/install.sh --lang zh-CN` installs the Simplified Chinese preset instead. Both can be installed at once; their ids differ, so they sit side by side in the session picker.

Then:

1. **Restart DSH.** A preset is composed once per process, so the new one is not visible until the harness comes back up.
2. **Open the `Mimir` folder as the workspace**, and pick **Mimir Tutor** in the session picker.
3. **Open the same folder as a vault in Obsidian.**
4. **Say what you want to learn.** "Teach me plate tectonics." "I want to understand what Kant actually did." "Explain mycorrhiza."

`./scripts/install.sh --dry-run` shows what it would do without touching anything. `./scripts/uninstall.sh` reverses it.

### If you would rather just have the teacher

Both presets are on Preset Square as single `.dshpreset` files, which DSH Desktop installs from Settings → Agent presets → Import:

- **[Mimir Tutor](https://dshdesktop.com/preset/p/mimir-tutor-20d96e)** — teaches in English.
- **[Mimir 导师](https://dshdesktop.com/preset/p/mimir-tutor-chinese-582526)** — teaches in Simplified Chinese.

That route gives you the teacher and nothing else: no vault, no theme, no plugins, and no board. It is the right one if you already have a vault and only want the method.

### Running in a browser instead of the desktop app

Everything here works under `dsh web` exactly as it does in DSH Desktop — the same preset root, the same profile, the same board. Two things to know:

- **The board's row is composed once per process.** After installing, restart the server, not just the page.
- **Importing a `.dshpreset` is a DSH Desktop feature.** The import route ships in the desktop shell, so under `dsh web` there is nothing to catch the file. Use `./scripts/install.sh`, or copy the preset to `<dsh home>/.agent-presets/mimir-tutor/` by hand — the layout is identical.

Fuller detail, including the manual path, the Windows notes and how to build a `.dshpreset` to share, is in **[INSTALL.md](INSTALL.md)**.

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="assets/mark_well_256.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/mark_well_light_256.png">
  <img alt="" width="22" height="22" src="assets/mark_well_256.png">
</picture>

## How a session actually goes

**Probe.** The teacher asks a bracketed set of questions: something at the level you should get right, and something you should get wrong. The truth is in between. An all-correct run means the questions were too easy, so it escalates. One miss is one coordinate, not a verdict: it probes around the miss to find out whether it is a slip, a gap, or a misconception, because a misconception has to be dislodged rather than topped up.

**Plan.** A cartographer sub-agent maps the field first, so the plan is not built on a half-remembered version of the subject. What comes back is prose plus a small dependency map, roots at the top and your goal at the bottom. **Then it waits.** That map is your checkpoint, and it is also the teaching order.

**Teach.** One node at a time, and every node gets the same four moves: motivate it, establish it, connect it to what you already hold, and check it. A miss means stop and repair. Nothing is built on an unconfirmed node.

**Write it down.** Sessions, concepts, maps and review entries land in the vault as they happen, not reconstructed at the end. The diagrams are generated from the notes' own frontmatter by a script, so a picture of where you stand cannot quietly go stale.

**Review.** Taught concepts earn a due date. Retrieval first, repair on a miss, and the next interval set by how well it went. Four clean retrievals and the concept is retired off the queue.

## What is in the repository

```
Learn/                the vault
  How We Learn.md       the method, written for the learner rather than the machine
  Learner Profile.md    a blank form: your floors, your edges, your misconceptions
  Sessions/             one dated note per session, written live
  Concepts/             atomic notes, one idea each, wikilinked into a graph
  Maps/                 one per strand, holding the dependency order and the frontier
  Reviews/              the spaced-review queue
  Glossary/             one note per niche word a lesson actually needed
  Templates/            Session, Concept, Map
  Viz/                  generated SVG, drawn at the width of the reading column
  Dashboard.base        live views: what is due, what is fragile, where each strand stands

preset/               the DSH agent preset, and the board
  preset.yml            the name and description the session picker shows
  agent.cordis.yml      the persona, the tool rows, and the six specialists
  skills/               the nine method skills, one directory each
  mimir-skin/           the board: its host half, its browser half and its layer

preset-zh/            the same teacher, in Simplified Chinese

.obsidian/            the theme and the three plugins, ready to use
Tools/                the generators, the board's build and tests, the checks
assets/               the artwork in this README, and the startup animation
scripts/              install, uninstall, plugin sync, and preset packaging
docs/                 what is translated and what deliberately is not
```

## The checks

Nothing here is trusted to stay in step by luck. Each of these fails loudly rather than drifting:

```sh
node Tools/check-tokens.mjs                # one palette across the theme, the charts, the plugins and the board
node Tools/vault-map.mjs                   # the maps in the notes are the maps the scripts draw
node Tools/build-mimir-skin.mjs --check    # the board ships built, and the build is current
node Tools/test-mimir-board.mjs            # the board's host half mounts, registers, and refuses a path it should
node Tools/test-mimir-skin.mjs             # the board's browser half: contrast floors, token names, the shipped bundle
node Tools/check-bilingual.mjs             # the two languages carry the same skills and the same composition
node scripts/sync-plugins.mjs --check      # the vendored plugins are the ones their repositories released
./scripts/pack-preset.sh --check           # both presets still build, and build reproducibly
```

## Licence

MIT. The method is a port of [amosblomqvist/learn](https://github.com/amosblomqvist/learn), which is MIT too.
