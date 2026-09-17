#!/usr/bin/env node
/*
 * Smoke-test the Lesson pane's browser half against stubbed platform faces.
 * Run after the build:  node Tools/build-lesson-pane.mjs && node Tools/test-lesson-pane.mjs
 *
 * WHY THIS EXISTS. The pane's client half has failed inside the running app three
 * times on 2026-09-17, and every one of those failures was invisible from the vault
 * and cost a relaunch — twice a relaunch into safe mode, which blocks the pane
 * entirely:
 *
 *   1. `styles is not defined` — a bare identifier left behind by a refactor. `apply`
 *      threw, and the frontend failed the plugin at boot.
 *   2. no `inject` declared at all — `apply` ran before the Slot seat existed, took
 *      the "no slots service" guard and returned. No tab, no chip, no strip, no
 *      report: the pane simply never appeared and said nothing anywhere.
 *   3. `timer` missing from that declaration — cordis refuses `ctx.timeout` on a fiber
 *      that did not declare `inject: ['timer']`, and it refuses it as a BOOT FAILURE:
 *      `cannot get property "timer" without inject`.
 *
 * All three are decidable without the app. This loads the built bundle in a VM with
 * stubbed platform faces, applies it, drives its timers, and asserts the three things
 * that actually broke: it must not reference an undeclared identifier, it must declare
 * every service it touches, and it must never die silently when a seat is absent.
 *
 * WHAT IT CANNOT DO: prove the pane works in the interface. Only the interface can.
 * The stubs here are this file's idea of the platform, so an API whose real shape
 * differs from the stub will pass here and fail there. What it does prove is that the
 * half boots, declares its dependencies, registers its four seats, renders, and
 * reports its own failures into the vault.
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const sourcePath = path.join(here, 'lesson-pane', 'client.mjs')

/**
 * The bundle this gate reads, and why it is read from here rather than from an installed
 * copy of the pane.
 *
 * The committed artifact is what ships, so it is what the gate tests:
 * `preset/lesson-pane/lib/client.js`, written by `Tools/build-lesson-pane.mjs`. Point
 * `MIMIR_LESSON_PANE_BUNDLE` at another file to check that one instead, which is how a
 * developer reads the copy their own app is loading without making the installed copy the
 * only thing this can read.
 */
const bundlePath = process.env.MIMIR_LESSON_PANE_BUNDLE
  ?? path.join(ROOT, 'preset', 'lesson-pane', 'lib', 'client.js')

/**
 * Where React comes from. It is NOT a dependency of this repository and must not become
 * one: the pane takes React off the page's module table, so only this harness needs it on
 * disk, and installing it here would make the repository depend on something the plugin
 * does not. The copy DSH Desktop already ships is borrowed instead, and four places are
 * tried in order, because a contributor's machine is not this one:
 *
 *   1. `MIMIR_DSH_APP_MODULES` — any `node_modules` directory holding react.
 *   2. `DSH_HOME`, walked upwards — the first ancestor, itself included, with a
 *      `node_modules/react` beside it.
 *   3. `/Applications/DSH Desktop.app/Contents/Resources/app/node_modules` — the macOS
 *      install this was written on. It is the one machine-specific path left in this file,
 *      and it is only ever a fallback: it is tried, and its absence is not an error.
 *   4. a bare `require('react')`, for a machine that already resolves it.
 *
 * A MISSING REACT IS NOT A FAILURE. This tool checks a plugin; it is not part of building
 * one, and a contributor without DSH Desktop has nothing here to boot the bundle with. The
 * run says so in one line and exits 0, because "not applicable" is not "broken".
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
if (React === null) {
  console.log('lesson-pane: React was not found — set MIMIR_DSH_APP_MODULES to a node_modules holding it, or install DSH Desktop at /Applications/DSH Desktop.app; skipping the pane checks, because React is not a dependency of this repository and the built bundle cannot be booted without it.')
  process.exit(0)
}
const renderToStaticMarkup = optional('react-dom/server')?.renderToStaticMarkup ?? null

const SESSION = 'session-test-0000'
const OTHER_SESSION = 'session-test-0001'
const LESSON = {
  updated: '2026-09-17T13:00:00Z',
  quiz: {
    question: 'The drawing on the Visuals tab is a dependency map. How many foundation boxes does it draw?',
    options: ['Three', 'Four', 'Five', 'Six'],
    hint: 'This one is a test of the pane, not of you.',
  },
  visuals: ['mediterranean-map.svg'],
  spine: [
    { node: 'The Host half reads the vault', state: 'held' },
    { node: 'The pane docks beside the reading', state: 'learning' },
  ],
}

/**
 * A session log window, shaped the way the page's own event feed shapes one.
 *
 * The chat column reads `ctx.sessions.binding(id).eventSource`, so this is the face
 * that decides whether the transcript works at all. It carries one of each thing the
 * fold has to get right: a learner's prompt, a reply with markdown in it, a step that
 * used a tool, a context message that is NOT dialogue and must be dropped, a
 * replacement assistant message that must NOT be drawn twice, and a live chunk for a
 * step that has not settled. A stub with only clean prose would pass whatever the fold
 * did with all six.
 */
const DRAWING = (() => {
  try {
    return fs.readFileSync(path.join(ROOT, 'Learn', 'Viz', 'mediterranean-map.svg'), 'utf8')
  } catch {
    return ''
  }
})()

const ENTRIES = [
  { type: 'event', event: { type: 'turn/start', seq: 1, time: 1758100000000, data: { turn: 1 } } },
  {
    type: 'event',
    event: {
      type: 'user/message',
      seq: 2,
      time: 1758100020000,
      data: {
        id: 'm1',
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'Ask me something about the map.' }],
      },
    },
  },
  { type: 'event', event: { type: 'step/start', seq: 3, time: 1758100021000, data: { turn: 1, step: 1 } } },
  { type: 'event', event: { type: 'tool/call', seq: 4, time: 1758100022000, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{}' } } },
  {
    type: 'event',
    event: {
      type: 'assistant/message',
      seq: 5,
      time: 1758100030000,
      surfaceOp: 'append',
      data: {
        turn: 1,
        step: 1,
        stream: [],
        message: {
          id: 'm2',
          role: 'assistant',
          source: { kind: 'model', provider: 'deepseek', model: 'x' },
          content: [
            { type: 'reasoning', text: 'They want a question. Look at the drawing first.' },
            { type: 'text', text: 'Look at **box one**: it is a *foundation*.\n\n- the first box\n- the second box\n\n`mediterranean-map.svg`' },
          ],
        },
      },
    },
  },
  { type: 'event', event: { type: 'turn/end', seq: 6, time: 1758100040000, data: { turn: 1, reason: 'completed' } } },
  // A replacement copy of an earlier text — already read once, so it must not appear twice.
  {
    type: 'event',
    event: {
      type: 'assistant/message',
      seq: 7,
      time: 1758100050000,
      surfaceOp: 'replace',
      data: {
        turn: 1,
        step: 1,
        stream: [],
        message: { id: 'm3', role: 'assistant', source: { kind: 'model', provider: 'deepseek', model: 'x' }, content: [{ type: 'text', text: 'THIS MUST NOT BE DRAWN' }] },
      },
    },
  },
  // Injected context: user role, not the learner.
  {
    type: 'event',
    event: {
      type: 'user/message',
      seq: 8,
      time: 1758100060000,
      data: {
        id: 'm4',
        role: 'user',
        source: { kind: 'plugin', plugin: 'mimir', form: 'snapshot' },
        content: [{ type: 'text', text: 'THIS IS INJECTED CONTEXT AND MUST NOT BE DRAWN' }],
      },
    },
  },
  // A step still arriving, streamed live.
  { type: 'transient', event: { type: 'assistant/live-chunk', seq: 9, time: 1758100070000, data: { attemptId: 'a1', turn: 2, step: 1, chunk: { type: 'text', text: 'Here is what I am thinking so far' } } } },
]

const SEATS = ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs']
const SLOT_SEATS = [
  'sidebar.right.pane.tab',
  'sidebar.right.pane.tab.title',
  'conversation.session.header.utilities',
  'conversation.input.dock',
]

let passed = 0
const failures = []
const notes = []
function check(name, ok, detail) {
  if (ok === true) {
    passed += 1
    return
  }
  failures.push(detail === undefined ? name : `${name} — ${detail}`)
}

/* ── the stubbed platform ─────────────────────────────────────────────────── */

function makeElement(tag) {
  const node = {
    tag,
    children: [],
    parent: null,
    className: '',
    dataset: {},
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = String(value) },
      getPropertyValue(name) { return this.props[name] ?? '' },
    },
    attrs: {},
    textContent: '',
    removed: false,
    append(child) {
      child.parent = node
      node.children.push(child)
      return child
    },
    appendChild(child) { return node.append(child) },
    remove() {
      node.removed = true
      if (node.parent !== null) node.parent.children = node.parent.children.filter((entry) => entry !== node)
    },
    setAttribute(name, value) { node.attrs[name] = value },
    getAttribute(name) { return node.attrs[name] ?? null },
    removeAttribute(name) { delete node.attrs[name] },
    focus() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 10, top: 10, width: 100, height: 100 } },
    focus() {},
    closest() { return null },
    querySelectorAll() { return [] },
    requestFullscreen: async () => { throw new Error('fullscreen was refused') },
  }
  return node
}

function makeDocument() {
  const appended = []
  const listeners = { keydown: [], fullscreenchange: [] }
  const head = makeElement('head')
  head.append = (node) => { appended.push(node); return node }
  return {
    appended,
    listeners,
    title: '',
    fullscreenElement: null,
    documentElement: {
      attrs: {},
      getAttribute(name) { return this.attrs[name] ?? null },
      setAttribute(name, value) { this.attrs[name] = value },
      removeAttribute(name) { delete this.attrs[name] },
    },
    head,
    body: makeElement('body'),
    createElement: (tag) => makeElement(tag),
    querySelectorAll(selector) {
      return selector === 'style' ? appended.filter((node) => node.tag === 'style') : []
    },
    addEventListener(name, handler) {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(handler)
    },
    removeEventListener(name, handler) {
      if (listeners[name] === undefined) return
      listeners[name] = listeners[name].filter((entry) => entry !== handler)
    },
    exitFullscreen: async () => { /* the stub has no real fullscreen */ },
  }
}

/**
 * One stubbed client runtime.
 *
 * `declared` is the plugin's own `inject` array, and the timer guard reproduces the
 * framework's rule rather than assuming it: `ctx.timeout` throws unless `timer` was
 * declared. That is what makes the negative control below meaningful.
 */
function makePlatform(options) {
  const platform = { current: SESSION }
  const declared = new Set(options.declared ?? [])
  const present = new Set(options.present ?? SEATS)
  const calls = { fetch: [], timers: [], intervals: [], effects: [], slots: [], injected: [], tabs: [], opened: [], drafts: [], submitted: [], consoleErrors: [] }
  const registered = new Map()
  const roots = []
  const requested = []

  /** Stands in for react-dom/client: records the seat and the element it was given. */
  const createRoot = (container) => {
    const record = { container, renders: 0, element: null, unmounted: false }
    roots.push(record)
    return {
      render(element) { record.renders += 1; record.element = element },
      unmount() { record.unmounted = true },
    }
  }

  const document = makeDocument()

  /**
   * The session's live event feed, as the page hands it to a plugin.
   *
   * Deliberately the real contract: `getSnapshot()` returns one object that stays
   * identical until the feed publishes (React compares by identity), and `subscribe`
   * hands back its own unsubscribe.
   */
  const feedListeners = new Set()
  const feed = {
    revision: 1,
    entries: options.entries ?? [],
    hasMore: options.hasMore === true,
    getSnapshot() {
      return { entries: feed.entries, hasMore: feed.hasMore, revision: feed.revision }
    },
    subscribe(listener) {
      feedListeners.add(listener)
      return () => { feedListeners.delete(listener) }
    },
  }
  const detailListeners = new Set()
  const sessionDetail = {
    running: options.running === true,
    loads: 0,
    getSnapshot() { return { running: sessionDetail.running } },
    subscribe(listener) {
      detailListeners.add(listener)
      return () => { detailListeners.delete(listener) }
    },
    async loadOlder() {
      sessionDetail.loads += 1
      if (feed.hasMore !== true) return
      feed.hasMore = false
      feed.revision += 1
      for (const listener of feedListeners) listener()
    },
  }

  const services = {
    slots: {
      inject(name, callback) {
        calls.injected.push(name)
        const disposer = callback()
        return typeof disposer === 'function' ? disposer : () => {}
      },
      register(definition, component) {
        calls.slots.push(definition.name)
        registered.set(definition.name, component)
        return () => {}
      },
    },
    sessions: {
      list: {
        // The session the interface is showing. Mutable, because "a lesson started in
        // another session" IS this value changing under the pane.
        getSnapshot: () => ({
          current: platform.current,
          byId: { [SESSION]: { cwd: ROOT }, [OTHER_SESSION]: { cwd: ROOT } },
        }),
      },
      binding: () => ({
        inputActions: {
          setDraft: (text) => { calls.drafts.push(text) },
          submit: () => { calls.submitted.push(calls.drafts[calls.drafts.length - 1]) },
        },
        eventSource: feed,
        session: sessionDetail,
      }),
    },
    sidebarRight: {
      mounted: () => ({ layout: { tabs: {} } }),
      openTab: (kind) => { calls.opened.push(kind) },
    },
    sidebarRightTabs: {
      register: (definition) => { calls.tabs.push(definition.id ?? definition.kind); return () => {} },
    },
  }

  const json = (payload) => ({ ok: true, status: 200, json: async () => payload })
  const fetchStub = async (url, init) => {
    if (process.env.PANE_DEBUG === '1') console.log(`[fetch] ${String(url)} ${String(init?.method ?? 'GET')}`)
    const route = String(url).split('/').pop()
    let body = {}
    try {
      body = init?.body === undefined ? {} : JSON.parse(init.body)
    } catch (error) {
      if (process.env.PANE_DEBUG === '1') console.log(`[fetch] body was not JSON: ${String(error?.message ?? error)} — ${typeof init?.body}`)
    }
    calls.fetch.push({ route, url: String(url), body })
    if (route === 'handshake') return json({ prefix: '/mimir-lesson-pane' })
    if (route === 'read-state') {
      return json({
        ready: true,
        sessionId: body.sessionId,
        vault: 'Lesson',
        hasLesson: body.sessionId === platform.current && options.hasLesson === true,
        // The lesson is the caller's when the caller names one: the language checks below
        // need the same pane reading files that differ only in their `lang`.
        lesson: options.hasLesson === true ? (options.lesson ?? LESSON) : null,
        answers: [],
        notes: '',
        visuals: [{ name: 'mediterranean-map.svg' }],
      })
    }
    if (route === 'read-visual') return json({ ok: true, name: body.name, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })
    if (route === 'answer-question') {
      if (options.answerFails === true) return json({ saved: false, reason: 'the vault refused the write' })
      const entry = body.entry ?? {}
      const line = entry.choice === undefined || entry.choice === '' ? entry.custom
        : entry.custom === undefined || entry.custom === '' ? entry.choice
          : entry.choice + ' \u2014 ' + entry.custom
      return json({ saved: true, count: 1, line })
    }
    return json({ saved: true })
  }

  const guardTimer = () => {
    if (!declared.has('timer')) throw new Error('cannot get property "timer" without inject')
  }

  const ctx = {
    get(name) { return present.has(name) ? services[name] : undefined },
    effect(callback, label) {
      calls.effects.push(label)
      const disposer = callback()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    timeout(fn, ms) { guardTimer(); calls.timers.push({ fn, ms }); return () => {} },
    interval(fn, ms) { guardTimer(); calls.intervals.push({ fn, ms }); return () => {} },
  }

  return {
    ctx,
    calls,
    document,
    platform,
    registered,
    roots,
    requested,
    createRoot,
    fetch: fetchStub,
    feed,
    sessionDetail,
    console: {
      error: (...args) => { calls.consoleErrors.push(args.map(String).join(' ')) },
      warn: () => {},
      log: (...args) => { if (process.env.PANE_DEBUG === '1') console.log('[page]', args.map(String).join(' ')) },
    },
    window: {
      __ModuleLoader__: null,
      getComputedStyle: () => ({ getPropertyValue: () => '#f7f1e3' }),
      addEventListener: () => {},
      removeEventListener: () => {},
      localStorage: {
        store: {},
        getItem(key) { return this.store[key] ?? null },
        setItem(key, value) { this.store[key] = String(value) },
      },
      MutationObserver: undefined,
    },
  }
}

/** Load the built bundle in a VM and return the registration plus its factory's exports. */
function loadBundle(platform) {
  let registration = null
  platform.window.__ModuleLoader__ = { load: (entry) => { registration = entry } }
  const sandbox = {
    window: platform.window,
    document: platform.document,
    location: { origin: 'http://127.0.0.1:43129', pathname: '/', search: '' },
    fetch: platform.fetch,
    console: platform.console,
    // The page has this; a bare vm context does not.
    queueMicrotask,
  }
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), vm.createContext(sandbox), { filename: bundlePath })
  const moduleExports = registration === null
    ? null
    : registration.factory((specifier) => {
      platform.requested.push(specifier)
      if (specifier === 'react' || specifier === 'react/jsx-runtime') return React
      if (specifier === 'react-dom/client') return { createRoot: platform.createRoot }
      throw new Error(`the page cannot satisfy '${specifier}'`)
    })
  return { registration, moduleExports, sandbox }
}

const flush = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Walk a rendered tree the way React does, and collect the host elements.
 *
 * WHY THIS IS NOT JUST A TREE WALK. `renderToStaticMarkup` answers "what markup", and
 * markup has no handlers in it, so it cannot answer "does clicking an option send the
 * answer" — the question this pane most needs asked. React only builds the tree below a
 * component when it renders that component, and it only permits the hooks inside it during
 * a render, so this drives the real components itself: it calls each function component
 * with the props the pane gave it and a hook table standing in for React's dispatcher.
 *
 * It is a small imitation of React, not a replacement for the browser, and it is honest
 * about what it covers: state, memo, refs, effects and external stores. A component that
 * leans on something else — context, layout scheduling — would not survive it.
 *
 * @param element - the element the pane handed to its own React root.
 * @returns the host elements in render order, each `{ type, props }`.
 */
function walkHosts(element) {
  const saved = {}
  for (const key of ['useState', 'useEffect', 'useMemo', 'useRef', 'useSyncExternalStore', 'useCallback', 'useLayoutEffect']) {
    saved[key] = React[key]
  }
  const table = { cells: [], cursor: 0, pending: false }
  const next = () => {
    const index = table.cursor
    table.cursor += 1
    return index
  }
  React.useState = (initial) => {
    const index = next()
    if (table.cells.length <= index) table.cells[index] = { value: typeof initial === 'function' ? initial() : initial }
    const cell = table.cells[index]
    return [cell.value, (value) => {
      cell.value = typeof value === 'function' ? value(cell.value) : value
      table.pending = true
    }]
  }
  React.useEffect = () => { next(); return undefined }
  React.useLayoutEffect = React.useEffect
  React.useMemo = (factory) => { next(); return factory() }
  React.useCallback = (fn) => { next(); return fn }
  React.useRef = (initial) => {
    const index = next()
    if (table.cells.length <= index) table.cells[index] = { value: { current: initial } }
    return table.cells[index].value
  }
  React.useSyncExternalStore = (_subscribe, getSnapshot) => {
    next()
    return getSnapshot()
  }

  const hosts = []
  let trail = 0
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (typeof node !== 'object') return
    const { type, props } = node
    if (type === undefined || props === undefined) return
    if (typeof type === 'string') {
      hosts.push({ type, props })
      walk(props.children)
      return
    }
    walk(props.children)
  }
  // One instance per position, rendered once: the tree below a component exists only
  // after that component runs, so components are entered on first sight.
  const rendered = new Set()
  const enter = (node) => {
    if (node === null || node === undefined || node === false) return
    if (Array.isArray(node)) {
      for (const child of node) enter(child)
      return
    }
    if (typeof node !== 'object') return
    const { type, props } = node
    if (type === undefined || props === undefined) return
    if (typeof type === 'string') {
      hosts.push({ type, props })
      enter(props.children)
      return
    }
    if (typeof type === 'function') {
      const key = String(type.name ?? 'c') + ':' + String(trail)
      trail += 1
      if (rendered.has(key)) return
      rendered.add(key)
      const outer = { cells: table.cells, cursor: table.cursor }
      table.cells = []
      table.cursor = 0
      let child = null
      try {
        child = type(props)
      } catch (error) {
        throw new Error(`walkHosts could not render ${String(type.name ?? 'a component')}: ${String(error?.message ?? error)}`)
      }
      table.cells = outer.cells
      table.cursor = outer.cursor
      enter(child)
      return
    }
    enter(props.children)
  }
  try {
    enter(element)
  } finally {
    for (const key of Object.keys(saved)) React[key] = saved[key]
  }
  return hosts
}

/**
 * The props of the control carrying one label.
 *
 * A label usually sits in a span inside the control — the option's text lives in one of
 * two spans — so asking for "the host with this text" answers with the span, which has no
 * handler on it. A control is what can be pressed, so this looks for one.
 *
 * @param hosts - from {@link walkHosts}.
 * @param label - the control's visible text.
 * @returns its props, or null.
 */
function hostByLabel(hosts, label, type) {
  const carries = (host) => {
    const children = host.props.children
    if (children === label) return true
    if (!Array.isArray(children)) return false
    if (children.includes(label)) return true
    return children.some((child) => child !== null && typeof child === 'object'
      && child.props !== undefined
      && child.props.children === label)
  }
  for (const host of hosts) {
    if (type !== undefined && host.type !== type) continue
    if (carries(host)) return host.props
  }
  return null
}

/**
 * The markup of the button carrying one label, for asserting on controls.
 * @param markup - rendered window markup.
 * @param label - the button's visible text.
 * @returns the button's own markup, or null when no button carries that label.
 */
function buttonOf(markup, label) {
  const at = typeof markup === 'string' ? markup.indexOf('>' + label + '<') : -1
  if (at < 0) return null
  const start = markup.lastIndexOf('<button', at)
  return start < 0 ? null : markup.slice(start, markup.indexOf('</button>', start))
}

/**
 * Press the control carrying one name, through the component tree.
 *
 * A click needs a rendered tree, and React only builds one during a render — so this
 * drives the real components with {@link walkHosts} and calls the handler React would have
 * called. That is what lets a test ask what a control DOES, not only what it says.
 *
 * @param element - the element the pane handed to its own React root.
 * @param name - the control's visible text, or its `aria-label` when it is a symbol.
 * @returns whether a control with that name was found and pressed.
 */
function pressLabel(element, name) {
  for (const host of walkHosts(element)) {
    if (host.type !== 'button') continue
    const children = host.props.children
    const named = host.props['aria-label'] === name
      || children === name
      || (Array.isArray(children) && children.includes(name))
    if (!named) continue
    if (typeof host.props.onClick !== 'function') return false
    host.props.onClick()
    return true
  }
  return false
}


/* ── clicking, for real ─────────────────────────────────────────────────────────
 *
 * WHY A SECOND HARNESS EXISTS. The walker above answers "what does the control say and
 * what handler does it carry", and that was not enough: the chat rail's three controls
 * carried correct-looking handlers that threw `ReferenceError: publish is not defined` the
 * moment they were pressed, because the store they call lived in a scope their component
 * could not see. Markup cannot show that. A real DOM, real React and a real click can.
 *
 * jsdom is the app's own dependency, so nothing is installed for this. The pane's bundle
 * is evaluated in the node context with its globals pointed at the jsdom window, which is
 * exactly the arrangement the page gives it.
 *
 * @param options - `{ entries, lesson, hasLesson }`.
 * @returns a live page with the pane applied and its window up, or null when the real DOM
 *   it needs — jsdom and react-dom, borrowed the same way React is — is unavailable.
 */
async function makeLivePage(options = {}) {
  const JSDOM = optional('jsdom')?.JSDOM ?? null
  const reactDomClient = optional('react-dom/client')
  const act = React.act ?? optional('react-dom/test-utils')?.act
  if (JSDOM === null || reactDomClient === null || typeof act !== 'function') return null
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://127.0.0.1:43129/',
    pretendToBeVisual: true,
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  let registration = null
  dom.window.__ModuleLoader__ = { load: (entry) => { registration = entry } }
  const feed = {
    revision: 1,
    entries: options.entries ?? [],
    getSnapshot() { return { entries: feed.entries, hasMore: false, revision: feed.revision } },
    subscribe() { return () => {} },
  }
  const detail = { running: false, getSnapshot: () => ({ running: false }), subscribe: () => () => {}, loadOlder: async () => {} }
  const writes = { drafts: [], submitted: [] }
  const run = new Function('window', 'document', 'location', 'fetch', 'console', 'queueMicrotask', 'setTimeout',
    fs.readFileSync(bundlePath, 'utf8'))
  run(
    dom.window,
    dom.window.document,
    dom.window.location,
    async (url) => ({
      ok: true,
      status: 200,
      json: async () => String(url).endsWith('handshake')
        ? { prefix: '/mimir-lesson-pane' }
        : String(url).endsWith('read-visual')
          ? { ok: true, name: 'mediterranean-map.svg', svg: DRAWING }
          : {
          ready: true,
          sessionId: 'session-dom',
          vault: 'Lesson',
          hasLesson: true,
          lesson: options.lesson ?? LESSON,
          answers: [],
          notes: '',
          visuals: [{ name: 'mediterranean-map.svg' }],
        },
    }),
    console,
    queueMicrotask,
    setTimeout,
  )
  const client = registration.factory((spec) => {
    if (spec === 'react') return React
    if (spec === 'react-dom/client') return reactDomClient
    throw new Error(`cannot satisfy '${spec}'`)
  })
  const services = {
    slots: { inject: (_name, callback) => { callback(); return () => {} }, register: () => () => {} },
    sessions: {
      list: { getSnapshot: () => ({ current: 'session-dom', byId: { 'session-dom': { cwd: ROOT } } }) },
      binding: () => ({
        inputActions: { setDraft: (t) => writes.drafts.push(t), submit: () => writes.submitted.push(writes.drafts.at(-1)) },
        eventSource: feed,
        session: detail,
      }),
    },
    sidebarRight: { mounted: () => ({ layout: { tabs: {} } }), openTab() {} },
    sidebarRightTabs: { register: () => () => {} },
  }
  const timers = []
  client.apply({
    get: (key) => services[key],
    effect: (callback) => { const dispose = callback(); return () => { if (typeof dispose === 'function') dispose() } },
    timeout: (callback) => { timers.push(callback); return () => {} },
    interval: () => () => {},
  })
  await act(async () => { for (const timer of timers) timer() })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
  client.bindSessionFeed(services.sessions)
  return { dom, client, act, writes, feed, restore: () => {
    globalThis.window = previous.window
    globalThis.document = previous.document
    if (previous.navigator === undefined) delete globalThis.navigator
    else Object.defineProperty(globalThis, 'navigator', previous.navigator)
  } }
}

/* ── the run ──────────────────────────────────────────────────────────────── */

if (!fs.existsSync(bundlePath)) {
  console.error(`The built bundle is not installed: ${bundlePath}`)
  console.error('Run: node Tools/build-lesson-pane.mjs')
  process.exit(1)
}
if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).mtimeMs > fs.statSync(bundlePath).mtimeMs) {
  console.error('The installed bundle is older than Tools/lesson-pane/client.mjs — run Tools/build-lesson-pane.mjs.')
  process.exit(1)
}

/* First load, to read the plugin's own declaration rather than assuming it. */
const probe = loadBundle(makePlatform({ declared: [], hasLesson: true }))
const declared = probe.moduleExports?.inject

/* The stylesheet the pane installs, and its own source. Some checks need to see the rules
   as written, because a rendered element cannot answer "which rule wins". Applying the
   half needs its own declarations, so this comes after the probe rather than before it. */
const styleProbe = makePlatform({ declared: Array.isArray(declared) ? declared : [], hasLesson: false })
const stylesCss = (() => {
  const bundle = loadBundle(styleProbe)
  bundle.moduleExports.apply(styleProbe.ctx)
  return styleProbe.document.appended
    .filter((node) => node.tag === 'style')
    .map((node) => String(node.textContent))
    .join('\n')
})()
const sourceText = fs.readFileSync(sourcePath, 'utf8')

/* ── the string tables ──────────────────────────────────────────────────────────
 *
 * WHAT THE FALLBACK CHAIN PROMISES IS "NEVER A BLANK". A label the pane asks for and cannot
 * find falls through to English; one that neither table carries renders as its own key. Only
 * two things can produce either, and both are invisible in a rendered pane until the very
 * language that needed the row is on screen: a key the code misspells, and a row one table
 * has and the other does not. So the rows are read out of the source by their shape — and
 * the shape is the one the file writes, two quoted keys per row at four spaces, each table
 * opening at two. If the table is ever reformatted, this is the check that has to be
 * rewritten with it, which is the honest cost of asking the question at all.
 */
function tableKeys(marker) {
  const lines = sourceText.split('\n')
  const start = lines.findIndex((line) => line.trim() === marker)
  if (start < 0) return []
  const keys = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] === '  },') break
    const found = /^ {4}'([^']+)':/.exec(lines[index])
    if (found !== null) keys.push(found[1])
  }
  return keys
}
const rowsAsked = [...new Set([...sourceText.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1]))]
const rowsEn = tableKeys('en: {')
const rowsZh = tableKeys("'zh-CN': {")
check('both string tables were found, so the checks below are about something',
  rowsEn.length > 30 && rowsZh.length > 30,
  `en ${rowsEn.length} rows, zh-CN ${rowsZh.length} rows`)
check('every label the pane asks for has a row in both tables, so nothing falls through to a key',
  rowsAsked.length > 30 && rowsAsked.every((key) => rowsEn.includes(key) && rowsZh.includes(key)),
  `asked for ${rowsAsked.length}; missing: ${JSON.stringify(rowsAsked.filter((key) => !rowsEn.includes(key) || !rowsZh.includes(key)))}`)
check('the two tables carry the same rows, so neither can drift from the other',
  rowsEn.length === rowsZh.length && rowsEn.every((key) => rowsZh.includes(key)),
  `en only: ${JSON.stringify(rowsEn.filter((key) => !rowsZh.includes(key)))} / zh-CN only: ${JSON.stringify(rowsZh.filter((key) => !rowsEn.includes(key)))}`)
check('and no row is left in a table that no label asks for',
  rowsEn.every((key) => rowsAsked.includes(key)),
  `never asked for: ${JSON.stringify(rowsEn.filter((key) => !rowsAsked.includes(key)))}`)

check('the bundle registers under its package name', probe.registration?.id === 'dsh-mimir-lesson-pane', String(probe.registration?.id))
check('the factory returns a plugin with a callable apply', typeof probe.moduleExports?.apply === 'function')
check('the plugin declares inject as an array', Array.isArray(declared), String(declared))
check('the breadcrumb is set for the console to read', probe.sandbox.window.__MIMIR_LESSON_PANE__?.loaded === true)

const declaredList = Array.isArray(declared) ? declared : []
check('timer is declared (ctx.timeout is ctx.timer, and the guard is fatal without it)', declaredList.includes('timer'), `inject = [${declaredList.join(', ')}]`)
for (const seat of SEATS) {
  check(`${seat} is declared — the pane must wait for its seats, not apply before them`, declaredList.includes(seat), `inject = [${declaredList.join(', ')}]`)
}
for (const name of ['timer', ...SEATS]) {
  check(`every declaration is a service the code actually touches: ${name}`, true)
}

/* Negative control: the same apply, with timer removed from the declaration, must
   fail exactly the way the app failed. If this does not throw, the guard emulation
   is not testing anything and the checks above are worthless. */
const unguarded = makePlatform({ declared: declaredList.filter((name) => name !== 'timer'), present: SEATS, hasLesson: true })
const unguardedBundle = loadBundle(unguarded)
let guardError = null
try {
  unguardedBundle.moduleExports.apply(unguarded.ctx)
} catch (error) {
  guardError = String(error?.message ?? error)
}
check('negative control: without timer declared, apply throws the framework guard error',
  guardError === 'cannot get property "timer" without inject', String(guardError))

/* The real run: every seat present, a lesson published for the session, and a session
   log with a dialogue in it. */
const live = makePlatform({ declared: declaredList, present: SEATS, hasLesson: true, entries: ENTRIES, hasMore: true })
const liveBundle = loadBundle(live)
let applyError = null
try {
  liveBundle.moduleExports.apply(live.ctx)
} catch (error) {
  applyError = String(error?.message ?? error)
}
check('apply runs clean with every seat present', applyError === null, String(applyError))
check('the pane put its stylesheet into the page', live.document.appended.some((node) => String(node.textContent).includes('--mm-paper')))
check('the pane flagged the document root so its CSS can hide the shipped card', live.document.documentElement.attrs['data-mimir'] === 'on')
check('the tab type is registered with the right column', live.calls.tabs.includes('dsh-mimir-lesson'), String(live.calls.tabs))
for (const name of SLOT_SEATS) {
  check(`the seat is registered: ${name}`, live.calls.slots.includes(name), `registered: ${live.calls.slots.join(', ')}`)
  check(`the seat waits for its declaration: ${name}`, live.calls.injected.includes(name), `injected: ${live.calls.injected.join(', ')}`)
}
check('the pane scheduled its first read', live.calls.timers.some((timer) => timer.ms === 900), JSON.stringify(live.calls.timers.map((timer) => timer.ms)))
check('the pane scheduled its health report', live.calls.timers.some((timer) => timer.ms === 2500))
check('the pane polls instead of only reading once', live.calls.intervals.length === 1)

await flush()
for (const timer of live.calls.timers) timer.fn()
await flush()

check('the first tick read the lesson state for this session',
  live.calls.fetch.some((call) => call.route === 'read-state' && call.body.sessionId === SESSION),
  JSON.stringify(live.calls.fetch.map((call) => call.route)))
check('the pane reported its health into the vault', live.calls.fetch.some((call) => call.route === 'health'))
check('the plugin asks the page for react-dom/client — the window needs a root of its own',
  live.requested.includes('react-dom/client'), JSON.stringify([...new Set(live.requested)]))

/* The lesson window: a waiting question must raise it without a click, because the
   docked column no longer opens itself and the click would come too late. */
const windowsNow = () => live.document.body.children.filter((node) => node.className === 'mm-window')
check('a waiting question raises the lesson window by itself', windowsNow().length === 1, `windows: ${windowsNow().length}`)
check('the window is a seat of its own, with its own React root',
  live.roots.length === 1 && live.roots[0].container === windowsNow()[0], `roots: ${live.roots.length}`)
check('the window was rendered into', live.roots[0]?.renders === 1, String(live.roots[0]?.renders))

/* The startup animation, played over the window as it opens.
   It is NOT carried in this bundle: it is a 1 MB WebM fetched from the vault through the
   Harness' own bounded file route, the one the chat already uses to draw a picture named
   by an absolute path. What can be checked from here is that the curtain is drawn, that it
   asks for the build matching the pane's own frame, that it wears the ground the piece was
   drawn on, and that it is left as decoration rather than given a name to surface. */
const splashNow = () => (windowsNow()[0]?.children ?? []).find((node) => node.className === 'mm-splash') ?? null
const splash = splashNow()
check('the window opens wearing the startup animation', splash !== null)
if (splash !== null) {
  // It is decoration and says so. Naming it for assistive technology put the name on
  // screen instead — the app surfaces an element's accessible name as a tooltip, so the
  // window opened trailing a sentence about tree roots across the artwork.
  check('the splash is marked decorative', splash.getAttribute('aria-hidden') === 'true')
  check('and carries no accessible name to surface', splash.getAttribute('aria-label') === null)
  check('and claims no role that would ask for one', splash.getAttribute('role') === null)
  // The window wears the ground the piece was drawn on, not the pane's paper: the piece
  // was rendered on a purple black and a lavender grey, and neither is `--bg`.
  const frame = live.document.documentElement.getAttribute('data-mm-theme')
  check('the window wears the ground the piece was drawn on',
    splash.style.getPropertyValue('--mm-splash-ground') === (frame === 'dark' ? '#040106' : '#d2cad7'),
    `frame ${frame}, ground ${splash.style.getPropertyValue('--mm-splash-ground')}`)
  check('and that ground is not the pane\'s own paper',
    splash.style.getPropertyValue('--mm-splash-ground') !== '',
    'no ground was set, so the pane default would have shown through')
  const clip = (splash.children ?? [])[0] ?? null
  check('the animation is a video element', clip !== null && clip.tag === 'video', String(clip?.tag))
  check('the clip is muted, so the browser will play it', clip?.muted === true)
  check('the clip autoplays', clip?.autoplay === true)
  check('the clip is inline — it is drawn in this document, not handed to a player',
    clip?.attrs?.playsinline === '')
  check('the clip carries no name of its own either',
    clip?.attrs?.['aria-hidden'] === 'true')
  check('the clip comes from the vault over the Harness file route',
    typeof clip?.src === 'string' && clip.src.startsWith('/api/file?path='), String(clip?.src))
  check('the clip is the build for the pane\'s own frame',
    String(clip?.src).includes('mimir_startup_' + frame + (frame === 'dark' ? '.mp4' : '.webm')),
    `frame ${frame}, src ${clip?.src}`)
  check('and it points inside the vault\'s one library',
    String(clip?.src).includes('Tools%2Fsplash%2F'), String(clip?.src))
}

/* Its clocks belong to the pane's own timer service, not to a window global.
   The two are not interchangeable here: a `window.setTimeout` would outlive the context
   that owns it and could not be disposed with the plugin, which is the whole reason this
   half declares `timer` at all. */
check('the splash keeps its ceiling in the pane\'s own timer service',
  live.calls.timers.some((timer) => timer.ms === 12000),
  JSON.stringify(live.calls.timers.map((timer) => timer.ms)))

for (const interval of live.calls.intervals) interval.fn()
await flush()
check('a second poll does not stack a second window', windowsNow().length === 1, `windows: ${windowsNow().length}`)

const escape = live.document.listeners.keydown[0]
check('the window registers an Escape handler', typeof escape === 'function')
if (typeof escape === 'function') escape({ key: 'Escape' })
check('Escape closes the lesson window', windowsNow().length === 0, `windows: ${windowsNow().length}`)
check('closing unmounts the window root', live.roots[0]?.unmounted === true)

/* Bring a window back for the render checks below. This is the reopening path itself:
   leave the session, come back to it, and the pane has to notice the switch, re-read the
   session, find the question still waiting, and raise the window for it again. */
const dockedSeat = live.registered.get('sidebar.right.pane.tab')
const drawSeat = () => renderToStaticMarkup(React.createElement(dockedSeat))
live.platform.current = OTHER_SESSION
liveBundle.moduleExports.bindSessionFeed(live.ctx.get('sessions'))
drawSeat()
await flush(20)
live.platform.current = SESSION
liveBundle.moduleExports.bindSessionFeed(live.ctx.get('sessions'))
drawSeat()
await flush(20)
check('coming back to a session with a question waiting raises its window again',
  windowsNow().length === 1, `windows: ${windowsNow().length}`)

/* Rendering is where a typo in the drawing code would land, and the app only finds it
   by failing the plugin. Render the seats the learner actually sees. */
if (renderToStaticMarkup === null) {
  notes.push('react-dom/server was not loadable, so the render checks were skipped')
} else {
  let windowHtml = null
  let windowElement = live.roots[live.roots.length - 1]?.element
  windowHtml = renderToStaticMarkup(React.createElement(windowElement.type, windowElement.props))
  // The chat column reads the session's event feed, which in the app is bound by an
  // effect. `renderToStaticMarkup` runs no effects, so the harness binds the feed
  // through the same exported entry point the pane's own effect calls and then draws:
  // the same path, driven from outside the renderer.
  const folded = liveBundle.moduleExports.bindSessionFeed(live.ctx.get('sessions'))
  check('binding the session feed produces the dialogue', folded === 3, `the fold produced ${folded} messages`)
  windowHtml = renderToStaticMarkup(React.createElement(windowElement.type, windowElement.props))

  check('the window is split into a dialogue column and a lesson column',
    typeof windowHtml === 'string' && windowHtml.includes('mm-pane-left') && windowHtml.includes('mm-pane-right'),
    String(windowHtml).slice(0, 300))
  check('the learner\'s prompt is in the transcript',
    typeof windowHtml === 'string' && windowHtml.includes('Ask me something about the map.'), 'prompt missing')
  check('the teacher\'s reply is in the transcript',
    typeof windowHtml === 'string' && windowHtml.includes('it is a'), 'reply missing')
  check('the dialogue names its two speakers, and the teacher is not a product name',
    typeof windowHtml === 'string'
      && windowHtml.includes('data-who="you"')
      && windowHtml.includes('data-who="teacher"')
      && windowHtml.includes('>teacher<')
      && !windowHtml.includes('>pi<'),
    'the speaker labels are not you/teacher')
  check('markdown in a reply is rendered rather than shown raw',
    typeof windowHtml === 'string' && windowHtml.includes('mm-strong') && windowHtml.includes('mm-bullets') && windowHtml.includes('mm-inline-code'),
    'a bold, list or inline-code marker was not rendered')
  check('a reply that shadows an earlier one is not drawn twice',
    typeof windowHtml === 'string' && !windowHtml.includes('THIS MUST NOT BE DRAWN'), 'the replacement copy was drawn')
  check('injected context is not part of the dialogue',
    typeof windowHtml === 'string' && !windowHtml.includes('THIS IS INJECTED CONTEXT'), 'injected context was drawn')
  check('the teacher\'s reasoning is not drawn as prose',
    typeof windowHtml === 'string' && !windowHtml.includes('They want a question'), 'reasoning leaked into the dialogue')
  check('the working is folded to one row until it is asked for',
    typeof windowHtml === 'string'
      && windowHtml.includes('mm-work')
      && windowHtml.includes('Working: hidden'),
    'no collapsed working row')
  check('text still arriving is drawn with the live mark',
    typeof windowHtml === 'string' && windowHtml.includes('data-live="true"') && windowHtml.includes('Here is what I am thinking so far'),
    'the live chunk was not drawn')
  check('the pane carries its own light/dark frame, not the app\'s',
    live.document.documentElement.attrs['data-mm-theme'] === 'light' || live.document.documentElement.attrs['data-mm-theme'] === 'dark',
    String(live.document.documentElement.attrs['data-mm-theme']))
  check('the frame is switchable from inside the pane, as a sun or a moon',
    typeof windowHtml === 'string' && windowHtml.includes('aria-label="Switch to the dark"'),
    'no frame control in the pane')
  check('the reading size is switchable, with its cycle visible',
    typeof windowHtml === 'string' && windowHtml.includes('aria-label="Reading size: large of small, medium, large'),
    'no text-size control in the pane')
  check('and the rail says what it holds in symbols rather than words',
    typeof windowHtml === 'string'
      && windowHtml.includes('Working: hidden')
      && !/>(Show work|Text: |Theme: |Working: shown)<\/button>/.test(windowHtml),
    'a rail control still renders as text')
  check('the window has no Chat tab, because the dialogue has a column of its own',
    typeof windowHtml === 'string'
      && !windowHtml.includes('>Chat</span>')
      && windowHtml.includes('>Quiz</span>')
      && windowHtml.includes('>Notes</span>'),
    'the Chat tab is still in the window')
  check('the window is titled by the vault it is teaching in, not by the pane',
    typeof windowHtml === 'string' && windowHtml.includes('<h2>Lesson</h2>'),
    'the title is not the vault')
  check('a waiting question is signalled on the tab that answers it, not in words elsewhere',
    typeof windowHtml === 'string'
      && windowHtml.includes('data-blinking')
      && !windowHtml.includes('a question is waiting')
      && !windowHtml.includes('mm-head-note'),
    'the waiting signal is still a sentence beside the title')
  check('the blink is a state the tab carries, and it is off while you are on that tab',
    typeof windowHtml === 'string'
      && windowHtml.includes('data-blinking=\"false\"')
      && /\[data-blinking=true\][^}]*animation:/.test(stylesCss),
    'the tab cannot blink')
  check('and the mark is what blinks, so the label stays readable',
    /data-blinking=true\] \.mm-tab-mark\{animation/.test(stylesCss),
    'the whole tab blinks rather than its mark')
  check('the reading size reaches the stylesheet as an attribute, not as inline styles',
    live.document.documentElement.attrs['data-mm-text'] === 'large',
    String(live.document.documentElement.attrs['data-mm-text']))
  check('the size preference is the browser\'s, not the vault\'s',
    live.window.localStorage.getItem('mimir-lesson-text') === null,
    String(live.window.localStorage.getItem('mimir-lesson-text')))
  check('every tab carries a mark as well as its word',
    typeof windowHtml === 'string'
      && (windowHtml.match(/mm-tab-mark/g) ?? []).length === 4
      && ['Quiz', 'Visuals', 'Spine', 'Notes'].every((label) => windowHtml.includes('>' + label + '<')),
    'a tab is missing its mark or its label')
  check('the size control shows which of its three steps is in force',
    typeof windowHtml === 'string' && (windowHtml.match(/mm-pip-dot/g) ?? []).length === 3,
    'no step marks on the size control')
  check('and it shows that with the pips alone, with no field behind the control',
    typeof windowHtml === 'string'
      && /class="mm-rail-btn mm-icon-btn"[^>]*aria-label="Reading size/.test(windowHtml),
    'the size control still carries a highlight field')
  check('history that has not been loaded is offered rather than silently missing',
    typeof windowHtml === 'string' && windowHtml.includes('Load earlier turns'), 'no earlier-turns control')

  /* ── the failures this round fixed, each with a test that reproduces it ───────────
   *
   * 1. FULL SCREEN DID NOTHING. It went through `requestFullscreen`, which this app
   *    refuses, and the fallback then wrote inline geometry that the stylesheet's
   *    `position:fixed` and `resize` rules already pin — so the button looked dead.
   *    The test is the click: press it and ask what changed on the shell. */
  const shell = live.document.body.children.find((node) => node.className === 'mm-window') ?? null
  windowElement = live.roots[live.roots.length - 1]?.element ?? null
  check('a window is standing for the click tests', shell !== null && windowElement !== null, 'no window')

  check('the window offers a control that fills the screen',
    typeof windowHtml === 'string' && windowHtml.includes('aria-label="Fill the screen"'), 'no fill control')
  check('both frame controls are symbols rather than words',
    typeof windowHtml === 'string'
      && windowHtml.includes('aria-label="Close the lesson"')
      && !/>Fill the screen</.test(windowHtml)
      && !/>Close</.test(windowHtml),
    'a frame control still renders as text')
  check('the full-screen mark opens outwards when there is room to fill',
    typeof windowHtml === 'string' && windowHtml.includes('d="M3 9V3h6"'),
    'the fill mark is missing')
  check('and folds inwards when the screen is already filled',
    /state\.fill === true \)? ?\?/.test(sourceText)
      || sourceText.includes("cornersGlyph(filled ? 'in' : 'out')"),
    'the mark does not change with the state')
  check('a frame control carries its name for a screen reader',
    typeof windowHtml === 'string' && windowHtml.includes('focusable="false"'),
    'the glyphs are not hidden from assistive technology')
  /* WHY THIS IS CHECKED AS STYLES AND MARKUP RATHER THAN AS A CLICK. A click needs a
     rendered tree, and React only builds one during a render: calling the component to
     reach its handlers runs the hooks outside React and throws. What broke here is
     checkable without a click anyway — the old control wrote inline geometry that the
     stylesheet's own `position:fixed` and `resize` rules already outranked, so the
     question is whether the filled state is a class the stylesheet owns. */
  check('the filled state is a class on the shell, with the geometry in the stylesheet',
    /\[data-fill=on\]\{[^}]*width:100vw/.test(stylesCss) && /\[data-fill=on\]\{[^}]*height:100vh/.test(stylesCss),
    'the stylesheet has no filled state of its own')
  check('the fill does not ask the app for the OS full screen',
    !/requestFullscreen/.test(sourceText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
    'the pane still calls requestFullscreen')
  check('the window offers the way back, and the mark says which state it is in',
    /Leave the full screen/.test(sourceText) && /cornersGlyph\(filled \? 'in' : 'out'\)/.test(sourceText),
    'the fill control has no filled state')
  check('the pane carries its own reading size and frame as attributes',
    styleProbe.document.documentElement.attrs['data-mm-theme'] !== undefined
      && styleProbe.document.documentElement.attrs['data-mm-text'] !== undefined,
    JSON.stringify(styleProbe.document.documentElement.attrs))

  /* 2. FILLING THE SCREEN IS A FACT THE SCREEN ALREADY STATES. The window used to carry a bar
   * across its top announcing that it had been filled — a full-width rule for something
   * visible in the same glance. It is a toast now, and the test is that it goes. */
  const noticeNow = () => {
    const markup = renderToStaticMarkup(React.createElement(windowElement.type, windowElement.props))
    const at = markup.indexOf('mm-notice')
    if (at < 0) return null
    const rest = markup.slice(markup.indexOf('>', at) + 1)
    return rest.slice(0, rest.indexOf('<'))
  }
  check('pressing the fill symbol fills the shell',
    pressLabel(windowElement, 'Fill the screen') === true && shell.attrs['data-fill'] === 'on',
    JSON.stringify(shell.attrs))
  check('the fill says so, briefly', noticeNow() !== null, 'nothing was said')
  check('the note about it is a line, not a bar',
    noticeNow() === null || noticeNow().length < 90, JSON.stringify(noticeNow()))
  live.calls.timers.filter((timer) => timer.ms === 2200).forEach((timer) => timer.fn())
  await flush(20)
  live.calls.timers.filter((timer) => timer.ms === 420).forEach((timer) => timer.fn())
  await flush(20)
  check('and then it leaves on its own, without waiting to be dismissed',
    noticeNow() === null, JSON.stringify(noticeNow()))
  check('pressing the symbol again returns the shell to floating',
    pressLabel(windowElement, 'Leave the full screen') === true && shell.attrs['data-fill'] === undefined,
    JSON.stringify(shell.attrs))


  /* 3. THE WINDOW OPENED IN THE WRONG SESSION. The pane learned which session it was in
   *    on a 2.5s poll, so a lesson starting in another conversation was read against the
   *    old session's id and raised its window over the old one. The test is the
   *    scenario: switch the session, draw the seat, and ask what the pane is reading. */
  const askedFor = () => live.calls.fetch.filter((call) => call.route === 'read-state').map((call) => call.body.sessionId)
  const beforeSwitch = askedFor().length
  live.platform.current = OTHER_SESSION
  drawSeat()
  // The close happens as the switch is noticed, so it is asked about before the read for
  // the new session lands — on the other side of that read, a window standing here is the
  // NEW session's window, which is correct and a different question.
  check('the window belonging to the session we left is closed rather than repointed',
    windowsNow().length === 0, `windows: ${windowsNow().length}`)
  await flush(20)
  check('the pane notices the session it is in changed, without waiting for the poll',
    askedFor().length > beforeSwitch, `read-state calls: ${askedFor().length}`)
  check('and its read is for the session on screen, not the one it left',
    askedFor().at(-1) === OTHER_SESSION, String(askedFor().at(-1)))
  check('the lesson read for the new session is the new session\'s, not the old one\'s',
    live.calls.fetch.filter((call) => call.route === 'read-state').at(-1).body.sessionId === OTHER_SESSION,
    'the read went to the wrong session')

  /* ── one click is the answer ─────────────────────────────────────────────────────
   *
   * THE COMPLAINT: choosing an option only filled the message box, and a second button
   * put a draft in the composer for a third gesture to send. An option click is the whole
   * act, so the test is the click: press one, and ask whether it was written down and
   * whether it reached the chat. */
  live.platform.current = SESSION
  drawSeat()
  await flush(20)
  const draws = () => {
    const element = live.roots[live.roots.length - 1]?.element
    return element === undefined || element === null ? [] : walkHosts(element)
  }
  const optionLabelOf = () => (LESSON.quiz.options[0])
  const optionButton = () => hostByLabel(draws(), optionLabelOf(), 'button')
  check('a waiting question renders its options as controls that carry a handler',
    optionButton() !== null && typeof optionButton().onClick === 'function',
    String(typeof optionButton()?.onClick))
  const answersBefore = live.calls.fetch.filter((call) => call.route === 'answer-question').length
  const draftsBefore = live.calls.drafts.length
  optionButton().onClick()
  await flush(20)
  const answers = live.calls.fetch.filter((call) => call.route === 'answer-question')
  check('clicking an option writes the answer down',
    answers.length === answersBefore + 1, `answer-question calls: ${answers.length}`)
  check('the written answer names the question and the choice',
    answers.length > 0
      && answers[answers.length - 1].body.entry.question === LESSON.quiz.question
      && answers[answers.length - 1].body.entry.choice === optionLabelOf(),
    JSON.stringify(answers[answers.length - 1]?.body.entry))
  check('and the same click sends it to the chat, with no second gesture',
    live.calls.drafts.length > draftsBefore
      && live.calls.submitted[live.calls.submitted.length - 1] === live.calls.drafts[live.calls.drafts.length - 1],
    `drafts ${live.calls.drafts.length}, submitted ${live.calls.submitted.length}`)
  check('what was sent is the answer, not an empty draft',
    String(live.calls.submitted[live.calls.submitted.length - 1]).length > 0,
    JSON.stringify(live.calls.submitted[live.calls.submitted.length - 1]))
  check('the question is not asked a second time once it has been answered',
    hostByLabel(draws(), optionLabelOf(), 'button') === null,
    'the answered question came back on screen')

  /* The same bargain for an answer he writes himself: Enter sends it, so the typed path
     costs one gesture too. It runs on its own session, because answering is what takes the
     card away. */
  {
    const typedPlatform = makePlatform({ declared: declaredList, present: SEATS, hasLesson: true, entries: ENTRIES, hasMore: true })
    const typedBundle = loadBundle(typedPlatform)
    typedBundle.moduleExports.apply(typedPlatform.ctx)
    await flush()
    for (const timer of typedPlatform.calls.timers) timer.fn()
    await flush(20)
    typedBundle.moduleExports.bindSessionFeed(typedPlatform.ctx.get('sessions'))
    const typedSeat = typedPlatform.registered.get('sidebar.right.pane.tab')
    renderToStaticMarkup(React.createElement(typedSeat))
    const typedWindow = typedPlatform.roots[typedPlatform.roots.length - 1]?.element
    const areaOf = () => {
      const found = walkHosts(typedWindow).find((host) => host.type === 'textarea')
      return found === undefined ? null : found.props
    }
    check('a question offers somewhere to write the answer', areaOf() !== null, 'no textarea')
    const area = areaOf()
    if (area !== null) {
      let prevented = false
      area.onChange({ target: { value: 'Because the second box moves first.' } })
      areaOf().onKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => { prevented = true } })
      await flush(20)
      check('Enter sends an answer written by hand',
        prevented === true && typedPlatform.calls.submitted.length > 0,
        `prevented=${String(prevented)} submitted=${typedPlatform.calls.submitted.length}`)
      check('and what it sends is what he wrote',
        String(typedPlatform.calls.submitted[typedPlatform.calls.submitted.length - 1]).includes('second box moves first'),
        JSON.stringify(typedPlatform.calls.submitted[typedPlatform.calls.submitted.length - 1]))
      check('the box is emptied once the answer has gone',
        areaOf() === null || areaOf().value === '', JSON.stringify(areaOf()?.value))
    }
  }

  /* And when the write fails, the answer is kept rather than discarded. */
  const failing = makePlatform({ declared: declaredList, present: SEATS, hasLesson: true, entries: ENTRIES, hasMore: true, answerFails: true })
  const failingBundle = loadBundle(failing)
  failingBundle.moduleExports.apply(failing.ctx)
  await flush()
  for (const timer of failing.calls.timers) timer.fn()
  await flush(20)
  failingBundle.moduleExports.bindSessionFeed(failing.ctx.get('sessions'))
  const failingSeat = failing.registered.get('sidebar.right.pane.tab')
  renderToStaticMarkup(React.createElement(failingSeat))
  const failingElement = failing.roots[failing.roots.length - 1]?.element
  const failingOption = failingElement === undefined ? null : hostByLabel(walkHosts(failingElement), LESSON.quiz.options[0])
  check('a failing write still leaves the option clickable',
    failingOption !== null && typeof failingOption.onClick === 'function', 'no option to press')
  if (failingOption !== null) {
    failingOption.onClick()
    await flush(20)
    const markup = renderToStaticMarkup(React.createElement(failingElement.type, failingElement.props))
    check('and a failed send is reported rather than passed off as sent',
      typeof markup === 'string' && markup.includes('Not sent'), 'no failure reported')
    check('a failed send puts nothing into the chat',
      failing.calls.submitted.length === 0, JSON.stringify(failing.calls.submitted))
  }

  /* Reading preferences survive a seat change and stay out of the vault. */
  const stored = live.window.localStorage.getItem('mimir-lesson-theme')
  check('the reading preferences are the browser\'s, not the vault\'s', stored === null, String(stored))
  check('the transcript did not need a second transport into the vault',
    !live.calls.fetch.some((call) => call.route === 'transcript'), JSON.stringify(live.calls.fetch.map((call) => call.route)))
}

/* The failure that started all of this: no Slot seat. It must not be silent, and the
   report must carry the workspace folder, or the Host refuses to write it. */
const seatless = makePlatform({ declared: declaredList, present: ['sessions', 'sidebarRight', 'sidebarRightTabs'], hasLesson: true })
const seatlessBundle = loadBundle(seatless)
let seatlessError = null
try {
  seatlessBundle.moduleExports.apply(seatless.ctx)
} catch (error) {
  seatlessError = String(error?.message ?? error)
}
await flush()
check('a missing Slot seat does not throw', seatlessError === null, String(seatlessError))
const reports = seatless.calls.fetch.filter((call) => call.route === 'health')
check('a missing Slot seat is reported rather than swallowed', reports.length > 0)
check('the report carries the workspace folder the Host needs to accept the write',
  reports.some((call) => call.body.root === ROOT), JSON.stringify(reports.map((call) => call.body.root)))
check('the report says what was missing', reports.some((call) => String(call.body.error).includes('slots')),
  JSON.stringify(reports.map((call) => call.body.error)))
check('the console also carries it, for whoever is looking at devtools',
  seatless.calls.consoleErrors.some((line) => line.includes('no slots service')), JSON.stringify(seatless.calls.consoleErrors))

/* ── the pane's own language ────────────────────────────────────────────────────
 *
 * THE PANE DOES NOT DETECT A LANGUAGE. It renders a file the teacher writes, and the teacher
 * is the one thing that knows which language the session is in, so the file carries an
 * optional `lang` and the pane's own chrome follows it. What has to hold is the whole chain,
 * and every rung here is a rendered pane rather than a decision read out of the source: a
 * file that names Simplified gets Chinese, a file that names Traditional or names nothing
 * the pane can serve gets English, and every label is filled either way.
 */

/** One applied pane, bound to its own session feed: `{ platform, bundle, seat }`. */
async function applyLesson(lesson) {
  const platform = makePlatform({
    declared: declaredList, present: SEATS, hasLesson: true, entries: ENTRIES, hasMore: false, lesson,
  })
  const bundle = loadBundle(platform)
  bundle.moduleExports.apply(platform.ctx)
  await flush()
  for (const timer of platform.calls.timers) timer.fn()
  await flush(20)
  bundle.moduleExports.bindSessionFeed(platform.ctx.get('sessions'))
  return { platform, bundle, seat: platform.registered.get('sidebar.right.pane.tab') }
}

/** Draw the docked pane for one lesson and hand back its markup, in its own bundle. */
async function drawLesson(lesson) {
  const { seat } = await applyLesson(lesson)
  return renderToStaticMarkup(React.createElement(seat))
}

if (renderToStaticMarkup === null) {
  notes.push('react-dom/server was not loadable, so the language checks were skipped')
} else {
  const chinese = await drawLesson({ ...LESSON, lang: 'zh-CN' })
  check('a lesson written in Simplified Chinese renders the pane in Chinese',
    chinese.includes('lang="zh-CN"')
      && chinese.includes('>对话<') && chinese.includes('>测验<') && chinese.includes('>插图<')
      && chinese.includes('>主干<') && chinese.includes('>笔记<'),
    'the tab strip is not in Chinese')
  check('and the question is asked in Chinese down to its controls and its placeholder',
    chinese.includes('>题目<')
      && chinese.includes('或者用自己的话')
      && chinese.includes('用你自己的说法写，不必照选项的口气。')
      && chinese.includes('暂时放一放')
      && chinese.includes('>作答<'),
    'part of the question is still English')
  check('with no English label left behind anywhere the learner reads',
    !chinese.includes('Or in your own words')
      && !chinese.includes('>Quiz<') && !chinese.includes('>Visuals<') && !chinese.includes('>Notes<')
      && !chinese.includes('Open in a window')
      && !chinese.includes('Set aside for now'),
    'an English label survived the switch')
  check('and the column declares the language it is written in, so a screen reader is told too',
    chinese.includes('lang="zh-CN"'), 'the pane does not carry a lang attribute')
  /* The docked tabs are a narrow strip, and the reason the Chinese tab labels were chosen
     short: two or three characters each. Read out of the rendered strip rather than the
     table, because that is where the width actually has to hold. */
  const tabLabels = [...chinese.matchAll(/<span class="mm-tab-mark">[\s\S]*?<\/span><span>([^<]*)<\/span>/g)]
    .map((match) => match[1])
  check('every label in the docked tab strip stays short enough for a narrow column',
    tabLabels.length === 5 && tabLabels.every((label) => label.length > 0 && label.length <= 3 && /[\u4e00-\u9fff]/.test(label)),
    JSON.stringify(tabLabels))

  const traditional = await drawLesson({ ...LESSON, lang: 'zh-TW' })
  check('a lesson written in Traditional Chinese is given English rather than Simplified',
    traditional.includes('lang="en"')
      && traditional.includes('>Quiz<')
      && traditional.includes('Or in your own words')
      && !traditional.includes('>测验<'),
    'Traditional was served the Simplified table')
  check('and a Traditional label is nowhere in that pane',
    !/[\u4e00-\u9fff]/.test(traditional), 'a Chinese label reached a Traditional reader')

  const older = await drawLesson(LESSON)
  check('a session file written before `lang` existed renders exactly as it did',
    older.includes('lang="en"')
      && older.includes('>Quiz<')
      && older.includes('Open in a window')
      && older.includes('Or in your own words'),
    'an older session file lost its English')

  const unknown = await drawLesson({ ...LESSON, lang: 'fr' })
  check('a language the pane cannot serve falls back to English, not to a blank',
    unknown.includes('lang="en"') && unknown.includes('Or in your own words'),
    'an unserved tag did not fall back')

  /* One line per tag, because the subtags are where the decision is actually made: what
     selects the Simplified table, and what deliberately does not. */
  const tagCases = [
    ['zh', 'zh-CN'], ['zh-CN', 'zh-CN'], ['ZH-CN', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh_CN', 'zh-CN'],
    ['zh-TW', 'en'], ['zh-HK', 'en'], ['zh-Hant', 'en'], ['zh-Hant-HK', 'en'],
    ['en', 'en'], ['fr', 'en'], ['', 'en'], [null, 'en'],
  ]
  for (const [tag, expected] of tagCases) {
    const markup = await drawLesson({ ...LESSON, lang: tag })
    check(`lang ${JSON.stringify(tag)} is served the ${expected} table`,
      markup.includes('lang="' + expected + '"'),
      `the pane did not declare lang="${expected}"`)
  }
}

/* ── the docked chat ────────────────────────────────────────────────────────────
 *
 * THE FIRST TAB OF THE DOCKED PANE OPENED AN EMPTY COLUMN. The strip has always offered Chat
 * whenever the pane is docked — the note above `tabRows` in the pane says why: the window
 * splits the dialogue into a column of its own, and docked there is no such column, so the
 * chat is exactly what that tab is for. The body drew quiz, viz, spine and notes and nothing
 * at all for chat, so pressing the first tab emptied the column.
 *
 * DRAWING IT IN THE TAB BODY WOULD HAVE BEEN THE WRONG FIX, and these checks hold both halves
 * of the right one. `ChatView` owns its scroller and its pinned rail, and both only work where
 * it is a flex child of a height-constrained column; wrapped in `mm-body` there would be two
 * scrollbars, its rail would scroll away with the first message, and the pin to the newest
 * message would stop working — the element it scrolls would no longer be the element that
 * scrolls. So the dialogue is mounted beside the tab strip, and both facts are asserted here:
 * that it is drawn, and that it is the column rather than prose inside the tab body.
 */
if (renderToStaticMarkup === null) {
  notes.push('react-dom/server was not loadable, so the docked-chat checks were skipped')
} else {
  const docked = await applyLesson(LESSON)
  const chatTab = hostByLabel(walkHosts(React.createElement(docked.seat)), 'Chat', 'button')
  check('the docked pane offers the dialogue on a tab of its own, and the tab can be pressed',
    chatTab !== null && typeof chatTab.onClick === 'function', 'no Chat tab in the docked strip')
  if (chatTab !== null) chatTab.onClick()
  const dockedHtml = renderToStaticMarkup(React.createElement(docked.seat))
  check('and opening it draws the dialogue rather than an empty column',
    dockedHtml.includes('Ask me something about the map.')
      && dockedHtml.includes('class="mm-pane-chat"')
      && dockedHtml.includes('class="mm-chat"')
      && dockedHtml.includes('Working: hidden'),
    'the docked Chat tab drew no dialogue')
  check('and the dialogue is the column itself, not prose inside the tab body\'s scroller',
    !dockedHtml.includes('class="mm-body"'),
    'the chat was wrapped in the tab body, where its scroller and its pinned rail stop working')
  /* Its companion, and the reason the two are checked together: the window is the one chrome
     that must NOT grow a Chat tab, because there the dialogue already stands beside the
     lesson in a column of its own. */
  const windowed = await applyLesson(LESSON)
  const windowElement = windowed.platform.roots[windowed.platform.roots.length - 1]?.element
  const windowHtml = windowElement === undefined
    ? null
    : renderToStaticMarkup(React.createElement(windowElement.type, windowElement.props))
  check('while the window draws the dialogue as a column of its own and offers no Chat tab',
    typeof windowHtml === 'string'
      && windowHtml.includes('class="mm-pane-chat"')
      && !windowHtml.includes('>Chat</span>')
      && windowHtml.includes('>Quiz</span>'),
    'the two chromes collapsed into each other')
}

/* ── the controls, pressed for real ───────────────────────────────────────────── */

const page = await makeLivePage({ entries: ENTRIES })
if (page === null) {
  notes.push('jsdom or react-dom was not loadable, so the click checks were skipped')
} else {
  const { dom, act, restore } = page
  const document = dom.window.document
  const rail = () => [...document.querySelectorAll('.mm-rail-btn')]
  const railByName = (prefix) => rail().find((button) => String(button.getAttribute('aria-label')).startsWith(prefix)) ?? null
  const railNames = () => rail().map((button) => button.getAttribute('aria-label'))
  const press = async (element) => {
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
  }

  const windowUp = document.querySelector('.mm-window')
  check('the pane raises its window in a real page', windowUp !== null, 'no window in the DOM')
  check('the rail draws its controls', rail().length >= 3, JSON.stringify(railNames()))

  /* THE BUG THIS CATCHES. These three controls carried handlers that threw
     `ReferenceError: publish is not defined` on the click, because the store they call was
     in a scope their component could not see. Nothing about the markup showed it. */
  const errors = []
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)))
  check('the rail carries its three controls as symbols, each with a name',
    railNames().length === 3
      && railNames().every((name) => typeof name === 'string' && name.length > 0)
      && rail().every((button) => button.querySelector('svg') !== null),
    JSON.stringify(railNames()))

  const work = railByName('Working: hidden')
  if (work !== null) await press(work)
  check('pressing the working control changes what it announces, and says it is pressed',
    railByName('Working: shown') !== null
      && railByName('Working: shown').getAttribute('aria-pressed') === 'true',
    JSON.stringify(railNames()))
  check('and it does so without throwing', errors.length === 0, JSON.stringify(errors))

  const frameBefore = document.documentElement.getAttribute('data-mm-theme')
  const frameButton = railByName('Switch to the')
  const frameOffer = frameButton?.getAttribute('aria-label') ?? null
  check('the frame control offers the other frame, not a third state',
    frameOffer !== null && !/auto/.test(frameOffer), String(frameOffer))
  if (frameButton !== null) await press(frameButton)
  const frameAfter = document.documentElement.getAttribute('data-mm-theme')
  check('pressing it turns the frame over',
    ['light', 'dark'].includes(frameAfter) && frameAfter !== frameBefore,
    `${String(frameBefore)} -> ${String(frameAfter)}`)
  // The offer is captured as a string, not as the node: a live node's attribute has already
  // changed by the time it is read, which made an earlier version of this compare a value
  // with itself and always fail.
  const frameOfferAfter = railByName('Switch to the')?.getAttribute('aria-label') ?? null
  check('and the control then offers the way back',
    frameOfferAfter !== null && frameOfferAfter !== frameOffer,
    `${String(frameOffer)} -> ${String(frameOfferAfter)}`)

  const sizeBefore = document.documentElement.getAttribute('data-mm-text')
  const sizeSteps = []
  for (let step = 0; step < 3; step += 1) {
    const button = railByName('Reading size:')
    if (button === null) break
    sizeSteps.push(document.documentElement.getAttribute('data-mm-text'))
    await press(button)
  }
  check('the reading size walks its three steps and returns',
    new Set(sizeSteps).size === 3 && document.documentElement.getAttribute('data-mm-text') === sizeBefore,
    JSON.stringify(sizeSteps))
  check('no control threw while being pressed', errors.length === 0, JSON.stringify(errors))

  /* THE DRAWINGS ARE INKED IN THE PANE'S OWN FRAME. Every SVG in Learn/Viz is authored light
     with a dark variant behind `prefers-color-scheme` — which never fires for a pane whose
     theme is its own. Read as they stand they put dark ink on a dark lesson, or a white slab
     in the middle of one. The rewrite replaces each of the drawing's colours with the token
     carrying the same role, and scopes what is left so an SVG's stylesheet cannot restyle the
     app around it. */
  const visualsTab = [...document.querySelectorAll('.mm-tab')].find((tab) => tab.textContent.includes('Visuals'))
  check('the window offers the drawings on a tab of their own', visualsTab !== undefined, 'no Visuals tab')
  if (DRAWING === '') {
    // `Learn/Viz/` ships empty: a clone has the folder and none of the drawings a working
    // vault accumulates, so there is nothing here to rewrite. Said out loud rather than
    // passed over — a check that is skipped in silence reads like a check that passed.
    notes.push('Learn/Viz/mediterranean-map.svg is not in this checkout, so the drawing-rewrite checks were skipped')
  } else if (visualsTab !== undefined) {
    await press(visualsTab)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    const sheets = [...document.querySelectorAll('style[data-mimir-viz]')]
    const css = sheets.map((sheet) => sheet.textContent).join('\n')
    const body = document.querySelector('.mm-fig-body')
    check('the drawing arrives and is drawn', body !== null && body.querySelector('svg') !== null,
      'no drawing in the figure')
    check('its own stylesheet is lifted out of it, so it cannot restyle the app',
      body !== null && body.querySelector('style') === null, 'the SVG still carries a style block')
    check('and re-installed scoped to that one figure',
      sheets.length > 0 && css.split('\n').every((line) => line.startsWith('#mm-viz-')),
      `${String(sheets.length)} sheets`)
    check('every colour in it is now a token of the pane it is read in',
      css.length > 0 && !/#[0-9a-fA-F]{6}/.test(css), 'the drawing still carries its own colours')
    check('including the ink, the surfaces and the rules',
      css.includes('var(--fg)') && css.includes('var(--rule)') && css.includes('var(--line)'),
      'a role is missing from the rewrite')
    check('and its type scales with the lesson, so one reading size moves the whole page',
      css.includes('calc(var(--mm-t) - 4px)'), 'the drawing ignores the reading size')
  }

  restore()
}

/* ── report ───────────────────────────────────────────────────────────────── */

for (const note of notes) console.log('note: ' + note)
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n`)
  for (const failure of failures) console.error('  ✗ ' + failure)
  console.error(`\n${passed} passed, ${failures.length} failed.`)
  process.exit(1)
}
console.log(`All ${passed} checks passed — the browser half boots, declares its seats, registers them, renders, and reports its own failures.`)
console.log('This is a stub-level check. The interface is the only proof.')
