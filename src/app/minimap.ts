import { GENRES } from '../data/genres.js';
import { store } from '../core/store.js';
import type { CityPlan } from '../types.js';
import { $ } from '../ui/dom.js';
import type { AppContext } from './context.js';

/**
 * A round, heading-up mini-map while walking: blocks tinted by district,
 * the river, venues, landmarks, label towers, friends, and you in the middle.
 */

const PX = 2; // base map pixels per metre
const VIEW = 60; // metres from the centre to the edge of the map

function baseMap(plan: CityPlan): HTMLCanvasElement {
  const size = Math.ceil(plan.size * PX) + 40;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const o = size / 2;
  const X = (x: number) => o + x * PX;
  g.fillStyle = '#15161f';
  g.fillRect(0, 0, size, size);
  const bs = plan.pitch - plan.road;
  for (const b of plan.blocks) {
    if (b.use === 'water') continue;
    g.fillStyle = b.use === 'park' ? '#1f3a26' : b.use === 'plaza' ? '#3a3548' : shade(GENRES[b.dominant].style.neon[0], 0.28);
    g.fillRect(X(b.center.x - bs / 2), X(b.center.z - bs / 2), bs * PX, bs * PX);
  }
  g.strokeStyle = '#1d4f8a';
  g.lineWidth = plan.river.width * PX;
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  plan.river.points.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
  g.stroke();
  g.strokeStyle = '#6a6f80';
  g.lineWidth = plan.road * PX * 0.9;
  for (const b of plan.bridges) {
    const h = b.length / 2;
    g.beginPath();
    if (b.rotation) {
      g.moveTo(X(b.position.x), X(b.position.z - h));
      g.lineTo(X(b.position.x), X(b.position.z + h));
    } else {
      g.moveTo(X(b.position.x - h), X(b.position.z));
      g.lineTo(X(b.position.x + h), X(b.position.z));
    }
    g.stroke();
  }
  for (const t of plan.labels) {
    g.fillStyle = t.color;
    g.fillRect(X(t.position.x) - 6, X(t.position.z) - 6, 12, 12);
  }
  for (const v of plan.venues) {
    g.fillStyle = v.neon;
    g.beginPath();
    g.arc(X(v.position.x), X(v.position.z), 5, 0, Math.PI * 2);
    g.fill();
  }
  for (const l of plan.landmarks) {
    g.fillStyle = l.type === 'historical' ? '#ffcf6b' : '#c9b6ff';
    star(g, X(l.position.x), X(l.position.z), 8);
  }
  return c;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f + 20);
  const gr = Math.round(((n >> 8) & 255) * f + 20);
  const b = Math.round((n & 255) * f + 26);
  return `rgb(${r},${gr},${b})`;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function createMinimap(ctx: AppContext, friends: () => { x: number; z: number; color: string; inside: string | null; walking: boolean }[]) {
  const canvas = $('#minimap') as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  let base: { plan: CityPlan; img: HTMLCanvasElement } | null = null;

  function draw() {
    const plan = store.get().plan;
    const show = !!plan && ctx.scene.walking && !ctx.scene.insideVenue;
    canvas.hidden = !show;
    if (!show || !plan) return;
    if (base?.plan !== plan) base = { plan, img: baseMap(plan) };
    const me = ctx.scene.selfState();
    const W = canvas.width;
    const R = W / 2;
    const k = R / VIEW; // canvas pixels per metre
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 3, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0c0d14';
    g.fillRect(0, 0, W, W);
    // Heading up: rotate the world so the way you face points to the top.
    g.translate(R, R);
    const theta = me.yaw - Math.PI;
    g.rotate(theta);
    const o = base.img.width / 2;
    g.scale(k / PX, k / PX);
    g.drawImage(base.img, -(o + me.x * PX), -(o + me.z * PX));
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Friends.
    for (const f of friends()) {
      if (!f.walking || f.inside) continue;
      const dx = f.x - me.x;
      const dz = f.z - me.z;
      const a = theta;
      let px = (dx * Math.cos(a) - dz * Math.sin(a)) * k;
      let pz = (dx * Math.sin(a) + dz * Math.cos(a)) * k;
      const d = Math.hypot(px, pz);
      if (d > R - 12) {
        px *= (R - 12) / d;
        pz *= (R - 12) / d;
      }
      g.fillStyle = f.color;
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(R + px, R + pz, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
    // You: an arrow in the middle, pointing the way you face.
    g.fillStyle = '#ffd27a';
    g.strokeStyle = '#1a1206';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(R, R - 14);
    g.lineTo(R + 9, R + 10);
    g.lineTo(R, R + 5);
    g.lineTo(R - 9, R + 10);
    g.closePath();
    g.fill();
    g.stroke();
    // North marker on the rim.
    const na = -Math.PI / 2 + (me.yaw - Math.PI);
    const nx = R + Math.cos(na) * (R - 16);
    const ny = R + Math.sin(na) * (R - 16);
    g.fillStyle = '#fff';
    g.font = '700 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', nx, ny);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(R, R, R - 3, 0, Math.PI * 2);
    g.stroke();
  }

  window.setInterval(draw, 100);
  return { redraw: draw };
}
