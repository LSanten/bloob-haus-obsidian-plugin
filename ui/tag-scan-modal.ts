import { App, Modal, Setting, TFile } from 'obsidian';

export interface ScanResult {
	file: TFile;
	toAdd: string[];
}

/**
 * Preview modal for the vault tag scan. Shows every note that would gain tags,
 * each with a checkbox (on by default). Nothing is written until "Apply".
 */
export class TagScanModal extends Modal {
	private selected: Set<TFile>;

	constructor(
		app: App,
		private results: ScanResult[],
		private onApply: (selected: ScanResult[]) => Promise<void>,
	) {
		super(app);
		this.selected = new Set(results.map(r => r.file));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Tag scan preview' });
		contentEl.createEl('p', {
			text: `${this.results.length} note${this.results.length === 1 ? '' : 's'} would get new tags. Uncheck any you want to skip, then Apply.`,
			cls: 'setting-item-description',
		});

		const list = contentEl.createDiv({ cls: 'bloob-tag-scan-list' });
		for (const r of this.results) {
			new Setting(list)
				.setName(r.file.path)
				.setDesc(r.toAdd.map(t => '#' + t).join('  '))
				.addToggle(t => t.setValue(true).onChange(v => {
					if (v) this.selected.add(r.file);
					else this.selected.delete(r.file);
				}));
		}

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Apply').setCta().onClick(async () => {
				const selected = this.results.filter(r => this.selected.has(r.file));
				this.close();
				await this.onApply(selected);
			}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
