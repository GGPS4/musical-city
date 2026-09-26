/**
 * City sounds, synthesised with Web Audio (no audio files): traffic hum and
 * passing cars, crowd murmur near venues, rain, wind up high, water by the
 * river and crickets in the parks at night. Each layer's level comes from
 * where you are, set a few times a second through `set()`.
 */

export interface AmbienceMix {
  traffic: number;
  crowd: number;
  rain: number;
  wind: number;
  water: number;
  crickets: number;
  /** 0 outside, 1 inside a venue (muffles the street). */
  inside: number;
  /** Lower everything while music is playing. */
  duck: boolean;
}

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'pink' | 'brown', seconds = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  return buf;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private street: BiquadFilterNode | null = null;
  private gains: Partial<Record<keyof AmbienceMix, GainNode>> = {};
  private crowdBands: GainNode[] = [];
  private timers: number[] = [];
  private mix: AmbienceMix = { traffic: 0, crowd: 0, rain: 0, wind: 0, water: 0, crickets: 0, inside: 0, duck: false };
  running = false;

  start(): boolean {
    try {
      if (!this.ctx) this.build();
      void this.ctx!.resume();
      this.running = true;
      this.master!.gain.setTargetAtTime(0.55, this.ctx!.currentTime, 0.8);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    if (!this.ctx || !this.master) return;
    this.running = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    window.setTimeout(() => {
      if (!this.running) void this.ctx?.suspend();
    }, 1200);
  }

  /** A burst of cheering and whistles (works even when city sounds are off). */
  cheer(strength = 1): void {
    try {
      if (!this.ctx) this.build();
      const ctx = this.ctx!;
      void ctx.resume();
      const t = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.5 * strength, t + 0.25);
      out.gain.setTargetAtTime(0, t + 1.2, 0.7);
      out.connect(ctx.destination);
      for (const f of [700, 1400, 2600]) {
        const src = ctx.createBufferSource();
        src.buffer = this.cheerBuffer ??= noiseBuffer(ctx, 'pink', 4);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 0.8;
        src.connect(bp).connect(out);
        src.start(t, Math.random());
        src.stop(t + 4);
      }
      // A few whistles.
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const s0 = t + 0.2 + Math.random() * 1.2;
        o.frequency.setValueAtTime(1800 + Math.random() * 600, s0);
        o.frequency.linearRampToValueAtTime(2800 + Math.random() * 500, s0 + 0.35);
        g.gain.setValueAtTime(0, s0);
        g.gain.linearRampToValueAtTime(0.05 * strength, s0 + 0.05);
        g.gain.linearRampToValueAtTime(0, s0 + 0.4);
        o.connect(g).connect(ctx.destination);
        o.start(s0);
        o.stop(s0 + 0.45);
      }
    } catch {
      /* no audio */
    }
  }

  private cheerBuffer: AudioBuffer | null = null;

  set(mix: AmbienceMix): void {
    this.mix = mix;
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const now = ctx.currentTime;
    const duck = mix.duck ? 0.45 : 1;
    const outside = 1 - mix.inside * 0.85;
    const level = (k: keyof AmbienceMix, v: number) => this.gains[k]?.gain.setTargetAtTime(Math.max(0, v) * duck, now, 0.6);
    level('traffic', mix.traffic * 0.55 * outside);
    level('rain', mix.rain * 0.4 * (1 - mix.inside * 0.7));
    level('wind', mix.wind * 0.45 * outside);
    level('water', mix.water * 0.5 * outside);
    level('crickets', mix.crickets * 0.05 * outside);
    level('crowd', mix.crowd * 0.5);
    // Inside, the street goes dull and distant.
    this.street?.frequency.setTargetAtTime(mix.inside > 0.5 ? 380 : 12000, now, 0.4);
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    // Everything from outside goes through a filter that muffles it when you're indoors.
    const street = ctx.createBiquadFilter();
    street.type = 'lowpass';
    street.frequency.value = 12000;
    street.connect(master);
    this.street = street;

    const white = noiseBuffer(ctx, 'white');
    const pink = noiseBuffer(ctx, 'pink');
    const brown = noiseBuffer(ctx, 'brown', 4);
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = Math.random();
      s.start(0, Math.random() * buf.duration);
      return s;
    };
    const layer = (key: keyof AmbienceMix, dest: AudioNode = street) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dest);
      this.gains[key] = g;
      return g;
    };

    // Traffic: a low rumble plus cars passing by, panned left to right.
    const traffic = layer('traffic');
    const rumbleF = ctx.createBiquadFilter();
    rumbleF.type = 'lowpass';
    rumbleF.frequency.value = 320;
    loop(brown).connect(rumbleF).connect(traffic);
    const passCar = () => {
      if (this.running && this.mix.traffic > 0.2 && this.mix.inside < 0.5) {
        const t = ctx.currentTime;
        const src = loop(pink);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(250, t);
        bp.frequency.linearRampToValueAtTime(900, t + 1.4);
        bp.frequency.linearRampToValueAtTime(300, t + 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.9 * this.mix.traffic, t + 1.4);
        g.gain.linearRampToValueAtTime(0, t + 3);
        const pan = ctx.createStereoPanner();
        const dir = Math.random() < 0.5 ? -1 : 1;
        pan.pan.setValueAtTime(-0.9 * dir, t);
        pan.pan.linearRampToValueAtTime(0.9 * dir, t + 3);
        src.connect(bp).connect(g).connect(pan).connect(traffic);
        src.stop(t + 3.2);
      }
      this.timers.push(window.setTimeout(passCar, 1800 + Math.random() * 5000));
    };
    passCar();

    // Crowd: three talk-band filters whose levels wobble like overlapping voices.
    const crowd = ctx.createGain();
    crowd.gain.value = 0;
    crowd.connect(master);
    this.gains.crowd = crowd;
    for (const f of [420, 900, 1700]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      loop(pink).connect(bp).connect(g).connect(crowd);
      this.crowdBands.push(g);
    }
    const chatter = () => {
      if (this.running) for (const g of this.crowdBands) g.gain.setTargetAtTime(0.15 + Math.random() * 0.5, ctx.currentTime, 0.08);
      this.timers.push(window.setTimeout(chatter, 120 + Math.random() * 160));
    };
    chatter();

    // Rain: bright hiss.
    const rain = layer('rain', master);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    loop(white).connect(hp).connect(rain);

    // Wind: slow, breathy low noise with a moving filter.
    const wind = layer('wind');
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(wf.frequency);
    lfo.start();
    loop(pink).connect(wf).connect(wind);

    // Water: gentle lapping by the river.
    const water = layer('water');
    const bpw = ctx.createBiquadFilter();
    bpw.type = 'bandpass';
    bpw.frequency.value = 520;
    bpw.Q.value = 0.6;
    const lap = ctx.createOscillator();
    lap.frequency.value = 0.35;
    const lapAmt = ctx.createGain();
    lapAmt.gain.value = 0.4;
    const waterAmp = ctx.createGain();
    waterAmp.gain.value = 0.6;
    lap.connect(lapAmt).connect(waterAmp.gain);
    lap.start();
    loop(pink).connect(bpw).connect(waterAmp).connect(water);

    // Crickets: a high tone chirped on and off.
    const crickets = layer('crickets');
    const tone = ctx.createOscillator();
    tone.frequency.value = 4300;
    const chirp = ctx.createGain();
    chirp.gain.value = 0;
    tone.connect(chirp).connect(crickets);
    tone.start();
    const chirpLoop = () => {
      if (this.running && this.mix.crickets > 0.05) {
        const t = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          chirp.gain.setValueAtTime(1, t + i * 0.06);
          chirp.gain.setValueAtTime(0, t + i * 0.06 + 0.03);
        }
      }
      this.timers.push(window.setTimeout(chirpLoop, 500 + Math.random() * 700));
    };
    chirpLoop();
  }
}
