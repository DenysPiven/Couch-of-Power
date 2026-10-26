import { createInitialState } from './game/engine.js';
import { playGame, strategyById } from './game/strategies.js';

const form = document.getElementById('sim-form');
const statusEl = document.getElementById('sim-status');
const progressEl = document.getElementById('sim-progress');
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');

let abort = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  abort = false;
  btnRun.disabled = true;
  btnStop.disabled = false;

  const games = clamp(Number(document.getElementById('games').value) || 1, 1, 5000);
  const maxMoves = clamp(Number(document.getElementById('max-moves').value) || 80, 4, 500);
  const seedRaw = document.getElementById('seed').value;
  const baseSeed = seedRaw === '' ? Math.floor(Math.random() * 1e9) : Number(seedRaw);
  const strategyA = strategyById(document.getElementById('strategy-a').value);
  const strategyB = strategyById(document.getElementById('strategy-b').value);
  const noOwnPaper = document.getElementById('sim-own').checked;
  const noRepeat = document.getElementById('sim-repeat').checked;

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let moveSum = 0;
  let winGames = 0;
  let minMoves = Infinity;
  let maxMovesSeen = 0;

  statusEl.textContent = `Прогін ${games} партій…`;

  const batch = 25;
  for (let i = 0; i < games; i++) {
    if (abort) break;
    const start = createInitialState({
      seed: (baseSeed + i * 9973) >>> 0,
      noOwnPaper,
      noRepeat,
    });
    const { winner, moves } = playGame(start, strategyA, strategyB, maxMoves);
    if (winner === 'A') {
      winsA++;
      moveSum += moves;
      winGames++;
      minMoves = Math.min(minMoves, moves);
      maxMovesSeen = Math.max(maxMovesSeen, moves);
    } else if (winner === 'B') {
      winsB++;
      moveSum += moves;
      winGames++;
      minMoves = Math.min(minMoves, moves);
      maxMovesSeen = Math.max(maxMovesSeen, moves);
    } else {
      draws++;
    }

    if (i % batch === 0 || i === games - 1) {
      const pct = ((i + 1) / games) * 100;
      progressEl.style.width = `${pct}%`;
      statusEl.textContent = `Зроблено ${i + 1} / ${games}`;
      renderStats({
        games: i + 1,
        winsA,
        winsB,
        draws,
        moveSum,
        winGames,
        minMoves,
        maxMovesSeen,
        baseSeed,
      });
      await yieldToUi();
    }
  }

  statusEl.textContent = abort
    ? `Зупинено після ${winsA + winsB + draws} партій.`
    : `Готово: ${games} партій (сід ${baseSeed}).`;
  btnRun.disabled = false;
  btnStop.disabled = true;
});

btnStop.addEventListener('click', () => {
  abort = true;
});

function renderStats(s) {
  const total = s.games || 1;
  document.getElementById('stat-a').textContent = String(s.winsA);
  document.getElementById('stat-b').textContent = String(s.winsB);
  document.getElementById('stat-draw').textContent = String(s.draws);
  document.getElementById('stat-avg').textContent = s.winGames
    ? (s.moveSum / s.winGames).toFixed(1)
    : '—';
  document.getElementById('stat-range').textContent = s.winGames
    ? `${s.minMoves} / ${s.maxMovesSeen}`
    : '—';

  const pctA = (s.winsA / total) * 100;
  const pctB = (s.winsB / total) * 100;
  const pctD = (s.draws / total) * 100;
  document.getElementById('bar-a').style.width = `${pctA}%`;
  document.getElementById('bar-b').style.width = `${pctB}%`;
  document.getElementById('bar-draw').style.width = `${pctD}%`;
  document.getElementById('pct-a').textContent = `${pctA.toFixed(1)}%`;
  document.getElementById('pct-b').textContent = `${pctB.toFixed(1)}%`;
  document.getElementById('pct-draw').textContent = `${pctD.toFixed(1)}%`;

  document.getElementById('result-summary').textContent =
    `A ${s.winsA} · B ${s.winsB} · ліміт/нічия ${s.draws} (з ${s.games}, сід ${s.baseSeed})`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function yieldToUi() {
  return new Promise((r) => setTimeout(r, 0));
}
