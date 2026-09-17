/* Generated from src/main.js — edit the source, not this file. */

'use strict'
/*
 * The Mimir splash — the startup animation, played once over the vault as it opens.
 *
 * WHAT IT IS. An 8.7-second piece of pixel art: roots descend from the top of the frame,
 * come apart into scattered pixels, and become a stone well under two stacked runes. It was
 * made for a program splash, so it plays ONCE and holds on the dispersed frame. It is not a
 * loop, and the looping build is deliberately not used here.
 *
 * WHERE THE FILE LIVES, AND WHY NOT IN THIS FOLDER. The animation is a 1 MB VP9 WebM with
 * a real alpha plane, so it composites over whatever paper the vault is wearing instead
 * of arriving as a rectangle. It is read from `Tools/splash/` inside the vault, which is
 * why it can be re-rendered or swapped without touching the plugin; `media/` in this
 * repository holds the four files to copy in. The same two files are what a lesson pane
 * plays, so one library serves two surfaces. The bytes are read through the vault adapter
 * and handed to a blob URL, which is the one route that does not depend on how Obsidian
 * chooses to serve a resource path or guess a MIME type for an extension it has no
 * business knowing.
 *
 * WHOSE COLOUR THE CURTAIN IS. Not the vault's. This piece was rendered on grounds of its
 * own — a purple black and a lavender grey — and neither is a typical theme's green-black
 * or warm paper, so a curtain in the vault's colours left the artwork sitting on the page
 * as a slightly wrong rectangle. The splash therefore wears the piece's own ground while
 * it is on screen and hands the vault back its paper when it leaves. Those two colours are
 * measured from the animation rather than chosen; no theme token is touched, and the
 * palette a vault's own charts use is unaffected.
 *
 * WHAT IT WILL NOT DO. It never traps focus and never holds the vault hostage: any key, a
 * click, or Escape dismisses it, and it leaves on its own when the clip ends. Where
 * `prefers-reduced-motion: reduce` is set, the piece's own accessibility note asks for the
 * still frame rather than the movement, and that is what plays — held, then faded.
 */

const obsidian = require('obsidian')
const { Plugin } = obsidian

/** The one library. Both surfaces read from here; nothing is copied into this folder. */
const DIR = 'Tools/splash'

/**
 * The two theme builds, by the frame being worn, each with the ground IT was drawn on.
 *
 * WHY THE TWO ARE NOT THE SAME KIND OF FILE, which is worth knowing before "tidying" them
 * into one. The two variants of this piece are not the same object:
 *
 *   light   is an alpha layer. Its paper is flat and its coverage is real, so compositing
 *           it over the colour that paper is gives the master back — measured, the seam at
 *           its edge is under one unit per channel.
 *   dark    is an ADDITIVE GLOW, not a cut-out. It never reaches zero alpha, and it carries
 *           a blue ambient wash the master does not have, so no ordinary alpha compositing
 *           reproduces the master: over its own ground it misses by ~23 units per channel,
 *           where the opaque master misses by ~7. That is why the dark build here is the
 *           master MP4 and the light build is the transparent WebM.
 *
 * WHOSE COLOURS THESE ARE. The piece's, not the vault's. Mimir's dark paper is a green
 * black and its light paper is warm cream; this piece was rendered on a near-black and on a
 * lavender grey, and no arrangement of the vault's palette meets either. So the splash wears
 * the piece's ground for as long as it is on screen, and the vault's own paper is what is
 * revealed when it leaves. Both values are the median of the matching master's outer
 * 8-pixel band on the hold frame — `Tools/splash/README.md` records them, the method, and
 * the command to re-measure if the piece is ever re-rendered.
 */
const BUILDS = {
  dark: {
    video: 'mimir_startup_dark.mp4',
    mime: 'video/mp4',
    poster: 'mimir_startup_dark_poster.png',
    ground: '#040106',
  },
  light: {
    video: 'mimir_startup_light.webm',
    mime: 'video/webm',
    poster: 'mimir_startup_light_poster.png',
    ground: '#d2cad7',
  },
}

/**
 * Where the curtain's colour goes: a custom property the stylesheet reads, so the sheet is
 * still drawn by CSS and this file only says which of the two grounds is in play.
 */
const GROUND = '--mimir-splash-ground'

/** How long the still is held where motion is reduced, before it fades. */
const POSTER_HOLD_MS = 1500

/**
 * The longest the curtain may stay if the clip never reports its own end.
 *
 * `ended` is the clock, because the piece knows how long it is and a second copy of that
 * number here would be one more thing to keep true. This is only a ceiling for the case
 * where playback never starts — a blocked autoplay, a decoder that refuses the file — so
 * that a splash nobody can dismiss by waiting still leaves. The piece is 8.65 s; the
 * ceiling is set past it.
 */
const CLIP_CEILING_MS = 12000

class MimirSplash extends Plugin {
  async onload() {
    /** The curtain on screen, so a second play cannot stack on the first. */
    this.curtain = null
    /** Every object URL handed out, so none of them outlives the plugin. */
    this.urls = []
    this.timers = []

    this.settings = Object.assign({ playOnOpen: true }, await this.loadData())

    // The commands are the whole interface. The vault's own rule is that a control earns
    // its place in the bar by being switched often, and this one is switched once.
    this.addCommand({
      id: 'play',
      name: 'Play the startup animation',
      callback: () => { void this.play() }
    })
    this.addCommand({
      id: 'toggle-open',
      name: 'Play the startup animation when the vault opens',
      callback: () => { void this.toggleOpen() }
    })

    // The vault is not ready to be covered until the workspace has laid itself out; before
    // that there is no paper to draw on.
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.playOnOpen) void this.play()
    })
  }

  onunload() {
    this.clear()
  }

  /** The frame being worn, as one word. Absent means light — the same test the controls use. */
  frame() {
    return this.app.vault.getConfig('theme') === 'obsidian' ? 'dark' : 'light'
  }

  async toggleOpen() {
    this.settings.playOnOpen = !this.settings.playOnOpen
    await this.saveData(this.settings)
    new obsidian.Notice(this.settings.playOnOpen
      ? 'The startup animation plays when the vault opens.'
      : 'The startup animation is off. Run the command again to bring it back.')
  }

  /**
   * Read one file out of the vault and hand back a URL the page can actually load.
   *
   * @param name - the file's name inside {@link DIR}.
   * @param type - the MIME type to declare for the bytes.
   * @returns the blob URL, or null when the file is not there.
   */
  async blobUrl(name, type) {
    const path = DIR + '/' + name
    const adapter = this.app.vault.adapter
    if (typeof adapter.exists === 'function' && !(await adapter.exists(path))) return null
    const bytes = await adapter.readBinary(path)
    const url = URL.createObjectURL(new Blob([bytes], { type }))
    this.urls.push(url)
    return url
  }

  /**
   * Play it once, over everything.
   *
   * A missing file is not an error the vault should be told about on every open: it means
   * the animation has not been copied in yet, and the honest response is to draw nothing
   * and say so once in the console rather than to put a broken box on the page.
   */
  async play() {
    if (this.curtain !== null) return

    const build = BUILDS[this.frame()]
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const name = reduced ? build.poster : build.video

    let url = null
    try {
      url = await this.blobUrl(name, reduced ? 'image/png' : build.mime)
    } catch (error) {
      console.warn('mimir-splash: the startup animation could not be read: '
        + String(error?.message ?? error))
      return
    }
    if (url === null) {
      console.warn('mimir-splash: ' + DIR + '/' + name + ' is not in the vault, so nothing played.')
      return
    }

    // The vault may have been closed while the file was being read.
    if (this.curtain !== null) return

    const curtain = document.body.createDiv({ cls: 'mimir-splash' })
    // DECORATION, AND SAID SO. The piece has no on-screen text and never needed any, but
    // naming it for assistive technology put that name on screen: the vault shows an
    // element's accessible name as a tooltip, so the splash arrived trailing a sentence
    // about tree roots. The alt text is not lost — it is kept, with the rest of the piece's
    // provenance, in `Tools/splash/README.md`. A splash that any key dismisses and that
    // carries no information the lesson needs is decorative, and is marked as such.
    curtain.setAttribute('aria-hidden', 'true')
    // The ground is the one the artwork was drawn on — see {@link BUILDS}.
    curtain.style.setProperty(GROUND, build.ground)
    this.curtain = curtain

    if (reduced) {
      const still = curtain.createEl('img')
      still.src = url
      still.alt = ''
      this.timers.push(window.setTimeout(() => this.finish(), POSTER_HOLD_MS))
    } else {
      const clip = curtain.createEl('video')
      clip.src = url
      clip.muted = true
      clip.autoplay = true
      clip.setAttribute('muted', '')
      clip.setAttribute('playsinline', '')
      clip.setAttribute('aria-hidden', 'true')
      clip.addEventListener('ended', () => this.finish())
      this.timers.push(window.setTimeout(() => this.finish(), CLIP_CEILING_MS))
    }

    // Any key, a click, or Escape. The piece is the first thing on screen and the vault is
    // already behind it, so nothing here waits for a decision that was never asked for.
    //
    // The key is taken in the CAPTURE phase and swallowed, which is what makes the first
    // press the splash's rather than the vault's. Obsidian reads its own hotkeys from the
    // document, and this listener is on the window: on the way up, a bare listener here
    // would run last, so Escape would already have done whatever else it does before the
    // curtain came down. Escape is not singled out — every key leaves — so the event is
    // never read at all, only stopped.
    this.onKey = (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.finish()
    }
    window.addEventListener('keydown', this.onKey, true)
    curtain.addEventListener('click', () => this.finish())
  }

  /** Fade it out and take it down. Safe to call twice, which the two clocks above can do. */
  finish() {
    const curtain = this.curtain
    if (curtain === null) return
    this.curtain = null

    if (this.onKey !== undefined) {
      window.removeEventListener('keydown', this.onKey, true)
      this.onKey = undefined
    }
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers = []

    curtain.setAttribute('data-going', 'true')
    // The fade is the last timer this plugin owns, so it is kept in the same list as the
    // others: an unload mid-fade has to take the element with it rather than leave a
    // curtain that nothing is left holding a reference to.
    this.timers.push(window.setTimeout(() => curtain.remove(), 400))
  }

  /** Everything this plugin put on the page or in memory, gone. */
  clear() {
    if (this.onKey !== undefined) {
      window.removeEventListener('keydown', this.onKey, true)
      this.onKey = undefined
    }
    for (const timer of this.timers) window.clearTimeout(timer)
    this.timers = []
    if (this.curtain !== null) {
      this.curtain.remove()
      this.curtain = null
    }
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls = []
  }
}

module.exports = MimirSplash
