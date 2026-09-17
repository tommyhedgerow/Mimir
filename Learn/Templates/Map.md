---
type: map
subject:
state: in-progress          # in-progress | paused | complete | index
opened:
frontier:                   # one line — where the strand actually stands
next:                       # one line — the next node
nodes: {}                   # graph node id → concept note, once one exists
graph:                      # the spine: structure lives here, not inside a diagram
  goal: "G | what the strand is for"
  foundations:
    - "F1 | the unconditional truth this rests on"
  nodes:                    # planned, with no concept note behind them yet
    - "A | the first node"
  edges:
    - F1 -> A
    - A -> G
tags:
  - learn
  - moc
updated:
---

# {{title}}

> The strand, in dependency order: what rests on what, and where the frontier currently is. Not a list of everything — the load-bearing concepts only.

## Foundations

_The unconditional truths of this strand — or, honestly, the definitions, distinctions and constraints it actually rests on. Note where no clean foundation exists._

- [[]] — 
- [[]] — 

## In dependency order

1. [[]] — 
2. [[]] — 
3. [[]] — 

## Dependency map

_Drawn, not authored. `Tools/vault-chart.mjs` renders it to `Learn/Viz/<filename-slug>.svg` from the `graph:` spine above together with the concept notes — so the colour on a node is that concept's own state: **amber** learning, **red** fragile, **green** established, grey for a node that is still only a plan. Regenerate with `node Tools/vault-chart.mjs` after anything moves. A spine that is a plain chain is drawn as a list instead of a graph, because a chain is a list._

![[<filename-slug>.svg]]

## The frontier

_Where we have got to, and what is next. Read this before planning a session in this strand._

- **Reached**: 
- **Next**: 
- **Fragile**: _(taught but not solid — check before building on it)_

## Where the field disagrees

_Contested points, and the camps. Worth keeping visible: a map that pretends the field is settled teaches the wrong thing._
