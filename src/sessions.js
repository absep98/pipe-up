'use strict';

// Knowing which Claude Code session is speaking.
//
// Every hook call carries a session_id and the session's working directory. We
// keep a tiny registry of recently seen sessions so that, when two or more are
// open, a spoken alert can say "waypoint needs permission" instead of a bare
// "Claude needs permission".
//
// One small file per session, so concurrent hooks from different sessions can
// never overwrite each other's entry (a single shared file lost updates under
// concurrency). A file holds the session id, the project folder name (not the
// full path) and two timestamps. No prompts, no responses.

const fs = require('fs');
const path = require('path');

const { humanizeIdentifier } = require('./filter');
const { runDir } = require('./dirs');

const DEFAULT_WINDOW_MS = 120 * 60 * 1000;

function defaultDir() {
  return path.join(runDir(), 'sessions');
}

/** The last folder of a working directory, made pronounceable. */
function nameFromCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return '';
  const last = cwd.split(/[\\/]/).filter(Boolean).pop() || '';
  return humanizeIdentifier(last.replace(/:$/, '')).slice(0, 40).trim();
}

/**
 * Work out who is active and what to call each session.
 *
 * Pure function: takes the stored entries and the clock, returns labels.
 * Sessions sharing a folder name get an ordinal ("pipe-up 1", "pipe-up 2") in
 * the order they were first seen, so two sessions in one project stay distinct.
 *
 * @param {Object<string, {name:string, firstSeen:number, lastSeen:number}>} entries
 * @param {number} now
 * @param {number} windowMs
 * @returns {{count:number, labels:Object<string,string>}}
 */
function computeLabels(entries, now, windowMs = DEFAULT_WINDOW_MS) {
  const active = Object.entries(entries || {})
    .filter(([, e]) => e && now - e.lastSeen <= windowMs)
    .map(([id, e]) => ({ id, name: e.name || 'a session', firstSeen: e.firstSeen || 0 }))
    .sort((a, b) => a.firstSeen - b.firstSeen || (a.id < b.id ? -1 : 1));

  const byName = new Map();
  for (const s of active) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }

  const labels = {};
  for (const [name, group] of byName) {
    group.forEach((s, i) => {
      labels[s.id] = group.length > 1 ? `${name} ${i + 1}` : name;
    });
  }
  return { count: active.length, labels };
}

const fileFor = (dir, id) => path.join(dir, `${String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}.json`);

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) { /* no-op */ }
}

/** All stored sessions, keyed by id. Unreadable or half-written files are skipped. */
function readEntries(dir = defaultDir()) {
  const entries = {};
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return entries; }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const e = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (e && typeof e.id === 'string') entries[e.id] = e;
    } catch (_) { /* being written right now */ }
  }
  return entries;
}

function writeEntry(file, entry) {
  const tmp = `${file}.${process.pid}.tmp`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.writeFileSync(tmp, JSON.stringify(entry), 'utf8');
      fs.renameSync(tmp, file);
      return;
    } catch (_) {
      sleepSync(10 * (attempt + 1));   // Windows: the target may be open in a reader
    }
  }
  try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ }
  try { fs.writeFileSync(file, JSON.stringify(entry), 'utf8'); } catch (_) { /* give up: a convenience only */ }
}

/**
 * Record that this session just did something, and say how many are active.
 *
 * @returns {{count:number, label:string}} label is '' when the session is unknown.
 */
function touch(sessionId, cwd, opts = {}) {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const dir = opts.dir || defaultDir();

  if (typeof sessionId !== 'string' || !sessionId) return { count: 1, label: '' };

  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (_) { return { count: 1, label: '' }; }

  const entries = readEntries(dir);

  // Forget sessions that have been quiet for a long time, so the folder stays tiny.
  for (const [id, e] of Object.entries(entries)) {
    if (now - e.lastSeen > windowMs * 4) {
      try { fs.unlinkSync(fileFor(dir, id)); } catch (_) { /* ignore */ }
      delete entries[id];
    }
  }

  const existing = entries[sessionId];
  const entry = {
    id: sessionId,
    name: nameFromCwd(cwd) || (existing && existing.name) || '',
    firstSeen: existing ? existing.firstSeen : now,
    lastSeen: now
  };
  entries[sessionId] = entry;
  writeEntry(fileFor(dir, sessionId), entry);

  const { count, labels } = computeLabels(entries, now, windowMs);
  return { count, label: labels[sessionId] || '' };
}

module.exports = { touch, computeLabels, nameFromCwd, readEntries, defaultDir };
