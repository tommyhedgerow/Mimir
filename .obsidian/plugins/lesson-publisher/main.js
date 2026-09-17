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
const { Plugin: ObsidianPlugin, Notice, Modal, PluginSettingTab, Setting, TFile } = obsidian;

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
 * @returns {Promise<{entries: Array<{from: string, toRel: string, kind: string, content?: string}>, skipped: string[], missing: string[]}>}
 */
async function buildPlan(options) {
  const { notePath, markdown, settings, allPaths, readText, withLinks } = options;
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
      if (!statusIsIncluded(text, included)) { skipped.push(resolved + ' (status not publishable)'); continue; }
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

function confirmOverwrite(app, relPaths) {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.setText('Publish to library');
    const list = relPaths.slice(0, 12).map((p) => '• ' + p).join('\n');
    const more = relPaths.length > 12 ? `\n…and ${relPaths.length - 12} more` : '';
    modal.contentEl.createEl('p', { text: 'These files already exist in the library. Overwrite them?' });
    modal.contentEl.createEl('pre', { text: list + more });
    const row = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    const cancel = row.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => { resolve(false); modal.close(); };
    const ok = row.createEl('button', { text: 'Overwrite', cls: 'mod-cta' });
    ok.onclick = () => { resolve(true); modal.close(); };
    modal.onClose = () => resolve(false);
    modal.open();
    // resolve(false) twice is harmless: Promise settles once.
  });
}

class LessonPublisher extends ObsidianPlugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon('upload', 'Publish note to library', () => { void this.publishActive(false); });

    this.addCommand({
      id: 'publish-active-note',
      name: 'Publish active note to library',
      callback: () => { void this.publishActive(false); },
    });

    this.addCommand({
      id: 'publish-active-note-with-links',
      name: 'Publish active note and its finished linked notes',
      callback: () => { void this.publishActive(true); },
    });

    this.addCommand({
      id: 'show-publish-plan',
      name: 'Show what publishing this note would copy',
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
    if (!file) { new Notice('No active note to publish.'); return null; }
    if (!this.settings.targetVaultRoot) {
      new Notice('Lesson Publisher: set the library vault path in its settings first.');
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
      sourceVaultName: this.app.vault.getName(),
    });
    return { file, plan };
  }

  async reportPlan() {
    const planned = await this.planFor(true);
    if (!planned) return;
    const { plan } = planned;
    const body = plan.entries.map((entry) => `${entry.kind === 'note' ? 'note ' : 'file '} ${entry.toRel}`).join('\n');
    const notes = plan.skipped.length ? `\n\nSkipped:\n${plan.skipped.join('\n')}` : '';
    const missing = plan.missing.length ? `\n\nNot found:\n${plan.missing.join('\n')}` : '';
    const modal = new Modal(this.app);
    modal.titleEl.setText('Publish plan');
    modal.contentEl.createEl('pre', { text: body + notes + missing });
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
      const proceed = await confirmOverwrite(this.app, existing);
      if (!proceed) { new Notice('Publish cancelled.'); return; }
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
      new Notice('Publish failed: ' + (error && error.message ? error.message : String(error)));
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
    if (plan.skipped.length) tail.push(`${plan.skipped.length} skipped (status)`);
    if (plan.missing.length) tail.push(`${plan.missing.length} not found`);
    new Notice(`Published ${written.length} file(s) to the library${tail.length ? ' — ' + tail.join(', ') : ''}.`, 6000);
  }
}

class PublisherSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
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
    new Setting(containerEl).setName('Publishing').setHeading();

    new Setting(containerEl)
      .setName('Library vault path')
      .setDesc('Absolute path to the library vault that finished notes are published into.')
      .addText((text) => text
        // Not `~/…`: nothing here expands a tilde — `path.join` and `fs` would
        // treat it as a literal folder name and publish into a directory called
        // `~`. A placeholder that looked like a real path would therefore teach
        // the wrong thing, so this one just says what the box wants.
        .setPlaceholder('Absolute path to your library vault')
        .setValue(this.plugin.settings.targetVaultRoot)
        .onChange(async (value) => { this.plugin.settings.targetVaultRoot = value.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Mirror root')
      .setDesc('Only notes under this folder keep their relative path. Everything else goes to the fallback folder below.')
      .addText((text) => text
        .setValue(this.plugin.settings.targetRoot)
        .onChange(async (value) => { this.plugin.settings.targetRoot = value.trim() || 'Learn'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Fallback folder')
      .setDesc('Where notes from outside the mirror root land inside the library.')
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackSubfolder)
        .onChange(async (value) => { this.plugin.settings.fallbackSubfolder = value.trim() || 'Inbox'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Asset fallback folder')
      .setDesc('Where embedded files from outside the mirror root land inside the library.')
      .addText((text) => text
        .setValue(this.plugin.settings.assetFallbackSubfolder || 'Attachments')
        .onChange(async (value) => { this.plugin.settings.assetFallbackSubfolder = value.trim() || 'Attachments'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Copy embedded files')
      .setDesc('Bring diagrams and attachments along, to the same mirrored position.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.copyEmbeddedFiles !== false)
        .onChange(async (value) => { this.plugin.settings.copyEmbeddedFiles = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Stamp the source note')
      .setDesc('Record `published` and `published_to` in the note you published from.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.stampSource !== false)
        .onChange(async (value) => { this.plugin.settings.stampSource = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Stamp the published copy')
      .setDesc('Record `source_vault` (the name of this vault) and the publish date in the library copy.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.stampPublishedCopy !== false)
        .onChange(async (value) => { this.plugin.settings.stampPublishedCopy = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Linked notes included')
      .setDesc('Comma-separated frontmatter statuses that the "with linked notes" command will publish.')
      .addText((text) => text
        .setValue(this.plugin.settings.includeLinkedStatuses)
        .onChange(async (value) => { this.plugin.settings.includeLinkedStatuses = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Folder overrides')
      .setDesc('Optional JSON map, e.g. {"Learn/Concepts": "Knowledge/Concepts"} to send a subtree somewhere else.')
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
