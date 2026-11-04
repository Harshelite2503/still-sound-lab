import {
  loadJournal, saveJournal, sanitizeJournal, mergeJournals, freshJournal, episodes, metrics, pilotSummary, JOURNAL_KEY,
} from './journal-store.js';

const $ = id => document.getElementById(id);
const store = (() => { try { return window.localStorage; } catch { return null; } })() || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let journal = loadJournal(store);

const CHOICE_LABELS = { silence: 'Dark screen, no sound', comfort: 'My comfort sound', softer: 'Softer and darker' };
const FOLLOW_LABELS = { better: 'A bit easier', same: 'About the same', worse: 'Worse' };
const STATE_LABELS = { attack: 'headache', warning: 'warning signs', recovering: 'recovering' };

function bars(el, counts, labels) {
  const entries = Object.entries(labels).map(([k, label]) => [label, counts[k] || 0]);
  const max = Math.max(1, ...entries.map(e => e[1]));
  el.replaceChildren(...entries.map(([label, n]) => {
    const row = document.createElement('div'); row.className = 'j-bar';
    const name = document.createElement('span'); name.textContent = label;
    const track = document.createElement('div'); const fill = document.createElement('i'); fill.style.width = `${(n / max) * 100}%`; track.append(fill);
    const value = document.createElement('b'); value.textContent = n;
    row.append(name, track, value); return row;
  }));
}

const fmtDate = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fmtMin = s => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);

function render() {
  const m = metrics(journal);
  $('stat-used').textContent = m.usedEpisodes;
  $('stat-missed').textContent = m.missedEpisodes;
  $('stat-minutes').textContent = m.medianListeningMin === null ? '–' : Math.round(m.medianListeningMin);
  $('stat-worse').textContent = m.worseSessions;
  bars($('choices'), m.choices, CHOICE_LABELS);
  bars($('follow'), m.followUps, FOLLOW_LABELS);

  const eps = episodes(journal).reverse();
  $('episode-count').textContent = `${eps.length} TOTAL`;
  if (eps.length) {
    $('episodes').replaceChildren(...eps.slice(0, 40).map(e => {
      const li = document.createElement('li');
      const when = document.createElement('time'); when.dateTime = e.start; when.textContent = fmtDate(e.start);
      const states = [...new Set(e.sessions.map(s => STATE_LABELS[s.state]))].join(', ');
      const chose = Object.entries(e.choices).filter(([, n]) => n).map(([k, n]) => `${CHOICE_LABELS[k].toLowerCase()}${n > 1 ? ` ×${n}` : ''}`).join(' · ');
      const parts = [states, chose];
      if (e.listeningS) parts.push(`${fmtMin(e.listeningS)} of sound`);
      if (e.darkS) parts.push(`${fmtMin(e.darkS)} dark`);
      const felt = Object.entries(e.followUps).filter(([k, n]) => n && FOLLOW_LABELS[k]).map(([k]) => FOLLOW_LABELS[k].toLowerCase());
      if (felt.length) parts.push(`felt: ${felt.join(', ')}`);
      li.append(when, ...parts.map(p => { const span = document.createElement('span'); span.textContent = p; return span; }));
      if (e.worse) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = 'made it worse once'; li.append(w); }
      return li;
    }));
  }
}

$('missed-date').valueAsDate = new Date();
$('missed-date').max = new Date().toISOString().slice(0, 10);
$('add-missed').addEventListener('click', () => {
  const value = $('missed-date').value;
  if (!value) return;
  journal = loadJournal(store);
  if (journal.missed.some(m => m.at.slice(0, 10) === value)) { $('missed-note').textContent = 'That day is already noted.'; return; }
  journal.missed.push({ at: new Date(`${value}T12:00:00`).toISOString() });
  journal = sanitizeJournal(journal);
  $('missed-note').textContent = saveJournal(store, journal) ? 'Noted. Thank you.' : 'This browser is not letting Still save.';
  render();
});

function download(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$('pilot').addEventListener('click', () => {
  try {
    const summary = pilotSummary(journal, $('code').value);
    download(summary, `still-pilot-${summary.participant}.json`);
    $('data-note').textContent = `Downloaded a summary of ${summary.episodes.length} episodes. Send it to the pilot team as agreed.`;
  } catch { $('data-note').textContent = 'Enter the pilot code you were given (letters and numbers only).'; }
});
$('export').addEventListener('click', () => download({ ...journal, exportedAt: new Date().toISOString() }, 'still-journal.json'));
$('import').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2e6) throw new Error('too large');
    journal = mergeJournals(loadJournal(store), sanitizeJournal(JSON.parse(await file.text())));
    saveJournal(store, journal); render();
    $('data-note').textContent = 'Backup merged into this journal.';
  } catch { $('data-note').textContent = 'That file is not a Still journal export. Nothing was changed.'; }
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear your journal from this browser? Exported files are not affected.')) return;
  try { store.removeItem(JOURNAL_KEY); } catch {}
  journal = freshJournal(); render();
  $('data-note').textContent = 'Journal cleared from this browser.';
});
$('dim').addEventListener('click', () => {
  const on = document.body.classList.toggle('dim');
  $('dim').textContent = on ? 'Light screen' : 'Dim screen'; $('dim').setAttribute('aria-pressed', String(on));
});
window.addEventListener('storage', e => { if (e.key === JOURNAL_KEY) { journal = loadJournal(store); render(); } });
render();
