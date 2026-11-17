// All sound is synthesised with WebAudio: engine hum, gunshots, sirens,
// a small sunset music loop and UI blips. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed, always running.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, volume, freq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start();
  }

  function tone(freq, duration, type, volume, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + duration + 0.05);
  }

  // A lazy sunset groove: Am – F – C – G bass notes with a soft pluck on top.
  const BASS = [110, 87.31, 130.81, 98];
  const PLUCK = [440, 523.25, 659.25, 392, 440, 587.33, 523.25, 659.25];

  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const bar = Math.floor(musicStep / 4) % 4;
      if (musicStep % 4 === 0) tone(BASS[bar], 0.9, 'triangle', 0.16);
      if (musicStep % 2 === 0) tone(PLUCK[musicStep % PLUCK.length], 0.35, 'sine', 0.05);
      musicStep += 1;
    }, 300);
  }

  return {
    /** Call from a user gesture (the Start button). Safe to call any time. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startMusic();
    },
    setEngine(speed01, driving) {
      if (!ctx || !engineOsc) return;
      engineOsc.frequency.value = 50 + speed01 * 130;
      engineGain.gain.value = driving ? 0.05 + speed01 * 0.06 : 0.0;
    },
    gunshot() { noiseBurst(0.14, 0.5, 2600); tone(160, 0.08, 'square', 0.18); },
    punch() { noiseBurst(0.08, 0.3, 900); },
    explosion() { noiseBurst(0.7, 0.7, 500); tone(55, 0.6, 'sine', 0.4); },
    siren() { tone(720, 0.45, 'sine', 0.07); tone(950, 0.45, 'sine', 0.07, 0.45); },
    cash() { tone(880, 0.1, 'sine', 0.12); tone(1318, 0.18, 'sine', 0.12, 0.09); },
    click() { tone(660, 0.06, 'sine', 0.1); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.11)); },
    busted() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.16)); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
}
