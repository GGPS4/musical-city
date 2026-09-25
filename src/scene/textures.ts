import * as THREE from 'three';

/** Procedural canvas textures (signs, graffiti, glows). Cached and shared. */

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function finish(key: string, c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export const SIGN_FONT = '"Space Grotesk", "Helvetica Neue", Arial, sans-serif';

/** Neon sign: glowing text on a dark board. Returns texture and width/height ratio. */
export function signTexture(text: string, color: string, style: 'neon' | 'marquee' | 'plain' = 'neon'): { tex: THREE.Texture; aspect: number } {
  const key = `sign|${text}|${color}|${style}`;
  const label = text.toUpperCase();
  const [m, mctx] = canvas(8, 8);
  void m;
  mctx.font = `700 64px ${SIGN_FONT}`;
  const tw = Math.min(1800, mctx.measureText(label).width);
  const w = Math.max(256, Math.ceil(tw + 90));
  const h = 128;
  const aspect = w / h;
  const hit = cache.get(key);
  if (hit) return { tex: hit, aspect };

  const [c, ctx] = canvas(w, h);
  if (style === 'marquee') {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff3c4';
    for (let x = 12; x < w; x += 22) {
      for (const y of [10, h - 10]) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (style === 'plain') {
    ctx.fillStyle = '#f1ece0';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = 'rgba(8,8,12,0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
  ctx.font = `700 ${tw > 1700 ? 56 : 64}px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (style === 'plain') {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(label, w / 2, h / 2 + 3, w - 40);
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = color;
    ctx.fillText(label, w / 2, h / 2 + 3, w - 40);
    ctx.shadowBlur = 0;
    ctx.fillStyle = style === 'marquee' ? '#fff8e0' : 'rgba(255,255,255,0.85)';
    ctx.fillText(label, w / 2, h / 2 + 3, w - 40);
  }
  return { tex: finish(key, c), aspect };
}

const TAGS = ['RIOT', 'LOUD', 'DIY', 'NOISE', 'FUZZ', 'OI!', 'SCENE', 'GIG'];
const SPRAY = ['#ff2e63', '#ffe600', '#08d9d6', '#ff9a3c', '#a3f7bf', '#f8f8f8', '#c77dff'];

export function graffitiTexture(variant: number): THREE.Texture {
  const key = `graffiti|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(256, 128);
  let s = variant * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Paint blobs
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = SPRAY[Math.floor(r() * SPRAY.length)] + '55';
    ctx.beginPath();
    ctx.ellipse(r() * 256, r() * 128, 20 + r() * 50, 10 + r() * 25, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tag = TAGS[variant % TAGS.length];
  ctx.save();
  ctx.translate(128, 70);
  ctx.rotate((r() - 0.5) * 0.3);
  ctx.font = `900 ${56 + r() * 16}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#111';
  ctx.strokeText(tag, 0, 0);
  ctx.fillStyle = SPRAY[variant % SPRAY.length];
  ctx.fillText(tag, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = SPRAY[(variant + 3) % SPRAY.length];
  ctx.strokeText(tag, 0, 0);
  ctx.restore();
  // Drips
  ctx.fillStyle = SPRAY[variant % SPRAY.length];
  for (let i = 0; i < 6; i++) ctx.fillRect(40 + r() * 176, 88, 3, 8 + r() * 26);
  return finish(key, c);
}

export function glowTexture(): THREE.Texture {
  const hit = cache.get('glow');
  if (hit) return hit;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish('glow', c);
}

export function beamTexture(): THREE.Texture {
  const hit = cache.get('beam');
  if (hit) return hit;
  const [c, ctx] = canvas(8, 256);
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return finish('beam', c);
}

/** A thin glowing pulse line for the post-punk monolith. */
export function pulseTexture(): THREE.Texture {
  const hit = cache.get('pulse');
  if (hit) return hit;
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = '#e8f1ff';
  ctx.shadowColor = '#9fb7ff';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 5;
  ctx.beginPath();
  const y = 300;
  ctx.moveTo(0, y);
  ctx.lineTo(80, y);
  ctx.lineTo(100, y - 30);
  ctx.lineTo(118, y + 60);
  ctx.lineTo(136, y - 150);
  ctx.lineTo(154, y + 40);
  ctx.lineTo(170, y);
  ctx.lineTo(256, y);
  ctx.stroke();
  return finish('pulse', c);
}

export function vinylTexture(label: string): THREE.Texture {
  const key = `vinyl|${label}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#0b0b0d';
  ctx.beginPath();
  ctx.arc(128, 128, 127, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let r = 50; r < 124; r += 4) {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = label;
  ctx.beginPath();
  ctx.arc(128, 128, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(128, 128, 5, 0, Math.PI * 2);
  ctx.fill();
  return finish(key, c);
}

/** A glowing music note for buskers. */
export function noteTexture(): THREE.Texture {
  const hit = cache.get('note');
  if (hit) return hit;
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.font = 'bold 46px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', 32, 34);
  return finish('note', c);
}
