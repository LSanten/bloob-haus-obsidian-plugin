import { App, Plugin, TFile, EventRef, Notice, getAllTags, debounce, Debouncer } from 'obsidian';
import { TagMatchingSettings, TagMemory } from '../main';

interface TagRule {
	keywords: string[];
	tag: string;
}

const RULES_FILE_TEMPLATE = `## Auto tagging rules

Add rows to this table to automatically tag notes when keywords are found.
Keywords in the first column are comma-separated; the second column is the tag to apply (with or without #).

| To scan for | To be tagged with |
| ----------- | ----------------- |
`;

/**
 * Auto tagging — adds frontmatter tags based on keyword→tag rules defined in a vault file.
 *
 * Two modes share one rule engine:
 *  1. Live: while editing the active note, matched tags are added (debounced).
 *  2. Vault scan: a command builds a {note → tags-to-add} list and shows a
 *     preview modal — nothing is written until the user confirms.
 *
 * Tags are written via processFrontMatter as a plain string[] WITHOUT '#', so
 * Obsidian serializes them to its canonical block-list format automatically.
 */
export class TagMatchingModule {
	private app: App;
	private eventRefs: EventRef[] = [];
	private metaRefs: EventRef[] = [];
	private debouncedLive: Debouncer<[TFile], void>;
	private rules: TagRule[] = [];

	constructor(
		private plugin: Plugin,
		private getSettings: () => TagMatchingSettings,
		private getMemory: () => TagMemory,
		private saveMemory: () => Promise<void>,
	) {
		this.app = plugin.app;
		this.debouncedLive = debounce((file: TFile) => { void this.applyToFile(file); }, 1500, false);
	}

	load() {
		void this.init();

		const modifyRef = this.app.vault.on('modify', async (file) => {
			if (!(file instanceof TFile)) return;
			if (file.path === this.getSettings().rulesFile) {
				await this.loadRulesFromFile();
				return;
			}
			if (!this.getSettings().liveOnActiveNote) return;
			if (file.extension !== 'md') return;
			if (file !== this.app.workspace.getActiveFile()) return;
			this.debouncedLive(file);
		});
		this.eventRefs.push(modifyRef);

		const createRef = this.app.vault.on('create', async (file) => {
			if (file instanceof TFile && file.path === this.getSettings().rulesFile) {
				await this.loadRulesFromFile();
			}
		});
		this.eventRefs.push(createRef);

		// Watch metadata changes to reconcile rejected-tag memory: a user removing
		// an auto-added tag means "don't add it here again", and re-adding it clears
		// that rejection. Runs independently of live tagging.
		const metaRef = this.app.metadataCache.on('changed', (file) => {
			if (file instanceof TFile && file.extension === 'md') this.reconcileMemory(file);
		});
		this.metaRefs.push(metaRef);

		// Keep memory keys in sync with the vault on rename/delete.
		const renameRef = this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) void this.renameMemory(oldPath, file.path);
		});
		const deleteRef = this.app.vault.on('delete', (file) => {
			if (file instanceof TFile) void this.deleteMemory(file.path);
		});
		this.eventRefs.push(renameRef, deleteRef);
	}

	unload() {
		for (const r of this.eventRefs) this.app.vault.offref(r);
		for (const r of this.metaRefs) this.app.metadataCache.offref(r);
		this.eventRefs = [];
		this.metaRefs = [];
	}

	getRulesCount(): number {
		return this.rules.length;
	}

	// ── File I/O ─────────────────────────────────────────────────────────────

	private async init() {
		await this.ensureRulesFile();
		await this.loadRulesFromFile();
	}

	private async ensureRulesFile() {
		const path = this.getSettings().rulesFile;
		if (!this.app.vault.getAbstractFileByPath(path)) {
			await this.app.vault.create(path, RULES_FILE_TEMPLATE);
		}
	}

	private async loadRulesFromFile() {
		const path = this.getSettings().rulesFile;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			this.rules = [];
			return;
		}
		const content = await this.app.vault.read(file);
		this.rules = this.parseRulesFile(content);
	}

	private parseRulesFile(content: string): TagRule[] {
		const lines = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
		const sepIdx = lines.findIndex(l => l.includes('---'));
		if (sepIdx === -1) return [];

		return lines.slice(sepIdx + 1).flatMap(line => {
			const cols = line.split('|').slice(1, -1).map(c => c.trim());
			if (cols.length < 2) return [];
			const keywords = cols[0].split(',').map(k => k.trim()).filter(Boolean);
			const tag = cols[1];
			if (!keywords.length || !tag) return [];
			return [{ keywords, tag }];
		});
	}

	// ── Rule engine ──────────────────────────────────────────────────────────

	private matchTags(text: string): string[] {
		const s = this.getSettings();
		const found = new Set<string>();

		for (const rule of this.rules) {
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
		return new RegExp(`\\b${esc}\\b`, flags).test(text);
	}

	private normalizeTag(tag: string): string {
		return (tag || '').trim().replace(/^#/, '');
	}

	private normalizeFmTags(raw: unknown): string[] {
		if (!raw) return [];
		const arr: unknown[] = Array.isArray(raw)
			? raw
			: typeof raw === 'string'
				? raw.split(',')
				: [];
		return arr.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
	}

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
		const rejected = this.getSettings().rememberRejected
			? new Set(this.getMemory().rejected[file.path] || [])
			: new Set<string>();
		return candidates.filter(t => !existing.has(t) && !rejected.has(t));
	}

	// ── Apply ────────────────────────────────────────────────────────────────

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
		await this.recordAutoAdded(file.path, toAdd);
	}

	// ── Rejected-tag memory ──────────────────────────────────────────────────

	/** Remembers tags we wrote, so a later removal can be detected as a rejection. */
	private async recordAutoAdded(path: string, toAdd: string[]) {
		if (!this.getSettings().rememberRejected || toAdd.length === 0) return;
		const mem = this.getMemory();
		const auto = new Set(mem.autoAdded[path] || []);
		const rejected = new Set(mem.rejected[path] || []);
		for (const t of toAdd) {
			auto.add(t);
			rejected.delete(t); // adding it back overrides any prior rejection
		}
		mem.autoAdded[path] = [...auto];
		this.assign(mem.rejected, path, rejected);
		await this.saveMemory();
	}

	/**
	 * Reconciles memory against the note's current tags:
	 *  - an auto-added tag that's now gone → the user removed it → reject it
	 *  - a rejected tag that's present again → the user re-added it → un-reject
	 */
	private reconcileMemory(file: TFile) {
		if (!this.getSettings().rememberRejected) return;
		const path = file.path;
		const mem = this.getMemory();
		const auto = new Set(mem.autoAdded[path] || []);
		const rejected = new Set(mem.rejected[path] || []);
		if (auto.size === 0 && rejected.size === 0) return;

		const current = this.existingTags(file);
		let changed = false;

		for (const t of [...auto]) {
			if (!current.has(t)) { auto.delete(t); rejected.add(t); changed = true; }
		}
		for (const t of [...rejected]) {
			if (current.has(t)) { rejected.delete(t); changed = true; }
		}

		if (changed) {
			this.assign(mem.autoAdded, path, auto);
			this.assign(mem.rejected, path, rejected);
			void this.saveMemory();
		}
	}

	private async renameMemory(oldPath: string, newPath: string) {
		const mem = this.getMemory();
		let changed = false;
		for (const store of [mem.autoAdded, mem.rejected]) {
			if (store[oldPath]) { store[newPath] = store[oldPath]; delete store[oldPath]; changed = true; }
		}
		if (changed) await this.saveMemory();
	}

	private async deleteMemory(path: string) {
		const mem = this.getMemory();
		let changed = false;
		for (const store of [mem.autoAdded, mem.rejected]) {
			if (store[path]) { delete store[path]; changed = true; }
		}
		if (changed) await this.saveMemory();
	}

	/** Stores a set under a path key, dropping the key entirely when empty. */
	private assign(store: Record<string, string[]>, path: string, set: Set<string>) {
		if (set.size === 0) delete store[path];
		else store[path] = [...set];
	}

	// ── Vault scan (preview-first) ───────────────────────────────────────────

	async scanVault(): Promise<{ file: TFile; toAdd: string[] }[]> {
		const results: { file: TFile; toAdd: string[] }[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isExcluded(file)) continue;
			const toAdd = await this.computeAdditions(file);
			if (toAdd.length > 0) results.push({ file, toAdd });
		}
		return results;
	}

	async openScanModal() {
		if (this.rules.length === 0) {
			new Notice(`No rules found in ${this.getSettings().rulesFile} — add some rows to the table first`);
			return;
		}

		const { TagScanModal } = await import('../ui/tag-scan-modal');
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
