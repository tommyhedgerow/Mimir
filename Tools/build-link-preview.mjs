#!/usr/bin/env node
/**
 * Build the link-preview plugin into its installed package.
 *
 * READ THIS BESIDE `Tools/build-mimir-skin.mjs`. The two are the same shape on
 * purpose: DSH serves each client plugin's `exports["./client"]` file verbatim to
 * the page, and the page expects every bundle to register itself with
 * `window.__ModuleLoader__` as a CommonJS-style factory. `Tools/link-preview/client.mjs`
 * is ordinary ESM so it can be read, diffed and linted; this script rewrites its
 * import header into the factory's `require` calls, strips its exports, prepends
 * the palette, and writes the result to two places — the vault's own `lib/` copy
 * and the profile's `node_modules`, which is the copy the app actually serves.
 *
 * WHY THE OUTPUT IS AN INSTALLED PACKAGE. A plugin's browser half only reaches the
 * page if the profile's bundle table can resolve it by PACKAGE NAME from the
 * profile's `node_modules`, so the source is authored in the vault and installed
 * beside the other plugins, exactly as `dsh plugin --profile web add <path>` would
 * leave it. The row that composes it goes in the profile's `cordis.patch.yml`,
 * which this script APPENDS to and never rewrites.
 *
 * WHY BOTH HALVES GO IN ONE PACKAGE, UNLIKE THE SKIN. The card needs a fact the
 * page cannot get for itself: the page is served under `connect-src 'self'`, so a
 * fetch to Wikipedia from the conversation is refused by the browser. The host
 * half is therefore not optional plumbing — without it there is nothing to show
 * but the link's own title — and the two halves are one plugin because neither is
 * useful alone.
 *
 * Usage:  node Tools/build-link-preview.mjs [--check]
 *   --check   report whether the installed copy is current; write nothing.
 *
 * WHAT DECIDES WHETHER IT WORKS:
 *   node Tools/test-link-preview.mjs   both halves: the URL fence, the two preview
 *                                      shapes against recorded fixtures, the route
 *                                      registered into a stub web server, and the
 *                                      SHIPPED bundle loaded and applied the way the
 *                                      page loads it, card and all.
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VAULT = resolve(HERE, '..')

/** The vault's own copy of the source, the palette it is generated from, and the profile. */
const SOURCE = join(VAULT, 'Tools', 'link-preview')
const PALETTE = join(VAULT, 'Tools', 'mimir-tokens.json')
const HARNESS =
  process.env.DSH_HOME ??
  join(process.env.HOME ?? '', 'Library', 'Application Support', 'dsh-desktop', 'harness')

/** The package name the profile resolves, and where its files must land. */
const PACKAGE = 'dsh-link-preview'
const TARGET = join(HARNESS, 'profiles', 'web', 'node_modules', PACKAGE)
const PROFILE_DIR = join(HARNESS, 'profiles', 'web')
const PROFILE_MANIFEST = join(PROFILE_DIR, 'package.json')
const PROFILE_PATCH = join(PROFILE_DIR, 'cordis.patch.yml')

/** The row this script is responsible for having composed. */
const ROW = `- insert:\n    - id: link-preview\n      name: ${PACKAGE}\n`

/**
 * The import specifiers the page's module table can satisfy, mapped to the source names.
 *
 * The card used to import React and got it wrong: it built a React element and handed
 * that object to `replaceChildren`, so the app rendered the words `[object Object]`. The
 * card is plain DOM now and imports nothing, which makes a bundle with no `require` in it
 * the healthy case — this table stays so the rewriter keeps REFUSING a specifier the page
 * cannot resolve rather than passing it through half-translated.
 */
const EXTERNALS = new Map([
  ['react', 'react'],
  ['react/jsx-runtime', 'react/jsx-runtime'],
  ['react-dom/client', 'react-dom/client'],
])

function indent (text, pad) {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n')
}

/**
 * Rewrite a module's import statements into `require` calls and strip its exports.
 *
 * Only the forms this file uses are supported, and an unsupported form is an error
 * rather than a silent pass-through — a bundle that half-translated would fail in
 * the page with no line to point at.
 */
function rewrite (source) {
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

async function build () {
  const pkg = JSON.parse(await readFile(join(SOURCE, 'package.json'), 'utf8'))
  const id = pkg.name
  const source = await readFile(join(SOURCE, 'client.mjs'), 'utf8')
  const { body, tail, wanted } = rewrite(source)

  /* The palette, read from the one source and emitted into the factory. The card
     reads its colours from the `--mm-*` tokens the skin stacks on `<body>`, so the
     palette here is the FALLBACK half — a card still legible if the skin is ever
     composed without this plugin, and never a second hand-copied table. */
  const palette = JSON.parse(await readFile(PALETTE, 'utf8'))
  const prelude = `/* The vault's palette, read from Tools/mimir-tokens.json at build time. */\nconst MIMIR = ${JSON.stringify({ light: palette.light, dark: palette.dark })}\n`

  const header = [
    '/* Generated from client.mjs and Tools/mimir-tokens.json by Tools/build-link-preview.mjs — do not edit by hand. */',
    '// A breadcrumb the page can be asked about later: `loaded` true with `applied` false',
    '// means the factory threw, and the throw is re-raised so it stays loud in the console.',
    'window.__LINK_PREVIEW__ = { loaded: true, applied: false, error: "" };',
    '(function () {',
    'try {',
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(id)},`,
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
    '\t\twindow.__LINK_PREVIEW__.applied = true;',
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '} catch (error) {',
    '\twindow.__LINK_PREVIEW__.error = String(error && error.message ? error.message : error);',
    '\tthrow error;',
    '}',
    '})();',
    '',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')

  return { bundle: header.join('\n') + indent(body.trimEnd(), '\t\t') + '\n' + footer, wanted }
}

const target = join(TARGET, 'lib', 'client.js')
const built = await build()
const next = built.bundle

if (process.argv.includes('--check')) {
  const problems = []
  const hostSource = await readFile(join(SOURCE, 'host.mjs'), 'utf8')
  const pkgSource = await readFile(join(SOURCE, 'package.json'), 'utf8')
  const pairs = [
    [target, next, 'the installed browser bundle'],
    [join(TARGET, 'lib', 'index.js'), hostSource, 'the installed host half'],
    [join(TARGET, 'package.json'), pkgSource, 'the installed manifest'],
    [join(SOURCE, 'lib', 'client.js'), next, 'the vault browser bundle'],
    [join(SOURCE, 'lib', 'index.js'), hostSource, 'the vault host half'],
  ]
  for (const [path, expected, label] of pairs) {
    if (!existsSync(path)) problems.push(`${label} is missing (${path})`)
    else if ((await readFile(path, 'utf8')) !== expected) problems.push(`${label} is stale (${path})`)
  }
  if (existsSync(PROFILE_MANIFEST)) {
    const profile = JSON.parse(await readFile(PROFILE_MANIFEST, 'utf8'))
    if (profile.dependencies?.[PACKAGE] === undefined) problems.push('the profile does not depend on the plugin')
  } else {
    problems.push(`no profile manifest at ${PROFILE_MANIFEST}`)
  }
  if (!existsSync(PROFILE_PATCH) || !(await readFile(PROFILE_PATCH, 'utf8')).includes(`name: ${PACKAGE}`)) {
    problems.push('the profile patch does not compose the plugin row')
  }
  if (problems.length > 0) {
    for (const problem of problems) console.log('link-preview: ' + problem)
    console.log('link-preview: run Tools/build-link-preview.mjs')
    process.exit(1)
  }
  console.log('link-preview: bundle, host half, manifest, dependency and row are all current')
  process.exit(0)
}

await mkdir(join(SOURCE, 'lib'), { recursive: true })
await writeFile(join(SOURCE, 'lib', 'client.js'), next, 'utf8')
await copyFile(join(SOURCE, 'host.mjs'), join(SOURCE, 'lib', 'index.js'))
await mkdir(join(TARGET, 'lib'), { recursive: true })
await writeFile(target, next, 'utf8')
await copyFile(join(SOURCE, 'host.mjs'), join(TARGET, 'lib', 'index.js'))
await writeFile(join(TARGET, 'package.json'), await readFile(join(SOURCE, 'package.json'), 'utf8'))

/* Declare the package in the profile's dependencies. WHAT COMPOSES THE PLUGIN IS THE ROW
   IN cordis.patch.yml, NOT `dsh.profile.bundles` — measured, not assumed; see the long
   note in Tools/build-mimir-skin.mjs, where the app was caught rewriting that list while
   the row went on composing. */
if (existsSync(PROFILE_MANIFEST)) {
  const profile = JSON.parse(await readFile(PROFILE_MANIFEST, 'utf8'))
  profile.dependencies ??= {}
  profile.dependencies[PACKAGE] = `file:./node_modules/${PACKAGE}`
  await writeFile(PROFILE_MANIFEST, JSON.stringify(profile, null, 2) + '\n', 'utf8')
}

/* Compose the row. APPEND, never rewrite: the skin's script owns this file too, so
   anything added here must survive its next rebuild. A row this script previously wrote is
   replaced rather than repeated, because a duplicate insert of the same id is exactly the
   kind of miscomposition the patch layer cannot express. */
if (existsSync(PROFILE_PATCH)) {
  const patch = await readFile(PROFILE_PATCH, 'utf8')
  const own = new RegExp(`- insert:\\n    - id: link-preview\\n      name: ${PACKAGE}\\n?`, 'g')
  const without = patch.replace(own, '')
  if (!without.includes(`name: ${PACKAGE}`)) {
    const spaced = without.endsWith('\n') ? without : without + '\n'
    await writeFile(PROFILE_PATCH, spaced + ROW, 'utf8')
    console.log(`link-preview: added its row to ${PROFILE_PATCH}`)
  }
}

console.log(`link-preview: wrote ${target} (${next.length} bytes)`)
console.log('link-preview: one restart composes the row; after that a rebuild needs only a reload')
