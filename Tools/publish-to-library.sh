#!/usr/bin/env bash
# Publish a finished note from this vault into the library vault.
#
#   Tools/publish-to-library.sh "Learn/Sessions/2026-02-14 Kant.md"
#   Tools/publish-to-library.sh --with-links "Learn/Sessions/2026-02-14 Kant.md"
#   Tools/publish-to-library.sh --dry-run "Learn/Concepts/Deep time.md"
#
# Same rules as the Lesson Publisher plugin in Obsidian: the note's path under
# Learn/ is mirrored into <library>/Learn/, embedded diagrams come along, and
# the source note is stamped with where it went.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$here/Tools/publish_to_library.py" --vault "$here" "$@"
