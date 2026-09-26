/**
 * Tools/lib/anki-notetype.mjs — the Mimir note type: its fields, its card and its hand.
 *
 * WHY THIS EXISTS
 *   A tab-separated file can carry the text of a card and nothing else. What makes
 *   a card *this vault's* is the note type behind it — the fields that hold the
 *   kind, the strand and the source; the template that puts them in the right
 *   places; and the CSS that draws the whole thing in the same paper, ink and sage
 *   the vault, the maps, the PDFs and the board all use. This is that definition,
 *   in one place, so the package, the tests and the documentation cannot disagree
 *   about what a Mimir card is.
 *
 * THE FIELDS, AND WHY EACH ONE IS THERE
 *   Front   the question, or the claim to be judged
 *   Back    the answer, as HTML — the cards already carry bold, italics and links
 *   Kind    term | trap | name | date | species | fact, shown as a chip
 *   Strand  which subject it came from, shown in the footer
 *   Source  the note it came from, so a card can be checked against its origin
 *
 *   The last three are the point of having a note type at all. In Anki's stock
 *   `Basic` they would be tags only, and a card would arrive with no way of saying
 *   *where it came from* — which matters most for the trap cards, where the whole
 *   value is that the wrong claim is traceable to a session that recorded it.
 *
 * THE COLOURS ARE INTERPOLATED, NOT COPIED
 *   `Tools/mimir-tokens.json` says of its own palette: "the others are copies, and
 *   a disagreement is a bug, not a preference." Adding a sixth hand-maintained copy
 *   here would be exactly that bug waiting to happen, so the palette is read from
 *   that file when the package is built and substituted into the CSS below. There
 *   is nothing to keep in step, because there is only one of it.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The palette lives beside the tool, never in the vault being read: `--vault`
// points the tool at another vault, and the colours are still this tool's own.
const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

export const NOTETYPE_NAME = 'Mimir'
export const DECK_NAME = 'Mimir'

/** Field order is load-bearing: it is the column order of the TSV. */
export const FIELDS = [
  { name: 'Front', font: 'Georgia', size: 20 },
  { name: 'Back', font: 'Georgia', size: 18 },
  { name: 'Kind', font: 'Menlo', size: 14 },
  { name: 'Strand', font: 'Menlo', size: 14 },
  { name: 'Source', font: 'Menlo', size: 14 }
]

/**
 * The card. Written twice rather than via `{{FrontSide}}` so that the `kind-…`
 * class — which colours the chip and the rule by the sort of card it is — is
 * present on the answer side as well as the question side.
 *
 * `{{Kind}}` goes into a class attribute, which is safe because the tool refuses
 * any kind that is not a lower-case tag word: nothing here can break out of the
 * attribute, because nothing else can get in.
 */
export const FRONT_TEMPLATE = `<div class="mimir kind-{{Kind}}">
  <div class="kind">{{Kind}}</div>
  <div class="prompt">{{Front}}</div>
</div>`

export const BACK_TEMPLATE = `<div class="mimir kind-{{Kind}}">
  <div class="kind">{{Kind}}</div>
  <div class="prompt">{{Front}}</div>
  <hr id="answer">
  <div class="answer">{{Back}}</div>
  <div class="provenance"><span class="strand">{{Strand}}</span><span class="source">{{Source}}</span></div>
</div>`

export const TEMPLATE_NAME = 'Card 1'

/* ------------------------------------------------------------------ *
 * The cloze note type
 *
 * A second note type, because a cloze card is a different kind of thing: one
 * missing token inside a true sentence. Anki gives it `type: 1`, and generates
 * **one card per `{{cN::}}` marker** — so the card count is the number of
 * deletions, not the number of notes. Its fields differ from the standard type
 * because a cloze sentence carries its own context: `Text` holds the sentence,
 * and `Extra` holds the caveat that would otherwise have been the answer side.
 *
 * This is for facts, dates and names — a year, a status, a person. It is NOT for
 * a trap, and the tool refuses a cloze trap: "here is a plausible wrong claim,
 * judge it" cannot be expressed as a missing word, and a derivation cannot be
 * expressed as one at all.
 * ------------------------------------------------------------------ */

export const CLOZE_NOTETYPE_NAME = 'Mimir Cloze'

export const CLOZE_FIELDS = [
  { name: 'Text', font: 'Georgia', size: 20 },
  { name: 'Extra', font: 'Georgia', size: 18 },
  { name: 'Kind', font: 'Menlo', size: 14 },
  { name: 'Strand', font: 'Menlo', size: 14 },
  { name: 'Source', font: 'Menlo', size: 14 }
]

export const CLOZE_TEMPLATE_NAME = 'Cloze'

export const CLOZE_FRONT_TEMPLATE = `<div class="mimir kind-{{Kind}}">
  <div class="kind">{{Kind}}</div>
  <div class="prompt">{{cloze:Text}}</div>
</div>`

export const CLOZE_BACK_TEMPLATE = `<div class="mimir kind-{{Kind}}">
  <div class="kind">{{Kind}}</div>
  <div class="prompt">{{cloze:Text}}</div>
  <hr id="answer">
  <div class="answer">{{Extra}}</div>
  <div class="provenance"><span class="strand">{{Strand}}</span><span class="source">{{Source}}</span></div>
</div>`

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif'

/**
 * The palette, straight out of the token file — never retyped here — and
 * **namespaced**.
 *
 * Anki defines custom properties of its own on `:root` and paints the reviewer
 * with them, so a plain `--canvas` or `--fg` here would shadow Anki's. The
 * prefix makes a collision impossible rather than unlikely.
 */
export function palette () {
  const tokens = JSON.parse(readFileSync(join(TOOLS_DIR, 'mimir-tokens.json'), 'utf8'))
  const vars = (p, indent) => Object.entries(p)
    .map(([k, v]) => `${indent}--mimir-${k}: ${v};`)
    .join('\n')
  return { light: vars(tokens.light, '  '), dark: vars(tokens.dark, '  ') }
}

/**
 * The card's stylesheet.
 *
 * TWO THINGS ABOUT ANKI'S OWN STYLESHEET ARE LOAD-BEARING HERE, and getting
 * either wrong makes the card unreadable. Both were got wrong once.
 *
 *   1. ANKI HAS ITS OWN CUSTOM PROPERTIES. It defines `--canvas`, `--fg`,
 *      `--border`, `--shadow` and more on `:root`, and its reviewer styles the
 *      page with `body.nightMode { background-color: var(--canvas); color:
 *      var(--fg) }`. A variable sharing one of those names does not sit beside
 *      Anki's — it SHADOWS it, and Anki's own rule then paints with ours. Every
 *      variable here is therefore prefixed `--mimir-`.
 *
 *   2. `body.nightMode` OUTRANKS A BARE `.card`. Anki puts the card class on the
 *      body, so `body.nightMode` scores 0-1-1 against `.card`'s 0-1-0 and takes
 *      both the colour and the background. A stylesheet that sets them only on
 *      `.card` is silently ignored at night. They are declared on the
 *      night-mode selectors too, at 0-2-0, where they win.
 *
 * The colours are interpolated from `Tools/mimir-tokens.json` at build time; do
 * not edit a copy of this by hand, edit the tokens and rebuild the package.
 */
export function notetypeCss () {
  const { light, dark } = palette()
  return `/* Mimir — the vault's own hand, carried into Anki. */
.card {
${light}
}

.card.nightMode,
.nightMode .card {
${dark}
}

/* Grouped across every structure Anki has used: nightMode on the body with the
   card inside it, and nightMode on the card element itself. Declaring the colour
   and the background here is what keeps them out of Anki's hands at night. */
.card,
.card.nightMode,
.nightMode .card {
  font-family: ${SERIF};
  font-size: 20px;
  line-height: 1.55;
  text-align: left;
  margin: 0;
  padding: 0;
  background: var(--mimir-paper);
  color: var(--mimir-ink);
}

.card.nightMode,
.nightMode .card { color-scheme: dark; }

.mimir {
  max-width: 42rem;
  margin: 0 auto;
  padding: 26px 22px 38px;
}

/* The kind, as a chip: what sort of thing is being asked. */
.kind {
  font-family: ${MONO};
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--mimir-mark);
}
.kind-trap .kind { color: var(--mimir-peach); }
.kind-species .kind { color: var(--mimir-cyan); }

.prompt {
  font-size: 1.2em;
  line-height: 1.42;
  margin: 9px 0 0;
}
.prompt strong { font-weight: 650; }

/* A cloze gap. Anki's stock notetype styles these \`color: blue\` and, at night,
   \`.nightMode .cloze { color: lightblue }\` — a rule at 0-2-0 that a bare \`.cloze\`
   would lose to. These are matched at 0-2-0 as well and come later in the page, so
   they win; and the colour follows the palette, so night mode needs no second rule.
   The test reads the computed colour of a real cloze span rather than trusting it. */
.mimir .cloze { font-weight: 650; color: var(--mimir-mark); }
.mimir .cloze-inactive { color: var(--mimir-ink-2); }

#answer {
  border: 0;
  border-top: 2px solid var(--mimir-mark);
  margin: 21px 0 15px;
}
.kind-trap #answer { border-top-color: var(--mimir-peach); }
.kind-species #answer { border-top-color: var(--mimir-cyan); }

.answer { font-size: 1em; }
.answer > :first-child { margin-top: 0; }
.answer > :last-child { margin-bottom: 0; }
.answer p { margin: 0 0 .7em; }
.answer strong { font-weight: 650; }
.answer a { color: var(--mimir-cyan); text-decoration: none; border-bottom: 1px solid var(--mimir-rule); }
.answer ul, .answer ol { margin: .5em 0; padding-left: 1.35em; }
.answer li { margin: .22em 0; }

.answer code,
.prompt code {
  font-family: ${MONO};
  font-size: .88em;
  background: var(--mimir-paper-2);
  padding: .06em .32em;
  border-radius: 3px;
}

.provenance {
  display: flex;
  gap: 14px;
  align-items: baseline;
  margin-top: 26px;
  padding-top: 8px;
  border-top: 1px solid var(--mimir-rule);
  font-family: ${MONO};
  font-size: 10.5px;
  letter-spacing: .04em;
  color: var(--mimir-ink-3);
}
.provenance .source { margin-left: auto; text-align: right; }
`
}

/** The standard note type, ready for `buildApkg`. */
export function mimirNotetype () {
  return {
    name: NOTETYPE_NAME,
    type: 0,
    fields: FIELDS,
    templates: [{ name: TEMPLATE_NAME, qfmt: FRONT_TEMPLATE, afmt: BACK_TEMPLATE }],
    css: notetypeCss()
  }
}

/** The cloze note type. `type: 1` is what makes Anki treat it as cloze at all. */
export function mimirClozeNotetype () {
  return {
    name: CLOZE_NOTETYPE_NAME,
    type: 1,
    fields: CLOZE_FIELDS,
    templates: [{
      name: CLOZE_TEMPLATE_NAME,
      qfmt: CLOZE_FRONT_TEMPLATE,
      afmt: CLOZE_BACK_TEMPLATE
    }],
    css: notetypeCss()
  }
}

/** Both note types, in the order they are written into a package. */
export function mimirNotetypes () {
  return [mimirNotetype(), mimirClozeNotetype()]
}
