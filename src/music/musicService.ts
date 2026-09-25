import type { Artist } from '../types.js';
import { normalize } from '../core/resolve.js';

/**
 * Music playback is pluggable. The MVP ships two providers:
 *  - ItunesPreviewProvider: Apple's public Search API, which returns official
 *    30-second previews (no key required).
 *  - CuratedProvider: offline fallback using the local catalogue (no audio,
 *    links out to streaming services).
 * A Spotify or Apple Music SDK provider can implement `MusicProvider` later.
 */

export interface Track {
  title: string;
  artist: string;
  album?: string;
  previewUrl?: string;
  artworkUrl?: string;
  externalUrl?: string;
}

export interface MusicProvider {
  readonly id: string;
  readonly label: string;
  tracksFor(artist: Artist, signal?: AbortSignal): Promise<Track[]>;
}

export interface TrackResult {
  tracks: Track[];
  source: string;
  /** Set when a remote provider failed and we fell back. */
  degraded: boolean;
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  kind?: string;
}

export class ItunesPreviewProvider implements MusicProvider {
  readonly id = 'itunes';
  readonly label = 'Apple Music previews';

  async tracksFor(artist: Artist, signal?: AbortSignal): Promise<Track[]> {
    const url = `https://itunes.apple.com/search?${new URLSearchParams({
      term: artist.name,
      entity: 'song',
      attribute: 'artistTerm',
      limit: '25',
      country: 'US',
    })}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
    const json = (await res.json()) as { results?: ItunesResult[] };
    const want = normalize(artist.name);
    const aliases = (artist.aliases ?? []).map(normalize);
    const seen = new Set<string>();
    const tracks: Track[] = [];
    for (const r of json.results ?? []) {
      if (r.kind !== 'song' || !r.previewUrl || !r.trackName) continue;
      const got = normalize(r.artistName ?? '');
      if (got !== want && !aliases.includes(got) && !got.startsWith(want)) continue;
      const key = normalize(r.trackName);
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push({
        title: r.trackName,
        artist: r.artistName ?? artist.name,
        album: r.collectionName,
        previewUrl: r.previewUrl,
        artworkUrl: r.artworkUrl100,
        externalUrl: r.trackViewUrl,
      });
    }
    // Put the catalogue's signature songs first when the service has them.
    const signature = artist.songs.map((s) => normalize(s.title));
    tracks.sort((a, b) => rank(a) - rank(b));
    function rank(t: Track) {
      const i = signature.findIndex((s) => normalize(t.title).startsWith(s));
      return i === -1 ? 99 : i;
    }
    return tracks.slice(0, 6);
  }
}

export class CuratedProvider implements MusicProvider {
  readonly id = 'curated';
  readonly label = 'Curated catalogue';

  async tracksFor(artist: Artist): Promise<Track[]> {
    return artist.songs.map((s) => ({
      title: s.title,
      artist: artist.name,
      album: artist.album.title || undefined,
      externalUrl: streamingLinks(artist, s.title)[0].url,
    }));
  }
}

export function streamingLinks(artist: Artist, song?: string): { label: string; url: string }[] {
  const q = encodeURIComponent(song ? `${artist.name} ${song}` : artist.name);
  return [
    { label: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { label: 'Apple Music', url: `https://music.apple.com/us/search?term=${q}` },
    { label: 'YouTube Music', url: `https://music.youtube.com/search?q=${q}` },
  ];
}

export interface SongRequest {
  artist: Artist;
  title: string;
}

/** Looks up one specific song on the iTunes Search API. */
async function findSong(req: SongRequest, signal?: AbortSignal): Promise<Track | null> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term: `${req.artist.name} ${req.title}`,
    entity: 'song',
    limit: '15',
    country: 'US',
  })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const json = (await res.json()) as { results?: ItunesResult[] };
  const want = normalize(req.artist.name);
  const aliases = (req.artist.aliases ?? []).map(normalize);
  const title = normalize(req.title);
  const candidates = (json.results ?? []).filter((r) => {
    if (r.kind !== 'song' || !r.previewUrl || !r.trackName) return false;
    const got = normalize(r.artistName ?? '');
    return got === want || aliases.includes(got) || got.startsWith(want);
  });
  // Prefer an exact title, then a version whose title starts with it (e.g. "- Remastered").
  const exact = candidates.find((r) => normalize(r.trackName ?? '') === title);
  const loose = candidates.find((r) => normalize(r.trackName ?? '').startsWith(title));
  const r = exact ?? loose;
  if (!r) return null;
  return {
    title: r.trackName ?? req.title,
    artist: r.artistName ?? req.artist.name,
    album: r.collectionName,
    previewUrl: r.previewUrl,
    artworkUrl: r.artworkUrl100,
    externalUrl: r.trackViewUrl,
  };
}

export class MusicService {
  private cache = new Map<string, TrackResult>();
  private remoteHealthy = true;

  /**
   * Songs from every artist at a place, interleaved (A1, B1, C1, A2, B2…) so
   * each act gets heard rather than only the first one listed.
   */
  async tracksForArtists(artists: Artist[], perArtist = 2): Promise<TrackResult> {
    const results = await Promise.all(artists.map((a) => this.tracksFor(a)));
    const lists = results.map((r, i) => {
      const withPreview = r.tracks.filter((t) => t.previewUrl).slice(0, perArtist);
      return withPreview.length ? withPreview : r.tracks.slice(0, 1).map((t) => ({ ...t, artist: t.artist || artists[i].name }));
    });
    const tracks: Track[] = [];
    for (let round = 0; round < perArtist; round++) for (const l of lists) if (l[round]) tracks.push(l[round]);
    return {
      tracks,
      source: results.find((r) => !r.degraded)?.source ?? results[0]?.source ?? 'Curated catalogue',
      degraded: results.length > 0 && results.every((r) => r.degraded),
    };
  }

  /**
   * Specific songs (e.g. a landmark's soundtrack), in order. Songs the preview
   * service can't find still appear, linking out to streaming services.
   */
  async tracksForSongs(key: string, songs: SongRequest[]): Promise<TrackResult> {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const fallback = (s: SongRequest): Track => ({
      title: s.title,
      artist: s.artist.name,
      externalUrl: streamingLinks(s.artist, s.title)[0].url,
    });
    if (!this.remoteHealthy) return { tracks: songs.map(fallback), source: 'Curated catalogue', degraded: true };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const found = await Promise.allSettled(songs.map((s) => findSong(s, ctrl.signal)));
      if (found.every((f) => f.status === 'rejected')) throw new Error('all lookups failed');
      const tracks = found.map((f, i) => (f.status === 'fulfilled' && f.value ? f.value : fallback(songs[i])));
      const result = { tracks, source: 'Apple Music previews', degraded: false };
      this.cache.set(key, result);
      return result;
    } catch (err) {
      console.warn('[music] soundtrack lookup failed, using curated data', err);
      this.remoteHealthy = false;
      setTimeout(() => (this.remoteHealthy = true), 60_000);
      return { tracks: songs.map(fallback), source: 'Curated catalogue', degraded: true };
    } finally {
      clearTimeout(timer);
    }
  }

  constructor(
    private remote: MusicProvider | null = new ItunesPreviewProvider(),
    private fallback: MusicProvider = new CuratedProvider(),
  ) {}

  async tracksFor(artist: Artist): Promise<TrackResult> {
    const cached = this.cache.get(artist.id);
    if (cached) return cached;
    if (this.remote && this.remoteHealthy && !artist.custom) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const tracks = await this.remote.tracksFor(artist, ctrl.signal);
        if (tracks.length) {
          const result = { tracks, source: this.remote.label, degraded: false };
          this.cache.set(artist.id, result);
          return result;
        }
      } catch (err) {
        console.warn('[music] remote provider failed, using curated data', err);
        this.remoteHealthy = false;
        setTimeout(() => (this.remoteHealthy = true), 60_000);
      } finally {
        clearTimeout(timer);
      }
      const tracks = await this.fallback.tracksFor(artist);
      return { tracks, source: this.fallback.label, degraded: true };
    }
    const tracks = await this.fallback.tracksFor(artist);
    return { tracks, source: this.fallback.label, degraded: !!this.remote && !artist.custom };
  }
}

export type PlayerState =
  | { status: 'idle' }
  | { status: 'loading' | 'playing' | 'paused'; track: Track; progress: number };

/** Single shared audio element for 30s previews. */
export class PreviewPlayer {
  private audio = new Audio();
  private listeners = new Set<(s: PlayerState) => void>();
  private state: PlayerState = { status: 'idle' };
  /** Tracks that play one after another (e.g. every act at a venue). */
  private queue: Track[] = [];

  constructor() {
    this.audio.preload = 'none';
    this.audio.volume = 0.8;
    this.audio.addEventListener('timeupdate', () => this.progress());
    this.audio.addEventListener('playing', () => this.update('playing'));
    this.audio.addEventListener('pause', () => this.update('paused'));
    this.audio.addEventListener('ended', () => {
      this.update('paused', 1);
      if (!this.next()) this.queue = [];
    });
    this.audio.addEventListener('error', () => this.stop());
  }

  /** Plays a list in order, starting at `start`, skipping tracks without previews. */
  playQueue(tracks: Track[], start = 0): void {
    this.queue = tracks.filter((t) => t.previewUrl);
    const first = tracks[start]?.previewUrl ? tracks[start] : this.queue[0];
    if (first) this.load(first);
  }

  /** Skips to the next track in the queue. Returns false at the end. */
  next(): boolean {
    const i = this.queue.findIndex((t) => this.state.status !== 'idle' && t.previewUrl === this.state.track.previewUrl);
    const nextTrack = this.queue[i + 1];
    if (!nextTrack) return false;
    this.load(nextTrack);
    return true;
  }

  get hasNext(): boolean {
    const i = this.queue.findIndex((t) => this.state.status !== 'idle' && t.previewUrl === this.state.track.previewUrl);
    return i >= 0 && i < this.queue.length - 1;
  }

  /** Plays one track. If it belongs to the current queue, the queue carries on after it. */
  play(track: Track): void {
    if (!track.previewUrl) return;
    if (!this.queue.some((t) => t.previewUrl === track.previewUrl)) this.queue = [];
    if (this.state.status !== 'idle' && this.state.track.previewUrl === track.previewUrl) {
      this.toggle();
      return;
    }
    this.load(track);
  }

  private load(track: Track): void {
    if (!track.previewUrl) return;
    this.audio.src = track.previewUrl;
    this.state = { status: 'loading', track, progress: 0 };
    this.emit();
    this.audio.play().catch(() => this.stop());
  }

  /** 0–1, used to fade music in and out while walking. */
  setVolume(v: number): void {
    this.audio.volume = Math.max(0, Math.min(1, v));
  }

  get current(): Track | null {
    return this.state.status === 'idle' ? null : this.state.track;
  }

  toggle(): void {
    if (this.state.status === 'idle') return;
    if (this.audio.paused) void this.audio.play().catch(() => this.stop());
    else this.audio.pause();
  }

  stop(): void {
    this.queue = [];
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.state = { status: 'idle' };
    this.emit();
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private progress() {
    if (this.state.status === 'idle') return;
    const d = this.audio.duration || 30;
    this.state = { ...this.state, progress: Math.min(1, this.audio.currentTime / d) };
    this.emit();
  }

  private update(status: 'playing' | 'paused', progress?: number) {
    if (this.state.status === 'idle') return;
    this.state = { ...this.state, status, progress: progress ?? this.state.progress };
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }
}
