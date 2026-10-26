import {
  COUCH,
  DEFAULT_NAMES,
  SEAT_COUNT,
  checkWinner,
  createInitialState,
  shuffle,
} from './engine.js';

/**
 * Reflection across the vertical axis through seat 0 (top of the circle).
 * Couch seats 0..3 are fixed in space, so only this mirror is a board symmetry.
 */
export const MIRROR_SEATS = Object.freeze([0, 8, 7, 6, 5, 4, 3, 2, 1]);

/**
 * Team seating layout: length 9, each cell 'A' | 'B' | null (empty).
 * @typedef {(('A'|'B'|null)[])} TeamLayout
 */

/**
 * @typedef {object} SeatingConfig
 * @property {string} id - canonical code, e.g. "AAAB.BBBA"
 * @property {TeamLayout} layout
 * @property {number} empty
 * @property {{ A: number, B: number }} couch
 * @property {boolean} emptyOnCouch
 * @property {'A'|'B'} callerTeam
 * @property {string} situation - bucket key for stats
 * @property {number} orbitSize - how many raw layouts map to this canonical form
 * @property {boolean} terminal - already a win (4 on couch)
 */

/** @param {TeamLayout} layout */
export function layoutToCode(layout) {
  return layout.map((c) => (c == null ? '.' : c)).join('');
}

/** @param {string} code */
export function codeToLayout(code) {
  if (code.length !== SEAT_COUNT) throw new Error('Bad seating code length');
  return [...code].map((ch) => {
    if (ch === '.') return null;
    if (ch === 'A' || ch === 'B') return ch;
    throw new Error(`Bad seating code char: ${ch}`);
  });
}

/** @param {string} code */
export function mirrorCode(code) {
  const chars = [...code];
  const out = Array(SEAT_COUNT);
  for (let i = 0; i < SEAT_COUNT; i++) out[MIRROR_SEATS[i]] = chars[i];
  return out.join('');
}

/** @param {string} code */
export function swapTeamsCode(code) {
  return code.replaceAll('A', 'X').replaceAll('B', 'A').replaceAll('X', 'B');
}

/**
 * Lexicographically smallest code among a layout and its mirror
 * (identical / mirrored placements collapse).
 * @param {string} code
 */
export function canonicalCode(code) {
  const mirrored = mirrorCode(code);
  return code <= mirrored ? code : mirrored;
}

/**
 * Also collapse A↔B relabeling (useful when strategies are symmetric).
 * @param {string} code
 */
export function canonicalCodeWithTeamSwap(code) {
  return [code, mirrorCode(code), swapTeamsCode(code), mirrorCode(swapTeamsCode(code))].sort()[0];
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
 * Encode empty seat + which occupied seats belong to team A.
 * Remaining occupied seats are team B.
 * @param {number} empty
 * @param {number[]} aSeats
 */
export function encodeLayout(empty, aSeats) {
  /** @type {TeamLayout} */
  const layout = Array(SEAT_COUNT).fill('B');
  layout[empty] = null;
  for (const s of aSeats) layout[s] = 'A';
  return layout;
}

/** @param {TeamLayout} layout */
export function describeLayout(layout) {
  const empty = layout.indexOf(null);
  let a = 0;
  let b = 0;
  for (const seat of COUCH) {
    const t = layout[seat];
    if (t === 'A') a++;
    else if (t === 'B') b++;
  }
  const emptyOnCouch = COUCH.includes(empty);
  const callerSeat = (empty - 1 + SEAT_COUNT) % SEAT_COUNT;
  const callerTeam = /** @type {'A'|'B'} */ (layout[callerSeat]);
  const emptyZone = emptyOnCouch
    ? 'couch'
    : empty === 4
      ? 'mid'
      : empty === 5 || empty === 8
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
    terminal: a === 4 || b === 4,
  };
}

/**
 * All raw team+empty seatings: 9 × C(8,4) = 630.
 * @returns {TeamLayout[]}
 */
export function allRawLayouts() {
  const picks = combinations(8, 4);
  /** @type {TeamLayout[]} */
  const layouts = [];
  for (let empty = 0; empty < SEAT_COUNT; empty++) {
    const occupied = [];
    for (let s = 0; s < SEAT_COUNT; s++) {
      if (s !== empty) occupied.push(s);
    }
    for (const pick of picks) {
      const aSeats = pick.map((i) => occupied[i]);
      layouts.push(encodeLayout(empty, aSeats));
    }
  }
  return layouts;
}

/**
 * Unique seatings under reflection (and optionally A↔B swap).
 * @param {{ teamSwap?: boolean, playableOnly?: boolean }} [opts]
 * @returns {{ rawCount: number, configs: SeatingConfig[], terminalCount: number }}
 */
export function uniqueSeatings(opts = {}) {
  const teamSwap = opts.teamSwap ?? false;
  const playableOnly = opts.playableOnly ?? true;
  const raw = allRawLayouts();
  /** @type {Map<string, { layout: TeamLayout, orbitSize: number }>} */
  const map = new Map();

  for (const layout of raw) {
    const code = layoutToCode(layout);
    const key = teamSwap ? canonicalCodeWithTeamSwap(code) : canonicalCode(code);
    const prev = map.get(key);
    if (prev) {
      prev.orbitSize += 1;
      continue;
    }
    // Prefer storing the canonical code's own layout
    map.set(key, { layout: codeToLayout(key), orbitSize: 1 });
  }

  /** @type {SeatingConfig[]} */
  const configs = [];
  let terminalCount = 0;
  for (const [id, { layout, orbitSize }] of map) {
    const meta = describeLayout(layout);
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
  };
}

/**
 * Official start layout: empty at seat 4, teams alternate on occupied seats,
 * couch is 2+2.
 * @returns {TeamLayout}
 */
export function officialStartLayout() {
  /** @type {TeamLayout} */
  const layout = Array(SEAT_COUNT).fill(null);
  let teamFlip = 0;
  for (let s = 0; s < SEAT_COUNT; s++) {
    if (s === 4) continue;
    layout[s] = teamFlip % 2 === 0 ? 'A' : 'B';
    teamFlip += 1;
  }
  return layout;
}

/**
 * Build a full game state from a team layout + shuffled papers / player seats.
 * @param {TeamLayout} layout
 * @param {Partial<{ names: string[], seed: number, noRepeat: boolean, noOwnPaper: boolean, papers: number[] }>} [opts]
 */
export function createStateFromLayout(layout, opts = {}) {
  const names = opts.names ?? DEFAULT_NAMES;
  if (names.length !== 8) throw new Error('Exactly 8 names required');

  const empty = layout.indexOf(null);
  if (empty < 0) throw new Error('Layout needs one empty seat');

  const aSeats = [];
  const bSeats = [];
  for (let s = 0; s < SEAT_COUNT; s++) {
    if (layout[s] === 'A') aSeats.push(s);
    else if (layout[s] === 'B') bSeats.push(s);
  }
  if (aSeats.length !== 4 || bSeats.length !== 4) {
    throw new Error('Layout must have 4A + 4B');
  }

  const players = names.map((name, id) => ({
    id,
    name,
    team: /** @type {'A'|'B'} */ (id % 2 === 0 ? 'A' : 'B'),
  }));
  const teamA = players.filter((p) => p.team === 'A').map((p) => p.id);
  const teamB = players.filter((p) => p.team === 'B').map((p) => p.id);

  const seed = opts.seed;
  const aOrder = shuffle(teamA, seed == null ? undefined : (seed ^ 0x11111111) >>> 0);
  const bOrder = shuffle(teamB, seed == null ? undefined : (seed ^ 0x22222222) >>> 0);

  /** @type {(number|null)[]} */
  const seats = Array(SEAT_COUNT).fill(null);
  aSeats.forEach((seat, i) => {
    seats[seat] = aOrder[i];
  });
  bSeats.forEach((seat, i) => {
    seats[seat] = bOrder[i];
  });

  const papers = opts.papers
    ? [...opts.papers]
    : shuffle(
        players.map((p) => p.id),
        seed == null ? undefined : (seed ^ 0x33333333) >>> 0,
      );

  /** @type {import('./engine.js').GameState} */
  const state = {
    seats,
    papers,
    players,
    lastCalled: null,
    noRepeat: opts.noRepeat ?? true,
    noOwnPaper: opts.noOwnPaper ?? true,
    moveCount: 0,
    winner: null,
  };
  state.winner = checkWinner(state);
  return state;
}

/**
 * Convenience: official start via layout helper (same shape as createInitialState).
 * @param {Partial<{ names: string[], seed: number, noRepeat: boolean, noOwnPaper: boolean, papers: number[] }>} [opts]
 */
export function createOfficialState(opts = {}) {
  // Keep createInitialState as source of truth for the official seating of people ids.
  return createInitialState(opts);
}

/**
 * Aggregate unique configs into situation buckets.
 * @param {SeatingConfig[]} configs
 */
export function groupBySituation(configs) {
  /** @type {Map<string, SeatingConfig[]>} */
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
