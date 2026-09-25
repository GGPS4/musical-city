import { ARTIST_BY_ID } from '../data/artists.js';
import { GENRES } from '../data/genres.js';
import { soundtrackArtist, splitInput } from '../core/resolve.js';
import { store } from '../core/store.js';
import type { Track } from '../music/musicService.js';
import type { Nearby } from '../scene/walk.js';
import type { Artist, CityPlan, Vec2 } from '../types.js';
import { $, toast } from '../ui/dom.js';
import { composePoster } from '../ui/poster.js';
import type { AppContext } from './context.js';

const artistIn = (plan: CityPlan, id: string): Artist | undefined => ARTIST_BY_ID[id] ?? plan.artists.find((a) => a.id === id);

/* ------------------------------------------------------------------ */
/* Gig night                                                           */
/* ------------------------------------------------------------------ */

export function createGigController(ctx: AppContext) {
  let lineup: Artist[] = [];
  let soundtrack: { artist: Artist; title: string }[] | null = null;
  let title = '';
  let place = '';
  let fireworks = false;

  async function playAct(act: number) {
    const plan = store.get().plan;
    if (!plan) return;
    let track: Track | undefined;
    if (soundtrack) {
      const key = `gig:${store.get().gig?.id}`;
      const res = await ctx.music.tracksForSongs(key, soundtrack);
      const withPreview = res.tracks.filter((t) => t.previewUrl);
      track = withPreview[act % Math.max(1, withPreview.length)];
    } else if (lineup[act]) {
      const res = await ctx.music.tracksFor(lineup[act]);
      const list = res.tracks.filter((t) => t.previewUrl);
      if (list.length) {
        ctx.player.playQueue(list);
        return;
      }
    }
    if (track) ctx.player.play(track);
    else toast('No preview available for this act. The show goes on.');
  }

  function render() {
    const gig = store.get().gig;
    const names = soundtrack ? soundtrack.map((s) => `${s.title} (${s.artist.name})`) : lineup.map((a) => a.name);
    ctx.hud.renderGig(gig ? { title, place, lineup: names, act: gig.act, fireworks } : null);
  }

  return {
    start(kind: 'venue' | 'landmark', id: string) {
      const plan = store.get().plan;
      const city = ctx.scene.currentCity;
      if (!plan || !city) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      let pos: Vec2;
      let color: string;
      let height: number;
      if (kind === 'venue') {
        const v = plan.venues.find((x) => x.id === id);
        if (!v) return;
        lineup = v.artistIds.map((a) => artistIn(plan, a)).filter((a): a is Artist => !!a && !a.custom).slice(0, 4);
        soundtrack = null;
        title = v.name;
        place = `${v.genres.map((g) => GENRES[g].name).join(' / ')} night`;
        pos = v.position;
        color = v.neon;
        height = city.venues.get(v.id)?.height ?? 4;
        fireworks = false;
      } else {
        const l = plan.landmarks.find((x) => x.id === id);
        if (!l) return;
        pos = l.position;
        height = city.landmarks.get(l.id)?.height ?? 6;
        color = l.type === 'historical' ? '#ffcf6b' : GENRES[l.genres[0]].style.neon[0];
        title = l.name;
        fireworks = true;
        if (l.soundtrack) {
          soundtrack = l.soundtrack.songs.map((s) => ({ artist: soundtrackArtist(s), title: s.title.replace(/[“”]/g, '') }));
          lineup = [];
          place = l.soundtrack.album ? `Playing ${l.soundtrack.album.title}` : 'The landmark soundtrack';
        } else {
          soundtrack = null;
          lineup = plan.artists.filter((a) => a.genres[0] === l.genres[0] && !a.custom).slice(0, 4);
          place = `${GENRES[l.genres[0]].name} all-nighter`;
        }
      }
      if (!lineup.length && !soundtrack?.length) {
        toast('Nobody is booked to play here yet.');
        return;
      }
      store.set({ gig: { kind, id, act: 0 } });
      city.startGig(pos, color, height, fireworks);
      ctx.scene.focus(pos, 58, 6, 1.4);
      render();
      void playAct(0);
    },
    next() {
      const gig = store.get().gig;
      if (!gig) return;
      const count = soundtrack ? soundtrack.length : lineup.length;
      const act = (gig.act + 1) % Math.max(1, count);
      store.set({ gig: { ...gig, act } });
      render();
      void playAct(act);
    },
    end() {
      if (!store.get().gig) return;
      ctx.scene.currentCity?.stopGig();
      store.set({ gig: null });
      ctx.player.stop();
      render();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Walking                                                             */
/* ------------------------------------------------------------------ */

export function createWalkController(ctx: AppContext) {
  let currentVenue: string | null = null;
  let token = 0;

  /** Plays songs from every artist at the venue, one after another. */
  async function playVenue(venueId: string) {
    const plan = store.get().plan;
    const v = plan?.venues.find((x) => x.id === venueId);
    if (!plan || !v) return;
    const my = ++token;
    const artists = v.artistIds.map((id) => artistIn(plan, id)).filter((a): a is Artist => !!a && !a.custom);
    const res = await ctx.music.tracksForArtists(artists, 1);
    if (my !== token) return;
    if (res.tracks.some((t) => t.previewUrl)) ctx.player.playQueue(res.tracks);
  }

  function onNearby(n: Nearby) {
    if (!ctx.scene.walking) return;
    const plan = store.get().plan;
    if (n.venue && n.venue.id !== currentVenue) {
      currentVenue = n.venue.id;
      void playVenue(n.venue.id);
    } else if (!n.venue && currentVenue) {
      currentVenue = null;
      token++;
      ctx.player.stop();
    }
    if (n.venue) ctx.player.setVolume(Math.max(0.08, 1 - n.venueDistance / 24));
    const track = ctx.player.current;
    const artist = n.venue && plan ? n.venue.artistIds.map((id) => artistIn(plan, id)).find((a) => a && track && a.name && track.artist.toLowerCase().includes(a.name.toLowerCase().replace(/^the /, ''))) : undefined;
    ctx.hud.renderWalk(true, {
      venue: n.venue?.name,
      artist: track
        ? `${track.title} · ${track.artist}`
        : artist?.name ?? (n.venue && plan ? n.venue.artistIds.map((id) => artistIn(plan, id)?.name).filter(Boolean).slice(0, 3).join(' · ') : undefined),
      distance: n.venue ? n.venueDistance : undefined,
      landmark: n.landmark ? { id: n.landmark.id, name: n.landmark.name } : null,
    });
  }

  // Touch joystick for walking on phones and tablets.
  const stick = $('#walk-stick');
  const knob = stick.querySelector('i') as HTMLElement;
  let origin: { x: number; y: number; id: number } | null = null;
  stick.addEventListener('pointerdown', (e) => {
    origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    stick.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  stick.addEventListener('pointermove', (e) => {
    if (!origin || e.pointerId !== origin.id) return;
    const dx = Math.max(-40, Math.min(40, e.clientX - origin.x));
    const dy = Math.max(-40, Math.min(40, e.clientY - origin.y));
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    ctx.scene.walk.setStick(dx / 40, dy / 40);
  });
  const release = () => {
    origin = null;
    knob.style.transform = '';
    ctx.scene.walk.setStick(0, 0);
  };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctx.scene.walking) api.exit();
  });

  const api = {
    onNearby,
    enter(kind?: 'venue' | 'landmark', id?: string) {
      const plan = store.get().plan;
      if (!plan) return;
      let at: Vec2 = plan.districts[0]?.center ?? { x: 0, z: 0 };
      if (kind === 'venue') at = plan.venues.find((v) => v.id === id)?.position ?? at;
      if (kind === 'landmark') at = plan.landmarks.find((l) => l.id === id)?.position ?? at;
      ctx.select(null);
      store.set({ listOpen: false });
      ctx.hud.setTab(store.get().tab, false);
      currentVenue = null;
      ctx.player.stop();
      ctx.scene.enterWalk(at, at);
      ctx.hud.renderWalk(true);
      toast(window.matchMedia('(pointer: coarse)').matches ? 'Use the stick to walk and drag to look around. Music plays as you pass venues.' : 'WASD or arrows to walk, drag to look. Music plays as you pass venues.');
    },
    exit() {
      if (!ctx.scene.walking) return;
      token++;
      currentVenue = null;
      ctx.player.stop();
      ctx.player.setVolume(0.8);
      ctx.scene.exitWalk();
      ctx.hud.renderWalk(false);
    },
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Passport                                                            */
/* ------------------------------------------------------------------ */

export function stampLandmark(ctx: AppContext, landmarkId: string) {
  const plan = store.get().plan;
  const l = plan?.landmarks.find((x) => x.id === landmarkId);
  if (!l || l.type !== 'historical') return;
  const res = ctx.passport.stamp(landmarkId);
  if (!res.isNew) return;
  toast(`Passport stamped: ${l.name} (${ctx.passport.count}/${ctx.passport.total})`);
  for (const scene of res.completed) setTimeout(() => toast(`★ Scene complete: ${scene.name}`), 2600);
  ctx.hud.refreshInfo();
  if (store.get().tab === 'passport' && store.get().listOpen) ctx.hud.renderList('passport');
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

export function createCompareController(onBuild: (yours: string[], friend: { name: string; inputs: string[] }, youName: string) => void) {
  const modal = $('#compare-modal');
  const form = $('#compare-form') as HTMLFormElement;
  const you = $('#cmp-you') as HTMLInputElement;
  const them = $('#cmp-them') as HTMLInputElement;
  const taste = $('#cmp-taste') as HTMLTextAreaElement;
  const error = $('#cmp-error');

  const close = () => (modal.hidden = true);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || (e.target as HTMLElement).closest('[data-close]')) close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let raw = taste.value.trim();
    // Accept a pasted Musical City link.
    const m = raw.match(/[?&]city=([^&\s]+)/);
    if (m) raw = decodeURIComponent(m[1].replace(/\+/g, ' '));
    const inputs = splitInput(raw);
    if (!inputs.length) {
      error.textContent = 'Add at least one of their artists or genres, or paste their city link.';
      return;
    }
    error.textContent = '';
    close();
    onBuild(store.get().inputs, { name: them.value.trim() || 'Friend', inputs }, you.value.trim() || 'You');
  });

  return {
    open() {
      error.textContent = '';
      modal.hidden = false;
      setTimeout(() => (store.get().compare ? taste : them).focus(), 50);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Poster                                                              */
/* ------------------------------------------------------------------ */

export function createPosterController(ctx: AppContext, shareUrl: () => string, builtFrom: () => string[]) {
  const modal = $('#poster-modal');
  const preview = $('#poster-preview');
  const download = $('#poster-download') as HTMLAnchorElement;
  let lastUrl = '';
  modal.addEventListener('click', (e) => {
    if (e.target === modal || (e.target as HTMLElement).closest('[data-close]')) modal.hidden = true;
  });

  return {
    async open() {
      const plan = store.get().plan;
      if (!plan) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      modal.hidden = false;
      preview.innerHTML = '<p class="tracks__loading">Rendering your poster…</p>';
      download.setAttribute('aria-disabled', 'true');
      await new Promise((r) => setTimeout(r, 50));
      const shot = ctx.scene.capturePoster(2048);
      if (!shot) return;
      const top = plan.districts.slice(0, 2).map((d) => GENRES[d.genre].name);
      const canvas = await composePoster({
        plan,
        image: shot.image,
        project: shot.project,
        inputs: builtFrom(),
        subtitle: top.length ? `A city of ${top.join(' & ')}` : 'Your city',
        compare: store.get().compare,
        url: shareUrl().replace(/^https?:\/\//, '').split('?')[0],
      });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) {
        preview.innerHTML = '<p class="form-error">Couldn’t create the image in this browser.</p>';
        return;
      }
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      preview.innerHTML = `<img src="${lastUrl}" alt="Poster of your musical city">`;
      download.href = lastUrl;
      download.download = `musical-city-${(store.get().inputs[0] ?? 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      download.removeAttribute('aria-disabled');
    },
  };
}
