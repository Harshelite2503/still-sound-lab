// Claims linter: user-facing text must never claim to treat, cure or prevent migraine.
// Negated statements ("does not treat") and descriptions of studies ("music therapy was not superior") are allowed.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../dist/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => /\.(html|js)$/.test(f));
const banned = /\b(cures?|cured|heal(s|ing)?|clinically proven|therap(y|ies|eutic)|relieves? (your )?migraine|treats? (your )?migraine|prevents? (your )?migraines?|reduces? (your )?(migraine )?attacks)\b/gi;
const negation = /\b(not|no|never|neither|nor|cannot|can't|doesn't|does not|without|isn't|unproven|nor)\b/i;
const studyContext = /\b(Medicine and Therapies|music therapy|music-therapy|therapist|therapy sessions|trial|study|randomi[sz]ed)\b/i;
const problems = [];
for (const file of files) {
  const text = fs.readFileSync(new URL(file, dir), 'utf8').replace(/<[^>]+>/g, ' ');
  for (const match of text.matchAll(banned)) {
    const start = Math.max(0, text.lastIndexOf('.', match.index) + 1, match.index - 160);
    const sentence = text.slice(start, match.index + match[0].length + 60);
    if (!negation.test(sentence) && !studyContext.test(sentence)) problems.push(`${file}: “…${sentence.trim().slice(0, 140)}…”`);
  }
}
assert.deepEqual(problems, [], 'Possible medical claim in user-facing text:\n' + problems.join('\n'));

// The app's own controls describe how sensitive to sound someone feels, never disease phases
// (FDA 2026 wellness guidance judges function, not only copy). Evidence pages may cite studies.
const evidencePages = new Set(['research.html', 'library.html', 'reference-study.html', 'graphs.html']);
const phase = /\b(during an attack|attack mode|warning signs|migraine phase|normal day)\b/i;
const phaseHits = files.filter(f => !evidencePages.has(f)).flatMap(f => {
  const text = fs.readFileSync(new URL(f, dir), 'utf8').replace(/<[^>]+>/g, ' ');
  const m = text.match(phase);
  return m ? [`${f}: “${m[0]}”`] : [];
});
assert.deepEqual(phaseHits, [], 'Disease-phase state names in app pages:\n' + phaseHits.join('\n'));
console.log(`claims linter ok · ${files.length} files checked`);
