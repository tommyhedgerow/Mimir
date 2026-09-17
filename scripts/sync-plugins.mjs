#!/usr/bin/env node
/**
 * Copy the three Obsidian plugins into this vault, and write the lock file that
 * proves the copies are the ones the plugins actually released.
 *
 * WHY THE PLUGINS ARE VENDORED AT ALL. A fresh clone of this repository has to be
 * ready to read in: open it in Obsidian and the theme, the reading controls and
 * the splash are simply there, with nothing to install. That is worth a little
 * duplication.
 *
 * WHY THERE IS A LOCK. The three plugins are authored in their own repositories,
 * because the community directory reads a plugin from the root of a repository
 * and can only install one per repository. The copies here are therefore build
 * artifacts of somewhere else — exactly the kind of file that goes stale without
 * anybody noticing, because the vault keeps working with the old one. So each
 * copy is hashed into `plugins.lock.json`, and `check-plugin-copies.mjs` fails if
 * a copy stops matching it. The lock cannot tell you the copy is *good*; it can
 * tell you it is the one you put there.
 *
 * Usage:
 *   node scripts/sync-plugins.mjs            sync from sibling repositories
 *   node scripts/sync-plugins.mjs --check    verify only, write nothing
 *
 * Sibling layout, which is how this project is developed:
 *   <parent>/Mimir/
 *   <parent>/obsidian-mimir-controls/
 *   <parent>/obsidian-mimir-splash/
 *   <parent>/obsidian-lesson-publisher/
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VAULT = resolve(HERE, '..')
const PARENT = resolve(VAULT, '..')
const LOCK = join(VAULT, 'plugins.lock.json')
const CHECK = process.argv.includes('--check')

/**
 * What gets vendored into `.obsidian/`, and where each piece comes from.
 *
 * `files` is what gets copied. `main.js` is a release artifact rather than a
 * source file, so it is read from the plugin repository's build output at its
 * root, which is where `npm run build` puts it. The theme has no build step: its
 * two files are the repository.
 */
const ITEMS = [
  {
    id: 'mimir',
    kind: 'plugin',
    repo: 'obsidian-mimir-controls',
    dest: ['.obsidian', 'plugins', 'mimir'],
    files: ['main.js', 'manifest.json', 'styles.css'],
  },
  {
    id: 'mimir-splash',
    kind: 'plugin',
    repo: 'obsidian-mimir-splash',
    dest: ['.obsidian', 'plugins', 'mimir-splash'],
    files: ['main.js', 'manifest.json', 'styles.css'],
  },
  {
    id: 'lesson-publisher',
    kind: 'plugin',
    repo: 'obsidian-lesson-publisher',
    dest: ['.obsidian', 'plugins', 'lesson-publisher'],
    files: ['main.js', 'manifest.json'],
  },
  {
    // The theme is vendored for the same reason the plugins are: a fresh clone
    // should open in Obsidian wearing it, with nothing to install.
    id: 'Mimir',
    kind: 'theme',
    repo: 'obsidian-mimir-theme',
    dest: ['.obsidian', 'themes', 'Mimir'],
    files: ['manifest.json', 'theme.css'],
  },
]

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
/** The lock as it stands, or an empty one. */
async function readLock() {
  if (!existsSync(LOCK)) return { version: 1, plugins: {} }
  return JSON.parse(await readFile(LOCK, 'utf8'))
}

/** Where one vendored item lives inside the vault. */
const destDir = (item) => join(VAULT, ...item.dest)

/** Hash every vendored file for one item, as it stands in the vault. */
async function hashInstalled(item) {
  const files = {}
  for (const name of item.files) {
    const path = join(destDir(item), name)
    if (!existsSync(path)) return null
    files[name] = sha256(await readFile(path))
  }
  return files
}

/** The version the vault advertises for an item, read from its own manifest. */
async function installedVersion(item) {
  return JSON.parse(await readFile(join(destDir(item), 'manifest.json'), 'utf8')).version
}

if (CHECK) {
  const lock = await readLock()
  const problems = []

  for (const item of ITEMS) {
    const where = item.dest.join('/')
    const recorded = lock.plugins?.[item.id]
    if (recorded === undefined) {
      problems.push(`${item.id}: not in plugins.lock.json (run scripts/sync-plugins.mjs)`)
      continue
    }

    const actual = await hashInstalled(item)
    if (actual === null) {
      problems.push(`${item.id}: a vendored file is missing from ${where}/`)
      continue
    }

    for (const name of item.files) {
      if (actual[name] !== recorded.files?.[name]) {
        problems.push(
          `${item.id}/${name}: the vendored copy does not match the lock.\n` +
          `    locked  ${recorded.files?.[name]}\n` +
          `    present ${actual[name]}\n` +
          `  Re-run scripts/sync-plugins.mjs if the change was intended.`,
        )
      }
    }

    // The version the vault advertises has to be the version that was synced.
    const version = await installedVersion(item)
    if (version !== recorded.version) {
      problems.push(`${item.id}: manifest says ${version}, the lock says ${recorded.version} — re-sync`)
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error('vendored: ' + problem)
    process.exit(1)
  }
  console.log(`vendored: all ${ITEMS.length} copies match plugins.lock.json`)
  process.exit(0)
}

/* ── sync ──────────────────────────────────────────────────────────────────── */

const next = { version: 1, plugins: {} }
let changed = 0

for (const item of ITEMS) {
  const source = join(PARENT, item.repo)
  if (!existsSync(source)) {
    console.error(`vendored: no ${item.repo} beside this repository — skipped.`)
    console.error(`          expected it at ${source}`)
    continue
  }

  const target = destDir(item)
  await mkdir(target, { recursive: true })

  for (const name of item.files) {
    const from = join(source, name)
    if (!existsSync(from)) {
      // Only styles.css is genuinely optional. A missing main.js is a mistake,
      // because it means the plugin was never built.
      if (name === 'styles.css') continue
      console.error(`vendored: ${item.repo}/${name} is missing — run "npm run build" there first.`)
      process.exitCode = 1
      continue
    }
    await copyFile(from, join(target, name))
  }

  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
  const files = await hashInstalled(item)
  if (files === null) continue

  next.plugins[item.id] = {
    kind: item.kind,
    source: `https://github.com/tommyhedgerow/${item.repo}`,
    version: manifest.version,
    files,
  }
  changed += 1
  console.log(`vendored: ${item.kind} ${item.id} ${manifest.version} ← ${item.repo}`)
}

if (process.exitCode === 1) {
  console.error('vendored: nothing was locked, because a source file was missing.')
  process.exit(1)
}

await writeFile(LOCK, JSON.stringify(next, null, 2) + '\n', 'utf8')
console.log(`vendored: locked ${changed} item(s) into plugins.lock.json`)
