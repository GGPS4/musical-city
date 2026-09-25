import * as THREE from 'three';

/**
 * Unit geometries shared by every instanced mesh. All of them sit on y = 0
 * with a 1×1×1 footprint so instance matrices can scale them freely.
 */

function baseAt0(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(0, -bb.min.y, 0);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

let cache: ReturnType<typeof build> | null = null;

function build() {
  const box = baseAt0(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = baseAt0(new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1));
  const cylinderLow = baseAt0(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1));
  const dome = baseAt0(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const sphere = new THREE.SphereGeometry(0.5, 16, 12);
  const cone = baseAt0(new THREE.ConeGeometry(0.5, 1, 4, 1));
  cone.rotateY(Math.PI / 4);
  const coneRound = baseAt0(new THREE.ConeGeometry(0.5, 1, 10, 1));
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  const torus = new THREE.TorusGeometry(0.5, 0.06, 8, 32);

  // Pitched roof: triangular prism along X.
  const tri = new THREE.Shape();
  tri.moveTo(-0.5, 0);
  tri.lineTo(0.5, 0);
  tri.lineTo(0, 1);
  tri.closePath();
  const pitched = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  pitched.translate(0, 0, -0.5);
  pitched.rotateY(Math.PI / 2);
  baseAt0(pitched);

  // Saw-tooth factory roof (three teeth) along X.
  const saw = new THREE.Shape();
  saw.moveTo(-0.5, 0);
  const teeth = 3;
  for (let i = 0; i < teeth; i++) {
    const x0 = -0.5 + i / teeth;
    saw.lineTo(x0, 1);
    saw.lineTo(x0 + 1 / teeth, 0);
  }
  saw.closePath();
  const sawtooth = new THREE.ExtrudeGeometry(saw, { depth: 1, bevelEnabled: false });
  sawtooth.translate(0, 0, -0.5);
  baseAt0(sawtooth);

  // Half cylinder (barrel vault) along X.
  const arc = new THREE.Shape();
  arc.moveTo(-0.5, 0);
  arc.absarc(0, 0, 0.5, Math.PI, 0, true);
  arc.closePath();
  const barrel = new THREE.ExtrudeGeometry(arc, { depth: 1, bevelEnabled: false, curveSegments: 16 });
  barrel.translate(0, 0, -0.5);
  barrel.rotateY(Math.PI / 2);
  baseAt0(barrel);

  const plane = new THREE.PlaneGeometry(1, 1);
  const groundPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  return { box, cylinder, cylinderLow, dome, sphere, cone, coneRound, ico, torus, pitched, sawtooth, barrel, plane, groundPlane };
}

export function geo() {
  if (!cache) cache = build();
  return cache;
}
