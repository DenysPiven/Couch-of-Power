import {
  DEFAULT_RULES,
  couchSeats,
  namesForCount,
  normalizeRules,
} from './rules.js';

/** @typedef {'A' | 'B'} Team */

/** @typedef {{ id: number, name: string, team: Team }} Player */

/**
 * @typedef {object} GameState
 * @property {import('./rules.js').GameRules} rules
 * @property {(number|null)[]} seats - player id or null (empty)
 * @property {number[]} papers - papers[playerId] = name owner id
 * @property {Player[]} players
 * @property {number|null} lastCalled
 * @property {boolean} noRepeat
 * @property {boolean} noOwnPaper
 * @property {number} moveCount
 * @property {Team|null} winner
 */

/** @deprecated use DEFAULT_RULES / state.rules */
export const SEAT_COUNT = DEFAULT_RULES.seatCount;
/** @deprecated use couchSeats(state.rules) */
export const COUCH = Object.freeze(couchSeats(DEFAULT_RULES));
/** @deprecated use state.rules.emptyStart */
export const EMPTY_START = DEFAULT_RULES.emptyStart;

export const DEFAULT_NAMES = namesForCount(DEFAULT_RULES.players);

/**
 * @param {Partial<{
 *   names: string[],
 *   seed: number,
 *   noRepeat: boolean,
 *   noOwnPaper: boolean,
 *   papers: number[],
 *   rules: Partial<import('./rules.js').GameRules> | import('./rules.js').GameRules
 * }>} [opts]
 * @returns {GameState}
 */
export function createInitialState(opts = {}) {
  const rules = normalizeRules(opts.rules ?? DEFAULT_RULES);
  const names = opts.names ?? namesForCount(rules.players);
  if (names.length !== rules.players) {
    throw new Error(`Exactly ${rules.players} names required`);
  }

  const players = buildPlayers(names, rules);
  /** @type {(number|null)[]} */
  const seats = Array(rules.seatCount).fill(null);
  let personIdx = 0;
  for (let s = 0; s < rules.seatCount; s++) {
    if (s === rules.emptyStart) continue;
    seats[s] = personIdx++;
  }

  const papers = opts.papers
    ? [...opts.papers]
    : shuffle(
        players.map((p) => p.id),
        opts.seed,
      );

  /** @type {GameState} */
  const state = {
    rules,
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
 * @param {string[]} names
 * @param {import('./rules.js').GameRules} rules
 */
function buildPlayers(names, rules) {
  /** @type {Team[]} */
  const roster = [];
  let aLeft = rules.teamA;
  let bLeft = rules.teamB;
  while (aLeft + bLeft > 0) {
    if (aLeft > 0) {
      roster.push('A');
      aLeft--;
    }
    if (bLeft > 0) {
      roster.push('B');
      bLeft--;
    }
  }
  return names.map((name, id) => ({ id, name, team: roster[id] }));
}

/**
 * Caller = person with empty seat on their right.
 * Seats increase clockwise; facing center, right is counterclockwise → caller = empty+1.
 * @param {(number|null)[]} seats
 */
export function callerSeat(seats) {
  const empty = seats.indexOf(null);
  if (empty < 0) throw new Error('No empty seat');
  return (empty + 1) % seats.length;
}

export function emptySeat(seats) {
  return seats.indexOf(null);
}

export function callerId(state) {
  const seat = callerSeat(state.seats);
  const id = state.seats[seat];
  if (id == null) throw new Error('No one sits with the empty seat on their right');
  return id;
}

/** @param {GameState} state */
export function couchCounts(state) {
  let a = 0;
  let b = 0;
  for (const seat of couchSeats(state.rules)) {
    const id = state.seats[seat];
    if (id == null) continue;
    if (state.players[id].team === 'A') a++;
    else b++;
  }
  return { A: a, B: b };
}

/** @param {GameState} state */
export function checkWinner(state) {
  const c = couchCounts(state);
  if (c.A === state.rules.teamA) return 'A';
  if (c.B === state.rules.teamB) return 'B';
  return null;
}

/**
 * @param {GameState} state
 * @returns {number[]}
 */
export function legalCalls(state) {
  if (state.winner) return [];
  const caller = callerId(state);
  const result = [];
  for (const p of state.players) {
    if (state.noOwnPaper && state.papers[caller] === p.id) continue;
    if (state.noRepeat && state.lastCalled === p.id) continue;
    result.push(p.id);
  }
  return result;
}

/**
 * @param {GameState} state
 * @param {number} nameOwnerId
 * @returns {GameState}
 */
export function applyCall(state, nameOwnerId) {
  if (state.winner) throw new Error('Game already over');
  const legal = legalCalls(state);
  if (!legal.includes(nameOwnerId)) {
    throw new Error('Illegal call');
  }

  const caller = callerId(state);
  const empty = emptySeat(state.seats);
  const seatCount = state.seats.length;

  let moverSeat = -1;
  for (let s = 0; s < seatCount; s++) {
    const pid = state.seats[s];
    if (pid != null && state.papers[pid] === nameOwnerId) {
      moverSeat = s;
      break;
    }
  }
  if (moverSeat < 0) throw new Error('Paper holder not found');

  const mover = state.seats[moverSeat];
  if (mover == null) throw new Error('Empty seat marked as mover');

  const seats = [...state.seats];
  seats[empty] = mover;
  seats[moverSeat] = null;

  const papers = [...state.papers];
  const tmp = papers[caller];
  papers[caller] = papers[mover];
  papers[mover] = tmp;

  /** @type {GameState} */
  const next = {
    ...state,
    seats,
    papers,
    lastCalled: nameOwnerId,
    moveCount: state.moveCount + 1,
    winner: null,
  };
  next.winner = checkWinner(next);
  return next;
}

/** @param {GameState} state */
export function teamOfCaller(state) {
  return state.players[callerId(state)].team;
}

/**
 * @param {GameState} state
 * @param {number} nameOwnerId
 */
export function previewCall(state, nameOwnerId) {
  return applyCall(state, nameOwnerId);
}

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {T[]} arr
 * @param {number} [seed]
 */
export function shuffle(arr, seed) {
  const a = [...arr];
  const rand = seed == null ? Math.random : rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function playerById(state, id) {
  return state.players[id];
}

export function nameOnPaper(state, playerId) {
  return state.players[state.papers[playerId]].name;
}

export { DEFAULT_RULES, normalizeRules, namesForCount, couchSeats };
