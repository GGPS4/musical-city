import { GENRES, genreName } from '../data/genres.js';
import type { Comparison } from '../core/compare.js';
import type { CityPlan, GenreWeight, Vec2 } from '../types.js';

/**
 * Composes a print-style poster: the rendered city, district names placed
 * on it, numbered historical landmarks, the Musical DNA and a footer.
 */

const W = 2400;
const H = 3950;
const DISPLAY = '"Space Grotesk", "Helvetica Neue", Arial, sans-serif';
const MONO = '"JetBrains Mono", Menlo, monospace';
const BODY = 'Inter, "Helvetica Neue", Arial, sans-serif';

export interface PosterInput {
  plan: CityPlan;
  image: HTMLCanvasElement;
  project: (p: Vec2, y?: number) => [number, number];
  inputs: string[];
  subtitle: string;
  compare: Comparison | null;
  url: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function dnaBars(ctx: CanvasRenderingContext2D, dna: GenreWeight[], x: number, y: number, w: number, title: string, accent?: string): number {
  ctx.fillStyle = '#9794ae';
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(title.toUpperCase(), x, y);
  y += 50;
  for (const d of dna.slice(0, 6)) {
    const color = accent ?? (d.genre === 'other' ? '#8e8ca6' : GENRES[d.genre].style.neon[0]);
    ctx.fillStyle = '#eceaf5';
    ctx.font = `500 34px ${BODY}`;
    ctx.fillText(genreName(d.genre), x, y);
    ctx.fillStyle = '#9794ae';
    ctx.font = `400 28px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${d.percent}%`, x + w, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y + 14, w, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 14, (w * Math.max(2, d.percent)) / 100, 6);
    y += 72;
  }
  return y;
}

export async function composePoster(p: PosterInput): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([
      document.fonts.load(`700 120px ${DISPLAY}`),
      document.fonts.load(`500 30px ${MONO}`),
      document.fonts.load(`500 30px ${BODY}`),
    ]);
  } catch {
    /* system fonts are fine */
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0c1a');
  bg.addColorStop(1, '#05060c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const M = 120;
  // Header
  ctx.fillStyle = '#9794ae';
  ctx.font = `500 30px ${MONO}`;
  ctx.fillText(p.compare ? 'TWO TASTES · ONE CITY' : 'A CITY BUILT FROM MUSIC', M, 170);
  ctx.fillStyle = '#f4f1ff';
  ctx.font = `700 150px ${DISPLAY}`;
  ctx.fillText('MUSICAL CITY', M - 6, 320);
  ctx.fillStyle = '#ffd27a';
  ctx.font = `500 50px ${BODY}`;
  const sub = p.compare ? `${p.compare.youName} × ${p.compare.themName} · ${p.compare.score}% taste overlap` : p.subtitle;
  ctx.fillText(sub, M, 400);

  // City image with rounded frame
  const size = W - M * 2;
  const top = 470;
  ctx.save();
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(M + r, top);
  ctx.arcTo(M + size, top, M + size, top + size, r);
  ctx.arcTo(M + size, top + size, M, top + size, r);
  ctx.arcTo(M, top + size, M, top, r);
  ctx.arcTo(M, top, M + size, top, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(p.image, M, top, size, size);
  const shade = ctx.createLinearGradient(0, top, 0, top + size);
  shade.addColorStop(0, 'rgba(5,6,12,0.35)');
  shade.addColorStop(0.2, 'rgba(5,6,12,0)');
  shade.addColorStop(0.85, 'rgba(5,6,12,0)');
  shade.addColorStop(1, 'rgba(5,6,12,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(M, top, size, size);
  ctx.restore();

  const k = size / p.image.width;
  const toPoster = (v: Vec2, y = 0): [number, number] => {
    const [x, yy] = p.project(v, y);
    return [M + x * k, top + yy * k];
  };

  ctx.textAlign = 'center';
  // Numbered historical landmarks
  const hist = p.plan.landmarks.filter((l) => l.type === 'historical');
  hist.forEach((l, i) => {
    const [x, y] = toPoster(l.position, 8);
    if (x < M || x > M + size || y < top || y > top + size) return;
    ctx.fillStyle = '#ffcf6b';
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1206';
    ctx.font = `700 28px ${DISPLAY}`;
    ctx.fillText(String(i + 1), x, y + 10);
  });

  // District names
  ctx.textAlign = 'center';
  for (const d of p.plan.districts) {
    const [x, y] = toPoster(d.center, 34);
    if (x < M || x > M + size || y < top || y > top + size) continue;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 46px ${DISPLAY}`;
    ctx.fillText(d.name.toUpperCase(), x, y);
    ctx.fillStyle = GENRES[d.genre].style.neon[0];
    ctx.font = `500 26px ${MONO}`;
    const tag = p.compare ? ownerText(p.compare, d.genre) : d.nickname;
    ctx.fillText(tag.toUpperCase(), x, y + 40);
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = 'left';

  // Lower section
  let y = top + size + 130;
  const colW = (W - M * 2 - 120) / 2;
  if (p.compare) {
    const y1 = dnaBars(ctx, p.compare.youDna, M, y, colW * 0.46, p.compare.youName === 'You' ? 'Your DNA' : `${p.compare.youName}’s DNA`, '#ffd27a');
    const y2 = dnaBars(ctx, p.compare.themDna, M + colW * 0.54, y, colW * 0.46, p.compare.themName + '’s DNA', '#3ef0ff');
    y = Math.max(y1, y2);
  } else {
    y = dnaBars(ctx, p.plan.dna, M, y, colW, 'Musical DNA · estimated');
  }

  // Landmarks legend
  let ly = top + size + 130;
  const lx = M + colW + 120;
  ctx.fillStyle = '#9794ae';
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText('HISTORICAL LANDMARKS', lx, ly);
  ly += 52;
  for (const [i, l] of hist.slice(0, 12).entries()) {
    ctx.fillStyle = '#ffcf6b';
    ctx.font = `700 30px ${DISPLAY}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), lx, ly);
    ctx.fillStyle = '#eceaf5';
    ctx.font = `500 32px ${BODY}`;
    ctx.fillText(l.name, lx + 70, ly);
    ctx.fillStyle = '#6b6984';
    ctx.font = `400 24px ${MONO}`;
    ctx.fillText(l.date ?? '', lx + 70, ly + 32);
    ly += 76;
  }
  if (!hist.length) {
    ctx.fillStyle = '#6b6984';
    ctx.font = `400 30px ${BODY}`;
    ctx.fillText('No historical landmarks in this city yet.', lx, ly);
  }

  // Footer
  const fy = H - 170;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(M, fy - 60, W - M * 2, 2);
  ctx.fillStyle = '#9794ae';
  ctx.font = `400 28px ${BODY}`;
  const built = wrap(ctx, `Built from: ${p.inputs.join(', ')}`, W - M * 2);
  built.slice(0, 2).forEach((line, i) => ctx.fillText(line, M, fy + i * 40));
  ctx.fillStyle = '#6b6984';
  ctx.font = `400 24px ${MONO}`;
  ctx.fillText(`${p.url}   ·   ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, M, fy + 100);
  return c;
}

function ownerText(c: Comparison, genre: CityPlan['districts'][number]['genre']): string {
  const o = c.owners[genre];
  if (o === 'shared') return 'Shared ground';
  return o === 'them' ? c.themName : c.youName;
}
