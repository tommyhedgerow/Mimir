#!/usr/bin/env node
/**
 * Tools/anki-cards.mjs — turn the card-shaped things in this vault into a deck.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE WHOLE VAULT
 *   The vault already schedules review: `Learn/Reviews/Review Queue.md`, with
 *   `review_due` and `retrievals:` in every concept and intervals that double.
 *   Anki does the same job by a different route, and the two are not
 *   interchangeable. The `reviewing` skill asks for **reconstruction** —
 *   "build it from what it rests on" — and says plainly that a review which
 *   turns into re-reading is worse than no review. Anki cards are recognition
 *   first. So a card of a derivation destroys the thing it was meant to test.
 *
 *   What Anki is good at is the other kind of knowledge: the word, the name, the
 *   date, the character that tells two species apart, and the wrong claim that
 *   has to be recognised as wrong. Those are facts, they are memorised by
 *   repetition, and they are what this script collects.
 *
 *   The division of labour, decided rather than drifted into: **a thing that can
 *   be a card becomes a card and comes off the review queue; a thing that has to
 *   be rebuilt stays on the queue.** `--coverage` prints both sides so the queue
 *   can be trimmed against real card counts instead of by memory.
 *
 * WHERE CARDS COME FROM
 *   1. Glossary notes, automatically — front is the `term:`, back is the note's
 *      first paragraph, which is where this vault writes the definition. Nothing
 *      is authored twice and nothing is invented.
 *   2. A `## 🃏 Cards` section, authored, in any concept or session note — one
 *      per line:
 *
 *          - <front> :: <back>
 *          - <front> :: <back> :: species
 *
 *      The optional third field is the kind, used as a tag. `species` cards must
 *      carry the characters, not just a name — this script refuses a one-line
 *      species answer, because "never a determination without its characters" is
 *      a standing rule of this vault and a card is a determination.
 *
 * USAGE
 *   node Tools/anki-cards.mjs                        # what would be made, and how much
 *   node Tools/anki-cards.mjs --all                  # write the package and the text
 *   node Tools/anki-cards.mjs --all --tsv-only       # just the readable plane
 *   node Tools/anki-cards.mjs --strand chemistry
 *   node Tools/anki-cards.mjs --coverage             # queue entries against cards
 *   node Tools/anki-cards.mjs --all --out ~/Desktop
 *   node Tools/anki-cards.mjs --vault /path/to/vault        # another vault
 *                                                          # (or MIMIR_VAULT=...)
 *
 * TWO ARTIFACTS, AND WHY BOTH
 *   `Mimir.apkg` is the one to import. A text file cannot carry a **note type**,
 *   and the note type is the whole point of this file's second half: five fields
 *   (Front, Back, Kind, Strand, Source), a card template that shows the kind as a
 *   chip and the source in the footer, and a stylesheet in the vault's own palette
 *   so a card looks like it came from here. `Tools/lib/anki-notetype.mjs` is that
 *   definition, and `Tools/lib/anki-apkg.mjs` writes the package — no Anki and no
 *   compiler required, verified by importing the result back through Anki's own
 *   importer in `Tools/test-anki-cards.mjs`.
 *
 *   `Mimir.tsv` is the same cards as plain text: readable, diffable, and easy to
 *   disagree with before it reaches the collection. Its columns are the note type's
 *   fields in order, so importing it into `Mimir` needs no mapping — but the note
 *   type has to exist first, which means importing the package once.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseNote, splitSections, findSection, renderInline } from './lib/vault-md.mjs'
import { buildApkg } from './lib/anki-apkg.mjs'
import { mimirNotetype, mimirNotetypes, mimirClozeNotetype, NOTETYPE_NAME, CLOZE_NOTETYPE_NAME, DECK_NAME, FIELDS, CLOZE_FIELDS } from './lib/anki-notetype.mjs'

// Re-exported so a caller reads the note type's shape from the tool that writes it,
// rather than reaching into `lib/` for a name that could move.
export { NOTETYPE_NAME, CLOZE_NOTETYPE_NAME, DECK_NAME, FIELDS, CLOZE_FIELDS }

// `--vault DIR` is read here, before anything resolves a path, so the constants
// below are plain `const`s: whichever vault the caller named is the one they use.
{
  const i = process.argv.indexOf('--vault')
  const v = i === -1 ? null : process.argv[i + 1]
  if (v && !v.startsWith('--')) process.env.MIMIR_VAULT = resolve(v)
}

// The vault this tool reads. Normally the one it lives in; `MIMIR_VAULT`
// (or `--vault DIR`) points it at another, which is what the test suite does so
// that a fresh clone with no lessons in it can still be checked.
const VAULT = process.env.MIMIR_VAULT
  ? resolve(process.env.MIMIR_VAULT)
  : fileURLToPath(new URL('..', import.meta.url))
const CONCEPTS = join(VAULT, 'Learn', 'Concepts')
const GLOSSARY = join(VAULT, 'Learn', 'Glossary')
const SESSIONS = join(VAULT, 'Learn', 'Sessions')
const QUEUE = join(VAULT, 'Learn', 'Reviews', 'Review Queue.md')
const DEFAULT_OUT = join(VAULT, 'Learn', 'Exports', 'anki')

/** A species card must say more than a name. This is a floor, not a proof. */
const SPECIES_MIN_CHARS = 60

/* ------------------------------------------------------------------ *
 * Reading the vault
 * ------------------------------------------------------------------ */

const mdFiles = dir => existsSync(dir)
  ? readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => join(dir, f))
  : []

function firstParagraph (body) {
  const para = []
  let started = false
  for (const raw of String(body).split('\n')) {
    const t = raw.trim()
    if (!started) {
      if (t === '' || t.startsWith('#') || t.startsWith('---')) continue
      started = true
    }
    if (t === '' && para.length) break
    if (t.startsWith('#') || t.startsWith('---')) break
    para.push(t)
  }
  return para.join(' ').trim()
}

const normalise = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The strand a note belongs to, as a deck name. */
function strandOf (data) {
  const raw = data.field ?? (Array.isArray(data.subjects) ? data.subjects[0] : data.subjects) ?? 'Unsorted'
  const s = String(raw).trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function titleOf (note, path) {
  const h1 = note.body.split('\n').find(l => /^#\s+/.test(l))
  return (h1 ? h1.replace(/^#\s+/, '').trim() : null) ?? basename(path, '.md')
}

/* ------------------------------------------------------------------ *
 * Card 1 — glossary terms, derived
 * ------------------------------------------------------------------ */

/**
 * The card a term note would make — the derivation on its own, with none of the
 * policy in it. Kept separate from the gate below so the derivation can be tested
 * against a real note even while no note is marked.
 */
export function termCardFrom (note, path) {
  const front = String(note.data.term ?? titleOf(note, path)).trim()
  const lede = firstParagraph(note.body)
  if (!front || !lede) return null
  return {
    front,
    back: lede,
    backHtml: renderInline(lede, { links: 'text' }),
    notetype: NOTETYPE_NAME,
    kind: 'term',
    strand: strandOf(note.data),
    source: 'Learn/Glossary/' + basename(path),
    tags: ['mimir', 'mimir::glossary', 'mimir::kind::term', 'mimir::strand::' + normalise(strandOf(note.data))]
  }
}

/**
 * Every glossary card — which is only the terms that ask for one.
 *
 * THE GATE. A glossary entry is not a card. The glossary's own rule — "a term gets
 * an entry when a session uses it, never before" — is right for a reference and
 * wrong for a deck: applying it to both cards vocabulary the learner already has,
 * or could rebuild from the word's own parts. So a term becomes a card only when
 * its note asks for one, in a line the note's author writes: `card: true` in the
 * frontmatter. Absent means no.
 */
export function glossaryCards () {
  const cards = []
  for (const path of mdFiles(GLOSSARY)) {
    const note = parseNote(readFileSync(path, 'utf8'))
    if (note.data.type && note.data.type !== 'term') continue
    if (note.data.card !== true) continue
    const card = termCardFrom(note, path)
    if (card) cards.push(card)
  }
  return cards
}

/* ------------------------------------------------------------------ *
 * Card 2 — authored `## 🃏 Cards` sections
 * ------------------------------------------------------------------ */

const KIND_RE = /^[a-z][a-z0-9-]*$/

/** Kinds this vault has agreed to use. */
export const KINDS = new Set(['term', 'trap', 'name', 'date', 'species', 'fact'])

/** A card whose sentence hides a token is a cloze card, and belongs to the other note type. */
const isClozeText = text => /\{\{c\d+::/.test(String(text))

/**
 * Parse one `## 🃏 Cards` section into cards appended to `out`. Throws on malformed input.
 *
 * TWO SHAPES, AND THE SENTENCE DECIDES WHICH.
 *
 *   `- <front> :: <back> :: <kind>`          a question, or a wrong claim to judge
 *   `- <sentence with {{c1::…}}> :: <kind>`  a cloze card — one missing token
 *
 * A cloze card may carry a caveat as a middle field (`sentence :: caveat :: date`);
 * with two fields the second is read as the kind when it is one, and as the caveat
 * otherwise. A cloze **trap** is refused: "here is a plausible wrong claim, judge
 * it" cannot be expressed as a missing word, and a derivation cannot be expressed
 * as one at all — which is the point of sending facts here and keeping the rest.
 */
export function parseCardsSection (body, { strand, source, out }) {
  const section = findSection(splitSections(body), 'Cards')
  if (!section) return out
  for (const raw of section.body.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('_') || line.startsWith('>')) continue
    const m = /^[-*+]\s+(.*)$/.exec(line)
    if (!m) continue
    const item = m[1].trim()
    // `_…_` is the templates' placeholder, and a copy of a template is not a card.
    if (item.startsWith('_')) continue

    const bits = item.split(' :: ').map(p => p.trim())
    if (bits.length > 3) {
      throw new Error(source + ': a card has more than three ` :: ` fields, so the parts ' +
        'cannot be told apart — got "' + item.slice(0, 80) + '"')
    }

    if (isClozeText(bits[0])) {
      const sentence = bits[0]
      let caveat = ''
      let kind = 'fact'
      if (bits.length === 2) {
        // Two fields means the second IS the kind. Reading an unrecognised word as
        // a caveat instead would turn a typo — `:: dat` for `date` — into a silent
        // mis-parse, which is the one thing this vault refuses to do.
        kind = bits[1]
        if (!KIND_RE.test(kind) || !KINDS.has(kind)) {
          throw new Error(source + ': a cloze card\'s second field has to be its kind, and "' + kind +
            '" is not one of ' + [...KINDS].join(', ') + '. For a caveat, write `sentence :: caveat :: kind`.')
        }
      } else if (bits.length === 3) {
        caveat = bits[1]
        kind = bits[2]
        if (!KIND_RE.test(kind) || !KINDS.has(kind)) {
          throw new Error(source + ': cloze card kind "' + kind + '" is not one of ' + [...KINDS].join(', '))
        }
      }
      if (kind === 'trap') {
        throw new Error(source + ': a trap cannot be a cloze card. A claim to be judged has to be ' +
          'stated in full, so write it as `front :: back :: trap`.')
      }
      out.push({
        front: renderInline(sentence, { links: 'text' }),
        raw: sentence,
        extra: caveat,
        extraHtml: caveat ? renderInline(caveat, { links: 'text' }) : '',
        notetype: CLOZE_NOTETYPE_NAME,
        kind,
        strand,
        source,
        tags: ['mimir', 'mimir::cloze', 'mimir::kind::' + kind, 'mimir::strand::' + normalise(strand)]
      })
      continue
    }

    if (bits.length < 2) {
      throw new Error(source + ': a card needs `front :: back` — got "' + item.slice(0, 80) + '"')
    }
    const [front, back, kind] = [bits[0], bits[1], bits[2] ?? 'fact']
    if (!front || !back) throw new Error(source + ': a card has an empty front or back — "' + item.slice(0, 80) + '"')
    // A well-formed line cannot start with the separator, so an empty first field
    // arrives as the literal text before it — `- :: back :: fact` parses its front
    // as `:: back`. Refuse that by shape rather than let it into the deck.
    if (/^::/.test(front)) {
      throw new Error(source + ': a card has an empty front — "' + item.slice(0, 80) +
        '". Write `front :: back`, with something before the first separator.')
    }
    if (!KIND_RE.test(kind)) {
      throw new Error(source + ': card kind "' + kind + '" is not a lower-case tag word')
    }
    // The kind is what the deck is filtered and tagged by, so an unrecognised one is
    // a typo that files a card where nothing reads it. Checked here as it already is
    // on the cloze path; without this, `:: notakind` was silently accepted.
    if (!KINDS.has(kind)) {
      throw new Error(source + ': card kind "' + kind + '" is not one of ' + [...KINDS].join(', ') + '.')
    }
    if (kind === 'species' && back.length < SPECIES_MIN_CHARS) {
      throw new Error(source + ': a species card must carry the characters that tell it apart, not just a ' +
        'name — this back is ' + back.length + ' characters. "Never a determination without its characters."')
    }
    out.push({
      front,
      back,
      backHtml: renderInline(back, { links: 'text' }),
      notetype: NOTETYPE_NAME,
      kind,
      strand,
      source,
      tags: ['mimir', 'mimir::kind::' + kind, 'mimir::strand::' + normalise(strand)]
        .concat(kind === 'trap' ? ['mimir::fragile'] : [])
    })
  }
  return out
}

export function authoredCards () {
  const cards = []
  for (const dir of [CONCEPTS, SESSIONS]) {
    for (const path of mdFiles(dir)) {
      const note = parseNote(readFileSync(path, 'utf8'))
      const data = note.data
      const strand = strandOf(data)
      parseCardsSection(note.body, {
        strand,
        source: (dir === CONCEPTS ? 'Learn/Concepts/' : 'Learn/Sessions/') + basename(path),
        out: cards
      })
    }
  }
  return cards
}

export function allCards () {
  return [...glossaryCards(), ...authoredCards()]
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

const tsvSafe = s => String(s).replace(/[\t\r\n]+/g, ' ').trim()

/** The field values of one card, in its own note type's field order. */
export function cardFields (c) {
  return c.notetype === CLOZE_NOTETYPE_NAME
    ? { Text: c.front, Extra: c.extraHtml ?? '', Kind: c.kind, Strand: c.strand, Source: c.source }
    : { Front: c.front, Back: c.backHtml, Kind: c.kind, Strand: c.strand, Source: c.source }
}

export function groupByNotetype (cards) {
  const by = new Map()
  for (const c of cards) {
    const name = c.notetype ?? NOTETYPE_NAME
    if (!by.has(name)) by.set(name, [])
    by.get(name).push(c)
  }
  return by
}

/**
 * The tab-separated plane: every field of the note type as a column, then tags.
 * Column order is that note type's field order, so importing needs no mapping.
 *
 * One file per note type, because a tab-separated file names exactly one note type
 * in its header and a cloze row read as an ordinary one would be a lie.
 */
export function deckText (deck, cards, notetype = NOTETYPE_NAME) {
  const fields = notetype === CLOZE_NOTETYPE_NAME ? CLOZE_FIELDS : FIELDS
  const names = fields.map(f => (typeof f === 'string' ? f : f.name))
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:' + notetype,
    '#deck:' + deck,
    '#tags column:' + (names.length + 1),
    '# Columns: ' + names.join(', ') + ', tags',
    ''
  ]
  for (const c of cards) {
    const values = cardFields(c)
    lines.push(names.map(n => tsvSafe(values[n] ?? '')).concat(tsvSafe([...new Set(c.tags)].join(' '))).join('\t'))
  }
  return lines.join('\n') + '\n'
}

/** The cards as an Anki package, carrying both Mimir note types, their templates and CSS. */
export function apkgBytes (cards) {
  return buildApkg({
    notetypes: mimirNotetypes(),
    deckName: DECK_NAME,
    notes: cards.map(c => ({
      notetype: c.notetype ?? NOTETYPE_NAME,
      fields: cardFields(c),
      tags: c.tags
    }))
  })
}

export function groupByStrand (cards) {
  const by = new Map()
  for (const c of cards) {
    if (!by.has(c.strand)) by.set(c.strand, [])
    by.get(c.strand).push(c)
  }
  for (const list of by.values()) list.sort((a, b) => a.front.localeCompare(b.front))
  return new Map([...by.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

/* ------------------------------------------------------------------ *
 * Coverage — the queue against the deck
 * ------------------------------------------------------------------ */

/** Open entries in the review queue: { concept, due, open }. */
export function queueEntries () {
  if (!existsSync(QUEUE)) return []
  const lines = readFileSync(QUEUE, 'utf8').split('\n')
  const out = []
  for (const line of lines) {
    const m = /^\s*-\s*\[( |x)\]\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*—\s*due\s*(\S+)/.exec(line)
    if (!m) continue
    out.push({ open: m[1] === ' ', concept: m[2].trim(), due: m[3] })
  }
  return out
}

export function coverage () {
  const cards = allCards()
  const bySource = new Map()
  for (const c of cards) {
    const key = normalise(basename(c.source, '.md'))
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key).push(c)
  }

  // A card written in a session note belongs to the concepts that session
  // created, because `nodes:` says which they were. Without this, a concept
  // whose facts were carded in its session reads as uncarded, and the report
  // would understate what Anki is already carrying.
  const viaSession = new Map()
  for (const path of mdFiles(SESSIONS)) {
    const nodes = parseNote(readFileSync(path, 'utf8')).data.nodes
    if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) continue
    const mine = bySource.get(normalise(basename(path, '.md'))) ?? []
    if (!mine.length) continue
    for (const title of Object.values(nodes)) {
      const key = normalise(title)
      if (!viaSession.has(key)) viaSession.set(key, [])
      viaSession.get(key).push(...mine)
    }
  }

  return queueEntries().map(e => {
    const key = normalise(e.concept)
    const direct = bySource.get(key) ?? []
    const fromSession = viaSession.get(key) ?? []
    const mine = [...new Map([...direct, ...fromSession].map(c => [c.front, c])).values()]
    return {
      ...e,
      cards: mine.length,
      direct: direct.length,
      viaSession: fromSession.length,
      kinds: [...new Set(mine.map(c => c.kind))],
      verdict: mine.length === 0 ? 'queue only'
        : direct.length === 0 ? 'carded in its session' : 'partly carded'
    }
  })
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function report (cards, { quiet = false } = {}) {
  const by = groupByStrand(cards)
  const kinds = new Map()
  for (const c of cards) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1)
  if (!quiet) {
    console.log(cards.length + ' cards across ' + by.size + ' strand(s)')
    for (const [strand, list] of by) console.log('  ' + strand.padEnd(22) + list.length)
    console.log('  by kind: ' + [...kinds.entries()].map(([k, n]) => k + ' ' + n).join(', '))
  }
  return { by, kinds }
}

function main () {
  const argv = process.argv.slice(2)
  const take = name => {
    const i = argv.indexOf(name)
    if (i === -1) return null
    const v = argv[i + 1]
    return v && !v.startsWith('--') ? v : true
  }
  const has = name => argv.includes(name)
  const outArg = take('--out')
  const OUT = !outArg || outArg === true ? DEFAULT_OUT
    : (String(outArg).startsWith('/') ? String(outArg) : join(process.cwd(), String(outArg)))

  let cards = allCards()

  if (has('--coverage')) {
    const rows = coverage()
    const width = Math.max(...rows.map(r => r.concept.length), 8)
    console.log('Review queue against the deck\n')
    for (const r of rows) {
      console.log('  ' + (r.open ? '[ ]' : '[x]') + ' ' + r.concept.padEnd(width) +
        '  due ' + r.due + '  ' + String(r.cards).padStart(2) + ' card(s)' +
        (r.kinds.length ? ' (' + r.kinds.join(', ') + ')' : '') + '  → ' + r.verdict)
    }
    const carded = rows.filter(r => r.cards > 0).length
    console.log('\n  ' + carded + ' of ' + rows.length + ' queue entries have at least one card.')
    console.log('  A carded entry is not automatically removable: the card carries the facts, the')
    console.log('  queue carries the reconstruction. Retire only what was nothing but facts.')
    return
  }

  const strand = take('--strand')
  if (strand && strand !== true) {
    const want = normalise(String(strand))
    cards = cards.filter(c => normalise(c.strand) === want)
    if (!cards.length) {
      console.error('No cards for strand "' + strand + '". Strands: ' +
        [...groupByStrand(allCards()).keys()].join(', '))
      process.exit(1)
    }
  }

  if (!has('--all') && !strand) {
    report(cards)
    console.log('\nnothing written — add --all or --strand <name> (see --help)')
    return
  }

  const { by } = report(cards)
  mkdirSync(OUT, { recursive: true })

  // One deck, not one per strand. The reviewing skill is explicit that
  // interleaving is what makes knowledge available outside the context it was
  // learned in — "do not review five concepts from one strand in a row" — and
  // per-strand decks would make blocking by strand the easy default. The strand
  // travels as a tag, where it can be filtered for when that is wanted.
  const written = []
  const deckFor = (strand && strand !== true && by.size === 1) ? 'Mimir::' + [...by.keys()][0] : DECK_NAME
  const suffix = deckFor === DECK_NAME ? '' : ' — ' + [...by.keys()][0]

  // One text plane per note type: a tab-separated file names a single note type in
  // its header, and reading a cloze row as an ordinary one would be misleading.
  for (const [notetype, list] of groupByNotetype(cards)) {
    const tsvPath = join(OUT, (notetype === CLOZE_NOTETYPE_NAME ? 'Mimir Cloze' : 'Mimir') + suffix + '.tsv')
    writeFileSync(tsvPath, deckText(deckFor, list, notetype))
    written.push(tsvPath)
    console.log('· tsv   ' + String(list.length).padStart(3) + ' cards  ' + tsvPath)
  }

  // The package is the one that can carry a note type, so it is the import that
  // gives Anki the fields, the templates and the CSS as well as the cards.
  if (!has('--tsv-only')) {
    const apkgPath = join(OUT, 'Mimir.apkg')
    writeFileSync(apkgPath, apkgBytes(cards))
    written.push(apkgPath)
    console.log('· apkg  ' + String(cards.length).padStart(3) + ' cards  ' + apkgPath)
  }

  console.log('\n' + written.length + ' file(s) in ' + OUT)
  console.log('Import Mimir.apkg in Anki (File → Import): it brings both Mimir note types,')
  console.log('their templates and their CSS with the cards. The .tsv files are the same cards')
  console.log('in plain text — readable, diffable, one file per note type.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
