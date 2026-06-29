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
 * - A folder index (`_index.md` / `index.md`) resolves to the folder URL itself,
 *   i.e. the index segment is dropped (e.g. `projects/_index.md` → `…/projects/`).
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
		let segments = rel
			.split('/')
			.map(seg => seg.replace(/ /g, '-')); // spaces → hyphens; preserve case

		// A folder index resolves to the folder itself: drop a trailing _index/index.
		if (segments.length && /^_?index$/i.test(segments[segments.length - 1])) {
			segments = segments.slice(0, -1);
		}

		const urlPath = segments.join('/');
		const url = urlPath ? `${base}/${urlPath}/` : `${base}/`;
		await navigator.clipboard.writeText(url);
		new Notice(`Copied: ${url}`);
	}
}
