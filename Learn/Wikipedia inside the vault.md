---
type: note
subjects: [tools]
tags:
  - learn
  - tools
updated:
---

# Wikipedia inside the vault

> What is actually possible for Wikipedia integration, verified against primary sources on **2026-09-17**. Short version: **hover previews and search work, and saving to a Wikipedia list from inside Obsidian is impossible for anyone** — not a plugin anyone has written, but an API Wikipedia does not offer. The rest of this note is what to install and why.

## What is possible, and what survives checking

| Wanted                                             | Verdict                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Preview a linked article on hover                  | **Possible** — `Hoverlay`. The core *Page preview* plugin cannot do it at all.                                        |
| Search Wikipedia from inside the vault             | **Possible** — `Wikipedia Helper`. Inserts links, or creates a note per article.                                      |
| Save an article to a Wikipedia list from the vault | **Not possible, by anyone.** No Obsidian plugin exists, and Wikimedia exposes no public API for it. Workaround below. |

## Hover previews

**Obsidian's built-in Page preview does not work on external links.** Its own documentation says it "lets you preview a page when you hover the cursor over an **internal link**" ([obsidian-help, Page preview](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Page%20preview.md)). Every Wikipedia link in this vault is an external markdown link, so the core plugin is blind to all of them. This is the whole reason a third-party plugin is needed.

**Install `Hoverlay`** — id `hoverlay`, version 0.4.1, released 2026-08-01, by zspatter. It is in Obsidian's official registry ([community.obsidian.md/plugins/hoverlay](https://community.obsidian.md/plugins/hoverlay)) so it installs from the in-app browser: *Settings → Community plugins → Browse → search "Hoverlay"*. It previews a link as a live page, a reader-mode view, or a metadata card, and its own README singles out the Wikipedia case — Wikipedia sends an `X-Frame-Options` header, which is why the older iframe-based preview plugins fail on it. No API key, no third-party preview service; the page is fetched into a sandboxed webview and discarded.

*One caveat, stated rather than buried:* the registry notes it "has not been manually reviewed by Obsidian staff". For a vault that renders pages in a webview, that is worth knowing before installing. Everything it touches is a web page you already linked to.

**The one Wikipedia-specific option, and why it is not recommended.** [szvest/obsidian-wikipedia-link-preview](https://github.com/szvest/obsidian-wikipedia-link-preview) is real — id `wikipedia-link-preview`, v1.0.0 — but it has three disqualifying properties: its last release was **2024-08-14**, it fires **only** on `https://en.wikipedia.org/wiki/...` links, and it is **not in Obsidian's registry at all** (verified: absent from `community-plugins.json` and the stats file), so it cannot be installed from the app despite its README saying otherwise. It would need a manual file install, and its two-year-old release is a compatibility risk.

Also present in the registry if Hoverlay disappoints: `url-preview` ("URL Preview", 0.8.0, 2026-09-08) and `link-preview` ("Link Preview", 0.1.4, 2025-01-28). Both unreviewed; neither is Wikipedia-specific.

## Searching Wikipedia from the vault

**Install `Wikipedia Helper`** — the plugin id is `wikipedia-search`, which is the trap: the display name was changed and **the id was deliberately kept** for backwards compatibility. Id `wikipedia-search`, display name "Wikipedia Helper", by StrangeGirlMurph, version 2.7.3 (2026-08-01), mobile-capable. In-app browser: search "Wikipedia Helper". One project, one repo ([obsidian-wikipedia-helper](https://github.com/StrangeGirlMurph/obsidian-wikipedia-helper)) — not a fork. Docs: [wikipedia-helper.murphy.science](https://wikipedia-helper.murphy.science/commands.html).

What it does that matters here: searches every Wikimedia project and every language (a `nl: term` prefix targets a language), **inserts a link at the cursor**, hyperlinks selected text, **creates a note for an article** from a template, and opens an article straight into a **Web viewer** tab. That last command is load-bearing for the workaround below.

*Avoid* the old `obsidian-wikipedia` plugin (2021, unmaintained) — Wikipedia Helper supersedes it.

## Saving to a Wikipedia list — the honest answer

**No Obsidian plugin does this, and none can.** All 7,729 entries in the community registry were searched for reading-list, watchlist and saved-page terms; the only hits are unrelated read-later apps (Pocket, Instapaper). More decisively, **Wikipedia itself does not expose the capability**:

- Wikipedia's **Reading Lists** reached the web on **14 September 2026** (all other wikis 28 September). A bookmark icon on the article page adds it to a private list, one flat list, capped at 5,000 ([MediaWiki: Reading lists](https://www.mediawiki.org/wiki/Readers/Reader_Experience/Reading_lists)).
- The backend is the **ReadingLists** extension, and it is live on English Wikipedia — but its write endpoint is documented as *"internal or unstable… you should not use it"*, requires an interactive login and a CSRF token, and has **no public OAuth**. So there is no supported way for any external app to add to your list, whether or not someone writes a plugin.
- **Watchlist is a different thing from a reading list** — saving an article does not watch it, and watching does not save it. The watchlist is editable through the authenticated MediaWiki API, which no Obsidian plugin exposes either.

**The workaround, which is two clicks rather than one.** Wikipedia Helper's *Open Article* command puts the article in an Obsidian **Web viewer** tab; the bookmark icon in that page adds it to the list. The article is read in Obsidian, and saved from inside Obsidian — just not by a vault command. Obsidian's own URI scheme cannot open an arbitrary external URL, so there is no shortcut to automate here.

## Clip the whole article instead

For material worth keeping rather than bookmarking, the official **Obsidian Web Clipper** ([obsidian.md/clipper](https://obsidian.md/clipper)) has a Wikipedia-specific template in its official template repo — [`wikipedia-clipper.json`](https://github.com/kepano/clipper-templates/blob/main/templates/wikipedia-clipper.json). It triggers on any `*.wikipedia.org/wiki/...` URL and clips `#mw-content-text` to markdown with title, source, author, description and tags. That lands an article in this vault as a note, which is a different and often better answer than a reading list for anything the sessions actually use. It cannot touch the Wikipedia list; it clips to the vault.

## Install list

Both plugins below are the working setup. **This vault ships with neither of them** — install them from Obsidian's registry (*Settings → Community plugins → Browse*), then **reload Obsidian** (or reopen the vault) before they load: a plugin enabled by editing the config is not running until the app restarts. The core **Web viewer** plugin needs switching on too, because it backs Wikipedia Helper's *Open Article* command, which is what the saving workaround depends on.

| Plugin | Id | Status | Why |
| --- | --- | --- | --- |
| Hoverlay | `hoverlay` | install from the registry | Hover previews, which the core Page preview cannot do on external links |
| Wikipedia Helper | `wikipedia-search` | install from the registry | Search, link insertion, article-to-note, open in Web viewer |
| Web Clipper (browser extension) | n/a | not installed — browser-side | Clip a whole article into the vault, with a Wikipedia template |

**Not recommended, and why:** `wikipedia-link-preview` (unregistry'd, 2024, English-only), `obsidian-wikipedia` (dead since 2021).

### First things to try once it is running

- **Hover any Wikipedia link in a session note** — the preview should open in a floating window. If nothing happens, the plugin has not loaded yet; check *Settings → Community plugins* shows both as enabled.
- **Command palette → Wikipedia Helper.** Search any article, then either insert a link at the cursor or create a note for it in the vault.
- **The saving workflow:** *Open Article* puts the page in a Web viewer tab, and the bookmark icon in that page adds it to the Wikipedia reading list — the two-click path from the section above.

## Sources

- [Obsidian help — Page preview](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Page%20preview.md) — the "internal link" limitation. This single line is why the core plugin cannot do what was wanted.
- [Obsidian community plugins registry](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) — checked directly: 7,729 entries; `wikipedia-search`, `hoverlay`, `url-preview`, `link-preview` confirmed present, `wikipedia-link-preview` confirmed **absent**.
- [community.obsidian.md/plugins/hoverlay](https://community.obsidian.md/plugins/hoverlay) and [GitHub: zspatter/obsidian-hoverlay](https://github.com/zspatter/obsidian-hoverlay) — the X-Frame-Options explanation for why iframe previews fail on Wikipedia.
- [community.obsidian.md/plugins/wikipedia-search](https://community.obsidian.md/plugins/wikipedia-search) and [Wikipedia Helper docs](https://wikipedia-helper.murphy.science/commands.html) — the id/display-name split and the command list.
- [MediaWiki — Reading lists](https://www.mediawiki.org/wiki/Readers/Reader_Experience/Reading_lists) and [Extension:ReadingLists](https://www.mediawiki.org/wiki/Extension:ReadingLists) — what the feature is, and the unstable-and-unauthenticated write API that blocks automation.
- [kepano/clipper-templates](https://github.com/kepano/clipper-templates/blob/main/templates/wikipedia-clipper.json) — the official Wikipedia clipping template.
- [Obsidian help — Web viewer](https://github.com/obsidianmd/obsidian-help/blob/master/en/Plugins/Web%20viewer.md) — the tab the workaround depends on.
