import { ARTISTS, ARTIST_BY_ID } from '../data/artists.js';
import { GENRES } from '../data/genres.js';
import { HISTORICAL_LANDMARKS } from '../data/landmarks.js';
import { RECORD_LABELS } from '../data/labels.js';
import type {
  Archetype,
  Artist,
  Block,
  BridgePlan,
  BuildingPlan,
  BuskerPlan,
  Instrument,
  LabelTowerPlan,
  CityPlan,
  Connection,
  District,
  GenreId,
  GenreWeight,
  HistoricalLandmark,
  LandmarkPlan,
  MixedQuarter,
  RoadSegment,
  TreePlan,
  Vec2,
  VenuePlan,
  VenueType,
} from '../types.js';
import { computeDna } from './dna.js';
import { hashString, mulberry32, pick, range, shuffle, weighted, type Rng } from './random.js';
import { neighbours } from './recommend.js';
import { customArtist, normalize } from './resolve.js';

export const PITCH = 18;
export const ROAD = 4;
export const FLOOR = 1.15;
const BLOCK = PITCH - ROAD;

const STAGE_NAMES = [
  'Lefty Mae', 'Two-Chord Tom', 'Rosa on the Corner', 'The Subway Kid', 'Nine-Lives Nico', 'Dusty June', 'Busker Bill',
  'Midnight Marlo', 'Little Echo', 'Penny Whistle Pete', 'Quiet Quincy', 'Ray of the Arcade', 'Ol’ Blue Hat', 'Mavis Loop',
  'The One-Man Band', 'Kid Reverb', 'Sister Sixstring', 'Lamp-post Lou', 'Doorway Dee', 'Captain Capo', 'Hum & Strum',
  'The Night Shift Duo', 'Frankie Fuzz', 'Coin-jar Cleo', 'Slow Hand Sam', 'Moonlight Mo', 'Crosswalk Kay', 'Sidewalk Sol',
];

const INSTRUMENTS: Record<GenreId, Instrument[]> = {
  punk: ['guitar', 'bass'],
  'post-punk': ['bass', 'guitar'],
  'classic-rock': ['guitar'],
  psychedelic: ['guitar', 'keys'],
  alternative: ['guitar', 'bass'],
  glam: ['guitar', 'mic'],
  garage: ['guitar', 'drums'],
  electronic: ['keys', 'turntables'],
  'new-wave': ['keys', 'guitar'],
  'art-rock': ['violin', 'keys'],
  'hard-rock': ['guitar'],
  indie: ['guitar', 'keys'],
  metal: ['guitar', 'drums'],
  'hip-hop': ['turntables', 'mic'],
  jazz: ['sax', 'trumpet'],
  soul: ['mic', 'keys'],
  reggae: ['drums', 'guitar'],
  pop: ['mic', 'keys'],
};

export interface TasteInput {
  artists: Artist[];
  genres: GenreId[];
  unknown: string[];
}

const VENUE_LABEL: Record<VenueType, string> = {
  bar: 'bar',
  club: 'club',
  theater: 'theatre',
  'record-store': 'record store',
  'concert-hall': 'concert hall',
  warehouse: 'warehouse venue',
  rooftop: 'rooftop stage',
};

export function venueTypeLabel(t: VenueType): string {
  return VENUE_LABEL[t];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

function distToSegment(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)), t };
}

export function distToPolyline(p: Vec2, pts: Vec2[]): { d: number; point: Vec2; angle: number } {
  let best = { d: Infinity, point: pts[0], angle: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const { d, t } = distToSegment(p, pts[i], pts[i + 1]);
    if (d < best.d) {
      const a = pts[i];
      const b = pts[i + 1];
      best = { d, point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, angle: Math.atan2(b.z - a.z, b.x - a.x) };
    }
  }
  return best;
}

/** Stable seed from the set of inputs, independent of order and casing. */
export function seedFor(inputs: string[]): number {
  return hashString(inputs.map(normalize).sort().join('|') || 'musical-city');
}

export function generateCity(taste: TasteInput, seed = seedFor([...taste.artists.map((a) => a.name), ...taste.genres, ...taste.unknown])): CityPlan {
  // Canonical order so the same taste always yields the same city.
  const input: TasteInput = {
    artists: [...taste.artists].sort((a, b) => a.id.localeCompare(b.id)),
    genres: [...taste.genres].sort(),
    unknown: [...taste.unknown].sort((a, b) => normalize(a).localeCompare(normalize(b))),
  };
  const rng = mulberry32(seed);
  const customs = input.unknown.slice(0, 4).map(customArtist);
  const dna = computeDna(input.artists, input.genres, input.unknown.length);

  /* ---------------- districts ---------------- */
  let districtWeights = dna.filter((d): d is GenreWeight & { genre: GenreId } => d.genre !== 'other').slice(0, 8);
  if (!districtWeights.length) {
    districtWeights = [
      { genre: 'classic-rock', weight: 0.5, percent: 50 },
      { genre: 'alternative', weight: 0.5, percent: 50 },
    ];
  }
  const wSum = districtWeights.reduce((s, d) => s + d.weight, 0);
  const norm = districtWeights.map((d) => ({ genre: d.genre, w: d.weight / wSum }));

  const inputCount = input.artists.length + input.genres.length + input.unknown.length;
  const grid = Math.max(19, Math.min(27, 15 + norm.length + Math.round(inputCount / 2)));
  const half = (grid * PITCH) / 2;

  const districts: District[] = [];
  const angle0 = rng() * Math.PI * 2;
  norm.forEach((d, i) => {
    let center: Vec2;
    if (i === 0) {
      center = { x: range(rng, -1, 1) * PITCH * 0.6, z: range(rng, -1, 1) * PITCH * 0.6 };
    } else {
      const n = norm.length - 1;
      const ang = angle0 + ((i - 1) / n) * Math.PI * 2 + range(rng, -0.25, 0.25);
      const r = half * (0.62 - d.w * 0.35 + range(rng, -0.05, 0.05));
      center = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
    }
    const g = GENRES[d.genre];
    districts.push({
      genre: d.genre,
      name: `${g.name} District`,
      nickname: g.nickname,
      center,
      radius: half * (0.26 + 0.5 * Math.sqrt(d.w)),
      weight: d.w,
    });
  });
  const primary = districts[0];

  const influenceAt = (p: Vec2): Partial<Record<GenreId, number>> => {
    const raw: Partial<Record<GenreId, number>> = {};
    let total = 0;
    for (const d of districts) {
      const dd = dist(p, d.center);
      const v = (0.35 + d.weight) * Math.exp(-(dd * dd) / (2 * d.radius * d.radius)) + 1e-4;
      raw[d.genre] = v;
      total += v;
    }
    for (const k in raw) raw[k as GenreId] = (raw[k as GenreId] ?? 0) / total;
    return raw;
  };

  /* ---------------- river ---------------- */
  const vertical = rng() < 0.5;
  const riverWidth = 15;
  const offset = range(rng, -0.3, 0.3) * half;
  const amp = range(rng, 14, 26);
  const freq = range(rng, 0.011, 0.018);
  const ph1 = rng() * 6.28;
  const ph2 = rng() * 6.28;
  const riverPts: Vec2[] = [];
  for (let t = -half - 30; t <= half + 30; t += 5) {
    const across = offset + amp * Math.sin(t * freq + ph1) + amp * 0.35 * Math.sin(t * freq * 2.3 + ph2);
    riverPts.push(vertical ? { x: across, z: t } : { x: t, z: across });
  }
  const riverDist = (p: Vec2) => distToPolyline(p, riverPts).d;

  /* ---------------- blocks ---------------- */
  const blocks: Block[] = [];
  const blockAt = new Map<string, Block>();
  let bid = 0;
  for (let gx = 0; gx < grid; gx++) {
    for (let gz = 0; gz < grid; gz++) {
      const center = { x: (gx - (grid - 1) / 2) * PITCH, z: (gz - (grid - 1) / 2) * PITCH };
      // Soft, slightly irregular outline instead of a perfect square.
      const sq = Math.pow(Math.pow(Math.abs(center.x) / half, 4) + Math.pow(Math.abs(center.z) / half, 4), 0.25);
      if (sq > 0.93 + rng() * 0.07) continue;
      const influence = influenceAt(center);
      const dominant = (Object.entries(influence) as [GenreId, number][]).sort((a, b) => b[1] - a[1])[0][0];
      const rd = riverDist(center);
      let use: Block['use'] = 'buildings';
      if (rd < riverWidth / 2 + BLOCK * 0.42) use = 'water';
      else {
        let park = 0;
        for (const k in influence) park += (influence[k as GenreId] ?? 0) * GENRES[k as GenreId].style.parkChance;
        if (rd < riverWidth / 2 + BLOCK * 1.1) park += 0.12;
        if (rng() < park) use = 'park';
      }
      const block: Block = { id: bid++, gx, gz, center, size: BLOCK, influence, dominant, use };
      blocks.push(block);
      blockAt.set(`${gx},${gz}`, block);
    }
  }
  const usable = () => blocks.filter((b) => b.use === 'buildings');

  /* ---------------- mixed quarters ---------------- */
  const pairs = new Map<string, Block[]>();
  for (const b of blocks) {
    if (b.use === 'water') continue;
    const top = (Object.entries(b.influence) as [GenreId, number][]).sort((x, y) => y[1] - x[1]);
    if (top.length > 1 && top[1][1] >= 0.28) {
      const key = [top[0][0], top[1][0]].sort().join('|');
      pairs.set(key, [...(pairs.get(key) ?? []), b]);
    }
  }
  const mixed: MixedQuarter[] = [...pairs.entries()]
    .filter(([, bs]) => bs.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([key, bs]) => {
      const [a, b] = key.split('|') as [GenreId, GenreId];
      const center = {
        x: bs.reduce((s, x) => s + x.center.x, 0) / bs.length,
        z: bs.reduce((s, x) => s + x.center.z, 0) / bs.length,
      };
      return { genres: [a, b], name: `${GENRES[a].name} × ${GENRES[b].name} Quarter`, center };
    });

  /* ---------------- landmarks ---------------- */
  const landmarks: LandmarkPlan[] = [];
  const districtFor = (genres: GenreId[]): District =>
    genres.map((g) => districts.find((d) => d.genre === g)).find((d): d is District => !!d) ?? primary;

  const claimBlock = (near: Vec2, filter: (b: Block) => boolean = () => true): Block | undefined => {
    const options = usable()
      .filter(filter)
      .map((b) => ({ b, s: dist(b.center, near) + rng() * 6 }))
      .sort((x, y) => x.s - y.s);
    const b = options[0]?.b;
    if (b) b.use = 'plaza';
    return b;
  };

  // Genre monuments ("musical interpretation") at district hearts.
  for (const d of districts) {
    const g = GENRES[d.genre];
    const b = claimBlock(d.center);
    if (!b) continue;
    landmarks.push({
      id: `monument-${d.genre}`,
      name: g.monument.name,
      type: 'inspired',
      artistIds: [],
      genres: [d.genre],
      description: g.monument.description,
      position: b.center,
      rotation: 0,
      model: g.monument.kind,
      footprint: BLOCK,
    });
  }

  // Historical landmarks for the user's artists, plus one per entered genre.
  const chosen: HistoricalLandmark[] = [];
  for (const a of input.artists) {
    for (const l of HISTORICAL_LANDMARKS) if (l.artistIds.includes(a.id) && !chosen.includes(l)) chosen.push(l);
  }
  for (const g of input.genres) {
    const l = HISTORICAL_LANDMARKS.find(
      (x) => !chosen.includes(x) && x.artistIds.some((id) => ARTIST_BY_ID[id]?.genres[0] === g),
    );
    if (l) chosen.push(l);
  }
  const userIds = new Set(input.artists.map((a) => a.id));
  for (const l of chosen.slice(0, 18)) {
    const leadId = l.artistIds.find((id) => userIds.has(id)) ?? l.artistIds[0];
    const lead = ARTIST_BY_ID[leadId];
    const d = districtFor(lead?.genres ?? []);
    let position: Vec2 | undefined;
    let rotation = 0;
    if (l.model === 'boat') {
      const inside = riverPts.filter((p) => Math.abs(p.x) < half - 18 && Math.abs(p.z) < half - 18);
      const target = inside.sort((a, b) => dist(a, d.center) - dist(b, d.center))[0];
      if (target) {
        const r = distToPolyline(target, riverPts);
        position = r.point;
        rotation = -r.angle;
      }
    } else {
      const b = claimBlock(d.center, l.onWater ? (x) => riverDist(x.center) < riverWidth / 2 + BLOCK * 1.25 : undefined) ?? claimBlock(d.center);
      if (b) {
        position = b.center;
        rotation = Math.round(rng() * 3) * (Math.PI / 2);
        if (l.onWater) {
          // Face the river.
          const r = distToPolyline(b.center, riverPts);
          rotation = -Math.atan2(r.point.z - b.center.z, r.point.x - b.center.x) + Math.PI / 2;
        }
      }
    }
    if (!position) continue;
    landmarks.push({
      id: l.id,
      name: l.name,
      type: 'historical',
      artistIds: l.artistIds,
      genres: lead ? lead.genres.slice(0, 2) : [d.genre],
      description: l.description,
      place: l.place,
      date: l.date,
      position,
      rotation,
      model: l.model,
      footprint: BLOCK,
      soundtrack: l.soundtrack,
    });
  }

  /* ---------------- buildings ---------------- */
  const buildings: BuildingPlan[] = [];
  const skylineSigma = half * 0.32;
  for (const b of usable()) {
    let dens = 0;
    for (const k in b.influence) dens += (b.influence[k as GenreId] ?? 0) * GENRES[k as GenreId].style.density;
    const n = dens < 1.5 ? (rng() < 0.3 ? 1 : 2) : dens < 2.35 ? (rng() < 0.7 ? 2 : 3) : 3;
    const nx = n;
    const nz = n === 1 ? 1 : n === 3 ? (rng() < 0.5 ? 2 : 3) : rng() < 0.3 ? 1 : 2;
    const inner = BLOCK - 1.2;
    const lw = inner / nx;
    const ld = inner / nz;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const pos = {
          x: b.center.x - inner / 2 + lw * (ix + 0.5),
          z: b.center.z - inner / 2 + ld * (iz + 0.5),
        };
        const infl = influenceAt(pos);
        const g = weighted(rng, infl) ?? b.dominant;
        const archWeights: Partial<Record<Archetype, number>> = {};
        for (const k in infl) {
          const gi = GENRES[k as GenreId];
          const f = infl[k as GenreId] ?? 0;
          for (const a in gi.style.archetypes) {
            const key = a as Archetype;
            archWeights[key] = (archWeights[key] ?? 0) + f * f * (gi.style.archetypes[key] ?? 0);
          }
        }
        let archetype = weighted(rng, archWeights) ?? 'apartment';
        if (n === 3 && (archetype === 'curvy' || archetype === 'dome')) archetype = 'townhouse';
        const style = GENRES[g].style;
        let floors = Math.round(range(rng, style.floors[0], style.floors[1]) * 1.4);
        if (archetype === 'tower' || archetype === 'neon-tower') floors = Math.max(12, Math.round(floors * 1.6));
        if (archetype === 'warehouse') floors = Math.min(floors, 2 + Math.floor(rng() * 2));
        if (archetype === 'townhouse') floors = Math.min(Math.max(floors, 2), 5);
        if (archetype === 'dome') floors = Math.min(floors, 6);
        const dp = dist(pos, primary.center);
        const skyline = 1 + 1.1 * Math.exp(-(dp * dp) / (2 * skylineSigma * skylineSigma));
        const tall = archetype === 'tower' || archetype === 'neon-tower' || archetype === 'brutalist' || archetype === 'classic';
        const height = floors * FLOOR * (tall ? skyline : 1) + (archetype === 'warehouse' ? 0.6 : 0);
        const fill = n === 3 ? range(rng, 0.84, 0.96) : range(rng, 0.7, 0.9);
        const second = (Object.entries(infl) as [GenreId, number][]).sort((x, y) => y[1] - x[1])[1];
        buildings.push({
          id: buildings.length,
          blockId: b.id,
          archetype,
          position: pos,
          width: lw * fill,
          depth: ld * (n === 3 ? range(rng, 0.84, 0.96) : range(rng, 0.7, 0.9)),
          height,
          rotation: archetype === 'curvy' ? rng() * Math.PI : 0,
          color: pick(rng, style.palette),
          accent: pick(rng, style.neon),
          dominant: g,
          secondary: second && second[1] > 0.2 ? second[0] : undefined,
          graffiti: rng() < style.graffiti,
          order: dist(pos, { x: 0, z: 0 }) / half + rng() * 0.12,
        });
      }
    }
  }

  /* ---------------- venues ---------------- */
  const venues: VenuePlan[] = [];
  const usedNames = new Set<string>();
  const artistUse = new Map<string, number>();
  const venueBlocks = new Set<number>();
  const taken = new Set<number>();

  const allUser = input.artists;
  const neighbourIds = new Set(allUser.flatMap((a) => neighbours(a).map((n) => n.id)));

  const artistsFor = (genres: GenreId[], count: number): string[] => {
    const scored = ARTISTS.map((a) => {
      const overlap = a.genres.filter((g) => genres.includes(g)).length;
      if (!overlap) return { id: a.id, s: -1 };
      let s = overlap + (genres.includes(a.genres[0]) ? 1 : 0);
      if (userIds.has(a.id)) s += a.genres.includes(genres[0]) ? 8 : 2;
      else if (neighbourIds.has(a.id)) s += 3;
      s -= (artistUse.get(a.id) ?? 0) * 4.5;
      s += rng();
      return { id: a.id, s };
    })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, count)
      .map((x) => x.id);
    scored.forEach((id) => artistUse.set(id, (artistUse.get(id) ?? 0) + 1));
    return scored;
  };

  const nameFor = (genres: GenreId[], type: VenueType): string => {
    for (const g of genres) {
      const options = shuffle(rng, GENRES[g].venueNames).filter((n) => !usedNames.has(n));
      if (options.length) {
        usedNames.add(options[0]);
        return options[0];
      }
    }
    const fallback = `${GENRES[genres[0]].name} ${VENUE_LABEL[type].replace(/^\w/, (c) => c.toUpperCase())} No. ${venues.length + 1}`;
    usedNames.add(fallback);
    return fallback;
  };

  const describe = (genres: GenreId[], type: VenueType): string => {
    const scene = genres.map((g) => GENRES[g].scene);
    const noun = VENUE_LABEL[type];
    if (type === 'record-store') return `A fictional record store whose crates lean towards ${scene[0]}${scene[1] ? `, with a back room for ${scene[1]}` : ''}.`;
    if (scene.length > 1) return `A fictional ${noun} where ${scene[0]} meets ${scene[1]}.`;
    return `A fictional ${noun} inspired by ${scene[0]}.`;
  };

  const claimBuilding = (near: Vec2, filter: (b: BuildingPlan) => boolean): BuildingPlan | undefined => {
    const options = buildings
      .filter((b) => !taken.has(b.id) && !venueBlocks.has(b.blockId) && filter(b))
      .map((b) => ({ b, s: dist(b.position, near) + rng() * 14 }))
      .sort((x, y) => x.s - y.s);
    const b = options[0]?.b;
    if (b) {
      taken.add(b.id);
      venueBlocks.add(b.blockId);
    }
    return b;
  };

  const addVenue = (b: BuildingPlan, genres: GenreId[], type: VenueType, artistIds: string[], description?: string) => {
    const g = GENRES[genres[0]];
    venues.push({
      id: `venue-${venues.length}`,
      name: nameFor(genres, type),
      type,
      genres,
      artistIds,
      description: description ?? describe(genres, type),
      position: b.position,
      footprint: Math.max(4.2, Math.min(b.width, b.depth)),
      rotation: Math.floor(rng() * 4) * (Math.PI / 2),
      neon: pick(rng, g.style.neon),
    });
  };

  for (const d of districts) {
    const g = GENRES[d.genre];
    const count = Math.max(4, Math.min(11, Math.round(3.5 + d.weight * 16)));
    const types = shuffle(rng, g.style.venueTypes.filter((t) => t !== 'record-store'));
    const order: VenueType[] = [types[0], 'record-store'];
    for (let i = 1; order.length < count; i++) order.push(types[i % types.length]);
    if (count >= 7) order.push('record-store');
    for (const type of order) {
      const b = claimBuilding(d.center, (x) => {
        const block = blocks.find((k) => k.id === x.blockId);
        return block?.dominant === d.genre;
      }) ?? claimBuilding(d.center, () => true);
      if (!b) break;
      addVenue(b, [d.genre], type, artistsFor([d.genre, ...g.relatedGenres.slice(0, 1)], type === 'record-store' ? 4 : 3));
    }
  }

  for (const m of mixed) {
    const b = claimBuilding(m.center, () => true);
    if (b) addVenue(b, m.genres, pick(rng, ['club', 'bar', 'record-store'] as VenueType[]), artistsFor(m.genres, 4));
  }

  for (const c of customs) {
    const b = claimBuilding(primary.center, () => true);
    if (b) {
      addVenue(b, [primary.genre], pick(rng, ['bar', 'club'] as VenueType[]), [c.id],
        `Your pick. ${c.name} isn’t in the curated catalogue yet, so this venue is a musical interpretation rather than a documented place.`);
    }
  }

  // Every artist the user entered gets at least one stage in town.
  for (const a of allUser) {
    if (venues.some((v) => v.artistIds.includes(a.id))) continue;
    const target =
      venues
        .filter((v) => v.type !== 'record-store')
        .map((v) => ({ v, s: v.genres.filter((g) => a.genres.includes(g)).length }))
        .sort((x, y) => y.s - x.s)[0]?.v ?? venues[0];
    if (target) target.artistIds = [a.id, ...target.artistIds].slice(0, 5);
  }

  /* ---------------- trees, lamps, roads, bridges ---------------- */
  const trees: TreePlan[] = [];
  for (const b of blocks) {
    if (b.use === 'park') {
      const n = 10 + Math.floor(rng() * 10);
      for (let i = 0; i < n; i++) {
        trees.push({
          position: { x: b.center.x + range(rng, -1, 1) * (BLOCK / 2 - 1.2), z: b.center.z + range(rng, -1, 1) * (BLOCK / 2 - 1.2) },
          scale: range(rng, 0.7, 1.3),
          genre: b.dominant,
        });
      }
    } else if (b.use === 'plaza') {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        trees.push({ position: { x: b.center.x + sx * (BLOCK / 2 - 0.9), z: b.center.z + sz * (BLOCK / 2 - 0.9) }, scale: 0.8, genre: b.dominant });
      }
    }
  }

  const hasLand = (gx: number, gz: number) => {
    const b = blockAt.get(`${gx},${gz}`);
    return !!b && b.use !== 'water';
  };

  const roads: RoadSegment[] = [];
  const lamps: Vec2[] = [];
  const edge = (k: number) => -half + k * PITCH;
  for (let k = 0; k <= grid; k++) {
    for (let j = 0; j < grid; j++) {
      // Vertical road line x = edge(k), segment alongside row j.
      if (hasLand(k - 1, j) || hasLand(k, j)) {
        const a = { x: edge(k), z: edge(j) };
        const b = { x: edge(k), z: edge(j + 1) };
        roads.push({ a, b });
        const side = (k + j) % 2 ? 1 : -1;
        const lx = edge(k) + side * (ROAD / 2 + 0.3);
        if (hasLand(side > 0 ? k : k - 1, j)) lamps.push({ x: lx, z: (a.z + b.z) / 2 });
      }
      // Horizontal road line z = edge(k).
      if (hasLand(j, k - 1) || hasLand(j, k)) {
        const a = { x: edge(j), z: edge(k) };
        const b = { x: edge(j + 1), z: edge(k) };
        roads.push({ a, b });
        const side = (k + j) % 2 ? -1 : 1;
        const lz = edge(k) + side * (ROAD / 2 + 0.3);
        if (hasLand(j, side > 0 ? k : k - 1)) lamps.push({ x: (a.x + b.x) / 2, z: lz });
      }
    }
  }

  const bridges: BridgePlan[] = [];
  for (let k = 1; k < grid; k++) {
    for (const orient of ['x', 'z'] as const) {
      const c = edge(k);
      let placed = false;
      for (let i = 0; i < riverPts.length - 1 && !placed; i++) {
        const a = riverPts[i];
        const b = riverPts[i + 1];
        const av = orient === 'x' ? a.x : a.z;
        const bv = orient === 'x' ? b.x : b.z;
        if ((av - c) * (bv - c) > 0 || av === bv) continue;
        const t = (c - av) / (bv - av);
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const along = orient === 'x' ? p.z : p.x;
        if (Math.abs(along) > half - PITCH * 0.8) continue;
        // Need land on the road on both sides of the river.
        const probe = riverWidth / 2 + BLOCK * 0.6;
        const s1 = orient === 'x' ? { x: p.x, z: p.z - probe } : { x: p.x - probe, z: p.z };
        const s2 = orient === 'x' ? { x: p.x, z: p.z + probe } : { x: p.x + probe, z: p.z };
        const land = (q: Vec2) => blocks.some((bb) => bb.use !== 'water' && Math.abs(bb.center.x - q.x) < PITCH && Math.abs(bb.center.z - q.z) < PITCH);
        if (!land(s1) || !land(s2)) continue;
        const riverAngle = Math.atan2(b.z - a.z, b.x - a.x);
        const roadAngle = orient === 'x' ? Math.PI / 2 : 0;
        const sin = Math.abs(Math.sin(riverAngle - roadAngle));
        if (sin < 0.55) continue;
        placed = true;
        bridges.push({
          position: p,
          length: Math.min(44, riverWidth / sin + 6),
          rotation: orient === 'x' ? Math.PI / 2 : 0,
        });
      }
    }
  }

  /* ---------------- connections ---------------- */
  const home = new Map<string, Vec2>();
  for (const v of venues) for (const id of v.artistIds) if (!home.has(id)) home.set(id, v.position);
  for (const l of landmarks) for (const id of l.artistIds) if (!home.has(id)) home.set(id, l.position);

  const connections: Connection[] = [];
  const seenPairs = new Set<string>();
  for (const [id, pos] of home) {
    const a = ARTIST_BY_ID[id];
    if (!a) continue;
    for (const n of neighbours(a)) {
      const other = home.get(n.id);
      const key = [id, n.id].sort().join('|');
      if (!other || seenPairs.has(key) || dist(pos, other) < 1) continue;
      seenPairs.add(key);
      connections.push({ from: id, to: n.id, a: pos, b: other });
    }
  }
  connections.sort((x, y) => Number(userIds.has(y.from) || userIds.has(y.to)) - Number(userIds.has(x.from) || userIds.has(x.to)));

  const cityArtistIds = new Set<string>([...home.keys(), ...userIds]);

  const artists = [
    ...ARTISTS.filter((a) => cityArtistIds.has(a.id)),
    // Artists looked up from outside the catalogue (e.g. MusicBrainz).
    ...input.artists.filter((a) => !ARTIST_BY_ID[a.id]),
    ...customs,
  ];

  /* ---------------- record label towers ---------------- */
  const labels: LabelTowerPlan[] = [];
  const towerBlocks = new Set<number>();
  const labelCandidates = RECORD_LABELS.map((l) => {
    const here = l.artistIds.filter((id) => cityArtistIds.has(id));
    return { l, here, score: here.reduce((s, id) => s + (userIds.has(id) ? 3 : 1), 0) };
  })
    .filter((x) => x.here.length)
    .sort((a, b) => b.score - a.score || b.here.length - a.here.length || a.l.founded - b.l.founded);
  const maxLabels = Math.max(3, Math.min(10, Math.round(districts.length * 1.3) + 1));
  for (const { l, here } of labelCandidates.slice(0, maxLabels)) {
    const spots = here.map((id) => home.get(id)).filter((p): p is Vec2 => !!p);
    const genreCount = new Map<GenreId, number>();
    for (const id of here) {
      const g = ARTIST_BY_ID[id]?.genres[0];
      if (g) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    }
    const genre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? primary.genre;
    const anchor = spots.length
      ? { x: spots.reduce((s, p) => s + p.x, 0) / spots.length, z: spots.reduce((s, p) => s + p.z, 0) / spots.length }
      : districtFor([genre]).center;
    const block = blocks
      .filter((b) => b.use === 'buildings' && !venueBlocks.has(b.id) && !towerBlocks.has(b.id))
      .filter((b) => labels.every((t) => dist(t.position, b.center) > PITCH * 2.2))
      .map((b) => ({ b, s: dist(b.center, anchor) + rng() * 10 }))
      .sort((x, y) => x.s - y.s)[0]?.b;
    if (!block) continue;
    towerBlocks.add(block.id);
    block.use = 'plaza';
    labels.push({
      id: `label-${l.id}`,
      labelId: l.id,
      name: l.name,
      position: block.center,
      height: 40 + Math.min(5, here.length) * 6 + rng() * 8,
      color: l.color,
      artistIds: here,
      genre,
    });
  }
  const remaining = buildings.filter((b) => !taken.has(b.id) && !towerBlocks.has(b.blockId)).map((b, i) => ({ ...b, id: i }));

  /* ---------------- street buskers ---------------- */
  const buskers: BuskerPlan[] = [];
  const blocked = (p: Vec2) =>
    remaining.some((b) => Math.abs(p.x - b.position.x) < b.width / 2 + 0.7 && Math.abs(p.z - b.position.z) < b.depth / 2 + 0.7) ||
    venues.some((v) => dist(v.position, p) < v.footprint * 0.75 + 1) ||
    riverDist(p) < riverWidth / 2 + 2;
  const corners: { p: Vec2; rot: number; block: Block }[] = [];
  const inset = BLOCK / 2 - 0.7;
  for (const b of blocks) {
    if (b.use !== 'buildings' && b.use !== 'park') continue;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = { x: b.center.x + sx * inset, z: b.center.z + sz * inset };
      if (!blocked(p)) corners.push({ p, rot: Math.atan2(sx, sz), block: b });
    }
  }
  const buskerArtists = artists.filter((a) => !a.custom && ARTIST_BY_ID[a.id]);
  const buskerUse = new Map<string, number>();
  const usedStage = new Set<string>();
  for (const d of districts) {
    const count = Math.max(2, Math.min(6, Math.round(2 + d.weight * 8)));
    const pool = buskerArtists
      .filter((a) => a.genres.includes(d.genre))
      .map((a) => ({ a, s: (userIds.has(a.id) ? 3 : 0) + (a.genres[0] === d.genre ? 1 : 0) - (buskerUse.get(a.id) ?? 0) * 2 + rng() }))
      .sort((x, y) => y.s - x.s);
    const options = corners
      .filter((c) => c.block.dominant === d.genre)
      .map((c) => ({ c, s: dist(c.p, d.center) + rng() * PITCH * 2 }))
      .sort((x, y) => x.s - y.s);
    for (const { c } of options) {
      if (buskers.filter((k) => k.genre === d.genre).length >= count || !pool.length) break;
      if (buskers.some((k) => dist(k.position, c.p) < PITCH * 1.6)) continue;
      const pickA = pool[buskers.filter((k) => k.genre === d.genre).length % pool.length].a;
      buskerUse.set(pickA.id, (buskerUse.get(pickA.id) ?? 0) + 1);
      const names = shuffle(rng, STAGE_NAMES).filter((n) => !usedStage.has(n));
      const name = names[0] ?? `Busker No. ${buskers.length + 1}`;
      usedStage.add(name);
      buskers.push({
        id: `busker-${buskers.length}`,
        name,
        position: c.p,
        rotation: c.rot,
        artistId: pickA.id,
        genre: d.genre,
        instrument: pick(rng, INSTRUMENTS[d.genre]),
      });
    }
  }

  return {
    seed,
    size: grid * PITCH,
    pitch: PITCH,
    road: ROAD,
    grid,
    blocks,
    buildings: remaining,
    venues,
    landmarks,
    districts,
    mixed,
    river: { points: riverPts, width: riverWidth },
    bridges,
    roads,
    trees,
    lamps,
    connections: connections.slice(0, 80),
    labels,
    buskers,
    dna,
    artists,
    userArtistIds: input.artists.map((a) => a.id),
    userGenreIds: input.genres,
    unknownInputs: input.unknown,
  };
}

export interface Introduction {
  venue: VenuePlan;
  removedBuilding?: BuildingPlan;
  connections: Connection[];
}

/**
 * Brings a newly discovered artist into an existing city without rebuilding
 * it: a building in the best-matching district becomes a small venue.
 */
export function introduceArtist(plan: CityPlan, artist: Artist, rng: Rng = Math.random): Introduction | undefined {
  if (plan.venues.some((v) => v.artistIds.includes(artist.id) && v.addedBy)) return undefined;
  const district =
    artist.genres.map((g) => plan.districts.find((d) => d.genre === g)).find((d): d is District => !!d) ?? plan.districts[0];
  const occupied = new Set(plan.venues.map((v) => `${Math.round(v.position.x)},${Math.round(v.position.z)}`));
  const candidates = plan.buildings
    .filter((b) => b.height > 0 && !occupied.has(`${Math.round(b.position.x)},${Math.round(b.position.z)}`))
    .map((b) => ({ b, s: dist(b.position, district.center) + rng() * 12 }))
    .sort((x, y) => x.s - y.s);
  const target = candidates[0]?.b;
  if (!target) return undefined;
  const g = GENRES[district.genre];
  const type = pick(rng, g.style.venueTypes);
  const used = new Set(plan.venues.map((v) => v.name));
  const name = shuffle(rng, [...g.venueNames, ...GENRES[artist.genres[1] ?? district.genre].venueNames]).find((n) => !used.has(n)) ?? `${artist.name} Rooms`;
  const venue: VenuePlan = {
    id: `venue-added-${artist.id}`,
    name,
    type,
    genres: [district.genre, ...artist.genres.filter((x) => x !== district.genre).slice(0, 1)],
    artistIds: [artist.id],
    description: `A fictional ${VENUE_LABEL[type]} that opened when you discovered ${artist.name}.`,
    position: target.position,
    footprint: Math.max(4.2, Math.min(target.width, target.depth)),
    rotation: 0,
    neon: pick(rng, g.style.neon),
    addedBy: artist.id,
  };
  plan.venues.push(venue);
  if (!plan.artists.some((a) => a.id === artist.id)) plan.artists.push(artist);

  const home = new Map<string, Vec2>();
  for (const v of plan.venues) for (const id of v.artistIds) if (!home.has(id)) home.set(id, v.position);
  for (const l of plan.landmarks) for (const id of l.artistIds) if (!home.has(id)) home.set(id, l.position);
  const connections: Connection[] = [];
  for (const n of neighbours(artist)) {
    const other = home.get(n.id);
    if (other && dist(other, venue.position) > 1) connections.push({ from: artist.id, to: n.id, a: venue.position, b: other });
  }
  plan.connections.push(...connections);
  return { venue, removedBuilding: target, connections };
}

/** Where an artist lives in the city: venues and landmarks that list them. */
export function locationsFor(plan: CityPlan, artistId: string): { venues: VenuePlan[]; landmarks: LandmarkPlan[] } {
  return {
    venues: plan.venues.filter((v) => v.artistIds.includes(artistId)),
    landmarks: plan.landmarks.filter((l) => l.artistIds.includes(artistId)),
  };
}
