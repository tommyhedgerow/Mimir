/**
 * Tools/lib/anki-apkg.mjs — write a real Anki package, without Anki.
 *
 * WHY THIS EXISTS
 *   `Tools/anki-cards.mjs` can write a tab-separated file that Anki imports, but a
 *   text file cannot carry a **note type** — the fields, the card template and the
 *   CSS that make a card look like it belongs to this vault. Only a package can,
 *   so this builds one.
 *
 * WHY IT IS HAND-BUILT, AND WHY THAT IS SAFE
 *   The obvious alternative is to let Anki write its own package, and Anki 26 will
 *   do exactly that. That would make the tool depend on Anki *and* a C compiler,
 *   to produce a file for a program that is already installed — a strange bargain
 *   for a vault whose tools carry no dependencies at all.
 *
 *   So the package is written here, in the **legacy schema-11 form**, which is the
 *   shape every shared deck on the internet has had for a decade and which Anki
 *   still reads: a SQLite database with `col`, `notes`, `cards`, `revlog` and
 *   `graves`, with the note types and decks held as JSON in the `col` row. The
 *   layouts below were not guessed: they were read out of a package Anki 26.9.2
 *   exported on this machine, and `Tools/test-anki-cards.mjs` **imports the result
 *   back through Anki's own importer** and checks what came out. A claim about a
 *   binary format that nothing verifies is the kind of claim this vault does not
 *   make.
 *
 *   The one thing deliberately left out is `meta`. Its presence tells Anki which
 *   package version to expect; without it the archive is the classic
 *   `collection.anki2` package, which is the format this struct actually is.
 *
 * USAGE
 *   import { buildApkg } from './lib/anki-apkg.mjs'
 *   const bytes = buildApkg({ notetype, deckName, notes, now })
 */

import { deflateRawSync, crc32 } from 'node:zlib'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/* ------------------------------------------------------------------ *
 * A minimal ZIP writer
 *
 * Deflate, no data descriptors, no zip64 — the packages are a few hundred
 * kilobytes, and a fixed valid DOS date keeps two builds of the same cards
 * byte-identical, which makes a diff of two packages meaningful.
 * ------------------------------------------------------------------ */

const DOS_DATE = 0x21 // 1980-01-01, the earliest a DOS date can express

function zipSync (files) {
  const local = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8')
    const body = deflateRawSync(raw, { level: 9 })
    const sum = crc32(raw) >>> 0

    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // version needed
    head.writeUInt16LE(0, 6) // flags
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt16LE(0, 10) // time
    head.writeUInt16LE(DOS_DATE, 12)
    head.writeUInt32LE(sum, 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(name.length, 26)
    head.writeUInt16LE(0, 28) // extra length
    local.push(head, name, body)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // version made by
    entry.writeUInt16LE(20, 6) // version needed
    entry.writeUInt16LE(0, 8) // flags
    entry.writeUInt16LE(8, 10) // deflate
    entry.writeUInt16LE(0, 12) // time
    entry.writeUInt16LE(DOS_DATE, 14)
    entry.writeUInt32LE(sum, 16)
    entry.writeUInt32LE(body.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42) // where this file's local header begins
    central.push(entry, name)

    offset += head.length + name.length + body.length
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...local, ...central, end])
}

/* ------------------------------------------------------------------ *
 * Anki's own values
 * ------------------------------------------------------------------ */

const LATEX_PRE = '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n' +
  '\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n' +
  '\\setlength{\\parindent}{0in}\n\\begin{document}\n'
const LATEX_POST = '\\end{document}'

/** Anki's `csum`: the first eight hex digits of the sort field's sha1, as an int. */
export function fieldChecksum (text) {
  return parseInt(createHash('sha1').update(String(text)).digest('hex').slice(0, 8), 16)
}

/**
 * A stable ten-character guid.
 *
 * It is derived from the front of the card rather than randomised, because Anki
 * treats the guid as the identity of a note: a stable one means **importing a
 * rebuilt package updates the cards instead of duplicating them**, which is what
 * makes re-running the export after every session safe.
 */
export function guidFor (front) {
  return createHash('sha1').update('mimir\u001f' + String(front)).digest('hex').slice(0, 10)
}

const SCHEMA = `
create table col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
create table notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
create table cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
create table revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
create table graves (usn integer not null, oid integer not null, type integer not null);
create index ix_notes_usn on notes (usn);
create index ix_cards_usn on cards (usn);
create index ix_cards_nid on cards (nid);
create index ix_cards_sched on cards (did, queue, due);
create index ix_revlog_usn on revlog (usn);
create index ix_revlog_cid on revlog (cid);
create index ix_notes_csum on notes (csum);
`

/** A deck configuration Anki 26 accepts; missing keys are filled with defaults. */
const DECK_CONFIG = {
  id: 1,
  mod: 0,
  name: 'Default',
  usn: 0,
  maxTaken: 60,
  autoplay: true,
  timer: 0,
  replayq: true,
  new: { bury: false, delays: [1.0, 10.0], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
  rev: { bury: false, ease4: 1.3, ivlFct: 1.0, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
  lapse: { delays: [10.0], leechAction: 1, leechFails: 8, minInt: 1, mult: 0.0 },
  dyn: false,
  newMix: 0,
  newPerDayMinimum: 0,
  interdayLearningMix: 0,
  reviewOrder: 0,
  newSortOrder: 0,
  newGatherPriority: 0,
  buryInterdayLearning: false,
  fsrsWeights: [],
  desiredRetention: 0.9,
  ignoreRevlogsBeforeDate: '',
  easyDaysPercentages: [1, 1, 1, 1, 1, 1, 1],
  stopTimerOnAnswer: false,
  secondsToShowQuestion: 0,
  secondsToShowAnswer: 0,
  questionAction: 0,
  answerAction: 0,
  waitForAudio: true
}

/**
 * Turn a notetype description into the JSON Anki stores.
 *
 * `fields` may be names or `{name, font, size}`; `templates` are
 * `{name, qfmt, afmt}`. Ids are fixed rather than random so that rebuilding gives
 * an identical package.
 */
export function notetypeJson (nt, { modelId, deckId, now }) {
  return {
    id: modelId,
    name: nt.name,
    // 0 = standard, 1 = cloze. Anki only treats a note type as cloze if this is 1,
    // and only then does it generate a card per `{{cN::}}` marker.
    type: nt.type ?? 0,
    mod: now,
    usn: -1,
    sortf: 0,
    did: null,
    tmpls: nt.templates.map((t, ord) => ({
      name: t.name,
      ord,
      qfmt: t.qfmt,
      afmt: t.afmt,
      bqfmt: '',
      bafmt: '',
      did: null,
      bfont: '',
      bsize: 0
    })),
    flds: nt.fields.map((f, ord) => {
      const spec = typeof f === 'string' ? { name: f } : f
      return {
        name: spec.name,
        ord,
        sticky: false,
        rtl: false,
        font: spec.font ?? 'Arial',
        size: spec.size ?? 20,
        media: []
      }
    }),
    css: nt.css,
    latexPre: LATEX_PRE,
    latexPost: LATEX_POST,
    latexsvg: false,
    // Every card needs the first field; that is what the template replacement says.
    req: nt.templates.map((_, ord) => [ord, 'any', [0]]),
    tags: [],
    vers: []
  }
}

/**
 * A fixed timestamp for everything the package records.
 *
 * Time in the file would make two builds of the same cards differ, and a diff
 * between two packages is only worth reading if an unchanged deck produces an
 * unchanged file. Anki uses `mod` for sync conflict detection; a constant is
 * harmless for a deck that is imported rather than synced from this side.
 */
export const BUILD_EPOCH = 1789983946

/**
 * The `{{cN::…}}` ordinals in a cloze field, ascending and de-duplicated. `c1`
 * becomes ordinal 0, because Anki counts the stored `ord` from zero.
 */
export function clozeOrdinals (text) {
  const found = new Set()
  for (const m of String(text).matchAll(/\{\{c(\d+)::/g)) found.add(Number(m[1]) - 1)
  return [...found].sort((a, b) => a - b)
}

/** Stable note type ids, so a rebuilt package maps onto the same note types. */
const MODEL_IDS = {
  'Mimir': 1790000000001,
  'Mimir Cloze': 1790000000003
}

/**
 * Build a complete `.apkg` holding one or more note types.
 *
 * `notetypes`: the definitions. `notes`: `[{ notetype, fields, tags }]`, with
 * `fields` keyed by that note type's field names — a note with no `notetype`
 * belongs to the first one.
 *
 * A cloze note produces **one card per `{{cN::}}` marker**, which is what Anki
 * does with it, so the card count is the number of deletions rather than the
 * number of notes.
 *
 * Returns a Buffer holding the archive.
 */
export function buildApkg ({
  notetype,
  notetypes,
  deckName,
  notes,
  now = BUILD_EPOCH,
  modelId,
  deckId,
  noteBase = BUILD_EPOCH * 1000
}) {
  const definitions = notetypes ?? (notetype ? [notetype] : [])
  if (!definitions.length) throw new Error('buildApkg needs at least one note type')
  const DECK_ID = deckId ?? 1790000000002
  const BASE = noteBase

  const byName = new Map()
  const models = {}
  definitions.forEach((nt, index) => {
    const id = MODEL_IDS[nt.name] ?? modelId ?? (1790000000000 + index * 2 + 1)
    byName.set(nt.name, { nt, id, fields: nt.fields.map(f => (typeof f === 'string' ? f : f.name)) })
    models[id] = notetypeJson(nt, { modelId: id, deckId: DECK_ID, now })
  })

  const allTags = new Map()
  const noteRows = []
  const cardRows = []
  let cardOrdinal = 0

  // Card ids get their own range. A note of a cloze type yields several cards, so
  // they can no longer share the note's id as the first card used to.
  const CARD_BASE = BASE + 1000000

  notes.forEach((note, i) => {
    const spec = byName.get(note.notetype ?? definitions[0].name)
    if (!spec) throw new Error('no note type named "' + note.notetype + '" in this package')
    const id = BASE + i
    const values = spec.fields.map(name => note.fields?.[name] ?? '')
    const sortField = values[0] ?? ''
    const tags = [...new Set(note.tags ?? [])]
    for (const t of tags) if (!allTags.has(t)) allTags.set(t, -1)
    noteRows.push({
      id,
      guid: guidFor(sortField),
      mid: spec.id,
      mod: now,
      tags: ' ' + tags.join(' ') + ' ',
      flds: values.join('\u001f'),
      sfld: sortField,
      csum: fieldChecksum(sortField)
    })

    // A cloze note yields a card per deletion; anything else yields exactly one.
    const ords = (spec.nt.type ?? 0) === 1 ? clozeOrdinals(values[0]) : [0]
    if (!ords.length) {
      throw new Error('a cloze note has no {{c1::…}} marker: ' + String(sortField).slice(0, 60))
    }
    for (const ord of ords) {
      cardOrdinal++
      cardRows.push({ id: CARD_BASE + cardOrdinal, nid: id, did: DECK_ID, ord, due: cardOrdinal })
    }
  })

  const decks = {
    [DECK_ID]: {
      id: DECK_ID,
      name: deckName,
      mod: now,
      usn: -1,
      collapsed: false,
      browserCollapsed: false,
      desc: '',
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0]
    }
  }

  const conf = {
    nextPos: 1,
    estTimes: true,
    activeDecks: [DECK_ID],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: DECK_ID,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: null,
    collapseTime: 1200
  }

  const dir = mkdtempSync(join(tmpdir(), 'mimir-apkg-'))
  const dbPath = join(dir, 'collection.anki2')
  let bytes
  try {
    const db = new DatabaseSync(dbPath)
    db.exec(SCHEMA)

    db.prepare(`insert into col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
                values (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)`).run(
      now, now, now,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify({ 1: DECK_CONFIG }),
      JSON.stringify(Object.fromEntries(allTags))
    )

    const insertNote = db.prepare(`insert into notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
                                   values (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')`)
    for (const n of noteRows) insertNote.run(n.id, n.guid, n.mid, n.mod, n.tags, n.flds, n.sfld, n.csum)

    // `ord` is the cloze ordinal for a cloze note and 0 for everything else, which
    // is how Anki tells the cards of one note apart.
    const insertCard = db.prepare(`insert into cards (id, nid, did, ord, mod, usn, type, queue, due, ivl,
                                   factor, reps, lapses, left, odue, odid, flags, data)
                                   values (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`)
    for (const c of cardRows) insertCard.run(c.id, c.nid, c.did, c.ord, now, c.due)

    db.close()
    bytes = readFileSync(dbPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  return zipSync([
    { name: 'collection.anki2', data: bytes },
    { name: 'media', data: '{}' }
  ])
}
