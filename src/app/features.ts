import { ARTIST_BY_ID } from '../data/artists.js';
import { crateFor, type CrateRecord } from '../core/crate.js';
import { plaqueFacts, type Tour, type TourStop } from '../core/tours.js';
import { distToPolyline, openCorners } from '../core/cityGenerator.js';
import { Ambience, type AmbienceMix } from '../music/ambience.js';
import { GENRES } from '../data/genres.js';
import { soundtrackArtist, splitInput } from '../core/resolve.js';
import { store } from '../core/store.js';
import { songKey, type Track } from '../music/musicService.js';
import { hashString, mulberry32 } from '../core/random.js';
import type { Nearby } from '../scene/walk.js';
import { MOODS, MOOD_BY_ID, type MoodId } from '../scene/mood.js';
import type { WalkKind } from '../ui/hud.js';
import type { Artist, BuskerPlan, CityPlan, GenreId, Vec2 } from '../types.js';
import { $, ICONS, esc, toast } from '../ui/dom.js';
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
  /** What is currently playing while walking: a venue or a busker. */
  let currentSource: string | null = null;
  let token = 0;
  let lastNear: Nearby | null = null;
  let inside: string | null = null;

  function renderInside() {
    const plan = store.get().plan;
    const v = plan?.venues.find((x) => x.id === inside);
    if (!plan || !v) return;
    const track = ctx.player.current;
    const facts = plaqueFacts(plan, v.id);
    ctx.hud.renderWalk(true, {
      inside: { id: v.id, name: v.name, store: v.type === 'record-store' },
      venue: v.name,
      artist: track ? `${track.title} · ${track.artist}` : v.artistIds.map((id) => artistIn(plan, id)?.name).filter(Boolean).slice(0, 3).join(' · '),
      plaque: facts.length ? facts[Math.floor(performance.now() / 6000) % facts.length] : null,
    });
  }
  ctx.player.subscribe(() => {
    if (inside) renderInside();
  });
  setInterval(() => {
    if (inside) renderInside();
  }, 6000);

  /** Plays songs from every artist at the venue (or the busker's artist), one after another. */
  async function playArtists(key: string, artistIds: string[]) {
    const plan = store.get().plan;
    if (!plan) return;
    const my = ++token;
    const artists = artistIds.map((id) => artistIn(plan, id)).filter((a): a is Artist => !!a && !a.custom);
    const res = await ctx.music.tracksForArtists(artists, artists.length > 1 ? 1 : 3);
    if (my !== token || currentSource !== key) return;
    if (res.tracks.some((t) => t.previewUrl)) ctx.player.playQueue(res.tracks);
  }

  function onNearby(n: Nearby) {
    if (!ctx.scene.walking) return;
    const plan = store.get().plan;
    // Buskers are quieter, so a venue wins unless you're right next to the busker.
    const useBusker = !!n.busker && (!n.venue || n.buskerDistance < 8 || n.buskerDistance * 1.8 < n.venueDistance);
    const key = useBusker ? `busker:${n.busker!.id}` : n.venue ? `venue:${n.venue.id}` : null;
    if (key && key !== currentSource) {
      currentSource = key;
      void playArtists(key, useBusker ? [n.busker!.artistId] : n.venue!.artistIds);
    } else if (!key && currentSource) {
      currentSource = null;
      token++;
      ctx.player.stop();
    }
    if (useBusker) ctx.player.setVolume(Math.max(0.08, 1 - n.buskerDistance / 14));
    else if (n.venue) ctx.player.setVolume(Math.max(0.08, 1 - n.venueDistance / 24));
    const track = ctx.player.current;
    const sourceName = useBusker ? `${n.busker!.name}, busking` : n.venue?.name;
    const ids = useBusker ? [n.busker!.artistId] : n.venue?.artistIds ?? [];
    let plaque: string | null = null;
    if (n.venue && n.venueDistance < 10 && plan) {
      const facts = plaqueFacts(plan, n.venue.id);
      if (facts.length) plaque = facts[Math.floor(performance.now() / 6000) % facts.length];
    }
    lastNear = n;
    ctx.hud.renderWalk(true, {
      street: n.street ? { id: n.street.id, name: n.street.name } : null,
      enter: n.venue && n.venueDistance < 11 ? { id: n.venue.id, name: n.venue.name } : null,
      plaque,
      venue: sourceName,
      artist: track ? `${track.title} · ${track.artist}` : plan ? ids.map((id) => artistIn(plan, id)?.name).filter(Boolean).slice(0, 3).join(' · ') : undefined,
      distance: useBusker ? n.buskerDistance : n.venue ? n.venueDistance : undefined,
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
    if (!ctx.scene.walking || e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') {
      if (inside) api.leaveVenue();
      else api.exit();
    } else if ((e.key === 'Enter' || e.key === 'f' || e.key === 'F') && !inside && lastNear?.venue && lastNear.venueDistance < 11) {
      api.enterVenue(lastNear.venue.id);
    }
  });
  ctx.scene.walk.onDoor = () => api.leaveVenue();

  const api = {
    onNearby,
    enter(kind?: WalkKind, id?: string) {
      const plan = store.get().plan;
      if (!plan) return;
      let at: Vec2 = plan.districts[0]?.center ?? { x: 0, z: 0 };
      if (kind === 'venue') at = plan.venues.find((v) => v.id === id)?.position ?? at;
      if (kind === 'landmark') at = plan.landmarks.find((l) => l.id === id)?.position ?? at;
      if (kind === 'label') at = plan.labels.find((l) => l.id === id)?.position ?? at;
      if (kind === 'busker') at = plan.buskers.find((b) => b.id === id)?.position ?? at;
      ctx.select(null);
      store.set({ listOpen: false });
      ctx.hud.setTab(store.get().tab, false);
      currentSource = null;
      ctx.player.stop();
      ctx.scene.enterWalk(at, at);
      ctx.hud.renderWalk(true);
      toast(window.matchMedia('(pointer: coarse)').matches ? 'Use the stick to walk and drag to look around. Music plays as you pass venues and buskers.' : 'WASD or arrows to walk, drag to look, Shift to run. Music plays as you pass venues and buskers.');
    },
    /** Starts walking (or jumps, if already walking) near a point. */
    enterAt(p: Vec2) {
      if (inside) api.leaveVenue();
      if (ctx.scene.walking) {
        ctx.scene.walk.teleport({ x: p.x + 3, z: p.z + 3 }, p);
        return;
      }
      ctx.select(null);
      store.set({ listOpen: false });
      ctx.hud.setTab(store.get().tab, false);
      currentSource = null;
      ctx.player.stop();
      ctx.scene.enterWalk({ x: p.x + 3, z: p.z + 3 }, p);
      ctx.hud.renderWalk(true);
    },
    /** Walk through a venue's door. Starts walking first if needed. */
    enterVenue(id: string) {
      const plan = store.get().plan;
      const v = plan?.venues.find((x) => x.id === id);
      if (!plan || !v) return;
      if (!ctx.scene.walking) api.enter('venue', id);
      const names = v.artistIds.map((a) => artistIn(plan, a)?.name).filter((n): n is string => !!n);
      ctx.scene.enterInterior(v, names);
      inside = id;
      currentSource = `venue:${id}`;
      ctx.player.setVolume(0.95);
      void playArtists(currentSource, v.artistIds);
      renderInside();
    },
    leaveVenue() {
      if (!inside) return;
      inside = null;
      ctx.scene.exitInterior();
      // Let the street decide what plays next.
      currentSource = null;
      token++;
      ctx.player.stop();
      ctx.hud.renderWalk(true);
    },
    get insideVenue() {
      return inside;
    },
    exit() {
      if (!ctx.scene.walking) return;
      inside = null;
      token++;
      currentSource = null;
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

/* ------------------------------------------------------------------ */
/* Crate digging                                                       */
/* ------------------------------------------------------------------ */

const SLEEVE_PATTERNS = ['stripes', 'circle', 'grid', 'split', 'dots', 'type'] as const;
const SLEEVE_INKS = ['#f2ead8', '#ff4f79', '#ffd23f', '#3ea0ff', '#59cd90', '#c9b6ff', '#ff7a3d', '#111111'];
const SLEEVE_PAPERS = ['#141414', '#1d2b4a', '#4a1020', '#e9dfc8', '#0f3d2e', '#2b1a3d', '#b8321c', '#d9b43c', '#5b6770'];

export function createCrateController(ctx: AppContext, addArtist: (id: string) => void) {
  const modal = $('#crate-modal');
  const stage = $('#crate-stage');
  const now = $('#crate-now');
  const count = $('#crate-count');
  const tabs = $('#crate-tabs');
  let records: CrateRecord[] = [];
  let sleeves: HTMLElement[] = [];
  let cur = 0;
  let timer = 0;
  let token = 0;
  let playing: Track | null = null;
  let status = '';
  const art = new Map<string, string>();

  const close = () => {
    modal.hidden = true;
    token++;
    window.clearTimeout(timer);
  };

  modal.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === modal || t.closest('[data-close]')) close();
    const act = t.closest<HTMLElement>('[data-crate]');
    if (!act) return;
    const r = records[cur];
    if (act.dataset.crate === 'artist' && r) {
      close();
      ctx.select({ kind: 'artist', id: r.artist.id }, { fly: true });
    } else if (act.dataset.crate === 'add' && r) {
      close();
      addArtist(r.artist.id);
    } else if (act.dataset.crate === 'toggle') {
      if (playing) ctx.player.toggle();
      else void playCurrent();
    } else if (act.dataset.crate === 'tab') {
      go(Number(act.dataset.index));
    }
  });
  $('#crate-prev').addEventListener('click', () => go(cur - 1));
  $('#crate-next').addEventListener('click', () => go(cur + 1));
  window.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(cur + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(cur - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === ' ') ctx.player.toggle();
    else return;
    e.preventDefault();
  });
  let wheel = 0;
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      wheel += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(wheel) > 70) {
        go(cur + Math.sign(wheel));
        wheel = 0;
      }
    },
    { passive: false },
  );
  let drag: { x: number; y: number; moved: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY, moved: false }));
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = e.clientX - drag.x + (drag.y - e.clientY);
    if (Math.abs(d) > 45) {
      go(cur + (d < 0 ? 1 : -1));
      drag = { x: e.clientX, y: e.clientY, moved: true };
    }
  });
  stage.addEventListener('pointerup', (e) => {
    const wasDrag = drag?.moved;
    drag = null;
    if (wasDrag) return;
    const s = (e.target as HTMLElement).closest<HTMLElement>('.sleeve');
    if (!s) return;
    const i = Number(s.dataset.index);
    if (i === cur) {
      if (playing) ctx.player.toggle();
      else void playCurrent();
    } else go(i);
  });
  ctx.player.subscribe((s) => {
    if (modal.hidden) return;
    const st = s.status === 'idle' ? '' : s.status;
    if (st !== status) {
      status = st;
      renderNow();
    }
  });

  function sleeveHtml(r: CrateRecord, i: number) {
    const g = GENRES[r.genre];
    const h = hashString(r.artist.id + r.title);
    const c1 = g.style.neon[h % g.style.neon.length];
    const c2 = SLEEVE_INKS[(h >>> 4) % SLEEVE_INKS.length];
    const c3 = SLEEVE_PAPERS[(h >>> 8) % SLEEVE_PAPERS.length];
    const pattern = SLEEVE_PATTERNS[(h >>> 12) % SLEEVE_PATTERNS.length];
    const img = art.get(r.artist.id);
    return `<div class="sleeve sleeve--${pattern}" data-index="${i}" style="--c1:${c1};--c2:${c2};--c3:${c3}">
      ${img ? `<img src="${esc(img)}" alt="" draggable="false">` : `<span class="sleeve__art" aria-hidden="true"></span><span class="sleeve__text"><strong>${esc(r.artist.name)}</strong><em>${esc(r.title)}</em></span>`}
      <span class="sleeve__edge" aria-hidden="true"></span>
    </div>`;
  }

  function render() {
    stage.innerHTML = `<div class="crate__deck">${records.map(sleeveHtml).join('')}</div><div class="crate__box" aria-hidden="true"><span>${esc($('#crate-store').textContent ?? '')}</span></div>`;
    sleeves = [...stage.querySelectorAll<HTMLElement>('.sleeve')];
    const firsts = new Map<GenreId, number>();
    records.forEach((r, i) => firsts.has(r.genre) || firsts.set(r.genre, i));
    tabs.innerHTML = [...firsts.entries()]
      .map(([g, i]) => `<button type="button" class="crate__tab" data-crate="tab" data-index="${i}" style="--c:${GENRES[g].style.neon[0]}">${esc(GENRES[g].name)}</button>`)
      .join('');
    layout();
  }

  function layout() {
    sleeves.forEach((el, i) => {
      const d = i - cur;
      el.style.setProperty('--d', String(d));
      el.classList.toggle('is-front', d === 0);
      el.classList.toggle('is-past', d < 0);
      el.classList.toggle('is-hidden', d < -2 || d > 6);
      el.style.zIndex = String(100 - Math.abs(d) - (d < 0 ? 50 : 0));
    });
    count.textContent = records.length ? `${cur + 1} / ${records.length}` : '';
    tabs.querySelectorAll<HTMLElement>('.crate__tab').forEach((t) => t.classList.toggle('is-on', records[Number(t.dataset.index)]?.genre === records[cur]?.genre));
    renderNow();
  }

  function renderNow() {
    const r = records[cur];
    if (!r) {
      now.innerHTML = '<p class="tracks__loading">This crate is empty.</p>';
      return;
    }
    const isThis = playing && ctx.player.current?.previewUrl === playing.previewUrl;
    const line = !playing
      ? '<span class="crate__loading">Cueing a preview…</span>'
      : `<span class="crate__eq ${status === 'playing' && isThis ? 'is-on' : ''}" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(playing.title)} · ${esc(playing.artist)}`;
    now.innerHTML = `<div class="crate__meta">
        <strong>${esc(r.title)}</strong> <span>(${r.year})</span>
        <small>${esc(r.artist.name)} · ${esc(GENRES[r.genre].name)}${r.inCity ? ' · in your city' : ''}</small>
        <p class="crate__track">${line}</p>
      </div>
      <div class="crate__actions">
        <button type="button" class="btn btn--primary btn--sm" data-crate="toggle">${status === 'playing' && isThis ? `${ICONS.pause} Pause` : `${ICONS.play} Play`}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-crate="artist">About the artist</button>
        ${r.inCity ? '' : `<button type="button" class="btn btn--gold btn--sm" data-crate="add">+ Add to city</button>`}
      </div>`;
  }

  function go(i: number) {
    if (!records.length) return;
    const next = Math.max(0, Math.min(records.length - 1, i));
    if (next === cur && sleeves.length) return;
    cur = next;
    playing = null;
    layout();
    window.clearTimeout(timer);
    // Wait until you stop flipping before loading the preview.
    timer = window.setTimeout(() => void playCurrent(), 420);
  }

  async function playCurrent() {
    const r = records[cur];
    if (!r) return;
    const my = ++token;
    const res = await ctx.music.tracksFor(r.artist);
    if (my !== token || modal.hidden) return;
    const withPreview = res.tracks.filter((t) => t.previewUrl);
    const album = songKey(r.title);
    const fromAlbum = withPreview.filter((t) => t.album && songKey(t.album).startsWith(album));
    const queue = [...fromAlbum, ...withPreview.filter((t) => !fromAlbum.includes(t))];
    const cover = fromAlbum.find((t) => t.artworkUrl)?.artworkUrl;
    if (cover && !art.has(r.artist.id)) {
      art.set(r.artist.id, cover.replace(/\/\d+x\d+bb\./, '/600x600bb.'));
      const el = sleeves[cur];
      if (el) el.outerHTML = sleeveHtml(r, cur);
      sleeves = [...stage.querySelectorAll<HTMLElement>('.sleeve')];
      layout();
    }
    if (!queue.length) {
      playing = { title: 'No preview available', artist: r.artist.name };
      renderNow();
      return;
    }
    playing = queue[0];
    ctx.player.playQueue(queue);
    renderNow();
  }

  return {
    open(venueId: string, focusArtistId?: string) {
      const plan = store.get().plan;
      const v = plan?.venues.find((x) => x.id === venueId);
      if (!plan || !v) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      $('#crate-store').textContent = v.name;
      $('#crate-title').textContent = 'Dig the crates';
      records = crateFor(plan, venueId);
      cur = 0;
      const focus = focusArtistId ? ARTIST_BY_ID[focusArtistId] ?? plan.artists.find((a) => a.id === focusArtistId) : undefined;
      if (focus?.album.title) {
        let i = records.findIndex((r) => r.artist.id === focus.id);
        if (i === -1) {
          // Staff pick: the record you came in for sits at the front.
          records.unshift({ artist: focus, title: focus.album.title, year: focus.album.year, genre: focus.genres[0] ?? v.genres[0], inCity: plan.artists.some((a) => a.id === focus.id) });
          i = 0;
        }
        cur = i;
      }
      playing = null;
      status = '';
      modal.hidden = false;
      render();
      stage.focus();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void playCurrent(), 300);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mood                                                                */
/* ------------------------------------------------------------------ */

export function createMoodController(ctx: AppContext) {
  const btn = $('#mood-btn');
  const menu = $('#mood-menu');
  const options = $('#mood-options');
  let token = 0;
  options.innerHTML = MOODS.map(
    (m) => `<button type="button" class="mood__opt" data-action="mood" data-mood="${m.id}" aria-pressed="false">
      <span class="mood__swatch" style="background:${m.swatch}" aria-hidden="true"></span>
      <span class="mood__text"><strong>${esc(m.name)}</strong><small>${esc(m.blurb)}</small></span></button>`,
  ).join('');

  const open = (on: boolean) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  };
  btn.addEventListener('click', () => open(menu.hidden === true));
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!menu.hidden && !menu.contains(t) && !btn.contains(t)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') open(false);
  });

  function reflect(id: MoodId) {
    const m = MOOD_BY_ID[id];
    $('#mood-swatch').style.background = m.swatch;
    $('#mood-name').textContent = id === 'night' ? 'Mood' : m.name;
    options.querySelectorAll<HTMLElement>('.mood__opt').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.mood === id)));
  }

  /** Artists in the city that fit the mood: yours first, then the best genre matches. */
  function artistsFor(id: MoodId): Artist[] {
    const plan = store.get().plan;
    if (!plan) return [];
    const m = MOOD_BY_ID[id];
    const rnd = mulberry32(Date.now() & 0xffff);
    const scored = plan.artists
      .filter((a) => !a.custom)
      .map((a) => {
        const gi = m.genres.length ? Math.min(...a.genres.map((g, k) => (m.genres.includes(g) ? m.genres.indexOf(g) + k * 2 : 99))) : 0;
        return { a, s: gi >= 99 ? -1 : (plan.userArtistIds.includes(a.id) ? 4 : 0) + 3 - gi * 0.3 + rnd() * 2.5 };
      })
      .filter((x) => x.s >= 0)
      .sort((x, y) => y.s - x.s);
    return scored.slice(0, 6).map((x) => x.a);
  }

  async function play(id: MoodId) {
    const artists = artistsFor(id);
    if (!artists.length) {
      toast(`Nothing in your city fits ${MOOD_BY_ID[id].name} yet. Try Discover.`);
      return;
    }
    const my = ++token;
    toast(`${MOOD_BY_ID[id].name}: playing ${artists.slice(0, 3).map((a) => a.name).join(', ')}${artists.length > 3 ? ' and more' : ''}.`);
    const res = await ctx.music.tracksForArtists(artists, 1);
    if (my !== token) return;
    if (res.tracks.some((t) => t.previewUrl)) ctx.player.playQueue(res.tracks);
    else if (res.degraded) toast('Music data unavailable right now, but the mood is set.', 'warn');
  }

  return {
    get current(): MoodId {
      return ctx.scene.moodId;
    },
    set(id: MoodId, opts: { play?: boolean; instant?: boolean } = {}) {
      if (!(id in MOOD_BY_ID)) id = 'night';
      ctx.scene.setMood(id, opts.instant);
      reflect(id);
      open(false);
      if (opts.play) void play(id);
    },
    play: () => play(ctx.scene.moodId),
  };
}

/* ------------------------------------------------------------------ */
/* Guided tours                                                        */
/* ------------------------------------------------------------------ */

export function createTourController(ctx: AppContext) {
  let tour: Tour | null = null;
  let index = 0;
  let timer = 0;
  let token = 0;

  async function playStop(stop: TourStop) {
    const plan = store.get().plan;
    if (!plan) return;
    const my = ++token;
    let tracks: Track[] = [];
    if (stop.song) {
      const artist = soundtrackArtist(stop.song);
      const res = await ctx.music.tracksForSongs(`tour:${stop.id}`, [{ artist, title: stop.song.title.replace(/[“”]/g, '') }]);
      tracks = res.tracks;
    } else if (stop.artistId) {
      const artist = artistIn(plan, stop.artistId);
      if (artist && !artist.custom) tracks = (await ctx.music.tracksFor(artist)).tracks;
    }
    if (my !== token || !tour) return;
    const first = tracks.find((t) => t.previewUrl);
    if (first) ctx.player.play(first);
  }

  function show() {
    const plan = store.get().plan;
    const city = ctx.scene.currentCity;
    if (!tour || !plan || !city) return;
    const stop = tour.stops[index];
    const dist = stop.kind === 'label' ? 170 : stop.kind === 'home' ? 42 : 58;
    ctx.scene.focus(stop.position, dist, stop.kind === 'label' ? 20 : 4, 2.2);
    city.select(stop.position, stop.kind === 'landmark' ? '#ffcf6b' : stop.kind === 'home' ? '#8ff0c8' : '#c9b6ff', stop.kind === 'label' ? 9 : 7);
    ctx.hud.renderTour({ name: tour.name, index, total: tour.stops.length, title: stop.title, sub: stop.sub, caption: stop.caption, auto: true });
    void playStop(stop);
    if (stop.kind === 'landmark') stampLandmark(ctx, stop.id);
    window.clearTimeout(timer);
    // Move on by itself after a while; the buttons skip ahead or back.
    timer = window.setTimeout(() => api.step(1), 24000);
  }

  const api = {
    get active() {
      return !!tour;
    },
    start(id: string) {
      const t = ctx.hud.tours.find((x) => x.id === id);
      if (!t || !t.stops.length) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      ctx.select(null);
      store.set({ listOpen: false });
      ctx.hud.setTab(store.get().tab, false);
      tour = t;
      index = 0;
      show();
    },
    step(delta: number) {
      if (!tour) return;
      const next = index + delta;
      if (next >= tour.stops.length) {
        toast(`That’s the end of ${tour.name}. Thanks for coming along.`);
        api.end();
        return;
      }
      index = Math.max(0, next);
      show();
    },
    end() {
      if (!tour) return;
      tour = null;
      token++;
      window.clearTimeout(timer);
      ctx.scene.currentCity?.select(null);
      ctx.hud.renderTour(null);
    },
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Your own street performance                                         */
/* ------------------------------------------------------------------ */

export function createPerformController(ctx: AppContext) {
  let live: { corner: string; instrument: string; started: number; crowd: number; tips: number; queue: Track[]; peak: number } | null = null;
  let loop = 0;

  const userArtists = (plan: CityPlan) => plan.userArtistIds.map((id) => artistIn(plan, id)).filter((a): a is Artist => !!a && !a.custom);

  function cornerName(plan: CityPlan, p: Vec2): string {
    const near = (axis: 'x' | 'z') =>
      plan.streets
        .filter((s) => s.axis === axis && (axis === 'x' ? p.x : p.z) >= s.from - 2 && (axis === 'x' ? p.x : p.z) <= s.to + 2)
        .sort((a, b) => Math.abs(a.c - (axis === 'x' ? p.z : p.x)) - Math.abs(b.c - (axis === 'x' ? p.z : p.x)))[0];
    const a = near('x');
    const b = near('z');
    return a && b ? `Corner of ${a.name} & ${b.name}` : 'A street corner in your city';
  }

  function render() {
    if (!live) return;
    const cur = ctx.player.current;
    ctx.hud.renderPerform({ phase: 'live', corner: live.corner, crowd: Math.round(live.crowd), tips: live.tips, song: cur ? `${cur.title} · ${cur.artist}` : '', instrument: live.instrument });
  }

  function tick() {
    if (!live) return;
    const t = (performance.now() - live.started) / 1000;
    const playing = ctx.player.playing;
    // People drift over while the music plays and wander off when it stops.
    const target = playing ? Math.min(85, 50 * (1 - Math.exp(-t / 35)) + 32 * (1 - Math.exp(-t / 140))) : live.crowd * 0.9;
    live.crowd += (target - live.crowd) * 0.25;
    live.peak = Math.max(live.peak, live.crowd);
    if (playing && Math.random() < live.crowd * 0.012) live.tips += [0.25, 0.25, 0.5, 1, 1, 2, 5][Math.floor(Math.random() * 7)];
    ctx.scene.currentCity?.setAudience(live.crowd);
    // Keep the set going when the queue runs out.
    if (!ctx.player.current && live.queue.length && t > 4) ctx.player.playQueue(live.queue);
    render();
  }

  const api = {
    get active() {
      return !!live;
    },
    open() {
      const plan = store.get().plan;
      if (!plan) return;
      if (live) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      ctx.select(null);
      ctx.hud.renderPerform({ phase: 'setup', artists: userArtists(plan).map((a) => ({ id: a.id, name: a.name })) });
    },
    async start() {
      const plan = store.get().plan;
      const city = ctx.scene.currentCity;
      if (!plan || !city) return;
      const target = ctx.scene.lookTarget();
      const corner = openCorners(plan).sort((a, b) => Math.hypot(a.p.x - target.x, a.p.z - target.z) - Math.hypot(b.p.x - target.x, b.p.z - target.z))[0];
      if (!corner) {
        toast('Couldn’t find a free corner here. Try looking at another part of town.');
        return;
      }
      const choice = ctx.hud.performChoice;
      const chosen = choice.artistId ? artistIn(plan, choice.artistId) : undefined;
      const artists = chosen ? [chosen] : userArtists(plan).length ? userArtists(plan) : plan.artists.filter((a) => !a.custom).slice(0, 6);
      const genre = plan.districts.slice().sort((a, b) => Math.hypot(a.center.x - corner.p.x, a.center.z - corner.p.z) - Math.hypot(b.center.x - corner.p.x, b.center.z - corner.p.z))[0]?.genre ?? plan.districts[0].genre;
      const instrument = (choice.instrument || 'guitar') as BuskerPlan['instrument'];
      city.startPerformance({ id: 'you', name: 'You', position: corner.p, rotation: corner.rot, artistId: artists[0]?.id ?? '', genre, instrument });
      ctx.scene.focus(corner.p, 24, 1.5, 1.6);
      live = { corner: cornerName(plan, corner.p), instrument: INSTRUMENT_NAMES[instrument] ?? instrument, started: performance.now(), crowd: 0, tips: 0, queue: [], peak: 0 };
      render();
      window.clearInterval(loop);
      loop = window.setInterval(tick, 1000);
      const res = await ctx.music.tracksForArtists(artists, chosen ? 6 : 1);
      if (!live) return;
      live.queue = res.tracks.filter((t) => t.previewUrl);
      if (live.queue.length) ctx.player.playQueue(live.queue);
      else toast('No previews available right now, but the crowd doesn’t mind.', 'warn');
    },
    next() {
      if (!live) return;
      if (!ctx.player.next() && live.queue.length) ctx.player.playQueue(live.queue);
    },
    end() {
      window.clearInterval(loop);
      ctx.scene.currentCity?.stopPerformance();
      if (live) {
        ctx.player.stop();
        toast(`Set over. ${Math.round(live.peak)} people stopped to listen and you made $${live.tips.toFixed(2)}.`);
      }
      live = null;
      ctx.hud.renderPerform(null);
    },
  };
  return api;
}

const INSTRUMENT_NAMES: Record<string, string> = {
  guitar: 'Acoustic guitar',
  bass: 'Bass guitar',
  sax: 'Saxophone',
  trumpet: 'Trumpet',
  keys: 'Keyboard',
  drums: 'Street drums',
  turntables: 'Portable decks',
  mic: 'Vocals',
  violin: 'Violin',
};

/* ------------------------------------------------------------------ */
/* Visualiser                                                          */
/* ------------------------------------------------------------------ */

export function createVisualiserController(ctx: AppContext, startMusic: () => void) {
  const BANDS = 16;
  let prev = new Array<number>(BANDS).fill(0);
  let silentFor = 0;

  function levels(): number[] {
    let real = ctx.player.levels(BANDS);
    const playing = ctx.player.playing;
    const sum = real.reduce((a, b) => a + b, 0);
    silentFor = playing && sum === 0 ? silentFor + 1 : 0;
    if (playing && silentFor > 20) {
      // Audio can't be analysed (e.g. no CORS): fall back to a steady groove.
      const t = performance.now() / 1000;
      const beat = Math.pow(1 - ((t * 2.07) % 1), 3);
      real = real.map((_, b) => Math.max(0, beat * (1 - b / BANDS) * 0.9 + 0.25 * Math.sin(t * (2 + b * 0.7) + b) * 0.5 + 0.1));
    }
    prev = real.map((v, i) => Math.max(v, prev[i] * 0.86));
    return prev;
  }

  const api = {
    on: false,
    toggle() {
      if (api.on) {
        api.on = false;
        ctx.scene.setVisualiser(null);
        ctx.hud.setVisualiser(false);
        return;
      }
      ctx.player.enableAnalysis();
      api.on = true;
      prev = new Array<number>(BANDS).fill(0);
      ctx.scene.setVisualiser(levels);
      ctx.hud.setVisualiser(true);
      ctx.scene.overview(1.4);
      if (!ctx.player.current) {
        toast('Visualiser on. Playing your city so it has something to move to.');
        startMusic();
      } else toast('Visualiser on. The skyline follows the music, bass on the left, treble on the right.');
    },
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* City sounds                                                         */
/* ------------------------------------------------------------------ */

export function createAmbienceController(ctx: AppContext) {
  const KEY = 'musical-city:ambience';
  const amb = new Ambience();
  let on = false;
  try {
    on = localStorage.getItem(KEY) === '1';
  } catch {
    /* storage unavailable */
  }

  function mix(): AmbienceMix | null {
    const plan = store.get().plan;
    if (!plan) return null;
    const l = ctx.scene.listener();
    const near = Math.max(0, Math.min(1, 1 - (l.height - 2) / 160));
    let venueD = Infinity;
    for (const v of plan.venues) venueD = Math.min(venueD, Math.hypot(v.position.x - l.x, v.position.z - l.z));
    const riverD = distToPolyline({ x: l.x, z: l.z }, plan.river.points).d;
    let parkD = Infinity;
    for (const b of plan.blocks) if (b.use === 'park') parkD = Math.min(parkD, Math.hypot(b.center.x - l.x, b.center.z - l.z));
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return {
      traffic: 0.12 + 0.6 * near,
      crowd: l.inside ? 1 : 0.04 + clamp(1 - venueD / 32) * 0.7 * near,
      rain: l.rain,
      wind: clamp((l.height - 30) / 220) * 0.8 + (l.walking ? 0.05 : 0),
      water: clamp(1 - riverD / 28) * near * 0.8,
      crickets: l.night ? clamp(1 - parkD / 26) * near : 0,
      inside: l.inside ? 1 : 0,
      duck: ctx.player.playing,
    };
  }

  window.setInterval(() => {
    if (!on || !amb.running) return;
    const m = mix();
    if (m) amb.set(m);
  }, 250);

  const api = {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      try {
        localStorage.setItem(KEY, on ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      if (on) {
        if (!amb.start()) {
          toast('This browser can’t play city sounds.', 'warn');
          on = false;
        } else toast('City sounds on: traffic, crowds near venues, rain, the river and crickets in the parks.');
      } else amb.stop();
      ctx.hud.setAmbience(on);
    },
  };

  // Browsers only allow audio after a click, so resume on the first one.
  if (on) {
    ctx.hud.setAmbience(true);
    const resume = () => {
      window.removeEventListener('pointerdown', resume);
      if (on) amb.start();
    };
    window.addEventListener('pointerdown', resume);
  }
  return api;
}
