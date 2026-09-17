#!/usr/bin/env bash
#
# Undo ./scripts/install.sh.
#
#   ./scripts/uninstall.sh              remove the preset and the Lesson pane
#   ./scripts/uninstall.sh --dry-run    say what would happen, change nothing
#   ./scripts/uninstall.sh --keep-pane  remove the preset, leave the pane alone
#
# Nothing is deleted outright. The preset is moved to a `.removed-<date>` sibling
# so that any edits you made to it are still there afterwards. Your vault is not
# touched at all: this script only knows about the DSH side.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRESET_ID="mimir-tutor"
PROFILE="${MIMIR_PROFILE:-web}"

DRY_RUN=0
KEEP_PANE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --keep-pane) KEEP_PANE=1 ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "uninstall: unknown option '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
run() { if [ "$DRY_RUN" -eq 1 ]; then say "  would run: $*"; else "$@"; fi }

if [ -n "${DSH_HOME:-}" ]; then
  DSH_HOME_RESOLVED="$DSH_HOME"
elif [ -d "$HOME/Library/Application Support/dsh-desktop/harness" ]; then
  DSH_HOME_RESOLVED="$HOME/Library/Application Support/dsh-desktop/harness"
elif [ -d "$HOME/.dsh" ]; then
  DSH_HOME_RESOLVED="$HOME/.dsh"
else
  echo "uninstall: cannot find your DSH home. Set DSH_HOME and try again." >&2
  exit 1
fi

PRESET_DEST="$DSH_HOME_RESOLVED/.agent-presets/$PRESET_ID"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

say "Removing Mimir Tutor from $DSH_HOME_RESOLVED"
[ "$DRY_RUN" -eq 1 ] && say "(dry run, nothing will be written)"
say ""

if [ -d "$PRESET_DEST" ]; then
  say "preset: moving $PRESET_DEST aside rather than deleting it"
  run mv "$PRESET_DEST" "$DSH_HOME_RESOLVED/.agent-presets/$PRESET_ID.removed-$STAMP"
else
  say "preset: not installed, nothing to do"
fi

if [ "$KEEP_PANE" -eq 1 ]; then
  say "Lesson pane: kept (--keep-pane)"
elif command -v dsh >/dev/null 2>&1; then
  say "Lesson pane: dsh plugin --profile $PROFILE remove dsh-mimir-lesson-pane"
  if [ "$DRY_RUN" -eq 0 ]; then
    DSH_HOME="$DSH_HOME_RESOLVED" dsh plugin --profile "$PROFILE" remove dsh-mimir-lesson-pane || \
      say "  could not remove it; it may not have been installed. Continuing."
  fi
else
  say "Lesson pane: dsh is not on your PATH, so it was left in place."
  say "  Remove it later with: dsh plugin --profile $PROFILE remove dsh-mimir-lesson-pane"
fi

say ""
say "The 'Mimir Tutor' entry disappears from the session picker after a DSH restart."
say "Your vault was not touched."
