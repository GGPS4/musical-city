import * as THREE from 'three';
import { GENRES } from '../data/genres.js';
import { store } from '../core/store.js';
import { ACCESSORIES, HAIRS, OUTFITS, SKINS, buildAvatar, lookForGenre, poseAvatar, type Look } from '../scene/avatar.js';
import type { GenreId } from '../types.js';
import { $, esc } from '../ui/dom.js';

/**
 * "Your look": the avatar other people see in a room (and you, busking).
 * It starts from your top genre; every part can be changed. Saved in this browser.
 */

const KEY = 'musical-city:look';

const LABEL: Record<string, string> = {
  mohawk: 'Mohawk', long: 'Long', afro: 'Afro', slick: 'Slicked back', cap: 'Cap', beanie: 'Beanie', dreads: 'Dreads', bun: 'Bun', spiky: 'Spiky', bald: 'Shaved',
  leather: 'Leather jacket', suit: 'Suit', hoodie: 'Hoodie', tee: 'Band tee', tiedye: 'Tie-dye', denim: 'Denim', sparkle: 'Sequins', cardigan: 'Cardigan',
  none: 'Nothing', shades: 'Shades', headphones: 'Headphones', hat: 'Hat', chain: 'Chain',
};

export function createLookController() {
  const panel = $('#look');
  let custom: Look | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) custom = JSON.parse(raw) as Look;
  } catch {
    /* storage unavailable */
  }
  let preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; raf: number; root: THREE.Group | null } | null = null;
  const listeners = new Set<() => void>();

  const topGenre = (): GenreId | undefined => {
    const d = store.get().plan?.dna.find((x) => x.genre !== 'other');
    return d && d.genre !== 'other' ? d.genre : undefined;
  };
  const current = (): Look => custom ?? lookForGenre(topGenre(), 1);

  function save() {
    try {
      if (custom) localStorage.setItem(KEY, JSON.stringify(custom));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  }

  function set<K extends keyof Look>(k: K, v: Look[K]) {
    custom = { ...current(), [k]: v };
    save();
    render();
  }

  function chips<T extends string>(key: keyof Look, list: readonly T[]) {
    const cur = current()[key];
    return `<div class="perform__chips">${list.map((x) => `<button type="button" class="chip-btn" data-look="${key}" data-value="${x}" aria-pressed="${x === cur}">${esc(LABEL[x] ?? x)}</button>`).join('')}</div>`;
  }

  function render() {
    const l = current();
    const g = topGenre();
    panel.innerHTML = `<div class="tour__head"><span class="tour__badge">Your look</span><button type="button" class="icon-btn" data-look-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button></div>
      <div class="look">
        <canvas id="look-preview" width="220" height="300" aria-label="Preview of your avatar"></canvas>
        <div class="look__opts">
          <p class="perform__lede">${custom ? 'Your own look.' : `Styled by your top genre${g ? `, ${esc(GENRES[g].name)}` : ''}.`} Friends in your room see you like this.</p>
          <h5>Hair</h5>${chips('hair', HAIRS)}
          <h5>Outfit</h5>${chips('outfit', OUTFITS)}
          <h5>Extra</h5>${chips('accessory', ACCESSORIES)}
          <h5>Colours</h5>
          <div class="look__colors">
            <label>Hair <input type="color" data-look-color="hairColor" value="${esc(l.hairColor)}"></label>
            <label>Top <input type="color" data-look-color="top" value="${esc(l.top)}"></label>
            <label>Bottom <input type="color" data-look-color="bottom" value="${esc(l.bottom)}"></label>
          </div>
          <div class="look__skins">${SKINS.map((c) => `<button type="button" class="look__skin" data-look="skin" data-value="${c}" style="background:${c}" aria-pressed="${c === l.skin}" aria-label="Skin tone"></button>`).join('')}</div>
          <div class="tour__actions"><button type="button" class="btn btn--ghost btn--xs" data-look-reset>Reset to my genre</button></div>
        </div>
      </div>`;
    panel.querySelectorAll<HTMLInputElement>('[data-look-color]').forEach((input) =>
      input.addEventListener('change', () => set(input.dataset.lookColor as 'hairColor' | 'top' | 'bottom', input.value)),
    );
    startPreview();
  }

  function startPreview() {
    const canvas = panel.querySelector<HTMLCanvasElement>('#look-preview');
    if (!canvas) return;
    stopPreview();
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2030, 1.6));
      const key = new THREE.DirectionalLight(0xffe2c0, 2.2);
      key.position.set(2, 3, 3);
      scene.add(key);
      const camera = new THREE.PerspectiveCamera(30, 220 / 300, 0.1, 20);
      camera.position.set(0, 1.25, 4.4);
      camera.lookAt(0, 0.95, 0);
      const avatar = buildAvatar(current());
      scene.add(avatar.root);
      const t0 = performance.now();
      const loop = () => {
        const t = (performance.now() - t0) / 1000;
        avatar.root.rotation.y = Math.sin(t * 0.6) * 0.9;
        poseAvatar(avatar, null, 0, t);
        renderer.render(scene, camera);
        if (preview) preview.raf = requestAnimationFrame(loop);
      };
      preview = { renderer, scene, camera, raf: 0, root: avatar.root };
      loop();
    } catch {
      canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'tracks__source', textContent: 'Preview unavailable.' }));
    }
  }

  function stopPreview() {
    if (!preview) return;
    cancelAnimationFrame(preview.raf);
    preview.renderer.dispose();
    preview.renderer.forceContextLoss();
    preview = null;
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-look-close]')) return api.close();
    if (t.closest('[data-look-reset]')) {
      custom = null;
      save();
      return render();
    }
    const b = t.closest<HTMLElement>('[data-look]');
    if (b) set(b.dataset.look as keyof Look, b.dataset.value as never);
  });

  const api = {
    get look(): Look {
      return current();
    },
    onChange(fn: () => void) {
      listeners.add(fn);
    },
    open() {
      panel.hidden = false;
      render();
    },
    close() {
      stopPreview();
      panel.hidden = true;
    },
  };
  return api;
}
