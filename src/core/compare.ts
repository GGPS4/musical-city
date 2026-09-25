import { GENRES } from '../data/genres.js';
import type { Artist, GenreId, GenreWeight } from '../types.js';
import { computeDna } from './dna.js';
import { neighbours } from './recommend.js';
import type { ResolvedTaste } from './resolve.js';

export type Owner = 'you' | 'them' | 'shared';

export interface Comparison {
  youName: string;
  themName: string;
  /** 0–100, a rough blend of genre overlap and shared/connected artists. */
  score: number;
  youDna: GenreWeight[];
  themDna: GenreWeight[];
  sharedArtists: Artist[];
  sharedGenres: GenreId[];
  /** Artists linked to one of yours and one of theirs: good places to meet. */
  bridges: { artist: Artist; yours: Artist; theirs: Artist }[];
  youArtistIds: string[];
  themArtistIds: string[];
  owners: Partial<Record<GenreId, Owner>>;
}

function vector(dna: GenreWeight[]): Map<string, number> {
  return new Map(dna.map((d) => [d.genre, d.weight]));
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    na += v * v;
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Everyone in both tastes, without duplicates, for building one shared city. */
export function mergeTastes(a: ResolvedTaste, b: ResolvedTaste): ResolvedTaste {
  const artists = [...a.artists];
  for (const x of b.artists) if (!artists.some((y) => y.id === x.id)) artists.push(x);
  const genres = [...new Set([...a.genres, ...b.genres])];
  const unknown = [...new Set([...a.unknown, ...b.unknown])];
  return { artists, genres, unknown };
}

export function compareTastes(you: ResolvedTaste, them: ResolvedTaste, youName = 'You', themName = 'Them'): Comparison {
  const youDna = computeDna(you.artists, you.genres, you.unknown.length);
  const themDna = computeDna(them.artists, them.genres, them.unknown.length);
  const genreSim = cosine(vector(youDna), vector(themDna));

  const themIds = new Set(them.artists.map((a) => a.id));
  const sharedArtists = you.artists.filter((a) => themIds.has(a.id));

  // Connected artists count for a little: liking Joy Division and New Order is close.
  let links = 0;
  for (const a of you.artists) {
    const n = new Set(neighbours(a).map((x) => x.id));
    if (them.artists.some((b) => n.has(b.id))) links++;
  }
  const artistSim = you.artists.length && them.artists.length
    ? Math.min(1, (sharedArtists.length * 1 + links * 0.5) / Math.min(you.artists.length, them.artists.length))
    : 0;
  const score = Math.round(Math.min(1, genreSim * 0.7 + artistSim * 0.3) * 100);

  const yw = vector(youDna);
  const tw = vector(themDna);
  const owners: Partial<Record<GenreId, Owner>> = {};
  const sharedGenres: GenreId[] = [];
  for (const g of new Set([...yw.keys(), ...tw.keys()])) {
    if (g === 'other') continue;
    const id = g as GenreId;
    const a = yw.get(g) ?? 0;
    const b = tw.get(g) ?? 0;
    if (a >= 0.08 && b >= 0.08) {
      owners[id] = 'shared';
      sharedGenres.push(id);
    } else owners[id] = a >= b ? 'you' : 'them';
  }
  sharedGenres.sort((a, b) => (yw.get(b) ?? 0) + (tw.get(b) ?? 0) - (yw.get(a) ?? 0) - (tw.get(a) ?? 0));

  const bridges: Comparison['bridges'] = [];
  const seen = new Set<string>();
  for (const y of you.artists) {
    for (const n of neighbours(y)) {
      if (seen.has(n.id) || themIds.has(n.id) || you.artists.some((a) => a.id === n.id)) continue;
      const t = them.artists.find((b) => neighbours(b).some((x) => x.id === n.id));
      if (t) {
        seen.add(n.id);
        bridges.push({ artist: n, yours: y, theirs: t });
      }
    }
  }

  return {
    youName,
    themName,
    score,
    youDna,
    themDna,
    sharedArtists,
    sharedGenres,
    bridges: bridges.slice(0, 4),
    youArtistIds: you.artists.map((a) => a.id),
    themArtistIds: them.artists.map((a) => a.id),
    owners,
  };
}

export function ownerLabel(c: Comparison, genre: GenreId): string {
  const o = c.owners[genre];
  if (o === 'shared') return 'Shared ground';
  if (o === 'them') return `${c.themName}’s side`;
  return `${c.youName === 'You' ? 'Your' : `${c.youName}’s`} side`;
}

export function genreList(ids: GenreId[]): string {
  return ids.map((g) => GENRES[g].name).join(', ');
}
