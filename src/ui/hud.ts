import { ARTIST_BY_ID } from '../data/artists.js';
import { GENRES, genreName } from '../data/genres.js';
import { locationsFor, venueTypeLabel } from '../core/cityGenerator.js';
import { hashString, mulberry32 } from '../core/random.js';
import { discoveryChain, neighbours } from '../core/recommend.js';
import type { Tab } from '../core/store.js';
import type { Track, PlayerState } from '../music/musicService.js';
import { streamingLinks } from '../music/musicService.js';
import type { Archetype, Artist, CityPlan, GenreId, Selection } from '../types.js';
import { $, ICONS, esc, onAction } from './dom.js';

export interface HudActions {
  select(sel: Selection, opts?: { fly?: boolean }): void;
  listen(artistId: string): void;
  listenLandmark(landmarkId: string): void;
  playTrack(track: Track): void;
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
  private playerState: PlayerState = { status: 'idle' };

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
      case 'artist':
        return this.actions.select({ kind: 'artist', id: d.id ?? '' }, { fly: true });
      case 'district':
        return this.actions.select({ kind: 'district', genre: d.genre as GenreId }, { fly: true });
      case 'listen':
        return this.actions.listen(d.id ?? '');
      case 'listen-landmark':
        return this.actions.listenLandmark(d.id ?? '');
      case 'play': {
        const tracks = this.trackCache.get(d.artist ?? '');
        if (tracks && tracks !== 'loading') this.actions.playTrack(tracks.tracks[Number(d.index)]);
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
            <span class="row__main"><strong>${esc(d.name)}</strong><small>${esc(d.nickname)}</small></span>
            <span class="row__meta">${pct}%</span></button></li>`;
        })
        .join('');
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
    } else if (tab === 'landmarks') {
      const hist = plan.landmarks.filter((l) => l.type === 'historical');
      const insp = plan.landmarks.filter((l) => l.type === 'inspired');
      body =
        (hist.length ? `<li class="row-head">Historical landmarks</li>` : '') +
        hist.map((l) => `<li><button type="button" class="row" data-action="landmark" data-id="${l.id}"><span class="badge badge--hist">Hist</span><span class="row__main"><strong>${esc(l.name)}</strong><small>${esc(l.place ?? '')} · ${esc(l.date ?? '')}</small></span></button></li>`).join('') +
        `<li class="row-head">Musical interpretations</li>` +
        insp.map((l) => `<li><button type="button" class="row" data-action="landmark" data-id="${l.id}"><span class="badge badge--insp">Interp</span><span class="row__main"><strong>${esc(l.name)}</strong><small>${esc(GENRES[l.genres[0]].name)} District monument</small></span></button></li>`).join('');
    } else {
      const users = plan.artists.filter((a) => plan.userArtistIds.includes(a.id) || a.custom);
      const others = plan.artists.filter((a) => !plan.userArtistIds.includes(a.id) && !a.custom);
      const row = (a: Artist) => `<li><button type="button" class="row" data-action="artist" data-id="${a.id}">
        <span class="dot" style="background:${a.genres[0] ? GENRES[a.genres[0]].style.neon[0] : '#8e8ca6'}"></span>
        <span class="row__main"><strong>${esc(a.name)}</strong><small>${a.genres.length ? a.genres.map((g) => esc(GENRES[g].name)).join(' · ') : 'Your pick'}</small></span></button></li>`;
      body = (users.length ? `<li class="row-head">Your artists</li>${users.map(row).join('')}` : '') + `<li class="row-head">Also in town</li>${others.map(row).join('')}`;
    }
    $('#explorer-list').innerHTML = body;
    $('#explorer-title').textContent = cap(tab);
  }

  /* ---------------- build overlay ---------------- */

  showBuild(show: boolean): void {
    this.build.hidden = !show;
    this.root.classList.toggle('is-building', show);
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

  private listenBlock(artistIds: string[]): string {
    const first = artistIds.find((id) => ARTIST_BY_ID[id]);
    if (!first) return '';
    const cached = this.trackCache.get(first);
    const btn = `<button type="button" class="btn btn--primary btn--sm" data-action="listen" data-id="${first}">${ICONS.play} Listen</button>`;
    return `<div class="info__actions">${btn}${artistIds.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm" data-action="explore-artists">Explore artists</button>` : ''}</div>
      <div class="tracks" data-tracks-for="${first}">${cached ? this.tracksHtml(first) : ''}</div>`;
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
            <li><button type="button" class="chain__item" data-action="artist" data-id="${seedArtist.id}"><strong>${esc(seedArtist.name)}</strong><small>${esc(seedArtist.album.title)} (${seedArtist.album.year})</small></button></li>
            ${chain
              .map((a, i) => {
                const present = plan.venues.some((x) => x.addedBy === a.id);
                return `<li class="chain__arrow">${ICONS.arrow}</li><li><div class="chain__item">
                  <button type="button" class="chain__name" data-action="artist" data-id="${a.id}"><strong>${esc(a.name)}</strong><small>${esc(a.album.title)} (${a.album.year})</small></button>
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
      ${this.listenBlock(v.artistIds)}
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
        ${this.soundtrackBlock(l.id)}
        ${this.artistsList(l.artistIds)}`;
    }
    const g = l.genres[0];
    return `<span class="badge badge--insp">Musical interpretation</span>
      <h3>${esc(l.name)}</h3>
      <p class="info__meta">Monument of the ${esc(GENRES[g].name)} District</p>
      <p class="info__desc">${esc(l.description)}</p>
      <p class="info__note">A fictional monument generated from ${esc(GENRES[g].scene)}.</p>
      <div class="info__section"><h4>District</h4><div class="tags">${genreChip(g)}</div></div>`;
  }

  /** The album/songs tied to a historical landmark. */
  private soundtrackBlock(id: string): string {
    const l = this.plan!.landmarks.find((x) => x.id === id);
    const st = l?.soundtrack;
    if (!st) return '';
    const name = (aid: string) => ARTIST_BY_ID[aid]?.name ?? '';
    const key = `lm:${id}`;
    const multi = new Set(st.songs.map((s) => s.artistId)).size > 1;
    return `<div class="info__section soundtrack"><h4>Soundtrack</h4>
      ${st.album ? `<p class="album"><strong>${esc(st.album.title)}</strong> (${st.album.year}) · ${esc(name(st.album.artistId))}</p>` : ''}
      <p class="songs">${st.songs.map((s) => esc(s.title) + (multi ? ` <span class="songs__by">(${esc(name(s.artistId))})</span>` : '')).join(' · ')}</p>
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
      <div class="info__section"><h4>Essential</h4><p class="album"><strong>${esc(a.album.title)}</strong> (${a.album.year})</p>
        <p class="songs">${a.songs.map((s) => esc(s.title)).join(' · ')}</p></div>
      <div class="info__actions">
        <button type="button" class="btn btn--primary btn--sm" data-action="listen" data-id="${a.id}">${ICONS.play} Listen</button>
        ${!inCity || !places.length ? `<button type="button" class="btn btn--gold btn--sm" data-action="add-artist" data-id="${a.id}">${ICONS.spark} Add to my city</button>` : ''}
        ${next ? `<button type="button" class="btn btn--ghost btn--sm" data-action="artist" data-id="${next.id}">Follow connection → ${esc(next.name)}</button>` : ''}
      </div>
      <div class="tracks" data-tracks-for="${a.id}">${this.trackCache.has(a.id) ? this.tracksHtml(a.id) : ''}</div>
      ${places.length ? `<div class="info__section"><h4>In your city</h4><ul class="places">${places.map((p) => `<li><button type="button" class="place" data-action="${p.kind}" data-id="${p.id}">${ICONS.pin}<span><strong>${esc(p.name)}</strong><small>${esc(p.sub)}</small></span></button></li>`).join('')}</ul></div>` : ''}
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
    const soundtrack = key.startsWith('lm:');
    const rows = v.tracks
      .map((t, i) => {
        const sub = soundtrack ? t.artist : t.album ?? '';
        return t.previewUrl
          ? `<li><button type="button" class="track ${playing === t.previewUrl ? 'is-playing' : ''}" data-action="play" data-artist="${esc(key)}" data-index="${i}">
              ${t.artworkUrl ? `<img src="${esc(t.artworkUrl)}" alt="" loading="lazy">` : '<span class="track__art"></span>'}
              <span class="track__main"><strong>${esc(t.title)}</strong><small>${esc(sub)}</small></span>
              <span class="track__icon">${playing === t.previewUrl && this.playerState.status === 'playing' ? ICONS.pause : ICONS.play}</span></button></li>`
          : `<li><a class="track" href="${esc(t.externalUrl ?? searchUrl(t.artist, t.title))}" target="_blank" rel="noopener">
              <span class="track__art"></span><span class="track__main"><strong>${esc(t.title)}</strong><small>${esc(soundtrack ? `${t.artist} · open in Spotify` : 'Open in Spotify')}</small></span><span class="track__icon">${ICONS.ext}</span></a></li>`;
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
