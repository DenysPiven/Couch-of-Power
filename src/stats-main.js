import { clearSimRuns, deleteSimRun, loadSimRuns } from './storage.js';
import './theme.js';

const listEl = document.getElementById('runs-list');
const emptyEl = document.getElementById('runs-empty');
const detailEl = document.getElementById('run-detail');

let selectedId = null;

document.getElementById('btn-clear-runs').addEventListener('click', () => {
  if (!loadSimRuns().length) return;
  if (!confirm('Delete all saved simulation runs?')) return;
  clearSimRuns();
  selectedId = null;
  render();
});

function render() {
  const runs = loadSimRuns();
  emptyEl.hidden = runs.length > 0;
  listEl.innerHTML = runs
    .map((run) => {
      const when = new Date(run.createdAt).toLocaleString();
      const total = run.games || 1;
      const pctA = ((run.winsA / total) * 100).toFixed(1);
      const pctB = ((run.winsB / total) * 100).toFixed(1);
      const active = run.id === selectedId ? ' is-active' : '';
      return `<article class="run-card${active}" data-id="${run.id}">
        <div class="run-card-main">
          <strong>${escapeHtml(run.rulesLabel)}</strong>
          <span class="hint">${escapeHtml(when)} · ${escapeHtml(run.startMode)} · ${escapeHtml(run.strategyA)} vs ${escapeHtml(run.strategyB)}</span>
          <span>A ${pctA}% · B ${pctB}% · ${run.games} games · ${run.seatings} seatings</span>
        </div>
        <div class="run-card-actions">
          <button type="button" data-view="${run.id}">View</button>
          <button type="button" data-delete="${run.id}">Delete</button>
        </div>
      </article>`;
    })
    .join('');

  for (const btn of listEl.querySelectorAll('[data-view]')) {
    btn.addEventListener('click', () => {
      selectedId = btn.getAttribute('data-view');
      render();
    });
  }
  for (const btn of listEl.querySelectorAll('[data-delete]')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete');
      deleteSimRun(id);
      if (selectedId === id) selectedId = null;
      render();
    });
  }

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  if (!selected) {
    detailEl.hidden = true;
    return;
  }
  detailEl.hidden = false;
  showDetail(selected);
}

/** @param {import('./storage.js').SimRunRecord} run */
function showDetail(run) {
  const total = run.games || 1;
  const pctA = (run.winsA / total) * 100;
  const pctB = (run.winsB / total) * 100;
  const pctD = (run.draws / total) * 100;
  document.getElementById('detail-title').textContent = run.rulesLabel;
  document.getElementById('detail-summary').textContent =
    `${new Date(run.createdAt).toLocaleString()} · ${run.startMode} · ${run.symmetry} · ${run.strategyA} vs ${run.strategyB} · seed ${run.seed}` +
    (run.noOwnPaper ? ' · no-own' : '') +
    (run.noRepeat ? ' · no-repeat' : '');

  document.getElementById('detail-stats').innerHTML = `
    <div class="stat"><div class="label">Wins A</div><div class="value">${run.winsA}</div></div>
    <div class="stat"><div class="label">Wins B</div><div class="value">${run.winsB}</div></div>
    <div class="stat"><div class="label">Draws</div><div class="value">${run.draws}</div></div>
    <div class="stat"><div class="label">Games</div><div class="value">${run.games}</div></div>
    <div class="stat"><div class="label">Seatings</div><div class="value">${run.seatings}</div></div>
    <div class="stat"><div class="label">Avg moves</div><div class="value">${run.avgMoves == null ? '—' : run.avgMoves.toFixed(1)}</div></div>
  `;

  document.getElementById('detail-bar-a').style.width = `${pctA}%`;
  document.getElementById('detail-bar-b').style.width = `${pctB}%`;
  document.getElementById('detail-bar-draw').style.width = `${pctD}%`;
  document.getElementById('detail-pct-a').textContent = `${pctA.toFixed(1)}%`;
  document.getElementById('detail-pct-b').textContent = `${pctB.toFixed(1)}%`;
  document.getElementById('detail-pct-draw').textContent = `${pctD.toFixed(1)}%`;

  const sits = [...(run.situations || [])].sort(
    (a, b) => b.winsA / (b.games || 1) - a.winsA / (a.games || 1),
  );
  document.getElementById('detail-sit-body').innerHTML = sits.length
    ? sits
        .map((s) => {
          const g = s.games || 1;
          return `<tr>
            <td>${escapeHtml(s.situation)}</td>
            <td>${s.layouts}</td>
            <td>${s.games}</td>
            <td>${((s.winsA / g) * 100).toFixed(1)}</td>
            <td>${((s.winsB / g) * 100).toFixed(1)}</td>
            <td>${((s.draws / g) * 100).toFixed(1)}</td>
            <td>${s.avgMoves == null ? '—' : s.avgMoves.toFixed(1)}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="7" class="hint">No situation breakdown stored.</td></tr>';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

render();
