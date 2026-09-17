#!/usr/bin/env node
/**
 * Render the Lesson window to a standalone HTML page, offline.
 *
 * WHY THIS EXISTS. The window's looks cannot be judged from the vault, and the only
 * other way to see them is to load the whole app, publish a question and wait. This
 * draws the real components — the same bundle the browser loads — around a sample
 * session, and writes one file that can be opened in any browser. It is a proofing
 * tool, not a test: `Tools/test-lesson-pane.mjs` is what decides whether the half works.
 *
 * Usage:  node Tools/build-lesson-pane.mjs && node Tools/preview-lesson-pane.mjs [out.html]
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = fileURLToPath(new URL('..', import.meta.url))
/* The committed bundle, read from this repository rather than from an installed copy of
   the pane: `preset/lesson-pane/lib/client.js`, written by Tools/build-lesson-pane.mjs.
   Point MIMIR_LESSON_PANE_BUNDLE at another file to draw that one instead, which is how a
   developer previews the copy their own app is loading. */
const bundlePath = process.env.MIMIR_LESSON_PANE_BUNDLE
  ?? path.join(ROOT, 'preset', 'lesson-pane', 'lib', 'client.js')
const outPath = process.argv[2] ?? path.join(here, 'lesson-pane', 'preview.html')

/**
 * Where React comes from.
 *
 * It is not a dependency of this repository and must not become one: the pane takes React
 * off the page's module table, and only this proofing tool needs it on disk. Four places
 * are tried, in order, because a contributor's machine is not this one:
 *
 *   1. `MIMIR_DSH_APP_MODULES` — any `node_modules` directory holding react.
 *   2. `DSH_HOME`, walked upwards — the first ancestor, itself included, with a
 *      `node_modules/react` beside it.
 *   3. `/Applications/DSH Desktop.app/Contents/Resources/app/node_modules` — the macOS
 *      install this was written on. The one machine-specific path left in this file, and
 *      only ever a fallback: it is tried, and its absence is not an error.
 *   4. a bare `require('react')`, for a machine that already resolves it.
 *
 * A MISSING REACT IS NOT A FAILURE. This is a proofing tool, not a build step, and a
 * contributor without DSH Desktop has nothing to draw the window with. The run says so in
 * one line and exits 0, because "not applicable" is not "broken".
 */
function findAppModules() {
  const candidates = []
  if (process.env.MIMIR_DSH_APP_MODULES) candidates.push(process.env.MIMIR_DSH_APP_MODULES)
  if (process.env.DSH_HOME) {
    for (let dir = path.resolve(process.env.DSH_HOME); ; dir = path.dirname(dir)) {
      candidates.push(path.join(dir, 'node_modules'))
      if (path.dirname(dir) === dir) break
    }
  }
  candidates.push('/Applications/DSH Desktop.app/Contents/Resources/app/node_modules')
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'react', 'package.json'))) ?? null
}

const appModules = findAppModules()
const requireFrom = appModules === null
  ? createRequire(import.meta.url)
  : createRequire(path.join(appModules, 'index.js'))

/** One module, from the app's own modules when they are there and from the path otherwise. */
function optional(specifier) {
  for (const load of [requireFrom, createRequire(import.meta.url)]) {
    try {
      return load(specifier)
    } catch {
      /* the next place */
    }
  }
  return null
}

const React = optional('react')
const server = optional('react-dom/server')
if (React === null || server === null) {
  console.log('lesson-pane: React or react-dom/server was not found — set MIMIR_DSH_APP_MODULES to a node_modules holding them, or install DSH Desktop at /Applications/DSH Desktop.app; skipping the preview, because React is not a dependency of this repository and the window cannot be drawn without it.')
  process.exit(0)
}
const { renderToStaticMarkup } = server

const SESSION = 'session-preview'

/** A lesson and a dialogue of the kind this vault actually produces. */
const LESSON = {
  quiz: {
    question: 'The map draws four foundation boxes. Which of them would fail first if the winter rainfall it depends on arrived a month late?',
    options: [
      'The one resting on summer drought',
      'The one resting on autumn germination',
      'The one resting on fire return intervals',
      'None — the boxes are independent',
    ],
    hint: 'Read the arrows, not the boxes.',
  },
  visuals: ['mediterranean-map.svg'],
  spine: [
    { node: 'Mediterranean climate is rainfall-limited, not temperature-limited', state: 'held' },
    { node: 'Autumn germination is timed to the first rains', state: 'learning' },
    { node: 'Fire return intervals assume dry summers', state: 'planned' },
  ],
}

const ENTRIES = [
  { type: 'event', event: { type: 'turn/start', seq: 1, time: Date.now() - 2.4e6, data: { turn: 1 } } },
  {
    type: 'event',
    event: {
      type: 'user/message', seq: 2, time: Date.now() - 2.4e6, surfaceOp: 'append',
      data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'I think the map is mostly about rainfall, but I do not see why the timing matters.' }] },
    },
  },
  { type: 'event', event: { type: 'tool/call', seq: 3, time: Date.now() - 2.3e6, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{}' } } },
  { type: 'event', event: { type: 'tool/call', seq: 4, time: Date.now() - 2.3e6, data: { turn: 1, step: 1, callId: 'c2', name: 'grep', arguments: '{}' } } },
  {
    type: 'event',
    event: {
      type: 'assistant/message', seq: 5, time: Date.now() - 2.2e6, surfaceOp: 'append',
      data: {
        turn: 1, step: 1, stream: [],
        message: {
          id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'deepseek', model: 'x' },
          content: [{
            type: 'text',
            text: 'You have the first half, and the half you are missing is the one that makes the whole map move.\n\nRainfall alone would only say *how much* water there is. What the map actually rests on is **when** it arrives:\n\n- the summer is dry enough that nothing germinates in it\n- the first autumn rains are what starts the year\n- a month of delay moves the start of the growing season, not its size\n\nSo ask it this way: if the rain came late but in the same quantity, what in the drawing would still be true?\n\n> A season is a promise about timing, not about volume.\n\n`Learn/Concepts/Mediterranean seasonality.md` has the worked version of this.',
          }],
        },
      },
    },
  },
  { type: 'event', event: { type: 'turn/end', seq: 6, time: Date.now() - 2.1e6, data: { turn: 1, reason: 'completed' } } },
  { type: 'event', event: { type: 'turn/start', seq: 7, time: Date.now() - 1.2e6, data: { turn: 2 } } },
  {
    type: 'event',
    event: {
      type: 'user/message', seq: 8, time: Date.now() - 1.2e6, surfaceOp: 'append',
      data: { id: 'u2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Then the second box would move before the fourth one does.' }] },
    },
  },
  { type: 'event', event: { type: 'tool/call', seq: 9, time: Date.now() - 1.1e6, data: { turn: 2, step: 1, callId: 'c3', name: 'subagent_researcher', arguments: '{}' } } },
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 10, time: Date.now() - 6e5, data: { attemptId: 'x', turn: 2, step: 1, chunk: { type: 'text', text: 'Yes — and hold on to why, because that ordering is the thing worth remembering' } } } },
]

/* ── a page-shaped stub of the platform, enough to apply the real half ─────── */

let registration = null
const listeners = new Set()
const feed = {
  revision: 9,
  entries: ENTRIES,
  hasMore: true,
  getSnapshot() { return { entries: feed.entries, hasMore: feed.hasMore, revision: feed.revision } },
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}
// The session face the pane binds to. `subscribe` matters: without it the pane treats the
// session as unbindable and never raises its window, which is exactly what the preview
// showed before this was here.
const detail = {
  running: true,
  getSnapshot() { return { running: true } },
  subscribe() { return () => {} },
  async loadOlder() {},
}
const makeElement = () => ({
  dataset: {}, style: {}, children: [],
  setAttribute() {}, getAttribute() { return null }, removeAttribute() {},
  append(child) { this.children.push(child) }, remove() {},
})
const styles = []
const document = {
  head: { append(node) { if (node?.textContent !== undefined) styles.push(node.textContent) } },
  body: { append() {}, getAttribute: () => process.env.PREVIEW_DARK === '1' ? 'dark' : null },
  documentElement: { setAttribute() {}, getAttribute() { return 'on' }, removeAttribute() {} },
  createElement: () => makeElement(),
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
}
const sandbox = {
  window: {
    __ModuleLoader__: { load: (entry) => { registration = entry } },
    getComputedStyle: () => ({ getPropertyValue: () => '#131a19' }),
    addEventListener() {}, removeEventListener() {},
    // The pane reads its reading preferences from browser storage; here the environment
    // stands in for that store, so one flag previews one size.
    localStorage: {
      // The tab the preview opens on, so the drawings can be looked at without a click:
      // PREVIEW_TAB takes the pane's own tab id — `viz` for the drawings, not the
      // "Visuals" it is labelled with.
      getItem: (key) => {
        if (key === 'mimir-lesson-tab') return process.env.PREVIEW_TAB ?? null
        if (key === 'mimir-lesson-theme') return process.env.PREVIEW_THEME === 'dark' ? 'dark' : null
        if (key === 'mimir-lesson-text') return process.env.PREVIEW_TEXT ?? null
        return null
      },
      setItem() {},
    },
  },
  document,
  location: { pathname: '/' },
  fetch: async (url) => ({
    ok: true,
    status: 200,
    json: async () => String(url).endsWith('handshake')
      ? { prefix: '/mimir-lesson-pane' }
      : {
        ready: true,
        sessionId: SESSION,
        vault: 'Lesson',
        hasLesson: true,
        lesson: LESSON,
        answers: [],
        notes: '',
        visuals: [{ name: 'mediterranean-map.svg' }],
      },
  }),
  console,
  setTimeout,
}
vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), vm.createContext(sandbox), { filename: bundlePath })

/* The window the half opens for itself is the thing being proofed, so the React root it
   creates is captured rather than drawn: that element is the window. */
let windowElement = null
const client = registration.factory((specifier) => {
  if (specifier === 'react') return React
  if (specifier === 'react-dom/client') {
    return { createRoot: () => ({ render: (element) => { windowElement = element }, unmount() {} }) }
  }
  throw new Error(`the page cannot satisfy '${specifier}'`)
})

const services = {
  slots: { inject: (_name, callback) => { callback(); return () => {} }, register: () => () => {} },
  sessions: {
    list: { getSnapshot: () => ({ current: SESSION, byId: { [SESSION]: { cwd: ROOT } } }) },
    binding: () => ({ inputActions: { setDraft() {} }, eventSource: feed, session: detail }),
  },
  sidebarRight: { mounted: () => ({ layout: { tabs: {} } }), openTab() {} },
  sidebarRightTabs: { register: () => () => {} },
}
/* The pane reads the lesson on its own first tick, and raises the window when the tick
   finds a question waiting — the app's own path to a visible window, with the clock
   handed to us instead of the runtime. */
const timers = []
const ctx = {
  get: (key) => services[key],
  effect: (callback) => { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } },
  timeout: (callback) => { timers.push(callback); return () => {} },
  interval: () => () => {},
}
client.apply(ctx)
await new Promise((resolve) => setTimeout(resolve, 50))
client.bindSessionFeed(services.sessions)
// The pane's own first tick: it reads the lesson and raises the window by itself.
timers[0]?.()
await new Promise((resolve) => setTimeout(resolve, 120))

/**
 * The window's own element, drawn as the app would draw it.
 *
 * `openLessonWindow` raises the window the moment a question is waiting, and this
 * session has one, so by now the half has handed its own component to a React root.
 * Drawing that element is drawing the window — nothing here is a stand-in.
 */
const css = styles.join('\n')
const body = windowElement === null
  ? '<p>the window did not open</p>'
  : renderToStaticMarkup(React.createElement(windowElement.type, { ...windowElement.props, windowWide: true }))

const page = `<!doctype html>
<html lang="en" data-mm-theme="${process.env.PREVIEW_THEME === 'dark' ? 'dark' : 'light'}" data-mm-text="${process.env.PREVIEW_TEXT ?? 'large'}">
<head>
<meta charset="utf-8">
<title>Lesson window — preview</title>
<style>
html,body{margin:0;height:100%;background:#0b0f0e}
body{padding:24px;box-sizing:border-box}
.mm-window{position:static!important;width:100%!important;height:calc(100vh - 48px)!important;resize:none!important}
${css}
</style>
</head>
<body>
<div class="mm-window" data-mimir-window="on">${body}</div>
</body>
</html>
`

fs.writeFileSync(outPath, page, 'utf8')
console.log(`lesson-pane: wrote ${outPath} (${page.length} bytes, ${process.env.PREVIEW_THEME === 'dark' ? 'dark' : 'light'}, text ${process.env.PREVIEW_TEXT ?? 'large'})`)
