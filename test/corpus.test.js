'use strict';

// Regression guard for smart mode, built from 138 labelled Claude Code responses
// written by independent reviewers (not by the author of the rules). Silent means
// routine progress or an optional closing offer; speak means a human is needed.
//
// "Blind" was blind for exactly one measurement: the first pass scored 38/45 (84%),
// against 25/45 (56%) for the version published before. The rules were then
// improved on the misses, so every set here is now a development set. Treat the
// thresholds as a floor that guards against regressions, not as an accuracy claim.

const test = require('node:test');
const assert = require('node:assert');

const { smartSummary } = require('../src/filter');

const SETS = {
  main: require('./fixtures/corpus-main.js'),
  heldout: require('./fixtures/corpus-heldout.js'),
  fresh: require('./fixtures/corpus-fresh.js'),
  blind: require('./fixtures/corpus-blind.json').map((c) => ({
    id: c.id, raw: c.text, truth: c.expect === 'speak' ? 'speak' : 'silent', mustSay: c.must_contain ? [c.must_contain] : []
  }))
};

function score(cases) {
  let right = 0;
  let clear = 0;
  const wrong = [];
  for (const c of cases) {
    if (c.truth === 'caveat') continue;                       // judgement call: not scored
    const expectSpeak = c.truth === 'speak';
    const r = smartSummary(c.raw);
    clear++;
    let ok = r.speak === expectSpeak;
    if (ok && expectSpeak && (c.mustSay || []).some((s) => !r.text.toLowerCase().includes(s.toLowerCase()))) ok = false;
    if (ok) right++; else wrong.push(`${c.id} (wanted ${expectSpeak ? 'speak' : 'silent'}, ${r.speak ? `said: ${r.text}` : 'was silent'})`);
  }
  return { right, clear, wrong };
}

for (const [name, cases] of Object.entries(SETS)) {
  test(`smart mode on the "${name}" corpus stays at or above its floor`, () => {
    const { right, clear, wrong } = score(cases);
    const floor = Math.floor(clear * 0.9);
    assert.ok(right >= floor, `${right}/${clear} correct, floor ${floor}. Wrong:\n  ${wrong.join('\n  ')}`);
  });
}

test('a speak/silent decision never throws, whatever the input', () => {
  for (const raw of ['', ' ', '?', '```', '```js\n?', '|||', '\u0001\u0002\u0003', 'a'.repeat(200000), '?'.repeat(5000)]) {
    assert.doesNotThrow(() => smartSummary(raw));
  }
});

test('a 600 KB response is processed well inside the hook time limit', () => {
  const big = `${'This is a wrapped line of ordinary prose that keeps going\n'.repeat(10000)}Which one should I use?`;
  const t0 = Date.now();
  const r = smartSummary(big);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
  assert.equal(r.kind, 'question');
});
