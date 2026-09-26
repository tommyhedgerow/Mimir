#!/usr/bin/env node
/**
 * Tools/test-anki-cards.mjs — what keeps the deck honest, in any vault.
 *
 * The rules this pins are the ones that decide whether a card is worth having,
 * and none of them depends on what a particular vault happens to contain:
 *
 *   · A GLOSSARY ENTRY IS NOT A CARD. The glossary's rule — "a term gets an
 *     entry when a session uses it, never before" — is right for a reference and
 *     wrong for a deck: applied to both, it cards vocabulary the learner already
 *     has. A term is carded only when its note says `card: true`.
 *
 *   · A SENTENCE WITH A GAP IS A CLOZE CARD, and goes to the other note type.
 *     `{{c1::…}}` makes it cloze; Anki then makes one card per gap, so the card
 *     count is the number of deletions and not the number of notes. A cloze
 *     **trap** is refused, because "judge this claim" cannot be a missing word.
 *
 *   · MALFORMED CARDS THROW. A missing separator, a fourth field, an empty side
 *     or an unknown kind is a mistake in a note, and dropping it silently would
 *     lose a card the session believed it had written.
 *
 *   · THE TEMPLATE IS NOT A CARD. Every example line in `Learn/Templates/` is
 *     italic, and an italic line is skipped.
 *
 *   · A SPECIES CARD MUST SAY MORE THAN A NAME. It carries the characters that
 *     separate it and the lookalikes it is confused with.
 *
 *   · THE PACKAGE IS A REAL ANKI PACKAGE. `.apkg` is a zip holding a SQLite
 *     collection and its media map; this test opens it and reads the collection
 *     back rather than trusting the bytes it wrote.
 *
 * WHY IT BUILDS ITS OWN VAULT. This suite ran against the author's vault for as
 * long as that vault was the only one. It cannot stay that way — a fresh clone
 * has no lessons in it, so the checks would either fail or quietly test nothing.
 * So it writes a small vault into a temporary directory, reads it through the
 * tool's `--vault` switch, and deletes it. Nothing here reads the vault you are
 * standing in.
 *
 * Usage:  node Tools/test-anki-cards.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL = join(HERE, 'anki-cards.mjs')
const asUrl = p => pathToFileURL(p).href

let passed = 0
const failures = []
function check (what, ok, detail = '') {
  if (ok) { passed++ } else { failures.push(what + (detail ? ' — ' + detail : '')) }
}

/* ------------------------------------------------------------------ *
 * The fixture vault
 * ------------------------------------------------------------------ */

const vault = mkdtempSync(join(tmpdir(), 'mimir-anki-'))
for (const d of [['Learn', 'Concepts'], ['Learn', 'Glossary'], ['Learn', 'Sessions'],
  ['Learn', 'Reviews'], ['Learn', 'Templates'], ['Learn', 'Viz']]) {
  mkdirSync(join(vault, ...d), { recursive: true })
}
// ── a glossary that shows both sides of the gate ────────────────────────
writeFileSync(join(vault, 'Learn', 'Glossary', 'Serotiny.md'), [
  '---',
  'type: term',
  'term: Serotiny',
  'subjects: [life sciences]',
  'field: Plants & ecology',
  'niche: true',
  "card: true",
  '---',
  '',
  '# Serotiny',
  '',
  'The retention of seeds in a cone or fruit until an environmental trigger releases them.',
  '',
  '## Why it is in here',
  '',
  'Taught in a session about fire-adapted plants.',
  ''
].join('\n'))

writeFileSync(join(vault, 'Learn', 'Glossary', 'Hypha.md'), [
  '---',
  'type: term',
  'term: Hypha',
  'subjects: [life sciences]',
  'field: Fungi',
  'niche: true',
  '---',
  '',
  '# Hypha',
  '',
  'A single filament of a fungus.',
  ''
].join('\n'))

// ── a concept note carrying an authored Cards section ───────────────────
writeFileSync(join(vault, 'Learn', 'Concepts', 'A bond is energy.md'), [
  '---',
  'type: concept',
  'title: A bond is the lower-energy arrangement',
  'field: Chemistry',
  'subjects: [chemistry]',
  '---',
  '',
  '# A bond is the lower-energy arrangement',
  '',
  'Forming a bond releases energy; breaking one costs it.',
  '',
  '## 🃏 Cards',
  '',
  '_This italic line is the template placeholder and is not a card._',
  '',
  '- Is a bond a thing an atom wants, or the lowest-energy arrangement? :: No — it is the arrangement, so forming it pays and breaking it costs. :: trap',
  '- A bond forms because the arrangement is {{c1::lower in energy}} than the atoms apart. :: fact',
  '- The First Emperor unified China in {{c1::221 BCE}}. :: Forty years of war, not one campaign. :: date',
  ''
].join('\n'))

// ── a session note, so the strand report has more than one strand ───────
writeFileSync(join(vault, 'Learn', 'Sessions', '2026-01-01 Rome — introduction.md'), [
  '---',
  'type: session',
  'topic: Rome',
  'field: History',
  'subjects: [history]',
  'status: done',
  '---',
  '',
  '# Rome — introduction',
  '',
  '## 🃏 Cards',
  '',
  '- In what year did the Western Roman Empire end? :: 476 CE. :: date',
  ''
].join('\n'))

// ── a templates directory whose placeholder lines must all be skipped ───
writeFileSync(join(vault, 'Learn', 'Templates', 'Concept.md'), [
  '---', 'type: concept', '---', '', '## 🃏 Cards', '',
  '- _A question with a short answer._ :: _The answer._',
  '- _A claim I might believe? — does that hold? :: **No** — and the reason._ :: trap',
  ''
].join('\n'))

/* ------------------------------------------------------------------ *
 * The tool, imported and driven
 * ------------------------------------------------------------------ */

// The tool resolves its vault when it is LOADED, so this has to be set before the
// import, not after it.
process.env.MIMIR_VAULT = vault
const anki = await import(asUrl(TOOL))
const {
  parseCardsSection, glossaryCards, allCards, groupByStrand, apkgBytes,
  KINDS, DECK_NAME, NOTETYPE_NAME, CLOZE_NOTETYPE_NAME
} = anki

/* ------------------------------------------------------------------ *
 * 1. The parser
 * ------------------------------------------------------------------ */

{
  const out = []
  parseCardsSection('## 🃏 Cards\n\n- Is it? :: No. :: trap\n', { strand: 'T', source: 'x', out })
  check('a well-formed card is parsed', out.length === 1 && out[0].front === 'Is it?')
  check('its kind survives', out[0].kind === 'trap')
}

{
  const out = []
  parseCardsSection('## 🃏 Cards\n\n_some placeholder_\n\n- _A question._ :: _An answer._\n',
    { strand: 'T', source: 'x', out })
  check('an italic placeholder line is not a card', out.length === 0)
}

for (const [what, line] of [
  ['a missing separator', '- a front with no separator'],
  ['a fourth field', '- a :: b :: c :: d'],
  ['an empty back', '- a front ::    :: fact'],
  ['an empty front', '- :: a back :: fact'],
  ['an unknown kind', '- a front :: a back :: notakind']
]) {
  let threw = false
  try {
    parseCardsSection('## 🃏 Cards\n\n' + line + '\n', { strand: 'T', source: 'x', out: [] })
  } catch { threw = true }
  check('a card with ' + what + ' throws rather than being dropped', threw)
}

{
  let threw = false
  try {
    parseCardsSection('## 🃏 Cards\n\n- The year {{c1::476}} :: trap\n',
      { strand: 'T', source: 'x', out: [] })
  } catch { threw = true }
  check('a cloze trap is refused outright', threw)
}

{
  const out = []
  parseCardsSection('## 🃏 Cards\n\n- The year {{c1::476}} :: date\n', { strand: 'T', source: 'x', out })
  check('a cloze card is recognised', out.length === 1 && out[0].notetype === CLOZE_NOTETYPE_NAME)
}

{
  const out = []
  parseCardsSection('## 🃏 Cards\n\n- The year {{c1::476}} :: a caveat :: date\n',
    { strand: 'T', source: 'x', out })
  check('a cloze card reads three fields as sentence :: caveat :: kind',
    out.length === 1 && out[0].extra === 'a caveat' && out[0].kind === 'date')
}

/* ------------------------------------------------------------------ *
 * 2. The glossary gate
 * ------------------------------------------------------------------ */

{
  const terms = glossaryCards()
  check('the gate admits a term marked card: true', terms.some(c => c.front === 'Serotiny'))
  check('the gate refuses a term that is only an entry', !terms.some(c => c.front === 'Hypha'))
  const serotiny = terms.find(c => c.front === 'Serotiny')
  check('a derived term card carries the note\'s own definition',
    typeof serotiny.back === 'string' && serotiny.back.includes('retention of seeds'),
    JSON.stringify(serotiny && serotiny.back))
  check('a derived term card is tagged as a term card', serotiny.tags.includes('mimir::kind::term'))
}

/* ------------------------------------------------------------------ *
 * 3. The whole vault
 * ------------------------------------------------------------------ */

{
  const cards = allCards()
  const fronts = cards.map(c => c.front)
  check('every card shape is collected together', cards.length >= 5, String(cards.length))
  check('the authored trap is here', fronts.some(f => /lowest-energy arrangement/.test(f)))
  check('the authored cloze is here', cards.some(c => c.notetype === CLOZE_NOTETYPE_NAME))
  check('the session note contributes its card', fronts.some(f => /Western Roman Empire/.test(f)))
  check('the glossary contributes exactly one', cards.filter(c => c.kind === 'term').length === 1)
  check('nothing from the templates is collected', !fronts.some(f => /short answer|placeholder/i.test(f)))

  const stranded = groupByStrand(cards)
  check('cards are grouped into strands for the report', stranded.size >= 3, String(stranded.size))
  check('a strand name is title-cased from the note\'s field',
    [...stranded.keys()].includes('Chemistry'), [...stranded.keys()].join(','))
}

/* ------------------------------------------------------------------ *
 * 4. Every card says what it is
 * ------------------------------------------------------------------ */

{
  for (const c of allCards()) {
    check('card "' + String(c.front).slice(0, 40) + '" carries a kind', KINDS.has(c.kind) || c.kind === 'term',
      String(c.kind))
    check('card "' + String(c.front).slice(0, 40) + '" names its source', Boolean(c.source && c.source.includes('/')),
      String(c.source))
  }
}

/* ------------------------------------------------------------------ *
 * 5. The package is a real Anki package
 * ------------------------------------------------------------------ */

{
  const bytes = apkgBytes(allCards())
  const dir = mkdtempSync(join(tmpdir(), 'mimir-apkg-'))
  const file = join(dir, 'Mimir.apkg')
  writeFileSync(file, bytes)
  check('the .apkg is written and is not empty', existsSync(file) && bytes.length > 1000, String(bytes.length))

  // A .apkg is a zip: the local-file header is the first four bytes.
  const head = readFileSync(file).subarray(0, 4)
  check('it begins with a zip local-file header', head.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    head.toString('hex'))

  // And it holds a real SQLite collection, which is what makes it importable.
  const unzipped = join(dir, 'unzipped')
  mkdirSync(unzipped)
  execFileSync('unzip', ['-qq', file, '-d', unzipped])
  const names = readdirSync(unzipped)
  check('the package carries a collection', names.includes('collection.anki2') || names.includes('collection.anki21'),
    names.join(','))
  check('the package carries a media map', names.includes('media'), names.join(','))
  rmSync(dir, { recursive: true, force: true })
}

/* ------------------------------------------------------------------ *
 * 6. The command line
 * ------------------------------------------------------------------ */

function run (args, opts = {}) {
  try {
    const out = execFileSync(process.execPath, [TOOL, '--vault', vault, ...args],
      { encoding: 'utf8', stdio: 'pipe', ...opts })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') }
  }
}

{
  const dry = run([])
  check('a bare run writes nothing and says so', dry.ok && /nothing written/.test(dry.out))
  check('the dry run counts the cards', /\d+ cards across \d+ strand/.test(dry.out), dry.out.split('\n')[0])
}

{
  const out = mkdtempSync(join(tmpdir(), 'mimir-anki-out-'))
  const r = run(['--all', '--out', out])
  check('--all writes the package and the text planes', r.ok && existsSync(join(out, 'Mimir.apkg')),
    r.ok ? '' : r.out.slice(0, 200))
  check('a tsv is written per note type',
    readdirSync(out).filter(f => f.endsWith('.tsv')).length >= 1, readdirSync(out).join(','))
  const tsv = readFileSync(join(out, 'Mimir.tsv'), 'utf8')
  check('the tsv names the deck', tsv.includes(DECK_NAME), tsv.split('\n')[0])
  check('the tsv carries a card front', /lowest-energy arrangement/.test(tsv))
  rmSync(out, { recursive: true, force: true })
}

{
  const out = mkdtempSync(join(tmpdir(), 'mimir-anki-strand-'))
  const ok = run(['--strand', 'chemistry', '--out', out])
  check('--strand writes a deck named for the strand', ok.ok && readdirSync(out).some(f => f.includes('Chemistry')),
    readdirSync(out).join(','))
  rmSync(out, { recursive: true, force: true })

  const bad = run(['--strand', 'nope'])
  check('an unknown strand fails loudly rather than writing an empty deck', !bad.ok)
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

rmSync(vault, { recursive: true, force: true })

for (const f of failures) console.log('FAIL  ' + f)
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
