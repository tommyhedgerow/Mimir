# Live lesson state

One JSON file per teaching session, written by the teacher with its ordinary file tools
and read by the Lesson pane in the DSH interface. Not part of the vault's knowledge: these
are working files, not notes, and nothing links to them.

- `<session-id>.json` — the current lesson: the question the learner is being asked, its
  options, the drawings this lesson turns on, the spine, and a one-line hint. The teacher
  writes it; the shape is in the `mimir-teaching` skill under *The Lesson pane*.
- `<session-id>.answers.json` — questions the learner set aside rather than answered. The
  pane writes it; the teacher reads it.
- `<session-id>.notes.md` — the learner's scratch page. The pane writes it; the teacher
  reads it.
- `current.json` — written by the pane, not by hand: the session id and folder of the
  session the pane is currently showing. **Read this first** — it is how the teacher
  finds the session it is teaching without guessing an id.

The folder is inside `Learn/Sessions/` so that it travels with the sessions it belongs to.
