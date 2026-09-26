/**
 * Tools/lib/vault-md.mjs — read a vault note, and turn its markdown into HTML.
 *
 * WHY THIS EXISTS
 *   Two tools now need the same two things: the frontmatter of a note, and its
 *   body as something a browser can render. `Tools/vault-map.mjs` already had a
 *   frontmatter parser, but it is written as a script and exports nothing, so
 *   this library carries the same grammar rather than a second, nearly-identical
 *   one. **The grammar here is deliberately a copy, and
 *   `Tools/test-export-lesson-pdf.mjs` asserts the two agree on every note in the
 *   vault** — a parser that drifts from the one the maps are built on would put a
 *   wrong state on a picture, and the agreement is checked rather than assumed.
 *
 *   The HTML is for printing a lesson, so it aims at the constructs this vault
 *   actually writes — headings, GFM tables, lists, blockquotes, inline links,
 *   wikilinks and `![[…]]` embeds — and nothing else. Unknown syntax is left as
 *   text rather than guessed at.
 *
 * USAGE
 *   import { parseNote, renderMarkdown } from './lib/vault-md.mjs'
 *
 *   const note = parseNote(readFileSync(path, 'utf8'))
 *   note.data      // frontmatter object — {} when there is none
 *   note.body      // everything after the frontmatter, verbatim
 *   note.warnings  // frontmatter this parser accepted but strict YAML will not
 */

/* ------------------------------------------------------------------ *
 * A deliberately small YAML subset — frontmatter only
 *
 * Kept in step with Tools/vault-map.mjs, which is the vault's authority on
 * what frontmatter means. Supports: scalars (plain, "double", 'single'),
 * flow lists [a, b], block lists of scalars, nested mappings by indentation,
 * comments. Anything else throws rather than guessing, because a silent
 * mis-parse here would print a wrong claim on a page.
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
  // A bare integer or decimal is a NUMBER, not a string. This matters because the
  // vault records its scores in frontmatter (`probe_checks: 6`, `teach_checks: 15`)
  // and the PDF export's title block prints them only when they arrive as numbers —
  // so reading "6" as text silently dropped every score from every printed lesson.
  // Nothing in the vault wants a numeric scalar to stay a string: a date, a status
  // or a term name with digits in it is quoted, or is not a bare number.
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10)
  if (/^-?\d*\.\d+$/.test(s)) return Number.parseFloat(s)
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

function parseList (lines, i, indent, warnings) {
  const out = []
  while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('-')) {
    const item = lines[i].text.replace(/^-\s*/, '')
    if (item === '') {
      if (i + 1 >= lines.length || lines[i + 1].indent <= indent) { out.push(null); i++; continue }
      const [v, ni] = parseNode(lines, i + 1, lines[i + 1].indent, warnings)
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

function parseMap (lines, i, indent, warnings) {
  const out = {}
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('-')) {
    const m = /^([^:]+):\s?(.*)$/.exec(lines[i].text)
    if (!m) throw new Error('unparseable frontmatter line: "' + lines[i].text + '"')
    const key = m[1].trim()
    const rest = m[2]
    if (rest.trim() === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const [v, ni] = parseNode(lines, i + 1, lines[i + 1].indent, warnings)
        out[key] = v
        i = ni
        continue
      }
      out[key] = null
      i++
      continue
    }
    const rawValue = rest.trim()
    if (rawValue && !/^["'[]/.test(rawValue) && /:\s/.test(rawValue)) {
      warnings.push('`' + key + '` has an unquoted colon+space in a plain value — strict YAML (which Obsidian uses) rejects that line and drops the note’s properties')
    }
    out[key] = parseScalar(rest)
    i++
  }
  return [out, i]
}

function parseNode (lines, i, indent, warnings) {
  if (lines[i].text.startsWith('-')) return parseList(lines, i, indent, warnings)
  return parseMap(lines, i, indent, warnings)
}

/** Locate the frontmatter block. Returns [start, end) line bounds or null. */
export function frontmatterBounds (text) {
  if (!text.startsWith('---')) return null
  const rest = text.slice(3)
  const m = /\n---[ \t]*(\n|$)/.exec(rest)
  if (!m) return null
  return { open: 3, close: 3 + m.index, after: 3 + m.index + m[0].length }
}

/** Frontmatter object, or {} when there is none. Throws on unsupported YAML. */
export function parseFrontmatter (text, warnings = []) {
  const bounds = frontmatterBounds(text)
  if (!bounds) return {}
  const body = text.slice(bounds.open, bounds.close)
  const lines = []
  for (const raw of body.split('\n')) {
    const noComment = stripComment(raw)
    if (noComment.trim() === '') continue
    lines.push({ indent: noComment.match(/^ */)[0].length, text: noComment.trim() })
  }
  if (lines.length === 0) return {}
  const [value] = parseNode(lines, 0, lines[0].indent, warnings)
  return value || {}
}

/** The note split into its parts. `body` keeps its original leading newline. */
export function parseNote (text) {
  const warnings = []
  const data = parseFrontmatter(text, warnings)
  const bounds = frontmatterBounds(text)
  const body = bounds ? text.slice(bounds.after) : text
  return { data, body, warnings }
}

/* ------------------------------------------------------------------ *
 * Inline markdown
 * ------------------------------------------------------------------ */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function escapeHtml (s) {
  return String(s).replace(/[&<>"]/g, c => HTML_ESCAPES[c])
}

/**
 * Render one run of inline markdown to HTML.
 *
 * `opts.links` — 'keep' leaves `[text](url)` and `[[Target]]` as anchors;
 * 'text' drops wikilinks to their display word, which is what a printed page
 * needs because a PDF cannot resolve a link into this vault.
 * `opts.embeds` — not handled here; embeds are block-level.
 */
export function renderInline (src, opts = {}) {
  const links = opts.links === 'text' ? 'text' : 'keep'
  const code = []
  // Pull code spans out first so their contents are never treated as markdown.
  let s = String(src).replace(/`([^`]+)`/g, (_, inner) => {
    code.push(inner)
    return '\u0000C' + (code.length - 1) + '\u0000'
  })

  s = escapeHtml(s)

  // Links, before the wikilink pass so the two cannot overlap. The URL part
  // allows balanced parentheses, because Wikipedia disambiguates with them
  // (`/wiki/Caesar_(title)`) and a truncating pattern there leaves a stray
  // bracket on the page and a broken link in the PDF.
  s = s.replace(
    /\[([^\]]*)\]\(\s*([^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+&quot;([^&]*)&quot;)?\s*\)/g,
    (_, text, url, title) => {
      const t = title ? ' title="' + escapeHtml(title) + '"' : ''
      return '<a href="' + url + '"' + t + '>' + text + '</a>'
    })

  // An embed that was not on a line of its own: show the target's name rather
  // than a stray exclamation mark.
  s = s.replace(/!(\[\[[^\]]+\]\])/g, '$1')

  // Wikilinks: [[Target|alias]] and [[Target]].
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const shown = (alias ?? target).trim()
    if (links === 'text') return '<span class="wl">' + escapeHtml(shown) + '</span>'
    const slug = String(target).trim()
    return '<a class="wl" href="#note-' + encodeURIComponent(slug) + '">' + escapeHtml(shown) + '</a>'
  })

  // Bold before italic, so ** is not eaten by the single-star pass.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')

  return s.replace(/\u0000C(\d+)\u0000/g, (_, i) => '<code>' + escapeHtml(code[Number(i)]) + '</code>')
}

/* ------------------------------------------------------------------ *
 * Block markdown
 * ------------------------------------------------------------------ */

const isBlank = line => /^\s*$/.test(line)
const isHr = line => /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
const isFence = line => /^\s{0,3}(```|~~~)/.test(line)
const isBullet = line => /^(\s*)([-*+])\s+/.test(line)
const isOrdered = line => /^(\s*)\d+[.)]\s+/.test(line)
const isQuote = line => /^\s{0,3}>\s?/.test(line)
const isHeading = line => /^(#{1,6})\s+(.*)$/.exec(line)
const isTableStart = (lines, i) =>
  /^\s*\|/.test(lines[i] ?? '') && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1] ?? '') && /-/.test(lines[i + 1] ?? '')

/** Split one table row into cells. */
function tableCells (row) {
  let s = row.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const out = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
    if (s[i] === '|') { out.push(cur.trim()); cur = ''; continue }
    cur += s[i]
  }
  out.push(cur.trim())
  return out
}

function tableAligns (sep) {
  return tableCells(sep).map(c => {
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    return 'left'
  })
}

/**
 * Render a markdown body to HTML.
 *
 * opts.links   'keep' (default) | 'text'
 * opts.mermaid (source) => html — replaces a ```mermaid fence. When absent the
 *              fence is rendered as a labelled source block rather than dropped.
 */
export function renderMarkdown (src, opts = {}) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let i = 0

  const flushParagraph = buf => {
    if (buf.length) out.push('<p>' + renderInline(buf.join(' ').trim(), opts) + '</p>')
    buf.length = 0
  }
  const para = []

  const renderList = (indent, ordered) => {
    const tag = ordered ? 'ol' : 'ul'
    const items = []
    const re = ordered ? /^(\s*)\d+[.)]\s+(.*)$/ : /^(\s*)([-*+])\s+(.*)$/
    while (i < lines.length) {
      const line = lines[i]
      if (isBlank(line)) {
        // A blank line continues a loose list only if another item follows.
        let j = i + 1
        while (j < lines.length && isBlank(lines[j])) j++
        if (j < lines.length && re.test(lines[j]) && lines[j].match(/^\s*/)[0].length === indent) { i = j; continue }
        break
      }
      const m = re.exec(line)
      if (m && m[1].length === indent) {
        const parts = [m[ordered ? 2 : 3]]
        i++
        // Absorb indented continuation lines into this item.
        while (i < lines.length && !isBlank(lines[i]) && lines[i].match(/^\s*/)[0].length > indent &&
               !re.test(lines[i]) && !isFence(lines[i]) && !isQuote(lines[i]) && !isHeading(lines[i]) && !isTableStart(lines, i)) {
          parts.push(lines[i].trim())
          i++
        }
        let html = renderInline(parts.join(' ').trim(), opts)
        // A deeper list directly under this item.
        if (i < lines.length && !isBlank(lines[i]) && lines[i].match(/^\s*/)[0].length > indent &&
            (isBullet(lines[i]) || isOrdered(lines[i]))) {
          html += renderList(lines[i].match(/^\s*/)[0].length, isOrdered(lines[i]))
        }
        items.push('<li>' + html + '</li>')
        continue
      }
      if (m && m[1].length > indent) { // deeper list with no parent text
        items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, '') +
          renderList(m[1].length, isOrdered(line)) + '</li>'
        continue
      }
      break
    }
    return '<' + tag + '>' + items.join('') + '</' + tag + '>'
  }

  while (i < lines.length) {
    const line = lines[i]

    if (isBlank(line)) { flushParagraph(para); i++; continue }

    // A standalone `![[…]]` is a block, and only the caller knows what to put
    // there — an inlined SVG, a note's content, or an honest "not included".
    const em = /^\s*!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/.exec(line)
    if (em && typeof opts.embed === 'function') {
      flushParagraph(para)
      out.push(opts.embed(em[1].trim(), em[2] ? em[2].trim() : null))
      i++
      continue
    }

    if (isFence(line)) {
      flushParagraph(para)
      const marker = line.trim().slice(0, 3)
      const lang = line.trim().slice(3).trim()
      const body = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(marker)) { body.push(lines[i]); i++ }
      i++ // closing fence
      const text = body.join('\n')
      if (lang === 'mermaid' && typeof opts.mermaid === 'function') {
        out.push(opts.mermaid(text))
      } else {
        out.push('<pre class="code' + (lang ? ' lang-' + escapeHtml(lang) : '') + '">' +
          (lang ? '<span class="lang">' + escapeHtml(lang) + '</span>' : '') +
          '<code>' + escapeHtml(text) + '</code></pre>')
      }
      continue
    }

    const h = isHeading(line)
    if (h) {
      flushParagraph(para)
      const level = h[1].length
      out.push('<h' + level + '>' + renderInline(h[2].trim(), opts) + '</h' + level + '>')
      i++
      continue
    }

    if (isHr(line)) { flushParagraph(para); out.push('<hr>'); i++; continue }

    if (isTableStart(lines, i)) {
      flushParagraph(para)
      const head = tableCells(lines[i])
      const aligns = tableAligns(lines[i + 1])
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(tableCells(lines[i])); i++ }
      const cell = (text, col, tag) => {
        const a = aligns[col] && aligns[col] !== 'left' ? ' class="' + aligns[col] + '"' : ''
        return '<' + tag + a + '>' + renderInline(text, opts) + '</' + tag + '>'
      }
      out.push('<table><thead><tr>' +
        head.map((c, n) => cell(c, n, 'th')).join('') +
        '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + head.map((_, n) => cell(r[n] ?? '', n, 'td')).join('') + '</tr>').join('') +
        '</tbody></table>')
      continue
    }

    if (isQuote(line)) {
      flushParagraph(para)
      const body = []
      while (i < lines.length && (isQuote(lines[i]) || (!isBlank(lines[i]) && body.length && !isHeading(lines[i]) && !isBullet(lines[i]) && !isTableStart(lines, i)))) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
        i++
      }
      out.push('<blockquote>' + renderMarkdown(body.join('\n'), opts) + '</blockquote>')
      continue
    }

    if (isBullet(line) || isOrdered(line)) {
      flushParagraph(para)
      out.push(renderList(line.match(/^\s*/)[0].length, isOrdered(line)))
      continue
    }

    para.push(line.trim())
    i++
  }
  flushParagraph(para)
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * Section helpers — the study sheet is built from named sections
 * ------------------------------------------------------------------ */

/** Top-level `## ` sections as { title, level, body }. Anything before the first is dropped. */
export function splitSections (body) {
  const lines = String(body).split('\n')
  const sections = []
  let current = null
  for (const line of lines) {
    const h = isHeading(line)
    if (h && h[1].length === 2) {
      if (current) sections.push(current)
      current = { title: h[2].trim(), level: 2, body: [] }
      continue
    }
    if (current) current.body.push(line)
  }
  if (current) sections.push(current)
  return sections.map(s => ({ ...s, body: s.body.join('\n').trim(), lines: s.body }))
}

/** Find a `## ` section whose title contains `needle` (case-insensitive). */
export function findSection (sections, needle) {
  const n = needle.toLowerCase()
  return sections.find(s => s.title.toLowerCase().includes(n)) ?? null
}

/**
 * Every GFM table in a body, as { head, rows }. Used by the study sheet, which
 * prints the checks table's questions and answers in two different places and so
 * cannot take it pre-rendered.
 */
export function parseTables (src) {
  const lines = String(src).split('\n')
  const tables = []
  let i = 0
  while (i < lines.length) {
    if (isTableStart(lines, i)) {
      const head = tableCells(lines[i])
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(tableCells(lines[i])); i++ }
      tables.push({ head, rows })
      continue
    }
    i++
  }
  return tables
}

/** `![[name]]` / `![[name|width]]` embeds found in a body, in order. */
export function findEmbeds (body) {
  const out = []
  const re = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let m
  while ((m = re.exec(String(body)))) {
    out.push({ target: m[1].trim(), width: m[2] ? m[2].trim() : null, index: m.index })
  }
  return out
}
