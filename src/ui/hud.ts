import { ARTIST_BY_ID } from '../data/artists.js';
import { GENRES, genreName } from '../data/genres.js';
import { locationsFor, venueTypeLabel } from '../core/cityGenerator.js';
import { hashString, mulberry32 } from '../core/random.js';
import { discoveryChain, neighbours } from '../core/recommend.js';
import type { Tab } from '../core/store.js';
import { SCENES, type Passport } from '../core/passport.js';
import { ownerLabel, type Comparison } from '../core/compare.js';
import { HISTORICAL_LANDMARKS } from '../data/landmarks.js';
import { LABEL_BY_ID, labelsFor } from '../data/labels.js';
import type { AlbumInfo, Track, PlayerState } from '../music/musicService.js';
import { plaqueFacts, type Tour } from '../core/tours.js';
import { streamingLinks } from '../music/musicService.js';
import type { Archetype, Artist, CityPlan, GenreId, Instrument, Selection } from '../types.js';
import { $, ICONS, esc, onAction } from './dom.js';

export type WalkKind = 'venue' | 'landmark' | 'label' | 'busker';

export interface HudActions {
  select(sel: Selection, opts?: { fly?: boolean }): void;
  listen(artistId: string): void;
  listenLandmark(landmarkId: string): void;
  listenAll(key: string, artistIds: string[]): void;
  nextTrack(): void;
  playTrack(track: Track, queue?: Track[]): void;
  togglePlayer(): void;
  stopPlayer(): void;
  addArtist(artistId: string, fromId?: string): void;
  discover(): void;
  overview(): void;
  newCity(): void;
  share(): void;
  skip(): void;
  setTab(tab: Tab): void;
  toggleList(open?: boolean): void;
  startGig(kind: 'venue' | 'landmark', id: string): void;
  nextAct(): void;
  endGig(): void;
  walk(kind?: WalkKind, id?: string): void;
  exitWalk(): void;
  openCompare(): void;
  openPoster(): void;
  tip(buskerId: string): void;
  listenStreet(streetId: string): void;
  listenBillboard(billboardId: string): void;
  crateForBillboard(billboardId: string): void;
  playAlbum(artistId: string, albumId: number): void;
  startTour(tourId: string): void;
  tourStep(delta: number): void;
  endTour(): void;
  openPerform(): void;
  startPerform(): void;
  performNext(): void;
  endPerform(): void;
  toggleVisualiser(): void;
  openCrate(venueId: string): void;
  setMood(mood: string): void;
  playMood(): void;
}

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  brick: 'Brick walk-up',
  warehouse: 'Warehouse',
  apartment: 'Apartment block',
  tower: 'Tower',
  brutalist: 'Brutalist block',
  curvy: 'Round tower',
  dome: 'Domed pavilion',
  classic: 'Old theatre-district building',
  'neon-tower': 'Neon tower',
  townhouse: 'Terraced house',
};

const INSTRUMENT_LABEL: Record<Instrument, string> = {
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

const genreChip = (g: GenreId) =>
  `<button type="button" class="tag" style="--c:${GENRES[g].style.neon[0]}" data-action="district" data-genre="${g}">${esc(GENRES[g].name)}</button>`;

const BUILD_STEPS: [number, string][] = [
  [0, 'Raising the ground'],
  [0.4, 'Laying the roads'],
  [1.1, 'Neighbourhoods rising'],
  [3.0, 'Opening the venues'],
  [3.6, 'Placing the landmarks'],
  [4.3, 'Switching on the lights'],
];

/** Everything drawn over the canvas once a city exists. */
export class Hud {
  private plan: CityPlan | null = null;
  private info = $('#info');
  private list = $('#explorer');
  private dna = $('#dna');
  private player = $('#player');
  private build = $('#build');
  private trackCache = new Map<string, { tracks: Track[]; degraded: boolean; source: string } | 'loading'>();
  private currentSel: Selection = null;
  passport: Passport | null = null;
  /** Set by the app so the player bar knows whether a next song is queued. */
  hasNext: () => boolean = () => false;
  compare: Comparison | null = null;
  private playerState: PlayerState = { status: 'idle' };
  /** Discographies by artist id (loaded on demand). */
  private albums = new Map<string, AlbumInfo[] | 'loading' | 'error'>();
  private albumPlaying = new Map<string, number>();
  /** Real cover art for billboards once loaded. */
  billboardArt = new Map<string, string>();
  tours: Tour[] = [];
  performChoice = { instrument: 'guitar', artistId: '' };

  constructor(private root: HTMLElement, private actions: HudActions) {
    onAction(root, (action, t) => this.handle(action, t));
    $('#dna-toggle').addEventListener('click', () => this.dna.classList.toggle('is-collapsed'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) {
        if (this.currentSel) this.actions.select(null);
        else this.actions.toggleList(false);
      }
    });
  }

  private handle(action: string, t: HTMLElement) {
    const d = t.dataset;
    switch (action) {
      case 'venue':
        return this.actions.select({ kind: 'venue', id: d.id ?? '' }, { fly: true });
      case 'landmark':
        return this.actions.select({ kind: 'landmark', id: d.id ?? '' }, { fly: true });
      case 'label':
        return this.actions.select({ kind: 'label', id: d.id ?? '' }, { fly: true });
      case 'busker':
        return this.actions.select({ kind: 'busker', id: d.id ?? '' }, { fly: true });
      case 'tip':
        return this.actions.tip(d.id ?? '');
      case 'home':
        return this.actions.select({ kind: 'home', id: d.id ?? '' }, { fly: true });
      case 'billboard':
        return this.actions.select({ kind: 'billboard', id: d.id ?? '' }, { fly: true });
      case 'street':
        return this.actions.select({ kind: 'street', id: d.id ?? '' }, { fly: true });
      case 'listen-street':
        return this.actions.listenStreet(d.id ?? '');
      case 'listen-billboard':
        return this.actions.listenBillboard(d.id ?? '');
      case 'crate-billboard':
        return this.actions.crateForBillboard(d.id ?? '');
      case 'play-album':
        return this.actions.playAlbum(d.artist ?? '', Number(d.album));
      case 'tour':
        return this.actions.startTour(d.id ?? '');
      case 'tour-prev':
        return this.actions.tourStep(-1);
      case 'tour-next':
        return this.actions.tourStep(1);
      case 'tour-end':
        return this.actions.endTour();
      case 'perform':
        return this.actions.openPerform();
      case 'perform-start':
        return this.actions.startPerform();
      case 'perform-next':
        return this.actions.performNext();
      case 'perform-end':
        return this.actions.endPerform();
      case 'perform-instrument':
        this.performChoice.instrument = d.value ?? 'guitar';
        this.root.querySelectorAll<HTMLElement>('[data-action="perform-instrument"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === this.performChoice.instrument)));
        return;
      case 'visualiser':
        return this.actions.toggleVisualiser();
      case 'open-crate':
        return this.actions.openCrate(d.id ?? '');
      case 'mood':
        return this.actions.setMood(d.mood ?? 'night');
      case 'play-mood':
        return this.actions.playMood();
      case 'artist':
        return this.actions.select({ kind: 'artist', id: d.id ?? '' }, { fly: true });
      case 'district':
        return this.actions.select({ kind: 'district', genre: d.genre as GenreId }, { fly: true });
      case 'listen':
        return this.actions.listen(d.id ?? '');
      case 'listen-all':
        return this.actions.listenAll(d.key ?? '', (d.ids ?? '').split(',').filter(Boolean));
      case 'player-next':
        return this.actions.nextTrack();
      case 'listen-landmark':
        return this.actions.listenLandmark(d.id ?? '');
      case 'play': {
        const tracks = this.trackCache.get(d.artist ?? '');
        if (tracks && tracks !== 'loading') this.actions.playTrack(tracks.tracks[Number(d.index)], tracks.tracks);
        return;
      }
      case 'add-artist':
        return this.actions.addArtist(d.id ?? '', d.from);
      case 'discover':
        return this.actions.discover();
      case 'overview':
        return this.actions.overview();
      case 'new-city':
        return this.actions.newCity();
      case 'share':
        return this.actions.share();
      case 'skip':
        return this.actions.skip();
      case 'close-info':
        return this.actions.select(null);
      case 'tab':
        return this.actions.setTab(d.tab as Tab);
      case 'close-list':
        return this.actions.toggleList(false);
      case 'player-toggle':
        return this.actions.togglePlayer();
      case 'player-stop':
        return this.actions.stopPlayer();
      case 'gig':
        return this.actions.startGig(d.kind as 'venue' | 'landmark', d.id ?? '');
      case 'gig-next':
        return this.actions.nextAct();
      case 'gig-end':
        return this.actions.endGig();
      case 'walk':
        return this.actions.walk(d.kind as WalkKind | undefined, d.id);
      case 'exit-walk':
        return this.actions.exitWalk();
      case 'open-compare':
        return this.actions.openCompare();
      case 'open-poster':
        return this.actions.openPoster();
      case 'explore-artists': {
        const first = this.info.querySelector<HTMLElement>('.artist-list');
        first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        first?.classList.add('is-flash');
        setTimeout(() => first?.classList.remove('is-flash'), 900);
        return;
      }
    }
  }

  /* ---------------- city chrome ---------------- */

  mount(plan: CityPlan): void {
    this.plan = plan;
    this.root.hidden = false;
    if (window.matchMedia('(max-width: 760px)').matches) this.dna.classList.add('is-collapsed');
    const top = plan.districts.slice(0, 2).map((d) => GENRES[d.genre].name);
    $('#city-subtitle').textContent = top.length ? `A city of ${top.join(' & ')}` : 'Your city';
    this.renderDna();
    this.renderList('venues');
    this.renderInfo(null);
  }

  renderDna(): void {
    const plan = this.plan;
    if (!plan) return;
    const c = this.compare;
    this.dna.classList.toggle('is-compare', !!c);
    $('#dna-toggle span').textContent = c ? `Taste overlap · ${c.score}%` : 'Your musical DNA';
    if (c) {
      const genres = [...new Set([...c.youDna, ...c.themDna].filter((d) => d.genre !== 'other').sort((a, b) => b.weight - a.weight).map((d) => d.genre))].slice(0, 6);
      const pct = (list: typeof c.youDna, g: string) => list.find((d) => d.genre === g)?.percent ?? 0;
      $('#dna-rows').innerHTML =
        `<li class="cmp-legend"><span><i class="cmp-you"></i>${esc(c.youName)}</span><span><i class="cmp-them"></i>${esc(c.themName)}</span></li>` +
        genres
          .map((g) => {
            const a = pct(c.youDna, g);
            const b = pct(c.themDna, g);
            const id = g as GenreId;
            return `<li><button type="button" data-action="district" data-genre="${g}" class="dna-row">
              <span class="dna-name">${esc(genreName(id))}${c.owners[id] === 'shared' ? ' <em class="cmp-shared">shared</em>' : ''}</span>
              <span class="dna-pct">${a}% · ${b}%</span>
              <span class="dna-bar dna-bar--split"><i class="cmp-you" style="width:${Math.max(2, a)}%"></i></span>
              <span class="dna-bar dna-bar--split"><i class="cmp-them" style="width:${Math.max(2, b)}%"></i></span>
            </button></li>`;
          })
          .join('') +
        (c.sharedArtists.length ? `<li class="cmp-note">You both love ${c.sharedArtists.map((a) => esc(a.name)).join(', ')}.</li>` : '') +
        (c.bridges.length ? `<li class="cmp-note">Meet at ${c.bridges.slice(0, 2).map((b) => `<button type="button" class="linkish" data-action="artist" data-id="${b.artist.id}">${esc(b.artist.name)}</button> (${esc(b.yours.name)} ↔ ${esc(b.theirs.name)})`).join(', ')}.</li>` : '');
      return;
    }
    const rows = plan.dna.slice(0, 6);
    const other = plan.dna.slice(6).reduce((s, d) => s + d.percent, 0);
    const all = other ? [...rows, { genre: 'other' as const, weight: 0, percent: other }] : rows;
    $('#dna-rows').innerHTML = all
      .map((d) => {
        const color = d.genre === 'other' ? '#8e8ca6' : GENRES[d.genre].style.neon[0];
        const clickable = d.genre !== 'other';
        return `<li>
          <${clickable ? `button type="button" data-action="district" data-genre="${d.genre}"` : 'div'} class="dna-row">
            <span class="dna-name">${esc(genreName(d.genre))}</span>
            <span class="dna-pct">${d.percent}%</span>
            <span class="dna-bar"><i style="width:${Math.max(3, d.percent)}%;background:${color}"></i></span>
          </${clickable ? 'button' : 'div'}>
        </li>`;
      })
      .join('');
  }

  setTab(tab: Tab, open: boolean): void {
    this.root.querySelectorAll<HTMLElement>('[data-action="tab"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab && open)));
    this.list.classList.toggle('is-open', open);
    this.list.setAttribute('aria-hidden', String(!open));
    if (open) this.renderList(tab);
  }

  renderList(tab: Tab): void {
    const plan = this.plan;
    if (!plan) return;
    let body = '';
    if (tab === 'districts') {
      body = plan.districts
        .map((d) => {
          const pct = plan.dna.find((x) => x.genre === d.genre)?.percent ?? 0;
          return `<li><button type="button" class="row" data-action="district" data-genre="${d.genre}">
            <span class="dot" style="background:${GENRES[d.genre].style.neon[0]}"></span>
            <span class="row__main"><strong>${esc(d.name)}</strong><small>${esc(this.compare ? ownerLabel(this.compare, d.genre) : d.nickname)}</small></span>
            <span class="row__meta">${pct}%</span></button></li>`;
        })
        .join('');
      if (plan.streets.length) {
        body += `<li class="row-head">Streets named after songs</li>` + [...plan.streets].sort((a, b) => a.name.localeCompare(b.name))
          .map((st) => `<li><button type="button" class="row" data-action="street" data-id="${st.id}"><span class="dot" style="background:#2f8f5a"></span><span class="row__main"><strong>${esc(st.name)}</strong><small>“${esc(st.song)}” · ${esc(this.artistName(st.artistId))}</small></span></button></li>`)
          .join('');
      }
      if (plan.mixed.length) {
        body += `<li class="row-head">Where styles blend</li>` + plan.mixed.map((m) => `<li><button type="button" class="row" data-action="district" data-genre="${m.genres[0]}"><span class="dot dot--mix" style="background:linear-gradient(90deg,${GENRES[m.genres[0]].style.neon[0]} 50%,${GENRES[m.genres[1]].style.neon[0]} 50%)"></span><span class="row__main"><strong>${esc(m.name)}</strong><small>Architecture from both scenes</small></span></button></li>`).join('');
      }
    } else if (tab === 'venues') {
      const sorted = [...plan.venues].sort((a, b) => (a.type === 'record-store' ? -1 : 0) - (b.type === 'record-store' ? -1 : 0) || a.genres[0].localeCompare(b.genres[0]));
      body = sorted
        .map((v) => `<li><button type="button" class="row" data-action="venue" data-id="${v.id}">
          <span class="dot" style="background:${v.neon}"></span>
          <span class="row__main"><strong>${esc(v.name)}</strong><small>${esc(cap(venueTypeLabel(v.type)))} · ${v.genres.map((g) => esc(GENRES[g].name)).join(' / ')}</small></span>
          ${v.addedBy ? '<span class="badge badge--new">New</span>' : ''}</button></li>`)
        .join('');
      if (plan.buskers.length) {
        body += `<li class="row-head">Street buskers</li>` + plan.buskers
          .map((b) => `<li><button type="button" class="row" data-action="busker" data-id="${b.id}">
            <span class="dot dot--note" style="color:${GENRES[b.genre].style.neon[0]}">♪</span>
            <span class="row__main"><strong>${esc(b.name)}</strong><small>Playing ${esc(this.artistName(b.artistId))} · ${esc(GENRES[b.genre].name)}</small></span></button></li>`)
          .join('');
      }
    } else if (tab === 'landmarks') {
      const hist = plan.landmarks.filter((l) => l.type === 'historical');
      const insp = plan.landmarks.filter((l) => l.type === 'inspired');
      body =
        (hist.length ? `<li class="row-head">Historical landmarks</li>` : '') +
        hist.map((l) => `<li><button type="button" class="row" data-action="landmark" data-id="${l.id}"><span class="badge badge--hist">Hist</span><span class="row__main"><strong>${esc(l.name)}</strong><small>${esc(l.place ?? '')} · ${esc(l.date ?? '')}</small></span></button></li>`).join('') +
        (plan.labels.length ? `<li class="row-head">Record labels</li>` + plan.labels.map((t) => {
          const l = LABEL_BY_ID[t.labelId];
          return `<li><button type="button" class="row" data-action="label" data-id="${t.id}"><span class="dot" style="background:${t.color}"></span><span class="row__main"><strong>${esc(t.name)}</strong><small>Est. ${l?.founded ?? ''} · ${esc(l?.city ?? '')} · ${t.artistIds.length} in town</small></span></button></li>`;
        }).join('') : '') +
        `<li class="row-head">Musical interpretations</li>` +
        insp.map((l) => `<li><button type="button" class="row" data-action="landmark" data-id="${l.id}"><span class="badge badge--insp">Interp</span><span class="row__main"><strong>${esc(l.name)}</strong><small>${esc(GENRES[l.genres[0]].name)} District monument</small></span></button></li>`).join('');
    } else if (tab === 'passport') {
      body = this.passportHtml();
    } else if (tab === 'tours') {
      body = this.tours.length
        ? this.tours
            .map((t) => `<li><button type="button" class="row" data-action="tour" data-id="${esc(t.id)}"><span class="badge badge--hist">${t.stops.length}</span><span class="row__main"><strong>${esc(t.name)}</strong><small>${esc(t.description)}</small></span></button></li>`)
            .join('')
        : '<li class="scene-desc">Tours need a few landmarks. Add more artists (or use Discover) to unlock them.</li>';
    } else {
      const users = plan.artists.filter((a) => plan.userArtistIds.includes(a.id) || a.custom);
      const others = plan.artists.filter((a) => !plan.userArtistIds.includes(a.id) && !a.custom);
      const row = (a: Artist) => `<li><button type="button" class="row" data-action="artist" data-id="${a.id}">
        <span class="dot" style="background:${a.genres[0] ? GENRES[a.genres[0]].style.neon[0] : '#8e8ca6'}"></span>
        <span class="row__main"><strong>${esc(a.name)}</strong><small>${a.genres.length ? a.genres.map((g) => esc(GENRES[g].name)).join(' · ') : 'Your pick'}</small></span></button></li>`;
      const c = this.compare;
      if (c) {
        const both = users.filter((a) => c.youArtistIds.includes(a.id) && c.themArtistIds.includes(a.id));
        const yours = users.filter((a) => c.youArtistIds.includes(a.id) && !c.themArtistIds.includes(a.id));
        const theirs = users.filter((a) => c.themArtistIds.includes(a.id) && !c.youArtistIds.includes(a.id));
        body =
          (both.length ? `<li class="row-head">Both of you</li>${both.map(row).join('')}` : '') +
          (yours.length ? `<li class="row-head">${esc(c.youName)}</li>${yours.map(row).join('')}` : '') +
          (theirs.length ? `<li class="row-head">${esc(c.themName)}</li>${theirs.map(row).join('')}` : '') +
          `<li class="row-head">Also in town</li>${others.map(row).join('')}`;
      } else {
        body = (users.length ? `<li class="row-head">Your artists</li>${users.map(row).join('')}` : '') + `<li class="row-head">Also in town</li>${others.map(row).join('')}`;
      }
      if (plan.homes.length) {
        body += `<li class="row-head">Artist homes</li>` + plan.homes
          .map((h) => `<li><button type="button" class="row" data-action="home" data-id="${h.id}"><span class="dot" style="background:#8ff0c8"></span><span class="row__main"><strong>${esc(this.artistName(h.artistId))}’s place</strong><small>${esc(cap(h.style))} · ${esc(GENRES[h.genre].name)} District</small></span></button></li>`)
          .join('');
      }
    }
    $('#explorer-list').innerHTML = body;
    $('#explorer-title').textContent = tab === 'passport' ? 'Landmark passport' : tab === 'tours' ? 'Guided tours' : cap(tab);
  }

  /* ---------------- build overlay ---------------- */

  showBuild(show: boolean): void {
    this.build.hidden = !show;
    this.root.classList.toggle('is-building', show);
  }

  buildStatus(text: string): void {
    $('#build-step').textContent = text;
  }

  buildProgress(t: number, total: number): void {
    const step = [...BUILD_STEPS].reverse().find(([at]) => t >= at);
    const district = this.plan?.districts[0];
    let label = step?.[1] ?? 'Building your city';
    if (label === 'Neighbourhoods rising' && district) label = `The ${district.name} is rising`;
    $('#build-step').textContent = label;
    ($('#build-bar') as HTMLElement).style.width = `${Math.min(100, (t / total) * 100)}%`;
  }

  /* ---------------- info panel ---------------- */

  refreshInfo(): void {
    this.renderInfo(this.currentSel);
  }

  renderInfo(sel: Selection): void {
    this.currentSel = sel;
    const plan = this.plan;
    if (!sel || !plan) {
      this.info.classList.remove('is-open');
      this.info.setAttribute('aria-hidden', 'true');
      return;
    }
    let html = '';
    if (sel.kind === 'venue') html = this.venueHtml(sel.id);
    else if (sel.kind === 'landmark') html = this.landmarkHtml(sel.id);
    else if (sel.kind === 'artist') html = this.artistHtml(sel.id);
    else if (sel.kind === 'building') html = this.buildingHtml(sel.id);
    else if (sel.kind === 'district') html = this.districtHtml(sel.genre);
    else if (sel.kind === 'label') html = this.labelHtml(sel.id);
    else if (sel.kind === 'busker') html = this.buskerHtml(sel.id);
    else if (sel.kind === 'home') html = this.homeHtml(sel.id);
    else if (sel.kind === 'billboard') html = this.billboardHtml(sel.id);
    else if (sel.kind === 'street') html = this.streetHtml(sel.id);
    this.info.innerHTML = `<button type="button" class="icon-btn info__close" data-action="close-info" aria-label="Close">${ICONS.close}</button><div class="info__scroll">${html}</div>`;
    this.info.classList.add('is-open');
    this.info.setAttribute('aria-hidden', 'false');
  }

  private artistsList(ids: string[], label = 'Artists'): string {
    const plan = this.plan!;
    const artists = ids.map((id) => ARTIST_BY_ID[id] ?? plan.artists.find((a) => a.id === id)).filter((a): a is Artist => !!a);
    if (!artists.length) return '';
    return `<div class="info__section"><h4>${esc(label)}</h4><ul class="artist-list">${artists
      .map((a) => `<li><button type="button" class="artist-chip ${plan.userArtistIds.includes(a.id) ? 'is-yours' : ''}" data-action="artist" data-id="${a.id}">${esc(a.name)}</button></li>`)
      .join('')}</ul></div>`;
  }

  /** Listen button for a place with one or more artists; loads songs from all of them. */
  private listenBlock(artistIds: string[], key: string): string {
    const ids = artistIds.filter((id) => ARTIST_BY_ID[id] || this.plan?.artists.some((a) => a.id === id && !a.custom));
    if (!ids.length) return '';
    const label = ids.length > 1 ? `Listen to all ${ids.length} artists` : 'Listen';
    const btn = `<button type="button" class="btn btn--primary btn--sm" data-action="listen-all" data-key="${esc(key)}" data-ids="${esc(ids.join(','))}">${ICONS.play} ${label}</button>`;
    return `<div class="info__actions">${btn}${ids.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm" data-action="explore-artists">Explore artists</button>` : ''}</div>
      <div class="tracks" data-tracks-for="${esc(key)}">${this.trackCache.has(key) ? this.tracksHtml(key) : ''}</div>`;
  }

  private venueHtml(id: string): string {
    const plan = this.plan!;
    const v = plan.venues.find((x) => x.id === id);
    if (!v) return '';
    let extra = '';
    if (v.type === 'record-store') {
      const seedArtist = v.artistIds.map((a) => ARTIST_BY_ID[a]).find((a): a is Artist => !!a);
      if (seedArtist) {
        const inCity = new Set(plan.userArtistIds);
        const chain = discoveryChain(seedArtist, inCity, 3, mulberry32(hashString(v.id)));
        if (chain.length) {
          extra = `<div class="info__section"><h4>You might also like</h4><ol class="chain">
            <li><button type="button" class="chain__item" data-action="artist" data-id="${seedArtist.id}"><strong>${esc(seedArtist.name)}</strong><small>${seedArtist.album.title ? `${esc(seedArtist.album.title)} (${seedArtist.album.year})` : esc(seedArtist.origin)}</small></button></li>
            ${chain
              .map((a, i) => {
                const present = plan.venues.some((x) => x.addedBy === a.id);
                return `<li class="chain__arrow">${ICONS.arrow}</li><li><div class="chain__item">
                  <button type="button" class="chain__name" data-action="artist" data-id="${a.id}"><strong>${esc(a.name)}</strong><small>${a.album.title ? `${esc(a.album.title)} (${a.album.year})` : esc(a.origin)}</small></button>
                  ${present ? '<span class="badge badge--new">In town</span>' : `<button type="button" class="btn btn--ghost btn--xs" data-action="add-artist" data-id="${a.id}" data-from="${(i ? chain[i - 1] : seedArtist).id}">+ Add to city</button>`}
                </div></li>`;
              })
              .join('')}
          </ol></div>`;
        }
      }
    }
    return `<p class="eyebrow">${esc(venueTypeLabel(v.type))}</p>
      <span class="badge badge--insp">Musical interpretation</span>
      <h3>${esc(v.name)}</h3>
      <div class="info__section"><h4>Genre</h4><div class="tags">${v.genres.map(genreChip).join('')}</div></div>
      ${this.artistsList(v.artistIds)}
      <p class="info__desc">${esc(v.description)}</p>
      ${v.type === 'record-store' ? `<button type="button" class="crate-cta" data-action="open-crate" data-id="${v.id}"><span class="crate-cta__stack" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>Dig the crates</strong><small>Flip through the records. Each one plays a preview.</small></span></button>` : ''}
      ${this.listenBlock(v.artistIds, `venue:${v.id}`)}
      ${this.plaquesHtml(v.id)}
      <div class="info__actions info__actions--secondary">
        <button type="button" class="btn btn--gold btn--sm" data-action="gig" data-kind="venue" data-id="${v.id}">Gig night</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="walk" data-kind="venue" data-id="${v.id}">Walk here</button>
      </div>
      ${extra}`;
  }

  private landmarkHtml(id: string): string {
    const plan = this.plan!;
    const l = plan.landmarks.find((x) => x.id === id);
    if (!l) return '';
    if (l.type === 'historical') {
      return `<span class="badge badge--hist">Historical landmark</span>
        <h3>${esc(l.name)}</h3>
        <p class="info__meta">${esc(l.place ?? '')}<br>${esc(l.date ?? '')}</p>
        <p class="info__desc">${esc(l.description)}</p>
        <p class="info__note">The event is documented music history. The building you see is a miniature inspired by it, not a replica.</p>
        ${this.stampHtml(l.id)}
        ${this.soundtrackBlock(l.id)}
        <div class="info__actions info__actions--secondary">
          <button type="button" class="btn btn--gold btn--sm" data-action="gig" data-kind="landmark" data-id="${l.id}">Gig night + fireworks</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="walk" data-kind="landmark" data-id="${l.id}">Walk here</button>
        </div>
        ${this.artistsList(l.artistIds)}`;
    }
    const g = l.genres[0];
    return `<span class="badge badge--insp">Musical interpretation</span>
      <h3>${esc(l.name)}</h3>
      <p class="info__meta">Monument of the ${esc(GENRES[g].name)} District</p>
      <p class="info__desc">${esc(l.description)}</p>
      <p class="info__note">A fictional monument generated from ${esc(GENRES[g].scene)}.</p>
      <div class="info__actions info__actions--secondary">
        <button type="button" class="btn btn--gold btn--sm" data-action="gig" data-kind="landmark" data-id="${l.id}">Gig night + fireworks</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="walk" data-kind="landmark" data-id="${l.id}">Walk here</button>
      </div>
      <div class="info__section"><h4>District</h4><div class="tags">${genreChip(g)}</div></div>`;
  }

  private passportHtml(): string {
    const pp = this.passport;
    const plan = this.plan;
    if (!pp || !plan) return '';
    const inCity = new Set(plan.landmarks.map((l) => l.id));
    const stamp = (id: string) => {
      const l = HISTORICAL_LANDMARKS.find((x) => x.id === id);
      if (!l) return '';
      const st = pp.get(id);
      const here = inCity.has(id);
      const who = ARTIST_BY_ID[l.artistIds[0]]?.name ?? '';
      const sub = st ? `Stamped ${new Date(st.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : here ? 'In your city · play its soundtrack to stamp' : `Add ${who} to find it`;
      const inner = `<span class="stamp__seal" aria-hidden="true">${st ? '✓' : here ? '♪' : '·'}</span><span class="row__main"><strong>${esc(l.name)}</strong><small>${esc(sub)}</small></span>`;
      return here
        ? `<li><button type="button" class="row stamp ${st ? 'is-stamped' : 'is-here'}" data-action="landmark" data-id="${id}">${inner}</button></li>`
        : `<li><div class="row stamp ${st ? 'is-stamped' : 'is-locked'}">${inner}</div></li>`;
    };
    const scenes = SCENES.map((sc) => {
      const got = pp.sceneProgress(sc);
      const done = got === sc.landmarkIds.length;
      return `<li class="row-head scene-head ${done ? 'is-done' : ''}"><span>${done ? '★ ' : ''}${esc(sc.name)}</span><span>${got}/${sc.landmarkIds.length}</span></li>
        <li class="scene-desc">${esc(sc.description)}</li>
        ${sc.landmarkIds.map(stamp).join('')}`;
    }).join('');
    return `<li class="passport-summary"><strong>${pp.count}</strong> of ${pp.total} stamps · ${SCENES.filter((sc) => pp.sceneDone(sc)).length} of ${SCENES.length} scenes complete
      <span class="passport-bar"><i style="width:${(pp.count / pp.total) * 100}%"></i></span>
      <small>Open a historical landmark and play its soundtrack to collect its stamp. Stamps are saved in this browser.</small></li>${scenes}`;
  }

  /** Floating card for an ongoing gig night. */
  renderGig(g: { title: string; place: string; lineup: string[]; act: number; fireworks: boolean } | null): void {
    const el = $('#gig');
    if (!g) {
      el.hidden = true;
      this.root.classList.remove('is-gig');
      return;
    }
    this.root.classList.add('is-gig');
    el.hidden = false;
    el.innerHTML = `<span class="gig__live"><i></i>Live tonight</span>
      <div class="gig__main"><strong>${esc(g.title)}</strong><small>${esc(g.place)}</small></div>
      <ol class="gig__lineup">${g.lineup.map((n, i) => `<li class="${i === g.act ? 'is-on' : ''}">${i === g.act ? '▶ ' : ''}${esc(n)}</li>`).join('')}</ol>
      <div class="gig__actions">
        ${g.lineup.length > 1 ? '<button type="button" class="btn btn--ghost btn--xs" data-action="gig-next">Next act</button>' : ''}
        <button type="button" class="btn btn--ghost btn--xs" data-action="gig-end">End show</button>
      </div>`;
  }

  /** Walking HUD: what's playing nearby, the street you're on, plaques and landmarks. */
  renderWalk(active: boolean, now?: { venue?: string; artist?: string; distance?: number; landmark?: { id: string; name: string } | null; street?: { id: string; name: string } | null; plaque?: string | null }): void {
    $('#walk-hud').hidden = !active;
    this.root.classList.toggle('is-walking', active);
    const el = $('#walk-now');
    const street = $('#walk-street');
    street.hidden = !active || !now?.street;
    if (now?.street) street.innerHTML = `<button type="button" data-action="street" data-id="${esc(now.street.id)}"><span class="walk-street__sign">${esc(now.street.name)}</span></button>`;
    if (!active || !now || (!now.venue && !now.landmark && !now.plaque)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `${now.venue ? `<div class="walk-now__row"><span class="walk-now__eq" aria-hidden="true"><i></i><i></i><i></i></span><div><strong>${esc(now.artist ?? '')}</strong><small>from ${esc(now.venue)}${now.distance !== undefined ? ` · ${Math.round(now.distance)} m away` : ''}</small></div></div>` : ''}
      ${now.plaque ? `<p class="walk-now__plaque"><span aria-hidden="true">▣</span> ${esc(now.plaque)}</p>` : ''}
      ${now.landmark ? `<button type="button" class="walk-now__lm" data-action="landmark" data-id="${esc(now.landmark.id)}">★ ${esc(now.landmark.name)} is here · open</button>` : ''}`;
  }

  private stampHtml(id: string): string {
    const st = this.passport?.get(id);
    return st
      ? `<p class="stamp-note is-stamped">✓ Passport stamped ${esc(new Date(st.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>`
      : '<p class="stamp-note">Play the soundtrack to stamp your passport.</p>';
  }

  /** The album/songs tied to a historical landmark. */
  private soundtrackBlock(id: string): string {
    const l = this.plan!.landmarks.find((x) => x.id === id);
    const st = l?.soundtrack;
    if (!st) return '';
    const name = (aid: string) => ARTIST_BY_ID[aid]?.name ?? '';
    const songBy = (s: { artistId?: string; artistName?: string }) => (s.artistId ? name(s.artistId) : s.artistName ?? '');
    const key = `lm:${id}`;
    const multi = new Set(st.songs.map(songBy)).size > 1;
    return `<div class="info__section soundtrack"><h4>Soundtrack</h4>
      ${st.album ? `<p class="album"><strong>${esc(st.album.title)}</strong> (${st.album.year}) · ${esc(name(st.album.artistId))}</p>` : ''}
      <p class="songs">${st.songs.map((s) => esc(s.title) + (multi ? ` <span class="songs__by">(${esc(songBy(s))})</span>` : '')).join(' · ')}</p>
      <p class="soundtrack__note">${esc(st.note)}</p>
      <div class="info__actions"><button type="button" class="btn btn--primary btn--sm" data-action="listen-landmark" data-id="${esc(id)}">${ICONS.play} Play the soundtrack</button></div>
      <div class="tracks" data-tracks-for="${esc(key)}">${this.trackCache.has(key) ? this.tracksHtml(key) : ''}</div>
    </div>`;
  }

  private artistHtml(id: string): string {
    const plan = this.plan!;
    const a = ARTIST_BY_ID[id] ?? plan.artists.find((x) => x.id === id);
    if (!a) return '';
    if (a.custom) {
      return `<p class="eyebrow">Your pick</p><h3>${esc(a.name)}</h3><p class="info__desc">${esc(a.blurb)}</p>
        <div class="info__actions">${streamingLinks(a).map((l) => `<a class="btn btn--ghost btn--sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ${ICONS.ext}</a>`).join('')}</div>`;
    }
    const inCity = plan.artists.some((x) => x.id === a.id);
    const locs = locationsFor(plan, a.id);
    const places = [...locs.venues.map((v) => ({ kind: 'venue', id: v.id, name: v.name, sub: cap(venueTypeLabel(v.type)) })), ...locs.landmarks.map((l) => ({ kind: 'landmark', id: l.id, name: l.name, sub: l.type === 'historical' ? 'Historical landmark' : 'Interpretation' }))];
    const links = neighbours(a);
    const yours = plan.userArtistIds.includes(a.id);
    const next = links.find((n) => plan.artists.some((x) => x.id === n.id));
    return `<p class="eyebrow">${yours ? 'Your artist' : inCity ? 'Artist in town' : 'New in town'}</p>
      <h3>${esc(a.name)}</h3>
      <p class="info__meta">${esc(a.origin)} · since ${a.since}</p>
      <div class="tags">${a.genres.map(genreChip).join('')}</div>
      <p class="info__desc">${esc(a.blurb)}</p>
      ${a.album.title || a.songs.length ? `<div class="info__section"><h4>Essential</h4>${a.album.title ? `<p class="album"><strong>${esc(a.album.title)}</strong> (${a.album.year})</p>` : ''}
        <p class="songs">${a.songs.map((s) => esc(s.title)).join(' · ')}</p></div>` : ''}
      <div class="info__actions">
        <button type="button" class="btn btn--primary btn--sm" data-action="listen" data-id="${a.id}">${ICONS.play} Listen</button>
        ${!inCity || !places.length ? `<button type="button" class="btn btn--gold btn--sm" data-action="add-artist" data-id="${a.id}">${ICONS.spark} Add to my city</button>` : ''}
        ${next ? `<button type="button" class="btn btn--ghost btn--sm" data-action="artist" data-id="${next.id}">Follow connection → ${esc(next.name)}</button>` : ''}
      </div>
      <div class="tracks" data-tracks-for="${a.id}">${this.trackCache.has(a.id) ? this.tracksHtml(a.id) : ''}</div>
      ${places.length ? `<div class="info__section"><h4>In your city</h4><ul class="places">${places.map((p) => `<li><button type="button" class="place" data-action="${p.kind}" data-id="${p.id}">${ICONS.pin}<span><strong>${esc(p.name)}</strong><small>${esc(p.sub)}</small></span></button></li>`).join('')}</ul></div>` : ''}
      ${this.labelsForArtistHtml(a.id)}
      <div class="info__section"><h4>Connected artists</h4><ul class="artist-list">${links
        .map((n) => {
          const here = plan.artists.some((x) => x.id === n.id);
          return `<li><button type="button" class="artist-chip ${here ? 'is-here' : 'is-away'}" data-action="artist" data-id="${n.id}" title="${here ? 'In your city' : 'Not in your city yet'}">${esc(n.name)}${here ? '' : ' <span aria-hidden="true">+</span>'}</button></li>`;
        })
        .join('')}</ul></div>`;
  }

  private buildingHtml(id: number): string {
    const b = this.plan!.buildings.find((x) => x.id === id);
    if (!b) return '';
    const g = GENRES[b.dominant];
    const floors = Math.max(1, Math.round(b.height / 1.15));
    return `<p class="eyebrow">Building</p>
      <h3>${esc(ARCHETYPE_LABEL[b.archetype])}</h3>
      <p class="info__meta">${floors} floor${floors > 1 ? 's' : ''} · ${esc(g.name)} District${b.secondary && b.secondary !== b.dominant ? ` with ${esc(GENRES[b.secondary].name)} influence` : ''}</p>
      <p class="info__desc">${esc(g.description)}</p>
      <div class="tags">${genreChip(b.dominant)}${b.secondary && b.secondary !== b.dominant ? genreChip(b.secondary) : ''}</div>
      <p class="info__note">Venues and landmarks are marked by floating lights. Try clicking one, or use Discover.</p>`;
  }

  private artistName(id: string): string {
    return ARTIST_BY_ID[id]?.name ?? this.plan?.artists.find((a) => a.id === id)?.name ?? '';
  }

  private labelsForArtistHtml(artistId: string): string {
    const plan = this.plan!;
    const labels = labelsFor(artistId);
    if (!labels.length) return '';
    return `<div class="info__section"><h4>Record labels</h4><ul class="artist-list">${labels
      .map((l) => {
        const tower = plan.labels.find((t) => t.labelId === l.id);
        return tower
          ? `<li><button type="button" class="artist-chip is-here" data-action="label" data-id="${tower.id}">${esc(l.name)} ${ICONS.pin}</button></li>`
          : `<li><span class="artist-chip is-static">${esc(l.name)}</span></li>`;
      })
      .join('')}</ul></div>`;
  }

  private labelHtml(id: string): string {
    const plan = this.plan!;
    const t = plan.labels.find((x) => x.id === id);
    const l = t ? LABEL_BY_ID[t.labelId] : undefined;
    if (!t || !l) return '';
    const away = l.artistIds.filter((a) => !t.artistIds.includes(a) && ARTIST_BY_ID[a]);
    return `<p class="eyebrow">Record label</p>
      <span class="badge badge--hist">Real record label</span>
      <h3>${esc(l.name)}</h3>
      <p class="info__meta">Founded ${l.founded} · ${esc(l.city)}<br>${esc(l.founders)}</p>
      <p class="info__desc">${esc(l.blurb)}</p>
      <p class="info__note">The label and the releases are real. The tower is a musical interpretation, and the lines show where its artists play in your city.</p>
      ${this.artistsList(t.artistIds, 'Label artists in your city')}
      ${this.listenBlock(t.artistIds, `label:${t.id}`)}
      ${away.length ? `<div class="info__section"><h4>Also on the label</h4><ul class="artist-list">${away
        .map((a) => `<li><button type="button" class="artist-chip is-away" data-action="artist" data-id="${a}" title="Not in your city yet">${esc(ARTIST_BY_ID[a].name)} <span aria-hidden="true">+</span></button></li>`)
        .join('')}</ul></div>` : ''}
      <div class="info__actions info__actions--secondary">
        <button type="button" class="btn btn--ghost btn--sm" data-action="walk" data-kind="label" data-id="${t.id}">Walk here</button>
      </div>`;
  }

  private buskerHtml(id: string): string {
    const plan = this.plan!;
    const b = plan.buskers.find((x) => x.id === id);
    if (!b) return '';
    const name = this.artistName(b.artistId);
    return `<p class="eyebrow">Street busker</p>
      <span class="badge badge--insp">Musical interpretation</span>
      <h3>${esc(b.name)}</h3>
      <p class="info__meta">${esc(INSTRUMENT_LABEL[b.instrument])} · ${esc(GENRES[b.genre].name)} District street corner</p>
      <p class="info__desc">A fictional busker working through songs by ${esc(name)}. What you hear are official previews of the original recordings.</p>
      ${this.listenBlock([b.artistId], `busker:${b.id}`)}
      <div class="info__actions info__actions--secondary">
        <button type="button" class="btn btn--gold btn--sm" data-action="tip" data-id="${b.id}">Toss a coin</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="walk" data-kind="busker" data-id="${b.id}">Walk here</button>
      </div>
      ${this.artistsList([b.artistId], 'Playing songs by')}`;
  }

  private plaquesHtml(venueId: string): string {
    const facts = plaqueFacts(this.plan!, venueId);
    if (!facts.length) return '';
    return `<div class="info__section"><h4>Plaques by the door</h4><ul class="plaques">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  }

  private homeHtml(id: string): string {
    const plan = this.plan!;
    const h = plan.homes.find((x) => x.id === id);
    const a = h ? ARTIST_BY_ID[h.artistId] ?? plan.artists.find((x) => x.id === h.artistId) : undefined;
    if (!h || !a) return '';
    const key = `home:${a.id}`;
    return `<p class="eyebrow">Artist home</p>
      <span class="badge badge--insp">Musical interpretation</span>
      <h3>${esc(a.name)}’s place</h3>
      <p class="info__meta">${esc(a.origin)}${a.since ? ` · making records since ${a.since}` : ''}</p>
      <div class="tags">${a.genres.map(genreChip).join('')}</div>
      <p class="info__desc">${esc(a.blurb)}</p>
      <p class="info__note">An imagined home in your city, not where ${esc(a.name)} really lives. The facts and records are real.</p>
      <div class="info__section"><h4>Discography</h4><div data-disco-for="${esc(a.id)}">${this.discoHtml(a.id)}</div></div>
      <div class="tracks" data-tracks-for="${esc(key)}">${this.trackCache.has(key) ? this.tracksHtml(key) : ''}</div>
      <div class="info__actions info__actions--secondary">
        <button type="button" class="btn btn--ghost btn--sm" data-action="artist" data-id="${esc(a.id)}">Where they play</button>
      </div>`;
  }

  private discoHtml(artistId: string): string {
    const list = this.albums.get(artistId);
    if (!list || list === 'loading') return '<p class="tracks__loading">Pulling records off the shelf…</p>';
    const a = ARTIST_BY_ID[artistId] ?? this.plan?.artists.find((x) => x.id === artistId);
    if (list === 'error' || !list.length) {
      return a?.album.title ? `<p class="album"><strong>${esc(a.album.title)}</strong> (${a.album.year})</p><p class="tracks__source">Music data unavailable, showing the curated album.</p>` : '<p class="tracks__source">No albums found.</p>';
    }
    const on = this.albumPlaying.get(artistId);
    return `<ul class="discography">${list
      .map((al) => `<li><button type="button" class="album-tile ${on === al.id ? 'is-on' : ''}" data-action="play-album" data-artist="${esc(artistId)}" data-album="${al.id}">
        ${al.artwork ? `<img src="${esc(al.artwork)}" alt="" loading="lazy">` : '<span class="album-tile__blank"></span>'}
        <strong>${esc(al.title)}</strong><small>${al.year || ''}</small></button></li>`)
      .join('')}</ul>`;
  }

  setAlbums(artistId: string, value: AlbumInfo[] | 'loading' | 'error'): void {
    this.albums.set(artistId, value);
    this.info.querySelectorAll<HTMLElement>(`[data-disco-for="${artistId}"]`).forEach((el) => (el.innerHTML = this.discoHtml(artistId)));
  }

  albumsState(artistId: string): AlbumInfo[] | 'loading' | 'error' | undefined {
    return this.albums.get(artistId);
  }

  markAlbum(artistId: string, albumId: number): void {
    this.albumPlaying.set(artistId, albumId);
    this.setAlbums(artistId, this.albums.get(artistId) ?? 'loading');
  }

  private billboardHtml(id: string): string {
    const plan = this.plan!;
    const b = plan.billboards.find((x) => x.id === id);
    if (!b) return '';
    const art = this.billboardArt.get(id);
    return `<p class="eyebrow">Billboard</p>
      <h3>${esc(b.title)}</h3>
      <p class="info__meta">${esc(this.artistName(b.artistId))}${b.year ? ` · ${b.year}` : ''}</p>
      ${art ? `<img class="cover" src="${esc(art)}" alt="Cover of ${esc(b.title)}">` : ''}
      <div class="info__actions">
        <button type="button" class="btn btn--primary btn--sm" data-action="listen-billboard" data-id="${esc(id)}">${ICONS.play} Play the album</button>
        <button type="button" class="btn btn--gold btn--sm" data-action="crate-billboard" data-id="${esc(id)}">Find it in the crates</button>
      </div>
      <div class="tracks" data-tracks-for="${esc(`bb:${id}`)}">${this.trackCache.has(`bb:${id}`) ? this.tracksHtml(`bb:${id}`) : ''}</div>
      ${this.artistsList([b.artistId], 'Artist')}`;
  }

  private streetHtml(id: string): string {
    const plan = this.plan!;
    const st = plan.streets.find((x) => x.id === id);
    if (!st) return '';
    const on = (p: { x: number; z: number }) => {
      const across = st.axis === 'x' ? Math.abs(p.z - st.c) : Math.abs(p.x - st.c);
      return across < plan.pitch * 0.62;
    };
    const places = [
      ...plan.venues.filter((v) => on(v.position)).map((v) => ({ kind: 'venue', id: v.id, name: v.name, sub: cap(venueTypeLabel(v.type)) })),
      ...plan.landmarks.filter((l) => on(l.position)).map((l) => ({ kind: 'landmark', id: l.id, name: l.name, sub: l.type === 'historical' ? 'Historical landmark' : 'Interpretation' })),
      ...plan.labels.filter((t) => on(t.position)).map((t) => ({ kind: 'label', id: t.id, name: t.name, sub: 'Record label' })),
      ...plan.homes.filter((h) => on(h.position)).map((h) => ({ kind: 'home', id: h.id, name: `${this.artistName(h.artistId)}’s place`, sub: 'Artist home' })),
    ].slice(0, 10);
    return `<p class="eyebrow">Street</p>
      <span class="street-sign">${esc(st.name)}</span>
      <p class="info__meta">Named after “${esc(st.song)}” by ${esc(this.artistName(st.artistId))} · ${esc(GENRES[st.genre].name)} District</p>
      <div class="info__actions"><button type="button" class="btn btn--primary btn--sm" data-action="listen-street" data-id="${esc(id)}">${ICONS.play} Play “${esc(st.song)}”</button></div>
      <div class="tracks" data-tracks-for="${esc(`street:${id}`)}">${this.trackCache.has(`street:${id}`) ? this.tracksHtml(`street:${id}`) : ''}</div>
      ${places.length ? `<div class="info__section"><h4>On this street</h4><ul class="places">${places.map((p) => `<li><button type="button" class="place" data-action="${p.kind}" data-id="${p.id}">${ICONS.pin}<span><strong>${esc(p.name)}</strong><small>${esc(p.sub)}</small></span></button></li>`).join('')}</ul></div>` : ''}`;
  }

  /** Floating card for a guided tour. */
  renderTour(t: { name: string; index: number; total: number; title: string; sub: string; caption: string; auto: boolean } | null): void {
    const el = $('#tour');
    this.root.classList.toggle('is-touring', !!t);
    if (!t) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="tour__head"><span class="tour__badge">Tour · ${esc(t.name)}</span><span class="tour__count">${t.index + 1} / ${t.total}</span></div>
      <strong class="tour__title">${esc(t.title)}</strong>
      <small class="tour__sub">${esc(t.sub)}</small>
      <p class="tour__caption">${esc(t.caption)}</p>
      <span class="tour__progress"><i style="width:${((t.index + 1) / t.total) * 100}%"></i></span>
      <div class="tour__actions">
        <button type="button" class="btn btn--ghost btn--xs" data-action="tour-prev" ${t.index === 0 ? 'disabled' : ''}>← Back</button>
        <button type="button" class="btn btn--primary btn--xs" data-action="tour-next">${t.index + 1 === t.total ? 'Finish' : 'Next stop →'}</button>
        <button type="button" class="btn btn--ghost btn--xs" data-action="tour-end">End tour</button>
      </div>`;
  }

  /** Setup and live card for your own street performance. */
  renderPerform(state: { phase: 'setup'; artists: { id: string; name: string }[] } | { phase: 'live'; corner: string; crowd: number; tips: number; song: string; instrument: string } | null): void {
    const el = $('#perform');
    this.root.classList.toggle('is-performing', !!state && state.phase === 'live');
    if (!state) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (state.phase === 'setup') {
      const inst = Object.entries(INSTRUMENT_LABEL);
      el.innerHTML = `<div class="tour__head"><span class="tour__badge">Busk on a corner</span><button type="button" class="icon-btn" data-action="perform-end" aria-label="Close">${ICONS.close}</button></div>
        <p class="perform__lede">Pick an instrument and whose songs to play. We’ll find an open corner near where you’re looking.</p>
        <div class="perform__chips">${inst.map(([k, label]) => `<button type="button" class="chip-btn" data-action="perform-instrument" data-value="${k}" aria-pressed="${k === this.performChoice.instrument}">${esc(label)}</button>`).join('')}</div>
        <label class="field perform__field"><span>Play songs by</span><select id="perform-artist"><option value="">Your whole taste (a mix)</option>${state.artists.map((a) => `<option value="${esc(a.id)}" ${a.id === this.performChoice.artistId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <div class="tour__actions"><button type="button" class="btn btn--gold btn--sm" data-action="perform-start">Start busking</button></div>`;
      el.querySelector<HTMLSelectElement>('#perform-artist')?.addEventListener('change', (e) => (this.performChoice.artistId = (e.target as HTMLSelectElement).value));
      return;
    }
    el.innerHTML = `<div class="tour__head"><span class="tour__badge"><i class="gig-dot"></i>You’re busking</span><span class="tour__count">${esc(state.instrument)}</span></div>
      <small class="tour__sub">${esc(state.corner)}</small>
      <div class="perform__stats"><div><strong>${state.crowd}</strong><small>watching</small></div><div><strong>$${state.tips.toFixed(2)}</strong><small>in the case</small></div></div>
      <p class="tour__caption">${state.song ? `▶ ${esc(state.song)}` : 'Tuning up…'}</p>
      <div class="tour__actions">
        <button type="button" class="btn btn--ghost btn--xs" data-action="perform-next">Next song</button>
        <button type="button" class="btn btn--ghost btn--xs" data-action="perform-end">End set</button>
      </div>`;
  }

  setVisualiser(on: boolean): void {
    $('#viz-btn').setAttribute('aria-pressed', String(on));
    this.root.classList.toggle('is-viz', on);
  }

  private districtHtml(genre: GenreId): string {
    const plan = this.plan!;
    const d = plan.districts.find((x) => x.genre === genre);
    const g = GENRES[genre];
    const pct = plan.dna.find((x) => x.genre === genre)?.percent ?? 0;
    const venues = plan.venues.filter((v) => v.genres[0] === genre);
    const lms = plan.landmarks.filter((l) => l.genres[0] === genre);
    return `<p class="eyebrow">District</p>
      <h3>${esc(d?.name ?? `${g.name} District`)}</h3>
      <p class="info__meta">“${esc(g.nickname)}” · ${pct}% of your musical DNA</p>
      <p class="info__desc">${esc(g.description)}</p>
      ${!d ? '<p class="info__note">This genre is part of your taste but too small to get its own district, so its style shows up in neighbouring streets.</p>' : ''}
      ${venues.length ? `<div class="info__section"><h4>Venues</h4><ul class="places">${venues.map((v) => `<li><button type="button" class="place" data-action="venue" data-id="${v.id}">${ICONS.pin}<span><strong>${esc(v.name)}</strong><small>${esc(cap(venueTypeLabel(v.type)))}</small></span></button></li>`).join('')}</ul></div>` : ''}
      ${lms.length ? `<div class="info__section"><h4>Landmarks</h4><ul class="places">${lms.map((l) => `<li><button type="button" class="place" data-action="landmark" data-id="${l.id}">${ICONS.pin}<span><strong>${esc(l.name)}</strong><small>${l.type === 'historical' ? 'Historical landmark' : 'Interpretation'}</small></span></button></li>`).join('')}</ul></div>` : ''}`;
  }

  /* ---------------- music ---------------- */

  setTracks(artistId: string, value: { tracks: Track[]; degraded: boolean; source: string } | 'loading'): void {
    this.trackCache.set(artistId, value);
    this.info.querySelectorAll<HTMLElement>(`[data-tracks-for="${artistId}"]`).forEach((el) => (el.innerHTML = this.tracksHtml(artistId)));
  }

  /** Track list for a cache key: an artist id, or `lm:<landmark id>` for a soundtrack. */
  private tracksHtml(key: string): string {
    const v = this.trackCache.get(key);
    const a = ARTIST_BY_ID[key];
    if (!v) return '';
    if (v === 'loading') return '<p class="tracks__loading">Finding recordings…</p>';
    const playing = this.playerState.status !== 'idle' ? this.playerState.track.previewUrl : null;
    const rows = v.tracks
      .map((t, i) => {
        const sub = t.artist;
        return t.previewUrl
          ? `<li><button type="button" class="track ${playing === t.previewUrl ? 'is-playing' : ''}" data-action="play" data-artist="${esc(key)}" data-index="${i}">
              ${t.artworkUrl ? `<img src="${esc(t.artworkUrl)}" alt="" loading="lazy">` : '<span class="track__art"></span>'}
              <span class="track__main"><strong>${esc(t.title)}</strong><small>${esc(sub)}</small></span>
              <span class="track__icon">${playing === t.previewUrl && this.playerState.status === 'playing' ? ICONS.pause : ICONS.play}</span></button></li>`
          : `<li><a class="track" href="${esc(t.externalUrl ?? searchUrl(t.artist, t.title))}" target="_blank" rel="noopener">
              <span class="track__art"></span><span class="track__main"><strong>${esc(t.title)}</strong><small>${esc(`${t.artist} · open in Spotify`)}</small></span><span class="track__icon">${ICONS.ext}</span></a></li>`;
      })
      .join('');
    return `<ul class="track-list">${rows}</ul>
      <p class="tracks__source">${v.degraded ? 'Music data unavailable, showing curated data. ' : ''}${v.tracks.some((t) => t.previewUrl) ? '30-second previews via Apple Music.' : ''}
        ${a ? streamingLinks(a).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ') : ''}</p>`;
  }

  private playerKey = '';

  renderPlayer(s: PlayerState): void {
    this.playerState = s;
    const key = s.status === 'idle' ? 'idle' : `${s.status}|${s.track.previewUrl}`;
    if (key === this.playerKey && s.status !== 'idle') {
      const bar = this.player.querySelector<HTMLElement>('.player__bar i');
      if (bar) bar.style.width = `${(s.progress * 100).toFixed(1)}%`;
      return;
    }
    this.playerKey = key;
    if (s.status === 'idle') {
      this.player.hidden = true;
    } else {
      this.player.hidden = false;
      this.player.innerHTML = `
        ${s.track.artworkUrl ? `<img src="${esc(s.track.artworkUrl)}" alt="">` : '<span class="track__art"></span>'}
        <div class="player__main"><strong>${esc(s.track.title)}</strong><small>${esc(s.track.artist)}${s.status === 'loading' ? ' · loading…' : ''}</small>
          <span class="player__bar"><i style="width:${(s.progress * 100).toFixed(1)}%"></i></span></div>
        <button type="button" class="icon-btn" data-action="player-toggle" aria-label="${s.status === 'playing' ? 'Pause' : 'Play'}">${s.status === 'playing' ? ICONS.pause : ICONS.play}</button>
        ${this.hasNext() ? `<button type="button" class="icon-btn" data-action="player-next" aria-label="Next song">${ICONS.next}</button>` : ''}
        ${s.track.externalUrl ? `<a class="icon-btn" href="${esc(s.track.externalUrl)}" target="_blank" rel="noopener" aria-label="Open full track">${ICONS.ext}</a>` : ''}
        <button type="button" class="icon-btn" data-action="player-stop" aria-label="Stop">${ICONS.close}</button>`;
    }
    // Refresh play icons in the open panel without re-rendering it.
    this.info.querySelectorAll<HTMLElement>('[data-tracks-for]').forEach((el) => {
      const id = el.dataset.tracksFor ?? '';
      if (this.trackCache.has(id)) el.innerHTML = this.tracksHtml(id);
    });
  }
}

function searchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
