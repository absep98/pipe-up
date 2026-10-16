'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { smartSummary, shouldSpeak } = require('../src/filter');

const LONG_UPDATE = [
  'I went through the whole authentication module and made several changes. First, I moved the token',
  'refresh logic out of the request handler and into its own service, which makes it easier to test in',
  'isolation. Second, I added a mutex around the refresh call so that two concurrent requests cannot both',
  'trigger a refresh at the same moment. Third, I updated the existing unit tests and added two regression',
  'tests. All 51 tests pass locally and the linter is clean.',
  '',
  'Which database should I use for the new audit log table: the existing Postgres instance, or a separate store?'
].join('\n');

test('speaks the question itself, not the opening of a long response', () => {
  const r = smartSummary(LONG_UPDATE);
  assert.equal(r.speak, true);
  assert.equal(r.kind, 'question');
  assert.match(r.text, /Which database should I use/);
  assert.doesNotMatch(r.text, /authentication module/);
});

test('a very short question brings its context sentence along', () => {
  const r = smartSummary('I found two ways to fix this. Which one?');
  assert.equal(r.kind, 'question');
  assert.equal(r.text, 'I found two ways to fix this. Which one?');
});

test('a long question is kept to a speakable length, from its end', () => {
  const q = `${'word '.repeat(80)}and so which one do you want?`;
  const r = smartSummary(`Done.\n\n${q}`);
  assert.equal(r.kind, 'question');
  assert.ok(r.text.split(/\s+/).length <= 45);
  assert.match(r.text, /do you want\?$/);
});

test('a question that is not at the end still counts if it is recent', () => {
  const r = smartSummary('Should I proceed with the migration? I will keep reviewing the other files meanwhile.');
  assert.equal(r.kind, 'question');
  assert.match(r.text, /Should I proceed with the migration\?/);
});

test('reports the sentence that describes a failure', () => {
  const r = smartSummary(
    'I refactored the module and updated the imports. The build failed with a type error in auth. I could not fix it.'
  );
  assert.equal(r.speak, true);
  assert.equal(r.kind, 'blocker');
  assert.match(r.text, /^Problem: /);
  assert.match(r.text, /build failed/);
  assert.doesNotMatch(r.text, /refactored the module/);
});

test('routine progress stays silent', () => {
  for (const msg of [
    'I updated the handler and all 51 tests pass.',
    'Added error handling and permission checks to the upload route. Everything passes.',
    'Renamed the config loader. The linter is clean.'
  ]) {
    assert.equal(smartSummary(msg).speak, false, msg);
  }
});

test('negated or already-resolved failures do not count', () => {
  for (const msg of [
    'All tests pass with no failures.',
    'Nothing failed and there were no conflicts.',
    'Fixed the crash that blocked login.',
    'Resolved the merge conflict in the router.'
  ]) {
    assert.equal(smartSummary(msg).speak, false, msg);
  }
});

test('question marks and failure words inside code never trigger speech', () => {
  const msg = [
    'Here is the helper I added:',
    '',
    '```js',
    'const label = ok ? "pass" : "failed";',
    '// cannot happen?',
    '```',
    '',
    'It is in place now.'
  ].join('\n');
  assert.equal(smartSummary(msg).speak, false);
});

test('empty input is silent', () => {
  assert.equal(smartSummary('').speak, false);
  assert.equal(smartSummary(undefined).speak, false);
});

test('shouldSpeak agrees with smartSummary', () => {
  assert.equal(shouldSpeak('Which one?').speak, true);
  assert.equal(shouldSpeak('Done, tests pass.').speak, false);
  assert.equal(shouldSpeak('The build failed.').reason, 'blocker');
});
