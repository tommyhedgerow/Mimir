# dsh-link-preview

A hover preview for links in the DSH conversation. Rest the pointer on a link for a
moment and a card opens beside it: the page's title, its opening paragraph, its lead
image, and the host it came from. Wikipedia links get the richer card, because the plugin
asks Wikimedia's own summary API for the article's opening paragraph instead of scraping
the page.

## Why it is two halves

The conversation is served under a Content-Security-Policy of
`default-src 'self'; connect-src 'self'` — verified in the desktop shell's own response
header, not assumed. So the page cannot fetch Wikipedia: the browser refuses before a byte
leaves. An `<iframe>` is not the way round it either, because Wikipedia sends
`X-Frame-Options` and the conversation may not frame it. The fetch therefore happens in
the **host half**, beside the workspace, behind the loopback address the page already
trusts, and the browser half asks it over one route:

```
GET /plugins/link-preview/preview?url=<absolute http(s)>
→ { ok, kind, title, description, image, site, url, source }   // or { ok: false, reason }
```

The route is a server-side fetch, so it is fenced like one: http and https only, no
credentials in the URL, no redirect into the local machine, redirects capped, the body
capped while it is read, and a hard timeout. A refusal is an ordinary answer with a reason
a person can read, and the card says so rather than staying empty.

## The two shapes

| Link | Where it is read from | What the card carries |
| --- | --- | --- |
| `*.wikipedia.org/wiki/…` (and the sibling projects) | the REST summary API | the article's own title, description, opening paragraph, lead image |
| anything else | the page's HTML | `og:title` / `og:description` / `og:image` / `og:site_name`, falling back to `<title>` |

A Wikipedia page the summary API has no entry for falls back to the HTML route rather than
failing, and a page with no metadata at all is refused by name — the hostname alone is not
a preview, because it is already written on the link.

## Files

| File | What it is |
| --- | --- |
| `client.mjs` | the browser half: a document-level hover listener and one card element on `<body>`, built from plain DOM and importing nothing. It patches nothing in the conversation, so the worst failure available is a card that does not open. |
| `host.mjs` | the host half: the route, the fence, and the two ways of reading a page. |
| `lib/` | the built copies, written by `Tools/build-link-preview.mjs`. Do not edit by hand. |

**One bug worth keeping written down.** The card was first built as a React element and
handed to `replaceChildren`. A React element is an object describing a node, not a node, so
the DOM stringified it and the card in the app read, in full, `[object Object]`. The suite
passed it because the stub DOM in the test accepted any object as a node. The browser half is
now mounted into **jsdom**, which is a real DOM and rejects what a real DOM rejects — that is
the check that would have caught it, and it is the one that now guards it.

## Building and checking

```sh
node Tools/build-link-preview.mjs            # build and install into the DSH profile
node Tools/build-link-preview.mjs --check    # report whether the installed copy is current
node Tools/test-link-preview.mjs             # both halves: the fence, the shapes, the route, the card
```

The build writes the bundle to the vault's `lib/` **and** to the profile's
`node_modules/dsh-link-preview`, declares the package in the profile's `package.json`, and
appends its row to the profile's `cordis.patch.yml`. The row is what composes the plugin;
`dsh.profile.bundles` is the app's own bookkeeping and rewrites itself. The first install
needs one DSH restart to compose the row; after that a rebuild reaches an open page on a
reload, because the browser half is served from the file on disk.
