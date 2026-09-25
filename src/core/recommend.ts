import { ARTISTS, ARTIST_BY_ID } from '../data/artists.js';
import type { Artist, GenreWeight } from '../types.js';
import type { Rng } from './random.js';

/** Artists linked to `a` in either direction, so connections read both ways. */
export function neighbours(a: Artist): Artist[] {
  const ids = new Set([...(a.relatedArtists ?? []), ...(a.influences ?? [])]);
  for (const other of ARTISTS) {
    if (other.relatedArtists?.includes(a.id) || other.influences?.includes(a.id)) ids.add(other.id);
  }
  ids.delete(a.id);
  return [...ids].map((id) => ARTIST_BY_ID[id]).filter((x): x is Artist => !!x);
}

function sharedGenres(a: Artist, b: Artist): number {
  return a.genres.filter((g) => b.genres.includes(g)).length;
}

/**
 * A "you might also like" trail: start → n1 → n2 → n3, following
 * relationships and preferring artists that share a genre with the previous step.
 */
export function discoveryChain(start: Artist, exclude: Set<string>, length: number, rng: Rng): Artist[] {
  const chain: Artist[] = [];
  const seen = new Set<string>([start.id, ...exclude]);
  let current = start;
  for (let i = 0; i < length; i++) {
    const options = neighbours(current).filter((n) => !seen.has(n.id));
    if (!options.length) break;
    options.sort((x, y) => sharedGenres(current, y) - sharedGenres(current, x) + (rng() - 0.5) * 1.2);
    const next = options[0];
    chain.push(next);
    seen.add(next.id);
    current = next;
  }
  return chain;
}

/**
 * Picks an artist the user has not entered, scored by how many of their
 * artists point to it and how well it matches their estimated genre mix.
 */
export function discoverArtist(inCity: Set<string>, userArtistIds: string[], dna: GenreWeight[], rng: Rng, avoid: Set<string> = new Set()): Artist | undefined {
  const dnaMap = new Map(dna.map((d) => [d.genre, d.weight]));
  const scored: { a: Artist; s: number }[] = [];
  for (const a of ARTISTS) {
    if (userArtistIds.includes(a.id) || avoid.has(a.id)) continue;
    let s = 0;
    for (const uid of userArtistIds) {
      const u = ARTIST_BY_ID[uid];
      if (u && neighbours(u).some((n) => n.id === a.id)) s += 2;
    }
    a.genres.forEach((g, i) => (s += (dnaMap.get(g) ?? 0) * (i === 0 ? 3 : 1.5)));
    if (!inCity.has(a.id)) s += 0.5; // favour artists you have not bumped into yet
    s += rng() * 0.8;
    if (s > 0.3) scored.push({ a, s });
  }
  scored.sort((x, y) => y.s - x.s);
  return scored[0]?.a;
}
