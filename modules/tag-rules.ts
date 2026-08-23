/**
 * Pure auto-tagging logic — rule parsing, keyword matching, path exclusion.
 *
 * Deliberately free of any `obsidian` import so it can be unit-tested with
 * `node --test` (see `tag-rules.test.ts`). All Obsidian-coupled behaviour —
 * vault reads, frontmatter writes, event wiring, rejected-tag memory — lives
 * in `tag-matching.ts`, which is the only consumer of this file.
 */

export interface TagRule {
	keywords: string[];
	tag: string;
}

export type MatchMode = 'word' | 'substring';

export const RULES_FILE_TEMPLATE = `## Auto tagging rules

Add rows to this table to automatically tag notes when keywords are found.
Keywords in the first column are comma-separated; the second column is the tag to apply (with or without #).

| To scan for | To be tagged with |
| ----------- | ----------------- |
`;

/** Reads the markdown table out of the rules file; everything else is ignored. */
export function parseRulesFile(content: string): TagRule[] {
	const lines = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
	const sepIdx = lines.findIndex(l => l.includes('---'));
	if (sepIdx === -1) return [];

	return lines.slice(sepIdx + 1).flatMap(line => {
		const cols = line.split('|').slice(1, -1).map(c => c.trim());
		if (cols.length < 2) return [];
		const keywords = cols[0].split(',').map(k => k.trim()).filter(Boolean);
		const tag = cols[1];
		if (!keywords.length || !tag) return [];
		return [{ keywords, tag }];
	});
}

export function normalizeTag(tag: string): string {
	return (tag || '').trim().replace(/^#/, '');
}

/** Frontmatter `tags` may be a YAML list or a comma-separated string. */
export function normalizeFmTags(raw: unknown): string[] {
	if (!raw) return [];
	const arr: unknown[] = Array.isArray(raw)
		? raw
		: typeof raw === 'string'
			? raw.split(',')
			: [];
	return arr.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
}

export function stripFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

/**
 * Word characters for whole-word matching. `\b` is ASCII-only, so it refuses to
 * match a keyword that begins or ends in anything outside [A-Za-z0-9_] — which
 * silently broke accented names ("Zoë", "José") and punctuated keywords ("c++").
 * Unicode-aware lookarounds behave the way "whole word" is meant to read.
 */
const WORD_CHAR = '[\\p{L}\\p{N}_]';

/** Escapes regex metacharacters, and lets any run of whitespace match any other. */
function keywordToPattern(keyword: string): string {
	return keyword
		.trim()
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\s+/g, '\\s+');
}

export function textMatches(text: string, keyword: string, mode: MatchMode, caseSensitive: boolean): boolean {
	const flags = caseSensitive ? 'u' : 'iu';
	const pattern = keywordToPattern(keyword);
	if (!pattern) return false;
	if (mode === 'substring') {
		return new RegExp(pattern, flags).test(text);
	}
	return new RegExp(`(?<!${WORD_CHAR})${pattern}(?!${WORD_CHAR})`, flags).test(text);
}

/** Every tag whose rule has at least one keyword present in `text`. */
export function matchTags(rules: TagRule[], text: string, mode: MatchMode, caseSensitive: boolean): string[] {
	const found = new Set<string>();

	for (const rule of rules) {
		const tag = normalizeTag(rule.tag);
		if (!tag) continue;
		for (const kw of rule.keywords) {
			const keyword = kw.trim();
			if (!keyword) continue;
			if (textMatches(text, keyword, mode, caseSensitive)) {
				found.add(tag);
				break;
			}
		}
	}
	return [...found];
}

/**
 * True when `path` sits inside one of `excludedFolders`. Compares whole path
 * segments: a bare `startsWith` made an exclusion of "media" also swallow
 * root notes like `media-plan.md` and sibling folders like `media-archive/`.
 */
export function excludedFolderFor(path: string, excludedFolders: string[]): string | null {
	for (const raw of excludedFolders) {
		const folder = (raw || '').trim().replace(/^\/+|\/+$/g, '');
		if (!folder) continue;
		if (path === folder || path.startsWith(`${folder}/`)) return folder;
	}
	return null;
}

export function isExcludedPath(path: string, excludedFolders: string[]): boolean {
	return excludedFolderFor(path, excludedFolders) !== null;
}

/**
 * Why a note did or didn't get tagged. Auto tagging used to do all of this
 * silently, so "it didn't tag" (issue #7) was indistinguishable from "the
 * module never ran" — every branch now has something to say for itself.
 */
export type TagOutcome =
	| { kind: 'added'; tags: string[] }
	| { kind: 'no-rules'; rulesFile: string }
	| { kind: 'excluded'; folder: string }
	| { kind: 'no-match' }
	| { kind: 'already-tagged'; tags: string[] }
	| { kind: 'suppressed'; tags: string[] };

const hashed = (tags: string[]) => tags.map(t => `#${t}`).join(' ');

export function describeOutcome(outcome: TagOutcome): string {
	switch (outcome.kind) {
		case 'added':
			return `Added ${hashed(outcome.tags)}`;
		case 'no-rules':
			return `No rules loaded — add rows to the table in ${outcome.rulesFile}`;
		case 'excluded':
			return `This note is in an excluded folder ("${outcome.folder}") — auto tagging skipped it`;
		case 'no-match':
			return 'No keyword from your rules appears in this note';
		case 'already-tagged':
			return `Matched ${hashed(outcome.tags)} — already on this note`;
		case 'suppressed':
			return `Withheld ${hashed(outcome.tags)} — you removed it here before ("Remember removed tags")`;
	}
}
