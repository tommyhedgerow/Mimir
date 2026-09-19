/* Generated from src/main.js — edit the source, not this file. */

'use strict';

/*
 * Lesson Publisher — one-click publish of a finished note, and every file it
 * embeds, from the vault you are working in into a second vault on disk: the
 * library.
 *
 * The rule is a mirror: a note's path relative to the mirror root (default
 * `Learn/`) is recreated at the same relative path inside the library vault,
 * and every file it embeds comes along to the same mirrored position, so
 * Obsidian's by-name resolution still finds it once the note is read over
 * there. Anything outside the mirror root lands in a fallback folder instead.
 *
 * The pure planning helpers are attached to `module.exports.__internals` so a
 * test harness can exercise them in plain node with a mocked `obsidian`
 * module. Keep them free of Obsidian API calls: the source vault's name, for
 * instance, is handed to `buildPlan` by its caller rather than looked up here.
 */

const obsidian = require('obsidian');
const fs = require('fs');
const path = require('path');

// `Plugin` is also a deprecated DOM global — `navigator.plugins` holds a list
// of them — so binding it under its own name is a redeclaration. Alias it, and
// let the class below say plainly which plugin it extends.
const { Plugin: ObsidianPlugin, Notice, Modal, PluginSettingTab, Setting, TFile, getLanguage } = obsidian;

/* The words, in a module of their own so that both languages sit in one place. The
 * require is written on one line and in one shape because `build.mjs` looks for exactly
 * this line and inlines the module in its place — the release ships a single file, so
 * there is nowhere beside `main.js` for a sibling module to live. */
const { fill, tableFor } = (function () {
  const module = { exports: {} }
'use strict';

/*
 * The words this plugin says, in the two languages it says them in.
 *
 * WHY BOTH TABLES ARE IN ONE FILE. The rules the community directory lints with know a
 * locale file by its name — `en.js`, `en.json`, `en/**` — and expect one file per
 * language. That layout is for a plugin with a book of strings, where loading the wrong
 * two is waste. This plugin has forty-odd, and the thing that keeps two languages in step
 * is reading them side by side on one screen; two files drift apart, and a drifted
 * translation is worse than none.
 *
 * WHAT THE LOCALE RULES CAN AND CANNOT SEE. `obsidianmd/ui/sentence-case-locale-module`
 * reads a table only when the file is named `en*` AND the table is exported —
 * `export default { … }` or `export const en = { … }`. This plugin is CommonJS on
 * purpose, with no bundler and no build step that could change that, so the rule has
 * nothing to read here whatever this file were called. The English below is therefore
 * written to that rule's standard by hand, and the test harness holds the two tables
 * against each other so that neither can lose a key quietly.
 *
 * WHY PLACEHOLDERS AND NOT SENTENCES BUILT WITH `+`. Every word a user reads should be a
 * string in one of the two lists below, so that the two can be read against each other
 * and a missing key is visible. A sentence assembled from pieces inside a function is a
 * sentence no reviewer and no rule ever sees whole — and the order of the pieces is part
 * of the sentence, which is exactly what a language change moves.
 *
 * WHICH LANGUAGE, AND WHICH CHINESE. The tag comes from Obsidian's own `getLanguage()` —
 * the interface language chosen in the app — and from nowhere else. Not
 * `navigator.language`, which follows the machine rather than the app, and not a setting
 * of this plugin's: the interface language is Obsidian's decision, and a second place to
 * set it is a second place to be wrong. A Chinese tag selects the table below only when
 * it is not Traditional: Obsidian treats Traditional as a language in its own right, and
 * a reader who chose it is better served by English than by a script they did not ask
 * for.
 *
 * WHAT IS NOT HERE, AND WHY. The folder names the settings default to — `Learn`, `Inbox`,
 * `Attachments` — are not words, they are paths this plugin writes into a second vault,
 * and a vault's structure stays the same in both languages. The frontmatter keys it
 * stamps, `published`, `published_to` and `source_vault`, are read by scripts rather than
 * by people. The settings KEYS in `DEFAULT_SETTINGS` are what a saved `data.json` holds;
 * changing one would lose a user's configuration, so only the labels beside them are
 * translated. And the lines this plugin writes to the developer console stay English: the
 * console is for whoever is reading the code, not for the person using the vault.
 */

/**
 * English, and the table that every tag but Simplified Chinese falls back to.
 */
const EN = {
  /* The ribbon button and the three commands. None of them names the plugin: Obsidian
     already shows which plugin a command belongs to, and the directory's command rules
     reject a name that repeats it. */
  ribbonTooltip: 'Publish note to library',
  commandPublish: 'Publish active note to library',
  commandPublishWithLinks: 'Publish active note and its finished linked notes',
  commandShowPlan: 'Show what publishing this note would copy',

  /* The overwrite modal. The bullet in front of each path is punctuation and stays where
     it is; only the sentence around it is here. */
  overwriteTitle: 'Publish to library',
  overwriteBody: 'These files already exist in the library. Overwrite them?',
  overwriteMore: '\n…and {count} more',
  cancel: 'Cancel',
  overwrite: 'Overwrite',

  /* The plan modal, and the one line `buildPlan` writes into it. The label is followed by
     TWO spaces in the English, which is what this file has always printed — the plan is a
     `<pre>`, so it shows — and the pair is kept rather than tidied: this release is a
     language change and nothing else. */
  planTitle: 'Publish plan',
  planNote: 'note  {path}',
  planFile: 'file  {path}',
  planSkipped: '\n\nSkipped:\n{list}',
  planMissing: '\n\nNot found:\n{list}',
  skippedNote: '{path} (status not publishable)',

  /* The notices: what happened, in one sentence, because a notice is read while it
     disappears. */
  noActiveNote: 'No active note to publish.',
  noLibraryPath: 'Lesson Publisher: set the library vault path in its settings first.',
  publishCancelled: 'Publish cancelled.',
  publishFailed: 'Publish failed: {message}',
  published: 'Published {count} file(s) to the library{tail}.',
  publishedTail: ' — {list}',
  publishedListSeparator: ', ',
  skippedCount: '{count} skipped (status)',
  missingCount: '{count} not found',

  /* The settings tab. The heading is the subject, not the plugin's name — the tab itself
     is already titled by Obsidian. */
  settingsHeading: 'Publishing',
  settingLibraryPath: 'Library vault path',
  settingLibraryPathDesc: 'Absolute path to the library vault that finished notes are published into.',
  settingLibraryPathPlaceholder: 'Absolute path to your library vault',
  settingMirrorRoot: 'Mirror root',
  settingMirrorRootDesc: 'Only notes under this folder keep their relative path. Everything else goes to the fallback folder below.',
  settingFallbackFolder: 'Fallback folder',
  settingFallbackFolderDesc: 'Where notes from outside the mirror root land inside the library.',
  settingAssetFallbackFolder: 'Asset fallback folder',
  settingAssetFallbackFolderDesc: 'Where embedded files from outside the mirror root land inside the library.',
  settingCopyEmbedded: 'Copy embedded files',
  settingCopyEmbeddedDesc: 'Bring diagrams and attachments along, to the same mirrored position.',
  settingStampSource: 'Stamp the source note',
  settingStampSourceDesc: 'Record `published` and `published_to` in the note you published from.',
  settingStampCopy: 'Stamp the published copy',
  settingStampCopyDesc: 'Record `source_vault` (the name of this vault) and the publish date in the library copy.',
  settingLinkedStatuses: 'Linked notes included',
  settingLinkedStatusesDesc: 'Comma-separated frontmatter statuses that the "with linked notes" command will publish.',
  settingOverrides: 'Folder overrides',
  settingOverridesDesc: 'Optional JSON map, e.g. {"Learn/Concepts": "Knowledge/Concepts"} to send a subtree somewhere else.',
};

/**
 * Simplified Chinese.
 *
 * 文库 is the library vault — the second vault a finished note is published into — and 库
 * alone is the vault the note came from, which is Obsidian's own word for it. 镜像 is the
 * mirror rule this plugin is built on: the same relative path, recreated in the library.
 * The frontmatter keys stay in English inside the descriptions, because that is what
 * lands in the file, and the settings keys behind the labels do not move either.
 */
const ZH = {
  ribbonTooltip: '发布笔记到文库',
  commandPublish: '发布当前笔记到文库',
  commandPublishWithLinks: '发布当前笔记及其已完成的链接笔记',
  commandShowPlan: '查看发布这篇笔记会复制哪些文件',

  overwriteTitle: '发布到文库',
  overwriteBody: '这些文件在文库中已经存在。要覆盖它们吗？',
  overwriteMore: '\n……另有 {count} 个',
  cancel: '取消',
  overwrite: '覆盖',

  planTitle: '发布计划',
  planNote: '笔记 {path}',
  planFile: '文件 {path}',
  planSkipped: '\n\n已跳过：\n{list}',
  planMissing: '\n\n未找到：\n{list}',
  skippedNote: '{path}（状态不可发布）',

  noActiveNote: '没有可以发布的当前笔记。',
  noLibraryPath: 'Lesson Publisher：请先在插件设置里填写文库路径。',
  publishCancelled: '已取消发布。',
  publishFailed: '发布失败：{message}',
  published: '已发布 {count} 个文件到文库{tail}。',
  publishedTail: '——{list}',
  publishedListSeparator: '，',
  skippedCount: '跳过 {count} 个（状态不符）',
  missingCount: '未找到 {count} 个',

  settingsHeading: '发布',
  settingLibraryPath: '文库路径',
  settingLibraryPathDesc: '已完成的笔记发布到的那个文库的绝对路径。',
  settingLibraryPathPlaceholder: '你的文库的绝对路径',
  settingMirrorRoot: '镜像根目录',
  settingMirrorRootDesc: '只有这个文件夹下的笔记保留相对路径。其他笔记都进入下面的备用文件夹。',
  settingFallbackFolder: '备用文件夹',
  settingFallbackFolderDesc: '镜像根目录之外的笔记在文库中的落脚位置。',
  settingAssetFallbackFolder: '附件备用文件夹',
  settingAssetFallbackFolderDesc: '镜像根目录之外的嵌入文件在文库中的落脚位置。',
  settingCopyEmbedded: '复制嵌入文件',
  settingCopyEmbeddedDesc: '把图和附件一起带过去，落在镜像后的同一位置。',
  settingStampSource: '标记源笔记',
  settingStampSourceDesc: '在发布来源的笔记里记录 `published` 和 `published_to`。',
  settingStampCopy: '标记发布的副本',
  settingStampCopyDesc: '在文库中的副本里记录 `source_vault`（本库的名称）和发布日期。',
  settingLinkedStatuses: '纳入发布的链接笔记',
  settingLinkedStatusesDesc: '用逗号分隔的属性状态；只有这些状态的链接笔记会随当前笔记一起发布。',
  settingOverrides: '文件夹覆盖',
  settingOverridesDesc: '可选的 JSON 映射，例如 {"Learn/Concepts": "Knowledge/Concepts"}，把某个子树送到别处。',
};

/**
 * The subtags that mean Traditional Chinese: the script where it is written, and the
 * regions that write it.
 */
const TRADITIONAL = ['hant', 'tw', 'hk', 'mo'];

/**
 * The table for one interface-language tag, English for anything unmatched.
 *
 * The match is on the PRIMARY subtag, so `zh`, `zh-CN`, `zh-Hans` and `zh-SG` all land on
 * the same table; the rest of the tag is read only to keep Traditional out of it. Case is
 * not trusted and the separator is not assumed — Obsidian hands back tags like `zh-CN`,
 * but `ZH_cn` means the same thing and should not fall to English over a spelling.
 *
 * @param tag - a BCP 47 tag, or nothing at all on an app older than `getLanguage()`.
 */
function tableFor(tag) {
  const parts = String(tag == null ? '' : tag).toLowerCase().split(/[-_]/);
  if (parts[0] !== 'zh') return EN;
  if (parts.some((part) => TRADITIONAL.includes(part))) return EN;
  return ZH;
}

/**
 * One string with its `{placeholders}` filled in.
 *
 * A placeholder with nothing to fill it is left standing rather than written as
 * `undefined`, so a caller that forgets one shows the hole instead of hiding it.
 */
function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole
  ));
}

/* `TABLES` is here for the test harness, which holds the two side by side and fails if
 * one has a key the other has not: a string only one language carries prints `undefined`
 * at the user, and nothing else in the build would notice. */
module.exports = { TABLES: { en: EN, zh: ZH }, fill, tableFor };
  return module.exports
})();

const DEFAULT_SETTINGS = {
  targetVaultRoot: '',
  targetRoot: 'Learn',
  fallbackSubfolder: 'Inbox',
  assetFallbackSubfolder: 'Attachments',
  copyEmbeddedFiles: true,
  stampSource: true,
  stampPublishedCopy: true,
  folderOverrides: '{}',
  includeLinkedStatuses: 'done, established',
};

/* ── pure helpers ─────────────────────────────────────────────────────────── */

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function basename(value) {
  const clean = toPosix(value);
  return clean.slice(clean.lastIndexOf('/') + 1);
}

function joinRel(left, right) {
  const a = toPosix(left).replace(/^\/+|\/+$/g, '');
  const b = toPosix(right).replace(/^\/+/g, '');
  return a ? a + '/' + b : b;
}

function parseFolderOverrides(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) out[toPosix(key).replace(/\/+$/, '')] = toPosix(value).replace(/^\/+|\/+$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The path a vault file takes inside the library vault.
 *
 * `options.fallback` picks the landing folder for a file that is NOT under the
 * mirror root — notes go to `Inbox`, embedded assets to `Attachments`, so that
 * everything published stays under one subtree in the library.
 */
function resolveRelativeTarget(notePath, settings, options) {
  const clean = toPosix(notePath);
  const overrides = parseFolderOverrides(settings.folderOverrides);
  for (const [from, to] of Object.entries(overrides)) {
    if (clean === from || clean.startsWith(from + '/')) {
      const rest = clean === from ? '' : clean.slice(from.length + 1);
      return rest ? joinRel(to, rest) : to;
    }
  }
  const root = toPosix(settings.targetRoot || 'Learn').replace(/^\/+|\/+$/g, '') || 'Learn';
  if (clean === root) return basename(clean);
  if (clean.startsWith(root + '/')) return joinRel(root, clean.slice(root.length + 1));
  const fallback = (options && options.fallback) || settings.fallbackSubfolder || 'Inbox';
  return joinRel(root, joinRel(fallback, basename(clean)));
}

function hasExtension(target) {
  const base = basename(target);
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1;
}

/** Every embed in a note: `![[file.svg]]`-style and `![](path.png)`-style. */
function extractEmbeds(markdown) {
  const text = String(markdown || '');
  const assets = [];
  const notes = [];
  const seen = new Set();

  const wiki = /!\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = wiki.exec(text)) !== null) {
    const inner = match[1].split('|')[0].split('#')[0].trim();
    if (!inner) continue;
    const key = inner.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasExtension(inner)) assets.push(inner);
    else notes.push(inner);
  }

  // Both `![](path.png)` and the angle-bracket form `![](<path with space.png>)`.
  const md = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;
  while ((match = md.exec(text)) !== null) {
    const raw = (match[1] || match[2] || '').trim();
    if (!raw) continue;
    if (/^(https?:|data:)/i.test(raw)) continue;
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* leave as written */ }
    const key = decoded.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasExtension(decoded)) assets.push(decoded);
  }

  return { assets, notes };
}

/** Obsidian-style resolution: exact path, else shortest matching basename. */
function resolveEmbedPath(target, candidates) {
  const wanted = toPosix(target).replace(/^\.?\//, '').toLowerCase();
  const exact = candidates.find((candidate) => toPosix(candidate).toLowerCase() === wanted);
  if (exact) return exact;
  const base = basename(wanted);
  const matches = candidates.filter((candidate) => basename(candidate).toLowerCase() === base);
  if (matches.length === 0) return null;
  matches.sort((a, b) => toPosix(a).split('/').length - toPosix(b).split('/').length || a.length - b.length);
  return matches[0];
}

function resolveNoteLink(target, notePaths) {
  const wanted = toPosix(target).replace(/^\.?\//, '').replace(/\.md$/i, '').toLowerCase();
  const normalised = notePaths.map((p) => ({ raw: p, key: toPosix(p).replace(/\.md$/i, '').toLowerCase() }));
  const exact = normalised.find((entry) => entry.key === wanted);
  if (exact) return exact.raw;
  const base = basename(wanted);
  const matches = normalised.filter((entry) => basename(entry.key) === base);
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.key.split('/').length - b.key.split('/').length || a.raw.length - b.raw.length);
  return matches[0].raw;
}

function frontmatterBounds(lines) {
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length; i += 1) if (lines[i].trim() === '---') return { start: 0, end: i };
  return null;
}

function frontmatterValue(text, key) {
  const lines = String(text || '').split('\n');
  const bounds = frontmatterBounds(lines);
  if (!bounds) return null;
  const pattern = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.*)$');
  for (let i = bounds.start + 1; i < bounds.end; i += 1) {
    const match = lines[i].match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

/** Set or replace frontmatter keys, creating the block when absent. */
function stampFrontmatter(text, fields) {
  const source = String(text == null ? '' : text);
  const keys = Object.keys(fields);
  if (keys.length === 0) return source;
  const lines = source.split('\n');
  const bounds = frontmatterBounds(lines);
  if (bounds) {
    let end = bounds.end;
    for (const key of keys) {
      const pattern = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
      let found = -1;
      for (let i = bounds.start + 1; i < end; i += 1) if (pattern.test(lines[i])) { found = i; break; }
      const line = key + ': ' + fields[key];
      if (found >= 0) lines[found] = line;
      else { lines.splice(end, 0, line); end += 1; }
    }
    return lines.join('\n');
  }
  const block = ['---', ...keys.map((key) => key + ': ' + fields[key]), '---', ''].join('\n');
  return block + source;
}

function statusIsIncluded(text, included) {
  const status = (frontmatterValue(text, 'status') || '').replace(/^["']|["']$/g, '').trim().toLowerCase();
  if (!status) return false;
  return included.map((value) => value.trim().toLowerCase()).filter(Boolean).includes(status);
}

/**
 * Plan one publish. Pure given its inputs, so it is exercised directly in tests.
 *
 * `options.strings` is the table its one user-facing line is written from — the reason a
 * linked note was left behind, which the publish plan shows. It is handed in rather than
 * looked up here, because this helper stays free of Obsidian API calls: the caller has
 * already asked the app for its language. With no table the English one is used, which is
 * what a caller written before there were two languages gets.
 *
 * @returns {Promise<{entries: Array<{from: string, toRel: string, kind: string, content?: string}>, skipped: string[], missing: string[]}>}
 */
async function buildPlan(options) {
  const { notePath, markdown, settings, allPaths, readText, withLinks } = options;
  const strings = options.strings || tableFor('en');
  const entries = [];
  const skipped = [];
  const missing = [];
  const today = options.today || new Date().toISOString().slice(0, 10);
  const sourceNote = toPosix(notePath);

  // Provenance names the vault the note came from, and only the caller knows
  // that: this helper is pure, so the plugin passes `this.app.vault.getName()`
  // in as `sourceVaultName`. With no name there is nothing honest to write, so
  // the key is left out entirely rather than stamped empty.
  const sourceVault = typeof options.sourceVaultName === 'string' ? options.sourceVaultName.trim() : '';
  const stamp = sourceVault ? { source_vault: sourceVault, published: today } : { published: today };

  const noteContent = settings.stampPublishedCopy
    ? stampFrontmatter(markdown, stamp)
    : markdown;
  entries.push({ from: sourceNote, toRel: resolveRelativeTarget(sourceNote, settings), kind: 'note', content: noteContent });

  const embeds = extractEmbeds(markdown);
  const all = allPaths.map(toPosix);

  if (settings.copyEmbeddedFiles !== false) {
    for (const target of embeds.assets) {
      const resolved = resolveEmbedPath(target, all);
      if (!resolved) { missing.push(target); continue; }
      entries.push({
        from: resolved,
        toRel: resolveRelativeTarget(resolved, settings, { fallback: settings.assetFallbackSubfolder || 'Attachments' }),
        kind: 'asset',
      });
    }
  }

  if (withLinks) {
    const included = String(settings.includeLinkedStatuses || '').split(',');
    const noteCandidates = all.filter((candidate) => /\.md$/i.test(candidate));
    for (const target of embeds.notes) {
      const resolved = resolveNoteLink(target, noteCandidates);
      if (!resolved) { missing.push(target); continue; }
      if (resolved === sourceNote) continue;
      const text = await readText(resolved);
      if (text == null) { missing.push(target); continue; }
      if (!statusIsIncluded(text, included)) { skipped.push(fill(strings.skippedNote, { path: resolved })); continue; }
      entries.push({
        from: resolved,
        toRel: resolveRelativeTarget(resolved, settings),
        kind: 'note',
        content: settings.stampPublishedCopy ? stampFrontmatter(text, stamp) : text,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.toRel)) continue;
    seen.add(entry.toRel);
    deduped.push(entry);
  }
  return { entries: deduped, skipped, missing };
}

/* ── Obsidian glue ────────────────────────────────────────────────────────── */

function confirmOverwrite(app, relPaths, strings) {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.setText(strings.overwriteTitle);
    // The bullet is punctuation and is the same in both languages; the sentence around it
    // is the table's.
    const list = relPaths.slice(0, 12).map((p) => '• ' + p).join('\n');
    const more = relPaths.length > 12
      ? fill(strings.overwriteMore, { count: relPaths.length - 12 })
      : '';
    modal.contentEl.createEl('p', { text: strings.overwriteBody });
    modal.contentEl.createEl('pre', { text: list + more });
    const row = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    const cancel = row.createEl('button', { text: strings.cancel });
    cancel.onclick = () => { resolve(false); modal.close(); };
    const ok = row.createEl('button', { text: strings.overwrite, cls: 'mod-cta' });
    ok.onclick = () => { resolve(true); modal.close(); };
    modal.onClose = () => resolve(false);
    modal.open();
    // resolve(false) twice is harmless: Promise settles once.
  });
}

class LessonPublisher extends ObsidianPlugin {
  async onload() {
    await this.loadSettings();

    /* Which table this load speaks, chosen once and kept for every word the plugin says:
     * the ribbon tooltip, the commands, the two modals, the notices and the settings tab.
     * The interface language cannot change while the app is running, so there is nothing
     * later to re-read.
     *
     * `getLanguage()` arrived in Obsidian 1.8.7 and this plugin's declared floor is
     * lower, so an app without it is read rather than called: a missing function is not a
     * language, and the table that comes back for `undefined` is English — which is what
     * this plugin said before it said anything in Chinese. */
    this.strings = tableFor(typeof getLanguage === 'function' ? getLanguage() : undefined);

    this.addRibbonIcon('upload', this.strings.ribbonTooltip, () => { void this.publishActive(false); });

    this.addCommand({
      id: 'publish-active-note',
      name: this.strings.commandPublish,
      callback: () => { void this.publishActive(false); },
    });

    this.addCommand({
      id: 'publish-active-note-with-links',
      name: this.strings.commandPublishWithLinks,
      callback: () => { void this.publishActive(true); },
    });

    this.addCommand({
      id: 'show-publish-plan',
      name: this.strings.commandShowPlan,
      callback: () => { void this.reportPlan(); },
    });

    this.addSettingTab(new PublisherSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async readText(vaultPath) {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (file instanceof TFile) return await this.app.vault.cachedRead(file);
    return null;
  }

  async readBinary(vaultPath) {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (file instanceof TFile) return Buffer.from(await this.app.vault.readBinary(file));
    return null;
  }

  async planFor(withLinks) {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(this.strings.noActiveNote); return null; }
    if (!this.settings.targetVaultRoot) {
      new Notice(this.strings.noLibraryPath);
      return null;
    }
    const markdown = await this.app.vault.cachedRead(file);
    const allPaths = this.app.vault.getFiles().map((entry) => entry.path);
    const plan = await buildPlan({
      notePath: file.path,
      markdown,
      settings: this.settings,
      allPaths,
      readText: (vaultPath) => this.readText(vaultPath),
      withLinks,
      strings: this.strings,
      sourceVaultName: this.app.vault.getName(),
    });
    return { file, plan };
  }

  async reportPlan() {
    const planned = await this.planFor(true);
    if (!planned) return;
    const { plan } = planned;
    const body = plan.entries
      .map((entry) => fill(entry.kind === 'note' ? this.strings.planNote : this.strings.planFile, { path: entry.toRel }))
      .join('\n');
    const skipped = plan.skipped.length ? fill(this.strings.planSkipped, { list: plan.skipped.join('\n') }) : '';
    const missing = plan.missing.length ? fill(this.strings.planMissing, { list: plan.missing.join('\n') }) : '';
    const modal = new Modal(this.app);
    modal.titleEl.setText(this.strings.planTitle);
    modal.contentEl.createEl('pre', { text: body + skipped + missing });
    modal.open();
  }

  async publishActive(withLinks) {
    const planned = await this.planFor(withLinks);
    if (!planned) return;
    const { file, plan } = planned;
    const root = this.settings.targetVaultRoot;

    const existing = [];
    for (const entry of plan.entries) {
      if (fs.existsSync(path.join(root, entry.toRel))) existing.push(entry.toRel);
    }
    if (existing.length > 0) {
      const proceed = await confirmOverwrite(this.app, existing, this.strings);
      if (!proceed) { new Notice(this.strings.publishCancelled); return; }
    }

    const written = [];
    try {
      for (const entry of plan.entries) {
        const destination = path.join(root, entry.toRel);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (entry.kind === 'note') {
          fs.writeFileSync(destination, entry.content, 'utf8');
        } else {
          const buffer = await this.readBinary(entry.from);
          if (buffer == null) { plan.missing.push(entry.from); continue; }
          fs.writeFileSync(destination, buffer);
        }
        written.push(entry.toRel);
      }
    } catch (error) {
      new Notice(fill(this.strings.publishFailed, {
        message: error && error.message ? error.message : String(error),
      }));
      console.error('[lesson-publisher]', error);
      return;
    }

    if (this.settings.stampSource && written.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const fields = { published: today, published_to: written[0] };
      const apply = (data) => stampFrontmatter(data, fields);
      if (typeof this.app.vault.process === 'function') await this.app.vault.process(file, apply);
      else await this.app.vault.modify(file, apply(await this.app.vault.read(file)));
    }

    const tail = [];
    if (plan.skipped.length) tail.push(fill(this.strings.skippedCount, { count: plan.skipped.length }));
    if (plan.missing.length) tail.push(fill(this.strings.missingCount, { count: plan.missing.length }));
    // The count, the dash that introduces the tail and the comma between its parts are all
    // the table's: a sentence is not a language's until its punctuation is.
    const counted = tail.length
      ? fill(this.strings.publishedTail, { list: tail.join(this.strings.publishedListSeparator) })
      : '';
    new Notice(fill(this.strings.published, { count: written.length, tail: counted }), 6000);
  }
}

class PublisherSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // The table the plugin chose when it loaded, so every label and description here is in
    // the language of the commands that lead to this tab.
    this.strings = plugin.strings;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    // `Setting#setHeading()` is the documented heading, not a raw `<h2>`: it
    // gets the theme's heading treatment and survives changes to the setting
    // markup. See https://docs.obsidian.md/Plugins/User+interface/Settings
    //
    // The heading is the subject, not the plugin name: the settings tab is
    // already titled "Lesson Publisher" by Obsidian, and repeating it in a
    // heading is one of the things the directory review rejects.
    new Setting(containerEl).setName(this.strings.settingsHeading).setHeading();

    new Setting(containerEl)
      .setName(this.strings.settingLibraryPath)
      .setDesc(this.strings.settingLibraryPathDesc)
      .addText((text) => text
        // Not `~/…`: nothing here expands a tilde — `path.join` and `fs` would
        // treat it as a literal folder name and publish into a directory called
        // `~`. A placeholder that looked like a real path would therefore teach
        // the wrong thing, so this one just says what the box wants.
        .setPlaceholder(this.strings.settingLibraryPathPlaceholder)
        .setValue(this.plugin.settings.targetVaultRoot)
        .onChange(async (value) => { this.plugin.settings.targetVaultRoot = value.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingMirrorRoot)
      .setDesc(this.strings.settingMirrorRootDesc)
      .addText((text) => text
        .setValue(this.plugin.settings.targetRoot)
        .onChange(async (value) => { this.plugin.settings.targetRoot = value.trim() || 'Learn'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingFallbackFolder)
      .setDesc(this.strings.settingFallbackFolderDesc)
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackSubfolder)
        .onChange(async (value) => { this.plugin.settings.fallbackSubfolder = value.trim() || 'Inbox'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingAssetFallbackFolder)
      .setDesc(this.strings.settingAssetFallbackFolderDesc)
      .addText((text) => text
        .setValue(this.plugin.settings.assetFallbackSubfolder || 'Attachments')
        .onChange(async (value) => { this.plugin.settings.assetFallbackSubfolder = value.trim() || 'Attachments'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingCopyEmbedded)
      .setDesc(this.strings.settingCopyEmbeddedDesc)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.copyEmbeddedFiles !== false)
        .onChange(async (value) => { this.plugin.settings.copyEmbeddedFiles = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingStampSource)
      .setDesc(this.strings.settingStampSourceDesc)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.stampSource !== false)
        .onChange(async (value) => { this.plugin.settings.stampSource = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingStampCopy)
      .setDesc(this.strings.settingStampCopyDesc)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.stampPublishedCopy !== false)
        .onChange(async (value) => { this.plugin.settings.stampPublishedCopy = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingLinkedStatuses)
      .setDesc(this.strings.settingLinkedStatusesDesc)
      .addText((text) => text
        .setValue(this.plugin.settings.includeLinkedStatuses)
        .onChange(async (value) => { this.plugin.settings.includeLinkedStatuses = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(this.strings.settingOverrides)
      .setDesc(this.strings.settingOverridesDesc)
      .addTextArea((area) => area
        .setValue(this.plugin.settings.folderOverrides)
        .onChange(async (value) => { this.plugin.settings.folderOverrides = value; await this.plugin.saveSettings(); }));
  }
}

module.exports = LessonPublisher;
module.exports.__internals = {
  DEFAULT_SETTINGS,
  basename,
  buildPlan,
  extractEmbeds,
  frontmatterValue,
  parseFolderOverrides,
  resolveEmbedPath,
  resolveNoteLink,
  resolveRelativeTarget,
  stampFrontmatter,
  statusIsIncluded,
  toPosix,
};
