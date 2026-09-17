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

# ── the two things that differ between BSD and GNU userland ──────────────────
#
# This script runs on a contributor's Mac and on a Linux CI runner, and both
# tools below spell the same operation differently. The earlier version tried
# `stat -f %m` and fell back on failure, which is worse than it looks on Linux:
# GNU `stat -f` means `--file-system`, so it *succeeds* and prints the mount
# point. A silent wrong answer is not a fallback. So the platform is detected
# once, explicitly, rather than guessed at per call.
case "$(uname -s)" in
  Darwin|*BSD) STAT_MTIME=(stat -f %m); EPOCH_AS_ISO=(date -u -r) ;;
  *)           STAT_MTIME=(stat -c %Y); EPOCH_AS_ISO=(date -u -d @) ;;
esac

# Newest modification time under a directory, as epoch seconds.
newest_mtime() {
  local newest=0 file stamp
  while IFS= read -r file; do
    stamp="$("${STAT_MTIME[@]}" "$file" 2>/dev/null || echo 0)"
    [ "$stamp" -gt "$newest" ] 2>/dev/null && newest="$stamp"
  done < <(find "$1" -type f)
  printf '%s' "$newest"
}

iso_from_epoch() {
  "${EPOCH_AS_ISO[@]}" "$1" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null \
    || printf '1970-01-01T00:00:00.000Z'
}

# `touch -t` wants CCYYMMDDhhmm.ss, and wants it in UTC. POSIX, so one form
# serves both platforms once the epoch-to-fields step is branched.
epoch_as_touch() {
  TZ=UTC "${EPOCH_AS_ISO[@]}" "$1" +%Y%m%d%H%M.%S 2>/dev/null \
    || printf '197001010000.00'
}

# `exportedAt` would otherwise make every run produce a different file, which
# makes "has anything changed?" unanswerable and breaks the byte-comparison the
# Checks workflow runs. SOURCE_DATE_EPOCH is the standard override for exactly
# this.
#
# Failing that, the commit is the stamp: it is stable across runs, it is
# meaningful in a bug report, and it does not move when this script rebuilds the
# Lesson pane's generated files. The newest mtime is the last resort, for a tree
# that is not a git checkout — and it is a poor last resort, because those
# generated files are rewritten on every run, so two builds of an unchanged
# preset would disagree.
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then
  EPOCH="$SOURCE_DATE_EPOCH"
elif EPOCH="$(git -C "$HERE" log -1 --format=%ct 2>/dev/null)" && [ -n "$EPOCH" ]; then
  :
else
  EPOCH="$(newest_mtime "$PRESET_SRC")"
fi
EXPORTED_AT="$(iso_from_epoch "$EPOCH")"

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

# Normalise every timestamp and permission in the staging tree.
#
# WHY THIS IS NOT COSMETIC. A zip records each entry's modification time and its
# Unix mode, and the staged files are copies of whatever the working tree last
# touched, made under whatever umask the machine happens to have. Two builds of
# an unchanged tree therefore produced two different archives, and `--check` —
# which rebuilds and compares SHA-256 — reported "stale" on a tree nothing had
# touched. A check that cries wolf is worse than no check: it teaches you to
# ignore the one time it is right. The modes also differed between a
# contributor's Mac and the Linux runner, so the same commit produced two
# artifacts and only one of them matched the release.
#
# Every entry is stamped with the instant the manifest declares, and made 644 —
# these are read-only data files, and nothing about them should depend on who
# built them. SOURCE_DATE_EPOCH remains the standard override for the instant.
STAMP="$(epoch_as_touch "$EPOCH")"
touch -t "$STAMP" "$STAGE/manifest.json"
chmod 644 "$STAGE/manifest.json"
while IFS= read -r file; do
  touch -t "$STAMP" "$file"
  chmod 644 "$file"
done < <(find "$STAGE/preset" -type f)

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
  # `mktemp -t NAME` is a BSD spelling: it wants a template, and GNU mktemp
  # rejects one without `XXXXXX` ("too few X's in template"). A temp directory
  # works the same on both, so the file is made inside one.
  CHECK_DIR="$(mktemp -d)"
  TARGET="$CHECK_DIR/mimir-tutor.dshpreset"
  trap 'rm -rf "$STAGE" "$CHECK_DIR"' EXIT
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
