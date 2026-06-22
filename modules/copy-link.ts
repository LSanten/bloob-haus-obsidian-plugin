import { Plugin, Notice } from 'obsidian';
import { CopyLinkSettings } from '../main';

/**
 * Copy Link — adds an always-visible ribbon icon (and a command) that copies the
 * public Bloob Haus URL for the active note to the clipboard.
 *
 * URL construction matches the webapp pipeline (confirmed in the v1 plan):
 *   https://{siteUrl}/{vault-relative-path-without-ext}/
 * - Case is PRESERVED (no lowercasing)
 * - Spaces → hyphens, per path segment
 * - No slugify, no encodeURIComponent — just the space→hyphen replacement
 * - Folder structure maps directly to the URL path
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

		const base = (this.getSettings().siteUrl || '').trim().replace(/\/+$/, '');
		if (!base) {
			new Notice('Set your site URL in Bloob Haus settings first');
			return;
		}

		// Vault-relative path, minus the .md extension, e.g. "marbles/My Note.md" → "marbles/My Note"
		const rel = file.path.replace(/\.md$/i, '');
		const urlPath = rel
			.split('/')
			.map(seg => seg.replace(/ /g, '-')) // spaces → hyphens; preserve case
			.join('/');

		const url = `${base}/${urlPath}/`;
		await navigator.clipboard.writeText(url);
		new Notice(`Copied: ${url}`);
	}
}
