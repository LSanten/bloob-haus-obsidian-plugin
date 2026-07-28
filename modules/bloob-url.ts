import { App, TFile } from 'obsidian';

/**
 * Bloob URL — implements the canonical URL contract so the plugin's copied link
 * matches the URL the webapp actually deploys.
 *
 * SPEC: bloob-haus-webapp/docs/architecture/urls-and-ids.md
 * That doc is authoritative. This file is a faithful port of it for the vault
 * side; if the two ever disagree, the webapp is right and this is the bug.
 *
 * ┌─ Why this exists ────────────────────────────────────────────────────────┐
 * │ Every previous copy-link implementation hardcoded ONE site's rules:      │
 * │   • plugin repo      → preserve-case, always                            │
 * │   • buffbaby's copy  → lowercase, always                                │
 * │   • marbles' copy    → preserve-case + hardcoded leons.bloob.haus       │
 * │ Each was correct for its own vault and wrong everywhere else. The vault  │
 * │ already declares the answer in `_bloob-settings.md` → `url:`, so we read  │
 * │ it instead of guessing.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * The webapp implements the same rules in `scripts/utils/slug-strategy.js`
 * (`getSlugFunction`, `slugifyPath`) and `scripts/utils/file-index-builder.js`.
 * Cross-repo import isn't possible, so the slug functions below are mirrored
 * character-for-character. Keep them that way.
 */

const SETTINGS_FILE = '_bloob-settings.md';

export type UrlCase = 'preserve' | 'lower';
export type DatePrefixMode = 'keep' | 'strip' | 'none';

export interface BloobUrlSettings {
	base: string;
	case: UrlCase;
	datePrefix: DatePrefixMode;
	mountPath: string;
	/** True when a `url:` block was actually found — lets callers warn instead of guessing. */
	found: boolean;
}

export const DEFAULT_URL_SETTINGS: BloobUrlSettings = {
	base: '',
	case: 'preserve',
	datePrefix: 'none',
	mountPath: '',
	found: false,
};

/**
 * Standard slugify — lowercase, ASCII-only, hyphens for spaces.
 * Mirrors slugifyStandard() in the webapp's slug-strategy.js.
 */
function slugifyLower(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Preserve-case — keeps original casing, spaces → hyphens, strips only
 * URL-unsafe characters. Mirrors slugifyPreserveCase() in slug-strategy.js.
 */
function slugifyPreserve(str: string): string {
	return str
		.replace(/[^a-zA-Z0-9\s._-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export function getSlugFunction(urlCase: UrlCase): (s: string) => string {
	return urlCase === 'lower' ? slugifyLower : slugifyPreserve;
}

/**
 * Strips a leading YYYY-MM-DD- from a filename.
 * Mirrors stripDatePrefix() in the webapp's date-prefix.js.
 */
function stripDatePrefix(name: string): string {
	const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
	return m ? m[2] : name;
}

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
	if (!fm) return { ...DEFAULT_URL_SETTINGS };

	const url = fm.url as Record<string, unknown> | undefined;

	// Legacy flat key, still honoured by the webapp's bloob-settings-reader.
	// "slugify" is the webapp's internal name for what the url: block calls "lower".
	const legacyStrategy = fm.permalink_strategy as string | undefined;
	const legacyCase: UrlCase | undefined =
		legacyStrategy === 'slugify'
			? 'lower'
			: legacyStrategy === 'preserve-case'
				? 'preserve'
				: undefined;

	if (!url || typeof url !== 'object') {
		if (!legacyCase) return { ...DEFAULT_URL_SETTINGS };
		return { ...DEFAULT_URL_SETTINGS, case: legacyCase, found: true };
	}

	const rawCase = typeof url.case === 'string' ? url.case : undefined;
	const rawDate = typeof url.date_prefix === 'string' ? url.date_prefix : undefined;

	return {
		base: typeof url.base === 'string' ? url.base.trim().replace(/\/+$/, '') : '',
		case: rawCase === 'lower' || rawCase === 'preserve' ? rawCase : (legacyCase ?? 'preserve'),
		datePrefix:
			rawDate === 'keep' || rawDate === 'strip' || rawDate === 'none' ? rawDate : 'none',
		mountPath:
			typeof url.mount_path === 'string' ? url.mount_path.replace(/^\/+|\/+$/g, '') : '',
		found: true,
	};
}

/**
 * Builds the public URL path for a vault-relative note path.
 *
 * Implements the algorithm in urls-and-ids.md:
 *
 *   URL = base + (mount_path ? "/" + mount_path : "")
 *       + "/" + slug(each folder segment)
 *       + "/" + slug(filename without .md)
 *       + "/"
 *
 * - slug() is applied PER SEGMENT, never to the joined path — otherwise "/"
 *   gets eaten as a special character.
 * - Index files resolve to the folder itself: `folder/index.md` → `/folder/`,
 *   and a root `index.md` → `/`. Both `index` and `_index` spellings count.
 * - date_prefix: only `strip` removes a leading YYYY-MM-DD- from the URL;
 *   `keep` and `none` both leave the filename as authored.
 *
 * @param notePath Vault-relative path including the .md extension
 * @returns Path beginning and ending with "/" (e.g. "/resources/playlists/")
 */
export function buildUrlPath(notePath: string, settings: BloobUrlSettings): string {
	const slug = getSlugFunction(settings.case);

	const withoutExt = notePath.replace(/\.md$/i, '');
	let segments = withoutExt.split('/').filter((s) => s.length > 0);

	// A folder index resolves to the folder itself — drop the trailing index segment.
	if (segments.length && /^_?index$/i.test(segments[segments.length - 1])) {
		segments = segments.slice(0, -1);
	}

	const slugged = segments.map((seg, i) => {
		// The date prefix only ever applies to the filename, never to a folder.
		const isFilename = i === segments.length - 1;
		const name = isFilename && settings.datePrefix === 'strip' ? stripDatePrefix(seg) : seg;
		return slug(name);
	});

	if (settings.mountPath) {
		slugged.unshift(...settings.mountPath.split('/').filter(Boolean).map(slug));
	}

	return slugged.length ? `/${slugged.join('/')}/` : '/';
}

/**
 * Full public URL for a note. `fallbackBase` is the plugin's manual "Site URL"
 * setting, used when the vault has no `url.base` (e.g. a vault that predates
 * `_bloob-settings.md`).
 */
export function buildUrl(
	notePath: string,
	settings: BloobUrlSettings,
	fallbackBase = '',
): string {
	const base = (settings.base || fallbackBase).trim().replace(/\/+$/, '');
	return base + buildUrlPath(notePath, settings);
}
