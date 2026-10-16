'use strict';

// Detached speech process. Started by speak.enqueue() so the hook itself can
// exit immediately. It waits its turn in the queue, speaks, and leaves.
//
// Three things keep one bad utterance from silencing everything behind it:
// a heartbeat (so the queue can tell a live player from a dead one), a hard
// time limit on speaking, and removing its own marker however it ends.

const fs = require('fs');

const log = require('./log');
const {
  speakBlocking, waitForTurn, writeMarker, touchMarker, removeMarker,
  HEARTBEAT_MS, SPEAK_TIMEOUT_MS
} = require('./speak');

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) process.exit(1);

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (_) {
    // Cancelled before it started (same-session replacement, or `earshot silence`).
    process.exit(0);
  } finally {
    try { fs.unlinkSync(payloadPath); } catch (_) { /* ignore */ }
  }

  const { ticket, kind, session } = payload;
  const started = Date.now();

  // Record our own pid, then prove we are alive until we finish.
  writeMarker(ticket, kind, process.pid, session, 'waiting');
  const heartbeat = setInterval(() => touchMarker(ticket, kind), HEARTBEAT_MS);

  let result = { ok: false, error: 'not started' };
  let outcome = 'spoke';
  try {
    if (await waitForTurn(ticket, kind)) {
      writeMarker(ticket, kind, process.pid, session, 'playing');

      // Hard limit: a stuck audio device must not hold the queue.
      const watchdog = setTimeout(() => {
        log.log({ hook: 'player', kind, ok: false, error: `speech did not finish within ${SPEAK_TIMEOUT_MS / 1000}s; stopped`, ms: Date.now() - started });
        removeMarker(ticket, kind);
        process.exit(0);
      }, SPEAK_TIMEOUT_MS);

      result = await speakBlocking(payload.text, payload.cfg);
      clearTimeout(watchdog);
    } else {
      outcome = 'dropped (queue did not clear in time)';
      result = { ok: true };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  } finally {
    clearInterval(heartbeat);
    removeMarker(ticket, kind);
  }

  log.log({
    hook: 'player', kind, ok: result.ok, outcome,
    ...(result.error ? { error: result.error } : {}),
    ms: Date.now() - started
  });
}

main();
