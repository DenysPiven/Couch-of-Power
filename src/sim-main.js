import { createInitialState } from './game/engine.js';
import {
  createStateFromLayout,
  groupBySituation,
  uniqueSeatings,
} from './game/configs.js';
import { estimatedRawLayouts, MAX_RAW_LAYOUTS, rulesLabel } from './game/rules.js';
import { playGame, strategyById } from './game/strategies.js';
import { loadRules, saveSimRun } from './storage.js';
import { bindRulesForm, rulesPanelHtml } from './ui/rules-form.js';

document.getElementById('rules-mount').innerHTML = rulesPanelHtml();

const form = document.getElementById('sim-form');
const statusEl = document.getElementById('sim-status');
const progressEl = document.getElementById('sim-progress');
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const startModeEl = document.getElementById('start-mode');
const symmetryEl = document.getElementById('symmetry');

let abort = false;
let rules = loadRules();

const rulesForm = bindRulesForm({
  onApply: (next) => {
    rules = next;
    renderCensus();
  },
});

renderCensus();
syncStartModeUi();
startModeEl.addEventListener('change', syncStartModeUi);
symmetryEl.addEventListener('change', renderCensus);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  abort = false;
  btnRun.disabled = true;
  btnStop.disabled = false;

  rules = rulesForm.getRules();
  const startMode = startModeEl.value;
  const teamSwap = symmetryEl.value === 'mirror-swap';
  const gamesPer = clamp(Number(document.getElementById('games-per').value) || 1, 1, 200);
  const gamesOfficial = clamp(Number(document.getElementById('games').value) || 1, 1, 5000);
  const maxMoves = clamp(Number(document.getElementById('max-moves').value) || 80, 4, 500);
  const seedRaw = document.getElementById('seed').value;
  const baseSeed = seedRaw === '' ? Math.floor(Math.random() * 1e9) : Number(seedRaw);
  const strategyAId = document.getElementById('strategy-a').value;
  const strategyBId = document.getElementById('strategy-b').value;
  const strategyA = strategyById(strategyAId);
  const strategyB = strategyById(strategyBId);
  const noOwnPaper = document.getElementById('sim-own').checked;
  const noRepeat = document.getElementById('sim-repeat').checked;

  /** @type {{ layout: import('./game/configs.js').TeamLayout|null, situation: string, id: string }[]} */
  let jobs = [];
  if (startMode === 'official') {
    for (let i = 0; i < gamesOfficial; i++) {
      jobs.push({
        layout: null,
        situation: `official · ${rulesLabel(rules)}`,
        id: 'official',
      });
    }
  } else {
    const census = uniqueSeatings({ teamSwap, playableOnly: true, rules });
    if (census.truncated) {
      statusEl.textContent = `Too many layouts (~${census.rawCount.toLocaleString()}). Lower players/team size (limit ${MAX_RAW_LAYOUTS}).`;
      btnRun.disabled = false;
      btnStop.disabled = true;
      return;
    }
    for (const cfg of census.configs) {
      for (let g = 0; g < gamesPer; g++) {
        jobs.push({ layout: cfg.layout, situation: cfg.situation, id: cfg.id });
      }
    }
  }

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let moveSum = 0;
  let winGames = 0;
  let minMoves = Infinity;
  let maxMovesSeen = 0;
  /** @type {Map<string, { games: number, winsA: number, winsB: number, draws: number, moveSum: number, winGames: number, layouts: Set<string> }>} */
  const bySit = new Map();

  const total = jobs.length;
  statusEl.textContent = `Running ${total} games…`;
  const seatingsUsed = new Set();

  const batch = 20;
  for (let i = 0; i < jobs.length; i++) {
    if (abort) break;
    const job = jobs[i];
    const seed = (baseSeed + i * 9973) >>> 0;
    const start =
      job.layout == null
        ? createInitialState({ seed, noOwnPaper, noRepeat, rules })
        : createStateFromLayout(job.layout, { seed, noOwnPaper, noRepeat, rules });

    seatingsUsed.add(job.id);
    const { winner, moves } = playGame(start, strategyA, strategyB, maxMoves);

    let bucket = bySit.get(job.situation);
    if (!bucket) {
      bucket = {
        games: 0,
        winsA: 0,
        winsB: 0,
        draws: 0,
        moveSum: 0,
        winGames: 0,
        layouts: new Set(),
      };
      bySit.set(job.situation, bucket);
    }
    bucket.games += 1;
    bucket.layouts.add(job.id);

    if (winner === 'A') {
      winsA++;
      moveSum += moves;
      winGames++;
      minMoves = Math.min(minMoves, moves);
      maxMovesSeen = Math.max(maxMovesSeen, moves);
      bucket.winsA++;
      bucket.moveSum += moves;
      bucket.winGames++;
    } else if (winner === 'B') {
      winsB++;
      moveSum += moves;
      winGames++;
      minMoves = Math.min(minMoves, moves);
      maxMovesSeen = Math.max(maxMovesSeen, moves);
      bucket.winsB++;
      bucket.moveSum += moves;
      bucket.winGames++;
    } else {
      draws++;
      bucket.draws++;
    }

    if (i % batch === 0 || i === jobs.length - 1) {
      progressEl.style.width = `${((i + 1) / total) * 100}%`;
      statusEl.textContent = `Done ${i + 1} / ${total}`;
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
        seatings: seatingsUsed.size,
      });
      renderSituationTable(bySit);
      await yieldToUi();
    }
  }

  const finishedGames = winsA + winsB + draws;
  if (!abort && finishedGames > 0) {
    const situations = [...bySit.entries()].map(([situation, b]) => ({
      situation,
      layouts: b.layouts.size,
      games: b.games,
      winsA: b.winsA,
      winsB: b.winsB,
      draws: b.draws,
      avgMoves: b.winGames ? b.moveSum / b.winGames : null,
    }));
    saveSimRun({
      rules,
      startMode,
      symmetry: symmetryEl.value,
      strategyA: strategyAId,
      strategyB: strategyBId,
      noOwnPaper,
      noRepeat,
      seed: baseSeed,
      games: finishedGames,
      seatings: seatingsUsed.size,
      winsA,
      winsB,
      draws,
      avgMoves: winGames ? moveSum / winGames : null,
      minMoves: winGames ? minMoves : null,
      maxMoves: winGames ? maxMovesSeen : null,
      situations,
    });
    statusEl.textContent = `Done: ${finishedGames} games · saved to Stats (seed ${baseSeed}).`;
  } else {
    statusEl.textContent = abort
      ? `Stopped after ${finishedGames} games.`
      : `Done: ${finishedGames} games (seed ${baseSeed}).`;
  }

  btnRun.disabled = false;
  btnStop.disabled = true;
});

btnStop.addEventListener('click', () => {
  abort = true;
});

function renderCensus() {
  rules = rulesForm.getRules();
  const teamSwap = symmetryEl.value === 'mirror-swap';
  const allMirror = uniqueSeatings({ teamSwap: false, playableOnly: false, rules });
  const allSwap = uniqueSeatings({ teamSwap: true, playableOnly: false, rules });
  const playable = uniqueSeatings({ teamSwap, playableOnly: true, rules });
  const buckets = groupBySituation(playable.configs);
  const raw = estimatedRawLayouts(rules);

  document.getElementById('census-raw').textContent = raw.toLocaleString();
  document.getElementById('census-mirror').textContent = allMirror.truncated
    ? '—'
    : String(allMirror.configs.length);
  document.getElementById('census-swap').textContent = allSwap.truncated
    ? '—'
    : String(allSwap.configs.length);
  document.getElementById('census-playable').textContent = playable.truncated
    ? '—'
    : String(playable.configs.length);
  document.getElementById('census-terminal').textContent = playable.truncated
    ? '—'
    : String(allMirror.terminalCount);
  document.getElementById('census-buckets').textContent = playable.truncated
    ? '—'
    : String(buckets.length);

  document.getElementById('census-summary').textContent = playable.truncated
    ? `Too many layouts (~${raw.toLocaleString()} > ${MAX_RAW_LAYOUTS}). Use official start or reduce players.`
    : teamSwap
      ? `Mirror + A↔B: ${playable.configs.length} playable seatings in ${buckets.length} buckets · ${rulesLabel(rules)}`
      : `Mirror only: ${playable.configs.length} playable seatings in ${buckets.length} buckets · ${rulesLabel(rules)}`;
}

function syncStartModeUi() {
  const unique = startModeEl.value === 'unique';
  document.getElementById('label-games-per').hidden = !unique;
  document.getElementById('label-games-total').hidden = unique;
  document.getElementById('symmetry').disabled = !unique;
}

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
  document.getElementById('stat-seatings').textContent =
    s.seatings != null ? String(s.seatings) : '—';

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
    `A ${s.winsA} · B ${s.winsB} · limit/draw ${s.draws} (of ${s.games}, seed ${s.baseSeed})`;
}

function renderSituationTable(bySit) {
  const body = document.getElementById('sit-body');
  const rows = [...bySit.entries()]
    .map(([situation, b]) => {
      const pctA = b.games ? (b.winsA / b.games) * 100 : 0;
      const pctB = b.games ? (b.winsB / b.games) * 100 : 0;
      const pctD = b.games ? (b.draws / b.games) * 100 : 0;
      const avg = b.winGames ? b.moveSum / b.winGames : null;
      return { situation, b, pctA, pctB, pctD, avg };
    })
    .sort((a, b) => b.pctA - a.pctA || b.b.games - a.b.games || a.situation.localeCompare(b.situation));

  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="hint">Run a unique-seatings batch to fill this table.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.situation)}</td>
        <td>${r.b.layouts.size}</td>
        <td>${r.b.games}</td>
        <td>${r.pctA.toFixed(1)}</td>
        <td>${r.pctB.toFixed(1)}</td>
        <td>${r.pctD.toFixed(1)}</td>
        <td>${r.avg == null ? '—' : r.avg.toFixed(1)}</td>
      </tr>`,
    )
    .join('');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function yieldToUi() {
  return new Promise((r) => setTimeout(r, 0));
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
