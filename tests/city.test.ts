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
    assert.ok(l.soundtrack.songs.length >= 2, `${l.id} needs a soundtrack`);
    for (const s of l.soundtrack.songs) assert.ok(s.artistName || (s.artistId && ARTIST_BY_ID[s.artistId]), `${l.id} soundtrack → unknown artist ${s.artistId}`);
    if (l.soundtrack.album) assert.ok(ARTIST_BY_ID[l.soundtrack.album.artistId]);
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

test('landmark soundtracks match the event', () => {
  const byId = Object.fromEntries(HISTORICAL_LANDMARKS.map((l) => [l.id, l]));
  assert.equal(byId['beatles-abbey-road'].soundtrack.album?.title, 'Abbey Road');
  assert.equal(byId['beatles-rooftop'].soundtrack.album?.title, 'Let It Be');
  assert.ok(byId['beatles-rooftop'].soundtrack.songs.some((s) => s.title === 'Get Back'));
  assert.equal(byId['floyd-battersea'].soundtrack.album?.title, 'Animals');
  const plan = generateCity(resolveTaste(['The Beatles']));
  assert.equal(plan.landmarks.find((l) => l.id === 'beatles-rooftop')?.soundtrack?.album?.title, 'Let It Be');
});

test('rock, indie and punk expansion resolves and builds its own districts', () => {
  for (const name of ["Guns N' Roses", 'guns n roses', 'Arctic Monkeys', 'Queens of the Stone Age', 'QOTSA', 'AC/DC', 'Green Day', 'The Libertines', 'Oasis']) {
    assert.equal(matchTerm(name)?.kind, 'artist', name);
  }
  assert.equal(matchTerm('Indie')?.id, 'indie');
  assert.equal(matchTerm('Hard Rock')?.id, 'hard-rock');
  assert.equal(matchTerm('metal')?.id, 'metal');
  assert.ok(ARTISTS.length >= 90);
  const plan = generateCity(resolveTaste(["Guns N' Roses", 'Arctic Monkeys', 'Queens of the Stone Age', 'Indie']));
  const genres = plan.districts.map((d) => d.genre);
  assert.ok(genres.includes('hard-rock') && genres.includes('indie'));
  assert.ok(plan.landmarks.some((l) => l.id === 'gnr-troubadour'));
  assert.ok(plan.landmarks.some((l) => l.id === 'arctic-grapes'));
  assert.ok(plan.landmarks.some((l) => l.model === 'flying-v'));
  assert.ok(plan.landmarks.some((l) => l.model === 'cassette'));
});

test('new genres: metal, hip hop, jazz, soul, reggae and pop each build a district with a monument', async () => {
  const { GENRES } = await import('../src/data/genres.js');
  for (const g of ['metal', 'hip-hop', 'jazz', 'soul', 'reggae', 'pop'] as const) {
    assert.ok(GENRES[g], g);
    const plan = generateCity(resolveTaste([GENRES[g].name]));
    assert.equal(plan.districts[0].genre, g);
    assert.ok(plan.landmarks.some((l) => l.id === `monument-${g}`), `${g} monument`);
  }
  for (const [name, genre] of [['Nas', 'hip-hop'], ['Miles Davis', 'jazz'], ['Bob Marley', 'reggae'], ['Aretha Franklin', 'soul'], ['Iron Maiden', 'metal'], ['Beyoncé', 'pop']] as const) {
    const t = resolveTaste([name]);
    assert.equal(t.artists[0]?.genres[0], genre, name);
  }
  const plan = generateCity(resolveTaste(['Miles Davis', 'Bob Marley']));
  assert.ok(plan.landmarks.some((l) => l.id === 'kind-of-blue'));
  assert.ok(plan.landmarks.some((l) => l.id === 'hope-road'));
});

test('compare: overlap score, shared genres and ownership', async () => {
  const { compareTastes, mergeTastes } = await import('../src/core/compare.js');
  const a = resolveTaste(['The Clash', 'Joy Division', 'Punk']);
  const b = resolveTaste(['Sex Pistols', 'The Clash', 'Punk', 'Miles Davis']);
  const c = compareTastes(a, b, 'Ben', 'Alex');
  assert.ok(c.score > 40 && c.score <= 100, `score ${c.score}`);
  assert.deepEqual(c.sharedArtists.map((x) => x.id), ['the-clash']);
  assert.equal(c.owners.punk, 'shared');
  assert.equal(c.owners.jazz, 'them');
  const far = compareTastes(resolveTaste(['Metallica']), resolveTaste(['Miles Davis']));
  assert.ok(far.score < c.score);
  const merged = mergeTastes(a, b);
  assert.equal(merged.artists.filter((x) => x.id === 'the-clash').length, 1);
  const plan = generateCity(merged);
  assert.ok(plan.districts.some((d) => d.genre === 'jazz'));
});

test('passport stamps landmarks and completes scenes', async () => {
  const { Passport, SCENES } = await import('../src/core/passport.js');
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  for (const s of SCENES) for (const id of s.landmarkIds) assert.ok(HISTORICAL_LANDMARKS.some((l) => l.id === id), `${s.id} → ${id}`);
  const p = new Passport(storage);
  assert.equal(p.stamp('beatles-cavern').isNew, true);
  assert.equal(p.stamp('beatles-cavern').isNew, false);
  p.stamp('beatles-abbey-road');
  const res = p.stamp('beatles-rooftop');
  assert.ok(res.completed.some((s) => s.id === 'beatlemania'));
  assert.equal(new Passport(storage).count, 3);
  assert.equal(p.stamp('not-a-landmark').isNew, false);
});

test('external genre tags map onto city genres', async () => {
  const { genresFromTags } = await import('../src/music/artistLookup.js');
  assert.equal(genresFromTags([{ name: 'hip hop', count: 5 }, { name: 'jazz rap', count: 1 }])[0], 'hip-hop');
  assert.equal(genresFromTags([{ name: 'Hip-Hop/Rap' }])[0], 'hip-hop');
  assert.equal(genresFromTags([{ name: 'thrash metal', count: 3 }])[0], 'metal');
  assert.equal(genresFromTags([{ name: 'indie rock', count: 4 }, { name: 'rock', count: 1 }])[0], 'indie');
  assert.deepEqual(genresFromTags([{ name: 'polka', count: 2 }]), []);
});

test('record labels are real, resolve to catalogue artists, and get towers in matching cities', async () => {
  const { RECORD_LABELS, labelsFor } = await import('../src/data/labels.js');
  const ids = new Set<string>();
  for (const l of RECORD_LABELS) {
    assert.ok(!ids.has(l.id), `duplicate label ${l.id}`);
    ids.add(l.id);
    assert.ok(l.founded > 1880 && l.founded < 2010 && l.city && l.founders && l.blurb, l.id);
    for (const a of l.artistIds) assert.ok(ARTIST_BY_ID[a], `${l.id} → unknown artist ${a}`);
  }
  assert.ok(labelsFor('bob-marley').some((l) => l.id === 'island'));
  assert.ok(labelsFor('joy-division').some((l) => l.id === 'factory'));
  const plan = generateCity(resolveTaste(['Bob Marley', 'Nirvana', 'Joy Division']));
  const names = plan.labels.map((t) => t.labelId);
  for (const id of ['island', 'sub-pop', 'factory']) assert.ok(names.includes(id), `expected ${id} tower`);
  const cityIds = new Set(plan.artists.map((a) => a.id));
  for (const t of plan.labels) {
    const label = RECORD_LABELS.find((l) => l.id === t.labelId)!;
    assert.ok(t.artistIds.length && t.artistIds.every((a) => label.artistIds.includes(a) && cityIds.has(a)), t.id);
    // Towers sit on their own block: no building, venue or landmark there.
    assert.ok(!plan.buildings.some((b) => Math.abs(b.position.x - t.position.x) < 6 && Math.abs(b.position.z - t.position.z) < 6), `${t.id} overlaps a building`);
    assert.ok(!plan.venues.some((v) => Math.hypot(v.position.x - t.position.x, v.position.z - t.position.z) < 6), `${t.id} overlaps a venue`);
    assert.ok(!plan.landmarks.some((l) => Math.hypot(l.position.x - t.position.x, l.position.z - t.position.z) < 6), `${t.id} overlaps a landmark`);
  }
});

test('buskers stand on open corners and play artists from their district', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  assert.ok(plan.buskers.length >= plan.districts.length, 'at least one busker per district');
  for (const b of plan.buskers) {
    const artist = ARTIST_BY_ID[b.artistId];
    assert.ok(artist?.genres.includes(b.genre), `${b.id} plays ${b.artistId}`);
    assert.ok(!plan.buildings.some((x) => Math.abs(b.position.x - x.position.x) < x.width / 2 && Math.abs(b.position.z - x.position.z) < x.depth / 2), `${b.id} inside a building`);
  }
  assert.equal(new Set(plan.buskers.map((b) => b.name)).size, plan.buskers.length, 'unique stage names');
});

test('the city is big: more blocks, venues and landmarks than before', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  assert.ok(plan.grid >= 19 && plan.size >= 19 * 18, `size ${plan.size}`);
  assert.ok(plan.buildings.length > 1200, `${plan.buildings.length} buildings`);
  assert.ok(plan.venues.length >= 25, `${plan.venues.length} venues`);
});

test('record store crates hold the store’s artists first, filed by genre then A–Z', async () => {
  const { crateFor } = await import('../src/core/crate.js');
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  const store = plan.venues.find((v) => v.type === 'record-store')!;
  const crate = crateFor(plan, store.id);
  assert.ok(crate.length >= 8 && crate.length <= 18);
  for (const id of store.artistIds) if (ARTIST_BY_ID[id]?.album.title) assert.ok(crate.some((r) => r.artist.id === id), `store artist ${id} in crate`);
  assert.equal(new Set(crate.map((r) => r.artist.id)).size, crate.length, 'no duplicates');
  assert.ok(crate.every((r) => r.title === r.artist.album.title), 'sleeves show the real signature album');
  assert.deepEqual(crateFor(plan, store.id), crate, 'deterministic');
});

test('streets are named after songs by artists in the city, each song once', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  assert.ok(plan.streets.length >= 20, `${plan.streets.length} streets`);
  const songs = new Set<string>();
  for (const st of plan.streets) {
    const a = ARTIST_BY_ID[st.artistId];
    assert.ok(a && a.songs.some((s) => s.title.replace(/[“”"]/g, '').replace(/\s*\(.*?\)/g, '').trim() === st.song), `${st.name} → ${st.song}`);
    assert.ok(st.name.startsWith(st.song), st.name);
    assert.ok(!songs.has(st.song), `duplicate ${st.song}`);
    songs.add(st.song);
    assert.ok(st.to > st.from);
  }
});

test('artist homes and album billboards use real catalogue data', () => {
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  for (const id of plan.userArtistIds) assert.ok(plan.homes.some((h) => h.artistId === id), `${id} has a home`);
  for (const h of plan.homes) assert.ok(!plan.buildings.some((b) => Math.hypot(b.position.x - h.position.x, b.position.z - h.position.z) < 0.5), 'home replaced its building');
  assert.ok(plan.billboards.length >= 6);
  for (const b of plan.billboards) {
    const a = ARTIST_BY_ID[b.artistId];
    assert.equal(b.title, a.album.title);
    assert.equal(b.year, a.album.year);
    assert.ok(b.baseHeight >= 14);
  }
});

test('plaques and tours come from documented facts', async () => {
  const { plaqueFacts, toursFor } = await import('../src/core/tours.js');
  const plan = generateCity(resolveTaste(splitInput(DEMO)));
  const v = plan.venues.find((x) => x.artistIds.includes('the-clash'))!;
  const facts = plaqueFacts(plan, v.id);
  assert.ok(facts.some((f) => f.includes('London Calling (1979)')));
  const tours = toursFor(plan);
  const grand = tours.find((t) => t.id === 'grand')!;
  assert.ok(grand && grand.stops.length >= 3);
  const years = grand.stops.map((s) => Number(s.sub.match(/\d{4}/)?.[0]));
  assert.deepEqual(years, [...years].sort((a, b) => a - b), 'grand tour runs oldest first');
  assert.ok(tours.some((t) => t.id === 'scene-beatlemania'));
  for (const t of tours) for (const s of t.stops) assert.ok(s.song || s.artistId, `${t.id}/${s.id} has music`);
});

test('song titles de-duplicate across remasters and spellings', async () => {
  const { songKey } = await import('../src/music/musicService.js');
  assert.equal(songKey('Anarchy in the U.K.'), songKey('Anarchy In The UK (Remastered 2007)'));
  assert.equal(songKey('London Calling'), songKey('London Calling - Remastered'));
  assert.notEqual(songKey('London Calling'), songKey('Train in Vain'));
});
