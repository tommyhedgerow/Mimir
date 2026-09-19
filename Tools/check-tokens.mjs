#!/usr/bin/env node
/**
 * Tools/check-tokens.mjs — one palette, five files, and this is what keeps them honest.
 *
 * WHY THIS EXISTS
 *   The Mimir palette is spoken in six places, because six things have to agree about
 *   it and none of them can import the others:
 *
 *     Tools/mimir-tokens.json                    the source
 *     .obsidian/themes/Mimir/theme.css           the vault theme
 *     Tools/vault-chart.mjs                      every SVG in Learn/Viz
 *     .obsidian/plugins/mimir/main.js            the reading sizes in the top bar
 *     Tools/vault-map.mjs                        the mermaid class colours
 *
 *   A colour that disagrees across these is not a matter of taste, it is a drawing that
 *   changes meaning when it moves from the note to the board, or a theme whose dark mode
 *   is a different dark from the dark in its own diagrams. So the copies are checked
 *   rather than trusted, exactly as Tools/vault-map.mjs checks a spine instead of
 *   re-parsing prose.
 *
 *   THE BOARD IS CHECKED DIFFERENTLY, FOR A DIFFERENT REASON. `preset/mimir-skin` holds no
 *   copy: `Tools/build-mimir-skin.mjs` reads this palette and emits it into the bundle, so
 *   it cannot drift in value. What it can get wrong is a role NAME — and a misspelt role
 *   reaches the page as the literal string `undefined` inside a custom property, which the
 *   browser ignores in silence. So the skin is read for the roles it names, and every one
 *   of them is required to exist in both palettes.
 *
 * USAGE
 *   node Tools/check-tokens.mjs          # report and exit non-zero on drift
 *   node Tools/check-tokens.mjs --list   # print the palette it is checking against
 *
 * It checks PRESENCE, not position: the light value and the dark value must both appear
 * somewhere in each file that claims to know them, and the reading sizes must match the
 * list the plugin cycles. That is enough to catch a half-finished edit, which is the
 * failure this is for.
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const tokens = JSON.parse(readFileSync(join(ROOT, 'Tools', 'mimir-tokens.json'), 'utf8'))
const L = tokens.light
const D = tokens.dark

if (process.argv.includes('--list')) {
  for (const key of Object.keys(L)) console.log(key.padEnd(10), L[key], ' / ', D[key])
  process.exit(0)
}

const read = rel => readFileSync(join(ROOT, rel), 'utf8')

/** The token's name in the theme: the key, with the theme's prefix. */
const cssVar = key => '--mimir-' + key

const files = {
  theme: read('.obsidian/themes/Mimir/theme.css'),
  chart: read('Tools/vault-chart.mjs'),
  plugin: read('.obsidian/plugins/mimir/main.js'),
  map: read('Tools/vault-map.mjs')
}

const problems = []
const fail = (what, where) => problems.push(`${what} — ${where}`)

/* ── the theme: each token, in both of its blocks ─────────────────────────── */

const themeBlocks = {}
for (const mode of ['light', 'dark']) {
  // The dark block is the one that opens with `body.theme-dark`.
  const start = mode === 'light'
    ? files.theme.indexOf('body {')
    : files.theme.indexOf('body.theme-dark,')
  const end = mode === 'light'
    ? files.theme.indexOf('/* Values that cannot live in custom properties')
    : files.theme.indexOf('/* ------------------------------------------------', start)
  themeBlocks[mode] = files.theme.slice(start, end === -1 ? undefined : end)
}

for (const key of Object.keys(L)) {
  const name = cssVar(key)
  for (const mode of ['light', 'dark']) {
    const value = mode === 'light' ? L[key] : D[key]
    const pattern = new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*' + value + '\\b')
    if (!pattern.test(themeBlocks[mode])) fail(`theme.css (${mode}): ${name} is not ${value}`, 'theme')
  }
}

/* ── the chart: the PALETTE constant, both variants, plus the canvas rect ─── */

const paletteBlock = files.chart.slice(
  files.chart.indexOf('const PALETTE = {'),
  files.chart.indexOf('/* State is a colour')
)
if (paletteBlock === '') fail('vault-chart.mjs: no PALETTE constant found', 'chart')

const CHART_KEYS = {
  paper: 'paper', 'paper-2': 'paper-2', ink: 'ink', 'ink-2': 'ink-2', 'ink-3': 'ink-3',
  rule: 'rule', 'rule-soft': 'rule-soft', line: 'line', mark: 'mark', 'mark-soft': 'mark-soft',
  mint: 'mint', peach: 'peach', cyan: 'cyan'
}
for (const [token, chartKey] of Object.entries(CHART_KEYS)) {
  for (const mode of ['light', 'dark']) {
    const value = mode === 'light' ? L[token] : D[token]
    // The key is quoted in the constant, so match it literally — a hyphen in a regex
    // quantifies the character before it, which would make `paper-2` match `paper`.
    const pattern = new RegExp("['\"]?" + chartKey + "['\"]?" + "\\s*:\\s*'" + value + "'")
    if (!pattern.test(paletteBlock)) {
      fail(`vault-chart.mjs (${mode}): ${chartKey} is not ${value}`, 'chart')
    }
  }
}
/* ── the chart's own palette is complete, and nothing dangles ────────────── */

// A token referenced in the stylesheet and missing from PALETTE interpolates as the
// literal string `undefined`: valid XML, `fill:undefined`, and a box that paints nothing.
// That shipped once. So: every key the stylesheet references must be defined in BOTH
// palettes, and the two palettes must define the same keys.
// The stylesheet is built from `rule(selector, paint)` calls, so the references are
// `L['paper-2']` and `L.ink` inside those calls — every L./D. reference in the file below
// the palette is a colour the drawings use.
const styleText = files.chart.slice(files.chart.indexOf('const mark = paint =>'))
const referenced = new Set()
for (const match of styleText.matchAll(/\b([LD])\[?'([A-Za-z][A-Za-z0-9-]*)'?\]/g)) {
  referenced.add(match[2])
}
for (const match of styleText.matchAll(/\b([LD])\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
  referenced.add(match[2])
}
if (referenced.size === 0) fail('vault-chart.mjs: could not read any token references from its stylesheet', 'chart')

// Only entries whose value is a colour count — comments inside the block talk too, and
// a word in a comment is not a token.
const paletteKeys = mode => {
  const start = paletteBlock.indexOf(mode + ': {')
  const end = paletteBlock.indexOf('}', start)
  const keys = new Set()
  for (const match of paletteBlock.slice(start, end).matchAll(/'?([A-Za-z][A-Za-z0-9-]*)'?\s*:\s*'#[0-9a-f]{3,6}'/gi)) {
    keys.add(match[1])
  }
  return keys
}
const lightKeys = paletteKeys('light')
const darkKeys = paletteKeys('dark')

for (const key of referenced) {
  if (!lightKeys.has(key)) fail(`vault-chart.mjs: the stylesheet uses L.${key}, which the light palette does not define`, 'chart')
  if (!darkKeys.has(key)) fail(`vault-chart.mjs: the stylesheet uses D.${key}, which the dark palette does not define`, 'chart')
}
for (const key of lightKeys) {
  if (!darkKeys.has(key)) fail(`vault-chart.mjs: '${key}' is in the light palette but not the dark one`, 'chart')
}

// And every colour the generated drawings actually write must be a real colour.
// `vault-chart.mjs --print` renders every drawing the spines call for and prints it, which
// is the only way to ask the drawings themselves rather than the generator's palette
// constant: a colour that is declared but never drawn is held against nothing, and one
// that is drawn is held against everything.
let drawn = ''
try {
  drawn = execFileSync(process.execPath, [join(ROOT, 'Tools', 'vault-chart.mjs'), '--print'], {
    encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024
  })
} catch (error) {
  fail(`vault-chart.mjs could not be run to collect its colours: ${String(error.message).split('\n')[0]}`, 'chart')
}

// `undefined` is the failure this is for; `NaN` is the same mistake one arithmetic slip
// away. Stop the value at a quote, an angle bracket or a newline: a greedy `[^;}]+` runs
// straight through `"/>` and swallows the next element, which made this report every
// drawing as broken the first time it ran.
const badColour = (drawn.match(/(?:fill|stroke)\s*:\s*([^;}"'<>\n]+)/g) || [])
  .map(decl => decl.split(':')[1].trim().replace(/!important$/, '').trim())
  .filter(value => !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) && !['none', 'transparent', 'currentColor'].includes(value))
if (badColour.length) {
  fail(`the drawings write values that are not colours: ${[...new Set(badColour)].join(', ')}`, 'chart')
}

/* ── the mermaid class colours, which are the state colours ───────────────── */

const classDefs = files.map.slice(
  files.map.indexOf('const CLASS_DEFS = ['),
  files.map.indexOf('\n]', files.map.indexOf('const CLASS_DEFS = ['))
)
for (const [key, value] of [['established', L.mint], ['learning', L.peach], ['fragile', L.peach]]) {
  if (!classDefs.includes(value)) {
    fail(`vault-map.mjs (CLASS_DEFS): ${key} is not the state colour ${value}`, 'map')
  }
}

/* ── the reading sizes the plugin steps through ───────────────────────────── */

const sizesBlock = files.plugin.slice(
  files.plugin.indexOf('const SIZES = ['),
  files.plugin.indexOf(']', files.plugin.indexOf('const SIZES = ['))
)
const sizes = (sizesBlock.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number)
const expected = tokens.readingSizes
if (sizes.join(',') !== expected.join(',')) {
  fail(`plugins/mimir/main.js: reading sizes are [${sizes.join(', ')}], tokens say [${expected.join(', ')}]`, 'plugin')
}

/* ── the skin: every palette role it names must exist ────────────────────── */

// The skin holds no copy of the palette — the build emits it — so there is no literal to
// match. What it does is NAME roles, and a misspelt role is `undefined`: that reaches the
// page as the string `undefined` inside a custom property, which the browser ignores in
// silence. Same class of fault as the chart's dangling token, one layer up.
//
// Only `both()` and `across()` take roles. `fixed()` takes a literal — the two faces and
// the restated type scale — so a font stack must not be read as a role name.
const skin = read('preset/mimir-skin/client.mjs')
const rolesNamed = new Set()
for (const match of skin.matchAll(/\bboth\('([^']+)'\)/g)) rolesNamed.add(match[1])
for (const match of skin.matchAll(/\bacross\('([^']+)',\s*'([^']+)'\)/g)) {
  rolesNamed.add(match[1])
  rolesNamed.add(match[2])
}
if (rolesNamed.size === 0) fail('preset/mimir-skin/client.mjs: no palette roles could be read from it', 'skin')
for (const role of rolesNamed) {
  if (!(role in L)) fail(`preset/mimir-skin/client.mjs: names '${role}', which the light palette does not hold`, 'skin')
  if (!(role in D)) fail(`preset/mimir-skin/client.mjs: names '${role}', which the dark palette does not hold`, 'skin')
}

/* ── and the two palettes have to hold the same roles ─────────────────────── */

for (const key of Object.keys(L)) {
  if (!(key in D)) fail(`mimir-tokens.json: '${key}' is in the light palette but not the dark one`, 'source')
}
for (const key of Object.keys(D)) {
  if (!(key in L)) fail(`mimir-tokens.json: '${key}' is in the dark palette but not the light one`, 'source')
}

/* ── report ────────────────────────────────────────────────────────────────── */

if (problems.length) {
  console.log('✗ the Mimir palette has drifted:\n')
  for (const p of problems) console.log('  · ' + p)
  console.log(`\n${problems.length} disagreement(s). Tools/mimir-tokens.json is the source; fix the copy, not the source, unless the source is what you meant to change.`)
  process.exit(1)
}

console.log(`✓ Mimir: ${Object.keys(L).length} colours in two palettes and ${expected.length} reading sizes agree across theme.css, vault-chart.mjs, vault-map.mjs, the plugin, and the ${rolesNamed.size} roles the board names.`)
