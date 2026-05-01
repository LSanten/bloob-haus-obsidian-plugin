import { App, TFile, EventRef } from 'obsidian';
import { DateKeywordsSettings } from '../main';

export class DateKeywordsModule {
	private eventRefs: EventRef[] = [];
	private renameTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(private app: App, private getSettings: () => DateKeywordsSettings) {}

	load() {
		const onChange = this.app.workspace.on('editor-change', (editor, view) => {
			this.replaceInLine(editor);
			this.checkFirstLineRename(editor, view);
		});

		const onCreate = this.app.vault.on('create', async (file) => {
			if (file instanceof TFile) await this.processFilename(file);
		});

		const onRename = this.app.vault.on('rename', async (file) => {
			if (file instanceof TFile) await this.processFilename(file);
		});

		this.eventRefs.push(onChange as EventRef, onCreate, onRename);
	}

	unload() {
		for (const ref of this.eventRefs) {
			// workspace events use offref on workspace
			try { this.app.workspace.offref(ref); } catch {}
			try { this.app.vault.offref(ref); } catch {}
		}
		this.eventRefs = [];
		if (this.renameTimeout) clearTimeout(this.renameTimeout);
	}

	private replacements() {
		return [...this.getSettings().replacements].sort((a, b) => b.trigger.length - a.trigger.length);
	}

	private replaceInLine(editor: any) {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		let newLine = line;

		for (const r of this.replacements()) {
			if (r.trigger && newLine.contains(r.trigger)) {
				try {
					newLine = newLine.replace(new RegExp(r.trigger, 'g'), (window as any).moment().format(r.format));
				} catch {}
			}
		}

		if (newLine !== line) editor.setLine(cursor.line, newLine);
	}

	private async processFilename(file: TFile) {
		let newName = file.name;
		let changed = false;
		const now = (window as any).moment();

		for (const r of this.replacements()) {
			if (r.trigger && newName.contains(r.trigger)) {
				try {
					newName = newName.replace(new RegExp(r.trigger, 'g'), now.format(r.format));
					changed = true;
				} catch {}
			}
		}

		if (changed && newName !== file.name) {
			newName = newName.replace(/[\\/:*?"<>|]/g, '-');
			const newPath = file.path.replace(file.name, newName);
			try { await this.app.fileManager.renameFile(file, newPath); } catch {}
		}
	}

	private checkFirstLineRename(editor: any, view: any) {
		const cursor = editor.getCursor();
		if (cursor.line !== 0) return;

		const firstLine = editor.getLine(0);
		const file = view.file;
		const hasTrigger = this.replacements().some(r => r.trigger && firstLine.contains(r.trigger));
		if (!file || !hasTrigger) return;

		if (this.renameTimeout) clearTimeout(this.renameTimeout);
		this.renameTimeout = setTimeout(async () => {
			let updated = editor.getLine(0);
			const now = (window as any).moment();

			for (const r of this.replacements()) {
				if (r.trigger && updated.contains(r.trigger)) {
					try { updated = updated.replace(new RegExp(r.trigger, 'g'), now.format(r.format)); } catch {}
				}
			}

			let newName = updated.replace(/^#+\s*/, '').replace(/[\\/:*?"<>|]/g, '').trim();
			if (!newName || file.basename === newName) return;

			newName = newName.replace(/[\\/:*?"<>|]/g, '-');
			const newPath = file.path.replace(file.name, newName + '.' + file.extension);
			try { await this.app.fileManager.renameFile(file, newPath); } catch {}
		}, 1000);
	}
}
