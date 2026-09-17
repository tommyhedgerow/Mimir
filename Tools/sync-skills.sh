#!/usr/bin/env bash
# Mirror the Mimir Tutor preset's skills into this vault's .dsh/skills.
#
# Why this exists: a DSH session rooted at this vault discovers skills from
# <vault>/.dsh/skills (project root, rank 100) as well as from the preset it
# composes. The preset is the teaching surface and already carries these skills,
# so you only need this if you want to chat with DSH *without* the preset — e.g.
# through the Obsidian DeepHarness plugin, which cannot select a preset.
#
# Caveat, and it is a real one: the project root outranks the preset's custom
# skill directory, so these copies shadow the preset's. Re-run this script after
# editing the skills in the preset, or delete .dsh/skills to go back to the
# preset's own copies.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dsh_home="${DSH_HOME:-$HOME/Library/Application Support/dsh-desktop/harness}"
preset="${MIMIR_PRESET_DIR:-$dsh_home/.agent-presets/mimir-tutor}"

if [ ! -d "$preset/skills" ]; then
  echo "error: no skills directory at $preset/skills" >&2
  echo "       set MIMIR_PRESET_DIR to the preset directory if it lives elsewhere" >&2
  exit 1
fi

destination="$here/.dsh/skills"
mkdir -p "$destination"

# Replace, never merge: a stale skill left behind would shadow the preset's.
find "$destination" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$preset/skills/." "$destination/"

count="$(find "$destination" -name SKILL.md | wc -l | tr -d ' ')"
echo "mirrored $count skill(s) from $preset/skills into $destination"
echo "note: these copies outrank the preset's own — re-run after editing the preset."
