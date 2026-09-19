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
# WHAT IS IN THE PACKAGE, AND WHAT IS DELIBERATELY NOT. A `.dshpreset` carries the
# TEACHER: the persona, the nine method skills and the tool rows. It does not carry
# the lesson board, and it cannot — the board is two halves, and only one of them can
# live in a preset. Its browser half reaches the page through the DSH profile, which a
# preset archive has no way to write to. Shipping the host half alone would make the
# tool register and draw nothing, which is worse than its absence because it looks
# like it worked.
#
# So the board comes from the clone, with
#
#   ./scripts/install.sh
#
# or by hand, from a checkout:
#
#   dsh plugin --profile web add "<repo>/preset/mimir-skin"
#
# An imported preset teaches without it; what is missing is the spine, the question
# card in the transcript, and the vault's drawings.
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
# ── which preset ─────────────────────────────────────────────────────────────
#
# The package is built with a re-exec driver rather than a loop inside one shell.
# A run needs its own staging directory, its own EXIT trap and its own exit code,
# and the body below is written for exactly one preset; re-entering it is safer
# than threading two sets of state through it. `--preset` picks one, and with no
# argument both are built or checked, in this order.
PRESET_ID="${MIMIR_PACK_ONE:-}"
case "$PRESET_ID" in
  mimir-tutor)
    PRESET_SRC="$HERE/preset"
    ID="mimir-tutor"
    NAME="Mimir Tutor"
    DESCRIPTION="A Socratic tutor for an Obsidian learning vault: nine method skills, six specialist sub-agents, a concept graph and a spaced review queue."
    ;;
  mimir-tutor-zh)
    PRESET_SRC="$HERE/preset-zh"
    ID="mimir-tutor-zh"
    NAME="Mimir 导师"
    DESCRIPTION="面向 Obsidian 学习库的苏格拉底式导师：九项方法技能、六个专家子代理、概念图谱与间隔复习队列。"
    ;;
  '')
    ;;
  *) echo "pack-preset: unknown preset '$PRESET_ID'" >&2; exit 2 ;;
esac

if [ -n "$PRESET_ID" ]; then
  OUT="$HERE/dist/$ID.dshpreset"
else
  OUT=""
fi

CHECK=0
PRESET_ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --out) OUT="$2"; shift 2 ;;
    --preset) PRESET_ONLY="$2"; shift 2 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "pack-preset: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
done

# ── the driver ───────────────────────────────────────────────────────────────
if [ -z "$PRESET_ID" ]; then
  if [ -n "$PRESET_ONLY" ]; then
    MIMIR_PACK_ONE="$PRESET_ONLY" exec "$0" $( [ "$CHECK" -eq 1 ] && printf -- '--check' )
  fi
  status=0
  for one in mimir-tutor mimir-tutor-zh; do
    printf '\n═══ %s ═══\n' "$one"
    if [ "$CHECK" -eq 1 ]; then
      MIMIR_PACK_ONE="$one" "$0" --check || status=1
    else
      MIMIR_PACK_ONE="$one" "$0" || status=1
    fi
  done
  exit "$status"
fi

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

# THE BOARD'S SOURCE IS NOT PART OF THE PACKAGE, and shipping it was a mistake worth
# naming. `preset/mimir-skin/` is a DSH plugin that happens to live inside the preset
# directory, so a plain copy of `preset/` sweeps it in — 250 kB of source and a built
# bundle for something this archive can never install: a `.dshpreset` carries no way
# to touch the DSH profile, and a preset row would mount the host half and draw
# nothing, which is worse than its absence because it looks like it worked. The board
# travels through `dsh plugin add` and the release tarball, both of which carry the
# package properly.
#
# It is also the thing a careful reader would ask about: forty kilobytes of JavaScript
# inside a preset whose listing says it holds nine skills.
rm -rf "$STAGE/preset/mimir-skin"

# The preset is the whole of what travels: persona, skills, tool rows.

# ── the things that differ between BSD and GNU userland ──────────────────────
#
# This script runs on a contributor's Mac and on a Linux CI runner, and these
# tools spell the same operation differently. Two earlier attempts at this were
# both wrong in ways worth recording, because both failed *quietly*:
#
#   1. Trying `stat -f %m` and falling back on failure. GNU `stat -f` means
#      `--file-system`, so it succeeds and prints the mount point. A silent
#      wrong answer is not a fallback.
#   2. Writing the GNU form as an array of words, `(date -u -d @)`, and
#      appending the epoch. That expands to `date -u -d @ 1789677412`, and GNU
#      date wants the `@` attached to the value, so the call failed on every
#      run and every package built on Linux was stamped 1970-01-01.
#
# So: the platform is detected once, and each branch is written out in full
# where it is used rather than assembled from pieces that can drift apart.
case "$(uname -s)" in
  Darwin|*BSD) MIMIR_STAT_STYLE=bsd ;;
  *)           MIMIR_STAT_STYLE=gnu ;;
esac

# Newest modification time under a directory, as epoch seconds.
newest_mtime() {
  local newest=0 file stamp
  while IFS= read -r file; do
    if [ "$MIMIR_STAT_STYLE" = bsd ]; then
      stamp="$(stat -f %m "$file" 2>/dev/null || echo 0)"
    else
      stamp="$(stat -c %Y "$file" 2>/dev/null || echo 0)"
    fi
    if [ "$stamp" -gt "$newest" ] 2>/dev/null; then newest="$stamp"; fi
  done < <(find "$1" -type f)
  printf '%s' "$newest"
}

# An epoch, as an ISO-8601 instant and as the CCYYMMDDhhmm.ss that `touch -t`
# wants. `touch -t` reads UTC, so both go through UTC.
iso_from_epoch() {
  if [ "$MIMIR_STAT_STYLE" = bsd ]; then
    date -u -r "$1" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || printf '1970-01-01T00:00:00.000Z'
  else
    date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || printf '1970-01-01T00:00:00.000Z'
  fi
}

epoch_as_touch() {
  if [ "$MIMIR_STAT_STYLE" = bsd ]; then
    TZ=UTC date -u -r "$1" +%Y%m%d%H%M.%S 2>/dev/null || printf '197001010000.00'
  else
    TZ=UTC date -u -d "@$1" +%Y%m%d%H%M.%S 2>/dev/null || printf '197001010000.00'
  fi
}

# `exportedAt` would otherwise make every run produce a different file, which
# makes "has anything changed?" unanswerable and breaks the byte-comparison the
# Checks workflow runs. SOURCE_DATE_EPOCH is the standard override for exactly
# this.
#
# Failing that, the commit is the stamp: it is stable across runs, it is
# meaningful in a bug report, and it does not move when a build script rewrites a
# generated file. The newest mtime is the last resort, for a tree that is not a
# git checkout — and it is a poor last resort, because a rewritten generated file
# moves it, so two builds of an unchanged preset would disagree.
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

This is the teacher on its own. The lesson board — the spine, the question card in
the conversation and the vault's drawings — is a DSH profile plugin and is not in
this package. To add it, from a clone of the repository:

  ./scripts/install.sh
EOF
