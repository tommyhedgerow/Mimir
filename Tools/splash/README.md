# Tools/splash — the copies the vault plays from

The startup animation, as the two surfaces here consume it. **This is a copy, not the
source.** The piece is authored and rendered in `code/video-production`, whose
`notes/06-export-matrix.md` is the export of record; when it changes there, re-copy it
here with the commands at the bottom of this note.

## What is here, and where it came from

| File | Copied from (`code/video-production/`) | SHA-256 |
|---|---|---|
| `mimir_startup_dark.mp4` | `exports/mimir_startup_1280x720.mp4` (the dark master) | `e4cc50479879…5000f1f` |
| `mimir_startup_light.webm` | `exports/variants/light_transparent/mimir_startup_1280x720_light_transparent.webm` | `a73127f1bcf3…d03795` |
| `mimir_startup_dark_poster.png` | `exports/mimir_startup_poster.png` | `6e65c86b4561…2ba5f9c` |
| `mimir_startup_light_poster.png` | `exports/variants/light_transparent/mimir_startup_poster_light_transparent.png` | `6dcdcab2d244…1b2186b0` |

## Why one is a master and the other a variant

**The two variants of this piece are not the same object, and treating them alike is what
produced a visible rectangle.** They were measured against their own masters before either
was adopted — composite each over the ground below, then compare its outer 8-pixel band with
the master's at the same moment:

| Build | What the variant actually is | Edge misses its ground by |
|---|---|---|
| light | an **alpha layer** — flat paper, real coverage; compositing it over that paper returns the master | median 0, mean **0.5**, worst 1 |
| dark | an **additive glow** — never reaches zero alpha, and carries a blue ambient wash the master does not have | median 23, mean **22.6**, worst 34 |

So no ordinary alpha compositing reproduces the dark master, and the dark build here is the
opaque master itself, which misses its ground by ~7. The light build keeps its transparent
variant, which is very nearly exact. The two files are therefore deliberately different
kinds of file; **do not "tidy" them into one.**

The candidates, measured on the hold frame, for the record:

| Composite | median | mean | worst |
|---|---|---|---|
| dark master on `#040106` | 0 | **6.6** | 30 |
| dark master on `#08030d` | 7 | 8.0 | 23 |
| dark transparent on `#08030d` | 23 | 22.6 | 34 |
| light transparent on `#d2cad7` | 0 | **0.5** | 1 |
| light master on `#d8d0db` | 0 | 8.0 | 24 |

> ⚠ **A plain `ffprobe` says the transparent WebM has no alpha, and it is wrong.** VP9 keeps
> alpha in a side plane, so the only stream listed is `yuv420p` and the file looks opaque.
> Decode it the way `exports/variants/README.md` instructs and the plane is there:
>
> ```sh
> ffmpeg -v error -c:v libvpx-vp9 -i mimir_startup_light.webm -frames:v 1 -pix_fmt rgba out.png
> ```
>
> This matters for reading the table above, not for playing the file: a browser gets the
> alpha plane without being asked.

## The ground colours — why the splash does not wear the vault's paper

The piece was rendered on grounds of its own, and neither is a Mimir colour:

| Build | Ground | Mimir's paper for that frame |
|---|---|---|
| dark | `#040106` | `#131a19` — a green black |
| light | `#d2cad7` | `#faf6ea` — warm cream |

Using the theme's paper under the artwork made it read as a slightly wrong rectangle laid on
the page: the animation is *not* a cut-out, because "transparent" here measures how much
light lands on a pixel — the glow layer never reaches zero alpha, and the light build keeps
its own lavender paper. So both surfaces wear the piece's own ground while it plays and hand
the vault back its paper when it leaves.

**If the piece is ever re-rendered, these two values go stale silently.** Re-measure them
from the matching master's hold frame — the outer 8-pixel band, which is the edge the eye
compares against the sheet:

```sh
E=~/code/video-production/exports
ffmpeg -v error -ss 8.5 -i "$E/mimir_startup_1280x720.mp4" -frames:v 1 -f rawvideo -pix_fmt rgb24 /tmp/dark.raw -y
ffmpeg -v error -ss 8.5 -i "$E/variants/light/mimir_startup_1280x720_light.mp4" -frames:v 1 -f rawvideo -pix_fmt rgb24 /tmp/light.raw -y
```

…then average the border ring of each raw RGB frame. `Tools/test-mimir-splash.mjs` asserts
that the values in the plugin, in `Tools/lesson-pane/client.mjs` and in the table above are
the same two, so a re-render that changes them fails a check rather than going unnoticed.

## Where they are played

| Surface | What reads it |
|---|---|
| Obsidian, when the vault opens | `.obsidian/plugins/mimir-splash/` — bytes via the vault adapter, once, dismissible with any key |
| Obsidian on a phone | the same plugin, which holds the still poster frame instead — the clip is desktop- and tablet-sized on purpose |

Only the plugin plays it now. The Lesson window used to be a second surface and is gone with
the pane; the piece plays once, over the vault, as the vault opens. It picks the dark or light
build from the frame in front of it, holds the still frame instead where
`prefers-reduced-motion: reduce` is set, and leaves on its own when the clip ends. It is marked
decorative and carries no accessible name — see the note on the alt text below.

## The alt text

From `notes/04-accessibility.md`, which is the piece's own recommendation. It is kept here
and **deliberately not set on the splash**: an element's accessible name is surfaced by both
apps as a tooltip, so naming the animation put a sentence about tree roots on screen over
the artwork for the whole eight seconds. A splash that any key dismisses, that carries no
information the lesson needs and that is not interactive is decoration, and both surfaces
mark it `aria-hidden` instead. If it is ever embedded somewhere that genuinely needs a text
alternative, this is the text:

> Animated logo: roots of a great tree descend from the top of the frame and dissolve,
> revealing an ancient stone well whose water glows. Two stacked Norse runes — the Younger
> Futhark "M" above the Elder Futhark "M" — resolve above the well, then disperse into
> drifting dust.

## Refreshing these copies

```sh
E=~/code/video-production/exports
cp "$E/mimir_startup_1280x720.mp4"                                               Tools/splash/mimir_startup_dark.mp4
cp "$E/mimir_startup_poster.png"                                                 Tools/splash/mimir_startup_dark_poster.png
cp "$E/variants/light_transparent/mimir_startup_1280x720_light_transparent.webm" Tools/splash/mimir_startup_light.webm
cp "$E/variants/light_transparent/mimir_startup_poster_light_transparent.png"    Tools/splash/mimir_startup_light_poster.png
```

Then paste the new hashes into the table above, and **re-measure the two grounds** — a
re-render can move them, and they go stale silently. Nothing else needs rebuilding: both
surfaces read these files at play time, so a replaced file is picked up on the next open.
