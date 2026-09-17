#!/usr/bin/env python3
"""Publish a finished note from a learning vault into a library vault.

This is the command-line twin of the Lesson Publisher Obsidian plugin: same
rules, so a note published by the teacher from the terminal lands exactly where
a click in Obsidian would have put it.

  * Mirror rule — a file's path relative to the mirror root (default ``Learn``)
    is recreated inside the library, and every file the note embeds is copied to
    its own mirrored position, so Obsidian's by-name resolution still finds it.
  * Notes outside the mirror root land in the fallback folder; embedded assets
    that live outside it land in the asset fallback folder.
  * With ``--with-links``, notes wikilinked from the published note travel too,
    but only when their frontmatter ``status`` is one of the publishable ones.

Usage:
  Tools/publish_to_library.py "Learn/Sessions/2026-02-14 Kant.md"
  Tools/publish_to_library.py --with-links "Learn/Sessions/2026-02-14 Kant.md"
  Tools/publish_to_library.py --dry-run "Learn/Concepts/Deep time.md"

The vault defaults to this script's grandparent directory. The library vault is
whatever path Tools/publish-target.txt holds when that file exists; otherwise
--target is required, and the script says so rather than guessing.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import shutil
import sys
from pathlib import Path, PurePosixPath

DEFAULT_TARGET = ""  # read from Tools/publish-target.txt when --target is omitted
WIKI_EMBED = re.compile(r"!\[\[([^\]]+)\]\]")
MD_EMBED = re.compile(r"!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+\"[^\"]*\")?\s*\)")
WIKILINK = re.compile(r"(?<!!)\[\[([^\]]+)\]\]")
KNOWN_EXTENSIONS = {
    ".md", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf",
    ".canvas", ".excalidraw", ".mp3", ".m4a", ".wav", ".mp4", ".csv",
}


# ── helpers ──────────────────────────────────────────────────────────────────

def split_frontmatter(text: str):
    """Return (lines, bounds) where bounds is (start, end) of the block or None."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return lines, None
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return lines, (0, index)
    return lines, None


def frontmatter_value(text: str, key: str):
    lines, bounds = split_frontmatter(text)
    if bounds is None:
        return None
    pattern = re.compile(r"^" + re.escape(key) + r"\s*:\s*(.*)$")
    for index in range(bounds[0] + 1, bounds[1]):
        match = pattern.match(lines[index])
        if match:
            return match.group(1).strip().strip("\"'")
    return None


def stamp_frontmatter(text: str, fields: dict) -> str:
    """Set or replace frontmatter keys, creating the block when absent."""
    lines, bounds = split_frontmatter(text)
    if bounds is None:
        block = ["---"] + [f"{key}: {value}" for key, value in fields.items()] + ["---", ""]
        return "\n".join(block) + text
    start, end = bounds
    for key, value in fields.items():
        pattern = re.compile(r"^" + re.escape(key) + r"\s*:")
        found = None
        for index in range(start + 1, end):
            if pattern.match(lines[index]):
                found = index
                break
        line = f"{key}: {value}"
        if found is not None:
            lines[found] = line
        else:
            lines.insert(end, line)
            end += 1
    return "\n".join(lines)


def extract_embeds(markdown: str):
    """Return (asset_targets, note_targets), deduplicated in document order."""
    assets, notes, seen = [], [], set()

    for match in WIKI_EMBED.finditer(markdown):
        inner = match.group(1).split("|")[0].split("#")[0].strip()
        if not inner or inner.lower() in seen:
            continue
        seen.add(inner.lower())
        (assets if PurePosixPath(inner).suffix.lower() in KNOWN_EXTENSIONS else notes).append(inner)

    for match in MD_EMBED.finditer(markdown):
        raw = (match.group(1) or match.group(2) or "").strip()
        if not raw or re.match(r"^(https?:|data:)", raw, re.I):
            continue
        from urllib.parse import unquote
        decoded = unquote(raw)
        if decoded.lower() in seen:
            continue
        seen.add(decoded.lower())
        if PurePosixPath(decoded).suffix.lower() in KNOWN_EXTENSIONS:
            assets.append(decoded)

    return assets, notes


def extract_wikilinks(markdown: str):
    out, seen = [], set()
    for match in WIKILINK.finditer(markdown):
        inner = match.group(1).split("|")[0].split("#")[0].strip()
        if not inner or inner.lower() in seen:
            continue
        seen.add(inner.lower())
        out.append(inner)
    return out


def resolve_by_basename(target: str, candidates):
    """Obsidian-style resolution: exact path first, then shortest matching basename."""
    wanted = target.lstrip("./").lower()
    for candidate in candidates:
        if str(candidate).lower() == wanted:
            return candidate
    base = PurePosixPath(wanted).name
    matches = [c for c in candidates if PurePosixPath(str(c).lower()).name == base]
    if not matches:
        return None
    matches.sort(key=lambda c: (len(PurePosixPath(str(c)).parts), len(str(c))))
    return matches[0]


def resolve_note_link(target: str, note_paths):
    wanted = re.sub(r"\.md$", "", target.lstrip("./"), flags=re.I).lower()
    for candidate in note_paths:
        if re.sub(r"\.md$", "", str(candidate), flags=re.I).lower() == wanted:
            return candidate
    base = PurePosixPath(wanted).name
    matches = [c for c in note_paths if PurePosixPath(re.sub(r"\.md$", "", str(c), flags=re.I).lower()).name == base]
    if not matches:
        return None
    matches.sort(key=lambda c: (len(PurePosixPath(str(c)).parts), len(str(c))))
    return matches[0]


def resolve_relative_target(path: str, mirror_root: str, fallback: str) -> PurePosixPath:
    clean = PurePosixPath(path)
    root = PurePosixPath(mirror_root.strip("/") or "Learn")
    if clean == root:
        return PurePosixPath(clean.name)
    if str(clean).startswith(str(root) + "/"):
        return clean
    return root / fallback / clean.name


# ── planning ─────────────────────────────────────────────────────────────────

def build_plan(vault: Path, note_rel: str, mirror_root: str, fallback: str,
               asset_fallback: str, with_links: bool, publishable: set,
               today: str, stamp: bool):
    """Return (entries, skipped, missing) where an entry is a dict."""
    note_path = vault / note_rel
    if not note_path.is_file():
        raise SystemExit(f"error: no such note in the vault: {note_rel}")
    markdown = note_path.read_text(encoding="utf-8")

    all_files = [p.relative_to(vault).as_posix() for p in vault.rglob("*") if p.is_file()]
    note_files = [p for p in all_files if p.lower().endswith(".md")]
    entries, skipped, missing = [], [], []
    seen_targets = set()

    def add(entry):
        if entry["to"] in seen_targets:
            return
        seen_targets.add(entry["to"])
        entries.append(entry)

    # The provenance stamp names the vault a note came from, and it has to be that vault's
    # own directory name rather than a literal: this script ships to other people's vaults,
    # and a hardcoded name would stamp every one of them with somebody else's.
    source_vault = vault.name
    content = stamp_frontmatter(markdown, {"source_vault": source_vault, "published": today}) if stamp else markdown
    add({
        "from": note_rel,
        "to": str(resolve_relative_target(note_rel, mirror_root, fallback)),
        "kind": "note",
        "content": content,
    })

    assets, note_embeds = extract_embeds(markdown)
    for target in assets:
        resolved = resolve_by_basename(target, all_files)
        if resolved is None:
            missing.append(target)
            continue
        add({
            "from": resolved,
            "to": str(resolve_relative_target(resolved, mirror_root, asset_fallback)),
            "kind": "asset",
        })

    if with_links:
        links = list(note_embeds) + extract_wikilinks(markdown)
        for target in links:
            resolved = resolve_note_link(target, note_files)
            if resolved is None or resolved == note_rel:
                if resolved is None:
                    missing.append(target)
                continue
            text = (vault / resolved).read_text(encoding="utf-8", errors="replace")
            status = (frontmatter_value(text, "status") or "").lower()
            if status not in publishable:
                skipped.append(f"{resolved} (status: {status or 'none'})")
                continue
            add({
                "from": resolved,
                "to": str(resolve_relative_target(resolved, mirror_root, fallback)),
                "kind": "note",
                "content": stamp_frontmatter(text, {"source_vault": source_vault, "published": today}) if stamp else text,
            })

    return entries, skipped, missing


# ── main ─────────────────────────────────────────────────────────────────────

def main(argv=None) -> int:
    here = Path(__file__).resolve().parent
    vault_default = here.parent
    target_file = here / "publish-target.txt"
    target_default = target_file.read_text(encoding="utf-8").strip() if target_file.is_file() else ""

    parser = argparse.ArgumentParser(description="Publish a finished note from a learning vault into a library vault.")
    parser.add_argument("note", help="note path, relative to the vault or absolute")
    parser.add_argument("--vault", default=str(vault_default), help="the learning vault (default: this vault)")
    parser.add_argument("--target", default=target_default, help="the library vault (default: Tools/publish-target.txt)")
    parser.add_argument("--mirror-root", default="Learn", help="only files under this folder keep their relative path")
    parser.add_argument("--fallback", default="Inbox", help="where notes from outside the mirror root land")
    parser.add_argument("--asset-fallback", default="Attachments", help="where embedded assets from outside it land")
    parser.add_argument("--with-links", action="store_true", help="also publish linked notes whose status allows it")
    parser.add_argument("--publishable", default="done,established", help="comma-separated statuses that may travel")
    parser.add_argument("--no-stamp", action="store_true", help="do not stamp provenance into the copies")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and write nothing")
    parser.add_argument("--yes", action="store_true", help="overwrite existing files without asking")
    args = parser.parse_args(argv)

    if not args.target:
        print("error: no library vault to publish into.", file=sys.stderr)
        print("       Pass --target <path to the library vault>, or write that path into", file=sys.stderr)
        print("       Tools/publish-target.txt (beside this script) and it will be used from then on.", file=sys.stderr)
        return 2

    vault = Path(args.vault).expanduser().resolve()
    target = Path(args.target).expanduser()
    try:
        note_rel = str(Path(args.note).expanduser().resolve().relative_to(vault))
    except ValueError:
        print(f"error: {args.note} is not inside the vault {vault}", file=sys.stderr)
        return 2

    today = datetime.date.today().isoformat()
    publishable = {value.strip().lower() for value in args.publishable.split(",") if value.strip()}
    entries, skipped, missing = build_plan(
        vault, note_rel, args.mirror_root, args.fallback, args.asset_fallback,
        args.with_links, publishable, today, stamp=not args.no_stamp,
    )

    print(f"{'PLAN' if args.dry_run else 'PUBLISH'} {note_rel} → {target}")
    for entry in entries:
        exists = " (exists)" if (target / entry["to"]).exists() else ""
        print(f"  {entry['kind']:5} {entry['to']}{exists}")
    for line in skipped:
        print(f"  skipped: {line}")
    for line in missing:
        print(f"  not found: {line}")

    if args.dry_run:
        return 0

    existing = [entry["to"] for entry in entries if (target / entry["to"]).exists()]
    if existing and not args.yes:
        answer = input(f"Overwrite {len(existing)} existing file(s) in the library? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("cancelled")
            return 1

    for entry in entries:
        destination = target / entry["to"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if entry["kind"] == "note":
            destination.write_text(entry["content"], encoding="utf-8")
        else:
            shutil.copy2(vault / entry["from"], destination)

    if not args.no_stamp:
        source = vault / note_rel
        stamped = stamp_frontmatter(source.read_text(encoding="utf-8"),
                                    {"published": today, "published_to": entries[0]["to"]})
        source.write_text(stamped, encoding="utf-8")

    print(f"published {len(entries)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
