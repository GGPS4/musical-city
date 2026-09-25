import * as THREE from 'three';

/**
 * Shared uniforms: flipping `lights` from 0 → 1 switches every window in the
 * city on during the build sequence without touching individual meshes.
 */
export const cityUniforms = {
  uLights: { value: 0 },
  uTime: { value: 0 },
};

export interface FacadeOptions {
  /** Window bay width in world units. */
  bay: number;
  /** Floor height in world units. */
  floor: number;
  /** Window size as fraction of the bay/floor cell (x, y). */
  win: [number, number];
  litRatio: number;
  warm: string;
  cool: string;
  coolMix: number;
  glass: string;
  intensity: number;
  roughness?: number;
  metalness?: number;
  /** Randomly hue-shift lit windows (psychedelic). */
  psychedelic?: boolean;
  /** Use angle around the instance centre for U (cylinders). */
  radial?: boolean;
  /** Glowing shopfront band on the ground floor. */
  storefront?: number;
}

const facadeCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * MeshStandardMaterial with procedurally drawn windows. Windows are computed
 * in world space, so they stay the right size on instanced boxes of any shape,
 * and a per-instance hash decides which ones are lit.
 */
export function facadeMaterial(key: string, o: FacadeOptions): THREE.MeshStandardMaterial {
  const cached = facadeCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0.05,
  });
  const u = {
    uBay: { value: o.bay },
    uFloor: { value: o.floor },
    uWin: { value: new THREE.Vector2((1 - o.win[0]) / 2, (1 - o.win[1]) / 2) },
    uLit: { value: o.litRatio },
    uWarm: { value: new THREE.Color(o.warm) },
    uCool: { value: new THREE.Color(o.cool) },
    uCoolMix: { value: o.coolMix },
    uGlass: { value: new THREE.Color(o.glass) },
    uIntensity: { value: o.intensity },
    uStore: { value: o.storefront ?? 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, cityUniforms);
    shader.defines = shader.defines ?? {};
    if (o.psychedelic) shader.defines.FACADE_PSYCH = '';
    if (o.radial) shader.defines.FACADE_RADIAL = '';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFcWorld;
        varying vec3 vFcNormal;
        varying vec3 vFcCenter;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 fcW = vec4(transformed, 1.0);
        vec3 fcN = objectNormal;
        vec4 fcC = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          fcW = instanceMatrix * fcW;
          fcN = mat3(instanceMatrix) * fcN;
          fcC = instanceMatrix * fcC;
        #endif
        fcW = modelMatrix * fcW;
        fcC = modelMatrix * fcC;
        vFcWorld = fcW.xyz;
        vFcCenter = fcC.xyz;
        vFcNormal = normalize(mat3(modelMatrix) * fcN);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFcWorld;
        varying vec3 vFcNormal;
        varying vec3 vFcCenter;
        uniform float uBay, uFloor, uLit, uCoolMix, uIntensity, uLights, uStore, uTime;
        uniform vec2 uWin;
        uniform vec3 uWarm, uCool, uGlass;
        float fcHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 fcHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 n = normalize(vFcNormal);
          float wall = 1.0 - smoothstep(0.35, 0.6, abs(n.y));
          vec2 local = vFcWorld.xz - vFcCenter.xz;
          #ifdef FACADE_RADIAL
            float u = atan(local.y, local.x) * max(length(local), 0.5);
          #else
            float u = abs(n.x) > abs(n.z) ? vFcWorld.z : vFcWorld.x;
          #endif
          float h = vFcWorld.y - vFcCenter.y;
          vec2 cell = vec2(u / uBay, (h - 0.35) / uFloor);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(uWin.x, f.x) * step(f.x, 1.0 - uWin.x) * step(uWin.y, f.y) * step(f.y, 1.0 - uWin.y);
          win *= wall * step(0.0, cell.y) * step(0.6, h);
          // Quantise the face direction so the hash is identical across a window (no per-pixel speckle).
          vec2 face = floor(n.xz * 1.999 + 0.5);
          float seed = fcHash(id + floor(vFcCenter.xz * 7.31) * 0.113 + face * vec2(3.1, 5.7));
          float lit = step(1.0 - uLit, seed);
          vec3 wc = mix(uWarm, uCool, step(0.5, fract(seed * 7.13)) * uCoolMix);
          #ifdef FACADE_PSYCH
            wc = mix(wc, fcHue(fract(seed * 3.7 + vFcCenter.x * 0.01)), 0.7);
          #endif
          float flicker = 0.85 + 0.15 * sin(uTime * (0.5 + seed * 2.0) + seed * 40.0);
          // Roofs read darker, ground a little shaded.
          diffuseColor.rgb *= mix(0.55, 1.0, wall);
          diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 2.5, vFcWorld.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, uGlass, win * 0.85);
          totalEmissiveRadiance += wc * win * lit * uLights * uIntensity * (0.55 + 0.9 * fract(seed * 13.7)) * flicker;
          // Shopfront glow on the ground floor.
          float store = uStore * wall * step(0.15, h) * step(h, 0.9) * step(0.55, fcHash(floor(vec2(u / (uBay * 2.0), 1.0)) + vFcCenter.xz));
          totalEmissiveRadiance += uWarm * store * uLights * 0.9;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `facade-${o.psychedelic ? 'p' : ''}${o.radial ? 'r' : ''}`;
  facadeCache.set(key, mat);
  return mat;
}

export const FACADES = {
  brick: () =>
    facadeMaterial('brick', { bay: 1.3, floor: 1.15, win: [0.42, 0.5], litRatio: 0.42, warm: '#ffb86b', cool: '#ffd9a0', coolMix: 0.3, glass: '#1c1a1f', intensity: 1.2, storefront: 1 }),
  concrete: () =>
    facadeMaterial('concrete', { bay: 2.4, floor: 1.15, win: [0.85, 0.28], litRatio: 0.24, warm: '#e8e4d8', cool: '#9fb7ff', coolMix: 0.6, glass: '#15171b', intensity: 1.0, roughness: 0.95 }),
  glass: () =>
    facadeMaterial('glass', { bay: 0.9, floor: 1.15, win: [0.8, 0.72], litRatio: 0.55, warm: '#ffd08a', cool: '#9ad0ff', coolMix: 0.7, glass: '#0f1a2a', intensity: 1.1, roughness: 0.35, metalness: 0.3 }),
  painted: () =>
    facadeMaterial('painted', { bay: 1.2, floor: 1.15, win: [0.45, 0.5], litRatio: 0.55, warm: '#ffcf7a', cool: '#ff8ad8', coolMix: 0.5, glass: '#221a2a', intensity: 1.3, psychedelic: true, radial: true, storefront: 1 }),
  classic: () =>
    facadeMaterial('classic', { bay: 1.25, floor: 1.3, win: [0.38, 0.6], litRatio: 0.52, warm: '#ffc27a', cool: '#fff0cc', coolMix: 0.4, glass: '#1d1914', intensity: 1.2, storefront: 1 }),
  industrial: () =>
    facadeMaterial('industrial', { bay: 1.8, floor: 1.6, win: [0.7, 0.35], litRatio: 0.28, warm: '#ffb45e', cool: '#c6e2ff', coolMix: 0.4, glass: '#16171a', intensity: 1.0 }),
  neon: () =>
    facadeMaterial('neon', { bay: 0.8, floor: 1.15, win: [0.7, 0.55], litRatio: 0.62, warm: '#7af7ff', cool: '#ff6ad5', coolMix: 0.6, glass: '#0b0f22', intensity: 1.3, roughness: 0.3, metalness: 0.4 }),
};

/* ---------- plain shared materials ---------- */

const plainCache = new Map<string, THREE.Material>();

export function std(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  let m = plainCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial(params);
    plainCache.set(key, m);
  }
  return m;
}

/** Unlit glowing material; values above 1 feed the bloom pass. */
export function glow(color: THREE.ColorRepresentation, strength = 2, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const key = `glow-${new THREE.Color(color).getHexString()}-${strength}-${opts.transparent ? 't' : ''}${opts.opacity ?? ''}`;
  let m = plainCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), toneMapped: false, ...opts });
    plainCache.set(key, m);
  }
  return m;
}

export const MATS = {
  roof: () => std('roof', { color: 0x2a2a2e, roughness: 0.95 }),
  metal: () => std('metal', { color: 0x6b6f78, roughness: 0.45, metalness: 0.7 }),
  darkMetal: () => std('darkMetal', { color: 0x222429, roughness: 0.6, metalness: 0.5 }),
  wood: () => std('wood', { color: 0x5a3e2b, roughness: 0.9 }),
  stone: () => std('stone', { color: 0x8a8578, roughness: 0.95 }),
  white: () => std('white', { color: 0xe9e4d8, roughness: 0.8 }),
  black: () => std('black', { color: 0x141417, roughness: 0.7 }),
  grass: () => std('grass', { color: 0x2f4a2c, roughness: 1 }),
  asphalt: () => std('asphalt', { color: 0x17191f, roughness: 0.95 }),
  plinth: () => std('plinth', { color: 0x2b2a2e, roughness: 0.9 }),
  instanced: () => std('instanced', { color: 0xffffff, roughness: 0.85 }),
};
