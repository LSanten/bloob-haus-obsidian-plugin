# Bloob Haus Obsidian Plugin

A single plugin that consolidates the essentials for a smooth Obsidian notes workflow.

## Features (toggle each on/off in settings)

| Module | Default | What it does |
|--------|---------|-------------|
| **Frontmatter auto-fill** | ✅ On | Adds `bloob-shape`, `date_created`, `date_updated`, and `tags` to new notes. `date_updated` is only logged on days after creation, and only when a significant change is made. |
| **Image zoom** | ✅ On | Click any image to view fullscreen. Scroll to zoom, drag to pan |
| **Copy link** | ✅ On | Ribbon icon + command to copy the public Bloob Haus URL of the active note |
| **Date keywords** | ⬜ Off | Type `TODAY`, `DATE`, `TIME` etc. to insert formatted dates |
| **Link encoder** | ⬜ Off | Paste a file path or URL → auto-formatted markdown link |
| **Tag matching** | ⬜ Off | Add frontmatter tags from keyword rules — live while you type, or via vault-wide scan with preview |

## Install via BRAT (recommended for early access)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) from the Obsidian Community Plugins store
2. Open BRAT settings → **Add Beta Plugin**
3. Paste: `LSanten/bloob-haus-obsidian-plugin`
4. Enable the plugin in Obsidian settings

## Development

```bash
npm install
npm run dev     # watch mode — rebuilds main.js on save
npm run build   # production build
```

Then copy (or symlink) the plugin folder to your vault's `.obsidian/plugins/bloob-haus/`.

## Feedback & bugs

Use the **Open feedback form** button in the plugin settings, or [open an issue directly](https://github.com/LSanten/bloob-haus-obsidian-plugin/issues/new/choose).
