import test from 'node:test';
import assert from 'node:assert/strict';

test('종이 소리: 첫 입력에 생성, 한 장·묶음·안착, 음소거·저장·미지원', async () => {
  const originalAudio = globalThis.AudioContext, originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = [], stored = new Map();
  let created = 0, audio;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  class Audio {
    constructor() { created++; audio = this; this.state = 'running'; this.sampleRate = 100; this.currentTime = 0; }
    createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
    createBufferSource() { return { ...node(), start: (at) => calls.push(at), stop() {} }; }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
    createGain() { return { ...node(), gain: param() }; }
  }
  try {
    globalThis.AudioContext = Audio;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value),
    } });
    const { paperSound: sound } = await import('../src/sound.js?test');
    sound.start(1); assert.equal(created, 0); assert.equal(calls.length, 0);
    sound.unlock(); sound.unlock(); assert.equal(created, 1);
    sound.start(1); sound.land(); assert.equal(calls.length, 2);
    calls.length = 0;
    sound.start(100); assert.equal(calls.length, 11);
    calls.length = 0;
    sound.tick(); sound.tick(); assert.deepEqual(calls, [0]);
    audio.currentTime = .039; sound.tick(); assert.equal(calls.length, 1);
    audio.currentTime = .04; sound.tick(); assert.equal(calls.length, 2);
    for (let ms = 41; ms < 1000; ms++) { audio.currentTime = ms / 1000; sound.tick(); }
    assert.ok(calls.length <= 25 && calls.length >= 20);
    calls.length = 0;
    sound.start(100);
    sound.toggle(); sound.start(1); sound.land(); assert.equal(calls.length, 11);
    audio.currentTime = 2; sound.tick(); assert.equal(calls.length, 11);
    assert.equal(stored.get('dictionary-sound'), 'off');
    const { paperSound: reloaded } = await import('../src/sound.js?reload');
    assert.equal(reloaded.enabled, false);
    globalThis.AudioContext = undefined;
    const { paperSound: unsupported } = await import('../src/sound.js?unsupported');
    assert.doesNotThrow(() => { unsupported.unlock(); unsupported.start(1); unsupported.land(); unsupported.tick(); });
    globalThis.AudioContext = class { constructor() { throw new Error('사용 불가'); } };
    const { paperSound: failed } = await import('../src/sound.js?failed');
    assert.doesNotThrow(() => { failed.unlock(); failed.start(2); failed.land(); failed.tick(); });
  } finally {
    if (originalAudio === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = originalAudio;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage;
  }
});
