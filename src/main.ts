import { ARTIST_BY_ID } from './data/artists.js';
import { GENRES } from './data/genres.js';
import { generateCity, introduceArtist } from './core/cityGenerator.js';
import { compareTastes, mergeTastes, ownerLabel } from './core/compare.js';
import { computeDna } from './core/dna.js';
import { Passport } from './core/passport.js';
import { mulberry32 } from './core/random.js';
import { discoverArtist } from './core/recommend.js';
import { resolveTaste, soundtrackArtist, splitInput, type ResolvedTaste } from './core/resolve.js';
import { store, type Tab } from './core/store.js';
import { lookupMany } from './music/artistLookup.js';
import { MusicService, PreviewPlayer, songKey } from './music/musicService.js';
import { TIMELINE } from './scene/buildings.js';
import { CityScene } from './scene/CityScene.js';
import type { PickHit } from './scene/cityBuilder.js';
import type { LabelKind } from './scene/labels.js';
import type { Artist, Selection, Vec2 } from './types.js';
import { $, toast } from './ui/dom.js';
import { Hud, type HudActions } from './ui/hud.js';
import { DEMO_INPUT, Landing } from './ui/landing.js';
import type { AppContext } from './app/context.js';
import { createCompareController, createCrateController, createGigController, createMoodController, createPerformController, createPosterController, createAmbienceController, createTourController, createVisualiserController, createWalkController, stampLandmark } from './app/features.js';
import { toursFor } from './core/tours.js';
import { createTogetherController } from './app/together.js';
import { createLookController } from './app/look.js';
import { createMinimap } from './app/minimap.js';
import { LIGHTERS } from './scene/lighters.js';
import type { Emote } from './scene/avatar.js';
import type { Track } from './music/musicService.js';
import type { MoodId } from './scene/mood.js';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Friend {
  name: string;
  inputs: string[];
}

function boot() {
  const app = $('#app');
  if (!webglAvailable()) {
    $('#fatal').hidden = false;
    return;
  }

  const music = new MusicService();
  const player = new PreviewPlayer();
  const passport = new Passport();
  const rng = mulberry32(Date.now() & 0xffffffff);
  const discovered = new Set<string>();
  let friend: Friend | null = null;
  let youName = 'You';
  let notices: string[] = [];

  const scene = new CityScene($('#stage'), $('#labels'), {
    onPick: (hit) => handlePick(hit),
    onLabel: (kind, id) => handleLabel(kind, id),
    onBuildProgress: (t) => hud.buildProgress(t, TIMELINE.done),
    onBuildComplete: () => buildComplete(),
    onNearby: (n) => walk.onNearby(n),
    onPit: (inPit) => {
      if (inPit) {
        toast('You’re in the mosh pit. Walk out to escape.');
        ambience.cheer(0.5);
      }
    },
  });

  const setPhase = (phase: 'landing' | 'building' | 'city') => {
    store.set({ phase });
    app.dataset.phase = phase;
  };

  const findArtist = (id: string): Artist | undefined => ARTIST_BY_ID[id] ?? store.get().plan?.artists.find((a) => a.id === id);

  /* ---------------- selection ---------------- */

  const select = (sel: Selection, opts: { fly?: boolean } = {}) => {
    const plan = store.get().plan;
    const city = scene.currentCity;
    if (!plan || !city) return;
    if (sel && scene.walking && opts.fly !== false) walk.exit();
    store.set({ selection: sel });
    hud.renderInfo(sel);
    scene.setViewShift(sel && window.matchMedia('(max-width: 760px)').matches ? 0.24 : 0);
    city.beams([]);
    city.focusConnections(null);
    scene.highlightLabel(null, null);
    if (!sel) {
      city.select(null);
      return;
    }
    if (window.matchMedia('(max-width: 760px)').matches) actions.toggleList(false);

    switch (sel.kind) {
      case 'venue': {
        const v = plan.venues.find((x) => x.id === sel.id);
        if (!v) return;
        city.select(v.position, v.neon, v.footprint * 0.75);
        scene.highlightLabel('venue', v.id);
        if (opts.fly !== false) scene.focus(v.position, 34, 3);
        break;
      }
      case 'landmark': {
        const l = plan.landmarks.find((x) => x.id === sel.id);
        if (!l) return;
        city.select(l.position, l.type === 'historical' ? '#ffcf6b' : '#c9b6ff', 7);
        scene.highlightLabel('landmark', l.id);
        if (opts.fly !== false) scene.focus(l.position, l.model === 'power-station' ? 62 : 46, 5);
        break;
      }
      case 'artist': {
        const places: Vec2[] = [
          ...plan.venues.filter((v) => v.artistIds.includes(sel.id)).map((v) => v.position),
          ...plan.landmarks.filter((l) => l.artistIds.includes(sel.id)).map((l) => l.position),
        ];
        const a = findArtist(sel.id);
        const color = a?.genres[0] ? GENRES[a.genres[0]].style.neon[0] : '#ffd27a';
        city.select(null);
        city.beams(places, color);
        city.focusConnections(sel.id);
        if (opts.fly !== false && places.length) {
          const cx = places.reduce((s, p) => s + p.x, 0) / places.length;
          const cz = places.reduce((s, p) => s + p.z, 0) / places.length;
          const spread = Math.max(...places.map((p) => Math.hypot(p.x - cx, p.z - cz)));
          scene.focus({ x: cx, z: cz }, Math.max(60, spread * 2.4), 2);
        }
        break;
      }
      case 'district': {
        const d = plan.districts.find((x) => x.genre === sel.genre);
        const m = plan.mixed.find((x) => x.genres.includes(sel.genre));
        const center = d?.center ?? m?.center;
        if (!center) return;
        city.select(center, GENRES[sel.genre].style.neon[0], 9);
        scene.highlightLabel('district', sel.genre);
        if (opts.fly !== false) scene.focus(center, Math.max(90, (d?.radius ?? 40) * 2.2), 0);
        break;
      }
      case 'label': {
        const t = plan.labels.find((x) => x.id === sel.id);
        if (!t) return;
        city.select(t.position, t.color, 8);
        scene.highlightLabel('label', t.id);
        const seen = new Set<string>();
        const homes: Vec2[] = [];
        for (const id of t.artistIds) {
          for (const p of [...plan.venues.filter((v) => v.artistIds.includes(id)).map((v) => v.position), ...plan.landmarks.filter((l) => l.artistIds.includes(id)).map((l) => l.position)]) {
            const k = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
            if (!seen.has(k)) {
              seen.add(k);
              homes.push(p);
            }
          }
        }
        city.links(t.position, (city.towers.get(t.id)?.height ?? 40) - 2, homes, t.color);
        if (opts.fly !== false) scene.focus(t.position, 190, 22);
        break;
      }
      case 'busker': {
        const b = plan.buskers.find((x) => x.id === sel.id);
        if (!b) return;
        city.select(b.position, GENRES[b.genre].style.neon[0], 2.6);
        scene.highlightLabel('busker', b.id);
        if (opts.fly !== false) scene.focus(b.position, 22, 1.5);
        break;
      }
      case 'home': {
        const h = plan.homes.find((x) => x.id === sel.id);
        if (!h) return;
        city.select(h.position, '#8ff0c8', 5);
        scene.highlightLabel('home', h.id);
        if (opts.fly !== false) scene.focus(h.position, 34, 2);
        const a = findArtist(h.artistId);
        if (a && !a.custom && hud.albumsState(a.id) === undefined) {
          hud.setAlbums(a.id, 'loading');
          music.albumsFor(a).then((list) => hud.setAlbums(a.id, list), () => hud.setAlbums(a.id, 'error'));
        }
        break;
      }
      case 'billboard': {
        const b = plan.billboards.find((x) => x.id === sel.id);
        if (!b) return;
        city.select(b.position, GENRES[b.genre].style.neon[0], 5);
        if (opts.fly !== false) scene.focus(b.position, 34, b.baseHeight + 6, 1.2, 0.32);
        break;
      }
      case 'street': {
        const st = plan.streets.find((x) => x.id === sel.id);
        if (!st) return;
        city.select(null);
        city.highlightStreet(st, GENRES[st.genre].style.neon[0]);
        scene.highlightLabel('street', st.id);
        const mid = (st.from + st.to) / 2;
        if (opts.fly !== false) scene.focus(st.axis === 'x' ? { x: mid, z: st.c } : { x: st.c, z: mid }, Math.max(90, (st.to - st.from) * 0.9), 0);
        break;
      }
      case 'building': {
        const b = plan.buildings.find((x) => x.id === sel.id);
        if (!b) return;
        city.select(b.position, '#ffffff', Math.max(b.width, b.depth) * 0.75);
        break;
      }
    }
  };

  const handlePick = (hit: PickHit | null) => {
    if (!hit) {
      if (store.get().selection) select(null);
      return;
    }
    const fly = !scene.walking;
    if (hit.kind === 'crate') crate.open(String(hit.id));
    else if (hit.kind === 'building') select({ kind: 'building', id: Number(hit.id) }, { fly: false });
    else select({ kind: hit.kind, id: String(hit.id) }, { fly });
  };

  const handleLabel = (kind: LabelKind, id: string) => {
    const fly = !scene.walking;
    if (kind === 'district') select({ kind: 'district', genre: id as keyof typeof GENRES }, { fly });
    else if (kind === 'mixed') select({ kind: 'district', genre: id.split('|')[0] as keyof typeof GENRES }, { fly });
    else select({ kind, id }, { fly });
  };

  const shareUrl = () => {
    const p = new URLSearchParams({ city: store.get().inputs.join(', ') });
    if (friend) {
      p.set('with', friend.inputs.join(', '));
      p.set('them', friend.name);
      if (youName !== 'You') p.set('you', youName);
    }
    if (scene.moodId !== 'night') p.set('mood', scene.moodId);
    return `${location.origin}${location.pathname}?${p.toString()}`;
  };

  /* ---------------- actions ---------------- */

  const actions: HudActions = {
    select,
    async listen(artistId) {
      const artist = findArtist(artistId);
      if (!artist) return;
      hud.setTracks(artistId, 'loading');
      const result = await music.tracksFor(artist);
      hud.setTracks(artistId, result);
      if (result.degraded) toast('Music data unavailable. Showing curated city data.', 'warn');
      if (result.tracks.some((t) => t.previewUrl)) player.playQueue(result.tracks);
    },
    async listenAll(key, artistIds) {
      const artists = artistIds.map(findArtist).filter((a): a is Artist => !!a && !a.custom);
      if (!artists.length) return;
      hud.setTracks(key, 'loading');
      const result = await music.tracksForArtists(artists, artists.length === 1 ? 6 : 2);
      hud.setTracks(key, result);
      if (result.degraded) toast('Music data unavailable. Showing curated city data.', 'warn');
      if (result.tracks.some((t) => t.previewUrl)) player.playQueue(result.tracks);
    },
    nextTrack: () => void player.next(),
    async listenLandmark(landmarkId) {
      const l = store.get().plan?.landmarks.find((x) => x.id === landmarkId);
      if (!l?.soundtrack) return;
      const key = `lm:${l.id}`;
      const songs = l.soundtrack.songs.map((s) => ({ artist: soundtrackArtist(s), title: s.title.replace(/[“”]/g, '') }));
      hud.setTracks(key, 'loading');
      const result = await music.tracksForSongs(key, songs);
      hud.setTracks(key, result);
      if (result.degraded) toast('Music data unavailable. Showing curated city data.', 'warn');
      if (result.tracks.some((t) => t.previewUrl)) player.playQueue(result.tracks);
      stampLandmark(ctx, l.id);
    },
    playTrack: (t, queue) => (queue ? player.playQueue(queue, queue.indexOf(t)) : player.play(t)),
    togglePlayer: () => player.toggle(),
    stopPlayer: () => player.stop(),
    addArtist(artistId) {
      const plan = store.get().plan;
      const city = scene.currentCity;
      const artist = ARTIST_BY_ID[artistId];
      if (!plan || !city || !artist) return;
      const intro = introduceArtist(plan, artist, rng);
      if (!intro) {
        toast(`${artist.name} already has a place in your city.`);
        select({ kind: 'artist', id: artistId }, { fly: true });
        return;
      }
      city.introduceVenue(intro.venue, intro.removedBuilding, intro.connections);
      scene.onVenueAdded(intro.venue.id);
      if (!plan.userArtistIds.includes(artist.id)) plan.userArtistIds.push(artist.id);
      const userArtists = plan.userArtistIds.map(findArtist).filter((a): a is Artist => !!a && !a.custom);
      plan.dna = computeDna(userArtists, plan.userGenreIds, plan.unknownInputs.length);
      store.set({ planVersion: store.get().planVersion + 1 });
      hud.renderDna();
      hud.renderList(store.get().tab);
      const district = GENRES[intro.venue.genres[0]].name;
      toast(`${artist.name} moved into the ${district} District. ${intro.venue.name} just opened.`);
      select({ kind: 'venue', id: intro.venue.id }, { fly: true });
    },
    discover() {
      const plan = store.get().plan;
      if (!plan) return;
      const inCity = new Set(plan.artists.map((a) => a.id));
      let a = discoverArtist(inCity, plan.userArtistIds, plan.dna, rng, discovered);
      if (!a) {
        discovered.clear();
        a = discoverArtist(inCity, plan.userArtistIds, plan.dna, rng, discovered);
      }
      if (!a) {
        toast('You have met everyone in our catalogue. Impressive.');
        return;
      }
      discovered.add(a.id);
      select({ kind: 'artist', id: a.id }, { fly: true });
      void actions.listen(a.id);
    },
    overview() {
      walk.exit();
      select(null);
      scene.overview();
    },
    newCity() {
      if (together.active) together.leave(false);
      walk.exit();
      gig.end();
      tours.end();
      perform.end();
      if (viz.on) viz.toggle();
      player.stop();
      select(null);
      actions.toggleList(false);
      friend = null;
      store.set({ compare: null });
      setPhase('landing');
      scene.setAmbient(true);
      history.replaceState(null, '', location.pathname);
      landing.show(store.get().inputs);
    },
    async share() {
      const url = shareUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast(friend ? 'Link copied. It rebuilds your shared city.' : 'Link copied. Anyone who opens it gets the same city.');
      } catch {
        history.replaceState(null, '', url);
        toast('The link to your city is in the address bar.');
      }
    },
    skip: () => scene.skipIntro(),
    setTab(tab: Tab) {
      const s = store.get();
      const open = !(s.listOpen && s.tab === tab);
      store.set({ tab, listOpen: open });
      hud.setTab(tab, open);
      if (open && window.matchMedia('(max-width: 760px)').matches && s.selection) select(null);
    },
    toggleList(open) {
      const next = open ?? !store.get().listOpen;
      store.set({ listOpen: next });
      hud.setTab(store.get().tab, next);
    },
    startGig: (kind, id) => gig.start(kind, id),
    nextAct: () => gig.next(),
    endGig: () => gig.end(),
    walk: (kind, id) => {
      gig.end();
      tours.end();
      perform.end();
      walk.enter(kind, id);
    },
    exitWalk: () => {
      $('#request').hidden = true;
      walk.exit();
    },
    openCompare: () => compareUi.open(),
    openPoster: () => void poster.open(),
    tip(buskerId) {
      const b = store.get().plan?.buskers.find((x) => x.id === buskerId);
      if (!b) return;
      const key = `busker:${b.id}`;
      const artist = findArtist(b.artistId);
      const current = player.current;
      if (current && artist && current.artist.toLowerCase().includes(artist.name.toLowerCase().replace(/^the /, '')) && player.hasNext) {
        player.next();
        toast(`${b.name} tips their hat and plays another.`);
      } else {
        toast(`${b.name} tips their hat and strikes up a song by ${artist?.name ?? 'someone great'}.`);
        void actions.listenAll(key, [b.artistId]);
      }
    },
    openCrate: (id) => crate.open(id),
    setMood(id) {
      mood.set(id as MoodId, { play: true });
      history.replaceState(null, '', shareUrl());
    },
    playMood: () => void mood.play(),
    async listenStreet(id) {
      const st = store.get().plan?.streets.find((x) => x.id === id);
      const artist = st && findArtist(st.artistId);
      if (!st || !artist) return;
      const key = `street:${id}`;
      hud.setTracks(key, 'loading');
      const res = await music.tracksForSongs(key, [{ artist, title: st.song }]);
      hud.setTracks(key, res);
      const t = res.tracks.find((x) => x.previewUrl);
      if (t) player.play(t);
      else if (res.degraded) toast('Music data unavailable. Showing curated city data.', 'warn');
    },
    async listenBillboard(id) {
      const b = store.get().plan?.billboards.find((x) => x.id === id);
      const artist = b && findArtist(b.artistId);
      if (!b || !artist) return;
      const key = `bb:${id}`;
      hud.setTracks(key, 'loading');
      let res = null;
      try {
        const albums = await music.albumsFor(artist);
        const want = songKey(b.title);
        const album = albums.find((a) => songKey(a.title).startsWith(want) || want.startsWith(songKey(a.title)));
        if (album) res = await music.albumTracks(album, artist);
      } catch {
        /* fall back below */
      }
      if (!res || !res.tracks.some((t) => t.previewUrl)) res = await music.tracksFor(artist);
      hud.setTracks(key, res);
      if (res.tracks.some((t) => t.previewUrl)) player.playQueue(res.tracks);
    },
    crateForBillboard(id) {
      const plan = store.get().plan;
      const b = plan?.billboards.find((x) => x.id === id);
      if (!plan || !b) return;
      const artist = findArtist(b.artistId);
      const stores = plan.venues
        .filter((v) => v.type === 'record-store')
        .map((v) => ({ v, s: Math.hypot(v.position.x - b.position.x, v.position.z - b.position.z) - (artist?.genres.some((g) => v.genres.includes(g)) ? 400 : 0) }))
        .sort((x, y) => x.s - y.s);
      const shop = stores[0]?.v;
      if (!shop) return;
      toast(`${shop.name} has ${b.title} in stock.`);
      crate.open(shop.id, b.artistId);
    },
    async playAlbum(artistId, albumId) {
      const artist = findArtist(artistId);
      const list = hud.albumsState(artistId);
      const album = Array.isArray(list) ? list.find((a) => a.id === albumId) : undefined;
      if (!artist || !album) return;
      const key = `home:${artistId}`;
      hud.markAlbum(artistId, albumId);
      hud.setTracks(key, 'loading');
      const res = await music.albumTracks(album, artist);
      hud.setTracks(key, res);
      if (res.tracks.some((t) => t.previewUrl)) player.playQueue(res.tracks);
      else toast('No previews for that album right now.', 'warn');
    },
    startTour(id) {
      gig.end();
      perform.end();
      tours.start(id);
    },
    tourStep: (d) => tours.step(d),
    endTour: () => tours.end(),
    openPerform() {
      gig.end();
      tours.end();
      perform.open();
    },
    startPerform: () => void perform.start(),
    performNext: () => perform.next(),
    endPerform: () => perform.end(),
    toggleVisualiser: () => viz.toggle(),
    enterVenue(id) {
      gig.end();
      tours.end();
      perform.end();
      select(null);
      walk.enterVenue(id);
    },
    leaveVenue: () => {
      $('#request').hidden = true;
      walk.leaveVenue();
    },
    toggleAmbience: () => ambience.toggle(),
    emote(kind) {
      const k = kind as Emote;
      if (!scene.walking) {
        toast('Emotes work while walking. Press Walk, then 1–4 or the emote buttons.');
        return;
      }
      scene.emote(k);
      together.emote(k);
      if ((k === 'headbang' || k === 'surf') && scene.insideVenue) ambience.cheer(0.4);
      if (k === 'surf' && !scene.insideVenue) toast('Crowd-surfing works best inside a venue, over the crowd.');
    },
    async openRequests(venueId) {
      const plan = store.get().plan;
      const v = plan?.venues.find((x) => x.id === venueId);
      if (!plan || !v) return;
      const key = `req:${v.id}`;
      hud.renderRequests(v.name, key, 'loading');
      const artists = v.artistIds.map(findArtist).filter((a): a is Artist => !!a && !a.custom);
      const res = await music.tracksForArtists(artists, 3);
      const tracks = res.tracks.filter((t) => t.previewUrl);
      requestCache.set(key, tracks);
      hud.renderRequests(v.name, key, { tracks });
    },
    requestSong(key, index) {
      const tracks = requestCache.get(key);
      const t = tracks?.[index];
      if (!tracks || !t) return;
      if (player.locked) {
        player.onBlocked?.();
        return;
      }
      player.playQueue(tracks, index);
      scene.cheer(1);
      ambience.cheer(1);
      $('#request').hidden = true;
      toast(`By request: “${t.title}”. The crowd goes wild.`);
    },
    openTogether: () => together.open(),
  };

  const hud = new Hud($('#hud'), actions);
  hud.passport = passport;
  hud.hasNext = () => player.hasNext;
  player.subscribe((s) => hud.renderPlayer(s));

  const ctx: AppContext = { scene, hud, music, player, passport, select };
  const gig = createGigController(ctx);
  const walk = createWalkController(ctx);
  const poster = createPosterController(ctx, shareUrl, () =>
    friend ? [`${youName}: ${store.get().inputs.join(', ')}.`, `${friend.name}: ${friend.inputs.join(', ')}.`] : store.get().inputs,
  );

  /* ---------------- building ---------------- */

  /** Resolves inputs, looking up names outside the catalogue on MusicBrainz. */
  const resolveWithLookup = async (inputs: string[], who?: string): Promise<ResolvedTaste> => {
    const taste = resolveTaste(inputs);
    if (!taste.unknown.length) return taste;
    const res = await lookupMany(taste.unknown, (n) => hud.buildStatus(`Looking up ${n}${who ? ` for ${who}` : ''}…`));
    for (const a of res.found) if (!taste.artists.some((x) => x.id === a.id)) taste.artists.push(a);
    taste.unknown = res.notFound;
    if (res.found.length) notices.push(`Found ${res.found.map((a) => a.name).join(', ')} on ${res.found[0].source ?? 'MusicBrainz'}.`);
    if (res.failed) notices.push('Couldn’t reach the music database, so some names appear as musical interpretations.');
    return taste;
  };

  const build = async (inputs: string[], withFriend: Friend | null = null, name = 'You') => {
    walk.exit();
    gig.end();
    player.stop();
    friend = withFriend;
    youName = name;
    notices = [];
    store.set({ inputs, selection: null, listOpen: false, compare: null });
    setPhase('building');
    landing.hide();
    hud.showBuild(true);
    hud.buildProgress(0, TIMELINE.done);
    history.replaceState(null, '', shareUrl());
    await new Promise((r) => setTimeout(r, 80));
    try {
      const yours = await resolveWithLookup(inputs);
      let taste = yours;
      let compare = null;
      if (withFriend) {
        const theirs = await resolveWithLookup(withFriend.inputs, withFriend.name);
        taste = mergeTastes(yours, theirs);
        compare = compareTastes(yours, theirs, name, withFriend.name);
      }
      const plan = generateCity(taste);
      tours.end();
      perform.end();
      store.set({ plan, compare });
      hud.compare = compare;
      hud.tours = toursFor(plan);
      hud.mount(plan);
      hud.setTab(store.get().tab, false);
      scene.setAmbient(false);
      const subs: Record<string, string> = {};
      if (compare) for (const d of plan.districts) subs[d.genre] = ownerLabel(compare, d.genre);
      scene.setCity(plan, true, subs);
    } catch (err) {
      console.error(err);
      hud.showBuild(false);
      setPhase('landing');
      landing.show(inputs);
      toast('Something went wrong while building. Please try again.', 'warn');
    }
  };

  const crate = createCrateController(ctx, (id) => actions.addArtist(id));
  const mood = createMoodController(ctx);
  const tours = createTourController(ctx);
  const look = createLookController();
  const perform = createPerformController(ctx, () => look.look);
  const viz = createVisualiserController(ctx, () => void mood.play());
  const ambience = createAmbienceController(ctx);
  /** A short "where are you" line for the people in your room. */
  const whereAmI = () => {
    const plan = store.get().plan;
    if (!plan) return '';
    const me = scene.selfState();
    if (me.inside) return `Inside ${plan.venues.find((v) => v.id === me.inside)?.name ?? 'a venue'}`;
    if (me.walking) {
      const st = plan.streets
        .map((s) => ({ s, d: s.axis === 'x' ? Math.abs(me.z - s.c) : Math.abs(me.x - s.c) }))
        .sort((a, b) => a.d - b.d)[0];
      return st && st.d < plan.pitch / 2 ? `Walking on ${st.s.name}` : 'Walking around';
    }
    const d = plan.districts.slice().sort((a, b) => Math.hypot(a.center.x - me.x, a.center.z - me.z) - Math.hypot(b.center.x - me.x, b.center.z - me.z))[0];
    return d ? `Flying over the ${d.name}` : 'Flying over the city';
  };
  const together = createTogetherController(ctx, shareUrl, whereAmI, {
    walkTo: (p) => {
      gig.end();
      tours.end();
      perform.end();
      walk.enterAt(p);
    },
    goToVenue: (id) => actions.enterVenue(id),
    look: () => look.look,
    openLook: () => look.open(),
  });
  createMinimap(ctx, () => together.friends());

  // Analyse the music (for the visualiser and "lighters up") once the browser allows audio.
  window.addEventListener('pointerdown', () => player.enableAnalysis(), { once: true });

  // Lighters up for slow songs: count bass hits over the last few seconds.
  {
    let prevBass = 0;
    let lastHit = 0;
    const hits: number[] = [];
    let playingSince = 0;
    let lighterToast = 0;
    window.setInterval(() => {
      const now = performance.now();
      const playing = player.playing;
      if (!playing) playingSince = 0;
      else if (!playingSince) playingSince = now;
      let slow = false;
      if (playing) {
        const lv = player.levels(8);
        const bass = (lv[0] + lv[1]) / 2;
        const loud = lv.reduce((a, b) => a + b, 0) / lv.length;
        if (bass - prevBass > 0.07 && now - lastHit > 240) {
          hits.push(now);
          lastHit = now;
        }
        prevBass = bass * 0.6 + prevBass * 0.4;
        while (hits.length && now - hits[0] > 8000) hits.shift();
        const listened = now - playingSince;
        // Slow: few beats per second, but not silence (so we know we can hear it).
        slow = listened > 7000 && loud > 0.02 && hits.length / Math.min(8, listened / 1000) < 1.05;
      }
      LIGHTERS.level += ((slow ? 1 : 0) - LIGHTERS.level) * 0.06;
      const crowd = !!scene.insideVenue || scene.currentCity?.gigActive || perform.active;
      if (slow && crowd && LIGHTERS.level > 0.5 && now - lighterToast > 90000) {
        lighterToast = now;
        toast('A slow one. Lighters up.');
      }
    }, 150);
  }

  // Emote keys while walking: 1 headbang, 2 air guitar, 3 dance, 4 crowd-surf.
  window.addEventListener('keydown', (e) => {
    if (!scene.walking || e.target instanceof HTMLInputElement) return;
    const kinds: Emote[] = ['headbang', 'airguitar', 'dance', 'surf'];
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) actions.emote(kinds[i]);
  });
  const requestCache = new Map<string, Track[]>();

  /** Swaps billboard sleeves for real covers, one request at a time to stay polite to the API. */
  const loadBillboardArt = async (plan: NonNullable<ReturnType<typeof store.get>['plan']>) => {
    for (const b of plan.billboards) {
      if (store.get().plan !== plan) return;
      const artist = findArtist(b.artistId);
      if (!artist || artist.custom) continue;
      const url = await music.albumArt(artist, b.title);
      if (url && store.get().plan === plan) {
        hud.billboardArt.set(b.id, url);
        scene.setBillboardArt(b.id, url);
      }
      await new Promise((r) => setTimeout(r, 450));
    }
  };
  const compareUi = createCompareController((yours, f, you) => void build(yours, f, you));

  const buildComplete = () => {
    hud.showBuild(false);
    setPhase('city');
    const plan = store.get().plan;
    if (plan) void loadBillboardArt(plan);
    together.offerInvite();
    const compare = store.get().compare;
    const messages = [...notices];
    if (plan?.unknownInputs.length) messages.push(`We couldn’t find ${plan.unknownInputs.join(', ')}, so they appear as musical interpretations.`);
    if (compare) messages.unshift(`${compare.youName} and ${compare.themName}: ${compare.score}% taste overlap.`);
    messages.forEach((m, i) => setTimeout(() => toast(m, m.startsWith('Couldn’t') || m.startsWith('We couldn’t') ? 'warn' : 'info', 5500), i * 5800));
    const hint = $('#hint');
    hint.classList.add('is-visible');
    setTimeout(() => hint.classList.remove('is-visible'), 7000);
  };

  const landing = new Landing($('#landing'), (inputs) => void build(inputs));

  // Handy for debugging and automated checks in the browser console.
  (window as unknown as { musicalCity: unknown }).musicalCity = { scene, store, select, passport, actions };

  /* ---------------- start ---------------- */

  const params = new URLSearchParams(location.search);
  const startMood = params.get('mood');
  if (startMood) mood.set(startMood as MoodId, { instant: true });
  const sharedInputs = splitInput(params.get('city') ?? '');
  const withInputs = splitInput(params.get('with') ?? '');
  if (sharedInputs.length) {
    void build(sharedInputs, withInputs.length ? { name: params.get('them') || 'Friend', inputs: withInputs } : null, params.get('you') || 'You');
  } else {
    const plan = generateCity(resolveTaste(DEMO_INPUT));
    scene.setCity(plan, false);
    scene.setAmbient(true);
    setPhase('landing');
    landing.show();
  }
}

boot();
