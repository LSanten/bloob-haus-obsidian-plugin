# Bloob Haus Obsidian Plugin — Development Guide

Read automatically by Claude Code at session start.

## What this is
A single Obsidian plugin bundling notes-workflow tools (frontmatter auto-fill,
image zoom, copy-link, date keywords, link encoder, tag matching). Each module
lives in `modules/` and is toggled in plugin settings. Built with esbuild
(`main.ts` → `main.js`). Distributed to early users via **BRAT**.

## Build
```bash
npm run dev     # watch mode, rebuilds main.js on save
npm run build   # type-check + production build (tsc -noEmit && esbuild)
```
`main.js` is **gitignored** — it is never committed. It is shipped only as a
GitHub **release asset** (see below).

## Releasing — THE VERSIONING CONTRACT (do not break this)

Obsidian and BRAT match the GitHub **release tag** to the `version` in
`manifest.json`. The rules:

1. **The release tag MUST equal `manifest.json` `version` exactly, with NO `v`
   prefix.** Correct: `1.0.5`. Wrong: `v1.0.5`. (Tags `v1.0.0`–`v1.0.3` were a
   historical mistake, since corrected.)
2. **Never reuse or overwrite a published version.** Each release is a new,
   higher version. If a version is already released, bump — don't replace its
   assets.
3. **Keep these three in sync on every bump:**
   - `manifest.json` `version`
   - `package.json` `version`
   - `versions.json` — add `"<new-version>": "<minAppVersion>"` (currently `1.4.0`)
4. **Every release attaches exactly these assets:** `main.js`, `manifest.json`,
   `styles.css` (built fresh — verify `main.js` contains your change).

### Release checklist
```bash
# 1. Bump version in manifest.json, package.json, and add a versions.json row
# 2. Build and verify
npm run build
grep -c "<something from your change>" main.js   # sanity-check the bundle
# 3. Update docs/design-notes.md — record any new trade-off/limitation this
#    release introduces, move resolved considerations, add a line to the
#    "Release-to-consideration log". (See "Design notes" section below.)
# 4. Commit the version bump and push
git add manifest.json package.json versions.json docs/design-notes.md
git commit -m "chore(release): bump to X.Y.Z"
git push origin main
# 5. Cut the release — tag == version, NO v prefix
gh release create X.Y.Z main.js manifest.json styles.css \
  --title "X.Y.Z" --notes "..." --target main
```

## Design notes — read before touching a module

`docs/design-notes.md` is the living record of deliberate trade-offs, known
limitations, and ideas worth revisiting (e.g. why custom-field values split on
commas, why rejected-tag memory is per-note not per-folder). **Read it before
changing a module** so you don't "fix" something that was decided on purpose,
and **update it on every release** (step 3 of the release checklist above).

## Conventions this plugin writes (keep aligned with the webapp builder)
- `bloob-shape`, `date_created` (plain `YYYY-MM-DD`), `date_updated` (list),
  `tags` on new notes.
- `date_updated`: new significant-edit dates are **prepended** (newest first).
  The webapp picks the latest date by value, so ordering is for readability only.
