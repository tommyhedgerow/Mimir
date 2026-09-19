#!/usr/bin/env python3
"""
Publish the two Mimir presets to Preset Square.

WHY A SCRIPT RATHER THAN A CURL LINE. The request is multipart with a binary artifact,
one required private field, and a JSON object of six localisations per listing. Every
version of this as a shell command broke on the first apostrophe in a description, and
the failure mode was a 400 that named the wrong field.

The endpoint and the field list come from the registry's own skill, which is the
authority:
  https://dshdesktop.com/preset/skills/preset-square/SKILL.md

Usage:
  python3 Tools/publish-to-preset-square.py --email <address> [--dry-run] [--only <id>]
"""

import argparse
import json
import mimetypes
import pathlib
import sys
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENDPOINT = "https://dshdesktop.com/preset/api/v1/presets"
METADATA = ROOT / "docs" / "preset-square-listings.json"

# The six listing languages the registry accepts. A listing may be presented in any of
# them; the CONTENT language below describes what the teacher actually teaches in, and
# the two are different things.
LOCALES = ["en", "zh", "ja", "ru", "es", "pt"]


def multipart(fields, files):
    """Encode one multipart/form-data body. Returns (content_type, body)."""
    boundary = "----mimir" + uuid.uuid4().hex
    out = bytearray()
    for name, value in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += str(value).encode("utf-8") + b"\r\n"
    for name, path in files.items():
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode()
        out += f"Content-Type: {ctype}\r\n\r\n".encode()
        out += path.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return f"multipart/form-data; boundary={boundary}", bytes(out)


def publish(entry, email):
    """POST one listing. Returns (status, parsed body)."""
    artifact = ROOT / entry["artifact"]
    if not artifact.is_file():
        raise SystemExit(f"missing artifact: {artifact} — run ./scripts/pack-preset.sh")

    localisations = {loc: entry["localizations"][loc] for loc in LOCALES}
    fields = {
        "publisherEmail": email,
        "title": entry["title"],
        "description": entry["description"],
        "contentLanguage": entry["contentLanguage"],
        "localizations": json.dumps(localisations, ensure_ascii=False),
    }
    ctype, body = multipart(fields, {"artifact": artifact})
    request = urllib.request.Request(ENDPOINT, data=body, method="POST")
    request.add_header("Content-Type", ctype)
    # A UA IS REQUIRED, and its absence is not reported as one. Python's urllib sends no
    # User-Agent at all, and the registry sits behind a bot filter that answers such a
    # request with a bare `403 error code: 1010` — no field named, nothing to act on.
    # `curl` works because it sends one. This names the tool rather than impersonating a
    # browser, which is the honest version of the same header.
    request.add_header("User-Agent", "mimir-publish/1.0 (+https://github.com/tommyhedgerow/Mimir)")
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {"raw": raw[:800]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True, help="publisher email, sent only to dshdesktop.com")
    parser.add_argument("--dry-run", action="store_true", help="show what would be sent, send nothing")
    parser.add_argument("--only", help="publish just this preset id")
    options = parser.parse_args()

    listings = json.loads(METADATA.read_text(encoding="utf-8"))
    for preset_id, entry in listings.items():
        if options.only and preset_id != options.only:
            continue
        artifact = ROOT / entry["artifact"]
        size = artifact.stat().st_size if artifact.is_file() else 0
        print(f"=== {preset_id}")
        print(f"    artifact         {entry['artifact']}  ({size} bytes)")
        print(f"    title            {entry['title']}")
        print(f"    contentLanguage  {entry['contentLanguage']}")
        print(f"    localisations    {', '.join(LOCALES)}")
        if options.dry_run:
            print("    (dry run — nothing sent)")
            continue
        status, body = publish(entry, options.email)
        # 201, not 200: this creates a resource. Checking for 200 reported a successful
        # publish as a failure, which is the wrong direction for a script whose whole job
        # is to be believed — and it nearly had this one published twice.
        if status in (200, 201) and body.get("slug"):
            print(f"    PUBLISHED  https://dshdesktop.com/preset/p/{body['slug']}")
            print(f"    presetId   {body.get('presetId')}   id {body.get('id')}")
        else:
            print(f"    FAILED ({status})")
            print("    " + json.dumps(body, ensure_ascii=False)[:700])
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
