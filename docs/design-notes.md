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

---

## Resolved
<!-- Move items here once shipped & no longer "open". Keep the why. -->
- _(nothing yet)_

---

## Release-to-consideration log
<!-- One line per release: what design notes it touched. -->
- **1.1.0** — Added all considerations above (issues #1–#4 shipped).
