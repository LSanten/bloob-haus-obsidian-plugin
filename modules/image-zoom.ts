export class ImageZoomModule {
	private overlay: HTMLElement | null = null;
	private zoomedImage: HTMLImageElement | null = null;
	private currentScale = 1;
	private isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private lastMouseX = 0;
	private lastMouseY = 0;
	private dragDistance = 0;
	private justFinishedDrag = false;
	private readonly minDragDistance = 5;
	private readonly zoomFactor = 0.1;

	// Bound handlers kept as instance properties for removeEventListener
	private onClick = this.handleClick.bind(this);
	private onKeyDown = this.handleKeyDown.bind(this);
	private onWheel = this.handleWheel.bind(this);
	private onMouseDown = this.handleMouseDown.bind(this);
	private onMouseMove = this.handleMouseMove.bind(this);
	private onMouseUp = this.handleMouseUp.bind(this);

	load() {
		document.addEventListener('click', this.onClick);
	}

	unload() {
		document.removeEventListener('click', this.onClick);
		if (this.overlay) this.closeOverlay();
	}

	private handleClick(evt: MouseEvent) {
		const target = evt.target as HTMLElement;

		if (this.overlay) {
			if ((target === this.overlay || target === this.zoomedImage) && !this.justFinishedDrag) {
				this.closeOverlay();
				evt.preventDefault();
				evt.stopPropagation();
			}
			this.justFinishedDrag = false;
			return;
		}

		if (target.tagName === 'IMG' && !target.classList.contains('emoji')) {
			this.openOverlay(target as HTMLImageElement);
			evt.preventDefault();
			evt.stopPropagation();
		}
	}

	private handleKeyDown(evt: KeyboardEvent) {
		if (evt.key === 'Escape') this.closeOverlay();
	}

	private handleWheel(evt: WheelEvent) {
		evt.preventDefault();
		if (!this.zoomedImage) return;

		const rect = this.zoomedImage.getBoundingClientRect();
		const originX = (evt.clientX - rect.left) / rect.width;
		const originY = (evt.clientY - rect.top) / rect.height;
		const delta = -Math.sign(evt.deltaY) * this.zoomFactor;
		this.currentScale = Math.max(0.1, this.currentScale + delta * this.currentScale);

		this.zoomedImage.style.transformOrigin = `${originX * 100}% ${originY * 100}%`;
		this.zoomedImage.style.transform = `scale(${this.currentScale})`;
	}

	private handleMouseDown(evt: MouseEvent) {
		if (!this.zoomedImage || this.currentScale <= 1) return;
		this.isDragging = true;
		this.lastMouseX = evt.clientX;
		this.lastMouseY = evt.clientY;
		this.dragStartX = evt.clientX;
		this.dragStartY = evt.clientY;
		this.dragDistance = 0;
		this.justFinishedDrag = false;
		this.zoomedImage.style.cursor = 'grabbing';
		evt.preventDefault();
	}

	private handleMouseMove(evt: MouseEvent) {
		if (!this.isDragging || !this.zoomedImage) return;

		const dx = evt.clientX - this.lastMouseX;
		const dy = evt.clientY - this.lastMouseY;
		const totalX = evt.clientX - this.dragStartX;
		const totalY = evt.clientY - this.dragStartY;
		this.dragDistance = Math.sqrt(totalX * totalX + totalY * totalY);

		const tx = parseInt(this.zoomedImage.dataset.translateX || '0') + dx;
		const ty = parseInt(this.zoomedImage.dataset.translateY || '0') + dy;
		this.zoomedImage.dataset.translateX = String(tx);
		this.zoomedImage.dataset.translateY = String(ty);
		this.zoomedImage.style.transform = `translate(${tx}px, ${ty}px) scale(${this.currentScale})`;

		this.lastMouseX = evt.clientX;
		this.lastMouseY = evt.clientY;
	}

	private handleMouseUp() {
		this.justFinishedDrag = this.dragDistance > this.minDragDistance;
		this.isDragging = false;
		if (this.zoomedImage) this.zoomedImage.style.cursor = 'zoom-in';
	}

	private openOverlay(img: HTMLImageElement) {
		this.overlay = document.createElement('div');
		this.overlay.className = 'bloob-image-zoom-overlay';

		this.zoomedImage = document.createElement('img');
		this.zoomedImage.src = img.src;
		this.zoomedImage.className = 'bloob-image-zoom-image';
		this.zoomedImage.dataset.translateX = '0';
		this.zoomedImage.dataset.translateY = '0';

		this.overlay.appendChild(this.zoomedImage);
		document.body.appendChild(this.overlay);

		this.currentScale = 1;
		this.isDragging = false;

		document.addEventListener('keydown', this.onKeyDown);
		this.overlay.addEventListener('wheel', this.onWheel, { passive: false });
		this.zoomedImage.addEventListener('mousedown', this.onMouseDown);
		document.addEventListener('mousemove', this.onMouseMove);
		document.addEventListener('mouseup', this.onMouseUp);
	}

	private closeOverlay() {
		if (!this.overlay) return;
		document.removeEventListener('keydown', this.onKeyDown);
		this.overlay.removeEventListener('wheel', this.onWheel);
		this.zoomedImage?.removeEventListener('mousedown', this.onMouseDown);
		document.removeEventListener('mousemove', this.onMouseMove);
		document.removeEventListener('mouseup', this.onMouseUp);
		document.body.removeChild(this.overlay);
		this.overlay = null;
		this.zoomedImage = null;
		this.currentScale = 1;
		this.isDragging = false;
	}
}
