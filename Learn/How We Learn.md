---
type: charter
tags:
  - learn
  - method
---

# How we learn

> **English** · [简体中文](我们如何学习.md)

This is the method, written for the learner rather than for the machine. The operative version the teacher follows is the `mimir-teaching` skill; this is the same thing said plainly, so you can see what is being done to you and argue with it.

> **Read this once before your first session.** Everything else in the vault — the templates, the review queue, the generated maps — is downstream of the five ideas below. If the teacher is doing something that this document does not justify, that is a bug and worth saying so.

## The one idea

A pile of disconnected facts rots. Facts held in place by their connections do not, because each one is recoverable from the others. So the goal is never "I can recite it" — it is **understanding**: the fact derivable from foundations you already accept, and connected into what you already know.

The feeling to aim for is **the click**: the moment a pile of loose facts collapses into two or three generating ideas. Same information, far fewer moving parts.

There is a reason this works, and it is not motivational. The brain will not fully commit to a fact it is not sure is safe to lock in — if something more fundamental might later contradict it, committing risks an expensive repair, so it hedges and the fact never lands. Both principles below remove that risk.

## Principle i — unconditional truths first

Start from the ground: the few things you can accept **as-is, at face value, with no caveats**. Not because bottom-up is logically tidier, but because caveat-free facts are the easiest thing to commit to — they are safe, so they lock in instantly and give the first solid ground.

- *Unconditional truth* = a fact you can hold without hedging (how it is held).
- *Axiom* = a fact that follows from nothing else (where it sits in the graph).

Two shapes are especially strong: **universal statements** ("no X is Y") and **real definitions** (not a list of tendencies dressed up as one).

**The humanities and the historical sciences are the hard case.** In philosophy, history, literature, language, biology and geology, clean universal statements are rarer and usually carry hidden exceptions. When there is no exception-free truth at the level you are working at, the honest move is to say so and find the next solid ground down — a definition, a distinction, a scale, a constraint. A fabricated foundation is worse than a modest one, because everything above it inherits the error.

## Principle ii — "how could I have discovered this?"

A fact with no visible reason to be the way it is feels arbitrary, and arbitrary facts do not lock in. So the teacher's job is to make things feel **discovered, not decreed**: start from the problem that sent someone down this path, and motivate every step, so nothing appears from nowhere. 3Blue1Brown is the standard to aim at.

In these subjects that usually means the concrete situation: the observation that forced a distinction, the contradiction that killed the previous answer, the problem the concept was invented to solve, the argument an author was answering. Give the pressure, and the idea becomes the obvious relief.

**Socratic or told?** Socratic where you can plausibly reason your way there — it is more effortful and it sticks harder. Told when the material is out of cold-reasoning reach (dates, vocabulary, taxonomy conventions) or when you are low on energy. Either way the motivating step stays.

## The process: probe → plan → teach

**Probe — never skipped.** Two separate jobs: find where the edge of your understanding actually is, and find out what you are actually reaching for.

Finding the edge is a mapping job, and an edge is only located when it is **bracketed**: something at that level you get right (a floor) and something you get wrong (a ceiling), with the truth in between. Consequences the teacher has to accept:

- All-correct means the questions were too easy. Escalate sharply — binary-search the difficulty.
- One miss is one coordinate, not a verdict: probe around it to find out whether it is a slip, a gap, or a misconception. Misconceptions are the ones that matter, because they have to be dislodged rather than topped up.
- Every strand the lesson leans on gets probed.

**Plan — the highest-leverage step.** A cartographer call maps the field first, so the plan is not built on a half-remembered version. Then: what are the unconditional truths here, which do you already hold, and what is the motivated path from those to what you want? The plan comes back as prose **plus a small dependency map** — and then it waits. That map is your checkpoint, and it is also the teaching order.

**Teach — one node at a time.** Every node, foundational or derived, gets all four moves:

1. **Motivate** — why this, now.
2. **Establish** — state it if it is foundational; derive it from what is already in place if it is not.
3. **Connect** — make the edge explicit, so it hangs off something rather than floating.
4. **Check** — a question that proves it landed. A miss means stop and repair; never build on an unconfirmed node.

## Check questions

Multiple choice is the workhorse, because a wrong choice says *exactly* which model you were holding. The options are built so evenness is automatic:

1. No justification inside any option — all reasoning comes after you answer.
2. Write the correct claim first, then mutate it into each distractor, in the same shape and register. Every option is then "the claim under some belief".
3. Distractors must be mistakes you would really make — tempting, not tricky.
4. No bolding or extra words that mark out the right one.

If you can spot the answer without knowing the material, the set was built wrong. Rewrite, do not patch.

The teacher asks these through `ask_user_question`, so the options arrive as things you click and the exact choice comes back. That matters: a selection can be graded precisely, where a paragraph of prose can only be guessed at.

## Accuracy

Non-negotiable, and it is the teacher's job, not yours to police. Anything not certain — a date, a name, a quotation, a species, a translation, an attribution — gets checked against a real source before it is said. Wikipedia is the default place to expand from, and never the final authority on a contested claim. When a check corrects something already taught, it gets said out loud.

The preset carries a dedicated verifier sub-agent for this, and it is the one specialist the teacher is expected to reach for constantly. A confidently delivered error is the one unrecoverable failure in this system, because everything afterwards is built on top of it.

## The ritual, and how it should look

- **The session note is created and opened in Obsidian when the session starts, and written as the session runs** — not reconstructed at the end. You read there rather than in chat, because that is where the diagrams actually render.
- **A picture has to fit.** You scroll rather than pan, so a left-to-right graph disappears off the side of the pane — but a tall one is just as bad, because then you are scrolling *around* it, and that is friction every single time you want to check the plan. So strand maps are **drawn as SVG at the width of the column** and embedded in the map note, so one glance is enough. Drawing them is a script's job, not a hand's, so the picture cannot quietly fall out of date. Mermaid is available but is not the default — a checkpoint you avoid looking at is not a checkpoint.
- **A picture of the subject and a picture of you are different objects.** The dependency map is the subject — what rests on what. `Learn/Dashboard.md` is you — what is due, what is solid, what is still only a plan. The one place they meet is the maps themselves, where each box is coloured by what you have actually retrieved: green for established, amber for learning, red dashed for fragile, grey dotted for a node that is still only a plan. **That colouring is written by `Tools/vault-map.mjs` out of the concept notes, not drawn by hand**, which is the point — a picture of where you are is exactly the thing that must not be able to quietly go stale.

## Vocabulary and reading

Two things accumulate alongside the sessions, both added at the write-back rather than during teaching.

**The glossary** (`Learn/Glossary/`, hub at `Learn/Glossary.md`). Every *niche* word a session used and had to define for the lesson to go through gets its own note, with the field it belongs to. The rule is one-directional on purpose: a term earns an entry when a lesson needed it, never in advance, so the glossary can never get ahead of what you have actually met. Words you would already own — drought, forest, rock — are not entries. And when a session corrects a term, the glossary is corrected in the same turn: *serotiny* means seed release on **any** stimulus, and fire-triggered release is *pyriscence*, and that distinction stays put rather than quietly flattening back into the loose version.

**The reading list** (`Learn/Reading List.md`). At most **one or two books per session**, chosen at the end, for what a book can carry that a session could not — a whole field's texture, or a long argument that needs a hundred pages rather than a node. Published fiction and non-fiction only: no papers, no journals. Each entry gives title, author, year, one link, and one line on what it adds. Better one that fits than two that pad, and a session that taught nothing gets none.

## Languages

If what you are learning is a language you intend to *use*, three rules are absolute and are not style preferences:

1. **Never a determination without its characters.** A word in a non-Latin script is written in that script, with a transliteration, and nothing is taught from the romanisation alone.
2. **Never an identification presented as safe to eat.** This applies to botany and mycology as much as to anything foraged. Diagnostic characters and dangerous lookalikes, every time.
3. **Never a lookalike left unnamed.** Where two forms are confusable, the pair is taught together or the pair is not taught.

## Where it lands

Sessions, concepts, maps and reviews, written into this vault as you go — because the notes are the graph, and the graph is the understanding. See `Learn/🌱 Learn Index.md` for the layout, and the `vault-craft` skill for the contract the teacher writes to.
