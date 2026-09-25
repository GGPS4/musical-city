import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARTISTS, ARTIST_BY_ID } from '../src/data/artists.js';
import { GENRES, GENRE_IDS } from '../src/data/genres.js';
import { HISTORICAL_LANDMARKS } from '../src/data/landmarks.js';
import { generateCity, introduceArtist } from '../src/core/cityGenerator.js';
import { computeDna } from '../src/core/dna.js';
import { mulberry32 } from '../src/core/random.js';
import { discoverArtist, discoveryChain } from '../src/core/recommend.js';
import { matchTerm, resolveTaste, splitInput } from '../src/core/resolve.js';

const DEMO = 'The Beatles, David Bowie, The Clash, The Stooges, Punk, Psychedelic Rock';

test('catalogue relationships and landmark artists all resolve', () => {
  for (const a of ARTISTS) {
    for (const id of [...(a.relatedArtists ?? []), ...(a.influences ?? [])]) {
      assert.ok(ARTIST_BY_ID[id], `${a.id} → unknown artist ${id}`);
    }
    for (const g of a.genres) assert.ok(GENRES[g], `${a.id} has unknown genre ${g}`);
  }
  for (const l of HISTORICAL_LANDMARKS) {
    for (const id of l.artistIds) assert.ok(ARTIST_BY_ID[id], `${l.id} → unknown artist ${id}`);
    assert.ok(l.date && l.place && l.description, `${l.id} needs date, place and description`);
  }
  for (const g of GENRE_IDS) for (const r of GENRES[g].relatedGenres) assert.ok(GENRES[r]);
});

test('the brief’s required demo artists and genres are in the catalogue', () => {
  const artists = ['The Beatles', 'David Bowie', 'The Clash', 'The Sex Pistols', 'Joy Division', 'The Stooges', 'Pink Floyd', 'The Rolling Stones', 'Queen', 'The Ramones', 'Talking Heads', 'The Velvet Underground'];
  for (const a of artists) assert.equal(matchTerm(a)?.kind, 'artist', a);
  const genres = ['Punk', 'Post-Punk', 'Classic Rock', 'Psychedelic Rock', 'Alternative', 'Glam Rock', 'Garage Rock', 'Electronic'];
  for (const g of genres) assert.equal(matchTerm(g)?.kind, 'genre', g);
});

test('input parsing handles separators, duplicates, casing and typos', () => {
  assert.deepEqual(splitInput('Punk, punk;  The Clash\nthe clash'), ['Punk', 'The Clash']);
  const t = resolveTaste(['beatles', 'Davd Bowie', 'psych', 'Totally Unknown Band']);
  assert.deepEqual(t.artists.map((a) => a.id), ['the-beatles', 'david-bowie']);
  assert.deepEqual(t.genres, ['psychedelic']);
  assert.deepEqual(t.unknown, ['Totally Unknown Band']);
});

test('musical DNA percentages add up to 100 and follow the inputs', () => {
  const t = resolveTaste(splitInput(DEMO));
  const dna = computeDna(t.artists, t.genres, t.unknown.length);
  assert.equal(dna.reduce((s, d) => s + d.percent, 0), 100);
  assert.equal(dna[0].genre, 'punk');
  assert.ok(dna.some((d) => d.genre === 'psychedelic'));
  assert.ok(dna.some((d) => d.genre === 'classic-rock'));
});

test('the demo input builds the city the brief asks for', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  const districts = plan.districts.map((d) => d.genre);
  for (const g of ['punk', 'psychedelic', 'classic-rock'] as const) assert.ok(districts.includes(g), `missing ${g} district`);
  assert.ok(plan.mixed.length >= 1, 'expected a mixed/overlap quarter');
  assert.ok(plan.landmarks.some((l) => l.id === 'beatles-rooftop'), 'rooftop concert landmark');
  assert.ok(plan.landmarks.some((l) => l.type === 'historical'));
  assert.ok(plan.landmarks.some((l) => l.type === 'inspired'));
  assert.ok(plan.venues.filter((v) => v.type === 'record-store').length >= 3, 'record stores');
  assert.ok(plan.venues.some((v) => v.genres.includes('punk') && v.type !== 'record-store'), 'punk venues');
  assert.ok(plan.connections.length > 5, 'artist connections');
  assert.ok(plan.buildings.length > 300, 'a real city worth of buildings');
  const archetypes = new Set(plan.buildings.map((b) => b.archetype));
  assert.ok(archetypes.size >= 6, 'visual variety');
  for (const id of plan.userArtistIds) assert.ok(plan.venues.some((v) => v.artistIds.includes(id)), `${id} has a venue`);
});

test('generation is deterministic for the same taste, regardless of order', () => {
  const a = generateCity(resolveTaste(splitInput(DEMO)));
  const b = generateCity(resolveTaste(splitInput('Psychedelic Rock, Punk, The Stooges, The Clash, David Bowie, The Beatles')));
  assert.equal(a.seed, b.seed);
  assert.equal(a.buildings.length, b.buildings.length);
  assert.deepEqual(a.venues.map((v) => v.name).sort(), b.venues.map((v) => v.name).sort());
});

test('unknown-only input still builds a working city', () => {
  const plan = generateCity(resolveTaste(['Nobody Knows This Band']));
  assert.ok(plan.buildings.length > 100);
  assert.ok(plan.venues.some((v) => v.artistIds.some((id) => id.startsWith('custom-'))));
  assert.equal(plan.dna[0].genre, 'other');
});

test('venues and landmarks never share a spot', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  const key = (p: { x: number; z: number }) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
  const venueSpots = new Set(plan.venues.map((v) => key(v.position)));
  assert.equal(venueSpots.size, plan.venues.length);
  for (const b of plan.buildings) assert.ok(!venueSpots.has(key(b.position)), 'building on top of a venue');
});

test('discovery suggests new artists and can introduce them', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  const rng = mulberry32(42);
  const chain = discoveryChain(ARTIST_BY_ID['the-clash'], new Set(plan.userArtistIds), 3, rng);
  assert.ok(chain.length >= 2);
  assert.ok(chain.every((a) => !plan.userArtistIds.includes(a.id)));
  const found = discoverArtist(new Set(plan.artists.map((a) => a.id)), plan.userArtistIds, plan.dna, rng);
  assert.ok(found && !plan.userArtistIds.includes(found.id));
  const before = plan.venues.length;
  const intro = introduceArtist(plan, ARTIST_BY_ID['gang-of-four'], rng);
  assert.ok(intro);
  assert.equal(plan.venues.length, before + 1);
  assert.ok(intro.venue.artistIds.includes('gang-of-four'));
});
