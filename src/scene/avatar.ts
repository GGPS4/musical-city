import * as THREE from 'three';
import type { GenreId } from '../types.js';

/**
 * People avatars for rooms (and your busking self): an outfit and hair
 * styled by your top genre, which you can change. About 1.75 m tall.
 */

export type Hair = 'mohawk' | 'long' | 'afro' | 'slick' | 'cap' | 'beanie' | 'dreads' | 'bun' | 'spiky' | 'bald';
export type Outfit = 'leather' | 'suit' | 'hoodie' | 'tee' | 'tiedye' | 'denim' | 'sparkle' | 'cardigan';
export type Accessory = 'none' | 'shades' | 'headphones' | 'hat' | 'chain';

export interface Look {
  hair: Hair;
  hairColor: string;
  outfit: Outfit;
  top: string;
  bottom: string;
  skin: string;
  accessory: Accessory;
}

export type Emote = 'headbang' | 'airguitar' | 'dance' | 'surf';

export const HAIRS: Hair[] = ['mohawk', 'long', 'afro', 'slick', 'cap', 'beanie', 'dreads', 'bun', 'spiky', 'bald'];
export const OUTFITS: Outfit[] = ['leather', 'suit', 'hoodie', 'tee', 'tiedye', 'denim', 'sparkle', 'cardigan'];
export const ACCESSORIES: Accessory[] = ['none', 'shades', 'headphones', 'hat', 'chain'];
export const SKINS = ['#f1c9a5', '#e2b99a', '#c68c65', '#9a6644', '#6b4430', '#4a2e20'];

const GENRE_LOOK: Record<GenreId, Omit<Look, 'skin'>> = {
  punk: { hair: 'mohawk', hairColor: '#ff2e63', outfit: 'leather', top: '#141414', bottom: '#1d3557', accessory: 'chain' },
  'post-punk': { hair: 'spiky', hairColor: '#0d0d0d', outfit: 'leather', top: '#222222', bottom: '#111111', accessory: 'none' },
  'classic-rock': { hair: 'long', hairColor: '#5a3a1e', outfit: 'denim', top: '#3a5a8c', bottom: '#2b3f66', accessory: 'none' },
  psychedelic: { hair: 'afro', hairColor: '#7a3b12', outfit: 'tiedye', top: '#ff7ad9', bottom: '#6a4c93', accessory: 'shades' },
  alternative: { hair: 'long', hairColor: '#3b2a1a', outfit: 'cardigan', top: '#5a6b3a', bottom: '#2b2b33', accessory: 'none' },
  glam: { hair: 'spiky', hairColor: '#ff7a1a', outfit: 'sparkle', top: '#c9b6ff', bottom: '#ff5fa2', accessory: 'shades' },
  garage: { hair: 'slick', hairColor: '#1a1a1a', outfit: 'leather', top: '#3a2a1a', bottom: '#1d3557', accessory: 'none' },
  electronic: { hair: 'beanie', hairColor: '#111111', outfit: 'hoodie', top: '#1b1b2f', bottom: '#111118', accessory: 'headphones' },
  'new-wave': { hair: 'spiky', hairColor: '#f2d16b', outfit: 'suit', top: '#6fe3ff', bottom: '#222244', accessory: 'shades' },
  'art-rock': { hair: 'slick', hairColor: '#b8321c', outfit: 'suit', top: '#e9dfc8', bottom: '#2b2b33', accessory: 'none' },
  'hard-rock': { hair: 'long', hairColor: '#1a1a1a', outfit: 'leather', top: '#111111', bottom: '#2b3f66', accessory: 'chain' },
  indie: { hair: 'beanie', hairColor: '#5a3a1e', outfit: 'cardigan', top: '#c77d4a', bottom: '#3a4a5a', accessory: 'none' },
  metal: { hair: 'long', hairColor: '#0d0d0d', outfit: 'tee', top: '#0d0d0d', bottom: '#1a1a1a', accessory: 'chain' },
  'hip-hop': { hair: 'cap', hairColor: '#111111', outfit: 'hoodie', top: '#e63946', bottom: '#1d3557', accessory: 'chain' },
  jazz: { hair: 'slick', hairColor: '#1a1a1a', outfit: 'suit', top: '#1f2a44', bottom: '#1f2a44', accessory: 'hat' },
  soul: { hair: 'afro', hairColor: '#1a1a1a', outfit: 'suit', top: '#ff9f43', bottom: '#5a2a1a', accessory: 'none' },
  reggae: { hair: 'dreads', hairColor: '#2a1a0a', outfit: 'tee', top: '#2f8f3a', bottom: '#e8c547', accessory: 'hat' },
  pop: { hair: 'bun', hairColor: '#f2d16b', outfit: 'sparkle', top: '#ff5fa2', bottom: '#ffffff', accessory: 'none' },
};

export function lookForGenre(g: GenreId | undefined, seed = 0): Look {
  const base = GENRE_LOOK[g ?? 'classic-rock'] ?? GENRE_LOOK['classic-rock'];
  return { ...base, skin: SKINS[seed % SKINS.length] };
}

const std = (color: string, rough = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

export interface AvatarParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  guitar: THREE.Object3D;
}

/** Builds a person with the given look. The group's origin is at the feet. */
export function buildAvatar(look: Look): AvatarParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = std(look.skin, 0.7);
  const topMat =
    look.outfit === 'sparkle'
      ? std(look.top, 0.25, { metalness: 0.7, emissive: look.top, emissiveIntensity: 0.25 })
      : look.outfit === 'leather'
        ? std(look.top, 0.35, { metalness: 0.2 })
        : std(look.top, 0.8);
  const bottomMat = std(look.bottom, 0.85);

  // Legs.
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.85, 8).translate(0, 0.425, 0), bottomMat);
    leg.position.x = sx * 0.11;
    body.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.26), std('#111', 0.6));
    shoe.position.set(sx * 0.11, 0.04, 0.05);
    body.add(shoe);
  }
  // Torso (a dress-like flare for 'sparkle').
  const torsoGeo = look.outfit === 'sparkle' ? new THREE.CylinderGeometry(0.2, 0.3, 0.62, 12) : new THREE.CylinderGeometry(0.22, 0.2, 0.62, 12);
  const torso = new THREE.Mesh(torsoGeo.translate(0, 0.85 + 0.31, 0), topMat);
  body.add(torso);
  if (look.outfit === 'tiedye') {
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 20), std('#6fe3ff', 0.8));
    swirl.position.set(0, 1.18, 0.2);
    body.add(swirl);
  }
  if (look.outfit === 'suit') {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.02), std('#b8321c', 0.6));
    tie.position.set(0, 1.26, 0.215);
    body.add(tie);
  }
  if (look.outfit === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 8, 20, Math.PI), topMat);
    hood.rotation.set(-0.3, 0, 0);
    hood.position.set(0, 1.47, -0.08);
    body.add(hood);
  }
  if (look.outfit === 'denim' || look.outfit === 'leather') {
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.02), std(look.outfit === 'denim' ? '#26406b' : '#050505', 0.4));
      lapel.position.set(sx * 0.07, 1.22, 0.215);
      lapel.rotation.z = sx * 0.15;
      body.add(lapel);
    }
  }
  if (look.accessory === 'chain') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 24), std('#d4a73a', 0.3, { metalness: 0.9 }));
    chain.rotation.x = 1.2;
    chain.position.set(0, 1.36, 0.1);
    body.add(chain);
  }

  // Arms, pivoting at the shoulder.
  const arm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.28, 1.42, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.62, 8).translate(0, -0.31, 0), topMat);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skin);
    hand.position.y = -0.64;
    g.add(upper, hand);
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);

  // Head.
  const head = new THREE.Group();
  head.position.y = 1.5;
  body.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 0.02, 0), skin);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
  skull.position.y = 0.18;
  head.add(neck, skull);
  const hairMat = std(look.hairColor, 0.8);
  const hy = 0.18;
  switch (look.hair) {
    case 'mohawk':
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 6), hairMat);
        spike.position.set(0, hy + 0.2 + Math.sin((i / 5) * Math.PI) * 0.03, -0.12 + i * 0.05);
        head.add(spike);
      }
      break;
    case 'long': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      cap.position.y = hy;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.1), hairMat);
      back.position.set(0, hy - 0.2, -0.1);
      head.add(cap, back);
      break;
    }
    case 'afro': {
      const fro = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), hairMat);
      fro.position.set(0, hy + 0.08, -0.03);
      head.add(fro);
      break;
    }
    case 'slick': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), std(look.hairColor, 0.25));
      cap.position.y = hy + 0.01;
      head.add(cap);
      break;
    }
    case 'cap': {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(look.top, 0.7));
      crown.position.y = hy + 0.02;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.16), std(look.top, 0.7));
      brim.position.set(0, hy + 0.03, 0.17);
      head.add(crown, brim);
      break;
    }
    case 'beanie': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), std(look.bottom === look.top ? '#c9542e' : look.bottom, 0.9));
      b.position.y = hy + 0.02;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std('#eeeeee', 0.9));
      pom.position.y = hy + 0.19;
      head.add(b, pom);
      break;
    }
    case 'dreads':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.36, 5), hairMat);
        d.position.set(Math.sin(a) * 0.15, hy - 0.1, Math.cos(a) * 0.15 - 0.03);
        if (Math.cos(a) > 0.6) d.visible = false;
        head.add(d);
      }
      {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
        cap.position.y = hy;
        head.add(cap);
      }
      break;
    case 'bun': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      cap.position.y = hy;
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), hairMat);
      bun.position.set(0, hy + 0.17, -0.06);
      head.add(cap, bun);
      break;
    }
    case 'spiky':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), hairMat);
        spike.position.set(Math.sin(a) * 0.08, hy + 0.14, Math.cos(a) * 0.08);
        spike.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
        head.add(spike);
      }
      break;
    case 'bald':
      break;
  }
  if (look.accessory === 'shades') {
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), std('#050505', 0.2, { metalness: 0.6 }));
    shades.position.set(0, hy + 0.02, 0.14);
    head.add(shades);
  } else if (look.accessory === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 20, Math.PI), std('#222', 0.4));
    band.position.y = hy;
    head.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), std('#e63946', 0.4));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sx * 0.16, hy, 0);
      head.add(cup);
    }
  } else if (look.accessory === 'hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), std('#1a1a1a', 0.7));
    brim.position.y = hy + 0.1;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 16), std('#1a1a1a', 0.7));
    crown.position.y = hy + 0.18;
    head.add(brim, crown);
  }

  // An (air) guitar, shown only while playing it.
  const guitar = new THREE.Group();
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.08), std('#b8321c', 0.4));
  const neckG = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04), std('#3a2616', 0.6));
  neckG.position.set(0, 0.48, 0);
  guitar.add(gBody, neckG);
  guitar.position.set(0.02, 1.02, 0.26);
  guitar.rotation.z = 1.1;
  guitar.visible = false;
  body.add(guitar);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return { root, body, head, armL, armR, guitar };
}

/** Poses an avatar for an emote. `t` is seconds since it started, `idle` time is for gentle idling. */
export function poseAvatar(p: AvatarParts, emote: Emote | null, t: number, idle: number): void {
  p.body.rotation.set(0, 0, 0);
  p.body.position.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
  p.armL.rotation.set(0.08 * Math.sin(idle * 2), 0, -0.08);
  p.armR.rotation.set(-0.08 * Math.sin(idle * 2), 0, 0.08);
  p.guitar.visible = false;
  switch (emote) {
    case 'headbang':
      p.head.rotation.x = 0.25 + Math.sin(t * 14) * 0.45;
      p.body.rotation.x = 0.1 + Math.sin(t * 14) * 0.08;
      p.armL.rotation.set(-2.6, 0, -0.3);
      p.armR.rotation.set(-2.6, 0, 0.3);
      break;
    case 'airguitar':
      p.guitar.visible = true;
      p.body.rotation.x = -0.12 + Math.sin(t * 6) * 0.05;
      p.head.rotation.x = Math.sin(t * 12) * 0.2;
      p.armL.rotation.set(-1.2, 0.6, -0.4);
      p.armR.rotation.set(-0.6 + Math.sin(t * 22) * 0.35, 0, 0.5);
      break;
    case 'dance':
      p.body.position.y = Math.abs(Math.sin(t * 6.4)) * 0.18;
      p.body.rotation.y = Math.sin(t * 3.2) * 0.8;
      p.body.rotation.z = Math.sin(t * 6.4) * 0.08;
      p.armL.rotation.set(-2.2 + Math.sin(t * 6.4) * 0.6, 0, -0.6);
      p.armR.rotation.set(-2.2 - Math.sin(t * 6.4) * 0.6, 0, 0.6);
      break;
    case 'surf':
      // Lying on your back, carried along above the crowd.
      p.body.rotation.x = -Math.PI / 2;
      p.body.position.set(0, 2.1 + Math.sin(t * 3) * 0.1, 0.8);
      p.body.rotation.z = Math.sin(t * 2) * 0.2;
      p.armL.rotation.set(0, 0, -1.4);
      p.armR.rotation.set(0, 0, 1.4);
      break;
    default:
      p.body.position.y = Math.abs(Math.sin(idle * 2.2)) * 0.02;
  }
}
