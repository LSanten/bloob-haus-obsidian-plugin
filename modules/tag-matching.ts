import { App, Plugin, TFile, EventRef, Notice, getAllTags, debounce, Debouncer } from 'obsidian';
import { TagMatchingSettings } from '../main';
import { TagScanModal, ScanResult } from '../ui/tag-scan-modal';

/**
 * Tag Matching — adds frontmatter tags based on user-defined keyword→tag rules.
 *
 * Two modes share one rule engine:
 *  1. Live: while editing the active note, matched tags are added (debounced).
 *     Same mechanism as date_updated (vault 'modify' + processFrontMatter).
 *  2. Vault scan: a command builds a {note → tags-to-add} list and shows a
 *     preview modal — nothing is written until the user confirms.
 *
 * Tags are written via processFrontMatter as a plain string[] WITHOUT '#', so
 * Obsidian serializes them to its canonical block-list format automatically.
 */
export class TagMatchingModule {
	private app: App;
	private eventRefs: EventRef[] = [];
	private debouncedLive: Debouncer<[TFile], void>;

	constructor(private plugin: Plugin, private getSettings: () => TagMatchingSettings) {
		this.app = plugin.app;
		this.debouncedLive = debounce((file: TFile) => { void this.applyToFile(file); }, 1500, false);
	}

	load() {
		const ref = this.app.vault.on('modify', (file) => {
			if (!this.getSettings().liveOnActiveNote) return;
			if (!(file instanceof TFile) || file.extension !== 'md') return;
			if (file !== this.app.workspace.getActiveFile()) return;
			this.debouncedLive(file);
		});
		this.eventRefs.push(ref);
	}

	unload() {
		for (const r of this.eventRefs) this.app.vault.offref(r);
		this.eventRefs = [];
	}

	// ── Rule engine ──────────────────────────────────────────────────────────

	/** Tags that the rules say should apply to this text (normalized, no '#'). */
	private matchTags(text: string): string[] {
		const s = this.getSettings();
		const found = new Set<string>();

		for (const rule of s.rules) {
			const tag = this.normalizeTag(rule.tag);
			if (!tag) continue;
			for (const kw of rule.keywords) {
				const keyword = kw.trim();
				if (!keyword) continue;
				if (this.textMatches(text, keyword, s.matchMode, s.caseSensitive)) {
					found.add(tag);
					break;
				}
			}
		}
		return [...found];
	}

	private textMatches(text: string, keyword: string, mode: 'word' | 'substring', caseSensitive: boolean): boolean {
		const flags = caseSensitive ? '' : 'i';
		const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (mode === 'substring') {
			return new RegExp(esc, flags).test(text);
		}
		// whole-word: \b boundaries (so "art" doesn't match "cart")
		return new RegExp(`\\b${esc}\\b`, flags).test(text);
	}

	private normalizeTag(tag: string): string {
		return (tag || '').trim().replace(/^#/, '');
	}

	/** Normalize whatever fm.tags currently is (array | comma-string | with-#) to string[]. */
	private normalizeFmTags(raw: unknown): string[] {
		if (!raw) return [];
		const arr: unknown[] = Array.isArray(raw)
			? raw
			: typeof raw === 'string'
				? raw.split(',')
				: [];
		return arr.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
	}

	/** All tags already on the file (frontmatter + inline), from the metadata cache, no '#'. */
	private existingTags(file: TFile): Set<string> {
		const cache = this.app.metadataCache.getFileCache(file);
		const all = cache ? getAllTags(cache) || [] : [];
		return new Set(all.map(t => t.replace(/^#/, '')));
	}

	private stripFrontmatter(content: string): string {
		return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
	}

	private isExcluded(file: TFile): boolean {
		return this.getSettings().excludedFolders.some(f => f && file.path.startsWith(f));
	}

	private async computeAdditions(file: TFile): Promise<string[]> {
		const content = await this.app.vault.read(file);
		const body = this.stripFrontmatter(content);
		const text = this.getSettings().scanScope === 'body+title' ? `${file.basename}\n${body}` : body;
		const candidates = this.matchTags(text);
		if (candidates.length === 0) return [];
		const existing = this.existingTags(file);
		return candidates.filter(t => !existing.has(t));
	}

	// ── Apply ────────────────────────────────────────────────────────────────

	/** Live/single-file: compute and write additions for one file. Returns what was added. */
	async applyToFile(file: TFile): Promise<string[]> {
		if (this.isExcluded(file)) return [];
		const toAdd = await this.computeAdditions(file);
		if (toAdd.length === 0) return [];
		await this.writeTags(file, toAdd);
		return toAdd;
	}

	private async writeTags(file: TFile, toAdd: string[]) {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = this.normalizeFmTags(fm.tags);
			fm.tags = [...new Set([...current, ...toAdd])];
		});
	}

	// ── Vault scan (preview-first) ───────────────────────────────────────────

	async scanVault(): Promise<ScanResult[]> {
		const results: ScanResult[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isExcluded(file)) continue;
			const toAdd = await this.computeAdditions(file);
			if (toAdd.length > 0) results.push({ file, toAdd });
		}
		return results;
	}

	async openScanModal() {
		const s = this.getSettings();
		if (s.rules.length === 0 || s.rules.every(r => !r.tag || r.keywords.every(k => !k.trim()))) {
			new Notice('Add at least one keyword → tag rule in Bloob Haus settings first');
			return;
		}

		const notice = new Notice('Scanning vault for tags…', 0);
		const results = await this.scanVault();
		notice.hide();

		if (results.length === 0) {
			new Notice('No new tags to add — every match is already tagged');
			return;
		}

		new TagScanModal(this.app, results, async (selected) => {
			for (const r of selected) await this.writeTags(r.file, r.toAdd);
			new Notice(`Added tags to ${selected.length} note${selected.length === 1 ? '' : 's'}`);
		}).open();
	}
}
