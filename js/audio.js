/**
 * audio.js — tiny procedural sound engine shared by both game versions.
 *
 * No external audio files: every effect is synthesized on the fly with the
 * WebAudio API (oscillators + filtered noise), the same "generate
 * everything, ship no binary assets" approach already used for the 3D
 * textures. Browsers block audio until a user gesture, so call
 * `SFX.unlock()` from a click handler (the LAUNCH/RESUME/RETRY buttons
 * already are one) before anything else plays.
 */

const SFX = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  try {
    muted = localStorage.getItem('cyberspace-muted') === '1';
  } catch (e) {
    // localStorage can throw in private/file:// contexts — default to unmuted
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer(ctx);
    return ctx;
  }

  function makeNoiseBuffer(c) {
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // A short, percussive tone with an exponential-decay envelope. Sliding the
  // frequency (slideTo) gives blips/lasers their characteristic pitch drop.
  function tone({ freq = 440, dur = 0.15, type = 'square', vol = 0.3, slideTo = null, delay = 0 }) {
    if (muted || !ensureCtx()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A filtered white-noise burst — explosions, impacts, static.
  function noiseBurst({ dur = 0.3, vol = 0.4, filterFreq = 1200, filterType = 'lowpass', delay = 0 }) {
    if (muted || !ensureCtx()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // A sustained engine hum. Returns a handle the caller must stop() when
  // thrust is released; safe to call even if audio isn't available yet.
  // Kept deliberately quiet and low-passed — it's continuous, so even a
  // modest gain reads as much louder next to the other short, decaying SFX.
  function startHum({ freq = 90, vol = 0.05 } = {}) {
    if (!ensureCtx()) return { setFreq() {}, setVol() {}, stop() {} };
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = muted ? 0 : vol;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    let stopped = false;
    return {
      setFreq(f) {
        if (!stopped) osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      },
      setVol(v) {
        if (!stopped) gain.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.08);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const t0 = ctx.currentTime;
        gain.gain.setTargetAtTime(0.0001, t0, 0.06);
        osc.stop(t0 + 0.3);
      },
    };
  }

  return {
    // Must be called from inside a user-gesture handler before any sound
    // will actually be audible (browser autoplay policy).
    unlock() {
      ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    isMuted() {
      return muted;
    },
    setMuted(m) {
      muted = m;
      try {
        localStorage.setItem('cyberspace-muted', m ? '1' : '0');
      } catch (e) {
        /* ignore */
      }
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },

    // ---- gameplay effects --------------------------------------------
    fire() {
      tone({ freq: 880, slideTo: 220, dur: 0.09, type: 'square', vol: 0.18 });
    },
    explode(big = false) {
      noiseBurst({ dur: big ? 0.55 : 0.3, vol: big ? 0.5 : 0.35, filterFreq: big ? 900 : 1400 });
      tone({ freq: big ? 140 : 220, slideTo: 40, dur: big ? 0.4 : 0.2, type: 'sawtooth', vol: big ? 0.3 : 0.18 });
    },
    shipHit() {
      tone({ freq: 180, slideTo: 60, dur: 0.35, type: 'sawtooth', vol: 0.35 });
      noiseBurst({ dur: 0.25, vol: 0.3, filterFreq: 600 });
    },
    bugSpawn() {
      tone({ freq: 300, slideTo: 700, dur: 0.25, type: 'sine', vol: 0.16 });
    },
    bugKill() {
      tone({ freq: 900, slideTo: 100, dur: 0.18, type: 'square', vol: 0.22 });
      noiseBurst({ dur: 0.12, vol: 0.2, filterFreq: 2000 });
    },
    uiClick() {
      tone({ freq: 520, dur: 0.06, type: 'square', vol: 0.15 });
    },
    start() {
      tone({ freq: 220, slideTo: 660, dur: 0.4, type: 'sawtooth', vol: 0.2 });
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.22, delay: i * 0.12 }));
    },
    gameover() {
      [392, 349, 293, 220].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'sawtooth', vol: 0.22, delay: i * 0.15 }));
    },
    startHum,
  };
})();
