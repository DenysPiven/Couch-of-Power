import { DEFAULT_RULES, normalizeRules, rulesLabel } from './game/rules.js';

const RULES_KEY = 'fotc-rules-v1';
const RUNS_KEY = 'fotc-sim-runs-v1';
const MAX_RUNS = 100;

/**
 * @typedef {object} SimRunRecord
 * @property {string} id
 * @property {number} createdAt
 * @property {string} rulesLabel
 * @property {import('./game/rules.js').GameRules} rules
 * @property {string} startMode
 * @property {string} symmetry
 * @property {string} strategyA
 * @property {string} strategyB
 * @property {boolean} noOwnPaper
 * @property {boolean} noRepeat
 * @property {number} seed
 * @property {number} games
 * @property {number} seatings
 * @property {number} winsA
 * @property {number} winsB
 * @property {number} draws
 * @property {number|null} avgMoves
 * @property {number|null} minMoves
 * @property {number|null} maxMoves
 * @property {{ situation: string, layouts: number, games: number, winsA: number, winsB: number, draws: number, avgMoves: number|null }[]} situations
 */

export function loadRules() {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return DEFAULT_RULES;
    return normalizeRules(JSON.parse(raw));
  } catch {
    return DEFAULT_RULES;
  }
}

/** @param {import('./game/rules.js').GameRules | Partial<import('./game/rules.js').GameRules>} rules */
export function saveRules(rules) {
  const normalized = normalizeRules(rules);
  localStorage.setItem(RULES_KEY, JSON.stringify(normalized));
  return normalized;
}

/** @returns {SimRunRecord[]} */
export function loadSimRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {Omit<SimRunRecord, 'id' | 'createdAt' | 'rulesLabel'>} partial */
export function saveSimRun(partial) {
  const runs = loadSimRuns();
  /** @type {SimRunRecord} */
  const record = {
    id: `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    createdAt: Date.now(),
    rulesLabel: rulesLabel(partial.rules),
    ...partial,
  };
  runs.unshift(record);
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  return record;
}

/** @param {string} id */
export function deleteSimRun(id) {
  const runs = loadSimRuns().filter((r) => r.id !== id);
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  return runs;
}

export function clearSimRuns() {
  localStorage.removeItem(RUNS_KEY);
}
