# Installing Mimir

Two programs have to meet: **DeepSeek Harness**, which runs the teacher, and **Obsidian**, which is where you read and review. The vault folder is the thing they share.

There are three routes. Take the first unless you have a reason not to.

| | Route | Use it when |
| --- | --- | --- |
| **A** | `./scripts/install.sh` | Normal case. Clones, installs the preset, and installs the board. Add `--lang zh-CN` for the Chinese preset. |
| **B** | Import a `.dshpreset` | You already have a vault and only want the teacher. Desktop only, and it does not include the board. |
| **C** | By hand | You want to know exactly what landed where, or you are on Windows. |

---

## Before you start

- **Obsidian**, 1.5 or later. Free, and this vault works on desktop and mobile.
- **DeepSeek Harness**, with a model route configured. Either the desktop build or the command-line `dsh` works, and everything in this repository behaves the same on both; see *Desktop and browser* below for the two differences there are.
- **Node.js 20 or later**, for the vault's generator scripts and the board's build. Nothing else needs it.
- **Python 3.10 or later**, only if you want the command-line publisher. The Obsidian plugin does not need it.

You do **not** need an API key for anything in this repository, and nothing here downloads a model or a font.

---

## Route A — the installer

```sh
git clone https://github.com/tommyhedgerow/Mimir.git
cd Mimir
./scripts/install.sh
```

That is the whole thing. Two presets ship — the same teacher in English and in Simplified Chinese. They are separate presets rather than one, because the language of instruction is a property of the persona and a session cannot be half in each:

```sh
./scripts/install.sh --lang zh-CN    # 中文导师
```

Both can be installed at once. Their ids differ (`mimir-tutor` and `mimir-tutor-zh`), so they sit side by side in the session picker, and either works in the same vault: the vault ships both languages of every document the learner reads. `docs/zh-CN-glossary.md` records what is translated and what is deliberately not.

What the installer does, in order:

1. **Finds your DSH home.** `$DSH_HOME` if it is set, otherwise `~/Library/Application Support/dsh-desktop/harness` for DSH Desktop on macOS, otherwise `~/.dsh`.
2. **Copies `preset/` into `<dsh home>/.agent-presets/mimir-tutor/`.** If a preset is already there it is **moved aside, never deleted**, to a sibling folder stamped with the date. If you have edited the preset locally, your edits are in that backup.
3. **Installs the board** with `dsh plugin --profile web add ./preset/mimir-skin`. That one command copies the package into your profile, appends it to `dsh.profile.bundles`, and composes the row that mounts it, because the package's manifest declares `dsh.bundle` and the package carries its own `cordis.patch.yml`.

Useful flags:

```sh
./scripts/install.sh --dry-run      # say what would happen, write nothing
./scripts/install.sh --no-board     # preset only, skip the board
./scripts/install.sh --lang zh-CN   # the Simplified Chinese preset
./scripts/install.sh --help
```

Then:

1. **Restart DSH.** This is not superstition. A preset is composed once per process: the persona, the tool set and the specialist sub-agents are fixed for the life of the running process. The board's row is composed at the same time. Changing `agent.cordis.yml` and not restarting is the single most common reason a change appears to do nothing.
2. **Open the `Mimir` folder as the workspace** in DSH, and pick **Mimir Tutor** in the session picker.
3. **Open the same folder as a vault in Obsidian** (Open folder as vault, and pick the `Mimir` directory).
4. **Say what you want to learn.**

To undo: `./scripts/uninstall.sh`.

### If the board step fails

The preset still works and the teacher still teaches; what you lose is the board — the lesson spine, the question card in the transcript and the vault's drawings. The lesson still reads and the questions are still answered, just in the plain conversation. Retry by hand:

```sh
dsh plugin --profile web add "/path/to/Mimir/preset/mimir-skin"
```

That needs `pnpm` on your `PATH`. If `dsh` itself is missing, install the harness CLI first. The installer prints the exact command with your path filled in.

### Why the board is a separate step, and why it is one command

The board is two halves that reach their runtimes by different roads. Its **host half** registers the `mimir_board` tool and reads the drawings off disk; its **browser half** draws the spine, the question and those drawings into the page. A preset row can mount the host half perfectly and produces **no browser bundle at all** — which is exactly how an earlier version of this shipped and did nothing in the interface. So both halves live in one package, `preset/mimir-skin/`, and it is installed as a profile plugin.

The host half deliberately **imports nothing from the harness**. That is not minimalism for its own sake. A plugin the profile resolves by package name is found, but Node resolves the imports *inside* it from the file's real path — and installed by symlink, that path is this checkout, where no `node_modules` above it holds the harness' own packages. The mount then dies with `ERR_MODULE_NOT_FOUND`, the tool never registers, and the failure looks exactly like a teacher who forgot to call it. Registering against the tool registry's raw contract removes the whole class of failure: the package mounts from any install layout.

---

## Route B — import a `.dshpreset`

A `.dshpreset` is a zip holding the preset and its skills. It is the portable form, and the right one to send to somebody.

Build one from this repository:

```sh
./scripts/pack-preset.sh
# writes dist/mimir-tutor.dshpreset and dist/mimir-tutor-zh.dshpreset

./scripts/pack-preset.sh --preset mimir-tutor-zh   # just one
./scripts/pack-preset.sh --check                   # verify both, write nothing
```

Then, in DSH Desktop:

1. **Settings → Agent presets → Import.**
2. Choose the file, confirm the id it offers (`mimir-tutor` or `mimir-tutor-zh`), and install.

This route installs the **teacher only**. The board is a profile plugin and cannot travel inside a preset — its browser half has no way into the archive — so it is not in the package and will not appear. If you want it, run the `dsh plugin` line from Route A against your clone as well.

---

## Route C — by hand

The preset is a directory of plain files. Copying it is a legitimate installation.

```sh
# 1. the preset
# English
mkdir -p "$DSH_HOME/.agent-presets/mimir-tutor"
cp -R preset/. "$DSH_HOME/.agent-presets/mimir-tutor/"

# 简体中文
mkdir -p "$DSH_HOME/.agent-presets/mimir-tutor-zh"
cp -R preset-zh/. "$DSH_HOME/.agent-presets/mimir-tutor-zh/"

# 2. the board (one package, both halves)
dsh plugin --profile web add "$PWD/preset/mimir-skin"
```

On Windows the harness home is `%USERPROFILE%\.dsh` unless `DSH_HOME` says otherwise. Use PowerShell's `Copy-Item -Recurse -Force preset\* "$env:DSH_HOME\.agent-presets\mimir-tutor\"`.

Nothing in the preset is registered, compiled or cached. It is read from that directory at session start. The board is the one part that is installed rather than read, and the command above is the whole of it.

---

### Running in a browser instead of the desktop app

Everything here works under `dsh web` exactly as it does in DSH Desktop — the same preset root, the same profile, the same board. There are two differences, and the first one will stop the server from starting if you skip it:

- **Serve with `./scripts/serve.sh`, not a bare `dsh web`.** The harness resolves a profile plugin by package name through Node's internal module loader, and that loader is only reachable when the process starts with Node's `--expose-internals`. DSH Desktop hard-codes that flag in its launcher; the command-line `dsh` does not. Without it the board's row fails its import, the plugin tree fails to load, and the server never comes up — with an error naming the harness' own loader rather than the missing flag. `scripts/serve.sh` is `dsh web` with the flag in front, and passes every other flag through. If you would rather not use it:

  ```sh
  node --expose-internals "$(readlink -f "$(command -v dsh)")" web --no-open
  ```

  (`NODE_OPTIONS` cannot supply it; Electron ignores Node environment variables in a process it was invoked by.)
- **Importing a `.dshpreset` is a DSH Desktop feature.** The import and export routes ship inside the desktop shell, not in the harness core, so under `dsh web` there is nothing listening for the file. Use Route A or Route C; the result is the same directory layout.

After installing the board, **restart the server** rather than reloading the page. The browser half is served from disk and a changed bundle reaches an open page on its own within about half a second, but the row that mounts it is composed once per process.

If `dsh web` does offer you a choice of workspace-folder pickers, take the in-app browser rather than the OS dialog: the OS-dialog backend needs a desktop bridge that only DSH Desktop provides.

---

## Where everything lives

| What | Where | Put there by |
| --- | --- | --- |
| The preset | `<dsh home>/.agent-presets/mimir-tutor/` | the installer, or you |
| The board package | `<dsh home>/profiles/web/node_modules/dsh-mimir-skin/` | `dsh plugin add` |
| Its layer entry | `dsh.profile.bundles` in `<dsh home>/profiles/web/package.json` | `dsh plugin add` |
| Its composition row | the package's own `cordis.patch.yml`, read as a profile layer | the package |
| The vault | wherever you cloned this | you |
| Your own notes | `Learn/` inside the vault | the teacher, as you go |

---

## Editing it afterwards

The whole point of this arrangement is that you can change it.

| Edit | Takes effect |
| --- | --- |
| Anything in `preset/skills/` | At the next load. Skill files are re-read every time, so a corrected skill is in force at the next step, no restart. |
| `preset/agent.cordis.yml` | After a DSH restart. Persona, tools and specialists are fixed when the process composes. |
| `preset/preset.yml` | The name and description in the session picker. Restart to see it. |
| `preset/mimir-skin/client.mjs` | Rebuild with `node Tools/build-mimir-skin.mjs`, then reload the page. No restart. |
| `preset/mimir-skin/host.mjs` | Rebuild, then restart — the host plane is composed once per process. |
| `Learn/How We Learn.md` | Immediately. It is a note the teacher is told to read, not a config file. |
| `AGENTS.md` (at the vault root) | At the start of the next session. These are the vault's standing instructions and they outrank the preset. |
| `.obsidian/` | Immediately, except plugins, which need a reload. |

If you want the teacher to behave differently, **edit the skill first**. The method actually lives there; the persona is deliberately short so that it can be.

### Chatting without the preset

If you use a DSH surface that cannot select a preset, the skills can be mirrored into the vault so any session rooted there finds them:

```sh
Tools/sync-skills.sh
```

Those copies sit at `<vault>/.dsh/skills/`, which **outranks** the preset's own copies. Re-run the script after editing a skill in the preset, or delete `.dsh/skills` to go back to the preset's versions.

Note that this mirrors the *skills*, not the tools: a session without the preset has no `mimir_board`, no specialists and no plan mode. It is for chatting about the material, not for teaching a lesson.

---

## The vault's scripts

```sh
node Tools/vault-map.mjs        # validates the spines in the maps and session notes
node Tools/vault-chart.mjs      # redraws every SVG in Learn/Viz from those spines
node Tools/check-tokens.mjs     # fails if the theme, the charts, the plugins and the board disagree on the palette
node Tools/build-mimir-skin.mjs # rebuilds the board's two halves from their sources

node Tools/export-lesson-pdf.mjs --done --both  # the finished lessons, to A4
node Tools/anki-cards.mjs --all                 # the card-shaped part of the vault, to Anki
node Tools/build-link-preview.mjs               # installs the hover card into your harness
```

`vault-chart.mjs` measures label widths with the system text engine rather than counting characters, and refuses to write a drawing whose text does not fit its boxes. Run it after editing a `graph:` block.

`build-mimir-skin.mjs` wraps the board's browser half into the module shape the page loads, and emits the palette into it from `Tools/mimir-tokens.json` so it can never disagree with the theme. After rebuilding, reinstall it the same way you installed it:

```sh
dsh plugin --profile web add "$PWD/preset/mimir-skin"
```

`export-lesson-pdf.mjs` needs a Chrome, Chromium or Edge on the machine — it prints through the browser's own engine rather than re-implementing one, which is what gives the PDF a real text layer. Set `CHROME=/path/to/binary` if it is somewhere unusual. It writes into `Learn/Exports/`, which is **derived**: everything in it can be rebuilt from the notes, and the repository ignores it for that reason. `--record` is the session as it stands, `--sheet` turns the checks into questions with the answers in an appendix, and `--done` restricts it to the lessons you have marked finished. Pass `--vault DIR` to read a vault other than the one the tool lives in.

`anki-cards.mjs` reads the `## 🃏 Cards` section of your session and concept notes. What it writes is a `.apkg` carrying both Mimir note types, their templates and their CSS, plus one `.tsv` per note type for reading and diffing. Import the `.apkg` in Anki; the `.tsv` files are for your eyes. A blank deck on a fresh vault is the correct result, not a failure — nothing is carded until a lesson has written something worth carding.

`build-link-preview.mjs` installs the hover card's two halves into your harness home (`DSH_HOME`, or the desktop app's default) and adds its row to that profile's composition. `--check` reports whether the installed bundle is current and writes nothing. It is a separate command from the board because it is a separate plugin, and you can leave it out — nothing else in the vault depends on it.

The command-line twin of Lesson Publisher:

```sh
Tools/publish-to-library.sh --target "/path/to/Library" "Learn/Sessions/2026-02-14 Kant.md"
Tools/publish-to-library.sh --dry-run "Learn/Concepts/Deep time.md"
```

---

## Troubleshooting

**The session picker does not show Mimir Tutor.**
You have not restarted DSH. A preset is composed once per process.

**The teacher never publishes a board.**
The board is not installed, or the process predates its installation. Run `dsh plugin --profile web add "$PWD/preset/mimir-skin"` and restart. If the teacher *does* call `mimir_board` and nothing appears, the browser half is not reaching the page — check that the package is in `dsh.profile.bundles` in `<dsh home>/profiles/web/package.json`, and rebuild with `node Tools/build-mimir-skin.mjs`.

**A board says a drawing is "not shown".**
That is deliberate. The drawing is missing from `Learn/Viz/`, unreadable, or over the size the board will carry, and the note beside it says which. Run `node Tools/vault-chart.mjs` to regenerate the drawings, then teach on.

**`dsh: command not found`.**
The harness CLI is not on your `PATH`. Install the harness, or point the installer at its home with `DSH_HOME=... ./scripts/install.sh`.

**The teacher asserts something you doubt.**
Ask it to verify. It has a verifier role whose whole job is checking claims against sources, and it is expected to say plainly when a check corrects it. If it will not, that is a bug worth reporting.

**A generated diagram is missing or stale.**
Run `node Tools/vault-chart.mjs` from the vault root.
