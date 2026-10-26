import { writeFileSync } from 'fs';
import {
  applyCall,
  createInitialState,
  callerId,
  emptySeat,
  couchCounts,
  teamOfCaller,
} from '../src/game/engine.js';

// Shortest keep-turn forced line for seed 1000
const CALLS = [0, 6, 0, 3, 7, 3, 1, 3];

function snap(s) {
  return {
    seats: s.seats.map((id) =>
      id == null ? null : { id, name: s.players[id].name, team: s.players[id].team },
    ),
    papers: Object.fromEntries(
      s.players.map((p) => [p.name, s.players[s.papers[p.id]].name]),
    ),
    empty: emptySeat(s.seats),
    callerSeat: (emptySeat(s.seats) + 1) % s.seats.length,
    caller: s.players[callerId(s)].name,
    callerTeam: teamOfCaller(s),
    couch: couchCounts(s),
    winner: s.winner,
    move: s.moveCount,
  };
}

let s = createInitialState({ seed: 1000 });
const frames = [{ type: 'start', ...snap(s) }];

for (const call of CALLS) {
  const callerBefore = s.players[callerId(s)].name;
  const callName = s.players[call].name;
  let moverId = -1;
  for (let i = 0; i < 8; i++) {
    if (s.papers[i] === call) {
      moverId = i;
      break;
    }
  }
  const moverName = s.players[moverId].name;
  const fromSeat = s.seats.indexOf(moverId);
  const toSeat = emptySeat(s.seats);
  const landedOnCouch = toSeat < 4;
  const leftCouch = fromSeat < 4;
  s = applyCall(s, call);
  frames.push({
    type: 'move',
    call: callName,
    mover: moverName,
    callerBefore,
    fromSeat,
    toSeat,
    landedOnCouch,
    leftCouch,
    ...snap(s),
  });
}

writeFileSync('public/perfect-win-frames.json', JSON.stringify(frames));
console.log(
  frames.map((f) =>
    f.type === 'start'
      ? `start empty@${f.empty} caller=${f.caller}`
      : `m${f.move} ${f.callerBefore}->${f.call} (${f.mover} ${f.fromSeat}->${f.toSeat}) couch ${f.couch.A}-${f.couch.B}`,
  ),
);
