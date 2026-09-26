import * as THREE from 'three';
import { GENRES } from '../data/genres.js';
import type { BillboardPlan, BuskerPlan, HomePlan, LabelTowerPlan, LandmarkPlan, VenuePlan } from '../types.js';
import { geo } from './geometries.js';
import { FACADES, MATS, glow, std } from './materials.js';
import { beamTexture, glowTexture, graffitiTexture, noteTexture, pulseTexture, signTexture, sleeveTexture, vinylTexture } from './textures.js';

/**
 * Hand-built models for venues, historical landmarks and genre monuments.
 * There are only a few dozen of these per city, so plain meshes built from
 * shared geometries are fine. Anything that moves registers a `tick`.
 */

export type Tick = (t: number, dt: number) => void;

export interface Model {
  group: THREE.Group;
  height: number;
  ticks: Tick[];
}

const G = () => geo();

/** Venues and landmarks are drawn larger than life so they read from across the city. */
export const VENUE_SCALE = 1.3;
export const LANDMARK_SCALE = 1.35;

/** Wraps a model in a positioned outer group and scales the contents. */
function wrap(inner: THREE.Group, k: number, x: number, y: number, z: number, rot: number, userData: Record<string, unknown>): THREE.Group {
  const outer = new THREE.Group();
  inner.scale.setScalar(k);
  outer.add(inner);
  outer.position.set(x, y, z);
  outer.rotation.y = rot;
  outer.userData = userData;
  return outer;
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  parent: THREE.Object3D,
  cast = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function box(mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: THREE.Object3D, cast = true) {
  return mesh(G().box, mat, x, y, z, sx, sy, sz, parent, cast);
}

const colored = (hex: string, roughness = 0.8, metalness = 0.05) => std(`c-${hex}-${roughness}-${metalness}`, { color: hex, roughness, metalness });

/** Double-sided neon sign centred at (x, y, z) facing +Z. */
function sign(text: string, color: string, height: number, parent: THREE.Object3D, x: number, y: number, z: number, style: 'neon' | 'marquee' | 'plain' = 'neon', maxWidth = Infinity): THREE.Object3D {
  const { tex, aspect } = signTexture(text, color, style);
  let w = height * aspect;
  let h = height;
  if (w > maxWidth) {
    h = (height * maxWidth) / w;
    w = maxWidth;
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: style === 'plain', transparent: style !== 'plain', side: THREE.FrontSide });
  if (style !== 'plain') mat.color.setScalar(1.6);
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  const front = new THREE.Mesh(G().plane, mat);
  front.scale.set(w, h, 1);
  const back = front.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.02;
  holder.add(front, back);
  parent.add(holder);
  return holder;
}

function person(parent: THREE.Object3D, x: number, z: number, color: string, y = 0, scale = 1): THREE.Group {
  const p = new THREE.Group();
  mesh(G().cylinderLow, colored(color), 0, 0, 0, 0.22 * scale, 0.5 * scale, 0.22 * scale, p);
  mesh(G().sphere, colored('#e2b99a'), 0, 0.62 * scale, 0, 0.2 * scale, 0.2 * scale, 0.2 * scale, p);
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

function marker(parent: THREE.Object3D, y: number, color: string, ticks: Tick[], historical: boolean): THREE.Object3D {
  const m = new THREE.Group();
  const gem = new THREE.Mesh(G().ico, glow(color, historical ? 2.2 : 1.6));
  gem.scale.set(0.9, 1.4, 0.9);
  m.add(gem);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTexture(), color, transparent: true, opacity: 0.0, depthWrite: false }));
  halo.visible = false;
  m.add(halo);
  m.position.y = y;
  m.userData.isMarker = true;
  parent.add(m);
  const phase = Math.random() * 6;
  ticks.push((t) => {
    gem.rotation.y = t * 0.9 + phase;
    m.position.y = y + Math.sin(t * 1.6 + phase) * 0.35;
  });
  return m;
}

/** Invisible box that makes a model easy to click. */
function pickBox(parent: THREE.Object3D, w: number, h: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(G().box, new THREE.MeshBasicMaterial({ visible: false }));
  m.scale.set(w, h, d);
  m.userData.pickProxy = true;
  parent.add(m);
  return m;
}

function amp(parent: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  box(MATS.black(), x, y, z, 0.9 * s, 1.0 * s, 0.6 * s, parent);
  box(colored('#3a3a40', 1), x, y + 0.12 * s, z + 0.31 * s, 0.75 * s, 0.7 * s, 0.02, parent, false);
}

/* ------------------------------------------------------------------ */
/* Venues                                                              */
/* ------------------------------------------------------------------ */

export function buildVenue(v: VenuePlan): Model {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const f = Math.min(6.2, v.footprint / VENUE_SCALE);
  const genre = GENRES[v.genres[0]];
  const bodyColor = genre.style.palette[0];
  const neon = v.neon;
  let height = 3;
  const front = f * 0.42;

  switch (v.type) {
    case 'bar': {
      height = 2.6;
      tint(box(FACADES.brick(), 0, 0, 0, f * 0.9, height, f * 0.8, group), bodyColor);
      box(colored(neon, 0.6), 0, 1.25, front + 0.2, f * 0.72, 0.1, 0.9, group);
      sign(v.name, neon, 0.7, group, 0, 1.85, front + 0.06, 'neon', f * 0.85);
      box(glow('#ffb45e', 1.4), 0, 0.05, front + 0.01, 0.9, 1.05, 0.02, group, false);
      box(MATS.roof(), 0, height, 0, f * 0.92, 0.15, f * 0.82, group);
      break;
    }
    case 'club': {
      height = 4.2;
      const b = box(FACADES.industrial(), 0, 0, 0, f * 0.9, height, f * 0.85, group);
      tint(b, '#2b2b33');
      const n = glow(neon, 2.6);
      for (const [sx, sz, lx, lz] of [[0, 1, 1, 0], [0, -1, 1, 0], [1, 0, 0, 1], [-1, 0, 0, 1]]) {
        box(n, (sx * f * 0.9) / 2, height - 0.1, (sz * f * 0.85) / 2, lx ? f * 0.9 + 0.12 : 0.12, 0.12, lz ? f * 0.85 + 0.12 : 0.12, group, false);
      }
      box(n, 0, 0.02, front + 0.03, 1.1, 1.5, 0.04, group, false);
      const s = sign(v.name, neon, 0.95, group, 0, height + 0.75, 0, 'neon', f * 1.1);
      ticks.push((t) => {
        const on = Math.sin(t * 7.3) > -0.92 || Math.sin(t * 1.1) > 0;
        s.visible = on;
      });
      break;
    }
    case 'theater': {
      height = 6;
      const b = box(FACADES.classic(), 0, 0, 0, f, height, f * 0.85, group);
      tint(b, GENRES['classic-rock'].style.palette[1]);
      box(MATS.roof(), 0, height, 0, f + 0.3, 0.3, f * 0.85 + 0.3, group);
      mesh(G().pitched, colored('#4b3b30'), 0, height + 0.3, 0, f, 1.4, f * 0.85, group);
      box(colored('#1a1208'), 0, 2.1, front + 0.55, f * 0.8, 0.9, 1.1, group);
      sign(v.name, '#ffd27a', 0.8, group, 0, 2.55, front + 1.12, 'marquee', f * 0.78);
      box(glow('#fff1c1', 1.6), 0, 2.02, front + 0.55, f * 0.82, 0.08, 1.14, group, false);
      box(glow('#ffc27a', 1.3), 0, 0.05, front + 0.01, f * 0.5, 1.5, 0.02, group, false);
      break;
    }
    case 'concert-hall': {
      height = 4.4;
      const b = box(FACADES.glass(), 0, 0, 0, f, height, f * 0.9, group);
      tint(b, '#3a4050');
      mesh(G().barrel, MATS.metal(), 0, height, 0, f * 1.02, 3.4, f * 0.92, group);
      sign(v.name, neon, 0.8, group, 0, height - 0.7, front + 0.08, 'neon', f * 0.9);
      box(glow('#ffe2b0', 1.2), 0, 0.05, front + 0.02, f * 0.7, 1.8, 0.02, group, false);
      height += 1.7;
      break;
    }
    case 'record-store': {
      height = 2.9;
      const b = box(FACADES.brick(), 0, 0, 0, f * 0.85, height, f * 0.75, group);
      tint(b, genre.style.palette[1] ?? bodyColor);
      box(glow('#ffd9a0', 1.5), 0, 0.3, f * 0.375 + 0.01, f * 0.7, 1.2, 0.02, group, false);
      sign(v.name, neon, 0.55, group, 0, 1.95, f * 0.375 + 0.06, 'neon', f * 0.8);
      // Big spinning record on the roof.
      const disc = new THREE.Group();
      const vinylMat = new THREE.MeshStandardMaterial({ map: vinylTexture(neon), roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveMap: vinylTexture(neon), emissiveIntensity: 0.25 });
      const rec = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 40), [MATS.black(), vinylMat, vinylMat]);
      rec.rotation.x = Math.PI / 2;
      rec.scale.setScalar(f * 0.33);
      rec.castShadow = true;
      disc.add(rec);
      disc.position.set(0, height + f * 0.36 + 0.5, 0);
      group.add(disc);
      box(MATS.metal(), 0, height, 0, 0.12, 0.6, 0.12, group);
      ticks.push((t) => (disc.rotation.z = t * 1.2));
      ticks.push((t) => (disc.rotation.y = Math.sin(t * 0.4) * 0.6));
      height += f * 0.7 + 0.5;
      break;
    }
    case 'warehouse': {
      height = 3.4;
      const b = box(FACADES.industrial(), 0, 0, 0, f, height, f * 0.9, group);
      tint(b, genre.style.palette[2] ?? bodyColor);
      mesh(G().sawtooth, MATS.roof(), 0, height, 0, f, 1.2, f * 0.9, group);
      box(glow('#ff9a4a', 1.2), 0, 0.02, f * 0.45 + 0.01, f * 0.55, 2.0, 0.02, group, false);
      sign(v.name, neon, 0.75, group, 0, height - 0.6, f * 0.45 + 0.08, 'neon', f * 0.95);
      height += 1.2;
      break;
    }
    case 'rooftop': {
      height = 5.2;
      const b = box(FACADES.classic(), 0, 0, 0, f, height, f * 0.85, group);
      tint(b, genre.style.palette[0]);
      box(MATS.wood(), 0, height, 0, f * 0.7, 0.25, f * 0.5, group);
      amp(group, -f * 0.25, height + 0.25, -f * 0.15, 0.7);
      amp(group, f * 0.25, height + 0.25, -f * 0.15, 0.7);
      person(group, 0, 0, '#222', height + 0.25);
      person(group, -0.8, 0.3, '#444', height + 0.25);
      const spot = new THREE.Mesh(G().coneRound, new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      spot.scale.set(3, 5, 3);
      spot.rotation.x = Math.PI;
      spot.position.set(0, height + 5.5, 0);
      group.add(spot);
      sign(v.name, neon, 0.75, group, 0, height - 0.8, f * 0.425 + 0.06, 'neon', f * 0.9);
      height += 1.6;
      break;
    }
  }

  // A small brass plaque by the door with facts about the artists who play here.
  const brass = colored('#b8923a', 0.35, 0.8);
  box(MATS.darkMetal(), f * 0.36, 0, f * 0.5 + 0.35, 0.08, 1.0, 0.08, group);
  const plate = box(brass, f * 0.36, 0.95, f * 0.5 + 0.35, 0.55, 0.4, 0.05, group, false);
  plate.rotation.x = -0.35;
  pickBox(group, f, height + 1, f);
  marker(group, height + 3.2, neon, ticks, false);
  const outer = wrap(group, VENUE_SCALE, v.position.x, 0.18, v.position.z, v.rotation, { kind: 'venue', id: v.id });
  return { group: outer, height: height * VENUE_SCALE, ticks };
}

/** Per-mesh colour for facade meshes (facade materials are shared, so clone). */
function tint(m: THREE.Mesh, hex: string) {
  const base = m.material as THREE.MeshStandardMaterial;
  const key = `tinted|${base.uuid}|${hex}`;
  let mat = tintCache.get(key);
  if (!mat) {
    mat = base.clone();
    mat.onBeforeCompile = base.onBeforeCompile;
    mat.customProgramCacheKey = base.customProgramCacheKey;
    mat.color.set(hex);
    tintCache.set(key, mat);
  }
  m.material = mat;
}
const tintCache = new Map<string, THREE.MeshStandardMaterial>();

/* ------------------------------------------------------------------ */
/* Landmarks & monuments                                               */
/* ------------------------------------------------------------------ */

const CROWD = ['#d9d9d9', '#ff5a5f', '#3fa7d6', '#fac05e', '#59cd90', '#ee6352', '#8e7dbe', '#222'];

function crowd(parent: THREE.Object3D, cx: number, cz: number, w: number, d: number, n: number, seed: number) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const batch = new THREE.InstancedMesh(G().sphere, MATS.instanced(), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m.compose(new THREE.Vector3(cx + (r() - 0.5) * w, 0.22, cz + (r() - 0.5) * d), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.45, 0.3));
    batch.setMatrixAt(i, m);
    batch.setColorAt(i, new THREE.Color(CROWD[Math.floor(r() * CROWD.length)]));
  }
  batch.castShadow = false;
  parent.add(batch);
}

function stage(parent: THREE.Object3D, x: number, z: number, w: number, color: string, ticks: Tick[]) {
  box(MATS.black(), x, 0, z, w, 1, w * 0.55, parent);
  const truss = MATS.darkMetal();
  for (const sx of [-1, 1]) box(truss, x + (sx * w) / 2, 1, z - w * 0.2, 0.15, 2.6, 0.15, parent);
  box(truss, x, 3.5, z - w * 0.05, w + 0.2, 0.18, w * 0.5, parent);
  amp(parent, x - w * 0.55, 0, z, 1);
  amp(parent, x + w * 0.55, 0, z, 1);
  const light = box(glow(color, 2.2), x, 3.35, z + w * 0.15, w * 0.8, 0.08, 0.08, parent, false);
  ticks.push((t) => (light.visible = Math.sin(t * 5) > -0.6));
  person(parent, x - 0.8, z, '#111', 1);
  person(parent, x + 0.4, z + 0.2, '#333', 1);
  person(parent, x + 1.3, z - 0.3, '#222', 1);
}

export function buildLandmark(l: LandmarkPlan): Model {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const genre = GENRES[l.genres[0] ?? 'classic-rock'];
  const neon = genre.style.neon[0];
  const S = Math.min(11, l.footprint / LANDMARK_SCALE);
  let height = 6;
  const historical = l.type === 'historical';

  switch (l.model) {
    /* ---------- historical ---------- */
    case 'rooftop-stage': {
      height = 7;
      tint(box(FACADES.classic(), 0, 0, 0, S * 0.8, height, S * 0.65, group), '#b39b7e');
      box(MATS.stone(), 0, height, 0, S * 0.82, 0.3, S * 0.67, group);
      box(MATS.wood(), 0, height + 0.3, 0, S * 0.5, 0.25, S * 0.35, group);
      const y = height + 0.55;
      ['#2d2d2d', '#5a4632', '#20202a', '#6b6b6b', '#3a2f28'].forEach((c, i) => person(group, -1.8 + i * 0.9, 0.2 * (i % 2), c, y, 1.1));
      amp(group, -2.6, y, -0.9, 0.7);
      amp(group, 2.6, y, -0.9, 0.7);
      crowd(group, 0, S * 0.45, S * 0.8, 1.2, 40, 7);
      height += 2;
      break;
    }
    case 'crossing': {
      tint(box(FACADES.classic(), 0, 0, -S * 0.22, S * 0.75, 3.8, S * 0.35, group), '#e9e4d8');
      box(MATS.roof(), 0, 3.8, -S * 0.22, S * 0.77, 0.2, S * 0.37, group);
      sign('Studios', '#111', 0.6, group, 0, 2.9, -S * 0.22 + S * 0.175 + 0.03, 'plain', 4);
      box(MATS.asphalt(), 0, 0, S * 0.25, S, 0.06, 2.8, group, false);
      for (let i = 0; i < 7; i++) box(MATS.white(), -S * 0.3 + i * 0.55 + 1.3, 0.06, S * 0.25, 0.32, 0.02, 2.4, group, false);
      ['#e8e8e8', '#222', '#6b6b6b', '#2a3550'].forEach((c, i) => {
        const p = person(group, -1.6 + i * 1.1, S * 0.25, c, 0.06, 1.1);
        ticks.push((t) => (p.position.y = 0.06 + Math.abs(Math.sin(t * 4 + i)) * 0.08));
      });
      height = 4;
      break;
    }
    case 'cellar-club': {
      height = 4.5;
      tint(box(FACADES.brick(), 0, 0, 0, S * 0.6, height, S * 0.5, group), '#6b3b2e');
      box(MATS.black(), 0, 0, S * 0.25 + 0.4, 1.8, 0.1, 1.2, group, false);
      const arch = mesh(G().torus, MATS.stone(), 0, 1.4, S * 0.25 + 0.05, 1.6, 1.6, 1.6, group);
      arch.rotation.z = 0;
      box(glow('#ffb45e', 1.3), 0, 0.2, S * 0.25 + 0.02, 1.2, 1.4, 0.02, group, false);
      sign(l.name, neon, 0.8, group, 0, 3.1, S * 0.25 + 0.06, 'neon', S * 0.58);
      crowd(group, 0, S * 0.4, 5, 1.5, 18, 3);
      break;
    }
    case 'boat': {
      const boat = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-4.5, -1.3);
      shape.lineTo(3.2, -1.3);
      shape.quadraticCurveTo(5, 0, 3.2, 1.3);
      shape.lineTo(-4.5, 1.3);
      shape.closePath();
      const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      hullGeo.rotateX(Math.PI / 2);
      hullGeo.translate(0, 1, 0);
      const hull = new THREE.Mesh(hullGeo, colored('#20242c'));
      hull.castShadow = true;
      boat.add(hull);
      box(MATS.white(), -1.5, 1, 0, 3.4, 1.3, 1.9, boat);
      box(MATS.wood(), 1.6, 1, 0, 2.6, 0.2, 2.2, boat);
      ['#111', '#444', '#222', '#333'].forEach((c, i) => person(boat, 1 + (i % 2) * 1.1, -0.6 + i * 0.4, c, 1.2));
      amp(boat, 2.6, 1.2, -0.7, 0.6);
      const bulbs = glow('#fff1c1', 2.2);
      for (let i = 0; i < 9; i++) mesh(G().sphere, bulbs, -4 + i, 2.9 - Math.sin((i / 8) * Math.PI) * 0.4, 0, 0.14, 0.14, 0.14, boat, false);
      box(MATS.darkMetal(), -4.2, 1, 0, 0.1, 2.2, 0.1, boat);
      box(MATS.darkMetal(), 3.6, 1, 0, 0.1, 2.2, 0.1, boat);
      boat.scale.setScalar(0.9);
      group.add(boat);
      ticks.push((t) => {
        boat.position.y = Math.sin(t * 1.3) * 0.12 - 0.35;
        boat.rotation.x = Math.sin(t * 1.1) * 0.03;
      });
      height = 3.5;
      break;
    }
    case 'hall': {
      height = 5.5;
      tint(box(FACADES.classic(), 0, 0, -0.6, S * 0.85, height, S * 0.6, group), '#a4876a');
      for (let i = 0; i < 6; i++) mesh(G().cylinder, MATS.white(), -S * 0.35 + (i * S * 0.7) / 5, 0, S * 0.25, 0.5, height - 0.6, 0.5, group);
      box(MATS.white(), 0, height - 0.6, S * 0.12, S * 0.85, 0.6, S * 0.35, group);
      mesh(G().pitched, MATS.white(), 0, height, 0, S * 0.87, 1.4, S * 0.85, group);
      sign(l.name, '#1a1a1a', 0.55, group, 0, height - 0.3, S * 0.3, 'plain', S * 0.7);
      break;
    }
    case 'studio-wall': {
      height = 7.5;
      tint(box(FACADES.concrete(), -S * 0.15, 0, -S * 0.18, S * 0.55, height, S * 0.5, group), '#77746e');
      box(MATS.white(), 0, 0, S * 0.32, S * 0.95, 2.4, 0.45, group);
      const gm = new THREE.MeshStandardMaterial({ map: graffitiTexture(2), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
      const gpl = new THREE.Mesh(G().plane, gm);
      gpl.scale.set(4.5, 2, 1);
      gpl.position.set(-1.5, 1.2, S * 0.32 + 0.24);
      group.add(gpl);
      const gm2 = new THREE.MeshStandardMaterial({ map: graffitiTexture(5), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
      const gpl2 = new THREE.Mesh(G().plane, gm2);
      gpl2.scale.set(3.5, 1.6, 1);
      gpl2.position.set(2.6, 1.1, S * 0.32 + 0.24);
      group.add(gpl2);
      mesh(G().cylinder, MATS.stone(), S * 0.35, 0, -S * 0.25, 1, 5, 1, group);
      box(MATS.stone(), S * 0.35, 5, -S * 0.25, 1.8, 1.1, 1.8, group);
      box(glow('#fff4d0', 1.5), S * 0.35, 5.3, -S * 0.25, 1.85, 0.4, 1.85, group, false);
      sign('Hansa', neon, 0.8, group, -S * 0.15, height - 1.2, S * 0.07 + 0.05, 'neon', 4);
      break;
    }
    case 'theater': {
      height = 7.5;
      tint(box(FACADES.classic(), 0, 0, -0.5, S * 0.85, height, S * 0.7, group), '#8c6a4f');
      box(MATS.roof(), 0, height, -0.5, S * 0.87, 0.3, S * 0.72, group);
      mesh(G().dome, colored('#4f7a6a'), 0, height + 0.3, -0.5, 4, 3, 4, group);
      box(colored('#1a1208'), 0, 2.3, S * 0.35 - 0.5 + 0.6, S * 0.7, 1.2, 1.2, group);
      sign(l.name, '#ffd27a', 1.0, group, 0, 2.9, S * 0.35 - 0.5 + 1.22, 'marquee', S * 0.68);
      box(glow('#fff1c1', 1.6), 0, 2.26, S * 0.35 + 0.1, S * 0.72, 0.08, 1.24, group, false);
      box(glow('#ffc27a', 1.2), 0, 0.05, S * 0.35 - 0.49, S * 0.4, 1.8, 0.02, group, false);
      height += 3;
      break;
    }
    case 'festival-stage': {
      box(MATS.grass(), 0, 0, 0, S, 0.06, S, group, false);
      stage(group, 0, -S * 0.25, 5.5, neon, ticks);
      crowd(group, 0, S * 0.18, S * 0.8, S * 0.45, 140, 11);
      height = 4.5;
      break;
    }
    case 'power-station': {
      height = 6;
      tint(box(FACADES.brick(), 0, 0, 0, S * 0.7, height, S * 0.5, group), '#7a4a38');
      box(MATS.roof(), 0, height, 0, S * 0.72, 0.3, S * 0.52, group);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        mesh(G().cylinder, MATS.white(), (sx * S * 0.7) / 2, 0, (sz * S * 0.5) / 2, 0.9, 13, 0.9, group);
        mesh(G().cylinder, MATS.white(), (sx * S * 0.7) / 2, 0, (sz * S * 0.5) / 2, 1.1, 3, 1.1, group);
      }
      const pig = new THREE.Group();
      const pink = colored('#f4a6c0', 0.6);
      mesh(G().sphere, pink, 0, 0, 0, 3.2, 1.8, 1.8, pig);
      mesh(G().cylinder, pink, 1.7, -0.3, 0, 0.6, 0.6, 0.6, pig).rotation.z = Math.PI / 2;
      for (const [lx, lz] of [[1, 0.5], [1, -0.5], [-1, 0.5], [-1, -0.5]]) mesh(G().cylinderLow, pink, lx, -1.4, lz, 0.35, 0.8, 0.35, pig);
      mesh(G().cone, pink, 1.2, 0.8, 0.45, 0.5, 0.6, 0.3, pig);
      mesh(G().cone, pink, 1.2, 0.8, -0.45, 0.5, 0.6, 0.3, pig);
      pig.position.set(0, 16, 0);
      group.add(pig);
      ticks.push((t) => {
        pig.position.set(Math.sin(t * 0.17) * 3, 16 + Math.sin(t * 0.6) * 0.8, Math.cos(t * 0.13) * 2);
        pig.rotation.y = Math.sin(t * 0.2) * 0.6;
      });
      height = 18;
      break;
    }
    case 'park-stage': {
      box(MATS.grass(), 0, 0, 0, S, 0.06, S, group, false);
      stage(group, 0, -S * 0.28, 5, '#fff1c1', ticks);
      crowd(group, 0, S * 0.15, S * 0.85, S * 0.5, 160, 5);
      height = 4.5;
      break;
    }
    case 'stadium': {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 4.2, 2.6, 36, 1, true), colored('#cfcac0', 0.9));
      (ring.material as THREE.Material).side = THREE.DoubleSide;
      ring.position.y = 1.3;
      ring.scale.set(1, 1, 0.78);
      ring.castShadow = true;
      group.add(ring);
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 3.2, 36, 1, true), FACADES.concrete());
      outer.position.y = 1.6;
      outer.scale.set(1, 1, 0.8);
      group.add(outer);
      const pitch = new THREE.Mesh(new THREE.CircleGeometry(4.1, 36), MATS.grass());
      pitch.rotation.x = -Math.PI / 2;
      pitch.position.y = 0.08;
      pitch.scale.set(1, 0.76, 1);
      group.add(pitch);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.18, 8, 40, Math.PI), MATS.white());
      arch.position.y = 0;
      arch.castShadow = true;
      group.add(arch);
      crowd(group, 0, 0, 6, 4, 90, 13);
      box(MATS.black(), -3.2, 0, 0, 1.2, 1.2, 3.2, group);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        box(MATS.darkMetal(), sx * 5, 0, sz * 4, 0.2, 5.5, 0.2, group);
        box(glow('#ffffff', 2.5), sx * 5, 5.5, sz * 4, 0.9, 0.5, 0.2, group, false);
      }
      height = 7;
      break;
    }
    case 'bowery-club': {
      height = 6.5;
      tint(box(FACADES.brick(), 0, 0, 0, S * 0.45, height, S * 0.55, group), '#4a3a34');
      tint(box(FACADES.brick(), -S * 0.32, 0, 0, S * 0.2, height - 1, S * 0.55, group), '#5c4a40');
      tint(box(FACADES.brick(), S * 0.32, 0, 0, S * 0.2, height + 1, S * 0.55, group), '#58302a');
      box(MATS.white(), 0, 1.6, S * 0.275 + 0.6, S * 0.45, 0.12, 1.3, group);
      sign(l.name, '#1a1a1a', 0.55, group, 0, 1.45, S * 0.275 + 1.26, 'plain', S * 0.43);
      box(glow('#ffb45e', 1.2), 0, 0.05, S * 0.275 + 0.01, 1.0, 1.2, 0.02, group, false);
      for (let i = 1; i < 4; i++) box(MATS.darkMetal(), 0, 1.9 + i * 1.3, S * 0.275 + 0.35, S * 0.3, 0.08, 0.6, group);
      crowd(group, 0, S * 0.4, 4, 1, 12, 17);
      height += 1;
      break;
    }
    case 'silver-factory': {
      height = 4.5;
      const silver = std('silver', { color: 0xd8dce3, metalness: 1, roughness: 0.28 });
      box(silver, 0, 0, 0, S * 0.75, height, S * 0.6, group);
      box(glow('#fff4e0', 1.2), 0, 0.2, S * 0.3 + 0.01, S * 0.5, 1.4, 0.02, group, false);
      box(glow('#fff4e0', 1.0), 0, 2.4, S * 0.3 + 0.01, S * 0.6, 0.8, 0.02, group, false);
      sign(l.name, '#e8e8ff', 0.8, group, 0, height + 0.8, 0, 'neon', S * 0.7);
      height += 1.5;
      break;
    }
    case 'studio': {
      height = 5;
      tint(box(FACADES.glass(), 0, 0, 0, S * 0.7, height, S * 0.55, group), '#2b2f3a');
      // Neon outline around the roof edge.
      for (const [sx, sz, lx, lz] of [[0, 1, 1, 0], [0, -1, 1, 0], [1, 0, 0, 1], [-1, 0, 0, 1]]) {
        box(glow(neon, 2.4), (sx * S * 0.7) / 2, height, (sz * S * 0.55) / 2, lx ? S * 0.72 : 0.12, 0.12, lz ? S * 0.57 : 0.12, group, false);
      }
      const dish = mesh(G().dome, MATS.white(), S * 0.2, height + 0.6, 0, 1.6, 0.5, 1.6, group);
      dish.rotation.x = -0.9;
      sign(l.name, neon, 0.75, group, 0, height - 0.9, S * 0.275 + 0.06, 'neon', S * 0.65);
      break;
    }

    /* ---------- monuments (musical interpretation) ---------- */
    case 'safety-pin': {
      box(MATS.stone(), 0, 0, 0, 3.4, 1, 3.4, group);
      const pin = new THREE.Group();
      const steel = std('steel', { color: 0xc9ccd4, metalness: 1, roughness: 0.25 });
      mesh(G().cylinder, steel, -0.9, 1.6, 0, 0.35, 12.5, 0.35, pin);
      mesh(G().cylinder, steel, 0.9, 2.2, 0, 0.35, 11.6, 0.35, pin);
      const coil = mesh(G().torus, steel, 0, 1.4, 0, 1.9, 1.9, 3.5, pin);
      coil.rotation.y = 0;
      box(steel, 0, 13.4, 0, 2.6, 1.6, 0.9, pin);
      pin.rotation.z = -0.18;
      pin.position.y = 0.6;
      group.add(pin);
      height = 15;
      break;
    }
    case 'amp-stack': {
      box(MATS.stone(), 0, 0, 0, 8, 0.6, 5, group);
      for (const sx of [-1.9, 1.9]) {
        for (let i = 0; i < 3; i++) {
          box(MATS.black(), sx, 0.6 + i * 3.1, 0, 3.6, 3, 3, group);
          box(colored('#2e2e34', 1), sx, 0.9 + i * 3.1, 1.52, 3.2, 2.4, 0.04, group, false);
        }
      }
      box(MATS.black(), 0, 9.9, 0, 7.6, 1.8, 3, group);
      box(glow('#ffd27a', 2), 0, 10.6, 1.52, 3, 0.35, 0.04, group, false);
      for (let k = 0; k < 6; k++) mesh(G().cylinderLow, MATS.metal(), -2.5 + k, 10.2, 1.55, 0.25, 0.1, 0.25, group, false).rotation.x = Math.PI / 2;
      height = 12;
      break;
    }
    case 'kaleidoscope': {
      mesh(G().cylinder, MATS.stone(), 0, 0, 0, 3, 1, 3, group);
      const cols = ['#ff4ecd', '#3ef0ff', '#b8ff3e', '#ffcf3e', '#9d4edd'];
      cols.forEach((c, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 + i * 0.6, 0.14, 10, 48), glow(c, 1.8));
        ring.position.y = 6;
        group.add(ring);
        ticks.push((t) => {
          ring.rotation.x = t * (0.2 + i * 0.07) + i;
          ring.rotation.y = t * (0.13 + i * 0.05);
        });
      });
      mesh(G().sphere, glow('#ffffff', 2), 0, 6, 0, 0.8, 0.8, 0.8, group, false);
      mesh(G().cylinderLow, MATS.darkMetal(), 0, 1, 0, 0.3, 4, 0.3, group);
      height = 10;
      break;
    }
    case 'monolith': {
      box(MATS.stone(), 0, 0, 0, 5, 0.5, 3, group);
      const pm = new THREE.MeshStandardMaterial({ map: pulseTexture(), emissive: 0xffffff, emissiveMap: pulseTexture(), emissiveIntensity: 1.2, roughness: 0.6 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 0.9).translate(0, 6, 0), [MATS.black(), MATS.black(), MATS.black(), MATS.black(), pm, pm]);
      slab.position.y = 0.5;
      slab.castShadow = true;
      group.add(slab);
      ticks.push((t) => (pm.emissiveIntensity = 0.9 + Math.max(0, Math.sin(t * 2.2)) * 0.8));
      height = 13;
      break;
    }
    case 'oscillator': {
      mesh(G().cylinder, MATS.stone(), 0, 0, 0, 3.4, 0.6, 3.4, group);
      mesh(G().cylinder, MATS.metal(), 0, 0.6, 0, 0.6, 18, 0.6, group);
      mesh(G().sphere, glow('#00f5d4', 2.5), 0, 18.8, 0, 0.8, 0.8, 0.8, group, false);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(G().torus, glow(['#00f5d4', '#9b5de5', '#00bbf9', '#f15bb5'][i], 2.2));
        ring.rotation.x = Math.PI / 2;
        ring.scale.setScalar(2.2 - i * 0.3);
        group.add(ring);
        ticks.push((t) => (ring.position.y = 2 + ((t * 2.5 + i * 4) % 16)));
      }
      height = 19;
      break;
    }
    case 'glitter-ball': {
      mesh(G().cylinder, MATS.stone(), 0, 0, 0, 2.4, 1, 2.4, group);
      mesh(G().cylinderLow, MATS.darkMetal(), 0, 1, 0, 0.3, 3.5, 0.3, group);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 2), std('mirror', { color: 0xeeeeff, metalness: 1, roughness: 0.12, flatShading: true }));
      ball.position.y = 7;
      ball.castShadow = true;
      group.add(ball);
      const beams = new THREE.Group();
      ['#ff7ad9', '#ffd6ff', '#9d4edd', '#ffd700'].forEach((c, i) => {
        const beam = new THREE.Mesh(G().coneRound, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
        beam.scale.set(1.6, 9, 1.6);
        beam.position.y = 7;
        beam.rotation.z = Math.PI * 0.62;
        beam.rotation.y = (i / 4) * Math.PI * 2;
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / 4) * Math.PI * 2;
        pivot.add(beam);
        beams.add(pivot);
      });
      group.add(beams);
      ticks.push((t) => {
        ball.rotation.y = t * 0.35;
        beams.rotation.y = t * 0.25;
      });
      height = 10;
      break;
    }
    case 'fuzz-box': {
      box(colored('#c0392b', 0.5, 0.3), 0, 0, 0, 6, 2.4, 7.5, group);
      mesh(G().cylinder, MATS.metal(), 0, 2.4, 1.8, 1.4, 0.8, 1.4, group);
      for (const sx of [-1.8, 0, 1.8]) mesh(G().cylinder, MATS.black(), sx, 2.4, -2, 0.9, 0.7, 0.9, group);
      mesh(G().sphere, glow('#ff2020', 3), 0, 2.5, -0.2, 0.4, 0.4, 0.4, group, false);
      sign('Fuzz', '#111', 0.9, group, 0, 1.2, 3.77, 'plain', 4);
      const cable = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(3, 1, -2), new THREE.Vector3(4.6, 0.3, -3), new THREE.Vector3(5, 0.2, -5)]), 16, 0.18, 6),
        MATS.black(),
      );
      group.add(cable);
      height = 4;
      break;
    }
    case 'feedback-arch': {
      const steel = std('steel', { color: 0xc9ccd4, metalness: 1, roughness: 0.25 });
      const a1 = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 10, 40, Math.PI), steel);
      a1.castShadow = true;
      group.add(a1);
      const a2 = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.12, 8, 40, Math.PI), glow('#f7b32b', 2));
      group.add(a2);
      for (let i = 0; i < 6; i++) {
        const s = mesh(G().cylinderLow, glow('#5bc0eb', 1.6), -2.5 + i, 0, 0, 0.05, 3.4 + Math.sin((i / 5) * Math.PI) * 1.2, 0.05, group, false);
        ticks.push((t) => (s.scale.x = s.scale.z = 0.05 + Math.abs(Math.sin(t * 20 + i)) * 0.05));
      }
      height = 6;
      break;
    }
    case 'synth-pavilion': {
      box(MATS.black(), 0, 0, 0, 9.5, 0.8, 4.4, group);
      const keys: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < 14; i++) {
        const km = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: new THREE.Color('#4ecdc4'), emissiveIntensity: 0, roughness: 0.4 });
        keys.push(km);
        box(km, -4.2 + i * 0.64, 0.8, 0.3, 0.58, 0.4, 3.4, group);
      }
      for (const i of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) box(MATS.black(), -3.88 + i * 0.64, 1.2, -0.5, 0.36, 0.35, 2, group);
      mesh(G().barrel, colored('#e0fbfc', 0.3, 0.2), 0, 1.5, -1.2, 9.5, 5, 2, group).material = new THREE.MeshStandardMaterial({ color: 0xe0fbfc, transparent: true, opacity: 0.35, roughness: 0.1 });
      ticks.push((t) => keys.forEach((k, i) => (k.emissiveIntensity = Math.max(0, Math.sin(t * 3 - i * 0.6)) * 1.4)));
      height = 4;
      break;
    }
    case 'flying-v': {
      box(MATS.stone(), 0, 0, 0, 5, 0.6, 3, group);
      const guitar = new THREE.Group();
      // V-shaped body standing on its wing tips, neck pointing at the sky.
      const v = new THREE.Shape();
      v.moveTo(0, 8.2);
      v.lineTo(3.3, 0);
      v.lineTo(1.9, 0);
      v.lineTo(0, 4.4);
      v.lineTo(-1.9, 0);
      v.lineTo(-3.3, 0);
      v.closePath();
      const bodyGeo = new THREE.ExtrudeGeometry(v, { depth: 0.7, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
      bodyGeo.translate(0, 0, -0.35);
      const body = new THREE.Mesh(bodyGeo, colored('#b3121b', 0.3, 0.35));
      body.castShadow = true;
      guitar.add(body);
      box(colored('#2a1a12', 0.6), 0, 7.4, 0, 0.55, 8, 0.4, guitar);
      box(colored('#1b1410', 0.6), 0, 15.3, 0, 1.2, 2.2, 0.35, guitar);
      box(MATS.metal(), 0, 5.2, 0.42, 1.3, 0.45, 0.12, guitar);
      box(MATS.metal(), 0, 6.3, 0.42, 1.3, 0.45, 0.12, guitar);
      for (let i = 0; i < 6; i++) mesh(G().cylinderLow, glow('#ff3b30', 2.2), -0.22 + i * 0.088, 3.6, 0.46, 0.025, 11.8, 0.025, guitar, false);
      guitar.position.y = 0.6;
      group.add(guitar);
      ticks.push((t) => (guitar.rotation.y = Math.sin(t * 0.3) * 0.4));
      height = 17.5;
      break;
    }
    case 'cassette': {
      box(MATS.stone(), 0, 0, 0, 9, 0.5, 3, group);
      const tape = new THREE.Group();
      box(colored('#f2efe6', 0.6), 0, 0, 0, 8.4, 5.4, 1.2, tape);
      box(colored('#f28482', 0.8), 0, 3.3, 0.62, 6.8, 1.4, 0.02, tape, false);
      box(MATS.black(), 0, 1.2, 0.62, 5.4, 1.8, 0.02, tape, false);
      for (const sx of [-1.5, 1.5]) {
        const reel = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 6), glow('#f9c74f', 1.6));
        hub.rotation.x = Math.PI / 2;
        reel.add(hub);
        reel.position.set(sx, 2.1, 0.66);
        tape.add(reel);
        ticks.push((t) => (reel.rotation.z = -t * 1.4));
      }
      tape.position.y = 0.5;
      group.add(tape);
      height = 7;
      break;
    }
    case 'anvil': {
      box(MATS.stone(), 0, 0, 0, 7, 0.6, 4, group);
      const iron = std('iron', { color: 0x1c1c20, metalness: 0.8, roughness: 0.45 });
      box(iron, 0, 0.6, 0, 3.4, 1.2, 2.2, group);
      box(iron, 0, 1.8, 0, 1.6, 2.2, 1.4, group);
      const top = new THREE.Shape();
      top.moveTo(-3.2, 0);
      top.lineTo(2.2, 0);
      top.quadraticCurveTo(4.6, 0.2, 5.4, 1.4);
      top.lineTo(2.2, 1.6);
      top.lineTo(-3.2, 1.6);
      top.closePath();
      const topGeo = new THREE.ExtrudeGeometry(top, { depth: 2.2, bevelEnabled: false });
      topGeo.translate(-0.8, 4, -1.1);
      const anvilTop = new THREE.Mesh(topGeo, iron);
      anvilTop.castShadow = true;
      group.add(anvilTop);
      const heat = box(glow('#ff3b1f', 2.2), -0.2, 5.6, 0, 4, 0.06, 1.6, group, false);
      ticks.push((t) => (heat.scale.y = 0.06 * (0.6 + 0.4 * Math.sin(t * 3))));
      height = 7;
      break;
    }
    case 'boombox': {
      box(MATS.stone(), 0, 0, 0, 10, 0.5, 3.5, group);
      box(MATS.darkMetal(), 0, 0.5, 0, 9.4, 5, 2.4, group);
      mesh(G().cylinderLow, MATS.metal(), 0, 5.5, 0, 0.25, 1.6, 0.25, group).rotation.z = Math.PI / 2;
      box(MATS.metal(), -3.5, 5.5, 0, 0.3, 1.6, 0.3, group);
      box(MATS.metal(), 3.5, 5.5, 0, 0.3, 1.6, 0.3, group);
      box(MATS.metal(), 0, 6.9, 0, 7.3, 0.3, 0.3, group);
      box(glow('#2ec4b6', 1.8), 0, 4.4, 1.22, 3.2, 0.7, 0.04, group, false);
      for (const sx of [-3, 3]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), MATS.black());
        cone.position.set(sx, 2.6, 1.22);
        group.add(cone);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.8, 32), glow('#ffd23f', 1.8));
        ring.position.set(sx, 2.6, 1.23);
        group.add(ring);
        const dust = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), MATS.metal());
        dust.position.set(sx, 2.6, 1.25);
        group.add(dust);
        ticks.push((t) => {
          const k = 1 + Math.max(0, Math.sin(t * 8.4)) * 0.12;
          cone.scale.setScalar(k);
          dust.scale.setScalar(k);
        });
      }
      height = 8;
      break;
    }
    case 'saxophone': {
      mesh(G().cylinder, MATS.stone(), 0, 0, 0, 4, 0.6, 4, group);
      const brass = std('brass', { color: 0xc9a14a, metalness: 1, roughness: 0.28 });
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.6, 16, 0),
        new THREE.Vector3(0, 14.5, 0),
        new THREE.Vector3(0, 9, 0),
        new THREE.Vector3(0, 4, 0),
        new THREE.Vector3(0.6, 2.2, 0),
        new THREE.Vector3(2, 1.8, 0),
        new THREE.Vector3(2.8, 3.2, 0),
        new THREE.Vector3(3, 5.4, 0),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.62, 16), brass);
      tube.castShadow = true;
      group.add(tube);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.62, 2, 24, 1, true), brass);
      (bell.material as THREE.Material).side = THREE.DoubleSide;
      bell.position.set(3, 6.3, 0);
      group.add(bell);
      for (let i = 0; i < 7; i++) mesh(G().cylinderLow, brass, 0.62, 5 + i * 1.3, 0, 0.5, 0.2, 0.5, group).rotation.z = Math.PI / 2;
      mesh(G().sphere, glow('#4cc9f0', 1.6), 3, 6.9, 0, 1.6, 0.25, 1.6, group, false);
      height = 17;
      break;
    }
    case 'golden-record': {
      box(MATS.stone(), 0, 0, 0, 6, 0.6, 3, group);
      box(MATS.darkMetal(), 0, 0.6, 0, 0.6, 5, 0.6, group);
      const disc = new THREE.Group();
      const gold = std('gold', { color: 0xe6b84c, metalness: 1, roughness: 0.22 });
      const rec = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 64), gold);
      rec.rotation.x = Math.PI / 2;
      rec.castShadow = true;
      disc.add(rec);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.34, 32), glow('#ff5d8f', 1.4));
      label.rotation.x = Math.PI / 2;
      disc.add(label);
      disc.position.y = 9.5;
      group.add(disc);
      ticks.push((t) => (disc.rotation.z = t * 0.6));
      height = 14;
      break;
    }
    case 'sound-system': {
      box(MATS.stone(), 0, 0, 0, 10, 0.5, 4, group);
      const colors = ['#b5523b', '#e0a458', '#4f7a3a', '#1d1d1f'];
      const cones: THREE.Mesh[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3 - (row === 3 ? 1 : 0); col++) {
          const w = 3;
          const x = (col - (row === 3 ? 0.5 : 1)) * (w + 0.1);
          const y = 0.5 + row * 2.3;
          box(colored(colors[(row + col) % colors.length], 0.8), x, y, 0, w, 2.2, 2.4, group);
          const cone = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), MATS.black());
          cone.position.set(x, y + 1.1, 1.22);
          group.add(cone);
          cones.push(cone);
        }
      }
      ticks.push((t) => cones.forEach((c, i) => c.scale.setScalar(1 + Math.max(0, Math.sin(t * 7.5 + (i % 2) * 0.5)) * 0.15)));
      box(glow('#f9d423', 1.8), 0, 9.7, 1.22, 6, 0.3, 0.04, group, false);
      height = 10;
      break;
    }
    case 'gallery-cube': {
      box(MATS.stone(), 0, 0, 0, 4, 0.4, 4, group);
      mesh(G().cylinderLow, MATS.darkMetal(), 0, 0.4, 0, 0.3, 1.2, 0.3, group);
      const cube = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), std('gallery', { color: 0xf2efe8, roughness: 0.5 }));
      cube.rotation.set(Math.atan(Math.SQRT1_2), 0, Math.PI / 4);
      cube.position.y = 1.6 + Math.sqrt(3) * 2;
      cube.castShadow = true;
      group.add(cube);
      ticks.push((t) => (cube.rotation.y = t * 0.15));
      mesh(G().sphere, glow('#ffe45e', 2), 0, 1.4, 0, 0.4, 0.4, 0.4, group, false);
      height = 9;
      break;
    }
  }

  pickBox(group, S * 0.9, height + 1, S * 0.9);
  marker(group, height + 3.5, historical ? '#ffcf6b' : '#c9b6ff', ticks, historical);
  const outer = wrap(group, LANDMARK_SCALE, l.position.x, l.model === 'boat' ? 0.05 : 0.2, l.position.z, l.rotation, { kind: 'landmark', id: l.id });
  return { group: outer, height: height * LANDMARK_SCALE, ticks };
}

/* ------------------------------------------------------------------ */
/* Record label towers                                                 */
/* ------------------------------------------------------------------ */

export function buildLabelTower(t: LabelTowerPlan): Model {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const H = t.height;
  const round = t.labelId.length % 3 === 0;
  box(MATS.plinth(), 0, 0, 0, 13, 0.35, 13, group);
  // Glass lobby with a glowing entrance.
  box(FACADES.glass(), 0, 0.35, 0, 10, 4, 10, group);
  box(glow(t.color, 1.6), 0, 0.5, 5.02, 3.2, 2.6, 0.05, group, false);
  sign(t.name, t.color, 0.9, group, 0, 4.9, 5.15, 'neon', 9);
  const shaftH = H - 9;
  const w = 7;
  if (round) {
    const shaft = mesh(G().cylinder, FACADES.glass(), 0, 4.35, 0, w + 0.6, shaftH, w + 0.6, group);
    tint(shaft, '#a9b8d6');
    const ring = new THREE.TorusGeometry((w + 0.75) / 2, 0.07, 6, 48);
    for (let y = 10; y < shaftH - 2; y += 10) {
      const r = new THREE.Mesh(ring, glow(t.color, 1.4));
      r.rotation.x = Math.PI / 2;
      r.position.y = 4.35 + y;
      group.add(r);
    }
  } else {
    const shaft = box(FACADES.glass(), 0, 4.35, 0, w, shaftH, w, group);
    tint(shaft, '#b7c3dc');
    // Neon edges running up the corners.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(glow(t.color, 1.8), (sx * w) / 2, 4.35, (sz * w) / 2, 0.16, shaftH, 0.16, group, false);
  }
  const top = 4.35 + shaftH;
  box(MATS.darkMetal(), 0, top, 0, w + 0.6, 0.6, w + 0.6, group);
  // The label's name on all four sides near the top.
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i * Math.PI) / 2;
    group.add(holder);
    sign(t.name, t.color, 1.4, holder, 0, top - 2.2, w / 2 + (round ? 0.45 : 0.08), 'neon', w - 0.4);
  }
  // A giant record spinning on the roof.
  const disc = new THREE.Group();
  const tex = vinylTexture(t.color);
  const vinylMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 });
  const rec = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.2, 48), [MATS.black(), vinylMat, vinylMat]);
  rec.rotation.x = Math.PI / 2;
  rec.scale.setScalar(3.6);
  rec.castShadow = true;
  disc.add(rec);
  disc.position.set(0, top + 4.6, 0);
  group.add(disc);
  box(MATS.metal(), 0, top + 0.6, 0, 0.3, 0.8, 0.3, group);
  ticks.push((time) => {
    rec.rotation.y = time * 0.9;
    disc.rotation.y = time * 0.25;
  });
  // Beacon light.
  const beacon = mesh(G().sphere, glow(t.color, 2.4), 0, top + 8.6, 0, 0.5, 0.5, 0.5, group, false);
  ticks.push((time) => (beacon.visible = Math.sin(time * 2.2 + H) > -0.2));
  pickBox(group, 12, H + 2, 12);
  const outer = wrap(group, 1, t.position.x, 0.18, t.position.z, 0, { kind: 'label', id: t.id });
  return { group: outer, height: top + 9, ticks };
}

/* ------------------------------------------------------------------ */
/* Street buskers                                                      */
/* ------------------------------------------------------------------ */

export const BUSKER_SCALE = 1.5;

export function buildBusker(b: BuskerPlan): Model {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const color = GENRES[b.genre].style.neon[0];
  // Pool of light on the pavement.
  const pool = new THREE.Mesh(G().groundPlane, new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pool.scale.set(3.2, 1, 3.2);
  pool.position.y = 0.03;
  group.add(pool);
  const coat = ['#2b2d42', '#6d2e46', '#264653', '#3d405b', '#5e503f'][b.id.length % 5];
  const body = person(group, 0, 0, coat, 0, 1.25);
  const wood = colored('#8a5a2b', 0.6);
  const gold = colored('#d4a73a', 0.3, 0.8);
  const dark = MATS.black();
  const inst = new THREE.Group();
  body.add(inst);
  switch (b.instrument) {
    case 'guitar':
    case 'bass': {
      const long = b.instrument === 'bass' ? 1.3 : 1;
      box(b.instrument === 'bass' ? colored('#1d3557', 0.4) : wood, 0, 0.18, 0.2, 0.34, 0.4, 0.08, inst);
      box(dark, 0.32 * long, 0.36, 0.2, 0.55 * long, 0.05, 0.05, inst).rotation.z = 0.35;
      inst.rotation.z = -0.35;
      break;
    }
    case 'violin':
      box(wood, 0.12, 0.62, 0.18, 0.12, 0.3, 0.06, inst).rotation.z = 1.1;
      box(dark, -0.05, 0.75, 0.25, 0.5, 0.015, 0.015, inst).rotation.z = -0.4;
      break;
    case 'sax':
      mesh(G().cylinderLow, gold, 0.1, 0.1, 0.2, 0.08, 0.5, 0.08, inst).rotation.z = 0.2;
      mesh(G().coneRound, gold, 0.12, 0.05, 0.28, 0.2, 0.18, 0.2, inst).rotation.x = -1.2;
      break;
    case 'trumpet':
      mesh(G().cylinderLow, gold, 0, 0.72, 0.35, 0.05, 0.45, 0.05, inst).rotation.x = Math.PI / 2;
      mesh(G().coneRound, gold, 0, 0.72, 0.6, 0.18, 0.18, 0.18, inst).rotation.x = Math.PI / 2;
      break;
    case 'keys':
      box(dark, 0, 0.35, 0.45, 0.9, 0.08, 0.3, group);
      box(MATS.white(), 0, 0.43, 0.42, 0.84, 0.02, 0.16, group, false);
      box(MATS.metal(), -0.35, 0, 0.45, 0.04, 0.35, 0.04, group);
      box(MATS.metal(), 0.35, 0, 0.45, 0.04, 0.35, 0.04, group);
      break;
    case 'drums':
      mesh(G().cylinder, colored('#b33', 0.5), 0.35, 0, 0.35, 0.4, 0.3, 0.4, group);
      mesh(G().cylinder, colored('#ddd', 0.5), -0.35, 0, 0.35, 0.35, 0.36, 0.35, group);
      mesh(G().cylinder, gold, 0, 0.62, 0.55, 0.45, 0.02, 0.45, group, false);
      break;
    case 'turntables': {
      box(dark, 0, 0, 0.5, 1.1, 0.5, 0.45, group);
      for (const sx of [-0.28, 0.28]) {
        const d = mesh(G().cylinder, colored('#111', 0.3), sx, 0.5, 0.5, 0.36, 0.02, 0.36, group, false);
        ticks.push((t) => (d.rotation.y = t * 3));
      }
      mesh(G().sphere, glow(color, 1.5), 0, 0.52, 0.66, 0.08, 0.04, 0.04, group, false);
      break;
    }
    case 'mic':
      box(MATS.metal(), 0, 0, 0.35, 0.03, 0.75, 0.03, group);
      mesh(G().sphere, dark, 0, 0.78, 0.35, 0.09, 0.12, 0.09, group);
      break;
  }
  // Open case with coins.
  box(colored('#3b2a20'), 0.7, 0, 0.55, 0.5, 0.06, 0.25, group);
  box(colored('#7a1f2b', 1), 0.7, 0.06, 0.55, 0.44, 0.01, 0.2, group, false);
  for (let i = 0; i < 3; i++) mesh(G().cylinder, gold, 0.6 + i * 0.09, 0.075, 0.52 + (i % 2) * 0.06, 0.05, 0.01, 0.05, group, false);
  // Notes drifting up.
  const notes: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture(), color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.setScalar(0.35);
    group.add(sp);
    notes.push(sp);
  }
  const phase = (b.position.x * 7.1 + b.position.z * 3.3) % 6;
  ticks.push((t) => {
    body.position.y = Math.abs(Math.sin(t * 4 + phase)) * 0.05;
    body.rotation.y = Math.sin(t * 1.3 + phase) * 0.15;
    notes.forEach((n, i) => {
      const k = (t * 0.45 + i / 3 + phase) % 1;
      n.position.set(Math.sin((k + i) * 5) * 0.35, 1.2 + k * 1.6, 0.2);
      (n.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI);
    });
  });
  pickBox(group, 1.8, 2, 1.8);
  const outer = wrap(group, BUSKER_SCALE, b.position.x, 0.2, b.position.z, b.rotation, { kind: 'busker', id: b.id });
  return { group: outer, height: 2 * BUSKER_SCALE, ticks };
}

/* ------------------------------------------------------------------ */
/* Artist homes                                                        */
/* ------------------------------------------------------------------ */

export function buildHome(h: HomePlan, artistName: string): Model {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const g = GENRES[h.genre];
  const w = Math.min(6.4, Math.max(3.4, h.width));
  const d = Math.min(6.4, Math.max(3.4, h.depth));
  const accent = g.style.neon[0];
  let height = 4;
  // Little front garden with a low fence.
  box(MATS.grass(), 0, 0, 0, w + 0.8, 0.08, d + 0.8, group);
  for (const sx of [-1, 1]) box(MATS.white(), (sx * (w + 0.7)) / 2, 0, 0, 0.08, 0.45, d + 0.7, group, false);
  box(MATS.white(), 0, 0, -(d + 0.7) / 2, w + 0.7, 0.45, 0.08, group, false);
  if (h.style === 'house') {
    height = 4.6;
    tint(box(FACADES.brick(), 0, 0, 0, w * 0.82, height, d * 0.7, group), g.style.palette[0]);
    mesh(G().pitched, colored('#3b2d27'), 0, height, 0, w * 0.86, 1.8, d * 0.74, group);
    box(colored('#3b2d27'), w * 0.25, height + 0.6, 0, 0.45, 1.6, 0.45, group);
  } else if (h.style === 'studio') {
    height = 5;
    tint(box(FACADES.glass(), 0, 0, 0, w * 0.85, height, d * 0.75, group), '#8fa2c9');
    box(glow(accent, 1.8), 0, height - 0.15, 0, w * 0.87, 0.12, d * 0.77, group, false);
    const dish = mesh(G().dome, MATS.metal(), -w * 0.2, height, d * 0.1, 1.1, 0.5, 1.1, group);
    dish.rotation.z = 0.6;
    sign('STUDIO', accent, 0.45, group, 0, height - 0.8, (d * 0.75) / 2 + 0.05, 'neon', w * 0.6);
  } else {
    height = 5.6;
    tint(box(FACADES.industrial(), 0, 0, 0, w * 0.86, height, d * 0.76, group), g.style.palette[1] ?? g.style.palette[0]);
    mesh(G().sawtooth, MATS.roof(), 0, height, 0, w * 0.86, 1, d * 0.76, group);
    box(glow('#ffcf8a', 1.2), 0, 0.1, (d * 0.76) / 2 + 0.02, w * 0.4, 2.2, 0.03, group, false);
  }
  // Front door glow and a name plate.
  box(glow('#ffd9a0', 1.4), -w * 0.18, 0.1, (d * 0.76) / 2 + 0.03, 0.8, 1.7, 0.03, group, false);
  sign(artistName, '#ffd27a', 0.42, group, -w * 0.18, 2.2, (d * 0.76) / 2 + 0.12, 'marquee', w * 0.7);
  pickBox(group, w, height + 1.5, d);
  marker(group, height + 3, '#8ff0c8', ticks, false);
  const outer = wrap(group, 1, h.position.x, 0.18, h.position.z, h.rotation, { kind: 'home', id: h.id });
  return { group: outer, height: height + 2, ticks };
}

/* ------------------------------------------------------------------ */
/* Album billboards                                                    */
/* ------------------------------------------------------------------ */

export interface BillboardModel extends Model {
  setArt(texture: THREE.Texture): void;
}

export function buildBillboard(b: BillboardPlan, artistName: string): BillboardModel {
  const group = new THREE.Group();
  const ticks: Tick[] = [];
  const g = GENRES[b.genre];
  const B = 7.5;
  const legs = 2.4;
  for (const sx of [-1, 1]) box(MATS.darkMetal(), sx * B * 0.3, 0, 0, 0.22, legs + 0.5, 0.22, group);
  box(MATS.darkMetal(), 0, legs, -0.1, B + 0.5, B + 0.5, 0.25, group);
  const seed = Math.abs(Math.round(b.position.x * 13 + b.position.z * 7));
  const tex = sleeveTexture(artistName, b.title, seed, [g.style.neon[0], g.style.neon[1] ?? '#ffd27a', g.style.palette[0]]);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.color.setScalar(1.05);
  const faces: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(G().plane, mat);
    face.scale.set(B, B, 1);
    face.position.set(0, legs + 0.25 + B / 2, side * 0.05);
    if (side < 0) face.rotation.y = Math.PI;
    group.add(face);
    faces.push(face);
  }
  // Lamp bar above the board.
  box(glow('#fff1cc', 1.6), 0, legs + B + 0.55, 0.35, B * 0.9, 0.12, 0.12, group, false);
  box(glow('#fff1cc', 1.6), 0, legs + B + 0.55, -0.35, B * 0.9, 0.12, 0.12, group, false);
  sign(`${artistName} · ${b.title}${b.year ? ` (${b.year})` : ''}`, '#ffffff', 0.55, group, 0, legs - 0.05, 0.2, 'marquee', B);
  pickBox(group, B, B + legs, 1.2);
  const outer = wrap(group, 1, b.position.x, b.baseHeight + 0.2, b.position.z, b.rotation, { kind: 'billboard', id: b.id });
  return {
    group: outer,
    height: b.baseHeight + legs + B,
    ticks,
    setArt(texture: THREE.Texture) {
      mat.map = texture;
      mat.needsUpdate = true;
    },
  };
}

/** Shared building blocks for other model files (interiors). */
export { amp, box, colored, mesh, person, sign };
