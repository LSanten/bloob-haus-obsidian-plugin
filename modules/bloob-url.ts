import { App, TFile } from 'obsidian';
import { DEFAULT_URL_SETTINGS, parseUrlSettings, type BloobUrlSettings } from './bloob-url-core.ts';

/**
 * Obsidian-facing shell for the URL contract. All of the actual logic lives in
 * `bloob-url-core.ts` (pure, unit-tested); this file only locates the settings
 * file and hands its frontmatter over.
 */

const SETTINGS_FILE = '_bloob-settings.md';

export {
	DEFAULT_URL_SETTINGS,
	buildUrl,
	buildUrlPath,
	getSlugFunction,
	parseUrlSettings,
	type BloobUrlSettings,
	type DatePrefixMode,
	type UrlCase,
} from './bloob-url-core.ts';

/**
 * Reads the `url:` block from the vault's `_bloob-settings.md`.
 *
 * Uses Obsidian's metadataCache, which has already parsed the frontmatter — no
 * YAML parser needed and no file read on the hot path.
 */
export function readBloobUrlSettings(app: App): BloobUrlSettings {
	const file = app.vault.getAbstractFileByPath(SETTINGS_FILE);
	if (!(file instanceof TFile)) return { ...DEFAULT_URL_SETTINGS };

	const fm = app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	return parseUrlSettings(fm);
}
