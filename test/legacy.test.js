'use strict';

// The plugin was called "earshot" before 0.4.0. People who already have settings in
// ~/.earshot.json must not lose them, and the old EARSHOT_* variables must still work.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const run = (home, extraEnv = {}) => {
  const code = `const c=require(${JSON.stringify(path.join(__dirname, '..', 'src', 'config.js'))});` +
    'console.log(JSON.stringify({mode:c.load().mode,path:c.CONFIG_PATH,legacy:c.usingLegacy}))';
  const env = { ...process.env, USERPROFILE: home, HOME: home, ...extraEnv };
  delete env.PIPE_UP_CONFIG; delete env.EARSHOT_CONFIG;
  Object.assign(env, extraEnv);
  return JSON.parse(spawnSync(process.execPath, ['-e', code], { env, encoding: 'utf8' }).stdout);
};

test('an old ~/.earshot.json is still read, and flagged as legacy', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-home-'));
  try {
    fs.writeFileSync(path.join(home, '.earshot.json'), '{"mode":"always"}');
    const r = run(home);
    assert.equal(r.mode, 'always');
    assert.equal(r.legacy, true);
    assert.ok(r.path.endsWith('.earshot.json'));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('the new ~/.pipe-up.json wins when both exist', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-home-'));
  try {
    fs.writeFileSync(path.join(home, '.earshot.json'), '{"mode":"always"}');
    fs.writeFileSync(path.join(home, '.pipe-up.json'), '{"mode":"off"}');
    const r = run(home);
    assert.equal(r.mode, 'off');
    assert.equal(r.legacy, false);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('with no config file at all, the new path and defaults are used', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-home-'));
  try {
    const r = run(home);
    assert.equal(r.mode, 'smart');
    assert.ok(r.path.endsWith('.pipe-up.json'));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('the old EARSHOT_CONFIG variable still points at a config file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-home-'));
  try {
    const f = path.join(home, 'custom.json');
    fs.writeFileSync(f, '{"mode":"off"}');
    assert.equal(run(home, { EARSHOT_CONFIG: f }).mode, 'off');
    assert.equal(run(home, { PIPE_UP_CONFIG: f }).mode, 'off');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
