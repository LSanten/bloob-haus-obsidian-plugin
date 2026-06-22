import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { FrontmatterModule } from './modules/frontmatter';
import { ImageZoomModule } from './modules/image-zoom';
import { DateKeywordsModule } from './modules/date-keywords';
import { LinkEncoderModule } from './modules/link-encoder';
import { CopyLinkModule } from './modules/copy-link';
import { TagMatchingModule } from './modules/tag-matching';
import { FeedbackModal } from './ui/feedback-modal';

export interface FrontmatterSettings {
	bloobShapeDefault: string;
	significantChangeThreshold: number;
	excludedFolders: string[];
	creationTimeThreshold: number;
	trackDateUpdated: boolean;
}

export interface DateKeywordsSettings {
	replacements: Array<{ trigger: string; format: string }>;
}

export interface CopyLinkSettings {
	siteUrl: string;
}

export interface TagMatchingSettings {
	rulesFile: string;
	matchMode: 'word' | 'substring';
	caseSensitive: boolean;
	liveOnActiveNote: boolean;
	scanScope: 'body' | 'body+title';
	excludedFolders: string[];
}

export interface BloobHausSettings {
	modules: {
		frontmatter: boolean;
		imageZoom: boolean;
		dateKeywords: boolean;
		linkEncoder: boolean;
		copyLink: boolean;
		tagMatching: boolean;
	};
	frontmatter: FrontmatterSettings;
	dateKeywords: DateKeywordsSettings;
	copyLink: CopyLinkSettings;
	tagMatching: TagMatchingSettings;
}

const DEFAULT_SETTINGS: BloobHausSettings = {
	modules: {
		frontmatter: true,
		imageZoom: true,
		dateKeywords: false,
		linkEncoder: false,
		copyLink: true,
		tagMatching: false,
	},
	frontmatter: {
		bloobShapeDefault: 'note',
		significantChangeThreshold: 20,
		excludedFolders: ['_media', 'templates'],
		creationTimeThreshold: 30,
		trackDateUpdated: true,
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
	copyLink: {
		siteUrl: '',
	},
	tagMatching: {
		rulesFile: '_bloob-auto-tagging.md',
		matchMode: 'word',
		caseSensitive: false,
		liveOnActiveNote: false,
		scanScope: 'body',
		excludedFolders: ['_media', 'templates'],
	},
};

type ModuleKey = keyof BloobHausSettings['modules'];

export default class BloobHausPlugin extends Plugin {
	settings: BloobHausSettings;

	private frontmatterModule: FrontmatterModule | null = null;
	private imageZoomModule: ImageZoomModule | null = null;
	private dateKeywordsModule: DateKeywordsModule | null = null;
	private linkEncoderModule: LinkEncoderModule | null = null;
	private copyLinkModule: CopyLinkModule | null = null;
	private tagMatchingModule: TagMatchingModule | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BloobHausSettingTab(this.app, this));
		this.initModules();
		this.registerCommands();
	}

	onunload() {
		this.frontmatterModule?.unload();
		this.imageZoomModule?.unload();
		this.dateKeywordsModule?.unload();
		this.linkEncoderModule?.unload();
		this.copyLinkModule?.unload();
		this.tagMatchingModule?.unload();
	}

	async loadSettings() {
		const saved = (await this.loadData()) || {};
		this.settings = {
			modules: Object.assign({}, DEFAULT_SETTINGS.modules, saved.modules),
			frontmatter: Object.assign({}, DEFAULT_SETTINGS.frontmatter, saved.frontmatter),
			dateKeywords: Object.assign({}, DEFAULT_SETTINGS.dateKeywords, saved.dateKeywords),
			copyLink: Object.assign({}, DEFAULT_SETTINGS.copyLink, saved.copyLink),
			tagMatching: Object.assign({}, DEFAULT_SETTINGS.tagMatching, saved.tagMatching),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Opens the vault tag-scan preview (used by the command and the settings button). */
	scanVaultForTags() {
		if (this.tagMatchingModule) this.tagMatchingModule.openScanModal();
		else new Notice('Enable the Auto tagging module in Bloob Haus settings');
	}

	getTagRulesCount(): number {
		return this.tagMatchingModule?.getRulesCount() ?? 0;
	}

	/** Commands are registered once and route to the live module (or notice if it's off). */
	registerCommands() {
		this.addCommand({
			id: 'copy-page-link',
			name: 'Copy page link',
			callback: () => {
				if (this.copyLinkModule) this.copyLinkModule.copyLink();
				else new Notice('Enable the Copy link module in Bloob Haus settings');
			},
		});

		this.addCommand({
			id: 'scan-vault-for-tags',
			name: 'Scan vault for tags',
			callback: () => {
				if (this.tagMatchingModule) this.tagMatchingModule.openScanModal();
				else new Notice('Enable the Auto tagging module in Bloob Haus settings');
			},
		});

		this.addCommand({
			id: 'scan-active-note-for-tags',
			name: 'Scan current note for tags',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!this.tagMatchingModule || !file) return false;
				if (!checking) {
					this.tagMatchingModule.applyToFile(file).then(added => {
						new Notice(added.length ? `Added: ${added.map(t => '#' + t).join(' ')}` : 'No new tags matched');
					});
				}
				return true;
			},
		});
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
		if (this.settings.modules.copyLink) {
			this.copyLinkModule = new CopyLinkModule(this, () => this.settings.copyLink);
			this.copyLinkModule.load();
		}
		if (this.settings.modules.tagMatching) {
			this.tagMatchingModule = new TagMatchingModule(this, () => this.settings.tagMatching);
			this.tagMatchingModule.load();
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
		} else if (key === 'copyLink') {
			this.copyLinkModule?.unload();
			this.copyLinkModule = enabled ? new CopyLinkModule(this, () => this.settings.copyLink) : null;
			this.copyLinkModule?.load();
		} else if (key === 'tagMatching') {
			this.tagMatchingModule?.unload();
			this.tagMatchingModule = enabled ? new TagMatchingModule(this, () => this.settings.tagMatching) : null;
			this.tagMatchingModule?.load();
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
				.setName('Default bloob-shape')
				.setDesc('Value for bloob-shape in new notes (e.g. note, marble, article)')
				.addText(t => t.setValue(s.bloobShapeDefault).onChange(async v => {
					s.bloobShapeDefault = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Track date_updated')
				.setDesc('Append today\'s date to date_updated when a note changes significantly. date_created on new notes is unaffected.')
				.addToggle(t => t.setValue(s.trackDateUpdated).onChange(async v => {
					s.trackDateUpdated = v;
					await this.plugin.saveSettings();
					this.display();
				}));

			if (s.trackDateUpdated) {
				new Setting(containerEl)
					.setName('Significant change threshold')
					.setDesc('Minimum characters changed to log a date_updated entry (default: 20)')
					.addText(t => t.setValue(String(s.significantChangeThreshold)).onChange(async v => {
						const n = parseInt(v);
						if (!isNaN(n) && n > 0) { s.significantChangeThreshold = n; await this.plugin.saveSettings(); }
					}));
			}

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

		// ── Copy Link ──────────────────────────────────────────────────────────
		this.addToggle(
			'Copy link',
			'Adds a ribbon icon (and command) to copy the public Bloob Haus URL of the current note.',
			'copyLink'
		);

		if (this.plugin.settings.modules.copyLink) {
			const s = this.plugin.settings.copyLink;
			new Setting(containerEl)
				.setName('Site URL')
				.setDesc('Your published site root, e.g. https://leons.bloob.haus — used to build the copied link.')
				.addText(t => t
					.setPlaceholder('https://yourdomain.com')
					.setValue(s.siteUrl)
					.onChange(async v => { s.siteUrl = v; await this.plugin.saveSettings(); }));
		}

		// ── Auto tagging ──────────────────────────────────────────────────────
		this.addToggle(
			'Auto tagging',
			'Adds frontmatter tags based on keyword rules defined in a vault file — live while you type, or via a vault-wide scan with preview.',
			'tagMatching'
		);

		if (this.plugin.settings.modules.tagMatching) {
			const s = this.plugin.settings.tagMatching;

			new Setting(containerEl)
				.setName('Add tags live while editing')
				.setDesc('When on, matched tags are added to the active note as you type (debounced).')
				.addToggle(t => t.setValue(s.liveOnActiveNote).onChange(async v => {
					s.liveOnActiveNote = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Match mode')
				.setDesc('Whole word avoids partial hits (e.g. "art" won\'t match "cart").')
				.addDropdown(d => d
					.addOption('word', 'Whole word')
					.addOption('substring', 'Substring')
					.setValue(s.matchMode)
					.onChange(async v => { s.matchMode = v as 'word' | 'substring'; await this.plugin.saveSettings(); }));

			new Setting(containerEl)
				.setName('Case sensitive')
				.addToggle(t => t.setValue(s.caseSensitive).onChange(async v => {
					s.caseSensitive = v;
					await this.plugin.saveSettings();
				}));

			new Setting(containerEl)
				.setName('Scan scope')
				.setDesc('Whether to also match against the note title.')
				.addDropdown(d => d
					.addOption('body', 'Body only')
					.addOption('body+title', 'Body + title')
					.setValue(s.scanScope)
					.onChange(async v => { s.scanScope = v as 'body' | 'body+title'; await this.plugin.saveSettings(); }));

			new Setting(containerEl)
				.setName('Excluded folders')
				.setDesc('Comma-separated folders to skip when scanning')
				.addText(t => t.setValue(s.excludedFolders.join(', ')).onChange(async v => {
					s.excludedFolders = v.split(',').map(f => f.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

			const rulesCount = this.plugin.getTagRulesCount();
			new Setting(containerEl)
				.setName('Rules file')
				.setDesc(`${rulesCount} rule${rulesCount === 1 ? '' : 's'} loaded — edit the file to add or change rules`)
				.addText(t => t
					.setPlaceholder('_bloob-auto-tagging.md')
					.setValue(s.rulesFile)
					.onChange(async v => { s.rulesFile = v.trim() || '_bloob-auto-tagging.md'; await this.plugin.saveSettings(); }))
				.addButton(b => b.setButtonText('Open').onClick(async () => {
					const file = this.app.vault.getAbstractFileByPath(s.rulesFile);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf().openFile(file);
					} else {
						new Notice(`Rules file not found: ${s.rulesFile}`);
					}
				}));

			new Setting(containerEl)
				.addButton(b => b.setButtonText('Scan vault now').setCta().onClick(() => {
					this.plugin.scanVaultForTags();
				}));
		}

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
