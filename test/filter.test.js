'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { toSpokenText, shouldSpeak, humanizeIdentifier, humanizePath } = require('../plugins/earshot/src/filter');

test('humanizeIdentifier splits the casings people actually use', () => {
  assert.equal(humanizeIdentifier('user_auth_handler'), 'user auth handler');
  assert.equal(humanizeIdentifier('getUserById'), 'get User By Id');
  assert.equal(humanizeIdentifier('rate-limit-middleware'), 'rate limit middleware');
});

test('humanizePath keeps only the part worth hearing', () => {
  assert.equal(humanizePath('src/auth/token_store.ts'), 'token store');
  assert.equal(humanizePath('C:\\learning\\app\\mainHandler.go'), 'main Handler');
});

test('fenced code is described, never recited', () => {
  const { text, stats } = toSpokenText([
    'I fixed the retry logic.',
    '',
    '```js',
    'function retry(fn) {',
    '  return fn().catch(() => fn());',
    '}',
    '```'
  ].join('\n'));

  assert.equal(stats.codeBlocks, 1);
  assert.equal(stats.codeLines, 3);
  assert.ok(!text.includes('function retry'), 'code body leaked into speech');
  assert.ok(/code block/.test(text), `expected a code note, got: ${text}`);
  assert.ok(text.startsWith('I fixed the retry logic.'));
});

test('a diff is announced as a diff', () => {
  const { text } = toSpokenText('Updated the config.\n\n```diff\n- old: 1\n+ new: 2\n```');
  assert.ok(/diff/.test(text), text);
  assert.ok(!text.includes('old'), 'diff body leaked');
});

test('an unterminated fence (truncated response) does not leak code', () => {
  const { text } = toSpokenText('Here is the fix.\n\n```python\ndef broken(\n  x');
  assert.ok(!text.includes('def broken'), text);
  assert.ok(text.includes('Here is the fix.'));
});

test('markdown scaffolding is stripped but its text survives', () => {
  const { text } = toSpokenText([
    '## Summary of changes',
    '',
    '- Fixed the **login** bug',
    '- Added a [test suite](https://example.com/tests)',
    '',
    '> Note the caveat'
  ].join('\n'));

  assert.ok(!/[#*>[\]]/.test(text), `markdown leaked: ${text}`);
  assert.ok(text.includes('Summary of changes'));
  assert.ok(text.includes('login'));
  assert.ok(text.includes('test suite'));
});

test('tables are announced, not read cell by cell', () => {
  const { text, stats } = toSpokenText('Results below.\n\n| Case | Result |\n|---|---|\n| auth | pass |');
  assert.equal(stats.tables, 1);
  assert.ok(!text.includes('pass'), 'table cells leaked');
  assert.ok(/table/.test(text), text);
});

test('paths and identifiers come out pronounceable', () => {
  const { text } = toSpokenText('Updated `src/auth/token_store.ts` and called `getUserById`.');
  assert.ok(text.includes('token store'), text);
  assert.ok(text.includes('get User By Id'), text);
  assert.ok(!text.includes('src/'), text);
});

test('output is capped at maxWords', () => {
  const long = `${'word '.repeat(300)}.`;
  const { text, stats } = toSpokenText(long, { maxWords: 25 });
  assert.ok(stats.truncated);
  assert.ok(text.split(/\s+/).filter(Boolean).length <= 26, text.split(/\s+/).length);
});

test('leading filler is dropped', () => {
  const { text } = toSpokenText('Sure! I updated the handler.');
  assert.ok(text.startsWith('I updated'), text);
});

test('empty and symbol-only input produce silence, not noise', () => {
  assert.equal(toSpokenText('').text, '');
  assert.equal(toSpokenText('```\n{}\n```', { describeCode: false }).text, '');
  assert.equal(toSpokenText('---').text, '');
});

test('shouldSpeak stays quiet on routine progress', () => {
  const verdict = shouldSpeak('I updated the handler and all 51 tests pass.');
  assert.equal(verdict.speak, false);
});

test('shouldSpeak fires on questions, failures and blockers', () => {
  assert.equal(shouldSpeak('Which database should I use for this?').speak, true);
  assert.equal(shouldSpeak('The build failed with a type error.').speak, true);
  assert.equal(shouldSpeak('I am blocked on the missing API key.').speak, true);
});
