/* Generated from src/main.js — edit the source, not this file. */

'use strict'
/*
 * The Mimir controls — two buttons in the top bar of a note: reading size, and frame.
 *
 * TWO BUTTONS, NO PANEL. An earlier version put both settings in a small card that opened
 * from a ribbon icon. That is one press too many for two settings that are switched often,
 * and it hid the state behind the press. Now each control is its own button in the bar at
 * the top of the note, beside its title: the mark shows the state, pressing gives the next
 * one, and nothing opens.
 *
 *   size    a type mark with three pips beside it. One pip filled = small, medium, large.
 *           Left-click steps forward through 15 / 16.5 / 18.5 px; right-click steps back.
 *   frame   a sun or a moon, showing the light or dark you are reading in. Press to swap.
 *
 * WHERE THE BUTTONS GO, AND WHERE THEY DO NOT
 *   In the view header, which is the app's own bar for a pane. The plugin's first attempt
 *   moved Obsidian's left ribbon into a horizontal rail instead, which took a row from the
 *   app's layout and pushed the workspace down. Nothing is moved now: the ribbon is where
 *   Obsidian puts it, no other button is touched, and if this plugin is disabled the bar is
 *   exactly as it was.
 *
 * WHAT IT TOUCHES
 *   Two of Obsidian's own settings, both reversible by hand in Settings → Appearance:
 *   `theme` (moonstone | obsidian) and `baseFontSize` (the three sizes in
 *   Tools/mimir-tokens.json). It writes no file and keeps no state of its own; it reads the
 *   live settings before every paint, so a change made in Appearance shows up here at once.
 */

const obsidian = require('obsidian')
const { Plugin } = obsidian

/* The reading sizes, keyed to the pane's own three steps. Kept in step with
 * Tools/mimir-tokens.json by Tools/check-tokens.mjs — see that file's header. */
const SIZES = [15, 16.5, 18.5]

/** The frame Obsidian is in, as one word. Absent means light. */
function currentFrame (app) {
  return app.vault.getConfig('theme') === 'obsidian' ? 'dark' : 'light'
}

/** The nearest reading size to whatever number is set, so a value set elsewhere still lands. */
function nearestSize (app) {
  const at = Number(app.vault.getConfig('baseFontSize'))
  if (!Number.isFinite(at)) return 2
  let best = 0
  for (let i = 1; i < SIZES.length; i++) {
    if (Math.abs(SIZES[i] - at) < Math.abs(SIZES[best] - at)) best = i
  }
  return best
}

class MimirControls extends Plugin {
  async onload () {
    // Every pane that is showing controls, so a repaint reaches all of them.
    this.sizeButtons = []
    this.frameButtons = []

    // The commands are the keyboard route to the same two moves, and they work whether or
    // not a note is open for the buttons to attach to.
    this.addCommand({
      id: 'toggle-light-dark',
      name: 'Toggle light and dark',
      callback: () => { this.toggleFrame() }
    })
    this.addCommand({
      id: 'reading-size-next',
      name: 'Reading size: next step',
      callback: () => { this.stepSize(1) }
    })
    this.addCommand({
      id: 'reading-size-previous',
      name: 'Reading size: previous step',
      callback: () => { this.stepSize(-1) }
    })

    this.app.workspace.onLayoutReady(() => this.start())
    this.registerEvent(this.app.workspace.on('layout-change', () => this.sync()))
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.sync()))
    this.registerEvent(this.app.vault.on('config-changed', () => this.paint()))
  }

  onunload () {
    if (this.observer) this.observer.disconnect()
    document.querySelectorAll('.mimir-controls').forEach(el => el.remove())
  }

  /**
   * Watch the workspace for view headers, and put the buttons in them.
   *
   * A header is rebuilt by the app whenever a pane changes what it is showing, so the
   * buttons cannot be installed once and left: an observer re-checks after any change. The
   * check is one query per header and the group is only built when it is missing, and it is
   * debounced to one frame because the workspace mutates in bursts.
   */
  start () {
    this.observer = new MutationObserver(() => this.sync())
    this.observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true })
    this.sync()
  }

  /** One frame's worth of debounce: the workspace mutates in bursts, not node by node. */
  sync () {
    if (this.syncQueued) return
    this.syncQueued = true
    window.requestAnimationFrame(() => {
      this.syncQueued = false
      this.install()
    })
  }

  /** Put a control group in every view header that is missing one. */
  install () {
    const headers = this.app.workspace.containerEl.querySelectorAll('.view-header')
    headers.forEach((header) => {
      if (header.querySelector('.mimir-controls') !== null) return
      const group = header.createDiv({ cls: 'mimir-controls' })
      this.buildSizeButton(group)
      this.buildFrameButton(group)
    })
    this.paint()
  }

  /** The size control: a type mark and three pips, one filled. */
  buildSizeButton (group) {
    const button = group.createEl('button', {
      cls: 'mimir-btn mimir-size-btn',
      attr: { type: 'button' }
    })
    button.createSpan({ cls: 'mimir-size-mark' })
    const pips = button.createSpan({ cls: 'mimir-pips' })
    SIZES.forEach((size, i) => {
      const dot = pips.createSpan({ cls: 'mimir-pip' })
      dot.setAttribute('data-step', String(i + 1))
      dot.setAttribute('aria-hidden', 'true')
    })
    button.addEventListener('click', () => this.stepSize(1))
    // A cycle has to be enterable from both ends, and a second press route is cheaper
    // than a second button for a setting that has three values.
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      this.stepSize(-1)
    })
    this.sizeButtons.push(button)
  }

  /**
   * The frame control: a sun or a moon, showing which frame you are reading in.
   *
   * The mark is the state and the name is the move, which is the Lesson window's own rule —
   * a control named for its action has to be read twice, once to see what is there and once
   * to work out what pressing it does.
   */
  buildFrameButton (group) {
    const button = group.createEl('button', {
      cls: 'mimir-btn mimir-frame-btn',
      attr: { type: 'button' }
    })
    button.addEventListener('click', () => this.toggleFrame())
    this.frameButtons.push(button)
  }

  // ── the two moves ──────────────────────────────────────────────────────────

  toggleFrame () {
    const next = currentFrame(this.app) === 'dark' ? 'moonstone' : 'obsidian'
    void this.app.vault.setConfig('theme', next)
    this.paint()
  }

  /** Step the reading size, either way, wrapping at the ends of the three. */
  stepSize (direction) {
    const at = nearestSize(this.app)
    const next = (at + direction + SIZES.length) % SIZES.length
    void this.app.vault.setConfig('baseFontSize', SIZES[next])
    this.paint()
  }

  /**
   * Put the live settings on every mark this plugin has drawn.
   *
   * Called after every move and on every config change, so the buttons never disagree with
   * the app: a frame switched from the Appearance settings repaints these too. A button
   * whose pane has been closed is dropped rather than painted.
   */
  paint () {
    const frame = currentFrame(this.app)
    const size = nearestSize(this.app)

    // Drawings in Learn/Viz are inked twice, and the second palette is chosen by this
    // class rather than by `prefers-color-scheme`: the app can be dark while the machine
    // is light, and a diagram should follow the frame it is being read in. Obsidian does
    // not put a class on the document for this — it styles `body.theme-dark` — so the
    // plugin supplies one, and every drawing picks it up without being regenerated.
    document.documentElement.toggleClass('theme-dark', frame === 'dark')
    document.documentElement.toggleClass('theme-light', frame === 'light')

    this.sizeButtons = this.sizeButtons.filter(button => button.isConnected)
    for (const button of this.sizeButtons) {
      const mark = button.querySelector('.mimir-size-mark')
      if (mark.querySelector('svg[data-icon]') === null) obsidian.setIcon(mark, 'type')
      const pips = button.querySelectorAll('.mimir-pip')
      pips.forEach((dot, i) => {
        if (i === size) dot.setAttribute('data-on', 'true')
        else dot.removeAttribute('data-on')
      })
      button.setAttribute('data-size', SIZES[size] + 'px')
      button.setAttribute('aria-label',
        'Reading size ' + SIZES[size] + ' px (' + (size + 1) + ' of ' + SIZES.length
        + ') — press for the next, right-click for the previous')
      button.setAttribute('title',
        'Reading size: ' + SIZES[size] + 'px — ' + (size + 1) + ' of ' + SIZES.length
        + '. Everything read moves together. Right-click steps back.')
    }

    this.frameButtons = this.frameButtons.filter(button => button.isConnected)
    for (const button of this.frameButtons) {
      if (button.querySelector('svg[data-icon]') === null || button.getAttribute('data-frame') !== frame) {
        button.empty()
        obsidian.setIcon(button, frame === 'dark' ? 'moon' : 'sun')
      }
      button.setAttribute('data-frame', frame)
      button.setAttribute('aria-label', frame === 'dark'
        ? 'Reading in the dark — press for the light'
        : 'Reading in the light — press for the dark')
      button.setAttribute('title', frame === 'dark' ? 'Light' : 'Dark')
    }
  }
}

module.exports = MimirControls
