import * as THREE from 'three';
import { distToPolyline } from '../core/cityGenerator.js';
import type { BuskerPlan, CityPlan, StreetPlan, Vec2, VenuePlan, LandmarkPlan } from '../types.js';

/**
 * Street-level walking. WASD/arrow keys (or the on-screen stick on touch
 * screens) to move, drag to look around. Buildings, venues and the river
 * block the way; bridges and streets don't.
 */

const EYE = 1.5;
const SPEED = 8;
const RADIUS = 0.8;

interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface Nearby {
  venue: VenuePlan | null;
  venueDistance: number;
  landmark: LandmarkPlan | null;
  busker: BuskerPlan | null;
  buskerDistance: number;
  street: StreetPlan | null;
}

export class WalkMode {
  active = false;
  private yaw = 0;
  private pitch = -0.05;
  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private boxes: Box[] = [];
  private cellSize = 18;
  private grid = new Map<string, Box[]>();
  private dragging: { x: number; y: number } | null = null;
  private lastNearCheck = 0;
  private near: Nearby = { venue: null, venueDistance: Infinity, landmark: null, busker: null, buskerDistance: Infinity, street: null };
  private removers: (() => void)[] = [];

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private onNearby: (n: Nearby) => void,
  ) {}

  setPlan(plan: CityPlan): void {
    this.plan = plan;
    this.boxes = [];
    for (const b of plan.buildings) {
      if (b.height <= 0) continue;
      const r = b.archetype === 'curvy' || b.archetype === 'dome' ? Math.min(b.width, b.depth) / 2 : 0;
      this.boxes.push(r ? { x: b.position.x, z: b.position.z, hw: r, hd: r } : { x: b.position.x, z: b.position.z, hw: b.width / 2, hd: b.depth / 2 });
    }
    for (const v of plan.venues) this.boxes.push({ x: v.position.x, z: v.position.z, hw: v.footprint * 0.45, hd: v.footprint * 0.42 });
    for (const t of plan.labels) this.boxes.push({ x: t.position.x, z: t.position.z, hw: 5.2, hd: 5.2 });
    for (const b of plan.buskers) this.boxes.push({ x: b.position.x, z: b.position.z, hw: 0.7, hd: 0.7 });
    for (const h of plan.homes) {
      const r = Math.min(6.4, Math.max(3.4, h.width, h.depth)) / 2 + 0.3;
      this.boxes.push({ x: h.position.x, z: h.position.z, hw: r, hd: r });
    }
    for (const l of plan.landmarks) {
      if (l.model === 'boat') continue;
      this.boxes.push({ x: l.position.x, z: l.position.z, hw: l.footprint * 0.33, hd: l.footprint * 0.3 });
    }
    this.grid.clear();
    for (const b of this.boxes) {
      const k = this.key(b.x, b.z);
      this.grid.set(k, [...(this.grid.get(k) ?? []), b]);
    }
  }

  private plan: CityPlan | null = null;

  private key(x: number, z: number) {
    return `${Math.round(x / this.cellSize)},${Math.round(z / this.cellSize)}`;
  }

  /** Removes the building a new venue replaced so you can walk up to it. */
  removeAt(p: Vec2): void {
    this.boxes = this.boxes.filter((b) => Math.hypot(b.x - p.x, b.z - p.z) > 0.5);
    this.setPlan(this.plan!);
  }

  private blocked(x: number, z: number): boolean {
    const plan = this.plan;
    if (!plan) return false;
    const lim = plan.size / 2 + 2;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return true;
    const cx = Math.round(x / this.cellSize);
    const cz = Math.round(z / this.cellSize);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const b of this.grid.get(`${cx + i},${cz + j}`) ?? []) {
          if (Math.abs(x - b.x) < b.hw + RADIUS && Math.abs(z - b.z) < b.hd + RADIUS) return true;
        }
      }
    }
    // Water, unless standing on a bridge.
    const river = distToPolyline({ x, z }, plan.river.points);
    if (river.d < plan.river.width / 2 + 0.6) {
      const onBridge = plan.bridges.some((b) => {
        const along = b.rotation ? Math.abs(z - b.position.z) : Math.abs(x - b.position.x);
        const across = b.rotation ? Math.abs(x - b.position.x) : Math.abs(z - b.position.z);
        return along < b.length / 2 && across < plan.road / 2 + 0.3;
      });
      if (!onBridge) return true;
    }
    return false;
  }

  /** Starts in the middle of the nearest open street, so you're not pressed against a wall. */
  private spawnNear(p: Vec2): Vec2 {
    const plan = this.plan;
    if (plan) {
      const spots = plan.roads
        .map((r) => ({ x: (r.a.x + r.b.x) / 2, z: (r.a.z + r.b.z) / 2 }))
        .filter((q) => !this.blocked(q.x, q.z))
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      if (spots[0]) return spots[0];
    }
    for (let r = 0; r < 30; r += 1.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const q = { x: p.x + Math.cos(a) * (r + 7), z: p.z + Math.sin(a) * (r + 7) };
        if (!this.blocked(q.x, q.z)) return q;
      }
    }
    return p;
  }

  enter(at: Vec2, lookAt?: Vec2): void {
    if (!this.plan) return;
    const start = this.spawnNear(at);
    this.camera.position.set(start.x, EYE, start.z);
    const target = lookAt ?? at;
    this.yaw = Math.atan2(-(target.x - start.x), -(target.z - start.z));
    this.pitch = 0.08;
    this.camera.near = 0.2;
    this.camera.far = 1200;
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.active = true;
    this.lastNearCheck = 0;
    this.near = { venue: null, venueDistance: Infinity, landmark: null, busker: null, buskerDistance: Infinity, street: null };
    this.bind();
    this.applyRotation();
  }

  exit(): void {
    this.active = false;
    this.keys.clear();
    this.stick.set(0, 0);
    this.removers.forEach((r) => r());
    this.removers = [];
    this.camera.near = 0.5;
    this.camera.far = 4000;
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
  }

  /** Point on the ground in front of the camera, used to hand back to orbit controls. */
  lookPoint(): THREE.Vector3 {
    const dir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return this.camera.position.clone().add(dir.multiplyScalar(18)).setY(0);
  }

  setStick(x: number, y: number): void {
    this.stick.set(x, y);
  }

  private bind() {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const pd = (e: PointerEvent) => (this.dragging = { x: e.clientX, y: e.clientY });
    const pm = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x;
      const dy = e.clientY - this.dragging.y;
      this.dragging = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.0042;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - dy * 0.0035));
      this.applyRotation();
    };
    const pu = () => (this.dragging = null);
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.dom.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    this.removers.push(
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
      () => this.dom.removeEventListener('pointerdown', pd),
      () => window.removeEventListener('pointermove', pm),
      () => window.removeEventListener('pointerup', pu),
    );
  }

  private applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt: number, time: number): void {
    if (!this.active || !this.plan) return;
    const k = this.keys;
    let fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - this.stick.y;
    let side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + this.stick.x;
    // Arrow left/right turn instead of strafing, which is friendlier without a mouse.
    const turn = (k.has('arrowleft') || k.has('q') ? 1 : 0) - (k.has('arrowright') || k.has('e') ? 1 : 0);
    if (turn) {
      this.yaw += turn * dt * 1.8;
      this.applyRotation();
    }
    const len = Math.hypot(fwd, side);
    if (len > 1) {
      fwd /= len;
      side /= len;
    }
    const speed = SPEED * (k.has('shift') ? 2 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (-sin * fwd + cos * side) * speed * dt;
    const dz = (-cos * fwd - sin * side) * speed * dt;
    const p = this.camera.position;
    if (dx || dz) {
      // Slide along walls by trying each axis separately.
      if (!this.blocked(p.x + dx, p.z + dz)) {
        p.x += dx;
        p.z += dz;
      } else if (!this.blocked(p.x + dx, p.z)) p.x += dx;
      else if (!this.blocked(p.x, p.z + dz)) p.z += dz;
      p.y = EYE + Math.abs(Math.sin(time * 9)) * 0.035 * Math.min(1, Math.hypot(fwd, side));
    }

    if (time - this.lastNearCheck > 0.4) {
      this.lastNearCheck = time;
      let best: VenuePlan | null = null;
      let bestD = Infinity;
      for (const v of this.plan.venues) {
        const d = Math.hypot(v.position.x - p.x, v.position.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      let lm: LandmarkPlan | null = null;
      for (const l of this.plan.landmarks) {
        if (Math.hypot(l.position.x - p.x, l.position.z - p.z) < 14) lm = l;
      }
      let bk: BuskerPlan | null = null;
      let bkD = Infinity;
      for (const b of this.plan.buskers) {
        const d = Math.hypot(b.position.x - p.x, b.position.z - p.z);
        if (d < bkD) {
          bkD = d;
          bk = b;
        }
      }
      const venue = bestD < 24 ? best : null;
      const busker = bkD < 14 ? bk : null;
      // The street you're on: the nearest street line within half a block.
      let street: StreetPlan | null = null;
      let stD = this.plan.pitch / 2;
      for (const st of this.plan.streets) {
        const across = st.axis === 'x' ? Math.abs(p.z - st.c) : Math.abs(p.x - st.c);
        const along = st.axis === 'x' ? p.x : p.z;
        if (across < stD && along >= st.from - 2 && along <= st.to + 2) {
          stD = across;
          street = st;
        }
      }
      const changed = venue?.id !== this.near.venue?.id || lm?.id !== this.near.landmark?.id || busker?.id !== this.near.busker?.id || street?.id !== this.near.street?.id;
      this.near = { venue, venueDistance: bestD, landmark: lm, busker, buskerDistance: bkD, street };
      if (changed || venue || busker) this.onNearby(this.near);
    }
  }
}
