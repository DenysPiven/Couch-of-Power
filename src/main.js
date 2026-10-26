import {
  applyCall,
  couchCounts,
  createInitialState,
  callerId,
  callerSeat,
  COUCH,
  DEFAULT_NAMES,
  emptySeat,
  legalCalls,
  nameOnPaper,
  SEAT_COUNT,
} from './game/engine.js';

const boardEl = document.getElementById('board');
const callGrid = document.getElementById('call-grid');
const logEl = document.getElementById('log');
const winBanner = document.getElementById('win-banner');
const namesForm = document.getElementById('names-form');

let state = null;
/** @type {import('./game/engine.js').GameState[]} */
let history = [];
let showPapers = false;

function readNames() {
  const inputs = namesForm.querySelectorAll('input[data-name-idx]');
  if (!inputs.length) return [...DEFAULT_NAMES];
  return [...inputs].map((el, i) => el.value.trim() || DEFAULT_NAMES[i]);
}

function buildNamesForm() {
  namesForm.innerHTML = '';
  DEFAULT_NAMES.forEach((name, i) => {
    const label = document.createElement('label');
    label.textContent = `Player ${i + 1} (${i % 2 === 0 ? 'A' : 'B'})`;
    const input = document.createElement('input');
    input.value = name;
    input.dataset.nameIdx = String(i);
    input.maxLength = 16;
    label.appendChild(input);
    namesForm.appendChild(label);
  });
}

function newGame() {
  const names = readNames();
  state = createInitialState({
    names,
    noOwnPaper: document.getElementById('rule-own').checked,
    noRepeat: document.getElementById('rule-repeat').checked,
  });
  history = [];
  logEl.innerHTML = '';
  render();
}

function seatPosition(index) {
  // Seat 0 at top; clockwise. Couch = 0..3 near the top.
  const angle = (-90 + index * (360 / SEAT_COUNT)) * (Math.PI / 180);
  const radius = 38;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x, y };
}

function ensureSeats() {
  if (boardEl.querySelectorAll('.seat').length === SEAT_COUNT) return;
  for (let i = 0; i < SEAT_COUNT; i++) {
    const { x, y } = seatPosition(i);
    const el = document.createElement('div');
    el.className = 'seat';
    el.dataset.seat = String(i);
    el.style.setProperty('--x', `${x}%`);
    el.style.setProperty('--y', `${y}%`);
    boardEl.appendChild(el);
  }
}

function render() {
  ensureSeats();
  const counts = couchCounts(state);
  document.getElementById('score-a').textContent = String(counts.A);
  document.getElementById('score-b').textContent = String(counts.B);
  document.getElementById('move-count').textContent = String(state.moveCount);

  const empty = emptySeat(state.seats);
  const cSeat = callerSeat(state.seats);
  const cId = state.winner ? null : callerId(state);

  if (cId != null) {
    const p = state.players[cId];
    document.getElementById('caller-name').textContent = p.name;
    document.getElementById('caller-team').textContent = p.team;
  } else {
    document.getElementById('caller-name').textContent = '—';
    document.getElementById('caller-team').textContent = '—';
  }

  for (const el of boardEl.querySelectorAll('.seat')) {
    const i = Number(el.dataset.seat);
    const pid = state.seats[i];
    el.classList.toggle('is-couch', COUCH.includes(i));
    el.classList.toggle('is-empty', pid == null);
    el.classList.toggle('is-caller', i === cSeat && pid != null && !state.winner);
    el.classList.remove('team-A', 'team-B');

    if (pid == null) {
      el.innerHTML = `<span class="seat-label">Seat ${i + 1}</span><span class="seat-name">empty</span>`;
      continue;
    }

    const player = state.players[pid];
    el.classList.add(`team-${player.team}`);
    const paperText = nameOnPaper(state, pid);
    el.innerHTML = `
      <span class="seat-label">${COUCH.includes(i) ? 'couch' : `seat ${i + 1}`} · ${player.team}</span>
      <span class="seat-name">${player.name}</span>
      <div class="seat-paper ${showPapers ? '' : 'is-hidden'}" title="Paper">${paperText}</div>
    `;
  }

  const legal = legalCalls(state);
  callGrid.innerHTML = '';
  document.getElementById('call-hint').textContent = state.winner
    ? 'Game over — start a new one.'
    : `Legal calls: ${legal.length}. Caller: ${state.players[cId].name}.`;

  for (const p of state.players) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = p.name;
    btn.className = `call-${p.team}`;
    btn.disabled = !legal.includes(p.id);
    btn.addEventListener('click', () => doCall(p.id));
    callGrid.appendChild(btn);
  }

  if (state.winner) {
    winBanner.className = `win-banner show ${state.winner}`;
    winBanner.textContent = `Team ${state.winner} wins in ${state.moveCount} moves!`;
  } else {
    winBanner.className = 'win-banner';
    winBanner.textContent = '';
  }

  document.getElementById('btn-undo').disabled = history.length === 0;
  document.getElementById('btn-toggle-papers').textContent = showPapers
    ? 'Hide papers'
    : 'Show papers';
}

function doCall(nameOwnerId) {
  if (state.winner) return;
  history.push(state);
  const caller = state.players[callerId(state)];
  const called = state.players[nameOwnerId];
  state = applyCall(state, nameOwnerId);
  const li = document.createElement('li');
  li.textContent = `${state.moveCount}. ${caller.name} → “${called.name}”${
    state.winner ? ` · win ${state.winner}` : ''
  }`;
  logEl.prepend(li);
  render();
}

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!history.length) return;
  state = history.pop();
  if (logEl.firstChild) logEl.removeChild(logEl.firstChild);
  render();
});
document.getElementById('btn-toggle-papers').addEventListener('click', () => {
  showPapers = !showPapers;
  render();
});

for (const id of ['rule-own', 'rule-repeat']) {
  document.getElementById(id).addEventListener('change', () => {
    if (!state) return;
    state = {
      ...state,
      noOwnPaper: document.getElementById('rule-own').checked,
      noRepeat: document.getElementById('rule-repeat').checked,
    };
    render();
  });
}

buildNamesForm();
newGame();
