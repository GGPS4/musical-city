import * as THREE from 'three';
import { GENRES } from '../data/genres.js';
import type { VenuePlan } from '../types.js';
import { geo } from './geometries.js';
import { MATS, glow } from './materials.js';
import { amp, box, colored, mesh, person, sign, type Tick } from './models.js';
import { beamTexture, glowTexture, vinylTexture } from './textures.js';

/**
 * Walk-in venue interiors. Each is its own small THREE.Scene (so the city
 * doesn't render while you're inside), centred on the origin with the door
 * on the +z wall and the stage (if any) against the −z wall.
 */

export interface RoomBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface Interior {
  scene: THREE.Scene;
  venueId: string;
  hw: number;
  hd: number;
  boxes: RoomBox[];
  spawn: { x: number; z: number; yaw: number };
  ticks: Tick[];
  pickables: THREE.Object3D[];
  dispose(): void;
}

const G = () => geo();
const CROWD = ['#d9d9d9', '#ff5a5f', '#3fa7d6', '#fac05e', '#59cd90', '#ee6352', '#8e7dbe', '#2b2b2b', '#f28482'];
const H = 2.3; // person scale: about 1.7 m, matching the walking eye height

function rand(seed: number) {
  let s = seed % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** A dancing crowd filling a rectangle, bobbing to roughly 122 bpm. */
function crowdIn(scene: THREE.Object3D, ticks: Tick[], cx: number, cz: number, w: number, d: number, n: number, seed: number, keepClear: RoomBox[] = []) {
  const r = rand(seed);
  const spots: { x: number; z: number; s: number; ph: number }[] = [];
  let tries = 0;
  while (spots.length < n && tries++ < n * 8) {
    const x = cx + (r() - 0.5) * w;
    const z = cz + (r() - 0.5) * d;
    if (keepClear.some((b) => Math.abs(x - b.x) < b.hw + 0.6 && Math.abs(z - b.z) < b.hd + 0.6)) continue;
    spots.push({ x, z, s: 0.9 + r() * 0.25, ph: r() * 6.28 });
  }
  const bodies = new THREE.InstancedMesh(G().cylinderLow, MATS.instanced(), spots.length);
  const heads = new THREE.InstancedMesh(G().sphere, colored('#e2b99a'), spots.length);
  spots.forEach((_, i) => bodies.setColorAt(i, new THREE.Color(CROWD[i % CROWD.length])));
  bodies.frustumCulled = heads.frustumCulled = false;
  scene.add(bodies, heads);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  ticks.push((t) => {
    const beat = (t * 122) / 60;
    spots.forEach((s, i) => {
      const hop = Math.max(0, Math.sin((beat + s.ph * 0.15) * Math.PI * 2)) * 0.14;
      m.compose(p.set(s.x, hop, s.z), q, sc.set(0.24 * H * s.s, 0.5 * H * s.s, 0.24 * H * s.s));
      bodies.setMatrixAt(i, m);
      m.compose(p.set(s.x, hop + 0.62 * H * s.s, s.z), q, sc.setScalar(0.2 * H * s.s));
      heads.setMatrixAt(i, m);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  });
}

/** A band member with an instrument, swaying. */
function player(scene: THREE.Object3D, ticks: Tick[], x: number, z: number, y: number, kind: 'guitar' | 'bass' | 'mic' | 'keys' | 'drums' | 'decks', color: string, phase: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  scene.add(g);
  const body = person(g, 0, 0, color, 0, H);
  const wood = colored('#8a5a2b', 0.6);
  const dark = MATS.black();
  if (kind === 'guitar' || kind === 'bass') {
    const inst = new THREE.Group();
    body.add(inst);
    box(kind === 'bass' ? colored('#1d3557', 0.4) : wood, 0, 0.35 * H * 0.5, 0.25, 0.4, 0.45, 0.09, inst);
    box(dark, 0.45, 0.62, 0.25, kind === 'bass' ? 0.95 : 0.75, 0.06, 0.06, inst).rotation.z = 0.35;
    inst.rotation.z = -0.3;
  } else if (kind === 'mic') {
    box(MATS.metal(), 0, 0, 0.5, 0.04, 1.45, 0.04, g);
    mesh(G().sphere, dark, 0, 1.5, 0.5, 0.12, 0.16, 0.12, g);
  } else if (kind === 'keys') {
    box(dark, 0, 0.8, 0.6, 1.3, 0.1, 0.4, g);
    box(MATS.white(), 0, 0.9, 0.56, 1.2, 0.02, 0.2, g, false);
    box(MATS.metal(), 0, 0, 0.6, 0.06, 0.8, 0.06, g);
  } else if (kind === 'drums') {
    mesh(G().cylinder, colored('#b33', 0.5), 0, 0, 0.8, 0.8, 0.65, 0.8, g).rotation.x = Math.PI / 2;
    mesh(G().cylinder, colored('#ddd', 0.5), -0.7, 0.55, 0.6, 0.45, 0.25, 0.45, g);
    mesh(G().cylinder, colored('#ddd', 0.5), 0.7, 0.55, 0.6, 0.45, 0.25, 0.45, g);
    for (const sx of [-1, 1]) {
      box(MATS.metal(), sx * 1.1, 0, 0.3, 0.04, 1.2, 0.04, g);
      mesh(G().cylinder, colored('#d4a73a', 0.3, 0.8), sx * 1.1, 1.2, 0.3, 0.7, 0.02, 0.7, g, false);
    }
  } else if (kind === 'decks') {
    box(dark, 0, 0, 0.7, 1.8, 1.0, 0.7, g);
    for (const sx of [-0.45, 0.45]) {
      const d = mesh(G().cylinder, colored('#111', 0.3), sx, 1.0, 0.7, 0.6, 0.03, 0.6, g, false);
      ticks.push((t) => (d.rotation.y = t * 3.3));
    }
  }
  ticks.push((t) => {
    body.rotation.y = Math.sin(t * 2.1 + phase) * 0.25;
    body.position.y = Math.abs(Math.sin(t * 4.07 + phase)) * 0.06;
  });
}

function spotBeam(scene: THREE.Object3D, ticks: Tick[], x: number, y: number, z: number, color: string, phase: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 1.6, y, 16, 1, true).translate(0, -y / 2, 0),
    new THREE.MeshBasicMaterial({ map: beamTexture(), color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  beam.geometry.rotateX(Math.PI);
  pivot.add(beam);
  box(MATS.darkMetal(), 0, -0.2, 0, 0.4, 0.4, 0.4, pivot, false);
  scene.add(pivot);
  ticks.push((t) => {
    pivot.rotation.x = Math.PI + Math.sin(t * 0.9 + phase) * 0.35;
    pivot.rotation.z = Math.cos(t * 0.7 + phase) * 0.35;
  });
}

export function buildInterior(v: VenuePlan, artistNames: string[], env: THREE.Texture | null): Interior {
  const scene = new THREE.Scene();
  const ticks: Tick[] = [];
  const pickables: THREE.Object3D[] = [];
  const boxes: RoomBox[] = [];
  const g = GENRES[v.genres[0]];
  const neon = v.neon;
  const neon2 = g.style.neon[1] ?? neon;
  const seed = hash(v.id);
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  const t = v.type;
  const size: Record<string, [number, number, number]> = {
    bar: [16, 22, 5],
    club: [22, 26, 6.5],
    theater: [26, 34, 10],
    'concert-hall': [28, 36, 11],
    warehouse: [24, 30, 8.5],
    rooftop: [22, 26, 0],
    'record-store': [14, 20, 4.6],
  };
  const [W, D, Hh] = size[t] ?? [18, 24, 6];
  const hw = W / 2;
  const hd = D / 2;
  const open = t === 'rooftop';

  scene.background = new THREE.Color(open ? '#070817' : '#050507');
  scene.fog = new THREE.Fog(open ? '#0a0b1a' : '#0b0a10', 18, open ? 160 : 70);

  // Light: dim ambient, coloured wash and a warm key over the room.
  scene.add(new THREE.HemisphereLight(open ? 0x5a66a8 : 0x3a3050, 0x100c0a, open ? 0.9 : 0.55));
  const wash = new THREE.PointLight(neon, 60, 40, 1.4);
  wash.position.set(0, (Hh || 8) - 0.8, -hd + 4);
  const key = new THREE.PointLight('#ffd9a8', 35, 40, 1.5);
  key.position.set(0, (Hh || 8) - 0.8, hd * 0.3);
  scene.add(wash, key);
  ticks.push((time) => (wash.intensity = 45 + Math.max(0, Math.sin(time * 12.8)) * 40));

  // Shell.
  const floorMat = t === 'club' ? colored('#101014', 0.35, 0.3) : t === 'warehouse' ? colored('#3a3a3c', 0.95) : t === 'record-store' ? colored('#6b4a32', 0.7) : colored('#2b1d18', 0.6);
  box(floorMat, 0, -0.1, 0, W, 0.1, D, scene, false);
  const wallMat = t === 'warehouse' ? colored('#5a4a42', 0.95) : t === 'bar' ? colored('#4a2a22', 0.9) : t === 'record-store' ? colored('#e8dcc4', 0.9) : t === 'theater' || t === 'concert-hall' ? colored('#5a1a22', 0.85) : colored('#141418', 0.8);
  if (open) {
    // Rooftop: a parapet and the city's skyline all around.
    for (const [x, z, w, d] of [[0, -hd, W, 0.4], [0, hd, W, 0.4], [-hw, 0, 0.4, D], [hw, 0, 0.4, D]]) box(colored('#3a3a44', 0.9), x, 0, z, w, 1.1, d, scene);
    const r = rand(seed);
    const sky = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + r() * 0.05;
      const dist = 60 + r() * 60;
      const bh = 8 + r() * 40;
      box(colored('#0e0f1c', 0.9), Math.cos(a) * dist, -30, Math.sin(a) * dist, 6 + r() * 8, bh + 30, 6 + r() * 8, sky, false);
      if (r() < 0.6) box(glow(r() < 0.5 ? '#ffd9a0' : neon, 1.2), Math.cos(a) * (dist - 3.5), bh * r() - 10, Math.sin(a) * (dist - 3.5), 0.8, 0.5, 0.05, sky, false).lookAt(0, 0, 0);
    }
    scene.add(sky);
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, (_, i) => (i % 3 === 1 ? 80 + r() * 200 : (r() - 0.5) * 600)), 3)),
      new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false }),
    );
    scene.add(stars);
    // String lights.
    for (let i = 0; i < 18; i++) mesh(G().sphere, glow(i % 2 ? '#ffd9a0' : neon2, 2), -hw + (i + 0.5) * (W / 18), 4.2 + Math.sin(i * 0.9) * 0.3, 0, 0.16, 0.16, 0.16, scene, false);
  } else {
    box(wallMat, 0, 0, -hd, W, Hh, 0.3, scene, false);
    box(wallMat, -hw, 0, 0, 0.3, Hh, D, scene, false);
    box(wallMat, hw, 0, 0, 0.3, Hh, D, scene, false);
    // Front wall with a doorway in the middle.
    box(wallMat, -hw / 2 - 1.1, 0, hd, hw - 2.2, Hh, 0.3, scene, false);
    box(wallMat, hw / 2 + 1.1, 0, hd, hw - 2.2, Hh, 0.3, scene, false);
    box(wallMat, 0, 3.2, hd, 2.4, Hh - 3.2, 0.3, scene, false);
    box(colored('#0c0c10', 0.9), 0, Hh, 0, W, 0.2, D, scene, false);
  }
  // Exit sign and door glow.
  box(glow('#3dff7a', 1.6), 0, open ? 1.4 : 3.45, hd - 0.2, 1.1, 0.35, 0.05, scene, false);
  sign('EXIT', '#3dff7a', 0.28, scene, 0, open ? 1.57 : 3.62, hd - 0.26, 'neon', 1);
  box(glow('#ffd9a0', 0.5), 0, 0, hd + 0.05, 2.2, 3.1, 0.05, scene, false);

  const tonight = artistNames.slice(0, 3).join(' · ');
  const stageDepth = t === 'theater' || t === 'concert-hall' ? 8 : t === 'bar' ? 4.5 : 6;
  const stageW = Math.min(W - 4, t === 'bar' ? 9 : W * 0.7);
  const stageZ = -hd + stageDepth / 2 + 0.2;
  const stageH = t === 'bar' ? 0.5 : 1.0;

  if (t !== 'record-store') {
    // Stage, backline and the band.
    box(colored('#141416', 0.6), 0, 0, stageZ, stageW, stageH, stageDepth, scene);
    box(glow(neon, 1.6), 0, stageH - 0.02, stageZ + stageDepth / 2 + 0.02, stageW, 0.06, 0.06, scene, false);
    boxes.push({ x: 0, z: stageZ, hw: stageW / 2, hd: stageDepth / 2 });
    amp(scene, -stageW / 2 + 1, stageH, stageZ - stageDepth / 2 + 1.2, 2.2);
    amp(scene, stageW / 2 - 1, stageH, stageZ - stageDepth / 2 + 1.2, 2.2);
    const electronic = ['electronic', 'hip-hop'].includes(v.genres[0]) || t === 'club';
    const kinds: ('guitar' | 'bass' | 'mic' | 'keys' | 'drums' | 'decks')[] = electronic ? ['decks', 'mic'] : v.genres[0] === 'jazz' ? ['keys', 'bass', 'drums', 'mic'] : ['mic', 'guitar', 'bass', 'drums'];
    const coats = ['#1b1b1f', '#6d2e46', '#264653', '#3d405b', '#5e503f'];
    kinds.forEach((k, i) => {
      const n = kinds.length;
      const x = n === 1 ? 0 : -stageW * 0.3 + (i * stageW * 0.6) / (n - 1);
      const z = k === 'drums' ? stageZ - stageDepth * 0.2 : stageZ + stageDepth * 0.12;
      player(scene, ticks, k === 'drums' ? 0 : x, z, stageH, k, coats[i % coats.length], i * 1.3);
    });
    // Venue name and tonight's bill on the back wall.
    const backY = open ? 5.5 : Math.min(Hh - 1.2, stageH + 5.2);
    if (open) box(MATS.darkMetal(), 0, stageH, -hd + 0.4, stageW, 6.5, 0.2, scene, false);
    sign(v.name, neon, 1.3, scene, 0, backY, -hd + 0.55, 'neon', stageW * 0.8);
    if (tonight) sign(`Tonight: ${tonight}`, neon2, 0.55, scene, 0, backY - 1.2, -hd + 0.55, 'marquee', stageW * 0.9);
    // Lighting rig.
    const rigY = open ? 7.2 : Hh - 0.5;
    box(MATS.darkMetal(), 0, rigY, stageZ + stageDepth / 2 - 0.5, stageW + 1, 0.2, 0.2, scene, false);
    [-0.35, -0.12, 0.12, 0.35].forEach((f, i) => spotBeam(scene, ticks, f * stageW, rigY, stageZ + stageDepth / 2 - 0.5, i % 2 ? neon : neon2, i * 1.7));
  }

  if (t === 'club') {
    // Light-up dance floor and a mirror ball.
    const tiles: THREE.MeshBasicMaterial[] = [];
    const cols = [neon, neon2, '#ffffff', '#ff4f79'];
    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -2; iz <= 3; iz++) {
        const m = new THREE.MeshBasicMaterial({ color: cols[(ix + iz + 20) % cols.length], toneMapped: false });
        tiles.push(m);
        box(m, ix * 1.9, 0, iz * 1.9, 1.8, 0.04, 1.8, scene, false);
      }
    }
    const palette = cols.map((c) => new THREE.Color(c));
    ticks.push((time) => {
      const step = Math.floor(time * 2.03);
      tiles.forEach((m, i) => m.color.copy(palette[(i + step) % palette.length]).multiplyScalar(0.25 + 0.5 * Math.max(0, Math.sin(time * 6.4 + i))));
    });
    const ball = mesh(G().sphere, new THREE.MeshStandardMaterial({ color: '#ddd', metalness: 1, roughness: 0.15 }), 0, Hh - 1.6, 0, 1.1, 1.1, 1.1, scene, false);
    ticks.push((time) => (ball.rotation.y = time * 0.6));
    const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparkle.position.copy(ball.position);
    sparkle.scale.setScalar(4);
    scene.add(sparkle);
  }

  if (t === 'bar' || t === 'club' || t === 'warehouse' || t === 'rooftop') {
    // The bar along the left wall.
    const bx = -hw + 1.3;
    const len = D * 0.45;
    const bz = hd - len / 2 - 2;
    box(colored('#3b2418', 0.5), bx, 0, bz, 1.2, 1.1, len, scene);
    box(colored('#1a1a1a', 0.3, 0.3), bx, 1.1, bz, 1.4, 0.08, len + 0.2, scene, false);
    boxes.push({ x: bx, z: bz, hw: 0.8, hd: len / 2 + 0.2 });
    if (!open) {
      box(colored('#2a2a30'), -hw + 0.4, 1.4, bz, 0.4, 0.06, len, scene, false);
      const r = rand(seed + 7);
      for (let i = 0; i < 16; i++) mesh(G().cylinderLow, glow(['#6fdc6f', '#ffd27a', '#ff7a3d', '#9ad0ff'][i % 4], 0.8), -hw + 0.4, 1.46, bz - len / 2 + 0.3 + i * (len / 16), 0.14, 0.4 + r() * 0.2, 0.14, scene, false);
      sign('BAR', neon2, 0.5, scene, -hw + 0.2, 2.6, bz, 'neon', 2).rotation.y = Math.PI / 2;
    }
  }

  if (t === 'theater' || t === 'concert-hall') {
    // Rows of seats facing the stage, with an aisle down the middle.
    const seatMat = colored('#7a1522', 0.8);
    const rows = t === 'concert-hall' ? 9 : 7;
    const perSide = Math.floor((W / 2 - 2.5) / 0.9);
    const seatCount = rows * perSide * 2;
    const seats = new THREE.InstancedMesh(G().box, seatMat, seatCount);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let rI = 0; rI < rows; rI++) {
      const z = stageZ + stageDepth / 2 + 3 + rI * 1.6;
      for (let s = 0; s < perSide; s++) {
        for (const side of [-1, 1]) {
          m.compose(new THREE.Vector3(side * (1.4 + s * 0.9), 0, z), new THREE.Quaternion(), new THREE.Vector3(0.75, 0.9, 0.7));
          seats.setMatrixAt(i++, m);
        }
      }
      boxes.push({ x: -(1.4 + (perSide * 0.9) / 2), z, hw: (perSide * 0.9) / 2, hd: 0.45 });
      boxes.push({ x: 1.4 + (perSide * 0.9) / 2, z, hw: (perSide * 0.9) / 2, hd: 0.45 });
    }
    scene.add(seats);
    // Curtains.
    for (const sx of [-1, 1]) box(colored('#8a1020', 0.9), sx * (stageW / 2 + 0.6), 0, stageZ, 1.2, Hh, 0.6, scene, false);
    // A seated audience in about half the seats.
    crowdIn(scene, ticks, 0, stageZ + stageDepth / 2 + 3 + rows * 0.8, W - 6, rows * 1.4, 26, seed);
  } else if (t === 'record-store') {
    // Crate tables down the middle, shelves of sleeves on the walls, a counter and a listening booth.
    const colors = [neon, neon2, '#ff4f79', '#3ea0ff', '#ffd23f', '#59cd90', '#f2ead8', '#b8321c'];
    for (let row = 0; row < 3; row++) {
      for (const sx of [-1, 1]) {
        const x = sx * 2.6;
        const z = -hd + 4 + row * 4.2;
        const table = new THREE.Group();
        box(colored('#5a3a24', 0.7), 0, 0, 0, 3, 0.9, 1.6, table);
        box(colored('#8a5a33', 0.7), 0, 0.9, 0, 2.9, 0.45, 1.5, table);
        for (let i = 0; i < 9; i++) box(colored(colors[(i + row * 3 + (sx > 0 ? 4 : 0)) % colors.length], 0.6), -1.25 + i * 0.31, 1.2, 0, 0.04, 0.45, 1.2, table, false).rotation.z = 0.12;
        table.position.set(x, 0, z);
        table.userData = { kind: 'crate', id: v.id };
        scene.add(table);
        pickables.push(table);
        boxes.push({ x, z, hw: 1.6, hd: 0.9 });
      }
    }
    for (const sx of [-1, 1]) {
      box(colored('#3a2616', 0.8), sx * (hw - 0.4), 0, -1, 0.6, 3.2, D - 5, scene, false);
      const r = rand(seed + (sx > 0 ? 3 : 5));
      for (let i = 0; i < 26; i++) {
        const sleeve = box(colored(colors[Math.floor(r() * colors.length)], 0.6), sx * (hw - 0.72), 1.9 + (i % 2) * 0.7 - 0.3, -hd + 2.8 + Math.floor(i / 2) * 1.05, 0.04, 0.62, 0.62, scene, false);
        sleeve.rotation.y = sx * 0.05;
      }
      boxes.push({ x: sx * (hw - 0.4), z: -1, hw: 0.4, hd: (D - 5) / 2 });
    }
    box(colored('#241812', 0.6), hw - 3, 0, hd - 4, 3.4, 1.1, 1.1, scene);
    boxes.push({ x: hw - 3, z: hd - 4, hw: 1.8, hd: 0.7 });
    const deck = mesh(G().cylinder, new THREE.MeshStandardMaterial({ map: vinylTexture(neon) }), hw - 3, 1.12, hd - 4, 0.8, 0.02, 0.8, scene, false);
    ticks.push((time) => (deck.rotation.y = time * 3.5));
    sign(v.name, neon, 0.9, scene, 0, 3.4, -hd + 0.2, 'neon', W * 0.7);
    sign('Click a crate to dig', neon2, 0.4, scene, 0, 2.5, -hd + 0.2, 'marquee', W * 0.5);
    crowdIn(scene, ticks, 0, 0, W - 4, D - 6, 7, seed, [...boxes, { x: 0, z: hd - 3, hw: 2.5, hd: 3 }]);
  } else {
    // A crowd between the stage and the door.
    const front = stageZ + stageDepth / 2 + 1;
    const back = hd - 2.5;
    const n = t === 'bar' ? 24 : t === 'rooftop' ? 36 : t === 'club' ? 56 : 52;
    // Keep a clear path in from the door.
    crowdIn(scene, ticks, 1.2, (front + back) / 2, W - 5, back - front, n, seed, [...boxes, { x: 0, z: hd - 4, hw: 2.6, hd: 4 }]);
  }

  return {
    scene,
    venueId: v.id,
    hw,
    hd,
    boxes,
    spawn: { x: 0, z: hd - 1.6, yaw: 0 },
    ticks,
    pickables,
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== G().box && m.geometry !== G().sphere && m.geometry !== G().cylinder && m.geometry !== G().cylinderLow && m.geometry !== G().plane) m.geometry.dispose();
      });
    },
  };
}
