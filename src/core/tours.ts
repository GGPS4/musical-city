import { ARTIST_BY_ID } from '../data/artists.js';
import { LABEL_BY_ID, labelsFor } from '../data/labels.js';
import type { Artist, CityPlan, Vec2 } from '../types.js';
import { SCENES } from './passport.js';

/* ------------------------------------------------------------------ */
/* Plaques                                                             */
/* ------------------------------------------------------------------ */

/**
 * Short, checkable facts for a venue's plaque, taken only from the curated
 * catalogue (origins, start years, signature albums, labels, landmarks).
 */
export function plaqueFacts(plan: CityPlan, venueId: string): string[] {
  const v = plan.venues.find((x) => x.id === venueId);
  if (!v) return [];
  const facts: string[] = [];
  for (const id of v.artistIds) {
    const a: Artist | undefined = ARTIST_BY_ID[id];
    if (!a) continue;
    if (a.since && a.origin && a.origin !== 'Unknown') facts.push(`${a.name}: from ${a.origin}, making records since ${a.since}.`);
    if (a.album.title && a.album.year) facts.push(`${a.album.title} (${a.album.year}) is ${a.name}’s essential album.`);
    const labels = labelsFor(a.id).map((l) => l.name);
    if (labels.length) facts.push(`${a.name} released records on ${listJoin(labels.slice(0, 3))}.`);
    const lm = plan.landmarks.find((l) => l.type === 'historical' && l.artistIds.includes(a.id));
    if (lm) facts.push(`${a.name} and music history: ${lm.name}, ${lm.place}, ${lm.date}.`);
  }
  return facts.slice(0, 6);
}

function listJoin(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* Guided tours                                                        */
/* ------------------------------------------------------------------ */

export interface TourStop {
  kind: 'landmark' | 'label' | 'home';
  id: string;
  title: string;
  sub: string;
  caption: string;
  position: Vec2;
  /** A song to play at this stop. */
  song?: { artistId?: string; artistName?: string; title: string };
  /** Or: any song by this artist. */
  artistId?: string;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  stops: TourStop[];
}

const yearOf = (date?: string) => Number(date?.match(/\d{4}/)?.[0] ?? 9999);

/** Tours that make sense for this city: themed scenes, a chronological grand tour, label row and your artists' homes. */
export function toursFor(plan: CityPlan): Tour[] {
  const tours: Tour[] = [];
  const landmarkStop = (id: string): TourStop | null => {
    const l = plan.landmarks.find((x) => x.id === id);
    if (!l || l.type !== 'historical') return null;
    const song = l.soundtrack?.songs[0];
    return {
      kind: 'landmark',
      id: l.id,
      title: l.name,
      sub: `${l.place ?? ''} · ${l.date ?? ''}`,
      caption: l.description,
      position: l.position,
      song: song ? { artistId: song.artistId, artistName: song.artistName, title: song.title } : undefined,
      artistId: song ? undefined : l.artistIds[0],
    };
  };

  const historical = plan.landmarks.filter((l) => l.type === 'historical').sort((a, b) => yearOf(a.date) - yearOf(b.date));
  if (historical.length >= 3) {
    tours.push({
      id: 'grand',
      name: 'The grand tour',
      description: `Every historical landmark in your city, oldest first (${historical.length} stops).`,
      stops: historical.map((l) => landmarkStop(l.id)).filter((s): s is TourStop => !!s),
    });
  }
  for (const sc of SCENES) {
    const stops = sc.landmarkIds
      .map(landmarkStop)
      .filter((s): s is TourStop => !!s)
      .sort((a, b) => yearOf(a.sub) - yearOf(b.sub));
    if (stops.length >= 2) tours.push({ id: `scene-${sc.id}`, name: sc.name, description: sc.description, stops });
  }
  const labels = [...plan.labels].sort((a, b) => (LABEL_BY_ID[a.labelId]?.founded ?? 0) - (LABEL_BY_ID[b.labelId]?.founded ?? 0));
  if (labels.length >= 3) {
    tours.push({
      id: 'labels',
      name: 'Label row',
      description: 'The record labels behind your city, from oldest to newest.',
      stops: labels.map((t) => {
        const l = LABEL_BY_ID[t.labelId];
        return { kind: 'label' as const, id: t.id, title: t.name, sub: `Founded ${l?.founded ?? ''} · ${l?.city ?? ''}`, caption: l?.blurb ?? '', position: t.position, artistId: t.artistIds[0] };
      }),
    });
  }
  const homes = plan.homes.filter((h) => plan.userArtistIds.includes(h.artistId));
  if (homes.length >= 2) {
    tours.push({
      id: 'homes',
      name: 'Your artists at home',
      description: 'Drop by the (imagined) homes of the artists you picked.',
      stops: homes.map((h) => {
        const a = ARTIST_BY_ID[h.artistId] ?? plan.artists.find((x) => x.id === h.artistId);
        return { kind: 'home' as const, id: h.id, title: a ? `${a.name}’s place` : 'Home', sub: a ? `${a.origin}${a.since ? ` · since ${a.since}` : ''}` : '', caption: a?.blurb ?? '', position: h.position, artistId: h.artistId };
      }),
    });
  }
  return tours;
}
