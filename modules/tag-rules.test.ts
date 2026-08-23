import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseRulesFile,
	normalizeTag,
	normalizeFmTags,
	stripFrontmatter,
	textMatches,
	matchTags,
	isExcludedPath,
	excludedFolderFor,
	describeOutcome,
	type TagRule,
	type TagOutcome,
} from './tag-rules.ts';

// A rules file exactly as the plugin writes it, plus real rows from Leon's vaults.
const REAL_RULES_FILE = `---
bloob-shape: note
date_created: 2026-06-27
tags: []
---
## Auto tagging rules

Add rows to this table to automatically tag notes when keywords are found.

| To scan for   | To be tagged with |
| ------------- | ----------------- |
| whitney, crow | #whitney-crow     |
| natasha       | #natasha          |
| papa          | #papa             |
| mama          | #Mama             |
`;

describe('parseRulesFile', () => {
	test('parses keyword/tag rows, splitting keywords on commas', () => {
		assert.deepEqual(parseRulesFile(REAL_RULES_FILE), [
			{ keywords: ['whitney', 'crow'], tag: '#whitney-crow' },
			{ keywords: ['natasha'], tag: '#natasha' },
			{ keywords: ['papa'], tag: '#papa' },
			{ keywords: ['mama'], tag: '#Mama' },
		]);
	});

	test('ignores prose, frontmatter and the header/separator rows', () => {
		assert.equal(parseRulesFile(REAL_RULES_FILE).length, 4);
	});

	test('returns no rules when the table has no separator row', () => {
		assert.deepEqual(parseRulesFile('| a | b |\n| c | d |'), []);
	});

	test('returns no rules for an empty template with no data rows', () => {
		assert.deepEqual(parseRulesFile('| To scan for | To be tagged with |\n| --- | --- |\n'), []);
	});

	test('skips rows missing a keyword or a tag', () => {
		const rules = parseRulesFile('| k | t |\n| --- | --- |\n|  | #orphan |\n| lonely |  |\n| ok | #ok |');
		assert.deepEqual(rules, [{ keywords: ['ok'], tag: '#ok' }]);
	});
});

describe('normalizeTag', () => {
	test('strips a leading hash and surrounding space', () => {
		assert.equal(normalizeTag('  #Mama '), 'Mama');
		assert.equal(normalizeTag('quote'), 'quote');
	});
});

describe('normalizeFmTags', () => {
	test('accepts a YAML list', () => {
		assert.deepEqual(normalizeFmTags(['#a', 'b']), ['a', 'b']);
	});
	test('accepts a comma-separated string', () => {
		assert.deepEqual(normalizeFmTags('#a, b'), ['a', 'b']);
	});
	test('treats missing tags as empty', () => {
		assert.deepEqual(normalizeFmTags(undefined), []);
		assert.deepEqual(normalizeFmTags(null), []);
	});
});

describe('stripFrontmatter', () => {
	test('removes a leading YAML block but keeps the body', () => {
		assert.equal(stripFrontmatter('---\ntags: []\n---\nbody text\n'), 'body text\n');
	});
	test('leaves a note without frontmatter untouched', () => {
		assert.equal(stripFrontmatter('body text\n'), 'body text\n');
	});
	test('does not eat a horizontal rule further down the note', () => {
		assert.equal(stripFrontmatter('intro\n\n---\n\noutro\n'), 'intro\n\n---\n\noutro\n');
	});
});

describe('textMatches — whole-word mode', () => {
	test('matches case-insensitively when caseSensitive is off (issue #7)', () => {
		assert.equal(textMatches('I talked to Mama today', 'mama', 'word', false), true);
		assert.equal(textMatches('I talked to mama today', 'Mama', 'word', false), true);
		assert.equal(textMatches('MAMA', 'mama', 'word', false), true);
	});

	test('respects caseSensitive when it is on', () => {
		assert.equal(textMatches('I talked to Mama', 'mama', 'word', true), false);
		assert.equal(textMatches('I talked to mama', 'mama', 'word', true), true);
	});

	test('does not match a word that merely contains the keyword', () => {
		assert.equal(textMatches('grandmama came over', 'mama', 'word', false), false);
		assert.equal(textMatches('a cart', 'art', 'word', false), false);
	});

	test('matches through markdown emphasis and wikilinks', () => {
		assert.equal(textMatches('**mama**', 'mama', 'word', false), true);
		assert.equal(textMatches('[[mama]]', 'mama', 'word', false), true);
	});

	test('treats regex metacharacters in a keyword as literal text', () => {
		assert.equal(textMatches('the c++ code', 'c++', 'word', false), true);
		assert.equal(textMatches('the cxx code', 'c++', 'word', false), false);
		assert.equal(textMatches('a (draft) note', '(draft)', 'word', false), true);
	});

	// BUG 1 — \b is ASCII-only, so a keyword ending in an accented letter never matches.
	test('matches names ending in a non-ASCII letter', () => {
		assert.equal(textMatches('I saw Zoë today', 'Zoë', 'word', false), true);
		assert.equal(textMatches('call José', 'José', 'word', false), true);
		assert.equal(textMatches('André came', 'André', 'word', false), true);
		assert.equal(textMatches('Beyoncé sings', 'Beyoncé', 'word', false), true);
	});

	test('still matches names ending in an ASCII letter', () => {
		assert.equal(textMatches('ask Müller', 'Müller', 'word', false), true);
		assert.equal(textMatches("met O'Brien", "O'Brien", 'word', false), true);
		assert.equal(textMatches('Anna-Lena called', 'Anna-Lena', 'word', false), true);
	});

	test('does not match a non-ASCII keyword inside a longer word', () => {
		assert.equal(textMatches('Zoëtrope projector', 'Zoë', 'word', false), false);
		assert.equal(textMatches('preJosé', 'José', 'word', false), false);
	});

	// BUG 4 — a keyword or note with doubled spaces should still match.
	test('tolerates differing runs of whitespace between keyword words', () => {
		assert.equal(textMatches('assisted stretching helps', 'assisted  stretching', 'word', false), true);
		assert.equal(textMatches('assisted  stretching helps', 'assisted stretching', 'word', false), true);
		assert.equal(textMatches('assisted\nstretching', 'assisted stretching', 'word', false), true);
	});
});

describe('textMatches — substring mode', () => {
	test('matches inside a longer word', () => {
		assert.equal(textMatches('grandmama came over', 'mama', 'substring', false), true);
	});
	test('still honours case sensitivity', () => {
		assert.equal(textMatches('GRANDMAMA', 'mama', 'substring', true), false);
	});
});

describe('matchTags', () => {
	const rules: TagRule[] = parseRulesFile(REAL_RULES_FILE);

	test('returns the normalized tag for every matching rule', () => {
		const got = matchTags(rules, 'mama, papa and natasha', 'word', false);
		assert.deepEqual([...got].sort(), ['Mama', 'natasha', 'papa']);
	});

	test('a rule fires once even when several of its keywords match', () => {
		assert.deepEqual(matchTags(rules, 'whitney and crow', 'word', false), ['whitney-crow']);
	});

	test('returns nothing when no keyword appears', () => {
		assert.deepEqual(matchTags(rules, 'nothing relevant here', 'word', false), []);
	});

	test('returns nothing when there are no rules', () => {
		assert.deepEqual(matchTags([], 'mama', 'word', false), []);
	});
});

describe('isExcludedPath', () => {
	test('excludes notes inside an excluded folder', () => {
		assert.equal(isExcludedPath('media/photo.md', ['media', 'templates']), true);
		assert.equal(isExcludedPath('templates/daily.md', ['media', 'templates']), true);
	});

	test('excludes notes nested deeper inside an excluded folder', () => {
		assert.equal(isExcludedPath('media/2026/photo.md', ['media']), true);
	});

	test('does not exclude an unrelated note', () => {
		assert.equal(isExcludedPath('notes/mama.md', ['media', 'templates']), false);
	});

	// BUG 2 — startsWith() with no separator swallowed same-prefix names.
	test('does not exclude a note whose name merely starts with the folder name', () => {
		assert.equal(isExcludedPath('media-plan.md', ['media']), false);
		assert.equal(isExcludedPath('mediation-notes.md', ['media']), false);
	});

	test('does not exclude a sibling folder with the same prefix', () => {
		assert.equal(isExcludedPath('templates-archive/old.md', ['templates']), false);
	});

	test('ignores blank and slash-padded entries', () => {
		assert.equal(isExcludedPath('notes/a.md', ['', '   ']), false);
		assert.equal(isExcludedPath('media/a.md', ['/media/']), true);
	});
});

describe('excludedFolderFor', () => {
	test('names the folder that caused the exclusion', () => {
		assert.equal(excludedFolderFor('templates/daily.md', ['media', 'templates']), 'templates');
	});

	test('returns null when nothing excludes the path', () => {
		assert.equal(excludedFolderFor('notes/mama.md', ['media', 'templates']), null);
		assert.equal(excludedFolderFor('media-plan.md', ['media']), null);
	});
});

describe('describeOutcome — why did nothing get tagged? (issue #7)', () => {
	const describe_ = (o: TagOutcome) => describeOutcome(o);

	test('reports the tags it added', () => {
		assert.equal(describe_({ kind: 'added', tags: ['Mama', 'papa'] }), 'Added #Mama #papa');
	});

	test('points at the rules file when there are no rules', () => {
		assert.match(describe_({ kind: 'no-rules', rulesFile: '_bloob-auto-tagging.md' }), /no rules/i);
		assert.match(describe_({ kind: 'no-rules', rulesFile: '_bloob-auto-tagging.md' }), /_bloob-auto-tagging\.md/);
	});

	test('names the excluded folder rather than failing silently', () => {
		const msg = describe_({ kind: 'excluded', folder: 'templates' });
		assert.match(msg, /excluded/i);
		assert.match(msg, /templates/);
	});

	test('says plainly when no keyword matched', () => {
		assert.match(describe_({ kind: 'no-match' }), /no keyword/i);
	});

	test('distinguishes "already there" from "no match"', () => {
		const msg = describe_({ kind: 'already-tagged', tags: ['quote'] });
		assert.match(msg, /already/i);
		assert.match(msg, /#quote/);
	});

	test('explains a tag withheld by the removed-tag memory', () => {
		const msg = describe_({ kind: 'suppressed', tags: ['quote'] });
		assert.match(msg, /#quote/);
		assert.match(msg, /removed|memory/i);
	});
});
