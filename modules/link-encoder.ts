import { App, Notice, EventRef, Plugin } from 'obsidian';

export class LinkEncoderModule {
	private eventRefs: EventRef[] = [];
	private app: App;

	constructor(private plugin: Plugin) {
		this.app = plugin.app;
	}

	load() {
		const onPaste = this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: any) => {
			const text = evt.clipboardData?.getData('text/plain') ?? '';
			if (!this.isFilePath(text) && !this.isWebUrl(text)) return;

			const cursor = editor.getCursor();
			const lineSlice = editor.getLine(cursor.line).substring(0, cursor.ch);
			if (/\[[^\]]*\]\([^)]*$/.test(lineSlice)) return; // inside existing link

			evt.preventDefault();
			editor.replaceSelection(this.formatLink(text));
		});

		this.eventRefs.push(onPaste as EventRef);

		this.plugin.addCommand({
			id: 'bloob-update-links',
			name: 'Bloob Haus: Update file/folder links in current note',
			editorCallback: (editor: any) => {
				const original = editor.getValue();
				const updated = this.processAllLinks(original);
				if (original !== updated) {
					editor.setValue(updated);
					new Notice('Links updated.');
				} else {
					new Notice('No links needed updating.');
				}
			},
		});
	}

	unload() {
		for (const ref of this.eventRefs) {
			try { this.app.workspace.offref(ref); } catch {}
		}
		this.eventRefs = [];
	}

	private processAllLinks(content: string): string {
		const pattern =
			/(\[([^\]]+?)\]\(([^)]+?)\))|(\b(?:file:\/\/\/[^\[\]()\s<>"]+|[a-zA-Z]:[\\\/][^\[\]()\s<>"]+|https?:\/\/[^\[\]()\s<>"]+|www\.[^\[\]()\s<>"]+)\b)/gi;

		return content.replace(pattern, (match, mdFull, mdText, mdUrl, rawPath) => {
			if (mdFull) {
				if (this.isFilePath(mdUrl)) {
					return `[${this.displayName(mdUrl)}](${this.encodeUrl(mdUrl)})`;
				}
				if (this.isWebUrl(mdUrl) && !mdText.includes('🌐')) {
					return `[${mdText.trim()} 🌐](${mdUrl})`;
				}
				return match;
			}
			if (rawPath) return this.formatLink(rawPath);
			return match;
		});
	}

	private formatLink(path: string): string {
		if (this.isWebUrl(path)) {
			let url = path.trim();
			if (url.toLowerCase().startsWith('www.')) url = 'https://' + url;
			let name = 'Web Link 🌐';
			try { name = `${new URL(url).hostname.replace('www.', '')} 🌐`; } catch {}
			return `[${name}](${url})`;
		}

		let clean = path.trim();
		if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
		return `[${this.displayName(clean)}](${this.encodeUrl(clean)})`;
	}

	private isWebUrl(text: string): boolean {
		return /^(https?:\/\/|www\.)/i.test(text.trim());
	}

	private isFilePath(text: string): boolean {
		const clean = text.trim().replace(/^"|"$/g, '');
		return /^[a-zA-Z]:[\\\/]/.test(clean) || /^\\\\/.test(clean) || /^file:\/\//.test(clean);
	}

	private isFile(decoded: string): boolean {
		const clean = decoded.trim().replace(/[\\\/]+$/, '');
		const seg = clean.match(/([^\\\/]+)$/)?.[1] ?? '';
		const knownExts = ['.pdf','.doc','.docx','.txt','.xls','.xlsx','.csv','.ppt','.pptx',
			'.jpg','.jpeg','.png','.gif','.svg','.mp4','.mov','.mp3','.wav','.zip','.md',
			'.html','.css','.js','.ts','.py','.json','.yaml','.yml'];
		if (knownExts.some(ext => clean.toLowerCase().endsWith(ext))) return true;
		const dot = seg.lastIndexOf('.');
		if (dot <= 0) return false;
		const ext = seg.substring(dot + 1);
		return ext.length >= 1 && ext.length <= 10 && /^[a-zA-Z0-9]+$/.test(ext) && !/^\d{5,}$/.test(ext);
	}

	private displayName(path: string): string {
		let p = path.trim();
		if (p.startsWith('file:///')) p = p.substring(8);
		const decoded = decodeURIComponent(p);
		const seg = decoded.match(/([^\\\/]+)[\\\/]?$/)?.[1] ?? 'Link';
		const icon = this.isFile(decoded) ? '📄' : '📁';
		return `${seg.trim()} ${icon}`;
	}

	private encodeUrl(url: string): string {
		if (this.isWebUrl(url)) return url;
		let fileUrl = url;
		if (!fileUrl.startsWith('file://')) fileUrl = `file:///${fileUrl.replace(/\\/g, '/')}`;
		const m = fileUrl.match(/^(file:\/\/\/?)(.*)/);
		if (!m) return fileUrl;
		const decoded = decodeURIComponent(m[2]);
		return m[1] + decoded.split('/').map(encodeURIComponent).join('/');
	}
}
