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
import { DEFAULT_RULES, mirrorSeatMap } from './rules.js';

const mirror9 = mirrorSeatMap(9);

describe('seating enumeration', () => {
  it('has 630 raw team+empty layouts for default rules', () => {
    assert.equal(allRawLayouts(DEFAULT_RULES).length, 630);
  });

  it('collapses mirrors to 318 unique codes', () => {
    const { configs, rawCount, terminalCount } = uniqueSeatings({
      playableOnly: false,
      teamSwap: false,
      rules: DEFAULT_RULES,
    });
    assert.equal(rawCount, 630);
    assert.equal(configs.length, 318);
    assert.equal(terminalCount, 4);
  });

  it('collapses mirrors + A/B swap to 163 unique codes', () => {
    const { configs } = uniqueSeatings({
      playableOnly: false,
      teamSwap: true,
      rules: DEFAULT_RULES,
    });
    assert.equal(configs.length, 163);
  });

  it('playable-only drops already-won layouts', () => {
    const all = uniqueSeatings({ playableOnly: false, rules: DEFAULT_RULES });
    const playable = uniqueSeatings({ playableOnly: true, rules: DEFAULT_RULES });
    assert.equal(playable.configs.length, all.configs.length - all.terminalCount);
    assert.ok(playable.configs.every((c) => !c.terminal));
  });

  it('canonical code is stable under mirror', () => {
    const code = 'AAB.BABBA';
    assert.equal(canonicalCode(code, mirror9), canonicalCode(mirrorCode(code, mirror9), mirror9));
  });
});

describe('createStateFromLayout', () => {
  it('builds official-like 2-2 mid empty', () => {
    const layout = officialStartLayout(DEFAULT_RULES);
    const meta = describeLayout(layout, DEFAULT_RULES);
    assert.equal(meta.empty, 4);
    assert.deepEqual(meta.couch, { A: 2, B: 2 });
    const state = createStateFromLayout(layout, { seed: 7, rules: DEFAULT_RULES });
    assert.equal(emptySeat(state.seats), 4);
    assert.deepEqual(couchCounts(state), { A: 2, B: 2 });
    assert.equal(state.winner, null);
  });
});

describe('custom rules', () => {
  it('enumerates smaller tables', () => {
    const rules = { players: 4, teamA: 2, teamB: 2, couchSize: 2, emptyStart: 2 };
    const { rawCount, configs } = uniqueSeatings({
      playableOnly: false,
      rules,
    });
    assert.equal(rawCount, 5 * 6); // 5 seats * C(4,2)
    assert.ok(configs.length > 0);
    assert.ok(configs.length < rawCount);
  });
});
