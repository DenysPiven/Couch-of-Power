import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  estimatedRawLayouts,
  normalizeRules,
  oppositeCouchEmpty,
  rulesLabel,
} from '../game/rules.js';
import { loadRules, saveRules } from '../storage.js';

/**
 * Bind a rules editor block.
 * Expected element ids:
 * rules-players, rules-team-a, rules-team-b, rules-couch, rules-empty, rules-summary, btn-rules-apply
 *
 * @param {{ onApply?: (rules: import('../game/rules.js').GameRules) => void }} [opts]
 */
export function bindRulesForm(opts = {}) {
  const playersEl = document.getElementById('rules-players');
  const teamAEl = document.getElementById('rules-team-a');
  const teamBEl = document.getElementById('rules-team-b');
  const couchEl = document.getElementById('rules-couch');
  const emptyEl = document.getElementById('rules-empty');
  const summaryEl = document.getElementById('rules-summary');
  const applyBtn = document.getElementById('btn-rules-apply');

  if (!playersEl || !teamAEl || !teamBEl || !couchEl || !emptyEl) {
    return { getRules: loadRules, refresh: () => {} };
  }

  function readDraft() {
    const seatCount = (Number(playersEl.value) || 8) + 1;
    // Form shows 1-based seat numbers (same as the board labels).
    const emptyOneBased = Number(emptyEl.value);
    const emptyStart = clampSeat(emptyOneBased - 1, seatCount);
    return normalizeRules({
      players: Number(playersEl.value),
      teamA: Number(teamAEl.value),
      teamB: Number(teamBEl.value),
      couchSize: Number(couchEl.value),
      emptyStart,
    });
  }

  function fill(rules) {
    const r = normalizeRules(rules);
    playersEl.value = String(r.players);
    playersEl.min = String(MIN_PLAYERS);
    playersEl.max = String(MAX_PLAYERS);
    teamAEl.value = String(r.teamA);
    teamBEl.value = String(r.teamB);
    couchEl.value = String(r.couchSize);
    emptyEl.min = '1';
    emptyEl.max = String(r.seatCount);
    emptyEl.value = String(r.emptyStart + 1);
    if (summaryEl) {
      const raw = estimatedRawLayouts(r);
      summaryEl.textContent = `${rulesLabel(r)} · empty seat ${r.emptyStart + 1} · ~${raw.toLocaleString()} raw seatings`;
    }
  }

  function syncDependent(ev) {
    const players = Number(playersEl.value) || 8;
    teamAEl.max = String(Math.max(1, players - 1));
    teamBEl.max = String(Math.max(1, players - 1));
    const teamA = Number(teamAEl.value) || 1;
    teamBEl.value = String(Math.max(1, players - teamA));
    const minCouch = Math.max(Number(teamAEl.value) || 1, Number(teamBEl.value) || 1);
    couchEl.min = String(minCouch);
    couchEl.max = String(players);
    if (Number(couchEl.value) < minCouch) couchEl.value = String(minCouch);
    const seatCount = players + 1;
    emptyEl.min = '1';
    emptyEl.max = String(seatCount);
    const changedSetup =
      ev &&
      (ev.target === playersEl || ev.target === couchEl || ev.target === teamAEl || ev.target === teamBEl);
    if (changedSetup || Number(emptyEl.value) < 1 || Number(emptyEl.value) > seatCount) {
      emptyEl.value = String(oppositeCouchEmpty(seatCount, Number(couchEl.value) || minCouch) + 1);
    }
    fill(readDraft());
  }

  fill(loadRules());
  // Fix older saved default (empty sat next to the couch instead of opposite it).
  const loaded = loadRules();
  if (loaded.players === 8 && loaded.couchSize === 4 && loaded.emptyStart === 4) {
    emptyEl.value = String(oppositeCouchEmpty(loaded.seatCount, loaded.couchSize) + 1);
    saveRules(readDraft());
    fill(loadRules());
  }

  for (const el of [playersEl, teamAEl, teamBEl, couchEl, emptyEl]) {
    el.addEventListener('change', syncDependent);
    el.addEventListener('input', syncDependent);
  }

  applyBtn?.addEventListener('click', () => {
    const rules = saveRules(readDraft());
    fill(rules);
    opts.onApply?.(rules);
  });

  return {
    getRules: () => normalizeRules(readDraft()),
    refresh: () => fill(loadRules()),
    apply: () => {
      const rules = saveRules(readDraft());
      fill(rules);
      opts.onApply?.(rules);
      return rules;
    },
  };
}

function clampSeat(index, seatCount) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(seatCount - 1, Math.round(index)));
}

/** Shared rules panel markup (insert into pages). */
export function rulesPanelHtml() {
  return `
<section class="panel rules-panel" aria-label="Game rules">
  <h2 class="panel-title">Table setup</h2>
  <p class="hint" id="rules-summary">Loading…</p>
  <div class="sim-form rules-form">
    <label>
      Players
      <input type="number" id="rules-players" min="4" max="16" value="8" />
    </label>
    <label>
      Team A size
      <input type="number" id="rules-team-a" min="1" max="15" value="4" />
    </label>
    <label>
      Team B size
      <input type="number" id="rules-team-b" min="1" max="15" value="4" />
    </label>
    <label>
      Couch seats
      <input type="number" id="rules-couch" min="2" max="8" value="4" />
    </label>
    <label>
      Empty seat at start
      <input type="number" id="rules-empty" min="1" max="9" value="7" />
    </label>
    <div class="sim-actions">
      <button type="button" class="primary" id="btn-rules-apply">Apply setup</button>
      <span class="hint">Saved in this browser; used by Game, Simulations, and Stats.</span>
    </div>
  </div>
</section>`;
}
