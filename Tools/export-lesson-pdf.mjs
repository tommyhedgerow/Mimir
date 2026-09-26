#!/usr/bin/env node
/**
 * Tools/export-lesson-pdf.mjs — print a lesson to a PDF you can hold.
 *
 * WHY THIS EXISTS
 *   The lesson is read in the conversation, on the board, and written down in
 *   `Learn/Sessions/`. Both of those need the window open. This makes the third
 *   thing: the lesson as a page — on paper, on a phone, off the machine.
 *
 *   There is no pandoc, no LaTeX and no typst on this machine, and the vault's
 *   tools carry no dependencies on purpose. What there is, is Chrome, whose
 *   headless `--print-to-pdf` renders HTML and CSS properly — including the SVG
 *   diagrams the vault already draws, and a real text layer, so the PDF is
 *   searchable rather than a photograph of words. So the pipeline is: read the
 *   note, render it to HTML here, and let Chrome put it on paper.
 *
 * TWO ARTIFACTS, AND THEY ARE DIFFERENT THINGS
 *   --record   the session note as it stands: goal, probe, plan, nodes, checks,
 *              reading, sources, with its diagram in place. The record, made to
 *              stand alone on a page.
 *   --sheet    a study sheet: the goal, the map, the claims in one line each,
 *              the session's vocabulary, and the checks printed as questions
 *              with the answers held back to an appendix. Built to be worked
 *              from, not read.
 *
 *   Both flatten `[[wikilinks]]` to their display text. A PDF cannot resolve a
 *   link into this vault, and a page that promises a link it cannot keep is the
 *   same mistake the publish step exists to avoid.
 *
 * USAGE
 *   node Tools/export-lesson-pdf.mjs --list
 *   node Tools/export-lesson-pdf.mjs "mycology" --sheet
 *   node Tools/export-lesson-pdf.mjs "2026-09-20 Organic chemistry" --both
 *   node Tools/export-lesson-pdf.mjs --all --record
 *   node Tools/export-lesson-pdf.mjs --all --both --out ~/Desktop
 *
 *   --out DIR      write somewhere else (default Learn/Exports/)
 *   --keep-html    leave the intermediate HTML beside the PDF
 *   --quiet        only report the files written
 *
 * KNOWN LIMIT, stated rather than hidden: Chrome cannot put a page number in an
 * `@page` margin box, so these PDFs have no running page numbers. Everything
 * else about the page — the breaks, the tables, the diagrams — is controlled.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, mkdtempSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, basename, dirname, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseNote, renderMarkdown, renderInline, splitSections, findSection, parseTables, findEmbeds, escapeHtml } from './lib/vault-md.mjs'

// The vault this tool reads. Normally the one it lives in; `MIMIR_VAULT`
// (or `--vault DIR`) points it at another, which is what the test suite does so
// that a fresh clone with no lessons in it can still be checked.
// `--vault DIR` is read before anything else, so the path constants below can be
// plain `const`s: whichever vault the caller named is the one they resolve against.
{
  const i = process.argv.indexOf('--vault')
  const v = i === -1 ? null : process.argv[i + 1]
  if (v && !v.startsWith('--')) process.env.MIMIR_VAULT = resolve(v)
}

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const VAULT = process.env.MIMIR_VAULT
  ? resolve(process.env.MIMIR_VAULT)
  : fileURLToPath(new URL('..', import.meta.url))
const SESSIONS = join(VAULT, 'Learn', 'Sessions')
const CONCEPTS = join(VAULT, 'Learn', 'Concepts')
const GLOSSARY = join(VAULT, 'Learn', 'Glossary')
const VIZ = join(VAULT, 'Learn', 'Viz')
const DEFAULT_OUT = join(VAULT, 'Learn', 'Exports')

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const takeFlag = name => {
  const i = argv.indexOf(name)
  if (i === -1) return null
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const has = name => argv.includes(name)

const OUT_DIR = (() => {
  const v = takeFlag('--out')
  if (!v || v === true) return DEFAULT_OUT
  return v.startsWith('/') ? v : resolve(process.cwd(), v)
})()
const MODE = has('--sheet') && has('--record') ? 'both'
  : has('--sheet') ? 'sheet'
    : has('--record') ? 'record'
      : has('--both') ? 'both' : null
const KEEP_HTML = has('--keep-html')
const QUIET = has('--quiet')

/** Positional arguments — everything that is not a flag or a flag's value. */
const positionals = (() => {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' || a === '--vault') { i++; continue }
    if (a.startsWith('--')) continue
    out.push(a)
  }
  return out
})()

/* ------------------------------------------------------------------ *
 * Reading the vault
 * ------------------------------------------------------------------ */

const log = (...a) => { if (!QUIET) console.log(...a) }

export function readNote (path) {
  return parseNote(readFileSync(path, 'utf8'))
}

export function sessionNotes () {
  return readdirSync(SESSIONS)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ file: f, path: join(SESSIONS, f) }))
    .sort((a, b) => a.file.localeCompare(b.file))
}

const normalise = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Find one session note from a path, a filename, or any distinctive fragment. */
export function resolveSession (needle) {
  const notes = sessionNotes()
  if (existsSync(needle) && statSync(needle).isFile()) {
    const path = resolve(needle)
    const found = notes.find(n => n.path === path)
    if (found) return found
    return { file: basename(path), path }
  }
  const n = normalise(needle)
  const exact = notes.filter(x => normalise(x.file.replace(/\.md$/, '')) === n)
  if (exact.length === 1) return exact[0]
  const partial = notes.filter(x => normalise(x.file).includes(n))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error('"' + needle + '" matches ' + partial.length + ' lessons:\n  ' +
      partial.map(p => p.file).join('\n  '))
  }
  throw new Error('no lesson matches "' + needle + '" — run with --list to see them')
}

/** The concept notes a session created, from its `nodes:` mapping. */
export function conceptFor (title) {
  const path = join(CONCEPTS, String(title) + '.md')
  if (!existsSync(path)) return null
  const note = readNote(path)
  return { title: String(title), path, note, short: note.data.short ?? null, status: note.data.status ?? null, fragile: note.data.fragile === true }
}

export function glossaryFor (term) {
  const direct = join(GLOSSARY, String(term) + '.md')
  if (existsSync(direct)) return ledeOf(direct)
  const wanted = normalise(term)
  const hit = readdirSync(GLOSSARY).find(f => normalise(f.replace(/\.md$/, '')) === wanted)
  return hit ? ledeOf(join(GLOSSARY, hit)) : null
}

/** The first paragraph after the H1 — the vault writes the definition there. */
function ledeOf (path) {
  const note = readNote(path)
  const lines = note.body.split('\n')
  const para = []
  let started = false
  for (const line of lines) {
    const t = line.trim()
    if (!started) {
      if (t === '' || t.startsWith('#') || t.startsWith('---')) continue
      started = true
    }
    if (t === '' && para.length) break
    if (t.startsWith('#') || t.startsWith('---')) break
    para.push(t)
  }
  return para.join(' ').trim() || null
}

/* ------------------------------------------------------------------ *
 * Diagrams
 *
 * Priority, in order: what the note itself embeds; the strand map this session
 * was planned from (`spineFrom`); a Viz SVG whose name the session's own slug
 * contains. Nothing is invented — a note with no diagram gets a labelled
 * source block rather than an empty space.
 * ------------------------------------------------------------------ */

export function vizFiles () {
  if (!existsSync(VIZ)) return []
  return readdirSync(VIZ).filter(f => f.endsWith('.svg'))
}

const STOPWORDS = new Set(['introduction', 'restart', 'probe', 'and', 'plan', 'the', 'of', 'a', 'map', 'graph', 'session'])

function tokensOf (slug) {
  return normalise(slug).split('-').filter(t => t.length >= 4 && !STOPWORDS.has(t))
}

/** Best Viz SVG for a session slug, by distinctive-token overlap. Null if none. */
export function guessDiagram (slug, files) {
  const want = new Set(tokensOf(slug))
  if (want.size === 0) return null
  let best = null
  let bestScore = 0
  for (const f of files) {
    const score = tokensOf(f.replace(/\.svg$/, '')).filter(t => want.has(t)).length
    // A tie goes to the strand map: `-map.svg` is the teaching order, which is
    // what a study sheet wants, over a picture drawn for one session.
    const rank = score * 2 + (/^.*-map\.svg$/.test(f) ? 1 : 0)
    if (rank > bestScore) { bestScore = rank; best = f }
  }
  return bestScore >= 2 ? best : null
}

/** Read an SVG and make it inline-safe: no XML prologue, and it scales to the column. */
function inlineSvg (path) {
  if (!existsSync(path)) return null
  let svg = readFileSync(path, 'utf8')
  svg = svg.replace(/<\?xml[^>]*\?>\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/gi, '')
  return svg.trim()
}

/** Resolve one `![[…]]` embed target to HTML. */
export function embedHtml (target, width) {
  if (target.endsWith('.svg') && existsSync(join(VIZ, target))) {
    const svg = inlineSvg(join(VIZ, target))
    if (svg) {
      const style = width ? ' style="max-width:' + Number(width) + 'px"' : ''
      return '<figure class="diagram"' + style + '>' + svg + '</figure>'
    }
  }
  // A note transclusion, or a file we do not have — say so rather than drop it.
  return '<p class="missing">' + esc('[[' + target + ']]') + ' — not included in this PDF</p>'
}

/**
 * Which drawing belongs to this lesson. In order: what the note itself embeds;
 * a Viz file named after this session (which is how `vault-chart.mjs` names what
 * it draws, and the rule the Lesson pane already uses); the strand map the plan
 * was taken from; and failing all of those, a distinctive-word match.
 * Nothing is invented — a lesson with no drawing gets a labelled source block.
 */
export function primaryDiagram (note, slug) {
  const embeds = findEmbeds(note.body)
  const own = embeds.find(e => e.target.endsWith('.svg') && existsSync(join(VIZ, e.target)))
  if (own) return { kind: 'embed', target: own.target, width: own.width }

  const files = vizFiles()
  if (slug) {
    const named = files.find(f => f.startsWith(slug))
    if (named) return { kind: 'session', target: named, width: null }
  }

  const spineFrom = note.data.spineFrom
  if (typeof spineFrom === 'string' && spineFrom.trim()) {
    const wanted = normalise(spineFrom)
    const hit = files.find(f => normalise(f.replace(/\.svg$/, '')) === wanted)
    if (hit) return { kind: 'spineFrom', target: hit, width: null }
  }

  const guessed = slug ? guessDiagram(slug, files) : null
  return guessed ? { kind: 'guess', target: guessed, width: null } : null
}

/* ------------------------------------------------------------------ *
 * Page furniture
 * ------------------------------------------------------------------ */

const TOKENS = JSON.parse(readFileSync(join(TOOLS_DIR, 'mimir-tokens.json'), 'utf8')).light

const CSS = `
  @page { size: A4; margin: 17mm 16mm 20mm; }
  * { box-sizing: border-box; }
  html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body {
    margin: 0; background: ${TOKENS.paper}; color: ${TOKENS.ink};
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    font-size: 10.6pt; line-height: 1.5; text-rendering: optimizeLegibility;
  }
  .sheet { max-width: 172mm; margin: 0 auto; }

  header.title { border-bottom: 2px solid ${TOKENS.mark}; padding-bottom: 6mm; margin-bottom: 7mm; }
  header.title .kicker {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 7.6pt; letter-spacing: .14em; text-transform: uppercase; color: ${TOKENS['ink-2']};
  }
  header.title h1 { font-size: 21pt; line-height: 1.16; margin: 2.5mm 0 3mm; letter-spacing: -.01em; }
  header.title .meta {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 8.2pt; color: ${TOKENS['ink-2']}; display: flex; flex-wrap: wrap; gap: 2mm 5mm;
  }
  header.title .meta b { color: ${TOKENS.mark}; font-weight: 600; }

  h2 { font-size: 13.4pt; margin: 8mm 0 2.5mm; color: ${TOKENS.mark}; break-after: avoid; }
  h3 { font-size: 11.4pt; margin: 6mm 0 2mm; break-after: avoid; }
  h4 { font-size: 10.4pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  h1 { font-size: 17pt; }
  p { margin: 0 0 2.6mm; }
  a { color: ${TOKENS.cyan}; text-decoration: none; border-bottom: .4pt solid ${TOKENS.rule}; }
  span.wl { color: ${TOKENS['ink-2']}; font-style: italic; }
  strong { font-weight: 650; }
  hr { border: 0; border-top: .6pt solid ${TOKENS.rule}; margin: 6mm 0; }

  ul, ol { margin: 0 0 2.8mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  li > ul, li > ol { margin-top: 1.2mm; }

  blockquote {
    margin: 3mm 0; padding: 2mm 0 2mm 4mm; border-left: 2px solid ${TOKENS.mark};
    background: ${TOKENS['mark-soft']}; color: ${TOKENS.ink}; break-inside: avoid;
  }
  blockquote > :last-child { margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.4pt; }
  th { text-align: left; font-weight: 600; color: ${TOKENS.mark}; border-bottom: 1pt solid ${TOKENS.line}; padding: 1.6mm 2mm; }
  td { border-bottom: .5pt solid ${TOKENS.rule}; padding: 1.6mm 2mm; vertical-align: top; }
  td.center, th.center { text-align: center; }
  td.right, th.right { text-align: right; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }

  pre.code {
    background: ${TOKENS['paper-2']}; border: .5pt solid ${TOKENS.rule};
    padding: 2.5mm 3mm; font-size: 8.4pt; white-space: pre-wrap; word-break: break-word;
    break-inside: avoid; position: relative;
  }
  pre.code code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }
  pre.code .lang {
    position: absolute; top: 1mm; right: 2mm; font-size: 7pt; letter-spacing: .1em;
    text-transform: uppercase; color: ${TOKENS['ink-3']};
  }
  code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: .9em;
    background: ${TOKENS['paper-2']}; padding: 0 .6mm; border-radius: 1mm; }

  figure.diagram { margin: 4mm 0 5mm; break-inside: avoid; text-align: center; }
  figure.diagram svg { max-width: 100%; height: auto; }
  .missing { color: ${TOKENS.peach}; font-style: italic; font-size: 9pt; }

  .claims { list-style: none; padding-left: 0; }
  .claims li { border-left: 2px solid ${TOKENS['mark-soft']}; padding: 0 0 0 3mm; margin-bottom: 3mm; break-inside: avoid; }
  .claims .id {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 8pt; color: ${TOKENS.mark};
  }
  .claims .what { display: block; }
  .claims .short { color: ${TOKENS['ink-2']}; font-size: 9.6pt; }
  .tag {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 7.2pt;
    letter-spacing: .08em; text-transform: uppercase; padding: .3mm 1.2mm; border-radius: 1mm;
    background: ${TOKENS['paper-3']}; color: ${TOKENS['ink-2']};
  }
  .tag.fragile { background: ${TOKENS['peach-soft']}; color: ${TOKENS.peach}; }
  .tag.learning { background: ${TOKENS['mark-soft']}; color: ${TOKENS.mark}; }

  ol.questions { padding-left: 7mm; }
  ol.questions li { margin-bottom: 3mm; break-inside: avoid; }
  ol.questions .hint { display: block; font-size: 8.6pt; color: ${TOKENS['ink-3']}; }

  footer.colophon {
    margin-top: 9mm; padding-top: 3mm; border-top: .6pt solid ${TOKENS.rule};
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 7.4pt; color: ${TOKENS['ink-3']}; display: flex; justify-content: space-between; gap: 4mm;
  }
  .answers td:first-child { width: 7mm; }
  .answers .pick { font-style: italic; }
  .verdict-y { color: ${TOKENS.mark}; font-weight: 700; }
  .verdict-n { color: ${TOKENS.peach}; font-weight: 700; }
`

const esc = escapeHtml

function titleBlock ({ topic, data, kind }) {
  const meta = []
  if (data.date) meta.push('<span><b>date</b> ' + esc(data.date) + '</span>')
  if (Array.isArray(data.subjects) && data.subjects.length) meta.push('<span><b>strand</b> ' + esc(data.subjects.join(', ')) + '</span>')
  if (data.status) meta.push('<span><b>status</b> ' + esc(data.status) + '</span>')
  if (typeof data.probe_checks === 'number') meta.push('<span><b>probe</b> ' + data.probe_correct + '/' + data.probe_checks + '</span>')
  if (typeof data.teach_checks === 'number') meta.push('<span><b>checks</b> ' + data.teach_correct + '/' + data.teach_checks + '</span>')
  return '<header class="title">' +
    '<div class="kicker">Mimir · ' + (kind === 'sheet' ? 'study sheet' : 'lesson record') + '</div>' +
    '<h1>' + esc(topic) + '</h1>' +
    '<div class="meta">' + meta.join('') + '</div>' +
    '</header>'
}

function colophon (file) {
  return '<footer class="colophon"><span>' + esc('Learn/Sessions/' + file) + '</span>' +
    '<span>' + esc('exported ' + new Date().toISOString().slice(0, 10) + ' · Tools/export-lesson-pdf.mjs') + '</span></footer>'
}

function documentHtml (title, inner) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>' + esc(title) + '</title><style>' + CSS + '</style></head>' +
    '<body><div class="sheet">' + inner + '</div></body></html>'
}

/** Drop the note's own `# Title` — the title block carries it instead. */
export function bodyWithoutTitle (body) {
  const lines = String(body).split('\n')
  const i = lines.findIndex(l => /^#\s+/.test(l))
  if (i !== -1) lines.splice(i, 1)
  return lines.join('\n')
}

const renderOpts = (note, slug) => ({
  links: 'text',
  embed: (target, width) => embedHtml(target, width),
  mermaid: (src) => {
    // A note that wrote its plan as a mermaid fence but has a drawing on disk
    // gets the drawing; one that has neither keeps its source, labelled.
    const primary = primaryDiagram(note, slug)
    if (primary) return embedHtml(primary.target, primary.width)
    return '<pre class="code lang-mermaid"><span class="lang">mermaid</span><code>' + esc(src) + '</code></pre>'
  }
})

/* ------------------------------------------------------------------ *
 * The two artifacts
 * ------------------------------------------------------------------ */

/**
 * Whether a lesson has anything a study sheet could be worked from. A lesson
 * taught without a probe — a tooling session — has a goal-shaped heading at most,
 * and an empty sheet that looks like a study aid is a small lie.
 */
export function sheetIsUseful (note) {
  const sections = splitSections(note.body)
  const checks = findSection(sections, 'Checks')
  const rows = checks ? (parseTables(checks.body)[0]?.rows.length ?? 0) : 0
  if (rows > 0) return true
  if (spineClaims(note).length > 0) return true
  if (Array.isArray(note.data.terms) && note.data.terms.length > 0) return true
  return false
}

export function recordHtml (session, note) {
  const slug = session.file.replace(/\.md$/, '')
  const topic = note.data.topic || slug
  const opts = renderOpts(note, slug)

  const inner = [titleBlock({ topic, data: note.data, kind: 'record' })]

  const sections = splitSections(bodyWithoutTitle(note.body))
  const nodesMap = note.data.nodes && typeof note.data.nodes === 'object' ? note.data.nodes : {}
  const created = Object.values(nodesMap).map(conceptFor).filter(Boolean)

  // Rendered section by section so a heading never orphans at a page foot, and
  // so the plan's own drawing lands where the plan is.
  const rendered = sections.map(s =>
    '<section><h2>' + renderInline(s.title, opts) + '</h2>' + renderMarkdown(s.body, opts) + '</section>')

  inner.push(rendered.join('\n'))

  if (created.length) {
    inner.push('<section><h2>Appendix — the notes this lesson left behind</h2>' +
      renderClaims(created) + '</section>')
  }
  inner.push(colophon(session.file))
  return documentHtml(topic, inner.join('\n'))
}

export function renderClaims (concepts) {
  return '<ul class="claims">' + concepts.map(c => {
    const tag = c.kind === 'foundation' ? '<span class="tag">already held</span>'
      : c.kind === 'goal' ? '<span class="tag">the goal</span>'
        : c.fragile ? '<span class="tag fragile">fragile</span>'
          : c.status ? '<span class="tag ' + esc(c.status) + '">' + esc(c.status) + '</span>' : ''
    return '<li>' + (c.id ? '<span class="id">' + esc(c.id) + '</span> ' : '') +
      '<span class="what"><strong>' + esc(c.title) + '</strong> ' + tag + '</span>' +
      (c.short ? '<span class="short">' + renderInline(c.short, { links: 'text' }) + '</span>' : '') + '</li>'
  }).join('') + '</ul>'
}

/** The spine of a plan, in teaching order: what was already held, what was taught, the goal. */
export function spineClaims (note) {
  const nodesMap = note.data.nodes && typeof note.data.nodes === 'object' ? note.data.nodes : {}
  const graph = note.data.graph && typeof note.data.graph === 'object' ? note.data.graph : {}
  const asArray = v => Array.isArray(v) ? v : (typeof v === 'string' ? [v] : [])
  const groups = [
    { kind: 'foundation', entries: asArray(graph.foundations) },
    { kind: 'node', entries: asArray(graph.nodes) },
    { kind: 'goal', entries: asArray(graph.goal ?? graph.goals) }
  ]
  const claims = []
  const seen = new Set()
  for (const g of groups) {
    for (const entry of g.entries) {
      const [id, label] = String(entry).split('|').map(s => s.trim())
      if (!id || seen.has(id)) continue
      seen.add(id)
      const concept = nodesMap[id] ? conceptFor(nodesMap[id]) : null
      claims.push(concept
        ? { ...concept, id, kind: g.kind }
        : { title: label ?? id, short: null, status: null, fragile: false, id, kind: g.kind })
    }
  }
  // A `nodes:` mapping with no matching spine entry — never drop a taught node.
  for (const [id, title] of Object.entries(nodesMap)) {
    if (seen.has(id)) continue
    seen.add(id)
    claims.push(conceptFor(title) ||
      { title: String(title), short: null, status: null, fragile: false, id, kind: 'node' })
  }
  return claims
}

export function sheetHtml (session, note) {
  const slug = session.file.replace(/\.md$/, '')
  const topic = note.data.topic || slug
  const opts = renderOpts(note, slug)
  const sections = splitSections(note.body)
  const inner = [titleBlock({ topic, data: note.data, kind: 'sheet' })]

  const goal = findSection(sections, 'Goal')
  if (goal) {
    inner.push('<section><h2>What I was after</h2>' + renderMarkdown(goal.body, opts) + '</section>')
  }

  const plan = primaryDiagram(note, slug)
  if (plan) {
    inner.push('<section><h2>The plan</h2>' + embedHtml(plan.target, plan.width) + '</section>')
  }

  // The claims: a mapped node's own note where there is one, otherwise the
  // spine's own label — never a claim the session did not actually state.
  const claims = spineClaims(note)
  if (claims.length) {
    inner.push('<section><h2>The claims</h2>' + renderClaims(claims) + '</section>')
  }

  const terms = Array.isArray(note.data.terms) ? note.data.terms : []
  if (terms.length) {
    const rows = terms.map(t => ({ term: String(t), lede: glossaryFor(t) }))
    inner.push('<section><h2>The words this lesson needed</h2><table><thead><tr><th>term</th><th>what it means</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td><strong>' + esc(r.term) + '</strong></td><td>' +
        (r.lede ? renderInline(r.lede, { links: 'text' }) : '<span class="missing">no glossary note yet</span>') +
        '</td></tr>').join('') + '</tbody></table></section>')
  }

  const checks = findSection(sections, 'Checks')
  const tables = checks ? parseTables(checks.body) : []
  const table = tables[0]
  if (table && table.rows.length) {
    const col = name => table.head.findIndex(h => h.toLowerCase().includes(name))
    const ci = { n: 0, q: col('question'), pick: col('my pick'), ok: col('✓'), revealed: col('revealed'), repair: col('repair') }
    const num = r => (ci.n >= 0 && r[ci.n] ? r[ci.n] : '')

    inner.push('<section><h2>Questions — answer these cold</h2><ol class="questions">' +
      table.rows.map(r => '<li>' + renderInline(r[ci.q] ?? '', opts) +
        (ci.repair >= 0 && r[ci.repair] && r[ci.repair] !== '—' ? '<span class="hint">repair: ' + renderInline(r[ci.repair], opts) + '</span>' : '') +
        '</li>').join('') + '</ol>' +
      '<p style="font-size:9pt;color:#5d5749">Answers are overleaf. Attempt each one before you look — a page that turns into re-reading is worth less than no page at all.</p></section>')

    inner.push('<section style="break-before:page"><h2>Answers</h2><table class="answers">' +
      '<thead><tr><th>#</th><th>I said</th><th></th><th>What it showed</th></tr></thead><tbody>' +
      table.rows.map(r => '<tr><td>' + esc(num(r)) + '</td>' +
        '<td class="pick">' + renderInline(r[ci.pick] ?? '', opts) + '</td>' +
        '<td class="' + (String(r[ci.ok]).includes('✓') ? 'verdict-y' : 'verdict-n') + '">' + esc(r[ci.ok] ?? '') + '</td>' +
        '<td>' + renderInline(r[ci.revealed] ?? '', opts) + '</td></tr>').join('') +
      '</tbody></table></section>')
  }

  const next = findSection(sections, 'Updates')
  if (next) {
    const bullet = next.body.split('\n').find(l => /^\s*-\s*\*\*Next time/i.test(l))
    if (bullet) inner.push('<section><h2>Where to go next</h2>' + renderMarkdown(bullet.replace(/^\s*-\s*/, ''), opts) + '</section>')
  }

  inner.push(colophon(session.file))
  return documentHtml(topic + ' — study sheet', inner.join('\n'))
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

export function findChrome () {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  return null
}

/**
 * Print one HTML file to PDF, and make Chrome exit.
 *
 * Chrome writes the file in a couple of seconds and then does not terminate —
 * verified on this machine, and it is not a failure, it is what it does. So this
 * waits for the PDF to appear and stop growing, then kills the process. It tries
 * the old headless first and falls back through the newer switches, because the
 * flag that works has changed across Chrome versions.
 */
export function printPdf (chrome, htmlPath, pdfPath, { timeoutMs = 60000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'mimir-print-'))
  const modes = ['--headless=old', '--headless=new', '--headless']
  const attempt = mode => new Promise(resolve => {
    if (existsSync(pdfPath)) rmSync(pdfPath, { force: true })
    const args = [mode, '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--disable-sync', '--disable-extensions', '--disable-background-networking',
      '--disable-component-update', '--user-data-dir=' + profile,
      '--virtual-time-budget=15000', '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath, pathToFileURL(htmlPath).href]
    const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', d => { stderr += d })
    const started = Date.now()
    let last = -1
    let stable = 0
    const tick = setInterval(() => {
      const done = () => { clearInterval(tick); try { child.kill('SIGKILL') } catch {} resolve({ ok: true, stderr }) }
      if (existsSync(pdfPath)) {
        const size = statSync(pdfPath).size
        if (size > 1000 && size === last) {
          if (++stable >= 2) return done()
        } else stable = 0
        last = size
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(tick); try { child.kill('SIGKILL') } catch {}
        resolve({ ok: false, stderr: stderr + '\n(timed out)' })
      }
    }, 400)
  })

  return (async () => {
    let last = null
    for (const mode of modes) {
      last = await attempt(mode)
      if (last.ok) { rmSync(profile, { recursive: true, force: true }); return last }
    }
    rmSync(profile, { recursive: true, force: true })
    return last
  })()
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function usage (notes) {
  console.log('Tools/export-lesson-pdf.mjs — print a lesson to PDF\n')
  console.log('  node Tools/export-lesson-pdf.mjs "mycology" --sheet')
  console.log('  node Tools/export-lesson-pdf.mjs --all --both\n')
  console.log('  --record | --sheet | --both   which artifact (default: --record)')
  console.log('  --all                         every lesson in Learn/Sessions/')
  console.log('  --done                        only lessons whose status is `done`')
  console.log('  --out DIR                     write somewhere other than Learn/Exports/')
  console.log('  --vault DIR                   read another vault instead of this one')
  console.log('  --keep-html                   keep the intermediate HTML')
  console.log('  --list                        show the lessons and stop\n')
  console.log('Lessons:')
  for (const n of notes) {
    let meta = {}
    try { meta = parseNote(readFileSync(n.path, 'utf8')).data } catch {}
    console.log('  ' + (meta.status ?? '?').padEnd(12) + n.file.replace(/\.md$/, ''))
  }
}

async function main () {
  const notes = sessionNotes()
  if (has('--list') || has('--help') || has('-h')) { usage(notes); process.exit(0) }
  if (!positionals.length && !has('--all') && !has('--done')) { usage(notes); process.exit(2) }

  const chrome = findChrome()
  if (!chrome) {
    console.error('No Chrome, Chromium or Edge found. Set CHROME=/path/to/chrome and retry.')
    process.exit(1)
  }

  const mode = MODE ?? 'record'
  const wanted = has('--all') ? notes
    : has('--done') ? notes.filter(n => { try { return readNote(n.path).data.status === 'done' } catch { return false } })
      : positionals.map(resolveSession)
  const targets = wanted
  if (!targets.length) { console.error('Nothing to export.'); process.exit(1) }

  mkdirSync(OUT_DIR, { recursive: true })
  const written = []

  for (const session of targets) {
    const note = readNote(session.path)
    const slug = session.file.replace(/\.md$/, '')
    const jobs = mode === 'both' ? ['record', 'sheet'] : [mode]
    for (const kind of jobs) {
      // A tooling session has no goal, no plan and no checks, so its "study
      // sheet" would be a title and a footer. Printing that is worse than not
      // printing it, so it is skipped and said out loud.
      if (kind === 'sheet' && !sheetIsUseful(note)) {
        log('· ' + slug + ' — no study sheet: nothing to work from (no plan, checks or vocabulary)')
        continue
      }
      const html = kind === 'record' ? recordHtml(session, note) : sheetHtml(session, note)
      const suffix = kind === 'record' ? 'record' : 'study sheet'
      const base = join(OUT_DIR, slug + ' — ' + suffix)
      const htmlPath = base + '.html'
      const pdfPath = base + '.pdf'
      writeFileSync(htmlPath, html)

      const res = await printPdf(chrome, htmlPath, pdfPath)
      if (!res.ok) {
        console.error('FAILED to print ' + slug + ' (' + kind + ')\n' + (res.stderr || '').split('\n').slice(-6).join('\n'))
        process.exitCode = 1
        continue
      }
      const bytes = statSync(pdfPath).size
      if (!KEEP_HTML) rmSync(htmlPath, { force: true })
      written.push({ pdfPath, bytes, kind, slug })
      log('· ' + slug + ' — ' + suffix + '  ' + (bytes / 1024).toFixed(0) + ' KB')
    }
  }

  console.log('\n' + written.length + ' PDF(s) in ' + OUT_DIR.replace(VAULT, '') + (KEEP_HTML ? ' (HTML kept)' : ''))
  for (const w of written) console.log('  ' + w.pdfPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('export-lesson-pdf: ' + err.message); process.exit(1) })
}
