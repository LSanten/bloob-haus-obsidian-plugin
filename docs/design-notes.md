# Design notes & open considerations

A living record of deliberate trade-offs, known limitations, and ideas worth
revisiting. **Update this file as part of every release** (see the release
checklist in [`../CLAUDE.md`](../CLAUDE.md)) — when a release introduces a new
trade-off or limitation, add it here; when an open consideration gets resolved,
move it to "Resolved".

The point: future-me (and future Claude) should be able to read this before
touching a module and know what was decided on purpose vs. what's still open.

---

## Open considerations

### Auto tagging — rejected-tag memory (`modules/tag-matching.ts`)
- **Per-note, not per-folder.** Rejections are keyed by vault-relative file
  path (`tagMemory.rejected[path]`). Issue #1 mentioned "that particular note in
  that particular folder" — moving the note to a new folder carries its memory
  with it (we migrate the key on `rename`). There is currently **no folder-level
  rule** that would reject a tag across all notes in a folder. Revisit if users
  want "never tag anything in `/journal/` with `#work`".
- **Only catches tags added from v1.1.0 onward.** We only know a tag was
  auto-added if *we* recorded it in `tagMemory.autoAdded` at write time. Tags
  auto-added by older versions have no record, so removing one of those won't be
  remembered as a rejection. Acceptable; works going forward.
- **Inline body tags count as "present".** Reconciliation uses `getAllTags`,
  which includes `#tags` in the note body, not just frontmatter. So if a tag
  exists inline, removing it from frontmatter won't register as a rejection.
  Intentional (the tag is still on the note) but worth knowing.
- **Memory has no UI.** There's no way to view or clear the rejected/auto-added
  memory from settings. If it ever gets confusing, consider a "Clear tag memory"
  button. Deleted notes are pruned automatically (`delete` handler).

### Auto tagging — whole-word matching is Unicode-aware (`modules/tag-rules.ts`)
- Whole-word mode uses `(?<![\p{L}\p{N}_]) … (?![\p{L}\p{N}_])` with the `u` flag,
  **not** `\b`. `\b` is ASCII-only, so it silently refused to match any keyword
  that begins or ends outside `[A-Za-z0-9_]`: accented names (`Zoë`, `José`,
  `André`, `Beyoncé`) and punctuated keywords (`c++`) never matched, while
  `Müller` did — because it happens to end in `r`. For a feature whose main use
  is tagging people's names, that was the wrong default.
- Requires lookbehind + Unicode property escapes. Both are fine on every
  Electron that runs Obsidian ≥ 1.4.0.
- Keywords also match across differing runs of whitespace (`assisted  stretching`
  matches `assisted stretching`, and across a line break). Deliberate: the rules
  file is a markdown table people align by hand.

### Auto tagging — folder exclusion compares whole path segments
- `excludedFolders` used a bare `path.startsWith(folder)`, so excluding `media`
  also silently skipped root notes like `media-plan.md` and sibling folders like
  `media-archive/`. Now matches on `path === folder || path.startsWith(folder + "/")`.
- **This was silent** — an excluded note produced no output at all. Hence the
  outcome reporting below.

### Auto tagging — every outcome is now reportable (`TagOutcome`)
- Auto tagging used to do everything silently: live tagging wrote tags with no
  notice, and "nothing happened" was indistinguishable from "the module never
  ran". That is what issue #7 actually was — live tagging was simply off in that
  vault, and nothing said so.
- `evaluate()` returns a `TagOutcome` (`added` / `no-rules` / `excluded` /
  `no-match` / `already-tagged` / `suppressed`) and `describeOutcome()` turns it
  into a sentence. Live tagging announces only when it *acts*; the
  "Scan current note" command reports every outcome.
- The "Add tags live while editing" setting states plainly, in its description,
  that typing will NOT tag when it is off.

### Testing — pure logic is split out so it can be unit-tested
- `tag-rules.ts` and `bloob-url-core.ts` hold the pure logic and import nothing
  from `obsidian`; `tag-matching.ts` and `bloob-url.ts` are the Obsidian-facing
  shells. The split exists because `obsidian` has no runtime module outside the
  app, so anything importing it cannot be run by `node --test`.
- `npm test` runs Node's built-in test runner over `*.test.ts` using Node's
  native TypeScript type-stripping — **no test framework, no new runtime
  dependency, and nothing added to the shipped bundle** (esbuild only follows
  imports from `main.ts`; verify with `grep -c "node:test" main.js` → 0).
- Requires Node 22.6+ to run the tests. It does not affect what Obsidian loads.
- **Not covered:** anything touching the Obsidian API — event wiring, the
  rejected-tag memory reconciliation, `processFrontMatter` writes. Covering
  those needs a faked Obsidian API; deliberately deferred.

### Frontmatter — custom fields (`modules/frontmatter.ts`)
- **Comma values become YAML lists.** A custom-field value containing a comma is
  split into a list (`a, b` → `[a, b]`); a single value stays a scalar string.
  This is a convenience for list fields like `aliases`. The cost: a value that
  legitimately contains a comma can't be stored as one scalar string. If that
  becomes a problem, options are (a) an explicit list syntax, or (b) a per-field
  "treat as list" toggle.
- **No type coercion.** Values are written as strings (or string lists) — never
  numbers or booleans. `count: 3` stores the string `"3"`, not the number `3`.
  Add coercion only if a real need appears.
- **Set-if-absent.** Custom fields are only written when the key isn't already
  present, so they never clobber existing frontmatter. New notes only — existing
  notes are not back-filled.

### Settings UI — staying on `PluginSettingTab` for now (issue #6)
- Obsidian's declarative settings API (`getSettingDefinitions()`) requires
  **Obsidian 1.13.0+**. Adopting it would force `minAppVersion` from `1.4.0` to
  `1.13.0` and drop every user below that. **Deliberately declined for 1.3.0** —
  `PluginSettingTab` is not deprecated and still fully supported, so there is no
  forcing function.
- Two things to know before revisiting: the API's `control.key` reads
  `plugin.settings[key]` and dot-notation for nested paths is undocumented, while
  this plugin's settings are deeply nested (`settings.tagMatching.matchMode`).
  Migrating therefore needs either a flattened settings model — a data migration
  over every user's existing `data.json` — or a `render` callback for nearly
  every row, which negates most of the benefit.
- Revisit when Leon's own Obsidian is past 1.13.0 *and* dropping older users is
  acceptable. Spike auto tagging's section first to find out whether `key` takes
  a dot path; that single answer decides how big the job is.

### Frontmatter — `bloob-shape` toggle
- Default **on** to preserve existing behavior. Off keeps YAML minimal for users
  who don't publish to a Bloob Haus site. No known follow-ups.

### Copy link — slug rules are duplicated, not shared (`modules/bloob-url.ts`)
- The canonical URL contract lives in the webapp
  (`bloob-haus-webapp/docs/architecture/urls-and-ids.md`), and its spec says
  *"Do not reimplement — reuse it."* We reimplement anyway: the plugin ships to
  Obsidian via BRAT and cannot import from the webapp repo without publishing a
  shared npm package, which is not worth it for ~20 lines.
- **The mitigation is that the duplication is exact and labelled.**
  `slugifyLower` / `slugifyPreserve` are character-for-character ports of
  `slug-strategy.js`, and `bloob-url.ts` says so at the top.
- **Follow-up if this ever drifts:** publish `@bloob-haus/url` as a tiny package
  consumed by both repos. Until then, any change to the webapp's slug functions
  must be mirrored here in the same PR.
- Verified in sync on 2026-07-28 by diffing plugin output against the webapp's
  `buildFileIndex` for every publishable note in marbles, buffbaby and melt
  (556 pages, 0 mismatches).
- The pure half now lives in `bloob-url-core.ts` and is covered by
  `bloob-url-core.test.ts`, including issue #5's exact case
  (`Resources/VIDEO-assisted-stetching.md` under melt's `case: lower` →
  `https://melt.bloob.haus/resources/video-assisted-stetching/`). Those tests
  passed the moment they were written against unmodified 1.2.0 logic, which is
  what confirmed #5 was already fixed rather than still open.

### Copy link — vault settings are read live, not cached
- `readBloobUrlSettings()` hits `metadataCache` on every copy. That's cheap (the
  frontmatter is already parsed) and means edits to `_bloob-settings.md` take
  effect immediately, with no reload. Revisit only if profiling says otherwise.

---

## Resolved
<!-- Move items here once shipped & no longer "open". Keep the why. -->
- _(nothing yet)_

---

## Release-to-consideration log
<!-- One line per release: what design notes it touched. -->
- **1.1.0** — Added all considerations above (issues #1–#4 shipped).
- **1.2.0** — Copy link now implements the webapp's URL contract by reading the
  vault's `_bloob-settings.md` → `url:` block (issue #5). Added two copy-link
  considerations: duplicated slug rules, and live (uncached) settings reads.
- **1.3.0** — Auto tagging: Unicode-aware whole-word matching, segment-safe
  folder exclusion, whitespace-tolerant keywords, and `TagOutcome` reporting so
  the feature stops failing silently (issue #7). Added a `node --test` suite over
  newly-extracted pure modules (`tag-rules.ts`, `bloob-url-core.ts`). Added the
  four testing/matching considerations above and the settings-API note below.
