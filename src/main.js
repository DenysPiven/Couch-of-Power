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
const knownListEl = document.getElementById('known-list');

let state = null;
/** @type {{ state: import('./game/engine.js').GameState, knownPapers: Map<number, number>, calledNames: Set<number> }[]} */
let history = [];
let showPapers = false;
/** playerId -> nameOwnerId we currently know they hold */
let knownPapers = new Map();
/** nameOwnerIds that have been called at least once this game */
let calledNames = new Set();

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
  knownPapers = new Map();
  calledNames = new Set();
  logEl.innerHTML = '';
  render();
}

function seatPosition(index) {
  // Seat 0 at top; clockwise. Couch = 0..3 near the top.
  const angle = (-90 + index * (360 / SEAT_COUNT)) * (Math.PI / 180);
  const radius = 36;
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
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    boardEl.appendChild(el);
  }
}

function paperIsKnown(playerId) {
  if (showPapers) return true;
  const known = knownPapers.get(playerId);
  return known != null && known === state.papers[playerId];
}

/**
 * After calling `nameOwnerId`, everyone sees who held that paper; the caller
 * receives it. The mover gets the caller's old paper only if that was known.
 * @param {import('./game/engine.js').GameState} before
 * @param {number} nameOwnerId
 * @param {Map<number, number>} prevKnown
 */
function knowledgeAfterCall(before, nameOwnerId, prevKnown) {
  const caller = callerId(before);
  let mover = -1;
  for (let s = 0; s < SEAT_COUNT; s++) {
    const pid = before.seats[s];
    if (pid != null && before.papers[pid] === nameOwnerId) {
      mover = pid;
      break;
    }
  }

  const next = new Map(prevKnown);
  const callerOldPaper = before.papers[caller];

  // Public: caller now holds the called name.
  next.set(caller, nameOwnerId);

  // Mover receives caller's previous paper — known only if we already knew it.
  if (prevKnown.has(caller) && prevKnown.get(caller) === callerOldPaper) {
    next.set(mover, callerOldPaper);
  } else {
    next.delete(mover);
  }

  return next;
}

function renderKnownList() {
  if (!knownListEl) return;
  const entries = [];
  for (const [playerId, nameOwnerId] of knownPapers) {
    if (state.papers[playerId] !== nameOwnerId) continue;
    const holder = state.players[playerId];
    const paper = state.players[nameOwnerId];
    entries.push(`${holder.name} holds “${paper.name}”`);
  }
  if (!entries.length) {
    knownListEl.textContent = 'None yet — call a name to reveal a paper.';
    return;
  }
  knownListEl.textContent = entries.join(' · ');
}

function render() {
  ensureSeats();
  const counts = couchCounts(state);
  document.getElementById('score-a').textContent = String(counts.A);
  document.getElementById('score-b').textContent = String(counts.B);
  document.getElementById('move-count').textContent = String(state.moveCount);

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
    const known = paperIsKnown(pid);
    el.innerHTML = `
      <span class="seat-label">${COUCH.includes(i) ? 'couch' : `seat ${i + 1}`} · ${player.team}</span>
      <span class="seat-name">${player.name}</span>
      <div class="seat-paper ${known ? 'is-known' : 'is-hidden'}" title="${known ? 'Known paper' : 'Hidden paper'}">${paperText}</div>
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
    if (calledNames.has(p.id)) btn.classList.add('is-revealed');
    btn.disabled = !legal.includes(p.id);
    btn.title = calledNames.has(p.id) ? 'Called before this game' : '';
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

  renderKnownList();
}

function doCall(nameOwnerId) {
  if (state.winner) return;
  history.push({
    state,
    knownPapers: new Map(knownPapers),
    calledNames: new Set(calledNames),
  });
  const caller = state.players[callerId(state)];
  const called = state.players[nameOwnerId];
  const before = state;
  knownPapers = knowledgeAfterCall(before, nameOwnerId, knownPapers);
  calledNames.add(nameOwnerId);
  state = applyCall(before, nameOwnerId);
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
  const prev = history.pop();
  state = prev.state;
  knownPapers = prev.knownPapers;
  calledNames = prev.calledNames;
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
