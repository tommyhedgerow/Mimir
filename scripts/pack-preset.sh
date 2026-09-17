#!/usr/bin/env bash
#
# Build dist/mimir-tutor.dshpreset from preset/.
#
# A `.dshpreset` is a zip holding a `manifest.json` at the root and the preset's
# files under a `preset/` prefix. It is the portable form of a preset: the thing
# to hand somebody, or to upload to a preset registry.
#
#   ./scripts/pack-preset.sh              write dist/mimir-tutor.dshpreset
#   ./scripts/pack-preset.sh --check      verify the existing file, write nothing
#   ./scripts/pack-preset.sh --out FILE   write somewhere else
#
# WHY THE LESSON PANE'S BUILT `lib/` IS INCLUDED. It makes the package
# self-contained: with it, the imported preset directory can install its own pane
# with
#
#   dsh plugin --profile web add "<dsh home>/.agent-presets/mimir-tutor/lesson-pane"
#
# and no clone of this repository is needed. Without it the preset still teaches,
# but the docked pane cannot be installed from the imported copy.
#
# The format was checked against DSH Desktop's own preset transfer, which is
# where `.dshpreset` comes from: `format` and `version` are compared exactly on
# import, `id` must match ^[a-z0-9][a-z0-9-]*$, and the archive must contain
# `agent.cordis.yml` or the import is refused with "Package is missing required
# composition file". The caps are 16 MB compressed, 32 MB uncompressed, 12 MB per
# file, 512 files.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRESET_SRC="$HERE/preset"
ID="mimir-tutor"
NAME="Mimir Tutor"
DESCRIPTION="A Socratic tutor for an Obsidian learning vault: nine method skills, six specialist sub-agents, a concept graph and a spaced review queue."
OUT="$HERE/dist/$ID.dshpreset"

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "pack-preset: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
done
CHECK="${CHECK:-0}"

if [ ! -f "$PRESET_SRC/agent.cordis.yml" ]; then
  echo "pack-preset: no agent.cordis.yml in $PRESET_SRC — is this a full clone?" >&2
  exit 1
fi

# The DSH build this package was tested against. It is recorded rather than
# discovered, because `dsh --version` is not available everywhere this script
# might run, and a wrong value here is worse than an honest stamp.
SOURCE_DSH_VERSION="${MIMIR_SOURCE_DSH_VERSION:-0.1.2-rc.1}"

# Build in a staging directory so the zip's internal paths are deterministic and
# never pick up a stray file from the working tree.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/preset"
# `/.` copies the contents, including dotfiles, without nesting a directory.
cp -R "$PRESET_SRC/." "$STAGE/preset/"

# The lesson pane's built halves are generated, not authored. Rebuild them if the
# build script is present and runnable, so the package can never carry a stale
# bundle; if it is not, carry on with what is committed and say so.
if command -v node >/dev/null 2>&1 && [ -f "$HERE/Tools/build-lesson-pane.mjs" ]; then
  if node "$HERE/Tools/build-lesson-pane.mjs" >/dev/null 2>&1; then
    cp -R "$PRESET_SRC/lesson-pane/." "$STAGE/preset/lesson-pane/"
  else
    echo "pack-preset: could not rebuild the Lesson pane; packaging what is committed." >&2
  fi
fi

# `exportedAt` would otherwise make every run produce a different file, which
# makes "has anything changed?" unanswerable and breaks a byte-comparison in CI.
# SOURCE_DATE_EPOCH is the standard override for exactly this; without it the
# stamp is the source tree's last modification, which is reproducible enough.
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then
  EXPORTED_AT="$(date -u -r "$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
    || date -u -d "@$SOURCE_DATE_EPOCH" +%Y-%m-%dT%H:%M:%S.000Z)"
else
  EXPORTED_AT="$(date -u -r "$(find "$PRESET_SRC" -type f -print0 | xargs -0 stat -f '%m' 2>/dev/null | sort -n | tail -1)" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
    || date -u +%Y-%m-%dT%H:%M:%S.000Z)"
fi

cat > "$STAGE/manifest.json" <<JSON
{
  "format": "dsh-preset",
  "version": 1,
  "id": "$ID",
  "name": "$NAME",
  "description": "$DESCRIPTION",
  "sourceDshVersion": "$SOURCE_DSH_VERSION",
  "exportedAt": "$EXPORTED_AT"
}
JSON

# ── verify the staged tree against the format's own rules ────────────────────

problems=0
fail() { echo "pack-preset: $*" >&2; problems=$((problems + 1)); }

[ -f "$STAGE/preset/agent.cordis.yml" ] || fail "agent.cordis.yml is missing; DSH will refuse the import"
[ -f "$STAGE/preset/skills/mimir-teaching/SKILL.md" ] || fail "the mimir-teaching skill is missing"

FILE_COUNT="$(find "$STAGE" -type f | wc -l | tr -d ' ')"
[ "$FILE_COUNT" -le 512 ] || fail "$FILE_COUNT files, over the 512 the importer accepts"

# `wc -c` rather than `stat`: the size flag differs between BSD and GNU, and
# guessing wrong here would silently pass every file.
BIGGEST=0
while IFS= read -r file; do
  bytes="$(wc -c < "$file" | tr -d ' ')"
  [ "$bytes" -gt "$BIGGEST" ] && BIGGEST="$bytes"
done < <(find "$STAGE" -type f)
[ "$BIGGEST" -le 12582912 ] || fail "a file is over the 12 MB per-file cap ($BIGGEST bytes)"

case "$ID" in
  [a-z0-9]*) ;;
  *) fail "id '$ID' must start with a lowercase letter or digit" ;;
esac
case "$ID" in
  *[!a-z0-9-]*) fail "id '$ID' may only contain lowercase letters, digits and hyphens" ;;
esac

[ "$problems" -eq 0 ] || { echo "pack-preset: refusing to write a package that would not import." >&2; exit 1; }

# ── write ────────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$OUT")"

# `--check` compares against what would be built rather than rebuilding in place,
# because a check that overwrites the thing it is checking is not a check.
TARGET="$OUT"
if [ "$CHECK" -eq 1 ]; then
  TARGET="$(mktemp -t mimir-preset).dshpreset"
  trap 'rm -rf "$STAGE" "$TARGET"' EXIT
fi

build_zip() {
  rm -f "$TARGET"
  # -X strips extra file attributes, and the sorted file list keeps the archive
  # byte-identical between runs on the same tree.
  ( cd "$STAGE" && find . -type f | LC_ALL=C sort | sed 's|^\./||' | zip -q -X "$TARGET" -@ )
}

build_zip

SIZE="$(wc -c < "$TARGET" | tr -d ' ')"
[ "$SIZE" -le 16777216 ] || { echo "pack-preset: the package is over the 16 MB compressed cap" >&2; exit 1; }

digest_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else echo "(no sha256 tool found)"
  fi
}

if [ "$CHECK" -eq 1 ]; then
  if [ ! -f "$OUT" ]; then
    echo "pack-preset: $OUT does not exist — run ./scripts/pack-preset.sh" >&2
    exit 1
  fi
  if [ "$(digest_of "$OUT")" != "$(digest_of "$TARGET")" ]; then
    echo "pack-preset: $OUT is stale — the preset has changed since it was built." >&2
    echo "pack-preset: rebuild with ./scripts/pack-preset.sh" >&2
    exit 1
  fi
  echo "pack-preset: $OUT is current and valid — $FILE_COUNT files, $SIZE bytes"
  exit 0
fi

DIGEST="$(digest_of "$OUT")"

# A sibling checksum file, so a download can be verified without trust.
printf '%s  %s\n' "$DIGEST" "$(basename "$OUT")" > "$OUT.sha256"

cat <<EOF
pack-preset: wrote $OUT
  id          $ID
  files       $FILE_COUNT
  size        $SIZE bytes
  sha256      $DIGEST

Install it with DSH Desktop: Settings → Agent presets → Import.
The Lesson pane is inside the package. To install it after importing:

  dsh plugin --profile web add "<dsh home>/.agent-presets/$ID/lesson-pane"
EOF
