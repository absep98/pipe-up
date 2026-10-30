'use strict';

// Speech: the system voice, and a small file-based queue shared by every Claude
// Code session on the machine.
//
// Everything here runs on the user's own machine and uses only the operating
// system's built-in voice (Windows SAPI, macOS `say`, or `spd-say`/`espeak-ng`
// on Linux). Nothing is sent anywhere.
//
// QUEUE. Each queued or playing utterance has a marker file in the run
// directory, active-<ticket>.<kind>.json. Tickets sort by arrival time, and a
// player waits until no earlier marker is still alive. A marker is "alive" only
// while its player keeps touching it (a heartbeat), so a crashed, killed or
// hung player drops out of the line within seconds, and a recycled process id
// can never keep a dead marker alive.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { runDir } = require('./dirs');
const { env } = require('./env');
const log = require('./log');

const TMP_DIR = runDir();

const HEARTBEAT_MS = 1000;
const STALE_MS = 6000;                 // no heartbeat for this long = dead
const PENDING_MS = 5000;               // a reserved place, player not started yet
const SPEAK_TIMEOUT_MS = 60 * 1000;    // hard cap on one utterance
const MAX_WAIT_MS = { narration: 45 * 1000, alert: 90 * 1000 };

const dryRun = () => ['1', 'true'].includes(String(env('DRY_RUN') || '').toLowerCase());

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Remove queue files left behind by killed players. Bounds the run directory. */
function sweepStale(maxAgeMs = 5 * 60 * 1000) {
  let names;
  try { names = fs.readdirSync(TMP_DIR); } catch (_) { return; }
  const now = Date.now();
  for (const name of names) {
    // Only the queue's own files; the log and session registry must survive quiet stretches.
    if (!/^(say-|active-)/.test(name)) continue;
    const file = path.join(TMP_DIR, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.unlinkSync(file);
    } catch (_) { /* in use or already gone */ }
  }
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';   // exists, but not ours to signal
  }
}

/** Stop a process we started. Does nothing for a process that is already gone. */
function killPid(pid) {
  if (!pid || pid === process.pid) return;
  try {
    process.kill(pid);
  } catch (err) {
    // Only when we may not signal it. Never on "no such process": that pid can
    // belong to something unrelated by now.
    if (err.code === 'EPERM' && process.platform === 'win32') {
      try {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
      } catch (_) { /* best effort */ }
    }
  }
}

// The child currently speaking, so a signal can stop it (on macOS and Linux the
// child would otherwise keep talking after its player is killed).
let currentChild = null;

function killCurrentChild() {
  if (currentChild && currentChild.exitCode === null) {
    try { currentChild.kill(); } catch (_) { /* gone */ }
  }
}

/** Run a command to completion. Resolves {ok, error}; never rejects. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
        env: opts.env || process.env
      });
    } catch (err) {
      return resolve({ ok: false, error: err.message });
    }
    currentChild = child;

    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => resolve({
      ok: false,
      error: err.code === 'ENOENT' ? `${cmd}: not found` : err.message,
      missing: err.code === 'ENOENT'
    }));
    child.on('exit', (code, signal) => {
      if (signal) return resolve({ ok: false, error: `stopped (${signal})`, interrupted: true });
      if (code !== 0) return resolve({ ok: false, error: stderr.trim().split('\n')[0] || `exit ${code}` });
      resolve({ ok: true });
    });

    child.stdin.on('error', () => { /* the child may exit before reading */ });
    if (opts.stdinText != null) child.stdin.end(opts.stdinText);
    else child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

const clean = (text) => String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');

/**
 * Windows SAPI. No network and no dependencies. The text, voice and rate reach
 * PowerShell as environment variables, never pasted into the script, so nothing
 * in a setting or in Claude's response can become PowerShell code.
 */
function speakSapi(text, cfg) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Speech | Out-Null',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$synth.Rate = [int]$env:PIPE_UP_RATE',
    'if ($env:PIPE_UP_VOICE) { try { $synth.SelectVoice($env:PIPE_UP_VOICE) } catch { } }',
    'if ($env:PIPE_UP_TEXT.Trim()) { $synth.Speak($env:PIPE_UP_TEXT) }',
    '$synth.Dispose()'
  ].join('; ');

  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: {
      ...process.env,
      PIPE_UP_TEXT: clean(text),
      PIPE_UP_VOICE: cfg.voice || '',
      PIPE_UP_RATE: String(Number.isInteger(cfg.rate) ? cfg.rate : 2)
    }
  });
}

/** macOS. A voice name that macOS does not know is retried without the voice. */
async function speakMac(text, cfg) {
  const wpm = String(175 + (Number.isInteger(cfg.rate) ? cfg.rate : 2) * 17);
  const base = ['-r', wpm];
  if (cfg.voice) {
    const withVoice = await run('say', [...base, '-v', cfg.voice], { stdinText: clean(text) });
    if (withVoice.ok || withVoice.interrupted || withVoice.missing) return withVoice;
  }
  return run('say', base, { stdinText: clean(text) });
}

/** Linux: whichever common speech command is installed. Untested. */
async function speakLinux(text) {
  const spoken = clean(text);
  const first = await run('spd-say', ['--wait', spoken]);
  if (first.ok || !first.missing) return first;
  const second = await run('espeak-ng', [spoken]);
  if (second.missing) return { ok: false, error: 'no speech command found (install speech-dispatcher or espeak-ng)' };
  return second;
}

/**
 * Speak text in the current process, blocking until done. Used by the detached
 * player, never by a hook directly; see enqueue().
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function speakBlocking(text, cfg = {}) {
  if (!text || !text.trim()) return { ok: true };

  const onSignal = () => { killCurrentChild(); process.exit(0); };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  if (process.platform === 'win32') return speakSapi(text, cfg);
  if (process.platform === 'darwin') return speakMac(text, cfg);
  return speakLinux(text);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

function newTicket() {
  return `${String(Date.now()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 7)}`;
}

const markerFile = (ticket, kind) => path.join(TMP_DIR, `active-${ticket}.${kind}.json`);
const payloadFile = (ticket) => path.join(TMP_DIR, `say-${ticket}.json`);

function writeMarker(ticket, kind, pid, session, state = 'waiting') {
  try {
    fs.writeFileSync(markerFile(ticket, kind), JSON.stringify({ pid, session: session || '', state }), 'utf8');
  } catch (_) { /* queueing is best effort; speech still plays */ }
}

/** The heartbeat: prove this player is still alive by touching its marker. */
function touchMarker(ticket, kind) {
  try {
    const now = new Date();
    fs.utimesSync(markerFile(ticket, kind), now, now);
  } catch (_) { /* marker removed by a stop: the player will notice */ }
}

function removeMarker(ticket, kind) {
  try { fs.unlinkSync(markerFile(ticket, kind)); } catch (_) { /* already gone */ }
}

/**
 * Everything queued or playing, oldest first. A marker whose heartbeat has
 * stopped is deleted as a side effect, so a crashed player can never block the
 * line, and a process id reused by something else never counts as a player.
 */
function listActive() {
  let names;
  try { names = fs.readdirSync(TMP_DIR); } catch (_) { return []; }

  const now = Date.now();
  const out = [];
  for (const name of names) {
    const m = /^active-(.+)\.(narration|alert)\.json$/.exec(name);
    if (!m) continue;
    const file = path.join(TMP_DIR, name);

    let age;
    try { age = now - fs.statSync(file).mtimeMs; } catch (_) { continue; }

    let info = null;
    try { info = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* mid-write */ }
    if (!info) info = { pid: 0, session: '', state: 'waiting' };

    const alive = info.pid ? age < STALE_MS && isAlive(info.pid) : age < PENDING_MS;
    if (!alive) { try { fs.unlinkSync(file); } catch (_) { /* ignore */ } continue; }

    out.push({
      ticket: m[1], kind: m[2], pid: info.pid, session: info.session || '',
      state: info.state || 'waiting', file
    });
  }
  return out.sort((a, b) => (a.ticket < b.ticket ? -1 : a.ticket > b.ticket ? 1 : 0));
}

/** Stop one queued or playing utterance, and make sure it can never start later. */
function cancel(entry) {
  killPid(entry.pid);
  try { fs.unlinkSync(entry.file); } catch (_) { /* ignore */ }
  // A player that has not started yet finds no payload and exits without speaking.
  try { fs.unlinkSync(payloadFile(entry.ticket)); } catch (_) { /* ignore */ }
}

/** Stop everything, queued or playing. Used by `pipe-up silence`. */
function stopAll() {
  const active = listActive();
  active.forEach(cancel);
  return active.length > 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until every earlier utterance has finished and nothing else is speaking.
 *
 * A narration that waits too long is stale and is dropped (returns false). An
 * alert is never dropped: a late "needs permission" is still worth hearing.
 */
async function waitForTurn(ticket, kind) {
  const deadline = Date.now() + (MAX_WAIT_MS[kind] || MAX_WAIT_MS.narration);
  for (;;) {
    const active = listActive().filter((a) => a.ticket !== ticket);
    const ahead = active.filter((a) => a.ticket < ticket);
    // Also yield to anything already speaking, whatever its ticket says: the wall
    // clock can step backwards, and two voices at once is worse than a short wait.
    const speaking = active.filter((a) => a.state === 'playing');
    if (ahead.length === 0 && speaking.length === 0) return true;
    if (Date.now() > deadline) return kind === 'alert';
    await sleep(100);
  }
}

/**
 * Hand the text to a detached background process and return immediately.
 *
 * A hook must exit in milliseconds, or it stalls the user's terminal for as long
 * as the audio plays.
 *
 * Speech queues in arrival order, so with several Claude Code sessions open one
 * session's alert is never cut off by another's. The single exception: a newer
 * narration from the SAME session replaces that session's older one, because a
 * stale summary of a superseded response is worse than none.
 *
 * @param {string} text
 * @param {object} cfg
 * @param {{kind?: 'narration'|'alert', session?: string}} [opts]
 */
function enqueue(text, cfg = {}, opts = {}) {
  if (!text || !text.trim()) return false;
  const kind = opts.kind === 'alert' ? 'alert' : 'narration';
  const session = opts.session || '';

  // Used by tests: record what would be spoken instead of speaking it.
  if (dryRun()) {
    fs.appendFileSync(path.join(TMP_DIR, 'dry-run.log'), `${JSON.stringify({ kind, session, text })}\n`);
    return true;
  }

  sweepStale();

  if (kind === 'narration') {
    listActive()
      .filter((a) => a.kind === 'narration' && a.session === session)
      .forEach(cancel);
  }

  const ticket = newTicket();
  // Reserve our place in line before the player exists, so a hook firing in
  // another session a moment later sees us and queues behind us.
  writeMarker(ticket, kind, 0, session);
  fs.writeFileSync(payloadFile(ticket), JSON.stringify({ text, cfg, ticket, kind, session }), 'utf8');

  let child;
  try {
    child = spawn(process.execPath, [path.join(__dirname, 'player.js'), payloadFile(ticket)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, PIPE_UP_TMP_DIR: TMP_DIR }
    });
    child.on('error', () => { /* reported through the missing pid below or the player's own log */ });
    child.unref();
  } catch (err) {
    child = null;
    log.log({ hook: 'enqueue', ok: false, error: `could not start player: ${err.message}` });
  }

  if (!child || !child.pid) {
    removeMarker(ticket, kind);
    try { fs.unlinkSync(payloadFile(ticket)); } catch (_) { /* ignore */ }
    return false;
  }
  writeMarker(ticket, kind, child.pid, session);
  return true;
}

module.exports = {
  enqueue, speakBlocking, waitForTurn, listActive, stopAll, cancel,
  writeMarker, touchMarker, removeMarker, sweepStale,
  TMP_DIR, HEARTBEAT_MS, SPEAK_TIMEOUT_MS
};
