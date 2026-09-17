/**
 * The Lesson pane, Host half.
 *
 * Three small files in the vault are the whole protocol between the teacher and
 * the pane, and this half is the only thing that touches them:
 *
 *   Learn/Sessions/.live/<session-id>.json          the lesson state (the teacher writes it)
 *   Learn/Sessions/.live/<session-id>.answers.json  what the learner set aside (the pane writes it)
 *   Learn/Sessions/.live/<session-id>.notes.md      the learner's scratch page (the pane writes it)
 *
 * It serves those over its POST routes under one prefix on the Harness' own web
 * carrier, which is how a *resident* plugin half talks to its browser half: the
 * `harness.handle` Package channel exists only for dynamic packages, so a plugin
 * that ships inside a preset uses an ordinary route instead. Every request is a
 * POST carrying `sessionId` and the workspace `root` the browser already knows,
 * and every path it touches is built from a fixed folder plus a validated
 * filename — there is no path parameter to walk out of.
 *
 * Reads and writes go through the `fs` service rather than a Node module, so the
 * vault stays behind the same filesystem policy as the file tools: a session
 * confined to its workspace cannot reach outside it through this pane.
 *
 * `Learn/Viz/*.svg` is served read-only as text, because the reading column
 * cannot render an Obsidian `![[file.svg]]` embed at all — an SVG that is only
 * embedded in a note is an SVG the learner never sees.
 *
 * @module dsh-mimir-lesson-pane/host
 */

const LIVE = 'Learn/Sessions/.live/'
const VIZ = 'Learn/Viz/'
/** The pane's route, and the one fixed path the browser always knows. */
const PREFIX = '/mimir-lesson-pane'

/**
 * The pointer the teacher reads to find the session it is teaching.
 *
 * The pane is the only part of this arrangement that always knows the live session id
 * and its folder, so it publishes them here on every session change. The teacher cannot
 * reliably derive its own id from the prompt, and asking it to guess would make
 * publishing a question a coin flip.
 */
const CURRENT = 'current.json'

/** Where the pane writes what it can see about itself when it loads. */
const HEALTH = 'pane-health.json'
const HANDSHAKE = `${PREFIX}/handshake`

/** Key of the process-level route registry. See {@link apply}. */
const REGISTRY = Symbol.for('dsh-mimir-lesson-pane.routes')
const MAX_SVG_BYTES = 3 * 1024 * 1024
const MAX_BODY_BYTES = 256 * 1024

/** Only the session-id shapes this harness mints may name a file. */
function safeId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 120) return null
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null
  return trimmed
}

/** A filename that cannot climb out of its folder, checked against the wanted shape. */
function safeName(value, pattern) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return null
  if (!pattern.test(trimmed)) return null
  return trimmed
}

/** The workspace root the browser reports, normalised without its trailing separator. */
function rootOf(args) {
  const root = args?.root
  if (typeof root !== 'string') return null
  const trimmed = root.trim()
  if (trimmed.length === 0 || trimmed.length > 4096) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

/** Read one request body, refusing anything implausibly large. */
async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

/** Answer one request with JSON. */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
  })
  res.end(body)
}

const name = 'dsh-mimir-lesson-pane'

/** Whether this process has already claimed the pane's route. See {@link apply}. */
let routeRegistered = false

/**
 * The filesystem is a hard dependency. The web carrier is looked up instead of
 * declared: this half is one plugin row in a teaching preset, and it should not
 * fail to mount in a composition that never started a server.
 */
const inject = ['fs']

/**
 * Register the pane's four routes.
 * @param ctx - the preset-scoped Host context carrying the filesystem service.
 */
function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    ctx.logger?.warn?.('lesson-pane: no web server in this composition; the pane cannot reach the vault')
    return
  }

  async function readTextOf(fs, root, relative) {
    try {
      const target = await fs.resolve(root + '/' + relative, {})
      const info = await fs.stat(target)
      if (info === undefined || info.type !== 'file') return null
      return await fs.readText(target)
    } catch {
      return null
    }
  }

  /**
   * The policy a pane write runs under.
   *
   * The filesystem sandbox fences `workspace-write` writes to the calling session's
   * workspace root, and a browser request carries no session, so the resolved policy
   * has none — leaving the write denied even for a path inside the vault. The pane's
   * writes are always into the vault it was asked about, so the boundary this sets is
   * the folder the browser named; an explicit `read-only` is honoured and refuses.
   * @param root - the absolute workspace folder the browser reported.
   * @returns the policy to pass with the write.
   */
  function writePolicy(root) {
    let mode
    try {
      mode = ctx.get('sandboxPolicy')?.resolve()?.mode
    } catch {
      mode = undefined
    }
    return {
      mode: mode === 'read-only' ? 'read-only' : 'workspace-write',
      workspaceRoot: root,
    }
  }

  async function writeTextOf(fs, root, relative, content, sessionId) {
    const target = await fs.resolve(root + '/' + relative, {})
    const policy = writePolicy(root)
    if (sessionId !== undefined) policy.sessionId = sessionId
    await fs.writeText(target, content, undefined, undefined, policy)
  }

  async function readItemsOf(fs, root, relative) {
    const text = await readTextOf(fs, root, relative)
    if (text === null) return []
    try {
      const parsed = JSON.parse(text)
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return []
      return parsed.items.slice(0, 500)
    } catch {
      return []
    }
  }

  /**
   * The vault's name, as Obsidian knows it.
   *
   * The pane's heading used to be about the pane. It should be the vault's, because that is
   * what it is — the folder the learner is thinking in — and a plugin that writes into a
   * vault should call it by its name.
   *
   * WHAT MAKES IT THE VAULT'S NAME RATHER THAN A FOLDER'S. A session's working directory can
   * be any folder inside the vault, and the basename of `Learn/Sessions` is not a name
   * anybody recognises. Obsidian marks its vault with a `.obsidian` directory at the root,
   * so the walk up looks for that: the nearest ancestor carrying one is the vault, whatever
   * the session was started in. When nothing carries one — a vault Obsidian has never
   * opened, or a folder outside any — the basename of the working directory is the honest
   * answer rather than no answer.
   *
   * @param fs - the filesystem service.
   * @param root - the workspace folder the browser reported.
   * @returns the vault's name, or '' when the folder cannot be named.
   */
  async function vaultNameOf(fs, root) {
    let candidate = root
    for (let depth = 0; depth < 12; depth += 1) {
      try {
        const marker = await fs.resolve(candidate + '/.obsidian', {})
        const info = await fs.stat(marker)
        if (info !== undefined && (info.type === 'dir' || info.type === 'directory')) {
          const parts = candidate.split('/').filter((part) => part.length > 0)
          return parts.length === 0 ? '' : parts[parts.length - 1]
        }
      } catch {
        /* no marker here; keep walking up */
      }
      const cut = candidate.lastIndexOf('/')
      if (cut <= 0) break
      candidate = candidate.slice(0, cut)
    }
    const parts = root.split('/').filter((part) => part.length > 0)
    return parts.length === 0 ? '' : parts[parts.length - 1]
  }

  /** Everything the pane draws in one round trip: the lesson, past answers, the page, the shelf. */
  async function readState(fs, args) {
    const root = rootOf(args)
    const sessionId = safeId(args?.sessionId)
    if (root === null) return { ready: false, reason: 'this session has no workspace folder yet' }
    if (sessionId === null) return { ready: false, reason: 'no session id on the wire' }

    const lessonText = await readTextOf(fs, root, LIVE + sessionId + '.json')
    let lesson = null
    if (lessonText !== null) {
      try {
        const parsed = JSON.parse(lessonText)
        if (parsed !== null && typeof parsed === 'object') lesson = parsed
      } catch {
        lesson = null
      }
    }

    const notes = await readTextOf(fs, root, LIVE + sessionId + '.notes.md')

    let visuals = []
    try {
      const dir = await fs.resolve(root + '/' + VIZ, {})
      const entries = await fs.listDir(dir)
      const rows = []
      for (const entry of entries) {
        if (entry.type !== 'file') continue
        if (!/\.svg$/i.test(entry.name)) continue
        rows.push({ name: entry.name })
      }
      rows.sort((left, right) => (left.name < right.name ? 1 : left.name > right.name ? -1 : 0))
      visuals = rows.slice(0, 40)
    } catch {
      visuals = []
    }

    return {
      ready: true,
      sessionId,
      vault: await vaultNameOf(fs, root),
      hasLesson: lesson !== null,
      lesson,
      answers: await readItemsOf(fs, root, LIVE + sessionId + '.answers.json'),
      notes: notes === null ? '' : notes.slice(0, 200000),
      visuals,
    }
  }

  /** One drawing from Learn/Viz, as text, for the pane to render at full width. */
  async function readVisual(fs, args) {
    const root = rootOf(args)
    const drawing = safeName(args?.name, /^[A-Za-z0-9._-]+\.svg$/i)
    if (root === null || drawing === null) return { ok: false, reason: 'that name is not a drawing in this vault' }
    try {
      const target = await fs.resolve(root + '/' + VIZ + drawing, {})
      const info = await fs.stat(target)
      if (info === undefined) return { ok: false, reason: 'that drawing is not there' }
      if (typeof info.size === 'number' && info.size > MAX_SVG_BYTES) return { ok: false, reason: 'that drawing is too large for this pane' }
      const text = await fs.readText(target)
      return { ok: true, name: drawing, svg: text.slice(0, MAX_SVG_BYTES) }
    } catch {
      return { ok: false, reason: 'that drawing could not be read' }
    }
  }

  /** The learner's scratch page, written on a debounce from the browser. */
  async function saveNotes(fs, args) {
    const root = rootOf(args)
    const sessionId = safeId(args?.sessionId)
    if (root === null || sessionId === null) return { saved: false, reason: 'nothing to write to' }
    const text = typeof args.text === 'string' ? args.text.slice(0, 200000) : ''
    await writeTextOf(fs, root, LIVE + sessionId + '.notes.md', text, sessionId)
    return { saved: true, bytes: text.length }
  }

  /**
   * One question answered.
   *
   * The learner picking an option is not a draft: it is an answer, and the vault is where
   * answers are durable. So it is written down first — the same file the parked questions
   * go to, distinguished by `status` — and the route hands the same line back for the
   * pane to put into the chat. Recording before sending is deliberate: a send that fails
   * or a session that ends mid-turn must not lose what the learner said, and the teacher reads
   * these files.
   *
   * The card is written the same way a set-aside is, so one reader sees both, and the
   * file stays a single list of what happened to each question rather than two lists that
   * have to be reconciled.
   */
  async function recordAnswer(fs, args) {
    const root = rootOf(args)
    const sessionId = safeId(args?.sessionId)
    if (root === null || sessionId === null) return { saved: false, reason: 'nothing to write to' }
    const entry = args.entry === undefined || args.entry === null ? {} : args.entry
    const question = typeof entry.question === 'string' ? entry.question.slice(0, 2000) : ''
    const custom = typeof entry.custom === 'string' ? entry.custom.slice(0, 8000) : ''
    const choice = typeof entry.choice === 'string' ? entry.choice.slice(0, 2000) : ''
    if (question === '' || (choice === '' && custom === '')) {
      return { saved: false, reason: 'an answer needs the question and something chosen' }
    }
    const items = await readItemsOf(fs, root, LIVE + sessionId + '.answers.json')
    items.push({
      at: typeof entry.at === 'string' ? entry.at.slice(0, 64) : '',
      question,
      choice,
      custom,
      status: 'answered',
    })
    await writeTextOf(fs, root, LIVE + sessionId + '.answers.json', JSON.stringify({ items }, null, 2), sessionId)
    return { saved: true, count: items.length, line: answerLine(choice, custom) }
  }

  /**
   * The answer as one line of chat.
   *
   * The question is named with it because the teacher's turn is not the only thing in the
   * log: a message that is only the option text is unreadable a week later, and a lesson
   * transcript is read back. The two-part form matches what the pane's own transcript
   * records for the same event.
   */
  function answerLine(choice, custom) {
    if (choice === '') return custom
    if (custom === '') return choice
    return choice + ' — ' + custom
  }

  /** One question parked rather than answered, so the teacher can come back to it. */
  async function dismissQuestion(fs, args) {
    const root = rootOf(args)
    const sessionId = safeId(args?.sessionId)
    if (root === null || sessionId === null) return { saved: false, reason: 'nothing to write to' }
    const entry = args.entry === undefined || args.entry === null ? {} : args.entry
    const items = await readItemsOf(fs, root, LIVE + sessionId + '.answers.json')
    items.push({
      at: typeof entry.at === 'string' ? entry.at.slice(0, 64) : '',
      question: typeof entry.question === 'string' ? entry.question.slice(0, 2000) : '',
      choice: '',
      custom: typeof entry.custom === 'string' ? entry.custom.slice(0, 8000) : '',
      status: 'set-aside',
    })
    await writeTextOf(fs, root, LIVE + sessionId + '.answers.json', JSON.stringify({ items }, null, 2), sessionId)
    return { saved: true, count: items.length }
  }

  /** The one route the browser can always find: it reports the pane's path. */
  async function handshake(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'POST only' })
      return
    }
    sendJson(res, 200, { prefix: PREFIX })
  }

  const ROUTES = {
    'read-state': readState,
    'save-notes': saveNotes,
    'answer-question': recordAnswer,
    'dismiss-question': dismissQuestion,
    'read-visual': readVisual,
    session: recordSession,
    health: reportHealth,
    diagnose,
  }

  /** Publish the live session, so the teacher can address it without guessing. */
  async function recordSession(fs, args) {
    const root = rootOf(args)
    const sessionId = safeId(args?.sessionId)
    if (root === null || sessionId === null) return { saved: false, reason: 'nothing to record' }
    const entry = {
      sessionId,
      root,
      at: new Date().toISOString(),
      contract: 'Learn/Sessions/.live/<session-id>.json — see the mimir-teaching skill, section "The Lesson pane"',
    }
    await writeTextOf(fs, root, LIVE + CURRENT, JSON.stringify(entry, null, 2), sessionId)
    return { saved: true, sessionId }
  }

  /**
   * Record the pane's own view of the page it is running in.
   *
   * The Host can see that a route was called; it cannot see whether the browser half
   * applied, whether its stylesheet landed, or what the theme actually resolved to.
   * The pane can, so it says so here on load and on every session change — which is
   * how a failure in the browser half becomes readable from the vault instead of
   * invisible.
   */
  async function reportHealth(fs, args) {
    const root = rootOf(args)
    if (root === null) return { saved: false, reason: 'no workspace folder to report into' }
    const entry = {
      at: new Date().toISOString(),
      sessionId: safeId(args?.sessionId) ?? null,
      url: typeof args?.url === 'string' ? args.url.slice(0, 800) : '',
      stylesheets: typeof args?.stylesheets === 'number' ? args.stylesheets : null,
      rootFlag: typeof args?.rootFlag === 'string' ? args.rootFlag.slice(0, 200) : '',
      tabRegistered: args?.tabRegistered === true,
      bodyRendered: args?.bodyRendered === true,
      routeState: typeof args?.routeState === 'string' ? args.routeState.slice(0, 400) : '',
      theme: typeof args?.theme === 'string' ? args.theme.slice(0, 400) : '',
      error: typeof args?.error === 'string' ? args.error.slice(0, 2000) : '',
    }
    await writeTextOf(fs, root, LIVE + HEALTH, JSON.stringify(entry, null, 2), entry.sessionId ?? undefined)
    return { saved: true }
  }

  /**
   * Report what the Host knows about the pane's browser half.
   *
   * The browser bundle is served from a table the Host builds by scanning plugin rows
   * for a `dsh.client` declaration, and a row that scan never accepted simply produces
   * no script tag — the page is silent about it. This makes that state readable.
   */
  async function diagnose() {
    const clientModules = ctx.get('clientModules')
    if (clientModules === undefined) return { clientModules: 'not mounted in this Host' }
    const report = { clientModules: 'mounted' }
    try {
      const graph = clientModules.graph()
      const entries = graph?.entries
      const ids = []
      if (Array.isArray(entries)) {
        for (const entry of entries) ids.push(typeof entry === 'string' ? entry : String(entry?.id))
      } else if (entries !== null && typeof entries === 'object') {
        for (const key in entries) ids.push(key)
      }
      report.entryCount = ids.length
      report.paneIndex = ids.indexOf('dsh-mimir-lesson-pane')
      report.knownPackages = ids.filter((id) => id.includes('mimir') || id.includes('lesson'))
      report.sample = ids.slice(0, 8)
    } catch (error) {
      report.graphError = String(error?.message ?? error)
    }
    try {
      report.clientPath = String(clientModules.clientPath('dsh-mimir-lesson-pane') ?? 'undefined')
    } catch (error) {
      report.clientPath = 'THREW ' + String(error?.message ?? error)
    }
    return report
  }

  /** Run one method for one request. Every path is fixed, so nothing here is parsed. */
  async function dispatch(method, run, req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'POST only' })
      return
    }
    try {
      const args = await readBody(req)
      sendJson(res, 200, await run(ctx.fs, args))
    } catch (error) {
      sendJson(res, 400, { error: String(error?.message ?? error) })
    }
  }

  // Every route is claimed through a registry held for the life of the process.
  //
  // A route belongs to the running server, not to a plugin fiber, and re-mounting this
  // preset in the same process must not fail over a path its own predecessor still
  // holds. So claims are reference-counted in a process-level bag: the first mount
  // registers a route whose handler delegates to whichever mount is currently live,
  // a later mount simply takes the claim over, and the path is only released when the
  // last mount to hold it is disposed.
  const registry = (globalThis[REGISTRY] ??= new Map())

  function claim(path, def) {
    const existing = registry.get(path)
    if (existing !== undefined) {
      existing.holder = def.handler
      existing.refs += 1
      return existing.refs
    }
    const record = { holder: def.handler, refs: 1, dispose: undefined }
    registry.set(path, record)
    try {
      record.dispose = webServer.register({
        kind: 'exact',
        path,
        handler: (req, res) => {
          const holder = record.holder
          if (holder === undefined) {
            sendJson(res, 503, { error: 'the lesson pane is between mounts' })
            return
          }
          return holder(req, res)
        },
      })
    } catch (error) {
      registry.delete(path)
      throw error
    }
    return record.refs
  }

  const PATHS = [HANDSHAKE, ...Object.keys(ROUTES).map((method) => `${PREFIX}/${method}`)]
  claim(HANDSHAKE, { handler: handshake })
  for (const [method, run] of Object.entries(ROUTES)) {
    claim(`${PREFIX}/${method}`, { handler: (req, res) => dispatch(method, run, req, res) })
  }

  ctx.effect(() => () => {
    for (const path of PATHS) {
      const record = registry.get(path)
      if (record === undefined) continue
      record.refs -= 1
      if (record.refs > 0) continue
      registry.delete(path)
      if (typeof record.dispose === 'function') record.dispose()
    }
  }, 'lesson-pane: routes')
}

export { apply, inject, name }
