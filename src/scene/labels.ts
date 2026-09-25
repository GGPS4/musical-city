import * as THREE from 'three';

export type LabelKind = 'district' | 'mixed' | 'landmark' | 'venue';

interface Label {
  el: HTMLElement;
  pos: THREE.Vector3;
  kind: LabelKind;
  /** Visible only when the camera is closer than this. */
  maxDistance: number;
  minDistance: number;
  id: string;
}

/** Lightweight HTML labels projected from world space each frame. */
export class LabelLayer {
  private labels: Label[] = [];
  private v = new THREE.Vector3();
  private dimmed = false;

  constructor(private root: HTMLElement, private onClick: (kind: LabelKind, id: string) => void) {}

  clear(): void {
    this.labels.forEach((l) => l.el.remove());
    this.labels = [];
  }

  add(kind: LabelKind, id: string, text: string, sub: string | null, pos: THREE.Vector3, range: [number, number]): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `map-label map-label--${kind}`;
    el.tabIndex = -1;
    el.innerHTML = `<span class="map-label__title"></span>${sub ? '<span class="map-label__sub"></span>' : ''}`;
    (el.querySelector('.map-label__title') as HTMLElement).textContent = text;
    if (sub) (el.querySelector('.map-label__sub') as HTMLElement).textContent = sub;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClick(kind, id);
    });
    this.root.appendChild(el);
    this.labels.push({ el, pos: pos.clone(), kind, id, minDistance: range[0], maxDistance: range[1] });
  }

  setHighlighted(kind: LabelKind | null, id: string | null): void {
    for (const l of this.labels) l.el.classList.toggle('is-active', l.kind === kind && l.id === id);
  }

  setDimmed(d: boolean): void {
    this.dimmed = d;
    this.root.classList.toggle('is-dimmed', d);
  }

  setSub(kind: LabelKind, id: string, sub: string): void {
    const l = this.labels.find((x) => x.kind === kind && x.id === id);
    const el = l?.el.querySelector('.map-label__sub');
    if (el) el.textContent = sub;
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, width: number, height: number, walking = false): void {
    const camDist = camera.position.distanceTo(target);
    const walkRange: Record<LabelKind, number> = { district: 150, mixed: 0, landmark: 70, venue: 45 };
    for (const l of this.labels) {
      const inRange = walking
        ? camera.position.distanceTo(l.pos) < walkRange[l.kind] && !this.dimmed
        : camDist >= l.minDistance && camDist <= l.maxDistance && !this.dimmed;
      this.v.copy(l.pos).project(camera);
      const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      const show = inRange && onScreen;
      if (!show) {
        if (l.el.style.opacity !== '0') {
          l.el.style.opacity = '0';
          l.el.style.pointerEvents = 'none';
        }
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      l.el.style.opacity = '1';
      l.el.style.pointerEvents = 'auto';
      l.el.style.zIndex = String(Math.round((1 - this.v.z) * 10000));
    }
  }
}
