/** Observational personal feedback only. No population or clinical inference. */
export function normalizeSessions(input) {
  const rows = Array.isArray(input) ? input : input?.schema === 'still-comfort-v1' ? input.sessions : null;
  if (!Array.isArray(rows)) throw new Error('Choose a Still check-in JSON export.');
  if (rows.length > 10000) throw new Error('Please use an export with 10,000 sessions or fewer.');
  const sessions = [];
  let excluded = 0;
  for (const row of rows) {
    if (!row || !['warm', 'rain', 'binaural'].includes(row.kind) || ![-1, 0, 1].includes(row.comfort)
      || typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))
      || !Number.isFinite(row.listenedSeconds) || row.listenedSeconds <= 0
      || (row.hadNonzeroAppGain === false)) { excluded++; continue; }
    const frequency = row.settings?.frequency;
    const beat = row.settings?.beatHz;
    if (row.kind === 'binaural' && (!Number.isFinite(frequency) || frequency < 100 || frequency > 600
      || !Number.isFinite(beat) || beat < 0 || beat > 12)) { excluded++; continue; }
    sessions.push({
      at: row.at, kind: row.kind, comfort: row.comfort,
      frequency: Number.isFinite(frequency) ? frequency : null,
      beat: Number.isFinite(beat) ? beat : null,
      seconds: row.listenedSeconds,
      mood: ['low', 'tense', 'neutral', 'calm'].includes(row.context?.mood) ? row.context.mood : 'unknown',
      environment: ['quiet', 'noisy', 'bedtime'].includes(row.context?.environment) ? row.context.environment : 'unknown'
    });
  }
  return { sessions, excluded };
}

export function mergeSessions(...sets) {
  const unique = new Map();
  for (const rows of sets) for (const row of rows) {
    const key = [row.at, row.kind, row.frequency, row.beat].join('|');
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function aggregateComfort(sessions, { mood = 'all', environment = 'all' } = {}) {
  const filtered = sessions.filter(s => (mood === 'all' || s.mood === mood) && (environment === 'all' || s.environment === environment));
  const cells = Array.from({ length: 13 }, (_, row) => Array.from({ length: 10 }, (_, col) => ({ row, col, count: 0, sum: 0, ratings: [0, 0, 0], mean: null })));
  const types = Object.fromEntries(['warm', 'rain', 'binaural'].map(kind => [kind, { count: 0, ratings: [0, 0, 0] }]));
  for (const session of filtered) {
    const type = types[session.kind];
    type.count++; type.ratings[session.comfort + 1]++;
    if (session.kind !== 'binaural') continue;
    const col = Math.min(9, Math.floor((session.frequency - 100) / 50));
    const row = session.beat === 0 ? 0 : Math.ceil(session.beat);
    const cell = cells[row][col];
    cell.count++; cell.sum += session.comfort; cell.ratings[session.comfort + 1]++;
  }
  for (const row of cells) for (const cell of row) if (cell.count) cell.mean = cell.sum / cell.count;
  return { cells, types, total: filtered.length, stereoTotal: types.binaural.count };
}
