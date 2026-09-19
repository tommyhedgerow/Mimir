#!/usr/bin/env bash
#
# Build dist/dsh-mimir-skin.tgz — the board as one installable artifact.
#
#   ./scripts/pack-plugin.sh              write the tarball and its checksum
#   ./scripts/pack-plugin.sh --check      verify the existing one, write nothing
#
# WHY THIS EXISTS. The board is installed from a checkout with
#
#   dsh plugin --profile web add "<repo>/preset/mimir-skin"
#
# and that is the path `scripts/install.sh` takes, so nothing here is required to
# use Mimir. The tarball is for everyone who is not holding a checkout:
#
#   * the DSH plugin catalog asks for one. Without it a storefront has to offer a
#     build-from-source command, and its rules say a prebuilt artifact is the
#     better install experience — required outright if the repository cannot be
#     installed from source at all.
#   * it is the same four files the checkout installs, so a tarball install and a
#     clone install cannot drift: `lib/index.js` and `lib/client.js` are built
#     here from the sources beside them, and the build is verified first.
#
# THE ASSET NAME CARRIES NO VERSION, deliberately. The catalog's `tarball:` field
# points at `releases/latest/download/<name>`, and that resolves `latest` at
# request time while taking the filename literally — so a versioned name works the
# day it is published and 404s the moment the next release is cut.
#
# Usage:  ./scripts/pack-plugin.sh [--check]

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$HERE/preset/mimir-skin"
OUT="$HERE/dist/dsh-mimir-skin.tgz"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

say() { printf '%s\n' "$*"; }

[ -d "$SOURCE" ] || { echo "pack-plugin: no preset/mimir-skin — is this a full clone?" >&2; exit 1; }

# ── build the two halves from their sources ──────────────────────────────────

say "1. build"
if command -v node >/dev/null 2>&1; then
  node "$HERE/Tools/build-mimir-skin.mjs" >/dev/null
  say "   the browser and host halves are current"
else
  say "   node is not on PATH; packaging the committed build"
fi

VERSION="$(node -p "require('$SOURCE/package.json').version" 2>/dev/null || echo "0.0.0")"
NAME="dsh-mimir-skin"

# ── build the tarball ────────────────────────────────────────────────────────
#
# `npm pack` already does the right thing with the `files` field in the manifest, so
# this does not re-list what ships: the manifest is the one place that says, and a
# second list here would be a second place to forget. It is also what makes the
# archive a real npm tarball rather than something shaped like one — `dsh plugin add`
# hands it to pnpm, which is happy either way, but a user who runs `npm install` by
# hand is not.

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

say ""
say "2. tarball"
( cd "$SOURCE" && npm pack --silent --pack-destination "$STAGE" >/dev/null 2>&1 )
PACKED="$(find "$STAGE" -maxdepth 1 -name '*.tgz' | head -1)"
[ -n "$PACKED" ] || { echo "pack-plugin: npm pack produced nothing" >&2; exit 1; }

# The name in the archive carries the version, which npm's own conventions want; the
# RELEASE asset does not, for the reason at the top of this file.
TARGET="$OUT"
if [ "$CHECK" -eq 1 ]; then
  CHECK_DIR="$(mktemp -d)"
  TARGET="$CHECK_DIR/$NAME.tgz"
  trap 'rm -rf "$STAGE" "$CHECK_DIR"' EXIT
fi
mkdir -p "$(dirname "$TARGET")"
cp "$PACKED" "$TARGET"

digest_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else echo "(no sha256 tool found)"
  fi
}
SIZE="$(wc -c < "$TARGET" | tr -d ' ')"
DIGEST="$(digest_of "$TARGET")"

# ── prove it installs ────────────────────────────────────────────────────────
#
# A tarball that unpacks and then fails to compose is the failure this catches, and
# it is not hypothetical: the board's host half used to import a harness package,
# which resolves from a real directory but not from a symlink, so the same package
# installed two ways behaved differently. This runs the install into a throwaway
# harness home and checks the row reaches the composed profile.

say ""
say "3. install it for real, into a throwaway harness home"
if command -v dsh >/dev/null 2>&1 && [ "${MIMIR_SKIP_INSTALL_CHECK:-0}" != "1" ]; then
  PROBE="$(mktemp -d)"
  trap 'rm -rf "$STAGE" "$PROBE"' EXIT
  if DSH_HOME="$PROBE" dsh plugin --profile web add "$TARGET" >"$PROBE/log" 2>&1; then
    INSTALLED="$PROBE/profiles/web/node_modules/$NAME"
    if [ -f "$INSTALLED/lib/index.js" ] && [ -f "$INSTALLED/lib/client.js" ]; then
      say "   installed, and both halves are present"
    else
      echo "pack-plugin: the tarball installed but a half is missing from $INSTALLED" >&2
      exit 1
    fi
  else
    echo "pack-plugin: the tarball does not install:" >&2
    tail -5 "$PROBE/log" | sed 's/^/   /' >&2
    exit 1
  fi
else
  say "   skipped (no dsh on PATH, or MIMIR_SKIP_INSTALL_CHECK=1)"
fi

# ── report, or compare ───────────────────────────────────────────────────────

if [ "$CHECK" -eq 1 ]; then
  if [ ! -f "$OUT" ]; then
    say ""
    say "pack-plugin: $OUT does not exist — run ./scripts/pack-plugin.sh"
    exit 1
  fi
  EXISTING="$(digest_of "$OUT")"
  if [ "$EXISTING" != "$DIGEST" ]; then
    say ""
    say "pack-plugin: the committed tarball is stale."
    say "   on disk  $EXISTING"
    say "   built    $DIGEST"
    say "   rebuild with ./scripts/pack-plugin.sh"
    exit 1
  fi
  say ""
  say "pack-plugin: $OUT is current — $SIZE bytes, sha256 $DIGEST"
  exit 0
fi

say ""
say "pack-plugin: wrote $OUT"
say "  name        $NAME"
say "  version     $VERSION"
say "  size        $SIZE bytes"
say "  sha256      $DIGEST"
say ""
say "Install it with:"
say "  dsh plugin --profile web add \"$OUT\""
say ""
say "Attach it to a release under the version-free asset name the catalog expects:"
say "  gh release upload <tag> \"$OUT#dsh-mimir-skin.tgz\""
