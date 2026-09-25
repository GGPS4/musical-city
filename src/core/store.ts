import type { CityPlan, Selection } from '../types.js';

type Listener<T> = (state: T, prev: T) => void;

/** Minimal observable store; enough for this app without pulling in a framework. */
export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(patch: Partial<T>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const l of this.listeners) l(this.state, prev);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export type Phase = 'landing' | 'building' | 'city';
export type Tab = 'districts' | 'venues' | 'landmarks' | 'artists';

export interface AppState {
  phase: Phase;
  inputs: string[];
  plan: CityPlan | null;
  selection: Selection;
  /** Artist whose locations are lit up across the city. */
  focusArtist: string | null;
  tab: Tab;
  listOpen: boolean;
  /** Increments whenever the plan is mutated in place (e.g. an artist is introduced). */
  planVersion: number;
}

export const store = new Store<AppState>({
  phase: 'landing',
  inputs: [],
  plan: null,
  selection: null,
  focusArtist: null,
  tab: 'venues',
  listOpen: false,
  planVersion: 0,
});
