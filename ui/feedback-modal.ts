import { App, Modal, Setting } from 'obsidian';

const REPO = 'LSanten/bloob-haus-obsidian-plugin';

export class FeedbackModal extends Modal {
	private type: 'bug' | 'feature' = 'bug';
	private subject = '';
	private description = '';

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Send feedback' });
		contentEl.createEl('p', {
			text: 'This opens a pre-filled issue on GitHub. You\'ll need a GitHub account to submit.',
			cls: 'setting-item-description',
		});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown(d => d
				.addOption('bug', '🐛 Bug report')
				.addOption('feature', '💡 Feature request')
				.setValue(this.type)
				.onChange(v => { this.type = v as 'bug' | 'feature'; }));

		new Setting(contentEl)
			.setName('Subject')
			.addText(t => t
				.setPlaceholder('Short summary…')
				.onChange(v => { this.subject = v; }));

		contentEl.createEl('p', { text: 'Description', cls: 'setting-item-name' });
		const ta = contentEl.createEl('textarea', { cls: 'bloob-feedback-textarea' });
		ta.placeholder = 'What happened? What did you expect?';
		ta.addEventListener('input', () => { this.description = ta.value; });

		new Setting(contentEl)
			.addButton(b => b
				.setButtonText('Open on GitHub →')
				.setCta()
				.onClick(() => {
					const prefix = this.type === 'bug' ? '🐛 Bug: ' : '💡 Feature: ';
					const title = encodeURIComponent(prefix + (this.subject || 'Untitled'));
					const body = encodeURIComponent(this.description || '');
					const template = this.type === 'bug' ? 'bug_report.md' : 'feature_request.md';
					const url = `https://github.com/${REPO}/issues/new?template=${template}&title=${title}&body=${body}`;
					window.open(url, '_blank');
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
