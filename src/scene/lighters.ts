import * as THREE from 'three';
import { glowTexture } from './textures.js';

/**
 * "Lighters up": during slow songs, crowds hold up lighters and phone
 * lights. `LIGHTERS.level` (0–1) is set by the app from the music and read
 * by every crowd.
 */
export const LIGHTERS = { level: 0 };

/** Flickering flames above a crowd. `heads` gives each person's head position. */
export function addLighters(parent: THREE.Object3D, count: number, head: (i: number, out: THREE.Vector3) => THREE.Vector3): (t: number) => void {
  const pos = new Float32Array(count * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color('#ffc46b').multiplyScalar(2.2), size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  const v = new THREE.Vector3();
  return (t: number) => {
    const level = LIGHTERS.level;
    pts.visible = level > 0.02;
    if (!pts.visible) return;
    mat.opacity = level;
    for (let i = 0; i < count; i++) {
      head(i, v);
      // Only about two thirds of people hold one up; everyone sways slowly.
      const up = (i * 7919) % 3 !== 0 ? 1 : 0;
      const sway = Math.sin(t * 1.1 + i * 0.7) * 0.25;
      pos.set([v.x + sway * up, up ? v.y + 0.55 + Math.sin(t * 9 + i) * 0.02 : -50, v.z], i * 3);
    }
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };
}
