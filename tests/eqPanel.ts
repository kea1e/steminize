// Dependency-free DOM event harness. Real rendering/capture is also checked in browser QA.
import assert from 'node:assert/strict';
class ElementStub extends EventTarget {
  children: ElementStub[] = [];
  textContent = '';
  value = '';
  className = '';
  isConnected = false;
  clientWidth = 600;
  clientHeight = 120;
  attrs = new Map<string, string>();
  captured = new Set<number>();
  append(c: ElementStub) { this.children.push(c); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getBoundingClientRect() { return { left: 100, top: 50, width: 600, height: 120 }; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  dispatchEvent(e: Event) {
    (this as any)[`on${e.type}`]?.(e);
    return super.dispatchEvent(e);
  }
}
(globalThis as any).window = new EventTarget();
(globalThis as any).document = Object.assign(new EventTarget(), { createElement: () => new ElementStub() });
const { eqPanel } = await import('../src/ui/eqPanel.ts');
const { FLAT } = await import('../src/player/eq.ts');
let latest = { ...FLAT };
const commits: any[] = [];
const panel = eqPanel('#f80', (e) => latest = e, (before, after) => commits.push({ before, after }));
const all = (el: any): any[] => [el, ...(el.children ?? []).flatMap(all)];
const curve = all(panel.el).find((e) => e.className === 'eq-curve');
const pointer = (type: string, x: number, y: number, id = 1, extra = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, ...extra });
  curve.dispatchEvent(e);
  return e;
};
pointer('pointerdown', 440, 90);
pointer('pointermove', 500, 74);
assert.equal(latest.gain, 6, 'dragging the EQ line upwards must tune the existing focus band live');
assert.ok(latest.freq > 1000, 'horizontal movement tunes frequency logarithmically');
assert.equal(latest.lowCut, 0);
assert.equal(latest.highCut, 0);
assert.equal(latest.q, 1);
assert.equal(commits.length, 0, 'no undo entry until release');
pointer('pointerup', 500, 74);
assert.equal(commits.length, 1, 'one undo step for the whole drag');
assert.deepEqual(commits[0].before, FLAT);
assert.deepEqual(commits[0].after, latest);
console.log('PASS  EQ curve changes live focus frequency/gain with one undo step');

// Active cuts are selectable by proximity on the log-frequency axis, without inventing bands.
const xHz = (f: number) => 100 + 600 * Math.log(f / 20) / Math.log(1000);
panel.set({ ...FLAT, lowCut: 120, highCut: 8000, gain: 3 });
pointer('pointerdown', xHz(120), 98);
pointer('pointermove', xHz(240), 62);
assert.equal(latest.lowCut, 240, 'drag near low-cut tunes its cutoff');
assert.equal(latest.gain, 3, 'vertical cutoff drag does not alter focus gain');
assert.equal(latest.highCut, 8000);
pointer('pointerup', xHz(240), 62);
pointer('pointerdown', xHz(8000), 98);
pointer('pointermove', xHz(4000), 80);
assert.equal(latest.highCut, 4000, 'drag near high-cut tunes its cutoff');
assert.equal(latest.lowCut, 240);
pointer('pointerup', xHz(4000), 80);
console.log('PASS  EQ curve selects nearest existing active cut and preserves other bands');

panel.set(FLAT);
pointer('pointerdown', 400, 90);
assert.equal(latest.freq, 632, 'CSS coordinates map logarithmically, independent of canvas DPR');
assert.ok(curve.hasPointerCapture(1));
const beforeOther = { ...latest };
pointer('pointermove', 900, -500, 2);
pointer('pointerup', 900, -500, 2);
assert.deepEqual(latest, beforeOther, 'other pointers cannot hijack or finish a drag');
pointer('pointermove', 900, -500);
assert.equal(latest.freq, 12000);
assert.equal(latest.gain, 12);
pointer('pointermove', -300, 900);
assert.equal(latest.freq, 40);
assert.equal(latest.gain, -24);
const beforeCancel = commits.length;
pointer('pointercancel', -300, 900);
pointer('lostpointercapture', -300, 900);
assert.equal(commits.length, beforeCancel + 1, 'cancel commits the applied state exactly once');
assert.equal(curve.hasPointerCapture(1), false);
const ended = { ...latest };
pointer('pointermove', 500, 40);
assert.deepEqual(latest, ended, 'no stuck drag after cancellation');
pointer('pointerdown', 400, 90, 1, { button: 2 });
pointer('pointermove', 500, 40);
assert.deepEqual(latest, ended, 'right clicks are ignored');
for (const [band, initial, lo, hi] of [['lowCut', 120, 20, 10000], ['highCut', 8000, 50, 20000]] as const) {
  panel.set({ ...FLAT, [band]: initial });
  pointer('pointerdown', xHz(initial), 90);
  pointer('pointermove', -3000, 90);
  assert.equal(latest[band], lo);
  pointer('pointermove', 3000, 90);
  assert.equal(latest[band], hi);
  pointer('lostpointercapture', 3000, 90);
}
assert.equal(all(panel.el).find((e) => e.className === 'eq-readout').textContent, 'Drag line to tune');
console.log('PASS  EQ curve clamps all bands and handles capture, cancel, foreign pointers and right clicks');

// Same callback data feeds the real audio EQ implementation, with no alternate DSP path.
const { StemEq, responseDb } = await import('../src/player/eq.ts');
const filter = new StemEq();
let audioEq = { ...FLAT };
const audioPanel = eqPanel('#f80', (e) => { audioEq = e; filter.set(e); });
const audioCurve = all(audioPanel.el).find((e) => e.className === 'eq-curve');
for (const [type, y] of [['pointerdown', 90], ['pointermove', 58], ['pointerup', 58]] as const) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { clientX: xHz(1000), clientY: y, pointerId: 4, button: 0, isPrimary: true });
  audioCurve.dispatchEvent(e);
}
const samples = Float32Array.from({ length: 44100 }, (_, i) => .1 * Math.sin(2 * Math.PI * 1000 * i / 44100));
const right = samples.slice();
filter.process(samples, right, samples.length);
const rms = Math.sqrt(samples.slice(10000).reduce((s, v) => s + v * v, 0) / (samples.length - 10000));
const measuredDb = 20 * Math.log10(rms / (.1 / Math.sqrt(2)));
assert.ok(Math.abs(measuredDb - 12) < .1, `curve drag must change audio, measured ${measuredDb} dB`);
assert.ok(Math.abs(responseDb(audioEq, [1000])[0] - measuredDb) < .1);
console.log('PASS  EQ curve callback drives real stereo filter audio with measured +12 dB response');

// Some embedded/automated browsers drop capture without delivering lostpointercapture.
// A release outside the canvas must still terminate and commit the gesture.
panel.set(FLAT);
pointer('pointerdown', 440, 90);
const outside = (type: string, x: number, y: number) => {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
  window.dispatchEvent(e);
};
outside('pointermove', 1000, -100);
assert.equal(latest.gain, 12, 'outside movement must still tune if capture silently disappears');
const outsideBase = commits.length;
outside('pointerup', 1000, -100);
assert.equal(commits.length, outsideBase + 1, 'outside release must commit');
const afterOutside = { ...latest };
outside('pointermove', 0, 900);
assert.deepEqual(latest, afterOutside, 'window gesture listeners are removed after release');
console.log('PASS  EQ curve survives silent capture loss and release outside the canvas');
