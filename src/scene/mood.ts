import * as THREE from 'three';
import type { GenreId } from '../types.js';

/**
 * Moods re-light the whole city (sky, fog, lights, bloom, weather) and pick
 * music from the city that fits. Colours are plain data so they can be
 * blended smoothly from one mood to the next.
 */

export type MoodId = 'night' | 'late-night' | 'summer' | 'angry' | 'rainy' | 'dreamy';

export interface MoodLook {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  ambientColor: string;
  ambient: number;
  moonColor: string;
  moon: number;
  warmColor: string;
  warm: number;
  exposure: number;
  bloom: number;
  stars: number;
  rain: number;
  sparkles: number;
  lightning: boolean;
  windowTint: string;
  windowLevel: number;
}

export interface Mood {
  id: MoodId;
  name: string;
  blurb: string;
  /** CSS gradient for the swatch in the menu. */
  swatch: string;
  /** Genres whose artists fit the mood, best first. Empty means "anything in your city". */
  genres: GenreId[];
  look: MoodLook;
}

export const MOODS: Mood[] = [
  {
    id: 'night',
    name: 'City night',
    blurb: 'The default: neon, moonlight and a bit of everything.',
    swatch: 'linear-gradient(180deg,#03040a,#291429)',
    genres: [],
    look: {
      skyTop: '#03040a', skyMid: '#0d0b1c', skyHorizon: '#291429', fog: '#0a0b1a', fogDensity: 1,
      hemiSky: '#4a5a9a', hemiGround: '#1c1410', hemi: 0.9, ambientColor: '#30284a', ambient: 0.35,
      moonColor: '#aebfff', moon: 1.1, warmColor: '#ff9a5a', warm: 0.25,
      exposure: 1.05, bloom: 0.62, stars: 0.7, rain: 0, sparkles: 0, lightning: false,
      windowTint: '#ffffff', windowLevel: 1,
    },
  },
  {
    id: 'late-night',
    name: 'After hours',
    blurb: 'Deep indigo, brighter neon. Jazz, soul, electronic and the moodier end of guitar music.',
    swatch: 'linear-gradient(180deg,#010108,#2a0a44 60%,#ff3ad0)',
    genres: ['jazz', 'soul', 'electronic', 'post-punk', 'new-wave', 'hip-hop', 'indie'],
    look: {
      skyTop: '#010108', skyMid: '#07041a', skyHorizon: '#1d0a30', fog: '#08051c', fogDensity: 1.3,
      hemiSky: '#2a2a6a', hemiGround: '#0a0808', hemi: 0.55, ambientColor: '#2a1a4a', ambient: 0.3,
      moonColor: '#8a8aff', moon: 0.55, warmColor: '#ff3ad0', warm: 0.45,
      exposure: 0.98, bloom: 1.0, stars: 0.95, rain: 0, sparkles: 0, lightning: false,
      windowTint: '#dccdff', windowLevel: 1.1,
    },
  },
  {
    id: 'summer',
    name: 'Golden hour',
    blurb: 'A warm summer evening. Reggae, soul, pop and sunny guitars.',
    swatch: 'linear-gradient(180deg,#2d4f8f,#e39a73 60%,#ffd08a)',
    genres: ['reggae', 'soul', 'pop', 'psychedelic', 'indie', 'classic-rock', 'hip-hop', 'garage'],
    look: {
      skyTop: '#2d4f8f', skyMid: '#d98f6f', skyHorizon: '#ffcf8a', fog: '#d8a07a', fogDensity: 0.75,
      hemiSky: '#ffd9a8', hemiGround: '#5a3a2a', hemi: 1.35, ambientColor: '#ffb080', ambient: 0.45,
      moonColor: '#ffc27a', moon: 2.6, warmColor: '#ff7a3a', warm: 0.8,
      exposure: 1.12, bloom: 0.32, stars: 0, rain: 0, sparkles: 0, lightning: false,
      windowTint: '#ffe2b8', windowLevel: 0.4,
    },
  },
  {
    id: 'angry',
    name: 'Riot',
    blurb: 'Red skies and lightning. Punk, metal, hard rock and hip hop at full volume.',
    swatch: 'linear-gradient(180deg,#080000,#6a0a0a 70%,#ff2a00)',
    genres: ['punk', 'metal', 'hard-rock', 'hip-hop', 'garage', 'alternative'],
    look: {
      skyTop: '#080000', skyMid: '#2a0303', skyHorizon: '#6a0a0a', fog: '#2a0505', fogDensity: 1.25,
      hemiSky: '#8a2a2a', hemiGround: '#1a0505', hemi: 0.75, ambientColor: '#4a0a0a', ambient: 0.4,
      moonColor: '#ff4a3a', moon: 1.3, warmColor: '#ff2a00', warm: 0.6,
      exposure: 1.02, bloom: 0.95, stars: 0.15, rain: 0.35, sparkles: 0, lightning: true,
      windowTint: '#ff7050', windowLevel: 1.0,
    },
  },
  {
    id: 'rainy',
    name: 'Rainy day',
    blurb: 'Grey, wet and wistful. Post-punk, indie, alternative, jazz and soul.',
    swatch: 'linear-gradient(180deg,#1a2230,#3a4658)',
    genres: ['post-punk', 'indie', 'alternative', 'art-rock', 'jazz', 'soul', 'new-wave'],
    look: {
      skyTop: '#161c28', skyMid: '#262e3c', skyHorizon: '#3a4658', fog: '#2a3240', fogDensity: 1.9,
      hemiSky: '#7a8aa8', hemiGround: '#1a1c22', hemi: 0.95, ambientColor: '#3a4458', ambient: 0.4,
      moonColor: '#b8c8e8', moon: 0.7, warmColor: '#ffb070', warm: 0.15,
      exposure: 1.08, bloom: 0.72, stars: 0, rain: 1, sparkles: 0, lightning: false,
      windowTint: '#d6e4ff', windowLevel: 0.9,
    },
  },
  {
    id: 'dreamy',
    name: 'Daydream',
    blurb: 'Pink haze and floating light. Psychedelia, electronic, art rock and new wave.',
    swatch: 'linear-gradient(180deg,#2a1a5a,#a86ad8 60%,#ffb0d8)',
    genres: ['psychedelic', 'electronic', 'art-rock', 'new-wave', 'pop', 'indie'],
    look: {
      skyTop: '#2a1a5a', skyMid: '#8a5ac0', skyHorizon: '#ffb0d8', fog: '#b080c8', fogDensity: 0.95,
      hemiSky: '#ffc8f0', hemiGround: '#402060', hemi: 1.15, ambientColor: '#a070d0', ambient: 0.5,
      moonColor: '#ffd0ff', moon: 1.2, warmColor: '#80e0ff', warm: 0.45,
      exposure: 1.06, bloom: 0.85, stars: 0.4, rain: 0, sparkles: 1, lightning: false,
      windowTint: '#ffc0f0', windowLevel: 1.0,
    },
  },
];

export const MOOD_BY_ID: Record<MoodId, Mood> = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<MoodId, Mood>;

const COLOR_KEYS = ['skyTop', 'skyMid', 'skyHorizon', 'fog', 'hemiSky', 'hemiGround', 'ambientColor', 'moonColor', 'warmColor', 'windowTint'] as const;
const NUM_KEYS = ['fogDensity', 'hemi', 'ambient', 'moon', 'warm', 'exposure', 'bloom', 'stars', 'rain', 'sparkles', 'windowLevel'] as const;

/** The blended state the renderer reads each frame. */
export class MoodState {
  colors: Record<(typeof COLOR_KEYS)[number], THREE.Color>;
  nums: Record<(typeof NUM_KEYS)[number], number>;
  lightning = false;
  private from: { colors: Record<string, THREE.Color>; nums: Record<string, number> } | null = null;
  private to: MoodLook;
  private t = 1;

  constructor(look: MoodLook) {
    this.to = look;
    this.colors = Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color(look[k])])) as MoodState['colors'];
    this.nums = Object.fromEntries(NUM_KEYS.map((k) => [k, look[k]])) as MoodState['nums'];
    this.lightning = look.lightning;
  }

  set(look: MoodLook, instant = false): void {
    this.from = {
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, this.colors[k].clone()])),
      nums: { ...this.nums },
    };
    this.to = look;
    this.t = instant ? 1 : 0;
    this.lightning = look.lightning;
    if (instant) this.apply(1);
  }

  /** Advances the blend. Returns true while it is still changing. */
  update(dt: number): boolean {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / 2.2);
    const k = this.t < 0.5 ? 2 * this.t * this.t : 1 - Math.pow(-2 * this.t + 2, 2) / 2;
    this.apply(k);
    return true;
  }

  private apply(k: number) {
    const from = this.from;
    for (const key of COLOR_KEYS) {
      const target = new THREE.Color(this.to[key]);
      if (from) this.colors[key].copy(from.colors[key]).lerp(target, k);
      else this.colors[key].copy(target);
    }
    for (const key of NUM_KEYS) this.nums[key] = from ? from.nums[key] + (this.to[key] - from.nums[key]) * k : this.to[key];
  }
}

/** Falling rain streaks that follow the camera. */
export class Rain {
  readonly object: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private readonly count: number;
  private readonly span = 140;
  private readonly height = 90;

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this.span;
      const y = Math.random() * this.height;
      const z = (Math.random() - 0.5) * this.span;
      this.positions.set([x, y, z, x + 0.05, y - 1.1, z + 0.05], i * 6);
      this.speeds[i] = 38 + Math.random() * 22;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const m = new THREE.LineBasicMaterial({ color: 0xaabbd8, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.object = new THREE.LineSegments(g, m);
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  update(dt: number, center: THREE.Vector3, amount: number): void {
    const mat = this.object.material as THREE.LineBasicMaterial;
    mat.opacity = 0.45 * amount;
    this.object.visible = amount > 0.01;
    if (!this.object.visible) return;
    this.object.position.set(center.x, 0, center.z);
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const dy = this.speeds[i] * dt;
      p[o + 1] -= dy;
      p[o + 4] -= dy;
      if (p[o + 4] < 0) {
        const y = this.height + Math.random() * 10;
        p[o + 1] = y;
        p[o + 4] = y - 1.1;
      }
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Slow floating motes of light for the dreamy mood. */
export class Sparkles {
  readonly object: THREE.Points;
  private base: Float32Array;
  private positions: Float32Array;
  private readonly count: number;

  constructor(count: number, texture: THREE.Texture) {
    this.count = count;
    this.base = new Float32Array(count * 3);
    this.positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.base.set([(Math.random() - 0.5) * 260, 2 + Math.random() * 50, (Math.random() - 0.5) * 260], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const m = new THREE.PointsMaterial({ map: texture, color: 0xffd6f5, size: 1.6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.object = new THREE.Points(g, m);
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  update(time: number, center: THREE.Vector3, amount: number): void {
    const mat = this.object.material as THREE.PointsMaterial;
    mat.opacity = 0.9 * amount;
    this.object.visible = amount > 0.01;
    if (!this.object.visible) return;
    this.object.position.set(center.x, 0, center.z);
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      this.positions[o] = this.base[o] + Math.sin(time * 0.3 + i) * 3;
      this.positions[o + 1] = this.base[o + 1] + Math.sin(time * 0.5 + i * 1.7) * 2;
      this.positions[o + 2] = this.base[o + 2] + Math.cos(time * 0.27 + i * 0.7) * 3;
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
