#!/usr/bin/env node
/**
 * Build the Mimir skin's two halves into the package that ships.
 *
 * WHAT IS BUILT, AND WHY ONLY ONE HALF IS. `host.mjs` is ordinary Node ESM and is
 * copied verbatim: DSH loads the host half through the normal module loader, so it
 * needs no rewriting. `client.mjs` is not: DSH serves each client plugin's
 * `exports["./client"]` file to the PAGE, and the page expects every bundle to
 * register itself with `window.__ModuleLoader__` as a CommonJS-style factory. So
 * `client.mjs` is authored as ordinary ESM — readable, diffable, lintable like any
 * other module — and this script rewrites its import header into the factory's
 * `require` calls, strips its exports, and prepends the palette.
 *
 * WHY THE PALETTE IS PREPENDED RATHER THAN COPIED. `Tools/mimir-tokens.json` is the
 * one source of the Mimir palette, and five files speak it: the Obsidian theme, the
 * chart generator, the map generator, the top-bar plugin, and this skin. A sixth
 * hand-copied table would be a sixth place to drift, so the script reads the JSON at
 * build time and emits it as a `const MIMIR` inside the factory — the skin never
 * hard-codes a colour, and `Tools/check-tokens.mjs` can compare the built bundle
 * against the source like the others.
 *
 * Usage:  node Tools/build-mimir-skin.mjs [--check]
 *   --check   report whether the built bundle is already current; write nothing.
 *
 * WHAT DECIDES WHETHER IT WORKS, and what only shows how it looks:
 *   node Tools/test-mimir-skin.mjs    the browser half: contrast floors measured per
 *                                     pair, every token name checked against the set
 *                                     DSH actually defines or references, the board's
 *                                     parsing and what the row draws asserted as a
 *                                     tree, and the SHIPPED bundle loaded and applied
 *                                     the way the page loads it.
 *   node Tools/test-mimir-board.mjs   the host half: the tool registered into a stub
 *                                     registry, then called — pinning that the
 *                                     drawings reach the interface and never the
 *                                     model, that a drawing path is flattened, and
 *                                     that a missing drawing is named rather than
 *                                     dropped.
 *   node Tools/check-tokens.mjs       the palette, across every file that speaks it.
 *
 * WHAT A REBUILD REACHES. The browser half is served from the file on disk and the
 * Harness' own watcher pushes a changed bundle into an already-open page within half
 * a second, so a rebuild is visible on the next load without a restart. A change to
 * `host.mjs` needs a DSH restart, because the host plane is composed once per process.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** The package: what it is called, and the two files the manifest points at. */
const PACKAGE = 'dsh-mimir-skin'
const PACKAGE_DIR = join(ROOT, 'preset', 'mimir-skin')
const PALETTE = join(ROOT, 'Tools', 'mimir-tokens.json')

/** Where the built bundle lands, and the two sources it is built from. */
const CLIENT_SOURCE = join(PACKAGE_DIR, 'client.mjs')
const HOST_SOURCE = join(PACKAGE_DIR, 'host.mjs')
const MANIFEST_SOURCE = join(PACKAGE_DIR, 'package.json')
const LIB = join(PACKAGE_DIR, 'lib')
const CLIENT_TARGET = join(LIB, 'client.js')
const HOST_TARGET = join(LIB, 'index.js')
const PATCH_TARGET = join(PACKAGE_DIR, 'cordis.patch.yml')

/** The import specifiers the page's module table can satisfy, mapped to the source names. */
const EXTERNALS = new Map([
  ['react', 'react'],
  ['react/jsx-runtime', 'react/jsx-runtime'],
  ['react-dom/client', 'react-dom/client'],
])

function indent(text, pad) {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n')
}

/**
 * Rewrite a module's import statements into `require` calls and strip its exports.
 *
 * Only the forms this file uses are supported, and an unsupported form is an error
 * rather than a silent pass-through — a bundle that half-translated would fail in the
 * page with no line to point at.
 *
 * @param source - the ESM text of `client.mjs`.
 * @returns the factory body, its export tail, and the specifiers it required.
 */
function rewrite(source) {
  const wanted = []
  let body = source

  body = body.replace(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+)'\s*$/gm, (_match, local, spec) => {
    if (!EXTERNALS.has(spec)) throw new Error(`the page's module table cannot satisfy '${spec}'`)
    wanted.push(spec)
    return `const ${local} = require(${JSON.stringify(EXTERNALS.get(spec))})`
  })

  body = body.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*$/gm, (_match, names, spec) => {
    if (!EXTERNALS.has(spec)) throw new Error(`the page's module table cannot satisfy '${spec}'`)
    wanted.push(spec)
    return `const {${names}} = require(${JSON.stringify(EXTERNALS.get(spec))})`
  })

  if (/^\s*import\s/m.test(body)) throw new Error('an import form this wrapper does not understand is still present')

  const exported = []
  body = body.replace(/^export\s*\{([^}]*)\}\s*$/gm, (_match, names) => {
    for (const raw of names.split(',')) {
      const name = raw.trim()
      if (name.length > 0) exported.push(name.includes(' as ') ? name.split(' as ')[1].trim() : name)
    }
    return ''
  })
  if (/^\s*export\s/m.test(body)) throw new Error('an export form this wrapper does not understand is still present')

  const tail = exported.map((name) => `exports.${name} = ${name}`).join('\n')
  return { body, tail, wanted: [...new Set(wanted)] }
}

/**
 * Compose the page-ready bundle.
 *
 * @returns the whole `lib/client.js` file as text.
 */
async function build() {
  const pkg = JSON.parse(await readFile(MANIFEST_SOURCE, 'utf8'))
  const source = await readFile(CLIENT_SOURCE, 'utf8')
  const { body, tail } = rewrite(source)

  /* The palette, read from the one source and emitted into the factory. */
  const palette = JSON.parse(await readFile(PALETTE, 'utf8'))
  const prelude = `/* The vault's palette, read from Tools/mimir-tokens.json at build time. */\nconst MIMIR = ${JSON.stringify({ light: palette.light, dark: palette.dark })}\n`

  const header = [
    '/* Generated from client.mjs and Tools/mimir-tokens.json by Tools/build-mimir-skin.mjs — do not edit by hand. */',
    '// A breadcrumb the page can be asked about later: it records that this bundle was',
    '// requested and whether its factory ran. `loaded` true with `applied` false means the',
    '// factory threw — and the throw is re-raised so it stays loud in the console too.',
    'window.__MIMIR_SKIN__ = { loaded: true, applied: false, error: "" };',
    '(function () {',
    'try {',
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(pkg.name)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    '',
    indent(prelude, '\t\t'),
    '',
  ]

  const footer = [
    '',
    tail.length === 0 ? '' : indent(tail, '\t\t'),
    '\t\twindow.__MIMIR_SKIN__.applied = true;',
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '} catch (error) {',
    '\twindow.__MIMIR_SKIN__.error = String(error && error.message ? error.message : error);',
    '\tthrow error;',
    '}',
    '})();',
    '',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')

  return header.join('\n') + indent(body.trimEnd(), '\t\t') + '\n' + footer
}

const next = await build()
const hostSource = await readFile(HOST_SOURCE, 'utf8')

if (process.argv.includes('--check')) {
  const problems = []
  const pairs = [
    [CLIENT_TARGET, next, 'the built browser bundle'],
    [HOST_TARGET, hostSource, 'the built host half'],
    [MANIFEST_SOURCE, await readFile(MANIFEST_SOURCE, 'utf8'), 'the manifest'],
  ]
  for (const [path, expected, label] of pairs) {
    if (!existsSync(path)) problems.push(`${label} is missing (${path})`)
    else if ((await readFile(path, 'utf8')) !== expected) problems.push(`${label} is stale (${path})`)
  }
  if (!existsSync(PATCH_TARGET)) problems.push('the package has no cordis.patch.yml, so `dsh plugin add` cannot compose it')
  if (problems.length > 0) {
    for (const problem of problems) console.log('mimir-skin: ' + problem)
    console.log('mimir-skin: run Tools/build-mimir-skin.mjs')
    process.exit(1)
  }
  console.log(`mimir-skin: ${PACKAGE} is built and current`)
  process.exit(0)
}

if (!existsSync(CLIENT_SOURCE)) {
  console.error(`mimir-skin: no skin source at ${CLIENT_SOURCE} — is this a full clone?`)
  process.exit(1)
}

await mkdir(LIB, { recursive: true })
await writeFile(CLIENT_TARGET, next, 'utf8')
await writeFile(HOST_TARGET, hostSource, 'utf8')

console.log(`mimir-skin: wrote ${CLIENT_TARGET} (${next.length} bytes)`)
console.log(`mimir-skin: wrote ${HOST_TARGET}`)
console.log('mimir-skin: install it with ./scripts/install.sh, or by hand:')
console.log(`mimir-skin:   dsh plugin --profile web add "${PACKAGE_DIR}"`)
