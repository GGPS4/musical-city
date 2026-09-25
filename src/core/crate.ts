import { ARTISTS, ARTIST_BY_ID } from '../data/artists.js';
import { GENRES } from '../data/genres.js';
import type { Artist, CityPlan, GenreId } from '../types.js';
import { hashString, mulberry32 } from './random.js';

export interface CrateRecord {
  artist: Artist;
  title: string;
  year: number;
  genre: GenreId;
  inCity: boolean;
}

/** Picks the records for a store: its own artists, then more from the same scenes, filed A–Z by genre. */
export function crateFor(plan: CityPlan, venueId: string): CrateRecord[] {
  const v = plan.venues.find((x) => x.id === venueId);
  if (!v) return [];
  const genres = [...new Set([...v.genres, ...v.genres.flatMap((g) => GENRES[g].relatedGenres.slice(0, 1))])];
  const inCity = new Set(plan.artists.map((a) => a.id));
  const own = v.artistIds
    .map((id) => ARTIST_BY_ID[id] ?? plan.artists.find((a) => a.id === id))
    .filter((a): a is Artist => !!a && !a.custom && !!a.album.title);
  const seed = hashString(v.id);
  const pool = ARTISTS.filter((a) => a.album.title && !own.includes(a) && genres.includes(a.genres[0]))
    .map((a) => ({ a, s: (inCity.has(a.id) ? 0 : 0.5) + mulberry32(seed ^ hashString(a.id))() }))
    .sort((x, y) => x.s - y.s)
    .map((x) => x.a);
  const picked = [...own, ...pool].slice(0, 18);
  const order = (g: GenreId) => {
    const i = genres.indexOf(g);
    return i === -1 ? 99 : i;
  };
  const sortName = (a: Artist) => a.name.replace(/^the /i, '');
  return picked
    .map((a) => ({ artist: a, title: a.album.title, year: a.album.year, genre: genres.includes(a.genres[0]) ? a.genres[0] : v.genres[0], inCity: inCity.has(a.id) }))
    .sort((x, y) => order(x.genre) - order(y.genre) || sortName(x.artist).localeCompare(sortName(y.artist)));
}
