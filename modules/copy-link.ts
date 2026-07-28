import { Plugin, Notice } from 'obsidian';
import { CopyLinkSettings } from '../main';
import { readBloobUrlSettings, buildUrl } from './bloob-url';

/**
 * Copy Link — adds an always-visible ribbon icon (and a command) that copies the
 * public Bloob Haus URL for the active note to the clipboard.
 *
 * The URL is built from the vault's own `_bloob-settings.md` → `url:` block
 * (base, case, date_prefix, mount_path), so the copied link matches what the
 * webapp deploys for THIS vault. See `modules/bloob-url.ts` for the algorithm
 * and `bloob-haus-webapp/docs/architecture/urls-and-ids.md` for the spec.
 *
 * This module used to hardcode preserve-case + spaces→hyphens, which produced
 * wrong links on any `case: lower` site (e.g. melt, buffbaby): it would hand you
 * `melt.bloob.haus/Resources/Playlists/` for a page deployed at
 * `melt.bloob.haus/resources/playlists/`.
 *
 * The plugin's manual "Site URL" setting is now only a FALLBACK, used when the
 * vault declares no `url.base`.
 */
export class CopyLinkModule {
	private ribbonEl: HTMLElement | null = null;

	constructor(private plugin: Plugin, private getSettings: () => CopyLinkSettings) {}

	load() {
		this.ribbonEl = this.plugin.addRibbonIcon('link', 'Copy page link', () => this.copyLink());
	}

	unload() {
		this.ribbonEl?.remove();
		this.ribbonEl = null;
	}

	async copyLink() {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice('No active note');
			return;
		}

		const urlSettings = readBloobUrlSettings(this.plugin.app);
		const fallbackBase = (this.getSettings().siteUrl || '').trim();

		if (!urlSettings.base && !fallbackBase) {
			new Notice(
				'No site URL found. Add a `url.base` to _bloob-settings.md, or set Site URL in Bloob Haus settings.',
			);
			return;
		}

		const url = buildUrl(file.path, urlSettings, fallbackBase);
		await navigator.clipboard.writeText(url);
		new Notice(`Copied: ${url}`);
	}
}
