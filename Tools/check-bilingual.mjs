#!/usr/bin/env node
/**
 * Keep the two languages honest.
 *
 * A second language stops being a second language the moment it drifts: a
 * Chinese hub that links to a note renamed three weeks ago, a glossary table
 * that lists a pairing one side of which was deleted, a Chinese preset whose
 * skills no longer match the English set. None of those break anything loudly —
 * the vault simply renders an unresolved link, which looks like a note that was
 * never written.
 *
 * So this checks the four things that can rot silently:
 *
 *   1. Every pairing in docs/zh-CN-glossary.md exists on both sides.
 *   2. Every wikilink in every Chinese vault document resolves to a file.
 *   3. The two presets carry the same nine skills.
 *   4. The two compositions carry the same rows, tool names and allow-lists.
 *
 * It reads the glossary rather than a list hardcoded here, so adding a document
 * means adding one table row, not editing this script.
 *
 * Usage:  node Tools/check-bilingual.mjs
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VAULT = resolve(HERE, '..')
const LEARN = join(VAULT, 'Learn')
const GLOSSARY = join(VAULT, 'docs', 'zh-CN-glossary.md')

const problems = []
const fail = (message) => problems.push(message)

/* ── the pairing table ─────────────────────────────────────────────────────── */

/**
 * Read the Filenames table out of the glossary.
 *
 * Rows look like `| `Learn/How We Learn.md` | `Learn/我们如何学习.md` |`, with
 * an optional third column of prose. The English path is taken from the vault
 * root; a row whose second cell says "not translated" is skipped.
 */
async function readPairings() {
  const text = await readFile(GLOSSARY, 'utf8')
  const section = text.split('## Filenames')[1]?.split('\n## ')[0]
  if (section === undefined) throw new Error('no "## Filenames" section in the glossary')

  const pairs = []
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '')
    if (cells.length < 2) continue
    const left = cells[0].replace(/`/g, '')
    const right = cells[1].replace(/`/g, '')
    if (!left.endsWith('.md') && !left.endsWith('.base')) continue
    if (/not translated/i.test(right)) continue
    pairs.push([left, right])
  }
  return pairs
}

/* ── wikilinks ─────────────────────────────────────────────────────────────── */

/** Every file in the vault that a wikilink could resolve to, by basename. */
async function vaultTargets() {
  const names = new Set()
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      // Obsidian resolves by name, and accepts the link with or without the
      // extension: `[[概览]]` and `[[概览.base]]` both reach `概览.base`. So both
      // spellings go in the set. Adding only the stripped one reported a link
      // that Obsidian renders perfectly well as broken.
      else {
        names.add(entry.name)
        names.add(basename(entry.name).replace(/\.(md|base)$/, ''))
      }
    }
  }
  await walk(LEARN)
  return names
}

/**
 * `[[Target|alias]]` and `[[Target#heading]]` both resolve on `Target`.
 *
 * Inline code is stripped first, and that is the whole reason this is not a
 * one-line regex: the review queue documents its own format as
 * `` `- [ ] [[Concept]] — due YYYY-MM-DD` ``, and an example inside backticks is
 * documentation rather than a link. Both languages carry the same placeholder,
 * so counting it as drift would fail the check on a correct vault.
 */
function wikilinksIn(text) {
  const prose = text.replace(/`[^`\n]*`/g, '')
  return [...prose.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].split('#')[0].trim())
}

/**
 * Links that are deliberately not real files.
 *
 * The templates carry placeholders on purpose — a new session's graph SVG does
 * not exist until the writer runs the chart generator — and the English
 * templates carry the same ones, so they are not drift.
 */
const PLACEHOLDERS = [/^<.*>$/, /filename-slug/]

/* ── the presets ───────────────────────────────────────────────────────────── */

async function skillNames(presetDir) {
  const dir = join(VAULT, presetDir, 'skills')
  if (!existsSync(dir)) return null
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

/**
 * The parts of a composition that must survive translation untouched.
 *
 * Comment lines are removed first. The compositions are heavily commented in
 * both languages, and a Chinese comment that explains `maxDepth: 1` in prose
 * would otherwise be read as a second setting — which is how this check first
 * reported a disagreement between two files that agreed.
 */
async function compositionShape(file) {
  const text = (await readFile(file, 'utf8'))
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  return {
    ids: [...text.matchAll(/^\s*-?\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1]),
    names: [...text.matchAll(/^\s*name:\s*'?([^'\n]+?)'?\s*$/gm)].map((m) => m[1]),
    toolNames: [...text.matchAll(/^\s*toolName:\s*(\S+)\s*$/gm)].map((m) => m[1]),
    maxDepth: [...text.matchAll(/^\s*maxDepth:\s*(\S+)\s*$/gm)].map((m) => m[1]),
    js: [...text.matchAll(/!!js\s+(.*)$/gm)].map((m) => m[1].trim()),
  }
}

/* ── run ───────────────────────────────────────────────────────────────────── */

const pairs = await readPairings()
if (pairs.length === 0) fail('the glossary has no Filenames pairings — has the table moved?')

for (const [en, zh] of pairs) {
  for (const rel of [en, zh]) {
    if (!existsSync(join(VAULT, rel))) {
      fail(`pairing listed in the glossary is missing on disk: ${rel}`)
    }
  }
}

/**
 * Every `![[X.base#View]]` must name a view that `X.base` actually defines.
 *
 * This one is here because the check above does not catch it, and the mistake
 * was made for real: the Chinese Bases were given Chinese view names while the
 * Chinese dashboard went on embedding the English ones, so five embeds rendered
 * as nothing at all. Every file existed and every wikilink "resolved" — the
 * anchor was the part that was wrong.
 */
async function checkBaseAnchors() {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full); continue }
      if (!entry.name.endsWith('.md')) continue
      const text = await readFile(full, 'utf8')
      for (const m of text.matchAll(/!\[\[([^.\]]+)\.base#([^\]]+)\]\]/g)) {
        const base = join(dirname(full), `${m[1]}.base`)
        const rel = full.slice(VAULT.length + 1)
        if (!existsSync(base)) {
          fail(`${rel} embeds ${m[1]}.base, which does not exist`)
          continue
        }
        const views = new Set(
          [...(await readFile(base, 'utf8')).matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((v) => v[1]),
        )
        if (!views.has(m[2])) {
          fail(
            `${rel} embeds #${m[2]}, but ${m[1]}.base defines no such view.\n` +
            `    it defines: ${[...views].join(', ')}`,
          )
        }
      }
    }
  }
  await walk(LEARN)
}

await checkBaseAnchors()

const targets = await vaultTargets()
const chineseDocs = pairs.map(([, zh]) => zh).filter((rel) => rel.endsWith('.md'))

for (const rel of chineseDocs) {
  const path = join(VAULT, rel)
  if (!existsSync(path)) continue
  const text = await readFile(path, 'utf8')
  for (const link of wikilinksIn(text)) {
    if (PLACEHOLDERS.some((p) => p.test(link))) continue
    if (!targets.has(link)) fail(`${rel} links to [[${link}]], which does not exist in the vault`)
  }
}

const [enSkills, zhSkills] = await Promise.all([skillNames('preset'), skillNames('preset-zh')])
if (zhSkills === null) {
  fail('preset-zh/skills does not exist')
} else if (enSkills.join() !== zhSkills.join()) {
  fail(`the two presets carry different skills.\n    preset:    ${enSkills.join(', ')}\n    preset-zh: ${zhSkills.join(', ')}`)
}

const [enShape, zhShape] = await Promise.all([
  compositionShape(join(VAULT, 'preset', 'agent.cordis.yml')),
  compositionShape(join(VAULT, 'preset-zh', 'agent.cordis.yml')),
])
for (const key of Object.keys(enShape)) {
  if (enShape[key].join('\u0000') !== zhShape[key].join('\u0000')) {
    fail(
      `the two compositions disagree on \`${key}\`, which translation must not touch.\n` +
      `    preset:    ${enShape[key].length} entries\n` +
      `    preset-zh: ${zhShape[key].length} entries`,
    )
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error('bilingual: ' + problem)
  console.error(`bilingual: ${problems.length} problem(s)`)
  process.exit(1)
}

console.log(
  `✓ bilingual: ${pairs.length} document pairings resolve, every Chinese wikilink lands, ` +
  `${enSkills.length} skills and ${enShape.ids.length} composition rows match across both presets`,
)
