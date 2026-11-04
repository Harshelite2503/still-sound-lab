import { normalizeSessions, mergeSessions, aggregateComfort } from './comfort-data.js';

const root = document.getElementById('comfort-section');
if (root) {
  root.innerHTML = `
    <style>
      #comfort-section{margin-top:42px;border-top:1px solid var(--line,#d8ddd1);padding-top:35px}
      #comfort-section h2{font:32px/1.2 Georgia,serif;letter-spacing:-.5px;margin:8px 0 12px}
      #comfort-section h3{font-size:17px;margin:26px 0 10px}
      #comfort-section p{line-height:1.7;max-width:850px}
      #comfort-section .comfort-intro{color:var(--muted,#65746b);font-size:14px}
      #comfort-section .comfort-controls{display:flex;align-items:end;gap:16px;flex-wrap:wrap;margin:24px 0}
      #comfort-section label{display:flex;flex-direction:column;gap:7px;font-size:12px}
      #comfort-section select,#comfort-section button{border:1px solid var(--line,#d8ddd1);border-radius:7px;background:var(--surface,#fbfbf6);color:var(--ink,#243d32);padding:10px;font:inherit}
      #comfort-section button{cursor:pointer;font-size:13px;min-height:42px}
      #comfort-section .comfort-empty{padding:22px;background:var(--soft,#e9ede1);border-radius:10px;margin:20px 0}
      #comfort-section .comfort-empty p{margin:7px 0}
      #comfort-section .comfort-scroll{overflow:auto;padding-bottom:12px}
      #comfort-section table{border-collapse:separate;border-spacing:5px;min-width:760px;width:100%;font-size:12px}
      #comfort-section th{font-weight:500;min-width:58px;text-align:center;padding:4px}
      #comfort-section th:first-child{min-width:95px}
      #comfort-section .comfort-cell{min-height:39px;width:100%;border:0;border-radius:4px;background:var(--soft,#e9ede1);padding:5px;font-size:12px}
      #comfort-section .comfort-cell[data-empty]{background:repeating-linear-gradient(135deg,transparent,transparent 4px,var(--line,#d8ddd1) 4px,var(--line,#d8ddd1) 5px);color:var(--muted,#65746b);min-height:39px;display:grid;place-items:center;border-radius:4px}
      #comfort-section .comfort-cell small{display:block;font-size:10px;margin-top:2px}
      #comfort-section .comfort-caption{font-size:12px;color:var(--muted,#65746b)}
      #comfort-section .comfort-legend{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin:12px 0}
      #comfort-section .comfort-legend i{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px}
      #comfort-section .comfort-type{display:grid;grid-template-columns:150px 1fr 180px;align-items:center;gap:14px;margin:12px 0;font-size:13px}
      #comfort-section .comfort-type-bar{height:24px;background:var(--soft,#e9ede1);display:flex;border-radius:5px;overflow:hidden}
      #comfort-section .comfort-type-bar span{display:block}
      #comfort-section .comfort-summary{padding:14px 0;font-size:14px;border-bottom:1px solid var(--line,#d8ddd1)}
      #comfort-section .comfort-readout{min-height:55px;font-size:13px;line-height:1.6;padding:12px;background:var(--soft,#e9ede1);border-radius:7px}
      @media(max-width:600px){#comfort-section h2{font-size:27px}#comfort-section .comfort-controls>*{flex:1}#comfort-section .comfort-type{grid-template-columns:110px 1fr;gap:8px}#comfort-section .comfort-type small{grid-column:2}#comfort-section select{font-size:16px}}
    </style>
    <p class="eyebrow">YOUR EXPERIENCE · OBSERVATIONS ONLY</p>
    <h2>Which frequency zones feel good to you?</h2>
    <p class="comfort-intro">This map uses your own saved listening ratings to explore your sweet frequency zones: nearby settings that repeatedly feel comforting. Read each zone together with its session count and mood or surroundings. A few positive ratings are a starting clue, not a confirmed preference or treatment effect.</p>
    <div class="comfort-controls">
      <label>Mood<select id="comfort-mood"><option value="all">All recorded moods</option><option value="low">Low / sad</option><option value="tense">Tense</option><option value="neutral">Neutral</option><option value="calm">Calm</option><option value="unknown">Not recorded</option></select></label>
      <label>Surroundings<select id="comfort-environment"><option value="all">All surroundings</option><option value="quiet">Quiet</option><option value="noisy">Noisy</option><option value="bedtime">Bedtime</option><option value="unknown">Not recorded</option></select></label>
      <button id="comfort-refresh" type="button">Refresh saved ratings</button>
      <button id="comfort-import" type="button">Import my check-in JSON</button>
      <input id="comfort-file" type="file" accept="application/json,.json" hidden>
    </div>
    <p id="comfort-status" class="comfort-caption" role="status">Reads the notebook saved in this browser. Imported records stay in this page’s memory until you reload. Nothing is uploaded.</p>
    <div id="comfort-empty" class="comfort-empty"><strong>No rated sessions to plot yet.</strong><p><a href="index.html">Try a sound and save a check-in →</a></p><p class="comfort-caption">Untested combinations stay empty. No simulated ratings or “optimal” frequencies are filled in.</p></div>
    <div id="comfort-summary" class="comfort-summary"></div>
    <h3>Observed comfort by sound type</h3>
    <div class="comfort-legend"><span><i style="background:#bb6d66"></i>Uncomfortable (−1)</span><span><i style="background:#a9ac9e"></i>Neutral (0)</span><span><i style="background:#668c67"></i>Comforting (+1)</span></div>
    <div id="comfort-types" aria-label="Counts of ratings by sound type"></div>
    <h3>Your frequency-zone map: base tone × beat difference</h3>
    <p class="comfort-caption">Columns group the left-ear carrier into 50 Hz bands. Rows group the right-minus-left difference into 1 Hz bands, with 0 Hz kept separate. Each tested cell shows the mean comfort rating and the number of sessions. Binning is a display choice, not a treatment range.</p>
    <div class="comfort-scroll"><table id="comfort-grid" aria-label="Observed mean comfort by carrier frequency and binaural difference"></table></div>
    <div id="comfort-readout" class="comfort-readout" role="status">Select a tested cell to see its raw rating counts. Hatched cells have no observations.</div>
    <p class="comfort-caption">Only stereo-tone check-ins appear in the frequency map. Ratings for rainlike noise and harmonic sounds are counted above. Known app-muted sessions and malformed records are excluded. Older exports without gain history are retained with unknown audibility. Different volumes, sensitivity settings, listening durations, expectations and other circumstances can affect ratings; no interpolation or causal effect is estimated.</p>
  `;
  const el = id => root.querySelector('#' + id);
  let imported = [], skippedImported = 0;
  const colors = ['#bb6d66', '#a9ac9e', '#668c67'];
  const names = { warm: 'Harmonic tone', rain: 'Rainlike noise', binaural: 'Stereo tones' };
  const bandLabel = col => `${100 + col * 50}–${col === 9 ? '600' : '<' + (150 + col * 50)}`;
  const beatLabel = row => row === 0 ? '0 (same tone)' : `>${row - 1}–${row}`;
  function readLocal() {
    try { return normalizeSessions(JSON.parse(localStorage.getItem('still-comfort-v1') || '[]')); }
    catch { return { sessions: [], excluded: 0 }; }
  }
  function render() {
    const local = readLocal();
    const merged = mergeSessions(local.sessions, imported);
    const result = aggregateComfort(merged, { mood: el('comfort-mood').value, environment: el('comfort-environment').value });
    el('comfort-empty').hidden = result.total > 0;
    el('comfort-summary').textContent = `${result.total} rated session${result.total === 1 ? '' : 's'} in this view · ${result.stereoTotal} stereo-tone session${result.stereoTotal === 1 ? '' : 's'}. ${local.excluded + skippedImported} invalid or known app-muted records excluded before filtering.`;
    const types = el('comfort-types'); types.replaceChildren();
    for (const [kind, group] of Object.entries(result.types)) {
      const row = document.createElement('div'); row.className = 'comfort-type';
      const label = document.createElement('span'); label.textContent = names[kind];
      const bar = document.createElement('div'); bar.className = 'comfort-type-bar'; bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${group.ratings[0]} uncomfortable, ${group.ratings[1]} neutral, ${group.ratings[2]} comforting`);
      group.ratings.forEach((count, index) => { const piece = document.createElement('span'); piece.style.width = (group.count ? 100 * count / group.count : 0) + '%'; piece.style.background = colors[index]; bar.append(piece); });
      const count = document.createElement('small'); count.textContent = group.count ? `${group.ratings[0]} / ${group.ratings[1]} / ${group.ratings[2]} · n=${group.count}` : 'No ratings';
      row.append(label, bar, count); types.append(row);
    }
    const table = el('comfort-grid'); table.replaceChildren();
    const caption = document.createElement('caption'); caption.textContent = 'Left-ear carrier frequency (Hz) →'; table.append(caption);
    const head = document.createElement('thead'), hr = document.createElement('tr');
    const corner = document.createElement('th'); corner.textContent = 'Difference (Hz) ↓'; hr.append(corner);
    for (let col = 0; col < 10; col++) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = bandLabel(col); hr.append(th); }
    head.append(hr); table.append(head); const body = document.createElement('tbody');
    for (const row of result.cells) {
      const tr = document.createElement('tr'), label = document.createElement('th'); label.scope = 'row'; label.textContent = beatLabel(row[0].row); tr.append(label);
      for (const cell of row) {
        const td = document.createElement('td');
        if (!cell.count) { const blank = document.createElement('span'); blank.className = 'comfort-cell'; blank.dataset.empty = ''; blank.textContent = '—'; blank.setAttribute('aria-label', 'Not observed'); td.append(blank); }
        else {
          const button = document.createElement('button'); button.className = 'comfort-cell'; button.type = 'button';
          const strength = Math.abs(cell.mean), base = cell.mean >= 0 ? [102, 140, 103] : [187, 109, 102];
          button.style.background = `rgb(${base.map(v => Math.round(220 + strength * (v - 220))).join(',')})`;
          button.style.color = '#08150d';
          const value = document.createElement('span'); value.textContent = (cell.mean > 0 ? '+' : '') + cell.mean.toFixed(2);
          const n = document.createElement('small'); n.textContent = 'n=' + cell.count; button.append(value, n);
          const text = `${bandLabel(cell.col)} Hz carrier; ${beatLabel(cell.row)} Hz difference. ${cell.count} sessions: ${cell.ratings[0]} uncomfortable, ${cell.ratings[1]} neutral, ${cell.ratings[2]} comforting. Mean ${cell.mean.toFixed(2)}. This is an observed group, not an optimal frequency.`;
          button.setAttribute('aria-label', text); button.addEventListener('click', () => { el('comfort-readout').textContent = text; }); td.append(button);
        }
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    el('comfort-readout').textContent = 'Select a tested cell to see its raw rating counts. Hatched cells have no observations.';
  }
  for (const id of ['comfort-mood', 'comfort-environment']) el(id).addEventListener('change', render);
  el('comfort-refresh').addEventListener('click', render);
  el('comfort-import').addEventListener('click', () => el('comfort-file').click());
  el('comfort-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Please choose a JSON export smaller than 5 MB.');
      const parsed = normalizeSessions(JSON.parse(await file.text()));
      imported = mergeSessions(imported, parsed.sessions); skippedImported += parsed.excluded;
      render(); el('comfort-status').textContent = `Imported ${parsed.sessions.length} valid records locally; duplicates are merged. Imports stay in this page’s memory until reload. No data was uploaded.`;
    } catch (error) { el('comfort-status').textContent = error.message || 'Could not read this export.'; }
    event.target.value = '';
  });
  window.addEventListener('storage', event => { if (event.key === 'still-comfort-v1') render(); });
  window.addEventListener('focus', render);
  render();
}
