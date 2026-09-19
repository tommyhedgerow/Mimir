#!/usr/bin/env node
/**
 * Tools/vault-map.mjs — put each strand map's node state back in sync with the
 * concept notes.
 *
 * WHY THIS EXISTS
 *   The strand maps carry a vertical mermaid dependency graph. The graph's spine
 *   is authored by hand, because a plan is a design and its shape is a judgement.
 *   What must not be authored by hand is *where the student actually is* — that changes
 *   every session, and a hand-edited picture of it goes stale silently.
 *
 *   So: the spine stays in the note, and this script writes the state on top of
 *   it, derived from the concept notes' frontmatter. It never touches the nodes,
 *   the edges or the labels. It rewrites only what lies between the two markers:
 *
 *       %% BEGIN generated · vault-map.mjs
 *       ...
 *       %% END generated · vault-map.mjs
 *
 *   A map declares which of its graph nodes are real concept notes:
 *
 *       nodes:
 *         N1: A fungus grows through its food
 *         N2: A colony that grows at its edge is dated by its radius
 *
 *   Any node in the graph that is *not* listed is drawn as `planned` — declared
 *   in a plan, and nothing on disk yet. That distinction is the whole point: a
 *   plan and an inventory no longer look alike.
 *
 * USAGE
 *   node Tools/vault-map.mjs            # check only, never writes
 *   node Tools/vault-map.mjs --write    # rewrite the generated regions
 *   node Tools/vault-map.mjs --check    # same as no argument; exits 1 on problems
 *
 * Exits non-zero if a map references a concept note that does not exist, or
 * declares a node that appears nowhere in its graph. Both would render wrong.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VAULT = fileURLToPath(new URL('..', import.meta.url))
const CONCEPT_DIR = join(VAULT, 'Learn', 'Concepts')
const MAP_DIR = join(VAULT, 'Learn', 'Maps')
const SESSION_DIR = join(VAULT, 'Learn', 'Sessions')

const BEGIN = '%% BEGIN generated · vault-map.mjs'
const END = '%% END generated · vault-map.mjs'

// Frontmatter that this small parser accepts but strict YAML does not.
const PARSE_WARNINGS = []

const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')

/* ------------------------------------------------------------------ *
 * A deliberately small YAML subset — frontmatter only
 *
 * Supports: scalars (plain, "double", 'single'), flow lists [a, b],
 * block lists of scalars, nested mappings by indentation, comments.
 * Anything else throws rather than guessing, because a silent mis-parse
 * here would put a wrong state on a map.
 * ------------------------------------------------------------------ */

function unescapeQuoted (s, q) {
  return s.replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\\\/g, '\\')
}

function splitTopLevel (s, sep = ',') {
  const parts = []
  let depth = 0
  let quote = null
  let cur = ''
  for (const ch of s) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '[' || ch === '{') depth++
    if (ch === ']' || ch === '}') depth--
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(p => p !== '')
}

function parseScalar (raw) {
  const s = raw.trim()
  if (s === '') return null
  const q = s[0]
  if ((q === '"' || q === "'") && s.length >= 2 && s.endsWith(q)) {
    return unescapeQuoted(s.slice(1, -1), q)
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitTopLevel(s.slice(1, -1)).map(parseScalar)
  }
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  return s
}

/** Strip a trailing ` # comment` that is not inside quotes. */
function stripComment (line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

function parseList (lines, i, indent) {
  const out = []
  while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('-')) {
    const item = lines[i].text.replace(/^-\s*/, '')
    if (item === '') {
      if (i + 1 >= lines.length || lines[i + 1].indent <= indent) { out.push(null); i++; continue }
      const [v, ni] = parseNode(lines, i + 1, lines[i + 1].indent)
      out.push(v)
      i = ni
      continue
    }
    // A quoted or flow-collection item is safe even when its text contains a
    // colon; only a bare `key: value` inside a list is unsupported.
    if (!/^["'[]/.test(item) && /^[^:\s][^:]*:(\s|$)/.test(item)) {
      throw new Error('list of mappings is not supported — keep frontmatter to scalars and lists of scalars: "- ' + item + '"')
    }
    out.push(parseScalar(item))
    i++
  }
  return [out, i]
}

function parseMap (lines, i, indent) {
  const out = {}
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('-')) {
    const m = /^([^:]+):\s?(.*)$/.exec(lines[i].text)
    if (!m) throw new Error('unparseable frontmatter line: "' + lines[i].text + '"')
    const key = m[1].trim()
    const rest = m[2]
    if (rest.trim() === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const [v, ni] = parseNode(lines, i + 1, lines[i + 1].indent)
        out[key] = v
        i = ni
        continue
      }
      out[key] = null
      i++
      continue
    }
    const rawValue = rest.trim()
    if (rawValue && !/^["'\[]/.test(rawValue) && /:\s/.test(rawValue)) {
      PARSE_WARNINGS.push('frontmatter `' + key + '` has an unquoted colon+space in a plain value — strict YAML (which Obsidian uses) rejects that line and drops the note’s properties; quote the value or use an em dash')
    }
    out[key] = parseScalar(rest)
    i++
  }
  return [out, i]
}

function parseNode (lines, i, indent) {
  if (lines[i].text.startsWith('-')) return parseList(lines, i, indent)
  return parseMap(lines, i, indent)
}

/** Frontmatter object, or {} when there is none. */
function parseFrontmatter (text) {
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end === -1) return {}
  const body = text.slice(text.indexOf('\n', 3) + 1, end + 1)
  const lines = []
  for (const raw of body.split('\n')) {
    const noComment = stripComment(raw)
    if (noComment.trim() === '') continue
    lines.push({ indent: noComment.match(/^ */)[0].length, text: noComment.trim() })
  }
  if (lines.length === 0) return {}
  const [value] = parseNode(lines, 0, lines[0].indent)
  return value || {}
}

/* ------------------------------------------------------------------ *
 * Vault reading
 * ------------------------------------------------------------------ */

/** `[[Target|alias]]` / `[[Target]]` → Target */
function wikilinkTarget (value) {
  const m = /^\[\[([^\]|#]+)/.exec(String(value).trim())
  return m ? m[1].trim() : null
}

function readFrontmatter (path) {
  return parseFrontmatter(readFileSync(path, 'utf8'))
}

function loadConcepts () {
  const concepts = new Map()
  for (const file of readdirSync(CONCEPT_DIR)) {
    if (!file.endsWith('.md')) continue
    const name = file.slice(0, -3)
    const fm = readFrontmatter(join(CONCEPT_DIR, file))
    if (fm.type !== 'concept') continue
    concepts.set(name, {
      name,
      status: fm.status || 'seed',
      fragile: fm.fragile === true,
      subjects: Array.isArray(fm.subjects) ? fm.subjects : [],
      depends_on: (Array.isArray(fm.depends_on) ? fm.depends_on : []).map(wikilinkTarget).filter(Boolean),
      taught: fm.taught || null,
      review_due: fm.review_due || null,
      short: fm.short || null,
      retrievals: Array.isArray(fm.retrievals) ? fm.retrievals : []
    })
  }
  return concepts
}

/* ------------------------------------------------------------------ *
 * Graph state
 * ------------------------------------------------------------------ */

/**
 * `planned` is not a concept status: it means the node exists only in a plan.
 * `fragile` outranks `status`, because it is the actionable signal.
 */
function stateOf (concept) {
  if (!concept) return 'planned'
  if (concept.fragile) return 'fragile'
  if (concept.status === 'established') return 'established'
  if (concept.status === 'seed') return 'seed'
  return 'learning'
}

const RANK = { planned: 0, seed: 1, learning: 2, fragile: 3, established: 4 }

// Stroke only — fill is left to the theme, so these read correctly in light
// and dark. Solid mint for what is held, solid peach for what is still moving,
// dashed for fragile, faint dotted for planned. The values are the Mimir theme's own
// state colours, and `Tools/check-tokens.mjs` holds them to it: mint `--mimir-mint`,
// peach `--mimir-peach`, faint `--mimir-ink-3`.
const CLASS_DEFS = [
  ['vm-established', 'stroke:#2f7d63,stroke-width:2.5px'],
  ['vm-learning', 'stroke:#b5642f,stroke-width:2.5px'],
  ['vm-fragile', 'stroke:#b5642f,stroke-width:2.5px,stroke-dasharray:5 3'],
  ['vm-seed', 'stroke:#665e4c,stroke-width:1.5px,stroke-dasharray:2 3'],
  ['vm-planned', 'stroke:#665e4c,stroke-width:1.5px,stroke-dasharray:3 4']
]

/**
 * Node ids must be read from the graph's *structure*, never from its prose.
 * Scanning raw text goes wrong in two ways: a label like "...between conversion
 * (1000) and record" invents a node called `conversion` (which mermaid rejects
 * as a `class` target), and requiring an identifier immediately before `-->`
 * misses every edge whose source carries a label — that is, almost all of them.
 * So: ids come from `id["…"]`, and edges come from the body with the label
 * brackets removed.
 */
function stripNodeBrackets (graphBody) {
  return graphBody.replace(/\[\s*"(?:[^"\\]|\\.)*"\s*\]/g, '')
}

const NODE_DEF = /([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*"/g
const EDGE = /([A-Za-z_][A-Za-z0-9_]*)\s*--+[>xo]?\s*([A-Za-z_][A-Za-z0-9_]*)/g

/** Node ids, in the order the spine declares them. */
function graphNodeIds (graphBody) {
  const ids = []
  for (const m of graphBody.matchAll(NODE_DEF)) if (!ids.includes(m[1])) ids.push(m[1])
  for (const m of stripNodeBrackets(graphBody).matchAll(EDGE)) {
    for (const id of [m[1], m[2]]) if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Declared edges between ids, label brackets removed, duplicates dropped. */
function graphEdges (graphBody) {
  const edges = []
  const seen = new Set()
  for (const m of stripNodeBrackets(graphBody).matchAll(EDGE)) {
    const key = m[1] + '\u0000' + m[2]
    if (seen.has(key)) continue
    seen.add(key)
    edges.push([m[1], m[2]])
  }
  return edges
}

function mermaidBlocks (text) {
  const blocks = []
  const re = /```mermaid\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(text)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length, body: m[1], full: m[0] })
  }
  return blocks
}

/** Node id → its mermaid label, for the nodes that have one. */
function nodeLabels (graphBody) {
  const labels = new Map()
  for (const m of graphBody.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*"((?:[^"\\]|\\.)*)"\s*\]/g)) {
    labels.set(m[1], m[2].replace(/<br\s*\/?>/gi, ' '))
  }
  return labels
}

/**
 * Foundations and goals carry no learning state, and the maps already mark them
 * by convention: a 🎯 in the label is the sink, and `Foundation`/`Held` opens a
 * label that is not a thing to be learned. Everything else is a teaching node.
 */
function isStructuralNode (label) {
  if (!label) return false
  return label.includes('🎯') || /^(Foundation|Held)\b/.test(label)
}

function renderStateRegion (mapFm, graphBody) {
  const nodesFm = mapFm.nodes && typeof mapFm.nodes === 'object' && !Array.isArray(mapFm.nodes) ? mapFm.nodes : {}
  const mapped = new Map()
  const problems = []

  for (const [nodeId, conceptName] of Object.entries(nodesFm)) {
    // `N6:` with no value means: declared in the plan, no note yet.
    if (conceptName === null || conceptName === '') { mapped.set(nodeId, null); continue }
    const concept = CONCEPTS.get(conceptName)
    if (!concept) {
      problems.push('map declares node ' + nodeId + ' → "' + conceptName + '", but there is no concept note of that name')
      continue
    }
    mapped.set(nodeId, concept)
  }

  const labels = nodeLabels(graphBody)
  const byState = new Map()
  const add = (state, id) => {
    if (!byState.has(state)) byState.set(state, [])
    byState.get(state).push(id)
  }
  for (const id of graphNodeIds(graphBody)) {
    if (isStructuralNode(labels.get(id))) continue
    const concept = mapped.get(id)
    if (concept) add(stateOf(concept), id)
    else add('planned', id)
  }

  const line = []
  const used = new Set(byState.keys())
  for (const [name, def] of CLASS_DEFS) {
    if (used.has(name.slice(3))) line.push('  classDef ' + name + ' ' + def)
  }
  for (const state of [...byState.keys()].sort((a, b) => RANK[a] - RANK[b])) {
    line.push('  class ' + byState.get(state).join(',') + ' vm-' + state)
  }

  const total = CONCEPTS.size
  const retrievals = [...CONCEPTS.values()].reduce((n, c) => n + c.retrievals.length, 0)
  const conceptIds = new Set([...mapped.values()].filter(Boolean).map(c => c.name))
  const subject = mapFm.subject
  const relevant = [...CONCEPTS.values()]
    .filter(c => subject && c.subjects.includes(subject) && !conceptIds.has(c.name))
    .map(c => c.name)

  line.push('  %% state derived from the concept notes · ' + total + ' concept' + (total === 1 ? '' : 's') +
    ' in the vault · ' + retrievals + ' retrieval' + (retrievals === 1 ? '' : 's') + ' recorded')

  return { region: line.join('\n'), problems, conceptIds, relevant }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const CONCEPTS = loadConcepts()
let failures = 0
const notes = []

const MARKER_STRIP = new RegExp(
  '[ \\t]*' + BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?',
  'g'
)

/** `id | text` — a node that exists only in the spine, with no concept note. */
function parseIdText (raw) {
  const s = String(raw)
  const i = s.indexOf('|')
  if (i === -1) return { id: s.trim(), label: '' }
  return { id: s.slice(0, i).trim(), label: s.slice(i + 1).trim() }
}

/**
 * A map's spine can live in two places, and both are supported so the maps can
 * migrate one at a time:
 *
 *   - `graph:` frontmatter — structure where structure belongs, and the form the
 *     SVG renderer wants. Concept nodes need no text here: their box label comes
 *     from the concept note's own `short:`.
 *   - a ```mermaid block — the older form. The state is drawn inside the graph.
 */
function readSpine (text, fm) {
  const nodesFm = fm.nodes && typeof fm.nodes === 'object' && !Array.isArray(fm.nodes) ? fm.nodes : {}
  const g = fm.graph && typeof fm.graph === 'object' && !Array.isArray(fm.graph) ? fm.graph : null

  if (g) {
    const nodes = []
    for (const raw of Array.isArray(g.foundations) ? g.foundations : []) {
      const { id, label } = parseIdText(raw)
      nodes.push({ id, label, kind: 'foundation', state: null, short: null, retrievals: 0 })
    }
    for (const [id, conceptName] of Object.entries(nodesFm)) {
      const concept = conceptName ? CONCEPTS.get(conceptName) : null
      nodes.push({
        id,
        label: concept ? concept.name : String(conceptName || ''),
        kind: concept ? 'concept' : 'planned',
        state: concept ? stateOf(concept) : 'planned',
        short: concept ? concept.short : null,
        retrievals: concept ? concept.retrievals.length : 0
      })
    }
    for (const raw of Array.isArray(g.nodes) ? g.nodes : []) {
      const { id, label } = parseIdText(raw)
      nodes.push({ id, label, kind: 'planned', state: 'planned', short: null, retrievals: 0 })
    }
    for (const raw of Array.isArray(g.goals) ? g.goals : []) {
      const { id, label } = parseIdText(raw)
      nodes.push({ id, label, kind: 'goal', state: null, short: null, retrievals: 0 })
    }
    if (g.goal) {
      // Either `goal: "G1 | text"` or the plain `goal: text` form, in which case
      // the id comes from `goalId` (or G).
      const raw = String(g.goal)
      const parsed = raw.includes('|') ? parseIdText(raw) : { id: '', label: raw }
      nodes.push({
        id: parsed.id || String(g.goalId || 'G'),
        label: parsed.label,
        kind: 'goal',
        state: null,
        short: null,
        retrievals: 0
      })
    }
    const edges = (Array.isArray(g.edges) ? g.edges : [])
      .map(e => String(e).split(/->|→/).map(s => s.trim()).filter(Boolean))
      .filter(p => p.length === 2)
    return { nodes, edges }
  }

  const block = mermaidBlocks(text)[0]
  if (!block) return null
  const body = block.body.replace(MARKER_STRIP, '')
  const labels = nodeLabels(body)
  const nodes = graphNodeIds(body).map(id => {
    const label = labels.get(id) || id
    const conceptName = nodesFm[id]
    const concept = conceptName ? CONCEPTS.get(conceptName) : null
    const kind = label.includes('🎯') ? 'goal'
      : /^(Foundation|Held)\b/.test(label) ? 'foundation'
        : concept ? 'concept' : 'planned'
    return {
      id,
      label,
      kind,
      state: concept ? stateOf(concept) : (kind === 'planned' ? 'planned' : null),
      short: concept ? concept.short : null,
      retrievals: concept ? concept.retrievals.length : 0
    }
  })
  return { nodes, edges: graphEdges(body) }
}

if (argv.includes('--json')) {
  const out = []
  for (const [dir, type] of [[MAP_DIR, 'map'], [SESSION_DIR, 'session']]) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      const text = readFileSync(join(dir, file), 'utf8')
      const fm = parseFrontmatter(text)
      if (fm.type !== type) continue
      if (String(fm.subject || '').toLowerCase() === 'all') continue
      const spine = readSpine(text, fm)
      if (!spine) continue
      out.push({
        file,
        type,
        date: fm.date || null,
        subject: fm.subject || fm.topic || file.replace(/\.md$/, ''),
        state: fm.state || fm.status || null,
        frontier: fm.frontier || null,
        next: fm.next || null,
        ...spine
      })
    }
  }
  console.log(JSON.stringify(out))
  process.exit(0)
}

function report (kind, message) {
  const label = kind === 'FAIL' ? '✗' : kind === 'WARN' ? '!' : '·'
  notes.push(label + ' ' + message)
  if (kind === 'FAIL') failures++
}

/** A spine must name nodes that exist, and edges between them. */
function validateSpine (file, spine) {
  const ids = new Set(spine.nodes.map(n => n.id))
  if (ids.size !== spine.nodes.length) report('FAIL', file + ': duplicate node id in the spine')
  for (const [a, b] of spine.edges) {
    if (!ids.has(a)) report('FAIL', file + ': edge from "' + a + '", which is not a node in this graph')
    if (!ids.has(b)) report('FAIL', file + ': edge to "' + b + '", which is not a node in this graph')
  }
  const held = new Set(spine.edges.flat())
  for (const n of spine.nodes) {
    if (n.kind !== 'goal' && !held.has(n.id)) report('WARN', file + ': node "' + n.id + '" is in no edge — it will float on the chart')
  }
}

for (const file of readdirSync(MAP_DIR)) {
  if (!file.endsWith('.md')) continue
  const path = join(MAP_DIR, file)
  const text = readFileSync(path, 'utf8')
  const fm = parseFrontmatter(text)
  if (fm.type !== 'map') continue
  // An index map has no strand and no graph of its own.
  if (String(fm.subject || '').toLowerCase() === 'all') continue

  const blocks = mermaidBlocks(text)
  const hasFrontmatterSpine = !!(fm.graph && typeof fm.graph === 'object' && !Array.isArray(fm.graph))

  if (hasFrontmatterSpine) {
    // The spine is frontmatter and the picture is an SVG, so there is no
    // mermaid region to maintain here — only the spine to keep honest.
    const spine = readSpine(text, fm)
    validateSpine(file, spine)
    report('INFO', file + ': ' + spine.nodes.length + ' nodes, frontmatter spine — state renders in Learn/Viz/')
    continue
  }

  if (blocks.length === 0) {
    // A map with no picture at all is a failure, not a note to skip quietly.
    report('FAIL', file + ': no dependency graph — neither a `graph:` spine nor a mermaid block')
    continue
  }
  if (blocks.length > 1) {
    report('WARN', file + ': more than one mermaid block — only the first is managed')
  }

  const block = blocks[0]
  const graphBody = block.body.replace(new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')

  const ids = graphNodeIds(graphBody)
  const nodesFm = fm.nodes && typeof fm.nodes === 'object' && !Array.isArray(fm.nodes) ? fm.nodes : {}
  for (const nodeId of Object.keys(nodesFm)) {
    if (!ids.includes(nodeId)) {
      report('FAIL', file + ': frontmatter maps node "' + nodeId + '" but no such node appears in the graph — mermaid would error on `class ' + nodeId + '`')
    }
  }

  const { region, problems, relevant } = renderStateRegion(fm, graphBody)
  for (const p of problems) report('FAIL', file + ': ' + p)
  // A concept that claims this subject but is never mentioned on the map at all
  // is a real omission. One that is mentioned in the prose but not drawn on the
  // graph is a judgement call the map's author already made.
  const bodyText = text.replace(/^---[\s\S]*?\n---/, '')
  for (const r of relevant) {
    if (!bodyText.includes(r)) report('WARN', file + ': concept "' + r + '" belongs to this subject and is never mentioned on this map')
  }

  // Drift check: a drawn edge between two concepts must match `depends_on`.
  for (const [from, to] of graphEdges(graphBody)) {
    const fromName = nodesFm[from]
    const toName = nodesFm[to]
    if (!fromName || !toName) continue
    const toConcept = CONCEPTS.get(toName)
    const fromConcept = CONCEPTS.get(fromName)
    if (!toConcept || !fromConcept) continue
    const declared = toConcept.depends_on.includes(fromConcept.name)
    const reverse = fromConcept.depends_on.includes(toConcept.name)
    if (!declared && !reverse) {
      report('WARN', file + ': edge ' + from + ' → ' + to + ' (' + fromName + ' → ' + toName + ') has no matching depends_on in either concept note')
    }
  }

  if (WRITE) {
    let body = block.body
    const markerRe = new RegExp('([ \\t]*)' + BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?')
    const replacement = '  ' + BEGIN + '\n' + region + '\n  ' + END + '\n'
    if (markerRe.test(body)) {
      body = body.replace(markerRe, replacement)
    } else {
      body = body.replace(/\s*$/, '\n') + replacement
    }
    const updated = text.slice(0, block.start) + '```mermaid\n' + body + '```' + text.slice(block.end)
    if (updated !== text) writeFileSync(path, updated)
  }

  const drawn = Object.keys(nodesFm).length
  report('INFO', file + ': ' + ids.length + ' nodes, ' + drawn + ' mapped to concept notes' + (WRITE ? ' — written' : ''))
}

for (const c of CONCEPTS.values()) {
  if (c.status !== 'seed' && !c.taught) report('WARN', 'concept "' + c.name + '" is ' + c.status + ' but has no `taught:` date')
  if (c.review_due && c.retrievals.length >= 4 && c.status !== 'established') {
    report('WARN', 'concept "' + c.name + '" has ' + c.retrievals.length + ' retrievals but is still ' + c.status)
  }
}

for (const w of PARSE_WARNINGS) report('WARN', w)

console.log(notes.join('\n'))
console.log('\n' + (WRITE ? 'WROTE' : 'CHECK ONLY') + ' · ' + CONCEPTS.size + ' concepts · ' + failures + ' failure(s)')
if (!WRITE) console.log('run with --write to update the generated regions')
process.exit(failures > 0 ? 1 : 0)
