import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allRawLayouts,
  canonicalCode,
  createStateFromLayout,
  describeLayout,
  mirrorCode,
  officialStartLayout,
  uniqueSeatings,
} from './configs.js';
import { couchCounts, emptySeat } from './engine.js';

describe('seating enumeration', () => {
  it('has 630 raw team+empty layouts', () => {
    assert.equal(allRawLayouts().length, 630);
  });

  it('collapses mirrors to 318 unique codes', () => {
    const { configs, rawCount, terminalCount } = uniqueSeatings({
      playableOnly: false,
      teamSwap: false,
    });
    assert.equal(rawCount, 630);
    assert.equal(configs.length, 318);
    assert.equal(terminalCount, 4);
  });

  it('collapses mirrors + A/B swap to 163 unique codes', () => {
    const { configs } = uniqueSeatings({ playableOnly: false, teamSwap: true });
    assert.equal(configs.length, 163);
  });

  it('playable-only drops already-won 4-on-couch layouts', () => {
    const all = uniqueSeatings({ playableOnly: false });
    const playable = uniqueSeatings({ playableOnly: true });
    assert.equal(playable.configs.length, all.configs.length - all.terminalCount);
    assert.ok(playable.configs.every((c) => !c.terminal));
  });

  it('canonical code is stable under mirror', () => {
    const code = 'AAB.BABBA';
    assert.equal(canonicalCode(code), canonicalCode(mirrorCode(code)));
  });
});

describe('createStateFromLayout', () => {
  it('builds official-like 2-2 mid empty', () => {
    const layout = officialStartLayout();
    const meta = describeLayout(layout);
    assert.equal(meta.empty, 4);
    assert.deepEqual(meta.couch, { A: 2, B: 2 });
    const state = createStateFromLayout(layout, { seed: 7 });
    assert.equal(emptySeat(state.seats), 4);
    assert.deepEqual(couchCounts(state), { A: 2, B: 2 });
    assert.equal(state.winner, null);
  });
});
