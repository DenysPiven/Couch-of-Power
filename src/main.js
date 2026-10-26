import {
  applyCall,
  couchCounts,
  couchSeats,
  createInitialState,
  callerId,
  callerSeat,
  emptySeat,
  legalCalls,
  nameOnPaper,
  namesForCount,
} from './game/engine.js';
import { loadRules } from './storage.js';
import './theme.js';
import { bindRulesForm, rulesPanelHtml } from './ui/rules-form.js';

const boardEl = document.getElementById('board');
const callGrid = document.getElementById('call-grid');
const logEl = document.getElementById('log');
const winBanner = document.getElementById('win-banner');
const namesForm = document.getElementById('names-form');
const knownListEl = document.getElementById('known-list');
const leadEl = document.getElementById('game-lead');

document.getElementById('rules-mount').innerHTML = rulesPanelHtml();

let rules = loadRules();
let state = null;
/** @type {{ state: import('./game/engine.js').GameState, knownPapers: Map<number, number>, calledNames: Set<number> }[]} */
let history = [];
let showPapers = false;
let knownPapers = new Map();
let calledNames = new Set();

const rulesForm = bindRulesForm({
  onApply: (next) => {
    rules = next;
    buildNamesForm();
    newGame();
    updateLead();
  },
});

function updateLead() {
  if (!leadEl) return;
  leadEl.textContent = `${rules.players} players, ${rules.seatCount} seats. Whoever has the empty seat on their right calls a name. Whoever holds that paper sits in the empty seat and swaps papers with the caller. Win: get all ${rules.teamA} of team A or all ${rules.teamB} of team B on the couch (${rules.couchSize} seats).`;
}

function readNames() {
  const inputs = namesForm.querySelectorAll('input[data-name-idx]');
  const defaults = namesForCount(rules.players);
  if (!inputs.length) return defaults;
  return [...inputs].map((el, i) => el.value.trim() || defaults[i] || `Player ${i + 1}`);
}

function buildNamesForm() {
  namesForm.innerHTML = '';
  const defaults = namesForCount(rules.players);
  defaults.forEach((name, i) => {
    const label = document.createElement('label');
    label.textContent = `Player ${i + 1}`;
    const input = document.createElement('input');
    input.value = name;
    input.dataset.nameIdx = String(i);
    input.maxLength = 16;
    label.appendChild(input);
    namesForm.appendChild(label);
  });
}

function newGame() {
  rules = rulesForm.getRules();
  const names = readNames().slice(0, rules.players);
  while (names.length < rules.players) names.push(`Player ${names.length + 1}`);
  state = createInitialState({
    names,
    rules,
    noOwnPaper: document.getElementById('rule-own').checked,
    noRepeat: document.getElementById('rule-repeat').checked,
  });
  history = [];
  knownPapers = new Map();
  calledNames = new Set();
  logEl.innerHTML = '';
  resetSeatElements();
  render();
}

function resetSeatElements() {
  for (const el of boardEl.querySelectorAll('.seat')) el.remove();
}

function seatPosition(index, seatCount) {
  const angle = (-90 + index * (360 / seatCount)) * (Math.PI / 180);
  const radius = 36;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x, y };
}

function ensureSeats() {
  const seatCount = state.rules.seatCount;
  if (boardEl.querySelectorAll('.seat').length === seatCount) return;
  resetSeatElements();
  for (let i = 0; i < seatCount; i++) {
    const { x, y } = seatPosition(i, seatCount);
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
 * @param {import('./game/engine.js').GameState} before
 * @param {number} nameOwnerId
 * @param {Map<number, number>} prevKnown
 */
function knowledgeAfterCall(before, nameOwnerId, prevKnown) {
  const caller = callerId(before);
  let mover = -1;
  for (let s = 0; s < before.seats.length; s++) {
    const pid = before.seats[s];
    if (pid != null && before.papers[pid] === nameOwnerId) {
      mover = pid;
      break;
    }
  }
  const next = new Map(prevKnown);
  const callerOldPaper = before.papers[caller];
  next.set(caller, nameOwnerId);
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
    entries.push(`${state.players[playerId].name} holds “${state.players[nameOwnerId].name}”`);
  }
  knownListEl.textContent = entries.length
    ? entries.join(' · ')
    : 'None yet — call a name to reveal a paper.';
}

function render() {
  ensureSeats();
  const couch = couchSeats(state.rules);
  const counts = couchCounts(state);
  document.getElementById('score-a').textContent = String(counts.A);
  document.getElementById('score-b').textContent = String(counts.B);
  document.getElementById('score-a-need').textContent = ` / ${state.rules.teamA}`;
  document.getElementById('score-b-need').textContent = ` / ${state.rules.teamB}`;
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
    el.classList.toggle('is-couch', couch.includes(i));
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
      <span class="seat-label">${couch.includes(i) ? 'couch' : `seat ${i + 1}`} · ${player.team}</span>
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
  const toggle = document.getElementById('toggle-hidden-names');
  if (toggle) toggle.checked = showPapers;
  const toggleLabel = document.getElementById('toggle-hidden-label');
  const toggleHint = document.getElementById('toggle-hidden-hint');
  if (toggleLabel) {
    toggleLabel.textContent = showPapers ? 'Hide secret names' : 'Show hidden names';
  }
  if (toggleHint) {
    toggleHint.textContent = showPapers
      ? 'All papers visible; turn off to keep only learned names'
      : 'Reveal every still-secret paper on the board';
  }
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
document.getElementById('toggle-hidden-names').addEventListener('change', (e) => {
  showPapers = e.target.checked;
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
updateLead();
newGame();
