# Feature Request — "Prepare this vault for Bloob Haus" (one-click vault setup)

**Status:** Requested (2026-07-20). Not yet built.
**Motivation:** onboarding a new author (first: Odalys) should be a button, not a checklist. Today a
fresh vault needs several files created by hand before it will build. This module does it in one click.

**Human spec this implements:** the "minimal starting checklist" in the webapp repo,
`docs/onboarding/prepare-your-vault.md`. Read that first — it explains *why* each item exists. This
doc is the *engineering* spec: what to create, and **exactly where the content comes from** so
development doesn't have to reinvent it.

---

## The feature

A new toggleable module — `modules/vault-setup.ts` — following the existing module pattern (one file
in `modules/`, a settings toggle, a command in `main.ts`). It exposes:

- **A command:** `Prepare this vault for Bloob Haus`
- **A settings button** (in the plugin settings tab): "Prepare this vault for Bloob Haus" with a short
  description.

When invoked, it scaffolds everything a vault needs to build into a Bloob Haus site, **idempotently**
(never overwrites existing files — see below).

---

## What it creates

| # | Thing | Location (vault-relative) | Source of content (see "Where content comes from") |
|---|---|---|---|
| 1 | `_bloob-settings.md` | vault root | vendored copy of `themes/_base/_bloob-settings.template.md` |
| 2 | `_bloob-shapes.md` *(optional — offer, don't force)* | vault root | vendored copy of `themes/_base/_bloob-shapes.template.md` |
| 3 | `media/` folder | vault root | created empty |
| 4 | Obsidian attachment setting → `media/` | vault config | set programmatically (see below) |
| 5 | Starter `index.md` *(optional — offer)* | vault root | small built-in stub (a heading + one line) |

### 4 — set the attachment folder programmatically
So pasted images auto-save into `media/` (the recommended convention; avoids the basename-collision
sharp edge documented in `prepare-your-vault.md` §4). Obsidian exposes this via the vault config:

```ts
// @ts-expect-error — setConfig/getConfig are on the Vault but not in the public typings
this.app.vault.setConfig("attachmentFolderPath", "media");
```

Read the current value first with `getConfig("attachmentFolderPath")`; only change it if the user
hasn't already set a custom one, and tell them you changed it.

---

## Where content comes from (the important part — this is the single-source-of-truth question)

The canonical templates already exist in the **webapp repo**, and they are the source of truth:

- `bloob-haus-webapp/themes/_base/_bloob-settings.template.md`
- `bloob-haus-webapp/themes/_base/_bloob-shapes.template.md`

The plugin **cannot read the webapp repo at runtime** (it runs inside Obsidian on the user's machine,
with no access to the builder repo). So the templates must be **vendored into the plugin** — copied in
and bundled — with a clear sync obligation back to the webapp originals.

**Recommended approach — vendor + build-time embed:**

1. Keep vendored copies in the plugin at `src/templates/_bloob-settings.template.md` and
   `src/templates/_bloob-shapes.template.md`.
2. Embed them into `main.js` at build time (esbuild) so the shipped plugin is self-contained — e.g. an
   esbuild loader that imports the `.md` as a string, or a small prebuild step that writes them into a
   `generated-templates.ts`. (The plugin already bundles everything into one `main.js`; templates
   should ride along the same way, not be fetched.)
3. **Record the sync obligation.** Add a line to the plugin `CLAUDE.md` under "Conventions this plugin
   writes": *"The vault-setup templates are vendored from `bloob-haus-webapp/themes/_base/*.template.md`
   — when those change, re-vendor here."* Consider a tiny CI check or a `npm run sync-templates` script
   that copies from a sibling webapp checkout if present, so drift is caught.

**Rejected:** fetching the templates from GitHub at runtime. It adds a network dependency, can fail
offline (Obsidian is used offline), and makes the plugin non-deterministic. Vendoring keeps the plugin
self-contained, matching its existing "everything in one `main.js`" design.

> **SSOT note:** the webapp `themes/_base/` templates remain authoritative. The plugin holds a *vendored
> copy*, not a second source. The onboarding doc `prepare-your-vault.md` should stay the human-facing
> explanation; neither the plugin nor its templates should restate the settings reference (that lives in
> `docs/architecture/settings-registry.md`).

---

## Idempotency & safety rules

- **Never overwrite.** If `_bloob-settings.md` already exists, do **not** replace it. Report "already
  present — skipped." Same for `_bloob-shapes.md` and `index.md`.
- **Report what happened.** After running, show a notice listing exactly what was created vs. skipped
  (Obsidian `new Notice(...)`), so the user knows the state of their vault.
- **Personalize what's cheap.** After creating `_bloob-settings.md`, optionally offer to fill in
  `name:` / `author:` from what the user types, but don't block on it — the template is editable in
  Obsidian's Properties view immediately.
- **Don't touch git.** The plugin creates files; committing/pushing is the user's job (and, for a
  fork-based deploy, the thing that triggers their build).

---

## Alignment with existing plugin conventions

- Frontmatter keys the templates use (`bloob-shape`, `default_shape`, `date_created`, `date_updated`)
  must match what the **Frontmatter auto-fill** module already writes and what the webapp builder reads
  (see plugin `CLAUDE.md` → "Conventions this plugin writes"). If the auto-fill module and this module
  ever disagree on a key, that's a bug — they share the same convention.
- Follows the module/toggle/command pattern already used by `copy-link.ts`, `frontmatter.ts`, etc.
- Ships via BRAT like everything else — no special distribution.

---

## Acceptance (definition of done)

A brand-new, empty Obsidian vault, after clicking **Prepare this vault for Bloob Haus**:

1. Has `_bloob-settings.md` at its root, matching the current webapp `_base` template.
2. Has a `media/` folder, and pasting an image saves it there.
3. Builds into a working site via `node scripts/dev-local.js --site=<name> --content=<this vault>`
   with no further hand-editing (beyond the user setting their site name/theme in `_bloob-settings.md`).
4. Running the command a second time creates nothing new and reports everything as "already present."

---

## Related

- Human onboarding path: `bloob-haus-webapp/docs/onboarding/prepare-your-vault.md`
- Settings reference (do not duplicate): `bloob-haus-webapp/docs/architecture/settings-registry.md`
- Templates (source of truth): `bloob-haus-webapp/themes/_base/_bloob-settings.template.md`,
  `…/_bloob-shapes.template.md`
