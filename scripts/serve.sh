#!/usr/bin/env bash
#
# Serve Mimir's browser interface, with the one Node flag the harness needs.
#
#   ./scripts/serve.sh                 serve on the default host and port
#   ./scripts/serve.sh --port 8080     pass any `dsh web` flag straight through
#   DSH_HOME=... ./scripts/serve.sh    serve a harness installed somewhere else
#
# WHY THIS EXISTS. `dsh web` boots a profile whose rows name plugins by package — the
# board among them. The harness resolves those names through Node's INTERNAL module
# loader, and that loader is only reachable when the process is started with Node's
# `--expose-internals`. DSH Desktop passes it (its launcher has that flag hard-coded);
# the command-line `dsh` does not, and `NODE_OPTIONS` cannot supply it either, because
# Electron ignores Node environment variables in a process it is invoked by.
#
# Without the flag the failure is not a warning. The row is composed, the import throws
# `ERR_MODULE_NOT_FOUND: Cannot find package 'dsh-mimir-skin'`, and the whole plugin tree
# fails to load — so the server does not come up at all, and the message points at the
# harness' own loader rather than at the missing flag.
#
# So this script does the one thing that fixes it: it runs the same `dsh` you would have
# run, under Node, with the flag in front. Everything else is passed through untouched.

set -euo pipefail

if ! command -v dsh >/dev/null 2>&1; then
  cat >&2 <<'EOF'
serve: the `dsh` command is not on your PATH.

Install the harness CLI first, or run it by hand:

  node --expose-internals /path/to/dsh/lib/bin.js web "$@"
EOF
  exit 1
fi

DSH_BIN="$(command -v dsh)"
# Resolve the symlink: `dsh` on a PATH is usually a link into a package, and Node needs
# the real file rather than the link it would refuse to treat as an entry point.
if command -v readlink >/dev/null 2>&1; then
  RESOLVED="$(readlink -f "$DSH_BIN" 2>/dev/null || true)"
  [ -n "$RESOLVED" ] && DSH_BIN="$RESOLVED"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "serve: node is not on your PATH, and the harness needs it." >&2
  exit 1
fi

exec node --expose-internals "$DSH_BIN" web --no-open "$@"
