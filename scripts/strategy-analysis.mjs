/**
 * Global strategy analysis for Couch of Power (classic 8p / couch4 / empty@6).
 * Outputs JSON summary to stdout.
 */
import {
  applyCall,
  callerId,
  createInitialState,
  legalCalls,
  teamOfCaller,
  couchCounts,
} from '../src/game/engine.js';
import {
  playGame,
  randomStrategy,
  greedyStrategy,
  keepTurnStrategy,
  adversarialStrategy,
  coopTeamAStrategy,
} from '../src/game/strategies.js';
import {
  uniqueSeatings,
  createStateFromLayout,
  officialStartLayout,
} from '../src/game/configs.js';
import { DEFAULT_RULES } from '../src/game/rules.js';

const MAX = 200;

function tally(results) {
  const out = { A: 0, B: 0, draw: 0, movesAvg: 0, movesWinA: [], movesWinB: [] };
  for (const r of results) {
    if (r.winner === 'A') {
      out.A++;
      out.movesWinA.push(r.moves);
    } else if (r.winner === 'B') {
      out.B++;
      out.movesWinB.push(r.moves);
    } else out.draw++;
    out.movesAvg += r.moves;
  }
  const n = results.length || 1;
  out.movesAvg = +(out.movesAvg / n).toFixed(2);
  out.pctA = +((100 * out.A) / n).toFixed(1);
  out.pctB = +((100 * out.B) / n).toFixed(1);
  out.pctDraw = +((100 * out.draw) / n).toFixed(1);
  out.avgMovesWinA = out.movesWinA.length
    ? +(out.movesWinA.reduce((a, b) => a + b, 0) / out.movesWinA.length).toFixed(2)
    : null;
  out.avgMovesWinB = out.movesWinB.length
    ? +(out.movesWinB.reduce((a, b) => a + b, 0) / out.movesWinB.length).toFixed(2)
    : null;
  delete out.movesWinA;
  delete out.movesWinB;
  return out;
}

function runBatch(label, n, makeState, stratA, stratB, maxMoves = MAX) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const state = makeState(i);
    const r = playGame(state, stratA, stratB, maxMoves);
    results.push(r);
  }
  return { label, n, ...tally(results) };
}

/** Does a legal call keep the turn for the caller's team? */
function keepTurnMoves(state) {
  const team = teamOfCaller(state);
  const keep = [];
  const lose = [];
  const winNow = [];
  for (const call of legalCalls(state)) {
    const next = applyCall(state, call);
    if (next.winner === team) winNow.push(call);
    else if (!next.winner && teamOfCaller(next) === team) keep.push(call);
    else lose.push(call);
  }
  return { keep, lose, winNow, team };
}

/**
 * Trace one game: count streak of same-team callers from start,
 * whether keep-turn was always available while they held turn,
 * and outcome after first turn loss (if any).
 */
function analyzeGameTrace(state, stratA, stratB, maxMoves = MAX) {
  let s = state;
  const firstTeam = teamOfCaller(s);
  let streak = 0;
  let turnLostAt = null;
  let keepAlwaysAvailable = true;
  const history = [];

  while (!s.winner && s.moveCount < maxMoves) {
    const team = teamOfCaller(s);
    const info = keepTurnMoves(s);
    if (team === firstTeam && turnLostAt == null) {
      if (!info.keep.length && !info.winNow.length) keepAlwaysAvailable = false;
    }

    const strategy = team === 'A' ? stratA : stratB;
    let call;
    try {
      call = strategy(s);
    } catch {
      break;
    }
    const legal = legalCalls(s);
    if (!legal.includes(call)) call = legal[0];
    if (call == null) break;

    const next = applyCall(s, call);
    const nextTeam = next.winner ? null : teamOfCaller(next);
    history.push({
      move: s.moveCount + 1,
      team,
      call,
      kept: !next.winner && nextTeam === team,
      winner: next.winner,
      couch: couchCounts(next),
    });

    if (turnLostAt == null) {
      if (team === firstTeam) streak++;
      if (!next.winner && nextTeam !== firstTeam && team === firstTeam) {
        turnLostAt = next.moveCount;
      }
    }

    s = next;
  }

  return {
    firstTeam,
    winner: s.winner,
    moves: s.moveCount,
    openingStreak: streak,
    turnLostAt,
    keepAlwaysAvailableDuringOpening: keepAlwaysAvailable,
    wonWithoutLosingTurn: s.winner === firstTeam && turnLostAt == null,
    history,
  };
}

function runTraceBatch(n, makeState, stratA, stratB) {
  const traces = [];
  for (let i = 0; i < n; i++) {
    traces.push(analyzeGameTrace(makeState(i), stratA, stratB));
  }
  const firstWinsWithoutLoss = traces.filter((t) => t.wonWithoutLosingTurn).length;
  const firstWinsAfterLoss = traces.filter(
    (t) => t.winner === t.firstTeam && t.turnLostAt != null,
  ).length;
  const secondWins = traces.filter((t) => t.winner && t.winner !== t.firstTeam).length;
  const draws = traces.filter((t) => !t.winner).length;
  const afterLoss = traces.filter((t) => t.turnLostAt != null);
  const afterLossOutcomes = {
    firstWins: afterLoss.filter((t) => t.winner === t.firstTeam).length,
    secondWins: afterLoss.filter((t) => t.winner && t.winner !== t.firstTeam).length,
    draws: afterLoss.filter((t) => !t.winner).length,
    n: afterLoss.length,
  };
  const avgOpeningStreak =
    traces.reduce((a, t) => a + t.openingStreak, 0) / (traces.length || 1);
  const keepAvailPct =
    (100 * traces.filter((t) => t.keepAlwaysAvailableDuringOpening).length) /
    (traces.length || 1);

  return {
    n,
    firstWinsWithoutLoss,
    firstWinsAfterLoss,
    secondWins,
    draws,
    pctFirstWinsWithoutLoss: +((100 * firstWinsWithoutLoss) / n).toFixed(1),
    pctFirstWinsAfterLoss: +((100 * firstWinsAfterLoss) / n).toFixed(1),
    pctSecondWins: +((100 * secondWins) / n).toFixed(1),
    pctDraw: +((100 * draws) / n).toFixed(1),
    avgOpeningStreak: +avgOpeningStreak.toFixed(2),
    keepAlwaysAvailablePct: +keepAvailPct.toFixed(1),
    afterFirstTurnLoss: {
      ...afterLossOutcomes,
      pctFirstWins: afterLossOutcomes.n
        ? +((100 * afterLossOutcomes.firstWins) / afterLossOutcomes.n).toFixed(1)
        : null,
      pctSecondWins: afterLossOutcomes.n
        ? +((100 * afterLossOutcomes.secondWins) / afterLossOutcomes.n).toFixed(1)
        : null,
      pctDraw: afterLossOutcomes.n
        ? +((100 * afterLossOutcomes.draws) / afterLossOutcomes.n).toFixed(1)
        : null,
    },
  };
}

/** Opening position: can first team force a keep-turn move? */
function openingKeepStats(n, makeState) {
  let canKeep = 0;
  let canWinIn1 = 0;
  let mustLose = 0;
  let callerA = 0;
  for (let i = 0; i < n; i++) {
    const s = makeState(i);
    if (teamOfCaller(s) === 'A') callerA++;
    const info = keepTurnMoves(s);
    if (info.winNow.length) canWinIn1++;
    else if (info.keep.length) canKeep++;
    else mustLose++;
  }
  return {
    n,
    callerA,
    pctCallerA: +((100 * callerA) / n).toFixed(1),
    pctCanKeep: +((100 * canKeep) / n).toFixed(1),
    pctCanWinIn1: +((100 * canWinIn1) / n).toFixed(1),
    pctMustLoseTurn: +((100 * mustLose) / n).toFixed(1),
  };
}

/**
 * Perfect-info omniscient: DFS for forced win within depth for the side to move,
 * treating opponent as adversarial. Returns 'win'|'loss'|'unknown' for first team.
 * Papers are fully known so strategies see everything (already true in engine).
 */
function minimaxOutcome(state, depth, maximizingTeam) {
  if (state.winner === maximizingTeam) return 1;
  if (state.winner && state.winner !== maximizingTeam) return -1;
  if (depth <= 0) return 0;

  const team = teamOfCaller(state);
  const legal = legalCalls(state);
  if (!legal.length) return 0;

  if (team === maximizingTeam) {
    let best = -Infinity;
    for (const call of legal) {
      const v = minimaxOutcome(applyCall(state, call), depth - 1, maximizingTeam);
      if (v > best) best = v;
      if (best === 1) break;
    }
    return best;
  }
  let best = Infinity;
  for (const call of legal) {
    const v = minimaxOutcome(applyCall(state, call), depth - 1, maximizingTeam);
    if (v < best) best = v;
    if (best === -1) break;
  }
  return best;
}

function sampleForcedWin(n, depth, makeState) {
  let win = 0;
  let loss = 0;
  let unknown = 0;
  for (let i = 0; i < n; i++) {
    const s = makeState(i);
    const first = teamOfCaller(s);
    const v = minimaxOutcome(s, depth, first);
    if (v === 1) win++;
    else if (v === -1) loss++;
    else unknown++;
  }
  return {
    n,
    depth,
    forcedWinForFirst: win,
    forcedLossForFirst: loss,
    unresolved: unknown,
    pctForcedWin: +((100 * win) / n).toFixed(1),
  };
}

/** Info / learning names: how many unique paper names revealed after k moves under strategy */
function nameLearningCurve(n, stratA, stratB, maxMoves = 40) {
  const buckets = Array.from({ length: maxMoves + 1 }, () => ({ sum: 0, games: 0 }));
  for (let i = 0; i < n; i++) {
    let s = createInitialState({ seed: 9000 + i });
    const seen = new Set();
    buckets[0].sum += 0;
    buckets[0].games++;
    while (!s.winner && s.moveCount < maxMoves) {
      const team = teamOfCaller(s);
      const strategy = team === 'A' ? stratA : stratB;
      let call = strategy(s);
      const legal = legalCalls(s);
      if (!legal.includes(call)) call = legal[0];
      if (call == null) break;
      seen.add(call); // name called = paper name revealed publicly
      s = applyCall(s, call);
      // Also everyone sees who moved → that person's paper was the called name;
      // caller and mover swapped papers — private knowledge grows, but public
      // revealed names = distinct called name-owners.
      const k = s.moveCount;
      buckets[k].sum += seen.size;
      buckets[k].games++;
    }
  }
  return buckets
    .map((b, moves) =>
      b.games
        ? { moves, avgUniqueNamesCalled: +(b.sum / b.games).toFixed(2), games: b.games }
        : null,
    )
    .filter(Boolean)
    .filter((x) => x.moves === 0 || x.moves % 2 === 0 || x.moves <= 8);
}

function main() {
  const official = (seed) => createInitialState({ seed: 1000 + seed });
  const officialNoRepeatOff = (seed) =>
    createInitialState({ seed: 1000 + seed, noRepeat: false });

  const report = {
    meta: {
      rules: DEFAULT_RULES,
      officialLayout: officialStartLayout(),
      note: 'Classic: 8 players, A4/B4, couch 0-3, empty@6 → caller seat 7 = team A always on official start seating.',
    },
    firstCallerOfficial: (() => {
      const s = createInitialState({ seed: 1 });
      return {
        empty: s.seats.indexOf(null),
        callerSeat: (s.seats.indexOf(null) + 1) % 9,
        callerTeam: teamOfCaller(s),
        callerName: s.players[callerId(s)].name,
        seatingTeams: s.seats.map((id) => (id == null ? '.' : s.players[id].team)),
      };
    })(),

    openingKeep: {
      papersRandom_n200: openingKeepStats(200, official),
      papersRandom_noRepeatOff_n200: openingKeepStats(200, officialNoRepeatOff),
    },

    matchups_official_n500: [
      runBatch('greedy vs random', 500, official, greedyStrategy(), randomStrategy),
      runBatch('greedy vs greedy', 500, official, greedyStrategy(), greedyStrategy()),
      runBatch('keep-turn vs keep-turn', 500, official, keepTurnStrategy(), keepTurnStrategy()),
      runBatch('keep-turn vs greedy', 500, official, keepTurnStrategy(), greedyStrategy()),
      runBatch('greedy vs keep-turn', 500, official, greedyStrategy(), keepTurnStrategy()),
      runBatch('adversarial-A vs adversarial-B', 500, official, adversarialStrategy('A'), adversarialStrategy('B')),
      runBatch('coop-A (both sides help A) vs anything', 500, official, coopTeamAStrategy(), coopTeamAStrategy()),
      runBatch('random vs random', 500, official, randomStrategy, randomStrategy),
      runBatch('keep-turn vs random', 500, official, keepTurnStrategy(), randomStrategy),
      runBatch('adversarial-A vs random', 500, official, adversarialStrategy('A'), randomStrategy),
    ],

    matchups_noRepeatOff_n300: [
      runBatch('keep-turn vs keep-turn (noRepeat off)', 300, officialNoRepeatOff, keepTurnStrategy(), keepTurnStrategy()),
      runBatch('greedy vs greedy (noRepeat off)', 300, officialNoRepeatOff, greedyStrategy(), greedyStrategy()),
      runBatch('coop-A both (noRepeat off)', 300, officialNoRepeatOff, coopTeamAStrategy(), coopTeamAStrategy()),
    ],

    turnDynamics_greedyVsRandom_n400: runTraceBatch(400, official, greedyStrategy(), randomStrategy),
    turnDynamics_keepVsKeep_n400: runTraceBatch(400, official, keepTurnStrategy(), keepTurnStrategy()),
    turnDynamics_greedyVsGreedy_n400: runTraceBatch(400, official, greedyStrategy(), greedyStrategy()),
    turnDynamics_keepVsRandom_n400: runTraceBatch(400, official, keepTurnStrategy(), randomStrategy),
    turnDynamics_adv_n300: runTraceBatch(300, official, adversarialStrategy('A'), adversarialStrategy('B')),

    // Unique playable seatings: first caller team distribution + sample greedy outcomes
    uniqueSeatings: (() => {
      const { configs, rawCount, terminalCount } = uniqueSeatings({ playableOnly: true });
      const byCaller = { A: 0, B: 0 };
      for (const c of configs) byCaller[c.callerTeam]++;
      // Sample each unique seating once with seed papers
      const results = [];
      for (let i = 0; i < configs.length; i++) {
        const s = createStateFromLayout(configs[i].layout, { seed: 5000 + i });
        if (s.winner) continue;
        const r = playGame(s, greedyStrategy(), greedyStrategy(), MAX);
        results.push({
          callerTeam: configs[i].callerTeam,
          winner: r.winner,
          moves: r.moves,
          situation: configs[i].situation,
        });
      }
      const firstWins = results.filter((r) => r.winner === r.callerTeam).length;
      const secondWins = results.filter(
        (r) => r.winner && r.winner !== r.callerTeam,
      ).length;
      const draws = results.filter((r) => !r.winner).length;
      return {
        rawCount,
        terminalCount,
        playableUnique: configs.length,
        callerTeamA: byCaller.A,
        callerTeamB: byCaller.B,
        greedyVsGreedy_perSeating: {
          n: results.length,
          firstCallerWins: firstWins,
          secondCallerWins: secondWins,
          draws,
          pctFirstWins: +((100 * firstWins) / results.length).toFixed(1),
          pctSecondWins: +((100 * secondWins) / results.length).toFixed(1),
          pctDraw: +((100 * draws) / results.length).toFixed(1),
        },
      };
    })(),

    uniqueSeatings_keepTurn: (() => {
      const { configs } = uniqueSeatings({ playableOnly: true });
      const results = [];
      for (let i = 0; i < configs.length; i++) {
        const s = createStateFromLayout(configs[i].layout, { seed: 7000 + i });
        if (s.winner) continue;
        const r = playGame(s, keepTurnStrategy(), keepTurnStrategy(), MAX);
        results.push({
          callerTeam: configs[i].callerTeam,
          winner: r.winner,
        });
      }
      const firstWins = results.filter((r) => r.winner === r.callerTeam).length;
      const secondWins = results.filter(
        (r) => r.winner && r.winner !== r.callerTeam,
      ).length;
      const draws = results.filter((r) => !r.winner).length;
      return {
        n: results.length,
        pctFirstWins: +((100 * firstWins) / results.length).toFixed(1),
        pctSecondWins: +((100 * secondWins) / results.length).toFixed(1),
        pctDraw: +((100 * draws) / results.length).toFixed(1),
      };
    })(),

    // Short forced-win search on random papers (depth-limited perfect play)
    forcedWinSample: {
      depth6_n40: sampleForcedWin(40, 6, official),
      depth8_n20: sampleForcedWin(20, 8, official),
      depth10_n10: sampleForcedWin(10, 10, official),
    },

    nameLearning: {
      greedyVsRandom: nameLearningCurve(200, greedyStrategy(), randomStrategy),
      keepVsKeep: nameLearningCurve(200, keepTurnStrategy(), keepTurnStrategy()),
    },

    // All names known ≈ both play with full engine info (already the case).
    // "Known papers" cooperative path for A:
    allNamesKnown: {
      description:
        'Engine already models perfect paper knowledge for strategies. Coop-A = both callers optimize for team A. Adversarial = both optimize selfishly with full info.',
      coopA_n200: runBatch('coop-A both', 200, official, coopTeamAStrategy(), coopTeamAStrategy()),
      adv_n200: runBatch('adv A vs adv B', 200, official, adversarialStrategy('A'), adversarialStrategy('B')),
      keep_n200: runBatch('keep vs keep', 200, official, keepTurnStrategy(), keepTurnStrategy()),
      traces_coop: runTraceBatch(200, official, coopTeamAStrategy(), coopTeamAStrategy()),
    },
  };

  // Example shortest coop win path
  {
    let best = null;
    for (let i = 0; i < 200; i++) {
      const r = playGame(
        createInitialState({ seed: 1000 + i }),
        coopTeamAStrategy(),
        coopTeamAStrategy(),
        MAX,
      );
      if (r.winner === 'A' && (!best || r.moves < best.moves)) {
        best = { seed: 1000 + i, moves: r.moves, history: r.history };
      }
    }
    report.allNamesKnown.shortestCoopAWin = best;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
