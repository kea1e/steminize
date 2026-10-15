// Exercise the real worker message/job/cache path; only the expensive ONNX network is replaced.
import assert from 'node:assert/strict';
import { SEGMENT } from '../src/engine/separate.ts';

export async function testWorkerSessions() {
  for (const memory of process.env.WORKER_MEMORY === 'unknown' ? [undefined] : [4, undefined, 8]) {
    let creates = 0, releases = 0, live = 0, peak = 0;
    let failRun = false;
    const messages: any[] = [];
    const scope: any = { name: '', crossOriginIsolated: false, postMessage(m: any) {
      messages.push(m);
      if (m.type === 'need-model') queueMicrotask(() => scope.onmessage({ data: { type: 'model-bytes', key: m.key, bytes: new ArrayBuffer(0) } }));
    } };
    Object.defineProperty(globalThis, 'self', { value: scope, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { deviceMemory: memory, hardwareConcurrency: 4, gpu: { requestAdapter: async () => ({}) } }, configurable: true });
    const { initWorker } = await import(`../src/engine/worker.ts?memory=${memory}`);
    initWorker({ env: { wasm: {} }, Tensor: class {}, InferenceSession: { create: async () => {
      creates++; live++; peak = Math.max(peak, live);
      return { inputNames: ['x'], outputNames: ['y'], release: async () => { releases++; live--; }, run: async () => {
        if (failRun) throw new Error('out of memory');
        return { y: { getData: async () => new Float32Array(6 * 2 * SEGMENT), dispose() {} } };
      } };
    } } } as any);
    let id = 0;
    const run = async (over: object = {}) => {
      await scope.onmessage({ data: { type: 'separate', id: String(++id), mix: [new Float32Array([0, 1]), new Float32Array([1, 0])], model: 'htdemucs_6s', precision: 'compact', device: 'cpu', shifts: 1, overlap: .25, twoStems: '', skip: [], ...over } });
      return messages.at(-1);
    };
    assert.equal((await run()).type, 'done');
    assert.ok(messages.some(m => m.type === 'progress' && /Initializing model/.test(m.stage)), 'cold startup identifies initialization, not download');
    messages.length = 0;
    assert.equal((await run()).type, 'done');
    assert.ok(!messages.some(m => m.type === 'progress' && m.done < 0), 'warm cache hit does not claim to initialize');
    assert.equal(creates, 1, `deviceMemory=${memory}: ordinary model should reuse its initialized session`);
    assert.equal(releases, 0);
    if (memory !== 8) {
      await run({ model: 'htdemucs' });
      assert.equal(releases, 1, 'model switch releases the previous session');
      await run({ model: 'htdemucs', device: 'auto' });
      assert.equal(releases, 2, 'backend switch releases the previous session');
      await run({ model: 'htdemucs_ft', device: 'cpu' });
      assert.equal(live, 0, 'specialist bag still releases every member');
      await run({ model: 'htdemucs_ft', twoStems: 'vocals' });
      assert.equal(live, 0, 'a single selected specialist is still explicitly released');
      assert.equal(peak, 1, 'low/unknown memory never holds more than one session');
    } else {
      await run({ precision: 'full' });
      await run({ model: 'htdemucs' });
      await run({ model: 'htdemucs', precision: 'full' });
      assert.equal(live, 4, 'capable devices retain the existing four-session limit');
      const beforeHit = creates;
      await run(); // LRU bump for the original compact six-stem model.
      assert.equal(creates, beforeHit);
      await run({ device: 'auto' });
      assert.equal(live, 4);
      assert.equal(peak, 4, 'eviction happens before loading a fifth session');
      const beforeReload = creates;
      await run({ precision: 'full' });
      assert.equal(creates, beforeReload + 1, 'least recently used session was evicted');
    }
    await run();
    failRun = true;
    assert.equal((await run()).type, 'error');
    assert.equal(live, 0, 'failed inference releases cached sessions for memory recovery');
    failRun = false;
    const before = creates;
    assert.equal((await run()).type, 'done');
    assert.equal(creates, before + 1, 'retry initializes a fresh session after failure');
    console.log(`PASS  worker session reuse, bounded eviction, specialist release and recovery: deviceMemory=${memory}`);
  }
}
await testWorkerSessions();

// Explicit cancellation must still discard the entire worker (and every retained session).
const workers: any[] = [];
Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {
  terminated = false;
  constructor() { workers.push(this); }
  postMessage() {}
  terminate() { this.terminated = true; }
} });
const { Engine } = await import('../src/engine/client.ts');
const engine = new Engine();
const pending = engine.separate({ id: 'cancel-me', mix: [new Float32Array(1), new Float32Array(1)], model: 'htdemucs_6s', precision: 'compact', device: 'cpu', shifts: 1, overlap: .25, twoStems: '', skip: [] }, () => {});
const rejected = assert.rejects(pending, { name: 'Cancelled' });
engine.cancel('cancel-me');
await rejected;
assert.equal(workers[0].terminated, true);
assert.equal(workers.length, 2, 'cancel replaces the worker, so the next job starts clean');
console.log('PASS  explicit cancellation terminates retained sessions and starts a fresh worker');
