import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  estimatedRawLayouts,
  normalizeRules,
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
    return normalizeRules({
      players: Number(playersEl.value),
      teamA: Number(teamAEl.value),
      teamB: Number(teamBEl.value),
      couchSize: Number(couchEl.value),
      emptyStart: Number(emptyEl.value),
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
    emptyEl.value = String(r.emptyStart);
    emptyEl.max = String(r.seatCount - 1);
    if (summaryEl) {
      const raw = estimatedRawLayouts(r);
      summaryEl.textContent = `${rulesLabel(r)} · ~${raw.toLocaleString()} raw seatings`;
    }
  }

  function syncDependent() {
    const players = Number(playersEl.value) || 8;
    teamAEl.max = String(Math.max(1, players - 1));
    teamBEl.max = String(Math.max(1, players - 1));
    const teamA = Number(teamAEl.value) || 1;
    teamBEl.value = String(Math.max(1, players - teamA));
    const minCouch = Math.max(Number(teamAEl.value) || 1, Number(teamBEl.value) || 1);
    couchEl.min = String(minCouch);
    couchEl.max = String(players);
    if (Number(couchEl.value) < minCouch) couchEl.value = String(minCouch);
    emptyEl.max = String(players);
    if (Number(emptyEl.value) > players) emptyEl.value = String(Math.min(Number(couchEl.value), players));
    fill(readDraft());
  }

  fill(loadRules());

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
      <input type="number" id="rules-empty" min="0" max="8" value="4" />
    </label>
    <div class="sim-actions">
      <button type="button" class="primary" id="btn-rules-apply">Apply setup</button>
      <span class="hint">Saved in this browser; used by Game, Simulations, and Stats.</span>
    </div>
  </div>
</section>`;
}
