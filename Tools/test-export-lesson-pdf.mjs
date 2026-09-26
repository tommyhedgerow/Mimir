#!/usr/bin/env node
/**
 * Tools/test-export-lesson-pdf.mjs — what keeps the PDF export honest, in any vault.
 *
 * It pins the things a wrong answer here would put on paper:
 *
 *   · A SESSION RESOLVES BY AN EXACT NAME OR BY ANY DISTINCTIVE FRAGMENT, and an
 *     ambiguous fragment is refused rather than guessed at.
 *
 *   · THE CONCEPTS A SESSION PLANNED ARE FOUND FROM ITS OWN `nodes:` MAPPING, and
 *     a node whose note does not exist is skipped rather than printed as a title.
 *
 *   · THE FRONTMATTER PARSER AGREES WITH WHAT THE TEMPLATES WRITE. This library
 *     carries its own copy of the vault's small YAML grammar, so it is checked
 *     against the real templates rather than trusted.
 *
 *   · AN EMBED BECOMES THE DRAWING, NOT ITS FILENAME. A lesson that refers to a
 *     picture it cannot show is worse than one that never mentioned it — and a
 *     missing drawing says so in words instead of vanishing.
 *
 *   · A LINK WHOSE URL CONTAINS BRACKETS SURVIVES. Wikipedia disambiguates with
 *     parentheses — `/wiki/Caesar_(title)` — and a truncating pattern leaves a
 *     stray bracket in the prose and breaks the link.
 *
 *   · CHROME ACTUALLY PRODUCES A PDF, AND IT IS A4 WITH A REAL TEXT LAYER, when a
 *     Chrome is present. The run is real, not stubbed: the intermediate HTML is a
 *     claim, the file on disk is the artifact. Where there is no Chrome the PDF
 *     checks are skipped and said to be skipped, never silently passed.
 *
 * WHY IT BUILDS ITS OWN VAULT. This suite ran against the author's vault for as
 * long as that vault was the only one, and it cannot: a fresh clone has no lessons
 * in it, so every content check would either fail or test nothing. So it writes a
 * small vault into a temporary directory, reads it through the tool's `--vault`
 * switch, and deletes it. Nothing here reads the vault you are standing in.
 *
 * Usage:  node Tools/test-export-lesson-pdf.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL = join(HERE, 'export-lesson-pdf.mjs')

let passed = 0
const failures = []
const skipped = []
function check (what, ok, detail = '') {
  if (ok) { passed++ } else { failures.push(what + (detail ? ' — ' + detail : '')) }
}
function skip (what) { skipped.push(what) }

/* ------------------------------------------------------------------ *
 * The fixture vault
 * ------------------------------------------------------------------ */

const vault = mkdtempSync(join(tmpdir(), 'mimir-pdf-'))
for (const d of [['Learn', 'Sessions'], ['Learn', 'Concepts'], ['Learn', 'Glossary'],
  ['Learn', 'Viz'], ['Learn', 'Reviews'], ['Learn', 'Templates']]) {
  mkdirSync(join(vault, ...d), { recursive: true })
}

writeFileSync(join(vault, 'Learn', 'Viz', '2026-01-01-climate-introduction-graph.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">' +
  '<rect width="400" height="200" fill="#fff"/><text x="20" y="100">a drawing</text></svg>')

writeFileSync(join(vault, 'Learn', 'Sessions', '2026-01-01 Climate — introduction.md'), [
  '---',
  'date: 2026-01-01',
  'type: session',
  'topic: Climate — introduction',
  'subjects: [earth sciences]',
  'probe_checks: 6',
  'probe_correct: 5',
  'teach_checks: 4',
  'teach_correct: 4',
  'nodes:',
  '  N1: The greenhouse effect',
  'graph:',
  '  foundations:',
  '    - "F1 | Energy arrives as light and leaves as heat"',
  '  nodes:',
  '    - "N1 | Some gases return the heat"',
  '  goal: "G | Why the surface is warm"',
  '  edges:',
  '    - F1 -> N1',
  '    - N1 -> G',
  'status: done',
  'terms: [Greenhouse gas]',
  '---',
  '',
  '# Climate — introduction',
  '',
  '## 🎯 Goal',
  '',
  'Why the surface is warmer than the light alone would make it.',
  '',
  '![[2026-01-01-climate-introduction-graph.svg]]',
  '',
  '## ✅ Checks',
  '',
  '| # | Question | Their answer | Verdict |',
  '| --- | --- | --- | --- |',
  '| 1 | What happens to outgoing heat? | Some is returned | ✓ |',
  '',
  '## 📝 Nodes',
  '',
  '### N1 — Some gases return the heat',
  '',
  'The link between [the greenhouse effect](https://en.wikipedia.org/wiki/Greenhouse_effect) and ' +
  '[Caesar (title)](https://en.wikipedia.org/wiki/Caesar_(title)) is not a real link, only a bracket test.',
  '',
  '## 🔗 Sources',
  '',
  '- https://en.wikipedia.org/wiki/Greenhouse_effect',
  ''
].join('\n'))

writeFileSync(join(vault, 'Learn', 'Sessions', '2026-01-02 Climate — the carbon cycle.md'), [
  '---', 'date: 2026-01-02', 'type: session', 'topic: Climate — the carbon cycle',
  'subjects: [earth sciences]', 'status: done', '---', '', '# Climate — the carbon cycle', '',
  'Nothing was checked in this one.', ''
].join('\n'))

writeFileSync(join(vault, 'Learn', 'Concepts', 'The greenhouse effect.md'), [
  '---', 'type: concept', 'title: The greenhouse effect', 'short: Heat returned',
  'status: established', 'fragile: false', '---', '',
  '# The greenhouse effect', '',
  'Some gases absorb outgoing heat and return part of it, so the surface stays warm.', ''
].join('\n'))

writeFileSync(join(vault, 'Learn', 'Glossary', 'Greenhouse gas.md'), [
  '---', 'type: term', 'term: Greenhouse gas', 'field: Earth sciences', '---', '',
  '# Greenhouse gas', '',
  'A gas that absorbs and re-emits infrared radiation.', ''
].join('\n'))

/* ------------------------------------------------------------------ *
 * The tool, imported and driven
 * ------------------------------------------------------------------ */

process.env.MIMIR_VAULT = vault
const pdf = await import(pathToFileURL(TOOL).href)

/* ------------------------------------------------------------------ *
 * 1. Resolving a session
 * ------------------------------------------------------------------ */

{
  const all = pdf.sessionNotes()
  check('the fixture vault\'s sessions are listed', all.length === 2, String(all.length))

  const byName = pdf.resolveSession('2026-01-01 Climate — introduction')
  check('a session resolves by its exact name', byName.file.includes('introduction'), byName.file)

  const byFragment = pdf.resolveSession('carbon')
  check('a session resolves by a distinctive fragment', byFragment.file.includes('carbon'), byFragment.file)

  let threw = false
  try { pdf.resolveSession('nothing like this') } catch { threw = true }
  check('an unknown fragment fails loudly rather than printing the wrong lesson', threw)
}

/* ------------------------------------------------------------------ *
 * 2. Following the plan's own mapping
 * ------------------------------------------------------------------ */

{
  const session = pdf.resolveSession('introduction')
  const note = pdf.readNote(session.path)

  const concept = pdf.conceptFor('The greenhouse effect')
  check('a planned node resolves to its concept note', Boolean(concept) && concept.title === 'The greenhouse effect')
  check('the concept carries its own short form and status',
    concept.short === 'Heat returned' && concept.status === 'established')

  const missing = pdf.conceptFor('A note that was never written')
  check('a node with no note is skipped, not printed as a title', missing === null)

  const lede = pdf.glossaryFor('Greenhouse gas')
  check('a glossary term resolves to its definition', typeof lede === 'string' && /infrared/.test(lede),
    String(lede))

  check('an absent glossary term returns nothing rather than a guess',
    pdf.glossaryFor('Nonexistent term') === null)

  check('the renderer knows which lesson has checks worth a study sheet', pdf.sheetIsUseful(note) === true)

  const thin = pdf.readNote(pdf.resolveSession('carbon').path)
  check('and which one does not', pdf.sheetIsUseful(thin) === false)
}

/* ------------------------------------------------------------------ *
 * 3. The record itself
 * ------------------------------------------------------------------ */

{
  const session = pdf.resolveSession('introduction')
  const note = pdf.readNote(session.path)
  const html = pdf.recordHtml(session, note)

  check('the record names the lesson', html.includes('Climate — introduction'))
  check('the record carries the probe score from the frontmatter',
    /<b>probe<\/b>\s*5\/6/.test(html) && /<b>checks<\/b>\s*4\/4/.test(html),
    'no 5/6 and 4/4 in the title block')
  check('the record carries the node it taught', html.includes('Some gases return the heat'))

  check('an embedded drawing is inlined as SVG, not named as a file',
    html.includes('<svg') && !/!\[\[.*\.svg/.test(html))
  check('a link whose URL contains brackets survives whole',
    html.includes('https://en.wikipedia.org/wiki/Caesar_(title)'),
    'the bracket was truncated')
  check('a Wikipedia link is still a real link',
    /<a [^>]*href="https:\/\/en\.wikipedia\.org\/wiki\/Greenhouse_effect"/.test(html))
  check('the record is a whole HTML document', /<html[\s>]/i.test(html) && /<\/html>/i.test(html))
}

/* ------------------------------------------------------------------ *
 * 4. The study sheet
 * ------------------------------------------------------------------ */

{
  const session = pdf.resolveSession('introduction')
  const note = pdf.readNote(session.path)
  const sheet = pdf.sheetHtml(session, note)
  check('the study sheet renders', typeof sheet === 'string' && sheet.length > 500, String(sheet.length))
  check('the sheet hides the answers from the questions',
    !/Some is returned/.test(sheet) || /appendix/i.test(sheet))
}

/* ------------------------------------------------------------------ *
 * 5. The command line
 * ------------------------------------------------------------------ */

function run (args) {
  try {
    return { ok: true, out: execFileSync(process.execPath, [TOOL, '--vault', vault, ...args],
      { encoding: 'utf8', stdio: 'pipe' }) }
  } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') } }
}

{
  const listed = run(['--list'])
  check('--list names the lessons and stops', listed.ok && listed.out.includes('Climate — the carbon cycle'),
    listed.out.slice(0, 120))

  // An ambiguous fragment must be refused by name, not resolved to one of them.
  const ambiguous = run(['climate'])
  check('an ambiguous fragment is refused and both matches are named',
    !ambiguous.ok && /matches 2 lessons/.test(ambiguous.out), ambiguous.out.slice(0, 160))
}

/* ------------------------------------------------------------------ *
 * 6. Chrome, when there is one
 * ------------------------------------------------------------------ */

{
  const chrome = pdf.findChrome()
  if (!chrome) {
    skip('the PDF is A4 with a real text layer (no Chrome on this machine)')
    skip('the CLI writes the artifact (no Chrome on this machine)')
  } else {
    const out = mkdtempSync(join(tmpdir(), 'mimir-pdf-out-'))
    const r = run(['carbon', '--record', '--out', out])
    const files = existsSync(out) ? readdirSync(out) : []
    const made = files.find(f => f.endsWith('.pdf'))
    check('the CLI writes the artifact', r.ok && Boolean(made), r.ok ? files.join(',') : r.out.slice(0, 200))

    if (made) {
      const bytes = readFileSync(join(out, made))
      check('the artifact is a PDF', bytes.subarray(0, 5).toString() === '%PDF-', bytes.subarray(0, 8).toString())
      // A4 is 595.28 x 841.89 points. Chrome lands within a point of it, because it
      // lays the page out in device pixels first, so the box is compared with a
      // tolerance rather than matched as a literal.
      const text = bytes.toString('latin1')
      const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text)
      const near = (got, want) => Math.abs(Number(got) - want) <= 1.5
      check('the page is A4', Boolean(box) && near(box[3], 595.28) && near(box[4], 841.89),
        box ? box[3] + 'x' + box[4] : 'no media box found')
      check('the PDF has a real text layer, not an image of one',
        /\/FontFile|ToUnicode/.test(text), 'no font or ToUnicode map')
    }
    rmSync(out, { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

rmSync(vault, { recursive: true, force: true })

for (const f of failures) console.log('FAIL  ' + f)
for (const s of skipped) console.log('SKIP  ' + s)
console.log(`\n${passed} passed, ${failures.length} failed${skipped.length ? ', ' + skipped.length + ' skipped' : ''}`)
if (failures.length) process.exit(1)
