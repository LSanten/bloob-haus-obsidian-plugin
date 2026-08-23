import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildUrl,
	buildUrlPath,
	parseUrlSettings,
	DEFAULT_URL_SETTINGS,
	type BloobUrlSettings,
} from './bloob-url-core.ts';

/** The real `url:` block from melt-website/_bloob-settings.md. */
const MELT: BloobUrlSettings = {
	base: 'https://melt.bloob.haus',
	case: 'lower',
	datePrefix: 'none',
	mountPath: '',
	found: true,
};

const PRESERVE: BloobUrlSettings = { ...DEFAULT_URL_SETTINGS, base: 'https://leons.bloob.haus', found: true };

describe('issue #5 — copy link must honour the vault\'s url.case', () => {
	test('lowercases every segment for a lower-case vault', () => {
		assert.equal(
			buildUrl('Resources/VIDEO-assisted-stetching.md', MELT),
			'https://melt.bloob.haus/resources/video-assisted-stetching/',
		);
	});

	test('keeps casing for a preserve-case vault', () => {
		assert.equal(
			buildUrl('Marbles/TECHNOLOGY-DEFINITION-A.md', PRESERVE),
			'https://leons.bloob.haus/Marbles/TECHNOLOGY-DEFINITION-A/',
		);
	});

	test('turns spaces into hyphens in both modes', () => {
		assert.equal(buildUrlPath('Deep Work Notes.md', MELT), '/deep-work-notes/');
		assert.equal(buildUrlPath('Deep Work Notes.md', PRESERVE), '/Deep-Work-Notes/');
	});
});

describe('buildUrlPath', () => {
	test('slugs each segment separately so slashes survive', () => {
		assert.equal(buildUrlPath('A Folder/A Note.md', MELT), '/a-folder/a-note/');
	});

	test('resolves a folder index to the folder itself', () => {
		assert.equal(buildUrlPath('Resources/index.md', MELT), '/resources/');
		assert.equal(buildUrlPath('Resources/_index.md', MELT), '/resources/');
	});

	test('resolves a root index to the site root', () => {
		assert.equal(buildUrlPath('index.md', MELT), '/');
		assert.equal(buildUrlPath('_index.md', MELT), '/');
	});

	test('strips a date prefix only when date_prefix is "strip"', () => {
		const strip = { ...MELT, datePrefix: 'strip' as const };
		assert.equal(buildUrlPath('2025-10-10-Reflection.md', strip), '/reflection/');
		assert.equal(buildUrlPath('2025-10-10-Reflection.md', MELT), '/2025-10-10-reflection/');
	});

	test('never strips a date prefix from a folder name', () => {
		const strip = { ...MELT, datePrefix: 'strip' as const };
		assert.equal(buildUrlPath('2025-10-10-Journal/Entry.md', strip), '/2025-10-10-journal/entry/');
	});

	test('prepends mount_path when the site is mounted on a subpath', () => {
		assert.equal(buildUrlPath('Notes/A.md', { ...MELT, mountPath: 'garden' }), '/garden/notes/a/');
	});
});

describe('buildUrl', () => {
	test('falls back to the manual site URL when the vault declares no base', () => {
		const noBase = { ...DEFAULT_URL_SETTINGS, case: 'lower' as const };
		assert.equal(buildUrl('A.md', noBase, 'https://example.com'), 'https://example.com/a/');
	});

	test('prefers the vault base over the manual fallback', () => {
		assert.equal(buildUrl('A.md', MELT, 'https://wrong.example'), 'https://melt.bloob.haus/a/');
	});

	test('tolerates a trailing slash on either base', () => {
		assert.equal(buildUrl('A.md', { ...MELT, base: 'https://melt.bloob.haus/' }), 'https://melt.bloob.haus/a/');
	});
});

describe('parseUrlSettings', () => {
	test('reads a full url: block', () => {
		assert.deepEqual(
			parseUrlSettings({ url: { base: 'https://melt.bloob.haus', case: 'lower', date_prefix: 'none', mount_path: '' } }),
			MELT,
		);
	});

	test('reports found:false when the vault has no url settings at all', () => {
		assert.equal(parseUrlSettings({}).found, false);
		assert.equal(parseUrlSettings(undefined).found, false);
	});

	test('honours the legacy permalink_strategy key', () => {
		assert.equal(parseUrlSettings({ permalink_strategy: 'slugify' }).case, 'lower');
		assert.equal(parseUrlSettings({ permalink_strategy: 'preserve-case' }).case, 'preserve');
		assert.equal(parseUrlSettings({ permalink_strategy: 'slugify' }).found, true);
	});

	test('defaults an unrecognised case to preserve', () => {
		assert.equal(parseUrlSettings({ url: { case: 'sideways' } }).case, 'preserve');
	});

	test('strips surrounding slashes from mount_path and trailing slash from base', () => {
		const got = parseUrlSettings({ url: { base: 'https://x.dev/', mount_path: '/garden/' } });
		assert.equal(got.base, 'https://x.dev');
		assert.equal(got.mountPath, 'garden');
	});
});
