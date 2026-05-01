# Bloob Haus Obsidian Plugin

A single plugin that consolidates the essentials for a smooth Obsidian notes workflow.

## Features (toggle each on/off in settings)

| Module | Default | What it does |
|--------|---------|-------------|
| **Frontmatter auto-fill** | ✅ On | Adds `date_created`, `date_updated`, `tags`, and `bloob_object` to new notes |
| **Image zoom** | ✅ On | Click any image to view fullscreen. Scroll to zoom, drag to pan |
| **Date keywords** | ⬜ Off | Type `TODAY`, `DATE`, `TIME` etc. to insert formatted dates |
| **Link encoder** | ⬜ Off | Paste a file path or URL → auto-formatted markdown link |

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
