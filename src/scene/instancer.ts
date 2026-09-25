import * as THREE from 'three';

export type AnimMode = 'grow' | 'pop' | 'none';

export interface InstanceOpts {
  delay?: number;
  duration?: number;
  mode?: AnimMode;
  /** Owner id (e.g. building id) used for picking and hiding. */
  tag?: number;
  rotY?: number;
  color?: THREE.ColorRepresentation;
}

const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Collects instances for one geometry+material pair, then animates them in. */
export class InstanceBatch {
  private data: number[] = []; // px py pz ry sx sy sz delay dur mode
  private colors: THREE.Color[] = [];
  readonly tags: number[] = [];
  mesh: THREE.InstancedMesh | null = null;
  private hidden = new Set<number>();
  private hasColor = false;

  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly shadows: { cast: boolean; receive: boolean },
  ) {}

  get count(): number {
    return this.tags.length;
  }

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, o: InstanceOpts = {}): number {
    const mode = o.mode ?? 'grow';
    this.data.push(x, y, z, o.rotY ?? 0, sx, sy, sz, o.delay ?? 0, o.duration ?? 0.8, mode === 'grow' ? 0 : mode === 'pop' ? 1 : 2);
    if (o.color !== undefined) this.hasColor = true;
    this.colors.push(new THREE.Color(o.color ?? 0xffffff));
    this.tags.push(o.tag ?? -1);
    return this.tags.length - 1;
  }

  build(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    mesh.castShadow = this.shadows.cast;
    mesh.receiveShadow = this.shadows.receive;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.hasColor) this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.apply(0);
    return mesh;
  }

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  /** Writes matrices for time t. Returns true once every instance has finished. */
  apply(t: number): boolean {
    const mesh = this.mesh;
    if (!mesh) return true;
    let done = true;
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const o = i * 10;
      const delay = d[o + 7];
      const dur = d[o + 8];
      const mode = d[o + 9];
      let k = mode === 2 ? 1 : Math.max(0, Math.min(1, (t - delay) / dur));
      if (k < 1) done = false;
      if (this.hidden.has(i)) k = 0;
      let sy = 1;
      let sxz = 1;
      if (mode === 0) sy = easeOutBack(k) * (k > 0 ? 1 : 0);
      else if (mode === 1) sxz = sy = k > 0 ? easeOutBack(k) : 0;
      else sxz = sy = this.hidden.has(i) ? 0 : 1;
      const grow = mode === 0 ? easeOutCubic(k) : 1;
      this.p.set(d[o], d[o + 1] * grow, d[o + 2]);
      this.q.setFromAxisAngle(this.up, d[o + 3]);
      this.s.set(Math.max(1e-4, d[o + 4] * sxz), Math.max(1e-4, d[o + 5] * sy), Math.max(1e-4, d[o + 6] * sxz));
      this.m.compose(this.p, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) {
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
    }
    return done;
  }

  hideTag(tag: number): void {
    this.tags.forEach((t, i) => {
      if (t === tag) this.hidden.add(i);
    });
    this.apply(Infinity);
  }
}

/** Groups batches by key so every building part of the same kind is one draw call. */
export class Instancer {
  private batches = new Map<string, InstanceBatch>();
  private finished = false;

  batch(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, cast = true, receive = true): InstanceBatch {
    let b = this.batches.get(key);
    if (!b) {
      b = new InstanceBatch(geometry, material, { cast, receive });
      this.batches.set(key, b);
    }
    return b;
  }

  buildInto(parent: THREE.Object3D): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const [key, b] of this.batches) {
      if (!b.count) continue;
      const mesh = b.build();
      mesh.name = key;
      mesh.userData.batch = b;
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }

  update(t: number): void {
    if (this.finished) return;
    let done = true;
    for (const b of this.batches.values()) done = b.apply(t) && done;
    this.finished = done;
  }

  hideTag(tag: number): void {
    for (const b of this.batches.values()) b.hideTag(tag);
  }

  all(): InstanceBatch[] {
    return [...this.batches.values()];
  }
}
