import { ARTIST_BY_ID } from '../data/artists.js';
import { crateFor, type CrateRecord } from '../core/crate.js';
import { GENRES } from '../data/genres.js';
import { soundtrackArtist, splitInput } from '../core/resolve.js';
import { store } from '../core/store.js';
import { songKey, type Track } from '../music/musicService.js';
import { hashString, mulberry32 } from '../core/random.js';
import type { Nearby } from '../scene/walk.js';
import { MOODS, MOOD_BY_ID, type MoodId } from '../scene/mood.js';
import type { WalkKind } from '../ui/hud.js';
import type { Artist, CityPlan, GenreId, Vec2 } from '../types.js';
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
    ctx.hud.renderWalk(true, {
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
    if (e.key === 'Escape' && ctx.scene.walking) api.exit();
  });

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
    exit() {
      if (!ctx.scene.walking) return;
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
    open(venueId: string) {
      const plan = store.get().plan;
      const v = plan?.venues.find((x) => x.id === venueId);
      if (!plan || !v) return;
      if (ctx.scene.walking) ctx.scene.exitWalk();
      $('#crate-store').textContent = v.name;
      $('#crate-title').textContent = 'Dig the crates';
      records = crateFor(plan, venueId);
      cur = 0;
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
