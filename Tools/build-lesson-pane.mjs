#!/usr/bin/env node
/**
 * Build the Lesson pane's browser half into the package that ships with this repo.
 *
 * DSH serves each client plugin's `exports["./client"]` file verbatim to the page,
 * and the page expects every bundle to register itself with `window.__ModuleLoader__`
 * as a CommonJS-style factory. `client.mjs` is written as ordinary ESM so it can be
 * read, diffed and linted like any other module — this script wraps it into that
 * factory and rewrites its imports into the factory's `require` calls.
 *
 * React is NOT a dependency here: it comes off the page's module table, so nothing is
 * installed and nothing is downloaded. The only rewriting is the import header, which
 * is why this is a wrapper and not a compiler.
 *
 * WHY THE OUTPUT IS AN INSTALLED PACKAGE. A plugin's browser half only reaches the
 * page if the Harness' plugin table can resolve the row that carries it, and that
 * table resolves by PACKAGE NAME from the profile's `node_modules` — a preset-relative
 * file resolves for the Host half but never produces a browser bundle. So the source is
 * authored in the vault and installed beside the other plugins, exactly as
 * `dsh plugin --profile web add <path>` would leave it.
 *
 * Usage:  node Tools/build-lesson-pane.mjs [--check]
 *   --check   report whether the installed bundle is already current; write nothing.
 *
 * WHAT DECIDES WHETHER IT WORKS, and what only shows how it looks:
 *   node Tools/test-lesson-pane.mjs      boots the built bundle against stubbed platform
 *                                        faces and asserts its seats, its declarations,
 *                                        its transcript fold and its rendering. This is
 *                                        the gate; run it after every build.
 *   node Tools/preview-lesson-pane.mjs   draws the window offline around a sample
 *                                        session into Tools/lesson-pane/preview.html,
 *                                        for judging the design without loading the app.
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VAULT = resolve(HERE, '..')

/* The vault's own copy of the source, and the profile that installs it. */
const SOURCE = join(VAULT, 'Tools', 'lesson-pane')
const HARNESS = process.env.DSH_HOME ?? join(process.env.HOME ?? '', 'Library', 'Application Support', 'dsh-desktop', 'harness')
const TARGET = join(HARNESS, 'profiles', 'web', 'node_modules', 'dsh-mimir-lesson-pane')

/**
 * Where the HOST half has to live to be reachable at all.
 *
 * A preset names it as a preset-relative file, so it ships beside the composition it
 * belongs to — and travelling with the preset is the right behaviour anyway: the two
 * halves are one feature, and the preset is the thing that decides whether a session
 * teaches with it.
 */
const PRESET_HOST = join(HARNESS, '.agent-presets', 'mimir-tutor', 'lesson-pane')

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
 * Only the forms this file uses are supported, and an unsupported form is an error
 * rather than a silent pass-through.
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

async function build() {
  const pkg = JSON.parse(await readFile(join(SOURCE, 'package.json'), 'utf8'))
  const id = pkg.name
  const source = await readFile(join(SOURCE, 'client.mjs'), 'utf8')
  const { body, tail, wanted } = rewrite(source)

  const header = [
    '/* Generated from client.mjs by Tools/build-lesson-pane.mjs — do not edit by hand. */',
    '// A breadcrumb the page can be asked about later: it records that this bundle was',
    '// requested and whether its factory ran. `loaded` true with `applied` false means the',
    '// factory threw — and the throw is re-raised so it stays loud in the console too.',
    'window.__MIMIR_LESSON_PANE__ = { loaded: true, applied: false, error: "" };',
    '(function () {',
    'try {',
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(id)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    '',
  ]

  const footer = [
    '',
    tail.length === 0 ? '' : indent(tail, '\t\t'),
    '\t\twindow.__MIMIR_LESSON_PANE__.applied = true;',
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '} catch (error) {',
    '\twindow.__MIMIR_LESSON_PANE__.error = String(error && error.message ? error.message : error);',
    '\tthrow error;',
    '}',
    '})();',
    '',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')

  return header.join('\n') + indent(body.trimEnd(), '\t\t') + '\n' + footer
}

const OUT = join(VAULT, 'preset', 'lesson-pane', 'lib')
const target = join(OUT, 'client.js')
const next = await build()

/*
 * The host half has THREE copies, and they have to agree.
 *
 *   Tools/lesson-pane/host.mjs            the source, and the only one to edit
 *   preset/lesson-pane/lib/index.js       the package's `main`, installed as a bundle
 *   preset/lesson-pane/host.mjs           what the preset row names: `./lesson-pane/host.mjs`
 *
 * The third exists because a preset row can only name a file relative to the
 * preset, so the host half has to travel inside the preset as well as inside the
 * package. Two of the three are generated and the source is not — which is
 * exactly the shape that drifts silently, because nothing fails when they
 * disagree: the pane simply behaves differently depending on which half mounted.
 * So the build writes all of them and `--check` compares all of them.
 */
const HOST_SOURCE = join(SOURCE, 'host.mjs')
const HOST_COPIES = [
  [join(OUT, 'index.js'), 'the installed host half'],
  [join(VAULT, 'preset', 'lesson-pane', 'host.mjs'), 'the host half beside the preset'],
]

if (process.argv.includes('--check')) {
  const problems = []
  const hostSource = await readFile(HOST_SOURCE, 'utf8')
  const pairs = [
    [target, next, 'the browser bundle'],
    ...HOST_COPIES.map(([path, label]) => [path, hostSource, label]),
  ]
  for (const [path, expected, label] of pairs) {
    if (!existsSync(path)) problems.push(`${label} is missing (${path})`)
    else if (await readFile(path, 'utf8') !== expected) problems.push(`${label} is stale (${path})`)
  }
  if (problems.length > 0) {
    for (const problem of problems) console.log('lesson-pane: ' + problem)
    console.log('lesson-pane: run Tools/build-lesson-pane.mjs')
    process.exit(1)
  }
  console.log('lesson-pane: browser bundle and all three host copies are current')
  process.exit(0)
}

await mkdir(OUT, { recursive: true })
await writeFile(target, next, 'utf8')
for (const [path, label] of HOST_COPIES) {
  await mkdir(dirname(path), { recursive: true })
  await copyFile(HOST_SOURCE, path)
}

console.log(`lesson-pane: wrote ${target} (${next.length} bytes)`)
for (const [path] of HOST_COPIES) console.log(`lesson-pane: wrote ${path}`)
