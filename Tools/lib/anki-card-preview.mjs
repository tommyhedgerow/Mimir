/**
 * Tools/lib/anki-card-preview.mjs — what colour the card actually comes out.
 *
 * WHY THIS EXISTS
 *   The first version of the Mimir note type set its colours and then asserted,
 *   in its own test, that the token *strings* appeared in the stylesheet. They
 *   did. The card was still unreadable: near-white text on a pale blue ground in
 *   night mode. **A string appearing in a stylesheet is not a colour**, and the
 *   vault's own rule — verify before you assert — was broken by a test that only
 *   checked its own homework.
 *
 *   So this asks a browser instead. The card is rendered in Chrome twice, once
 *   with Anki's night mode on and once without, **with Anki's own stylesheets
 *   loaded ahead of the card's**, and the computed `color` and `background-color`
 *   of the card element are read back through `--dump-dom`. That is the only
 *   thing that catches a specificity fight or a shadowed custom property, and
 *   both of those were exactly what had gone wrong.
 *
 * WHERE THE TWO BUGS WERE, since the shape recurs
 *   1. Anki defines `--canvas` and `--fg` on `:root` and paints the reviewer with
 *      `body.nightMode { background-color: var(--canvas); color: var(--fg) }`.
 *      A stylesheet defining its own `--canvas` does not sit beside Anki's — it
 *      **shadows** it, and Anki's rule then paints with the wrong value.
 *   2. Anki puts the card class on the **body**, so `body.nightMode` (0-1-1)
 *      outranks a bare `.card` (0-1-0) for both `color` and `background-color`.
 *      Declaring those only on `.card` leaves both to Anki at night.
 *
 *   Neither is visible in the text of the stylesheet, and neither was the token
 *   file's fault: `Tools/mimir-tokens.json` was right throughout.
 *
 * USAGE
 *   import { cardColours, ankiBaseCss, contrastRatio } from './lib/anki-card-preview.mjs'
 *   const { light, night, source } = cardColours({ css, markup })
 */

import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ANKI_WEB_CSS = '/Applications/Anki.app/Contents/Resources/app_packages/_aqt/data/web/css'
const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)

/**
 * The rule the whole module exists to survive, quoted verbatim from Anki 26.9.2's
 * `reviewer.css`. When Anki is installed the test asserts it is still there, so a
 * change in Anki's own stylesheet shows up here rather than on the card.
 */
export const ANKI_NIGHT_RULE = 'body.nightMode{background-color:var(--canvas);color:var(--fg)}'

/**
 * A stand-in for Anki's theme injection, used ONLY when Anki is not installed.
 * Anki sets these variables at runtime, so there is no file to read them from;
 * these are the values from its own light and dark theme tables.
 */
const FALLBACK_THEME = `:root{--fg:#020202;--canvas:#f5f5f5;--border:#c4c4c4;--shadow:#c4c4c4}
:root.night-mode{--fg:#fcfcfc;--canvas:#2c2c2c;--border:#202020;--shadow:#141414}
body{margin:20px;overflow-wrap:break-word}
body.nightMode{background-color:var(--canvas);color:var(--fg)}`

/**
 * Anki's own stylesheets, plus where they came from. `source` is reported so a
 * test can say whether it exercised the real thing or the stand-in.
 */
export function ankiBaseCss () {
  const theme = join(ANKI_WEB_CSS, 'reviewer-bottom.css')
  const reviewer = join(ANKI_WEB_CSS, 'reviewer.css')
  if (existsSync(theme) && existsSync(reviewer)) {
    return {
      source: 'anki-bundle',
      theme: readFileSync(theme, 'utf8'),
      reviewer: readFileSync(reviewer, 'utf8')
    }
  }
  return { source: 'builtin-fallback', theme: FALLBACK_THEME, reviewer: '' }
}

export function findChrome () {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  return null
}

/* ------------------------------------------------------------------ *
 * Colour arithmetic — WCAG relative luminance and contrast ratio
 * ------------------------------------------------------------------ */

/** `rgb(1, 2, 3)` or `#rrggbb` or `#rgb` → [r, g, b]. */
export function parseColour (value) {
  const s = String(value).trim()
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const hex = /^#([0-9a-f]{6})$/i.exec(s)
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16))
  const short = /^#([0-9a-f]{3})$/i.exec(s)
  if (short) return [...short[1]].map(c => parseInt(c + c, 16))
  return null
}

/** WCAG 2.1 contrast ratio: 1 is invisible, 21 is black on white. */
export function contrastRatio (a, b) {
  const lum = value => {
    const [r, g, bl] = parseColour(value).map(v => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * What to read back from the rendered card. `card` is the card element itself —
 * Anki puts the card class on the body — and the rest are the parts whose colour
 * could silently go wrong: a cloze gap, the other clozes shown beside it, the
 * footer. A probe whose element is absent comes back `{found: false}` rather than
 * throwing, so a caller can assert presence as well as colour.
 */
export const DEFAULT_PROBES = {
  card: 'body',
  prompt: '.prompt',
  cloze: '.cloze',
  clozeInactive: '.cloze-inactive',
  provenance: '.provenance'
}

function page (css, markup, night, base) {
  return '<!doctype html><html class="' + (night ? 'night-mode' : '') + '"><head><meta charset="utf-8">' +
    '<style>' + base.theme + '</style><style>' + base.reviewer + '</style><style>' + css + '</style></head>' +
    '<body class="card' + (night ? ' nightMode' : '') + '">' + markup +
    '<script>var P=' + JSON.stringify(DEFAULT_PROBES) + ',out={};' +
    "for(var k in P){var el=P[k]==='body'?document.body:document.querySelector(P[k]);" +
    'out[k]=el?{color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,found:true}:{found:false};}' +
    "var p=document.createElement('pre');p.id='mimir-probe';p.textContent=JSON.stringify(out);" +
    'document.body.appendChild(p)</script></body></html>'
}

/**
 * The card's computed colours with Anki's night mode off and on.
 *
 * Returns `{ light: {card: {…}, cloze: {…}}, night: {…}, source }`, or `null`
 * when there is no Chrome to ask.
 *
 * Async because Chrome has to be spawned rather than run to completion: it
 * writes the DOM to stdout and then leaves helper processes holding the pipe, so
 * a synchronous call waits for a close that does not come. Waiting on the stdout
 * event and then killing the process is what works.
 */
export async function cardColours ({ css, markup, chrome = findChrome() }) {
  if (!chrome) return null
  const base = ankiBaseCss()
  const dir = mkdtempSync(join(tmpdir(), 'mimir-preview-'))
  try {
    const result = { source: base.source, chrome, probes: Object.keys(DEFAULT_PROBES) }
    for (const night of [false, true]) {
      const file = join(dir, night ? 'night.html' : 'light.html')
      writeFileSync(file, page(css, markup, night, base))
      const dom = await dumpDom(chrome, file, join(dir, night ? 'pn' : 'pl'))
      const found = /<pre id="mimir-probe">([^<]*)<\/pre>/.exec(dom)
      if (!found) {
        throw new Error('the browser returned no computed style for the ' +
          (night ? 'night' : 'light') + ' card — the stylesheet may not have parsed')
      }
      result[night ? 'night' : 'light'] = JSON.parse(found[1].replace(/&quot;/g, '"'))
    }
    return result
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run Chrome with `--dump-dom` and wait for the page, not for the process tree. */
function dumpDom (chrome, file, profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=old', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking',
      '--disable-crash-reporter', '--disable-breakpad',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(file).href
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let out = ''
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill('SIGKILL') } catch {}
      resolve(out)
    }
    // The DOM is printed in one go; once it stops growing, it is complete.
    let quiet = null
    child.stdout.on('data', d => {
      out += d
      clearTimeout(quiet)
      quiet = setTimeout(finish, 500)
    })
    child.on('close', finish)
    child.on('error', err => { if (!settled) { settled = true; clearTimeout(timer); reject(err) } })
    const timer = setTimeout(finish, 30000)
  })
}
