#!/usr/bin/env node
/**
 * Tools/test-link-preview.mjs — check the link-preview plugin before the app mounts it.
 *
 * WHY THIS EXISTS. A hover card is invisible when it breaks: nothing throws in the
 * session, no tool goes missing, no error appears — the pointer rests on a link and
 * simply nothing happens, which looks exactly like a gesture the user got wrong.
 * The failures available here are all of that kind, so each one is pinned by driving
 * the halves rather than reading them:
 *
 *   · THE HOST ROUTE REFUSES WHAT IT MUST. `file:`, a private address, a URL carrying
 *     credentials and a malformed URL each answer with a readable reason instead of a
 *     fetch. This is the security boundary: the route runs on the user's machine,
 *     behind their own loopback address, so an unfenced one is a request the app will
 *     make on a stranger's behalf.
 *
 *   · IT IS A REAL ROUTE, ON THE PATH THE CARD ASKS. The browser half fetches one
 *     loopback URL and the host half registers exactly that path; a mismatch is a
 *     plugin that mounts and does nothing.
 *
 *   · THE BROWSER HALF NEEDS NOTHING THE PAGE CANNOT GIVE IT. It is authored as
 *     ordinary ESM and served as a bundle, and it imports nothing at all — checked
 *     because a `require` the page's module table cannot satisfy fails at mount, in
 *     the page, with no line to point at.
 *
 *   · IT REGISTERS ITSELF THE WAY DSH'S PAGE LOADS IT. The source is executed against
 *     a stub `window.__ModuleLoader__`, the factory is materialised, and `apply` is
 *     called — so a bundle that registers wrongly, or throws inside its factory,
 *     fails here rather than in the conversation.
 *
 * Network calls are not made: only the refusal path of `previewOf` is driven, and
 * every case in it is decided before a socket is opened.
 *
 * Usage:  node Tools/test-link-preview.mjs
 */

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(HERE, 'link-preview')
const HOST = join(SOURCE, 'host.mjs')
const CLIENT = join(SOURCE, 'client.mjs')
const BUILT = join(SOURCE, 'lib', 'client.js')
const BUILDER = join(HERE, 'build-link-preview.mjs')

let passed = 0
const failures = []
function check (what, ok, detail = '') {
  if (ok) { passed++ } else { failures.push(what + (detail ? ' — ' + detail : '')) }
}

/* ------------------------------------------------------------------ *
 * 1. The security boundary
 * ------------------------------------------------------------------ */

const host = await import(pathToFileURL(HOST).href)
const { inspect, privateHost, previewOf, ROUTE, name, inject } = host

for (const [what, url] of [
  ['a file: URL', 'file:///etc/passwd'],
  ['a data: URL', 'data:text/html,<h1>x</h1>'],
  ['a javascript: URL', 'javascript:alert(1)'],
  ['a ftp: URL', 'ftp://example.com/x'],
  ['something that is not a URL at all', 'not a url'],
  ['an empty string', '']
]) {
  const r = inspect(url)
  check('inspect refuses ' + what, Boolean(r.reason) && !r.url, JSON.stringify(r))
}

for (const [what, url] of [
  ['loopback by name', 'http://localhost/x'],
  ['loopback by literal', 'http://127.0.0.1/x'],
  ['the 10/8 private range', 'http://10.0.0.5/x'],
  ['the 192.168/16 private range', 'http://192.168.1.1/x'],
  ['the 172.16/12 private range', 'http://172.16.4.4/x'],
  ['link-local', 'http://169.254.1.1/x'],
  ['a .local name', 'http://printer.local/x'],
  ['a .internal name', 'http://db.internal/x'],
  ['carrier-grade NAT', 'http://100.64.0.1/x'],
  ['IPv6 loopback', 'http://[::1]/x']
]) {
  check('privateHost catches ' + what, privateHost(new URL(url).hostname) === true, url)
}

for (const [what, url] of [
  ['a username', 'https://user@example.com/x'],
  ['a password', 'https://user:pass@example.com/x']
]) {
  check('a URL with ' + what + ' is refused', Boolean(inspect(url).reason), url)
}

check('an ordinary https URL is accepted', Boolean(inspect('https://en.wikipedia.org/wiki/Mycology').url))
check('an ordinary http URL is accepted', Boolean(inspect('http://example.com/').url))

/* ------------------------------------------------------------------ *
 * 2. previewOf refuses on the same fence, without a socket
 * ------------------------------------------------------------------ */

{
  for (const bad of ['file:///etc/passwd', 'http://127.0.0.1:8080/x', 'https://u:p@example.com/x', 'nonsense']) {
    const r = await previewOf(bad)
    check('previewOf refuses ' + JSON.stringify(bad), r && r.ok === false && typeof r.reason === 'string',
      JSON.stringify(r))
  }
}

/* ------------------------------------------------------------------ *
 * 3. It is a route, and the halves agree on it
 * ------------------------------------------------------------------ */

{
  check('the host declares a route', typeof ROUTE === 'string' && ROUTE.startsWith('/'),
    String(ROUTE))
  check('the plugin names itself', name === 'link-preview', String(name))
  check('it requires the web server', Array.isArray(inject) && inject.includes('webServer'),
    JSON.stringify(inject))

  const client = readFileSync(CLIENT, 'utf8')
  check('the browser half asks the host at the declared route', client.includes(ROUTE), ROUTE)
  check('the browser half never fetches a third-party origin directly',
    !/fetch\(\s*[`'"]https?:\/\//.test(client))
}

/* ------------------------------------------------------------------ *
 * 4. It registers the way the page loads it, as BUILT
 * ------------------------------------------------------------------ */

// The source is ordinary ESM and cannot run in a page: the builder strips its
// exports and rewrites its imports into the page's `require`. So the bundle is
// really built into a throwaway harness home and the ARTIFACT is loaded here,
// which is the only thing the page ever sees.
const HOME = mkdtempSync(join(tmpdir(), 'mimir-lp-home-'))
{
  let built = null
  try {
    execFileSync(process.execPath, [BUILDER], {
      encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DSH_HOME: HOME }
    })
    built = readFileSync(join(HOME, 'profiles', 'web', 'node_modules', 'dsh-link-preview', 'lib', 'client.js'), 'utf8')
  } catch (e) { built = null }
  check('the builder produces the browser bundle', typeof built === 'string' && built.length > 1000,
    built === null ? 'the build failed' : String(built.length))

  if (built) {
    check('the bundle needs nothing the page cannot give it', !/\brequire\(/.test(built),
      'a require the module table cannot satisfy fails at mount')
    check('the bundle keeps its breadcrumb for the console',
      /__ModuleLoader__/.test(built) && /loaded/.test(built))

    let plugin = null
    let factoryThrew = null
    const win = {
      __ModuleLoader__: {
        load: ({ factory }) => {
          try { plugin = factory(id => { throw new Error('the bundle required ' + id) }) }
          catch (e) { factoryThrew = e }
        }
      }
    }
    let threw = null
    try {
      // eslint-disable-next-line no-new-func
      new Function('window', built)(win)
    } catch (e) { threw = e }

    check('the built bundle evaluates without throwing', threw === null, threw && threw.message)
    check('its factory materialises without throwing', factoryThrew === null, factoryThrew && factoryThrew.message)
    check('the bundle registers a plugin', plugin !== null && typeof plugin.apply === 'function')
    // The browser half listens on the document and needs nothing composed first,
    // which is why its `inject` is empty. The HOST half is the one that requires
    // the web server, and that is checked above.
    check('the browser half requires nothing before it can run',
      Array.isArray(plugin?.inject) && plugin.inject.length === 0, JSON.stringify(plugin?.inject))
  } else {
    for (const s of ['the bundle needs nothing the page cannot give it', 'the bundle keeps its breadcrumb for the console',
      'the built bundle evaluates without throwing', 'its factory materialises without throwing',
      'the bundle registers a plugin', 'the browser half requires nothing before it can run']) check(s, false, 'no bundle was built')
  }
}

/* ------------------------------------------------------------------ *
 * 5. The route is really registered
 * ------------------------------------------------------------------ */

{
  const registered = []
  let effectCount = 0
  const ctx = {
    effect: (fn) => { effectCount++; return fn() },
    webServer: { register: (row) => { registered.push(row); return () => {} } }
  }
  let threw = null
  try { host.apply(ctx) } catch (e) { threw = e }

  check('apply registers exactly one route', threw === null && registered.length === 1,
    threw ? threw.message : String(registered.length))
  check('the route is registered on the path the card asks for', registered[0]?.path === ROUTE,
    String(registered[0]?.path))
  check('the route is an exact match, not a prefix', registered[0]?.kind === 'exact',
    String(registered[0]?.kind))
  check('the route is wrapped in an effect, so it is torn down', effectCount === 1, String(effectCount))
}

/* ------------------------------------------------------------------ *
 * 6. A handler really answers, and refuses
 * ------------------------------------------------------------------ */

{
  const registered = []
  host.apply({
    effect: (fn) => fn(),
    webServer: { register: (row) => { registered.push(row); return () => {} } }
  })
  const handler = registered[0].handler

  const fakeRes = () => {
    const r = { statusCode: 200, headers: {}, body: '', ended: false }
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v }
    r.end = (b) => { r.ended = true; if (b !== undefined) r.body = String(b) }
    return r
  }

  // A POST is not a preview.
  const post = fakeRes()
  await handler({ method: 'POST', url: ROUTE + '?url=https://example.com/' }, post)
  check('a non-GET method is refused with 405', post.statusCode === 405, String(post.statusCode))
  check('and it says what is allowed', post.headers.allow === 'GET, HEAD', String(post.headers.allow))

  // No url parameter at all.
  const bare = fakeRes()
  await handler({ method: 'GET', url: ROUTE }, bare)
  check('a request with no url answers 400', bare.statusCode === 400, String(bare.statusCode))
  check('and the JSON says why', /no url/.test(bare.body), bare.body)

  // A refused URL comes back as an ordinary answer with a reason, not a crash.
  const bad = fakeRes()
  await handler({ method: 'GET', url: ROUTE + '?url=' + encodeURIComponent('file:///etc/passwd') }, bad)
  check('a refused url answers 200 with ok:false', bad.statusCode === 200 && /"ok":false/.test(bad.body),
    bad.statusCode + ' ' + bad.body)
  check('the refusal carries a reason a person can read', /"reason":"[^"]+"/.test(bad.body), bad.body)
  check('the answer is not cached', bad.headers['cache-control'] === 'no-store',
    String(bad.headers['cache-control']))
}

/* ------------------------------------------------------------------ *
 * 7. The builder is idempotent and truthful
 * ------------------------------------------------------------------ */

{
  // A harness home with nothing installed is the ordinary state on a fresh clone,
  // and must report rather than crash.
  const empty = mkdtempSync(join(tmpdir(), 'mimir-lp-empty-'))
  const missing = (() => {
    try {
      return { ok: true, out: execFileSync(process.execPath, [BUILDER, '--check'],
        { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DSH_HOME: empty } }) }
    } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') } }
  })()
  check('--check reports a missing install instead of crashing',
    !missing.ok && /missing|not installed|no link-preview/i.test(missing.out), missing.out.slice(0, 200))
  rmSync(empty, { recursive: true, force: true })
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

rmSync(HOME, { recursive: true, force: true })

for (const f of failures) console.log('FAIL  ' + f)
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
