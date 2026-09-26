import type { FriendState } from '../scene/CityScene.js';
import { $, esc, toast } from '../ui/dom.js';
import type { AppContext } from './context.js';

/**
 * Walk with friends, live. Browsers connect peer to peer (WebRTC data
 * channels via PeerJS); the free PeerJS cloud only introduces them. The
 * person who starts the room relays everyone's position to everyone else.
 * The room's link also carries the city, so everyone builds the same one.
 */

const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';
const PREFIX = 'musical-city-';
const COLORS = ['#ff5a7a', '#3ea0ff', '#ffd23f', '#59cd90', '#c9b6ff', '#ff9f43', '#6fe3ff', '#f28482'];

interface Conn {
  peer: string;
  open: boolean;
  send(data: unknown): void;
  on(event: 'open' | 'close' | 'error', cb: () => void): void;
  on(event: 'data', cb: (data: unknown) => void): void;
  close(): void;
}

interface PeerLike {
  id: string;
  on(event: 'open', cb: (id: string) => void): void;
  on(event: 'connection', cb: (c: Conn) => void): void;
  on(event: 'error', cb: (e: { type?: string }) => void): void;
  on(event: 'disconnected' | 'close', cb: () => void): void;
  connect(id: string, opts?: Record<string, unknown>): Conn;
  destroy(): void;
}

type PeerCtor = new (id?: string) => PeerLike;

type Msg =
  | ({ t: 'state' } & FriendState & { where?: string })
  | { t: 'bye'; id: string }
  | { t: 'wave'; id: string; name: string };

let peerCtor: Promise<PeerCtor> | null = null;
function loadPeer(): Promise<PeerCtor> {
  peerCtor ??= import(/* @vite-ignore */ PEER_URL).then((m: { Peer?: PeerCtor; default?: PeerCtor }) => {
    const P = m.Peer ?? m.default;
    if (!P) throw new Error('PeerJS failed to load');
    return P;
  });
  peerCtor.catch(() => (peerCtor = null));
  return peerCtor;
}

const randomId = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export function createTogetherController(ctx: AppContext, shareUrl: () => string, whereAmI: () => string, nav: { walkTo: (p: { x: number; z: number }) => void; goToVenue: (id: string) => void }) {
  const panel = $('#together');
  let peer: PeerLike | null = null;
  let room: string | null = null;
  let host = false;
  let conns: Conn[] = [];
  let me = { id: '', name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  const people = new Map<string, FriendState & { where?: string; seen: number }>();
  let status = '';
  let loop = 0;
  let waveCount = 0;
  let open = false;
  let invite: string | null = new URLSearchParams(location.search).get('room');

  try {
    me.name = localStorage.getItem('musical-city:name') ?? '';
  } catch {
    /* storage unavailable */
  }

  const link = () => {
    const u = new URL(shareUrl());
    if (room) u.searchParams.set('room', room);
    return u.toString();
  };

  function render() {
    ctx.hud.setTogether(!!room);
    if (!open) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const close = `<button type="button" class="icon-btn" data-tg="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button>`;
    if (!room) {
      const joining = !!invite;
      panel.innerHTML = `<div class="tour__head"><span class="tour__badge">${joining ? 'You’re invited' : 'Walk with friends'}</span>${close}</div>
        <p class="perform__lede">${joining ? 'Someone shared this city with you live. Join to see each other walking around, and hear what’s playing near them.' : 'Start a room and share the link. Friends who open it build the same city and appear next to you, live.'}</p>
        <label class="field perform__field"><span>Your name</span><input id="tg-name" maxlength="18" placeholder="Your name" value="${esc(me.name)}"></label>
        ${status ? `<p class="form-error">${esc(status)}</p>` : ''}
        <div class="tour__actions"><button type="button" class="btn btn--gold btn--sm" data-tg="${joining ? 'join' : 'host'}">${joining ? 'Join the room' : 'Start a room'}</button></div>
        <p class="tracks__source">Browsers connect directly to each other. Only names and positions are shared, and nothing is stored.</p>`;
      return;
    }
    const list = [...people.values()].filter((p) => p.id !== me.id);
    panel.innerHTML = `<div class="tour__head"><span class="tour__badge"><i class="gig-dot"></i>Live room · ${list.length + 1} here</span>${close}</div>
      <div class="tg-link"><input id="tg-link" readonly value="${esc(link())}"><button type="button" class="btn btn--ghost btn--xs" data-tg="copy">Copy link</button></div>
      <ul class="tg-people">
        <li><span class="tg-dot" style="background:${me.color}"></span><span><strong>${esc(me.name || 'You')} (you)</strong><small>${esc(whereAmI())}</small></span></li>
        ${list.length ? list.map((p) => `<li><span class="tg-dot" style="background:${p.color}"></span><span><strong>${esc(p.name)}</strong><small>${esc(p.where ?? '')}</small></span><button type="button" class="btn btn--ghost btn--xs" data-tg="goto" data-id="${esc(p.id)}">Go to</button></li>`).join('') : '<li class="tg-empty">Waiting for friends. Send them the link.</li>'}
      </ul>
      ${status ? `<p class="form-error">${esc(status)}</p>` : ''}
      <div class="tour__actions">
        <button type="button" class="btn btn--gold btn--xs" data-tg="wave">Wave</button>
        <button type="button" class="btn btn--ghost btn--xs" data-tg="leave">Leave room</button>
      </div>`;
  }

  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tg]');
    if (!b) return;
    const act = b.dataset.tg;
    const nameInput = panel.querySelector<HTMLInputElement>('#tg-name');
    if (nameInput) {
      me.name = nameInput.value.trim().slice(0, 18);
      try {
        localStorage.setItem('musical-city:name', me.name);
      } catch {
        /* storage unavailable */
      }
    }
    if (act === 'close') {
      open = false;
      render();
    } else if (act === 'host') void start(null);
    else if (act === 'join' && invite) void start(invite);
    else if (act === 'copy') {
      const input = panel.querySelector<HTMLInputElement>('#tg-link');
      void navigator.clipboard?.writeText(link()).then(
        () => toast('Room link copied. Send it to a friend.'),
        () => input?.select(),
      );
    } else if (act === 'wave') {
      waveCount++;
      broadcast({ t: 'wave', id: me.id, name: me.name || 'A friend' });
      toast('You waved.');
    } else if (act === 'leave') api.leave();
    else if (act === 'goto') {
      const p = people.get(b.dataset.id ?? '');
      if (p) goTo(p);
    }
  });

  function goTo(p: FriendState) {
    if (p.inside) {
      nav.goToVenue(p.inside);
      return;
    }
    nav.walkTo({ x: p.x, z: p.z });
  }

  function send(c: Conn, m: Msg) {
    if (c.open) c.send(m);
  }

  function broadcast(m: Msg, except?: Conn) {
    for (const c of conns) if (c !== except) send(c, m);
  }

  function receive(m: Msg, from: Conn) {
    if (!m || typeof m !== 'object') return;
    // The host relays everything to everyone else.
    if (host) broadcast(m, from);
    if (m.t === 'state') {
      if (m.id === me.id) return;
      const isNew = !people.has(m.id);
      people.set(m.id, { ...m, seen: performance.now() });
      if (isNew) {
        toast(`${m.name} joined the room.`);
        render();
      }
    } else if (m.t === 'bye') {
      const p = people.get(m.id);
      if (p) toast(`${p.name} left.`);
      people.delete(m.id);
      render();
    } else if (m.t === 'wave') {
      const p = people.get(m.id);
      if (p) p.wave = (p.wave ?? 0) + 1;
      toast(`${m.name} waves at you.`);
    }
    pushToScene();
  }

  function pushToScene() {
    ctx.scene.setFriends([...people.values()].filter((p) => p.id !== me.id));
  }

  function attach(c: Conn) {
    conns.push(c);
    c.on('data', (d) => receive(d as Msg, c));
    c.on('close', () => {
      conns = conns.filter((x) => x !== c);
      // Guests are identified by their peer id; the host by the room.
      const gone = [...people.values()].filter((p) => p.id === c.peer || (!host && c.peer === PREFIX + room));
      for (const p of gone) {
        people.delete(p.id);
        broadcast({ t: 'bye', id: p.id });
      }
      if (!host && c.peer === PREFIX + room) status = 'The room closed.';
      pushToScene();
      render();
    });
  }

  async function start(joinRoom: string | null) {
    if (!me.name) {
      status = 'Pick a name first.';
      render();
      return;
    }
    status = joinRoom ? 'Connecting…' : 'Opening a room…';
    render();
    let Peer: PeerCtor;
    try {
      Peer = await loadPeer();
    } catch {
      status = 'Couldn’t load the live connection. Check your connection and try again.';
      render();
      return;
    }
    host = !joinRoom;
    room = joinRoom ?? randomId();
    const p = new Peer(host ? PREFIX + room : undefined);
    peer = p;
    p.on('error', (e) => {
      status = e.type === 'peer-unavailable' ? 'That room isn’t open any more. Ask your friend for a new link.' : e.type === 'unavailable-id' ? 'That room name is taken. Try again.' : 'The live connection had a problem.';
      if (e.type === 'peer-unavailable' || e.type === 'unavailable-id') api.leave(false);
      render();
    });
    p.on('open', (id) => {
      me.id = id;
      status = '';
      if (host) {
        p.on('connection', (c) => {
          attach(c);
          c.on('open', () => {
            // Tell the newcomer about everyone already here.
            for (const q of people.values()) send(c, { t: 'state', ...q });
            send(c, { t: 'state', ...self() });
          });
        });
      } else {
        const c = p.connect(PREFIX + room, { reliable: true, serialization: 'json' });
        attach(c);
        c.on('open', () => {
          toast('Joined. Walk around and you’ll see each other.');
          render();
        });
      }
      if (joinRoom === null) toast('Room open. Copy the link and send it to friends.');
      window.clearInterval(loop);
      loop = window.setInterval(tick, 150);
      render();
      history.replaceState(null, '', link());
    });
  }

  function self(): FriendState & { where: string } {
    const s = ctx.scene.selfState();
    return { id: me.id, name: me.name || 'Friend', color: me.color, ...s, wave: waveCount, where: whereAmI() };
  }

  let lastRender = 0;
  function tick() {
    if (!peer || !me.id) return;
    broadcast({ t: 'state', ...self() });
    // Drop people we haven't heard from in a while.
    const now = performance.now();
    for (const [id, p] of people) {
      if (now - p.seen > 12000) {
        people.delete(id);
        pushToScene();
      }
    }
    if (open && now - lastRender > 2000) {
      lastRender = now;
      const input = document.activeElement?.id === 'tg-link';
      if (!input) render();
    }
  }

  const api = {
    get active() {
      return !!room;
    },
    open() {
      open = true;
      render();
    },
    /** Called after a city builds: opens the invite if the link had a room. */
    offerInvite() {
      if (invite && !room) {
        open = true;
        render();
      }
    },
    leave(say = true) {
      if (peer && me.id) broadcast({ t: 'bye', id: me.id });
      window.clearInterval(loop);
      const p = peer;
      window.setTimeout(() => p?.destroy(), 200);
      peer = null;
      conns = [];
      people.clear();
      room = null;
      host = false;
      me = { ...me, id: '' };
      invite = null;
      pushToScene();
      const u = new URL(location.href);
      u.searchParams.delete('room');
      history.replaceState(null, '', u.toString());
      if (say) toast('You left the room.');
      render();
    },
  };
  window.addEventListener('beforeunload', () => {
    if (peer && me.id) broadcast({ t: 'bye', id: me.id });
  });
  return api;
}
