import type { MusicService, PreviewPlayer } from '../music/musicService.js';
import type { CityScene } from '../scene/CityScene.js';
import type { Passport } from '../core/passport.js';
import type { Hud } from '../ui/hud.js';
import type { Selection } from '../types.js';

/** Shared services handed to the feature controllers. */
export interface AppContext {
  scene: CityScene;
  hud: Hud;
  music: MusicService;
  player: PreviewPlayer;
  passport: Passport;
  select: (sel: Selection, opts?: { fly?: boolean }) => void;
}
