import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GENRES } from '../data/genres.js';
import type { CityPlan, Vec2 } from '../types.js';
import { TIMELINE } from './buildings.js';
import { CityView, type PickHit } from './cityBuilder.js';
import { LabelLayer, type LabelKind } from './labels.js';
import { WalkMode, type Nearby } from './walk.js';
import { MOOD_BY_ID, MoodState, Rain, Sparkles, type MoodId } from './mood.js';
import { glowTexture } from './textures.js';
import { cityUniforms } from './materials.js';

export interface SceneEvents {
  onPick: (hit: PickHit | null) => void;
  onLabel: (kind: LabelKind, id: string) => void;
  onBuildProgress?: (t: number) => void;
  onBuildComplete?: () => void;
  onNearby?: (n: Nearby) => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

/**
 * Owns the renderer, camera, controls, post-processing and the current city.
 * Everything UI-related talks to it through a small method surface.
 */
export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly mobile: boolean;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private city: CityView | null = null;
  private labels: LabelLayer;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private tween: CameraTween | null = null;
  private intro: { start: number; radius: number; azimuth: number } | null = null;
  private clock = new THREE.Timer();
  private time = 0;
  private down: { x: number; y: number; t: number } | null = null;
  private lastHover = 0;
  private frames = { count: 0, start: 0, checked: false };
  private buildDone = false;
  private moon!: THREE.DirectionalLight;
  readonly walk: WalkMode;
  private width = 1;
  private baseFog = 0.0028;
  private skyUniforms = {
    uTop: { value: new THREE.Color('#03040a') },
    uMid: { value: new THREE.Color('#0d0b1c') },
    uHor: { value: new THREE.Color('#291429') },
    uFlash: { value: 0 },
  };
  private starsMat!: THREE.PointsMaterial;
  private hemi = new THREE.HemisphereLight(0x4a5a9a, 0x1c1410, 0.9);
  private ambient = new THREE.AmbientLight(0x30284a, 0.35);
  private warm = new THREE.DirectionalLight(0xff9a5a, 0.25);
  private mood = new MoodState(MOOD_BY_ID.night.look);
  moodId: MoodId = 'night';
  private rain: Rain | null = null;
  private sparkles: Sparkles | null = null;
  private flash = { next: 4, level: 0 };
  private height = 1;

  constructor(private container: HTMLElement, labelRoot: HTMLElement, private events: SceneEvents) {
    this.mobile = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.mobile;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D city. Drag to orbit, scroll or pinch to zoom, click places to explore.');

    this.scene.background = new THREE.Color(0x06070f);
    this.scene.fog = new THREE.FogExp2(0x0a0b1a, 0.0028);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.camera.position.set(220, 200, 220);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minPolarAngle = 0.12;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 420;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.9;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('start', () => {
      this.tween = null;
      if (this.intro) this.skipIntro();
      this.controls.autoRotate = false;
    });

    this.addSky();
    this.addLights();
    this.addEnvironment();
    if (!this.mobile) this.setupComposer();
    this.rain = new Rain(this.mobile ? 1500 : 4000);
    this.sparkles = new Sparkles(this.mobile ? 250 : 600, glowTexture());
    this.scene.add(this.rain.object, this.sparkles.object);

    this.labels = new LabelLayer(labelRoot, (k, id) => this.events.onLabel(k, id));
    this.walk = new WalkMode(this.camera, this.renderer.domElement, (n) => this.events.onNearby?.(n));

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => this.handleUp(e));
    el.addEventListener('pointermove', (e) => this.handleHover(e));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ---------------- setup ---------------- */

  private addSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vP;
          uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform float uFlash;
          void main(){
            float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 top = uTop;
            vec3 mid = uMid;
            vec3 hor = uHor + uFlash;
            vec3 c = mix(hor, mid, smoothstep(0.45, 0.6, h));
            c = mix(c, top, smoothstep(0.6, 0.95, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.scene.add(sky);

    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(Math.random() * 0.85);
      pos.set([Math.sin(v) * Math.cos(u) * 1000, Math.cos(v) * 1000, Math.sin(v) * Math.sin(u) * 1000], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 });
    this.scene.add(new THREE.Points(g, this.starsMat));
  }

  private addLights() {
    this.scene.add(this.hemi, this.ambient);
    const moon = new THREE.DirectionalLight(0xaebfff, 1.1);
    moon.position.set(-120, 180, 90);
    moon.castShadow = !this.mobile;
    moon.shadow.mapSize.set(4096, 4096);
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.4;
    const s = moon.shadow.camera;
    s.left = s.bottom = -130;
    s.right = s.top = 130;
    s.near = 10;
    s.far = 500;
    this.moon = moon;
    this.scene.add(moon, moon.target);
    this.warm.position.set(120, 40, -100);
    this.scene.add(this.warm);
  }

  /** A tiny procedural "city lights" environment for glass and metal reflections. */
  private addEnvironment() {
    const env = new THREE.Scene();
    const mk = (color: number, x: number, y: number, z: number, s: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    env.background = new THREE.Color(0x0b0c18);
    mk(0xffb070, 10, 2, 0, 6);
    mk(0x6fa8ff, -10, 3, 3, 7);
    mk(0xff5ac8, 0, 2, -10, 5);
    mk(0x9aa6ff, 0, 10, 0, 12);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
  }

  private setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 50 : 38;
    this.applyViewOffset();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  /* ---------------- city ---------------- */

  setCity(plan: CityPlan, animate: boolean, districtSubs: Record<string, string> = {}): void {
    if (this.walk.active) this.exitWalk();
    this.city?.dispose();
    this.labels.clear();
    this.city = new CityView(plan, { animate, mobile: this.mobile });
    this.scene.add(this.city.group);
    this.buildDone = !animate;
    this.controls.maxDistance = plan.size * 1.6;
    const r = plan.size / 2 + 20;
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -r;
    sc.right = sc.top = r;
    sc.far = plan.size * 3;
    sc.updateProjectionMatrix();
    this.moon.position.set(-0.6, 0.9, 0.45).multiplyScalar(plan.size);
    // Keep the haze proportional so a bigger city doesn't vanish into fog.
    this.baseFog = 0.0028 * (200 / plan.size);
    (this.scene.fog as THREE.FogExp2).density = this.baseFog;

    for (const d of plan.districts) {
      this.labels.add('district', d.genre, d.name, districtSubs[d.genre] ?? d.nickname, new THREE.Vector3(d.center.x, 16, d.center.z), [0, 9999]);
    }
    for (const m of plan.mixed) {
      this.labels.add('mixed', m.genres.join('|'), m.name, 'where the styles blend', new THREE.Vector3(m.center.x, 11, m.center.z), [plan.size * 0.35, plan.size * 1.3]);
    }
    for (const l of plan.landmarks) {
      const model = this.city.landmarks.get(l.id);
      this.labels.add('landmark', l.id, l.name, l.type === 'historical' ? 'Historical landmark' : 'Musical interpretation', new THREE.Vector3(l.position.x, (model?.height ?? 6) + 6.5, l.position.z), [0, plan.size * (l.type === 'historical' ? 0.62 : 0.45)]);
    }
    for (const v of plan.venues) this.addVenueLabel(v.id);
    for (const t of plan.labels) {
      const model = this.city.towers.get(t.id);
      this.labels.add('label', t.id, t.name, 'Record label', new THREE.Vector3(t.position.x, (model?.height ?? 40) + 4, t.position.z), [0, plan.size * 0.9]);
    }
    for (const b of plan.buskers) {
      this.labels.add('busker', b.id, b.name, 'Busker', new THREE.Vector3(b.position.x, 4.4, b.position.z), [0, plan.size * 0.16]);
    }
    this.walk.setPlan(plan);

    if (animate) {
      this.intro = { start: this.time, radius: plan.size, azimuth: Math.random() * Math.PI * 2 };
      this.controls.enabled = false;
      this.labels.setDimmed(true);
    } else {
      this.intro = null;
      this.controls.enabled = true;
      this.labels.setDimmed(false);
    }
  }

  private addVenueLabel(id: string) {
    const plan = this.city?.plan;
    const v = plan?.venues.find((x) => x.id === id);
    const model = this.city?.venues.get(id);
    if (!v || !plan) return;
    this.labels.add('venue', v.id, v.name, null, new THREE.Vector3(v.position.x, (model?.height ?? 4) + 5.5, v.position.z), [0, plan.size * 0.42]);
  }

  get currentCity(): CityView | null {
    return this.city;
  }

  /** Idle orbit used behind the landing screen. */
  setAmbient(on: boolean): void {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enabled = !on;
    this.labels.setDimmed(on);
    if (on && this.city) {
      const s = this.city.plan.size;
      this.camera.position.set(s * 0.62, s * 0.42, s * 0.62);
      this.controls.target.set(0, 0, 0);
    }
  }

  skipIntro(): void {
    if (!this.intro || !this.city) return;
    this.city.finishNow();
    this.intro = null;
    this.controls.enabled = true;
    this.finishBuild();
    this.overview(0.9);
  }

  private finishBuild() {
    if (this.buildDone) return;
    this.buildDone = true;
    this.labels.setDimmed(false);
    this.events.onBuildComplete?.();
  }

  overview(duration = 1.2): void {
    if (!this.city) return;
    const s = this.city.plan.size;
    const az = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    const r = s * (this.width < this.height ? 1.45 : 1.02);
    this.flyTo(new THREE.Vector3(Math.sin(az) * r * 0.72, r * 0.68, Math.cos(az) * r * 0.72), new THREE.Vector3(0, 0, 0), duration);
  }

  /** Smoothly frames a place. `distance` is camera distance from it. */
  focus(pos: Vec2, distance = 46, height = 4, duration = 1.1): void {
    const target = new THREE.Vector3(pos.x, height, pos.z);
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(1, 0, 1);
    dir.normalize();
    const elev = 0.9;
    const camPos = target.clone().add(dir.multiplyScalar(distance * Math.cos(elev))).add(new THREE.Vector3(0, distance * Math.sin(elev), 0));
    this.flyTo(camPos, target, duration);
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration: number) {
    this.controls.autoRotate = false;
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: pos,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      start: performance.now() / 1000,
      duration,
    };
  }

  /** Shifts the rendered view up so a focused place is not hidden behind a bottom sheet. */
  setViewShift(fraction: number): void {
    this.viewShift = fraction;
    this.applyViewOffset();
  }

  private viewShift = 0;

  private applyViewOffset() {
    if (this.viewShift) this.camera.setViewOffset(this.width, this.height, 0, this.height * this.viewShift, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  highlightLabel(kind: LabelKind | null, id: string | null): void {
    this.labels.setHighlighted(kind, id);
  }

  onVenueAdded(id: string): void {
    this.addVenueLabel(id);
    const v = this.city?.plan.venues.find((x) => x.id === id);
    if (v) this.walk.removeAt(v.position);
  }

  setDistrictSub(genre: string, sub: string): void {
    this.labels.setSub('district', genre, sub);
  }

  /* ---------------- poster ---------------- */

  /**
   * Renders the city from a fixed three-quarter angle into a square image for
   * the poster, and returns a projector for placing labels on top of it.
   */
  capturePoster(size = 2048): { image: HTMLCanvasElement; project: (p: Vec2, y?: number) => [number, number] } | null {
    const city = this.city;
    if (!city) return null;
    const cam = new THREE.PerspectiveCamera(32, 1, 1, 3000);
    const s = city.plan.size;
    cam.position.set(s * 0.78, s * 0.95, s * 0.78);
    cam.lookAt(0, -s * 0.04, 0);
    cam.updateMatrixWorld();

    const prevRatio = this.renderer.getPixelRatio();
    city.select(null);
    city.beams([]);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.composer?.setSize(size, size);
    this.bloom?.setSize(size, size);
    const pass = this.composer?.passes[0] as RenderPass | undefined;
    if (pass) pass.camera = cam;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, cam);

    const image = document.createElement('canvas');
    image.width = size;
    image.height = size;
    image.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0, size, size);

    if (pass) pass.camera = this.camera;
    this.renderer.setPixelRatio(prevRatio);
    this.resize();
    const v = new THREE.Vector3();
    return {
      image,
      project: (p, y = 0) => {
        v.set(p.x, y, p.z).project(cam);
        return [(v.x * 0.5 + 0.5) * size, (-v.y * 0.5 + 0.5) * size];
      },
    };
  }

  /* ---------------- walking ---------------- */

  enterWalk(at: Vec2, lookAt?: Vec2): void {
    if (!this.city) return;
    if (this.intro) this.skipIntro();
    this.tween = null;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.setViewShift(0);
    // A soft light that follows you, and a brighter exposure, so facades read at street level.
    if (!this.walkLight.parent) this.camera.add(this.walkLight);
    if (!this.camera.parent) this.scene.add(this.camera);
    this.walkLight.visible = true;
    this.walk.enter(at, lookAt);
  }

  private walkLight = new THREE.PointLight(0xffe2b8, 18, 30, 1.4);

  exitWalk(): void {
    if (!this.walk.active) return;
    const look = this.walk.lookPoint();
    this.walk.exit();
    this.walkLight.visible = false;
    this.controls.enabled = true;
    this.controls.target.copy(look);
    const back = this.camera.position.clone().sub(look).setY(0).normalize();
    this.camera.position.copy(look).add(back.multiplyScalar(40)).setY(34);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.resize();
    this.controls.update();
  }

  get walking(): boolean {
    return this.walk.active;
  }

  /* ---------------- interaction ---------------- */

  private raycast(e: PointerEvent): PickHit | null {
    if (!this.city) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.city.pickables, true);
    for (const h of hits) {
      if (!h.object.visible && !h.object.userData.pickProxy) continue;
      const r = this.city.resolveHit(h);
      if (r) return r;
    }
    return null;
  }

  private handleUp(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    if (!d || this.intro) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 7 || performance.now() - d.t > 600) return;
    this.events.onPick(this.raycast(e));
  }

  private handleHover(e: PointerEvent) {
    if (this.mobile || e.buttons || this.intro) return;
    const now = performance.now();
    if (now - this.lastHover < 70) return;
    this.lastHover = now;
    const hit = this.raycast(e);
    this.renderer.domElement.style.cursor = hit && hit.kind !== 'building' ? 'pointer' : hit ? 'help' : 'grab';
  }

  /* ---------------- loop ---------------- */

  private frame() {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const city = this.city;
    city?.update(dt);
    this.applyMood(dt);

    if (this.walk.active) {
      this.walk.update(dt, this.time);
    } else if (this.intro && city) {
      const t = this.time - this.intro.start;
      const k = Math.min(1, t / TIMELINE.done);
      const e = easeInOut(k);
      const s = this.intro.radius;
      const az = this.intro.azimuth + e * 0.9;
      const r = s * (0.5 + 0.55 * e) * (this.width < this.height ? 1.4 : 1);
      const elev = 0.45 + 0.33 * e;
      this.camera.position.set(Math.sin(az) * r * Math.cos(elev), r * Math.sin(elev) + 8, Math.cos(az) * r * Math.cos(elev));
      this.controls.target.set(0, 0, 0);
      this.camera.lookAt(this.controls.target);
      this.events.onBuildProgress?.(t);
      if (k >= 1) {
        this.intro = null;
        this.controls.enabled = true;
        this.finishBuild();
      }
    } else if (this.tween) {
      const k = Math.min(1, (performance.now() / 1000 - this.tween.start) / this.tween.duration);
      const e = easeInOut(k);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
      if (k >= 1) this.tween = null;
      this.controls.update();
    } else {
      this.clampTarget();
      this.controls.update();
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera, this.controls.target, this.width, this.height, this.walk.active);
    this.adapt();
  }

  private clampTarget() {
    if (!this.city) return;
    const lim = this.city.plan.size / 2 + 5;
    const t = this.controls.target;
    const cx = Math.max(-lim, Math.min(lim, t.x));
    const cz = Math.max(-lim, Math.min(lim, t.z));
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x;
      const dz = cz - t.z;
      t.x = cx;
      t.z = cz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    if (t.y < 0) t.y = 0;
  }

  /** Drops bloom and resolution once if the machine is struggling. */
  private adapt() {
    if (this.frames.checked) return;
    const now = performance.now();
    if (!this.frames.start) this.frames.start = now;
    this.frames.count++;
    const elapsed = (now - this.frames.start) / 1000;
    if (elapsed < 3 || this.frames.count < 3) return;
    const fps = this.frames.count / elapsed;
    this.frames.checked = true;
    if (fps < 32) {
      console.info(`[musical-city] ${fps.toFixed(0)} fps, reducing quality`);
      this.composer = null;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.resize();
    }
  }

  /* ---------------- mood ---------------- */

  setMood(id: MoodId, instant = false): void {
    this.moodId = id;
    this.mood.set(MOOD_BY_ID[id].look, instant);
    this.flash.next = this.time + 1.5;
  }

  private applyMood(dt: number) {
    const m = this.mood;
    m.update(dt);
    const c = m.colors;
    const n = m.nums;
    // Lightning: two quick flickers every few seconds.
    let flash = 0;
    if (m.lightning && this.time > this.flash.next) {
      this.flash.level = 1;
      this.flash.next = this.time + 3 + Math.random() * 6;
    }
    if (this.flash.level > 0) {
      this.flash.level = Math.max(0, this.flash.level - dt * 3.2);
      flash = this.flash.level * (Math.sin(this.flash.level * 40) > 0 ? 1 : 0.3);
    }
    this.skyUniforms.uTop.value.copy(c.skyTop);
    this.skyUniforms.uMid.value.copy(c.skyMid);
    this.skyUniforms.uHor.value.copy(c.skyHorizon);
    this.skyUniforms.uFlash.value = flash * 0.5;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(c.fog);
    fog.density = this.baseFog * n.fogDensity * (this.walk.active ? 1.6 : 1);
    (this.scene.background as THREE.Color).copy(c.skyTop).lerp(c.fog, 0.5);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = n.hemi + flash * 2.5;
    this.ambient.color.copy(c.ambientColor);
    this.ambient.intensity = n.ambient;
    this.moon.color.copy(c.moonColor);
    this.moon.intensity = n.moon;
    this.warm.color.copy(c.warmColor);
    this.warm.intensity = n.warm;
    this.starsMat.opacity = n.stars;
    cityUniforms.uMoodTint.value.copy(c.windowTint);
    cityUniforms.uMoodLit.value = n.windowLevel;
    this.renderer.toneMappingExposure = n.exposure * (this.walk.active ? 1.33 : 1);
    if (this.bloom) this.bloom.strength = n.bloom;
    const center = this.walk.active ? this.camera.position : this.controls.target;
    this.rain?.update(dt, center, n.rain);
    this.sparkles?.update(this.time, center, n.sparkles);
  }

  genreColor(genre: string): string {
    return genre in GENRES ? GENRES[genre as keyof typeof GENRES].style.neon[0] : '#ffd27a';
  }
}
