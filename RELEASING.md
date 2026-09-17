# Releasing Mimir

Five repositories, one release. This is the runbook, written down because the
dependency order matters and getting it wrong ships a vault whose plugins do not
match its own lock file.

| Repository | What it is | Registry it goes to |
| --- | --- | --- |
| [`Mimir`](https://github.com/tommyhedgerow/Mimir) | The vault, the preset, the artwork | — (the entry point; also the DSH plugin listing, see below) |
| [`obsidian-mimir-theme`](https://github.com/tommyhedgerow/obsidian-mimir-theme) | The theme | Obsidian community directory |
| [`obsidian-mimir-controls`](https://github.com/tommyhedgerow/obsidian-mimir-controls) | Reading size and frame | Obsidian community directory |
| [`obsidian-mimir-splash`](https://github.com/tommyhedgerow/obsidian-mimir-splash) | The startup animation | Obsidian community directory |
| [`obsidian-lesson-publisher`](https://github.com/tommyhedgerow/obsidian-lesson-publisher) | Publish into a second vault | Obsidian community directory |

The four Obsidian repositories are separate because the community directory reads
a plugin or theme from the **root** of a repository and installs one per
repository. That is a constraint of theirs, not a preference of ours, and it is
the reason the vault vendors built copies and keeps a lock over them.

## The order

### 1. Change the plugin

Plugins are authored in their own repositories, never in the vault.

```sh
cd obsidian-mimir-controls      # or -splash, or -lesson-publisher
$EDITOR src/main.js
npm install                     # first time only
npm run lint                    # must be zero errors
npm run build
npm run check                   # the built main.js is current
npm test                        # where the repository has a harness
```

`npm run lint` is not decoration: it runs `eslint-plugin-obsidianmd`, which is
the same plugin the community directory's automated review is built from. A clean
local lint is the closest thing to a rehearsal for that review.

**Never commit `main.js`.** It is the release artifact. The directory rebuilds it
from `src/main.js` and checks the two match byte for byte, which is how a user can
read the code that actually runs. `.gitignore` anchors it as `/main.js` — the
leading slash is load-bearing, because a bare `main.js` also matches
`src/main.js`, and that would silently exclude the one file the build reads.

### 2. Tag the plugin

The tag **must equal** `version` in `manifest.json`, with **no leading `v`**.
Obsidian downloads the release whose tag matches the manifest, so a mismatch
publishes a plugin nobody can install, and the release workflow refuses to run
when they disagree.

```sh
$EDITOR manifest.json           # bump version, e.g. 1.0.0 -> 1.0.1
node -e "…" # or edit versions.json by hand — only when minAppVersion changes
git add -A && git commit -m "…"
git tag -a 1.0.1 -m "1.0.1"
git push origin main --follow-tags
```

The workflow builds `main.js`, attests its provenance, and attaches `main.js`,
`manifest.json` and `styles.css` (where one exists) to the release. Themes attach
`manifest.json` and `theme.css`, and the workflow fails the tag if `theme.css`
reaches for a remote asset — community themes may not load anything over the
network.

`versions.json` is not a release log. It maps a plugin version to the
`minAppVersion` it needs, and Obsidian consults it only to find the newest version
an older app can still run. Update it when `minAppVersion` changes, not every
release.

### 3. Re-vendor into the vault

```sh
cd ../Mimir
node scripts/sync-plugins.mjs
git add -A && git commit -m "Vendor <plugin> <version>"
```

This copies the built artifacts into `.obsidian/`, where a fresh clone needs them,
and rewrites `plugins.lock.json` with their hashes. The lock is what makes the
duplication safe: it cannot tell you a copy is *good*, but it can tell you it is
the one you put there, which is the failure that actually happens.

CI runs `node scripts/sync-plugins.mjs --check` on every push. If you edit a
vendored file by hand, that check fails, and it is right to.

### 4. Release the vault

```sh
node Tools/check-tokens.mjs             # one palette, five files
node Tools/vault-map.mjs                # the spines validate
node Tools/check-bilingual.mjs          # the two languages still agree
node Tools/build-lesson-pane.mjs --check # all three host copies agree
./scripts/pack-preset.sh                # rebuild both .dshpreset files
./scripts/pack-preset.sh --check        # and prove they are current
```

`check-bilingual.mjs` is the one that matters most after any edit to either
language. It reads the pairing table out of `docs/zh-CN-glossary.md`, so the
glossary is not just documentation — it is the list of what has to exist on both
sides. Add a document to one language and the check fails until its twin exists.
It also resolves every Chinese wikilink, verifies that each `![[X.base#View]]`
names a view that base actually defines, and compares the two presets' skills and
composition rows. That last pair is what catches a translation that quietly
dropped a specialist or a tool permission.

The Chinese preset needs no separate pane build: `preset-zh/` holds no
`lesson-pane/`, and both the installer and the packer stage the shared one in
from `preset/lesson-pane`. Two committed copies of a generated bundle is the
shape that drifts, so there is only ever one.

Then tag. The vault's release carries the `.dshpreset` and its SHA-256, which is
the teacher as a single importable file.

`pack-preset.sh` checks the package against the format's own rules before it
writes anything, and refuses to produce one that would not import. For a second
opinion there is an official portable verifier, published by the Preset Square
project, which parses the archive without loading a harness:

```sh
curl -sfLO https://dshdesktop.com/preset/tools/dsh-preset/v1/dsh-preset.py
python3 dsh-preset.py verify dist/mimir-tutor.dshpreset --json
```

It reports `portableValid` and `runtimeValidated` as separate things, and it is
right to: it can prove the package is well formed, and it cannot prove DSH will
compose it, because it never loads one. Only importing the preset does that.

### 5. Publish the preset

The plugin catalog and the preset registry are **different registries**, run by
different people, with different formats. Do not cross them.

**Preset Square** — `https://dshdesktop.com/preset/` — is the public preset
registry for DSH Desktop. It takes a multipart `POST /api/v1/presets` with the
`.dshpreset`, a `publisherEmail`, a canonical English title and description, a
BCP 47 `contentLanguage`, and localisations for `zh, en, ja, ru, es, pt`. Its own
publishing skill is at
`https://dshdesktop.com/preset/skills/preset-square/SKILL.md`, and that document
is the authority; this paragraph is a pointer to it, not a substitute.

**Two presets are published, as two listings.** `mimir-tutor` has
`contentLanguage: en`; `mimir-tutor-zh` has `contentLanguage: zh-CN`. They are
separate listings rather than one package with two localisations, because the
difference is not the *listing* language — it is the language the teacher
teaches in, which lives in the persona and cannot be switched per session. Each
still carries all six localisations of its own listing metadata.

`scripts/pack-preset.sh` builds and validates both. With no argument it does
both and reports each separately; `--preset mimir-tutor-zh` does one, and
`--check` verifies without writing.

**Make the two titles differ in every locale, not just the canonical one.**
This was got wrong on the first pass and cannot now be corrected: Preset Square
has no update or delete route — `PATCH` and `PUT` on a preset both return 404 —
so a listing is immutable once published. The English preset carries
`title: Mimir Tutor` and localises to `Mimir 导师` in Chinese, which is exactly
the Chinese preset's own title, so a reader browsing the square in Chinese sees
two entries with the same name. Give the English one a distinguishing word in
each localization (`Mimir Tutor (English)` / `Mimir Tutor（英文）`) before
publishing, and check every locale side by side rather than only the English.

**The plugin catalog** — [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) —
is for *plugins*, and Mimir is a preset, so the preset does not go there. The
Lesson pane does, because it is a real DSH plugin: it declares `dsh.bundle` at
`preset/lesson-pane/package.json`, which is the thing that makes a package
installable. One YAML file per entry, at `data/plugins/tommyhedgerow__Mimir.yml`:

```yaml
url: https://github.com/tommyhedgerow/Mimir
name: tommyhedgerow/Mimir
category: ui
description:
  en: A docked lesson pane for tutoring sessions, carrying the question, the vault's drawings and a scratch page.
```

The checks that gate it, in the order they run: at most three entries per pull
request, the repository must declare `dsh.bundle` somewhere in its tree, and the
repository must be at least one day old. The repository also needs the
`dsh-plugin` GitHub topic, which it has.

### 6. Publish the Obsidian entries

There is **no pull request** any more. Obsidian replaced the old
`obsidian-releases` PR process in May 2026; that repository is now a read-only
mirror and its pull requests are disabled.

1. Sign in at <https://community.obsidian.md> with an Obsidian account.
2. Connect the GitHub account that owns the repository. This is required, and it
   is a read-only check of public profile data used to verify ownership.
3. **New plugin** — give the repository URL and the owner. **New theme** — the
   same, plus a screenshot path (this repository's is `screenshot.png`) and the
   supported modes (`Dark`).
4. Agree to the developer policies and to continued maintenance.

Review is automated and runs on submission, and again **on every version after
that**. Results normally appear within minutes; a passing entry is searchable in
the app within a day, and an entry that fails a later version is removed from
search within a day. Warnings do not block; errors do.

The scorecard reports things worth knowing in advance: whether the build
reproduced the release `main.js`, whether there is a signed artifact attestation,
whether the code uses dynamic execution, whether it reaches the filesystem
outside the vault API, and how many network calls it makes. `lesson-publisher`
will report direct filesystem access, because writing into a second vault is its
entire job — which is why its README discloses it and why it is desktop-only.

## Things that are easy to get wrong

- **Tag without the `v`.** `1.0.1`, not `v1.0.1`. The vault itself uses `v1.0.0`;
  the plugins must not.
- **The tag and the manifest version must agree.** The release workflow fails
  loudly if they do not, on purpose.
- **`main.js` is never committed**, and `src/main.js` always is. The anchored
  `/main.js` in `.gitignore` is what keeps both true.
- **A theme may not load a remote asset.** No webfonts, no remote images, base64
  data URIs only. This is an error in the directory's own lint config.
- **`manifest.json` allows exactly nine keys** for a plugin and five for a theme,
  and an unknown key is an error. A theme has no `id`, no `description` and no
  `screenshot`; the screenshot goes in the submission form instead.
- **Descriptions are machine-checked**: 10 to 250 characters, a capital first
  letter, a full stop at the end, and no character outside
  `A-Za-z0-9` plus space and `.,!?'"-`. No emoji, no parentheses, no colons.
- **The `id` may not contain `obsidian` or `plugin`**, in any position.

## Provenance of the artwork

Everything in `assets/` is generated, not drawn. A Python renderer builds the
pixel art from the same cyan and magenta ramps the theme uses, over an 8×8 Bayer
dither and a fixed 57-colour table; the marks and rules are the same geometry at
other sizes. Nothing is traced, sampled or downloaded, and all of it is MIT like
the rest of the repository.

**One illustration the project used while it was private is deliberately not
here.** It was a supplied early-20th-century-looking printed plate, used as the
source for a title card while the vault was the author's own. Its provenance and
licence were never established, so it was left out rather than shipped with a
question mark over it. If it is ever wanted in a release, the artist and the
publication have to be identified first, and that is a job for a person, not a
render.
