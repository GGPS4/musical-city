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

export class MusicService {
  private cache = new Map<string, TrackResult>();
  private remoteHealthy = true;

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

  constructor() {
    this.audio.preload = 'none';
    this.audio.volume = 0.8;
    this.audio.addEventListener('timeupdate', () => this.progress());
    this.audio.addEventListener('playing', () => this.update('playing'));
    this.audio.addEventListener('pause', () => this.update('paused'));
    this.audio.addEventListener('ended', () => this.update('paused', 1));
    this.audio.addEventListener('error', () => this.stop());
  }

  play(track: Track): void {
    if (!track.previewUrl) return;
    if (this.state.status !== 'idle' && this.state.track.previewUrl === track.previewUrl) {
      this.toggle();
      return;
    }
    this.audio.src = track.previewUrl;
    this.state = { status: 'loading', track, progress: 0 };
    this.emit();
    this.audio.play().catch(() => this.stop());
  }

  toggle(): void {
    if (this.state.status === 'idle') return;
    if (this.audio.paused) void this.audio.play().catch(() => this.stop());
    else this.audio.pause();
  }

  stop(): void {
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
