'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { computeLabels, nameFromCwd, touch } = require('../src/sessions');

const MIN = 60 * 1000;

test('nameFromCwd takes the last folder and makes it pronounceable', () => {
  assert.equal(nameFromCwd('C:\\learning\\read-aloud-narrator-idea'), 'read aloud narrator idea');
  assert.equal(nameFromCwd('/home/abhi/waypoint/'), 'waypoint');
  assert.equal(nameFromCwd('/work/myApp'), 'my App');
  assert.equal(nameFromCwd('C:\\'), 'C');
  assert.equal(nameFromCwd(''), '');
  assert.equal(nameFromCwd(undefined), '');
  assert.ok(nameFromCwd(`/x/${'a'.repeat(100)}`).length <= 40);
});

test('a single session is just its folder name', () => {
  const now = 1_000_000;
  const { count, labels } = computeLabels({ a: { name: 'waypoint', firstSeen: now, lastSeen: now } }, now);
  assert.equal(count, 1);
  assert.equal(labels.a, 'waypoint');
});

test('two sessions in different folders are told apart by folder', () => {
  const now = 1_000_000;
  const { count, labels } = computeLabels({
    a: { name: 'waypoint', firstSeen: now - 5 * MIN, lastSeen: now },
    b: { name: 'earshot', firstSeen: now - 2 * MIN, lastSeen: now }
  }, now);
  assert.equal(count, 2);
  assert.equal(labels.a, 'waypoint');
  assert.equal(labels.b, 'earshot');
});

test('two sessions in the same folder get ordinals, in first-seen order', () => {
  const now = 1_000_000;
  const { labels } = computeLabels({
    late: { name: 'earshot', firstSeen: now - 1 * MIN, lastSeen: now },
    early: { name: 'earshot', firstSeen: now - 9 * MIN, lastSeen: now }
  }, now);
  assert.equal(labels.early, 'earshot 1');
  assert.equal(labels.late, 'earshot 2');
});

test('sessions outside the window are not counted', () => {
  const now = 10_000_000;
  const { count, labels } = computeLabels({
    old: { name: 'ancient', firstSeen: 0, lastSeen: now - 200 * MIN },
    fresh: { name: 'current', firstSeen: now - MIN, lastSeen: now }
  }, now, 120 * MIN);
  assert.equal(count, 1);
  assert.equal(labels.old, undefined);
  assert.equal(labels.fresh, 'current');
});

test('a session with no folder name still gets a label', () => {
  const now = 1_000_000;
  const { labels } = computeLabels({ a: { name: '', firstSeen: now, lastSeen: now } }, now);
  assert.equal(labels.a, 'a session');
});

test('touch tracks sessions across calls and keeps a name when a later call lacks the cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'earshot-test-'));
  const opts = (now) => ({ dir, now, windowMs: 120 * MIN });
  try {
    let r = touch('s1', '/work/waypoint', opts(1_000));
    assert.deepEqual(r, { count: 1, label: 'waypoint' });

    r = touch('s2', '/work/earshot', opts(2_000));
    assert.equal(r.count, 2);
    assert.equal(r.label, 'earshot');

    // Touching the same session again must not inflate the count.
    r = touch('s1', undefined, opts(3_000));
    assert.equal(r.count, 2);
    assert.equal(r.label, 'waypoint');

    // After a long quiet spell only the recently active session remains.
    r = touch('s2', '/work/earshot', opts(1_000 + 130 * MIN));
    assert.equal(r.count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('touch with no session id does not throw and reports a single session', () => {
  assert.deepEqual(touch(undefined, '/x'), { count: 1, label: '' });
  assert.deepEqual(touch('', '/x'), { count: 1, label: '' });
});

test('touch survives a corrupt entry in the registry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'earshot-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    const r = touch('s1', '/work/waypoint', { dir, now: 5_000, windowMs: 120 * MIN });
    assert.equal(r.count, 1);
    assert.equal(r.label, 'waypoint');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('many sessions touching at once all register (no lost updates)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'earshot-test-'));
  const { spawn } = require('node:child_process');
  const script = path.join(__dirname, '..', 'src', 'sessions.js');
  try {
    // Real concurrency: 12 separate processes touching the same registry at once.
    await Promise.all(Array.from({ length: 12 }, (_v, i) => new Promise((resolve) => {
      const p = spawn(process.execPath, ['-e',
        `require(${JSON.stringify(script)}).touch('s${i}', '/work/proj${i}', { dir: ${JSON.stringify(dir)} })`],
      { stdio: 'ignore', env: { ...process.env, EARSHOT_TMP_DIR: dir } });
      p.on('exit', resolve);
    })));
    const { readEntries } = require('../src/sessions');
    assert.equal(Object.keys(readEntries(dir)).length, 12);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
