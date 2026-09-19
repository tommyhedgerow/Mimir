#!/usr/bin/env node
/**
 * Check the Mimir skin before it reaches the app.
 *
 * AN INK CAN ONLY FAIL IN TWO WAYS, and both are catchable here rather than in the
 * interface.
 *
 * The first is ILLEGIBILITY. A skin that sets warm paper under warm ink looks right in a
 * swatch and unreadable on a page; a palette tuned for a note in Obsidian is not
 * automatically tuned for a chat column with hairlines and small mono labels. So every
 * pair that actually carries text is measured against the WCAG contrast floor, in both
 * schemes, and the run fails if one of them is below it.
 *
 * The second is A NAME THE APP DOES NOT KNOW. A CSS custom property that nobody reads is
 * silently ignored: no error, no warning, no clue — the token simply is not there, and
 * the element it was meant to ink keeps the product's colour. That is the same class of
 * lie as a control whose setting does not survive a reload, so the names are checked
 * against the set the installed DSH actually defines, when that bundle can be read. If it
 * cannot, the check says so rather than passing quietly.
 *
 * Usage:  node Tools/test-mimir-skin.mjs
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
/** The skin's own package directory: both halves are built from it, into it. */
const PACKAGE_DIR = join(ROOT, 'preset', 'mimir-skin')
const HARNESS =
  process.env.DSH_HOME ??
  join(process.env.HOME ?? '', 'Library', 'Application Support', 'dsh-desktop', 'harness')

/**
 * Load the skin's source with its one page-supplied import stubbed.
 *
 * The source imports React, which exists only on the page's module table — so it cannot be
 * imported here as it stands. What is under test on this side is the palette function and
 * the board's parsing, neither of which touches React, so the import alone is replaced.
 * The SHIPPED bundle is verified separately below, loaded exactly as the page loads it,
 * with the require table stubbed instead.
 */
const SOURCE_PATH = join(PACKAGE_DIR, 'client.mjs')
/**
 * The React the skin is given in both stubs: a recording createElement plus the two hooks
 * the header control uses. The component then builds a tree instead of DOM, so what it
 * would draw — and what a click would call — can be asserted without a browser, and the
 * same object serves the source import and the shipped bundle's `require('react')`.
 */
const RECORDING_REACT = {
  createElement: (type, props, ...kids) => ({
    type,
    props: props ?? {},
    kids: kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false),
  }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
}

const scratch = await mkdtemp(join(tmpdir(), 'mimir-skin-'))
const patched = join(scratch, 'client.mjs')
await writeFile(
  patched,
  (await readFile(SOURCE_PATH, 'utf8'))
    .replace(/^import React from 'react'$/m, 'const React = globalThis.__RECORDING_REACT__')
    /* The curtain mounts on a React root of its own; nothing here drives that path, so the
       root is stubbed to the two calls `apply` makes on it. */
    .replace(
      /^import \{ createRoot \} from 'react-dom\/client'$/m,
      'const createRoot = () => ({ render() {}, unmount() {} })',
    ),
)
globalThis.__RECORDING_REACT__ = RECORDING_REACT
const { askedOf, AskedRow, boardOf, BoardRow, MimirControls, MimirHeroMark, SIZE_STEPS, THEME_STEPS, tokensFor } =
  await import(pathToFileURL(patched).href)
await rm(scratch, { recursive: true, force: true })

/** Every node in a recorded element tree. */
function walk(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  out.push(node)
  for (const kid of node.kids ?? []) walk(kid, out)
  return out
}

/** The nodes of one class name. */
function withClass(tree, className) {
  return walk(tree).filter((node) => String(node.props?.className ?? '').split(/\s+/).includes(className))
}

/** All the text under a node, joined. */
function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node === null || typeof node !== 'object') return ''
  return (node.kids ?? []).map(textOf).join('')
}

let passed = 0
let failed = 0

function check(label, ok, detail) {
  if (ok) {
    passed += 1
    return
  }
  failed += 1
  console.log(`  FAIL  ${label}${detail === undefined ? '' : ' — ' + detail}`)
}

/* ── the palette, and the layer built from it ─────────────────────────────── */

const palette = JSON.parse(await readFile(join(ROOT, 'Tools', 'mimir-tokens.json'), 'utf8'))
const tokens = tokensFor(palette)

/* ── shape: every entry is a pair of two non-empty strings ────────────────── */

const entries = Object.entries(tokens)
check('the layer is not empty', entries.length > 0)
for (const [name, pair] of entries) {
  check(`${name} starts with --`, name.startsWith('--'), name)
  check(
    `${name} is a { light, dark } pair of strings`,
    typeof pair === 'object' &&
      pair !== null &&
      typeof pair.light === 'string' &&
      pair.light.length > 0 &&
      typeof pair.dark === 'string' &&
      pair.dark.length > 0,
    JSON.stringify(pair),
  )
}

/* ── no value names a Mimir role that the palette does not hold ───────────── */

for (const [name, pair] of entries) {
  for (const [scheme, value] of Object.entries(pair)) {
    if (!value.startsWith('#')) continue
    check(`${name} (${scheme}) is a hex colour`, /^#[0-9a-f]{6}$/i.test(value), value)
  }
}

/* ── legibility: every pair that carries text, measured ───────────────────── */

/** WCAG relative luminance of an `#rrggbb` colour. */
function luminance(hex) {
  const channel = (offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
function contrast(one, two) {
  const [high, low] = [luminance(one), luminance(two)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

/** The floor for a sentence. Anything a reader has to read to understand the lesson. */
const TEXT_FLOOR = 4.5
/** The floor for a mark: an icon, an indicator, a border that carries meaning without
    being read as prose. */
const MARK_FLOOR = 3

/** Grounds a page actually paints, and the inks the layer puts on them.
    The floor is per row because a warning's *word* and a warning's *mark* are not the
    same kind of thing, and holding both to the same number would either pass an
    unreadable sentence or reject a legible icon. */
const measured = [
  /* Every ink on every stock. The third ink is measured on the raised surfaces as well as
     on the page, because that is where the product paints captions and metadata — and a
     palette whose third ink only cleared the floor on the lightest stock is exactly the
     fault this list was widened to catch. (It caught it: `ink-3` measured 3.87:1 on
     paper-3 and the palette was corrected at the source.) */
  ['ink on paper (the body of a page)', 'ink', 'paper', TEXT_FLOOR],
  ['ink-2 on paper (secondary)', 'ink-2', 'paper', TEXT_FLOOR],
  ['ink-3 on paper (tertiary: meta, captions)', 'ink-3', 'paper', TEXT_FLOOR],
  ['ink on paper-2 (a raised surface)', 'ink', 'paper-2', TEXT_FLOOR],
  ['ink-2 on paper-2 (secondary on a surface)', 'ink-2', 'paper-2', TEXT_FLOOR],
  ['ink-3 on paper-2 (tertiary on a surface)', 'ink-3', 'paper-2', TEXT_FLOOR],
  ['ink on paper-3 (text on the deepest stock)', 'ink', 'paper-3', TEXT_FLOOR],
  ['ink-2 on paper-3 (secondary on the deepest stock)', 'ink-2', 'paper-3', TEXT_FLOOR],
  ['ink-3 on paper-3 (tertiary on the deepest stock)', 'ink-3', 'paper-3', TEXT_FLOOR],
  ['paper on mark (a label on the accent)', 'paper', 'mark', TEXT_FLOOR],
  ['cyan on paper (a link)', 'cyan', 'paper', TEXT_FLOOR],
  ['cyan on paper-2 (a link on a surface)', 'cyan', 'paper-2', TEXT_FLOOR],
  ['ink on mark-soft (text on the accent wash)', 'ink', 'mark-soft', TEXT_FLOOR],
  ['ink on peach-soft (his own turn)', 'ink', 'peach-soft', TEXT_FLOOR],
  ['ink-2 on peach-soft (secondary in his turn)', 'ink-2', 'peach-soft', TEXT_FLOOR],
  ['mint on paper (a success line)', 'mint', 'paper', TEXT_FLOOR],
  ['ink on paper (a warning line, which the layer sets in ink)', 'ink', 'paper', TEXT_FLOOR],
  ['peach on paper (a warning mark, not a sentence)', 'peach', 'paper', MARK_FLOOR],
  ['mark on paper (the accent used as a mark)', 'mark', 'paper', MARK_FLOOR],
]

for (const [label, ink, ground, floor] of measured) {
  for (const scheme of ['light', 'dark']) {
    const ratio = contrast(palette[scheme][ink], palette[scheme][ground])
    check(
      `${scheme}: ${label}`,
      ratio >= floor,
      `${ratio.toFixed(2)}:1, floor ${floor}:1 (${palette[scheme][ink]} on ${palette[scheme][ground]})`,
    )
  }
}

/* ── every name is one the installed DSH knows ────────────────────────────────
   "Knows" MEANS DEFINED *OR* REFERENCED, and the difference is not pedantry:
   `--dsw-font-mono` is never defined anywhere in the product — every use is
   `var(--dsw-font-mono, <fallback>)` — so it exists only as a hook, and a name in that
   position is still a real override target. A name that appears *nowhere at all* is the
   failure this catches: the browser ignores an unknown custom property in silence, so the
   ink would simply not be applied and nothing would say why. */

const PACKAGES = join(
  '/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai',
)

if (existsSync(PACKAGES)) {
  let known = new Set()
  try {
    const found = execFileSync(
      'grep',
      ['-rhoE', '--include=*.js', '--', '--(dsw|dsh|ds)-[a-z0-9-]+', PACKAGES],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    known = new Set(found.split('\n').filter((line) => line.length > 0))
  } catch (error) {
    /* grep exits non-zero when it matches nothing; that is a result, not a crash. */
    if (error.status !== 1) throw error
  }
  const unknown = Object.keys(tokens).filter(
    /* `--mm-*` are the skin's own names, read only by the skin's own stylesheet, so they
       are known by construction and are not the product's to define. */
    (name) => !name.startsWith('--mm-') && !known.has(name),
  )
  check(
    'every token is one the installed DSH defines or references',
    unknown.length === 0,
    unknown.length === 0 ? `${known.size} names in the product` : `unknown: ${unknown.join(', ')}`,
  )
} else {
  console.log(`  SKIP  the token-name check: no DSH packages at ${PACKAGES}`)
}

/* ── the board: a pure read of the call, in both of its states ──────────────── */

// The row is a pure function of the tool call, so it can be checked without a browser:
// what it must never do is throw on a shape it did not expect, because whatever a row
// does wrong, the lesson underneath is untouched — and a thrown row is a blank space in
// the conversation where the lesson should be.

const SETTLED = {
  meta: {
    nodes: [
      { node: 'Summer drought is the defining constraint', state: 'held' },
      { node: 'Drought decides leaf size', state: 'learning' },
    ],
    hint: 'Answer from what the summer is doing to the water.',
    question: 'Which of these is an unconditional truth?',
    options: ['They are all evergreen', 'They all survive summer drought'],
    drawings: [{ name: 'mediterranean-map.svg', svg: '<svg/>', missing: false, note: '' }],
  },
}

const settled = boardOf(SETTLED)
check('a settled board keeps its nodes', settled?.nodes.length === 2)
check('a settled board keeps its question and options', settled?.options.length === 2 && settled?.question.length > 0)
check('a settled board keeps its drawings', settled?.drawings.length === 1)

const RUNNING = {
  kind: 'running',
  call: {
    name: 'mimir_board',
    argsRaw: JSON.stringify({ spine: [{ node: 'A', state: 'planned' }], hint: 'one line', visuals: ['x.svg'] }),
  },
}
const running = boardOf(RUNNING)
check('a running board is read from the committed arguments', running?.nodes.length === 1)
check('a running board has no drawings yet, and says so by having none', running?.drawings.length === 0)
check('a running board still carries the hint', running?.hint === 'one line')

check('a call with unparseable arguments yields nothing rather than throwing', boardOf({ call: { argsRaw: '{' } }) === null)
check('a call that is not a board yields nothing', boardOf({ call: { argsRaw: '{"path":"a.md"}' } }) === null)
check('a block with no meta and no call yields nothing', boardOf({}) === null)
check('nothing at all yields nothing', boardOf(undefined) === null)
check(
  'a meta without nodes falls back to the arguments rather than rendering empty',
  boardOf({ ...RUNNING, meta: { hint: 'stale' } })?.nodes.length === 1,
)
check(
  'a missing drawing is carried as missing, not dropped',
  boardOf({ meta: { nodes: [], drawings: [{ name: 'gone.svg', svg: '', missing: true, note: 'no such drawing' }] } })
    ?.drawings.length === 1,
)

/* ── what the row actually draws ────────────────────────────────────────────── */

// The row is the surface he reads the lesson from, so what it draws is checked rather
// than assumed: the question card, the options as claims, the spine with each node's
// state, the drawings, and — the one that matters most — a drawing that is missing being
// SAID to be missing, because a silently blank panel is a lesson pointing at nothing.

const drawn = BoardRow({ block: SETTLED })
check('the row draws a board', withClass(drawn, 'mm-board').length === 1)
check('it draws the label as furniture', textOf(withClass(drawn, 'mm-board__label')[0]) .includes('the lesson'))
check('it draws the question in the card', textOf(withClass(drawn, 'mm-question__text')[0]).length > 0)
check('it draws one option per option', withClass(drawn, 'mm-option').length === 2)
check('it draws the hint', textOf(withClass(drawn, 'mm-hint')[0]).includes('summer'))
check('it draws one spine row per node', withClass(drawn, 'mm-node').length === 2)
check(
  'each spine row carries its state for the stylesheet',
  withClass(drawn, 'mm-node').map((node) => node.props['data-state']).join(',') === 'held,learning',
)
check('it draws the drawing as an image', withClass(drawn, 'mm-drawing').length === 1)
check(
  'the drawing is a data URI, which cannot run a script in the page',
  String(walk(drawn).find((node) => node.type === 'img')?.props?.src ?? '').startsWith('data:image/svg+xml'),
)
check(
  'no part of the row injects raw markup',
  walk(drawn).every((node) => node.props?.dangerouslySetInnerHTML === undefined),
)

const withMissing = BoardRow({
  block: {
    meta: {
      nodes: [],
      drawings: [{ name: 'gone.svg', svg: '', missing: true, note: 'no such drawing' }],
    },
  },
})
check(
  'a missing drawing is named as missing in the row',
  textOf(withClass(withMissing, 'mm-drawing__note')[0]).includes('not shown'),
)
check('a missing drawing draws no image', walk(withMissing).every((node) => node.type !== 'img'))

const dry = BoardRow({ block: { meta: { nodes: [], hint: '', question: '', options: [], drawings: [] } } })
check('a board with nothing on it still draws its label', withClass(dry, 'mm-board').length === 1)
check('a board with nothing on it draws no question card', withClass(dry, 'mm-question').length === 0)
check('a call that is not a board draws nothing at all', BoardRow({ block: {} }) === null)

/* ── the ask row: a record, and deliberately not a second question ──────────── */

// The answer controls are the product's composer card. This row only records what was
// asked and what he said, so the check that matters most is the one asserting it does NOT
// re-render the options once the question is settled: a third rendering of the same
// question, in the same scroll, is the noise this row exists to avoid.

const ASK_ARGS = JSON.stringify({
  questions: [
    {
      id: 'q1',
      question: 'Which of these is an unconditional truth?',
      options: ['They are all evergreen', 'They all survive summer drought'],
    },
  ],
})

const asking = askedOf({ kind: 'running', call: { name: 'ask_user_question', argsRaw: ASK_ARGS } })
check('a running ask is recognised', asking !== null)
check('a running ask is not settled', asking?.settled === false)
check('a running ask carries no answers', asking?.answers === null)

const settledAsk = askedOf({
  call: { name: 'ask_user_question', argsRaw: ASK_ARGS },
  content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: ['They all survive summer drought'] }] }) }],
})
check('a settled ask is settled', settledAsk?.settled === true)
check('a settled ask reads the answer back', settledAsk?.answers?.get('q1')?.selected[0] === 'They all survive summer drought')

check('a call that is not an ask yields nothing', askedOf({ call: { argsRaw: '{"path":"a.md"}' } }) === null)
check('an ask with no questions yields nothing', askedOf({ call: { argsRaw: '{"questions":[]}' } }) === null)
check('unparseable ask arguments yield nothing rather than throwing', askedOf({ call: { argsRaw: '[' } }) === null)

const askDrawn = AskedRow({ block: { kind: 'running', call: { name: 'ask_user_question', argsRaw: ASK_ARGS } } })
check('the waiting record says it is waiting', textOf(withClass(askDrawn, 'mm-ask__eyebrow')[0]).includes('waiting'))
check('the waiting record carries the question', textOf(withClass(askDrawn, 'mm-ask__text')[0]).includes('unconditional'))
check(
  'the waiting record does NOT re-render the options',
  !textOf(askDrawn).includes('They are all evergreen'),
)
check('the waiting record is marked for the stylesheet', askDrawn.props['data-waiting'] === 'true')

const answeredDrawn = AskedRow({
  block: {
    call: { name: 'ask_user_question', argsRaw: ASK_ARGS },
    content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: ['They all survive summer drought'] }] }) }],
  },
})
check('the settled record says it was answered', textOf(withClass(answeredDrawn, 'mm-ask__eyebrow')[0]).includes('answered'))
check('the settled record shows what he said', textOf(withClass(answeredDrawn, 'mm-ask__answer')[0]).includes('survive summer drought'))
check('the settled record does not repeat the question', !textOf(answeredDrawn).includes('They are all evergreen'))
check('the settled record is marked for the stylesheet', answeredDrawn.props['data-waiting'] === 'false')

const customDrawn = AskedRow({
  block: {
    call: { name: 'ask_user_question', argsRaw: ASK_ARGS },
    content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: [], custom: 'because the water' }] }) }],
  },
})
check('a typed answer is shown as his words', textOf(withClass(customDrawn, 'mm-ask__answer')[0]).includes('because the water'))

const silent = AskedRow({
  block: {
    call: { name: 'ask_user_question', argsRaw: ASK_ARGS },
    content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: [] }] }) }],
  },
})
check('an empty answer is said to be empty, not left blank', textOf(withClass(silent, 'mm-ask__answer')[0]).includes('no answer recorded'))

const notAnAsk = AskedRow({ block: { meta: { nodes: [] } } })
check('the ask row draws nothing for a block that has no questions', notAnAsk === null)

/* ── the second column: what it hangs on, and what it must never hang on ────── */

// The product floats the composer over the bottom of the transcript, and the fix is a row
// over the two regions. Those regions are found by STABLE ATTRIBUTES, never by the hashed
// module classes beside them — a hashed class is a name that changes when the product is
// rebuilt, and a layout rule keyed to one would silently stop applying while looking fine
// in review. So the check is two-sided: it must name the hooks, and it must not name a
// hash.

const { BOARD_CSS, clampColumn, COLUMN_MAX, COLUMN_MIN, TRANSCRIPT_MIN } = await import(pathToFileURL(patched).href)

check('the layout targets the scroll container', BOARD_CSS.includes('[data-conversation-scroll]'))
check('the layout targets the composer seat', BOARD_CSS.includes('[data-composer-seat]'))
check('the layout targets the transcript wrapper', BOARD_CSS.includes('[data-slot="conversation.session"]'))
check('the container becomes a row', /\[data-conversation-scroll\][^{]*\{[^}]*flex-direction:\s*row/.test(BOARD_CSS))
check('the seat stops being an overlay', /position:\s*sticky\s*!important/.test(BOARD_CSS))
check('and is held at the foot of its column', BOARD_CSS.includes('align-self: flex-end'))
check('and sticks to the bottom edge', /bottom:\s*0\s*!important/.test(BOARD_CSS))
/* Every edge answered on its own terms. A shorthand followed by a bare `bottom` is exactly
   how the box ended up at the foot of a transcript-length column: `inset: auto !important`
   reset all four edges WITH importance, so the later `bottom` lost to it and sticky had no
   edge to hold. */
for (const edge of ['top', 'right', 'left', 'bottom']) {
  check(
    `the ${edge} edge is answered on its own terms`,
    new RegExp(`${edge}:\\s*(auto|0)\\s*!important`).test(BOARD_CSS),
  )
}
check('and no shorthand resets them behind the important ones', !/inset:\s*auto/.test(BOARD_CSS))
check('and the room reserved for that overlay is given back', BOARD_CSS.includes('--dsh-composer-height: 0px !important'))
/* The blank-session hero is the product's layout to keep: it centres the composer in an
   empty screen deliberately, and two columns there drop it into a corner. So every rule that
   reshapes the conversation must be scoped to a session that has one. */
/* The column is capped at the height the conversation actually occupies, which the product
   measures and publishes. A viewport unit was the wrong ceiling by the height of everything
   above the conversation, so a tall question card ran off the bottom of the screen. */
check(
  'the composer column is capped at the conversation height, not the window',
  BOARD_CSS.includes('var(--dsh-conversation-viewport-height'),
)
check('and it scrolls inside itself', /\[data-phase="active"\] \[data-conversation-scroll\] > \[data-composer-seat\][^{]*\{[^}]*overflow-y:\s*auto/.test(BOARD_CSS))
/* THE ONLY CEILING THAT CANNOT FAIL. The product publishes the scroller's measured height as
   a variable, and a stale one is larger than the row — and this column is aligned to the
   row's FOOT, so anything taller than the row escapes the top of it, which is the one
   direction the row cannot scroll to. 100% resolves against the scrollBody's content box,
   which is the row, so the cap has to be the smaller of the two. */
check('the column is bounded by the row as well as by the measured height', /max-height:\s*min\(100%,\s*var\(--dsh-conversation-viewport-height/.test(BOARD_CSS))
/* THE BOX SPANS THE COLUMN, AND THAT IS WHAT KEEPS A MENU WHOLE. A scroll container clips in
   every direction, and the composer's own menus open upward out of a box docked at the foot
   of the screen — measured 2026-09-19, the permission chip's menu drew three rows and exactly
   one of them was visible, cut at the column's top edge, because the seat's box was only as
   tall as its content. So the box is given the column's own height, and the content is held
   at the foot of it; `safe` is what stops a question card taller than the box from
   overflowing above its top, which is the one direction the column cannot scroll to. */
check(
  'the column box spans the whole column, so a menu that opens upward stays inside it',
  /\[data-phase="active"\] \[data-conversation-scroll\] > \[data-composer-seat\][^{]*\{[^}]*min-height:\s*100%/.test(BOARD_CSS),
)
check(
  'and its content is held at the foot without ever overflowing above the box',
  /justify-content:\s*safe flex-end/.test(BOARD_CSS),
)
check(
  'and its own end of scroll does not drag the transcript behind it',
  /\[data-phase="active"\] \[data-conversation-scroll\] > \[data-composer-seat\][^{]*\{[^}]*overscroll-behavior:\s*contain/.test(BOARD_CSS),
)
check('the column is scoped to a session with content', BOARD_CSS.includes('[data-phase="active"] [data-conversation-scroll]'))

/* ── the seam: one width, two readers ─────────────────────────────────────────
   The column's width and the seam's position are two readings of ONE number, so they are
   written once — a custom property on the row — and both rules have to read the same
   expression. If one of them is edited alone the boundary and the column drift apart, and a
   drag starts grabbing a place the column is not. */

const COLUMN_EXPRESSION = 'var(--mm-column, clamp(300px, 32%, 460px))'
const seatRules = rulesFor(BOARD_CSS, '[data-conversation-scroll] > [data-composer-seat] {')
check('the column takes its width from the remembered property', seatRules.some((rule) => rule.includes(`flex: 0 0 ${COLUMN_EXPRESSION}`)), seatRules.join(' | '))
const rowRule = rulesFor(BOARD_CSS, ':has(> [data-composer-seat]) {')[0] ?? ''
check('the row the two columns live in is a positioning context', /position:\s*relative/.test(rowRule), rowRule)
const gripRule = BOARD_CSS.split('\n').find((line) => line.startsWith('.mm-grip{')) ?? ''
check('the seam sits on the same expression the column is sized by', gripRule.includes(`left:calc(100% - ${COLUMN_EXPRESSION})`), gripRule)
check('and it is grabbable', /cursor:\s*col-resize/.test(gripRule) && /position:\s*absolute/.test(gripRule), gripRule)
check('it draws nothing at rest, so the hairline is still the column\'s own', /\.mm-grip:after\{[^}]*opacity:\s*0/.test(BOARD_CSS))
/* TWO THINGS A SEAM DOES NOT GET FOR FREE, each found by measuring rather than by review.
   The product gives the composer seat z-index 7 — 9 while one of its menus is open — so a seam
   painted under it is a seam the pointer never reaches: elementFromPoint at the seam returned
   the seat, and the drag never started. And the product's boxes are content-box while this
   column carries a border and a gutter, so a basis the drag writes is not the width the drag
   reads, and the column creeps eleven pixels outwards on every drag. Both are one declaration
   and both are load-bearing. */
check('the seam out-paints the column it divides', /\.mm-grip\{[^}]*z-index:\s*10/.test(BOARD_CSS), gripRule)
check(
  'and the column is measured as the number the drag writes to it',
  seatRules.some((rule) => /box-sizing:\s*border-box/.test(rule)),
  seatRules.join(' | '),
)
/* ONE BOUNDARY, ONE CONTROL. The product draws its own pair of strips that change the chat's
   CONTENT width, and its right-hand one lands where the seam is: two controls for one edge, and
   the grab he means goes to the one he does not. It is turned off by the attribute the product
   types on the element — the same kind of hook the rest of this layout uses, never the hashed
   class beside it — and scoped to a conversation with content, so the blank-session screen
   keeps the product's own layout. */
check(
  'the product\'s own width strips are turned off, and by their stable hook',
  /\[data-phase="active"\] \[data-width-handle\]\s*\{\s*display:\s*none\s*!important/.test(BOARD_CSS),
)
check(
  'and shows itself on hover, on focus and while a drag is in progress',
  /\.mm-grip:hover:after[^{]*\.mm-grip:focus-visible:after[^{]*\.mm-grip\[data-dragging=true\]:after/.test(BOARD_CSS),
)

/* The rule a drag obeys. A seam that stops following the pointer at an impossible width reads
   as broken, so the drag is CLAMPED rather than refused — and the numbers are the whole of it:
   a floor for the composer, and the transcript's own floor taken off the row for the ceiling. */
check('a drag within the rules is honoured exactly, with no doubling', clampColumn(420, 1400) === 420, String(clampColumn(420, 1400)))
check('a drag past the left edge stops at the composer\'s floor', clampColumn(10, 1400) === COLUMN_MIN, String(clampColumn(10, 1400)))
check('and one past the right edge leaves the transcript its own floor', clampColumn(4000, 1000) === 1000 - TRANSCRIPT_MIN, String(clampColumn(4000, 1000)))
check('a row wide enough for the ceiling stops at the ceiling', clampColumn(4000, 2400) === COLUMN_MAX, String(clampColumn(4000, 2400)))
check('a row too narrow for both floors still gives the composer its floor', clampColumn(4000, 500) === COLUMN_MIN, String(clampColumn(4000, 500)))
check('and a drag with no measurement lands on the floor, not on NaN', clampColumn(Number.NaN, 1400) === COLUMN_MIN && clampColumn(400, Number.NaN) === 400, `${clampColumn(Number.NaN, 1400)} / ${clampColumn(400, Number.NaN)}`)
const unscopedColumn = BOARD_CSS.split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('[data-conversation-scroll]'))
check(
  'and no column rule is left unscoped, so the hero keeps its own layout',
  unscopedColumn.length === 0,
  unscopedColumn.join(' | '),
)

/* ── the transcript's own height, which is what keeps the column on screen ───── */

// Sticky resolves against the scrollport's CONTENT box, and the row is as tall as its
// taller column — so a transcript sized to its content leaves the composer column's static
// position at the foot of a box thousands of pixels tall, where `bottom: 0` pins it. That
// is the bug this rule fixes: measured in Chrome at 1400x900 with a ten-turn transcript,
// the chat box sat at −1090px scrolled to the middle and at −2856px at the foot.
//
// It cannot be caught by drawing the tree or by reading a class, so what is checked is the
// rule that carries it: a height, a scroller of its own, and the scroll chaining that would
// otherwise hand a wheel at the end of the transcript back to the wrapper — whose content
// is now exactly the viewport, so chaining there would move the pinned column off screen.
// The absence of a contradicting height is the other half: `height: auto` is what the
// product sets inside a scroll container, and it must not be left standing beside this.
//
// AND THAT RULE HAS TO LAND ON A BOX. Every slot outlet is drawn with `display: contents` —
// the renderer's ANCHOR_STYLE, "the anchor is purely addressable surface", so flex and grid
// parents see the slot's own children — and an element with no principal box ignores its own
// height, flex and overflow entirely. So the sizing is asserted twice, on purpose: once on
// the wrapper, which is what the rule MEANS and what holds again if the anchor ever becomes a
// box, and once on the slot's own child, which is the element that is actually the flex item
// of the row and actually scrolls. Measured in the running app on 2026-09-19, with only the
// wrapper named: the transcript's child was 6961px tall and the seat sat at −5364px at the
// foot of the conversation, visible only with the scroller at the very top — the fault a
// string-level check cannot see, which is why the box is named in the check as well.

/** Every declaration block whose selector list contains `selector`, with its whitespace flattened. */
function rulesFor(sheet, selector) {
  const found = []
  const text = sheet.replace(/\s+/g, ' ')
  let at = text.indexOf(selector)
  while (at !== -1) {
    const open = text.indexOf('{', at)
    const close = text.indexOf('}', open)
    if (open === -1 || close === -1) break
    found.push(text.slice(open + 1, close).trim())
    at = text.indexOf(selector, close)
  }
  return found
}

/* The trailing `{` is what tells the wrapper's rule from the child's: the child's selector
   contains the wrapper's whole text and then `> *`, so each is asked for by its own tail. */
const TRANSCRIPT = '[data-conversation-scroll] > [data-slot="conversation.session"]'
const wrapperRules = rulesFor(BOARD_CSS, TRANSCRIPT + ' {')
const boxRules = rulesFor(BOARD_CSS, TRANSCRIPT + ' > * {')
check('the transcript wrapper carries a rule of its own', wrapperRules.length === 1, String(wrapperRules.length))
check('and the box that can be sized carries the same rule', boxRules.length === 1, String(boxRules.length))
const transcript = wrapperRules[0] ?? ''
const transcriptBox = boxRules[0] ?? ''
check('the transcript wrapper is given the height of the space it is drawn in', /(^|;\s*)height:\s*100%/.test(transcript), transcript)
check('and the box that acts is given the same height', /(^|;\s*)height:\s*100%/.test(transcriptBox), transcriptBox)
check('the wrapper states the scroller it means to be', /(^|;\s*)overflow-y:\s*auto/.test(transcript), transcript)
check('and the box that acts actually scrolls', /(^|;\s*)overflow-y:\s*auto/.test(transcriptBox), transcriptBox)
check(
  'and does not hand its end-of-scroll wheel back to the wrapper',
  /(^|;\s*)overscroll-behavior:\s*contain/.test(transcriptBox),
  transcriptBox,
)
check(
  'the product\'s content-tall floor is answered with importance, not outbid',
  /(^|;\s*)min-height:\s*0\s*!important/.test(transcriptBox),
  transcriptBox,
)
check(
  'and so is the overlay variant\'s overflow: hidden, which would strand a waiting question',
  /(^|;\s*)overflow-y:\s*auto\s*!important/.test(transcriptBox),
  transcriptBox,
)
check(
  'and no rule leaves the transcript content-tall, which is what took the column off screen',
  !/(^|;\s*)height:\s*auto/.test(transcriptBox),
  transcriptBox,
)

/* The hashed-class guard. A CSS-module class is a mixed-case alphanumeric prefix, a single
   underscore, then the local name — `EvIC1a_root`, `wSkVaW_scrollBody`, `CY-8Ka_card`. The
   uppercase letter in the prefix is what tells it apart from this skin's own classes, which
   are all lowercase and separated with `__` and `--`. If one ever appears in a SELECTOR, a
   rule is pinned to a build rather than to a hook, and it will stop applying without saying
   so. Comments are read out before the scan, because the one place a hashed name belongs is
   the note that says which product rule a declaration is answering — the transcript's cap
   names the overlay rule it outbids, and a reader who wants to re-check it needs the name. */
const rulesOnly = BOARD_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')
const hashedClass = rulesOnly.match(/\.[A-Za-z0-9]*[A-Z][A-Za-z0-9]*_[a-z][A-Za-z0-9]*/g) ?? []
check(
  'no rule hangs on a hashed product class',
  hashedClass.length === 0,
  hashedClass.slice(0, 4).join(', '),
)

/* ── the hero mark: it replaces the shipped one, so it must behave ──────────── */

const heroMark = MimirHeroMark({ size: 40, className: 'host-geometry' })
check('the mark is the rune the teacher signs with', textOf(heroMark) === '\u16d7', textOf(heroMark))
check('it honours the requested edge', heroMark.props.style.width === '40px' && heroMark.props.style.height === '40px')
check('and the host class that keeps the surrounding geometry', heroMark.props.className === 'host-geometry')
check('and is decorative rather than something to read out', heroMark.props['aria-hidden'] === 'true')
check('a missing size still draws a mark', MimirHeroMark({}).props.style.width.endsWith('px'))

/* ── the startup piece: which build, when it plays, and what it draws ───────── */

// The piece is one artwork with two builds that are NOT the same object — the light one is an
// alpha layer over its own paper and the dark one is an additive glow that never reaches zero
// alpha — so the ground it is painted on has to be the ground it was rendered on, or the
// curtain shows as a slightly wrong rectangle. These checks pin the choice and the timing;
// they cannot pin how it looks, which is his.

const splash = await import(pathToFileURL(patched).href)

check('the dark scheme takes the dark master', splash.splashBuildFor('dark').video.endsWith('.mp4'))
check('the light scheme takes the light alpha layer', splash.splashBuildFor('light').video.endsWith('.webm'))
check('an unknown scheme falls to the light build', splash.splashBuildFor(undefined).ground === splash.SPLASH.light.ground)
check('each build carries the ground it was rendered on', splash.SPLASH.dark.ground === '#040106' && splash.SPLASH.light.ground === '#d2cad7')
check('both builds read the vault\'s own files', Object.values(splash.SPLASH).every((build) => build.video.startsWith('Tools/splash/') && build.poster.startsWith('Tools/splash/')))

const greeted = new Set()
check('a blank Mimir session is greeted', splash.shouldSplash(greeted, 's1', true) === true)
greeted.add('s1')
check('and never greeted twice on one page', splash.shouldSplash(greeted, 's1', true) === false)
check('a session already under way is not greeted', splash.shouldSplash(greeted, 's2', false) === false)
check('a snapshot with no blank flag still greets', splash.shouldSplash(greeted, 's3', undefined) === true)
check('no session, no greeting', splash.shouldSplash(new Set(), undefined, true) === false)

const curtain = splash.SplashCurtain({ video: 'blob:v', poster: 'blob:p', ground: '#040106', reduced: false, onDone: () => {} })
check('the curtain paints the ground before its first frame', curtain.props.style.backgroundColor === '#040106')
check('and carries the clip', walk(curtain).some((node) => node.type === 'video'))
check('and the poster the clip falls back to', walk(curtain).some((node) => node.type === 'img' && node.props.src === 'blob:p'))
check('and stays deaf to the pointer', withClass(curtain, 'mm-splash').length === 1)
check(
  'the clip is muted and inline, so a browser will autoplay it',
  walk(curtain).find((node) => node.type === 'video')?.props.muted === true &&
    walk(curtain).find((node) => node.type === 'video')?.props.playsInline === true,
)

const quiet = splash.SplashCurtain({ video: 'blob:v', poster: 'blob:p', ground: '#d2cad7', reduced: true, onDone: () => {} })
check('under reduced motion the clip is not drawn at all', !walk(quiet).some((node) => node.type === 'video'))
check('and the still frame is shown instead', walk(quiet).some((node) => node.type === 'img'))

check('the curtain has a stylesheet of its own', BOARD_CSS.includes('.mm-splash'))

/* ── the header control: one click each, and it reads the real service ──────── */

// The product already has both settings; what this adds is one click. So the checks are:
// it draws the state it READ (not a copy), it steps the theme round the cycle, and it
// steps the size inside the product's own integer range — because `setFontSize` refuses
// anything outside 12..17 and a control that can produce a refused value is a control that
// silently does nothing.

function controlsWith(preference, fontSize) {
  const calls = []
  const component = MimirControls({
    theme: {
      read: () => ({ preference, fontSize }),
      watch: () => () => {},
      setTheme: (id) => calls.push(['theme', id]),
      setSize: (px) => calls.push(['size', px]),
    },
  })
  const buttons = walk(component).filter((node) => node.type === 'button')
  return { calls, buttons, component }
}

check('every step the size control offers is one the product accepts', SIZE_STEPS.every((px) => Number.isInteger(px) && px >= 12 && px <= 17), SIZE_STEPS.join(', '))
check('the theme control cycles through the product\'s own preferences', THEME_STEPS.join(',') === 'light,dark,system', THEME_STEPS.join(','))

const light = controlsWith('light', 15)
check('the control draws two buttons', light.buttons.length === 2, `buttons: ${light.buttons.length}`)
check('the theme button names the theme in force', String(light.buttons[0]?.props.title ?? '').includes('light'))
check(
  'and names what the next click will do',
  String(light.buttons[0]?.props.title ?? '').includes('dark'),
  light.buttons[0]?.props.title,
)
light.buttons[0]?.props.onClick()
check('clicking the theme button writes the next theme', JSON.stringify(light.calls) === JSON.stringify([['theme', 'dark']]), JSON.stringify(light.calls))

const dark = controlsWith('dark', 15)
check('a dark session draws the moon', String(dark.buttons[0]?.props['aria-label'] ?? '').includes('dark'))
dark.buttons[0]?.props.onClick()
check('and the next click is the system preference', JSON.stringify(dark.calls) === JSON.stringify([['theme', 'system']]), JSON.stringify(dark.calls))

const system = controlsWith('system', 15)
system.buttons[0]?.props.onClick()
check('the system preference cycles back to light', JSON.stringify(system.calls) === JSON.stringify([['theme', 'light']]), JSON.stringify(system.calls))

const small = controlsWith('light', 13)
check('the size button reports the size in force in its title', String(small.buttons[1]?.props.title ?? '').includes('13px'))
check('and carries one dot per step', withClass(small.buttons[1], 'mm-icon__dot').length === 3)
check(
  'and does not print the number on its face',
  !textOf(small.buttons[1]).includes('13'),
  textOf(small.buttons[1]),
)
check(
  'the smallest step lights the first dot',
  withClass(small.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(',') === 'true,,',
  withClass(small.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(','),
)
small.buttons[1]?.props.onClick()
check('clicking the size button steps up the ladder', JSON.stringify(small.calls) === JSON.stringify([['size', 15]]), JSON.stringify(small.calls))

const mid = controlsWith('light', 15)
check(
  'a middle size lights the middle dot',
  withClass(mid.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(',') === ',true,',
  withClass(mid.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(','),
)
const top = controlsWith('light', 17)
check(
  'the largest step lights the last dot',
  withClass(top.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(',') === ',,true',
  withClass(top.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(','),
)
/* 14 is the product's own default and sits between two steps: a control that showed no
   state at all there would be at its least useful exactly when it is first met. */
const between = controlsWith('light', 14)
check(
  'a size between two steps lights the nearest, ties to the lower',
  withClass(between.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(',') === 'true,,',
  withClass(between.buttons[1], 'mm-icon__dot').map((dot) => dot.props['data-on']).join(','),
)
/* The second A is drawn at the size in force, so the mark differs between steps: 11, 13
   and 15 pixels for 13, 15 and 17. */
const aAt = (controls) =>
  walk(controls.buttons[1])
    .map((node) => node.props?.style?.fontSize)
    .filter((value) => typeof value === 'string')
check('the size mark is drawn at the size in force', aAt(small)[0] === '11px' && aAt(mid)[0] === '13px', `${aAt(small)} / ${aAt(mid)}`)

const large = controlsWith('light', 17)
large.buttons[1]?.props.onClick()
check('at the top of the ladder it rounds to the bottom', JSON.stringify(large.calls) === JSON.stringify([['size', 13]]), JSON.stringify(large.calls))

const offLadder = controlsWith('light', 14)
offLadder.buttons[1]?.props.onClick()
check(
  'a size set elsewhere on the ladder steps to the next one up, not to a refused value',
  JSON.stringify(offLadder.calls) === JSON.stringify([['size', 15]]),
  JSON.stringify(offLadder.calls),
)

const bare = MimirControls({})
check('the control draws nothing without the service rather than throwing', bare === null)

/* ── the SHIPPED bundle, driven the way the page drives it ────────────────────
   The source passing means little on its own: what reaches the app is the wrapped
   bundle, and this vault has already lost an evening to a correct source sitting beside
   a stale installed copy. So the installed artifact is loaded into a stubbed module
   loader with a stubbed theme service, `apply` is called, and the layer it stacks is
   compared with the one the source produces. */

const installedBundle = join(PACKAGE_DIR, 'lib', 'client.js')

if (existsSync(installedBundle)) {
  const source = await readFile(installedBundle, 'utf8')
  let plugin = null

  const previous = globalThis.window
  globalThis.window = {
    __ModuleLoader__: {
      load: ({ factory }) => {
        plugin = factory((id) => {
          if (id === 'react') return RECORDING_REACT
          if (id === 'react-dom/client') return { createRoot: () => ({ render() {}, unmount() {} }) }
          throw new Error(`the skin required '${id}', which the page's table is not stubbed for`)
        })
      },
    },
  }
  try {
    new Function(source)()
  } finally {
    /* keep the stub for the assertions below, but do not leak it past this process */
  }

  /* The splash must ask for the WHOLE file. The workspace reader's `read` returns a page
     sized by the Host's cap; a page of a megabyte of video is a decodable-looking prefix,
     the player rejects it, and the curtain's error path lifts it — a silent failure in which
     every part behaved as written. `readAll` is the complete read. */
  check('the splash asks for the whole file, not a page', source.includes('workspaceFiles.readAll'))
  check('and never the paged read', !/workspaceFiles\.read\(/.test(source))

  check('the bundle registers a plugin', plugin !== null && typeof plugin.apply === 'function')
  check('the bundle declares the theme as required', Array.isArray(plugin?.inject) && plugin.inject.includes('theme'))
  check('the bundle declares the session list as required', Array.isArray(plugin?.inject) && plugin.inject.includes('sessions'))

  /* The seam is a control, not a div with a pointer handler: a separator with a value is
     something a screen reader can report and a keyboard can move, and both of those are in
     the markup rather than in a stylesheet, so they are checked in the shipped source. */
  check(
    'the seam ships as a keyboard-reachable separator',
    source.includes("'separator'") && source.includes("'aria-orientation'") && source.includes("'tabindex'"),
  )
  check(
    'and it ships an arrow-key rule rather than only a drag',
    source.includes("'ArrowLeft'") && source.includes("'ArrowRight'") && source.includes("'Home'") && source.includes("'End'"),
  )

  /* A session list the test can move: the gate's whole job is to react to which session is
     on screen, so the stub has to be able to change it and announce the change. */
  const makeSessions = (preset) => {
    const byId = { s1: { projectionValues: preset === undefined ? {} : { agentPreset: preset } } }
    const listeners = new Set()
    let current = 's1'
    return {
      list: {
        getSnapshot: () => ({ current, byId }),
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
      /** Move to a session running another preset. */
      switchTo(id, next) {
        byId[id] = { projectionValues: next === undefined ? {} : { agentPreset: next } }
        current = id
        for (const listener of [...listeners]) listener()
      },
    }
  }

  const makeCtx = (sessions) => {
    const state = { layers: [], disposed: [], slots: [] }
    return {
      state,
      ctx: {
        get: (service) => (service === 'sessions' ? sessions : undefined),
        effect: (body) => {
          const dispose = body()
          return typeof dispose === 'function' ? dispose : () => {}
        },
        theme: {
          /* The whole face the skin uses, not only the layer it stacks: the header control
             reads and writes through this service, so a stub that offered only
             `overrideTokens` would let a broken control pass. */
          getTheme: () => ({ preference: 'dark', fontSize: 15, active: { colorScheme: 'dark' } }),
          setTheme: () => {},
          setFontSize: () => {},
          overrideTokens: (id, tokens) => {
            state.layers.push({ id, tokens })
            return () => state.disposed.push(id)
          },
        },
        slots: {
          inject: (_name, body) => {
            const dispose = body()
            return typeof dispose === 'function' ? dispose : () => {}
          },
          register: (options) => {
            /* Single-occupant seats carry no key and no id: the seat name is their identity. */
            const seat = options.key ?? options.id ?? options.name
            state.slots.push(seat)
            return () => state.slots.splice(state.slots.indexOf(seat), 1)
          },
        },
      },
    }
  }

  /* ── in a Mimir lesson, everything is on ─────────────────────────────────── */
  const lesson = makeSessions('mimir-tutor')
  const on = makeCtx(lesson)
  plugin?.apply(on.ctx)

  const layer = on.state.layers
  check('a Mimir session stacks exactly one layer', layer.length === 1, `layers: ${layer.length}`)
  const stacked = layer[0]?.tokens ?? {}
  const expected = tokensFor(palette)
  const names = new Set([...Object.keys(stacked), ...Object.keys(expected)])
  const differing = [...names].filter(
    (name) => JSON.stringify(stacked[name]) !== JSON.stringify(expected[name]),
  )
  check(
    'the shipped layer is the source layer, token for token',
    differing.length === 0,
    differing.length === 0
      ? `${names.size} tokens`
      : `differs on ${differing.slice(0, 4).join(', ')}${differing.length > 4 ? ', …' : ''}`,
  )
  check('a Mimir session claims both rows, the header control and the hero mark', on.state.slots.length === 4, on.state.slots.join(', '))
  check('the breadcrumb records which preset turned it on', globalThis.window.__MIMIR_SKIN__?.preset === 'mimir-tutor')
  check('the breadcrumb records that it is engaged', globalThis.window.__MIMIR_SKIN__?.engaged === true)

  /* The header control reads the service without a prop, so it still draws when the slot's
     `inject` never arrives. This is the difference between a button that is missing and a
     button that is missing for a reason. */
  const withoutProps = plugin?.MimirControls({})
  check('the header control draws from the module service when no prop arrives', withoutProps !== null)

  /* ── one seat failing must cost exactly that seat ──────────────────────────
     The regression this exists for: engagement used to be one array literal, so a throw
     anywhere in it left the token layer applied with its disposer unreachable AND every
     later registration missing — the theme stuck on forever and the buttons gone, with
     nothing anywhere saying so. */
  const brittleSessions = makeSessions('mimir-tutor')
  const brittle = makeCtx(brittleSessions)
  brittle.ctx.slots.inject = () => {
    throw new Error('this seat refuses to register')
  }
  plugin?.apply(brittle.ctx)

  check('a failing seat does not lose the palette', brittle.state.layers.length === 1)
  check(
    'and the failure is recorded rather than swallowed',
    String(globalThis.window.__MIMIR_SKIN__?.error ?? '').includes('refuses to register'),
    globalThis.window.__MIMIR_SKIN__?.error,
  )
  brittleSessions.switchTo('s2', 'some-other-preset')
  check(
    'and the palette is still disposable: the lost-disposer bug cannot happen',
    brittle.state.disposed.length === 1,
    `disposed: ${brittle.state.disposed.length}`,
  )
  globalThis.window.__MIMIR_SKIN__.error = ''

  /* ── and the moment the session is not a lesson, everything is off ───────── */
  lesson.switchTo('s2', 'some-other-preset')

  check('leaving a Mimir session drops the token layer', on.state.disposed.length === 1, `disposed: ${on.state.disposed.length}`)
  check('and it does not stack a second one', on.state.layers.length === 1, `layers: ${on.state.layers.length}`)
  check('and it releases every seat, the header control included', on.state.slots.length === 0, on.state.slots.join(', '))
  check('the breadcrumb records the preset that turned it off', globalThis.window.__MIMIR_SKIN__?.preset === 'some-other-preset')
  check('the breadcrumb records that it is disengaged', globalThis.window.__MIMIR_SKIN__?.engaged === false)

  /* ── coming back is a fresh engagement, not a stale one ──────────────────── */
  lesson.switchTo('s3', 'mimir-tutor')
  check('returning to a Mimir session stacks the layer again', on.state.layers.length === 2)
  check('returning claims all four seats again', on.state.slots.length === 4, on.state.slots.join(', '))

  /* ── a session with no preset recorded is not a lesson ───────────────────── */
  const bare = makeSessions(undefined)
  const off = makeCtx(bare)
  plugin?.apply(off.ctx)
  check('a session with no preset recorded leaves the skin off', off.state.layers.length === 0)
  check('and claims no rows', off.state.slots.length === 0)

  check('the bundle reports that its factory ran and applied', globalThis.window.__MIMIR_SKIN__?.applied === true)

  /* ── the name the product scrolls by goes on the box that scrolls ──────────
     THE PRODUCT RESOLVES ITS SCROLL TARGET BY WALKING UP, NOT BY GEOMETRY: the chat calls
     `closest("[data-conversation-scroll]")` on its list and then scrolls whatever comes back
     — for follow-the-newest-message, for the position it remembers and restores when a
     session is opened, for the paging anchor and for the scroll-to-bottom control. The
     stylesheet moves the scrolling inside the session slot, so the wrapper that carries the
     name is left with nothing to scroll; measured in the running app on 2026-09-19, a fresh
     page sat at scrollTop 0 of a 6582px transcript and two new turns moved the height and
     not the position. So the script writes the same name on the box that actually scrolls,
     and the two halves have to name the same element — which is the coupling pinned here,
     because a selector changed on one side alone would silently unhook the other.

     This is the only boot with a document: the element it names exists only there, and the
     stub answers exactly the two selectors the skin asks for. */
  const SCROLLER_BOX = '[data-phase="active"] [data-conversation-scroll] > [data-slot="conversation.session"] > *'
  check(
    'the stylesheet sizes the same box the script names',
    BOARD_CSS.includes('[data-conversation-scroll] > [data-slot="conversation.session"] > *'),
  )
  const namedBox = {
    attrs: {},
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null },
    setAttribute(name, value) { this.attrs[name] = value },
    removeAttribute(name) { delete this.attrs[name] },
  }
  globalThis.document = {
    querySelector: (selector) => (selector === SCROLLER_BOX ? namedBox : null),
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
  }
  const naming = makeSessions('mimir-tutor')
  const namingCtx = makeCtx(naming)
  plugin?.apply(namingCtx.ctx)
  check(
    'the element that scrolls is the element the product is told to scroll',
    namedBox.attrs['data-conversation-scroll'] === '',
    JSON.stringify(namedBox.attrs),
  )
  naming.switchTo('s2', 'some-other-preset')
  check(
    'and the name is taken back the moment the skin lets go',
    namedBox.attrs['data-conversation-scroll'] === undefined,
    JSON.stringify(namedBox.attrs),
  )
  delete globalThis.document
  globalThis.window = previous
} else {
  console.log(`  SKIP  the shipped-bundle check: nothing installed at ${installedBundle}`)
}

console.log(`\nmimir-skin: ${passed} checks passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
