import type { Artist, GenreId, GenreWeight } from '../types.js';

/** How an artist's weight spreads across its genre list (most characteristic first). */
const ARTIST_SPREAD = [0.55, 0.3, 0.15];

/**
 * Estimates a genre breakdown from the user's selections. The numbers are a
 * rough blend, not a measurement; the UI labels them "Estimated from your selections".
 */
export function computeDna(artists: Artist[], genres: GenreId[], unknownCount: number): GenreWeight[] {
  const raw = new Map<GenreId | 'other', number>();
  const add = (g: GenreId | 'other', w: number) => raw.set(g, (raw.get(g) ?? 0) + w);

  for (const a of artists) {
    if (!a.genres.length) {
      add('other', 0.6);
      continue;
    }
    const spread = ARTIST_SPREAD.slice(0, a.genres.length);
    const total = spread.reduce((s, v) => s + v, 0);
    a.genres.slice(0, spread.length).forEach((g, i) => add(g, spread[i] / total));
  }
  for (const g of genres) add(g, 1);
  if (unknownCount) add('other', unknownCount * 0.6);

  const entries = [...raw.entries()].filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!sum) return [];

  // Largest-remainder rounding so the displayed percentages add up to 100.
  const exact = entries.map(([genre, weight]) => ({ genre, weight: weight / sum, exact: (weight / sum) * 100 }));
  const floors = exact.map((e) => Math.floor(e.exact));
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((e, i) => ({ i, r: e.exact - floors[i] })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i]++;
    remaining--;
  }
  return exact
    .map((e, i) => ({ genre: e.genre, weight: e.weight, percent: floors[i] }))
    .sort((a, b) => b.weight - a.weight || (a.genre === 'other' ? 1 : -1));
}
