// Still for Video: the pre-registered analysis of participants' study exports.
// The success criteria below are fixed before any data is collected (see docs/still-for-video.md).
// Usage: node analysis/video_study.mjs exports/*.json
//
// These are product-discovery criteria, not clinical efficacy thresholds.
import fs from 'node:fs';

export const CRITERIA = Object.freeze({
  minParticipants: 20,
  // Primary: shaping beats simply turning it down (same loudness), without losing clarity.
  comfortGainVsQuieter: .5,      // mean per-person comfort difference (1–5 scale), and its 95% CI must exclude 0
  clarityMarginVsQuieter: -.5,   // lower 95% CI bound of the clarity difference must be above this
  // Secondary: personal tuning adds something beyond a good fixed preset.
  comfortGainVsPreset: .3,       // mean difference, CI excluding 0
  // Safety signal: share of ratings of the personal setting marked "made something worse".
  maxWorseRate: .10,
});

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

/** Seeded bootstrap 95% CI of the mean (percentile method). */
export function bootstrapCi(values, { reps = 4000, seed = 1 } = {}) {
  if (values.length < 2) return [NaN, NaN];
  let s = seed >>> 0 || 1;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const means = [];
  for (let r = 0; r < reps; r++) { let sum = 0; for (let i = 0; i < values.length; i++) sum += values[Math.floor(rand() * values.length)]; means.push(sum / values.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(.025 * reps)], means[Math.ceil(.975 * reps) - 1]];
}

/** Per participant: the mean within-check difference between two conditions on one rating. */
function perPersonDiff(exports, key, a, b) {
  return exports.map(e => {
    const diffs = (e.checks || []).map(c => {
      const ra = c.ratings.find(r => r.condition === a), rb = c.ratings.find(r => r.condition === b);
      return ra && rb && Number.isFinite(ra[key]) && Number.isFinite(rb[key]) ? ra[key] - rb[key] : null;
    }).filter(v => v !== null);
    return diffs.length ? mean(diffs) : null;
  }).filter(v => v !== null);
}

/** Apply the pre-registered criteria to a set of participant exports. */
export function analyse(exports, criteria = CRITERIA) {
  const all = exports.filter(e => e?.schema === 'still-video-study-v1');
  // A participant may have several datasets (another browser, or a cleared record that kept the code).
  // Keep the newest export of each (participant, dataset), then merge a participant's datasets,
  // de-duplicating sessions by id and checks and rounds by time.
  const newest = new Map();
  for (const e of all) {
    const key = `${e.participant}\u0000${e.dataset || ''}`, prev = newest.get(key);
    const t = Date.parse(e.exportedAt) || 0, pt = prev ? Date.parse(prev.exportedAt) || 0 : -1;
    if (!prev || t > pt || (t === pt && (e.checks?.length || 0) > (prev.checks?.length || 0))) newest.set(key, e);
  }
  const byPerson = new Map();
  const dedupe = (list, key) => [...new Map(list.map(x => [key(x), x])).values()];
  for (const e of newest.values()) {
    const p = byPerson.get(e.participant);
    byPerson.set(e.participant, !p ? { ...e } : {
      ...p,
      sessions: dedupe([...(p.sessions || []), ...(e.sessions || [])], x => x.id),
      checks: dedupe([...(p.checks || []), ...(e.checks || [])], x => `${x.at}|${x.state}`),
      rounds: dedupe([...(p.rounds || []), ...(e.rounds || [])], x => `${x.at}|${x.choice}`),
    });
  }
  const everyone = [...byPerson.values()];
  const unique = everyone.filter(e => Array.isArray(e.checks) && e.checks.length);
  const stat = (key, a, b) => { const d = perPersonDiff(unique, key, a, b); return { n: d.length, mean: d.length ? mean(d) : NaN, ci: bootstrapCi(d) }; };
  const comfortVsQuieter = stat('comfort', 'personal', 'quieter');
  const clarityVsQuieter = stat('clarity', 'personal', 'quieter');
  const comfortVsPreset = stat('comfort', 'personal', 'preset');
  const clarityVsPreset = stat('clarity', 'personal', 'preset');
  const personalRatings = unique.flatMap(e => e.checks.map(c => c.ratings.find(r => r.condition === 'personal')).filter(Boolean));
  const worseRate = personalRatings.length ? personalRatings.filter(r => r.worse).length / personalRatings.length : NaN;
  const sessions = everyone.flatMap(e => e.sessions || []);
  // Return proxy: the need is episodic and occasions are not observable, so report whether each person
  // came back on a later day, and the median gap between listening days.
  const dayOf = x => x.localDay || String(x.startedAt).slice(0, 10); // the person's own calendar day
  const dayLists = everyone.map(e => [...new Set((e.sessions || []).map(dayOf))].sort());
  const gaps = dayLists.flatMap(d => d.slice(1).map((day, i) => (Date.parse(day) - Date.parse(d[i])) / 864e5)).sort((a, b) => a - b);
  const rated = sessions.filter(s => s.feedback?.comfortable && s.feedback?.clear);
  const enough = unique.length >= criteria.minParticipants;
  const primary = enough && comfortVsQuieter.mean >= criteria.comfortGainVsQuieter && comfortVsQuieter.ci[0] > 0 && clarityVsQuieter.ci[0] > criteria.clarityMarginVsQuieter;
  const secondary = enough && comfortVsPreset.mean >= criteria.comfortGainVsPreset && comfortVsPreset.ci[0] > 0;
  const safe = Number.isFinite(worseRate) && worseRate <= criteria.maxWorseRate;
  return {
    participants: unique.length, checks: unique.reduce((s, e) => s + e.checks.length, 0), enough,
    comfortVsQuieter, clarityVsQuieter, comfortVsPreset, clarityVsPreset, worseRate,
    realUse: {
      participants: everyone.length, sessions: sessions.length, rated: rated.length,
      comfortableAndClear: rated.length ? rated.filter(s => s.feedback.comfortable === 'yes' && s.feedback.clear === 'yes').length / rated.length : NaN,
      returnedLaterDay: everyone.length ? dayLists.filter(d => d.length > 1).length / everyone.length : NaN,
      medianDaysBetween: gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN,
    },
    verdict: {
      primary: !enough ? 'not enough participants yet' : primary ? 'met: shaping beat turning it down, with clarity kept' : 'not met',
      secondary: !enough ? 'not enough participants yet' : secondary ? 'met: personal tuning beat the fixed preset' : 'not met: the fixed preset may be enough',
      safety: !Number.isFinite(worseRate) ? 'no ratings yet' : safe ? 'within limit' : 'above limit: investigate before scaling',
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node analysis/video_study.mjs export1.json [export2.json …]'); process.exit(1); }
  const exports = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const r = analyse(exports);
  const fmt = s => `${s.mean.toFixed(2)} (95% CI ${s.ci.map(v => v.toFixed(2)).join(' to ')}, n = ${s.n})`;
  console.log(`Participants ${r.participants}, checks ${r.checks}`);
  console.log(`Comfort, personal − turned down: ${fmt(r.comfortVsQuieter)}`);
  console.log(`Clarity, personal − turned down: ${fmt(r.clarityVsQuieter)}`);
  console.log(`Comfort, personal − preset:      ${fmt(r.comfortVsPreset)}`);
  console.log(`Clarity, personal − preset:      ${fmt(r.clarityVsPreset)}`);
  console.log(`"Made something worse" on personal: ${(r.worseRate * 100).toFixed(1)}%`);
  console.log(`Real use: ${r.realUse.participants} people, ${r.realUse.sessions} sessions, ${r.realUse.rated} rated, comfortable and clear ${(r.realUse.comfortableAndClear * 100).toFixed(0)}%`);
  console.log(`Came back on a later day: ${(r.realUse.returnedLaterDay * 100).toFixed(0)}%, median ${r.realUse.medianDaysBetween} days between listening days`);
  for (const [k, v] of Object.entries(r.verdict)) console.log(`${k}: ${v}`);
}
