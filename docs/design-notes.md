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
