import { App, TFile, EventRef } from 'obsidian';
import { FrontmatterSettings } from '../main';

export class FrontmatterModule {
	private eventRefs: EventRef[] = [];
	private fileSnapshots = new Map<string, { content: string; lastDateAdded: string }>();
	private isReady = false;

	constructor(private app: App, private getSettings: () => FrontmatterSettings) {}

	load() {
		// Delay init to avoid false-positive create events during Obsidian startup indexing
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => { this.isReady = true; }, 2000);
		});

		const onCreate = this.app.vault.on('create', (file) => {
			if (!this.isReady || !(file instanceof TFile) || file.extension !== 'md') return;
			this.handleCreate(file);
		});

		const onModify = this.app.vault.on('modify', (file) => {
			if (!this.isReady || !(file instanceof TFile) || file.extension !== 'md') return;
			this.handleModify(file);
		});

		this.eventRefs.push(onCreate, onModify);
	}

	unload() {
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
		this.isReady = false;
	}

	private isExcluded(file: TFile): boolean {
		return this.getSettings().excludedFolders.some(f => file.path.startsWith(f));
	}

	private isActuallyNew(file: TFile): boolean {
		const ageSeconds = (Date.now() - file.stat.ctime) / 1000;
		return ageSeconds <= this.getSettings().creationTimeThreshold;
	}

	private async handleCreate(file: TFile) {
		if (this.isExcluded(file) || !this.isActuallyNew(file)) return;

		const today = this.today();
		const s = this.getSettings();

		// Small delay to ensure file is fully written
		setTimeout(async () => {
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					if (!fm['bloob-shape']) fm['bloob-shape'] = s.bloobShapeDefault;
					if (!fm.date_created) fm.date_created = today;
					if (!fm.date_updated) fm.date_updated = [];
					if (!fm.tags) fm.tags = [];
				});

				const content = await this.app.vault.read(file);
				this.fileSnapshots.set(file.path, { content, lastDateAdded: today });
			} catch (e) {
				console.error('[Bloob Haus] Error writing frontmatter:', e);
			}
		}, 100);
	}

	private async handleModify(file: TFile) {
		if (this.isExcluded(file)) return;
		if (!this.getSettings().trackDateUpdated) return;

		try {
			const today = this.today();
			const current = await this.app.vault.read(file);
			const snapshot = this.fileSnapshots.get(file.path);

			if (!snapshot) {
				this.fileSnapshots.set(file.path, { content: current, lastDateAdded: today });
				return;
			}

			const delta = this.charDelta(snapshot.content, current);
			if (delta >= this.getSettings().significantChangeThreshold) {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					if (!fm.date_updated) fm.date_updated = [];
					else if (!Array.isArray(fm.date_updated)) fm.date_updated = [fm.date_updated];

					if (!fm.date_updated.includes(today) && fm.date_created !== today) {
						fm.date_updated.push(today);
						snapshot.content = current;
						snapshot.lastDateAdded = today;
					}
				});
			}
		} catch (e) {
			console.error('[Bloob Haus] Error updating date_updated:', e);
		}
	}

	private charDelta(a: string, b: string): number {
		const bodyA = this.stripFrontmatter(a);
		const bodyB = this.stripFrontmatter(b);
		const lenDiff = Math.abs(bodyA.length - bodyB.length);
		if (lenDiff > 0) return lenDiff;

		let changed = 0;
		for (let i = 0; i < Math.min(bodyA.length, bodyB.length); i++) {
			if (bodyA[i] !== bodyB[i]) changed++;
		}
		return changed;
	}

	private stripFrontmatter(content: string): string {
		return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
	}

	private today(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
}
