// 음원 없이 작은 종이 스침과 안착 소리를 합성한다.
let enabled = true, context, noise, lastTick = -Infinity;
try { enabled = localStorage.getItem('dictionary-sound') !== 'off'; } catch {}

function unlock() {
  try {
    if (!context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
  } catch {}
}

function burst(delay, duration, frequency, volume) {
  if (!enabled || !noise || context.state !== 'running') return;
  try {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    const at = context.currentTime + delay;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(at); source.stop(at + duration);
  } catch {}
}

export const paperSound = {
  get enabled() { return enabled; },
  unlock,
  toggle() {
    enabled = !enabled;
    try { localStorage.setItem('dictionary-sound', enabled ? 'on' : 'off'); } catch {}
    return enabled;
  },
  start(sheets) {
    const count = Math.min(10, Math.max(1, Math.round(sheets)));
    burst(0, count === 1 ? .13 : .32 + count * .018, count === 1 ? 2200 : 1100, .035);
    if (count > 1) for (let i = 0; i < count; i++) burst(.025 + i * .035, .025, 750, .012);
  },
  land() { burst(0, .09, 380, .045); },
  tick() {
    if (!enabled || context?.state !== 'running' || context.currentTime - lastTick < .04) return;
    lastTick = context.currentTime;
    burst(0, .018, 2400, .012);
  },
};
