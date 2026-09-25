import { HISTORICAL_LANDMARKS } from '../data/landmarks.js';

/**
 * The landmark passport: listening to a historical landmark's soundtrack
 * stamps it. Stamps live in localStorage, so they follow the visitor across
 * cities (but not across devices).
 */

export interface Stamp {
  landmarkId: string;
  /** ISO date the stamp was collected. */
  date: string;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  landmarkIds: string[];
}

export const SCENES: Scene[] = [
  { id: 'beatlemania', name: 'Beatlemania', description: 'From the Cavern to the roof of Apple.', landmarkIds: ['beatles-cavern', 'beatles-abbey-road', 'beatles-rooftop'] },
  { id: 'punk-year-zero', name: 'Punk Year Zero', description: 'The shows and stunts that lit the fuse.', landmarkIds: ['stooges-cincinnati', 'cbgb', 'free-trade-hall', 'pistols-jubilee-boat', 'clash-palladium'] },
  { id: 'art-and-electricity', name: 'Art & Electricity', description: 'Studios, factories and reinventions.', landmarkIds: ['warhol-factory', 'bowie-hammersmith', 'bowie-hansa', 'kling-klang', 'stop-making-sense'] },
  { id: 'festival-season', name: 'Festival Season', description: 'Fields, parks and mud.', landmarkIds: ['newport-1956', 'monterey-pop', 'stones-hyde-park', 'hendrix-woodstock', 'oasis-knebworth', 'greenday-woodstock94'] },
  { id: 'birth-of-hip-hop', name: 'Birth of Hip Hop', description: 'From a Bronx rec room to a college dorm.', landmarkIds: ['sedgwick-avenue', 'def-jam-dorm'] },
  { id: 'jazz-age', name: 'After Hours', description: 'The rooms where jazz was reinvented.', landmarkIds: ['cotton-club', 'mintons', 'birdland', 'kind-of-blue', 'village-vanguard'] },
  { id: 'soul-stirrers', name: 'Soul Stirrers', description: 'Detroit, Memphis, Muscle Shoals and Harlem.', landmarkIds: ['hitsville', 'stax', 'fame-studios', 'apollo'] },
  { id: 'kingston-sound', name: 'Kingston Sound', description: 'Studios, yards and a concert for peace.', landmarkIds: ['studio-one', 'black-ark', 'hope-road', 'one-love-peace'] },
  { id: 'loud-and-heavy', name: 'Loud & Heavy', description: 'Sunset Strip clubs to the desert.', landmarkIds: ['whisky-a-go-go', 'ruskin-arms', 'monsters-of-rock', 'gnr-troubadour', 'qotsa-rancho'] },
  { id: 'north-of-england', name: 'North of England', description: 'Liverpool, Manchester, Salford and Sheffield.', landmarkIds: ['beatles-cavern', 'free-trade-hall', 'hacienda', 'salford-lads-club', 'arctic-grapes'] },
  { id: 'stadium-nights', name: 'Stadium Nights', description: 'The biggest crowds of all.', landmarkIds: ['queen-live-aid', 'depeche-rose-bowl', 'one-love-peace', 'oasis-knebworth'] },
];

const KEY = 'musical-city:passport:v1';

export interface StampStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StampStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class Passport {
  private stamps = new Map<string, Stamp>();

  constructor(private storage: StampStorage | null = defaultStorage()) {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) for (const s of JSON.parse(raw) as Stamp[]) this.stamps.set(s.landmarkId, s);
    } catch {
      /* corrupted or unavailable storage: start fresh */
    }
  }

  has(id: string): boolean {
    return this.stamps.has(id);
  }

  get(id: string): Stamp | undefined {
    return this.stamps.get(id);
  }

  get count(): number {
    return this.stamps.size;
  }

  get total(): number {
    return HISTORICAL_LANDMARKS.length;
  }

  /** Stamps a landmark. Returns scenes that were completed by this stamp. */
  stamp(id: string, now = new Date()): { isNew: boolean; completed: Scene[] } {
    if (this.stamps.has(id) || !HISTORICAL_LANDMARKS.some((l) => l.id === id)) return { isNew: false, completed: [] };
    const before = new Set(SCENES.filter((s) => this.sceneDone(s)).map((s) => s.id));
    this.stamps.set(id, { landmarkId: id, date: now.toISOString().slice(0, 10) });
    try {
      this.storage?.setItem(KEY, JSON.stringify([...this.stamps.values()]));
    } catch {
      /* ignore storage failures */
    }
    return { isNew: true, completed: SCENES.filter((s) => this.sceneDone(s) && !before.has(s.id)) };
  }

  sceneProgress(s: Scene): number {
    return s.landmarkIds.filter((id) => this.stamps.has(id)).length;
  }

  sceneDone(s: Scene): boolean {
    return this.sceneProgress(s) === s.landmarkIds.length;
  }
}
