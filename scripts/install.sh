#!/usr/bin/env bash
#
# Install the Mimir Tutor preset into DeepSeek Harness.
#
#   ./scripts/install.sh              install, or update an existing install
#   ./scripts/install.sh --dry-run    say what would happen, change nothing
#   ./scripts/install.sh --lang zh-CN install the Simplified Chinese preset
#   ./scripts/install.sh --no-board   install the preset only, skip the lesson board
#
# What this does, and why each part is needed:
#
#   1. Copies `preset/` to <dsh home>/.agent-presets/mimir-tutor, which is the user preset
#      root DSH reads. Anything already there is moved aside, never deleted — if you have
#      locally edited the preset, the backup is where your edit still is.
#
#   2. Installs the board. There is no way around this step: a preset row can mount the
#      board's host half and produces NO browser bundle at all, so the spine, the question
#      and the drawings would never reach the page. Both halves ship in one package,
#      `preset/mimir-skin`, and `dsh plugin add` is the supported way to install it — it
#      copies the package into the profile, appends it to `dsh.profile.bundles`, and the
#      package's own `cordis.patch.yml` is the row that mounts it.
#
#      If `dsh` is missing, the preset still installs and the teacher still teaches; what
#      is lost is the board — the lesson spine, the question card in the transcript, and
#      the vault's drawings. The script says so rather than failing.
#
# The preset is a directory of plain files. You can read all of it, and edit any of it,
# after installing.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${MIMIR_PROFILE:-web}"

DRY_RUN=0
WITH_BOARD=1
LANG_CHOICE="en"

# A `while` over `$#`, not a `for` over `"$@"`: `--lang` takes a value, and a `for` loop
# iterates a list fixed when it starts, so `shift` inside it would leave the value to be
# visited again as a stray positional argument.
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --no-board|--no-pane) WITH_BOARD=0; shift ;;
    --lang) LANG_CHOICE="${2:-}"; shift 2 ;;
    --lang=*) LANG_CHOICE="${1#--lang=}"; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
done

# Two presets ship: the same teacher, in English and in Simplified Chinese. They are
# separate presets rather than one, because the language of instruction is a property of
# the persona, and a session cannot be half in each.
case "$LANG_CHOICE" in
  en|english)     PRESET_SRC="$HERE/preset";    PRESET_ID="mimir-tutor";    PRESET_LABEL="English" ;;
  zh|zh-CN|zh-Hans|chinese)
                  PRESET_SRC="$HERE/preset-zh"; PRESET_ID="mimir-tutor-zh"; PRESET_LABEL="简体中文" ;;
  *) echo "install: unknown language '$LANG_CHOICE' (use --lang en or --lang zh-CN)" >&2; exit 2 ;;
esac

say() { printf '%s\n' "$*"; }
run() { if [ "$DRY_RUN" -eq 1 ]; then say "  would run: $*"; else "$@"; fi }

# ── where DSH lives ──────────────────────────────────────────────────────────

if [ -n "${DSH_HOME:-}" ]; then
  DSH_HOME_RESOLVED="$DSH_HOME"
elif [ -d "$HOME/Library/Application Support/dsh-desktop/harness" ]; then
  DSH_HOME_RESOLVED="$HOME/Library/Application Support/dsh-desktop/harness"
elif [ -d "$HOME/.dsh" ]; then
  DSH_HOME_RESOLVED="$HOME/.dsh"
else
  cat >&2 <<'EOF'
install: cannot find your DSH home directory.

Looked in:
  $DSH_HOME                                        (unset)
  ~/Library/Application Support/dsh-desktop/harness (DSH Desktop, macOS)
  ~/.dsh                                           (command-line dsh)

If DSH is installed somewhere else, set DSH_HOME and run this again:

  DSH_HOME=/path/to/harness ./scripts/install.sh
EOF
  exit 1
fi

if [ ! -d "$PRESET_SRC" ] || [ ! -f "$PRESET_SRC/agent.cordis.yml" ]; then
  echo "install: $PRESET_SRC does not look like the Mimir preset — is this a full clone?" >&2
  exit 1
fi

PRESET_DEST="$DSH_HOME_RESOLVED/.agent-presets/$PRESET_ID"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

say "Mimir Tutor installer"
say "  repo        $HERE"
say "  dsh home    $DSH_HOME_RESOLVED"
say "  preset      $PRESET_DEST"
say "  language    $PRESET_LABEL"
say "  profile     $PROFILE"
[ "$DRY_RUN" -eq 1 ] && say "  (dry run — nothing will be written)"
say ""

# ── 1. the preset ────────────────────────────────────────────────────────────

say "1. preset"
if [ -d "$PRESET_DEST" ]; then
  BACKUP="$DSH_HOME_RESOLVED/.agent-presets/$PRESET_ID.replaced-$STAMP"
  say "   a preset is already installed; moving it to"
  say "     $BACKUP"
  run mv "$PRESET_DEST" "$BACKUP"
fi
run mkdir -p "$PRESET_DEST"
# `/.` copies the contents; the destination itself is created above so that a
# pre-existing empty directory is filled rather than nested inside.
run cp -R "$PRESET_SRC/." "$PRESET_DEST/"

if [ "$DRY_RUN" -eq 0 ]; then
  COUNT="$(find "$PRESET_DEST/skills" -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
  say "   installed: $COUNT skills and $(basename "$PRESET_DEST/agent.cordis.yml")"
fi

# ── 2. the board ─────────────────────────────────────────────────────────────

say ""
say "2. lesson board"
BOARD_SRC="$HERE/preset/mimir-skin"
BOARD_PACKAGE="dsh-mimir-skin"

if [ "$WITH_BOARD" -eq 0 ]; then
  say "   skipped (--no-board)"
elif [ ! -d "$BOARD_SRC" ]; then
  echo "install: no preset/mimir-skin in this clone — the board will not mount." >&2
elif ! command -v dsh >/dev/null 2>&1; then
  cat >&2 <<EOF
   skipped: the \`dsh\` command is not on your PATH.

   The preset is installed and the teacher will work without this. What you lose is the
   board: the lesson spine, the question card in the conversation, and the vault's own
   drawings. The lesson still reads and the questions are still answered — just in the
   plain conversation rather than on the board.

   To add it later, install the harness CLI and run:

     dsh plugin --profile $PROFILE add "$BOARD_SRC"
EOF
else
  say "   dsh plugin --profile $PROFILE add $BOARD_SRC"
  if [ "$DRY_RUN" -eq 0 ]; then
    if DSH_HOME="$DSH_HOME_RESOLVED" dsh plugin --profile "$PROFILE" add "$BOARD_SRC"; then
      # `dsh plugin add` records a `link:` dependency, so the profile ends up with a
      # SYMLINK to this checkout. The package is then found, but DSH composes it by
      # importing it, and Node resolves a symlinked module's own imports from its real
      # path — where there is no `node_modules`. Replacing the symlink with a real copy
      # puts the package where both the resolver and the loader expect it.
      INSTALLED="$DSH_HOME_RESOLVED/profiles/$PROFILE/node_modules/$BOARD_PACKAGE"
      if [ -L "$INSTALLED" ]; then
        say "   materialising the package (replacing the symlink with a copy)"
        run rm -f "$INSTALLED"
        run mkdir -p "$INSTALLED"
        run cp -R "$BOARD_SRC/." "$INSTALLED/"
      fi
      say "   installed: the board's tool and its browser half, as one package"
    else
      cat >&2 <<EOF
   failed. The preset is installed and the teacher will work; the board is what is missing.
   Retry by hand with:

     dsh plugin --profile $PROFILE add "$BOARD_SRC"
     cp -R "$BOARD_SRC/." "$DSH_HOME/profiles/$PROFILE/node_modules/$BOARD_PACKAGE/"
EOF
    fi
  fi
fi

# ── 3. what next ─────────────────────────────────────────────────────────────

say ""
if [ "$DRY_RUN" -eq 1 ]; then
  say "Dry run finished. Nothing was written."
  exit 0
fi

cat <<EOF
Installed.

Next:
  1. Restart DSH. A preset is composed once per process, so the new one is not visible
     until the app comes back up. (The board's own row is composed at the same time.)
  2. Open this folder as the workspace, and pick "Mimir Tutor" in the session picker.
  3. Open the same folder as a vault in Obsidian, and say what you want to learn.

Serving it in a browser rather than the desktop app:

  ./scripts/serve.sh

  Use that rather than a bare `dsh web`. The harness resolves a profile plugin by package
  name through Node's internal loader, which needs `--expose-internals`; DSH Desktop passes
  it, the command-line `dsh` does not, and without it the plugin tree fails to load and the
  server never starts. serve.sh is `dsh web` with that flag in front.

Editing it afterwards:
  skills/           re-read on every load — edit and it takes effect at the next step
  agent.cordis.yml  needs a DSH restart, for the reason above
  preset.yml        the name and description the session picker shows

To undo: ./scripts/uninstall.sh
EOF
