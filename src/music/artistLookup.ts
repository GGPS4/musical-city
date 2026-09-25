import { ARTISTS } from '../data/artists.js';
import { GENRES, GENRE_IDS } from '../data/genres.js';
import { normalize } from '../core/resolve.js';
import type { Artist, GenreId } from '../types.js';

/**
 * Looks up artists that aren't in the curated catalogue so they get real
 * genres and connections instead of a placeholder:
 *  - MusicBrainz (open music encyclopedia, CORS-enabled, no key) for genres,
 *    origin, start year and relationships
 *  - Apple's iTunes Search API for a signature album and songs
 * Results are cached in localStorage so shared links rebuild the same city
 * and we stay well inside MusicBrainz's rate limits.
 */

const CACHE_KEY = 'musical-city:lookup:v2';
const MB = 'https://musicbrainz.org/ws/2';

interface MbTag {
  name: string;
  count?: number;
}

interface MbArtist {
  id: string;
  name: string;
  score?: number;
  type?: string;
  country?: string;
  area?: { name?: string };
  'begin-area'?: { name?: string };
  'life-span'?: { begin?: string };
  tags?: MbTag[];
  genres?: MbTag[];
  relations?: { type?: string; artist?: { name?: string } }[];
}

function readCache(): Record<string, Artist | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Artist | null>;
  } catch {
    return {};
  }
}

function writeCache(key: string, value: Artist | null) {
  try {
    const all = readCache();
    all[key] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: fine, we just look it up again next time */
  }
}

const ITUNES_GENRES: Record<string, GenreId> = {
  'hip-hop/rap': 'hip-hop',
  'hip hop/rap': 'hip-hop',
  rap: 'hip-hop',
  'r&b/soul': 'soul',
  soul: 'soul',
  jazz: 'jazz',
  reggae: 'reggae',
  alternative: 'alternative',
  'indie rock': 'indie',
  rock: 'classic-rock',
  'hard rock': 'hard-rock',
  metal: 'metal',
  'heavy metal': 'metal',
  punk: 'punk',
  electronic: 'electronic',
  dance: 'electronic',
  house: 'electronic',
  techno: 'electronic',
  pop: 'pop',
  'k-pop': 'pop',
  'singer/songwriter': 'indie',
  'new wave': 'new-wave',
  psychedelic: 'psychedelic',
};

/** Maps free-form genre tags (MusicBrainz / iTunes) onto the city's genres. */
export function genresFromTags(tags: MbTag[]): GenreId[] {
  const score = new Map<GenreId, number>();
  for (const t of tags) {
    const tag = normalize(t.name);
    // Broad tags like "rock" or "pop" count for less than specific ones.
    const generic = ['rock', 'pop', 'music', 'alternative'].includes(tag) ? 0.4 : 1;
    const weight = Math.max(1, t.count ?? 1) * generic;
    for (const id of GENRE_IDS) {
      const g = GENRES[id];
      const keys = [g.name, ...g.aliases].map(normalize);
      if (keys.includes(tag)) score.set(id, (score.get(id) ?? 0) + weight * 2);
      else if (keys.some((k) => k.length > 3 && (tag.includes(k) || k.includes(tag)) && tag.length > 3)) score.set(id, (score.get(id) ?? 0) + weight * 0.5);
    }
    const it = ITUNES_GENRES[t.name.toLowerCase()];
    if (it) score.set(it, (score.get(it) ?? 0) + weight * 2);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fromMusicBrainz(name: string, signal?: AbortSignal): Promise<MbArtist | null> {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
  const search = await getJson<{ artists?: MbArtist[] }>(`${MB}/artist/?query=${q}&limit=5&fmt=json`, signal);
  const want = normalize(name);
  const hit = (search.artists ?? []).find((a) => (a.score ?? 0) >= 85 && normalize(a.name) === want) ?? (search.artists ?? []).find((a) => (a.score ?? 0) >= 95);
  if (!hit) return null;
  // MusicBrainz asks for at most one request per second.
  await wait(1100);
  try {
    return await getJson<MbArtist>(`${MB}/artist/${hit.id}?inc=genres+tags+artist-rels&fmt=json`, signal);
  } catch {
    return hit;
  }
}

interface ItunesRow {
  artistName?: string;
  primaryGenreName?: string;
  collectionName?: string;
  releaseDate?: string;
  trackCount?: number;
  trackName?: string;
  kind?: string;
  wrapperType?: string;
}

async function fromItunes(name: string, signal?: AbortSignal) {
  const want = normalize(name);
  const params = (entity: string, limit: number) =>
    new URLSearchParams({ term: name, entity, attribute: 'artistTerm', limit: String(limit), country: 'US' });
  const [albums, songs] = await Promise.all([
    getJson<{ results?: ItunesRow[] }>(`https://itunes.apple.com/search?${params('album', 10)}`, signal),
    getJson<{ results?: ItunesRow[] }>(`https://itunes.apple.com/search?${params('song', 15)}`, signal),
  ]);
  const mine = (r: ItunesRow) => normalize(r.artistName ?? '') === want;
  // Prefer a proper album over singles and EPs.
  const own = (albums.results ?? []).filter(mine);
  const album = own.find((a) => (a.trackCount ?? 0) >= 7 && !/ - (single|ep)$/i.test(a.collectionName ?? '')) ?? own.find((a) => !/ - single$/i.test(a.collectionName ?? '')) ?? own[0];
  const songRows = (songs.results ?? []).filter((r) => mine(r) && r.trackName);
  const titles = [...new Set(songRows.map((r) => r.trackName as string))].slice(0, 3);
  const genre = album?.primaryGenreName ?? songRows[0]?.primaryGenreName;
  return {
    found: !!album || songRows.length > 0,
    canonicalName: album?.artistName ?? songRows[0]?.artistName,
    album: album?.collectionName ? { title: album.collectionName, year: Number(album.releaseDate?.slice(0, 4)) || 0 } : null,
    songs: titles,
    genre,
  };
}

function slug(s: string) {
  return normalize(s).replace(/\s+/g, '-');
}

/** Picks catalogue artists to connect to, preferring documented relationships. */
function connect(genres: GenreId[], relNames: string[]): string[] {
  const rel = new Set(relNames.map(normalize));
  const direct = ARTISTS.filter((a) => rel.has(normalize(a.name))).map((a) => a.id);
  const byGenre = ARTISTS.map((a) => ({ a, s: a.genres.reduce((s, g, i) => s + (genres.includes(g) ? (i === 0 ? 2 : 1) : 0), 0) + (genres[0] && a.genres[0] === genres[0] ? 2 : 0) }))
    .filter((x) => x.s > 1)
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, 5)
    .map((x) => x.a.id);
  return [...new Set([...direct, ...byGenre])].slice(0, 6);
}

/** Looks up one artist. Returns null when nothing trustworthy was found. */
export async function lookupArtist(name: string, signal?: AbortSignal): Promise<Artist | null> {
  const key = normalize(name);
  const cache = readCache();
  if (key in cache) return cache[key];

  const [mbRes, itRes] = await Promise.allSettled([fromMusicBrainz(name, signal), fromItunes(name, signal)]);
  if (mbRes.status === 'rejected' && itRes.status === 'rejected') throw new Error('lookup services unreachable');
  const mb = mbRes.status === 'fulfilled' ? mbRes.value : null;
  const it = itRes.status === 'fulfilled' ? itRes.value : null;
  if (!mb && !it?.found) {
    writeCache(key, null);
    return null;
  }

  const tags: MbTag[] = [...(mb?.genres ?? []), ...(mb?.tags ?? [])];
  if (it?.genre) tags.push({ name: it.genre, count: 3 });
  let genres = genresFromTags(tags);
  if (!genres.length) genres = ['alternative'];
  const origin = mb?.['begin-area']?.name ?? mb?.area?.name ?? 'Unknown';
  // For a person, MusicBrainz's "begin" is a birth date, not the start of their career.
  const since = mb?.type === 'Person' ? 0 : Number(mb?.['life-span']?.begin?.slice(0, 4)) || 0;
  const relNames = (mb?.relations ?? []).map((r) => r.artist?.name ?? '').filter(Boolean);
  const displayName = mb?.name ?? it?.canonicalName ?? name;
  const tagText = tags
    .filter((t) => (t.count ?? 1) > 0)
    .slice(0, 3)
    .map((t) => t.name)
    .join(', ');
  const sourceLabel = mb ? 'MusicBrainz' : 'Apple Music';
  const artist: Artist = {
    id: `ext-${slug(displayName)}`,
    name: displayName,
    genres,
    origin,
    since,
    blurb: `Not in the curated catalogue, so this profile comes from ${sourceLabel}${mb?.type ? ` (${mb.type.toLowerCase()}${origin !== 'Unknown' ? ` from ${origin}` : ''}${since ? `, active since ${since}` : ''})` : ''}.${tagText ? ` Tagged: ${tagText}.` : ''}`,
    album: it?.album ?? { title: '', year: 0 },
    songs: (it?.songs ?? []).map((title) => ({ title })),
    relatedArtists: connect(genres, relNames),
    aliases: [name],
    source: sourceLabel,
  };
  writeCache(key, artist);
  return artist;
}

export interface LookupOutcome {
  found: Artist[];
  notFound: string[];
  failed: boolean;
}

/** Looks up several names one after another (MusicBrainz rate limit), with an overall time budget. */
export async function lookupMany(names: string[], onProgress?: (name: string) => void, budgetMs = 12000): Promise<LookupOutcome> {
  const found: Artist[] = [];
  const notFound: string[] = [];
  let failed = false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    for (const n of names.slice(0, 6)) {
      onProgress?.(n);
      try {
        const a = await lookupArtist(n, ctrl.signal);
        if (a) found.push(a);
        else notFound.push(n);
      } catch {
        failed = true;
        notFound.push(n);
      }
    }
    notFound.push(...names.slice(6));
  } finally {
    clearTimeout(timer);
  }
  return { found, notFound, failed };
}
