import * as THREE from 'three';
import type { BuildingPlan } from '../types.js';
import { geo } from './geometries.js';
import { FACADES, MATS, glow } from './materials.js';
import { graffitiTexture } from './textures.js';
import type { Instancer, InstanceOpts } from './instancer.js';

/** Build timing, in seconds after the sequence starts. */
export const TIMELINE = {
  terrain: 0,
  blocks: 0.35,
  buildings: 1.1,
  buildingSpread: 2.4,
  venues: 3.1,
  landmarks: 3.6,
  lights: 4.3,
  lightsDuration: 1.1,
  done: 5.6,
};

function hashNum(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const shade = (hex: string, f: number) => new THREE.Color(hex).multiplyScalar(f);

/**
 * Turns building plans into instanced parts. Each archetype is composed from
 * a few shared primitives so the city has variety without unique meshes.
 */
export function addBuildings(inst: Instancer, buildings: BuildingPlan[], animate: boolean): void {
  const g = geo();
  const facades = {
    brick: FACADES.brick(),
    concrete: FACADES.concrete(),
    glass: FACADES.glass(),
    painted: FACADES.painted(),
    classic: FACADES.classic(),
    industrial: FACADES.industrial(),
    neon: FACADES.neon(),
  };
  const roofMat = MATS.instanced();
  const neonStrip = glow('#ffffff', 2.4);
  const redLight = glow('#ff3030', 3);

  const graffitiBatches = [0, 1, 2, 3, 4, 5].map((v) =>
    inst.batch(
      `graffiti-${v}`,
      g.plane,
      new THREE.MeshStandardMaterial({
        map: graffitiTexture(v),
        transparent: true,
        emissive: 0xffffff,
        emissiveMap: graffitiTexture(v),
        emissiveIntensity: 0.18,
        roughness: 0.9,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      false,
      false,
    ),
  );

  for (const b of buildings) {
    const { x, z } = b.position;
    const w = b.width;
    const d = b.depth;
    const h = Math.max(1.2, b.height);
    const r = hashNum(b.id + 1);
    const base: InstanceOpts = {
      delay: animate ? TIMELINE.buildings + b.order * TIMELINE.buildingSpread : 0,
      duration: 0.75,
      mode: animate ? 'grow' : 'none',
      tag: b.id,
      rotY: b.rotation,
    };
    const part = (key: string, geometry: THREE.BufferGeometry, material: THREE.Material, px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, cast = true) =>
      inst.batch(key, geometry, material, cast, true).add(x + px, py, z + pz, sx, sy, sz, { ...base, color });

    switch (b.archetype) {
      case 'brick': {
        part('brick-body', g.box, facades.brick, 0, 0, 0, w, h, d, b.color);
        part('cornice', g.box, roofMat, 0, h, 0, w + 0.22, 0.2, d + 0.22, shade(b.color, 0.55));
        if (r < 0.45) {
          part('tank', g.cylinderLow, MATS.wood(), w * 0.2, h + 0.2, d * 0.15, 0.9, 1.0, 0.9, 0xffffff);
          part('tank-roof', g.coneRound, MATS.wood(), w * 0.2, h + 1.2, d * 0.15, 1.0, 0.45, 1.0, 0xffffff);
        } else {
          part('ac', g.box, MATS.metal(), -w * 0.2, h + 0.2, 0, 0.7, 0.45, 0.6, 0xffffff);
        }
        break;
      }
      case 'townhouse': {
        part('brick-body', g.box, facades.brick, 0, 0, 0, w, h, d, b.color);
        part('pitched', g.pitched, roofMat, 0, h, 0, w, 1.1, d, shade(b.color, 0.45));
        part('chimney', g.box, roofMat, w * 0.3, h, d * 0.2, 0.35, 1.5, 0.35, shade(b.color, 0.7));
        break;
      }
      case 'apartment': {
        part('classic-body', g.box, facades.classic, 0, 0, 0, w, h, d, b.color);
        part('cornice', g.box, roofMat, 0, h, 0, w + 0.18, 0.18, d + 0.18, shade(b.color, 0.6));
        part('penthouse', g.box, roofMat, 0, h + 0.18, 0, w * 0.45, 0.9, d * 0.45, shade(b.color, 0.8));
        if (r > 0.5) part('antenna', g.cylinderLow, MATS.metal(), w * 0.3, h + 0.18, -d * 0.2, 0.06, 2.2, 0.06, 0xffffff, false);
        break;
      }
      case 'warehouse': {
        part('industrial-body', g.box, facades.industrial, 0, 0, 0, w, h, d, b.color);
        part('sawtooth', g.sawtooth, roofMat, 0, h, 0, w, 1.1, d, shade(b.color, 0.5));
        if (r > 0.6) part('chimney-tall', g.cylinder, MATS.instanced(), w * 0.35, 0, d * 0.35, 0.6, h + 4, 0.6, shade(b.color, 0.8));
        break;
      }
      case 'tower': {
        if (h > 13 && r > 0.35) {
          const lower = h * 0.62;
          part('glass-body', g.box, facades.glass, 0, 0, 0, w, lower, d, b.color);
          part('glass-body', g.box, facades.glass, 0, lower, 0, w * 0.7, h - lower, d * 0.7, b.color);
          part('cornice', g.box, roofMat, 0, lower, 0, w + 0.1, 0.16, d + 0.1, shade(b.color, 0.5));
        } else {
          part('glass-body', g.box, facades.glass, 0, 0, 0, w, h, d, b.color);
        }
        part('roof-cap', g.box, roofMat, 0, h, 0, w * 0.6, 0.6, d * 0.6, shade(b.color, 0.6));
        part('spire', g.cylinderLow, MATS.metal(), 0, h + 0.6, 0, 0.1, 2.5 + r * 3, 0.1, 0xffffff, false);
        part('aviation', g.sphere, redLight, 0, h + 3.3 + r * 3, 0, 0.3, 0.3, 0.3, 0xffffff, false);
        break;
      }
      case 'neon-tower': {
        part('neon-body', g.box, facades.neon, 0, 0, 0, w * 0.92, h, d * 0.92, b.color);
        for (const [sx, sz] of [[1, 1], [-1, -1]]) {
          part('neon-strip', g.box, neonStrip, (sx * w * 0.92) / 2, 0, (sz * d * 0.92) / 2, 0.14, h, 0.14, b.accent, false);
        }
        part('neon-crown', g.box, neonStrip, 0, h, 0, w * 0.94, 0.18, d * 0.94, b.accent, false);
        part('roof-cap', g.box, roofMat, 0, h + 0.18, 0, w * 0.5, 1.2, d * 0.5, shade(b.color, 0.8));
        break;
      }
      case 'brutalist': {
        const h1 = h * 0.42;
        const h2 = h * 0.33;
        const h3 = h - h1 - h2;
        const ox = (r - 0.5) * w * 0.3;
        part('concrete-body', g.box, facades.concrete, 0, 0, 0, w * 0.78, h1, d * 0.78, b.color);
        part('concrete-body', g.box, facades.concrete, ox, h1, 0, w, h2, d * 0.62, b.color);
        part('concrete-body', g.box, facades.concrete, -ox, h1 + h2, 0, w * 0.62, h3, d, b.color);
        part('roof-cap', g.box, roofMat, -ox, h, 0, w * 0.3, 0.8, d * 0.3, shade(b.color, 0.7));
        break;
      }
      case 'curvy': {
        const rad = Math.min(w, d);
        part('painted-body', g.cylinder, facades.painted, 0, 0, 0, rad, h, rad, b.color);
        part('dome-cap', g.dome, MATS.instanced(), 0, h, 0, rad * 1.02, rad * 0.9, rad * 1.02, b.accent);
        part('neon-ring', g.torus, neonStrip, 0, h * 0.62, 0, rad * 1.06, rad * 1.06, rad * 1.06, b.accent, false);
        break;
      }
      case 'dome': {
        const rad = Math.min(w, d);
        part('painted-body', g.cylinder, facades.painted, 0, 0, 0, rad, Math.max(1.4, h * 0.45), rad, b.color);
        part('dome-cap', g.dome, MATS.instanced(), 0, Math.max(1.4, h * 0.45), 0, rad, rad * 0.95, rad, b.color);
        part('neon-ring', g.torus, neonStrip, 0, Math.max(1.4, h * 0.45), 0, rad * 1.02, rad * 1.02, rad * 1.02, b.accent, false);
        break;
      }
      case 'classic': {
        part('classic-body', g.box, facades.classic, 0, 0, 0, w, h, d, b.color);
        part('cornice', g.box, roofMat, 0, h, 0, w + 0.3, 0.28, d + 0.3, shade(b.color, 0.75));
        if (r > 0.55 && h > 6) {
          part('dome-cap', g.dome, MATS.instanced(), 0, h + 0.28, 0, Math.min(w, d) * 0.5, Math.min(w, d) * 0.45, Math.min(w, d) * 0.5, '#4f7a6a');
        } else {
          part('mansard', g.box, roofMat, 0, h + 0.28, 0, w * 0.86, 0.9, d * 0.86, shade(b.color, 0.5));
        }
        break;
      }
    }

    if (b.graffiti && h < 14 && b.archetype !== 'curvy' && b.archetype !== 'dome') {
      const batch = graffitiBatches[Math.floor(r * 997) % graffitiBatches.length];
      const side = Math.floor(r * 4);
      const gw = Math.min(w, d, 3.2);
      const gh = gw * 0.5;
      const off = 0.03;
      const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
      const px = side === 1 ? w / 2 + off : side === 3 ? -w / 2 - off : 0;
      const pz = side === 0 ? d / 2 + off : side === 2 ? -d / 2 - off : 0;
      batch.add(x + px, 0.35 + gh / 2, z + pz, gw, gh, 1, { ...base, rotY: rot, color: 0xffffff });
    }
  }
}
