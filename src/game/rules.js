/**
 * @typedef {object} GameRules
 * @property {number} players - total people (occupied seats)
 * @property {number} teamA
 * @property {number} teamB
 * @property {number} couchSize - consecutive seats 0..couchSize-1
 * @property {number} emptyStart - empty seat index at official start
 * @property {number} seatCount - players + 1
 */

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;
export const MAX_RAW_LAYOUTS = 20000;

const NAME_POOL = [
  'Alex',
  'Blake',
  'Casey',
  'Drew',
  'Eden',
  'Frankie',
  'Gray',
  'Harper',
  'Indie',
  'Jules',
  'Kai',
  'Logan',
  'Morgan',
  'Noah',
  'Oakley',
  'Parker',
];

/**
 * Empty seat opposite the middle of the couch (seats 0..couchSize-1 at the top).
 * For the classic 9-seat table with a 4-seat couch this is seat 6 (1-based: 7).
 * @param {number} seatCount
 * @param {number} couchSize
 */
export function oppositeCouchEmpty(seatCount, couchSize) {
  const couchMid = (couchSize - 1) / 2;
  const idx = Math.round(couchMid + seatCount / 2) % seatCount;
  return idx;
}

/** @type {GameRules} */
export const DEFAULT_RULES = freezeRules({
  players: 8,
  teamA: 4,
  teamB: 4,
  couchSize: 4,
  emptyStart: oppositeCouchEmpty(9, 4),
});

/**
 * @param {Partial<GameRules>} [input]
 * @returns {GameRules}
 */
export function normalizeRules(input = {}) {
  let players = clampInt(input.players ?? DEFAULT_RULES.players, MIN_PLAYERS, MAX_PLAYERS);
  let teamA = clampInt(input.teamA ?? Math.ceil(players / 2), 1, players - 1);
  let teamB = clampInt(input.teamB ?? players - teamA, 1, players - 1);
  if (teamA + teamB !== players) {
    teamB = players - teamA;
    if (teamB < 1) {
      teamA = players - 1;
      teamB = 1;
    }
  }

  const seatCount = players + 1;
  const minCouch = Math.max(teamA, teamB);
  let couchSize = clampInt(input.couchSize ?? Math.max(DEFAULT_RULES.couchSize, minCouch), minCouch, seatCount - 1);

  let emptyStart =
    input.emptyStart == null
      ? oppositeCouchEmpty(seatCount, couchSize)
      : clampInt(input.emptyStart, 0, seatCount - 1);

  return freezeRules({ players, teamA, teamB, couchSize, emptyStart, seatCount });
}

/** @param {GameRules} rules */
function freezeRules(rules) {
  const seatCount = rules.seatCount ?? rules.players + 1;
  return Object.freeze({
    players: rules.players,
    teamA: rules.teamA,
    teamB: rules.teamB,
    couchSize: rules.couchSize,
    emptyStart: rules.emptyStart,
    seatCount,
  });
}

/** @param {GameRules} rules */
export function couchSeats(rules) {
  return Array.from({ length: rules.couchSize }, (_, i) => i);
}

/**
 * Mirror across vertical axis through seat 0.
 * @param {number} seatCount
 */
export function mirrorSeatMap(seatCount) {
  const map = Array(seatCount);
  map[0] = 0;
  for (let i = 1; i < seatCount; i++) map[i] = seatCount - i;
  return map;
}

/** @param {number} n */
export function namesForCount(n) {
  return Array.from({ length: n }, (_, i) => NAME_POOL[i] ?? `Player ${i + 1}`);
}

/** @param {GameRules} rules */
export function rulesLabel(rules) {
  return `${rules.players}p · A${rules.teamA}/B${rules.teamB} · couch ${rules.couchSize} · empty@${rules.emptyStart}`;
}

/** @param {GameRules} rules */
export function estimatedRawLayouts(rules) {
  return rules.seatCount * choose(rules.players, rules.teamA);
}

/** @param {number} n @param {number} k */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
