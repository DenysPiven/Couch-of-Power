import {
  checkWinner,
  createInitialState,
  namesForCount,
  shuffle,
} from './engine.js';
import {
  DEFAULT_RULES,
  MAX_RAW_LAYOUTS,
  couchSeats,
  estimatedRawLayouts,
  mirrorSeatMap,
  normalizeRules,
} from './rules.js';

/**
 * Team seating layout: length seatCount, each cell 'A' | 'B' | null (empty).
 * @typedef {(('A'|'B'|null)[])} TeamLayout
 */

/**
 * @typedef {object} SeatingConfig
 * @property {string} id
 * @property {TeamLayout} layout
 * @property {number} empty
 * @property {{ A: number, B: number }} couch
 * @property {boolean} emptyOnCouch
 * @property {'A'|'B'} callerTeam
 * @property {string} situation
 * @property {number} orbitSize
 * @property {boolean} terminal
 */

/** @param {TeamLayout} layout */
export function layoutToCode(layout) {
  return layout.map((c) => (c == null ? '.' : c)).join('');
}

/** @param {string} code */
export function codeToLayout(code) {
  return [...code].map((ch) => {
    if (ch === '.') return null;
    if (ch === 'A' || ch === 'B') return ch;
    throw new Error(`Bad seating code char: ${ch}`);
  });
}

/** @param {string} code @param {number[]} mirror */
export function mirrorCode(code, mirror) {
  const chars = [...code];
  const out = Array(code.length);
  for (let i = 0; i < code.length; i++) out[mirror[i]] = chars[i];
  return out.join('');
}

/** @param {string} code */
export function swapTeamsCode(code) {
  return code.replaceAll('A', 'X').replaceAll('B', 'A').replaceAll('X', 'B');
}

/** @param {string} code @param {number[]} mirror */
export function canonicalCode(code, mirror) {
  const mirrored = mirrorCode(code, mirror);
  return code <= mirrored ? code : mirrored;
}

/** @param {string} code @param {number[]} mirror */
export function canonicalCodeWithTeamSwap(code, mirror) {
  return [
    code,
    mirrorCode(code, mirror),
    swapTeamsCode(code),
    mirrorCode(swapTeamsCode(code), mirror),
  ].sort()[0];
}

/** @param {number} n @param {number} k */
function combinations(n, k) {
  /** @type {number[][]} */
  const out = [];
  /** @type {number[]} */
  const cur = [];
  function rec(start) {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  }
  rec(0);
  return out;
}

/**
 * @param {number} empty
 * @param {number[]} aSeats
 * @param {number} seatCount
 */
export function encodeLayout(empty, aSeats, seatCount) {
  /** @type {TeamLayout} */
  const layout = Array(seatCount).fill('B');
  layout[empty] = null;
  for (const s of aSeats) layout[s] = 'A';
  return layout;
}

/**
 * @param {TeamLayout} layout
 * @param {import('./rules.js').GameRules} rules
 */
export function describeLayout(layout, rules) {
  const empty = layout.indexOf(null);
  const couch = couchSeats(rules);
  let a = 0;
  let b = 0;
  for (const seat of couch) {
    const t = layout[seat];
    if (t === 'A') a++;
    else if (t === 'B') b++;
  }
  const emptyOnCouch = couch.includes(empty);
  const callerSeatIdx = (empty + 1) % rules.seatCount;
  const callerTeam = /** @type {'A'|'B'} */ (layout[callerSeatIdx]);
  const mid = Math.min(rules.couchSize, rules.seatCount - 1);
  const emptyZone = emptyOnCouch
    ? 'couch'
    : empty === mid
      ? 'mid'
      : empty === mid + 1 || empty === rules.seatCount - 1
        ? 'near'
        : 'far';
  const situation = `couch ${a}-${b} · empty ${emptyZone}@${empty} · caller ${callerTeam}`;
  return {
    empty,
    couch: { A: a, B: b },
    emptyOnCouch,
    callerTeam,
    emptyZone,
    situation,
    terminal: a === rules.teamA || b === rules.teamB,
  };
}

/**
 * @param {import('./rules.js').GameRules} [rules]
 * @returns {TeamLayout[]}
 */
export function allRawLayouts(rules = DEFAULT_RULES) {
  const r = normalizeRules(rules);
  const picks = combinations(r.players, r.teamA);
  /** @type {TeamLayout[]} */
  const layouts = [];
  for (let empty = 0; empty < r.seatCount; empty++) {
    const occupied = [];
    for (let s = 0; s < r.seatCount; s++) {
      if (s !== empty) occupied.push(s);
    }
    for (const pick of picks) {
      const aSeats = pick.map((i) => occupied[i]);
      layouts.push(encodeLayout(empty, aSeats, r.seatCount));
    }
  }
  return layouts;
}

/**
 * @param {{
 *   teamSwap?: boolean,
 *   playableOnly?: boolean,
 *   rules?: Partial<import('./rules.js').GameRules> | import('./rules.js').GameRules
 * }} [opts]
 */
export function uniqueSeatings(opts = {}) {
  const rules = normalizeRules(opts.rules ?? DEFAULT_RULES);
  const teamSwap = opts.teamSwap ?? false;
  const playableOnly = opts.playableOnly ?? true;
  const rawEstimate = estimatedRawLayouts(rules);
  if (rawEstimate > MAX_RAW_LAYOUTS) {
    return {
      rawCount: rawEstimate,
      configs: [],
      terminalCount: 0,
      truncated: true,
      rules,
    };
  }

  const raw = allRawLayouts(rules);
  const mirror = mirrorSeatMap(rules.seatCount);
  /** @type {Map<string, { layout: TeamLayout, orbitSize: number }>} */
  const map = new Map();

  for (const layout of raw) {
    const code = layoutToCode(layout);
    const key = teamSwap
      ? canonicalCodeWithTeamSwap(code, mirror)
      : canonicalCode(code, mirror);
    const prev = map.get(key);
    if (prev) {
      prev.orbitSize += 1;
      continue;
    }
    map.set(key, { layout: codeToLayout(key), orbitSize: 1 });
  }

  /** @type {SeatingConfig[]} */
  const configs = [];
  let terminalCount = 0;
  for (const [id, { layout, orbitSize }] of map) {
    const meta = describeLayout(layout, rules);
    if (meta.terminal) terminalCount += 1;
    if (playableOnly && meta.terminal) continue;
    configs.push({
      id,
      layout,
      empty: meta.empty,
      couch: meta.couch,
      emptyOnCouch: meta.emptyOnCouch,
      callerTeam: meta.callerTeam,
      situation: meta.situation,
      orbitSize,
      terminal: meta.terminal,
    });
  }

  configs.sort((a, b) => a.situation.localeCompare(b.situation) || a.id.localeCompare(b.id));

  return {
    rawCount: raw.length,
    configs,
    terminalCount,
    truncated: false,
    rules,
  };
}

/**
 * @param {import('./rules.js').GameRules} [rules]
 * @returns {TeamLayout}
 */
export function officialStartLayout(rules = DEFAULT_RULES) {
  const r = normalizeRules(rules);
  /** @type {TeamLayout} */
  const layout = Array(r.seatCount).fill(null);
  let aLeft = r.teamA;
  let bLeft = r.teamB;
  let placed = 0;
  for (let s = 0; s < r.seatCount; s++) {
    if (s === r.emptyStart) continue;
    if (aLeft > 0 && (placed % 2 === 0 || bLeft === 0)) {
      layout[s] = 'A';
      aLeft--;
    } else {
      layout[s] = 'B';
      bLeft--;
    }
    placed++;
  }
  return layout;
}

/**
 * @param {TeamLayout} layout
 * @param {Partial<{
 *   names: string[],
 *   seed: number,
 *   noRepeat: boolean,
 *   noOwnPaper: boolean,
 *   papers: number[],
 *   rules: Partial<import('./rules.js').GameRules> | import('./rules.js').GameRules
 * }>} [opts]
 */
export function createStateFromLayout(layout, opts = {}) {
  const teamA = layout.filter((x) => x === 'A').length;
  const teamB = layout.filter((x) => x === 'B').length;
  const r = normalizeRules({
    ...(opts.rules ?? {}),
    players: teamA + teamB,
    teamA,
    teamB,
    emptyStart: layout.indexOf(null),
    couchSize: opts.rules?.couchSize,
  });

  const names = opts.names ?? namesForCount(r.players);
  if (names.length !== r.players) throw new Error(`Exactly ${r.players} names required`);
  if (layout.length !== r.seatCount) throw new Error('Layout length mismatch');

  const aSeats = [];
  const bSeats = [];
  for (let s = 0; s < r.seatCount; s++) {
    if (layout[s] === 'A') aSeats.push(s);
    else if (layout[s] === 'B') bSeats.push(s);
  }

  const base = createInitialState({
    names,
    rules: r,
    seed: opts.seed,
    noRepeat: opts.noRepeat,
    noOwnPaper: opts.noOwnPaper,
    papers: opts.papers,
  });

  const aIds = base.players.filter((p) => p.team === 'A').map((p) => p.id);
  const bIds = base.players.filter((p) => p.team === 'B').map((p) => p.id);
  const seed = opts.seed;
  const aOrder = shuffle(aIds, seed == null ? undefined : (seed ^ 0x11111111) >>> 0);
  const bOrder = shuffle(bIds, seed == null ? undefined : (seed ^ 0x22222222) >>> 0);

  /** @type {(number|null)[]} */
  const seats = Array(r.seatCount).fill(null);
  aSeats.forEach((seat, i) => {
    seats[seat] = aOrder[i];
  });
  bSeats.forEach((seat, i) => {
    seats[seat] = bOrder[i];
  });

  /** @type {import('./engine.js').GameState} */
  const state = {
    ...base,
    seats,
    lastCalled: null,
    moveCount: 0,
    winner: null,
  };
  state.winner = checkWinner(state);
  return state;
}

export function createOfficialState(opts = {}) {
  return createInitialState(opts);
}

/** @param {import('./configs.js').SeatingConfig[]} configs */
export function groupBySituation(configs) {
  /** @type {Map<string, import('./configs.js').SeatingConfig[]>} */
  const map = new Map();
  for (const c of configs) {
    const list = map.get(c.situation) ?? [];
    list.push(c);
    map.set(c.situation, list);
  }
  return [...map.entries()]
    .map(([situation, items]) => ({
      situation,
      count: items.length,
      orbitTotal: items.reduce((s, x) => s + x.orbitSize, 0),
      configs: items,
    }))
    .sort((a, b) => b.count - a.count || a.situation.localeCompare(b.situation));
}

// Back-compat helpers used by older tests
export function mirrorCodeDefault(code) {
  return mirrorCode(code, mirrorSeatMap(code.length));
}
export function canonicalCodeDefault(code) {
  return canonicalCode(code, mirrorSeatMap(code.length));
}
