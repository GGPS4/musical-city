import { ARTISTS } from '../data/artists.js';
import { GENRES, GENRE_IDS } from '../data/genres.js';
import type { Artist, GenreId } from '../types.js';

/** Result of turning free text into catalogue entries. */
export interface ResolvedTaste {
  artists: Artist[];
  genres: GenreId[];
  /** Inputs we could not match. They still get a place in the city. */
  unknown: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’'".!?()]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

export function splitInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const t = raw.trim().replace(/\s+/g, ' ');
    const key = normalize(t);
    if (!t || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

interface Entry {
  key: string;
  kind: 'artist' | 'genre';
  id: string;
  label: string;
}

let index: Entry[] | null = null;

function buildIndex(): Entry[] {
  if (index) return index;
  const entries: Entry[] = [];
  for (const a of ARTISTS) {
    for (const n of [a.name, a.id.replace(/-/g, ' '), ...(a.aliases ?? [])]) {
      entries.push({ key: normalize(n), kind: 'artist', id: a.id, label: a.name });
    }
  }
  for (const id of GENRE_IDS) {
    const g = GENRES[id];
    for (const n of [g.name, id.replace(/-/g, ' '), ...g.aliases]) {
      entries.push({ key: normalize(n), kind: 'genre', id, label: g.name });
    }
  }
  index = entries;
  return entries;
}

export function matchTerm(term: string): Entry | undefined {
  const key = normalize(term);
  if (!key) return undefined;
  const entries = buildIndex();
  const exact = entries.find((e) => e.key === key);
  if (exact) return exact;
  if (key.length < 5) return undefined;
  let best: Entry | undefined;
  let bestD = Infinity;
  for (const e of entries) {
    const d = levenshtein(key, e.key);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  const tolerance = key.length >= 9 ? 2 : 1;
  return bestD <= tolerance ? best : undefined;
}

export function resolveTaste(inputs: string[]): ResolvedTaste {
  const artists: Artist[] = [];
  const genres: GenreId[] = [];
  const unknown: string[] = [];
  for (const term of inputs) {
    const m = matchTerm(term);
    if (!m) {
      unknown.push(term);
    } else if (m.kind === 'artist') {
      const a = ARTISTS.find((x) => x.id === m.id);
      if (a && !artists.includes(a)) artists.push(a);
    } else if (!genres.includes(m.id as GenreId)) {
      genres.push(m.id as GenreId);
    }
  }
  return { artists, genres, unknown };
}

/** Autocomplete suggestions for the landing input. */
export function suggest(prefix: string, limit = 6): { label: string; kind: 'artist' | 'genre' }[] {
  const key = normalize(prefix);
  if (key.length < 1) return [];
  const seen = new Set<string>();
  const out: { label: string; kind: 'artist' | 'genre'; score: number }[] = [];
  for (const e of buildIndex()) {
    if (seen.has(e.label)) continue;
    const i = e.key.indexOf(key);
    if (i === -1) continue;
    seen.add(e.label);
    out.push({ label: e.label, kind: e.kind, score: (i === 0 ? 0 : 10) + e.key.length / 100 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit).map(({ label, kind }) => ({ label, kind }));
}

/** A stand-in artist for names the catalogue does not know. */
export function customArtist(name: string): Artist {
  return {
    id: 'custom-' + normalize(name).replace(/\s+/g, '-'),
    name,
    genres: [],
    origin: 'Unknown',
    since: 0,
    blurb: 'Not in the curated catalogue yet, so this spot is a musical interpretation rather than a documented profile.',
    album: { title: '', year: 0 },
    songs: [],
    relatedArtists: [],
    custom: true,
  };
}

/** The artist behind a soundtrack song: a catalogue artist, or a stand-in for outside records. */
export function soundtrackArtist(song: { artistId?: string; artistName?: string }): Artist {
  if (song.artistId) {
    const a = ARTISTS.find((x) => x.id === song.artistId);
    if (a) return a;
  }
  const stub = customArtist(song.artistName ?? 'Unknown artist');
  stub.blurb = '';
  return stub;
}
