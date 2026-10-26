/**
 * Deeper probes: forced-win length, private paper knowledge growth,
 * why keep-turn sometimes wins, post-loss recoverability.
 */
import {
  applyCall,
  createInitialState,
  legalCalls,
  teamOfCaller,
  callerId,
  couchCounts,
} from '../src/game/engine.js';
import {
  playGame,
  greedyStrategy,
  keepTurnStrategy,
  randomStrategy,
  coopTeamAStrategy,
} from '../src/game/strategies.js';

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

/** Return min moves for maximizingTeam to force a win, or null if none within maxDepth. */
function forcedWinLength(state, maximizingTeam, maxDepth) {
  const memo = new Map();
  function key(s, d) {
    return `${s.seats.join(',')}|${s.papers.join(',')}|${s.lastCalled}|${d}|${maximizingTeam}`;
  }
  function search(s, depth) {
    if (s.winner === maximizingTeam) return 0;
    if (s.winner) return null;
    if (depth <= 0) return null;
    const k = key(s, depth);
    if (memo.has(k)) return memo.get(k);

    const team = teamOfCaller(s);
    const legal = legalCalls(s);
    let result = null;

    if (team === maximizingTeam) {
      let best = null;
      for (const call of legal) {
        const sub = search(applyCall(s, call), depth - 1);
        if (sub != null) {
          const total = sub + 1;
          if (best == null || total < best) best = total;
        }
      }
      result = best;
    } else {
      // Opponent tries to prevent win: only forced if ALL replies still lose
      let worst = 0;
      for (const call of legal) {
        const sub = search(applyCall(s, call), depth - 1);
        if (sub == null) {
          result = null;
          memo.set(k, null);
          return null;
        }
        if (sub + 1 > worst) worst = sub + 1;
      }
      result = legal.length ? worst : null;
    }
    memo.set(k, result);
    return result;
  }
  return search(state, maxDepth);
}

/** Private knowledge model: each player knows own paper always.
 * When a name is called: everyone sees who stands → that person held called name.
 * After swap: caller and mover know each other's new papers (they swapped).
 * Also: everyone can track known paper locations if they update beliefs.
 * Simplified public+swap model for "what a careful player can deduce":
 * - Own paper always known
 * - Called name → holder revealed, then papers swap between caller & mover
 * - Track known papers[playerId] when revealed
 */
function simulateKnowledge(seed, stratA, stratB, maxMoves = 30) {
  let s = createInitialState({ seed });
  /** @type {(number|null)[]} known papers by observer who is omniscient-via-deduction for team A callers */
  // Model: global public knowledge of papers after reveals + swaps of known papers
  let known = Array(8).fill(null);
  // Everyone knows their own paper at start
  for (let i = 0; i < 8; i++) known[i] = null; // start unknown to others; own is private

  const history = [];
  // Track: set of (playerId -> paperOwnerId) known to a careful team that shares info
  /** team-shared knowledge map player->paper or null */
  const teamKnown = Array(8).fill(null);
  // Each player privately knows own paper
  for (let i = 0; i < 8; i++) {
    // private; team pool starts with teammates' papers if they share at start? Usually NOT shared at start.
  }

  // Better model used in literature of this party game:
  // Public: after call, everyone knows mover held that name, then caller↔mover swap those two papers.
  // If you already knew either paper, you can update.
  const publicKnown = Array(8).fill(null); // playerId -> paper name owner id, if publicly known

  while (!s.winner && s.moveCount < maxMoves) {
    const team = teamOfCaller(s);
    const strategy = team === 'A' ? stratA : stratB;
    let call = strategy(s);
    const legal = legalCalls(s);
    if (!legal.includes(call)) call = legal[0];
    if (call == null) break;

    const caller = callerId(s);
    // find mover
    let mover = -1;
    for (let i = 0; i < 8; i++) {
      if (s.papers[i] === call) {
        mover = i;
        break;
      }
    }

    // Public reveal: mover had `call`
    publicKnown[mover] = call;
    // After swap: caller gets call, mover gets what caller had
    const callerPaperBefore = s.papers[caller];
    // If caller's paper was known, mover receives it
    const knownCallerPaper = publicKnown[caller];
    publicKnown[caller] = call;
    if (knownCallerPaper != null) publicKnown[mover] = knownCallerPaper;
    else if (callerPaperBefore != null) {
      // We don't publicly know caller's old paper unless previously revealed
      // But caller and mover know privately.
      publicKnown[mover] = null; // uncertain publicly unless knownCallerPaper
      // Fix: if we knew mover's paper and swapped, caller now has it — already set.
      // mover's new paper is caller's old — only public if caller's was public.
      if (knownCallerPaper == null) {
        // clear mover knowledge publicly of new paper
        // actually we set publicKnown[mover]=call before swap update; fix:
      }
    }

    // Correct public update:
    // Before move: mover holds `call` (just revealed). Caller holds X (maybe unknown).
    // After: caller holds `call`, mover holds X.
    const xPublic = knownCallerPaper; // caller's paper before call, if public
    publicKnown[caller] = call;
    publicKnown[mover] = xPublic; // null if unknown

    s = applyCall(s, call);
    const knownCount = publicKnown.filter((x) => x != null).length;
    // Accuracy check: how many publicKnown match truth
    let correct = 0;
    let claimed = 0;
    for (let i = 0; i < 8; i++) {
      if (publicKnown[i] != null) {
        claimed++;
        if (publicKnown[i] === s.papers[i]) correct++;
      }
    }
    history.push({
      move: s.moveCount,
      knownPublic: knownCount,
      correctPublic: correct,
      claimed,
    });
  }
  return { winner: s.winner, moves: s.moveCount, history };
}

function main() {
  const out = {};

  // Forced win lengths for first team (A) from official start
  const lengths = [];
  for (let i = 0; i < 30; i++) {
    const s = createInitialState({ seed: 1000 + i });
    const len = forcedWinLength(s, 'A', 12);
    lengths.push(len);
  }
  const known = lengths.filter((x) => x != null);
  out.forcedWinLengths = {
    n: lengths.length,
    found: known.length,
    values: lengths,
    avg: known.length ? +(known.reduce((a, b) => a + b, 0) / known.length).toFixed(2) : null,
    min: known.length ? Math.min(...known) : null,
    max: known.length ? Math.max(...known) : null,
    distribution: Object.fromEntries(
      [...new Set(known)]
        .sort((a, b) => a - b)
        .map((v) => [v, known.filter((x) => x === v).length]),
    ),
  };

  // Can B force a win from official start if A plays randomly? (existence)
  let bWinsVsRandom = 0;
  for (let i = 0; i < 200; i++) {
    const r = playGame(
      createInitialState({ seed: 2000 + i }),
      randomStrategy,
      greedyStrategy(),
      200,
    );
    if (r.winner === 'B') bWinsVsRandom++;
  }
  out.B_greedy_vs_A_random_n200 = { B: bWinsVsRandom, pct: +((100 * bWinsVsRandom) / 200).toFixed(1) };

  let bWinsBothRandom = 0;
  let aWinsBothRandom = 0;
  for (let i = 0; i < 500; i++) {
    const r = playGame(createInitialState({ seed: 3000 + i }), randomStrategy, randomStrategy, 200);
    if (r.winner === 'B') bWinsBothRandom++;
    if (r.winner === 'A') aWinsBothRandom++;
  }
  out.random_vs_random_n500 = {
    A: aWinsBothRandom,
    B: bWinsBothRandom,
    draw: 500 - aWinsBothRandom - bWinsBothRandom,
  };

  // Keep-turn wins: characterize opening streak / couch path
  const keepWins = [];
  const keepDraws = [];
  for (let i = 0; i < 300; i++) {
    const s0 = createInitialState({ seed: 1000 + i });
    const r = playGame(s0, keepTurnStrategy(), keepTurnStrategy(), 200);
    // opening keep availability for many plies
    let s = createInitialState({ seed: 1000 + i });
    let forcedKeepPlies = 0;
    for (let m = 0; m < 20 && !s.winner; m++) {
      const info = keepTurnMoves(s);
      if (info.winNow.length) {
        forcedKeepPlies++;
        break;
      }
      if (!info.keep.length) break;
      // follow keep-turn strategy
      const call = keepTurnStrategy()(s);
      s = applyCall(s, call);
      if (teamOfCaller(s) !== 'A' && !s.winner) break;
      forcedKeepPlies++;
    }
    const row = {
      seed: 1000 + i,
      winner: r.winner,
      moves: r.moves,
      openingKeepPliesFollowed: forcedKeepPlies,
    };
    if (r.winner === 'A') keepWins.push(row);
    else keepDraws.push(row);
  }
  out.keepTurnWinProfile = {
    wins: keepWins.length,
    draws: keepDraws.length,
    avgMovesWhenWin: keepWins.length
      ? +(keepWins.reduce((a, b) => a + b.moves, 0) / keepWins.length).toFixed(2)
      : null,
    winMoveHistogram: Object.fromEntries(
      [...new Set(keepWins.map((w) => w.moves))]
        .sort((a, b) => a - b)
        .map((v) => [v, keepWins.filter((w) => w.moves === v).length]),
    ),
    sampleWins: keepWins.slice(0, 5),
  };

  // After deliberately losing turn once from opening: can A still win vs random B?
  let recover = { win: 0, draw: 0, lose: 0, n: 0 };
  for (let i = 0; i < 200; i++) {
    let s = createInitialState({ seed: 4000 + i });
    const info = keepTurnMoves(s);
    if (!info.lose.length) continue;
    // force lose turn
    s = applyCall(s, info.lose[0]);
    // now play greedy A vs random B
    const r = playGame(s, greedyStrategy(), randomStrategy, 200);
    recover.n++;
    if (r.winner === 'A') recover.win++;
    else if (r.winner === 'B') recover.lose++;
    else recover.draw++;
  }
  out.afterForcedOpeningTurnLoss_greedyVsRandom = {
    ...recover,
    pctWin: recover.n ? +((100 * recover.win) / recover.n).toFixed(1) : null,
    pctDraw: recover.n ? +((100 * recover.draw) / recover.n).toFixed(1) : null,
    pctLose: recover.n ? +((100 * recover.lose) / recover.n).toFixed(1) : null,
  };

  // After forced loss, keep-turn A vs keep-turn B
  recover = { win: 0, draw: 0, lose: 0, n: 0 };
  for (let i = 0; i < 200; i++) {
    let s = createInitialState({ seed: 4000 + i });
    const info = keepTurnMoves(s);
    if (!info.lose.length) continue;
    s = applyCall(s, info.lose[0]);
    const r = playGame(s, keepTurnStrategy(), keepTurnStrategy(), 200);
    recover.n++;
    if (r.winner === 'A') recover.win++;
    else if (r.winner === 'B') recover.lose++;
    else recover.draw++;
  }
  out.afterForcedOpeningTurnLoss_keepVsKeep = {
    ...recover,
    pctWin: recover.n ? +((100 * recover.win) / recover.n).toFixed(1) : null,
    pctDraw: recover.n ? +((100 * recover.draw) / recover.n).toFixed(1) : null,
  };

  // Knowledge growth under greedy vs random
  const knowCurves = [];
  for (let i = 0; i < 100; i++) {
    knowCurves.push(simulateKnowledge(5000 + i, greedyStrategy(), randomStrategy()));
  }
  const byMove = new Map();
  for (const g of knowCurves) {
    for (const h of g.history) {
      const arr = byMove.get(h.move) ?? [];
      arr.push(h.correctPublic);
      byMove.set(h.move, arr);
    }
  }
  out.publicPaperKnowledge = [...byMove.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([m]) => m <= 16)
    .map(([move, arr]) => ({
      move,
      avgCorrectPublicPapers: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
      games: arr.length,
    }));

  // How many papers does each individual know privately including own + deductions from being caller/mover?
  // Simpler practical advice stats: own paper + every call reveals one holder + swap updates for participants
  out.practicalLearning = {
    rule1: 'You always know your own paper.',
    rule2: 'When a name is called, everyone sees who stands → that person held that name; then caller↔mover swap those two papers.',
    rule3: 'If you are caller or mover, you additionally know the paper you just received (the other person’s old paper).',
    rule4: 'Teammates can quietly share: pool all privately known papers → near-perfect info after a few exchanges.',
    rule5: 'With full paper map + seating, first team can force a win (see forcedWinLengths); use keep-turn only when it also improves couch, else progress couch.',
  };

  // Coop path couch sequence sample
  const coopSamples = [];
  for (let i = 0; i < 10; i++) {
    let s = createInitialState({ seed: 1000 + i });
    const path = [];
    const r = playGame(s, coopTeamAStrategy(), coopTeamAStrategy(), 50);
    s = createInitialState({ seed: 1000 + i });
    for (const call of r.history) {
      const before = { caller: teamOfCaller(s), couch: couchCounts(s) };
      s = applyCall(s, call);
      path.push({
        call,
        name: s.players[call].name,
        fromCaller: before.caller,
        couchBefore: before.couch,
        couchAfter: couchCounts(s),
        nextCaller: s.winner ? null : teamOfCaller(s),
        winner: s.winner,
      });
    }
    coopSamples.push({ seed: 1000 + i, moves: r.moves, winner: r.winner, path });
  }
  out.coopPathSamples = coopSamples.filter((x) => x.moves <= 6).slice(0, 3);

  console.log(JSON.stringify(out, null, 2));
}

main();
