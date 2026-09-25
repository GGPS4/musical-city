import { ARTIST_BY_ID } from './data/artists.js';
import { GENRES } from './data/genres.js';
import { generateCity, introduceArtist } from './core/cityGenerator.js';
import { computeDna } from './core/dna.js';
import { mulberry32 } from './core/random.js';
import { discoverArtist } from './core/recommend.js';
import { resolveTaste, splitInput } from './core/resolve.js';
import { store, type Tab } from './core/store.js';
import { MusicService, PreviewPlayer } from './music/musicService.js';
import { TIMELINE } from './scene/buildings.js';
import { CityScene } from './scene/CityScene.js';
import type { PickHit } from './scene/cityBuilder.js';
import type { LabelKind } from './scene/labels.js';
import type { Artist, Selection, Vec2 } from './types.js';
import { $, toast } from './ui/dom.js';
import { Hud, type HudActions } from './ui/hud.js';
import { DEMO_INPUT, Landing } from './ui/landing.js';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot() {
  const app = $('#app');
  if (!webglAvailable()) {
    $('#fatal').hidden = false;
    return;
  }

  const music = new MusicService();
  const player = new PreviewPlayer();
  const rng = mulberry32(Date.now() & 0xffffffff);
  const discovered = new Set<string>();

  const scene = new CityScene($('#stage'), $('#labels'), {
    onPick: (hit) => handlePick(hit),
    onLabel: (kind, id) => handleLabel(kind, id),
    onBuildProgress: (t) => hud.buildProgress(t, TIMELINE.done),
    onBuildComplete: () => buildComplete(),
  });

  const setPhase = (phase: 'landing' | 'building' | 'city') => {
    store.set({ phase });
    app.dataset.phase = phase;
  };

  /* ---------------- selection ---------------- */

  const select = (sel: Selection, opts: { fly?: boolean } = {}) => {
    const plan = store.get().plan;
    const city = scene.currentCity;
    if (!plan || !city) return;
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
        const a = ARTIST_BY_ID[sel.id];
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
    if (hit.kind === 'building') select({ kind: 'building', id: Number(hit.id) }, { fly: false });
    else select({ kind: hit.kind, id: String(hit.id) }, { fly: true });
  };

  const handleLabel = (kind: LabelKind, id: string) => {
    if (kind === 'district') select({ kind: 'district', genre: id as keyof typeof GENRES }, { fly: true });
    else if (kind === 'mixed') select({ kind: 'district', genre: id.split('|')[0] as keyof typeof GENRES }, { fly: true });
    else select({ kind, id }, { fly: true });
  };

  /* ---------------- actions ---------------- */

  const actions: HudActions = {
    select,
    async listen(artistId) {
      const artist = ARTIST_BY_ID[artistId] ?? store.get().plan?.artists.find((a) => a.id === artistId);
      if (!artist) return;
      hud.setTracks(artistId, 'loading');
      const result = await music.tracksFor(artist);
      hud.setTracks(artistId, result);
      if (result.degraded) toast('Music data unavailable. Showing curated city data.', 'warn');
      const first = result.tracks.find((t) => t.previewUrl);
      if (first) player.play(first);
    },
    playTrack: (t) => player.play(t),
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
      const userArtists = plan.userArtistIds.map((id) => ARTIST_BY_ID[id]).filter((a): a is Artist => !!a);
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
      select(null);
      scene.overview();
    },
    newCity() {
      player.stop();
      select(null);
      actions.toggleList(false);
      setPhase('landing');
      scene.setAmbient(true);
      history.replaceState(null, '', location.pathname);
      landing.show(store.get().inputs);
    },
    async share() {
      const url = `${location.origin}${location.pathname}?city=${encodeURIComponent(store.get().inputs.join(', '))}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied. Anyone who opens it gets the same city.');
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
  };

  const hud = new Hud($('#hud'), actions);
  player.subscribe((s) => hud.renderPlayer(s));

  /* ---------------- building ---------------- */

  const build = (inputs: string[]) => {
    player.stop();
    store.set({ inputs, selection: null, listOpen: false });
    setPhase('building');
    landing.hide();
    hud.showBuild(true);
    hud.buildProgress(0, TIMELINE.done);
    history.replaceState(null, '', `${location.pathname}?city=${encodeURIComponent(inputs.join(', '))}`);
    // Let the overlay paint before generating.
    setTimeout(() => {
      try {
        const taste = resolveTaste(inputs);
        const plan = generateCity(taste);
        store.set({ plan });
        hud.mount(plan);
        hud.setTab(store.get().tab, false);
        scene.setAmbient(false);
        scene.setCity(plan, true);
      } catch (err) {
        console.error(err);
        hud.showBuild(false);
        setPhase('landing');
        landing.show(inputs);
        toast('Something went wrong while building. Please try again.', 'warn');
      }
    }, 80);
  };

  const buildComplete = () => {
    hud.showBuild(false);
    setPhase('city');
    const plan = store.get().plan;
    if (plan?.unknownInputs.length) {
      toast(`We couldn’t find ${plan.unknownInputs.join(', ')} in our catalogue, so they appear as musical interpretations.`, 'warn', 6500);
    }
    const hint = $('#hint');
    hint.classList.add('is-visible');
    setTimeout(() => hint.classList.remove('is-visible'), 7000);
  };

  const landing = new Landing($('#landing'), build);

  // Handy for debugging and automated checks in the browser console.
  (window as unknown as { musicalCity: unknown }).musicalCity = { scene, store, select };

  /* ---------------- start ---------------- */

  const shared = new URLSearchParams(location.search).get('city');
  const sharedInputs = shared ? splitInput(shared) : [];
  if (sharedInputs.length) {
    build(sharedInputs);
  } else {
    const plan = generateCity(resolveTaste(DEMO_INPUT));
    scene.setCity(plan, false);
    scene.setAmbient(true);
    setPhase('landing');
    landing.show();
  }
}

boot();
