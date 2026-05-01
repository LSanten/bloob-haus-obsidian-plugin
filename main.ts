import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { FrontmatterModule } from './modules/frontmatter';
import { ImageZoomModule } from './modules/image-zoom';
import { DateKeywordsModule } from './modules/date-keywords';
import { LinkEncoderModule } from './modules/link-encoder';
import { FeedbackModal } from './ui/feedback-modal';

export interface FrontmatterSettings {
	bloobObjectDefault: string;
	significantChangeThreshold: number;
	excludedFolders: string[];
	creationTimeThreshold: number;
}

export interface DateKeywordsSettings {
	replacements: Array<{ trigger: string; format: string }>;
}

export interface BloobHausSettings {
	modules: {
		frontmatter: boolean;
		imageZoom: boolean;
		dateKeywords: boolean;
		linkEncoder: boolean;
	};
	frontmatter: FrontmatterSettings;
	dateKeywords: DateKeywordsSettings;
}

const DEFAULT_SETTINGS: BloobHausSettings = {
	modules: {
		frontmatter: true,
		imageZoom: true,
		dateKeywords: false,
		linkEncoder: false,
	},
	frontmatter: {
		bloobObjectDefault: 'note',
		significantChangeThreshold: 20,
		excludedFolders: ['_media', 'templates'],
		creationTimeThreshold: 30,
	},
	dateKeywords: {
		replacements: [
			{ trigger: 'TODAY', format: 'YYYY-MM-DD' },
			{ trigger: 'DATE', format: 'YYYY-MM-DD' },
			{ trigger: 'TIME', format: 'HH:mm:ss A' },
			{ trigger: 'WDATE', format: 'YYYY-MM-DD, dddd' },
			{ trigger: 'TDATE', format: '# YYYY-MM-DD' },
			{ trigger: 'TTDATE', format: '## YYYY-MM-DD' },
		],
	},
};

type ModuleKey = keyof BloobHausSettings['modules'];

export default class BloobHausPlugin extends Plugin {
	settings: BloobHausSettings;

	private frontmatterModule: FrontmatterModule | null = null;
	private imageZoomModule: ImageZoomModule | null = null;
	private dateKeywordsModule: DateKeywordsModule | null = null;
	private linkEncoderModule: LinkEncoderModule | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BloobHausSettingTab(this.app, this));
		this.initModules();
	}

	onunload() {
		this.frontmatterModule?.unload();
		this.imageZoomModule?.unload();
		this.dateKeywordsModule?.unload();
		this.linkEncoderModule?.unload();
	}

	async loadSettings() {
		const saved = (await this.loadData()) || {};
		this.settings = {
			modules: Object.assign({}, DEFAULT_SETTINGS.modules, saved.modules),
			frontmatter: Object.assign({}, DEFAULT_SETTINGS.frontmatter, saved.frontmatter),
			dateKeywords: Object.assign({}, DEFAULT_SETTINGS.dateKeywords, saved.dateKeywords),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	initModules() {
		if (this.settings.modules.frontmatter) {
			this.frontmatterModule = new FrontmatterModule(this.app, () => this.settings.frontmatter);
			this.frontmatterModule.load();
		}
		if (this.settings.modules.imageZoom) {
			this.imageZoomModule = new ImageZoomModule();
			this.imageZoomModule.load();
		}
		if (this.settings.modules.dateKeywords) {
			this.dateKeywordsModule = new DateKeywordsModule(this.app, () => this.settings.dateKeywords);
			this.dateKeywordsModule.load();
		}
		if (this.settings.modules.linkEncoder) {
			this.linkEncoderModule = new LinkEncoderModule(this);
			this.linkEncoderModule.load();
		}
	}

	toggleModule(key: ModuleKey, enabled: boolean) {
		if (key === 'frontmatter') {
			this.frontmatterModule?.unload();
			this.frontmatterModule = enabled
				? new FrontmatterModule(this.app, () => this.settings.frontmatter)
				: null;
			this.frontmatterModule?.load();
		} else if (key === 'imageZoom') {
			this.imageZoomModule?.unload();
			this.imageZoomModule = enabled ? new ImageZoomModule() : null;
			this.imageZoomModule?.load();
		} else if (key === 'dateKeywords') {
			this.dateKeywordsModule?.unload();
			this.dateKeywordsModule = enabled
				? new DateKeywordsModule(this.app, () => this.settings.dateKeywords)
				: null;
			this.dateKeywordsModule?.load();
		} else if (key === 'linkEncoder') {
			this.linkEncoderModule?.unload();
			this.linkEncoderModule = enabled ? new LinkEncoderModule(this) : null;
			this.linkEncoderModule?.load();
		}
	}
}

class BloobHausSettingTab extends PluginSettingTab {
	plugin: BloobHausPlugin;

	constructor(app: App, plugin: BloobHausPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Bloob Haus' });
		containerEl.createEl('p', {
			text: 'Toggle modules on or off. Each module adds a focused feature to your notes workflow.',
			cls: 'setting-item-description',
		});

		// ── Frontmatter ────────────────────────────────────────────────────────
		this.addToggle(
			'Frontmatter auto-fill',
			'Adds date_created, date_updated, tags, and bloob_object to new notes automatically.',
			'frontmatter'
		);

		if (this.plugin.settings.modules.frontmatter) {
			const s = this.plugin.settings.frontmatter;

			new Setting(containerEl)
				.setName('Default bloob_object')
				.setDesc('Value for bloob_object in new notes')
				.addText(t => t.setValue(s.bloobObjectDefault).onChange(async v => {
					s.bloobObjectDefault = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Significant change threshold')
				.setDesc('Minimum characters changed to log a date_updated entry (default: 20)')
				.addText(t => t.setValue(String(s.significantChangeThreshold)).onChange(async v => {
					const n = parseInt(v);
					if (!isNaN(n) && n > 0) { s.significantChangeThreshold = n; await this.plugin.saveSettings(); }
				}));

			new Setting(containerEl)
				.setName('Excluded folders')
				.setDesc('Comma-separated folders to skip (e.g. _media, templates)')
				.addText(t => t.setValue(s.excludedFolders.join(', ')).onChange(async v => {
					s.excludedFolders = v.split(',').map(f => f.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));
		}

		// ── Image Zoom ─────────────────────────────────────────────────────────
		this.addToggle(
			'Image zoom',
			'Click any image to open it fullscreen. Scroll to zoom, drag to pan.',
			'imageZoom'
		);

		// ── Date Keywords ──────────────────────────────────────────────────────
		this.addToggle(
			'Date keywords',
			'Type TODAY, DATE, TIME etc. to instantly insert formatted dates. Fully configurable.',
			'dateKeywords'
		);

		if (this.plugin.settings.modules.dateKeywords) {
			const s = this.plugin.settings.dateKeywords;
			containerEl.createEl('p', {
				text: 'Each keyword is replaced as you type. Uses Moment.js format strings.',
				cls: 'setting-item-description',
			});

			s.replacements.forEach((r, i) => {
				new Setting(containerEl)
					.addText(t => t.setPlaceholder('Keyword').setValue(r.trigger).onChange(async v => { r.trigger = v; await this.plugin.saveSettings(); }))
					.addText(t => t.setPlaceholder('Format (e.g. YYYY-MM-DD)').setValue(r.format).onChange(async v => { r.format = v; await this.plugin.saveSettings(); }))
					.addExtraButton(b => b.setIcon('trash').setTooltip('Remove').onClick(async () => {
						s.replacements.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
			});

			new Setting(containerEl).addButton(b => b.setButtonText('Add keyword').setCta().onClick(async () => {
				s.replacements.push({ trigger: '', format: '' });
				await this.plugin.saveSettings();
				this.display();
			}));
		}

		// ── Link Encoder ───────────────────────────────────────────────────────
		this.addToggle(
			'Link encoder',
			'Paste a file path or URL and it\'s automatically converted to a formatted markdown link.',
			'linkEncoder'
		);

		// ── Feedback ───────────────────────────────────────────────────────────
		containerEl.createEl('hr');
		new Setting(containerEl)
			.setName('Feedback & bug reports')
			.setDesc('Have a feature idea or found a bug? We\'d love to hear it.')
			.addButton(b => b.setButtonText('Open feedback form').onClick(() => {
				new FeedbackModal(this.app).open();
			}));
	}

	private addToggle(name: string, desc: string, key: ModuleKey) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle(t => t
				.setValue(this.plugin.settings.modules[key])
				.onChange(async value => {
					this.plugin.settings.modules[key] = value;
					await this.plugin.saveSettings();
					this.plugin.toggleModule(key, value);
					this.display();
				}));
	}
}
