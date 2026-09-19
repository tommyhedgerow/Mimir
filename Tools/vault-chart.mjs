#!/usr/bin/env node
/**
 * Tools/vault-chart.mjs — draw each strand map's dependency graph as a compact
 * SVG that fits the reading column.
 *
 * WHY THIS EXISTS
 *   Mermaid is the wrong renderer for a picture the student reads *in the note*. Its
 *   defaults pad every box like a form, so a five-rank graph runs to a full
 *   screen of scrolling, and nothing about it is designed. The spine and the
 *   state are already data (Tools/vault-map.mjs --json); this draws them once,
 *   by hand, at a fixed size.
 *
 *   It reads the spine from vault-map.mjs rather than re-parsing anything, so
 *   there is one place that knows what a map means.
 *
 * USAGE
 *   node Tools/vault-chart.mjs              # write Learn/Viz/<subject>-map.svg
 *   node Tools/vault-chart.mjs --only mycology
 *   node Tools/vault-chart.mjs --print mycology   # SVG to stdout, writes nothing
 *
 * The output is self-contained: no external fonts, no CSS variables, and no
 * <defs> ids — an SVG embedded in Obsidian is isolated from the page, and two
 * inlined SVGs on one page would otherwise collide over an arrow marker. Colours
 * are baked for the light theme with a prefers-color-scheme override.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VAULT = fileURLToPath(new URL('..', import.meta.url))
const VIZ = join(VAULT, 'Learn', 'Viz')

const argv = process.argv.slice(2)
const flag = name => {
  const i = argv.indexOf(name)
  return i === -1 ? null : (argv[i + 1] ?? true)
}
const ONLY = flag('--only')
const PRINT = flag('--print')

/* ------------------------------------------------------------------ *
 * Metrics — the whole point is that these are small and known.
 * ------------------------------------------------------------------ */

/**
 * WHAT THE LABELS ARE SET IN, and why it is not a free choice.
 *
 * A label has to fit its box, and the box cannot grow without turning the map into a
 * column of two-word lines. So the label face is a budget: what one glyph costs decides
 * how much of a node's `short:` the reader actually gets to see. Monospace costs the
 * most — every glyph the widest — and it is what showed `disturbance is normal; what…`
 * where the whole claim fits in a serif.
 *
 * `MIMIR_CHART_FONT` picks the face, and every face carries its own measured advance:
 *
 *   serif   the Mimir serif stack — the default, and what these labels are: prose
 *   mono    the Mimir monospace stack (the theme's furniture face)
 *   mixed   serif labels, monospace for the id badges and the legend
 *
 * THE DEFAULT WAS MONOSPACE, AND THAT WAS THE WRONG CHOICE — measurably. Monospace
 * gives every glyph the width of the widest one, so at this box width five of these
 * maps lost labels to an ellipsis (`disturbance is normal; what…`) where the serif fits
 * all of them and draws the same map a rank and a half shorter. The drawings are prose
 * in boxes; the id badges and the legend are furniture, and those stay monospace in
 * every face, because their job is to look like a machine put them there.
 *
 * The measurement is the point. `charW` used to be a hand-tuned estimate, and when the
 * labels first moved to monospace the estimate was 13% under the truth, so every line
 * the wrapper believed fitted overran its box by a sixth of its width — text through the
 * border, and over the arrow behind it. A measured advance cannot drift from its font.
 */
const FACE = {
  mono: {
    family: 'ui-monospace,SFMono-Regular,"SF Mono",Monaco,Menlo,monospace',
    system: ['Menlo', 'SF Mono', 'Monaco', 'Courier New'],
    advance: 7.53
  },
  serif: {
    family: '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Charter,Georgia,"Times New Roman",serif',
    system: ['Iowan Old Style', 'Palatino', 'Palatino Linotype', 'Book Antiqua', 'Charter', 'Georgia', 'Times New Roman'],
    advance: 5.9
  }
}

/** The face the labels are set in, and the face the machine furniture is set in. */
const FACES = (() => {
  const asked = String(process.env.MIMIR_CHART_FONT || 'serif').toLowerCase()
  const label = asked === 'mono' ? FACE.mono : FACE.serif
  return { label, furniture: FACE.mono, asked }
})()

const M = {
  font: 12.5,
  line: 15.5,
  padX: 11,
  padY: 8,
  minW: 92,
  maxW: 204,
  maxLines: 3,
  maxPerRow: 3,       // more than this and the row outgrows the reading column
  gutter: 20,         // room for the node id badge to the left of the box
  sibGap: 11,
  rankGap: 28,
  margin: 12,
  legendGap: 16,
  legendFont: 10.5
}

/**
 * THE DRAWINGS WEAR MIMIR.
 *
 * These are not invented colours. Every one of them is a token from the theme that
 * now dresses both the vault and the Lesson window — the same warm paper, the same
 * mono labels, the same rule/line distinction — so a diagram read in the note, in
 * the pane and in the dark is inked in one frame rather than three.
 *
 * TWO PALETTES, BOTH COMPLETE. The light values are baked into the stylesheet and
 * the dark ones behind `prefers-color-scheme`. They are kept as role pairs, not as two
 * loose lists, because a drawing has to mean the same thing in either frame: `mint` is
 * what is held, `peach` what is still moving, `cyan` the vault's own furniture, and each
 * has exactly one value per frame. Change one here and `Tools/check-tokens.mjs` holds
 * every other file that speaks the palette to the same change.
 */
const PALETTE = {
  light: {
    // surfaces
    paper: '#faf6ea', 'paper-2': '#f2ead6', 'paper-3': '#e9dfc6',
    // ink
    ink: '#25231d', 'ink-2': '#5d5749', 'ink-3': '#665e4c',
    // rules: a hairline, the hairline a surface may have, and the one weight
    // that means "surface"
    rule: '#e3d9c1', 'rule-soft': '#eadfc8', line: '#c9bc9e',
    // the accent, and the tint that marks a thing as chosen
    mark: '#4f7a5c', 'mark-soft': '#dbe8d4',
    // the voices. mint is what is held, peach what is still moving, cyan the
    // vault's own furniture, lilac the working
    mint: '#2f7d63', peach: '#b5642f', 'peach-soft': '#f4e7d6', cyan: '#2c6b7a'
  },
  dark: {
    paper: '#06070d', 'paper-2': '#0b0e18', 'paper-3': '#121724',
    ink: '#dbeaf2', 'ink-2': '#9db8c6', 'ink-3': '#7f9dad',
    rule: '#182031', 'rule-soft': '#1e2739', line: '#2a3550',
    mark: '#8fd6a4', 'mark-soft': '#1e3830',
    mint: '#a6e3bd', peach: '#f0b183', 'peach-soft': '#33261d', cyan: '#95d7de'
  }
}

/* ── what each kind of node is painted with ──────────────────────────────────
 * Kept as paint objects rather than class names so the drawing can write them straight
 * onto the element, where nothing in a stylesheet can reach them. See `force()`.
 */
const STATE_KEY = { established: 'mint', learning: 'peach', fragile: 'peach' }

/** The fill and stroke of a node's box. */
function boxPaint (node, palette) {
  if (node.kind === 'goal') return { fill: palette['mark-soft'], stroke: palette.mark }
  if (node.kind === 'foundation') return { fill: palette['paper-3'] }
  return { fill: palette['paper-2'], stroke: palette['rule-soft'] }
}

/** The colour a state is spoken in, for a stripe, a dot or a legend swatch. */
function statePaint (node, palette) {
  if (node.kind === 'goal') return { fill: palette.mark }
  if (node.kind === 'foundation') return { fill: palette['ink-3'] }
  return { fill: palette[STATE_KEY[node.state]] || palette['ink-3'] }
}

/* State is a colour on a stripe and a word in the legend, never a loud border. */
const STROKE = {
  established: PALETTE.light.mint,
  learning: PALETTE.light.peach,
  fragile: PALETTE.light.peach,
  planned: PALETTE.light.ink3
}
const LABEL = {
  established: 'established',
  learning: 'learning',
  fragile: 'fragile',
  planned: 'not yet a note'
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * How wide a string actually is
 * ------------------------------------------------------------------ */

/**
 * The width of a string in the face it will be drawn in.
 *
 * macOS ships a real text engine and Node can reach it, so these widths are measured
 * rather than counted: CoreText lays the string out and reports its typographic bounds.
 * That is what keeps a wrapped line inside its box, and it matters most for the serif,
 * where `i` and `M` differ by more than a factor of two and a per-character count is
 * simply wrong.
 *
 * It is one Python process for the whole run, not one per string — a diagram has a few
 * hundred candidate lines, and spawning an interpreter for each took a minute. So the
 * widths are collected first and asked for in one batch. If Python or CoreText is not
 * there, the face falls back to its published advance, which over-estimates rather than
 * under-estimates: a box slightly too wide is a drawing nobody notices, a line one pixel
 * too long is text through the border.
 *
 * @param family - the CoreText family name, already resolved from the stack.
 * @param size - the point size the labels are set in.
 * @returns `{ measure }`, where `measure(strings)` returns a Map of width by string.
 */
function coreTextMeasurer (family, size) {
  const script = `
import ctypes, ctypes.util, json, sys
ct = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreText'))
cf = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreFoundation'))
cf.CFStringCreateWithCString.restype = ctypes.c_void_p
cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
cf.CFDictionaryCreate.restype = ctypes.c_void_p
cf.CFDictionaryCreate.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_void_p), ctypes.c_long, ctypes.c_void_p, ctypes.c_void_p]
cf.CFAttributedStringCreate.restype = ctypes.c_void_p
cf.CFAttributedStringCreate.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
ct.CTFontCreateWithName.restype = ctypes.c_void_p
ct.CTFontCreateWithName.argtypes = [ctypes.c_void_p, ctypes.c_double, ctypes.c_void_p]
ct.CTLineCreateWithAttributedString.restype = ctypes.c_void_p
ct.CTLineCreateWithAttributedString.argtypes = [ctypes.c_void_p]
ct.CTLineGetTypographicBounds.restype = ctypes.c_double
ct.CTLineGetTypographicBounds.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double)]
keys_cb = ctypes.c_void_p.in_dll(cf, 'kCFTypeDictionaryKeyCallBacks')
vals_cb = ctypes.c_void_p.in_dll(cf, 'kCFTypeDictionaryValueCallBacks')
font_name = ctypes.c_void_p.in_dll(ct, 'kCTFontAttributeName')
def cfs(s):
    return cf.CFStringCreateWithCString(None, s.encode('utf-8'), 0x08000100)
family, size, strings = sys.argv[1], float(sys.argv[2]), json.loads(sys.argv[3])
font = ct.CTFontCreateWithName(cfs(family), size, None)
if not font:
    sys.exit(3)
keys = (ctypes.c_void_p * 1)(ctypes.cast(font_name, ctypes.c_void_p).value)
values = (ctypes.c_void_p * 1)(font)
attrs = cf.CFDictionaryCreate(None, keys, values, 1, ctypes.byref(keys_cb), ctypes.byref(vals_cb))
out = []
for s in strings:
    line = ct.CTLineCreateWithAttributedString(cf.CFAttributedStringCreate(None, cfs(s), attrs))
    a, d, l = ctypes.c_double(), ctypes.c_double(), ctypes.c_double()
    out.append(ct.CTLineGetTypographicBounds(line, ctypes.byref(a), ctypes.byref(d), ctypes.byref(l)))
print(json.dumps(out))
`
  const run = strings => {
    if (strings.length === 0) return new Map()
    const asked = [...strings]
    const result = spawnSync('python3', ['-c', script, family, String(size), JSON.stringify(asked)],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 })
    if (result.error || result.status !== 0) return null
    try {
      const widths = JSON.parse(String(result.stdout).trim())
      if (!Array.isArray(widths) || widths.length !== asked.length) return null
      return new Map(asked.map((s, i) => [s, widths[i]]))
    } catch { return null }
  }
  return { family, run }
}

/** The face a family list resolves to on this machine, or null if nothing measures. */
function resolveFamily (stack) {
  for (const candidate of stack) {
    const measurer = coreTextMeasurer(candidate, M.font)
    const probed = measurer.run(['M'])
    if (probed !== null) return candidate
  }
  return null
}

const RESOLVED_LABEL_FAMILY = resolveFamily(FACES.label.system)
const LABEL_MEASURER = RESOLVED_LABEL_FAMILY === null ? null : coreTextMeasurer(RESOLVED_LABEL_FAMILY, M.font)

const widthCache = new Map()
const unresolved = new Set()

/** How the widths were arrived at, for the run's own report. */
const measuring = { how: RESOLVED_LABEL_FAMILY === null ? 'estimated' : 'measured', family: RESOLVED_LABEL_FAMILY }

/**
 * The width of `text`, in the label face.
 *
 * A miss is cached as an estimate and remembered, so a string is asked about once; the
 * batch that replaces those estimates is run before anything is drawn — see
 * {@link measureEverything}. Nothing downstream has to know which kind of number it got.
 */
function textW (text) {
  const s = String(text)
  const cached = widthCache.get(s)
  if (cached !== undefined) return cached
  const estimate = s.length * FACES.label.advance
  widthCache.set(s, estimate)
  unresolved.add(s)
  return estimate
}

/**
 * Measure every string the drawings need, in one batch, before any of them is laid out.
 *
 * Guessed widths are only ever used to find the *candidates*: every string a diagram
 * could draw is whatever a greedy wrap of its label produces, and a wrap from a small
 * over-estimate produces a superset of the lines an exact wrap produces. So the run is:
 * estimate, collect, measure once, then lay out for real against measured widths.
 * Laying out first and correcting afterwards would leave the boxes sized for a guess.
 *
 * @param graphs - the maps about to be drawn.
 */
function measureEverything (graphs) {
  if (LABEL_MEASURER === null) return
  const found = new Set()
  const collect = text => {
    const s = String(text)
    found.add(s)
    for (const line of wrap(s, M.maxW * 1.3).lines) found.add(line)
  }
  for (const graph of graphs) {
    for (const node of graph.nodes) collect(displayText(node))
    for (const node of graph.nodes) collect(LABEL[node.state] || '')
  }
  const measured = LABEL_MEASURER.run([...found].filter(s => s !== ''))
  if (measured === null) {
    measuring.how = 'estimated'
    return
  }
  for (const [s, width] of measured) {
    widthCache.set(s, width)
    unresolved.delete(s)
  }
}

/** Greedy wrap. Over-long text is ellipsized on the last allowed line —
 *  never silently dropped, because a cut label changes what the map claims. */
function wrap (text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (textW(next) <= maxW || !cur) cur = next
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  if (lines.length <= M.maxLines) return { lines: lines.length ? lines : [''], overflow: false }
  const head = lines.slice(0, M.maxLines - 1)
  let tail = lines.slice(M.maxLines - 1).join(' ')
  while (tail.length > 1 && textW(tail + '…') > maxW) tail = tail.slice(0, -1)
  head.push(tail.trimEnd() + '…')
  return { lines: head, overflow: true }
}

/** What the box actually says — the id is drawn in the gutter, not in the box. */
function displayText (n) {
  if (n.kind === 'concept' && n.short) return n.short
  let t = String(n.label)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^🎯\s*/, '')
  if (n.kind === 'foundation') t = t.replace(/^(Foundation|Held)\s*[·:]\s*/i, '')
  // As in the migration: only strip the id when it is a separate token, or id
  // `P` eats the P of `Puzzle`.
  const id = n.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return t.replace(new RegExp('^' + id + '(?:\\s*[·:—–-]\\s*|\\s+)'), '').trim()
}

/* ------------------------------------------------------------------ *
 * Layout — layered top-down, which is right for a narrow column. The
 * width is what has to be controlled, not the height.
 * ------------------------------------------------------------------ */
function layout (graph) {
  const nodes = graph.nodes.map(n => {
    const text = displayText(n)
    const { lines, overflow } = wrap(text, M.maxW - LABEL_INSET)
    const w = Math.min(M.maxW, Math.max(M.minW, Math.max(...lines.map(textW)) + LABEL_INSET))
    const h = M.padY * 2 + lines.length * M.line
    return { ...n, lines, overflow, w, h }
  })

  const byId = new Map(nodes.map(n => [n.id, n]))
  const incoming = new Map(nodes.map(n => [n.id, []]))
  for (const [a, b] of graph.edges) {
    if (incoming.has(b) && byId.has(a)) incoming.get(b).push(a)
  }

  const depth = new Map()
  const walk = (id, stack) => {
    if (depth.has(id)) return depth.get(id)
    if (stack.has(id)) return 0
    stack.add(id)
    const ins = incoming.get(id) || []
    const d = ins.length ? Math.max(...ins.map(p => walk(p, new Set(stack)))) + 1 : 0
    stack.delete(id)
    depth.set(id, d)
    return d
  }
  for (const n of nodes) walk(n.id, new Set())

  // A rank is a row, but a rank with five siblings would be wider than the
  // column, so long ranks wrap onto extra rows instead of shrinking the type.
  const byDepth = []
  for (const n of nodes) {
    const d = depth.get(n.id)
    n.depth = d
    ;(byDepth[d] = byDepth[d] || []).push(n)
  }
  const rows = []
  for (const row of byDepth) {
    if (!row) continue
    for (let i = 0; i < row.length; i += M.maxPerRow) rows.push(row.slice(i, i + M.maxPerRow))
  }

  const rowW = rows.map(row =>
    row.reduce((acc, n) => acc + n.w + M.gutter, 0) + M.sibGap * Math.max(0, row.length - 1))
  const width = M.margin * 2 + Math.max(...rowW)

  const legend = legendFor(nodes)
  const height = M.margin + rows.reduce((acc, row, i) =>
    acc + Math.max(...row.map(n => n.h)) + (i < rows.length - 1 ? M.rankGap : 0), 0) +
    M.legendGap + (legend.length ? M.legendFont + 6 : 0) + M.margin

  let y = M.margin
  for (const row of rows) {
    const rowH = Math.max(...row.map(n => n.h))
    let x = (width - (row.reduce((a, n) => a + n.w + M.gutter, 0) + M.sibGap * (row.length - 1))) / 2
    for (const n of row) {
      n.x = x + M.gutter
      n.y = y + (rowH - n.h) / 2
      x += n.w + M.gutter + M.sibGap
    }
    y += rowH + M.rankGap
  }

  // Two edges spanning the same pair of rows would otherwise lay their
  // horizontal runs on top of each other and read as one line. Spread them
  // across the corridor — it also turns a fan-out into something you can see.
  const bandSize = new Map()
  for (const [a, b] of graph.edges) {
    const A = byId.get(a), B = byId.get(b)
    if (!A || !B) continue
    const k = A.depth + ':' + B.depth
    bandSize.set(k, (bandSize.get(k) || 0) + 1)
  }
  const bandSeen = new Map()
  const edgeOffsets = graph.edges.map(([a, b]) => {
    const A = byId.get(a), B = byId.get(b)
    if (!A || !B) return 0
    const k = A.depth + ':' + B.depth
    const i = bandSeen.get(k) || 0
    bandSeen.set(k, i + 1)
    return (i - (bandSize.get(k) - 1) / 2) * 6
  })

  return { nodes, byId, width, height, legend, legendY: y - M.rankGap + M.legendGap, edgeOffsets }
}

function legendFor (nodes) {
  const items = []
  for (const s of ['established', 'learning', 'fragile', 'planned']) {
    if (nodes.some(n => n.state === s)) items.push({ kind: 'state', key: s, text: LABEL[s] })
  }
  if (nodes.some(n => n.kind === 'foundation')) items.push({ kind: 'foundation', text: 'held foundation' })
  if (nodes.some(n => n.kind === 'goal')) items.push({ kind: 'goal', text: 'the goal' })
  return items
}

/**
 * A chain is not a graph. Exactly one successor and one predecessor per node,
 * and one starting point, means the "graph" is a list drawn as boxes — and
 * stacked vertically it is the worst possible shape for a narrow column.
 */
function isChain (graph) {
  if (graph.nodes.length < 3) return false
  if (graph.edges.length !== graph.nodes.length - 1) return false
  const out = new Map(graph.nodes.map(n => [n.id, 0]))
  const inn = new Map(graph.nodes.map(n => [n.id, 0]))
  for (const [a, b] of graph.edges) {
    if (!out.has(a) || !inn.has(b)) return false
    out.set(a, out.get(a) + 1)
    inn.set(b, inn.get(b) + 1)
    if (out.get(a) > 1 || inn.get(b) > 1) return false
  }
  return [...inn.values()].filter(v => v === 0).length === 1
}

/** The chain, in order from its single root. */
function chainOrder (graph) {
  const next = new Map(graph.edges.map(([a, b]) => [a, b]))
  const hasIncoming = new Set(graph.edges.map(([, b]) => b))
  let cur = graph.nodes.find(n => !hasIncoming.has(n.id))
  const order = []
  const seen = new Set()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    order.push(cur)
    cur = graph.nodes.find(n => n.id === next.get(cur.id))
  }
  return order
}

/** List layout: one row per node on a vertical spine, no boxes and no elbows. */
function layoutList (graph) {
  const spine = 46          // clear of the two-character id badges
  const boxes = chainOrder(graph).map(n => {
    const { lines, overflow } = wrap(displayText(n), M.maxW * 1.3)
    return {
      ...n,
      lines,
      overflow,
      w: Math.max(...lines.map(textW)) + LABEL_INSET,
      h: Math.max(24, lines.length * M.line + 9)
    }
  })
  const width = M.margin * 2 + spine + Math.max(...boxes.map(b => b.w))
  let y = M.margin
  for (const b of boxes) {
    b.x = M.margin + spine
    b.y = y
    y += b.h + 9
  }
  const legend = legendFor(boxes)
  const legendY = y + M.legendGap
  return {
    nodes: boxes,
    byId: new Map(boxes.map(b => [b.id, b])),
    width,
    height: legendY + (legend.length ? M.legendFont + 6 : 0) + M.margin,
    legend,
    legendY,
    edgeOffsets: [],
    list: true
  }
}

/* ------------------------------------------------------------------ *
 * Draw
 * ------------------------------------------------------------------ */
// Quotes matter as much as angle brackets: this text lands in attributes too,
// and a topic containing `"` silently turns the whole file into a parse error
// that Obsidian renders as an error box.
const esc = s => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

function edgePath (a, b, off = 0) {
  const x1 = a.x + a.w / 2
  const y1 = a.y + a.h
  const x2 = b.x + b.w / 2
  const y2 = b.y - 5.5
  if (Math.abs(x1 - x2) < 0.7) return `M${x1} ${y1}V${y2}`
  const mid = y1 + (b.y - a.y - a.h) / 2 + off
  const r = Math.min(7, Math.abs(x2 - x1) / 2, Math.max(2, (b.y - a.h - a.y) / 2))
  const d = x2 > x1 ? 1 : -1
  return `M${x1} ${y1}V${mid - r}Q${x1} ${mid} ${x1 + d * r} ${mid}` +
    `H${x2 - d * r}Q${x2} ${mid} ${x2} ${mid + r}V${y2}`
}

/**
 * A fill and stroke that nothing can take away.
 *
 * THE BOXES HAVE TO BE OPAQUE, SO THEY SAY SO THEMSELVES. Every fill and stroke is
 * written onto the element as an inline style marked `!important` — the same weight as
 * any `!important` in a stylesheet and higher than anything else — so no theme rule, no
 * app rule and no embed-path rule can repaint them. This was done with a stylesheet
 * class once, and it produced three separate bug reports of transparent boxes: a class
 * rule is only as strong as whatever else happens to be in the cascade that day.
 *
 * The stylesheet still carries the same colours. That is not redundancy for its own sake:
 * it is what lets the `prefers-color-scheme` block swap the whole drawing for its dark
 * palette, and it is what the Lesson window's colour table reads. The inline style is the
 * floor — light paper, always — and the stylesheet is the ceiling.
 */
const important = paint => Object.entries(paint)
  .map(([property, value]) => `${property}:${value}!important`)
  .join(';')

/** `style="…!important"` for the given paint, or nothing when there is no paint. */
const force = paint => {
  const style = important(paint)
  return style === '' ? '' : ` style="${style}"`
}

function arrow (x, y, ink) {
  return `<path class="ah" d="M${x - 3.4} ${y - 5.5}L${x + 3.4} ${y - 5.5}L${x} ${y}Z"${force({ fill: ink })}/>`
}

/**
 * The room a label takes inside its box: 12px of inset on the left — where the state
 * stripe sits, and where every label starts — plus the box's own right padding.
 *
 * The wrapper, the box's width and the overflow check must all use this one number. They
 * used not to: the wrapper was told to fit `maxW - padX * 2` while the text actually
 * began 12px in, so the longest line a box could be given was one pixel wider than the
 * space that existed for it — and a line one pixel too wide does not look like a bug,
 * it looks like the border is missing.
 */
const LABEL_INSET = 12 + M.padX

/**
 * Every label must sit inside its own box.
 *
 * This is not decoration: a line that overruns its box runs through the border and
 * out over whatever is drawn behind it, which reads as a transparent box rather than
 * as overflowing text. It is the failure this tool shipped once, when the label font
 * changed and the wrapper's idea of a character's width did not.
 *
 * Checked against the same constants the layout used, so it catches a stale `charW`
 * and a label that was never wrapped — not a rounding difference.
 */
function overflowGuard (laid) {
  const bad = []
  for (const n of laid.nodes) {
    const room = n.w - LABEL_INSET
    for (const line of n.lines) {
      const drawn = textW(line)
      if (drawn > room + 0.5) {
        bad.push(`${n.id}: "${line}" is ${drawn.toFixed(1)}px in ${room.toFixed(1)}px of box`)
      }
    }
  }
  if (bad.length) {
    const message = [
      'Labels do not fit their boxes — the drawing was not written:',
      ...bad.map(b => '  · ' + b),
      '',
      'Either the label is too long, or `M.charW` no longer matches the label font.',
      'Measure the font in `text{font-family:…}`, set M.charW to the real advance, and re-run.'
    ].join('\n')
    throw new Error(message)
  }
}

/**
 * Every colour a drawing writes must actually be a colour.
 *
 * A token that is referenced but never defined in {@link PALETTE} does not throw — it
 * interpolates as the string `undefined`, and `fill:undefined` is perfectly well-formed
 * XML, so `xmllint` passes it and the drawing is written with boxes that paint nothing.
 * That is exactly what shipped once: `paper-3` was used for the foundation boxes but was
 * never added to the palette, so every foundation box lost its background while the file
 * stayed valid. This catches it at the point of drawing instead of at the point of
 * looking at the picture.
 *
 * @param css - the stylesheet about to be embedded in the SVG.
 */
function colourGuard (css) {
  const bad = []
  // Bounded at a quote, an angle bracket and a newline: an unbounded `[^;}]+` runs
  // through `"/>` and into the next element, which turns a good stylesheet into a
  // reported error about a colour that is not a colour.
  for (const match of css.matchAll(/(fill|stroke)\s*:\s*([^;}"'<>\n]+)/g)) {
    const value = match[2].trim().replace(/\s*!important$/, '')
    if (value === 'none' || value === 'transparent' || value === 'currentColor') continue
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) continue
    bad.push(match[1] + ': ' + value)
  }
  if (bad.length) {
    throw new Error([
      'A drawing tried to write a colour that is not a colour — nothing was written:',
      ...bad.map(b => '  · ' + b),
      '',
      'The usual cause is a token used in the stylesheet and missing from PALETTE:',
      'an undefined lookup interpolates as the literal string "undefined", which is',
      'valid XML and paints nothing. Check PALETTE against the tokens you reference.'
    ].join('\n'))
  }
}

function render (graph, laid) {
  const { nodes, byId, width, height, legend, legendY } = laid
  const L = PALETTE.light
  const D = PALETTE.dark
  overflowGuard(laid)
  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" role="img" aria-label="${esc(graph.subject)} dependency map">`)
  // EVERY DECLARATION IN BOTH PALETTES IS MARKED, so the dark block can win.
  //
  // The light colours are written onto the elements themselves as inline `!important`
  // styles (see `force()`), because a class rule is only as strong as the rest of the
  // cascade and these fills have been overridden twice by things outside this file. An
  // inline `!important` beats any stylesheet rule that is not also `!important` — which
  // means an unmarked dark block would lose to the marked light values, and a dark lesson
  // would be drawn on pale paper. Both halves are marked, so the media query wins on
  // later-wins-the-tie, which is the one place the two palettes are ordered.
  const mark = paint => Object.entries(paint)
    .map(([property, value]) => `${property}:${value}!important`)
    .join(';')
  const rule = (selector, paint) => `${selector}{${mark(paint)}}`
  const style = `<style>
text{font-family:${FACES.label.family};font-size:${M.font}px}
/* The id badges and the legend are machine furniture, not prose: they keep the
   monospace even when the labels themselves are set in the serif. */
.id,.leg{font-family:${FACES.furniture.family}}
${rule('.ttl', { fill: L.ink })}
${rule('.mut', { fill: L['ink-3'] })}
${rule('.box', { fill: L['paper-2'], stroke: L['rule-soft'], 'stroke-width': 1 })}
${rule('.fnd .box', { fill: L['paper-3'], stroke: 'none' })}
${rule('.fnd .ttl', { fill: L['ink-2'] })}
${rule('.gol .box', { fill: L['mark-soft'], stroke: L.mark })}
${rule('.gol .ttl', { fill: L.ink })}
${rule('.pln', { fill: L['paper-2'], stroke: L['ink-3'], 'stroke-width': 1, 'stroke-dasharray': '3 3' })}
${rule('.ed', { fill: 'none', stroke: L.line, 'stroke-width': 1.2, opacity: 0.6 })}
${rule('.ah', { fill: L.line, opacity: 0.6 })}
${rule('.st-established', { fill: L.mint })}
${rule('.st-learning', { fill: L.peach })}
${rule('.st-fragile', { fill: 'none', stroke: L.peach, 'stroke-width': 2 })}
${rule('.st-planned', { fill: L['ink-3'] })}
${rule('.st-goal', { fill: L.mark })}
.leg{font-size:${M.legendFont}px}
@media (prefers-color-scheme:dark){
${rule('.box', { fill: D['paper-2'], stroke: D['rule-soft'] })}
${rule('.fnd .box', { fill: D['paper-3'] })}
${rule('.fnd .ttl', { fill: D['ink-2'] })}
${rule('.gol .box', { fill: D['mark-soft'], stroke: D.mark })}
${rule('.gol .ttl', { fill: D.ink })}
${rule('.pln', { fill: D['paper-2'], stroke: D['ink-3'] })}
${rule('.ed', { stroke: D.line, opacity: 0.6 })}
${rule('.ah', { fill: D.line, opacity: 0.6 })}
${rule('.st-established', { fill: D.mint })}
${rule('.st-learning', { fill: D.peach })}
${rule('.st-fragile', { fill: 'none', stroke: D.peach })}
${rule('.st-planned', { fill: D['ink-3'] })}
${rule('.st-goal', { fill: D.mark })}
${rule('.ttl', { fill: D.ink })}
${rule('.mut', { fill: D['ink-3'] })}
}
/* THE SAME DARK PALETTE, ASKED OF THE APP RATHER THAN THE OPERATING SYSTEM.
   The media query above answers "what colour is this machine's evening", which is not
   the question in Obsidian: the app can be dark while macOS is light, and then the
   drawing would be inked for paper in a dark room. These rules hang off a class the
   Mimir controls put on the document, so the drawing follows the frame it is actually
   being read in. The pane's own adaptor strips everything after the first media query,
   so this block costs it nothing. */
.theme-dark .box{${mark({ fill: D['paper-2'], stroke: D['rule-soft'] })}}
.theme-dark .fnd .box{${mark({ fill: D['paper-3'] })}}
.theme-dark .fnd .ttl{${mark({ fill: D['ink-2'] })}}
.theme-dark .gol .box{${mark({ fill: D['mark-soft'], stroke: D.mark })}}
.theme-dark .gol .ttl{${mark({ fill: D.ink })}}
.theme-dark .pln{${mark({ fill: D['paper-2'], stroke: D['ink-3'] })}}
.theme-dark .ed{${mark({ stroke: D.line, opacity: 0.6 })}}
.theme-dark .ah{${mark({ fill: D.line, opacity: 0.6 })}}
.theme-dark .st-established{${mark({ fill: D.mint })}}
.theme-dark .st-learning{${mark({ fill: D.peach })}}
.theme-dark .st-fragile{${mark({ fill: 'none', stroke: D.peach })}}
.theme-dark .st-planned{${mark({ fill: D['ink-3'] })}}
.theme-dark .st-goal{${mark({ fill: D.mark })}}
.theme-dark .ttl{${mark({ fill: D.ink })}}
.theme-dark .mut{${mark({ fill: D['ink-3'] })}}
</style>`
  colourGuard(style)
  out.push(style)

  if (laid.list) {
    // One spine down the left, a dot per node, and a small arrow at the foot:
    // enough to show sequence, without nine boxes and eight elbows.
    const seq = laid.nodes
    const spineX = M.margin + 9
    const y0 = seq[0].y + seq[0].h / 2
    const y1 = seq[seq.length - 1].y + seq[seq.length - 1].h / 2
    out.push(`<path class="ed" d="M${spineX} ${y0}V${y1}"${force({ stroke: L.line })}/>`)
    out.push(arrow(spineX, y1 + 5, L.line))
    for (const n of seq) {
      const cy = n.y + n.h / 2
      // The spine's dots carry the state, so their class is the state's: the same
      // stripe colours as the boxes, resolved per palette by the stylesheet.
      const cls = n.kind === 'goal' ? 'st-goal'
        : n.kind === 'foundation' ? 'st-planned'
          : (STROKE[n.state] ? 'st-' + n.state : 'st-planned')
      out.push(`<circle class="${cls}" cx="${spineX}" cy="${cy}" r="3.1"${force(statePaint(n, L))}/>`)
    }
  } else {
    graph.edges.forEach(([a, b], i) => {
      const from = byId.get(a), to = byId.get(b)
      if (!from || !to) return
      out.push(`<path class="ed" d="${edgePath(from, to, laid.edgeOffsets[i] || 0)}"${force({ stroke: L.line })}/>`)
      out.push(arrow(to.x + to.w / 2, to.y, L.line))
    })
  }

  for (const n of nodes) {
    const gcls = n.kind === 'goal' ? ' class="gol"' : n.kind === 'foundation' ? ' class="fnd"' : ''
    out.push(`<g${gcls}>`)
    if (n.kind === 'planned') {
      out.push(`<rect class="pln" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="2"${force({ fill: L['paper-2'], stroke: L['ink-3'] })}/>`)
    } else {
      out.push(`<rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="2"${force(boxPaint(n, L))}/>`)
      if (n.kind === 'concept') {
        // State is a stripe, not a loud border: the box stays quiet. Two pixels of
        // corner, no more — the theme is square, and this is the one concession.
        const cls = STROKE[n.state] ? 'st-' + n.state : 'st-planned'
        out.push(`<rect class="${cls}" x="${n.x + 0.75}" y="${n.y + 0.75}" width="3" height="${n.h - 1.5}" rx="1"${force(statePaint(n, L))}/>`)
      }
    }
    out.push(`<text class="mut id" x="${n.x - 6}" y="${n.y + n.h / 2 + 3.6}" text-anchor="end" font-size="${M.font - 2.5}"${force({ fill: L['ink-3'] })}>${esc(n.id)}</text>`)
    const start = n.y + n.h / 2 - (n.lines.length - 1) * M.line / 2 + 4
    n.lines.forEach((l, i) => {
      out.push(`<text class="ttl" x="${n.x + 12}" y="${start + i * M.line}"${force({ fill: n.kind === 'goal' ? L.ink : n.kind === 'foundation' ? L['ink-2'] : L.ink })}>${esc(l)}</text>`)
    })
    out.push('</g>')
  }

  // Legend — one quiet line, only for what this graph actually contains.
  if (legend.length) {
    let x = M.margin
    for (const item of legend) {
      if (item.kind === 'state') {
        out.push(`<rect class="st-${item.key}" x="${x}" y="${legendY - 6}" width="3" height="9" rx="1"/>`)
        x += 8
      } else if (item.kind === 'foundation') {
        out.push(`<rect x="${x}" y="${legendY - 6.5}" width="10" height="10" rx="2" fill="${L['paper-2']}"/>`)
        x += 14
      } else {
        out.push(`<rect x="${x}" y="${legendY - 6.5}" width="10" height="10" rx="2" fill="${L['mark-soft']}" stroke="${L.mark}"/>`)
        x += 14
      }
      out.push(`<text class="mut leg" x="${x}" y="${legendY + 2}">${esc(item.text)}</text>`)
      x += textW(item.text) * (M.legendFont / M.font) + 18
    }
  }

  out.push('</svg>')
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
const slug = s => String(s).toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const maps = JSON.parse(execFileSync(process.execPath, [join(VAULT, 'Tools', 'vault-map.mjs'), '--json'], { encoding: 'utf8' }))
mkdirSync(VIZ, { recursive: true })

// Widths first, in one batch, before any box is sized against them.
measureEverything(maps)
console.log(measuring.how === 'measured'
  ? `· widths measured from ${measuring.family} at ${M.font}px — ${widthCache.size} strings`
  : `· widths estimated (no CoreText available) — boxes will run slightly wide`)

let invalid = 0
for (const graph of maps) {
  // Named after the file, which is already the canonical short topic — the
  // `topic:` field is prose and slugs badly.
  const base = slug(graph.file.replace(/\.md$/, ''))
  if (ONLY && base !== ONLY) continue
  const laid = isChain(graph) ? layoutList(graph) : layout(graph)
  const svg = render(graph, laid)
  const cut = laid.nodes.filter(n => n.overflow).map(n => n.id)
  if (cut.length) console.log(`! ${graph.subject}: label too long to fit on three lines at ${cut.join(', ')} — shorten its \`short:\``)
  console.log(`· ${graph.type === 'session' ? 'plan ' : ''}${graph.subject}: ${laid.nodes.length} nodes, ${Math.round(laid.width)}×${Math.round(laid.height)}px`)
  const name = graph.type === 'session' ? base + '-graph.svg' : base + '.svg'
  // Well-formedness is checked before writing: a malformed SVG is not a
  // slightly-wrong picture, it is no picture at all.
  const check = spawnSync('xmllint', ['--noout', '-'], { input: svg, encoding: 'utf8' })
  if (!check.error && check.status !== 0) {
    invalid++
    console.log(`✗ ${graph.subject}: the SVG is not well-formed XML — ${String(check.stderr).trim().split('\n')[0]}`)
  }
  if (PRINT) console.log(svg)
  else writeFileSync(join(VIZ, name), svg + '\n')
}
if (invalid) {
  console.log(`\n${invalid} malformed SVG(s) written — fix before embedding`)
  process.exit(1)
}
