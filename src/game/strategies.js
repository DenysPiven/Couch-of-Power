import {
  applyCall,
  callerId,
  couchCounts,
  legalCalls,
  teamOfCaller,
} from './engine.js';

/**
 * @typedef {(state: import('./engine.js').GameState) => number} Strategy
 */

/** @type {Strategy} */
export function randomStrategy(state) {
  const legal = legalCalls(state);
  if (!legal.length) throw new Error('No legal moves');
  return legal[Math.floor(Math.random() * legal.length)];
}

/**
 * Maximize own couch after move; break ties by minimizing opponent couch;
 * prefer keeping turn (next caller same team).
 * @param {import('./engine.js').Team} [forTeam] - default: caller's team
 * @returns {Strategy}
 */
export function greedyStrategy(forTeam) {
  return (state) => {
    const legal = legalCalls(state);
    if (!legal.length) throw new Error('No legal moves');
    const team = forTeam ?? teamOfCaller(state);
    let best = legal[0];
    let bestScore = -Infinity;

    for (const call of legal) {
      const next = applyCall(state, call);
      const c = couchCounts(next);
      const own = c[team];
      const opp = c[team === 'A' ? 'B' : 'A'];
      let score = own * 100 - opp * 10;
      if (next.winner === team) score += 10000;
      if (next.winner && next.winner !== team) score -= 10000;
      if (!next.winner && teamOfCaller(next) === team) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = call;
      }
    }
    return best;
  };
}

/**
 * Prefer moves that keep the next caller on the same team (keep-turn),
 * then greedy couch progress for that team.
 * @returns {Strategy}
 */
export function keepTurnStrategy() {
  const greedy = greedyStrategy();
  return (state) => {
    const legal = legalCalls(state);
    if (!legal.length) throw new Error('No legal moves');
    const team = teamOfCaller(state);

    const keepers = [];
    for (const call of legal) {
      const next = applyCall(state, call);
      if (next.winner === team) return call;
      if (!next.winner && teamOfCaller(next) === team) keepers.push(call);
    }
    if (keepers.length) {
      let best = keepers[0];
      let bestOwn = -1;
      for (const call of keepers) {
        const next = applyCall(state, call);
        const own = couchCounts(next)[team];
        if (own > bestOwn) {
          bestOwn = own;
          best = call;
        }
      }
      return best;
    }
    return greedy(state);
  };
}

/**
 * Adversarial: play to deny opponent; if own turn use greedy for self,
 * if somehow evaluating for opp — minimize their progress.
 * Used when both sides play optimally-ish with separate strategies.
 * @param {import('./engine.js').Team} team
 * @returns {Strategy}
 */
export function adversarialStrategy(team) {
  return (state) => {
    const legal = legalCalls(state);
    if (!legal.length) throw new Error('No legal moves');
    const active = teamOfCaller(state);
    const opp = team === 'A' ? 'B' : 'A';

    let best = legal[0];
    let bestScore = -Infinity;

    for (const call of legal) {
      const next = applyCall(state, call);
      const c = couchCounts(next);
      let score = 0;

      if (next.winner === team) score = 100000 - next.moveCount;
      else if (next.winner === opp) score = -100000 + next.moveCount;
      else {
        score = c[team] * 50 - c[opp] * 40;
        if (teamOfCaller(next) === team) score += 8;
        else score -= 8;
      }

      // If it's not "our" conceptual team calling, still pick as that player would:
      if (active !== team) {
        // We're simulating the opponent's choice poorly if we always use this —
        // adversarial for `team` means: when team calls, maximize; when opp calls, they try to hurt team.
        if (active === opp) {
          score = -score;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = call;
      }
    }
    return best;
  };
}

/**
 * Cooperative known-papers style path for team A: prefer known 4-move shape
 * when possible via greedy for A regardless of who calls.
 * @returns {Strategy}
 */
export function coopTeamAStrategy() {
  return greedyStrategy('A');
}

/**
 * @param {import('./engine.js').GameState} state
 * @param {Strategy} strategyA
 * @param {Strategy} strategyB
 * @param {number} maxMoves
 */
export function playGame(state, strategyA, strategyB, maxMoves = 200) {
  let s = state;
  const history = [];
  while (!s.winner && s.moveCount < maxMoves) {
    const team = teamOfCaller(s);
    const strategy = team === 'A' ? strategyA : strategyB;
    let call;
    try {
      call = strategy(s);
    } catch {
      break;
    }
    const legal = legalCalls(s);
    if (!legal.includes(call)) {
      call = legal[0];
      if (call == null) break;
    }
    s = applyCall(s, call);
    history.push(call);
  }
  return { state: s, history, winner: s.winner, moves: s.moveCount };
}

export function strategyById(id) {
  switch (id) {
    case 'random':
      return randomStrategy;
    case 'greedy':
      return greedyStrategy();
    case 'keep-turn':
      return keepTurnStrategy();
    case 'adversarial-A':
      return adversarialStrategy('A');
    case 'adversarial-B':
      return adversarialStrategy('B');
    case 'coop-A':
      return coopTeamAStrategy();
    default:
      return randomStrategy;
  }
}
