/* Generated from client.mjs and Tools/mimir-tokens.json by Tools/build-link-preview.mjs — do not edit by hand. */
// A breadcrumb the page can be asked about later: `loaded` true with `applied` false
// means the factory threw, and the throw is re-raised so it stays loud in the console.
window.__LINK_PREVIEW__ = { loaded: true, applied: false, error: "" };
(function () {
try {
window.__ModuleLoader__.load({
	id: "dsh-link-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/* The vault's palette, read from Tools/mimir-tokens.json at build time. */
		const MIMIR = {"light":{"paper":"#faf6ea","paper-2":"#f2ead6","paper-3":"#e9dfc6","canvas":"#fbfaf6","ink":"#25231d","ink-2":"#5d5749","ink-3":"#665e4c","rule":"#e3d9c1","rule-soft":"#eadfc8","line":"#c9bc9e","mark":"#4f7a5c","mark-soft":"#dbe8d4","mint":"#2f7d63","peach":"#b5642f","peach-soft":"#f4e7d6","cyan":"#2c6b7a"},"dark":{"paper":"#06070d","paper-2":"#0b0e18","paper-3":"#121724","canvas":"#eaf6fb","ink":"#dbeaf2","ink-2":"#9db8c6","ink-3":"#7f9dad","rule":"#182031","rule-soft":"#1e2739","line":"#2a3550","mark":"#8fd6a4","mark-soft":"#1e3830","mint":"#a6e3bd","peach":"#f0b183","peach-soft":"#33261d","cyan":"#95d7de"}}

		/**
		 * Link previews, browser half.
		 *
		 * WHAT IT DOES. Hover a link in the conversation and, after a moment's
		 * hesitation, a card opens beside it: the page's title, its opening paragraph,
		 * its lead image, and the host it came from. It is the Hoverlay gesture from the
		 * vault, in the place the lessons are actually read. Wikipedia gets the richer
		 * card because the host half can ask Wikimedia's summary API for the article's
		 * own opening paragraph rather than scraping a page.
		 *
		 * WHY IT LISTENS ON THE DOCUMENT AND NOT IN A COMPONENT. The links that matter
		 * are drawn by DSH's markdown renderer, inside rows this plugin does not own and
		 * must not replace: a hover card is a property of a link, not a new kind of
		 * conversation node. So nothing is patched and nothing is intercepted — one
		 * pointerover listener on the document, one card element on the body. That also
		 * means this plugin cannot break the transcript, which is the same discipline the
		 * skin follows: the worst failure available here is a card that does not open.
		 *
		 * WHY THE HESITATION. Without it, dragging the pointer across a paragraph of
		 * links fires a request per anchor. A short delay means only the link the pointer
		 * actually settled on is asked about, and a link that has already answered is
		 * answered from memory — the same URL is hovered many times in one session.
		 *
		 * WHERE THE PICTURE COMES FROM. The page cannot fetch anything but itself
		 * (`connect-src 'self'`), so the card asks this plugin's own host half, which
		 * does the fetching beside the workspace. This half never sees a third-party
		 * origin; it sees one loopback URL that answers JSON.
		 *
		 * @module dsh-link-preview/client
		 */

		/**
		 * How long the pointer must rest on a link before the card is asked for, and how
		 * long a fetched preview is kept before the same link is asked about again.
		 */
		const HESITATE_MS = 140
		const CACHE_MS = 10 * 60 * 1000
		const CACHE_MAX = 64

		/** The host half's route. Relative, because the page and the route share an origin. */
		const ENDPOINT = '/plugins/link-preview/preview'

		/** The card's class prefix, so nothing else in the product can collide with it. */
		const NS = 'mm-preview'

		/**
		 * The card's stylesheet, built once.
		 *
		 * Every colour is read from the Mimir token layer the skin stacks onto `<body>`,
		 * with the palette's own value as the fallback — so the card is the vault's paper
		 * and ink when the skin is composed, and is still legible if it is ever composed
		 * without it. The palette reaches the page as `--mm-*`, which is why nothing here
		 * restates a hex from `Tools/mimir-tokens.json`: a colour written twice is a
		 * colour that will disagree with itself.
		 */
		const CSS = `
		.${NS} { position: fixed; z-index: 2147483000; pointer-events: none; width: min(392px, calc(100vw - 32px)); }
		.${NS}__card { pointer-events: auto; background: var(--mm-paper, #faf6ea); color: var(--mm-ink, #25231d);
		  border: 1px solid var(--mm-rule, #e3d9c1); box-shadow: 4px 4px 0 var(--mm-rule, #e3d9c1);
		  padding: 12px 14px 11px; font-family: var(--mm-serif, "Iowan Old Style", Palatino, Georgia, serif); }
		.${NS}__head { display: flex; align-items: center; gap: 8px; font-family: var(--mm-mono, ui-monospace, "SF Mono", Menlo, monospace);
		  font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--mm-ink-2, #5d5749); }
		.${NS}__site { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.${NS}__kind { margin-left: auto; color: var(--mm-mark, #4f7a5c); border: 1px solid var(--mm-mark-soft, #dbe8d4); padding: 0 5px; }
		.${NS}__body { display: flex; gap: 12px; margin-top: 9px; }
		.${NS}__text { min-width: 0; flex: 1 1 auto; }
		.${NS}__title { font-size: 16px; line-height: 22px; color: var(--mm-ink, #25231d); margin: 0; }
		.${NS}__desc { font-size: 13.5px; line-height: 20px; color: var(--mm-ink-2, #5d5749); margin: 6px 0 0; }
		.${NS}__img { flex: 0 0 auto; width: 84px; height: 84px; object-fit: cover; background: var(--mm-paper-3, #e9dfc6); border: 1px solid var(--mm-rule, #e3d9c1); }
		.${NS}__note { font-family: var(--mm-mono, ui-monospace, Menlo, monospace); font-size: 11px; line-height: 17px; color: var(--mm-ink-2, #5d5749); margin: 8px 0 0; }
		.${NS}__foot { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--mm-rule-soft, #eadfc8);
		  font-family: var(--mm-mono, ui-monospace, Menlo, monospace); font-size: 10.5px; color: var(--mm-ink-2, #5d5749);
		  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		`

		/** The element the card is drawn into, the stylesheet tag, and the timer/listeners. */
		let host = null
		let styleTag = null
		let timer = null
		let current = null
		let added = false
		/** URL → { at, payload } — what has already been asked, so a re-hover is free. */
		const cache = new Map()

		/** The anchor under an event, if it is one worth previewing. */
		function anchorFrom (target) {
		  const element = target && target.closest ? target.closest('a[href]') : null
		  if (!element) return null
		  if (typeof element.closest === 'function' && element.closest('.' + NS)) return null
		  const href = element.href || ''
		  if (!/^https?:\/\//i.test(href)) return null
		  return element
		}

		/** A payload from the cache, or null when it is absent or stale. */
		function cached (url) {
		  const hit = cache.get(url)
		  if (!hit) return null
		  if (Date.now() - hit.at > CACHE_MS) {
		    cache.delete(url)
		    return null
		  }
		  return hit.payload
		}

		/** Keep the cache small, oldest first — a session can hover a great many links. */
		function remember (url, payload) {
		  if (cache.size >= CACHE_MAX) {
		    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 8)
		    for (const [key] of oldest) cache.delete(key)
		  }
		  cache.set(url, { at: Date.now(), payload })
		}

		/**
		 * Ask the host half about a URL.
		 *
		 * @param url - the absolute http(s) link.
		 * @returns the payload, or a payload-shaped failure the card can render.
		 */
		async function ask (url) {
		  const hit = cached(url)
		  if (hit) return hit
		  try {
		    const response = await fetch(ENDPOINT + '?url=' + encodeURIComponent(url), {
		      headers: { accept: 'application/json' },
		      credentials: 'same-origin'
		    })
		    if (!response.ok) return { ok: false, reason: 'the preview service answered ' + response.status, url }
		    const payload = await response.json()
		    remember(url, payload)
		    return payload
		  } catch {
		    return { ok: false, reason: 'the preview service could not be reached', url }
		  }
		}

		/** Where the card should sit: under the link, flipped above or clamped when it must be. */
		function place (rect, card) {
		  const width = card.offsetWidth || 392
		  const height = card.offsetHeight || 160
		  const margin = 12
		  const below = window.innerHeight - rect.bottom
		  const top = below < height + 20 && rect.top > height + 20 ? rect.top - height - 8 : rect.bottom + 8
		  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
		  return { top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)), left }
		}

		/** The card, as an element — one function per shape, so nothing is built twice. */
		/**
		 * The card, built as ordinary DOM.
		 *
		 * WHY NOT REACT, WHICH THIS FILE USED FIRST AND GOT WRONG. It built the card as a
		 * React element and then handed that element to `host.replaceChildren`. A React
		 * element is a plain object describing a node, not a node: the DOM cannot mount
		 * one, so it stringified it — the card that appeared in the app said, in full,
		 * `[object Object]`. The page's React could have mounted it, but importing
		 * `react-dom/client` to draw four elements would add a dependency and a root to
		 * manage for nothing, and the rest of this half is deliberately free of both. So
		 * the card is `createElement`/`textContent` throughout, and every value is written
		 * as text rather than inserted as markup — a page's own metadata is text.
		 *
		 * @param payload - what the host half answered, or the placeholder a cache miss shows.
		 * @returns the card element.
		 */
		function render (payload) {
		  const card = document.createElement('div')
		  card.className = NS + '__card'

		  const head = document.createElement('div')
		  head.className = NS + '__head'
		  const site = document.createElement('span')
		  site.className = NS + '__site'
		  site.textContent = payload.site || 'link'
		  const kind = document.createElement('span')
		  kind.className = NS + '__kind'
		  kind.textContent = payload.source === 'wikipedia' ? 'wikipedia' : 'page'
		  head.appendChild(site)
		  head.appendChild(kind)
		  card.appendChild(head)

		  if (!payload.ok) {
		    const note = document.createElement('p')
		    note.className = NS + '__note'
		    note.textContent = payload.reason || 'no preview is available for this link'
		    card.appendChild(note)
		  } else {
		    const body = document.createElement('div')
		    body.className = NS + '__body'
		    const text = document.createElement('div')
		    text.className = NS + '__text'
		    const title = document.createElement('p')
		    title.className = NS + '__title'
		    title.textContent = payload.title || shorten(payload.url || '')
		    text.appendChild(title)
		    if (payload.description) {
		      const description = document.createElement('p')
		      description.className = NS + '__desc'
		      description.textContent = payload.description
		      text.appendChild(description)
		    }
		    body.appendChild(text)
		    if (payload.image) {
		      const image = document.createElement('img')
		      image.className = NS + '__img'
		      image.setAttribute('src', payload.image)
		      image.setAttribute('alt', '')
		      image.setAttribute('loading', 'lazy')
		      image.setAttribute('referrerpolicy', 'no-referrer')
		      body.appendChild(image)
		    }
		    card.appendChild(body)
		  }

		  const foot = document.createElement('div')
		  foot.className = NS + '__foot'
		  foot.textContent = shorten(payload.url || '')
		  card.appendChild(foot)
		  return card
		}

		/** A URL a person can read: no scheme, no trailing slash. */
		function shorten (url) {
		  return String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '')
		}

		/** Remove the card and forget what it was showing. */
		function close () {
		  if (timer !== null) {
		    clearTimeout(timer)
		    timer = null
		  }
		  current = null
		  if (host !== null) host.style.display = 'none'
		}

		/**
		 * Open the card for an anchor, positioned against it now and again when it grows.
		 *
		 * @param anchor - the anchor being hovered.
		 */
		function open (anchor) {
		  const url = anchor.href
		  const rect = anchor.getBoundingClientRect()
		  current = url
		  const card = render(cached(url) || { ok: true, title: '', url })
		  host.replaceChildren(card)
		  host.style.display = 'block'
		  const at = place(rect, card)
		  host.style.top = at.top + 'px'
		  host.style.left = at.left + 'px'

		  ask(url).then((payload) => {
		    // The pointer may have moved on, or the card been dismissed, while that was in
		    // flight. A late answer must not reopen a card nobody is hovering.
		    if (current !== url || host.style.display === 'none') return
		    const element = render(payload)
		    host.replaceChildren(element)
		    const settled = place(rect, element)
		    host.style.top = settled.top + 'px'
		    host.style.left = settled.left + 'px'
		  })
		}

		/** Hover intent: schedule the card, and let a second event cancel it. */
		function onOver (event) {
		  if (event.pointerType !== undefined && event.pointerType !== 'mouse') return
		  const anchor = anchorFrom(event.target)
		  if (anchor === null) return
		  if (current === anchor.href && host !== null && host.style.display === 'block') return
		  if (timer !== null) clearTimeout(timer)
		  timer = setTimeout(() => {
		    timer = null
		    open(anchor)
		  }, HESITATE_MS)
		}

		/** The pointer left something: close only when it left the link that owns the card. */
		function onOut (event) {
		  const anchor = anchorFrom(event.target)
		  if (anchor === null) return
		  if (event.relatedTarget && anchor.contains(event.relatedTarget)) return
		  close()
		}

		/** Scrolling or resizing moves the link; the card is fixed, so it must close. */
		function onMove () {
		  close()
		}

		/** Escape closes the card without touching anything else. */
		function onKey (event) {
		  if (event.key === 'Escape') close()
		}

		/** Attach the card element, the listeners and the stylesheet. */
		function add () {
		  if (added) return
		  added = true
		  host = document.createElement('div')
		  host.className = NS
		  host.style.display = 'none'
		  host.setAttribute('role', 'tooltip')
		  document.body.appendChild(host)

		  styleTag = document.createElement('style')
		  styleTag.setAttribute('data-link-preview', '1')
		  styleTag.textContent = CSS
		  document.head.appendChild(styleTag)

		  document.addEventListener('pointerover', onOver, true)
		  document.addEventListener('pointerout', onOut, true)
		  document.addEventListener('pointerdown', onMove, true)
		  window.addEventListener('scroll', onMove, true)
		  window.addEventListener('resize', onMove, true)
		  document.addEventListener('keydown', onKey, true)
		}

		/** Take the card and the listeners away, leaving the page as it was found. */
		function remove () {
		  if (!added) return
		  added = false
		  document.removeEventListener('pointerover', onOver, true)
		  document.removeEventListener('pointerout', onOut, true)
		  document.removeEventListener('pointerdown', onMove, true)
		  window.removeEventListener('scroll', onMove, true)
		  window.removeEventListener('resize', onMove, true)
		  document.removeEventListener('keydown', onKey, true)
		  close()
		  if (host !== null && host.parentNode) host.parentNode.removeChild(host)
		  if (styleTag !== null && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag)
		  host = null
		  styleTag = null
		  cache.clear()
		}

		/** The plugin half's entry point. */
		function apply (ctx) {
		  ctx.effect(() => {
		    add()
		    return () => remove()
		  }, 'link-preview: the hover card')
		}

		/** Nothing is required before this half can run: it only listens to the document. */
		const inject = []

		exports.apply = apply
		exports.inject = inject
		window.__LINK_PREVIEW__.applied = true;
		return module.exports;
	}
});
} catch (error) {
	window.__LINK_PREVIEW__.error = String(error && error.message ? error.message : error);
	throw error;
}
})();
