import * as THREE from 'three';
import { GENRES } from '../data/genres.js';
import type { BuildingPlan, CityPlan, Connection, GenreId, Vec2, VenuePlan } from '../types.js';
import { addBuildings, TIMELINE } from './buildings.js';
import { geo } from './geometries.js';
import { Instancer } from './instancer.js';
import { MATS, cityUniforms, glow, std } from './materials.js';
import { buildLandmark, buildVenue, type Model, type Tick } from './models.js';
import { beamTexture, glowTexture } from './textures.js';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

export interface PickHit {
  kind: 'venue' | 'landmark' | 'building';
  id: string | number;
}

interface Anim {
  obj: THREE.Object3D;
  delay: number;
  dur: number;
}

/** A fully assembled 3D city built from a CityPlan. */
export class CityView {
  readonly group = new THREE.Group();
  readonly venues = new Map<string, Model>();
  readonly landmarks = new Map<string, Model>();
  readonly pickables: THREE.Object3D[] = [];
  private instancer = new Instancer();
  private ticks: Tick[] = [];
  private anims: Anim[] = [];
  private arcs: { conn: Connection; mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3 }[] = [];
  private pulses: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; offset: number }[] = [];
  private lampPool: THREE.MeshBasicMaterial | null = null;
  private lampBulbs: THREE.MeshBasicMaterial | null = null;
  private hazeMats: THREE.MeshBasicMaterial[] = [];
  private cars: { mesh: THREE.InstancedMesh; lights: THREE.InstancedMesh; tails: THREE.InstancedMesh; data: CarData[] } | null = null;
  private selection = new THREE.Group();
  private focusBeams = new THREE.Group();
  private clock = 0;
  private buildStart = 0;
  private waterMat: THREE.MeshStandardMaterial | null = null;
  readonly animated: boolean;
  readonly boundsRadius: number;

  constructor(readonly plan: CityPlan, opts: { animate: boolean; mobile: boolean }) {
    this.animated = opts.animate;
    this.boundsRadius = plan.size / 2;
    this.buildTerrain();
    this.buildBlocks();
    this.buildRoadMarkings();
    this.buildRiver();
    this.buildBridges();
    addBuildings(this.instancer, plan.buildings, opts.animate);
    this.buildTrees();
    this.buildLamps(opts.mobile);
    this.instancer.buildInto(this.group).forEach((m) => {
      if (m.name.endsWith('-body') || m.name.startsWith('graffiti')) this.pickables.push(m);
    });
    this.buildHaze();
    plan.venues.forEach((v, i) => this.addVenueModel(v, opts.animate ? TIMELINE.venues + i * 0.05 : -1));
    plan.landmarks.forEach((l, i) => {
      const m = buildLandmark(l);
      this.landmarks.set(l.id, m);
      this.group.add(m.group);
      this.pickables.push(m.group);
      this.ticks.push(...m.ticks);
      this.animate(m.group, opts.animate ? TIMELINE.landmarks + i * 0.09 : -1, 0.7);
    });
    this.buildConnections();
    this.buildCars(opts.mobile ? 18 : 46);
    this.group.add(this.selection, this.focusBeams);
    cityUniforms.uLights.value = opts.animate ? 0 : 1;
  }

  /** Seconds since the build sequence started. */
  get elapsed(): number {
    return this.clock - this.buildStart;
  }

  get finished(): boolean {
    return !this.animated || this.elapsed > TIMELINE.done;
  }

  finishNow(): void {
    this.buildStart = this.clock - TIMELINE.done - 1;
  }

  update(dt: number): void {
    this.clock += dt;
    const t = this.animated ? this.elapsed : 1e6;
    cityUniforms.uTime.value = this.clock;
    this.instancer.update(t);
    for (const a of this.anims) {
      const k = a.delay < 0 ? 1 : clamp01((t - a.delay) / a.dur);
      const s = k <= 0 ? 0.0001 : k >= 1 ? 1 : Math.max(0.0001, easeOutBack(k));
      a.obj.scale.setScalar(s);
      a.obj.visible = k > 0;
    }
    const lights = clamp01((t - TIMELINE.lights) / TIMELINE.lightsDuration);
    cityUniforms.uLights.value = lights;
    if (this.lampPool) this.lampPool.opacity = 0.22 * lights;
    if (this.lampBulbs) this.lampBulbs.color.setRGB(2.2 * lights + 0.05, 1.6 * lights + 0.04, 0.9 * lights + 0.03);
    for (const h of this.hazeMats) h.opacity = 0.13 * lights;
    if (this.waterMat) this.waterMat.opacity = 0.35 + 0.6 * clamp01((t - 0.3) / 0.8);
    for (const tick of this.ticks) tick(this.clock, dt);
    this.updateCars(dt, lights);
    for (const p of this.pulses) {
      const u = (this.clock * 0.35 + p.offset) % 1;
      p.mesh.position.copy(p.curve.getPoint(u));
    }
    this.selection.children.forEach((c, i) => {
      if (i === 0) c.scale.setScalar(1 + Math.sin(this.clock * 3) * 0.06);
      else c.rotation.y = this.clock * 0.5;
    });
    this.focusBeams.children.forEach((c, i) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(this.clock * 3 + i) * 0.12);
  }

  /* ------------------------------------------------------------------ */

  private animate(obj: THREE.Object3D, delay: number, dur: number) {
    this.anims.push({ obj, delay, dur });
    if (delay >= 0) {
      obj.scale.setScalar(0.0001);
      obj.visible = false;
    }
  }

  private buildTerrain() {
    const size = this.plan.size + 10;
    const half = size / 2;
    const r = 16;
    const shape = new THREE.Shape();
    shape.moveTo(-half + r, -half);
    shape.lineTo(half - r, -half);
    shape.quadraticCurveTo(half, -half, half, -half + r);
    shape.lineTo(half, half - r);
    shape.quadraticCurveTo(half, half, half - r, half);
    shape.lineTo(-half + r, half);
    shape.quadraticCurveTo(-half, half, -half, half - r);
    shape.lineTo(-half, -half + r);
    shape.quadraticCurveTo(-half, -half, -half + r, -half);
    const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.6, bevelSegments: 2 });
    slabGeo.rotateX(Math.PI / 2);
    const slab = new THREE.Mesh(slabGeo, [MATS.asphalt(), std('slab-side', { color: 0x1d1c22, roughness: 0.9 })]);
    slab.position.y = -0.6;
    slab.receiveShadow = true;
    this.group.add(slab);

    // Faint glow under the diorama.
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 3, size * 3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x2a2450, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    under.position.y = -9;
    this.group.add(under);
  }

  private blockColor(influence: Partial<Record<GenreId, number>>): THREE.Color {
    const c = new THREE.Color(0, 0, 0);
    for (const k in influence) c.add(new THREE.Color(GENRES[k as GenreId].style.ground).multiplyScalar(influence[k as GenreId] ?? 0));
    return c.multiplyScalar(1.9);
  }

  private buildBlocks() {
    const g = geo();
    const sidewalk = this.instancer.batch('sidewalk', g.box, MATS.instanced(), false, true);
    const grass = this.instancer.batch('park', g.box, MATS.grass(), false, true);
    const plaza = this.instancer.batch('plaza', g.box, std('plaza', { color: 0x9a948a, roughness: 0.9 }), false, true);
    const half = this.plan.size / 2;
    for (const b of this.plan.blocks) {
      if (b.use === 'water') continue;
      const order = Math.hypot(b.center.x, b.center.z) / half;
      const opts = { delay: this.animated ? TIMELINE.blocks + order * 0.6 : 0, duration: 0.5, mode: this.animated ? ('grow' as const) : ('none' as const) };
      if (b.use === 'park') {
        sidewalk.add(b.center.x, 0, b.center.z, b.size, 0.18, b.size, { ...opts, color: this.blockColor(b.influence) });
        grass.add(b.center.x, 0.18, b.center.z, b.size - 1.2, 0.08, b.size - 1.2, opts);
      } else if (b.use === 'plaza') {
        plaza.add(b.center.x, 0, b.center.z, b.size, 0.2, b.size, opts);
      } else {
        sidewalk.add(b.center.x, 0, b.center.z, b.size, 0.18, b.size, { ...opts, color: this.blockColor(b.influence) });
      }
    }
  }

  private buildRoadMarkings() {
    const dash = this.instancer.batch('dash', geo().box, glow('#d8c690', 0.35), false, false);
    const half = this.plan.size / 2;
    for (const r of this.plan.roads) {
      const len = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
      const alongX = Math.abs(r.b.x - r.a.x) > Math.abs(r.b.z - r.a.z);
      for (let s = 2.2; s < len - 2; s += 2.4) {
        const x = r.a.x + ((r.b.x - r.a.x) * s) / len;
        const z = r.a.z + ((r.b.z - r.a.z) * s) / len;
        const order = Math.hypot(x, z) / half;
        dash.add(x, 0.005, z, alongX ? 1.1 : 0.12, 0.02, alongX ? 0.12 : 1.1, {
          delay: this.animated ? TIMELINE.blocks + 0.3 + order * 0.7 : 0,
          duration: 0.3,
          mode: this.animated ? 'pop' : 'none',
        });
      }
    }
  }

  private ribbon(points: Vec2[], width: number, y: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const idx: number[] = [];
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l;
      const nz = tx / l;
      pos.push(p.x + (nx * width) / 2, y, p.z + (nz * width) / 2, p.x - (nx * width) / 2, y, p.z - (nz * width) / 2);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildRiver() {
    const half = this.plan.size / 2 + 5;
    const pts = this.plan.river.points.filter((p) => Math.abs(p.x) <= half + 6 && Math.abs(p.z) <= half + 6);
    const clampPts = pts.map((p) => ({ x: Math.max(-half, Math.min(half, p.x)), z: Math.max(-half, Math.min(half, p.z)) }));
    const bank = new THREE.Mesh(this.ribbon(clampPts, this.plan.river.width + 2.2, 0.02), std('bank', { color: 0x3a3833, roughness: 0.95 }));
    bank.receiveShadow = true;
    this.group.add(bank);

    const water = new THREE.MeshStandardMaterial({ color: 0x0a1626, roughness: 0.18, metalness: 0.6, transparent: true, opacity: 0.35 });
    water.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, cityUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime, uLights;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float w1 = sin(vWPos.x * 1.7 + uTime * 1.3) * sin(vWPos.z * 2.3 - uTime * 0.9);
          float w2 = sin((vWPos.x + vWPos.z) * 3.1 - uTime * 1.7);
          float spark = smoothstep(0.82, 1.0, w1 * 0.6 + w2 * 0.5);
          vec3 refl = mix(vec3(1.0, 0.65, 0.3), vec3(0.4, 0.7, 1.0), step(0.0, sin(vWPos.x * 0.21)));
          totalEmissiveRadiance += refl * spark * (0.35 + 0.9 * uLights);
          totalEmissiveRadiance += vec3(0.02, 0.05, 0.09) * (0.5 + 0.5 * w2);`,
        );
    };
    this.waterMat = water;
    const river = new THREE.Mesh(this.ribbon(clampPts, this.plan.river.width, 0.06), water);
    river.receiveShadow = true;
    this.group.add(river);
  }

  private buildBridges() {
    const deckMat = std('bridge', { color: 0x4a4540, roughness: 0.85 });
    const bulb = glow('#ffd9a0', 2.2);
    for (const b of this.plan.bridges) {
      const bridge = new THREE.Group();
      const deck = new THREE.Mesh(geo().box, deckMat);
      deck.scale.set(b.length, 0.3, this.plan.road + 0.4);
      deck.position.y = 0.12;
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridge.add(deck);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(geo().box, MATS.darkMetal());
        rail.scale.set(b.length, 0.5, 0.12);
        rail.position.set(0, 0.42, (s * (this.plan.road + 0.3)) / 2);
        bridge.add(rail);
        for (let i = -1; i <= 1; i++) {
          const post = new THREE.Mesh(geo().box, MATS.darkMetal());
          post.scale.set(0.1, 1.6, 0.1);
          post.position.set((i * b.length) / 3, 0.42, (s * (this.plan.road + 0.3)) / 2);
          bridge.add(post);
          const light = new THREE.Mesh(geo().sphere, bulb);
          light.scale.setScalar(0.22);
          light.position.set((i * b.length) / 3, 2.1, (s * (this.plan.road + 0.3)) / 2);
          bridge.add(light);
        }
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(b.length * 0.32, 0.35, 6, 24, Math.PI), deckMat);
      arch.rotation.x = Math.PI;
      arch.position.y = 0.2;
      arch.scale.y = 0.35;
      bridge.add(arch);
      bridge.position.set(b.position.x, 0.02, b.position.z);
      bridge.rotation.y = b.rotation;
      this.group.add(bridge);
      this.animate(bridge, this.animated ? TIMELINE.blocks + 0.6 : -1, 0.5);
    }
  }

  private buildTrees() {
    const g = geo();
    const trunk = this.instancer.batch('trunk', g.cylinderLow, MATS.wood(), true, false);
    const canopy = this.instancer.batch('canopy', g.ico, MATS.instanced(), true, false);
    const cone = this.instancer.batch('canopy-cone', g.coneRound, MATS.instanced(), true, false);
    const half = this.plan.size / 2;
    for (const t of this.plan.trees) {
      const o = Math.hypot(t.position.x, t.position.z) / half;
      const opts = { delay: this.animated ? TIMELINE.buildings + o * TIMELINE.buildingSpread + 0.3 : 0, duration: 0.5, mode: this.animated ? ('pop' as const) : ('none' as const) };
      const s = t.scale;
      const psych = t.genre === 'psychedelic' || t.genre === 'glam';
      const h = Math.abs(Math.sin(t.position.x * 3.1 + t.position.z));
      trunk.add(t.position.x, 0.2, t.position.z, 0.2 * s, 0.9 * s, 0.2 * s, { ...opts, color: 0xffffff });
      const color = psych
        ? new THREE.Color().setHSL(h, 0.55, 0.45)
        : new THREE.Color().setHSL(0.28 + h * 0.08, 0.35, 0.18 + h * 0.08);
      if (!psych && h > 0.6) cone.add(t.position.x, 0.8 * s, t.position.z, 1.3 * s, 2.4 * s, 1.3 * s, { ...opts, color });
      else canopy.add(t.position.x, 1.5 * s, t.position.z, 1.7 * s, 1.5 * s, 1.7 * s, { ...opts, color });
    }
  }

  private buildLamps(mobile: boolean) {
    const g = geo();
    const pole = this.instancer.batch('lamp-pole', g.cylinderLow, MATS.darkMetal(), false, false);
    this.lampBulbs = new THREE.MeshBasicMaterial({ color: 0x080604, toneMapped: false });
    const bulb = this.instancer.batch('lamp-bulb', g.sphere, this.lampBulbs, false, false);
    this.lampPool = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb870, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pool = this.instancer.batch('lamp-pool', g.groundPlane, this.lampPool, false, false);
    const half = this.plan.size / 2;
    const lamps = mobile ? this.plan.lamps.filter((_, i) => i % 2 === 0) : this.plan.lamps;
    for (const l of lamps) {
      const o = Math.hypot(l.x, l.z) / half;
      const opts = { delay: this.animated ? TIMELINE.blocks + 0.4 + o * 0.8 : 0, duration: 0.4, mode: this.animated ? ('grow' as const) : ('none' as const) };
      pole.add(l.x, 0.18, l.z, 0.08, 2.1, 0.08, opts);
      bulb.add(l.x, 2.3, l.z, 0.3, 0.3, 0.3, opts);
      pool.add(l.x, 0.2, l.z, 5, 1, 5, { ...opts, mode: 'none' });
    }
  }

  /** Soft coloured light pooled on the ground of each district. */
  private buildHaze() {
    for (const d of this.plan.districts) {
      const mat = new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: new THREE.Color(GENRES[d.genre].style.neon[0]),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const m = new THREE.Mesh(geo().groundPlane, mat);
      m.scale.set(d.radius * 2.6, 1, d.radius * 2.6);
      m.position.set(d.center.x, 0.25, d.center.z);
      m.renderOrder = 1;
      this.hazeMats.push(mat);
      this.group.add(m);
    }
  }

  private buildConnections() {
    for (const c of this.plan.connections) this.addArc(c);
  }

  private addArc(c: Connection) {
    const dist = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
    const a = new THREE.Vector3(c.a.x, 7, c.a.z);
    const b = new THREE.Vector3(c.b.x, 7, c.b.z);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = 12 + dist * 0.28;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const mat = new THREE.MeshBasicMaterial({ color: 0xa9c4ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.1, 5), mat);
    mesh.userData.baseOpacity = 0.07;
    this.group.add(mesh);
    this.arcs.push({ conn: c, mesh, curve });
    this.ticks.push(() => {
      const target = mesh.userData.targetOpacity ?? (this.finished ? mesh.userData.baseOpacity : 0);
      mat.opacity += (target - mat.opacity) * 0.08;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Cars                                                               */
  /* ------------------------------------------------------------------ */

  private buildCars(count: number) {
    const half = this.plan.size / 2;
    const river = this.plan.river;
    const lines = new Map<string, { axis: 'x' | 'z'; c: number; min: number; max: number; wet: boolean }>();
    for (const r of this.plan.roads) {
      const axis: 'x' | 'z' = Math.abs(r.b.x - r.a.x) > 0.1 ? 'x' : 'z';
      const c = axis === 'x' ? r.a.z : r.a.x;
      const key = `${axis}${c.toFixed(1)}`;
      const lo = axis === 'x' ? Math.min(r.a.x, r.b.x) : Math.min(r.a.z, r.b.z);
      const hi = axis === 'x' ? Math.max(r.a.x, r.b.x) : Math.max(r.a.z, r.b.z);
      const line = lines.get(key) ?? { axis, c, min: lo, max: hi, wet: false };
      line.min = Math.min(line.min, lo);
      line.max = Math.max(line.max, hi);
      const mid = { x: (r.a.x + r.b.x) / 2, z: (r.a.z + r.b.z) / 2 };
      for (const p of river.points) if (Math.hypot(p.x - mid.x, p.z - mid.z) < river.width / 2 + 4) line.wet = true;
      lines.set(key, line);
    }
    const dry = [...lines.values()].filter((l) => !l.wet && l.max - l.min > 30 && Math.abs(l.c) < half);
    if (!dry.length) return;
    const data: CarData[] = [];
    const palette = ['#c9c9c9', '#8b1e2d', '#1f3b57', '#d9b44a', '#2d2d2d', '#e6e2d3', '#3f6e5a'];
    for (let i = 0; i < count; i++) {
      const line = dry[i % dry.length];
      const dir = Math.random() < 0.5 ? 1 : -1;
      data.push({ line, dir, s: line.min + Math.random() * (line.max - line.min), speed: 4 + Math.random() * 5, color: palette[i % palette.length] });
    }
    const body = new THREE.InstancedMesh(geo().box, MATS.instanced(), count);
    const lightsMat = glow('#fff6d8', 2.5);
    const tailMat = glow('#ff2a2a', 2.2);
    const lights = new THREE.InstancedMesh(geo().box, lightsMat, count);
    const tails = new THREE.InstancedMesh(geo().box, tailMat, count);
    data.forEach((d, i) => body.setColorAt(i, new THREE.Color(d.color)));
    body.castShadow = true;
    for (const m of [body, lights, tails]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.cars = { mesh: body, lights, tails, data };
  }

  private carM = new THREE.Matrix4();
  private carQ = new THREE.Quaternion();
  private carP = new THREE.Vector3();
  private carS = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  private updateCars(dt: number, lights: number) {
    if (!this.cars) return;
    const { mesh, lights: head, tails, data } = this.cars;
    const visible = this.finished || lights > 0;
    mesh.visible = head.visible = tails.visible = visible;
    if (!visible) return;
    data.forEach((d, i) => {
      d.s += d.dir * d.speed * dt;
      if (d.s > d.line.max) d.s = d.line.min;
      if (d.s < d.line.min) d.s = d.line.max;
      const lane = 0.75 * d.dir;
      const x = d.line.axis === 'x' ? d.s : d.line.c + lane;
      const z = d.line.axis === 'x' ? d.line.c - lane : d.s;
      const angle = d.line.axis === 'x' ? (d.dir > 0 ? 0 : Math.PI) : d.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.carQ.setFromAxisAngle(this.up, angle);
      const fx = Math.cos(angle);
      const fz = -Math.sin(angle);
      this.carM.compose(this.carP.set(x, 0.06, z), this.carQ, this.carS.set(1.1, 0.42, 0.55));
      mesh.setMatrixAt(i, this.carM);
      this.carM.compose(this.carP.set(x + fx * 0.56, 0.18, z + fz * 0.56), this.carQ, this.carS.set(0.04, 0.1, 0.45));
      head.setMatrixAt(i, this.carM);
      this.carM.compose(this.carP.set(x - fx * 0.56, 0.18, z - fz * 0.56), this.carQ, this.carS.set(0.04, 0.1, 0.45));
      tails.setMatrixAt(i, this.carM);
    });
    mesh.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Interaction helpers                                                */
  /* ------------------------------------------------------------------ */

  addVenueModel(v: VenuePlan, delay: number): Model {
    const m = buildVenue(v);
    this.venues.set(v.id, m);
    this.group.add(m.group);
    this.pickables.push(m.group);
    this.ticks.push(...m.ticks);
    this.animate(m.group, delay, 0.6);
    return m;
  }

  /** Replaces a building with a newly opened venue (artist discovery). */
  introduceVenue(v: VenuePlan, removed: BuildingPlan | undefined, conns: Connection[]): void {
    if (removed) this.instancer.hideTag(removed.id);
    this.addVenueModel(v, this.animated ? this.elapsed + 0.1 : -1);
    if (!this.animated) {
      const m = this.venues.get(v.id)!;
      // Pop in even when the city was built without animation.
      m.group.scale.setScalar(0.001);
      const start = this.clock;
      this.ticks.push((t) => {
        const k = clamp01((t - start) / 0.7);
        m.group.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      });
      this.anims = this.anims.filter((a) => a.obj !== m.group);
    }
    conns.forEach((c) => this.addArc(c));
  }

  /** Brightens the arcs touching an artist (or all arcs faintly when null). */
  focusConnections(artistId: string | null): void {
    for (const p of this.pulses) this.group.remove(p.mesh);
    this.pulses = [];
    for (const a of this.arcs) {
      const on = artistId !== null && (a.conn.from === artistId || a.conn.to === artistId);
      a.mesh.userData.targetOpacity = artistId === null ? undefined : on ? 0.85 : 0.04;
      (a.mesh.material as THREE.MeshBasicMaterial).color.set(on ? '#ffd27a' : '#a9c4ff');
      if (on) {
        for (let k = 0; k < 2; k++) {
          const dot = new THREE.Mesh(geo().sphere, glow('#fff1c1', 3));
          dot.scale.setScalar(0.7);
          this.group.add(dot);
          this.pulses.push({ mesh: dot, curve: a.curve, offset: k * 0.5 });
        }
      }
    }
  }

  /** Ring + beam at the selected place. */
  select(pos: Vec2 | null, color = '#ffd27a', radius = 5): void {
    this.selection.clear();
    if (!pos) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.35, 48).rotateX(-Math.PI / 2), glow(color, 2.4, { transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.position.set(pos.x, 0.35, pos.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 40, 24, 1, true).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ map: beamTexture(), color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(pos.x, 0.2, pos.z);
    this.selection.add(ring, beam);
  }

  /** Light beams over every place connected to an artist. */
  beams(points: Vec2[], color = '#ffd27a'): void {
    this.focusBeams.clear();
    for (const p of points) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 50, 16, 1, true).translate(0, 25, 0),
        new THREE.MeshBasicMaterial({ map: beamTexture(), color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      beam.position.set(p.x, 0.2, p.z);
      this.focusBeams.add(beam);
    }
  }

  /** Resolves a raycast hit object to a venue, landmark or building. */
  resolveHit(hit: THREE.Intersection): PickHit | null {
    let o: THREE.Object3D | null = hit.object;
    if ((o as THREE.InstancedMesh).isInstancedMesh && hit.instanceId !== undefined) {
      const batch = o.userData.batch as { tags: number[] } | undefined;
      const tag = batch?.tags[hit.instanceId];
      if (tag !== undefined && tag >= 0) return { kind: 'building', id: tag };
      return null;
    }
    while (o) {
      if (o.userData.kind === 'venue' || o.userData.kind === 'landmark') return { kind: o.userData.kind, id: o.userData.id };
      o = o.parent;
    }
    return null;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !isShared(m.geometry)) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}

interface CarData {
  line: { axis: 'x' | 'z'; c: number; min: number; max: number };
  dir: number;
  s: number;
  speed: number;
  color: string;
}

function isShared(g: THREE.BufferGeometry): boolean {
  return Object.values(geo()).includes(g as never);
}
