/* Generated from client.mjs by Tools/build-lesson-pane.mjs — do not edit by hand. */
// A breadcrumb the page can be asked about later: it records that this bundle was
// requested and whether its factory ran. `loaded` true with `applied` false means the
// factory threw — and the throw is re-raised so it stays loud in the console too.
window.__MIMIR_LESSON_PANE__ = { loaded: true, applied: false, error: "" };
(function () {
try {
window.__ModuleLoader__.load({
	id: "dsh-mimir-lesson-pane",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react")
		const { createRoot } = require("react-dom/client")
		/**
		 * The Lesson window, browser half, as it ships inside the mimir-tutor preset.
		 *
		 * TWO COLUMNS, AND THE LEFT ONE IS THE LESSON. The window is the surface the learner
		 * actually works in, and it is split: the dialogue with the teacher fills the left
		 * two thirds and scrolls on its own, while the question, the drawings, the spine and
		 * the scratch page sit in the right third and scroll independently of it. Neither
		 * column can push the other around, which is the whole point — reading back through
		 * what the teacher said while a question waits used to mean losing the question.
		 *
		 * The transcript is read from the session the app already has open, not from a copy:
		 * `ctx.sessions.binding(id).eventSource` is the same contiguous event window the
		 * product's own conversation renders from, so the chat here is live, follows the
		 * session, and needs no second source of truth. Only the dialogue is shown by
		 * default — prompts and replies, with the teacher's reasoning and tool calls folded
		 * into a collapsed "the working" row that one toggle opens. That toggle is the logs
		 * switch: off means prose, on means everything that produced the prose.
		 *
		 * The docked tab in the right column stays, and draws the same component. It exists
		 * because the right column is a track the app itself owns, so a question can be
		 * answered there when the window has been closed.
		 *
		 * The frame it wears is the vault's, dressed as a terminal: warm paper and sage in the
		 * light, a dark green-black in the dark, a blocky monospace for everything that is the
		 * machine talking and a serif for everything that is read. Light and dark are the
		 * pane's own — a lesson can be read in the light while the app stays dark — and the
		 * control for that sits in the chat column, with `auto` following the app until it is
		 * told otherwise.
		 *
		 * Everything else comes from one call to the matching Host half, which reads three
		 * small files in the vault. The pane owns no state of its own beyond the current
		 * answer being composed and the two reading preferences above; the files are the truth.
		 *
		 * @module dsh-mimir-lesson-pane/client
		 */

		const KIND = 'mimir-lesson'
		const TAB_ID = 'dsh-mimir-lesson'
		const POLL_MS = 2500
		const BASE = '/mimir-lesson-pane'

		/**
		 * The startup animation, played once as the Lesson window opens.
		 *
		 * THE SAME LIBRARY THE VAULT USES. `Tools/splash/` holds one copy of the piece — two files,
		 * one per frame — and both surfaces read from it rather than each keeping a build of its
		 * own. The vault plays them through its own adapter; this half plays them through
		 * {@link splashUrl}, and the note beside the files records where they came from and how to
		 * refresh them.
		 */
		const SPLASH_DIR = 'Tools/splash'

		/**
		 * Each build, and the ground it was drawn on — which is the colour the window wears while
		 * the piece plays.
		 *
		 * WHY THE TWO BUILDS ARE NOT THE SAME KIND OF FILE. They are not the same object. The light
		 * build is an alpha layer with flat paper, and compositing it over that paper returns the
		 * master — measured, its edge misses by under one unit per channel. The dark build is an
		 * ADDITIVE GLOW, not a cut-out: it never reaches zero alpha and carries a blue ambient wash
		 * the master does not have, so ordinary alpha compositing misses its own ground by ~23 units
		 * where the opaque master misses by ~7. Hence a WebM for one and the master MP4 for the
		 * other.
		 *
		 * NEITHER GROUND IS THE PANE'S PAPER. `--bg` is a green-black or a warm cream; the piece was
		 * rendered on a near-black and on a lavender grey, so a window coloured from the pane's own
		 * palette left the artwork sitting on it as a slightly wrong rectangle. The values are the
		 * median of the matching master's outer 8-pixel band on the hold frame —
		 * `Tools/splash/README.md` records them, the method, and the command to re-measure.
		 */
		const SPLASH_BUILDS = {
		  dark: { video: 'mimir_startup_dark.mp4', ground: '#040106' },
		  light: { video: 'mimir_startup_light.webm', ground: '#d2cad7' },
		}

		/**
		 * Where the window's colour goes: a custom property the stylesheet reads, so the surface is
		 * still drawn by CSS and this function only says which of the two grounds is in play.
		 */
		const SPLASH_GROUND_VAR = '--mm-splash-ground'

		/** How long the still frame is held where motion is reduced, before it fades. */
		const SPLASH_STILL_MS = 1500

		/**
		 * The longest the splash may stay if the clip never reports its own end.
		 *
		 * `ended` is the clock — the piece knows how long it is, and a second copy of that number
		 * here would be one more thing to keep true. This is only a ceiling for the case where
		 * playback never starts at all, so that a splash nobody can dismiss by waiting still
		 * leaves. The piece is 8.65 s; the ceiling is set past it.
		 */
		const SPLASH_CEILING_MS = 12000

		/**
		 * The client services this half must not load without.
		 *
		 * Cordis refuses an undeclared service, and it refuses it as a boot failure rather
		 * than a warning — `cannot get property "timer" without inject` is what that looks
		 * like from the interface. The pane depends on all five: `timer` is what
		 * `ctx.timeout` and `ctx.interval` actually are, `slots` is how the tab body and the
		 * composer strip get registered, `sidebarRightTabs` and `sidebarRight` are how the
		 * column docks, and `sessions` is how it finds the session it belongs to — and, now,
		 * how it reads the transcript.
		 *
		 * The order of the failure this list fixes is worth keeping: with no declaration at
		 * all the half applied too early and the `slots` guard below returned silently — a
		 * pane that never appeared and said nothing; with the services declared but `timer`
		 * missing, `apply` ran past that guard and stopped dead at the first timer call.
		 */
		const inject = ['timer', 'slots', 'sessions', 'sidebarRight', 'sidebarRightTabs']

		/**
		 * Where this mount's routes actually live.
		 *
		 * The Host half claims a path unique to its mount, so that re-mounting a changed
		 * preset composition in the same process cannot collide with the mount it replaced.
		 * The browser therefore asks which path is live before it calls anything: one fixed
		 * handshake route answers with the current one, and a call that fails re-asks once,
		 * in case the composition was re-mounted under a running page.
		 */
		let livePrefix = null

		async function handshake() {
		  try {
		    const response = await fetch(BASE + '/handshake', { method: 'POST' })
		    if (!response.ok) return null
		    const payload = await response.json()
		    return typeof payload?.prefix === 'string' ? payload.prefix : null
		  } catch {
		    return null
		  }
		}

		async function resolvePrefix() {
		  if (livePrefix !== null) return livePrefix
		  livePrefix = await handshake()
		  return livePrefix
		}

		/**
		 * Everything the pane knows, in one object.
		 *
		 * It lives at module scope, not inside {@link apply}, because {@link callHost} is the
		 * module-level function every route call goes through and it has to read the session
		 * id and the workspace folder from here to put them on the wire. While this object
		 * lived inside `apply`, every call threw `state is not defined` inside `callHost`'s own
		 * try — swallowed, retried once, and returned as a quiet failure, which is a pane that
		 * docks and then says the lesson state is not available, for ever.
		 */
		const state = {
		  /** Which lesson column is open. Kept per browser, so it reopens where it was left. */
		  tab: readPreference('mimir-lesson-tab', ['chat', 'quiz', 'viz', 'spine', 'notes'], 'quiz'),
		  sessionId: null,
		  root: null,
		  hasLesson: false,
		  /** The vault being taught in, as the Host names it. Shown as the window's title. */
		  vault: '',
		  lesson: null,
		  answers: [],
		  notes: '',
		  visuals: [],
		  picked: {},
		  custom: '',
		  /** The answer being sent right now: `{ question, line }`, or null. */
		  sending: null,
		  /** The answer the host has taken: `{ question, line, failed }`, or null once a lesson moves on. */
		  sent: null,
		  /** The last question answered, so the pane does not ask it again when the file still holds it. */
		  refreshedTarget: null,
		  status: 'loading',
		  reason: '',
		  notesDirty: false,
		  dockNote: '',
		  windowOpen: false,
		  /** The window is filling the page, which is what this app can actually grant. */
		  fill: false,
		  notice: '',
		  /** The transient notice is on its way out: the fade, before the element goes. */
		  noticeFading: false,
		  closedQuestion: '',
		  /** The transcript's own reading preferences. None of them reaches the vault. */
		  showWork: false,
		  theme: readInitialTheme(),
		  text: readPreference('mimir-lesson-text', ['small', 'medium', 'large'], 'large'),
		}

		/**
		 * One reading preference, remembered per browser.
		 *
		 * These belong to the reader, not to the lesson, so they live in the page's own
		 * storage rather than in the vault: a question can be answered on any machine, but
		 * "the type is too small for me" is a fact about the person reading it. An absent or
		 * unrecognised value falls back to the default rather than failing.
		 *
		 * @param key - the storage key.
		 * @param allowed - the values this preference accepts.
		 * @param fallback - what to use when nothing acceptable is stored.
		 * @returns one of `allowed`.
		 */
		function readPreference(key, allowed, fallback) {
		  try {
		    const stored = window.localStorage?.getItem(key)
		    return allowed.includes(stored) ? stored : fallback
		  } catch {
		    return fallback
		  }
		}

		function writePreference(key, value) {
		  try {
		    window.localStorage?.setItem(key, value)
		  } catch {
		    /* a browser that refuses storage still gets the preference for this page */
		  }
		}

		/**
		 * The frame to open in: whichever the app is using, from then on it is the reader's choice.
		 *
		 * There is no `auto` any more. Following the app sounds thoughtful and reads as a third
		 * state nobody wants: the frame is either light or dark, the sun and the moon say which,
		 * and the pane stops second-guessing a preference it can see. What the app is showing at
		 * the moment of the first read is still the right default — it is the frame they were already
		 * reading in.
		 */
		function readInitialTheme() {
		  const stored = readPreference('mimir-lesson-theme', ['light', 'dark'], null)
		  if (stored !== null) return stored
		  return document.body?.getAttribute('data-ds-dark-theme') === null
		    || document.body?.getAttribute('data-ds-dark-theme') === undefined ? 'light' : 'dark'
		}

		/** The reading sizes, in the order the switcher steps through them. */
		const TEXT_SIZES = ['small', 'medium', 'large']

		/**
		 * The palette, in two variants.
		 *
		 * The vault's own theme is the starting point — warm paper, sage green, a serif for
		 * prose and a monospace for the machine — and the screenshot's terminal is what it is
		 * dressed as: high-contrast panels, blocky furniture, a green that reads as a cursor,
		 * and a pastel accent set where every accent carries a meaning rather than decorating.
		 * Mint is the teacher's voice, peach is the learner's, lilac is the working, cyan is
		 * the vault's own furniture (drawings, spines, status).
		 *
		 * Every colour is a token on `:root[data-mm-theme]`, and both variants define the full
		 * set, because the pane's theme is its own: the learner can read the lesson in the
		 * light while the app stays dark, and the other way round. `--mm*` names the palette,
		 * `--fg*`/`--bg*` are what the components actually use.
		 */
		const CSS = [
		  // `--rule` is a hairline for separation, `--line` is the one weight that means
		  // "this is a surface". Everything else separates with space or with a single edge,
		  // because a box around every element is what made the first version shout.
		  ':root[data-mm-text=small]{--mm-t:15px;--mm-t-lead:1.6;--mm-t-q:16.5px;--mm-t-opt:14px;--mm-t-hint:13px;--mm-t-ui:10px}'
		  ,':root[data-mm-text=medium]{--mm-t:16.5px;--mm-t-lead:1.66;--mm-t-q:18px;--mm-t-opt:15.5px;--mm-t-hint:14px;--mm-t-ui:10.5px}'
		  ,':root[data-mm-text=large]{--mm-t:18.5px;--mm-t-lead:1.72;--mm-t-q:20px;--mm-t-opt:17.5px;--mm-t-hint:15.5px;--mm-t-ui:11.5px}'
		  ,':root[data-mm-theme=light]{--mm-paper:#faf6ea;--mm-paper-2:#f2ead6;--mm-paper-3:#e9dfc6;--mm-ink:#25231d;--mm-ink-2:#5d5749;--mm-ink-3:#8b836f;--mm-rule:#e3d9c1;--mm-line:#c9bc9e;--mm-mark:#4f7a5c;--mm-mark-soft:#dbe8d4;--mm-mint:#2f7d63;--mm-mint-soft:#e4f0e8;--mm-peach:#b5642f;--mm-peach-soft:#f4e7d6;--mm-lilac:#6b5aa8;--mm-lilac-soft:#e5e0f5;--mm-cyan:#2c6b7a;--mm-cyan-soft:#d5e9ee;--mm-canvas:#fbfaf6;--mm-shadow:rgba(58,45,28,.14);--mm-serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Charter,Georgia,"Times New Roman",serif;--mm-pixel-font:ui-monospace,SFMono-Regular,"SF Mono",Monaco,Menlo,monospace;--bg:var(--mm-paper);--bg-2:var(--mm-paper-2);--bg-3:var(--mm-paper-3);--fg:var(--mm-ink);--fg-2:var(--mm-ink-2);--fg-3:var(--mm-ink-3);--rule:var(--mm-rule);--line:var(--mm-line);--accent:var(--mm-mark);--accent-soft:var(--mm-mark-soft);--shadow:var(--mm-shadow);--grid:rgba(120,100,70,.05);--scan:rgba(120,100,70,.028)}',
		  ':root[data-mm-theme=dark]{--mm-paper:#131a19;--mm-paper-2:#18211f;--mm-paper-3:#1f2a27;--mm-ink:#e6f0e6;--mm-ink-2:#9db3a9;--mm-ink-3:#6d8279;--mm-rule:#25322e;--mm-line:#33443e;--mm-mark:#8fd6a4;--mm-mark-soft:#1e3830;--mm-mint:#a6e3bd;--mm-mint-soft:#16302a;--mm-peach:#f0b183;--mm-peach-soft:#33261d;--mm-lilac:#bcb0f2;--mm-lilac-soft:#2a2542;--mm-cyan:#95d7de;--mm-cyan-soft:#17323a;--mm-canvas:#f7faf8;--mm-shadow:rgba(0,0,0,.45);--mm-serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Charter,Georgia,"Times New Roman",serif;--mm-pixel-font:ui-monospace,SFMono-Regular,"SF Mono",Monaco,Menlo,monospace;--bg:var(--mm-paper);--bg-2:var(--mm-paper-2);--bg-3:var(--mm-paper-3);--fg:var(--mm-ink);--fg-2:var(--mm-ink-2);--fg-3:var(--mm-ink-3);--rule:var(--mm-rule);--line:var(--mm-line);--accent:var(--mm-mark);--accent-soft:var(--mm-mark-soft);--shadow:var(--mm-shadow);--grid:rgba(150,220,190,.045);--scan:rgba(150,220,190,.022)}',
		  // The shipped question card is pinned over the bottom of the reading column, which
		  // is the problem this plugin exists for. Everything that is not the lesson itself —
		  // tool calls, turn process, injected context, the system prompt, compaction rows —
		  // is hidden while the pane is mounted, so what is left in the column is the dialogue
		  // the pane mirrors. The selector is the product's own data attribute and holds
		  // wherever its markup keeps it, which is what keeps this honest across versions.
		  ':root[data-mimir=on] [data-chat-flow-kind=tool-call],:root[data-mimir=on] [data-chat-flow-kind=turn-process],:root[data-mimir=on] [data-chat-flow-kind=context],:root[data-mimir=on] [data-chat-flow-kind=system-prompt],:root[data-mimir=on] [data-chat-flow-kind=compaction],:root[data-mimir=on] [data-chat-flow-kind=manual-compaction],:root[data-mimir=on] [data-chat-flow-kind=turn-tail],:root[data-mimir=on] [data-chat-flow-kind=unknown]{display:none!important}',
		  '.mm-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bg);background-image:radial-gradient(circle at 15% 6%,var(--grid),transparent 52%),repeating-linear-gradient(135deg,var(--scan) 0 2px,transparent 2px 4px);color:var(--fg);font-family:var(--mm-serif)}',
		  '.mm-root *{box-sizing:border-box}',
		  '.mm-root button{font-family:var(--mm-pixel-font)}',
		  // ── the window's chrome: one hairline under the bar, nothing else ──────────────
		  '.mm-head{flex:none;display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--rule);background:var(--bg)}',
		  '.mm-head h2{margin:0;font:400 11px/1.2 var(--mm-pixel-font);letter-spacing:.18em;text-transform:uppercase;color:var(--fg-2)}',
		  // A CLI cursor, not a notice: the tab a question is waiting on blinks, so the signal is
		  // where the click goes rather than a sentence about it somewhere else.
		  '.mm-tab[data-blinking=true] .mm-tab-mark{animation:mm-blink 1.1s steps(2,start) infinite}',
		  '.mm-leds{flex:none;display:flex;gap:5px}',
		  '.mm-leds span{width:8px;height:8px;border-radius:50%;background:var(--mm-mint)}',
		  '.mm-leds span:nth-child(2){background:var(--mm-peach)}',
		  '.mm-leds span:nth-child(3){background:var(--mm-lilac)}',
		  // ── the lesson column's tabs: an underline, never a box ───────────────────────
		  '.mm-tabs{flex:none;display:flex;gap:20px;padding:12px 16px 0;border-bottom:1px solid var(--rule);flex-wrap:wrap}',
		  '.mm-tab{font:400 10px/1 var(--mm-pixel-font);letter-spacing:.14em;text-transform:uppercase;color:var(--fg-3);background:none;border:0;border-bottom:2px solid transparent;padding:0 0 9px;margin-bottom:-1px;cursor:pointer}',
		  '.mm-tab:hover{color:var(--fg)}',
		  '.mm-tab:focus-visible{outline:2px solid var(--mm-cyan);outline-offset:2px}',
		  '.mm-tab[data-on=true]{color:var(--fg);border-bottom-color:var(--accent)}',
		  '.mm-tab-mark{display:inline-flex;align-items:center;margin-right:7px;vertical-align:-1px;opacity:.75}',
		  '.mm-tab[data-on=true] .mm-tab-mark{opacity:1}',
		  '.mm-tab-glyph{stroke-width:1.7}',
		  '.mm-body{flex:1;min-height:0;overflow-y:auto;padding:18px 16px 40px;scrollbar-width:thin}',
		  '.mm-split{flex:1;min-height:0;display:flex;align-items:stretch}',
		  // Two thirds of the width is the dialogue and one third the lesson. `flex-basis:66.666%`
		  // is what makes that a stated proportion rather than whatever the pane widths happen
		  // to resolve to; both sides stay shrinkable, so a narrow window narrows both.
		  '.mm-pane-left{flex:1 1 66.666%;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--rule);background:var(--bg)}',
		  '.mm-pane-right{flex:1 1 33.334%;min-width:228px;display:flex;flex-direction:column;background:var(--bg)}',
		  // ── the chat rail: text against text, with no frame of its own ────────────────
		  '.mm-rail{flex:none;display:flex;align-items:center;gap:18px;padding:12px 22px;border-bottom:1px solid var(--rule);font:400 var(--mm-t-ui)/1 var(--mm-pixel-font);letter-spacing:.08em;text-transform:uppercase;color:var(--fg-3);flex-wrap:wrap}',
		  '.mm-rail .mm-spacer{flex:1;min-width:0}',
		  '.mm-rail-btn{font:400 var(--mm-t-ui)/1 var(--mm-pixel-font);letter-spacing:.1em;text-transform:uppercase;background:none;border:0;padding:0;cursor:pointer;color:var(--fg-3)}',
		  '.mm-rail-btn:hover{color:var(--accent)}',
		  '.mm-rail-btn:focus-visible{outline:2px solid var(--mm-cyan);outline-offset:3px}',
		  '.mm-rail-btn[data-on=true]{color:var(--fg)}',
		  // A control that is mid-cycle needs to look pressed, not just tinted: the working control
		  // and the size control both carry state, and a hairline difference at 10px is invisible.
		  '.mm-toggle-btn[data-on=true],.mm-toggle-btn[data-pressed=true]{background:var(--accent-soft)}',
		  '.mm-pips{display:inline-flex;flex-direction:column;gap:2px;margin-left:5px}',
		  '.mm-pip-dot{width:4px;height:4px;background:var(--line)}',
		  '.mm-pip-dot[data-on=true]{background:var(--accent)}',
		  '.mm-size-mark{display:inline-flex;align-items:center}',
		  '.mm-rail-hint{color:var(--fg-3);opacity:.72;letter-spacing:.04em;text-transform:none}',
		  // ── the dialogue: tinted panels with one coloured edge, no outline ────────────
		  '.mm-pane-chat{flex:1;min-height:0;display:flex;flex-direction:column}',
		  '.mm-chat{flex:1;min-height:0;overflow-y:auto;padding:18px 22px 48px;scrollbar-width:thin;scroll-behavior:smooth}',
		  '.mm-msg{display:flex;gap:16px;margin:0 0 26px}',
		  '.mm-gut{flex:none;width:42px;padding-top:4px;text-align:right}',
		  '.mm-gut b{display:block;font:400 var(--mm-t-ui)/1.3 var(--mm-pixel-font);letter-spacing:.06em;text-align:right;white-space:nowrap;overflow:visible}',
		  '.mm-gut i{display:block;font-style:normal;font:400 calc(var(--mm-t-ui) - 1px)/1.4 var(--mm-pixel-font);color:var(--fg-3);opacity:.8}',
		  '.mm-msg[data-who=you] .mm-gut b{color:var(--mm-peach)}',
		  '.mm-msg[data-who=teacher] .mm-gut b{color:var(--mm-mint)}',
		  '.mm-msg[data-who=system] .mm-gut b{color:var(--mm-cyan)}',
		  '.mm-bubble{flex:1;min-width:0;border-left:3px solid var(--rule);padding:2px 0 2px 16px;font-size:var(--mm-t);line-height:var(--mm-t-lead)}',
		  '.mm-msg[data-who=you] .mm-bubble{border-left-color:var(--mm-peach)}',
		  '.mm-msg[data-who=teacher] .mm-bubble{border-left-color:var(--mm-mint)}',
		  '.mm-msg[data-who=system] .mm-bubble{border-left-color:var(--mm-cyan);font-family:var(--mm-pixel-font);font-size:calc(var(--mm-t) - 3.5px);line-height:1.6;color:var(--fg-2)}',
		  '.mm-msg[data-live=true] .mm-bubble:after{content:"\\2588";color:var(--mm-mint);margin-left:3px;animation:mm-blink 1s steps(2,start) infinite}',
		  '@keyframes mm-blink{to{visibility:hidden}}',
		  '.mm-p{display:block;white-space:pre-wrap;margin:0 0 12px}',
		  '.mm-p:last-child{margin-bottom:0}',
		  '.mm-h1{display:block;margin:20px 0 9px;font:400 12px/1.3 var(--mm-pixel-font);letter-spacing:.14em;text-transform:uppercase;color:var(--fg-2)}',
		  '.mm-h2{display:block;margin:18px 0 8px;font:400 11px/1.3 var(--mm-pixel-font);letter-spacing:.12em;text-transform:uppercase;color:var(--fg-2)}',
		  '.mm-h3{display:block;margin:16px 0 6px;font-weight:700;font-size:calc(var(--mm-t) - 1px)}',
		  '.mm-bullets{display:block;list-style:none;margin:0 0 12px;padding:0}',
		  '.mm-bullets li{display:block;position:relative;padding:0 0 5px 20px}',
		  '.mm-bullets li:before{content:"\\2014";position:absolute;left:0;color:var(--fg-3);opacity:.85}',
		  '.mm-bullets[data-ordered=true]{counter-reset:mm-item}',
		  '.mm-bullets[data-ordered=true] li{counter-increment:mm-item}',
		  '.mm-bullets[data-ordered=true] li:before{content:counter(mm-item) ".";font-family:var(--mm-pixel-font);font-size:12px;color:var(--fg-3)}',
		  '.mm-quote{display:block;margin:14px 0;padding-left:16px;border-left:3px solid var(--mm-lilac);color:var(--fg-2);font-style:italic}',
		  // Code is the one thing that keeps a surface of its own: it has to be legible as
		  // code, and a tinted block with a single hairline does that without a frame.
		  '.mm-code{display:block;white-space:pre-wrap;word-break:break-word;background:var(--bg-2);border-left:3px solid var(--line);padding:12px 14px;margin:14px 0;font:400 calc(var(--mm-t) - 4px)/1.6 var(--mm-pixel-font);color:var(--fg)}',
		  '.mm-inline-code{font:400 calc(var(--mm-t) - 3.5px)/1.4 var(--mm-pixel-font);background:var(--accent-soft);padding:1px 5px}',
		  '.mm-link{color:var(--mm-cyan);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;word-break:break-word}',
		  '.mm-strong{font-weight:700}',
		  '.mm-em{font-style:italic}',
		  // ── the working: one quiet line, and its detail only when asked for ───────────
		  '.mm-work{display:flex;align-items:baseline;gap:9px;margin:-14px 0 26px 58px;font:400 var(--mm-t-ui)/1.6 var(--mm-pixel-font);letter-spacing:.05em;color:var(--fg-3);opacity:.85}',
		  '.mm-work:before{content:"";flex:none;width:14px;height:1px;background:var(--rule)}',
		  '.mm-work-body{margin:-14px 0 26px 58px;border-left:3px solid var(--mm-lilac);padding:2px 0 2px 16px;font:400 calc(var(--mm-t) - 4.5px)/1.7 var(--mm-pixel-font);color:var(--fg-2);white-space:pre-wrap;word-break:break-word}',
		  '.mm-work-body b{display:block;color:var(--mm-lilac);letter-spacing:.12em;text-transform:uppercase;font-weight:400;font-size:var(--mm-t-ui);margin-bottom:6px}',
		  '.mm-chat-empty{color:var(--fg-3);font-size:var(--mm-t);line-height:1.65;max-width:44ch}',
		  '.mm-earlier{display:inline-block;margin:0 0 22px 58px;font:400 var(--mm-t-ui)/1 var(--mm-pixel-font);letter-spacing:.12em;text-transform:uppercase;background:none;border:0;padding:0;cursor:pointer;color:var(--accent);border-bottom:1px solid var(--accent-soft)}',
		  '.mm-earlier:hover{color:var(--fg)}',
		  // ── the question: a card, so it keeps a surface — a light one ─────────────────
		  '.mm-card{background:var(--bg-2);box-shadow:4px 4px 0 var(--shadow);padding:16px 16px 14px;margin:0 0 18px;border-top:3px solid var(--accent)}',
		  '.mm-eyebrow{font:400 10px/1 var(--mm-pixel-font);letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin:2px 0 12px}',
		  '.mm-q{margin:0 0 16px;font-size:var(--mm-t-q);line-height:1.5;font-weight:600}',
		  // The confirmation: the same card as a question, marked answered rather than asked.
		  '.mm-confirm{border-top-color:var(--mm-cyan)}',
		  '.mm-confirm[data-failed=true]{border-top-color:var(--mm-peach)}',
		  '.mm-sent-line{margin:0 0 10px;font-size:var(--mm-t-opt);line-height:1.5;color:var(--fg);border-left:3px solid var(--mm-cyan);padding-left:12px}',
		  '.mm-confirm[data-failed=true] .mm-sent-line{border-left-color:var(--mm-peach)}',
		  '.mm-opts{display:flex;flex-direction:column;gap:2px}',
		  '.mm-opt{display:flex;gap:11px;align-items:flex-start;text-align:left;background:none;border:0;border-left:3px solid transparent;padding:9px 4px 9px 12px;cursor:pointer;font-family:var(--mm-serif);font-size:var(--mm-t-opt);line-height:1.45;color:var(--fg)}',
		  '.mm-opt:hover{background:var(--bg-3)}',
		  '.mm-opt[disabled]{opacity:.5;cursor:default}',
		  '.mm-area[disabled]{opacity:.6}',
		  '.mm-opt:focus-visible{outline:2px solid var(--mm-cyan);outline-offset:-2px}',
		  '.mm-opt[data-picked=true]{border-left-color:var(--accent);background:var(--accent-soft)}',
		  '.mm-tick{flex:none;width:14px;height:14px;margin-top:4px;border:1px solid var(--line);display:grid;place-items:center;font:400 10px/13px var(--mm-pixel-font);text-align:center}',
		  '.mm-opt[data-picked=true] .mm-tick{background:var(--accent);border-color:var(--accent);color:var(--bg)}',
		  '.mm-label{font:400 10px/1 var(--mm-pixel-font);letter-spacing:.16em;text-transform:uppercase;color:var(--fg-3);display:block;margin:18px 0 7px}',
		  '.mm-area{width:100%;min-height:88px;resize:vertical;background:var(--bg);color:var(--fg);border:1px solid var(--rule);font-family:var(--mm-serif);font-size:var(--mm-t-opt);line-height:1.55;padding:10px 11px}',
		  '.mm-area:focus{outline:none;border-color:var(--accent)}',
		  '.mm-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}',
		  '.mm-send{margin-top:14px;font:400 var(--mm-t-ui)/1 var(--mm-pixel-font);letter-spacing:.13em;text-transform:uppercase;background:var(--accent);color:var(--bg);border:0;padding:10px 14px;cursor:pointer}',
		  '.mm-send:hover{opacity:.9}',
		  '.mm-send[disabled]{opacity:.35;cursor:default}',
		  '.mm-ghost{font:400 var(--mm-t-ui)/1 var(--mm-pixel-font);letter-spacing:.11em;text-transform:uppercase;background:none;border:0;color:var(--fg-3);cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:16px 0 6px}',
		  '.mm-ghost:hover{color:var(--accent)}',
		  '.mm-hint{color:var(--fg-2);font-size:var(--mm-t-hint);line-height:1.6}',
		  '.mm-past{padding:10px 0;border-bottom:1px solid var(--rule)}',
		  '.mm-past:last-child{border-bottom:0}',
		  '.mm-past-q{color:var(--fg)}',
		  '.mm-past-a{color:var(--mm-peach)}',
		  // The scratch page keeps its margin rule — that is the paper, not a box.
		  '.mm-ruled{background-image:repeating-linear-gradient(180deg,transparent 0 27px,var(--rule) 27px 28px);line-height:28px}',
		  '.mm-sheet{padding:2px 0 8px 26px;border-left:2px solid var(--accent-soft)}',
		  '.mm-page{width:100%;min-height:48vh;border:0;background:transparent;color:var(--fg);font-family:var(--mm-serif);font-size:var(--mm-t);resize:vertical;padding:0}',
		  '.mm-page:focus{outline:none}',
		  '.mm-viz{display:flex;flex-direction:column;gap:22px}',
		  // THE DRAWING IS INKED IN THE PANE'S OWN COLOURS — see {@link adaptDrawing}. It used to be
		  // a white sheet under always-light artwork, which is what made these unreadable in the
		  // dark: a diagram is not a photograph and does not need its own paper.
		  '.mm-fig{margin:0;padding:12px 0 0;border-left:3px solid var(--rule)}',
		  '.mm-fig-body{display:block}',
		  '.mm-fig-body svg{display:block;width:100%;height:auto}',
		  '.mm-fig svg{display:block;width:100%;height:auto}',
		  '.mm-cap{font:400 9px/1.5 var(--mm-pixel-font);color:var(--fg-3);margin-top:9px;word-break:break-all}',
		  '.mm-spine{list-style:none;margin:0;padding:0;font:400 12.5px/1.55 var(--mm-pixel-font)}',
		  '.mm-spine li{display:flex;gap:11px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--rule)}',
		  '.mm-spine li:last-child{border-bottom:0}',
		  '.mm-pip{flex:none;width:9px;height:9px;margin-top:5px;border-radius:50%;background:var(--rule)}',
		  '.mm-spine li[data-state=held] .mm-pip{background:var(--mm-cyan)}',
		  '.mm-spine li[data-state=learning] .mm-pip{background:var(--mm-peach)}',
		  '.mm-spine li[data-state=fragile] .mm-pip{background:transparent;box-shadow:inset 0 0 0 2px var(--mm-peach)}',
		  '.mm-spine li[data-state=held] .mm-node{color:var(--fg-2)}',
		  '.mm-node{flex:1}',
		  // THE STRIP OBEYS THE COLUMN IT SITS UNDER. The composer area is wider than the reading
		  // column — its card is `--dsh-composer-card-max-width`, and the column is the narrower
		  // `--dsh-chat-content-width` — so an unconstrained strip runs to the edges of the app
		  // while the prose it belongs to stops well short. The product's own dock rows solve
		  // this the same way; this is their rule, expressed for a row that is narrower than the
		  // dock: take the dock's width, but never more than the column's, and centre.
		  // Both names are the product's, with the fallback being its own default width.
		  // THE ONE PIECE THAT IS NOT THE PANE'S. This strip stands in the chat column, among the
		  // app's own rows, so it wears the app's frame rather than the lesson's: the DSH alias
		  // tokens with fallbacks to the pane's, since the pane has to render in a composition
		  // that never defined them. It follows the app's own light and dark without being told —
		  // no attribute of ours is involved.
		  '.mm-focusbar{box-sizing:border-box;width:100%;max-width:var(--dsh-chat-content-width,748px);margin:0 auto;display:flex;align-items:center;gap:12px;padding:10px 13px;background:var(--dsw-alias-bg-layer-2,var(--bg));border:1px solid var(--dsw-alias-border-l2,var(--line));border-left:3px solid var(--dsw-alias-brand-primary,var(--accent));color:var(--dsw-alias-label-primary,var(--fg));font-family:var(--mm-serif);font-size:calc(var(--mm-t) - 1.5px)}',
		  '.mm-focusbar b{flex:none;font:400 10px/1 var(--mm-pixel-font);letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-brand-primary,var(--accent))}',
		  '.mm-focusbar span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
		  '.mm-focusbar button{flex:none;font:400 10px/1 var(--mm-pixel-font);letter-spacing:.12em;text-transform:uppercase;background:var(--dsw-alias-button-primary-fill,var(--accent));color:var(--dsw-alias-brand-text,var(--bg));border:0;padding:8px 11px;cursor:pointer}',
		  '.mm-chip{font:400 10px/1 var(--mm-pixel-font);letter-spacing:.1em;text-transform:uppercase;background:none;border:1px solid var(--rule);color:var(--fg-2);padding:6px 10px;cursor:pointer}',
		  '.mm-chip:hover{color:var(--accent);border-color:var(--accent)}',
		  '.mm-chip[data-waiting=true]{color:var(--bg);background:var(--accent);border-color:var(--accent)}',
		  '.mm-spacer{flex:1;min-width:0}',
		  // The lesson window: a floating, resizable panel over the app that can go
		  // fullscreen. A real second OS window is not available here — the desktop app's
		  // main process denies every window request that is not a harness or file URL — so
		  // the window is drawn in this document and raised above everything else.
		  '.mm-window{position:fixed;top:5vh;right:2.5vw;width:min(1180px,92vw);height:88vh;min-width:640px;min-height:360px;display:flex;background:var(--bg);border:1px solid var(--line);box-shadow:0 24px 64px rgba(0,0,0,.34);z-index:2147483000;resize:both;overflow:hidden}',
		  '.mm-window>.mm-root{flex:1;min-width:0;min-height:0}',
		  '.mm-window .mm-window-bar{cursor:move;user-select:none}',
		  // Filling the page is a class on the shell, and every offset it has to beat lives here:
		  // a floating window is pinned by `position:fixed` with `top`/`right` and a `resize`
		  // handle, so filling is not one property but five, and they belong together.
		  '.mm-window[data-fill=on]{top:0;right:auto;left:0;width:100vw;height:100vh;border:0;box-shadow:none;resize:none}',
		  '.mm-window[data-fill=on] .mm-window-bar{cursor:default}',
		  // The startup animation, played once over the window as it opens — the same piece the
		  // vault plays on its own startup, so the two surfaces open the same way. The surface is
		  // the ground the piece was drawn on rather than the pane's own paper: see SPLASH_GROUND.
		  '.mm-splash{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:var(--mm-splash-ground,var(--bg));cursor:pointer;animation:mm-splash-in 240ms ease-out}',
		  '.mm-splash[data-going=true]{animation:mm-splash-out 400ms ease-in forwards;pointer-events:none}',
		  // The master is 320x180 exported at 4x. `pixelated` is what keeps a drawn edge an edge;
		  // both dimensions are auto with a maximum each, because a fixed width beside a clamped
		  // height is a distorted video on a replaced element.
		  '.mm-splash>video,.mm-splash>img{display:block;width:auto;height:auto;max-width:88%;max-height:76%;image-rendering:pixelated}',
		  '@keyframes mm-splash-in{from{opacity:0}to{opacity:1}}',
		  '@keyframes mm-splash-out{from{opacity:1}to{opacity:0}}',
		  // A noticed fact is a toast, not a bar: held above the window's own content so it can
		  // say its piece and go without the layout moving when it does. This is the one thing
		  // here that is raised rather than laid out, and it earns it by not staying.
		  '.mm-notice{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:2;max-width:min(90%,520px);margin:0;padding:9px 14px;background:var(--bg-3);border:1px solid var(--line);box-shadow:0 8px 24px var(--shadow);font:400 10px/1.5 var(--mm-pixel-font);letter-spacing:.06em;color:var(--accent);text-align:center;pointer-events:none;animation:mm-notice-in 180ms ease-out}',
		  // Out on its own, so removing it from the tree a moment later is not a jump.
		  '.mm-notice[data-going=true]{animation:mm-notice-out 420ms ease-in forwards}',
		  '@keyframes mm-notice-in{from{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%,0)}}',
		  '@keyframes mm-notice-out{from{opacity:1}to{opacity:0;transform:translate(-50%,-6px)}}',
		  '.mm-window-btn{font:400 10px/1 var(--mm-pixel-font);letter-spacing:.12em;text-transform:uppercase;background:none;border:0;padding:2px 0;cursor:pointer;color:var(--fg-3)}',
		  // A symbol control is a target, not a word: a square of its own so the two marks at the
		  // top right read as buttons rather than as decoration near the title.
		  '.mm-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0}',
		  '.mm-icon-btn:hover{background:var(--bg-3)}',
		  '.mm-glyph{display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:square}',
		  '.mm-window-btn:hover{color:var(--accent)}',
		  '.mm-window-btn:focus-visible{outline:2px solid var(--mm-cyan);outline-offset:3px}',
		  // The window is resizable and the question column is fixed-ish; below this width the
		  // two columns would each be too narrow to read, so the rail moves first.
		  '.mm-root[data-narrow=true] .mm-gut{width:32px}',
		  '.mm-root[data-narrow=true] .mm-work,.mm-root[data-narrow=true] .mm-work-body{margin-left:48px}',
		  '@media (max-width:720px){.mm-pane-right{min-width:0}}',
		].join('\n')

		/**
		 * One call to the Host half. The pane talks to the resident half over the
		 * Harness' own web carrier under one fixed prefix: a POST with the session and
		 * the folder the browser already knows, and a JSON answer back.
		 * @param method - one of the four route names the Host half serves.
		 * @param args - the JSON arguments; the session id and root are added here.
		 * @returns the Host half's answer, or a failure the pane can show.
		 */
		async function callHost(method, args, retried = false) {
		  const prefix = await resolvePrefix()
		  if (prefix === null) return { failed: true, reason: 'the lesson pane is not answering yet' }
		  try {
		    const response = await fetch(prefix + '/' + method, {
		      method: 'POST',
		      headers: { 'content-type': 'application/json' },
		      body: JSON.stringify({ sessionId: state.sessionId, root: state.root, ...args }),
		    })
		    if (!response.ok) {
		      // A composition change re-mounts the Host half under the running page, so the
		      // path we hold can be one mount out of date. Ask again, once.
		      if (!retried) {
		        livePrefix = null
		        return callHost(method, args, true)
		      }
		      return { failed: true, reason: `the Host answered ${response.status}` }
		    }
		    return await response.json()
		  } catch (error) {
		    if (!retried) {
		      livePrefix = null
		      return callHost(method, args, true)
		    }
		    return { failed: true, reason: String(error?.message ?? error) }
		  }
		}

		/** One option as the learner reads it, whether the teacher wrote a string or an object. */
		function optionLabel(option) {
		  if (typeof option === 'string') return option
		  if (option === null || option === undefined) return ''
		  if (typeof option.label === 'string') return option.label
		  return String(option)
		}

		/* ── the pane's store ───────────────────────────────────────────────────────────
		 *
		 * MODULE SCOPE, AND THAT IS THE POINT. These lived inside `apply` once, next to the state
		 * they publish — which read well and was wrong: the rail's controls are drawn by
		 * `ChatView`, a module-scope component, so their click handlers are closures over module
		 * scope. `publish`, `paintTheme` and `paintText` were not in it, and every one of those
		 * buttons threw `ReferenceError: publish is not defined` on the click. A control that
		 * draws perfectly and dies when pressed is the kind of bug a rendered-markup test cannot
		 * see, which is why there is now a test that clicks.
		 *
		 * `rootElement` is here for the same reason: the paint functions set attributes on the
		 * document root, and `apply` reads and writes the same element.
		 */

		/** The document root, where the pane's attributes live. One element, one reference. */
		const rootElement = document.documentElement

		const listeners = new Set()
		let snapshot = { ...state }

		function publish() {
		  snapshot = { ...state }
		  for (const listener of [...listeners]) {
		    try {
		      listener()
		    } catch (error) {
		      /* one seat's failure must not strand the others */
		      console.error('mimir-lesson: a listening seat failed: ' + String(error?.message ?? error))
		    }
		  }
		}

		function subscribe(listener) {
		  listeners.add(listener)
		  return () => {
		    listeners.delete(listener)
		  }
		}

		function getSnapshot() {
		  return snapshot
		}

		/** React 18's external-store read, so every seat sees the same pane state. */
		function useStore() {
		  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
		}

		/** The window's own frame, which is not the app's: sun or moon, and nothing in between. */
		function paintTheme() {
		  rootElement.setAttribute('data-mm-theme', state.theme === 'dark' ? 'dark' : 'light')
		}

		/** The reading size, on the root beside the theme. */
		function paintText() {
		  rootElement.setAttribute('data-mm-text', state.text)
		}

		/* ── reading the transcript ─────────────────────────────────────────────────────
		 *
		 * The chat column is not a second copy of the conversation; it reads the same event
		 * window the product's own conversation renders from. `ctx.sessions.binding(id)`
		 * carries a `SessionEventSource` — an observable snapshot of the contiguous session
		 * log the page already holds, live tail included — so the transcript here needs no
		 * extra transport, no second source of truth, and cannot drift from the chat.
		 *
		 * What it deliberately does NOT do is reuse the product's node assembly. That
		 * assembly is internal, matches events into a rendered product tree, and would make
		 * this pane's appearance hostage to it. Reading the events and drawing them here is
		 * what lets the lesson look like the lesson.
		 *
		 * Only three things are read out of each event — the role, the text, and whether it
		 * was a prompt or a reply. Content blocks are narrowed as structural data, never
		 * enumerated, cloned, or displayed whole.
		 */

		/** How many older pages `loadOlder` may pull in one pass when the learner asks for them. */
		const PAGE_PASSES = 4

		/**
		 * The session's event feed, cached per session id, with one stable snapshot object.
		 *
		 * The snapshot is the store object itself and is mutated in place rather than rebuilt,
		 * because React compares it by identity: a fresh object per read would re-render every
		 * seat on every unrelated session frame. `sequence` is the revision of the window the
		 * transcript was folded from, and it is the only thing that changes when the window
		 * does, so the fold runs once per publication and not once per render.
		 */
		const talk = {
		  sequence: 0,
		  sessionId: null,
		  source: null,
		  session: null,
		  transcript: [],
		  hasMore: false,
		  running: false,
		  listeners: new Set(),
		  getSnapshot() {
		    return talk
		  },
		  subscribe(listener) {
		    talk.listeners.add(listener)
		    return () => {
		      talk.listeners.delete(listener)
		    }
		  },
		  /** Re-read the feed, rebuilding the transcript only when its revision moved. */
		  read() {
		    const snapshot = talk.source?.getSnapshot?.()
		    if (snapshot !== null && snapshot !== undefined && talk.sequence !== snapshot.revision) {
		      talk.sequence = snapshot.revision
		      talk.hasMore = snapshot.hasMore === true
		      talk.transcript = buildTranscript(snapshot.entries)
		    }
		    const running = talk.session?.getSnapshot?.()?.running
		    talk.running = running === true
		  },
		  publish() {
		    talk.read()
		    for (const listener of [...talk.listeners]) {
		      try {
		        listener()
		      } catch {
		        /* one seat's failure must not strand the others */
		      }
		    }
		  },
		  /**
		   * Bind this client's session feed — the same contiguous event window the product's
		   * own conversation renders from. Idempotent, and a no-op when the session has not
		   * changed, so it is safe to call from an effect that runs on every session frame.
		   */
		  bind(sessions) {
		    const list = sessions?.list?.getSnapshot?.()
		    const current = typeof list?.current === 'string' ? list.current : null
		    if (current === null) {
		      if (talk.source !== null) talk.reset()
		      return
		    }
		    if (talk.sessionId === current && talk.source !== null) return
		    talk.reset()
		    if (sessions === null || sessions === undefined || typeof sessions.binding !== 'function') return
		    let binding = null
		    try {
		      binding = sessions.binding(current)
		    } catch {
		      binding = null
		    }
		    const source = binding?.eventSource
		    if (source === null || source === undefined || typeof source.subscribe !== 'function') return
		    talk.sessionId = current
		    talk.source = source
		    talk.unsubscribe = source.subscribe(() => {
		      talk.publish()
		    })
		    const detailed = binding.session
		    if (detailed !== null && detailed !== undefined && typeof detailed.subscribe === 'function') {
		      talk.session = detailed
		      talk.unsubscribeSession = detailed.subscribe(() => {
		        talk.publish()
		      })
		    }
		    talk.publish()
		  },
		  reset() {
		    if (typeof talk.unsubscribe === 'function') talk.unsubscribe()
		    if (typeof talk.unsubscribeSession === 'function') talk.unsubscribeSession()
		    talk.unsubscribe = null
		    talk.unsubscribeSession = null
		    talk.session = null
		    talk.source = null
		    talk.sessionId = null
		    talk.sequence = 0
		    talk.transcript = []
		    talk.hasMore = false
		    talk.running = false
		  },
		}

		/**
		 * Fold one event window into the dialogue the chat column draws.
		 *
		 * The window holds the complete contiguous log for this session — user prompts,
		 * assistant messages, step boundaries, tool calls, results, retries, compactions —
		 * and only two of those are the dialogue. Everything else is the working: kept,
		 * because the teacher's reasoning is worth being able to open, but drawn as one
		 * collapsed row per step so it never interrupts the prose.
		 *
		 * Two details of the log decide the shape of this fold:
		 *
		 *   * `assistant/message` can arrive more than once per step — a replacement
		 *     (`surfaceOp !== 'append'`) shadows an earlier text that the learner has already
		 *     read, and the product's own transcript keeps the append-origin one. Drawing a
		 *     replacement again would duplicate a paragraph, so only appends are drawn.
		 *   * a step's text may be streaming when the window is read. Live chunks arrive as
		 *     transient entries keyed by attempt, and are drawn only while no durable message
		 *     for that same step has landed — the settled text is what stays.
		 *
		 * @param entries - the window's entries, each `{ type, event }`.
		 * @returns an ordered list of messages: `{ who, text, ms, live }`, with `work` rows
		 *   between them for the steps that produced them.
		 */
		function buildTranscript(entries) {
		  if (!Array.isArray(entries)) return []
		  const out = []
		  const settled = new Set()
		  const live = new Map()
		  let current = null
		  const ensure = (who) => {
		    const last = out[out.length - 1]
		    if (last !== undefined && last.who === who && last.text === '') return last
		    const created = { who, text: '', ms: 0, live: false, tools: [] }
		    out.push(created)
		    return created
		  }
		  for (const entry of entries) {
		    const event = entry?.event
		    if (event === null || event === undefined || typeof event !== 'object') continue
		    const type = event.type
		    const data = event.data
		    const ms = typeof event.time === 'number' ? event.time : 0
		    if (entry.type === 'transient') {
		      if (type !== 'assistant/live-chunk') continue
		      const step = typeof data?.turn === 'number' && typeof data?.step === 'number' ? `${data.turn}:${data.step}` : 'live'
		      const text = chunkText(data?.chunk)
		      const row = live.get(step) ?? { attempt: data?.attemptId, text: '' }
		      if (row.attempt === data?.attemptId || row.attempt === undefined) row.text += text
		      else row.text = text
		      row.attempt = data?.attemptId
		      live.set(step, row)
		      continue
		    }
		    if (type === 'user/message') {
		      if (!isPrompt(data)) continue
		      const text = blocksText(data.content)
		      if (text === '') continue
		      const message = ensure('you')
		      message.text = message.text === '' ? text : message.text + '\n\n' + text
		      message.ms = ms
		      current = 'you'
		      continue
		    }
		    if (type === 'assistant/message') {
		      if (event.surfaceOp !== 'append') continue
		      const key = `${data?.turn}:${data?.step}`
		      settled.add(key)
		      live.delete(key)
		      const text = blocksText(data?.message?.content)
		      // A step whose message carries only reasoning and tool calls produces no prose.
		      // The `current` mark is cleared either way, so the NEXT step's prose starts a
		      // paragraph of its own instead of continuing this one's last sentence.
		      if (text === '') {
		        current = null
		        continue
		      }
		      if (current !== 'teacher') ensure('teacher')
		      const message = ensure('teacher')
		      message.text = message.text === '' ? text : message.text + '\n\n' + text
		      message.ms = ms
		      current = 'teacher'
		      continue
		    }
		    if (type === 'tool/call') {
		      const name = typeof data?.name === 'string' ? data.name : ''
		      if (name === '') continue
		      const last = out[out.length - 1]
		      if (last !== undefined) last.tools.push(name)
		      current = null
		      continue
		    }
		    if (type === 'assistant/attempt') {
		      current = null
		      continue
		    }
		    if (type === 'step/start' || type === 'step/end' || type === 'llm/retry' || type === 'turn/start' || type === 'turn/end') {
		      current = null
		      continue
		    }
		  }
		  // Live text for a step that has since settled is stale; drop it rather than append
		  // it after the teacher's own sentence.
		  for (const [key, row] of live) {
		    if (settled.has(key)) continue
		    const text = row.text.trim()
		    if (text === '') continue
		    const last = out[out.length - 1]
		    if (last !== undefined && last.who === 'teacher' && last.text === '') {
		      last.text = text
		      last.live = true
		    } else {
		      out.push({ who: 'teacher', text, ms: 0, live: true, tools: [] })
		    }
		  }
		  return out.filter((message) => message.text !== '' || message.tools.length > 0)
		}

		/** The text of one live stream chunk, whatever shape the chunk arrived in. */
		function chunkText(chunk) {
		  if (chunk === null || chunk === undefined || typeof chunk !== 'object') return ''
		  if (typeof chunk.text === 'string') return chunk.text
		  if (typeof chunk.delta === 'string') return chunk.delta
		  if (typeof chunk.content === 'string') return chunk.content
		  return ''
		}

		/**
		 * Whether a `user/message` was typed by the learner rather than injected by the
		 * harness. Context, plugin notices and recalled references all enter the log in the
		 * user role; only the learner's own prompts belong in a dialogue. The log's own mark
		 * for that is the source: `user` with no context form, or a notice surfaced to them.
		 */
		function isPrompt(data) {
		  const source = data?.source
		  const kind = source?.kind
		  if (kind === undefined) return true
		  if (kind !== 'user') return false
		  const form = source?.form
		  return form === undefined || form === 'notice'
		}

		/** The text of a content-block list, narrowed structurally and joined. */
		function blocksText(blocks) {
		  if (!Array.isArray(blocks)) return ''
		  const parts = []
		  for (const block of blocks) {
		    if (block === null || block === undefined || typeof block !== 'object') continue
		    if (block.type !== 'text') continue
		    if (typeof block.text !== 'string') continue
		    const text = block.text.trim()
		    if (text !== '') parts.push(text)
		  }
		  return parts.join('\n\n')
		}

		/* ── drawing ──────────────────────────────────────────────────────────────────── */

		/**
		 * The smallest markdown the teacher's replies actually need.
		 *
		 * This is deliberately not a general renderer. It covers the blocks a teaching reply
		 * uses — paragraphs, headings, bullet and numbered lists, quotations, fenced code —
		 * and the inline marks inside them, and it returns React elements rather than an HTML
		 * string, so a stray `<` in the prose is text and never markup. Math is left alone
		 * unless it arrived as code, which is what the vault's own notes do anyway.
		 */
		function inline(text) {
		  const nodes = []
		  const source = String(text)
		  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
		  let index = 0
		  let key = 0
		  let match = pattern.exec(source)
		  while (match !== null) {
		    if (match.index > index) nodes.push(source.slice(index, match.index))
		    const token = match[0]
		    if (token.startsWith('`')) {
		      nodes.push(React.createElement('code', { key: key++, className: 'mm-inline-code' }, token.slice(1, -1)))
		    } else if (token.startsWith('**')) {
		      nodes.push(React.createElement('strong', { key: key++, className: 'mm-strong' }, token.slice(2, -2)))
		    } else if (token.startsWith('*')) {
		      nodes.push(React.createElement('em', { key: key++, className: 'mm-em' }, token.slice(1, -1)))
		    } else {
		      const label = token.slice(1, token.indexOf(']'))
		      const href = match[4]
		      nodes.push(React.createElement('a', {
		        key: key++,
		        className: 'mm-link',
		        href,
		        target: '_blank',
		        rel: 'noreferrer',
		      }, label))
		    }
		    index = match.index + token.length
		    match = pattern.exec(source)
		  }
		  if (index < source.length) nodes.push(source.slice(index))
		  return nodes
		}

		/** One message body: blocks first, then the inline marks inside each block. */
		function Markdown({ text }) {
		  const lines = String(text).split('\n')
		  const blocks = []
		  let index = 0
		  let key = 0
		  while (index < lines.length) {
		    const line = lines[index]
		    if (line.trim() === '') {
		      index += 1
		      continue
		    }
		    if (/^\s*```/.test(line)) {
		      index += 1
		      const code = []
		      while (index < lines.length && !/^\s*```/.test(lines[index])) {
		        code.push(lines[index])
		        index += 1
		      }
		      index += 1
		      blocks.push(React.createElement('pre', { key: key++, className: 'mm-code' }, code.join('\n')))
		      continue
		    }
		    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
		    if (heading !== null) {
		      const size = heading[1].length
		      blocks.push(React.createElement('span', { key: key++, className: size === 1 ? 'mm-h1' : size === 2 ? 'mm-h2' : 'mm-h3' }, inline(heading[2])))
		      index += 1
		      continue
		    }
		    if (/^\s*>\s?/.test(line)) {
		      const quote = []
		      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
		        quote.push(lines[index].replace(/^\s*>\s?/, ''))
		        index += 1
		      }
		      blocks.push(React.createElement('span', { key: key++, className: 'mm-quote' }, inline(quote.join(' '))))
		      continue
		    }
		    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
		      const ordered = /^\s*\d+[.)]\s+/.test(line)
		      const items = []
		      while (index < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[index])) {
		        items.push(lines[index].replace(/^\s*([-*+]|\d+[.)])\s+/, ''))
		        index += 1
		      }
		      blocks.push(React.createElement('ul', {
		        key: key++,
		        className: 'mm-bullets',
		        'data-ordered': ordered ? 'true' : 'false',
		      }, items.map((item, itemIndex) => React.createElement('li', { key: itemIndex }, inline(item)))))
		      continue
		    }
		    const paragraph = []
		    while (index < lines.length
		      && lines[index].trim() !== ''
		      && !/^\s*(```|#{1,3}\s|>\s?|[-*+]\s|\d+[.)]\s)/.test(lines[index])) {
		      paragraph.push(lines[index])
		      index += 1
		    }
		    if (paragraph.length > 0) {
		      // A single break inside a paragraph stays a break: quotations, lines of verse and
		      // lists of names are ordinary in this material, and joining their lines would run
		      // them into one sentence.
		      blocks.push(React.createElement('span', { key: key++, className: 'mm-p' }, inline(paragraph.join('\n'))))
		    } else {
		      index += 1
		    }
		  }
		  return React.createElement('div', { className: 'mm-md' }, blocks)
		}

		/**
		 * The four corners of a frame, as two rules each: the full-screen mark.
		 *
		 * `out` is the mark that means "grow to the screen" — the corners open towards the frame
		 * edges. `in` is the same four rules carried back towards the centre, which is the mark
		 * every window manager uses for "leave it". Two states, one shape, so the control stays
		 * one thing in the eye rather than two.
		 *
		 * @param direction - 'out' to fill, 'in' to leave.
		 * @returns the glyph element.
		 */
		function cornersGlyph(direction) {
		  const p = direction === 'in'
		    ? ['M9 3v6H3', 'M15 3v6h6', 'M9 21v-6H3', 'M15 21v-6h6']
		    : ['M3 9V3h6', 'M21 9V3h-6', 'M3 15v6h6', 'M21 15v6h-6']
		  return React.createElement('svg', {
		    className: 'mm-glyph',
		    viewBox: '0 0 24 24',
		    width: '14',
		    height: '14',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, p.map((d, index) => React.createElement('path', { key: String(index), d })))
		}

		/**
		 * A cog beside a note: the mark for the working behind a reply.
		 *
		 * Three stacked rules was an abstraction of "there is more here", and it read as a list
		 * rather than as machinery — it did not say *what* was folded away. A cog and a page say the
		 * two things actually in there: the tools that ran, and the reasoning written around them.
		 * @returns the glyph element.
		 */
		function workGlyph() {
		  // Eight teeth around a hub would be a mess at fourteen pixels; four lobes do the job.
		  return React.createElement('svg', {
		    className: 'mm-glyph',
		    viewBox: '0 0 24 24',
		    width: '15',
		    height: '15',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, [
		    React.createElement('path', {
		      key: 'cog',
		      d: 'M9 4.2h2.4l.5 1.9 1.6.9 1.8-.7 1.7 1.7-.7 1.8.9 1.6 1.9.5v2.4l-1.9.5-.9 1.6.7 1.8-1.7 1.7-1.8-.7-1.6.9-.5 1.9H9l-.5-1.9-1.6-.9-1.8.7-1.7-1.7.7-1.8-.9-1.6-1.9-.5v-2.4l1.9-.5.9-1.6-.7-1.8 1.7-1.7 1.8.7 1.6-.9z',
		    }),
		    React.createElement('circle', { key: 'hub', cx: '10.2', cy: '11.3', r: '1.9' }),
		    React.createElement('path', { key: 'note', d: 'M16 5.5h5v13h-5z' }),
		    React.createElement('path', { key: 'rule1', d: 'M17.5 9h2M17.5 12h2M17.5 15h2', strokeWidth: '1.4' }),
		  ])
		}

		/**
		 * One mark per tab: a speech bubble, a question, a frame, linked nodes, a page.
		 *
		 * THE LABEL STAYS. An icon-only tab strip is a memory test — the marks mean nothing until
		 * they have been learned, and there are five of them. The mark is there so the strip can
		 * be scanned by shape, and the word is there so it can be read. This is the one place in
		 * the pane where a symbol does not carry the whole meaning on its own.
		 *
		 * @param name - the tab's key.
		 * @returns the glyph element.
		 */
		function tabGlyph(name) {
		  const paths = {
		    chat: ['M5 6h14v9H9l-4 3z'],
		    quiz: ['M5 5h14v14H5z', 'M12 9.4v1.1', 'M12 13.6v1.2'],
		    viz: ['M4 17l4-5 3 3 3-4 6 6', 'M4 5h16v14H4z'],
		    spine: ['M7 5h10v4H7z', 'M7 15h10v4H7z', 'M12 9v6'],
		    notes: ['M7 4h7l3 3v13H7z', 'M9 12h6', 'M9 15h6'],
		  }[name] ?? ['M5 5h14v14H5z']
		  return React.createElement('svg', {
		    className: 'mm-glyph mm-tab-glyph',
		    viewBox: '0 0 24 24',
		    width: '12',
		    height: '12',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, paths.map((d, index) => React.createElement('path', { key: String(index), d })))
		}

		/** A large A and a small one: the mark for the size of what is read. */
		function sizeGlyph() {
		  return React.createElement('svg', {
		    className: 'mm-glyph',
		    viewBox: '0 0 24 24',
		    width: '14',
		    height: '14',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, [
		    React.createElement('path', { key: 'big', d: 'M3 18l5-12 5 12' }),
		    React.createElement('path', { key: 'bar', d: 'M5 14h6' }),
		    React.createElement('path', { key: 'small', d: 'M15 18l3-7 3 7' }),
		  ])
		}

		/**
		 * The moon while the frame is dark, the sun while it is light.
		 *
		 * ONE MARK, SHOWING THE STATE. A sun-and-moon pair that named the *action* would have to be
		 * read twice — once to see which mark is there, once to work out what pressing it does. So
		 * the mark is what the pane is currently wearing, and the name says what pressing it gives
		 * you: the shape is the state, the label is the move.
		 *
		 * @param setting - 'light' or 'dark'.
		 * @returns the glyph element.
		 */
		function themeGlyph(setting) {
		  const dark = setting === 'dark'
		  return React.createElement('svg', {
		    className: 'mm-glyph',
		    viewBox: '0 0 24 24',
		    width: '14',
		    height: '14',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, dark
		    ? [React.createElement('path', {
		      key: 'moon',
		      d: 'M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z',
		    })]
		    : [
		      React.createElement('circle', { key: 'disc', cx: '12', cy: '12', r: '4.5' }),
		      React.createElement('path', {
		        key: 'rays',
		        d: 'M12 3v3M12 18v3M3 12h3M18 12h3M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1',
		      }),
		    ])
		}

		/** The close mark: two rules, crossed. */
		function crossGlyph() {
		  return React.createElement('svg', {
		    className: 'mm-glyph',
		    viewBox: '0 0 24 24',
		    width: '14',
		    height: '14',
		    'aria-hidden': 'true',
		    focusable: 'false',
		  }, [
		    React.createElement('path', { key: 'a', d: 'M5 5l14 14' }),
		    React.createElement('path', { key: 'b', d: 'M19 5L5 19' }),
		  ])
		}

		/** One clock reading, in the reader's own time zone. */
		function clockOf(ms) {
		  if (typeof ms !== 'number' || ms <= 0) return ''
		  const at = new Date(ms)
		  if (Number.isNaN(at.getTime())) return ''
		  return String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
		}

		/** The tools a step used, summarised as one line. */
		function toolLine(tools) {
		  const counts = new Map()
		  for (const name of tools) counts.set(name, (counts.get(name) ?? 0) + 1)
		  const parts = []
		  for (const [name, count] of counts) parts.push(count > 1 ? `${name} ×${count}` : name)
		  return parts.join(', ')
		}

		/**
		 * The chat column: the dialogue, and only the dialogue, unless the working is asked for.
		 *
		 * It scrolls on its own — its own element, its own scrollbar — which is the point of
		 * the whole window: reading back through the lesson never moves the question.
		 */
		function ChatView({ store, revision }) {
		  const scroller = React.useRef(null)
		  const pinned = React.useRef(true)
		  const transcript = React.useMemo(() => talk.transcript, [revision])
		  const rows = []

		  const showing = store.showWork === true
		  const rail = React.createElement('div', { key: 'rail', className: 'mm-rail' }, [
		    React.createElement('button', {
		      key: 'work',
		      type: 'button',
		      className: 'mm-rail-btn mm-icon-btn mm-toggle-btn',
		      'data-on': showing ? 'true' : 'false',
		      // The name says both halves, because a symbol alone cannot: the mark is three rules,
		      // which says "detail" and not "detail is currently shown".
		      'aria-label': showing ? 'Working: shown — press to hide' : 'Working: hidden — press to show',
		      'aria-pressed': showing ? 'true' : 'false',
		      title: showing
		        ? 'The reasoning and the tools are shown. Press to fold them away.'
		        : 'The reasoning and the tools behind each reply are folded away. Press to show them.',
		      onClick: () => {
		        state.showWork = !showing
		        publish()
		      },
		    }, workGlyph()),
		    React.createElement('button', {
		      key: 'text',
		      type: 'button',
		      // No field behind this one: the pips already say where in the cycle it is, and a second
		      // indicator for the same fact was the green slab they did not want.
		      className: 'mm-rail-btn mm-icon-btn',
		      'aria-label': 'Reading size: ' + store.text + ' of ' + TEXT_SIZES.join(', ') + ' — press for the next',
		      title: 'Reading size: ' + store.text + ' (' + String(TEXT_SIZES.indexOf(store.text) + 1)
		        + ' of ' + String(TEXT_SIZES.length) + '). Everything read moves together.',
		      onClick: () => {
		        const at = TEXT_SIZES.indexOf(state.text)
		        state.text = TEXT_SIZES[(at + 1) % TEXT_SIZES.length]
		        writePreference('mimir-lesson-text', state.text)
		        paintText()
		        publish()
		      },
		    }, [
		      React.createElement('span', { key: 'g', className: 'mm-size-mark' }, sizeGlyph()),
		      // Three pips and one filled: a control that cycles has to show where in the cycle it
		      // is, or pressing it is a lottery.
		      React.createElement('span', { key: 'pips', className: 'mm-pips' }, TEXT_SIZES.map((size, index) =>
		        React.createElement('span', {
		          key: size,
		          className: 'mm-pip-dot',
		          'data-on': size === store.text ? 'true' : 'false',
		          'data-step': String(index + 1),
		        }))),
		    ]),
		    React.createElement('button', {
		      key: 'theme',
		      type: 'button',
		      className: 'mm-rail-btn mm-icon-btn',
		      'data-theme': store.theme,
		      'aria-label': store.theme === 'dark' ? 'Switch to the light' : 'Switch to the dark',
		      title: store.theme === 'dark' ? 'Light' : 'Dark',
		      onClick: () => {
		        state.theme = state.theme === 'dark' ? 'light' : 'dark'
		        writePreference('mimir-lesson-theme', state.theme)
		        paintTheme()
		        publish()
		      },
		    }, themeGlyph(store.theme)),
		    React.createElement('span', { key: 'sp', className: 'mm-spacer' }),
		    React.createElement('span', { key: 'hint', className: 'mm-rail-hint' },
		      talk.running
		        ? 'the teacher is writing'
		        : transcript.length === 0 ? 'nothing said yet' : `${transcript.length} messages`),
		  ])

		  if (talk.hasMore) {
		    rows.push(React.createElement('button', {
		      key: 'older',
		      type: 'button',
		      className: 'mm-earlier',
		      onClick: () => { void loadEarlier() },
		    }, 'Load earlier turns'))
		  }

		  if (transcript.length === 0) {
		    rows.push(React.createElement('div', { key: 'empty', className: 'mm-chat-body' },
		      React.createElement('p', { className: 'mm-chat-empty' },
		        'The lesson is read here. As soon as the teacher speaks, the dialogue appears in this column — questions and replies only, with the working folded away until you ask for it.')))
		  }

		  for (let index = 0; index < transcript.length; index += 1) {
		    const message = transcript[index]
		    const who = message.who
		    rows.push(React.createElement('article', {
		      key: 'm' + String(index),
		      className: 'mm-msg',
		      'data-who': who,
		      'data-live': message.live === true ? 'true' : 'false',
		    }, [
		      React.createElement('div', { key: 'g', className: 'mm-gut' }, [
		        React.createElement('b', { key: 'n' }, who === 'you' ? 'you' : who === 'teacher' ? 'teacher' : 'log'),
		        React.createElement('i', { key: 't' }, clockOf(message.ms)),
		      ]),
		      React.createElement('div', { key: 'b', className: 'mm-bubble' }, React.createElement(Markdown, { text: message.text })),
		    ]))
		    if (message.tools.length > 0) {
		      rows.push(React.createElement('div', { key: 'w' + String(index), className: 'mm-work' },
		        'the working — ' + toolLine(message.tools)))
		      if (store.showWork === true) {
		        rows.push(React.createElement('div', { key: 'wb' + String(index), className: 'mm-work-body' }, [
		          React.createElement('b', { key: 'h' }, 'Tools in this step'),
		          toolLine(message.tools),
		        ]))
		      }
		    }
		  }

		  React.useEffect(() => {
		    const element = scroller.current
		    if (element === null || element === undefined) return
		    if (pinned.current === true) element.scrollTop = element.scrollHeight
		  })

		  // THE RAIL IS THE COLUMN'S HEAD, NOT THE TRANSCRIPT'S FIRST LINE. Inside the scroller it
		  // scrolled away with the first message, which put the reading controls out of reach
		  // exactly when a long reply made them worth reaching for. It is a sibling of the
		  // scroller now, so it cannot move: the messages scroll beneath it.
		  return React.createElement('div', { className: 'mm-pane-chat' }, [
		    rail,
		    React.createElement('div', {
		      key: 'scroll',
		      className: 'mm-chat',
		      ref: scroller,
		      onScroll: (event) => {
		        const element = event.target
		        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
		      },
		    }, rows),
		  ])
		}

		/** Page older history in, once, when the learner asks for it. */
		async function loadEarlier() {
		  const session = talk.session
		  if (session === undefined || session === null || typeof session.loadOlder !== 'function') return
		  for (let pass = 0; pass < PAGE_PASSES; pass += 1) {
		    const before = talk.source?.getSnapshot?.()?.revision ?? -1
		    await session.loadOlder()
		    await Promise.resolve()
		    const after = talk.source?.getSnapshot?.()?.revision ?? -1
		    if (after === before) break
		    if (talk.hasMore !== true) break
		  }
		  talk.publish()
		}

		/* ── the plugin ───────────────────────────────────────────────────────────────── */

		/**
		 * Register the pane's tab type, its body, the header chip that opens it, and the
		 * composer substitution that keeps the shipped question card off the reading column.
		 * @param ctx - client context carrying the slot registry, the tab registry, the
		 *   timer service, the session facts and the two namespaces the Host half serves.
		 */
		function apply(ctx) {
		  // Styles go in directly. `styles.insert` is a helper handed to DYNAMIC packages
		  // only — a resident plugin's bundle is ordinary page JavaScript with the real
		  // document, and reaching for that helper is what broke the app's boot.
		  const styleTag = document.createElement('style')
		  styleTag.dataset.mimirLessonPane = 'styles'
		  styleTag.textContent = CSS
		  document.head.append(styleTag)
		  const disposeCss = () => {
		    styleTag.remove()
		  }
		  const previousFlag = rootElement.getAttribute('data-mimir')
		  rootElement.setAttribute('data-mimir', 'on')

		  /** The session the interface is showing, and the folder it is working in. */
		  function readSession() {
		    const sessions = ctx.get('sessions')
		    if (sessions === undefined || sessions.list === undefined) return null
		    const list = sessions.list.getSnapshot()
		    const current = list?.current
		    if (typeof current !== 'string') return null
		    const cwd = list.byId?.[current]?.cwd
		    return { sessionId: current, cwd: typeof cwd === 'string' && cwd.length > 0 ? cwd : null }
		  }

		  /**
		   * Show the pane's tab in the right column. Called on session entry and whenever a
		   * question arrives, so a question is never waiting behind a collapsed column.
		   */
		  function ensureTab() {
		    try {
		      const sidebar = ctx.get('sidebarRight')
		      if (sidebar === undefined || typeof sidebar.openTab !== 'function') {
		        state.dockNote = 'the right column is not reachable from this plugin'
		        return false
		      }
		      let present = false
		      try {
		        const layout = sidebar.mounted?.()?.layout
		        const tabs = layout?.tabs
		        if (tabs !== undefined && tabs !== null) {
		          for (const id in tabs) if (tabs[id] !== null && tabs[id].kind === KIND) present = true
		        }
		      } catch {
		        present = false
		      }
		      if (!present) sidebar.openTab(KIND, {})
		      state.dockNote = ''
		      return true
		    } catch (error) {
		      state.dockNote = String(error?.message ?? error)
		      return false
		    }
		  }

		  /**
		   * Move the pane onto the session the interface is actually showing, if it moved.
		   *
		   * THE BUG THIS FIXES. Reading the session used to happen only on a timer, and the poll
		   * is every 2.5 seconds. Switching sessions therefore left the pane pointing at the old
		   * one for up to that long — long enough for the lesson that had just started in the
		   * NEW session to be read against the OLD session's id, find no lesson (or worse, find
		   * one), and raise the window in the wrong conversation. The window is per session and
		   * has to be treated that way: this runs synchronously on every render, so by the time
		   * anything is drawn the pane already belongs to the session on screen.
		   *
		   * @returns whether the session changed, so the caller can publish outside its render.
		   */
		  function syncSession() {
		    const current = readSession()
		    if (current === null || current.sessionId === lastSessionId) return false
		    lastSessionId = current.sessionId
		    state.sessionId = current.sessionId
		    state.root = current.cwd
		    state.lesson = null
		    state.answers = []
		    state.notes = ''
		    state.picked = {}
		    state.custom = ''
		    state.staged = null
		    state.stagedInserted = false
		    state.status = 'loading'
		    state.hasLesson = false
		    state.closedQuestion = ''
		    // A window that belongs to the session we just left is closed, not repointed: it
		    // was opened on that lesson, and quietly swapping its contents underneath the
		    // learner is the same failure in a new coat.
		    if (lessonWindow !== null && lessonWindow.sessionId !== current.sessionId) closeLessonWindow()
		    // Read the state first: a session with no lesson gets no chip and no strip from
		    // this plugin, and no window either. Chained onto whatever read is in flight rather
		    // than raced against it, because a read fenced out by this very switch would
		    // otherwise leave the pane waiting for the next poll.
		    scheduleRefresh()
		    // THE REOPEN BELONGS TO THE SWITCH, NOT TO THE NEXT RENDER — and it is a standing
		    // intention rather than a scheduled callback. Arriving in a session whose lesson has
		    // a question waiting must raise the window, and that must not depend on which render
		    // follows the switch: a seat may not be mounted at all, and one that is mounted may
		    // not re-render for seconds. A callback version of this was tried first and raced
		    // the very read it was waiting on. The flag is acted on in the one place that knows
		    // the lesson is in hand — the end of {@link refresh} — so the window goes up on the
		    // read it was waiting for, and always for the session on screen.
		    awaitReopen = true
		    // Publish the live session first: the teacher reads this pointer to find the
		    // session it is teaching, and publishing a question should never be a guess.
		    callHost('session', {}).catch(() => {
		      /* the pane still works; only lesson publishing depends on the pointer */
		    })
		    reportHealth()
		    return true
		  }

		  /**
		   * Start a read, behind whatever read is already running.
		   *
		   * Two reads at once are two chances to be overtaken, and the loser is the one whose
		   * session is on screen. Chaining keeps the order the pane asked in, and the poll
		   * cannot stack a queue behind it because each new read waits on the last one only.
		   */
		  function scheduleRefresh() {
		    const previous = refreshInFlight
		    const next = previous === null
		      ? refresh()
		      : previous.then(() => refresh(), () => refresh())
		    refreshInFlight = next.then(() => {}, () => {})
		    return next
		  }

		  /** The read in flight, so a later one can wait for it instead of racing it. */
		  let refreshInFlight = null

		  /**
		   * One round trip: the lesson, the set-aside answers, the page, and the shelf.
		   *
		   * Fenced to the session it was started for: a session switch mid-flight is a normal
		   * event (a lesson beginning in another conversation is exactly when it happens), and
		   * the answer to the old session's question must never land on the new one.
		   */
		  async function refresh() {
		    const sessionId = state.sessionId
		    if (sessionId === null) return
		    try {
		      const payload = await callHost('read-state', {})
		      if (state.sessionId !== sessionId) return
		      if (payload === null || payload.ready !== true) {
		        state.status = 'unavailable'
		        state.reason = payload === null ? 'no answer from the Host' : String(payload.reason)
		        publish()
		        return
		      }
		      state.status = 'ready'
		      state.hasLesson = payload.hasLesson === true
		      if (typeof payload.vault === 'string') state.vault = payload.vault
		      state.lesson = payload.lesson
		      // The teacher has published a different question: the answer they just gave is no
		      // longer the thing on screen, so the confirmation gives way to the next question.
		      if (state.refreshedTarget !== null
		        && publishedQuestion(payload.lesson) !== state.refreshedTarget) {
		        state.refreshedTarget = null
		        state.sent = null
		      }
		      state.answers = payload.answers
		      state.visuals = payload.visuals
		      if (typeof payload.notes === 'string' && state.notesDirty !== true && payload.notes !== state.notes) state.notes = payload.notes
		      publish()
		      considerReopen()
		    } catch (error) {
		      if (state.sessionId !== sessionId) return
		      state.status = 'error'
		      state.reason = String(error?.message ?? error)
		      publish()
		    }
		  }

		  /** The question the lesson file currently names, regardless of what has been answered. */
		  function publishedQuestion(lesson) {
		    const quiz = lesson?.quiz
		    if (quiz === null || quiz === undefined || typeof quiz !== 'object') return null
		    if (typeof quiz.question === 'string' && quiz.question.length > 0) return quiz.question
		    if (Array.isArray(quiz.items)) {
		      for (const item of quiz.items) {
		        if (typeof item?.question === 'string' && item.question.length > 0) return item.question
		      }
		    }
		    return null
		  }

		  /**
		   * The question the pane should be carrying: the first one the teacher has published
		   * that the learner has not already answered or set aside.
		   *
		   * An answered question is one of those. The teacher replaces the lesson file when the
		   * next question comes, so the moment a click lands the file still holds the question
		   * that was just answered — and reading the file alone would put it straight back on
		   * screen. `refreshedTarget` is that answer remembered, and it is released when the file
		   * carries a genuinely different question (see {@link refresh}).
		   */
		  function currentQuestion() {
		    const quiz = state.lesson?.quiz
		    if (quiz === null || quiz === undefined || typeof quiz !== 'object') return null
		    const seen = {}
		    for (const item of state.answers) if (typeof item?.question === 'string') seen[item.question] = true
		    if (typeof state.refreshedTarget === 'string') seen[state.refreshedTarget] = true
		    const one = (entry) => {
		      if (typeof entry?.question !== 'string' || entry.question.length === 0) return null
		      if (seen[entry.question] === true) return null
		      return {
		        question: entry.question,
		        options: Array.isArray(entry.options) ? entry.options : [],
		        hint: typeof entry.hint === 'string' ? entry.hint : '',
		      }
		    }
		    if (typeof quiz.question === 'string' && quiz.question.length > 0) return one(quiz)
		    if (Array.isArray(quiz.items)) for (const item of quiz.items) {
		      const found = one(item)
		      if (found !== null) return found
		    }
		    return null
		  }

		  /**
		   * Answer the question: write it down, and put it in the chat.
		   *
		   * AN ANSWER IS NOT A DRAFT. The learner choosing an option is the whole act — there is
		   * nothing left to compose and nothing to confirm — so the pane records it and sends it
		   * in one move. The two halves are ordered deliberately: the vault is written first,
		   * because the teacher reads these files and a message that never leaves this browser
		   * must not also be an answer that was never recorded.
		   *
		   * The send is the composer's own path — `setDraft` then `submit`, the same two calls
		   * its own send button makes — so what lands in the chat is an ordinary message from
		   * them, arrives in the transcript the pane is reading, and reaches the teacher by the
		   * route it already uses. No second channel, and nothing the product does not already
		   * expect a draft to become.
		   *
		   * @param choice - the option they picked, or '' when they wrote the answer themselves.
		   * @param typed - what they wrote, or '' when they picked an option.
		   */
		  async function answerQuestion(choice, typed) {
		    const question = currentQuestion()
		    if (question === null || state.sending !== null) return
		    const chosen = typeof choice === 'string' ? choice.trim() : ''
		    const custom = typeof typed === 'string' ? typed.trim() : ''
		    if (chosen === '' && custom === '') return
		    // Marked answered before the round trip so the question cannot be asked twice, and
		    // so the card can leave the screen the instant they click rather than after a fetch.
		    state.refreshedTarget = question.question
		    state.picked = {}
		    state.custom = ''
		    state.sending = { question: question.question, line: answerLine(chosen, custom) }
		    state.sent = null
		    publish()
		    let saved = false
		    try {
		      const result = await callHost('answer-question', {
		        entry: {
		          question: question.question,
		          choice: chosen,
		          custom,
		          at: new Date().toISOString(),
		        },
		      })
		      saved = result !== null && result.saved === true
		    } catch {
		      saved = false
		    }
		    if (saved !== true) {
		      // The answer is still theirs, and still on screen: say the write failed and let them
		      // send it again rather than discarding it into a state they cannot see.
		      state.sending = null
		      state.sent = { question: question.question, line: answerLine(chosen, custom), failed: true }
		      publish()
		      refresh()
		      return
		    }
		    sendToChat(answerLine(chosen, custom))
		    state.sending = null
		    state.sent = { question: question.question, line: answerLine(chosen, custom), failed: false }
		    publish()
		    refresh()
		  }

		  /** The answer as one line of chat, and as the vault records it. */
		  function answerLine(choice, custom) {
		    if (choice === '') return custom
		    if (custom === '') return choice
		    return choice + ' — ' + custom
		  }

		  /**
		   * Put one line into this session's message box and send it.
		   *
		   * `setDraft` then `submit` is the composer's own pair; either half missing leaves the
		   * pane able to record an answer but not to send one, which is reported rather than
		   * passed off as sent.
		   *
		   * @param line - the message text.
		   * @returns whether the send was handed to the composer.
		   */
		  function sendToChat(line) {
		    try {
		      const actions = ctx.get('sessions')?.binding(state.sessionId)?.inputActions
		      if (actions === null || actions === undefined) return false
		      if (typeof actions.setDraft !== 'function' || typeof actions.submit !== 'function') return false
		      actions.setDraft(line)
		      actions.submit()
		      return true
		    } catch (error) {
		      console.error('mimir-lesson: the answer could not be sent: ' + String(error?.message ?? error))
		      return false
		    }
		  }

		  /** Park the question rather than answering it, so the teacher can come back to it. */
		  async function setAside() {
		    const question = currentQuestion()
		    if (question === null) return
		    const chosen = state.picked[question.question]
		    try {
		      await callHost('dismiss-question', {
		        entry: {
		          question: question.question,
		          custom: typeof chosen === 'string' ? chosen : '',
		          at: new Date().toISOString(),
		        },
		      })
		    } catch {
		      /* the question stays on screen either way */
		    }
		    await scheduleRefresh()
		  }

		  let notesTimer = null
		  function changeNotes(text) {
		    state.notes = text
		    state.notesDirty = true
		    publish()
		    if (notesTimer !== null) notesTimer()
		    notesTimer = ctx.timeout(() => {
		      notesTimer = null
		      state.notesDirty = false
		      callHost('save-notes', { text: state.notes }).catch(() => {
		        /* kept for this session */
		      })
		    }, 700)
		  }

		  const visualCache = {}

		  /**
		 * Which role each of a drawing's colours plays.
		 *
		 * THE DRAWINGS COME IN TWO PALETTES AND WEAR NEITHER OF THEM HERE. Every SVG in `Learn/Viz`
		 * is authored light, with a second block behind `prefers-color-scheme: dark` — and the pane's
		 * theme is its own, so that media query never fires. The result was a diagram painted for
		 * white paper, sitting on whichever paper the pane was using: dark ink on dark, or a white
		 * slab in the middle of a dark lesson.
		 *
		 * The author already decided what every colour MEANS, and said so twice — once per palette.
		 * So the two palettes are read as a mapping rather than a preference: each of a drawing's
		 * colours is replaced by the token that carries the same role in the pane's own frame. The
		 * drawing is unchanged; it is inked in the theme it finds itself in.
		 *
		 * A colour absent from this table is left exactly as written, which is the honest outcome: a
		 * drawing that introduces a colour this table has never seen is a drawing from a newer maker,
		 * and inventing a role for it would be worse than leaving it alone.
		 */
		const VIZ_ROLES = new Map([
		  // ── the Mimir palette, which every drawing in Learn/Viz is now inked in ──────
		  // Surfaces: the paper, the next shade of it, and the drawing's own canvas. The
		  // canvas is listed so dark artwork does not stay a bright slab in a dark lesson.
		  ['#faf6ea', 'var(--bg)'], ['#131a19', 'var(--bg)'],
		  ['#f2ead6', 'var(--bg-2)'], ['#18211f', 'var(--bg-2)'],
		  ['#e9dfc6', 'var(--bg-3)'], ['#1f2a27', 'var(--bg-3)'],
		  ['#fbfaf6', 'var(--bg)'], ['#f7faf8', 'var(--bg)'],
		  // Ink, in three weights.
		  ['#25231d', 'var(--fg)'], ['#e6f0e6', 'var(--fg)'],
		  ['#5d5749', 'var(--fg-2)'], ['#9db3a9', 'var(--fg-2)'],
		  ['#756d59', 'var(--fg-3)'], ['#82998f', 'var(--fg-3)'],
		  // Rules: the hairline, and the one weight that means "surface".
		  ['#e3d9c1', 'var(--rule)'], ['#25322e', 'var(--rule)'],
		  ['#eadfc8', 'var(--rule)'], ['#2b3a35', 'var(--rule)'],
		  ['#c9bc9e', 'var(--line)'], ['#33443e', 'var(--line)'],
		  // The accent, and the tint that means "chosen".
		  ['#4f7a5c', 'var(--accent)'], ['#8fd6a4', 'var(--accent)'],
		  ['#dbe8d4', 'var(--accent-soft)'], ['#1e3830', 'var(--accent-soft)'],
		  // The three voices a state is allowed to speak in.
		  ['#2f7d63', 'var(--mm-mint)'], ['#a6e3bd', 'var(--mm-mint)'],
		  ['#b5642f', 'var(--mm-peach)'], ['#f0b183', 'var(--mm-peach)'],
		  ['#f4e7d6', 'var(--mm-peach-soft)'], ['#33261d', 'var(--mm-peach-soft)'],
		  ['#2c6b7a', 'var(--mm-cyan)'], ['#95d7de', 'var(--mm-cyan)'],

		  // ── the palette the drawings were made in before Mimir ───────────────────────
		  // Kept so that an older drawing, or one that arrives from the library, still
		  // resolves to its role instead of being left as written. Retire this block when
		  // nothing on disk carries these values any more.
		  ['#26292c', 'var(--fg)'], ['#16191c', 'var(--fg)'],
		  ['#e8eaec', 'var(--fg)'], ['#5d666e', 'var(--fg-2)'],
		  ['#a8b0b7', 'var(--fg-2)'], ['#8b9298', 'var(--fg-3)'],
		  ['#ffffff', 'var(--bg)'], ['#1d2024', 'var(--bg)'],
		  ['#f4f6f7', 'var(--bg-2)'], ['#23272b', 'var(--bg-2)'],
		  ['#e4e6e8', 'var(--rule)'], ['#33383d', 'var(--rule)'],
		  ['#23282d', 'var(--accent)'],
		  ['#c3c9cf', 'var(--line)'], ['#c9ced3', 'var(--line)'],
		  ['#454b51', 'var(--line)'],
		  // and the old state colours, from before mermaid's classes moved too
		  ['#2e7d32', 'var(--mm-mint)'], ['#c07a00', 'var(--mm-peach)'],
		  ['#c62828', 'var(--mm-peach)'],
		  ['#8a8a8a', 'var(--fg-3)'], ['#9e9e9e', 'var(--fg-3)'],
		])

		/**
		 * Rewrite one drawing's stylesheet for the frame it is being read in.
		 *
		 * Two things happen, and both are necessary:
		 *
		 *   * EVERY COLOUR IS REPLACED by the token carrying the same role — see {@link VIZ_ROLES}.
		 *   * EVERY SELECTOR IS SCOPED to this one figure. An SVG's stylesheet is not scoped to its
		 *     own document fragment: injected as it stands, its `text{font-family:…}` rule would
		 *     restyle every piece of text in the app. The id is unique per drawing and per mount, so
		 *     two of these on screen cannot collide.
		 *
		 * The `prefers-color-scheme` block is dropped rather than translated: it is the author's
		 * answer to a question the pane does not ask.
		 *
		 * @param svg - the drawing as text.
		 * @param scope - a unique CSS id for this mount.
		 * @param textSize - the token the drawing's text should scale with.
		 * @returns `{ markup, css }` — the drawing with its style block removed, and the rewritten
		 *   stylesheet to install separately.
		 */
		function adaptDrawing(svg, scope, textSize) {
		  const blocks = [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
		  if (blocks.length === 0) return { markup: svg, css: '' }
		  let markup = svg
		  const rules = []
		  for (const block of blocks) {
		    markup = markup.replace(block[0], '')
		    // Both non-light blocks go: the media query, which answers about the machine rather
		    // than about this pane, and the `.theme-dark` block, which answers about the app the
		    // pane is not following. What is left is the light palette, which the role table then
		    // re-inks into whichever frame the pane is in.
		    // A drawing's comments are prose about the drawing, not styling. They have no colour
		    // in them and no selector, but the rule scanner below matches their text as though it
		    // were a rule — and an unscoped comment in a stylesheet installed beside the app is
		    // worse than useless. Strip them before anything else looks at the source.
		    const source = block[1]
		      .replace(/\/\*[\s\S]*?\*\//g, '')
		      .replace(/@media[^{]*\{([\s\S]*?)\}\s*\}/g, '')
		      .replace(/\.theme-dark[^{]*\{([^{}]*)\}/g, '')
		    for (const rule of source.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		      let body = rule[2]
		      for (const [colour, token] of VIZ_ROLES) {
		        body = body.replace(new RegExp(colour, 'gi'), token)
		      }
		      // The drawing's own type scales with the lesson's, so one reading size moves the whole
		      // page rather than only the prose beside it.
		      body = body.replace(/font-size:\s*12\.5px/g, 'font-size:calc(' + textSize + ' - 4px)')
		      const scoped = rule[1].split(',').map((selector) => '#' + scope + ' ' + selector.trim()).join(',')
		      rules.push(scoped + '{' + body + '}')
		    }
		  }
		  // THE COLOURS WRITTEN ONTO THE ELEMENTS ARE REWRITTEN HERE TOO.
		  //
		  // Each drawing writes its fills as inline `!important` styles, so that no stylesheet
		  // anywhere — this theme, the app's, an embed path — can leave a box unpainted. The cost
		  // of that strength is that a rule cannot reach them: the loop above re-inks every rule in
		  // the drawing, and the elements themselves would keep the light palette they were written
		  // with. So the same role table is applied to the markup. An inline style is only text
		  // until the browser parses it, and this is the moment it is text.
		  for (const [colour, token] of VIZ_ROLES) {
		    markup = markup.replace(new RegExp(colour, 'gi'), token)
		  }
		  return { markup, css: rules.filter(rule => !rule.startsWith('/*')).join('\n') }
		}

		/** One drawing from Learn/Viz, rendered at the pane's full width. */
		  function Visual({ name, theme }) {
		    const [entry, setEntry] = React.useState(visualCache[name] ?? { status: 'loading' })
		    const [scope] = React.useState(() => 'mm-viz-' + Math.random().toString(36).slice(2, 9))
		    React.useEffect(() => {
		      let live = true
		      if (visualCache[name]?.status === 'ok') {
		        setEntry(visualCache[name])
		        return () => {
		          live = false
		        }
		      }
		      callHost('read-visual', { name }).then(
		        (payload) => {
		          const next = payload !== null && payload.ok === true
		            ? { status: 'ok', svg: String(payload.svg) }
		            : { status: 'failed', reason: payload === null ? 'no answer from the Host' : String(payload.reason) }
		          visualCache[name] = next
		          if (live) setEntry(next)
		        },
		        (error) => {
		          if (live) setEntry({ status: 'failed', reason: String(error?.message ?? error) })
		        },
		      )
		      return () => {
		        live = false
		      }
		    }, [name])
		    // The drawing is re-inked whenever the frame changes, so a lesson read in the light and
		    // then in the dark does not keep the first frame's diagram.
		    const adapted = React.useMemo(
		      () => (entry.status === 'ok' ? adaptDrawing(entry.svg, scope, 'var(--mm-t)') : { markup: '', css: '' }),
		      [entry.status, entry.svg, scope, theme],
		    )
		    React.useEffect(() => {
		      if (adapted.css === '') return undefined
		      const tag = document.createElement('style')
		      tag.dataset.mimirViz = scope
		      tag.textContent = adapted.css
		      document.head.append(tag)
		      return () => { tag.remove() }
		    }, [adapted.css, scope])
		    void theme
		    return React.createElement('figure', { className: 'mm-fig' }, [
		      entry.status === 'ok'
		        ? React.createElement('div', {
		          key: 'svg',
		          id: scope,
		          className: 'mm-fig-body',
		          dangerouslySetInnerHTML: { __html: adapted.markup },
		        })
		        : React.createElement('div', { key: 'msg', className: 'mm-hint' },
		            entry.status === 'loading' ? 'Opening the drawing.' : 'This drawing could not be opened: ' + String(entry.reason)),
		      React.createElement('figcaption', { key: 'cap', className: 'mm-cap' }, name),
		    ])
		  }

		  function QuizTab({ store, question }) {
		    // What happened to the last answer, if anything. Shown whether or not a question is
		    // still on screen, because the moment after a click is exactly when they want to know
		    // that it landed.
		    const sent = store.sent
		    const confirmation = sent === null || sent === undefined ? null : React.createElement('div', {
		      key: 'sent',
		      className: 'mm-card mm-confirm',
		      'data-failed': sent.failed === true ? 'true' : 'false',
		    }, [
		      React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, sent.failed === true ? 'Not sent' : 'Answered'),
		      React.createElement('p', { key: 'q', className: 'mm-hint' }, String(sent.question)),
		      React.createElement('p', { key: 'a', className: 'mm-sent-line' }, String(sent.line)),
		      React.createElement('p', { key: 'h', className: 'mm-hint' }, sent.failed === true
		        ? 'It could not be written down or sent. Try again below.'
		        : 'Written down and sent to the chat. The teacher has it.'),
		      React.createElement('div', { key: 'go', className: 'mm-actions' }, [
		        React.createElement('button', {
		          key: 'again',
		          type: 'button',
		          className: 'mm-ghost',
		          onClick: () => {
		            state.sent = null
		            state.refreshedTarget = null
		            publish()
		          },
		        }, 'Answer again'),
		        React.createElement('button', { key: 'later', type: 'button', className: 'mm-ghost', onClick: () => { setAside() } }, 'Set aside'),
		      ]),
		    ])

		    if (question === null) {
		      return React.createElement('div', null, [
		        confirmation,
		        React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Quiz'),
		        React.createElement('p', { key: 'p', className: 'mm-hint' }, store.answers.length > 0
		          ? 'Nothing is waiting for an answer. The next question appears here the moment it is set.'
		          : 'No question is set for this session yet. When one is set it appears here, and the reading stays at full height.'),
		      ].filter((node) => node !== null))
		    }

		    const sending = store.sending !== null && store.sending !== undefined
		      && store.sending.question === question.question
		    const card = [
		      React.createElement('p', { key: 'q', className: 'mm-q' }, question.question),
		      // One click is the whole answer: it is written down and sent. There is no second
		      // button because there is no second decision.
		      React.createElement('div', { key: 'opts', className: 'mm-opts' }, question.options.map((option, index) => {
		        const label = optionLabel(option)
		        return React.createElement('button', {
		          key: String(index),
		          type: 'button',
		          className: 'mm-opt',
		          disabled: sending,
		          onClick: () => { void answerQuestion(label, '') },
		        }, [
		          React.createElement('span', { key: 't', className: 'mm-tick' }, ''),
		          React.createElement('span', { key: 'l' }, label),
		        ])
		      })),
		      React.createElement('label', { key: 'lab', className: 'mm-label', htmlFor: 'mm-custom' }, 'Or in your own words'),
		      React.createElement('textarea', {
		        key: 'ta',
		        id: 'mm-custom',
		        className: 'mm-area',
		        value: store.custom,
		        placeholder: 'Say it the way you would say it, not the way the options do.',
		        disabled: sending,
		        onChange: (event) => {
		          state.custom = event.target.value
		          publish()
		        },
		        // Enter sends, Shift-Enter makes a new line: the same bargain every message box
		        // in this app makes, so an answer written here needs no second gesture either.
		        onKeyDown: (event) => {
		          if (event.key !== 'Enter' || event.shiftKey === true) return
		          event.preventDefault()
		          void answerQuestion('', state.custom)
		        },
		      }),
		      question.hint === '' ? null : React.createElement('p', { key: 'hint', className: 'mm-hint', style: { marginTop: '10px' } }, question.hint),
		      React.createElement('div', { key: 'go', className: 'mm-actions' }, [
		        React.createElement('button', {
		          key: 'send',
		          type: 'button',
		          className: 'mm-send',
		          disabled: sending || String(store.custom).trim() === '',
		          onClick: () => { void answerQuestion('', state.custom) },
		        }, sending ? 'Sending' : 'Answer'),
		        React.createElement('button', { key: 'later', type: 'button', className: 'mm-ghost', onClick: () => { setAside() } }, 'Set aside for now'),
		      ]),
		      sending ? React.createElement('p', { key: 'st', className: 'mm-hint', style: { marginTop: '10px' } }, 'Writing it down and sending it.') : null,
		    ]
		    const past = store.answers.map((item, index) => {
		      const answer = item.custom === undefined || item.custom === ''
		        ? String(item.choice)
		        : String(item.choice === undefined || item.choice === '' ? item.custom : item.choice + ' \u2014 ' + item.custom)
		      return React.createElement('div', { key: String(index), className: 'mm-hint mm-past' }, [
		        React.createElement('div', { key: 'q', className: 'mm-past-q' }, String(item.question)),
		        React.createElement('div', { key: 'a', className: 'mm-past-a' }, answer),
		      ])
		    })
		    return React.createElement('div', null, [
		      confirmation,
		      React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Question'),
		      React.createElement('div', { key: 'card', className: 'mm-card' }, card.filter((node) => node !== null)),
		      store.answers.length === 0 ? null : React.createElement('div', { key: 'pe', className: 'mm-eyebrow' }, 'Answered and set aside earlier'),
		      store.answers.length === 0 ? null : React.createElement('div', { key: 'pl' }, past),
		    ].filter((node) => node !== null))
		  }

		  /** The lesson's drawings: the ones the teacher listed, or the shelf when none are listed. */
		  function VizTab({ store }) {
		    const pinned = []
		    if (Array.isArray(store.lesson?.visuals)) {
		      for (const entry of store.lesson.visuals) {
		        const name = typeof entry === 'string' ? entry : (typeof entry?.file === 'string' ? entry.file : null)
		        if (name !== null) pinned.push(name)
		      }
		    }
		    const names = pinned.length > 0 ? pinned : store.visuals.map((row) => row.name)
		    if (names.length === 0) {
		      return React.createElement('div', null, [
		        React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Visuals'),
		        React.createElement('p', { key: 'p', className: 'mm-hint' }, 'Nothing is drawn in this vault yet. Drawings open here at full width, while the reading stays where it is.'),
		      ])
		    }
		    return React.createElement('div', { className: 'mm-viz' }, names.slice(0, 8).map((name) =>
		      React.createElement(Visual, { key: name, name, theme: store.theme })))
		  }

		  /** The dependency spine of the lesson in progress, with what has actually landed. */
		  function SpineTab({ store }) {
		    const spine = Array.isArray(store.lesson?.spine) ? store.lesson.spine : []
		    if (spine.length === 0) {
		      return React.createElement('div', null, [
		        React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Spine'),
		        React.createElement('p', { key: 'p', className: 'mm-hint' }, 'No spine has been published for this session yet. It appears here as soon as the plan is written down.'),
		      ])
		    }
		    return React.createElement('div', null, [
		      React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Where this lesson rests'),
		      React.createElement('ul', { key: 'ul', className: 'mm-spine' }, spine.map((node, index) => {
		        const item = typeof node === 'string' ? { node, state: 'planned' } : node
		        const label = typeof item.node === 'string' ? item.node : String(item.label ?? '')
		        const stateName = typeof item.state === 'string' ? item.state : 'planned'
		        return React.createElement('li', { key: String(index), 'data-state': stateName }, [
		          React.createElement('span', { key: 'pip', className: 'mm-pip' }),
		          React.createElement('span', { key: 'n', className: 'mm-node' }, label),
		        ])
		      })),
		    ])
		  }

		  /** The learner's own page, kept on disk beside the session it belongs to. */
		  function NotesTab({ store }) {
		    return React.createElement('div', null, [
		      React.createElement('div', { key: 'e', className: 'mm-eyebrow' }, 'Your page'),
		      React.createElement('p', { key: 'h', className: 'mm-hint', style: { margin: '0 0 10px' } },
		        'Write before you answer. It is kept with the session, and the teacher can read it.'),
		      React.createElement('div', { key: 'sheet', className: 'mm-sheet' }, React.createElement('textarea', {
		        className: 'mm-page mm-ruled',
		        value: store.notes,
		        placeholder: 'What do you already accept that this rests on?',
		        onChange: (event) => changeNotes(event.target.value),
		      })),
		    ])
		  }

		  /** The session the pane is currently bound to, so a switch is noticed exactly once. */
		  let lastSessionId = null

		  /**
		   * A question is waiting in the session the pane has just arrived in, so the window
		   * should go up as soon as that session's lesson has been read. Armed by
		   * {@link syncSession}, discharged by {@link considerReopen}.
		   */
		  let awaitReopen = false

		  /**
		   * Raise the window if a session switch asked for it and its lesson is now in hand.
		   *
		   * Called only after a landed read, so the question it asks about belongs to the
		   * session on screen. The conditions are the ones that have always governed the
		   * window: nothing is waiting to be shown twice, the docked seat is not already
		   * displaying it, and it is not the question the learner just closed the window on.
		   */
		  function considerReopen() {
		    if (awaitReopen !== true) return
		    const waiting = currentQuestion()
		    if (waiting === null) return
		    awaitReopen = false
		    if (lessonWindow !== null || rendered === true) return
		    if (state.closedQuestion === waiting.question) return
		    openLessonWindow()
		  }

		  /**
		   * The pane as it is drawn, in either seat: the docked tab, or the lesson window.
		   *
		   * `chrome` changes the frame, not the lesson. Docked, the pane is one column in the
		   * right track and its tabs choose what that column shows; in the window, the left two
		   * thirds are the dialogue and the tabs govern the right third beside it. Everything
		   * below the frame is the same component reading the same store: the window is not a
		   * copy of the pane, it is the pane somewhere else — somewhere with room for both.
		   */
		  function PaneView({ store, chrome }) {
		    // Read the feed before drawing, not only when it publishes. Binding it is an
		    // effect — subscribing during render would notify React while React is rendering —
		    // so the first paint after a page load would otherwise show an empty dialogue even
		    // though the session is right there. This read is pure and cached by revision, so
		    // it costs nothing on the paints that follow.
		    talk.read()
		    // The session too: switching conversations must take effect on the paint that
		    // follows the switch, not on the next poll. Notifying React is deferred, because
		    // this runs inside a render.
		    if (syncSession()) queueMicrotask(publish)
		    const question = currentQuestion()
		    // The title is where they are, not what the pane is for: they know they are in a lesson, and
		    // the vault's name is the thing they might have two of. The Host names it, because only
		    // the filesystem knows where the vault root is.
		    const title = store.vault !== '' && store.vault !== undefined
		      ? store.vault
		      : state.root === null ? 'Lesson' : String(state.root).split('/').filter((part) => part.length > 0).pop() ?? 'Lesson'
		    const head = [
		      React.createElement('h2', { key: 't' }, title),
		      React.createElement('span', { key: 'sp', className: 'mm-spacer' }),
		    ].filter((node) => node !== null)
		    if (chrome === 'docked') {
		      head.push(React.createElement('button', {
		        key: 'open',
		        type: 'button',
		        className: 'mm-window-btn',
		        onClick: () => { openLessonWindow() },
		        title: 'Open the lesson in a window that can go fullscreen',
		      }, 'Open in a window'))
		    } else {
		      const filled = store.fill === true
		      // Both frame controls are symbols, so what they do is read at a glance rather than
		      // parsed from a word. The label a word used to carry is still there for anyone who
		      // needs it: the title is the tooltip, and the name is what a screen reader reads.
		      head.push(React.createElement('button', {
		        key: 'fs',
		        type: 'button',
		        className: 'mm-window-btn mm-icon-btn',
		        'aria-label': filled ? 'Leave the full screen' : 'Fill the screen',
		        title: filled ? 'Leave the full screen' : 'Fill the screen',
		        onClick: () => { toggleLessonFullscreen() },
		      }, cornersGlyph(filled ? 'in' : 'out')))
		      head.push(React.createElement('button', {
		        key: 'close',
		        type: 'button',
		        className: 'mm-window-btn mm-icon-btn',
		        'aria-label': 'Close the lesson',
		        title: 'Close the lesson',
		        onClick: () => { closeLessonWindow() },
		      }, crossGlyph()))
		    }

		    const body = []
		    if (store.status !== 'ready') {
		      body.push(React.createElement('p', { key: 'st', className: 'mm-hint' },
		        store.status === 'loading' ? 'Reading the lesson state.' : 'The lesson state is not available: ' + store.reason))
		    }
		    if (store.status === 'ready' && store.hasLesson !== true) {
		      body.push(React.createElement('p', { key: 'none', className: 'mm-hint' },
		        'No lesson is published for this session. The teacher writes one when a lesson begins.'))
		    }
		    if (store.tab === 'quiz') body.push(React.createElement(QuizTab, { key: 'quiz', store, question }))
		    if (store.tab === 'viz') body.push(React.createElement(VizTab, { key: 'viz', store }))
		    if (store.tab === 'spine') body.push(React.createElement(SpineTab, { key: 'spine', store }))
		    if (store.tab === 'notes') body.push(React.createElement(NotesTab, { key: 'notes', store }))

		    // The window splits the dialogue into its own column, so a Chat tab there would open a
		    // second view of something already on screen. Docked, there is no such column and the
		    // chat is exactly what that tab is for.
		    const tabRows = chrome === 'window'
		      ? [['quiz', 'Quiz'], ['viz', 'Visuals'], ['spine', 'Spine'], ['notes', 'Notes']]
		      : [['chat', 'Chat'], ['quiz', 'Quiz'], ['viz', 'Visuals'], ['spine', 'Spine'], ['notes', 'Notes']]
		    const tabs = tabRows.map((row) =>
		      React.createElement('button', {
		        key: row[0],
		        type: 'button',
		        className: 'mm-tab',
		        'data-on': store.tab === row[0] ? 'true' : 'false',
		        'data-blinking': row[0] === 'quiz' && question !== null && store.tab !== 'quiz' ? 'true' : 'false',
		        onClick: () => {
		          state.tab = row[0]
		          writePreference('mimir-lesson-tab', state.tab)
		          publish()
		        },
		      }, [
		        React.createElement('span', { key: 'g', className: 'mm-tab-mark' }, tabGlyph(row[0])),
		        React.createElement('span', { key: 'l' }, row[1]),
		      ]))

		    const narrow = chrome === 'window' && store.windowWide !== true
		    const rail = React.createElement('div', { key: 'tabs', className: 'mm-tabs' }, tabs)
		    const children = [
		      React.createElement('div', {
		        key: 'head',
		        className: chrome === 'docked' ? 'mm-head' : 'mm-head mm-window-bar',
		        onPointerDown: chrome === 'docked' ? undefined : startLessonDrag,
		      }, [
		        chrome === 'window' ? React.createElement('div', { key: 'leds', className: 'mm-leds' }, [
		          React.createElement('span', { key: 'a' }),
		          React.createElement('span', { key: 'b' }),
		          React.createElement('span', { key: 'c' }),
		        ]) : null,
		        ...head,
		      ]),
		      chrome !== 'window' || store.notice === '' ? null : React.createElement('p', {
		        key: 'notice',
		        className: 'mm-notice',
		        role: 'status',
		        'data-going': store.noticeFading === true ? 'true' : 'false',
		      }, store.notice),
		    ]

		    if (chrome === 'window') {
		      // The window is split: dialogue on the left, the question's own column on the
		      // right. Each scrolls by itself, which is what makes reading back through the
		      // lesson possible while a question is waiting.
		      children.push(React.createElement('div', { key: 'split', className: 'mm-split' }, [
		        React.createElement('section', { key: 'left', className: 'mm-pane-left' },
		          React.createElement(ChatView, { store, revision: talk.sequence })),
		        React.createElement('section', { key: 'right', className: 'mm-pane-right' }, [
		          rail,
		          React.createElement('div', { key: 'body', className: 'mm-body' }, body),
		        ]),
		      ]))
		    } else {
		      children.push(rail)
		      children.push(React.createElement('div', { key: 'body', className: 'mm-body' }, body))
		    }

		    return React.createElement('div', { className: 'mm-root', 'data-narrow': narrow ? 'true' : 'false' }, children)
		  }

		  /** The docked tab's body. */
		  function Body() {
		    const store = useStore()
		    React.useEffect(() => {
		      talk.bind(ctx.get('sessions'))
		      // The tick is the retry path. A session switch usually re-reads and re-raises the
		      // window from {@link syncSession} on the render that follows it, but that render
		      // is not guaranteed to happen — the docked seat can be mounted while the window
		      // is closed, and nothing else re-renders on a session change. Running the sync
		      // here as well means a lesson beginning in another session raises its window
		      // within one poll even if no render followed the switch.
		      tick()
		    })
		    // Proof that the tab body is on screen, not merely registered. A seat that
		    // registers but never renders is exactly the kind of failure this is for — and it
		    // is also what tells the window not to open itself in duplicate.
		    React.useEffect(() => {
		      rendered = true
		    }, [])
		    return React.createElement(PaneView, { store, chrome: 'docked' })
		  }

		  /** The lesson window's body: the same pane, with the window's own chrome. */
		  function LessonWindow() {
		    const store = useStore()
		    const [wide, setWide] = React.useState(true)
		    React.useEffect(() => {
		      talk.bind(ctx.get('sessions'))
		      tick()
		    })
		    React.useEffect(() => {
		      const element = lessonWindow?.element
		      if (element === null || element === undefined) return undefined
		      setWide(element.clientWidth >= 720)
		      if (typeof ResizeObserver !== 'function') return undefined
		      const observer = new ResizeObserver(() => {
		        setWide(element.clientWidth >= 720)
		      })
		      observer.observe(element)
		      return () => { observer.disconnect() }
		    }, [])
		    return React.createElement(PaneView, {
		      store: { ...store, windowWide: wide },
		      chrome: 'window',
		    })
		  }

		  /**
		   * The lesson window, when one is open: the panel element, its React root, and the
		   * question it was open on.
		   *
		   * One at a time. It is the same store the docked tab reads, so a question published
		   * by the teacher reaches whichever seat is on screen, and an answer composed here is
		   * written into this chat's message box by the same code path the docked pane uses.
		   */
		  let lessonWindow = null

		  /** How to take the opening splash down, while one is up. Null when none is. */
		  let splashStop = null

		  /**
		   * One file out of the vault, as a URL this page can load.
		   *
		   * This is the Harness' own bounded file route — the one the chat already uses to draw a
		   * picture named by an absolute path — so the animation stays in `Tools/splash/` and
		   * nothing about it is copied into this package. The path is relative, exactly as the
		   * four routes above are: the page is served by the Harness, so `/api/file` is its own
		   * origin and has no absolute form to prefer.
		   *
		   * @param root - the workspace folder, without a trailing slash.
		   * @param name - the file's name inside {@link SPLASH_DIR}.
		   * @returns the URL.
		   */
		  function splashUrl(root, name) {
		    return '/api/file?path=' + encodeURIComponent(root + '/' + SPLASH_DIR + '/' + name)
		  }

		  /**
		   * Play the startup animation once, over the window that has just opened.
		   *
		   * WHY THE BYTES ARE NOT IN THIS BUNDLE. The piece is a 1 MB VP9 WebM with a real alpha
		   * plane, and inlining it would put a megabyte of base64 into a source file whose whole
		   * virtue is that it can be read and diffed. It is fetched instead, by the route above.
		   *
		   * It leaves on its own when the clip ends, and any key or a click takes it down sooner:
		   * the window is already open behind it and a splash is never a thing to be waited out.
		   * Where motion is reduced the still frame plays instead — the piece's accessibility note
		   * asks for exactly that — held, then faded.
		   *
		   * @param host - the window element to cover.
		   */
		  function playWindowSplash(host) {
		    const root = typeof state.root === 'string' ? state.root.replace(/\/+$/, '') : ''
		    if (root === '') return
		    const reduced = typeof window.matchMedia === 'function'
		      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
		    const suffix = state.theme === 'dark' ? 'dark' : 'light'
		    const build = SPLASH_BUILDS[suffix]
		    const video = splashUrl(root, build.video)
		    const still = splashUrl(root, 'mimir_startup_' + suffix + '_poster.png')

		    const curtain = document.createElement('div')
		    curtain.className = 'mm-splash'
		    // DECORATION, AND SAID SO. Naming it for assistive technology put that name on screen
		    // instead: the app shows an element's accessible name as a tooltip, so the window
		    // opened trailing a sentence about tree roots. The alt text is kept with the rest of
		    // the piece's provenance in `Tools/splash/README.md`; a splash that any key dismisses
		    // and that says nothing the lesson needs is decorative.
		    curtain.setAttribute('aria-hidden', 'true')
		    curtain.style.setProperty(SPLASH_GROUND_VAR, build.ground)

		    let media = null
		    if (reduced) {
		      media = document.createElement('img')
		      media.src = still
		      media.alt = ''
		    } else {
		      media = document.createElement('video')
		      media.src = video
		      media.muted = true
		      media.autoplay = true
		      media.setAttribute('muted', '')
		      media.setAttribute('playsinline', '')
		      media.setAttribute('aria-hidden', 'true')
		    }
		    curtain.append(media)
		    host.append(curtain)

		    // The ceiling is declared before `stop` can run rather than before it is written, so
		    // that the one function can clear the other's clock without either being a special case.
		    let ceiling = null
		    let gone = false
		    const stop = () => {
		      if (gone) return
		      gone = true
		      splashStop = null
		      if (ceiling !== null) ceiling()
		      window.removeEventListener('keydown', onKey, true)
		      curtain.removeEventListener('click', stop)
		      if (media !== null) media.removeEventListener('ended', stop)
		      curtain.setAttribute('data-going', 'true')
		      ctx.timeout(() => curtain.remove(), 400)
		    }

		    /**
		     * The splash takes the key while it is up, and takes it in the capture phase.
		     *
		     * Escape during the opening animation should dismiss the animation, not close the
		     * window it is announcing — and the window's own Escape handler is on `document`, so a
		     * listener that only dismissed the splash would let the same press do both. Any key
		     * dismisses, which is why the event is not read at all: the first press is spent on the
		     * splash, and every press after it reaches whatever it was meant for.
		     */
		    const onKey = (event) => {
		      event.preventDefault()
		      event.stopPropagation()
		      stop()
		    }

		    window.addEventListener('keydown', onKey, true)
		    curtain.addEventListener('click', stop)
		    if (reduced) ceiling = ctx.timeout(stop, SPLASH_STILL_MS)
		    else {
		      media.addEventListener('ended', stop)
		      ceiling = ctx.timeout(stop, SPLASH_CEILING_MS)
		    }
		    splashStop = stop
		  }

		  /** Open — or raise — the lesson window, floating over the app. */
		  function openLessonWindow() {
		    if (lessonWindow !== null) return
		    let element = null
		    let root = null
		    try {
		      element = document.createElement('div')
		      element.className = 'mm-window'
		      element.setAttribute('data-mimir-window', 'on')
		      document.body.append(element)
		      root = createRoot(element)
		      root.render(React.createElement(LessonWindow))
		    } catch (error) {
		      // The window is a convenience; losing it must not lose the lesson. Fall back to
		      // the column, which is a seat the app itself owns.
		      console.error('mimir-lesson: the lesson window could not open: ' + String(error?.message ?? error))
		      if (element !== null) element.remove()
		      ensureTab()
		      return
		    }
		    lessonWindow = { element, root, sessionId: state.sessionId }
		    state.windowOpen = true
		    hushNotice()
		    state.fullscreen = false
		    state.fill = false
		    document.addEventListener('keydown', onLessonKey)
		    // After the window is up, never before: the splash covers the window it belongs to,
		    // and there has to be a window for it to cover. It is also decoration on a window that
		    // is already open and already useful, so a splash that cannot be drawn is a line in the
		    // console — never a reason for the lesson to fail to appear.
		    try {
		      playWindowSplash(element)
		    } catch (error) {
		      console.error('mimir-lesson: the opening splash was not drawn: ' + String(error?.message ?? error))
		    }
		    publish()
		    reportHealth()
		  }

		  /** Close it, and remember which question was closed so it does not reopen unasked. */
		  function closeLessonWindow() {
		    if (lessonWindow === null) return
		    document.removeEventListener('keydown', onLessonKey)
		    const { element, root } = lessonWindow
		    lessonWindow = null
		    state.windowOpen = false
		    state.fullscreen = false
		    state.fill = false
		    hushNotice()
		    state.closedQuestion = currentQuestion()?.question ?? ''
		    try {
		      root.unmount()
		    } catch (error) {
		      // A seat that is being removed anyway must not take the page down with it.
		      console.error('mimir-lesson: the lesson window did not unmount cleanly: ' + String(error?.message ?? error))
		    }
		    // A window closed while its splash is still playing takes the splash with it, keys
		    // and clocks included — otherwise the next keypress anywhere would be swallowed by a
		    // listener belonging to a window that is gone.
		    if (splashStop !== null) splashStop()
		    element.remove()
		    publish()
		  }

		  /**
		   * Escape closes the window, unless the browser is using Escape to leave fullscreen.
		   * Control-Shift-R raises it, and is swallowed when it does: the lesson is one key
		   * away from anywhere, and a page reload in the middle of a lesson is never what was
		   * meant by it. System accelerators (⌘ on the Mac) are left alone.
		   */
		  function onLessonKey(event) {
		    if (event.key === 'Escape') {
		      // Full screen is left first, the way every other window behaves: Escape on a
		      // filled lesson returns it to its floating size rather than closing it outright.
		      if (state.fill === true) {
		        toggleLessonFullscreen()
		        return
		      }
		      closeLessonWindow()
		      return
		    }
		    if (event.ctrlKey === true && event.shiftKey === true && (event.key === 'R' || event.key === 'r')) {
		      event.preventDefault()
		      if (lessonWindow === null) openLessonWindow()
		      else lessonWindow.element.focus?.()
		    }
		  }

		  /**
		   * Fill the page — the whole screen this app can actually give a plugin.
		   *
		   * WHY THIS IS NOT `requestFullscreen`. It was, and it did not work: this app's main
		   * process carries no fullscreen permission handler, so the request is refused, and
		   * the old handler then reached for inline `100vw/100vh` styles on an element that CSS
		   * already pins with `position:fixed` and `!important`-free shorthand — which is why
		   * the button looked dead. Nothing about the pane needs the OS-level API: the window is
		   * drawn in this document, so filling the page is the same result by a road that
		   * cannot be refused. It is a class, not inline styles, so the stylesheet stays the one
		   * place that decides what the window looks like.
		   *
		   * The app's own ⌃⌘F still takes the real screen when the whole app should go with it.
		   */
		  function toggleLessonFullscreen() {
		    const element = lessonWindow?.element
		    if (element === undefined) return
		    if (state.fill === true) {
		      element.removeAttribute('data-fill')
		      state.fill = false
		      hushNotice()
		      publish()
		      return
		    }
		    element.setAttribute('data-fill', 'on')
		    state.fill = true
		    sayBriefly('Filling the page. ⌃⌘F takes the whole screen.')
		  }

		  /** How long a passed-on fact stays on screen before it leaves of its own accord. */
		  const NOTICE_MS = 2200
		  const NOTICE_FADE_MS = 420

		  /** The timers a live notice owns, so a new one cannot be cancelled by its predecessor. */
		  let noticeTimer = null
		  let noticeFade = null

		  /**
		   * Say one thing, briefly.
		   *
		   * The window used to carry a bar across the top for this — a full-width rule explaining
		   * that the screen had been filled, which is a fact the screen itself already states. A
		   * notice about something that visibly happened does not need to persist, so this one
		   * fades out on its own and takes the layout with it.
		   * @param text - what to say.
		   */
		  function sayBriefly(text) {
		    state.notice = text
		    state.noticeFading = false
		    publish()
		    if (noticeTimer !== null) noticeTimer()
		    if (noticeFade !== null) noticeFade()
		    noticeTimer = ctx.timeout(() => {
		      noticeTimer = null
		      state.noticeFading = true
		      publish()
		      noticeFade = ctx.timeout(() => {
		        noticeFade = null
		        state.notice = ''
		        state.noticeFading = false
		        publish()
		      }, NOTICE_FADE_MS)
		    }, NOTICE_MS)
		  }

		  /**
		   * Say one thing and leave it said.
		   *
		   * For anything the learner has to act on — a refused full screen, a lesson that could
		   * not be sent — where a notice that disappeared would be a notice they never read.
		   * @param text - what to say.
		   */
		  function sayUntilAnswered(text) {
		    if (noticeTimer !== null) noticeTimer()
		    if (noticeFade !== null) noticeFade()
		    noticeTimer = null
		    noticeFade = null
		    state.notice = text
		    state.noticeFading = false
		    publish()
		  }

		  /** Drop whatever is being said, and stop the timers that would say it. */
		  function hushNotice() {
		    if (noticeTimer !== null) noticeTimer()
		    if (noticeFade !== null) noticeFade()
		    noticeTimer = null
		    noticeFade = null
		    state.notice = ''
		    state.noticeFading = false
		  }

		  /** Drag the window by its title bar. Buttons keep their own clicks. */
		  function startLessonDrag(event) {
		    const element = lessonWindow?.element
		    if (element === undefined) return
		    if (event.target !== null && event.target !== undefined && typeof event.target.closest === 'function') {
		      if (event.target.closest('button') !== null) return
		    }
		    const rect = element.getBoundingClientRect()
		    const offsetX = event.clientX - rect.left
		    const offsetY = event.clientY - rect.top
		    element.style.right = 'auto'
		    element.style.left = rect.left + 'px'
		    element.style.top = rect.top + 'px'
		    const move = (moveEvent) => {
		      element.style.left = Math.max(0, moveEvent.clientX - offsetX) + 'px'
		      element.style.top = Math.max(0, moveEvent.clientY - offsetY) + 'px'
		    }
		    const stop = () => {
		      window.removeEventListener('pointermove', move)
		      window.removeEventListener('pointerup', stop)
		    }
		    window.addEventListener('pointermove', move)
		    window.addEventListener('pointerup', stop)
		  }

		  function paneTitle() {
		    return 'Lesson'
		  }

		  /**
		   * The strip that stands in for the shipped question card.
		   *
		   * It goes in the composer's dock — a full-width row just above the message box —
		   * and it is deliberately only a strip: the question itself belongs in the pane,
		   * where there is room for it, and the reading column keeps its full height. The
		   * composer is never replaced, because the message box is how the learner sends
		   * the answer.
		   */
		  function QuestionStrip() {
		    const store = useStore()
		    const question = currentQuestion()
		    if (question === null || store.hasLesson !== true) return null
		    return React.createElement('div', { className: 'mm-focusbar' }, [
		      React.createElement('b', { key: 'b' }, 'Question'),
		      React.createElement('span', { key: 's' }, question.question),
		      React.createElement('button', { key: 'o', type: 'button', onClick: () => { openLessonWindow() } }, 'Open the lesson window'),
		    ])
		  }

		  /** The way in: the lesson window, from anywhere in the session header. */
		  function HeaderChip() {
		    const store = useStore()
		    const waiting = currentQuestion() !== null
		    // Installed for the whole profile, not for one preset: stay silent until a
		    // session actually has a lesson published for it.
		    if (store.hasLesson !== true) return null
		    return React.createElement('button', {
		      type: 'button',
		      className: 'mm-chip',
		      'data-waiting': waiting ? 'true' : 'false',
		      onClick: () => { openLessonWindow() },
		      title: 'Open the lesson window',
		    }, waiting ? 'Question' : 'Lesson')
		  }

		  // Declared before the seats are checked, not after: the guard below reports its own
		  // failure, and `reportHealth` reads both of these — leaving them lower in the body
		  // made a missing Slot seat throw a temporal-dead-zone error instead of reporting.
		  let tabRegistered = false
		  let rendered = false

		  const slots = ctx.get('slots')
		  if (slots === undefined) {
		    // Say it where it can be read. A console line is invisible to whoever is looking
		    // at the vault, and this is the one failure mode that leaves no other trace at
		    // all: the half applies, returns, and the pane simply never appears.
		    //
		    // The session pointer is read first on purpose: the Host refuses a report with no
		    // workspace folder to write into, so a report attempted before the session is
		    // known would be dropped exactly as quietly as the console line.
		    console.error('mimir-lesson: no slots service')
		    const session = readSession()
		    if (session !== null) {
		      state.sessionId = session.sessionId
		      state.root = session.cwd
		    }
		    reportHealth('no slots service: the Slot seat was absent when this half applied')
		    return
		  }

		  const disposers = [disposeCss, () => {
		    if (previousFlag === null) rootElement.removeAttribute('data-mimir')
		    else rootElement.setAttribute('data-mimir', previousFlag)
		    rootElement.removeAttribute('data-mm-theme')
		    rootElement.removeAttribute('data-mm-text')
		  }]

		  // The frame and the reading size are painted onto the document root, and the functions
		  // that do it live at module scope with the rest of the store — see the note there. There
		  // is nothing to watch for: the frame is the reader's, not the app's.
		  paintTheme()
		  paintText()

		  const tabRegistry = ctx.get('sidebarRightTabs')
		  if (tabRegistry !== undefined && typeof tabRegistry.register === 'function') {
		    disposers.push(tabRegistry.register({
		      id: TAB_ID,
		      kind: KIND,
		      priority: 'extension',
		      title: paneTitle,
		      guide: [{
		        order: 20,
		        title: paneTitle,
		        description: () => 'The lesson: the dialogue, the question, the drawings, the spine, and your page.',
		      }],
		    }))
		    tabRegistered = true
		  } else {
		    console.error('mimir-lesson: sidebarRightTabs is not reachable; the pane cannot dock')
		  }

		  disposers.push(slots.inject('sidebar.right.pane.tab', () =>
		    slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, Body)))
		  disposers.push(slots.inject('sidebar.right.pane.tab.title', () =>
		    slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, () => React.createElement('span', null, 'Lesson'))))
		  disposers.push(slots.inject('conversation.session.header.utilities', () =>
		    slots.register({ name: 'conversation.session.header.utilities', id: 'mimir-lesson', order: 30 }, HeaderChip)))
		  disposers.push(slots.inject('conversation.input.dock', () =>
		    slots.register({ name: 'conversation.input.dock', id: 'mimir-lesson-question', order: 4 }, QuestionStrip)))

		  /**
		   * Tell the Host what this page can see about the pane.
		   *
		   * Deliberately written to a file rather than only logged: the browser console is
		   * invisible to whoever is reading the vault, and a pane that fails to appear should
		   * leave evidence somewhere it can be found.
		   */
		  function reportHealth(extra) {
		    const payload = {
		      url: typeof location === 'undefined' ? '' : String(location.pathname),
		      stylesheets: typeof document === 'undefined'
		        ? 0
		        : Array.from(document.querySelectorAll('style')).filter((tag) => String(tag.textContent).includes('--mm-paper')).length,
		      rootFlag: typeof document === 'undefined' ? '' : String(document.documentElement.getAttribute('data-mimir')),
		      tabRegistered,
		      bodyRendered: rendered,
		      routeState: state.status + (state.reason === '' ? '' : ': ' + state.reason),
		      fill: state.fill === true,
		      theme: typeof document === 'undefined'
		        ? ''
		        : 'body=' + String(document.body?.getAttribute('data-ds-dark-theme'))
		          + ' pane=' + String(document.documentElement.getAttribute('data-mm-theme'))
		          + ' preference=' + state.theme
		          + ' text=' + state.text
		          + ' paper=' + window.getComputedStyle(document.body).getPropertyValue('--mm-paper').trim(),
		      transcript: talk.transcript.length,
		      turns: talk.sessionId === null ? 'unbound' : 'bound',
		    }
		    if (extra !== undefined) payload.error = extra
		    callHost('health', payload).catch(() => {
		      /* nothing more the pane can do about its own report */
		    })
		  }

		  /** The poll's entry point. Everything it does now lives in {@link syncSession}. */
		  function tick() {
		    try {
		      if (syncSession()) publish()
		    } catch (error) {
		      state.status = 'error'
		      state.reason = String(error?.message ?? error)
		      publish()
		    }
		  }

		  ctx.effect(() => () => {
		    if (notesTimer !== null) notesTimer()
		    // The splash is the one node this half puts inside the window rather than being the
		    // window, and its own clocks go when the context does — so it is taken down here by
		    // hand. A torn-down pane must not leave a curtain over the app with nothing left that
		    // knows how to lift it.
		    if (splashStop !== null) splashStop()
		    document.querySelectorAll('.mm-splash').forEach((node) => node.remove())
		    hushNotice()
		    talk.reset()
		    for (const dispose of disposers.reverse()) {
		      try {
		        dispose()
		      } catch {
		        /* a failed disposer must not strand the others */
		      }
		    }
		  }, 'mimir-lesson: tab, seats and stylesheet')

		  ctx.timeout(() => { tick() }, 900)
		  ctx.timeout(() => { reportHealth() }, 2500)
		  ctx.interval(() => {
		    tick()
		    // The transcript is pushed by the session's own feed; this poll only keeps the
		    // lesson files, the notes and the health report honest.
		    if (lastSessionId !== null && state.notesDirty !== true) scheduleRefresh()
		  }, POLL_MS)
		}

		/**
		 * Bind the chat column to one client's session feed.
		 *
		 * The pane does this from an effect, which is where a subscription belongs — doing it
		 * during render would notify React while React is rendering. An effect is also the one
		 * thing a static renderer does not run, so the binding is exposed here as well: it is
		 * how the outside test drives the same path the effect drives in the app, and the only
		 * way to check the transcript without a browser.
		 *
		 * @param sessions - the client `sessions` service.
		 * @returns the number of messages the fold produced, for a caller that wants to know.
		 */
		function bindSessionFeed(sessions) {
		  talk.bind(sessions)
		  return talk.transcript.length
		}

		exports.apply = apply
		exports.inject = inject
		exports.bindSessionFeed = bindSessionFeed
		window.__MIMIR_LESSON_PANE__.applied = true;
		return module.exports;
	}
});
} catch (error) {
	window.__MIMIR_LESSON_PANE__.error = String(error && error.message ? error.message : error);
	throw error;
}
})();
