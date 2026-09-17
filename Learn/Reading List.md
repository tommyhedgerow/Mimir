---
type: index
tags:
  - learn
  - reading
updated:
---

# 📚 Reading List

> Books worth reading alongside the sessions, by strand. The rule: **at most one or two per session**, added at the write-back for what a book can carry that a session cannot — a field's whole texture, or an argument that needs a hundred pages rather than a node.
>
> **Published fiction and non-fiction only** — no papers, no journals. Better one that fits than two that pad, and a session that taught nothing adds nothing.

## How the links work

Every book that goes on this list is checked as real — author, title and first publication year — before it is listed, and it carries a link that was confirmed to resolve. Nothing is listed on the strength of a title that sounded right.

**A note on the link rule, because the preference could not be honoured literally.** The natural request is a hardcover retail link where one exists, Goodreads where there is none. Two things stopped that:

- **Goodreads blocks automated verification** — it returns a bot challenge rather than the page, so a Goodreads URL could not be confirmed to resolve to the right edition. An unverifiable link is exactly the thing this vault does not do.
- **The named retailer, Brilliant Books, has been unusable since at least 2026-09-17**: its TLS certificate **expired on 2026-04-07**, and its own root URL answers `403`. A link there would greet the reader with a security warning.

So links go to **Open Library** — free, no bot wall, and its `/works/…` identifiers are canonical, so they do not rot the way a shop URL does. Where Open Library does not carry a work, the link is a verified search or publisher page and says so. **Swap any of them for a Bookshop.org or Goodreads page if preferred — the point of the entry is the book, not the shop.**

**The standard this sets, and the reason for it:** resolve an identifier rather than trust that a URL loads. A plain request to a book-tracking page can return `200` with a bot-verification page behind it, so a click-check proves nothing; an identifier check is what catches a link pointing at an empty record, or at an entirely different book. **This is the standing argument in this vault for resolving identifiers rather than trusting that a URL loads.**

**Every entry takes the same shape**, one line each:

- **[*Title*](link)** — Author (year). One line on what it adds that a session could not.

_No books yet, and that is the rule rather than an omission: a book is added at the write-back for a session that taught something a book can extend. Better one that fits than two that pad._

---

## Earth sciences

_Nothing yet — a book earns its place at the end of a session, for what that session could not carry._

## Life sciences — botany and ecology

_Nothing yet._

## Life sciences — mycology

_Nothing yet._

## Mediterranean — the ground underfoot

_Nothing yet._

## Mythology & folklore

_Nothing yet._

## Chinese philosophy

_Nothing yet._

## Water and climate

_Nothing yet._

## Fiction

_Nothing yet._

## Sources

- **Verification method.** Every title, author and first-publication year is checked against [Open Library](https://openlibrary.org) before it is listed, and the link is then **resolved against Open Library's work API** rather than merely clicked. That distinction matters: a plain request to an Open Library page returns `200` with a *bot-verification* page, so a click-check proves nothing. An API pass is what catches an identifier that points at an empty placeholder record, or at **an entirely different book**.
- **Every link on this list is a real work record.** It resolves to a populated Open Library work, never a search page standing in for a missing one. Where Open Library does not carry a book, the book is simply not listed yet — a gap to fill when a session needs it, never a reason to invent an identifier.
- **Genres excluded by rule.** No academic papers, no journal articles, and no field guides or keys — those are tools rather than reading, and an identification session chooses its own.
