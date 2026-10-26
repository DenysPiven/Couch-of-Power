/** @typedef {'A' | 'B'} Team */

/** @typedef {{ id: number, name: string, team: Team }} Player */

/**
 * @typedef {object} GameState
 * @property {(number|null)[]} seats - player id or null (empty) per seat 0..8
 * @property {number[]} papers - papers[playerId] = name owner id (whose name is on the paper)
 * @property {Player[]} players
 * @property {number|null} lastCalled - last called name owner id
 * @property {boolean} noRepeat - official rule: no same name twice in a row
 * @property {boolean} noOwnPaper - official rule: cannot call name on own paper
 * @property {number} moveCount
 * @property {Team|null} winner
 */

export const SEAT_COUNT = 9;
export const COUCH = Object.freeze([0, 1, 2, 3]);
export const EMPTY_START = 4;

const DEFAULT_NAMES = [
  'Alex',
  'Blake',
  'Casey',
  'Drew',
  'Eden',
  'Frankie',
  'Gray',
  'Harper',
];

/**
 * @param {Partial<{ names: string[], seed: number, noRepeat: boolean, noOwnPaper: boolean, papers: number[] }>} [opts]
 * @returns {GameState}
 */
export function createInitialState(opts = {}) {
  const names = opts.names ?? DEFAULT_NAMES;
  if (names.length !== 8) throw new Error('Exactly 8 names required');

  const players = names.map((name, id) => ({
    id,
    name,
    team: /** @type {Team} */ (id % 2 === 0 ? 'A' : 'B'),
  }));

  /** @type {(number|null)[]} */
  const seats = Array(SEAT_COUNT).fill(null);
  let personIdx = 0;
  for (let s = 0; s < SEAT_COUNT; s++) {
    if (s === EMPTY_START) continue;
    seats[s] = personIdx++;
  }

  const papers = opts.papers
    ? [...opts.papers]
    : shuffle(
        players.map((p) => p.id),
        opts.seed,
      );

  return {
    seats,
    papers,
    players,
    lastCalled: null,
    noRepeat: opts.noRepeat ?? true,
    noOwnPaper: opts.noOwnPaper ?? true,
    moveCount: 0,
    winner: null,
  };
}

/**
 * Caller = the person who has the empty seat on their right.
 * Seats increase clockwise. Facing the center, "right" follows the counterclockwise
 * tangent, so empty is at caller−1 and the caller sits at empty+1.
 */
export function callerSeat(seats) {
  const empty = seats.indexOf(null);
  if (empty < 0) throw new Error('No empty seat');
  return (empty + 1) % SEAT_COUNT;
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
  for (const seat of COUCH) {
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
  if (c.A === 4) return 'A';
  if (c.B === 4) return 'B';
  return null;
}

/**
 * Legal name-owner ids the current caller may call.
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
 * Apply a call: person holding that name's paper moves to empty; swap papers with caller.
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

  let moverSeat = -1;
  for (let s = 0; s < SEAT_COUNT; s++) {
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
 * Who sits where after call, without mutating — for UI previews.
 * @param {GameState} state
 * @param {number} nameOwnerId
 */
export function previewCall(state, nameOwnerId) {
  return applyCall(state, nameOwnerId);
}

/** Mulberry32 */
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

export { DEFAULT_NAMES };
