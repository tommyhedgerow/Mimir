#!/usr/bin/env bash
#
# Install the Mimir Tutor preset into DeepSeek Harness.
#
#   ./scripts/install.sh              install, or update an existing install
#   ./scripts/install.sh --dry-run    say what would happen, change nothing
#   ./scripts/install.sh --no-pane    install the preset only, skip the Lesson pane
#   ./scripts/install.sh --lang zh-CN install the Simplified Chinese preset
#
# What this does, and why each part is needed:
#
#   1. Copies `preset/` to <dsh home>/.agent-presets/mimir-tutor, which is the
#      user preset root DSH reads. Anything already there is moved aside, never
#      deleted — if you have locally edited the preset, the backup is where your
#      edit still is.
#
#   2. Installs the Lesson pane's browser half. It cannot travel inside the
#      preset: a preset row loads a *host* half perfectly and produces no browser
#      bundle at all, so the pane would silently do nothing in the interface.
#      The browser half has to be a profile bundle, and `dsh plugin add` is the
#      supported way to make one — it installs the package and appends it to
#      `dsh.profile.bundles` in one step.
#
# The preset is a directory of plain files. You can read all of it, and edit any
# of it, after installing.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${MIMIR_PROFILE:-web}"

DRY_RUN=0
WITH_PANE=1
LANG_CHOICE="en"

# A `while` over `$#`, not a `for` over `"$@"`: `--lang` takes a value, and a
# `for` loop iterates a list fixed when it starts, so `shift` inside it would
# leave the value to be visited again as a stray positional argument.
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --no-pane) WITH_PANE=0; shift ;;
    --lang) LANG_CHOICE="${2:-}"; shift 2 ;;
    --lang=*) LANG_CHOICE="${1#--lang=}"; shift ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
done

# Two presets ship: the same teacher, in English and in Simplified Chinese. They
# are separate presets rather than one, because the language of instruction is a
# property of the persona, and a session cannot be half in each.
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

# The Lesson pane travels with whichever preset is installed, and only one copy of
# it is ever authored. `preset/lesson-pane` is the copy; the Chinese preset stages
# it in rather than keeping a second one, because two committed copies of a
# generated bundle is exactly the shape that drifts.
if [ ! -d "$PRESET_DEST/lesson-pane" ]; then
  if [ -d "$HERE/preset/lesson-pane" ]; then
    say "   staging the Lesson pane in from preset/lesson-pane"
    run cp -R "$HERE/preset/lesson-pane" "$PRESET_DEST/lesson-pane"
  else
    echo "install: no preset/lesson-pane to stage in — the pane will not mount." >&2
  fi
fi

if [ "$DRY_RUN" -eq 0 ]; then
  COUNT="$(find "$PRESET_DEST/skills" -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
  say "   installed: $COUNT skills, $(basename "$PRESET_DEST/agent.cordis.yml"), the Lesson pane host half"
fi

# ── 2. the Lesson pane's browser half ────────────────────────────────────────

say ""
say "2. Lesson pane"
if [ "$WITH_PANE" -eq 0 ]; then
  say "   skipped (--no-pane)"
else
  if ! command -v dsh >/dev/null 2>&1; then
    cat >&2 <<'EOF'
   skipped: the `dsh` command is not on your PATH.

   The preset is installed and will work without this. You lose only the docked
   Lesson pane — the quiz, the drawings and the scratch pad in the right-hand
   column. The lesson itself reads normally in the vault.

   To add it later, install the dsh CLI and run:

     dsh plugin --profile web add "<repo>/preset/lesson-pane"
EOF
  else
    say "   dsh plugin --profile $PROFILE add $PRESET_SRC/lesson-pane"
    if [ "$DRY_RUN" -eq 0 ]; then
      if DSH_HOME="$DSH_HOME_RESOLVED" dsh plugin --profile "$PROFILE" add "$PRESET_SRC/lesson-pane"; then
        say "   installed and registered as a profile bundle"
      else
        cat >&2 <<EOF
   failed. The preset still works; only the docked pane is missing.
   Retry by hand with:

     dsh plugin --profile $PROFILE add "$PRESET_SRC/lesson-pane"
EOF
      fi
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
  1. Restart DSH Desktop. A preset is composed once per process, so the new one
     is not visible until the app comes back up.
  2. Open this folder as the workspace, and pick "Mimir Tutor" in the session
     picker.
  3. Open the same folder as a vault in Obsidian, and say what you want to learn.

Editing it afterwards:
  skills/         re-read on every load — edit and it takes effect at the next step
  agent.cordis.yml  needs a DSH restart, for the reason above
  preset.yml      the name and description the session picker shows

To undo: ./scripts/uninstall.sh
EOF
