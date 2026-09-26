/**
 * Link previews, host half.
 *
 * WHY THE HOST AND NOT THE PAGE. The page is served under
 * `default-src 'self'; connect-src 'self'`, so a fetch to Wikipedia from the
 * conversation is refused by the browser before a byte leaves — verified, not
 * assumed: the policy is written in the desktop shell's own response header
 * (`out/main/index.js`, the index handler). An iframe is not the way round it
 * either: Wikipedia sends `X-Frame-Options` and the conversation is not allowed
 * to frame it. So the only place a preview can be fetched from is here, beside
 * the workspace, behind the same loopback address the page already trusts.
 *
 * ONE ROUTE, TWO SHAPES. `GET /plugins/link-preview/preview?url=<absolute http(s)>`
 * answers `{ ok: true, kind, title, description, image, site, url }`, or
 * `{ ok: false, reason }` with a reason a person can read. `kind` is `"wikipedia"`
 * when the page came from the Wikimedia REST summary API — title, description,
 * opening paragraph and thumbnail, in one JSON call — and `"meta"` when it was
 * fetched as HTML and the Open Graph / meta tags were read out of it. Neither
 * shape is a claim that the preview is complete: a page with no metadata answers
 * with the hostname and nothing else, which is still better than an empty card.
 *
 * WHAT IT REFUSES. This is a server-side fetch reachable from the page, so it is
 * written as one: http and https only, no credentials in the URL, no redirect to
 * a private address, redirects capped, the body capped while it is read rather
 * than after, and a hard timeout on the whole request. A refusal is an ordinary
 * answer, not an exception — the card says why it is empty.
 *
 * WHY THIS FILE IMPORTS NOTHING. Same reason as the board's host half: a profile
 * plugin is resolved by package name from the profile directory, but Node
 * resolves imports INSIDE it from the file's real path, where no `node_modules`
 * above it holds the harness' own packages. `ctx.webServer.register` and
 * `ctx.effect` need no import, so this file depends on nothing at all.
 *
 * @module dsh-link-preview/host
 */

/** The route the page asks, and the prefix it must beat (`/plugins` serves bundles). */
const ROUTE = '/plugins/link-preview/preview'

/** How long the whole fetch may take, and how much of a body will be read. */
const TIMEOUT_MS = 6000
const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 3

/** A browser-ish identity, because several sites answer a bare fetch with nothing. */
const AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) DSHLinkPreview/1.0 Safari/537.36'

const WIKI_HOST = /^([a-z-]+\.)?(m\.)?(wikipedia|wikimedia|wiktionary|wikisource|wikibooks|wikiquote|wikinews|wikiversity|wikivoyage)\.org$/i

/* ------------------------------------------------------------------ *
 * What may be fetched
 * ------------------------------------------------------------------ */

/**
 * The URL to fetch, or a readable reason it will not be fetched.
 *
 * A private address is refused AFTER redirects too, not only here: a public host
 * that answers `302 http://127.0.0.1:43129/...` would otherwise walk this route
 * round the fence, which is the one way a fetch from here reaches something the
 * page could not.
 *
 * @param raw - the `url` query parameter.
 * @returns the parsed URL, or a reason.
 */
function inspect (raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    return { reason: 'not a URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { reason: 'only http and https links can be previewed' }
  if (url.username !== '' || url.password !== '') return { reason: 'a link carrying a username or password is not previewed' }
  if (privateHost(url.hostname)) return { reason: 'a local address is not previewed' }
  return { url }
}

/** True for loopback, link-local, and the private ranges — by name or by literal. */
function privateHost (hostname) {
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!v4) return host.endsWith('.local') || host.endsWith('.internal')
  const [a, b] = [Number(v4[1]), Number(v4[2])]
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

/** Read a response body, stopping at the cap rather than trusting content-length. */
async function readCapped (response, cap) {
  const chunks = []
  let total = 0
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      chunks.push(value)
      if (total >= cap) {
        await reader.cancel().catch(() => {})
        break
      }
    }
  } else {
    const buffer = await response.arrayBuffer()
    total = buffer.byteLength
    chunks.push(new Uint8Array(buffer.slice(0, cap)))
  }
  const out = new Uint8Array(Math.min(total, cap))
  let at = 0
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, out.byteLength - at)
    if (take <= 0) break
    out.set(chunk.subarray(0, take), at)
    at += take
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(out)
}

/** Every response header as a plain object, whatever shape the runtime gave. */
function headersOf (response) {
  const out = {}
  if (response.headers && typeof response.headers.forEach === 'function') {
    response.headers.forEach((value, key) => { out[String(key).toLowerCase()] = value })
  }
  return out
}

/**
 * Fetch a URL with the fence applied at every hop.
 *
 * @param rawUrl - an absolute http(s) URL.
 * @param accept - the Accept header to send.
 * @param fetchImpl - the fetch to use, injectable so a test needs no network.
 * @returns the response, its text, and the URL it actually landed on.
 */
async function fetchOnce (rawUrl, accept, fetchImpl) {
  let url = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response
    try {
      response = await fetchImpl(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept, 'user-agent': AGENT, 'accept-language': 'en-GB,en;q=0.8' }
      })
    } finally {
      clearTimeout(timer)
    }
    if (response.status >= 300 && response.status < 400) {
      const location = headersOf(response).location
      if (!location) return { response, text: '', url }
      let next
      try {
        next = new URL(location, url)
      } catch {
        return { response, text: '', url }
      }
      const seen = inspect(next.href)
      if (seen.reason) throw new Error('redirect to ' + seen.reason)
      url = next.href
      continue
    }
    const text = await readCapped(response, MAX_BYTES)
    return { response, text, url }
  }
  throw new Error('too many redirects')
}

/* ------------------------------------------------------------------ *
 * Reading a page
 * ------------------------------------------------------------------ */

/** The `<meta>` content for a name or property, property first, both spellings tried. */
function meta (html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp('<meta[^>]+(?:property|name)\\s*=\\s*["\']' + escaped + '["\'][^>]*?content\\s*=\\s*["\']([^"\']*)["\']', 'i'),
      new RegExp('<meta[^>]+content\\s*=\\s*["\']([^"\']*)["\'][^>]*?(?:property|name)\\s*=\\s*["\']' + escaped + '["\']', 'i')
    ]
    for (const pattern of patterns) {
      const found = pattern.exec(html)
      if (found && found[1].trim() !== '') return decodeEntities(found[1].trim())
    }
  }
  return ''
}

/** The document title, with its whitespace collapsed. */
function titleTag (html) {
  const found = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return found ? decodeEntities(found[1]).replace(/\s+/g, ' ').trim() : ''
}

/** The five entities that actually arrive in metadata, decoded after unescaping. */
function decodeEntities (text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, digits) => codePoint(Number(digits)))
    .replace(/&amp;/g, '&')
}

function codePoint (value) {
  try {
    return Number.isFinite(value) ? String.fromCodePoint(value) : ''
  } catch {
    return ''
  }
}

/** Strip tags and collapse whitespace — for an extract that may carry a little HTML. */
function plain (html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** One sentence or three, whichever fits the card — never a wall of text. */
function clamp (text, limit) {
  const clean = plain(text)
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  const body = stop > limit * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…'
  return body
}

/** An image URL that survives the trip into an `<img src>`. */
function imageUrl (raw, base) {
  const value = String(raw || '').trim()
  if (value === '') return ''
  if (value.startsWith('//')) return 'https:' + value
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

/** The bare hostname, for the card's footer line. */
function siteOf (url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ *
 * The two preview shapes
 * ------------------------------------------------------------------ */

/**
 * A Wikipedia (or sibling project) page, through the REST summary API.
 *
 * The summary endpoint is the one that answers with the article's own opening
 * paragraph and its lead image, CORS-open and JSON, and it follows the redirect
 * for a title that is not canonical. A page with no summary — a talk page, a
 * special page, a red link — is not a failure; it falls back to the HTML route.
 *
 * @param url - the Wikipedia URL being previewed.
 * @param fetchImpl - the fetch to use.
 * @returns the preview, or null when the API had nothing to say.
 */
async function wikipediaPreview (url, fetchImpl) {
  const host = url.hostname.replace(/^www\.|^m\./, '')
  const lang = host.slice(0, host.indexOf('.'))
  const title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ''))
  if (title === '' || title === url.pathname) return null
  const api = 'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title) + '?redirect=true'
  const { response, text } = await fetchOnce(api, 'application/json', fetchImpl)
  if (response.status !== 200) return null
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const body = typeof data.extract === 'string' && data.extract !== '' ? data.extract : (data.description || '')
  if (body === '') return null
  return {
    kind: 'wikipedia',
    title: String(data.title || title.replace(/_/g, ' ')),
    description: clamp(body, 420),
    image: imageUrl((data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source) || '', api),
    site: lang + '.wikipedia.org',
    url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || url.href
  }
}

/** Any other page, through its own metadata — or null when the page has none to give. */
function metaPreview (url, html) {
  const heading = meta(html, ['og:title', 'twitter:title'])
  const tagline = meta(html, ['og:description', 'twitter:description', 'description'])
  const image = imageUrl(meta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']), url.href)
  const site = meta(html, ['og:site_name']) || siteOf(url.href)
  // A page with neither a declared title nor a title tag has nothing to preview. The
  // hostname alone is not a preview — it is already written on the link — so this is
  // answered as a refusal rather than as a card that says only where the link goes.
  const title = heading || titleTag(html)
  if (title === '' && tagline === '') return null
  return {
    kind: 'meta',
    title: plain(title),
    description: clamp(tagline, 320),
    image,
    site,
    url: meta(html, ['og:url']) || url.href
  }
}

/**
 * Preview one link.
 *
 * @param raw - the URL asked about.
 * @param options - `{ fetch }` to override the network, for a test.
 * @returns the payload the route answers with — never throws.
 */
async function previewOf (raw, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch
  const seen = inspect(raw)
  if (seen.reason) return { ok: false, reason: seen.reason, url: String(raw || '') }
  const url = seen.url
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no fetch available on this host', url: url.href }

  if (WIKI_HOST.test(url.hostname) && url.pathname.startsWith('/wiki/')) {
    try {
      const wiki = await wikipediaPreview(url, fetchImpl)
      if (wiki) return { ok: true, ...wiki, source: 'wikipedia' }
    } catch {
      /* Fall through to the HTML route rather than failing the card: the article
         page still carries its own title and description. */
    }
  }

  try {
    const accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
    const { response, text, url: landed } = await fetchOnce(url.href, accept, fetchImpl)
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: 'the page answered ' + response.status, url: url.href }
    }
    const finalUrl = new URL(landed)
    const preview = metaPreview(finalUrl, text)
    if (preview === null) {
      return { ok: false, reason: 'the page carries no title or description', url: finalUrl.href }
    }
    return { ok: true, ...preview, source: 'meta' }
  } catch (error) {
    const message = error && error.name === 'AbortError' ? 'the page took too long' : 'the page could not be fetched'
    return { ok: false, reason: message, url: url.href }
  }
}

/* ------------------------------------------------------------------ *
 * The route
 * ------------------------------------------------------------------ */

/** One JSON answer, with the headers a page fetch from the page needs. */
function sendJson (res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(payload.byteLength))
  res.end(payload)
}

/** The `url` parameter of a request, or null. */
function urlParam (req) {
  try {
    const asked = new URL(String(req.url), 'http://localhost').searchParams.get('url')
    return asked && asked.trim() !== '' ? asked : null
  } catch {
    return null
  }
}

/**
 * Register the preview route.
 *
 * @param ctx - the composition's context, carrying the web server.
 */
function apply (ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405
        res.setHeader('allow', 'GET, HEAD')
        res.end()
        return
      }
      const asked = urlParam(req)
      if (asked === null) {
        sendJson(res, 400, { ok: false, reason: 'no url was asked about' })
        return
      }
      const payload = await previewOf(asked)
      sendJson(res, 200, payload)
    }
  }), 'link-preview: GET ' + ROUTE)
}

/** The page's fetch route needs the web server; nothing applies until it exists. */
const inject = ['webServer']

/** The package's plugin name, as the composition reports it. */
const name = 'link-preview'

export { apply, previewOf, inspect, privateHost, ROUTE, name, inject }
