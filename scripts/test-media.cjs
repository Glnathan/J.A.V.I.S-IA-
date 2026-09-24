// Isolated regression tests: no microphone, network or API key required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports, console, ...globals });
  return exports;
}

test('Whisper releases microphone and context if the worklet cannot load', async () => {
  let released = 0, closed = 0;
  const failure = new Error('worklet blocked');
  const { VoiceCapture } = load('src/lib/client/voice-capture.ts', {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => released++ }] }) } },
    window: { AudioContext: class {
      state = 'running'; sampleRate = 48000;
      audioWorklet = { addModule: async () => { throw failure; } };
      close() { closed++; return Promise.resolve(); }
    } }, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  });
  await assert.rejects(new VoiceCapture({}).start('single'), failure);
  assert.equal(released, 1);
  assert.equal(closed, 1);
});

test('Whisper releases a permission request completed after cancellation', async () => {
  let releasePermission, released = 0;
  const { VoiceCapture } = load('src/lib/client/voice-capture.ts', {
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { releasePermission = resolve; }) } },
  });
  const cap = new VoiceCapture({});
  const pending = cap.start('single');
  cap.stop();
  releasePermission({ getTracks: () => [{ stop: () => released++ }] });
  await pending;
  assert.equal(released, 1);
});

function youtube() {
  let now = 0, removed = false, listener;
  const nodes = [], posted = [], intervals = new Map();
  let sequence = 0;
  const contentWindow = { postMessage(text) { posted.push(JSON.parse(text)); } };
  const { playYouTube } = load('src/lib/client/youtube-embed.ts', {
    require: () => ({ createMusicDock: () => ({ body: { append() {} }, setTitle() {}, setProgress() {}, remove() { removed = true; } }) }),
    document: { createElement(tag) { const node = { tag, style: {}, contentWindow, addEventListener() {}, remove() {} }; nodes.push(node); return node; } },
    window: { location: { origin: 'http://127.0.0.1:3777' }, addEventListener(_, cb) { listener = cb; }, removeEventListener() {} },
    navigator: { onLine: true }, URLSearchParams,
    Date: { now: () => now },
    setTimeout() { return ++sequence; }, clearTimeout() {},
    setInterval(cb, ms) { const id = ++sequence; intervals.set(id, { cb, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
  });
  const handle = playYouTube({ ids: ['first','second'], start: 0, duration: 30, volume: .5, title: 'Test' });
  return {
    handle, nodes, posted,
    message(event, info) { listener({ origin: 'https://www.youtube-nocookie.com', source: contentWindow, data: JSON.stringify({ event, info }) }); },
    advance(ms) { now += ms; for (const { cb, ms } of [...intervals.values()]) if (ms === 500) cb(); },
    removed: () => removed,
  };
}

test('YouTube retries an unresponsive iframe by navigating it', () => {
  const y = youtube();
  assert.match(y.nodes[0].src, /first/);
  y.advance(12500);
  assert.match(y.nodes[0].src, /second/);
  y.handle.stop(0);
});

test('YouTube subscribes to failures and waits for a click when autoplay is blocked', () => {
  const y = youtube();
  y.message('onReady');
  assert.ok(y.posted.some(p => p.func === 'addEventListener' && p.args[0] === 'onAutoplayBlocked'));
  y.message('onAutoplayBlocked');
  y.advance(12500);
  assert.match(y.nodes[0].src, /first/);
  y.message('infoDelivery', { currentTime: 1, playerState: 1 });
  y.handle.stop(0);
  return y.handle.ready.then(ok => assert.equal(ok, true));
});

test('YouTube identification refusal reports code 153 without cycling through videos', async () => {
  const y = youtube();
  y.message('onError', 153);
  assert.equal(await y.handle.ready, false);
  assert.match(y.handle.getFailReason(), /identification/);
  assert.equal(y.removed(), true);
  assert.match(y.nodes[0].src, /first/);
});
