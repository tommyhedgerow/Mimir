# Installing Mimir

Two programs have to meet: **DeepSeek Harness**, which runs the teacher, and **Obsidian**, which is where you read and review. The vault folder is the thing they share.

There are three routes. Take the first unless you have a reason not to.

| | Route | Use it when |
| --- | --- | --- |
| **A** | `./scripts/install.sh` | Normal case. Clones, installs the preset, registers the pane. |
| **B** | Import a `.dshpreset` | You already have a vault and only want the teacher. |
| **C** | By hand | You want to know exactly what landed where, or you are on Windows. |

---

## Before you start

- **Obsidian**, 1.5 or later. Free, and this vault works on desktop and mobile.
- **DeepSeek Harness**, with a model route configured. The desktop build is the easiest route, because it manages the harness for you; the `dsh` command-line install works too.
- **Node.js 20 or later**, for the vault's three generator scripts. Nothing else needs it.
- **Python 3.10 or later**, only if you want the command-line publisher. The Obsidian plugin does not need it.

You do **not** need an API key for anything in this repository, and nothing here downloads a model or a font.

---

## Route A — the installer

```sh
git clone https://github.com/tommyhedgerow/Mimir.git
cd Mimir
./scripts/install.sh
```

That is the whole thing. What it does, in order:

1. **Finds your DSH home.** `$DSH_HOME` if it is set, otherwise `~/Library/Application Support/dsh-desktop/harness` for DSH Desktop on macOS, otherwise `~/.dsh`.
2. **Copies `preset/` into `<dsh home>/.agent-presets/mimir-tutor/`.** If a preset is already there it is **moved aside, never deleted**, to a sibling folder stamped with the date. If you have edited the preset locally, your edits are in that backup.
3. **Installs the Lesson pane** with `dsh plugin --profile web add ./preset/lesson-pane`, which installs the package and appends it to `dsh.profile.bundles` in one step. The pane's browser half cannot travel inside the preset: a preset row loads a host half perfectly and produces no browser bundle at all, so it would silently do nothing in the interface.

Useful flags:

```sh
./scripts/install.sh --dry-run     # say what would happen, write nothing
./scripts/install.sh --no-pane     # preset only, skip the Lesson pane
./scripts/install.sh --help
```

Then:

1. **Restart DSH Desktop.** This is not superstition. A preset is composed once per process: the persona, the tool set and the specialist sub-agents are fixed for the life of the running app. Changing `agent.cordis.yml` and not restarting is the single most common reason a change appears to do nothing.
2. **Open the `Mimir` folder as the workspace** in DSH, and pick **Mimir Tutor** in the session picker.
3. **Open the same folder as a vault in Obsidian** (Open folder as vault, and pick the `Mimir` directory).
4. **Say what you want to learn.**

To undo: `./scripts/uninstall.sh`.

### If the pane step fails

The preset still works; you only lose the docked pane. Retry by hand:

```sh
dsh plugin --profile web add "/path/to/Mimir/preset/lesson-pane"
```

That needs `pnpm` on your `PATH`. If `dsh` itself is missing, install the harness CLI first. The installer prints the exact command with your path filled in.

---

## Route B — import a `.dshpreset`

A `.dshpreset` is a zip holding the preset and its skills. It is the portable form, and the right one to send to somebody.

Build one from this repository:

```sh
./scripts/pack-preset.sh
# writes dist/mimir-tutor.dshpreset
```

Then, in DSH Desktop:

1. **Settings → Agent presets → Import.**
2. Choose the file, confirm the id it offers (`mimir-tutor`), and install.

This route installs the preset only. **The Lesson pane is not inside it and will not appear.** If you want the pane, run the `dsh plugin` line from Route A as well.

---

## Route C — by hand

The preset is a directory of plain files. Copying it is a legitimate installation.

```sh
# 1. the preset
mkdir -p "$DSH_HOME/.agent-presets/mimir-tutor"
cp -R preset/. "$DSH_HOME/.agent-presets/mimir-tutor/"

# 2. the Lesson pane (optional)
dsh plugin --profile web add "$PWD/preset/lesson-pane"
```

On Windows the harness home is `%USERPROFILE%\.dsh` unless `DSH_HOME` says otherwise. Use PowerShell's `Copy-Item -Recurse -Force preset\* "$env:DSH_HOME\.agent-presets\mimir-tutor\"`.

Nothing in the preset is registered, compiled or cached. It is read from that directory at session start.

---

## Where everything lives

| What | Where | Put there by |
| --- | --- | --- |
| The preset | `<dsh home>/.agent-presets/mimir-tutor/` | the installer, or you |
| The Lesson pane package | `<dsh home>/profiles/web/node_modules/dsh-mimir-lesson-pane` | `dsh plugin add` |
| Its bundle entry | `dsh.profile.bundles` in `<dsh home>/profiles/web/package.json` | `dsh plugin add` |
| Its composition row | `<dsh home>/profiles/web/cordis.patch.yml` | the package's own `cordis.patch.yml` |
| The vault | wherever you cloned this | you |
| Your own notes | `Learn/` inside the vault | the teacher, as you go |

Two copies of the pane's host half exist on purpose, one beside the preset and one inside the installed package. They claim their routes through a process-level, reference-counted registry, so the double mount shares one set of routes rather than fighting over the paths. That is what lets a preset be remounted in a live process without a route its own predecessor still holds failing the mount.

---

## Editing it afterwards

The whole point of this arrangement is that you can change it.

| Edit | Takes effect |
| --- | --- |
| Anything in `preset/skills/` | At the next load. Skill files are re-read every time, so a corrected skill is in force at the next step, no restart. |
| `preset/agent.cordis.yml` | After a DSH restart. Persona, tools and specialists are fixed when the process composes. |
| `preset/preset.yml` | The name and description in the session picker. Restart to see it. |
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

---

## The vault's scripts

```sh
node Tools/vault-map.mjs        # validates the spines in the maps and session notes
node Tools/vault-chart.mjs      # redraws every SVG in Learn/Viz from those spines
node Tools/check-tokens.mjs     # fails if the theme and the charts disagree on the palette
```

`vault-chart.mjs` measures label widths with the system text engine rather than counting characters, and refuses to write a drawing whose text does not fit its boxes. Run it after editing a `graph:` block.

The command-line twin of Lesson Publisher:

```sh
Tools/publish-to-library.sh --target "/path/to/Library" "Learn/Sessions/2026-02-14 Kant.md"
Tools/publish-to-library.sh --dry-run "Learn/Concepts/Deep time.md"
```

---

## Troubleshooting

**The session picker does not show Mimir Tutor.**
You have not restarted DSH. A preset is composed once per process.

**The preset is there but the Lesson pane tab is not.**
The pane is a profile bundle, not part of the preset. Run the `dsh plugin` line above, then reload the page.

**`dsh: command not found`.**
The harness CLI is not on your `PATH`. Install the harness, or point the installer at its home with `DSH_HOME=... ./scripts/install.sh`.

**The teacher asserts something you doubt.**
Ask it to verify. It has a verifier role whose whole job is checking claims against sources, and it is expected to say plainly when a check corrects it. If it will not, that is a bug worth reporting.

**A generated diagram is missing or stale.**
Run `node Tools/vault-chart.mjs` from the vault root.
