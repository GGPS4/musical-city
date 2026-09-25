/**
 * Shared domain types for Musical City.
 * Data (artists, genres, landmarks) is plain serialisable objects so it can
 * later be swapped for, or enriched by, a remote music API.
 */

export type GenreId =
  | 'punk'
  | 'post-punk'
  | 'classic-rock'
  | 'psychedelic'
  | 'alternative'
  | 'glam'
  | 'garage'
  | 'electronic'
  | 'new-wave'
  | 'art-rock'
  | 'hard-rock'
  | 'indie'
  | 'metal'
  | 'hip-hop'
  | 'jazz'
  | 'soul'
  | 'reggae'
  | 'pop';

export interface Song {
  title: string;
  year?: number;
}

export interface Album {
  title: string;
  year: number;
}

export interface Artist {
  id: string;
  name: string;
  /** Genre ids, most characteristic first. */
  genres: GenreId[];
  origin: string;
  /** Year the artist became active. */
  since: number;
  blurb: string;
  album: Album;
  songs: Song[];
  influences?: string[];
  relatedArtists?: string[];
  aliases?: string[];
  /** True for names the user typed that are not in the curated catalogue. */
  custom?: boolean;
  /** Where a non-catalogue artist's data came from (e.g. MusicBrainz). */
  source?: string;
}

/** Building archetypes the generator can place. */
export type Archetype =
  | 'brick'
  | 'warehouse'
  | 'apartment'
  | 'tower'
  | 'brutalist'
  | 'curvy'
  | 'dome'
  | 'classic'
  | 'neon-tower'
  | 'townhouse';

export type VenueType =
  | 'bar'
  | 'club'
  | 'theater'
  | 'record-store'
  | 'concert-hall'
  | 'warehouse'
  | 'rooftop';

export interface GenreStyle {
  /** Facade colours (hex). Blended across districts. */
  palette: string[];
  /** Neon / accent colours. */
  neon: string[];
  /** Ground tint for the district's sidewalks. */
  ground: string;
  /** Floors range for typical buildings. */
  floors: [number, number];
  /** Relative weights of building archetypes. */
  archetypes: Partial<Record<Archetype, number>>;
  /** How finely blocks get subdivided (1 = coarse, 3 = narrow lots). */
  density: number;
  parkChance: number;
  graffiti: number;
  /** Fraction of windows lit at night. */
  litRatio: number;
  venueTypes: VenueType[];
}

export interface Genre {
  id: GenreId;
  name: string;
  /** Short evocative nickname for the district. */
  nickname: string;
  aliases: string[];
  scene: string;
  description: string;
  style: GenreStyle;
  venueNames: string[];
  monument: { name: string; kind: MonumentKind; description: string };
  relatedGenres: GenreId[];
}

export type MonumentKind =
  | 'safety-pin'
  | 'amp-stack'
  | 'kaleidoscope'
  | 'monolith'
  | 'oscillator'
  | 'glitter-ball'
  | 'fuzz-box'
  | 'feedback-arch'
  | 'synth-pavilion'
  | 'gallery-cube'
  | 'flying-v'
  | 'cassette'
  | 'anvil'
  | 'boombox'
  | 'saxophone'
  | 'golden-record'
  | 'sound-system';

export type LandmarkModel =
  | 'rooftop-stage'
  | 'crossing'
  | 'cellar-club'
  | 'boat'
  | 'hall'
  | 'studio-wall'
  | 'theater'
  | 'festival-stage'
  | 'power-station'
  | 'park-stage'
  | 'stadium'
  | 'bowery-club'
  | 'silver-factory'
  | 'studio';

/** Music tied to a landmark: the album/songs connected to that place or event. */
export interface Soundtrack {
  album?: { title: string; year: number; artistId: string };
  /** `artistId` for catalogue artists, or `artistName` for records by someone outside it. */
  songs: { title: string; artistId?: string; artistName?: string }[];
  /** Short note on how the music relates to the place. */
  note: string;
}

export interface HistoricalLandmark {
  id: string;
  name: string;
  type: 'historical';
  artistIds: string[];
  /** Real-world place. */
  place: string;
  date: string;
  description: string;
  model: LandmarkModel;
  soundtrack: Soundtrack;
  /** Placed on the river instead of a block. */
  onWater?: boolean;
}

/* ------------------------------------------------------------------ */
/* Generated city                                                      */
/* ------------------------------------------------------------------ */

export interface Vec2 {
  x: number;
  z: number;
}

export interface GenreWeight {
  genre: GenreId | 'other';
  weight: number;
  percent: number;
}

export interface District {
  genre: GenreId;
  name: string;
  nickname: string;
  center: Vec2;
  radius: number;
  weight: number;
}

export interface MixedQuarter {
  genres: [GenreId, GenreId];
  name: string;
  center: Vec2;
}

export interface Block {
  id: number;
  gx: number;
  gz: number;
  center: Vec2;
  size: number;
  /** Blended influence of each genre at this block (sums to 1). */
  influence: Partial<Record<GenreId, number>>;
  dominant: GenreId;
  use: 'buildings' | 'park' | 'plaza' | 'water';
}

export interface BuildingPlan {
  id: number;
  blockId: number;
  archetype: Archetype;
  position: Vec2;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: string;
  accent: string;
  dominant: GenreId;
  secondary?: GenreId;
  graffiti: boolean;
  /** Distance from city centre, used to stagger the build animation. */
  order: number;
}

export interface VenuePlan {
  id: string;
  name: string;
  type: VenueType;
  genres: GenreId[];
  artistIds: string[];
  description: string;
  position: Vec2;
  footprint: number;
  rotation: number;
  neon: string;
  /** Venues introduced later through discovery. */
  addedBy?: string;
}

export interface LandmarkPlan {
  id: string;
  name: string;
  type: 'historical' | 'inspired';
  artistIds: string[];
  genres: GenreId[];
  description: string;
  place?: string;
  date?: string;
  position: Vec2;
  rotation: number;
  model: LandmarkModel | MonumentKind;
  footprint: number;
  soundtrack?: Soundtrack;
}

export interface Connection {
  from: string;
  to: string;
  a: Vec2;
  b: Vec2;
}

export interface RiverPlan {
  points: Vec2[];
  width: number;
}

export interface BridgePlan {
  position: Vec2;
  length: number;
  rotation: number;
}

export interface RoadSegment {
  a: Vec2;
  b: Vec2;
}

export interface TreePlan {
  position: Vec2;
  scale: number;
  genre: GenreId;
}

/** A real record label (facts), used for the label towers. */
export interface RecordLabel {
  id: string;
  name: string;
  founded: number;
  city: string;
  founders: string;
  blurb: string;
  /** Catalogue artists who released records on the label. */
  artistIds: string[];
  color: string;
}

export interface LabelTowerPlan {
  id: string;
  labelId: string;
  name: string;
  position: Vec2;
  height: number;
  color: string;
  /** Artists on the label who are in this city. */
  artistIds: string[];
  genre: GenreId;
}

export type Instrument = 'guitar' | 'sax' | 'keys' | 'drums' | 'turntables' | 'mic' | 'violin' | 'bass' | 'trumpet';

export interface BuskerPlan {
  id: string;
  /** Fictional stage name. */
  name: string;
  position: Vec2;
  rotation: number;
  artistId: string;
  genre: GenreId;
  instrument: Instrument;
}

/** A street named after a song by an artist in the city. `axis` is the direction it runs. */
export interface StreetPlan {
  id: string;
  name: string;
  song: string;
  artistId: string;
  genre: GenreId;
  /** 'x': runs along x at z = c. 'z': runs along z at x = c. */
  axis: 'x' | 'z';
  c: number;
  from: number;
  to: number;
}

export interface HomePlan {
  id: string;
  artistId: string;
  position: Vec2;
  rotation: number;
  width: number;
  depth: number;
  style: 'house' | 'studio' | 'loft';
  genre: GenreId;
}

export interface BillboardPlan {
  id: string;
  artistId: string;
  title: string;
  year: number;
  position: Vec2;
  /** Roof height of the building it stands on. */
  baseHeight: number;
  rotation: number;
  genre: GenreId;
}

export interface CityPlan {
  seed: number;
  size: number;
  pitch: number;
  road: number;
  grid: number;
  blocks: Block[];
  buildings: BuildingPlan[];
  venues: VenuePlan[];
  landmarks: LandmarkPlan[];
  districts: District[];
  mixed: MixedQuarter[];
  river: RiverPlan;
  bridges: BridgePlan[];
  roads: RoadSegment[];
  trees: TreePlan[];
  lamps: Vec2[];
  connections: Connection[];
  labels: LabelTowerPlan[];
  buskers: BuskerPlan[];
  streets: StreetPlan[];
  homes: HomePlan[];
  billboards: BillboardPlan[];
  dna: GenreWeight[];
  artists: Artist[];
  /** Artists the user entered (ids). */
  userArtistIds: string[];
  userGenreIds: GenreId[];
  unknownInputs: string[];
}

export type Selection =
  | { kind: 'venue'; id: string }
  | { kind: 'landmark'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'building'; id: number }
  | { kind: 'district'; genre: GenreId }
  | { kind: 'label'; id: string }
  | { kind: 'busker'; id: string }
  | { kind: 'home'; id: string }
  | { kind: 'billboard'; id: string }
  | { kind: 'street'; id: string }
  | null;
