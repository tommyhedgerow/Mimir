#!/usr/bin/env node
/**
 * Check the board's HOST half before the app mounts it.
 *
 * WHY THIS EXISTS. The browser half is checked by rendering it; the host half is checked
 * by nothing until the moment a session tries to use it — and the failure it can produce
 * is the worst kind this system has: a row that is composed, enabled and active, whose
 * tool never registers, which looks exactly like a teacher who forgot to call it. So the
 * built half is loaded the way the loader loads it, registered into a stub registry, and
 * then driven: the tool is called with arguments that should work, with a drawing path
 * that should be refused, and with a workspace holding one drawing that exists and one
 * that does not.
 *
 * WHAT IT PINS, and each of these is a decision rather than a detail:
 *
 *   · the tool registers at all, with parameters and output that the registry's schema
 *     subset accepts — the host half imports nothing, so this file is the only thing
 *     standing between it and a mount-time rejection;
 *   · the hand-written argument check rejects what the schema says it rejects, since
 *     nothing else is validating those arguments;
 *   · THE DRAWINGS DO NOT REACH THE MODEL. `output.render` is what the teacher reads, and
 *     an SVG in it would be thousands of tokens of path data in the context window on
 *     every board;
 *   · THE DRAWINGS DO REACH THE INTERFACE, through `presentationMeta`;
 *   · a path is flattened to its final segment, so `../../secrets.svg` cannot be read;
 *   · a drawing that is missing is NAMED as missing rather than dropped, because a
 *     silently absent diagram is a lesson that refers to something the reader cannot see.
 *
 * Usage:  node Tools/test-mimir-board.mjs
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUILT = join(resolve(HERE, '..'), 'preset', 'mimir-skin', 'lib', 'index.js')

let passed = 0
let failed = 0

function check(label, ok, detail) {
  if (ok) {
    passed += 1
    return
  }
  failed += 1
  console.log(`  FAIL  ${label}${detail === undefined ? '' : ' — ' + detail}`)
}

if (!existsSync(BUILT)) {
  console.log(`  SKIP  the board's host half has not been built (${BUILT})`)
  console.log('mimir-board: run Tools/build-mimir-skin.mjs')
  process.exit(0)
}

/* ── load the built half the way the loader does ──────────────────────────── */

const host = await import(pathToFileURL(BUILT).href)
check('the host half declares a plugin name', typeof host.name === 'string' && host.name.length > 0)
check('the host half asks for the registries it needs', Array.isArray(host.inject) && host.inject.includes('tools'))
check('the host half imports nothing from the harness', !/\bfrom\s+['"]@deepseek-ai\//.test(await (await import('node:fs/promises')).readFile(BUILT, 'utf8')))

/* ── a workspace with one drawing that exists and one that does not ───────── */

const MAP = '<svg xmlns="http://www.w3.org/2000/svg"><title>the map</title></svg>'

function makeFs(files) {
  const asked = []
  return {
    asked,
    async resolve(path) {
      asked.push(path)
      return { path }
    },
    async stat(target) {
      const name = target.path.split('/').pop()
      return files[name] === undefined ? undefined : { type: 'file' }
    },
    async readText(target) {
      return files[target.path.split('/').pop()]
    },
  }
}

const fs = makeFs({ 'mediterranean-map.svg': MAP })

/** The registry stub: it captures what the row registered. */
const registered = []
const ctx = {
  get: (service) => (service === 'fs' ? fs : undefined),
  tools: {
    register: (definition) => {
      registered.push(definition)
      return () => {}
    },
  },
}

host.apply(ctx)

check('applying registers exactly one tool', registered.length === 1, `registered: ${registered.length}`)
const tool = registered[0]
check('the tool is named mimir_board', tool?.name === 'mimir_board', tool?.name)
check('the tool is described for the model', typeof tool?.description === 'string' && tool.description.length > 80)
check(
  'the parameters carry the five fields the method publishes',
  ['spine', 'question', 'options', 'hint', 'visuals'].every((key) => key in (tool?.parameters?.properties ?? {})),
  Object.keys(tool?.parameters?.properties ?? {}).join(', '),
)
check('the spine is required', (tool?.parameters?.required ?? []).includes('spine'))
check(
  'a node state is constrained to the method\'s four',
  JSON.stringify(tool?.parameters?.properties?.spine?.items?.properties?.state?.enum) ===
    JSON.stringify(['held', 'learning', 'fragile', 'planned']),
)
check('the output declares render', typeof tool?.output?.render === 'function')
check('the output declares presentationMeta', typeof tool?.output?.presentationMeta === 'function')

/* ── the two channels carry different things ──────────────────────────────── */

const exec = { agent: { session: { header: { cwd: '/vault' } } } }
const args = {
  spine: [
    { node: 'Summer drought is the defining constraint', state: 'held' },
    { node: 'Drought decides leaf size', state: 'learning' },
  ],
  question: 'Which of these is an unconditional truth?',
  options: ['They are all evergreen', 'They all survive summer drought'],
  hint: 'Answer from the water, not the leaf.',
  visuals: ['mediterranean-map.svg', 'gone.svg', '../../../etc/passwd.svg'],
}

const value = await tool.execute(args, exec)
const drawings = value.drawings ?? []
check('execute returns one entry per named drawing', drawings.length === 3, `got ${drawings.length}`)

const carried = drawings.filter((drawing) => drawing.missing === false)
const absent = drawings.filter((drawing) => drawing.missing === true)
check('the drawing that exists is carried, with its bytes', carried.length === 1 && carried[0]?.svg === MAP)
check('the drawing that does not exist is named as missing', absent.some((d) => d.name === 'gone.svg'))
check(
  'a traversal attempt is FLATTENED to a name under Learn/Viz/, never followed',
  absent.some((d) => d.name === 'passwd.svg'),
  absent.map((d) => `${d.name}: ${d.note}`).join(' | '),
)
check(
  'nothing was ever asked for outside the drawings folder',
  fs.asked.length > 0 && fs.asked.every((target) => String(target).startsWith('/vault/Learn/Viz/')),
  fs.asked.map(String).join(', '),
)

/* A name that is not a drawing at all is refused before the filesystem sees it. */
const junk = await tool.execute({ spine: [], visuals: ['notes.txt', ''] }, exec)
check(
  'a name that is not a plain .svg is refused, not looked up',
  junk.drawings.length === 2 &&
    junk.drawings.every((drawing) => drawing.missing === true && drawing.note === 'not a plain .svg filename'),
  junk.drawings.map((d) => `${d.name}: ${d.note}`).join(' | '),
)

/* And the hand-written argument check is in front of that, as it should be. */
let rejected = false
try {
  await tool.execute({ spine: [], visuals: [42] }, exec)
} catch (error) {
  rejected = error?.name === 'ToolArgsError' && Array.isArray(error?.violations) && error.violations.length > 0
}
check('a non-string drawing name is rejected by the argument check', rejected)

/* The same check refuses a spine node whose state is outside the method's four. */
let stateRejected = false
try {
  await tool.execute({ spine: [{ node: 'x', state: 'nearly-there' }] }, exec)
} catch (error) {
  stateRejected = error?.name === 'ToolArgsError' && /expected one of held \| learning \| fragile \| planned/.test(String(error?.message))
}
check('a spine state outside the four is rejected', stateRejected)

/* And a missing required field is named rather than silently accepted. */
let spineRejected = false
try {
  await tool.execute({ hint: 'no spine here' }, exec)
} catch (error) {
  spineRejected = error?.name === 'ToolArgsError' && /arguments\.spine: required/.test(String(error?.message))
}
check('a board with no spine is rejected', spineRejected)

const modelText = JSON.stringify(tool.output.render(args, value))
check('the model is told what was published', modelText.includes('2 nodes'))
check('the model is told the names of the drawings', modelText.includes('mediterranean-map.svg'))
check('THE DRAWING ITSELF NEVER REACHES THE MODEL', !modelText.includes('<svg'))
check('the model is told which drawings the reader cannot see', modelText.includes('NOT SHOWN'))

const meta = tool.output.presentationMeta(args, value)
check('the interface receives the spine', meta.nodes.length === 2)
check('the interface receives the question and options', meta.options.length === 2)
check('THE DRAWING DOES REACH THE INTERFACE', meta.drawings.some((drawing) => drawing.svg === MAP))
check('the interface is handed the same three entries the host read', meta.drawings.length === 3)

/* ── a value that was never read from disk still renders ──────────────────── */

const bare = tool.output.render({ spine: [] }, { nodes: [], drawings: [], hint: '', question: '', options: [] })
check('an empty board still renders a line for the model', typeof bare?.[0]?.text === 'string' && bare[0].text.length > 0)

console.log(`\nmimir-board: ${passed} checks passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
